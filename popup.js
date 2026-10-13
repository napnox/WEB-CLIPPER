const $ = id => document.getElementById(id);

let snippets = [];
let highlights = [];
let currentTab = 'clips';
let filters = { query: '', starred: false };

async function init() {
  await Promise.all([loadSnippets(), loadHighlights()]);
  setupEvents();
  render();

  // Live update when storage changes
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.napnox_snippets || changes.napnox_order) {
      loadSnippets().then(render);
    }
    if (changes.napnox_highlights || changes.napnox_highlight_order) {
      loadHighlights().then(render);
    }
  });
}

async function loadSnippets() {
  return new Promise(resolve => {
    chrome.storage.local.get(['napnox_snippets', 'napnox_order'], r => {
      const s = r.napnox_snippets || {};
      const o = r.napnox_order || [];
      snippets = o.filter(id => id in s).map(id => s[id]);
      resolve();
    });
  });
}

async function loadHighlights() {
  return new Promise(resolve => {
    chrome.storage.local.get(['napnox_highlights', 'napnox_highlight_order'], r => {
      const h = r.napnox_highlights || {};
      const o = r.napnox_highlight_order || [];
      highlights = o.filter(id => id in h).map(id => h[id]);
      resolve();
    });
  });
}

function setupEvents() {
  // Capture
  $('b-capture')?.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) chrome.tabs.sendMessage(tab.id, { action: 'TRIGGER_CAPTURE' });
    window.close();
  });

  // Dashboard buttons
  const openDash = () => { chrome.tabs.create({ url: 'dashboard.html' }); window.close(); };
  $('b-dash')?.addEventListener('click', openDash);
  $('b-dash-foot')?.addEventListener('click', openDash);

  // Refresh
  $('b-refresh')?.addEventListener('click', async () => {
    await Promise.all([loadSnippets(), loadHighlights()]);
    render();
  });

  // Tabs
  $('tab-clips')?.addEventListener('click', () => {
    currentTab = 'clips';
    $('tab-clips').classList.add('active');
    $('tab-highlights').classList.remove('active');
    $('filters-bar').style.display = 'flex';
    filters.starred = false;
    $('f-all').classList.add('active');
    $('f-star').classList.remove('active');
    render();
  });

  $('tab-highlights')?.addEventListener('click', () => {
    currentTab = 'highlights';
    $('tab-highlights').classList.add('active');
    $('tab-clips').classList.remove('active');
    $('filters-bar').style.display = 'none';
    render();
  });

  // Filters
  $('f-all')?.addEventListener('click', () => {
    $('f-all').classList.add('active');
    $('f-star').classList.remove('active');
    filters.starred = false;
    render();
  });

  $('f-star')?.addEventListener('click', () => {
    $('f-star').classList.add('active');
    $('f-all').classList.remove('active');
    filters.starred = true;
    render();
  });

  // Search
  $('search')?.addEventListener('input', () => {
    filters.query = $('search').value.trim();
    render();
  });
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function render() {
  const container = $('list');
  const empty = $('empty');
  if (!container) return;
  container.innerHTML = '';

  let list = currentTab === 'clips' ? [...snippets] : [...highlights];

  // Apply clip-only filters
  if (currentTab === 'clips') {
    if (filters.starred) list = list.filter(s => s.starred);
    if (filters.query) {
      const q = filters.query.toLowerCase();
      list = list.filter(s =>
        (s.selectionText || '').toLowerCase().includes(q) ||
        (s.pageTitle || '').toLowerCase().includes(q) ||
        (s.hostname || '').toLowerCase().includes(q)
      );
    }
  } else if (filters.query) {
    const q = filters.query.toLowerCase();
    list = list.filter(h =>
      (h.text || '').toLowerCase().includes(q) ||
      (h.pageTitle || '').toLowerCase().includes(q)
    );
  }

  if (list.length === 0) {
    empty.style.display = 'flex';
    if (currentTab === 'clips') {
      empty.innerHTML = `<div class="empty-icon">📋</div><div class="empty-title">No clips yet</div><div class="empty-sub">Select text and press <strong>Alt+S</strong></div>`;
    } else {
      empty.innerHTML = `<div class="empty-icon">✏️</div><div class="empty-title">No highlights yet</div><div class="empty-sub">Select text and use the toolbar<br>to highlight in color</div>`;
    }
    return;
  }

  empty.style.display = 'none';

  list.forEach(item => {
    const div = document.createElement('div');
    div.className = 'card';

    const itemText = item.text || item.selectionText || '';
    const hostname = item.hostname || '';
    const favicon = item.favicon || `https://www.google.com/s2/favicons?domain=${hostname}&sz=16`;
    const ago = timeAgo(item.timestamp);

    if (currentTab === 'clips') {
      div.innerHTML = `
        <div class="card-header">
          <img class="card-favicon" src="${esc(favicon)}" onerror="this.style.display='none'" alt="">
          <div class="card-title">${esc(item.pageTitle || 'Untitled')}</div>
        </div>
        <div class="card-source">
          <span>${esc(hostname)}</span>
          <div class="card-dot"></div>
          <span>${ago}</span>
        </div>
        <div class="card-text">${esc(itemText)}</div>
        <div class="card-actions">
          <button class="card-btn" id="star-${item.id}">${item.starred ? '★' : '☆'}</button>
          <button class="card-btn" id="copy-${item.id}">Copy</button>
          <button class="card-btn ai-btn" id="ai-${item.id}">🤖 AI</button>
        </div>`;
    } else {
      const color = item.color || '#fbbf24';
      div.style.borderLeft = `3px solid ${color}`;
      div.innerHTML = `
        <div class="card-header">
          <div class="hl-bar" style="background:${color}; align-self:stretch;"></div>
          <div class="card-title">${esc(item.pageTitle || 'Highlight')}</div>
        </div>
        <div class="card-source">
          <span>${esc(hostname)}</span>
          <div class="card-dot"></div>
          <span>${ago}</span>
        </div>
        <div class="card-text">${esc(itemText)}</div>
        <div class="card-actions">
          <button class="card-btn" id="copy-${item.id}">Copy</button>
          <button class="card-btn ai-btn" id="ai-${item.id}">🤖 AI</button>
        </div>`;
    }

    container.appendChild(div);

    // Events
    if (currentTab === 'clips') {
      const starBtn = $('star-' + item.id);
      if (starBtn) starBtn.addEventListener('click', () => toggleStar(item.id));
    }

    const copyBtn = $('copy-' + item.id);
    if (copyBtn) copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(itemText);
      copyBtn.textContent = '✓';
      setTimeout(() => copyBtn.textContent = 'Copy', 1200);
    });

    const aiBtn = $('ai-' + item.id);
    if (aiBtn) aiBtn.addEventListener('click', () => {
      // Navigate to AI Studio with this item pre-selected
      chrome.storage.local.get(['napnox_ai_pending'], r => {
        const pending = r.napnox_ai_pending || [];
        pending.push(item.id);
        chrome.storage.local.set({ napnox_ai_pending: pending }, () => {
          chrome.tabs.create({ url: 'dashboard.html#ai' });
          window.close();
        });
      });
    });
  });
}

function toggleStar(id) {
  const s = snippets.find(x => x.id === id);
  if (!s) return;
  s.starred = !s.starred;
  chrome.storage.local.get(['napnox_snippets'], r => {
    const all = r.napnox_snippets || {};
    if (all[id]) {
      all[id].starred = s.starred;
      chrome.storage.local.set({ napnox_snippets: all });
    }
  });
  render();
}

function deleteSnip(id) {
  if (!confirm('Delete this clip?')) return;
  chrome.storage.local.get(['napnox_snippets', 'napnox_order'], r => {
    const s = r.napnox_snippets || {};
    const o = r.napnox_order || [];
    delete s[id];
    chrome.storage.local.set({ napnox_snippets: s, napnox_order: o.filter(x => x !== id) });
  });
  snippets = snippets.filter(x => x.id !== id);
  render();
}

function delHighlight(id) {
  chrome.storage.local.get(['napnox_highlights', 'napnox_highlight_order'], r => {
    const h = r.napnox_highlights || {};
    const o = r.napnox_highlight_order || [];
    delete h[id];
    chrome.storage.local.set({ napnox_highlights: h, napnox_highlight_order: o.filter(x => x !== id) });
  });
  highlights = highlights.filter(x => x.id !== id);
  render();
}

document.addEventListener('DOMContentLoaded', init);