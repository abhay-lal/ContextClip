// background.js — ContextClip service worker

// ── IndexedDB helpers ─────────────────────────────────────────────────────────
// Service workers have full IndexedDB access at the extension origin.
// The FileSystemDirectoryHandle stored here was obtained via showDirectoryPicker()
// in the popup, and its readwrite permission persists for the browser session.

const DB_NAME    = "contextclip-db";
const STORE_NAME = "handles";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE_NAME);
    req.onsuccess  = (e) => resolve(e.target.result);
    req.onerror    = reject;
  });
}

async function getDirectoryHandle() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get("directory");
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror   = reject;
  });
}

// ── Write PNG via File System Access API ──────────────────────────────────────
async function writeToSelectedFolder(base64, filename) {
  const dirHandle = await getDirectoryHandle();
  if (!dirHandle) return null;

  // Check if the stored permission is still valid (lasts for the browser session)
  const permission = await dirHandle.queryPermission({ mode: "readwrite" });
  if (permission !== "granted") return null;

  try {
    const fileHandle    = await dirHandle.getFileHandle(filename, { create: true });
    const writable      = await fileHandle.createWritable();
    const bytes         = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    await writable.write(bytes);
    await writable.close();
    return dirHandle.name; // return folder name for use in the prompt
  } catch (err) {
    console.warn("ContextClip: File System write failed", err);
    return null;
  }
}

// ── Fallback: chrome.downloads ────────────────────────────────────────────────
function downloadViaChrome(base64, filename) {
  return new Promise((resolve) => {
    chrome.downloads.download(
      {
        url:            `data:image/png;base64,${base64}`,
        filename:       `contextclip/${filename}`,
        conflictAction: "overwrite",
        saveAs:         false,
      },
      (downloadId) => {
        if (chrome.runtime.lastError || downloadId == null) {
          resolve(null);
        } else {
          resolve(`~/Downloads/contextclip/${filename}`);
        }
      }
    );
  });
}

// ── Message listeners ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // ── Screenshot relay ───────────────────────────────────────────────────────
  if (message.action === "CAPTURE_TAB") {
    const tabId = sender.tab?.id;
    if (tabId == null) { sendResponse({ error: "No sender tab ID" }); return false; }

    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        sendResponse({ error: chrome.runtime.lastError?.message ?? "Tab not found" });
        return;
      }
      chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" }, (dataURL) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
          return;
        }
        sendResponse({ dataURL });
      });
    });
    return true;
  }

  // ── Save screenshot: try selected folder, fall back to Downloads ───────────
  if (message.action === "DOWNLOAD_SCREENSHOT") {
    const { base64, filename } = message;

    (async () => {
      // 1. Try File System Access (selected folder)
      const folderName = await writeToSelectedFolder(base64, filename);
      if (folderName) {
        sendResponse({ path: `${folderName}/${filename}`, via: "folder" });
        return;
      }

      // 2. Fall back to chrome.downloads → ~/Downloads/contextclip/
      const path = await downloadViaChrome(base64, filename);
      sendResponse({ path: path ?? `~/Downloads/contextclip/${filename}`, via: "downloads" });
    })();

    return true; // async sendResponse
  }
});

// ── Keyboard shortcut: "activate-capture" ────────────────────────────────────
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "activate-capture") return;

  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch { return; }
  if (!tab?.id) return;

  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["contentScript.js"] });
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["overlay.css"] });
  } catch { /* already injected or restricted */ }

  await new Promise((r) => setTimeout(r, 80));
  chrome.tabs.sendMessage(tab.id, { action: "ACTIVATE_CAPTURE" });
});
