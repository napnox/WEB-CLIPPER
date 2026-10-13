// Napnox Content Script - Full Version with Toolbar, Highlights & Quote Editor

(function () {
  'use strict';

  // State
  let toolbarEl = null;
  let lastSelection = null;
  let highlightIdCounter = 0;

  // Highlight colors mapping - names must match ::highlight(name) in CSS
  const HIGHLIGHT_COLORS = {
    '#fbbf24': 'napnox-yellow',
    '#34d399': 'napnox-green',
    '#a78bfa': 'napnox-purple',
    'gradient': 'napnox-gradient'
  };

  // Initialize
  function init() {
    createToolbar();
    setupEventListeners();
    setupMessageListeners();
    console.log('[Napnox] Content script initialized');
  }

  // Create floating toolbar
  function createToolbar() {
    if (toolbarEl) return;

    toolbarEl = document.createElement('div');
    toolbarEl.id = 'napnox-floating-toolbar';
    toolbarEl.innerHTML = `
      <div class="napnox-color-picker">
        <div class="napnox-color-dot" data-color="#fbbf24" style="background:#fbbf24" title="Yellow"></div>
        <div class="napnox-color-dot" data-color="#34d399" style="background:#34d399" title="Green"></div>
        <div class="napnox-color-dot" data-color="#a78bfa" style="background:#a78bfa" title="Purple"></div>
        <div class="napnox-color-dot gradient-dot" data-color="gradient" id="napnox-gradient-dot" style="background: linear-gradient(135deg, #8b5cf6, #06b6d4, #f472b6) !important;" title="Custom Color"></div>
        <input type="color" id="napnox-custom-color" style="position:absolute;opacity:0;width:0;height:0;pointer-events:none;" value="#8b5cf6">
      </div>
      <div class="napnox-toolbar-divider"></div>
      <button class="napnox-toolbar-btn" id="napnox-btn-quote" title="Quote Card" style="padding:6px 10px;font-size:12px;background:rgba(139,92,246,0.2);">
        “
      </button>
      <div class="napnox-toolbar-divider"></div>
      <button class="napnox-toolbar-btn napnox-btn-capture" id="napnox-btn-capture" title="Capture (Alt+S)">
        <svg class="capture-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <span class="btn-text">Capture</span>
      </button>
    `;

    document.body.appendChild(toolbarEl);

    // Setup toolbar event listeners
    setupToolbarListeners();
  }

  // Setup toolbar button listeners
  function setupToolbarListeners() {
    // Color dots - apply highlight
    toolbarEl.querySelectorAll('.napnox-color-dot').forEach(dot => {
      if (dot.id === 'napnox-gradient-dot') return;
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        applyHighlight(dot.dataset.color);
      });
    });

    // Custom color picker - save selection first, THEN open picker
    const gradientDot = document.getElementById('napnox-gradient-dot');
    const customColorInput = document.getElementById('napnox-custom-color');

    if (gradientDot && customColorInput) {
      gradientDot.addEventListener('mousedown', (e) => {
        // Save selection before picker steals focus
        if (window.getSelection().toString().trim()) {
          lastSelection = window.getSelection();
        }
      });
      gradientDot.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Use a body-level input to avoid layout constraints
        customColorInput.style.position = 'fixed';
        customColorInput.style.top = '0';
        customColorInput.style.left = '0';
        customColorInput.style.opacity = '0';
        customColorInput.style.width = '1px';
        customColorInput.style.height = '1px';
        customColorInput.style.zIndex = '2147483647';
        document.body.appendChild(customColorInput);
        setTimeout(() => customColorInput.click(), 10);
      });
      customColorInput.addEventListener('change', (e) => {
        e.stopPropagation();
        applyHighlight(e.target.value);
      });
    }

    // Quote button
    const quoteBtn = document.getElementById('napnox-btn-quote');
    if (quoteBtn) {
      quoteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sel = window.getSelection();
        const text = (sel && sel.toString().trim()) || (lastSelection && lastSelection.toString().trim());
        if (text) openQuoteEditor(text);
      });
    }

    // Capture button
    document.getElementById('napnox-btn-capture').addEventListener('click', (e) => {
      e.stopPropagation();
      doCapture();
      setTimeout(hideToolbar, 800);
    });
  }

  // Setup event listeners
  function setupEventListeners() {
    // Keyboard shortcut - Alt+S for capture, Alt+Shift+B for sidebar
    document.addEventListener('keydown', (e) => {
      if (e.altKey && !e.shiftKey && (e.key === 'S' || e.key === 's')) {
        e.preventDefault();
        doCapture();
        if (toolbarEl && toolbarEl.classList.contains('napnox-toolbar-visible')) {
          setTimeout(hideToolbar, 800);
        }
      } else if (e.altKey && e.shiftKey && (e.key === 'B' || e.key === 'b')) {
        e.preventDefault();
        toggleInlineSidebar();
      }
    });

    // Text selection - show toolbar
    document.addEventListener('mouseup', handleSelection);
    document.addEventListener('touchend', handleSelection);

    // Click outside to hide toolbar or note popover
    document.addEventListener('mousedown', (e) => {
      // Hide toolbar
      if (toolbarEl && !toolbarEl.contains(e.target) && !e.target.classList.contains('napnox-highlight')) {
        hideToolbar();
      }
      // Hide note popover
      const notePopover = document.getElementById('napnox-note-popover');
      if (notePopover && !notePopover.contains(e.target) && !e.target.classList.contains('napnox-highlight')) {
        notePopover.remove();
      }
    });

    // Click on highlight to show note popover
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('napnox-highlight')) {
        e.preventDefault();
        e.stopPropagation();
        showNotePopover(e.target);
      }
    });

    // Right-click on highlight to show Quick AI tooltip
    document.addEventListener('contextmenu', (e) => {
      if (e.target.classList.contains('napnox-highlight')) {
        e.preventDefault();
        e.stopPropagation();
        showQuickAITooltip(e.target, e.clientX, e.clientY);
      } else {
        const aiTooltip = document.getElementById('napnox-ai-tooltip');
        if (aiTooltip) aiTooltip.remove();
      }
    });
  }

  // Show Quick AI Tooltip
  function showQuickAITooltip(highlightNode, x, y) {
    const existing = document.getElementById('napnox-ai-tooltip');
    if (existing) existing.remove();

    const tooltip = document.createElement('div');
    tooltip.id = 'napnox-ai-tooltip';
    tooltip.innerHTML = `
      <div class="napnox-ai-actions">
        <button class="napnox-ai-btn" data-action="simplify">Simplify</button>
        <button class="napnox-ai-btn" data-action="define">Define</button>
        <button class="napnox-ai-btn" data-action="factcheck">Fact-check</button>
      </div>
      <div class="napnox-ai-result" id="napnox-ai-result" style="display:none;"></div>
    `;

    document.body.appendChild(tooltip);

    // Position it
    let top = y + window.scrollY + 5;
    let left = x + window.scrollX + 5;
    if (left + 200 > window.innerWidth) left = window.innerWidth - 210;

    tooltip.style.position = 'absolute';
    tooltip.style.top = top + 'px';
    tooltip.style.left = left + 'px';
    tooltip.style.background = '#fff';
    tooltip.style.border = '1px solid #e5e7eb';
    tooltip.style.borderRadius = '8px';
    tooltip.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
    tooltip.style.zIndex = '2147483647';
    tooltip.style.fontFamily = 'system-ui, sans-serif';
    tooltip.style.overflow = 'hidden';
    tooltip.style.width = '200px';

    const actionBtns = tooltip.querySelectorAll('.napnox-ai-btn');
    actionBtns.forEach(btn => {
      btn.style.display = 'block';
      btn.style.width = '100%';
      btn.style.padding = '8px 12px';
      btn.style.border = 'none';
      btn.style.background = 'none';
      btn.style.textAlign = 'left';
      btn.style.cursor = 'pointer';
      btn.style.fontSize = '13px';

      btn.addEventListener('mouseenter', () => btn.style.background = '#f3f4f6');
      btn.addEventListener('mouseleave', () => btn.style.background = 'none');

      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const text = highlightNode.textContent;
        const resultDiv = document.getElementById('napnox-ai-result');
        const actionsDiv = tooltip.querySelector('.napnox-ai-actions');

        actionsDiv.style.display = 'none';
        resultDiv.style.display = 'block';
        resultDiv.style.padding = '12px';
        resultDiv.style.fontSize = '13px';
        resultDiv.style.lineHeight = '1.5';
        resultDiv.style.color = '#374151';
        resultDiv.textContent = 'Thinking...';

        chrome.runtime.sendMessage({ action: 'QUICK_AI', promptType: action, text: text }, (response) => {
          if (response && response.ok) {
            resultDiv.innerHTML = response.result;
          } else {
            resultDiv.textContent = 'AI failed: ' + (response?.error || 'Unknown error');
          }
        });
      });
    });
  }

  // Show note popover for a highlight
  function showNotePopover(highlightNode) {
    // Remove any existing
    const existing = document.getElementById('napnox-note-popover');
    if (existing) existing.remove();

    const highlightId = highlightNode.dataset.highlightId;
    if (!highlightId) return;

    chrome.storage.local.get(['napnox_highlights'], (result) => {
      const h = (result.napnox_highlights || {})[highlightId];
      const existingNote = h && h.note ? h.note : '';

      const popover = document.createElement('div');
      popover.id = 'napnox-note-popover';
      popover.innerHTML = `
        <div class="napnox-note-header">
          <span>Highlight Note</span>
          <button id="napnox-note-delete" title="Delete Highlight">🗑</button>
        </div>
        <textarea id="napnox-note-textarea" placeholder="Add a note...">${esc(existingNote)}</textarea>
        <div class="napnox-note-footer">
          <button id="napnox-note-save">Save</button>
        </div>
      `;

      document.body.appendChild(popover);

      // Position it below the highlight
      const rect = highlightNode.getBoundingClientRect();
      let top = rect.bottom + window.scrollY + 8;
      let left = rect.left + window.scrollX;

      if (left + 250 > window.innerWidth) {
        left = window.innerWidth - 260;
      }

      popover.style.top = top + 'px';
      popover.style.left = left + 'px';

      // Focus
      const textarea = document.getElementById('napnox-note-textarea');
      textarea.focus();

      // Save
      document.getElementById('napnox-note-save').addEventListener('click', () => {
        const noteText = textarea.value.trim();
        updateHighlightNote(highlightId, noteText);
        popover.remove();
        showFeedback('Note saved');
      });

      // Delete highlight
      document.getElementById('napnox-note-delete').addEventListener('click', () => {
        if (confirm('Delete this highlight?')) {
          deleteHighlight(highlightId);
          // Unwrap text
          const parent = highlightNode.parentNode;
          while (highlightNode.firstChild) {
            parent.insertBefore(highlightNode.firstChild, highlightNode);
          }
          parent.removeChild(highlightNode);
          popover.remove();
        }
      });
    });
  }

  // Update highlight note in storage
  function updateHighlightNote(id, note) {
    chrome.storage.local.get(['napnox_highlights'], (result) => {
      const highlights = result.napnox_highlights || {};
      if (highlights[id]) {
        highlights[id].note = note;
        chrome.storage.local.set({ napnox_highlights: highlights }, () => {
          notifyStorageChange();
        });
      }
    });
  }

  // Delete highlight from storage
  function deleteHighlight(id) {
    chrome.storage.local.get(['napnox_highlights', 'napnox_highlight_order'], (result) => {
      const highlights = result.napnox_highlights || {};
      const order = result.napnox_highlight_order || [];
      delete highlights[id];
      const newOrder = order.filter(x => x !== id);
      chrome.storage.local.set({ napnox_highlights: highlights, napnox_highlight_order: newOrder }, () => {
        notifyStorageChange();
      });
    });
  }

  // Setup message listeners from background/popup
  function setupMessageListeners() {
    chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
      if (req.action === 'TRIGGER_CAPTURE') {
        doCapture();
        sendResponse({ ok: true });
      } else if (req.action === 'TRIGGER_HIGHLIGHT_ONLY') {
        // Show color picker or apply default highlight
        const sel = window.getSelection();
        if (sel && sel.toString().trim()) {
          applyHighlight('#fbbf24'); // Default yellow
        }
        sendResponse({ ok: true });
      } else if (req.action === 'TOGGLE_SIDEBAR') {
        // Toggle sidebar visibility (for inline sidebar mode)
        toggleInlineSidebar();
        sendResponse({ ok: true });
      }
      return true;
    });
  }

  // Handle text selection
  function handleSelection(e) {
    // Small delay to ensure selection is complete
    setTimeout(() => {
      const sel = window.getSelection();
      if (sel && sel.toString().trim().length > 2) { // Lowered threshold slightly
        lastSelection = sel;
        resetCaptureButton(); // Reset button when new selection happens
        showToolbarNearSelection();
      } else {
        // Only hide if not clicking on toolbar itself
        if (toolbarEl && !toolbarEl.contains(e.target)) {
          hideToolbar();
        }
      }
    }, 10);
  }

  // Reset capture button to default state
  function resetCaptureButton() {
    const btn = document.getElementById('napnox-btn-capture');
    if (!btn) return;

    btn.classList.remove('captured');
    const textSpan = btn.querySelector('.btn-text');
    const iconWrap = btn.querySelector('.capture-icon');

    if (textSpan) textSpan.textContent = 'Capture';
    if (iconWrap) {
      iconWrap.innerHTML = `
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      `;
    }
  }

  // Show toolbar near selection
  function showToolbarNearSelection() {
    if (!toolbarEl || !lastSelection) return;

    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Calculate position
    const toolbarWidth = 240;
    const toolbarHeight = 44;

    let left = rect.left + (rect.width / 2) - (toolbarWidth / 2) + window.scrollX;
    let top = rect.top - toolbarHeight - 12 + window.scrollY;

    // Keep within viewport
    if (left < 10) left = 10;
    if (left + toolbarWidth > window.innerWidth - 10) {
      left = window.innerWidth - toolbarWidth - 10;
    }
    if (top < 10 + window.scrollY) {
      top = rect.bottom + 12 + window.scrollY;
    }

    toolbarEl.style.left = left + 'px';
    toolbarEl.style.top = top + 'px';
    toolbarEl.classList.add('napnox-toolbar-visible');
  }

  // Hide toolbar
  function hideToolbar() {
    if (toolbarEl) {
      toolbarEl.classList.remove('napnox-toolbar-visible');
    }
  }

  // Generate XPath for an element
  function getXPath(element) {
    if (element.id !== '') return 'id("' + element.id + '")';
    if (element === document.body) return element.tagName;

    let ix = 0;
    const siblings = element.parentNode.childNodes;
    for (let i = 0; i < siblings.length; i++) {
      const sibling = siblings[i];
      if (sibling === element) {
        return getXPath(element.parentNode) + '/' + element.tagName + '[' + (ix + 1) + ']';
      }
      if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
        ix++;
      }
    }
  }

  // Apply highlight to selected text
  function applyHighlight(colorKey) {
    const selection = window.getSelection();
    if (!selection || !selection.toString().trim()) {
      return;
    }

    const text = selection.toString().trim();
    const highlightId = 'hl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    // Attempt to get XPath for the common ancestor of the selection
    let xpath = null;
    let startOffset = null;
    let endOffset = null;
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      xpath = getXPath(range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentNode);
      startOffset = range.startOffset;
      endOffset = range.endOffset;
    }

    const highlightData = {
      id: highlightId,
      text: text,
      color: colorKey === 'gradient' ? '#8b5cf6' : colorKey,
      colorKey: HIGHLIGHT_COLORS[colorKey] || 'napnox-yellow',
      xpath: xpath,
      startOffset: startOffset,
      endOffset: endOffset,
      pageTitle: document.title,
      hostname: location.hostname,
      sourceUrl: location.href,
      timestamp: new Date().toISOString(),
      favicon: getFavicon()
    };

    // If it's a custom hex color, always use fallback since CSS Highlights API requires pre-defined names
    if (colorKey.startsWith('#') && !HIGHLIGHT_COLORS[colorKey]) {
      applyHighlightFallback(colorKey, text, highlightId);
      saveHighlight(highlightData);
      selection.removeAllRanges();
      hideToolbar();
      return;
    }

    const highlightName = HIGHLIGHT_COLORS[colorKey] || 'napnox-yellow';

    // Try modern CSS Highlights API for pre-defined colors
    if (window.CSS && window.CSS.highlights) {
      try {
        const range = selection.getRangeAt(0);
        let highlightSet = window.CSS.highlights.get(highlightName);
        if (!highlightSet) {
          highlightSet = new window.Highlight(range);
          window.CSS.highlights.set(highlightName, highlightSet);
        } else {
          highlightSet.add(range);
        }

        saveHighlight(highlightData);
        selection.removeAllRanges();
        hideToolbar();
        return;
      } catch (e) {
        console.warn('[Napnox] CSS Highlights API failed, using fallback:', e);
      }
    }

    // Fallback: wrap in <mark> element
    applyHighlightFallback(colorKey === 'gradient' ? '#8b5cf6' : colorKey, text, highlightId);
    saveHighlight(highlightData);
    selection.removeAllRanges();
    hideToolbar();
  }


  // Fallback highlight using <mark> element
  function applyHighlightFallback(color, text, highlightId, node = null) {
    try {
      if (node) {
        // Find text nodes containing the text within the node
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null, false);
        let n;
        while (n = walker.nextNode()) {
          if (n.nodeValue.includes(text)) {
            const range = document.createRange();
            const idx = n.nodeValue.indexOf(text);
            range.setStart(n, idx);
            range.setEnd(n, idx + text.length);

            const mark = document.createElement('mark');
            mark.className = 'napnox-highlight';
            mark.dataset.highlightId = highlightId;
            mark.style.backgroundColor = color;
            if (color === 'gradient') {
              mark.style.background = 'linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(6, 182, 212, 0.3))';
              mark.style.textDecoration = 'underline wavy rgba(6, 182, 212, 0.6)';
            }
            range.surroundContents(mark);
            break; // Stop after first match in this node
          }
        }
      } else {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        const range = selection.getRangeAt(0);
        const mark = document.createElement('mark');
        mark.className = 'napnox-highlight';
        mark.dataset.highlightId = highlightId;
        mark.style.backgroundColor = color;
        if (color === 'gradient') {
          mark.style.background = 'linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(6, 182, 212, 0.3))';
          mark.style.textDecoration = 'underline wavy rgba(6, 182, 212, 0.6)';
        }

        range.surroundContents(mark);
        selection.removeAllRanges();
        hideToolbar();
      }
    } catch (e) {
      console.error('[Napnox] Highlight fallback failed:', e);
    }
  }

  // Save highlight to storage
  function saveHighlight(highlight) {
    chrome.storage.local.get(['napnox_highlights', 'napnox_highlight_order'], (result) => {
      const highlights = result.napnox_highlights || {};
      const order = result.napnox_highlight_order || [];

      highlights[highlight.id] = highlight;

      const newOrder = [highlight.id, ...order.filter(id => id !== highlight.id)].slice(0, 500);

      chrome.storage.local.set({
        napnox_highlights: highlights,
        napnox_highlight_order: newOrder
      }, () => {
        notifyStorageChange();
      });
    });
  }

  // Capture text as snippet
  function doCapture() {
    const sel = window.getSelection();
    const text = (sel && sel.toString().trim()) || (lastSelection && lastSelection.toString().trim());

    if (!text) return;

    // Update button UI state immediately if toolbar is visible
    const btn = document.getElementById('napnox-btn-capture');
    if (btn) {
      btn.classList.add('captured');
      const textSpan = btn.querySelector('.btn-text');
      const iconWrap = btn.querySelector('.capture-icon');
      if (textSpan) textSpan.textContent = 'Captured';
      if (iconWrap) {
        iconWrap.innerHTML = '<polyline points="20 6 9 17 4 12" />'; // Tick icon
      }
    }

    const id = 'snip_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const payload = {
      id: id,
      selectionText: text,
      markdownContent: text,
      pageTitle: document.title,
      hostname: location.hostname,
      sourceUrl: location.href,
      timestamp: new Date().toISOString(),
      favicon: getFavicon(),
      starred: false,
      tags: [],
      savedAt: Date.now()
    };

    // Save to local storage immediately for instant UI update
    chrome.storage.local.get(['napnox_snippets', 'napnox_order'], (r) => {
      const snips = r.napnox_snippets || {};
      const order = r.napnox_order || [];
      snips[id] = payload;
      order.unshift(id);
      chrome.storage.local.set({ napnox_snippets: snips, napnox_order: order }, () => {
        // Send to background for async tasks (screenshot, auto-tagging)
        chrome.runtime.sendMessage({ action: 'CAPTURE_SNIPPET_ASYNC', payload }, () => {
          if (chrome.runtime.lastError) {
            console.warn('[Napnox] Background worker offline for async tasks');
          }
        });
      });
    });
  }

  // Open quote editor - Full in-page overlay
  function openQuoteEditor(text) {
    if (!text) return;
    const existing = document.getElementById('napnox-quote-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'napnox-quote-overlay';
    overlay.style.cssText = `
      position:fixed;top:0;left:0;width:100%;height:100%;
      background:rgba(0,0,0,0.8);z-index:2147483647;
      display:flex;align-items:center;justify-content:center;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      backdrop-filter:blur(4px);
    `;

    const PRESET_BGETS = [
      { label: 'Violet', value: 'linear-gradient(135deg,#4f46e5,#7c3aed)' },
      { label: 'Ocean', value: 'linear-gradient(135deg,#0891b2,#06b6d4)' },
      { label: 'Sunset', value: 'linear-gradient(135deg,#f59e0b,#ef4444)' },
      { label: 'Forest', value: 'linear-gradient(135deg,#059669,#10b981)' },
      { label: 'Rose', value: 'linear-gradient(135deg,#be185d,#f472b6)' },
      { label: 'Dark', value: 'linear-gradient(135deg,#111827,#374151)' },
      { label: 'White', value: '#ffffff' },
      { label: 'Custom', value: 'custom' },
    ];

    const FONT_FAMILIES = [
      { label: 'Inter', value: "'Inter', sans-serif" },
      { label: 'Georgia', value: 'Georgia, serif' },
      { label: 'Playfair', value: "'Playfair Display', Georgia, serif" },
      { label: 'Mono', value: "Menlo, 'Courier New', monospace" },
    ];

    overlay.innerHTML = `
      <div style="background:#1a1a2e;border-radius:16px;width:640px;max-width:95vw;overflow:hidden;box-shadow:0 25px 50px rgba(0,0,0,0.5);">
        <div style="padding:20px 24px;border-bottom:1px solid #2d2d3f;display:flex;justify-content:space-between;align-items:center;">
          <span style="color:#f0eeff;font-weight:600;font-size:15px;">✦ Quote Card Editor</span>
          <button id="nq-close" style="background:none;border:none;color:#888;cursor:pointer;font-size:20px;line-height:1;">×</button>
        </div>

        <!-- Preview -->
        <div style="padding:24px;display:flex;justify-content:center;">
          <div id="nq-card" style="
            width:480px;min-height:200px;border-radius:12px;padding:36px 40px;
            background:linear-gradient(135deg,#4f46e5,#7c3aed);
            display:flex;flex-direction:column;justify-content:center;gap:16px;
            position:relative;box-shadow:0 8px 30px rgba(0,0,0,0.3);
          ">
            <div id="nq-open-quote" style="font-size:64px;line-height:0.6;color:rgba(255,255,255,0.3);font-family:Georgia;margin-bottom:8px;">"</div>
            <div id="nq-text" style="font-size:20px;line-height:1.6;color:#ffffff;font-family:'Inter',sans-serif;font-weight:400;">${text}</div>
            <div style="font-size:11px;color:rgba(255,255,255,0.55);margin-top:8px;">— ${location.hostname}</div>
          </div>
        </div>

        <!-- Controls -->
        <div style="padding:0 24px 24px;display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <!-- Background -->
          <div>
            <div style="color:#9ca3af;font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Background</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              ${PRESET_BGETS.map((bg, i) => `
                <div class="nq-bg-btn" data-bg="${bg.value}" title="${bg.label}"
                  style="width:28px;height:28px;border-radius:6px;cursor:pointer;border:2px solid ${i === 0 ? 'white' : 'transparent'};
                  background:${bg.value === 'custom' ? 'linear-gradient(135deg,#8b5cf6,#06b6d4,#f472b6)' : bg.value};
                  position:relative;" ${bg.value === 'custom' ? "id='nq-bg-custom-btn'" : ""}></div>
              `).join('')}
              <input type="color" id="nq-bg-custom-input" style="position:fixed;opacity:0;width:1px;height:1px;" value="#8b5cf6">
            </div>
          </div>

          <!-- Font Family -->
          <div>
            <div style="color:#9ca3af;font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Font</div>
            <select id="nq-font" style="background:#0f0f1a;border:1px solid #2d2d3f;color:#f0eeff;padding:6px 10px;border-radius:6px;font-size:12px;width:100%;cursor:pointer;">
              ${FONT_FAMILIES.map(f => `<option value="${f.value}">${f.label}</option>`).join('')}
            </select>
          </div>

          <!-- Font Size -->
          <div>
            <div style="color:#9ca3af;font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Size: <span id="nq-size-val">20</span>px</div>
            <input type="range" id="nq-font-size" min="12" max="48" value="20" style="width:100%;accent-color:#8b5cf6;">
          </div>

          <!-- Style toggles -->
          <div>
            <div style="color:#9ca3af;font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Style</div>
            <div style="display:flex;gap:8px;">
              <button id="nq-bold" style="padding:6px 14px;background:#1f1f30;border:1px solid #2d2d3f;border-radius:6px;color:#f0eeff;font-weight:700;cursor:pointer;font-size:13px;">B</button>
              <button id="nq-italic" style="padding:6px 14px;background:#1f1f30;border:1px solid #2d2d3f;border-radius:6px;color:#f0eeff;font-style:italic;cursor:pointer;font-size:13px;">I</button>
              <button id="nq-text-dark" style="padding:6px 12px;background:#1f1f30;border:1px solid #2d2d3f;border-radius:6px;color:#f0eeff;cursor:pointer;font-size:10px;">Dark text</button>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div style="padding:0 24px 24px;display:flex;gap:10px;flex-wrap:wrap;">
          <button id="nq-download" style="flex:1;padding:10px;background:linear-gradient(135deg,#8b5cf6,#06b6d4);border:none;border-radius:8px;color:white;font-weight:600;cursor:pointer;font-size:13px;">⬇ Download PNG</button>
          <button id="nq-copy-text" style="padding:10px 16px;background:#1f1f30;border:1px solid #2d2d3f;border-radius:8px;color:#f0eeff;cursor:pointer;font-size:13px;">Copy Text</button>
          <button id="nq-share-twitter" style="padding:10px 14px;background:#1da1f2;border:none;border-radius:8px;color:white;cursor:pointer;font-size:13px;">𝕏</button>
          <button id="nq-share-whatsapp" style="padding:10px 14px;background:#25d366;border:none;border-radius:8px;color:white;cursor:pointer;font-size:13px;">💬</button>
          <button id="nq-share-linkedin" style="padding:10px 14px;background:#0a66c2;border:none;border-radius:8px;color:white;cursor:pointer;font-size:13px;">in</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const card = document.getElementById('nq-card');
    const textEl = document.getElementById('nq-text');

    // Close
    document.getElementById('nq-close').onclick = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    // Background presets
    overlay.querySelectorAll('.nq-bg-btn').forEach(btn => {
      btn.onclick = () => {
        const bg = btn.dataset.bg;
        if (bg === 'custom') {
          document.getElementById('nq-bg-custom-input').click();
          return;
        }
        card.style.background = bg;
        overlay.querySelectorAll('.nq-bg-btn').forEach(b => b.style.borderColor = 'transparent');
        btn.style.borderColor = 'white';
      };
    });
    document.getElementById('nq-bg-custom-input').onchange = (e) => {
      card.style.background = e.target.value;
    };

    // Font family
    document.getElementById('nq-font').onchange = (e) => {
      textEl.style.fontFamily = e.target.value;
    };

    // Font size
    const sizeSlider = document.getElementById('nq-font-size');
    sizeSlider.oninput = () => {
      textEl.style.fontSize = sizeSlider.value + 'px';
      document.getElementById('nq-size-val').textContent = sizeSlider.value;
    };

    // Bold/Italic/Dark text
    let isBold = false, isItalic = false, isDark = false;
    document.getElementById('nq-bold').onclick = function () {
      isBold = !isBold;
      textEl.style.fontWeight = isBold ? '700' : '400';
      this.style.background = isBold ? '#8b5cf6' : '#1f1f30';
    };
    document.getElementById('nq-italic').onclick = function () {
      isItalic = !isItalic;
      textEl.style.fontStyle = isItalic ? 'italic' : 'normal';
      this.style.background = isItalic ? '#8b5cf6' : '#1f1f30';
    };
    document.getElementById('nq-text-dark').onclick = function () {
      isDark = !isDark;
      textEl.style.color = isDark ? '#111827' : '#ffffff';
      document.getElementById('nq-open-quote').style.color = isDark ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.3)';
      this.style.background = isDark ? '#8b5cf6' : '#1f1f30';
    };

    // Copy text
    document.getElementById('nq-copy-text').onclick = () => {
      navigator.clipboard.writeText(`"${text}" — ${location.hostname}`);
      showFeedback('Copied!');
    };

    // Download as PNG using canvas
    document.getElementById('nq-download').onclick = async () => {
      try {
        if (typeof html2canvas !== 'undefined') {
          const canvas = await html2canvas(card, { scale: 2, useCORS: true });
          const a = document.createElement('a');
          a.href = canvas.toDataURL('image/png');
          a.download = 'napnox-quote.png';
          a.click();
        } else {
          // Fallback: download as SVG-based PNG
          const svgData = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="220">
            <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#4f46e5"/><stop offset="100%" stop-color="#7c3aed"/>
            </linearGradient></defs>
            <rect width="480" height="220" rx="12" fill="url(#g)"/>
            <text x="40" y="60" font-size="48" fill="rgba(255,255,255,0.3)" font-family="Georgia">"</text>
            <foreignObject x="40" y="70" width="400" height="120">
              <div xmlns="http://www.w3.org/1999/xhtml" style="font:${textEl.style.fontWeight || 400} ${textEl.style.fontSize || '20px'} ${textEl.style.fontFamily || 'sans-serif'};color:${textEl.style.color || '#fff'};word-break:break-word;line-height:1.5;">
                ${text}
              </div>
            </foreignObject>
          </svg>`;
          const blob = new Blob([svgData], { type: 'image/svg+xml' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'napnox-quote.svg';
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
        showFeedback('Downloaded!');
      } catch (e) {
        showFeedback('Download failed');
      }
    };

    // Social share
    const shareText = encodeURIComponent(`"${text}" — ${location.hostname}`);
    const shareUrl = encodeURIComponent(location.href);
    document.getElementById('nq-share-twitter').onclick = () => window.open(`https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}`, '_blank');
    document.getElementById('nq-share-whatsapp').onclick = () => window.open(`https://wa.me/?text=${shareText}%20${shareUrl}`, '_blank');
    document.getElementById('nq-share-linkedin').onclick = () => window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}`, '_blank');
  }

  // Create sidebar
  let sidebarEl = null;
  function createSidebar() {
    if (sidebarEl) return sidebarEl;

    sidebarEl = document.createElement('div');
    sidebarEl.id = 'napnox-inline-sidebar';
    sidebarEl.innerHTML = `
      <div class="napnox-sidebar-header">
        <h3 class="napnox-sidebar-title">Napnox Notes</h3>
        <button class="napnox-sidebar-close" id="napnox-sidebar-close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="napnox-sidebar-content" id="napnox-sidebar-content">
        <div class="napnox-sidebar-empty">Loading snippets...</div>
      </div>
    `;

    document.body.appendChild(sidebarEl);

    document.getElementById('napnox-sidebar-close').addEventListener('click', () => {
      toggleInlineSidebar();
    });

    return sidebarEl;
  }

  // Load snippets for current page into sidebar
  function loadSidebarSnippets() {
    const content = document.getElementById('napnox-sidebar-content');
    if (!content) return;

    chrome.storage.local.get(['napnox_snippets', 'napnox_order'], (result) => {
      const s = result.napnox_snippets || {};
      const o = result.napnox_order || [];

      const currentUrl = location.href.split('#')[0]; // Ignore hash for matching
      const pageSnippets = o.filter(id => id in s && (s[id].sourceUrl || s[id].url || '').split('#')[0] === currentUrl).map(id => s[id]);

      if (pageSnippets.length === 0) {
        content.innerHTML = '<div class="napnox-sidebar-empty">No snippets saved from this page yet.</div>';
        return;
      }

      content.innerHTML = '';
      pageSnippets.forEach(snip => {
        const card = document.createElement('div');
        card.className = 'napnox-sidebar-card';
        const date = new Date(snip.timestamp || Date.now()).toLocaleDateString();

        card.innerHTML = `
          <div class="napnox-sidebar-card-text">${esc(snip.selectionText || '')}</div>
          <div class="napnox-sidebar-card-meta">
            <span>${date}</span>
          </div>
        `;
        content.appendChild(card);
      });
    });
  }

  // Escaping HTML
  function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Toggle inline sidebar
  function toggleInlineSidebar() {
    if (!sidebarEl) {
      createSidebar();
    }

    const isOpen = sidebarEl.classList.contains('napnox-open');
    if (isOpen) {
      sidebarEl.classList.remove('napnox-open');
    } else {
      sidebarEl.classList.add('napnox-open');
      loadSidebarSnippets();
    }
  }

  // Get favicon URL
  function getFavicon() {
    return 'https://www.google.com/s2/favicons?domain=' + location.hostname + '&sz=32';
  }

  // Show feedback toast (kept for other errors, but removed from capture)
  function showFeedback(msg) {
    const div = document.createElement('div');
    div.textContent = msg;
    div.className = 'napnox-feedback-toast';
    div.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      background: #8b5cf6; color: white; padding: 14px 28px; border-radius: 24px;
      font-family: system-ui, sans-serif; font-size: 14px; font-weight: 600;
      box-shadow: 0 4px 20px rgba(139,92,246,0.5); z-index: 2147483647;
    `;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 2000);
  }

  // Notify storage change
  function notifyStorageChange() {
    window.dispatchEvent(new CustomEvent('napnox_storage_change'));
  }

  // Load saved highlights
  function loadSavedHighlights() {
    chrome.storage.local.get(['napnox_highlights', 'napnox_highlight_order'], (result) => {
      const highlights = result.napnox_highlights || {};
      const order = result.napnox_highlight_order || [];
      const currentUrl = location.href.split('#')[0];

      const pageHighlights = order
        .filter(id => id in highlights && (highlights[id].sourceUrl || '').split('#')[0] === currentUrl)
        .map(id => highlights[id]);

      pageHighlights.forEach(h => {
        if (!h.xpath) return;

        try {
          const result = document.evaluate(h.xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
          const node = result.singleNodeValue;

          if (node) {
            // Find the text node within the element that contains our text
            const textNodes = [];
            const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null, false);
            let n;
            while (n = walker.nextNode()) {
              textNodes.push(n);
            }

            // Re-apply fallback highlight for all saved highlights to ensure they are visible
            // The CSS Highlight API is tricky to re-apply robustly from just text offsets
            applyHighlightFallback(h.color || '#fbbf24', h.text, h.id, node);
          }
        } catch (e) {
          console.warn('[Napnox] Failed to restore highlight:', h.id, e);
        }
      });
    });
  }

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  loadSavedHighlights();

})();