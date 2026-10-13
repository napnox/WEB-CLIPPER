// Temporary harness: loads background.js with a stubbed chrome API and checks
// the AI Studio fixes. Run with: node .napnox-ai-test.js
const fs = require('fs');
const vm = require('vm');

let store = {};
let lastFetch = null;

const chrome = {
  storage: { local: {
    get: (keys, cb) => { const out = {}; (Array.isArray(keys) ? keys : [keys]).forEach(k => { if (k in store) out[k] = store[k]; }); return cb ? cb(out) : Promise.resolve(out); },
    set: (obj, cb) => { Object.assign(store, obj); if (cb) cb(); return Promise.resolve(); },
    remove: (keys, cb) => { (Array.isArray(keys) ? keys : [keys]).forEach(k => delete store[k]); if (cb) cb(); return Promise.resolve(); }
  }},
  runtime: { onMessage: { addListener: (fn) => { chrome.__msg = fn; } }, onInstalled: { addListener: () => {} } },
  contextMenus: { create: () => {}, onClicked: { addListener: () => {} } },
  commands: { onCommand: { addListener: () => {} } },
  tabs: { create: () => {}, query: () => {}, sendMessage: () => {} },
  action: {}
};

async function fetchStub(url, opts) {
  lastFetch = { url, opts, body: JSON.parse(opts.body) };
  const isAnthropic = url.includes('api.anthropic.com');
  return {
    ok: true, status: 200,
    json: async () => (isAnthropic
      ? { content: [{ type: 'text', text: 'stubbed reply' }] }
      : { choices: [{ message: { content: 'stubbed reply' } }] })
  };
}

const ctx = vm.createContext({ chrome, fetch: fetchStub, console, JSON, Math, Date, String, Array, Object, Promise, setTimeout, URL });
vm.runInContext(fs.readFileSync('background.js', 'utf8'), ctx);

const { resolveProvider, buildContextBlock, callAIProvider, describeApiError } = ctx;

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
};

console.log('\n1. Provider routing by key prefix');
check('gsk_ -> Groq',        resolveProvider('gsk_abc').id === 'groq');
check('sk-or- -> OpenRouter', resolveProvider('sk-or-v1-abc').id === 'openrouter');
check('sk-ant- -> Anthropic', resolveProvider('sk-ant-abc').id === 'anthropic');
check('sk-nry- -> Bynara',    resolveProvider('sk-nry-abc').id === 'bynara');
check('sk- -> OpenAI',        resolveProvider('sk-abc').id === 'openai');
check('unknown -> Groq default', resolveProvider('garbage').id === 'groq');

console.log('\n2. Snippet context building (the bug: snippets were dropped)');
const snippets = [
  { id: 's1', pageTitle: 'Solar Cells', sourceUrl: 'https://a.test/x', selectionText: 'Perovskite efficiency hit 26%.' },
  { id: 's2', pageTitle: 'Grid Storage', sourceUrl: 'https://b.test/y', text: 'Battery costs fell 40% since 2020.' }
];
const block = buildContextBlock(snippets);
check('includes clip 1 text', block.includes('Perovskite efficiency hit 26%'));
check('includes clip 2 text (highlight .text field)', block.includes('Battery costs fell 40%'));
check('includes source URLs', block.includes('https://a.test/x'));
check('numbers the clips', block.includes('Clip 1') && block.includes('Clip 2'));
check('empty input -> empty string', buildContextBlock([]) === '' && buildContextBlock(null) === '');

console.log('\n3. Oversized clips are truncated, not dropped silently');
const huge = [{ id: 'h', pageTitle: 'Big', selectionText: 'x'.repeat(20000) }];
const hugeBlock = buildContextBlock(huge);
check('truncation marker present', hugeBlock.includes('[clip truncated]'));
check('under per-snippet cap', hugeBlock.length < 8000, `(len=${hugeBlock.length})`);

console.log('\n4. End-to-end: snippets actually reach the request body');
(async () => {
  store = {};
  await callAIProvider('Summarise these', snippets, [], 'gsk_testkey');
  check('hits Groq endpoint', lastFetch.url === 'https://api.groq.com/openai/v1/chat/completions', lastFetch.url);
  check('uses Bearer auth', lastFetch.opts.headers.Authorization === 'Bearer gsk_testkey');
  const userMsg = lastFetch.body.messages.find(m => m.role === 'user');
  check('user message carries clip text', userMsg.content.includes('Perovskite efficiency hit 26%'));
  check('user message carries the question', userMsg.content.includes('Summarise these'));
  check('system prompt present', lastFetch.body.messages[0].role === 'system');

  console.log('\n5. History dedupe (dashboard appends current turn before sending)');
  const history = [
    { role: 'user', content: 'first question' },
    { role: 'ai', content: 'first answer' },
    { role: 'user', content: 'Summarise these' }
  ];
  await callAIProvider('Summarise these', snippets, history, 'gsk_testkey');
  const userTurns = lastFetch.body.messages.filter(m => m.role === 'user');
  check('current turn not duplicated', userTurns.length === 2, `(got ${userTurns.length})`);
  check('prior assistant turn mapped to "assistant"', lastFetch.body.messages.some(m => m.role === 'assistant' && m.content === 'first answer'));

  console.log('\n6. Anthropic dialect uses the right shape');
  await callAIProvider('hi', [], [], 'sk-ant-testkey');
  check('x-api-key header', lastFetch.opts.headers['x-api-key'] === 'sk-ant-testkey');
  check('anthropic-version header', !!lastFetch.opts.headers['anthropic-version']);
  check('system is top-level, not a message', typeof lastFetch.body.system === 'string' && !lastFetch.body.messages.some(m => m.role === 'system'));

  console.log('\n7. Missing key fails fast with actionable text');
  let msg = '';
  try { await callAIProvider('hi', [], [], ''); } catch (e) { msg = e.message; }
  check('mentions Settings', msg.includes('Settings'), msg);
  check('links Groq console', msg.includes('console.groq.com'), msg);

  console.log('\n8. HTTP errors become readable messages');
  const gp = resolveProvider('gsk_x');
  check('401 -> key rejected', describeApiError(401, '{"error":{"message":"bad key"}}', gp).includes('rejected'));
  check('429 -> rate limit', describeApiError(429, '', gp).includes('rate limit'));
  check('500 -> server trouble', describeApiError(500, '', gp).includes('server trouble'));
  check('no raw JSON leaks on 401', !describeApiError(401, '{"error":{"message":"bad key"}}', gp).includes('{'));

  console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
