# ContextClip — Chrome Web Store Description

## Short description (132 chars max)
Drag-select UI bugs on any page, add a comment, and paste a screenshot + AI prompt into Cursor or ChatGPT.

## Full description

**ContextClip is a visual context clipboard for AI coding agents.**

When building UI locally, you constantly notice small issues — spacing, overflow, broken layouts, wrong colors. The usual workflow is slow: screenshot → crop → copy → paste → type context → repeat for every issue.

ContextClip replaces that with a single keyboard shortcut.

---

### How it works

1. Press **Alt+Shift+C** on any page (localhost or production)
2. A snipping-tool overlay appears with crosshair guides
3. Drag to select the broken area
4. Type what needs to be fixed
5. Click **Copy for Cursor** — the screenshot is saved, the structured prompt is copied
6. Paste into Cursor, ChatGPT, Claude, or any AI tool

---

### Key features

- **One-shortcut capture** — Alt+Shift+C starts immediately, no popup required
- **Customizable shortcuts** — change defaults at chrome://extensions/shortcuts
- **Choose your save folder** — pick any local folder from the settings panel; screenshots save there automatically so Cursor can read them by path
- **Structured AI prompt** — auto-generates page URL, viewport size, coordinates, timestamp, and your comment in a format AI tools understand
- **Works everywhere** — localhost, staging, production
- **Fallback to Downloads** — if no folder is configured, saves to ~/Downloads/contextclip/ automatically
- **Open source** — MIT licensed

---

### Permissions used

- **activeTab** — capture the current tab's screenshot
- **scripting** — inject the capture overlay into the page
- **clipboardWrite** — copy the prompt text to clipboard
- **storage** — remember your settings
- **downloads** — save screenshots when no custom folder is set

No data is ever sent to external servers. All processing is local.
