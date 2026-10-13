// Napnox Dashboard - Research Workspace (FIXED)

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

// State Management
let state = {
  snippets: [],
  folders: [],
  highlights: [],
  chatSessions: [],
  currentView: 'inbox',
  activeTab: 'snippets',
  currentFolderId: null,
  currentChatSession: null,
  filters: {
    hostname: '',
    starred: false,
    query: '',
    tag: '',
    folderId: ''
  },
  selectedSnippets: new Set(),
  selectedHighlights: new Set(),
  selectedAiSnippets: new Set(),
  aiContextTab: 'clips',
  sliderItems: [],
  currentSliderIndex: 0,
  clipsSelectedDate: null,
  highlightsSelectedDate: null,
  clipsCalendarMonth: new Date(),
  highlightsCalendarMonth: new Date()
};

// =========================================================
// AI Response Parser - extracts summary and key points
// =========================================================

function parseAIResponse(text) {
  const summary = [];
  const keyPoints = [];

  // Try to extract numbered or bulleted points
  const lines = text.split('\n');
  let inSummary = true;
  let summarySection = [];
  let pointsSection = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect summary section end (when we hit key points or major sections)
    if (trimmed.toLowerCase().includes('key takeaway') ||
        trimmed.toLowerCase().includes('main points') ||
        trimmed.toLowerCase().includes('summary:')) {
      inSummary = false;
      continue;
    }

    // Detect new sections
    if (trimmed.match(/^(\d+\.|[-•*]|\*\*)/) && summarySection.length < 3) {
      pointsSection.push(trimmed);
      continue;
    }

    if (inSummary && trimmed && trimmed.length > 20) {
      summarySection.push(trimmed);
    }
  }

  // Build summary (first 2-3 meaningful sentences)
  if (summarySection.length > 0) {
    summary = summarySection.slice(0, 3).join('. ') + '.';
    if (summary.length > 300) {
      summary = summary.slice(0, 300) + '...';
    }
  }

  // Build key points (up to 5 bullet points)
  if (pointsSection.length > 0) {
    keyPoints = pointsSection.slice(0, 5);
  } else {
    // Fallback: extract sentences with "because", "therefore", "important"
    const fallbackPoints = [];
    const sentenceRegex = /[^.!?]*[.!?]/g;
    const sentences = text.match(sentenceRegex) || [];
    for (const sentence of sentences) {
      const s = sentence.trim();
      if (s.length > 30 && s.length < 200) {
        if (/because|therefore|important|notable|significant/.test(s.toLowerCase())) {
          fallbackPoints.push(s);
        }
      }
      if (fallbackPoints.length >= 5) break;
    }
    keyPoints = fallbackPoints;
  }

  return { summary: summary || 'No summary available', keyPoints: keyPoints };
}

// =========================================================
// ★ FIX: Helper functions HOISTED to module scope
// (Previously they were nested inside setupEventListeners — that's why nothing worked)
// =========================================================

function getCurrentSelectionSet() {
  return state.activeTab === 'highlights' ? state.selectedHighlights : state.selectedSnippets;
}

function getCurrentItems() {
  return state.activeTab === 'highlights' ? state.highlights : state.snippets;
}

function updateBatchBar() {
  const bar = $('#db-batch-bar');
  if (!bar) return;
  const count = getCurrentSelectionSet().size;
  const countEl = $('#db-batch-count');
  if (countEl) countEl.textContent = `${count} selected`;
  if (count > 0) {
    bar.classList.add('visible');
    bar.style.display = '';
  } else {
    bar.classList.remove('visible');
    bar.style.display = 'none';
  }
}

// =========================================================
// Initialize App
// =========================================================

async function init() {
  console.log('[Napnox] Dashboard init starting...');

  // Theme
  chrome.storage.local.get(['napnox_theme'], (r) => {
    if (r.napnox_theme) {
      document.documentElement.setAttribute('data-theme', r.napnox_theme);
    }
  });

  // 1. Setup UI listeners FIRST so buttons work immediately
  try {
    setupEventListeners();
    setupTabListeners();
    setupContextTabListeners();
    console.log('[Napnox] UI listeners attached');
  } catch (e) {
    console.error('[Napnox] UI setup error:', e);
  }

  // 2. Load data
  try {
    await loadSnippets();
    await loadHighlights();
    await loadChatSessions();
  } catch (e) {
    console.warn('[Napnox] Data load error:', e);
  }

  // Folders (non-critical)
  try {
    await loadFolders();
    renderFolderFilter();
  } catch (e) {
    console.warn('[Napnox] Folders load error:', e);
  }

  // Initial render
  renderUI();

  // Hash navigation
  window.addEventListener('hashchange', handleHashChange);
  handleHashChange();

  // Pending AI items from popup
  chrome.storage.local.get(['napnox_ai_pending'], (r) => {
    if (r.napnox_ai_pending && r.napnox_ai_pending.length > 0) {
      r.napnox_ai_pending.forEach(id => state.selectedAiSnippets.add(id));
      chrome.storage.local.remove('napnox_ai_pending');
      navigateTo('ai');
      showToast(`Loaded ${r.napnox_ai_pending.length} item(s) to AI context`);
      renderAiSnippetList();
    }
  });

  // Storage change listener
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.napnox_snippets || changes.napnox_order) {
      loadSnippets().then(() => {
        if (state.currentView === 'inbox') renderInbox();
        if (state.currentView === 'ai') renderAiSnippetList();
      });
    }
    if (changes.napnox_highlights || changes.napnox_highlight_order) {
      loadHighlights().then(() => {
        if (state.currentView === 'inbox') renderInbox();
        if (state.currentView === 'ai') renderAiSnippetList();
      });
    }
  });

  // AI Studio initial render
  if (state.currentView === 'ai') renderAiSnippetList();

  console.log('[Napnox] Dashboard initialized:', state.snippets.length, 'snippets,', state.highlights.length, 'highlights');
}

// =========================================================
// Data Loading
// =========================================================

async function loadFolders() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'GET_FOLDERS' }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('[Napnox] GET_FOLDERS error:', chrome.runtime.lastError);
      }
      if (response && response.ok) {
        state.folders = response.folders || [];
      }
      resolve(state.folders);
    });
  });
}

async function loadSnippets() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['napnox_snippets', 'napnox_order'], (result) => {
      const s = result.napnox_snippets || {};
      const o = result.napnox_order || [];

      let list = [];
      if (o.length > 0) {
        list = o.filter(id => id in s).map(id => s[id]);
      } else {
        list = Object.values(s).sort((a, b) => {
          const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
          const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
          return tB - tA;
        });
      }

      // Apply filters
      const f = state.filters;
      if (f.hostname) list = list.filter(x => x.hostname === f.hostname);
      if (f.starred) list = list.filter(x => x.starred);
      if (f.folderId) list = list.filter(x => x.folderId === f.folderId);
      if (f.tag) list = list.filter(x => x.tags?.includes(f.tag));
      if (f.query) {
        const q = f.query.toLowerCase();
        list = list.filter(x =>
          x.selectionText?.toLowerCase().includes(q) ||
          x.pageTitle?.toLowerCase().includes(q) ||
          x.sourceUrl?.toLowerCase().includes(q) ||
          x.tags?.some(t => t.toLowerCase().includes(q))
        );
      }

      state.snippets = list;
      updateSnippetCounts();
      renderTagStrip();
      resolve(list);
    });
  });
}

async function loadChatSessions() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({
      action: 'GET_CHAT_SESSIONS',
      filters: {}
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('[Napnox] GET_CHAT_SESSIONS error:', chrome.runtime.lastError);
        state.chatSessions = [];
        renderChatHistory();
        resolve([]);
        return;
      }
      if (response && response.ok) {
        state.chatSessions = response.sessions || [];
        renderChatHistory();
        resolve(state.chatSessions);
      } else {
        state.chatSessions = [];
        renderChatHistory();
        resolve([]);
      }
    });
  });
}

async function loadHighlights() {
  return new Promise(resolve => {
    chrome.storage.local.get(['napnox_highlights', 'napnox_highlight_order'], (result) => {
      const h = result.napnox_highlights || {};
      const order = result.napnox_highlight_order || [];

      let list = [];
      if (order.length > 0) {
        list = order.filter(id => id in h).map(id => h[id]);
      } else {
        list = Object.values(h).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      }

      state.highlights = list;
      resolve(state.highlights);
    });
  });
}

// =========================================================
// Tab Listeners
// =========================================================

function setupTabListeners() {
  const tabs = document.querySelectorAll('.inbox-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.getAttribute('data-tab');
      state.activeTab = tabName;
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // ★ FIX: Clear stale selection when switching tabs
      state.selectedSnippets.clear();
      state.selectedHighlights.clear();
      updateBatchBar();

      renderInbox();
    });
  });
}

function setupAiAccordion() {
  const panelChat = $('#ai-panel-chat-history');
  const panelContext = $('#ai-panel-context');
  const hdrChat = $('#ai-hdr-chat-history');
  const hdrContext = $('#ai-hdr-context');

  if (hdrChat && hdrContext) {
    hdrChat.addEventListener('click', (e) => {
      if (e.target.closest('#ai-new-chat')) return;
      panelChat?.classList.add('active');
      panelContext?.classList.remove('active');
    });

    hdrContext.addEventListener('click', (e) => {
      if (e.target.closest('#ai-context-full-btn')) return;
      panelContext?.classList.add('active');
      panelChat?.classList.remove('active');
    });
  }
}

function setupContextTabListeners() {
  const tabs = document.querySelectorAll('.ai-context-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.getAttribute('data-tab');
      state.aiContextTab = tabName;
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderAiSnippetList();
    });
  });
}

// =========================================================
// Event Listeners (FIXED — helpers now in module scope)
// =========================================================

function setupEventListeners() {
  // AI Sidebar Accordion
  setupAiAccordion();

  // Navigation
  $('#nav-inbox')?.addEventListener('click', () => navigateTo('inbox'));
  $('#nav-starred')?.addEventListener('click', () => navigateTo('starred'));
  $('#nav-ai')?.addEventListener('click', () => navigateTo('ai'));
  $('#nav-export')?.addEventListener('click', () => navigateTo('export'));
  $('#nav-settings')?.addEventListener('click', () => navigateTo('settings'));

  // Search (single binding)
  $('#db-search')?.addEventListener('input', handleGlobalSearch);

  // AI Studio
  $('#ai-new-chat')?.addEventListener('click', startNewChat);
  $('#ai-send-btn')?.addEventListener('click', sendMessage);
  $('#ai-chat-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // AI Context controls
  $('#ai-select-all')?.addEventListener('click', () => {
    const list = state.aiContextTab === 'clips' ? state.snippets : state.highlights;
    list.forEach(item => state.selectedAiSnippets.add(item.id));
    renderAiSnippetList();
    showToast(`Selected all ${state.aiContextTab}`);
  });

  $('#ai-clear-all')?.addEventListener('click', () => {
    state.selectedAiSnippets.clear();
    renderAiSnippetList();
    showToast('Context cleared');
  });

  // Tag scrolling
  $('#tag-scroll-left')?.addEventListener('click', () => {
    $('#tag-strip')?.scrollBy({ left: -200, behavior: 'smooth' });
  });
  $('#tag-scroll-right')?.addEventListener('click', () => {
    $('#tag-strip')?.scrollBy({ left: 200, behavior: 'smooth' });
  });
  $('#tag-strip')?.addEventListener('scroll', updateTagScrollButtons);
  window.addEventListener('resize', updateTagScrollButtons);

  // Auth / User Profile
  $('#sidebar-user-trigger')?.addEventListener('click', showLoginOverlay);
  $('#login-cancel')?.addEventListener('click', hideLoginOverlay);

  // Social Login buttons
  ['google', 'github', 'microsoft', 'discord', 'yahoo'].forEach(provider => {
    const btn = $(`#login-${provider}`);
    if (btn) {
      btn.addEventListener('click', () => {
        showToast(`Connecting to ${provider}...`);
        setTimeout(() => {
          hideLoginOverlay();
          showToast('Login successful!');
          updateUserInfo('Research Pro', 'Pro Plan Active');
        }, 1500);
      });
    }
  });

  $('#ai-context-full-btn')?.addEventListener('click', () => openFullViewModal('clips'));

  // Modal tabs
  document.querySelectorAll('[data-modal-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      openFullViewModal(tab.getAttribute('data-modal-tab'));
    });
  });

  // View toggle
  $('#db-view-grid')?.addEventListener('click', () => {
    $('#snippet-grid')?.classList.remove('list-view');
    $('#db-view-grid').classList.add('active');
    $('#db-view-list').classList.remove('active');
  });
  $('#db-view-list')?.addEventListener('click', () => {
    $('#snippet-grid')?.classList.add('list-view');
    $('#db-view-list').classList.add('active');
    $('#db-view-grid').classList.remove('active');
  });

  // Select All
  $('#db-select-all')?.addEventListener('click', () => {
    const items = getCurrentItems();
    const selSet = getCurrentSelectionSet();
    items.forEach(item => selSet.add(item.id));
    document.querySelectorAll('.db-card, .highlight-card').forEach(c => c.classList.add('selected'));
    updateBatchBar();
  });

  $('#db-batch-select-all')?.addEventListener('click', () => {
    const items = getCurrentItems();
    const selSet = getCurrentSelectionSet();
    items.forEach(item => selSet.add(item.id));
    document.querySelectorAll('.db-card, .highlight-card').forEach(c => c.classList.add('selected'));
    updateBatchBar();
  });

  $('#db-batch-clear')?.addEventListener('click', () => {
    getCurrentSelectionSet().clear();
    document.querySelectorAll('.db-card, .highlight-card').forEach(c => c.classList.remove('selected'));
    updateBatchBar();
  });

  $('#db-batch-full-view')?.addEventListener('click', () => {
    const selSet = getCurrentSelectionSet();
    const items = getCurrentItems();
    const selected = Array.from(selSet).map(id => items.find(i => i.id === id)).filter(Boolean);
    if (selected.length === 0) { showToast('Select at least one item first'); return; }
    showSnippetDetail(selected[0], selected);
  });

  $('#db-batch-star')?.addEventListener('click', () => {
    const ids = Array.from(getCurrentSelectionSet());
    if (ids.length === 0) return;
    chrome.storage.local.get(['napnox_snippets', 'napnox_highlights'], r => {
      const snaps = r.napnox_snippets || {};
      const hls = r.napnox_highlights || {};
      ids.forEach(id => {
        if (snaps[id]) snaps[id].starred = true;
        if (hls[id]) hls[id].starred = true;
      });
      chrome.storage.local.set({ napnox_snippets: snaps, napnox_highlights: hls });
    });
    const items = getCurrentItems();
    items.forEach(i => { if (ids.includes(i.id)) i.starred = true; });
    showToast(`Starred ${ids.length} item(s)`);
    renderInbox();
  });

  $('#db-batch-folder')?.addEventListener('click', async () => {
    const ids = Array.from(getCurrentSelectionSet());
    if (ids.length === 0) return;
    const folderName = prompt('Enter folder name (leave blank to unassign):');
    if (folderName === null) return;
    await moveSnippetsToFolder(ids, folderName.trim());
    getCurrentSelectionSet().clear();
    updateBatchBar();
  });

  $('#db-batch-ai')?.addEventListener('click', () => {
    const ids = Array.from(getCurrentSelectionSet());
    if (ids.length === 0) { showToast('Select items first'); return; }
    ids.forEach(id => state.selectedAiSnippets.add(id));
    navigateTo('ai');
    showToast(`${ids.length} item(s) sent to AI Studio`);
  });

  $('#db-batch-delete')?.addEventListener('click', async () => {
    const ids = Array.from(getCurrentSelectionSet());
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} item(s)?`)) return;
    chrome.storage.local.get(['napnox_snippets', 'napnox_highlights', 'napnox_order', 'napnox_highlight_order'], r => {
      const snips = r.napnox_snippets || {};
      const hls = r.napnox_highlights || {};
      const sOrder = r.napnox_order || [];
      const hOrder = r.napnox_highlight_order || [];
      ids.forEach(id => {
        delete snips[id];
        delete hls[id];
      });
      chrome.storage.local.set({
        napnox_snippets: snips,
        napnox_highlights: hls,
        napnox_order: sOrder.filter(id => !ids.includes(id)),
        napnox_highlight_order: hOrder.filter(id => !ids.includes(id))
      });
    });
    state.snippets = state.snippets.filter(s => !ids.includes(s.id));
    state.highlights = state.highlights.filter(h => !ids.includes(h.id));
    getCurrentSelectionSet().clear();
    updateBatchBar();
    updateSnippetCounts();
    renderInbox();
    showToast('Deleted');
  });

  $('#db-batch-download')?.addEventListener('click', () => {
    const ids = Array.from(getCurrentSelectionSet());
    const items = getCurrentItems();
    const selected = items.filter(i => ids.includes(i.id));
    if (selected.length === 0) return;
    const content = selected.map(s => `## ${s.pageTitle}\n*${s.hostname} - ${new Date(s.timestamp).toLocaleDateString()}*\n\n${s.selectionText || s.markdownContent || ''}\n\n---`).join('\n\n');
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'napnox-items.md'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  $('#db-batch-markdown')?.addEventListener('click', () => {
    const ids = Array.from(getCurrentSelectionSet());
    const items = getCurrentItems();
    const selected = items.filter(i => ids.includes(i.id));
    if (selected.length === 0) { showToast('Select items first'); return; }
    const markdown = selected.map(s => `### ${s.pageTitle}\nSource: ${s.sourceUrl}\n\n${s.markdownContent || s.selectionText}\n\n---`).join('\n\n');
    copyToClipboard(markdown);
    showToast(`Copied ${selected.length} items as Markdown`);
  });

  $('#btn-back-calendar')?.addEventListener('click', () => {
    if (state.activeTab === 'snippets') {
      state.clipsSelectedDate = null;
      state.selectedSnippets.clear();
    } else {
      state.highlightsSelectedDate = null;
      state.selectedHighlights.clear();
    }
    renderInbox();
  });

  // Modal & other listeners
  setupAdditionalEventListeners();
}

function setupAdditionalEventListeners() {
  // Settings
  $('#setting-verify-license')?.addEventListener('click', verifyLicense);
  $('#setting-join-workspace')?.addEventListener('click', joinWorkspace);

  // API Key Inputs
  const apiKeyInput = $('#setting-openrouter-key');
  const keyStatusEl = $('#ai-key-status');
  const providerSelect = $('#setting-provider');

  const describeKey = (val) => {
    const k = (val || '').trim();
    if (!k) return { text: '⚠️ No key set — AI Studio is disabled.', color: '#fca5a5' };
    if (k.startsWith('gsk_')) return { text: '✓ Groq key detected.', color: '#86efac' };
    if (k.startsWith('sk-or-')) return { text: '✓ OpenRouter key detected.', color: '#86efac' };
    if (k.startsWith('sk-ant-')) return { text: '✓ Anthropic key detected.', color: '#86efac' };
    if (k.startsWith('sk-nry-')) return { text: '✓ Napnox Router key detected.', color: '#86efac' };
    if (k.startsWith('sk-')) return { text: '✓ OpenAI key detected.', color: '#86efac' };
    return { text: '⚠️ Unrecognised key format — will be sent to Groq.', color: '#fcd34d' };
  };

  const paintKeyStatus = (val) => {
    if (!keyStatusEl) return;
    const { text, color } = describeKey(val);
    keyStatusEl.textContent = text;
    keyStatusEl.style.color = color;
  };

  if (apiKeyInput) {
chrome.storage.local.get(['napnox_openrouter_key'], (r) => {
      const key = r.napnox_openrouter_key || '';
      apiKeyInput.value = key;
      paintKeyStatus(key);
    });

    const persistKey = () => {
      const val = apiKeyInput.value.trim();
      apiKeyInput.value = val;
      chrome.storage.local.set({ napnox_openrouter_key: val });
      paintKeyStatus(val);
    };

    // Save on blur/enter AND on paste, so a pasted key is live immediately
    // even if the user clicks straight through to AI Studio without blurring.
    apiKeyInput.addEventListener('change', () => {
      persistKey();
      showToast('AI Studio API key saved');
    });
    apiKeyInput.addEventListener('input', persistKey);
  }

  $('#setting-test-ai')?.addEventListener('click', async () => {
    const btn = $('#setting-test-ai');
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Testing…';
    if (keyStatusEl) {
      keyStatusEl.textContent = 'Contacting provider…';
      keyStatusEl.style.color = '';
    }

    try {
      const res = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          { action: 'TEST_AI_CONNECTION', key: apiKeyInput?.value.trim() || '' },
          (r) => {
            if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
            resolve(r);
          }
        );
      });

      if (keyStatusEl) {
        if (res?.ok) {
          keyStatusEl.textContent = `✓ Connected to ${res.provider} (${res.model}).`;
          keyStatusEl.style.color = '#86efac';
        } else {
          keyStatusEl.textContent = `✗ ${res?.error || 'Connection failed.'}`;
          keyStatusEl.style.color = '#fca5a5';
        }
      }
      showToast(res?.ok ? 'AI connection OK' : 'AI connection failed');
    } catch (err) {
      if (keyStatusEl) {
        keyStatusEl.textContent = `✗ ${err.message || 'Connection failed.'}`;
        keyStatusEl.style.color = '#fca5a5';
      }
      showToast('AI connection failed');
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  });

  // Model selector
  if (providerSelect) {
    providerSelect.addEventListener('change', () => {
      const model = providerSelect.value;
      chrome.storage.local.set({ napnox_ai_model: model });
      showToast(`AI model set to ${model}`);
    });

    chrome.storage.local.get(['napnox_ai_model'], (r) => {
      if (r.napnox_ai_model) providerSelect.value = r.napnox_ai_model;
    });
  }

  // Clear all data button
  $('#setting-clear-all')?.addEventListener('click', async () => {
    if (!confirm('Permanently delete ALL snippets, highlights, folders, and chat history? This cannot be undone.')) return;

    chrome.storage.local.remove([
      'napnox_snippets', 'napnox_order', 'napnox_highlights', 'napnox_highlight_order',
      'napnox_folders', 'napnox_chat_sessions', 'napnox_reading_list',
      'napnox_highlight_notes', 'napnox_openrouter_key',
      'napnox_ai_pending', 'napnox_usage'
    ]);

    state.snippets = [];
    state.highlights = [];
    state.folders = [];
    state.chatSessions = [];
    state.selectedSnippets.clear();
    state.selectedHighlights.clear();
    state.selectedAiSnippets.clear();
    state.clipsSelectedDate = null;
    state.highlightsSelectedDate = null;

    renderInbox();
    renderFolderFilter();
    updateSnippetCounts();
    showToast('All data cleared');
  });

  // Theme selector
  const themeSelect = $('#setting-theme');
  if (themeSelect) {
    chrome.storage.local.get(['napnox_theme'], (r) => {
      if (r.napnox_theme) themeSelect.value = r.napnox_theme;
    });
    themeSelect.addEventListener('change', (e) => {
      document.documentElement.setAttribute('data-theme', e.target.value);
      chrome.storage.local.set({ napnox_theme: e.target.value });
    });
  }

  // Modal buttons
  $('#modal-close')?.addEventListener('click', hideModal);
  $('#modal-copy')?.addEventListener('click', () => {
    const content = $('#modal-content')?.innerText || '';
    copyToClipboard(content);
    showToast('Copied to clipboard');
  });
  $('#modal-star')?.addEventListener('click', (e) => {
    if (!state.sliderItems || !state.sliderItems[state.currentSliderIndex]) return;
    const item = state.sliderItems[state.currentSliderIndex];
    item.starred = !item.starred;
    chrome.storage.local.get(['napnox_snippets', 'napnox_highlights'], (r) => {
      const s = r.napnox_snippets || {};
      const h = r.napnox_highlights || {};
      if (s[item.id]) s[item.id].starred = item.starred;
      if (h[item.id]) h[item.id].starred = item.starred;
      chrome.storage.local.set({ napnox_snippets: s, napnox_highlights: h });
    });
    e.currentTarget.classList.toggle('active', item.starred);
    showToast(item.starred ? 'Starred' : 'Unstarred');
  });
  $('#modal-save-note')?.addEventListener('click', () => {
    if (!state.sliderItems || !state.sliderItems[state.currentSliderIndex]) return;
    const item = state.sliderItems[state.currentSliderIndex];
    const noteEl = $('#modal-note');
    if (!noteEl) return;
    const noteContent = noteEl.value.trim();
    item.note = noteContent;
    chrome.storage.local.get(['napnox_snippets', 'napnox_highlights'], (r) => {
      const s = r.napnox_snippets || {};
      const h = r.napnox_highlights || {};
      if (s[item.id]) s[item.id].note = noteContent;
      if (h[item.id]) h[item.id].note = noteContent;
      chrome.storage.local.set({ napnox_snippets: s, napnox_highlights: h });
    });
    showToast('Note saved');
  });
  $('#modal-delete')?.addEventListener('click', () => {
    if (!state.sliderItems || !state.sliderItems[state.currentSliderIndex]) return;
    const item = state.sliderItems[state.currentSliderIndex];
    if (!confirm('Delete this item?')) return;
    chrome.storage.local.get(['napnox_snippets', 'napnox_highlights', 'napnox_order', 'napnox_highlight_order'], r => {
      const s = r.napnox_snippets || {};
      const h = r.napnox_highlights || {};
      delete s[item.id];
      delete h[item.id];
      chrome.storage.local.set({
        napnox_snippets: s,
        napnox_highlights: h,
        napnox_order: (r.napnox_order || []).filter(id => id !== item.id),
        napnox_highlight_order: (r.napnox_highlight_order || []).filter(id => id !== item.id)
      });
    });
    state.snippets = state.snippets.filter(x => x.id !== item.id);
    state.highlights = state.highlights.filter(x => x.id !== item.id);
    const selSet = state.activeTab === 'highlights' ? state.selectedHighlights : state.selectedSnippets;
    selSet.delete(item.id);
    hideModal();
    updateBatchBar();
    updateSnippetCounts();
    renderInbox();
    showToast('Deleted');
  });
}

// =========================================================
// Render Functions
// =========================================================

function renderFolderFilter() {
  const select = $('#folder-filter');
  if (!select) return;

  // ★ FIX: Always re-read from storage to catch newly-created folders
  chrome.storage.local.get(['napnox_folders'], r => {
    state.folders = r.napnox_folders || [];

    const folderCounts = {};
    state.snippets.forEach(s => {
      if (s.folderId) folderCounts[s.folderId] = (folderCounts[s.folderId] || 0) + 1;
    });

    let html = '<option value="">All Folders</option>';
    state.folders.forEach(folder => {
      html += `<option value="${escapeAttr(folder.id)}">${escapeHtml(folder.name)} (${folderCounts[folder.id] || 0})</option>`;
    });
    select.innerHTML = html;
    select.value = state.currentFolderId || '';

    // Rebind change handler (innerHTML wipes it)
    select.onchange = async () => {
      state.currentFolderId = select.value || null;
      state.filters.folderId = select.value || '';
      await loadSnippets();
      renderInbox();
    };
  });
}

function renderUI() {
  $$('.nav-item').forEach(el => el.classList.remove('active'));
  $(`#nav-${state.currentView}`)?.classList.add('active');

  $$('.view').forEach(el => el.classList.remove('active'));
  $(`#view-${state.currentView}`)?.classList.add('active');

  switch (state.currentView) {
    case 'inbox': renderInbox(); break;
    case 'starred': renderStarred(); break;
    case 'ai': renderAIStudio(); break;
    case 'export': renderExport(); break;
    case 'settings': renderSettings(); break;
  }
}

function renderInbox() {
  const clipsCalendar = $('#clips-calendar-container');
  const highlightsCalendar = $('#highlights-calendar-container');
  const filterHeader = $('#calendar-filter-header');
  const filterHeaderDate = $('#filter-header-date');
  const snippetGrid = $('#snippet-grid');
  const highlightsGrid = $('#highlights-grid');
  const batchBar = $('#db-batch-bar');
  const countEl = $('#inbox-count');

  if (state.activeTab === 'snippets') {
    if (highlightsCalendar) highlightsCalendar.style.display = 'none';
    if (highlightsGrid) highlightsGrid.style.display = 'none';

    if (state.clipsSelectedDate) {
      if (clipsCalendar) clipsCalendar.style.display = 'none';
      if (filterHeader) filterHeader.style.display = 'flex';
      if (filterHeaderDate) filterHeaderDate.textContent = `Clips on ${formatDateString(state.clipsSelectedDate)}`;
      if (snippetGrid) snippetGrid.style.display = '';
      renderSnippets();
      const itemsForDate = getItemsForDate(new Date(state.clipsSelectedDate), 'snippets');
      if (countEl) countEl.textContent = `${itemsForDate.length} clip${itemsForDate.length === 1 ? '' : 's'} on this date`;
    } else {
      if (clipsCalendar) {
        clipsCalendar.style.display = 'flex';
        renderCalendar('clips-calendar-container', 'snippets');
      }
      if (filterHeader) filterHeader.style.display = 'none';
      if (snippetGrid) snippetGrid.style.display = 'none';
      if (countEl) countEl.textContent = `${state.snippets.length} clip${state.snippets.length === 1 ? '' : 's'}`;
    }
  } else {
    if (clipsCalendar) clipsCalendar.style.display = 'none';
    if (snippetGrid) snippetGrid.style.display = 'none';

    if (state.highlightsSelectedDate) {
      if (highlightsCalendar) highlightsCalendar.style.display = 'none';
      if (filterHeader) filterHeader.style.display = 'flex';
      if (filterHeaderDate) filterHeaderDate.textContent = `Highlights on ${formatDateString(state.highlightsSelectedDate)}`;
      if (highlightsGrid) highlightsGrid.style.display = '';
      renderHighlightsGrid();
      const itemsForDate = getItemsForDate(new Date(state.highlightsSelectedDate), 'highlights');
      if (countEl) countEl.textContent = `${itemsForDate.length} highlight${itemsForDate.length === 1 ? '' : 's'} on this date`;
    } else {
      if (highlightsCalendar) {
        highlightsCalendar.style.display = 'flex';
        renderCalendar('highlights-calendar-container', 'highlights');
      }
      if (filterHeader) filterHeader.style.display = 'none';
      if (highlightsGrid) highlightsGrid.style.display = 'none';
      if (countEl) countEl.textContent = `${state.highlights.length} highlight${state.highlights.length === 1 ? '' : 's'}`;
    }
  }
}

function renderStarred() {
  const starredSnippets = state.snippets.filter(s => s.starred);
  const empty = $('#starred-empty');
  const grid = $('#starred-grid');
  if (!grid) return;

  if (starredSnippets.length === 0) {
    if (empty) empty.style.display = 'flex';
    grid.innerHTML = '';
    return;
  }
  if (empty) empty.style.display = 'none';
  renderSnippetGrid(starredSnippets, '#starred-grid');
}

function renderAIStudio() {
  renderAiSnippetList();
}

function renderExport() { }
function renderSettings() { }

// =========================================================
// Calendar
// =========================================================

function formatDateString(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function getItemsForDate(dateObj, type) {
  const items = type === 'highlights' ? state.highlights : state.snippets;
  const targetYear = dateObj.getFullYear();
  const targetMonth = dateObj.getMonth();
  const targetDate = dateObj.getDate();
  return items.filter(item => {
    if (!item.timestamp) return false;
    const d = new Date(item.timestamp);
    return d.getFullYear() === targetYear &&
      d.getMonth() === targetMonth &&
      d.getDate() === targetDate;
  });
}

function renderCalendar(containerId, type) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const isHighlights = type === 'highlights';
  const currentMonthDate = isHighlights ? state.highlightsCalendarMonth : state.clipsCalendarMonth;
  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth();

  const firstDayIndex = new Date(year, month, 1).getDay();
  const numDays = new Date(year, month + 1, 0).getDate();
  const prevNumDays = new Date(year, month, 0).getDate();

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const itemLabel = isHighlights ? 'highlight' : 'clip';

  let html = `
    <div class="calendar-header">
      <div style="display:flex;align-items:center;gap:12px;">
        <span class="calendar-month-year">${monthNames[month]} ${year}</span>
        <span style="font-size:12px;color:var(--text-muted);font-weight:400;">
          ${(isHighlights ? state.highlights : state.snippets).length} ${itemLabel}s total
        </span>
      </div>
      <div class="calendar-nav-controls">
        <button class="calendar-nav-btn prev-month-btn" title="Previous Month">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <button class="calendar-nav-btn next-month-btn" title="Next Month">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </button>
      </div>
    </div>
    <div class="calendar-weekdays">
      <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
    </div>
    <div class="calendar-days-grid">
  `;

  for (let i = firstDayIndex; i > 0; i--) {
    html += `<div class="calendar-day-cell other-month"><span class="day-number">${prevNumDays - i + 1}</span></div>`;
  }

  const today = new Date();

  for (let day = 1; day <= numDays; day++) {
    const cellDate = new Date(year, month, day);
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const isToday = cellDate.getFullYear() === today.getFullYear() &&
      cellDate.getMonth() === today.getMonth() &&
      cellDate.getDate() === today.getDate();

    const itemsOnDate = getItemsForDate(cellDate, type);
    const hasItems = itemsOnDate.length > 0;
    const count = itemsOnDate.length;
    const selectedDate = isHighlights ? state.highlightsSelectedDate : state.clipsSelectedDate;

    let cellClass = 'calendar-day-cell';
    if (isToday) cellClass += ' today';
    if (hasItems) cellClass += ' has-items';
    if (selectedDate === dateStr) cellClass += ' selected';

    html += `
      <div class="${cellClass}" data-date="${dateStr}">
        <span class="day-number">${day}</span>
        ${hasItems ? `
          <span class="day-badge">${count}</span>
          <span class="day-items-label">${count} ${itemLabel}${count !== 1 ? 's' : ''}</span>
        ` : ''}
      </div>
    `;
  }

  const totalCellsSoFar = firstDayIndex + numDays;
  const remainingCells = totalCellsSoFar % 7 === 0 ? 0 : 7 - (totalCellsSoFar % 7);
  for (let i = 1; i <= remainingCells; i++) {
    html += `<div class="calendar-day-cell other-month"><span class="day-number">${i}</span></div>`;
  }

  html += `</div>`;
  container.innerHTML = html;

  container.querySelector('.prev-month-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const newMonth = new Date(year, month - 1, 1);
    if (isHighlights) state.highlightsCalendarMonth = newMonth;
    else state.clipsCalendarMonth = newMonth;
    renderCalendar(containerId, type);
  });

  container.querySelector('.next-month-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const newMonth = new Date(year, month + 1, 1);
    if (isHighlights) state.highlightsCalendarMonth = newMonth;
    else state.clipsCalendarMonth = newMonth;
    renderCalendar(containerId, type);
  });

  container.querySelectorAll('.calendar-day-cell:not(.other-month)').forEach(cell => {
    cell.addEventListener('click', () => {
      const selectedDateStr = cell.getAttribute('data-date');
      if (isHighlights) state.highlightsSelectedDate = selectedDateStr;
      else state.clipsSelectedDate = selectedDateStr;
      renderInbox();
    });
  });
}

// =========================================================
// Snippet & Highlight Grids
// =========================================================

function renderSnippets() {
  let snippetsToRender = state.snippets;

  if (state.clipsSelectedDate) {
    const targetDate = new Date(state.clipsSelectedDate);
    snippetsToRender = snippetsToRender.filter(s => {
      if (!s.timestamp) return false;
      const d = new Date(s.timestamp);
      return d.getFullYear() === targetDate.getFullYear() &&
        d.getMonth() === targetDate.getMonth() &&
        d.getDate() === targetDate.getDate();
    });
  }

  if (state.filters.query && window.Fuse) {
    const fuse = new Fuse(snippetsToRender, {
      keys: ['selectionText', 'pageTitle', 'tags', 'hostname', 'sourceUrl'],
      threshold: 0.3,
      minMatchCharLength: 2
    });
    snippetsToRender = fuse.search(state.filters.query).map(result => result.item);
  } else if (state.filters.query) {
    const q = state.filters.query.toLowerCase();
    snippetsToRender = snippetsToRender.filter(s =>
      s.selectionText?.toLowerCase().includes(q) ||
      s.pageTitle?.toLowerCase().includes(q)
    );
  }

  if (snippetsToRender.length === 0) {
    const emptyEl = $('#db-empty');
    const gridEl = $('#snippet-grid');
    if (gridEl) gridEl.innerHTML = '';
    if (emptyEl) {
      emptyEl.style.display = 'flex';
      if (state.clipsSelectedDate) {
        emptyEl.innerHTML = `
          <div class="db-empty-icon">📅</div>
          <h2 class="db-empty-title">No clips on ${formatDateString(state.clipsSelectedDate)}</h2>
          <p class="db-empty-sub">Nothing was captured on this day.<br>Click <strong>← Back to Calendar</strong> to pick another date.</p>
        `;
      } else {
        emptyEl.innerHTML = `
          <div class="db-empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="url(#de1)" stroke-width="1.5" fill="url(#de1)" fill-opacity="0.15" />
              <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="url(#de1)" stroke-width="1.5" />
              <defs><linearGradient id="de1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#8b5cf6" /><stop offset="100%" stop-color="#06b6d4" /></linearGradient></defs>
            </svg>
          </div>
          <h2 class="db-empty-title">No snippets yet</h2>
          <p class="db-empty-sub">Select text on any page and press <kbd>Alt + S</kbd> to start capturing</p>
        `;
      }
    }
    return;
  }

  const emptyEl = $('#db-empty');
  if (emptyEl) emptyEl.style.display = 'none';
  renderSnippetGrid(snippetsToRender, '#snippet-grid');
}

function renderSnippetGrid(snippets, containerSelector) {
  const container = document.querySelector(containerSelector);
  if (!container) return;
  container.innerHTML = '';

  if (snippets.length === 0) {
    container.innerHTML = '<div class="db-empty" style="display:flex"><div class="db-empty-title">No snippets found</div></div>';
    return;
  }

  snippets.forEach(snippet => {
    const snippetEl = document.createElement('div');
    snippetEl.className = 'db-card';
    if (state.selectedSnippets.has(snippet.id)) snippetEl.classList.add('selected');
    snippetEl.innerHTML = `
      <div class="db-card-header">
        <div class="db-card-favicon-wrap">
          <img class="db-card-favicon" src="${escapeAttr(snippet.favicon || `https://www.google.com/s2/favicons?domain=${snippet.hostname}&sz=32`)}" alt="" onerror="this.style.display='none'">
        </div>
        <div class="db-card-meta">
          <div class="db-card-title">${escapeHtml(snippet.pageTitle || 'Untitled')}</div>
          <div class="db-card-host">${escapeHtml(snippet.hostname || '')}</div>
        </div>
        <div class="db-card-quick-actions">
          <button class="db-quick-btn ${snippet.starred ? 'active' : ''}" data-action="star" data-id="${escapeAttr(snippet.id)}" title="${snippet.starred ? 'Unstar' : 'Star'}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="${snippet.starred ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
        </div>
      </div>
      <div class="db-card-snippet">${escapeHtml(snippet.selectionText || '')}</div>
      <div class="db-card-footer">
        <span class="db-card-time">${formatTimeAgo(snippet.timestamp)}</span>
        <div class="snippet-footer-btns">
          <button class="db-send-ai-btn" data-action="send-ai" data-id="${escapeAttr(snippet.id)}" style="padding:4px 10px;font-size:10px;border-radius:6px;background:var(--accent);color:white;border:none;cursor:pointer;display:flex;align-items:center;gap:3px;">🤖 AI</button>
        </div>
      </div>
    `;

    // Card click toggles selection
    snippetEl.addEventListener('click', (e) => {
      if (e && e.target && e.target.closest && e.target.closest('button')) return;
      if (state.selectedSnippets.has(snippet.id)) {
        state.selectedSnippets.delete(snippet.id);
        snippetEl.classList.remove('selected');
      } else {
        state.selectedSnippets.add(snippet.id);
        snippetEl.classList.add('selected');
      }
      updateBatchBar();
    });

    // Star button
    snippetEl.querySelector('[data-action="star"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = snippet.id;
      snippet.starred = !snippet.starred;
      chrome.runtime.sendMessage({
        action: 'UPDATE_SNIPPET',
        id: id,
        updates: { starred: snippet.starred }
      });
      renderSnippetGrid(snippets, containerSelector);
      updateSnippetCounts();
    });

    // Send to AI
    snippetEl.querySelector('[data-action="send-ai"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      state.selectedAiSnippets.add(snippet.id);
      state.aiContextTab = 'clips';
      document.querySelectorAll('.ai-context-tab').forEach(t => {
        t.classList.toggle('active', t.getAttribute('data-tab') === 'clips');
      });
      navigateTo('ai');
      renderAiSnippetList();
      showToast(`"${(snippet.pageTitle || '').substring(0, 30)}" added to AI context`);
    });

    // Double-click opens detail
    snippetEl.addEventListener('dblclick', () => showSnippetDetail(snippet));

    container.appendChild(snippetEl);
  });
}

function renderHighlightsGrid() {
  const grid = $('#highlights-grid');
  if (!grid) return;

  if (state.highlights.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--text-muted);">
        <div style="font-size: 48px; margin-bottom: 16px;">✏️</div>
        <div style="font-size: 16px; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px;">No highlights yet</div>
        <div style="font-size: 13px;">Select text on any page and click a color in the floating toolbar to highlight it.</div>
      </div>`;
    return;
  }

  grid.innerHTML = '';
  let highlightList = state.highlights.slice().reverse();

  if (state.highlightsSelectedDate) {
    const targetDate = new Date(state.highlightsSelectedDate);
    highlightList = highlightList.filter(h => {
      if (!h.timestamp) return false;
      const d = new Date(h.timestamp);
      return d.getFullYear() === targetDate.getFullYear() &&
        d.getMonth() === targetDate.getMonth() &&
        d.getDate() === targetDate.getDate();
    });
  }

  if (highlightList.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--text-muted);">
        <div style="font-size: 32px; margin-bottom: 12px;">✏️</div>
        <div style="font-size: 14px; font-weight: 600; color: var(--text-secondary); margin-bottom: 4px;">No highlights on this date</div>
        <div style="font-size: 12px;">Try selecting another date on the calendar.</div>
      </div>`;
    return;
  }

  highlightList.forEach(h => {
    const date = new Date(h.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const text = h.text || '';
    const note = h.note || '';
    const domain = (() => { try { return new URL(h.sourceUrl || h.url || '').hostname; } catch (e) { return h.hostname || ''; } })();

    const card = document.createElement('div');
    card.className = 'highlight-card';
    card.style.setProperty('--hl-color', h.color || '#fbbf24');
    if (state.selectedHighlights.has(h.id)) card.classList.add('selected');
    card.innerHTML = `
      <div class="highlight-card-header">
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="highlight-color-dot" style="background:${h.color || '#fbbf24'}; width:10px; height:10px; border-radius:50%"></div>
          <span style="font-size:11px; font-weight:600; color:var(--text-muted); text-transform:uppercase">Highlight</span>
        </div>
        <span class="highlight-card-date">${date}</span>
      </div>
      <div class="highlight-card-text">${escapeHtml(text)}</div>
      ${note ? `<div class="highlight-card-note">📝 ${escapeHtml(note)}</div>` : ''}
      <div class="card-footer">
        <span class="highlight-card-source">🔗 ${escapeHtml(domain)}</span>
        <button data-action="hl-send-ai" style="padding:4px 10px;font-size:10px;border-radius:6px;background:var(--accent);color:white;border:none;cursor:pointer;">🤖 Send to AI</button>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e && e.target && e.target.closest && e.target.closest('button')) return;
      if (state.selectedHighlights.has(h.id)) {
        state.selectedHighlights.delete(h.id);
        card.classList.remove('selected');
      } else {
        state.selectedHighlights.add(h.id);
        card.classList.add('selected');
      }
      updateBatchBar();
    });

    card.querySelector('[data-action="hl-send-ai"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      // Ensure highlight is also accessible in snippets for AI context
      const tempSnippet = {
        id: h.id,
        selectionText: h.text || '',
        pageTitle: h.pageTitle || 'Highlight',
        hostname: domain,
        sourceUrl: h.sourceUrl || h.url || '',
        timestamp: h.timestamp
      };
      if (!state.snippets.find(s => s.id === h.id)) state.snippets.push(tempSnippet);
      state.selectedAiSnippets.add(h.id);
      state.aiContextTab = 'highlights';
      document.querySelectorAll('.ai-context-tab').forEach(t => {
        t.classList.toggle('active', t.getAttribute('data-tab') === 'highlights');
      });
      navigateTo('ai');
      renderAiSnippetList();
      showToast('Highlight added to AI context!');
    });

    grid.appendChild(card);
  });
}

// =========================================================
// AI Snippet List
// =========================================================

function renderAiSnippetList() {
  const container = $('#ai-snippets-list');
  if (!container) {
    console.warn('[Napnox] #ai-snippets-list not found');
    return;
  }
  container.innerHTML = '';

  const allItems = state.aiContextTab === 'clips'
    ? state.snippets.map(s => ({
      id: s.id,
      pageTitle: s.pageTitle || 'Untitled',
      hostname: s.hostname || '',
      text: s.selectionText || s.markdownContent || '',
      timestamp: s.timestamp
    }))
    : state.highlights.map(h => ({
      id: h.id,
      pageTitle: h.pageTitle || 'Highlight',
      hostname: (() => { try { return new URL(h.sourceUrl || '').hostname; } catch (e) { return ''; } })(),
      text: h.text || '',
      timestamp: h.timestamp
    }));

  if (allItems.length === 0) {
    container.innerHTML = `<div class="ai-empty-state">No ${state.aiContextTab === 'clips' ? 'clips' : 'highlights'} yet — capture some from any webpage!</div>`;
  } else {
    allItems.forEach(item => {
      const isSelected = state.selectedAiSnippets.has(item.id);
      const itemEl = document.createElement('div');
      itemEl.className = 'ai-snippet-item';
      if (isSelected) itemEl.classList.add('ai-snippet-item-selected');
      itemEl.innerHTML = `
        <input type="checkbox" class="ai-snippet-checkbox" ${isSelected ? 'checked' : ''} data-id="${escapeAttr(item.id)}">
        <div class="ai-snippet-text-wrap">
          <div class="ai-snippet-title">${escapeHtml(item.pageTitle)}</div>
          <div class="ai-snippet-host">${escapeHtml(item.hostname)}</div>
          <div class="ai-snippet-preview">${escapeHtml(item.text.slice(0, 100))}${item.text.length > 100 ? '…' : ''}</div>
        </div>
      `;

      itemEl.addEventListener('click', (e) => {
        if (state.selectedAiSnippets.has(item.id)) {
          state.selectedAiSnippets.delete(item.id);
        } else {
          state.selectedAiSnippets.add(item.id);
        }
        renderAiSnippetList();
      });

      container.appendChild(itemEl);
    });
  }

  const countEl = $('#ai-snippet-count');
  if (countEl) countEl.textContent = `${state.selectedAiSnippets.size} selected`;
}

// =========================================================
// Tag Strip
// =========================================================

function renderTagStrip() {
  const strip = $('#tag-strip');
  if (!strip) return;

  const tagCounts = {};
  state.snippets.forEach(s => {
    if (s.tags && Array.isArray(s.tags)) {
      s.tags.forEach(tag => { tagCounts[tag] = (tagCounts[tag] || 0) + 1; });
    }
  });

  const tags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 15);

  if (tags.length === 0) {
    strip.innerHTML = '';
    const wrapper = $('#tag-strip-wrapper');
    if (wrapper) wrapper.style.display = 'none';
    return;
  }

  const wrapper = $('#tag-strip-wrapper');
  if (wrapper) wrapper.style.display = 'flex';

  strip.innerHTML = tags.map(([tag, count]) => `
    <button class="tag-pill" data-tag="${escapeAttr(tag)}">${escapeHtml(tag)} <span class="tag-count">${count}</span></button>
  `).join('');

  strip.querySelectorAll('.tag-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const tag = pill.getAttribute('data-tag');
      if (state.filters.tag === tag) {
        state.filters.tag = '';
        pill.classList.remove('active');
      } else {
        state.filters.tag = tag;
        strip.querySelectorAll('.tag-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
      }
      loadSnippets().then(() => renderInbox());
    });
  });

  setTimeout(updateTagScrollButtons, 50);
}

function updateTagScrollButtons() {
  const strip = $('#tag-strip');
  const leftBtn = $('#tag-scroll-left');
  const rightBtn = $('#tag-scroll-right');
  if (!strip || !leftBtn || !rightBtn) return;
  const showArrows = strip.scrollWidth > strip.clientWidth;
  leftBtn.style.display = showArrows && strip.scrollLeft > 0 ? 'flex' : 'none';
  rightBtn.style.display = showArrows && Math.ceil(strip.scrollLeft) < strip.scrollWidth - strip.clientWidth ? 'flex' : 'none';
}

// =========================================================
// Chat History
// =========================================================

function renderChatHistory() {
  const container = $('#ai-chat-history');
  if (!container) return;
  container.innerHTML = '';

  if (state.chatSessions.length === 0) {
    container.innerHTML = '<div class="ai-empty-state">No chat sessions yet</div>';
    return;
  }

  const now = new Date();
  const todayStr = now.toDateString();
  const yesterdayStr = new Date(now.getTime() - 86400000).toDateString();

  const todayChats = state.chatSessions.filter(c => new Date(c.createdAt).toDateString() === todayStr);
  const yesterdayChats = state.chatSessions.filter(c => new Date(c.createdAt).toDateString() === yesterdayStr);
  const olderChats = state.chatSessions.filter(c => new Date(c.createdAt).getTime() < new Date(now.getTime() - 86400000).getTime());

  const renderChatGroup = (groupName, chats) => {
    if (chats.length === 0) return null;
    const groupEl = document.createElement('div');
    groupEl.className = 'ai-chat-group';
    groupEl.innerHTML = `<div class="ai-chat-group-header">${groupName}</div>`;
    chats.forEach(chat => {
      const chatEl = document.createElement('div');
      chatEl.className = 'ai-chat-session';
      chatEl.setAttribute('data-id', escapeAttr(chat.id));
      chatEl.innerHTML = `
        <div class="ai-chat-session-title">${escapeHtml(chat.title || 'Untitled chat')}</div>
        <div class="ai-chat-session-time">${formatTime(chat.createdAt)}</div>
      `;
      chatEl.addEventListener('click', () => loadChatSession(chat.id));
      groupEl.appendChild(chatEl);
    });
    return groupEl;
  };

  const t = renderChatGroup('Today', todayChats); if (t) container.appendChild(t);
  const y = renderChatGroup('Yesterday', yesterdayChats); if (y) container.appendChild(y);
  const o = renderChatGroup('Older', olderChats); if (o) container.appendChild(o);
}

async function loadChatSession(sessionId) {
  const session = state.chatSessions.find(s => s.id === sessionId);
  if (!session) return;
  state.currentChatSession = session;
  $('#ai-messages').innerHTML = '';
  session.messages.forEach(message => renderMessage(message));
  scrollToBottom();
}

function startNewChat() {
  state.currentChatSession = null;
  $('#ai-messages').innerHTML = `
    <div class="ai-welcome-message">
      <h3>New Chat Session</h3>
      <p>Select some snippets from the left panel to use as context, then start chatting with AI.</p>
    </div>
  `;
  $('#ai-chat-input').value = '';
  $('#ai-chat-input').focus();
}

// =========================================================
// Send AI Message
// =========================================================

async function sendMessage() {
  const input = $('#ai-chat-input');
  const sendBtn = $('#ai-send-btn');
  if (!input) return;
  const message = input.value.trim();
  if (!message || state.aiIsGenerating) return;

  state.aiIsGenerating = true;
  input.disabled = true;
  if (sendBtn) sendBtn.disabled = true;

  try {
    const userMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: Date.now()
    };

    if ($('#ai-messages').querySelector('.ai-welcome-message')) {
      $('#ai-messages').innerHTML = '';
    }

    renderMessage(userMessage);
    input.value = '';

    if (!state.currentChatSession) {
      state.currentChatSession = {
        id: `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: message.substring(0, 40) + (message.length > 40 ? '...' : ''),
        createdAt: Date.now(),
        messages: [userMessage],
        folderId: null
      };
    } else {
      state.currentChatSession.messages.push(userMessage);
    }

    const selectedSnippets = Array.from(state.selectedAiSnippets).map(id => {
      return state.snippets.find(s => s.id === id) || state.highlights.find(h => h.id === id);
    }).filter(Boolean);

    // Show typing indicator
    const typingIndicator = document.createElement('div');
    typingIndicator.id = 'ai-typing-indicator';
    typingIndicator.className = 'ai-message ai-message-ai';
    typingIndicator.innerHTML = `
      <div class="ai-message-content" style="opacity: 0.75;">
        <div class="ai-message-text"><i>🤖 Napnox AI is thinking...</i></div>
      </div>
    `;
    $('#ai-messages')?.appendChild(typingIndicator);
    scrollToBottom();

    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'AI_QUERY',
        prompt: message,
        snippets: selectedSnippets,
        history: state.currentChatSession.messages.filter(m => m.role === 'user' || m.role === 'ai').slice(-6)
      }, (res) => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        if (!res || !res.ok) return reject(new Error(res?.error || 'No response received from AI service.'));
        resolve(res);
      });
    });

    // Remove typing indicator
    $('#ai-typing-indicator')?.remove();

    const parsedResult = parseAIResponse(response.result);

    const aiMessage = {
      id: `msg_${Date.now()}`,
      role: 'ai',
      content: response.result,
      summary: parsedResult.summary,
      keyPoints: parsedResult.keyPoints,
      rawContent: response.result
    };

    state.currentChatSession.messages.push(aiMessage);
    renderMessage(aiMessage);

    await saveChatSession(state.currentChatSession);

    if (selectedSnippets.length > 2) {
      detectAndShowResearchGaps(selectedSnippets, message, response.result);
    }

    scrollToBottom();
  } catch (error) {
    console.error('Chat error:', error);
    $('#ai-typing-indicator')?.remove();
    const errorDiv = document.createElement('div');
    errorDiv.className = 'ai-message ai-error';
    errorDiv.style.cssText = 'padding: 12px 14px; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; color: #fca5a5; font-size: 13px; margin: 8px 0; display: flex; flex-direction: column; gap: 8px;';
    const isKeyError = error.message && (error.message.includes('401') || error.message.includes('key') || error.message.includes('Authentication'));
    errorDiv.innerHTML = `
      <div>⚠️ <b>AI Connection Error:</b> ${escapeHtml(error.message || 'Failed to communicate with AI')}</div>
      ${isKeyError ? '<button id="btn-fix-key" style="align-self:flex-start; padding:4px 10px; background:var(--accent); border:none; border-radius:4px; color:white; font-size:11px; font-weight:700; cursor:pointer;">⚙️ Open Settings to Add API Key</button>' : ''}
    `;
    $('#ai-messages')?.appendChild(errorDiv);
    errorDiv.querySelector('#btn-fix-key')?.addEventListener('click', () => {
      navigateTo('settings');
    });
    scrollToBottom();
  } finally {
    state.aiIsGenerating = false;
    input.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    input.focus();
  }
}

function renderMessage(message) {
  const container = $('#ai-messages');
  if (!container) return;
  const messageEl = document.createElement('div');
  messageEl.className = `ai-message ai-message-${message.role}`;

  if (message.role === 'user') {
    messageEl.innerHTML = `
      <div class="ai-message-content">
        <div class="ai-message-text">${escapeHtml(message.content)}</div>
        <div class="ai-message-meta">${formatTime(message.timestamp)}</div>
      </div>
    `;
  } else {
    const parsed = (typeof marked !== 'undefined') ? marked.parse(message.content) : escapeHtml(message.content);
    const summaryHtml = message.summary && message.summary !== 'No summary available'
      ? `<div class="ai-message-summary">${escapeHtml(message.summary)}</div>`
      : '';

    const keyPointsHtml = message.keyPoints && message.keyPoints.length > 0
      ? `<div class="ai-message-keypoints">
          ${message.keyPoints.map(point => `<div class="ai-keypoint">${escapeHtml(point)}</div>`).join('')}
        </div>`
      : '';

    messageEl.innerHTML = `
      <div class="ai-message-content">
        ${summaryHtml}
        ${keyPointsHtml}
        <div class="ai-message-text">${parsed}</div>
        <div class="ai-message-actions">
          <button class="ai-action-btn ai-copy-btn">Copy</button>
          <button class="ai-action-btn ai-resummarise">🔄 Resummarise</button>
        </div>
      </div>
      <div class="ai-message-meta">${formatTime(message.timestamp)}</div>
    `;

    // Copy button
    messageEl.querySelector('.ai-copy-btn')?.addEventListener('click', () => {
      copyToClipboard(message.content);
    });

    // Resummarise button
    messageEl.querySelector('.ai-resummarise')?.addEventListener('click', () => {
      const currentIndex = state.currentChatSession.messages.length - 1;
      const prevUserMsg = state.currentChatSession.messages[currentIndex - 1];
      if (prevUserMsg && prevUserMsg.role === 'user') {
        const newPrompt = `Based on this question: "${prevUserMsg.content}", provide a fresh summary with 3 key bullet points. Keep it concise.`;
        state.aiIsGenerating = true;
        input.disabled = true;
        if (sendBtn) sendBtn.disabled = true;
        chrome.runtime.sendMessage({
          action: 'AI_QUERY',
          prompt: newPrompt,
          snippets: [],
          history: state.currentChatSession.messages.filter(m => m.role !== 'user' || m.id !== prevUserMsg.id).slice(-6)
        }, (res) => {
          state.aiIsGenerating = false;
          input.disabled = false;
          if (sendBtn) sendBtn.disabled = false;
          if (res && res.ok) {
            const newParsed = parseAIResponse(res.result);
            const newMsg = {
              id: `msg_${Date.now()}`,
              role: 'ai',
              content: res.result,
              summary: newParsed.summary,
              keyPoints: newParsed.keyPoints,
              rawContent: res.result
            };
            const idx = state.currentChatSession.messages.length - 1;
            state.currentChatSession.messages[idx] = newMsg;
            renderMessage(newMsg);
            showToast('New summary generated');
          }
        });
      }
    });
  }

  container.appendChild(messageEl);
  scrollToBottom();
}

function scrollToBottom() {
  const container = $('#ai-messages');
  if (container) container.scrollTop = container.scrollHeight;
}

async function detectAndShowResearchGaps(snippets, topic, content) {
  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'DETECT_RESEARCH_GAPS',
        snippets: snippets,
        topic: topic,
        content: content
      }, (res) => {
        if (res && res.ok) resolve(res);
        else reject(new Error(res?.error || 'Failed'));
      });
    });

    if (response.gaps && response.gaps.gaps && response.gaps.gaps.length > 0) {
      const gapsDiv = document.createElement('div');
      gapsDiv.className = 'ai-research-gaps';
      gapsDiv.innerHTML = `
        <div class="gaps-header">⚠️ Research Gaps Detected</div>
        <div class="gaps-list">
          ${response.gaps.gaps.map(gap => `
            <div class="gap-item">
              <span class="gap-topic">${escapeHtml(gap.topic)}</span>
              <a href="https://www.google.com/search?q=${encodeURIComponent(gap.searchQuery || '')}"
                 target="_blank" class="gap-search">
                 🔍 ${escapeHtml(gap.searchQuery || '')}
              </a>
            </div>
          `).join('')}
        </div>
      `;
      $('#ai-messages')?.appendChild(gapsDiv);
      scrollToBottom();
    }
  } catch (e) {
    console.warn('Research gaps detection failed:', e);
  }
}

async function saveChatSession(session) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: 'SAVE_CHAT_SESSION', session: session }, (response) => {
      if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
      if (!response.ok) return reject(new Error(response.error));

      const index = state.chatSessions.findIndex(s => s.id === session.id);
      if (index >= 0) state.chatSessions[index] = session;
      else state.chatSessions.unshift(session);
      renderChatHistory();
      resolve(response);
    });
  });
}

// =========================================================
// Modal
// =========================================================

function showSnippetDetail(snippet, allItems = []) {
  if (allItems.length > 1) {
    state.sliderItems = allItems;
    state.currentSliderIndex = allItems.findIndex(s => s.id === snippet.id);
    if (state.currentSliderIndex === -1) state.currentSliderIndex = 0;
    $('#modal-slider-nav').style.display = 'flex';
    updateModalSliderUI();
  } else {
    state.sliderItems = [snippet];
    state.currentSliderIndex = 0;
    $('#modal-slider-nav').style.display = 'none';
  }
  renderModalContent(state.sliderItems[state.currentSliderIndex]);
  $('#modal-overlay').classList.add('visible');
}

function updateModalSliderUI() {
  const total = state.sliderItems.length;
  const current = state.currentSliderIndex + 1;
  $('#modal-counter').textContent = `${current} / ${total}`;
  $('#modal-prev').disabled = state.currentSliderIndex === 0;
  $('#modal-next').disabled = state.currentSliderIndex === total - 1;
}

function renderModalContent(snippet) {
  if (!snippet) return;
  $('#modal-title').textContent = snippet.pageTitle || 'Untitled';
  $('#modal-source').textContent = snippet.hostname || '';
  $('#modal-source').href = snippet.sourceUrl || '#';
  $('#modal-favicon').src = snippet.favicon || `https://www.google.com/s2/favicons?domain=${snippet.hostname}&sz=32`;

  const date = new Date(snippet.timestamp || Date.now());
  const wordCount = (snippet.selectionText || '').split(/\s+/).length;
  $('#modal-meta').innerHTML = `
    <div class="modal-meta-item">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
      ${date.toLocaleString()}
    </div>
    <div class="modal-meta-item">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
      ${wordCount} words
    </div>
  `;

  const content = snippet.markdownContent || snippet.selectionText || snippet.text || '';
  let modalHtml = `<div style="white-space: pre-wrap; line-height: 1.7; font-size: 13.5px; color: var(--text-primary)">${escapeHtml(content)}</div>`;
  if (snippet.note) {
    modalHtml = `
      <div style="margin-bottom: 16px; padding: 12px; background: var(--bg-elevated); border-radius: 8px; border-left: 4px solid var(--accent);">
        <div style="font-size: 11px; font-weight: 700; color: var(--accent); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em;">Your Note</div>
        <div style="font-style: italic; color: var(--text-primary); line-height: 1.5;">${escapeHtml(snippet.note)}</div>
      </div>
      ${modalHtml}
    `;
  }
  $('#modal-content').innerHTML = modalHtml;
  $('#modal-note').value = snippet.note || '';
}

function hideModal() {
  $('#modal-overlay').classList.remove('visible');
  const tabBar = $('#modal-tab-bar');
  if (tabBar) tabBar.style.display = 'none';
}

function openFullViewModal(tabName) {
  const items = tabName === 'highlights' ? state.highlights : state.snippets;
  if (items.length === 0) {
    showToast(`No ${tabName === 'highlights' ? 'highlights' : 'clips'} available`);
    return;
  }
  showSnippetDetail(items[0], items);
}

// =========================================================
// Navigation
// =========================================================

function navigateTo(view) {
  state.currentView = view;
  window.location.hash = `#${view}`;
  renderUI();
}

function handleHashChange() {
  const hash = window.location.hash.substring(1);
  if (['inbox', 'starred', 'ai', 'export', 'settings'].includes(hash)) {
    state.currentView = hash;
  } else {
    state.currentView = 'inbox';
    window.location.hash = '#inbox';
  }
  renderUI();
}

function handleGlobalSearch(e) {
  const query = (e?.target?.value ?? $('#db-search')?.value ?? '').trim();
  state.filters.query = query;
  if (query) {
    state.clipsSelectedDate = null;
    state.highlightsSelectedDate = null;
  }
  if (state.activeTab === 'snippets') {
    loadSnippets().then(() => renderInbox());
  } else {
    loadHighlights().then(() => renderInbox());
  }
}

// =========================================================
// Settings Actions
// =========================================================

async function verifyLicense() {
  const keyInput = $('#setting-license-key');
  const key = keyInput?.value.trim();
  if (!key) { alert('Please enter a license key'); return; }
  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'VERIFY_LICENSE', key }, (response) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else if (!response?.ok) reject(new Error(response?.error));
        else resolve(response);
      });
    });
    if (response.isPro) alert('License verified! Pro features unlocked.');
    else alert('Invalid license key');
  } catch (error) {
    alert(`Verification error: ${error.message}`);
  }
}

async function joinWorkspace() {
  const wsId = $('#setting-workspace-id')?.value.trim();
  if (!wsId) { alert('Please enter a workspace ID'); return; }
  try {
    await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'INIT_FIREBASE' }, () => resolve());
    });
    await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'JOIN_WORKSPACE', workspaceId: wsId, userId: 'current_user' }, (response) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else if (!response?.ok) reject(new Error(response?.error));
        else resolve(response);
      });
    });
    alert(`Joined workspace: ${wsId}`);
    $('#setting-workspace-id').value = '';
    const syncStatus = $('#setting-sync-status');
    if (syncStatus) {
      syncStatus.textContent = `Connected to ${wsId}`;
      syncStatus.style.color = 'var(--green)';
    }
  } catch (error) {
    if (error.message === 'Firebase not initialized') {
      $('#setting-sync-status').textContent = `Joined ${wsId} (Local)`;
      showToast('Workspace joined in local-only mode');
    } else {
      alert(`Workspace join error: ${error.message}`);
    }
  }
}

async function moveSnippetsToFolder(snippetIds, folderName) {
  if (!folderName) {
    chrome.storage.local.get(['napnox_snippets'], r => {
      const snips = r.napnox_snippets || {};
      snippetIds.forEach(id => { if (snips[id]) snips[id].folderId = null; });
      chrome.storage.local.set({ napnox_snippets: snips });
    });
    snippetIds.forEach(id => {
      const s = state.snippets.find(sn => sn.id === id);
      if (s) s.folderId = null;
    });
    renderFolderFilter();
    renderInbox();
    showToast(`Removed ${snippetIds.length} snippets from folder`);
    return;
  }

  let folder = state.folders.find(f => f.name.toLowerCase() === folderName.toLowerCase());

  if (!folder) {
    try {
      folder = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'CREATE_FOLDER', name: folderName, color: '#8b5cf6' }, response => {
          if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
          if (response?.ok) resolve(response.folder);
          else reject(new Error(response?.error || 'No response'));
        });
      });
    } catch (err) {
      console.warn('[Napnox] CREATE_FOLDER via background failed, falling back:', err);
      folder = {
        id: `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: folderName,
        color: '#8b5cf6',
        createdAt: Date.now()
      };
      const existingFolders = await new Promise(resolve => {
        chrome.storage.local.get(['napnox_folders'], r => resolve(r.napnox_folders || []));
      });
      existingFolders.push(folder);
      await new Promise(resolve => chrome.storage.local.set({ napnox_folders: existingFolders }, resolve));
    }
    state.folders.push(folder);
  }

  chrome.storage.local.get(['napnox_snippets'], r => {
    const snips = r.napnox_snippets || {};
    snippetIds.forEach(id => { if (snips[id]) snips[id].folderId = folder.id; });
    chrome.storage.local.set({ napnox_snippets: snips });
  });
  snippetIds.forEach(id => {
    const s = state.snippets.find(sn => sn.id === id);
    if (s) s.folderId = folder.id;
  });

  showToast(`Moved ${snippetIds.length} snippets to ${folderName}`);
  renderFolderFilter();
  renderInbox();
}

// =========================================================
// Counters & UI Helpers
// =========================================================

function updateSnippetCounts() {
  const count = state.snippets.length;
  const countEl = $('#inbox-count');
  if (countEl) countEl.textContent = `${count} clip${count === 1 ? '' : 's'}`;
  const statTotal = $('#stat-total');
  if (statTotal) statTotal.textContent = count;
  const starredCount = state.snippets.filter(s => s.starred).length;
  const statStarred = $('#stat-starred');
  if (statStarred) statStarred.textContent = starredCount;
  const sitesCount = new Set(state.snippets.map(s => s.hostname)).size;
  const statSites = $('#stat-sites');
  if (statSites) statSites.textContent = sitesCount;
  const wordsCount = state.snippets.reduce((acc, s) => acc + (s.selectionText || '').split(/\s+/).filter(Boolean).length, 0);
  const statWords = $('#stat-words');
  if (statWords) statWords.textContent = wordsCount.toLocaleString();
  const navBadge = $('#nav-badge');
  if (navBadge) navBadge.textContent = count;
}

function showLoginOverlay() {
  const overlay = $('#login-overlay');
  if (overlay) overlay.style.display = 'flex';
}

function hideLoginOverlay() {
  const overlay = $('#login-overlay');
  if (overlay) overlay.style.display = 'none';
}

function updateUserInfo(name, status) {
  const nameEls = $$('.user-name');
  const statusEls = $$('.user-status');
  nameEls.forEach(el => el.textContent = name);
  statusEls.forEach(el => el.textContent = status);
}

function showToast(message) {
  document.querySelectorAll('.db-toast').forEach(t => t.remove());
  const toast = document.createElement('div');
  toast.className = 'db-toast visible';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// =========================================================
// Utils
// =========================================================

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function escapeAttr(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatTimeAgo(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / 86400000);
  const diffHrs = Math.floor((diffMs % 86400000) / 3600000);
  const diffMins = Math.round(((diffMs % 86400000) % 3600000) / 60000);
  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHrs > 0) return `${diffHrs}h ago`;
  if (diffMins > 0) return `${diffMins}m ago`;
  return 'Just now';
}

function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard'));
  } else {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showToast('Copied to clipboard');
  }
}

// Slider Navigation Listeners (kept at module level)
document.addEventListener('DOMContentLoaded', () => {
  $('#modal-prev')?.addEventListener('click', () => {
    if (state.currentSliderIndex > 0) {
      state.currentSliderIndex--;
      renderModalContent(state.sliderItems[state.currentSliderIndex]);
      updateModalSliderUI();
    }
  });
  $('#modal-next')?.addEventListener('click', () => {
    if (state.currentSliderIndex < state.sliderItems.length - 1) {
      state.currentSliderIndex++;
      renderModalContent(state.sliderItems[state.currentSliderIndex]);
      updateModalSliderUI();
    }
  });
});

// Initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Make some functions available globally for inline handlers
window.formatTime = formatTime;
window.copyToClipboard = copyToClipboard;
window.updateBatchBar = updateBatchBar;
window.escapeHtml = escapeHtml;
