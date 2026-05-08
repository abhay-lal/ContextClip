// contentScript.js — ContextClip
// Handles the full capture lifecycle:
//   1. Overlay + drag selection
//   2. Request screenshot from background
//   3. Crop screenshot to selection rect via canvas
//   4. Show comment modal with preview
//   5. Copy screenshot + structured prompt to clipboard

(() => {
  // ── Guard against double-injection ─────────────────────────────────
  if (window.__contextClipActive) return;
  window.__contextClipActive = true;

  // ── State ───────────────────────────────────────────────────────────
  let startX = 0, startY = 0;
  let isDragging = false;
  let selectionRect = null; // { x, y, w, h } in CSS pixels

  // Settings passed from popup via ACTIVATE_CAPTURE message
  // (folder selection is handled entirely by the background service worker)

  // ── Elements ────────────────────────────────────────────────────────
  let overlay, rectEl, hintEl, modal;

  // ── Inject CSS once ─────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById("context-clip-style")) return;
    const link = document.createElement("link");
    link.id = "context-clip-style";
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("overlay.css");
    document.head.appendChild(link);
  }

  // ── Build the overlay DOM ────────────────────────────────────────────
  function buildOverlay() {
    overlay = document.createElement("div");
    overlay.id = "context-clip-overlay";

    hintEl = document.createElement("div");
    hintEl.id = "context-clip-hint";
    hintEl.textContent = "Drag to select the broken area  ·  Esc to cancel";
    overlay.appendChild(hintEl);

    // Crosshair guide lines — follow the mouse before dragging starts
    const chH = document.createElement("div");
    chH.id = "context-clip-ch-h";
    const chV = document.createElement("div");
    chV.id = "context-clip-ch-v";
    overlay.appendChild(chH);
    overlay.appendChild(chV);

    rectEl = document.createElement("div");
    rectEl.id = "context-clip-rect";
    rectEl.style.display = "none";

    const label = document.createElement("span");
    label.id = "context-clip-rect-label";
    rectEl.appendChild(label);
    overlay.appendChild(rectEl);

    document.body.appendChild(overlay);
    document.addEventListener("keydown", onKeyDown);

    // Move crosshairs with the mouse until dragging starts
    overlay.addEventListener("mousemove", onCrosshairMove);
  }

  function onCrosshairMove(e) {
    if (isDragging) return;
    const chH = document.getElementById("context-clip-ch-h");
    const chV = document.getElementById("context-clip-ch-v");
    if (chH) chH.style.top = e.clientY + "px";
    if (chV) chV.style.left = e.clientX + "px";
  }

  // ── Mouse handlers ───────────────────────────────────────────────────
  function onMouseDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    // Hide crosshair guides and hint once dragging begins
    const chH = document.getElementById("context-clip-ch-h");
    const chV = document.getElementById("context-clip-ch-v");
    if (chH) chH.style.display = "none";
    if (chV) chV.style.display = "none";
    hintEl.style.display = "none";

    rectEl.style.display = "block";
    rectEl.className = "dragging";
    updateRect(e.clientX, e.clientY);
  }

  function onMouseMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    updateRect(e.clientX, e.clientY);
  }

  function onMouseUp(e) {
    if (!isDragging) return;
    e.preventDefault();
    isDragging = false;
    updateRect(e.clientX, e.clientY);

    const { x, y, w, h } = computeRect(e.clientX, e.clientY);
    if (w < 4 || h < 4) {
      // Accidental click — show crosshairs again and reset
      rectEl.style.display = "none";
      rectEl.className = "";
      hintEl.style.display = "block";
      const chH = document.getElementById("context-clip-ch-h");
      const chV = document.getElementById("context-clip-ch-v");
      if (chH) chH.style.display = "block";
      if (chV) chV.style.display = "block";
      return;
    }
    // Switch rect from dashed-dragging to solid-selected
    rectEl.className = "selected";
    selectionRect = { x, y, w, h };
    requestScreenshot();
  }

  function updateRect(curX, curY) {
    const { x, y, w, h } = computeRect(curX, curY);
    rectEl.style.left = x + "px";
    rectEl.style.top = y + "px";
    rectEl.style.width = w + "px";
    rectEl.style.height = h + "px";
    const label = rectEl.querySelector("#context-clip-rect-label");
    if (label) label.textContent = `${w} × ${h}`;
  }

  function computeRect(curX, curY) {
    return {
      x: Math.min(startX, curX),
      y: Math.min(startY, curY),
      w: Math.abs(curX - startX),
      h: Math.abs(curY - startY),
    };
  }

  function onKeyDown(e) {
    if (e.key === "Escape") teardown();
  }

  // ── Request full-page screenshot from background ─────────────────────
  function requestScreenshot() {
    overlay.removeEventListener("mousedown", onMouseDown);
    overlay.removeEventListener("mousemove", onMouseMove);
    overlay.removeEventListener("mouseup", onMouseUp);

    chrome.runtime.sendMessage({ action: "CAPTURE_TAB" }, (response) => {
      if (chrome.runtime.lastError || !response || response.error) {
        const msg = response?.error ?? chrome.runtime.lastError?.message ?? "Unknown error";
        teardown();
        alert(`ContextClip: screenshot failed — ${msg}`);
        return;
      }
      cropAndShowModal(response.dataURL);
    });
  }

  // ── Crop the full screenshot to the selection rect via canvas ────────
  function cropAndShowModal(dataURL) {
    const img = new Image();
    img.onload = () => {
      // devicePixelRatio accounts for HiDPI / Retina screens
      const dpr = window.devicePixelRatio || 1;
      const { x, y, w, h } = selectionRect;

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(
        img,
        Math.round(x * dpr), Math.round(y * dpr),
        Math.round(w * dpr), Math.round(h * dpr),
        0, 0,
        Math.round(w * dpr), Math.round(h * dpr)
      );

      canvas.toBlob((blob) => {
        removeOverlay();
        showModal(blob, canvas.toDataURL("image/png"));
      }, "image/png");
    };
    img.onerror = () => {
      teardown();
      alert("ContextClip: failed to load screenshot image.");
    };
    img.src = dataURL;
  }

  // ── Build and show the comment modal ─────────────────────────────────
  function showModal(blob, previewDataURL) {
    modal = document.createElement("div");
    modal.id = "context-clip-modal";

    const card = document.createElement("div");
    card.id = "context-clip-card";

    // Header
    const header = document.createElement("div");
    header.id = "context-clip-card-header";

    const title = document.createElement("p");
    title.id = "context-clip-card-title";
    title.textContent = "ContextClip — Describe the issue";

    const closeBtn = document.createElement("button");
    closeBtn.id = "context-clip-close-btn";
    closeBtn.title = "Cancel (Esc)";
    closeBtn.textContent = "✕";
    closeBtn.addEventListener("click", teardown);

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Preview image
    const preview = document.createElement("img");
    preview.id = "context-clip-preview";
    preview.src = previewDataURL;
    preview.alt = "Captured area preview";

    // Meta
    const meta = document.createElement("p");
    meta.id = "context-clip-meta";
    const { w, h } = selectionRect;
    meta.textContent = `${location.href}  ·  viewport ${window.innerWidth}×${window.innerHeight}  ·  selection ${w}×${h}`;

    // Comment textarea
    const textarea = document.createElement("textarea");
    textarea.id = "context-clip-comment";
    textarea.placeholder = "What needs to be fixed? (e.g. 'The card overflows on mobile, padding looks wrong')";

    // Button row
    const btnRow = document.createElement("div");
    btnRow.id = "context-clip-btn-row";

    const copyAllBtn = document.createElement("button");
    copyAllBtn.id = "context-clip-copy-all";
    copyAllBtn.title = "Downloads the screenshot and copies the prompt with its filename";
    copyAllBtn.textContent = "Copy for Cursor";

    const copyImgBtn = document.createElement("button");
    copyImgBtn.id = "context-clip-copy-img";
    copyImgBtn.textContent = "Copy Screenshot";

    const copyPromptBtn = document.createElement("button");
    copyPromptBtn.id = "context-clip-copy-prompt";
    copyPromptBtn.textContent = "Copy Prompt";

    btnRow.appendChild(copyAllBtn);
    btnRow.appendChild(copyImgBtn);
    btnRow.appendChild(copyPromptBtn);

    // Instruction label shown after "Copy for Cursor" succeeds
    const postCopyHint = document.createElement("p");
    postCopyHint.id = "context-clip-post-hint";
    postCopyHint.style.cssText = [
      "display:none",
      "color:#5cdb95",
      "font-size:11.5px",
      "line-height:1.5",
      "margin:0",
      "padding:8px 10px",
      "background:rgba(92,219,149,0.08)",
      "border:1px solid rgba(92,219,149,0.2)",
      "border-radius:6px",
    ].join("!important;") + "!important";

    card.appendChild(header);
    card.appendChild(preview);
    card.appendChild(meta);
    card.appendChild(textarea);
    card.appendChild(btnRow);
    card.appendChild(postCopyHint);
    modal.appendChild(card);
    document.body.appendChild(modal);

    // Focus textarea so clipboard API works (requires document focus)
    textarea.focus();

    // ── Button actions ─────────────────────────────────────────────────
    // "Copy for Cursor":
    //   1. Send blob to background → tries selected folder via File System Access
    //   2. Falls back to chrome.downloads (~/Downloads/contextclip/) if no folder set
    //   3. Copies structured prompt (with saved path) to clipboard

    copyAllBtn.addEventListener("click", async () => {
      copyAllBtn.disabled = true;
      copyAllBtn.textContent = "Saving…";

      const filename = buildFilename();
      const base64   = await blobToBase64(blob);

      // Route download through background (chrome.downloads + File System Access require it)
      const downloadResult = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { action: "DOWNLOAD_SCREENSHOT", base64, filename },
          (response) => resolve(response || {})
        );
      });

      const savedPath = downloadResult.path || `~/Downloads/contextclip/${filename}`;
      const viaFolder = downloadResult.via === "folder";

      const prompt = buildPrompt(textarea.value.trim(), savedPath);
      try {
        await navigator.clipboard.writeText(prompt);
        copyAllBtn.textContent = "✓ Saved + copied!";
        copyAllBtn.classList.add("context-clip-copied");
        postCopyHint.innerHTML = viaFolder
          ? `Saved to <code style="font-size:10px;word-break:break-all">${savedPath}</code><br>
             Paste the prompt in Cursor, then drag the file from that folder into the chat.`
          : `Saved to <code style="font-size:10px;word-break:break-all">${savedPath}</code><br>
             No folder configured — drag the file from Downloads into Cursor, or pick a folder in settings ⚙`;
        postCopyHint.style.display = "block";
        setTimeout(() => {
          copyAllBtn.textContent = "Copy for Cursor";
          copyAllBtn.disabled = false;
          copyAllBtn.classList.remove("context-clip-copied");
        }, 3000);
      } catch (err) {
        copyAllBtn.textContent = "Saved — clipboard failed";
        copyAllBtn.disabled = false;
        console.error("ContextClip clipboard error:", err);
      }
    });

    copyImgBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        flashCopied(copyImgBtn, "Screenshot copied!");
      } catch (err) {
        flashCopied(copyImgBtn, "Failed");
        console.error("ContextClip clipboard error:", err);
      }
    });

    copyPromptBtn.addEventListener("click", async () => {
      const prompt = buildPrompt(textarea.value.trim());
      try {
        await navigator.clipboard.writeText(prompt);
        flashCopied(copyPromptBtn, "Prompt copied!");
      } catch (err) {
        flashCopied(copyPromptBtn, "Failed");
        console.error("ContextClip clipboard error:", err);
      }
    });

    // Close on backdrop click (outside card)
    modal.addEventListener("click", (e) => {
      if (e.target === modal) teardown();
    });
  }

  // ── Build a timestamped filename for the screenshot ──────────────────
  function buildFilename() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
               `_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    return `contextclip-${ts}.png`;
  }

  // ── Blob → base64 string (without the data URL prefix) ───────────────
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // ── Build the structured AI prompt ───────────────────────────────────
  function buildPrompt(comment, savedPath) {
    const { x, y, w, h } = selectionRect;
    const timestamp = new Date().toISOString();
    return [
      "UI FIX REQUEST",
      "==============",
      "",
      `Page:        ${location.href}`,
      `Viewport:    ${window.innerWidth}x${window.innerHeight}`,
      `Timestamp:   ${timestamp}`,
      ...(savedPath ? [`Screenshot:  ${savedPath}`] : []),
      "",
      "Selected area:",
      `  x=${x}, y=${y}, width=${w}, height=${h}`,
      "",
      "User comment:",
      `  ${comment || "(no comment provided)"}`,
      "",
      "Instruction:",
      "  Use the attached screenshot and this context to identify the UI issue",
      "  and update the relevant frontend component/CSS. Preserve the existing",
      "  design system, spacing scale, and responsive behavior.",
    ].join("\n");
  }

  // ── Button feedback helper ────────────────────────────────────────────
  function flashCopied(btn, text) {
    const original = btn.textContent;
    btn.textContent = text;
    btn.classList.add("context-clip-copied");
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove("context-clip-copied");
      btn.disabled = false;
    }, 2000);
  }

  // ── Cleanup helpers ──────────────────────────────────────────────────
  function removeOverlay() {
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
  }

  function teardown() {
    removeOverlay();
    if (modal) {
      modal.remove();
      modal = null;
    }
    document.removeEventListener("keydown", onKeyDown);
    window.__contextClipActive = false;
  }

  // ── Entry point — called when popup sends ACTIVATE_CAPTURE ──────────
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === "ACTIVATE_CAPTURE") {
      if (window.__contextClipActive && overlay) {
        sendResponse({ status: "already_active" });
        return;
      }
      // Store settings passed from popup for use at copy time
      // (folder selection is managed by background.js via IndexedDB)

      window.__contextClipActive = true;
      injectStyles();
      buildOverlay();

      overlay.addEventListener("mousedown", onMouseDown);
      overlay.addEventListener("mousemove", onMouseMove);
      overlay.addEventListener("mouseup", onMouseUp);

      sendResponse({ status: "activated" });
    }
  });
})();
