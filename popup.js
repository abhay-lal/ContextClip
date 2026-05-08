// popup.js — ContextClip

// ── DOM refs ──────────────────────────────────────────────────────────────────
const captureBtn             = document.getElementById("capture-btn");
const activateStatusEl       = document.getElementById("activate-status");
const gearBtn                = document.getElementById("gear-btn");
const settingsPanel          = document.getElementById("settings-panel");
const chooseFolderBtn        = document.getElementById("choose-folder-btn");
const folderNameEl           = document.getElementById("folder-name");
const folderHint             = document.getElementById("folder-hint");
const saveSettingsBtn        = document.getElementById("save-settings-btn");
const customizeShortcutsLink = document.getElementById("customize-shortcuts-link");

// ── IndexedDB helpers (shared pattern with background.js) ─────────────────────
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

async function saveDirectoryHandle(handle) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(handle, "directory");
    tx.oncomplete = resolve;
    tx.onerror    = reject;
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

// ── Show the currently stored folder ─────────────────────────────────────────
async function refreshFolderDisplay() {
  const handle = await getDirectoryHandle();
  if (handle) {
    folderNameEl.textContent = handle.name;
    folderNameEl.classList.add("set");
    folderHint.textContent = `Screenshots will be saved into the "${handle.name}" folder you selected.`;
  } else {
    folderNameEl.textContent = "Not set";
    folderNameEl.classList.remove("set");
    folderHint.textContent = "No folder chosen — screenshots save to ~/Downloads/contextclip/ by default.";
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
refreshFolderDisplay();

// ── Gear toggle ───────────────────────────────────────────────────────────────
gearBtn.addEventListener("click", () => {
  const isOpen = settingsPanel.classList.toggle("open");
  gearBtn.classList.toggle("active", isOpen);
});

// ── Folder picker ─────────────────────────────────────────────────────────────
chooseFolderBtn.addEventListener("click", async () => {
  try {
    const handle = await window.showDirectoryPicker({ mode: "readwrite", id: "contextclip" });
    await saveDirectoryHandle(handle);
    // Also persist the folder name in storage so background can read it for the prompt
    await chrome.storage.local.set({ folderName: handle.name });
    await refreshFolderDisplay();

    // Flash save button as confirmation
    saveSettingsBtn.textContent = "Folder saved ✓";
    saveSettingsBtn.classList.add("saved");
    setTimeout(() => {
      saveSettingsBtn.textContent = "Save";
      saveSettingsBtn.classList.remove("saved");
    }, 2000);
  } catch (err) {
    if (err.name !== "AbortError") {
      console.error("ContextClip: folder picker error", err);
    }
    // AbortError = user cancelled picker, which is fine
  }
});

// ── Save button (still useful to confirm/re-save) ─────────────────────────────
saveSettingsBtn.addEventListener("click", async () => {
  const handle = await getDirectoryHandle();
  if (handle) {
    await chrome.storage.local.set({ folderName: handle.name });
  }
  saveSettingsBtn.textContent = "Saved ✓";
  saveSettingsBtn.classList.add("saved");
  setTimeout(() => {
    saveSettingsBtn.textContent = "Save";
    saveSettingsBtn.classList.remove("saved");
  }, 1800);
});

// ── Customize shortcuts ───────────────────────────────────────────────────────
customizeShortcutsLink.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});

// ── Activate capture ──────────────────────────────────────────────────────────
function setStatus(text, type = "") {
  activateStatusEl.textContent = text;
  activateStatusEl.className   = type;
}

captureBtn.addEventListener("click", async () => {
  captureBtn.disabled = true;
  setStatus("Activating…");

  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch {
    setStatus("Could not find active tab.", "error");
    captureBtn.disabled = false;
    return;
  }

  if (!tab?.id) {
    setStatus("No active tab found.", "error");
    captureBtn.disabled = false;
    return;
  }

  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["contentScript.js"] });
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["overlay.css"] });
  } catch { /* already injected or restricted page */ }

  await new Promise((r) => setTimeout(r, 80));

  chrome.tabs.sendMessage(
    tab.id,
    { action: "ACTIVATE_CAPTURE" },
    (response) => {
      if (chrome.runtime.lastError) {
        setStatus("Cannot capture this page.", "error");
        captureBtn.disabled = false;
        return;
      }
      if (response?.status === "already_active") setStatus("Already capturing…");
      window.close();
    }
  );
});
