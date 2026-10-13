// Napnox Service Worker - Background Script (Complete Version)

// =========================================================
// Storage Helpers
// =========================================================

async function getFolders() {
  const data = await chrome.storage.local.get(['napnox_folders']);
  return data.napnox_folders || [];
}

async function getSnippets() {
  const data = await chrome.storage.local.get(['napnox_snippets']);
  return data.napnox_snippets || {};
}

async function getHighlights() {
  const data = await chrome.storage.local.get(['napnox_highlights']);
  return data.napnox_highlights || {};
}

async function getChatSessions() {
  const data = await chrome.storage.local.get(['napnox_chat_sessions']);
  return data.napnox_chat_sessions || [];
}

// =========================================================
// Context Menus & Initialization
// =========================================================

// On startup: trim whitespace off a stored key (pasting often drags in a space
// or newline, which produces a confusing 401). Never delete the key here — an
// earlier build wiped any key not starting with "sk-", which silently destroyed
// valid Groq keys (gsk_...) on every service-worker wake-up.
chrome.storage.local.get(['napnox_openrouter_key'], (r) => {
  const savedKey = r.napnox_openrouter_key;
  if (typeof savedKey !== 'string') return;
  const trimmed = savedKey.trim();
  if (trimmed !== savedKey) {
    chrome.storage.local.set({ napnox_openrouter_key: trimmed });
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Napnox] Service worker installed.');

  try {
    chrome.contextMenus.create({
      id: 'napnox-capture',
      title: 'Capture with Napnox (Alt+S)',
      contexts: ['selection']
    });

    chrome.contextMenus.create({
      id: 'napnox-highlight',
      title: 'Highlight yellow (Alt+H)',
      contexts: ['selection']
    });

    chrome.contextMenus.create({
      id: 'napnox-dashboard',
      title: 'Open Napnox Research Dashboard',
      contexts: ['all']
    });
  } catch (e) {
    console.warn('[Napnox] Context menu setup:', e);
  }
});

// Context menu click listener
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'napnox-dashboard') {
    chrome.tabs.create({ url: 'dashboard.html' });
  } else if (info.menuItemId === 'napnox-capture' && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { action: 'TRIGGER_CAPTURE' });
  } else if (info.menuItemId === 'napnox-highlight' && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { action: 'TRIGGER_HIGHLIGHT_ONLY' });
  }
});

// Command shortcuts listener
chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.id) return;

    if (command === 'capture-selection') {
      chrome.tabs.sendMessage(tab.id, { action: 'TRIGGER_CAPTURE' });
    } else if (command === 'open-dashboard') {
      chrome.tabs.create({ url: 'dashboard.html' });
    } else if (command === 'highlight-only') {
      chrome.tabs.sendMessage(tab.id, { action: 'TRIGGER_HIGHLIGHT_ONLY' });
    } else if (command === 'toggle-sidebar') {
      chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_SIDEBAR' });
    }
  });
});

// =========================================================
// AI Providers
// =========================================================

// Napnox stores one key under `napnox_openrouter_key` (name kept for backwards
// compatibility). The provider is inferred from the key prefix so users can
// paste a key from whichever service they have without extra configuration.
const PROVIDERS = {
  groq: {
    label: 'Groq',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
    dialect: 'openai',
    consoleUrl: 'https://console.groq.com/keys'
  },
  anthropic: {
    label: 'Anthropic',
    endpoint: 'https://api.anthropic.com/v1/messages',
    model: 'claude-sonnet-4-5',
    dialect: 'anthropic',
    consoleUrl: 'https://console.anthropic.com/settings/keys'
  },
  openai: {
    label: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    dialect: 'openai',
    consoleUrl: 'https://platform.openai.com/api-keys'
  },
  bynara: {
    label: 'Napnox Router',
    endpoint: 'https://router.bynara.id/v1/chat/completions',
    model: 'napnox-default',
    dialect: 'openai',
    consoleUrl: 'https://napnox.com/account'
  },
  local: {
    label: 'Local API',
    endpoint: 'http://localhost:4141/v1/chat/completions',
    model: 'nvidia/nemotron-3-super-120b-a12b:free',
    dialect: 'openai',
    consoleUrl: 'http://localhost:4141',
    noFallback: true  // ← Add this: never try external providers when using local key
  }
};

const DEFAULT_PROVIDER = 'local';

function resolveProvider(key) {
  const k = (key || '').trim();
  if (k.startsWith('gsk_')) return { id: 'groq', ...PROVIDERS.groq };
  if (k.startsWith('sk-or-')) return { id: 'local', ...PROVIDERS.local };
  if (k.startsWith('sk-ant-')) return { id: 'anthropic', ...PROVIDERS.anthropic };
  if (k.startsWith('sk-nry-')) return { id: 'bynara', ...PROVIDERS.bynara };
  if (k.startsWith('sk-')) return { id: 'openai', ...PROVIDERS.openai };
  if (k.startsWith('ar-')) return { id: 'local', ...PROVIDERS.local };
  return { id: DEFAULT_PROVIDER, ...PROVIDERS[DEFAULT_PROVIDER] };
}

// =========================================================
// Snippet context
// =========================================================

// Budget is measured in characters (~4 chars/token). 48k chars ≈ 12k tokens,
// which leaves ample room for the reply on every model wired up above.
const MAX_CONTEXT_CHARS = 48000;
const MAX_CHARS_PER_SNIPPET = 6000;

function buildContextBlock(snippets) {
  if (!Array.isArray(snippets) || snippets.length === 0) return '';

  const blocks = [];
  let used = 0;
  let omitted = 0;

  for (const s of snippets) {
    if (!s) continue;

    // Snippets store selectionText/markdownContent; highlights store text.
    let body = (s.selectionText || s.markdownContent || s.text || '').trim();
    if (!body) continue;

    if (body.length > MAX_CHARS_PER_SNIPPET) {
      body = body.slice(0, MAX_CHARS_PER_SNIPPET) + '\n…[clip truncated]';
    }

    const title = s.pageTitle || 'Untitled';
    const source = s.sourceUrl || s.hostname || '';
    const block = `### Clip ${blocks.length + 1}: ${title}\n`
      + (source ? `Source: ${source}\n` : '')
      + `\n${body}\n`;

    if (used + block.length > MAX_CONTEXT_CHARS) {
      omitted++;
      continue;
    }

    blocks.push(block);
    used += block.length;
  }

  if (blocks.length === 0) return '';

  let out = `The user has selected ${blocks.length} research clip(s) as context. `
    + `Base your answer on these clips and cite them by number (e.g. "Clip 2") `
    + `when you use them.\n\n---\n\n${blocks.join('\n')}`;

  if (omitted > 0) {
    out += `\n\n[${omitted} further clip(s) were omitted because the context limit was reached.]`;
  }

  return out + '\n\n---\n';
}

// =========================================================
// AI API Helpers
// =========================================================

function describeApiError(status, rawText, provider) {
  // Providers return JSON errors in a few different shapes; pull out the
  // human-readable message rather than dumping the raw blob into the chat.
  let detail = '';
  try {
    const parsed = JSON.parse(rawText);
    detail = parsed?.error?.message || parsed?.message || parsed?.error || '';
    if (typeof detail !== 'string') detail = JSON.stringify(detail);
  } catch (e) {
    detail = (rawText || '').slice(0, 300);
  }

  switch (status) {
    case 401:
    case 403:
      return `Your ${provider.label} API key was rejected. Open Settings and paste a valid key from ${provider.consoleUrl}.`;
    case 402:
      return `Your ${provider.label} account is out of credit. Top up at ${provider.consoleUrl}.`;
    case 404:
      return `${provider.label} does not recognise the model "${provider.model}". It may have been renamed or retired.`;
    case 413:
      return 'Too many clips selected for one request. Deselect a few and try again.';
    case 429:
      return `${provider.label} rate limit reached. Wait a moment and try again.`;
    default:
      if (status >= 500) {
        return `${provider.label} is having server trouble (HTTP ${status}). Try again shortly.`;
      }
      return `${provider.label} error (HTTP ${status})${detail ? ': ' + detail : ''}`;
  }
}

async function callAIProvider(prompt, snippets = [], history = [], userApiKey) {
  const activeKey = (userApiKey || '').trim();
  const provider = resolveProvider(activeKey);

  if (!activeKey) {
    throw new Error(
      `No API key set. Open Settings → AI Studio API Key and paste a ${PROVIDERS[DEFAULT_PROVIDER].label} key ` +
      `(free at ${PROVIDERS[DEFAULT_PROVIDER].consoleUrl}).`
    );
  }

  const systemMessageText =
    'You are Napnox AI, an expert research assistant. You help the user analyse '
    + 'web clips they have collected. Answer accurately, clearly, and concisely '
    + 'using Markdown. When research clips are provided, ground your answer in '
    + 'them and cite them by number. If the clips do not contain the answer, say '
    + 'so plainly rather than inventing detail.';

  // Prepend the selected clips to the user's question. This is the step the
  // previous build was missing entirely — `snippets` arrived and was dropped.
  const contextBlock = buildContextBlock(snippets);
  const userContent = contextBlock ? `${contextBlock}\n${prompt}` : prompt;

  const rawHistory = (Array.isArray(history) ? history : []).filter(m => m && m.content);

  // The dashboard appends the current user turn to the session before sending,
  // so it usually arrives at the tail of `history`. Drop it there — it is
  // re-sent below with the clip context attached.
  const last = rawHistory[rawHistory.length - 1];
  if (last && last.role === 'user' && String(last.content) === String(prompt)) {
    rawHistory.pop();
  }

  const priorTurns = rawHistory.map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: String(m.content)
  }));

  let endpoint = provider.endpoint;
  let headers = { 'Content-Type': 'application/json', ...(provider.extraHeaders || {}) };
  let body;

  if (provider.dialect === 'anthropic') {
    // Anthropic uses x-api-key, a top-level `system`, and /v1/messages.
    headers['x-api-key'] = activeKey;
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
    body = {
      model: provider.model,
      max_tokens: 4096,
      system: systemMessageText,
      messages: [...priorTurns, { role: 'user', content: userContent }]
    };
  } else {
    headers['Authorization'] = `Bearer ${activeKey}`;
    body = {
      model: provider.model,
      messages: [
        { role: 'system', content: systemMessageText },
        ...priorTurns,
        { role: 'user', content: userContent }
      ]
    };
  }

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
  } catch (networkErr) {
    console.error('[Napnox] Network failure calling', provider.label, networkErr);
    throw new Error(
      `Could not reach ${provider.label}. Check your internet connection and try again.`
    );
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    console.error(`[Napnox] ${provider.label} API error ${response.status}:`, errText);
    
    // ★ FIX: If using local API key (ar-), never attempt fallback to other providers
    if (provider.noFallback) {
      throw new Error(`${provider.label} error (HTTP ${response.status}): ${errText || 'Local API error'}`);
    }
    
    throw new Error(describeApiError(response.status, errText, provider));
  }

  const data = await response.json();

  const text = provider.dialect === 'anthropic'
    ? data?.content?.map(c => c?.text || '').join('').trim()
    : data?.choices?.[0]?.message?.content;

  if (!text) {
    console.error('[Napnox] Empty completion payload:', data);
    throw new Error(`${provider.label} returned an empty response. Try rephrasing your question.`);
  }

  return text;
}

// =========================================================
// Main Service Worker Message Listener
// =========================================================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      // 1. GET_FOLDERS
      if (msg.action === 'GET_FOLDERS') {
        const folders = await getFolders();
        sendResponse({ ok: true, folders: folders });
        return;
      }

      // 2. SAVE_FOLDER
      if (msg.action === 'SAVE_FOLDER') {
        const folder = msg.folder;
        const folders = await getFolders();
        const idx = folders.findIndex(f => f.id === folder.id);
        if (idx !== -1) {
          folders[idx] = { ...folders[idx], ...folder };
        } else {
          folders.push(folder);
        }
        await chrome.storage.local.set({ napnox_folders: folders });
        sendResponse({ ok: true, folder: folders[idx !== -1 ? idx : folders.length - 1] });
        return;
      }

      // 3. CREATE_FOLDER
      if (msg.action === 'CREATE_FOLDER') {
        const folders = await getFolders();
        const newFolder = {
          id: `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: msg.name,
          color: msg.color || '#8b5cf6',
          createdAt: Date.now()
        };
        folders.push(newFolder);
        await chrome.storage.local.set({ napnox_folders: folders });
        sendResponse({ ok: true, folder: newFolder });
        return;
      }

      // 4. UPDATE_API_KEY
      if (msg.action === 'UPDATE_API_KEY') {
        const key = msg.key;
        await chrome.storage.local.set({ napnox_openrouter_key: key });
        sendResponse({ ok: true });
        return;
      }

      // 5. AI_QUERY
      if (msg.action === 'AI_QUERY') {
        try {
          const storage = await chrome.storage.local.get(['napnox_openrouter_key']);
          const userKey = storage.napnox_openrouter_key || '';
          const resultText = await callAIProvider(msg.prompt, msg.snippets, msg.history, userKey);
          sendResponse({ ok: true, result: resultText });
        } catch (err) {
          console.error('[Napnox] AI_QUERY error:', err);
          sendResponse({ ok: false, error: err.message || String(err) });
        }
        return;
      }

      // 6. DETECT_RESEARCH_GAPS
      if (msg.action === 'DETECT_RESEARCH_GAPS') {
        // Best-effort enrichment: never surface a failure here as a chat error,
        // the user already has their answer by this point.
        try {
          const storage = await chrome.storage.local.get(['napnox_openrouter_key']);
          const userKey = storage.napnox_openrouter_key || '';

          const prompt = `Analyze these snippets on "${msg.topic || 'Research'}":\nContent:\n${msg.content || ''}\n\nIdentify 2-3 missing perspectives or research gaps. Return JSON ONLY with format: {"gaps":[{"topic":"string","searchQuery":"string"}]}`;

          const rawResult = await callAIProvider(prompt, msg.snippets, [], userKey);
          let parsedGaps = { gaps: [] };
          try {
            const jsonMatch = rawResult.match(/\{[\s\S]*\}/);
            if (jsonMatch) parsedGaps = JSON.parse(jsonMatch[0]);
          } catch (e) {
            console.warn('[Napnox] Failed to parse research gaps JSON:', e);
          }
          sendResponse({ ok: true, gaps: parsedGaps });
        } catch (err) {
          console.warn('[Napnox] Research gap detection skipped:', err);
          sendResponse({ ok: true, gaps: { gaps: [] } });
        }
        return;
      }

      // 7. QUICK_AI
      if (msg.action === 'QUICK_AI') {
        const storage = await chrome.storage.local.get(['napnox_openrouter_key']);
        const userKey = storage.napnox_openrouter_key || '';
        const promptType = msg.promptType || 'simplify';
        const text = msg.text || '';
        const promptMap = {
          simplify: `Simplify this text in 2 clear sentences:\n"${text}"`,
          define: `Define key terms in this text concisely:\n"${text}"`,
          factcheck: `Provide quick fact-checking summary for:\n"${text}"`
        };
        const result = await callAIProvider(promptMap[promptType] || promptMap.simplify, [], [], userKey);
        sendResponse({ ok: true, result });
        return;
      }

      // 8. CAPTURE_SNIPPET_ASYNC
      if (msg.action === 'CAPTURE_SNIPPET_ASYNC') {
        if (chrome.action?.setBadgeText) {
          chrome.action.setBadgeText({ text: '✓' });
          chrome.action.setBadgeBackgroundColor({ color: '#8b5cf6' });
          setTimeout(() => chrome.action.setBadgeText({ text: '' }), 1500);
        }
        sendResponse({ ok: true });
        return;
      }

      // 9. UPDATE_SNIPPET
      if (msg.action === 'UPDATE_SNIPPET') {
        const snippets = await getSnippets();
        if (snippets[msg.id]) {
          snippets[msg.id] = { ...snippets[msg.id], ...msg.updates };
          await chrome.storage.local.set({ napnox_snippets: snippets });
        }
        sendResponse({ ok: true });
        return;
      }

      // 10. GET_CHAT_SESSIONS
      if (msg.action === 'GET_CHAT_SESSIONS') {
        const sessions = await getChatSessions();
        sendResponse({ ok: true, sessions });
        return;
      }

      // 11. SAVE_CHAT_SESSION
      if (msg.action === 'SAVE_CHAT_SESSION') {
        const session = msg.session;
        const sessions = await getChatSessions();
        const idx = sessions.findIndex(s => s.id === session.id);
        if (idx !== -1) {
          sessions[idx] = session;
        } else {
          sessions.unshift(session);
        }
        await chrome.storage.local.set({ napnox_chat_sessions: sessions });
        sendResponse({ ok: true, session });
        return;
      }

      // 12. VERIFY_LICENSE
      if (msg.action === 'VERIFY_LICENSE') {
        const key = msg.key || '';
        const isPro = key.toUpperCase().startsWith('PRO-');
        sendResponse({ ok: true, isPro });
        return;
      }

      // 13. INIT_FIREBASE & JOIN_WORKSPACE
      if (msg.action === 'INIT_FIREBASE' || msg.action === 'JOIN_WORKSPACE') {
        sendResponse({ ok: true });
        return;
      }

      // 14. openDashboard / OPEN_DASHBOARD
      if (msg.action === 'openDashboard' || msg.action === 'OPEN_DASHBOARD') {
        chrome.tabs.create({ url: 'dashboard.html' });
        sendResponse({ ok: true });
        return;
      }

      // 15. TEST_AI_CONNECTION
      if (msg.action === 'TEST_AI_CONNECTION') {
        const storage = await chrome.storage.local.get(['napnox_openrouter_key']);
        const userKey = (msg.key ?? storage.napnox_openrouter_key ?? '').trim();
        const provider = resolveProvider(userKey);
        try {
          await callAIProvider('Reply with exactly: OK', [], [], userKey);
          sendResponse({ ok: true, provider: provider.label, model: provider.model });
        } catch (err) {
          sendResponse({ ok: false, provider: provider.label, error: err.message || String(err) });
        }
        return;
      }

      // Unknown action fallback
      sendResponse({ ok: false, error: `Unknown action: ${msg.action}` });

    } catch (err) {
      console.error(`[Napnox Background Error on ${msg.action}]:`, err);
      sendResponse({ ok: false, error: err.message });
    }
  })();

  return true; // Keep message channel open for async response
});
