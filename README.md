# Napnox — Smart Web Clipper

> **Capture. Organize. Generate AI Reports.** A pro-grade Chrome extension for power users and researchers.

---

## ✦ Features

| Feature | Description |
|---|---|
| **Alt + S Capture** | Instant snippet capture with fly animation confirmation |
| **HTML → Markdown** | Tables, lists, bold/italic preserved via Turndown |
| **Staging Inbox Popup** | Card feed with favicon, title, 3-line preview |
| **Multi-Select & Batch** | Checkboxes + batch Star / Delete / Export / AI Report |
| **Group by Site** | Toggle to group snippets by the source domain |
| **Full Dashboard** | Open in a full Chrome tab for deep research work |
| **AI Studio** | Select snippets as context → type a prompt → get a report |
| **Export** | Markdown, JSON, CSV (Notion & Google Docs coming soon) |
| **Settings** | Gemini or OpenAI key, animation toggle, data management |

---

## 📁 File Structure

```
Extension/
├── manifest.json          # Manifest V3
├── background.js          # Service worker: storage, AI relay, export
├── content.js             # Capture logic: Alt+S, metadata, fly animation
├── content.css            # Fly toast + ghost text animations
├── popup.html             # Staging Inbox popup
├── popup.css              # Popup dark UI
├── popup.js               # Popup logic
├── dashboard.html         # Full-page Research Dashboard
├── dashboard.css          # Dashboard dark UI
├── dashboard.js           # Dashboard logic
├── lib/
│   └── turndown.js        # HTML → Markdown converter (bundled)
└── icons/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

---

## 🚀 Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `d:\Extension` folder
5. Pin the Napnox icon to your toolbar

---

## ⚡ Usage

### Capture a Snippet
1. Highlight any text on a webpage
2. Press **Alt + S** — a fly animation confirms the save
3. Or right-click → **Capture with Napnox ✦**

### View Your Inbox
- Click the Napnox extension icon
- Browse your card feed
- Click any card to open the full detail modal

### AI Reports
1. Open the Dashboard (**Alt + D** or click the grid icon in the popup)
2. Navigate to **AI Studio**
3. Select snippets as context from the left panel
4. Type a prompt (e.g. *"Summarize these into a 3-paragraph report"*)
5. Press **Ctrl + Enter** or click the send button

### Export
- From the popup: multi-select cards → batch bar → Export
- From the Dashboard: **Export** tab → choose format

---

## 🤖 AI Setup

Napnox supports two providers:

| Provider | Model | Where to get key |
|---|---|---|
| **Google Gemini** | gemini-1.5-flash | [aistudio.google.com](https://aistudio.google.com) |
| **OpenAI** | gpt-4o-mini | [platform.openai.com](https://platform.openai.com) |

Your API key is stored **locally in `chrome.storage.local`** — never sent to any Napnox server.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Alt + S` | Capture selected text |
| `Alt + D` | Open Dashboard |
| `Ctrl + K` | Focus search (in Dashboard) |
| `Ctrl + Enter` | Run AI prompt |
| `Esc` | Close modal |

> **Change shortcuts:** `chrome://extensions/shortcuts`

---

## 🗺️ Roadmap

- [x] **Phase 1** — Capture Engine (Alt+S, right-click, metadata, fly animation)
- [x] **Phase 2** — Ingestion Pipeline (Markdown, local storage, card list)
- [x] **Phase 3** — AI & Export Layer (Gemini/OpenAI, Markdown/JSON/CSV export)
- [ ] **Phase 4** — Pro Polishing (license key, Notion/Google Docs bridges)

---

## 🏗️ Architecture

```
User highlights text
       │
  Alt+S keydown (content.js)
       │
  Captures: selectionText, HTML, sourceUrl, pageTitle, favicon, timestamp
       │
  Turndown converts HTML → Markdown
       │
  chrome.runtime.sendMessage → background.js
       │
  chrome.storage.local.set  ← zero-latency, offline-first
       │
  Fly animation ← confirms in <200ms
```

---

## 📄 License

Napnox v1.0.0 — Pro Lifetime License
