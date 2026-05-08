<p align="center">
  <img src="store-assets/contextclip-logo.png" alt="ContextClip" width="400">
</p>

<p align="center">
  <strong>A visual context clipboard for AI coding agents.</strong><br>
  Drag-select any UI area, describe the issue, and paste a screenshot + structured prompt directly into Cursor, ChatGPT, or Claude.
</p>

---

## What it does

Building UI locally means constantly noticing small visual issues — spacing, overflow, wrong colours, broken cards. The usual workflow is painful: screenshot → crop → copy → paste → type context → repeat.

ContextClip replaces that with one keyboard shortcut:

1. Press **Alt+Shift+C** on any page
2. Drag a rectangle around the broken area
3. Type what needs fixing
4. Click **Copy for Cursor** — screenshot is saved to your chosen folder, prompt is copied to clipboard
5. Paste into Cursor (or any AI tool) and attach the image by path

---

## Installation

### Chrome Web Store
*(Coming soon — link will be added here)*

### Load unpacked (development)
1. Clone this repo: `git clone https://github.com/yourusername/contextclip`
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** → select the repo folder
5. The ContextClip icon appears in your toolbar

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Alt+Shift+C` | Start capture immediately (no popup) |
| `Alt+Shift+F` | Open popup |
| `Esc` | Cancel capture |

**Customize shortcuts:** `chrome://extensions/shortcuts`

---

## Usage

### Basic flow
1. Press `Alt+Shift+C` or click the toolbar icon → **Start Capture**
2. A dark overlay appears with crosshair guides
3. Drag to select the broken UI area
4. The comment modal appears with a preview of your selection
5. Describe the issue in the textarea
6. Click **Copy for Cursor**

### Configure a save folder (recommended)
By default screenshots go to `~/Downloads/contextclip/`. To save directly into your project:

1. Click the toolbar icon → **⚙ settings**
2. Click **Choose folder…** and pick your project directory
3. From then on all screenshots land in that folder

The copied prompt includes the exact file path — paste it into Cursor and attach the image with `/add` or drag it in.

### Without a configured folder
Screenshots fall back to `~/Downloads/contextclip/<filename>.png`. The prompt tells you the filename so you can drag it into the chat.

---

## Output prompt format

```
UI FIX REQUEST
==============

Page:        http://localhost:3000/dashboard
Viewport:    1512x861
Timestamp:   2026-05-08T15:17:21.994Z
Screenshot:  my-app/contextclip-2026-05-08_08-17-21.png

Selected area:
  x=425, y=353, width=580, height=154

User comment:
  The card overflows on mobile, padding looks wrong

Instruction:
  Use the attached screenshot and this context to identify the UI issue
  and update the relevant frontend component/CSS. Preserve the existing
  design system, spacing scale, and responsive behavior.
```

---

## Files

```
contextclip/
├── manifest.json              Chrome extension manifest (MV3)
├── background.js              Service worker — screenshot relay, file saving, shortcut handler
├── contentScript.js           Injected into pages — overlay, drag, crop, modal, clipboard
├── overlay.css                Injected styles for the overlay and modal
├── popup.html                 Toolbar popup UI
├── popup.js                   Popup logic — settings, folder picker, capture activation
├── contextclip-server.js      Optional companion server — saves screenshots to workspace
├── icons/                     Extension icons (16, 48, 128 px) + logo.png
├── store-assets/              Chrome Web Store listing materials
│   ├── contextclip-logo.png   Full logo for store listing
│   ├── description.md         Store listing copy
│   ├── privacy-policy.md      Privacy policy
│   └── screenshots/           Store screenshots (1280×800 or 640×400)
├── package.json               npm scripts for companion server
└── LICENSE                    MIT
```

---

## Chrome Web Store submission checklist

- [ ] Replace `homepage_url` in `manifest.json` with your real GitHub URL
- [ ] Add 1–5 screenshots (1280×800 or 640×400) to `store-assets/screenshots/`
- [ ] Host `store-assets/privacy-policy.md` at a public URL
- [ ] Update `store-assets/description.md` with your store listing copy
- [ ] Zip the extension: `zip -r contextclip.zip . -x "*.git*" -x "store-assets/*" -x "node_modules/*"`
- [ ] Upload at [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole)

---

## Contributing

Pull requests are welcome. For major changes please open an issue first.

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Load unpacked in Chrome to test
4. Open a PR against `main`

---

## License

MIT — see [LICENSE](LICENSE)
