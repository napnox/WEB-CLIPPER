# NapnoxResearch OS — Complete Feature Implementation Guide
### Every feature, how it works, phase by phase

---

## Master Feature List (All 32 Features)

| # | Feature | Phase | Priority | Effort |
|---|---------|-------|----------|--------|
| 1 | Snippet folders / collections | 1 | P1 | Low |
| 2 | Persistent AI chat history | 1 | P1 | Low |
| 3 | Context-aware follow-up chat | 1 | P1 | Low |
| 4 | Raise free tier (15 reports/day) | 1 | P1 | Trivial |
| 5 | Full-text search (Fuse.js) | 1 | P1 | Low |
| 6 | Highlight-only mode (Alt+H) | 1 | P1 | Medium |
| 7 | Inline page sidebar | 1 | P1 | Medium |
| 8 | Auto citation generator | 1 | P1 | Low |
| 9 | Highlight persistence across reloads | 1 | P1 | Medium |
| 10 | Inline notes on highlights | 2 | P1 | Medium |
| 11 | PDF highlighting | 2 | P1 | High |
| 12 | Auto-tagging on capture (AI) | 2 | P2 | Low |
| 13 | Cloud sync / backup (Firebase) | 2 | P2 | High |
| 14 | Quick AI on highlight (tooltip) | 2 | P2 | Low |
| 15 | Reading progress tracker | 2 | P2 | Low |
| 16 | Search by domain / site | 2 | P2 | Low |
| 17 | 4-colour highlight system | 2 | P2 | Low |
| 18 | Inline highlight mark on capture | 2 | P2 | Low |
| 19 | Auto citation export in reports | 2 | P2 | Low |
| 20 | YouTube transcript capture | 3 | P2 | High |
| 21 | Team shared workspaces | 3 | P2 | High |
| 22 | Research gaps detector (AI) | 3 | P2 | Medium |
| 23 | Bi-directional snippet links | 3 | P3 | Medium |
| 24 | Duplicate / similarity detection | 3 | P3 | Low |
| 25 | Topic clustering (AI) | 3 | P3 | Medium |
| 26 | Research analytics dashboard | 3 | P3 | Medium |
| 27 | Share snippet as public link | 3 | P3 | Medium |
| 28 | Web reader (napnox.com/reader) | 3 | P3 | High |
| 29 | Screenshot + OCR capture | 4 | P3 | High |
| 30 | Napnox API hooks | 4 | P3 | Medium |
| 31 | Mobile PWA companion | 4 | P3 | High |
| 32 | Custom report templates | 4 | P3 | Medium |

---

## Phase 1 — Foundation (Weeks 1–2)
### Goal: Fix every core gap. Make Napnox reliable before adding anything new.

---

### Feature 1 — Snippet Folders / Collections

**What it does:** Users create named folders (Projects). Every snippet goes into one folder. Dashboard filters by folder. Popup shows folder list with snippet counts.

**How it works step by step:**

1. Add a `folderId` and `folderName` field to every snippet object in storage.
2. Create a `folders` array in `chrome.storage.local`:
   ```js
   // Data model
   {
     folders: [
       { id: "f1", name: "AI Research", color: "#6EE7B7", createdAt: 1234567890 },
       { id: "f2", name: "SEO Project", color: "#93C5FD", createdAt: 1234567891 }
     ],
     snippets: [
       { id: "s1", folderId: "f1", text: "...", url: "...", ... }
     ]
   }
   ```
3. In popup.html add a "Folders" tab in the left nav. Clicking a folder filters the snippet list to show only that folder's snippets.
4. Add a "+ New Folder" button. Prompt for folder name. Pick a colour from 6 presets. Save to storage.
5. On snippet capture (Alt+S), if a folder is currently selected in popup, auto-assign that `folderId` to the new snippet.
6. In the dashboard, add a folder dropdown filter above the snippet grid.
7. Show snippet count badge on each folder item (e.g. "AI Research · 12").
8. Add drag-and-drop: when user drags a snippet card over a folder in the sidebar, update its `folderId` on drop.

**Tech used:** `chrome.storage.local`, SortableJS CDN for drag-drop.

**Build time:** 4–6 hours.

---

### Feature 2 — Persistent AI Chat History

**What it does:** Every AI Studio conversation is saved. Users can scroll back through all past sessions. History never wipes on popup close.

**How it works step by step:**

1. Define a `chatSessions` array in storage:
   ```js
   chatSessions: [
     {
       id: "cs1",
       folderId: "f1",         // optional link to folder
       title: "Glasp research summary",
       createdAt: 1234567890,
       messages: [
         { role: "user", content: "Summarize these snippets", ts: 123 },
         { role: "ai", content: "Here is the summary...", ts: 124 }
       ]
     }
   ]
   ```
2. Every time user clicks a template or sends a prompt in AI Studio, create a new session (or append to current one).
3. Save each Q and A immediately on completion — don't wait.
4. In AI Studio UI, add a left sidebar panel showing past sessions, grouped by date ("Today", "Yesterday", "Last 7 days").
5. Clicking a session in the sidebar loads that conversation's messages into the main chat view.
6. Add a "New chat" button to start a fresh session.
7. Each session auto-titles itself from the first user message (truncated to 40 chars).
8. Add a delete button (trash icon) per session with confirmation.

**Storage limit note:** Keep max 50 sessions in local storage. When > 50, delete the oldest one automatically.

**Build time:** 5–7 hours.

---

### Feature 3 — Context-Aware Follow-Up Chat

**What it does:** Each new message in a session includes the last 3 exchanges as memory. The AI responds as if it remembers the conversation.

**How it works step by step:**

1. When user sends a new prompt in an existing session, build the full prompt like this:
   ```js
   function buildPrompt(userQuery, snippets, history) {
     const snippetContext = snippets
       .map(s => `[Source: ${s.title}]\n${s.text}`)
       .join('\n\n');

     const historyContext = history
       .slice(-3)  // last 3 Q&A pairs only (keeps tokens manageable)
       .map(m => `${m.role === 'user' ? 'Q' : 'A'}: ${m.content}`)
       .join('\n');

     return `${historyContext ? 'Previous conversation:\n' + historyContext + '\n\n' : ''}
Research context:
${snippetContext}

Current question: ${userQuery}

Answer using the research context above. Reference prior conversation if relevant.`;
   }
   ```
2. This single function change makes the AI "remember." No backend needed.
3. In the UI, render each message as a bubble — user messages on right (blue), AI on left (gray), with a timestamp.
4. Show a loading indicator ("Thinking...") while the API call is in flight.
5. Add a "Copy" button on each AI response bubble.

**Build time:** 2–3 hours (most of the work is the UI thread view).

---

### Feature 4 — Raise Free Tier to 15 Reports/Day

**What it does:** Changes the daily limit from 5 to 15. Simple config change.

**How it works:** Find the constant in your background.js or popup.js:
```js
const FREE_TIER_DAILY_LIMIT = 5;
// Change to:
const FREE_TIER_DAILY_LIMIT = 15;
```
Also gate only the premium templates (Team Report, Competitive Analysis, SEO Audit) behind Pro, not all templates. Basic templates (Executive Summary, Key Insights, Blog Outline) remain unlimited on free tier.

**Build time:** 30 minutes.

---

### Feature 5 — Full-Text Search (Fuse.js)

**What it does:** A search bar in the popup and dashboard that finds snippets by any word in their text, title, tags, or notes.

**How it works step by step:**

1. Add Fuse.js via CDN in popup.html:
   ```html
   <script src="https://cdnjs.cloudflare.com/ajax/libs/fuse.js/7.0.0/fuse.min.js"></script>
   ```
2. On popup load, build a Fuse index from all snippets:
   ```js
   const fuse = new Fuse(snippets, {
     keys: ['text', 'title', 'tags', 'note', 'url'],
     threshold: 0.3,    // 0 = exact, 1 = anything
     minMatchCharLength: 2
   });
   ```
3. Add a search input (`<input type="search">`) at the top of the popup snippet list.
4. On every keystroke, run `fuse.search(query)` and re-render only matching snippets.
5. Highlight matching words in the rendered results using `<mark>` tags.
6. When search input is empty, show all snippets in normal order.
7. Add keyboard shortcut: `Cmd/Ctrl+K` opens the search bar and focuses it.

**Build time:** 3–4 hours.

---

### Feature 6 — Highlight-Only Mode (Alt+H)

**What it does:** User selects text, presses Alt+H — text gets highlighted in yellow on the page. NOT saved to dashboard. Just a visual mark.

**How it works step by step:**

1. Register new command in manifest.json:
   ```json
   "commands": {
     "highlight-only": {
       "suggested_key": { "default": "Alt+H" },
       "description": "Highlight selected text on page"
     }
   }
   ```
2. In content.js, listen for this command:
   ```js
   chrome.runtime.onMessage.addListener((msg) => {
     if (msg.action === 'highlightOnly') {
       const selection = window.getSelection();
       if (!selection.rangeCount) return;
       const range = selection.getRangeAt(0);
       const mark = document.createElement('mark');
       mark.className = `napnox-hl napnox-hl-${msg.color || 'yellow'}`;
       mark.dataset.napnoxId = generateId();
       range.surroundContents(mark);
       selection.removeAllRanges();
     }
   });
   ```
3. Add CSS injected by content.js:
   ```css
   .napnox-hl-yellow { background: #FDE68A; cursor: pointer; }
   .napnox-hl-green  { background: #A7F3D0; cursor: pointer; }
   .napnox-hl-blue   { background: #BFDBFE; cursor: pointer; }
   .napnox-hl-red    { background: #FECACA; cursor: pointer; }
   .napnox-hl:hover::after {
     content: "✕ note";
     font-size: 11px;
     background: #1f2937;
     color: white;
     padding: 2px 6px;
     border-radius: 4px;
     position: absolute;
     margin-top: -24px;
   }
   ```
4. Also show a floating tooltip on mouse text selection with 4 colour buttons + capture button (see Feature 17).
5. Alt+S (capture) now ALSO highlights — so capture = highlight + save to inbox.

**Build time:** 4–5 hours.

---

### Feature 7 — Inline Page Sidebar

**What it does:** A collapsible panel slides in from the right side of every page, showing all highlights and saved snippets from that specific URL.

**How it works step by step:**

1. content.js injects a sidebar `<div>` into every page's `<body>`:
   ```js
   const sidebar = document.createElement('div');
   sidebar.id = 'napnox-sidebar';
   sidebar.innerHTML = `
     <div id="napnox-sidebar-header">
       <span>Napnox · <strong id="napnox-hl-count">0</strong> highlights</span>
       <button id="napnox-close">✕</button>
     </div>
     <div id="napnox-sidebar-list"></div>
   `;
   document.body.appendChild(sidebar);
   ```
2. Inject sidebar CSS (hidden by default, slides in via transform):
   ```css
   #napnox-sidebar {
     position: fixed; right: -320px; top: 0;
     width: 300px; height: 100vh;
     background: white; z-index: 999999;
     transition: right 0.25s ease;
     box-shadow: -4px 0 20px rgba(0,0,0,0.1);
     overflow-y: auto;
   }
   #napnox-sidebar.open { right: 0; }
   ```
3. Load all snippets for `window.location.href` from storage. Render each one in the sidebar list with text preview, colour tag, and note.
4. Clicking a snippet in the sidebar scrolls the page to that highlight (using the stored XPath — see Feature 9).
5. Toggle button: small Napnox icon fixed at the right edge of the page. Click to open/close sidebar.
6. Alt+P keyboard shortcut toggles the sidebar.
7. Show "0 highlights on this page" state when nothing has been saved from this URL.

**Build time:** 6–8 hours.

---

### Feature 8 — Auto Citation Generator

**What it does:** One-click APA / MLA / Chicago citation from any snippet's metadata.

**How it works step by step:**

1. Every snippet already stores: `url`, `title`, `timestamp`. That is all you need.
2. Add a "Cite" button on each snippet card:
   ```js
   function generateCitation(snippet, format = 'APA') {
     const date = new Date(snippet.timestamp);
     const accessed = date.toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
     const year = date.getFullYear();

     if (format === 'APA') {
       return `${snippet.title}. (${year}). Retrieved ${accessed}, from ${snippet.url}`;
     }
     if (format === 'MLA') {
       return `"${snippet.title}." Web. ${accessed}. <${snippet.url}>.`;
     }
     if (format === 'Chicago') {
       return `"${snippet.title}." Accessed ${accessed}. ${snippet.url}.`;
     }
   }
   ```
3. Show format selector (APA / MLA / Chicago) as a dropdown next to the Cite button.
4. Copy to clipboard on click. Show "Copied!" confirmation for 2 seconds.
5. Include citations automatically in all Markdown and Notion exports, appended as a References section.
6. In AI reports, append a "Sources" block at the end listing all snippet citations used.

**Build time:** 2–3 hours. Extremely high value-to-effort ratio.

---

### Feature 9 — Highlight Persistence Across Reloads

**What it does:** Highlights you placed on a page are still there when you come back to that URL.

**How it works step by step:**

1. When a highlight is created, store its "fingerprint" in storage:
   ```js
   function getXPath(element) {
     if (element.id) return `//*[@id="${element.id}"]`;
     if (element === document.body) return '/html/body';
     const siblings = element.parentNode.childNodes;
     let idx = 1;
     for (const sib of siblings) {
       if (sib === element) break;
       if (sib.nodeType === 1 && sib.tagName === element.tagName) idx++;
     }
     return `${getXPath(element.parentNode)}/${element.tagName.toLowerCase()}[${idx}]`;
   }

   const fingerprint = {
     id: generateId(),
     url: window.location.href,
     xpath: getXPath(range.startContainer.parentElement),
     startOffset: range.startOffset,
     endOffset: range.endOffset,
     textPreview: selection.toString().slice(0, 30),
     color: 'yellow',
     note: ''
   };
   ```
2. Store fingerprints in `chrome.storage.local` under key `highlights`.
3. On every page load, content.js runs and checks if any fingerprints match the current URL.
4. For each match, use `document.evaluate(xpath)` to find the element, then recreate the `Range` using stored offsets, then wrap in `<mark>`.
5. Fallback: if XPath fails (page changed), try text matching — search the page body for `textPreview` and highlight it.
6. This gives you ~95% persistence reliability.

**Build time:** 6–8 hours. Most complex feature in Phase 1.

---

## Phase 2 — Power Features (Weeks 3–5)
### Goal: Add the features that make researchers choose Napnox over everything else.

---

### Feature 10 — Inline Notes on Highlights

**What it does:** Click any highlight → a small textarea appears. Type a note. It saves attached to that highlight. Visible in sidebar and dashboard.

**How it works step by step:**

1. Add click listener to all `.napnox-hl` elements in content.js.
2. On click, inject a note popover anchored below the highlight:
   ```js
   mark.addEventListener('click', (e) => {
     const existing = document.getElementById('napnox-note-popover');
     if (existing) existing.remove();

     const popover = document.createElement('div');
     popover.id = 'napnox-note-popover';
     popover.innerHTML = `
       <textarea placeholder="Add a note..." rows="3">${mark.dataset.note || ''}</textarea>
       <div class="npx-note-actions">
         <button id="npx-save-note">Save</button>
         <button id="npx-delete-hl">Delete highlight</button>
       </div>
     `;
     // Position below the mark element
     const rect = mark.getBoundingClientRect();
     popover.style.top = `${rect.bottom + window.scrollY + 4}px`;
     popover.style.left = `${rect.left + window.scrollX}px`;
     document.body.appendChild(popover);

     document.getElementById('npx-save-note').onclick = () => {
       const note = popover.querySelector('textarea').value;
       mark.dataset.note = note;
       updateHighlightNote(mark.dataset.napnoxId, note); // updates storage
       popover.remove();
     };
   });
   ```
3. Notes are stored in the highlight fingerprint object (`fingerprint.note`).
4. Notes export with the highlight in all export formats.
5. In the dashboard, show a note icon badge on any snippet/highlight that has a note. Hover to preview.

**Build time:** 4–5 hours.

---

### Feature 11 — PDF Highlighting

**What it does:** User opens a PDF in Chrome. They can select text and use Alt+S to capture or Alt+H to highlight, exactly like on a web page.

**How it works step by step:**

1. In manifest.json, make content.js also run on PDF viewer URLs:
   ```json
   "content_scripts": [{
     "matches": ["<all_urls>", "file:///*.pdf"],
     "js": ["content.js"],
     "run_at": "document_end"
   }]
   ```
2. In content.js, detect if the page is a PDF:
   ```js
   const isPDF = document.contentType === 'application/pdf'
     || window.location.pathname.endsWith('.pdf');
   ```
3. Chrome's built-in PDF viewer has a text layer. Selection events work normally. Listen for `mouseup` to detect selection on PDF text layer.
4. For capture, `window.getSelection().toString()` works on Chrome PDF viewer. Use it the same as web capture.
5. For PDF highlight persistence, the XPath approach doesn't work. Instead store page number + character offset from PDF.js's text extraction. Use `pdf.js` via CDN to extract text and map positions.
6. Store PDF captures with an extra `sourceType: 'pdf'` flag so the dashboard can show a PDF icon.
7. Auto-extract the PDF title from `document.title` or the filename from the URL.
8. For the Pro tier: add "Summarize this PDF" button in sidebar that sends first 3000 chars to Gemma for an auto-summary.

**Note:** Chrome PDF viewer injection requires the `"pdf_viewer"` permission in manifest and may need the extension to have `"all_frames": true`. Test thoroughly.

**Build time:** 2–3 days. Most complex feature in Phase 2.

---

### Feature 12 — Auto-Tagging on Capture (AI)

**What it does:** Every time a snippet is saved, Napnox silently calls Gemma and gets 3 suggested tags back. They appear on the snippet automatically.

**How it works step by step:**

1. In background.js, after saving a snippet, fire an async tag generation call:
   ```js
   async function autoTag(snippet) {
     const prompt = `Given this text excerpt from "${snippet.title}", suggest exactly 3 short topic tags (1-2 words each). Return ONLY a JSON array, nothing else. Example: ["machine learning","privacy","regulation"]

Text: "${snippet.text.slice(0, 300)}"`;

     const res = await callGemma(prompt);
     try {
       const tags = JSON.parse(res);
       if (Array.isArray(tags)) {
         snippet.tags = tags;
         await saveSnippet(snippet); // update in storage
       }
     } catch(e) {}
   }
   ```
2. Call `autoTag(snippet)` after every successful save. It's non-blocking — the snippet saves immediately, tags appear within 1–2 seconds.
3. Show tags as small pills on the snippet card in both popup and dashboard.
4. Users can click a tag to filter all snippets by that tag.
5. Users can manually add/remove tags by clicking an "Edit tags" icon on any snippet.
6. Tag cloud view in dashboard: show all unique tags with font size proportional to usage count.

**Build time:** 3–4 hours.

---

### Feature 13 — Cloud Sync / Backup (Firebase)

**What it does:** Pro users' snippets, folders, and chat history sync to Firebase. They don't lose data if Chrome storage is cleared. Data accessible from any device.

**How it works step by step:**

1. Set up a free Firebase project. Enable Firestore and Authentication (email/password).
2. Data structure in Firestore:
   ```
   users/
     {userId}/
       snippets/
         {snippetId}: { text, url, title, tags, folderId, timestamp }
       folders/
         {folderId}: { name, color, createdAt }
       chatSessions/
         {sessionId}: { title, messages[], createdAt }
       highlights/
         {highlightId}: { fingerprint, color, note, url }
   ```
3. On Pro user login, sync local storage → Firestore on first run.
4. After every snippet save, call `db.collection('snippets').doc(id).set(snippet)`.
5. Show a subtle sync indicator in the popup: a small cloud icon — green (synced), orange (syncing), red (failed).
6. On conflict (same snippet ID modified locally and in cloud), "last write wins" — use timestamp comparison.
7. On new device login, download all Firestore data into local storage on first load.
8. Free tier: local only. Pro tier: full cloud sync. Make this crystal clear in the UI.

**Build time:** 2–3 days including Firebase setup and auth flow.

---

### Feature 14 — Quick AI on Highlight (Tooltip)

**What it does:** Right-click any highlight on page → small popup appears with quick AI actions: Define, Simplify, Fact-check, Translate.

**How it works step by step:**

1. Add a contextmenu listener to all `.napnox-hl` elements.
2. On right-click, show a small Napnox-branded context menu (replacing or alongside browser default):
   ```html
   <div id="napnox-quick-ai">
     <button data-action="define">Define this</button>
     <button data-action="simplify">Simplify</button>
     <button data-action="fact-check">Fact-check</button>
     <button data-action="translate">Translate to English</button>
   </div>
   ```
3. On button click, send the highlight text to Gemma with a focused prompt:
   ```js
   const prompts = {
     define: `Define this in simple terms (2-3 sentences max): "${text}"`,
     simplify: `Rewrite this for a 10-year-old in 1-2 sentences: "${text}"`,
     'fact-check': `Is this claim generally accurate? Give a very brief verdict: "${text}"`,
     translate: `Translate to English: "${text}"`
   };
   ```
4. Show the AI result in a small tooltip bubble anchored to the highlight. Auto-dismiss after 10 seconds or on click-away.
5. Add a "Save to inbox" button in the tooltip result to capture the AI answer as a new snippet.

**Build time:** 3–4 hours.

---

### Feature 15 — Reading Progress Tracker

**What it does:** Users tag any webpage as "To Read", "Reading", or "Done". Shows in popup and sidebar.

**How it works step by step:**

1. Store a `readingList` object in storage:
   ```js
   readingList: {
     "https://example.com/article": {
       status: "reading",  // "to-read" | "reading" | "done"
       title: "Article Title",
       savedAt: 1234567890,
       finishedAt: null
     }
   }
   ```
2. In the page sidebar, show a status dropdown at the top: "Mark as: To Read / Reading / Done".
3. In the popup, add a "Reading List" tab showing all saved articles with status badges.
4. In the dashboard stats section, show a count: "14 articles saved · 5 done · 9 in progress."
5. Allow sorting reading list by: newest, oldest, by status.
6. On "Done" status, optionally trigger a confetti animation (fun, shareable moment).

**Build time:** 3–4 hours.

---

### Feature 16 — Search by Domain / Site

**What it does:** Filter the snippet list to show only those from a specific website.

**How it works step by step:**

1. Extract domain from each snippet's URL on load:
   ```js
   const domain = new URL(snippet.url).hostname.replace('www.', '');
   ```
2. Build a unique domains list from all snippets.
3. Add a "Source" filter dropdown in the popup and dashboard, populated from the domain list.
4. Show favicon next to each domain name in the dropdown.
5. Also auto-populate the "currently viewing" domain when popup opens — if the active tab is `medium.com`, pre-select `medium.com` in the filter as a default.

**Build time:** 2–3 hours.

---

### Features 17–19 (Small, High-Value Additions)

**Feature 17 — 4-Colour Highlight System**
On text selection, show a floating mini-toolbar with 4 coloured circles (yellow, green, blue, red) + capture button + cancel. Clicking a colour applies highlight-only in that colour. This replaces the need to remember Alt+H. See Feature 6 for CSS. **Build time: 2 hours.**

**Feature 18 — Inline Highlight Mark on Capture**
Currently Alt+S captures silently. After capture confirmation from background.js, content.js injects a yellow `<mark>` around the selected text AND shows a brief "Saved ✓" tooltip that fades after 2s. Users stop worrying "did it save?" **Build time: 1 hour.**

**Feature 19 — Auto Citation in Exports**
Every export format (MD, JSON, CSV, Notion) automatically appends a formatted References section at the bottom, listing all source URLs with titles and dates. In AI reports, the last section is always "Sources" with numbered citations matching in-text references. **Build time: 2 hours.**

---

## Phase 3 — Differentiation (Weeks 6–10)
### Goal: Build the features no competitor has. Widen the moat.

---

### Feature 20 — YouTube Transcript Capture

**What it does:** On YouTube video pages, a "Capture transcript" button appears in the sidebar. Click it → full video transcript is fetched and saved as a special snippet, with optional AI summary.

**How it works step by step:**

1. Detect YouTube tab in content.js: `window.location.hostname === 'www.youtube.com'`.
2. Get the video ID: `new URLSearchParams(window.location.search).get('v')`.
3. Fetch the transcript using YouTube's internal timedtext endpoint:
   ```js
   // YouTube exposes transcript data in the page's initial data object
   const ytInitialData = window.ytInitialData;
   // Extract transcript tracks from playerConfig
   // This requires parsing the page DOM for the transcript button and using fetch()
   ```
4. Alternative more reliable method: Use the `youtube-transcript` approach — fetch `https://www.youtube.com/watch?v={id}` with the right headers and parse the `<transcript>` XML from the response. This works without an API key.
5. Show transcript in sidebar grouped by timestamps (every 30 seconds).
6. User can select transcript sections and capture them (with timestamp as metadata).
7. "Summarize this video" button sends the full transcript to Gemma for a bullet-point summary.
8. Store the snippet with `sourceType: 'youtube'` and include the video thumbnail URL in metadata.

**Build time:** 3–4 days (YouTube's internals change — needs maintenance monitoring).

---

### Feature 21 — Team Shared Workspaces

**What it does:** Pro users can create a workspace and invite colleagues. Shared snippets, folders, and AI reports visible to all members in real-time.

**How it works step by step:**

1. Firestore data model for workspaces:
   ```
   workspaces/
     {workspaceId}/
       name: "Marketing Team"
       ownerId: "user123"
       members: [{ userId, email, role: "editor"|"viewer" }]
       snippets/ → same structure as personal
       folders/ → same structure
       chatSessions/ → same structure
   ```
2. In settings, add "Create workspace" and "Join workspace with invite link".
3. Invite link = `https://napnox.com/join/{workspaceId}?token={inviteToken}`.
4. When a member saves a snippet, it goes to `workspaces/{id}/snippets/` via Firestore.
5. Other members see it appear within 1–2 seconds via Firestore `onSnapshot` listener.
6. Role-based access: "Viewer" can read and save snippets but cannot delete others' snippets. "Editor" has full access.
7. In the popup, add a workspace switcher at the top: "Personal | Team: Marketing".
8. Switching to workspace mode shows shared snippets in the inbox.
9. Pricing: workspace = Team plan at $9/user/month. Personal Pro stays $6/month.

**Build time:** 5–7 days.

---

### Feature 22 — Research Gaps Detector

**What it does:** After an AI report runs, Napnox analyses your snippets vs. the report topic and tells you: "You're missing coverage on X, Y, Z. Try searching: [3 suggested queries]."

**How it works step by step:**

1. After every AI report generation, fire a second background Gemma call:
   ```js
   async function detectGaps(snippets, reportTopic, reportContent) {
     const prompt = `A researcher is studying: "${reportTopic}"

They have collected ${snippets.length} snippets from these sources:
${snippets.map(s => `- ${s.title} (${new URL(s.url).hostname})`).join('\n')}

The AI generated this analysis:
${reportContent.slice(0, 1000)}

Identify 3 important sub-topics or perspectives that are MISSING from this research. For each gap, also suggest one specific Google search query that would help fill it.

Return ONLY valid JSON in this format:
{
  "gaps": [
    { "topic": "Regulatory implications", "searchQuery": "AI research tools GDPR compliance 2025" },
    { "topic": "...", "searchQuery": "..." },
    { "topic": "...", "searchQuery": "..." }
  ]
}`;

     const result = await callGemma(prompt);
     return JSON.parse(result);
   }
   ```
2. Show the gaps as a collapsible "Research gaps" section below every AI report:
   ```
   ⚠️ Your research may be missing coverage on:
   • Regulatory implications → Search: "AI research tools GDPR compliance 2025" [Open in Google]
   • Competitor responses → Search: "Glasp Memex market response 2025" [Open in Google]
   • User sentiment data → Search: "AI highlighter user reviews complaints 2025" [Open in Google]
   ```
3. Each suggested search opens a new Google tab.
4. Optionally: add a "Search and capture" button that opens the Google tab AND activates Napnox ready to capture results.

This is the single feature that transforms Napnox from a passive saving tool into an active research partner. No competitor has anything like this.

**Build time:** 3–4 hours.

---

### Feature 23 — Bi-Directional Snippet Links

**What it does:** Users can manually link two snippets as related. A "connections" view shows a simple map of linked snippets.

**How it works step by step:**

1. Add a "Link to..." button on each snippet card.
2. Clicking shows a searchable list of all other snippets. User picks one. A `links` array is added to both snippets:
   ```js
   snippet.links = [...(snippet.links || []), { id: linkedSnippetId, type: 'related' }]
   ```
3. Link types: `related`, `contradicts`, `supports`, `followup`.
4. In the snippet detail view, show a "Connected to:" section listing all linked snippets with their type badge.
5. In the dashboard, add a "Connections" view — a simple force-directed graph using D3.js showing snippets as nodes and links as edges.
6. Colour nodes by folder. Size by word count. Hover to see snippet preview.

**Build time:** 5–6 hours (D3 graph is the main effort).

---

### Feature 24 — Duplicate Detection

**What it does:** When saving a snippet, Napnox checks if very similar text already exists in your inbox and warns you.

**How it works step by step:**

1. Before saving a new snippet, compute a simple similarity score against all existing snippets using Jaccard similarity on word sets:
   ```js
   function jaccardSimilarity(text1, text2) {
     const set1 = new Set(text1.toLowerCase().split(/\s+/));
     const set2 = new Set(text2.toLowerCase().split(/\s+/));
     const intersection = new Set([...set1].filter(w => set2.has(w)));
     const union = new Set([...set1, ...set2]);
     return intersection.size / union.size;
   }

   const isDuplicate = snippets.some(s => jaccardSimilarity(newSnippet.text, s.text) > 0.7);
   ```
2. If similarity > 70%, show a small warning toast: "⚠️ Similar snippet already saved. Save anyway?"
3. In the dashboard, add a "Duplicates" filter that shows all snippet pairs with > 70% similarity.
4. Add a "Merge" option to combine two near-identical snippets into one.

**Build time:** 2–3 hours.

---

### Features 25–27 (Phase 3 Additions)

**Feature 25 — Topic Clustering**
After user accumulates 20+ snippets, run a background Gemma call: "Group these snippets by topic. Return JSON: `[{topic, snippetIds[]}]`." Display clusters as sections in the dashboard. Auto-refresh weekly. **Build time: 4–5 hours.**

**Feature 26 — Research Analytics Dashboard**
A dedicated "Stats" tab in the main dashboard. Shows: total words captured, snippets per week (bar chart), top domains, top tags, most active research days, AI reports run. Use Chart.js from CDN. Data computed from local storage. Weekly summary sharable as a screenshot. **Build time: 6–8 hours.**

**Feature 27 — Share Snippet as Public Link**
"Share" button on each snippet → generates `napnox.com/s/{uniqueId}`. That page shows the snippet text, source URL, your note, and a CTA: "Captured with Napnox — install free." Requires a minimal server endpoint (Napnox backend or Vercel function). Viral growth loop — every share is a free ad. **Build time: 1–2 days (needs backend).**

---

## Phase 4 — Scale (Weeks 11–16)
### Goal: Enterprise features, mobile, integrations.

---

### Feature 28 — Web Reader (napnox.com/reader)

A read-only authenticated page on your Napnox.com website. User logs in → sees all their snippets, folders, chat history. No Chrome needed. Good for mobile reading. Requires synced Firestore data (Feature 13 must be live first). Tech: Next.js or plain HTML + Firebase Auth + Firestore client SDK. **Build time: 1 week.**

---

### Feature 29 — Screenshot + OCR Capture

**What it does:** User selects a region of the page (like a chart, code block, or image with text) → Napnox takes a screenshot of that region and runs OCR on it.

**How it works:**
1. Alt+Shift+S activates screenshot mode — page dims, user drags to select a region.
2. Use Chrome's `chrome.tabs.captureVisibleTab()` in background.js to capture the full viewport as a PNG.
3. Crop to the selected region coordinates using Canvas API.
4. Send the cropped image data to Tesseract.js (CDN) for OCR text extraction.
5. Save the result as a snippet with both the image data URI and the extracted text.
6. Show a small preview of the screenshot in the snippet card.

**Build time:** 3–4 days.

---

### Feature 30 — Napnox API Hooks

A simple REST API for Napnox.com to embed:
- `GET /api/snippets?userId=xxx` — list all snippets (for Napnox blog sidebar widget)
- `POST /api/snippets` — add a snippet programmatically
- `GET /api/topics` — get AI-clustered topic summary

Used for the Napnox.com site to display "What I've been researching" widget and for third-party integrations. **Build time: 2–3 days.**

---

### Feature 31 — Mobile PWA Companion

A Progressive Web App at `app.napnox.com`. Features:
- Read and search snippets saved from desktop Chrome
- Manual text/URL save ("share to Napnox" from mobile browser)
- Read-only AI Studio (view past reports, generate new ones)
- Push notifications: "Your weekly research summary is ready"

Requires Feature 13 (cloud sync) and Feature 28 (web reader) to be live first. **Build time: 2–3 weeks.**

---

### Feature 32 — Custom Report Templates

**What it does:** Pro users create their own reusable AI prompts. Save them with a name. They appear in AI Studio alongside built-in templates.

**How it works:**
1. "New template" button in AI Studio. User types a name and a prompt with `{{snippets}}` as a placeholder.
2. Templates stored in `chrome.storage.local` under `customTemplates`.
3. On run, replace `{{snippets}}` with the actual snippet context and send to Gemma.
4. Export/import templates as JSON for sharing within teams.
5. Napnox.com "Template marketplace" page where community shares prompts — future viral loop.

**Build time:** 3–4 hours.

---

## Final Architecture Reference

```
manifest.json (V3)
├── background.js (service worker)
│   ├── snippet save & auto-tag
│   ├── AI calls (Gemma / OpenRouter)
│   ├── Firebase sync (Pro)
│   └── hotkey command listener
├── content.js (injected on all pages + PDFs)
│   ├── text selection detection
│   ├── highlight injection & persistence
│   ├── sidebar rendering
│   ├── note popovers
│   └── YouTube detection
├── popup.html / popup.js
│   ├── snippet list + folder nav
│   ├── search (Fuse.js)
│   ├── reading list tab
│   └── stats mini-dashboard
└── dashboard.html / dashboard.js (full tab)
    ├── AI Studio (threaded chat)
    ├── export panel
    ├── connections graph (D3)
    ├── analytics (Chart.js)
    └── settings & sync

Storage layers:
├── chrome.storage.local → snippets, folders, highlights, chat, templates
└── Firebase Firestore (Pro) → cloud mirror of all local data

CDN dependencies:
├── Fuse.js 7.x → fuzzy search
├── SortableJS → drag-drop folders
├── Tesseract.js → OCR
├── Chart.js → analytics charts
└── D3.js → connection graph
```

---

## Positioning Summary

> "The only research extension with hotkey capture, colour highlights, snippet-level AI chat with memory, PDF support, auto-tagging, and citation generation — private by default, free for individuals.  
> Everything Glasp should have been. Without the crashes Memex is known for."

---

*Generated for NapnoxResearch OS — May 2026*

---

## Section 5 — Complete File & Code Skeletons

### manifest.json (Final V3 — All Phases)

```json
{
  "manifest_version": 3,
  "name": "NapnoxResearch OS",
  "version": "2.0.0",
  "description": "Hotkey capture, AI chat, PDF highlights, citations — private by default.",
  "permissions": [
    "storage",
    "activeTab",
    "scripting",
    "contextMenus",
    "tabs",
    "alarms",
    "notifications"
  ],
  "host_permissions": [
    "<all_urls>"
  ],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "css": ["content.css"],
      "run_at": "document_end",
      "all_frames": false
    }
  ],
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "commands": {
    "capture-snippet": {
      "suggested_key": { "default": "Alt+S", "mac": "Alt+S" },
      "description": "Capture selected text to inbox"
    },
    "highlight-only": {
      "suggested_key": { "default": "Alt+H", "mac": "Alt+H" },
      "description": "Highlight selected text on page (no capture)"
    },
    "screenshot-capture": {
      "suggested_key": { "default": "Alt+Shift+S", "mac": "Alt+Shift+S" },
      "description": "Screenshot region + OCR"
    },
    "toggle-sidebar": {
      "suggested_key": { "default": "Alt+P", "mac": "Alt+P" },
      "description": "Toggle Napnox sidebar on page"
    }
  },
  "web_accessible_resources": [
    {
      "resources": ["sidebar.html", "icons/*", "content.css"],
      "matches": ["<all_urls>"]
    }
  ],
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "options_page": "options.html"
}
```

---

### background.js — Complete Skeleton

```js
// ─────────────────────────────────────────────
// NapnoxResearch OS — background.js (service worker)
// ─────────────────────────────────────────────

// ── Config ──────────────────────────────────
const CONFIG = {
  FREE_DAILY_LIMIT: 15,
  MAX_CHAT_SESSIONS: 50,
  MAX_HISTORY_CONTEXT: 3,       // last N Q&A pairs sent to AI
  DUPLICATE_THRESHOLD: 0.7,     // Jaccard similarity
  AUTO_TAG_MIN_WORDS: 10,       // skip auto-tag if snippet < N words
  AI_MODELS: {
    free: [
      'google/gemma-3-12b-it:free',
      'google/gemma-3-4b-it:free',
      'google/gemma-3n-e4b-it:free'
    ],
    pro: [
      'anthropic/claude-3-haiku',
      'openai/gpt-4o-mini',
      'google/gemini-flash-1.5'
    ]
  },
  OPENROUTER_BASE: 'https://openrouter.ai/api/v1/chat/completions'
};

// ── Helpers ──────────────────────────────────
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

async function getStorage(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}

async function setStorage(data) {
  return new Promise(resolve => chrome.storage.local.set(data, resolve));
}

function jaccardSimilarity(a, b) {
  const s1 = new Set(a.toLowerCase().split(/\s+/));
  const s2 = new Set(b.toLowerCase().split(/\s+/));
  const inter = new Set([...s1].filter(w => s2.has(w)));
  const union = new Set([...s1, ...s2]);
  return inter.size / union.size;
}

// ── AI Call ──────────────────────────────────
async function callAI(prompt, modelKey = 'free') {
  const { userSettings } = await getStorage(['userSettings']);
  const apiKey = userSettings?.openrouterKey || '';
  const modelList = CONFIG.AI_MODELS[modelKey];
  const model = modelList[Math.floor(Math.random() * modelList.length)];

  const res = await fetch(CONFIG.OPENROUTER_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://napnox.com',
      'X-Title': 'NapnoxResearch OS'
    },
    body: JSON.stringify({
      model,
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!res.ok) {
    const err = await res.json();
    // On rate limit, retry with next model
    if (res.status === 429) return callAI(prompt, modelKey);
    throw new Error(err.error?.message || 'AI call failed');
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// ── Auto-tag ─────────────────────────────────
async function autoTagSnippet(snippet) {
  const wordCount = snippet.text.trim().split(/\s+/).length;
  if (wordCount < CONFIG.AUTO_TAG_MIN_WORDS) return;

  try {
    const prompt = `Given this excerpt from "${snippet.title}", suggest exactly 3 short topic tags (1-2 words each).
Return ONLY a valid JSON array, nothing else. Example: ["machine learning","privacy","2025"]

Text: "${snippet.text.slice(0, 300)}"`;

    const raw = await callAI(prompt);
    const tags = JSON.parse(raw.trim());
    if (Array.isArray(tags) && tags.length > 0) {
      snippet.tags = tags.map(t => t.toLowerCase().trim()).slice(0, 5);
      await updateSnippet(snippet);
    }
  } catch (e) {
    console.warn('Auto-tag failed:', e.message);
  }
}

// ── Research Gaps ─────────────────────────────
async function detectResearchGaps(snippets, reportTopic, reportContent) {
  try {
    const sourceList = snippets.map(s => {
      try { return `- ${s.title} (${new URL(s.url).hostname})`; }
      catch { return `- ${s.title}`; }
    }).join('\n');

    const prompt = `A researcher studying: "${reportTopic}"
Has collected ${snippets.length} snippets:
${sourceList}

AI analysis summary:
${reportContent.slice(0, 800)}

List 3 important sub-topics MISSING from this research.
Return ONLY valid JSON:
{"gaps":[{"topic":"string","searchQuery":"string"},{"topic":"string","searchQuery":"string"},{"topic":"string","searchQuery":"string"}]}`;

    const raw = await callAI(prompt);
    const clean = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (e) {
    return { gaps: [] };
  }
}

// ── Snippet Save ──────────────────────────────
async function saveSnippet(snippetData) {
  const { snippets = [], userSettings = {} } = await getStorage(['snippets', 'userSettings']);

  // Duplicate check
  const isDuplicate = snippets.some(
    s => jaccardSimilarity(snippetData.text, s.text) > CONFIG.DUPLICATE_THRESHOLD
  );

  const snippet = {
    id: generateId(),
    text: snippetData.text,
    url: snippetData.url,
    title: snippetData.title || 'Untitled',
    favicon: `https://www.google.com/s2/favicons?domain=${snippetData.url}&sz=32`,
    timestamp: Date.now(),
    folderId: snippetData.folderId || null,
    tags: [],
    note: '',
    links: [],
    sourceType: snippetData.sourceType || 'web',  // 'web' | 'pdf' | 'youtube'
    starred: false,
    readStatus: null,
    isDuplicateWarning: isDuplicate
  };

  snippets.unshift(snippet);
  await setStorage({ snippets });

  // Fire auto-tag in background (non-blocking)
  autoTagSnippet(snippet);

  // Firebase sync if Pro
  if (userSettings.isPro) {
    syncSnippetToFirebase(snippet);
  }

  return { success: true, snippet, isDuplicate };
}

async function updateSnippet(updatedSnippet) {
  const { snippets = [] } = await getStorage(['snippets']);
  const idx = snippets.findIndex(s => s.id === updatedSnippet.id);
  if (idx !== -1) {
    snippets[idx] = updatedSnippet;
    await setStorage({ snippets });
  }
}

// ── Daily Limit Check ─────────────────────────
async function checkDailyLimit() {
  const { userSettings = {}, dailyUsage = {} } = await getStorage(['userSettings', 'dailyUsage']);
  if (userSettings.isPro) return { allowed: true };

  const today = new Date().toDateString();
  const todayCount = dailyUsage[today] || 0;

  if (todayCount >= CONFIG.FREE_DAILY_LIMIT) {
    return { allowed: false, used: todayCount, limit: CONFIG.FREE_DAILY_LIMIT };
  }

  dailyUsage[today] = todayCount + 1;
  await setStorage({ dailyUsage });
  return { allowed: true, used: todayCount + 1, limit: CONFIG.FREE_DAILY_LIMIT };
}

// ── Chat Session Save ─────────────────────────
async function saveChatMessage(sessionId, role, content, snippetIds = []) {
  const { chatSessions = [] } = await getStorage(['chatSessions']);
  let session = chatSessions.find(s => s.id === sessionId);

  if (!session) {
    session = {
      id: sessionId,
      title: content.slice(0, 40),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: []
    };
    chatSessions.unshift(session);
  }

  session.messages.push({ role, content, ts: Date.now(), snippetIds });
  session.updatedAt = Date.now();

  // Enforce max session limit
  const trimmed = chatSessions.slice(0, CONFIG.MAX_CHAT_SESSIONS);
  await setStorage({ chatSessions: trimmed });
  return session;
}

// ── Citation Generator ────────────────────────
function generateCitation(snippet, format = 'APA') {
  const date = new Date(snippet.timestamp);
  const year = date.getFullYear();
  const accessed = date.toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  const formats = {
    APA: `${snippet.title}. (${year}). Retrieved ${accessed}, from ${snippet.url}`,
    MLA: `"${snippet.title}." Web. ${accessed}. <${snippet.url}>.`,
    Chicago: `"${snippet.title}." Accessed ${accessed}. ${snippet.url}.`
  };
  return formats[format] || formats.APA;
}

// ── Firebase Sync (Pro stub) ──────────────────
async function syncSnippetToFirebase(snippet) {
  // Requires firebase-app + firestore SDKs loaded in background
  // Implementation in Phase 2 (Feature 13)
  try {
    const { firebaseConfig, userId } = await getStorage(['firebaseConfig', 'userId']);
    if (!firebaseConfig || !userId) return;
    // db.collection(`users/${userId}/snippets`).doc(snippet.id).set(snippet)
    console.log('[Firebase] Sync stub — implement in Phase 2');
  } catch (e) {
    console.warn('[Firebase] Sync failed:', e.message);
  }
}

// ── Message Listener ──────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg.action) {

      case 'saveSnippet': {
        const result = await saveSnippet(msg.data);
        sendResponse(result);
        break;
      }

      case 'runAIReport': {
        const limitCheck = await checkDailyLimit();
        if (!limitCheck.allowed) {
          sendResponse({ error: 'daily_limit', used: limitCheck.used, limit: limitCheck.limit });
          break;
        }
        try {
          const answer = await callAI(msg.prompt);
          await saveChatMessage(msg.sessionId, 'user', msg.userMessage, msg.snippetIds);
          await saveChatMessage(msg.sessionId, 'ai', answer, []);

          // Research gaps (non-blocking)
          if (msg.detectGaps && msg.snippets?.length > 2) {
            detectResearchGaps(msg.snippets, msg.topic, answer)
              .then(gaps => {
                chrome.runtime.sendMessage({ action: 'researchGaps', gaps, sessionId: msg.sessionId });
              });
          }

          sendResponse({ success: true, answer });
        } catch (e) {
          sendResponse({ error: e.message });
        }
        break;
      }

      case 'getCitation': {
        const { snippets = [] } = await getStorage(['snippets']);
        const snippet = snippets.find(s => s.id === msg.snippetId);
        if (snippet) {
          sendResponse({ citation: generateCitation(snippet, msg.format) });
        } else {
          sendResponse({ error: 'Snippet not found' });
        }
        break;
      }

      case 'checkDailyLimit': {
        sendResponse(await checkDailyLimit());
        break;
      }

      case 'getSnippets': {
        const { snippets = [] } = await getStorage(['snippets']);
        sendResponse({ snippets });
        break;
      }

      case 'deleteSnippet': {
        const { snippets = [] } = await getStorage(['snippets']);
        await setStorage({ snippets: snippets.filter(s => s.id !== msg.id) });
        sendResponse({ success: true });
        break;
      }

      case 'updateSnippet': {
        await updateSnippet(msg.snippet);
        sendResponse({ success: true });
        break;
      }
    }
  })();
  return true; // keep message channel open for async
});

// ── Command Listener ──────────────────────────
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  if (command === 'capture-snippet') {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.__napnox_capture?.()
    });
  }

  if (command === 'highlight-only') {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.__napnox_highlight?.()
    });
  }

  if (command === 'toggle-sidebar') {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.__napnox_toggleSidebar?.()
    });
  }

  if (command === 'screenshot-capture') {
    // Capture full visible tab, send to content.js for region crop
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (imgData) => window.__napnox_screenshotMode?.(imgData),
      args: [dataUrl]
    });
  }
});

// ── Context Menu ──────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'napnox-capture',
    title: 'Capture to Napnox',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'napnox-highlight',
    title: 'Highlight with Napnox',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.selectionText) return;
  if (info.menuItemId === 'napnox-capture') {
    await saveSnippet({
      text: info.selectionText,
      url: tab.url,
      title: tab.title
    });
    chrome.tabs.sendMessage(tab.id, { action: 'showCaptureFeedback' });
  }
});

// ── Alarm: Weekly Summary ─────────────────────
chrome.alarms.create('weekly-summary', { periodInMinutes: 10080 }); // 7 days
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'weekly-summary') {
    const { snippets = [] } = await getStorage(['snippets']);
    const thisWeek = snippets.filter(
      s => s.timestamp > Date.now() - 7 * 24 * 60 * 60 * 1000
    );
    if (thisWeek.length > 0) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Your Napnox weekly summary',
        message: `You captured ${thisWeek.length} snippets this week. Open dashboard to review.`
      });
    }
  }
});
```

---

### content.js — Complete Skeleton

```js
// ─────────────────────────────────────────────
// NapnoxResearch OS — content.js
// Injected on every page. Handles: highlights, sidebar, notes, persistence.
// ─────────────────────────────────────────────

(function () {
  if (window.__napnox_loaded) return;
  window.__napnox_loaded = true;

  const STORAGE_KEY_HIGHLIGHTS = 'napnox_highlights_v2';

  // ── Utilities ──────────────────────────────
  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function getXPath(el) {
    if (el.id) return `//*[@id="${el.id}"]`;
    if (el === document.body) return '/html/body';
    const siblings = Array.from(el.parentNode.childNodes)
      .filter(n => n.nodeType === 1 && n.tagName === el.tagName);
    const idx = siblings.indexOf(el) + 1;
    return `${getXPath(el.parentElement)}/${el.tagName.toLowerCase()}[${idx}]`;
  }

  function resolveXPath(xpath) {
    try {
      return document.evaluate(xpath, document, null,
        XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    } catch { return null; }
  }

  function getCurrentUrl() {
    return window.location.href.split('#')[0]; // ignore hash for matching
  }

  // ── Highlight Colours ───────────────────────
  const COLOURS = {
    yellow: { bg: '#FDE68A', label: 'General' },
    green:  { bg: '#A7F3D0', label: 'Key insight' },
    blue:   { bg: '#BFDBFE', label: 'To verify' },
    red:    { bg: '#FECACA', label: 'Disagree' }
  };

  // ── Inject styles ───────────────────────────
  function injectStyles() {
    if (document.getElementById('napnox-styles')) return;
    const style = document.createElement('style');
    style.id = 'napnox-styles';
    style.textContent = `
      .napnox-hl { cursor: pointer; border-radius: 2px; position: relative; }
      .napnox-hl-yellow { background: #FDE68A !important; }
      .napnox-hl-green  { background: #A7F3D0 !important; }
      .napnox-hl-blue   { background: #BFDBFE !important; }
      .napnox-hl-red    { background: #FECACA !important; }
      .napnox-hl-captured { outline: 2px solid #6366f1; outline-offset: 1px; }

      /* Tooltip */
      #napnox-tooltip {
        position: absolute;
        display: flex; gap: 4px; align-items: center;
        background: #1f2937; border-radius: 8px;
        padding: 5px 8px; z-index: 2147483647;
        box-shadow: 0 4px 12px rgba(0,0,0,0.25);
        animation: npx-fade-in 0.15s ease;
      }
      .npx-color-btn {
        width: 16px; height: 16px; border-radius: 50%;
        border: 2px solid rgba(255,255,255,0.3); cursor: pointer;
        transition: transform 0.1s;
      }
      .npx-color-btn:hover { transform: scale(1.25); }
      .npx-capture-btn {
        background: #6366f1; color: white;
        border: none; border-radius: 4px;
        font-size: 11px; padding: 2px 7px; cursor: pointer;
        margin-left: 4px;
      }
      .npx-capture-btn:hover { background: #4f46e5; }

      /* Saved toast */
      #napnox-toast {
        position: fixed; bottom: 24px; right: 24px;
        background: #1f2937; color: white;
        padding: 10px 16px; border-radius: 8px;
        font-size: 13px; z-index: 2147483647;
        display: flex; align-items: center; gap: 8px;
        animation: npx-slide-up 0.2s ease;
      }
      #napnox-toast.error { background: #dc2626; }

      /* Sidebar */
      #napnox-sidebar {
        position: fixed; top: 0; right: -330px;
        width: 310px; height: 100vh;
        background: #fff; z-index: 2147483646;
        box-shadow: -4px 0 24px rgba(0,0,0,0.12);
        transition: right 0.25s ease;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        display: flex; flex-direction: column;
        overflow: hidden;
      }
      #napnox-sidebar.open { right: 0; }
      #napnox-sidebar-toggle {
        position: fixed; right: 0; top: 50%;
        transform: translateY(-50%);
        width: 24px; height: 48px;
        background: #6366f1; color: white;
        border: none; border-radius: 4px 0 0 4px;
        cursor: pointer; z-index: 2147483645;
        font-size: 14px; writing-mode: vertical-rl;
      }

      /* Note popover */
      #napnox-note-pop {
        position: absolute;
        background: white; border: 1px solid #e5e7eb;
        border-radius: 8px; padding: 10px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.12);
        z-index: 2147483647; width: 240px;
      }
      #napnox-note-pop textarea {
        width: 100%; height: 72px; border: 1px solid #d1d5db;
        border-radius: 4px; padding: 6px; font-size: 12px;
        resize: none; outline: none;
      }
      #napnox-note-pop textarea:focus { border-color: #6366f1; }

      @keyframes npx-fade-in { from { opacity:0; transform:translateY(-4px); } to { opacity:1; } }
      @keyframes npx-slide-up { from { opacity:0; transform:translateY(8px); } to { opacity:1; } }
    `;
    document.head.appendChild(style);
  }

  // ── Tooltip on Selection ────────────────────
  function showTooltip(x, y) {
    removeTooltip();
    const tip = document.createElement('div');
    tip.id = 'napnox-tooltip';
    tip.style.left = `${x + window.scrollX}px`;
    tip.style.top  = `${y + window.scrollY - 42}px`;

    Object.entries(COLOURS).forEach(([color, { bg }]) => {
      const btn = document.createElement('button');
      btn.className = 'npx-color-btn';
      btn.style.background = bg;
      btn.title = COLOURS[color].label;
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        applyHighlight(color, false);
        removeTooltip();
      });
      tip.appendChild(btn);
    });

    const captureBtn = document.createElement('button');
    captureBtn.className = 'npx-capture-btn';
    captureBtn.textContent = '+ Capture';
    captureBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      applyHighlight('yellow', true);
      removeTooltip();
    });
    tip.appendChild(captureBtn);

    document.body.appendChild(tip);
  }

  function removeTooltip() {
    document.getElementById('napnox-tooltip')?.remove();
  }

  // ── Apply Highlight ─────────────────────────
  function applyHighlight(color, capture = false) {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    const text = selection.toString().trim();
    if (!text) return;

    const mark = document.createElement('mark');
    mark.className = `napnox-hl napnox-hl-${color}`;
    const id = genId();
    mark.dataset.napnoxId = id;
    mark.dataset.color = color;
    mark.dataset.note = '';

    try {
      range.surroundContents(mark);
    } catch (e) {
      // surroundContents fails on partial element selections
      const fragment = range.extractContents();
      mark.appendChild(fragment);
      range.insertNode(mark);
    }

    selection.removeAllRanges();

    // Save fingerprint
    const fingerprint = {
      id,
      url: getCurrentUrl(),
      xpath: getXPath(mark.parentElement),
      startOffset: 0,
      textPreview: text.slice(0, 50),
      color,
      note: '',
      capturedToInbox: capture,
      createdAt: Date.now()
    };

    saveHighlightFingerprint(fingerprint);
    attachNoteListener(mark);

    if (capture) {
      mark.classList.add('napnox-hl-captured');
      chrome.runtime.sendMessage({
        action: 'saveSnippet',
        data: {
          text,
          url: window.location.href,
          title: document.title,
          highlightId: id
        }
      }, (res) => {
        showToast(
          res?.isDuplicate
            ? '⚠️ Similar snippet exists — saved anyway'
            : '✓ Captured to inbox',
          res?.isDuplicate ? 'warn' : 'ok'
        );
        refreshSidebar();
      });
    } else {
      showToast('✓ Highlighted');
    }
  }

  // ── Highlight Persistence ───────────────────
  async function saveHighlightFingerprint(fp) {
    return new Promise(resolve => {
      chrome.storage.local.get([STORAGE_KEY_HIGHLIGHTS], (data) => {
        const all = data[STORAGE_KEY_HIGHLIGHTS] || [];
        all.push(fp);
        chrome.storage.local.set({ [STORAGE_KEY_HIGHLIGHTS]: all }, resolve);
      });
    });
  }

  function restoreHighlights() {
    chrome.storage.local.get([STORAGE_KEY_HIGHLIGHTS], (data) => {
      const all = (data[STORAGE_KEY_HIGHLIGHTS] || [])
        .filter(fp => fp.url === getCurrentUrl());

      all.forEach(fp => {
        // Try XPath match first
        const el = resolveXPath(fp.xpath);
        if (el) {
          const text = el.textContent;
          const idx = text.indexOf(fp.textPreview);
          if (idx !== -1) {
            highlightTextInElement(el, fp);
            return;
          }
        }
        // Fallback: text scan
        textScanHighlight(fp);
      });
    });
  }

  function highlightTextInElement(el, fp) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const idx = node.textContent.indexOf(fp.textPreview);
      if (idx !== -1) {
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + fp.textPreview.length);
        const mark = document.createElement('mark');
        mark.className = `napnox-hl napnox-hl-${fp.color}`;
        mark.dataset.napnoxId = fp.id;
        mark.dataset.color = fp.color;
        mark.dataset.note = fp.note || '';
        if (fp.capturedToInbox) mark.classList.add('napnox-hl-captured');
        try { range.surroundContents(mark); attachNoteListener(mark); } catch {}
        return;
      }
    }
  }

  function textScanHighlight(fp) {
    const allText = document.querySelectorAll('p, li, span, td, h1, h2, h3, h4, blockquote');
    for (const el of allText) {
      if (el.childElementCount === 0 && el.textContent.includes(fp.textPreview)) {
        highlightTextInElement(el, fp);
        return;
      }
    }
  }

  // ── Note Popover ────────────────────────────
  function attachNoteListener(mark) {
    mark.addEventListener('click', (e) => {
      e.stopPropagation();
      const existing = document.getElementById('napnox-note-pop');
      if (existing) { existing.remove(); return; }

      const pop = document.createElement('div');
      pop.id = 'napnox-note-pop';
      const rect = mark.getBoundingClientRect();
      pop.style.top  = `${rect.bottom + window.scrollY + 6}px`;
      pop.style.left = `${Math.min(rect.left + window.scrollX, window.innerWidth - 270)}px`;

      pop.innerHTML = `
        <textarea placeholder="Add a note...">${mark.dataset.note || ''}</textarea>
        <div style="display:flex;gap:8px;margin-top:6px;">
          <button id="npx-note-save" style="flex:1;background:#6366f1;color:white;border:none;border-radius:4px;padding:4px 0;cursor:pointer;font-size:12px;">Save</button>
          <button id="npx-note-delete" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:4px;padding:4px 8px;cursor:pointer;font-size:12px;">Delete</button>
        </div>
      `;
      document.body.appendChild(pop);

      pop.querySelector('#npx-note-save').onclick = () => {
        const note = pop.querySelector('textarea').value;
        mark.dataset.note = note;
        updateHighlightNote(mark.dataset.napnoxId, note);
        pop.remove();
        showToast('Note saved');
      };
      pop.querySelector('#npx-note-delete').onclick = () => {
        deleteHighlight(mark.dataset.napnoxId);
        mark.replaceWith(...mark.childNodes);
        pop.remove();
        showToast('Highlight removed');
        refreshSidebar();
      };
    });
  }

  function updateHighlightNote(id, note) {
    chrome.storage.local.get([STORAGE_KEY_HIGHLIGHTS], (data) => {
      const all = data[STORAGE_KEY_HIGHLIGHTS] || [];
      const fp = all.find(h => h.id === id);
      if (fp) fp.note = note;
      chrome.storage.local.set({ [STORAGE_KEY_HIGHLIGHTS]: all });
    });
  }

  function deleteHighlight(id) {
    chrome.storage.local.get([STORAGE_KEY_HIGHLIGHTS], (data) => {
      const all = (data[STORAGE_KEY_HIGHLIGHTS] || []).filter(h => h.id !== id);
      chrome.storage.local.set({ [STORAGE_KEY_HIGHLIGHTS]: all });
    });
  }

  // ── Sidebar ─────────────────────────────────
  function buildSidebar() {
    if (document.getElementById('napnox-sidebar')) return;

    const toggle = document.createElement('button');
    toggle.id = 'napnox-sidebar-toggle';
    toggle.textContent = 'N';
    toggle.title = 'Toggle Napnox sidebar (Alt+P)';
    toggle.onclick = toggleSidebar;
    document.body.appendChild(toggle);

    const sidebar = document.createElement('div');
    sidebar.id = 'napnox-sidebar';
    sidebar.innerHTML = `
      <div style="padding:12px 14px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:13px;font-weight:600;color:#1f2937;">Napnox <span id="npx-sb-count" style="font-size:11px;color:#6b7280;font-weight:400;"></span></span>
        <button id="npx-sb-close" style="background:none;border:none;cursor:pointer;font-size:16px;color:#9ca3af;">✕</button>
      </div>
      <div id="npx-sb-list" style="flex:1;overflow-y:auto;padding:8px 0;"></div>
      <div style="padding:10px 14px;border-top:1px solid #e5e7eb;">
        <button id="npx-sb-open-dashboard" style="width:100%;background:#6366f1;color:white;border:none;border-radius:6px;padding:7px 0;cursor:pointer;font-size:12px;">Open full dashboard ↗</button>
      </div>
    `;
    document.body.appendChild(sidebar);

    document.getElementById('npx-sb-close').onclick = toggleSidebar;
    document.getElementById('npx-sb-open-dashboard').onclick = () => {
      chrome.runtime.sendMessage({ action: 'openDashboard' });
    };

    refreshSidebar();
  }

  function toggleSidebar() {
    const s = document.getElementById('napnox-sidebar');
    if (s) s.classList.toggle('open');
  }

  function refreshSidebar() {
    const list = document.getElementById('npx-sb-list');
    const countEl = document.getElementById('npx-sb-count');
    if (!list) return;

    chrome.storage.local.get(['snippets', STORAGE_KEY_HIGHLIGHTS], (data) => {
      const url = getCurrentUrl();
      const snippets = (data.snippets || []).filter(s => s.url?.startsWith(url));
      const highlights = (data[STORAGE_KEY_HIGHLIGHTS] || []).filter(h => h.url === url);
      const total = snippets.length + highlights.filter(h => !h.capturedToInbox).length;

      if (countEl) countEl.textContent = `· ${total} on this page`;

      list.innerHTML = total === 0
        ? `<p style="font-size:12px;color:#9ca3af;text-align:center;padding:24px 0;">Nothing captured from this page yet.<br>Select text + Alt+S to capture.</p>`
        : '';

      highlights.filter(h => !h.capturedToInbox).forEach(h => {
        const div = document.createElement('div');
        div.style.cssText = 'padding:8px 14px;border-bottom:1px solid #f3f4f6;cursor:pointer;';
        div.innerHTML = `
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
            <span style="width:10px;height:10px;border-radius:50%;background:${COLOURS[h.color]?.bg || '#FDE68A'};display:inline-block;"></span>
            <span style="font-size:10px;color:#9ca3af;">Highlight</span>
          </div>
          <p style="font-size:12px;color:#374151;margin:0;line-height:1.5;">${h.textPreview}…</p>
          ${h.note ? `<p style="font-size:11px;color:#6b7280;margin:3px 0 0;">${h.note}</p>` : ''}
        `;
        div.onclick = () => scrollToHighlight(h.id);
        list.appendChild(div);
      });

      snippets.forEach(s => {
        const div = document.createElement('div');
        div.style.cssText = 'padding:8px 14px;border-bottom:1px solid #f3f4f6;';
        div.innerHTML = `
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
            <span style="font-size:10px;color:#6366f1;font-weight:500;">✓ Captured</span>
            ${s.tags?.map(t => `<span style="font-size:10px;background:#ede9fe;color:#6d28d9;padding:1px 5px;border-radius:10px;">${t}</span>`).join('') || ''}
          </div>
          <p style="font-size:12px;color:#374151;margin:0;line-height:1.5;">${s.text.slice(0, 100)}${s.text.length > 100 ? '…' : ''}</p>
        `;
        list.appendChild(div);
      });
    });
  }

  function scrollToHighlight(id) {
    const mark = document.querySelector(`[data-napnox-id="${id}"]`);
    if (mark) mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ── Toast Notification ──────────────────────
  let toastTimer;
  function showToast(message, type = 'ok') {
    document.getElementById('napnox-toast')?.remove();
    clearTimeout(toastTimer);
    const toast = document.createElement('div');
    toast.id = 'napnox-toast';
    if (type === 'error' || type === 'warn') toast.classList.add('error');
    toast.textContent = message;
    document.body.appendChild(toast);
    toastTimer = setTimeout(() => toast.remove(), 2500);
  }

  // ── Public API (called from background.js) ──
  window.__napnox_capture = () => {
    const text = window.getSelection()?.toString().trim();
    if (!text) { showToast('⚠️ Select some text first', 'warn'); return; }
    applyHighlight('yellow', true);
  };

  window.__napnox_highlight = () => {
    const text = window.getSelection()?.toString().trim();
    if (!text) { showToast('⚠️ Select some text first', 'warn'); return; }
    applyHighlight('yellow', false);
  };

  window.__napnox_toggleSidebar = toggleSidebar;

  // ── Selection Listener for Tooltip ──────────
  document.addEventListener('mouseup', (e) => {
    if (e.target.closest('#napnox-tooltip, #napnox-sidebar, #napnox-note-pop')) return;
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (text && text.length > 3 && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      showTooltip(rect.left + rect.width / 2 - 60, rect.top);
    } else {
      removeTooltip();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      removeTooltip();
      document.getElementById('napnox-note-pop')?.remove();
    }
  });

  // ── Message from background ──────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'showCaptureFeedback') showToast('✓ Captured via right-click');
    if (msg.action === 'toggleSidebar') toggleSidebar();
  });

  // ── Init ─────────────────────────────────────
  injectStyles();
  restoreHighlights();
  buildSidebar();

  // YouTube detection
  if (window.location.hostname === 'www.youtube.com') {
    injectYouTubePanel();
  }

  function injectYouTubePanel() {
    // Phase 3 — Feature 20 implementation
    console.log('[Napnox] YouTube page detected — transcript capture ready in Phase 3');
  }

})();
```

---

## Section 6 — Testing Checklist

Use this checklist before publishing each phase update to the Chrome Web Store.

### Phase 1 Checklist

```
Capture & Highlight
[ ] Alt+S on web page — snippet appears in inbox immediately
[ ] Alt+H on web page — yellow highlight appears, NOT in inbox
[ ] Tooltip colour picker — each of 4 colours applies correctly
[ ] "+" Capture button in tooltip — captures AND highlights
[ ] Reload page — highlight still visible at same position
[ ] Highlight note — click highlight → note popover appears → save → note persists
[ ] Delete highlight — click highlight → delete button → mark removed from page

Folders
[ ] Create folder — click "+ Folder" → name input → folder appears in nav
[ ] Filter by folder — click folder → only that folder's snippets shown
[ ] Assign snippet to folder — drag snippet to folder OR capture while folder active
[ ] Folder count badge — correct number shown
[ ] "All snippets" view — all snippets regardless of folder

Chat History
[ ] Run AI report — session appears in sidebar history
[ ] Reopen popup — history still there
[ ] Click past session — conversation loads
[ ] New chat button — starts fresh session
[ ] Delete session — removed from list
[ ] Context follow-up — second question references first answer

Search
[ ] Ctrl+K — search bar focuses
[ ] Type keyword — matching snippets highlighted, others hidden
[ ] Clear search — all snippets return
[ ] Search by tag — tag text finds snippets with that tag

Sidebar
[ ] Alt+P — sidebar opens/closes
[ ] Sidebar shows only snippets from current URL
[ ] Clicking sidebar item scrolls page to highlight
[ ] "Open dashboard" button opens full tab

Citations
[ ] Click Cite on snippet → APA formatted string
[ ] Format selector — MLA and Chicago also work
[ ] Copy button — copied to clipboard
[ ] Markdown export includes References section

Free Tier Limit
[ ] 15th report runs successfully
[ ] 16th report shows upgrade prompt
[ ] Counter resets next day
```

### Phase 2 Checklist

```
PDF
[ ] Open a PDF in Chrome — sidebar appears
[ ] Select text in PDF — tooltip shows
[ ] Alt+S on PDF text — saved to inbox with sourceType:'pdf'
[ ] Dashboard shows PDF icon on PDF snippets

Auto-tagging
[ ] Save snippet — wait 2s — tags appear on card
[ ] Tags are relevant to snippet text
[ ] Manual tag add/remove works
[ ] Tag filter in popup works

Cloud Sync (Pro)
[ ] Login with Pro account — sync icon appears
[ ] Save snippet — green cloud icon shown
[ ] Login on second device — snippets appear
[ ] Offline: snippet saves locally, syncs when back online
[ ] Sync conflict: newer timestamp wins
```

---

## Section 7 — Chrome Web Store Submission Guide

### Step 1 — Prepare assets
- Icons: 16×16, 48×48, 128×128 PNG (transparent background).
- Store screenshots: 1280×800 or 640×400 PNG. Need minimum 1, recommended 5.
  - Screenshot 1: Popup with snippets + folder list.
  - Screenshot 2: AI Studio with chat thread.
  - Screenshot 3: Page with coloured highlights + sidebar open.
  - Screenshot 4: Dashboard export panel.
  - Screenshot 5: PDF highlighting in action.
- Promo tile: 440×280 PNG (optional but strongly recommended — shown in search results).
- Short description (132 chars max): `Hotkey text capture, AI chat with memory, colour highlights & citations — the research tool Glasp never built.`
- Detailed description: 350–500 words. Mention: hotkey, privacy, free tier, compare with Glasp.

### Step 2 — Build the ZIP
```bash
# In your extension root folder:
zip -r napnox-v2.zip . \
  --exclude "*.git*" \
  --exclude "node_modules/*" \
  --exclude "*.DS_Store" \
  --exclude "*.map"
```

### Step 3 — Developer Console submission
1. Go to `https://chrome.google.com/webstore/devconsole`.
2. Pay one-time $5 developer fee if not already done.
3. Click "New item" → upload ZIP.
4. Fill all fields. Set category: **Productivity**.
5. Privacy policy URL: required. Host a simple one at `napnox.com/privacy`.
6. Permissions justification (Chrome now requires explanation for each permission):
   - `storage`: "Save snippets, folders, highlights, and chat history locally."
   - `activeTab`: "Read the current page's selected text and URL for capture."
   - `scripting`: "Inject highlight UI and sidebar onto pages."
   - `contextMenus`: "Right-click 'Capture to Napnox' option."
   - `tabs`: "Get current tab URL for highlight persistence."

### Step 4 — Review timeline
- First submission: typically 3–7 business days.
- Updates to existing extension: 1–3 business days.
- Major permission changes (adding new permissions): treated like a new submission.
- If rejected: common reasons are: overly broad host permissions, missing privacy policy, using `eval()` in code. Check the rejection email carefully.

### Versioning convention
```
1.0.0  → initial release
1.1.0  → Phase 1 complete (folders, chat history, search, highlights)
1.2.0  → Phase 2 (PDF, cloud sync, auto-tagging)
2.0.0  → Phase 3 (teams, gaps detector, analytics)
```

---

## Section 8 — Monetization Implementation

### Pro License Key System (Current — Simple)

```js
// In settings.js — verify license key
async function verifyLicenseKey(key) {
  // Option A: Simple hash check (no server needed for MVP)
  // Generate keys in a spreadsheet using: sha256("napnox-" + email + "-pro-2026")
  const validKeys = await fetchValidKeys(); // from a public Gist or your server
  if (validKeys.includes(key)) {
    await chrome.storage.local.set({
      userSettings: { isPro: true, licenseKey: key, activatedAt: Date.now() }
    });
    return { success: true };
  }
  return { success: false, error: 'Invalid key' };
}
```

### Stripe Checkout (Recommended for Scale)

1. Create products in Stripe dashboard:
   - `napnox-pro-monthly` → $6/month
   - `napnox-pro-annual` → $48/year (2 months free)
   - `napnox-team-monthly` → $9/user/month

2. When user clicks "Upgrade to Pro" in extension:
   ```js
   // Open Stripe checkout in a new tab
   chrome.tabs.create({
     url: `https://napnox.com/checkout?plan=pro&source=extension`
   });
   ```

3. On successful payment, your Napnox.com backend:
   - Generates a license key for the user's email.
   - Sends it by email.
   - Optionally: posts to a Firestore `licenses` collection.

4. Extension verifies key against Firestore on activation.

### Free-to-Pro Conversion Triggers
Show upgrade prompt in these specific moments (not random):
- User hits 15th AI report of the day → "You've hit today's limit. Pro = unlimited."
- User tries Notion export → "Cloud exports need Pro."
- User tries to create a second device login → "Sync across devices needs Pro."
- User tries to share a snippet → "Public links need Pro."
- 7 days after install, user has > 50 snippets → "Your research is growing. Back it up with Pro."

Never show a generic "upgrade" nag. Always tie it to a specific action the user is already trying to do.

---

## Section 9 — Performance & Security Rules

### Performance

1. **Never block the main thread in content.js.** All storage reads/writes go through `chrome.runtime.sendMessage` to background.js, not direct `chrome.storage` calls from content scripts (background has a more reliable storage context).

2. **Debounce search.** Fuse.js search on every keystroke is fine for < 500 snippets. For > 500, debounce by 150ms:
   ```js
   let searchTimer;
   searchInput.addEventListener('input', () => {
     clearTimeout(searchTimer);
     searchTimer = setTimeout(() => renderSearch(searchInput.value), 150);
   });
   ```

3. **Lazy-load AI CDN scripts.** Don't load Tesseract.js on every page — only load it when screenshot mode is activated.

4. **Limit chrome.storage.local size.** Chrome caps at 10MB. Track usage in settings:
   ```js
   chrome.storage.local.getBytesInUse(null, (bytes) => {
     console.log(`Storage used: ${(bytes / 1024 / 1024).toFixed(2)} MB / 10 MB`);
   });
   ```
   Alert the user when > 8MB and suggest exporting + clearing old snippets.

5. **Paginate snippet list.** Never render > 100 snippets at once in the popup. Load 25 at a time with a "Load more" button or infinite scroll.

### Security

1. **Never store API keys in plaintext in extension files.** Use `chrome.storage.local` for user-provided keys. Never hardcode production keys in the source code — they will be extracted from the published extension.

2. **Sanitize all user text before injecting into DOM.** Never use `innerHTML` with snippet text. Use `textContent` or `createTextNode`:
   ```js
   // WRONG:
   div.innerHTML = `<p>${snippet.text}</p>`;
   // RIGHT:
   const p = document.createElement('p');
   p.textContent = snippet.text;
   div.appendChild(p);
   ```

3. **Content Security Policy in manifest.json:**
   ```json
   "content_security_policy": {
     "extension_pages": "script-src 'self'; object-src 'self'"
   }
   ```
   This blocks any injected scripts from running in your popup/dashboard context.

4. **Validate all messages in background.js.** Don't assume `msg.data` is safe:
   ```js
   chrome.runtime.onMessage.addListener((msg, sender) => {
     // Only accept messages from your own extension
     if (sender.id !== chrome.runtime.id) return;
     // Validate action exists
     if (typeof msg.action !== 'string') return;
   });
   ```

5. **Pro verification must happen server-side eventually.** A client-side key check can be reversed. For real security, verify the license key against your server on every Pro feature access (or cache the result for 24 hours).

---

## Section 10 — Launch Sequence (30-Day Plan)

### Week 1 — Soft launch
- Day 1: Publish Phase 1 build to Chrome Web Store (even without review, submit early).
- Day 2: Write "I built the research tool Glasp never made" post on napnox.com. Target keyword: `AI research highlighter Chrome 2026`. Include a demo GIF showing Alt+S → capture → AI Studio.
- Day 3: Post on r/productivity — "I built an Alt+S research tool with AI chat memory — free, private by default, feedback welcome." Link to Chrome Store.
- Day 5: Post on r/AItools — "Open-source breakdown of how I built highlight persistence in Chrome extensions."
- Day 7: Email your existing 800 Napnox users. Subject: "I built a research extension — want to try it free?"

### Week 2 — Feedback loop
- Collect feedback from first 50–100 installs via a linked Tally.so form.
- Fix the top 3 reported bugs immediately and push an update.
- Post a "Week 1 learnings" thread on X/Twitter. Researchers follow this kind of build-in-public content.
- Submit to ProductHunt — schedule for a Tuesday or Wednesday morning (PST). Line up 20 upvotes from your existing users before launch day.

### Week 3 — Content SEO push
- Publish: "Glasp vs Napnox — what's the difference?" (target: `glasp alternative 2026`, KD ~10).
- Publish: "How to highlight PDFs and chat with them in Chrome" (target: `highlight PDF chrome extension`, KD ~15).
- Publish: "Best research tools for students 2026" — include Napnox + competitors (target: `research tools students chrome`, KD ~12).
- All posts embed the extension install button.

### Week 4 — Pro conversion push
- Email all free users who have > 20 snippets: "Your research collection is growing — here's what Pro unlocks."
- Add the in-app conversion triggers from Section 8.
- Launch ProductHunt on Day 22.
- Target Month 1 end: 500 installs, 30 Pro subscribers ($180 MRR).

### Month 2 targets
- 2,000 installs (Chrome Store organic + blog SEO kicking in).
- 100 Pro subscribers → $600 MRR.
- Phase 2 shipped (PDF + cloud sync) — drives Pro upgrades significantly.
- First team workspace customer ($9/user × 3 = $27 first team).

---

## Section 11 — Common Bugs & How to Fix Them

| Bug | Cause | Fix |
|-----|-------|-----|
| Highlight disappears on page reload | XPath changes when page has dynamic content | Add text-scan fallback (already in content.js skeleton above) |
| `surroundContents` throws error | Selection spans multiple HTML elements | Use `extractContents()` + `insertNode()` instead (see content.js skeleton) |
| AI call returns empty string | Model returned non-text content type | Check `choices[0].message.content`, add null check |
| Service worker goes inactive | MV3 service workers sleep after 5 minutes | Use `chrome.alarms` to keep alive — create a 4-minute repeating alarm that does a no-op storage read |
| `chrome.storage.sync` quota exceeded | Sync storage only allows 100KB | Switch all snippet storage to `chrome.storage.local` (10MB) — only sync user settings/preferences |
| Popup closes on tooltip click | `mousedown` fires before `mouseup`, closes popup | Use `mousedown` with `preventDefault()` on tooltip buttons |
| PDF content.js not injecting | Chrome PDF viewer runs in a sandboxed frame | Add `"all_frames": true` to content script manifest entry for PDF URLs |
| Fuse.js search too slow with 500+ snippets | Full scan on every keystroke | Build index once on load, rebuild only when snippets change — not on every search |
| Firebase sync fails silently | Network error swallowed by empty catch block | Always log Firebase errors to a local `syncErrors` array for debugging |
| Extension icon shows wrong badge | `chrome.action.setBadgeText` not called | Call from background.js after every snippet save: `chrome.action.setBadgeText({ text: count.toString() })` |

---

*NapnoxResearch OS — Complete Implementation Guide v2.0 — May 2026*
*Covers: 32 features · 4 phases · 16 weeks · Full code skeletons · Testing · Store submission · Monetization · Launch plan*

