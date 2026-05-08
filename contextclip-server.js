#!/usr/bin/env node
// contextclip-server.js — ContextClip companion server
// Runs locally so the Chrome extension can save screenshots directly into
// your project workspace instead of the browser's Downloads folder.
//
// Usage:
//   node contextclip-server.js [port] [workspacePath]
//
//   port          — HTTP port to listen on. Default: 7331
//   workspacePath — Root of your project. Screenshots are saved to
//                   <workspacePath>/.contextclip/
//                   Default: ~/Downloads/contextclip
//
// Examples:
//   node contextclip-server.js
//   node contextclip-server.js 7331 /Users/me/Projects/my-app
//
// Add to your project's package.json for convenience:
//   "scripts": {
//     "contextclip": "node node_modules/.bin/contextclip-server || node contextclip-server.js 7331 ."
//   }

const http = require("node:http");
const fs   = require("node:fs");
const path = require("node:path");
const os   = require("node:os");

// ── Config from CLI args ─────────────────────────────────────────────────────
const PORT          = parseInt(process.argv[2], 10) || 7331;
const WORKSPACE_ARG = process.argv[3];
const WORKSPACE     = WORKSPACE_ARG
  ? path.resolve(WORKSPACE_ARG)
  : path.join(os.homedir(), "Downloads", "contextclip");

const SAVE_DIR = path.join(WORKSPACE, ".contextclip");

// Ensure the save directory exists on startup
fs.mkdirSync(SAVE_DIR, { recursive: true });

// ── CORS headers (extension content scripts run on arbitrary origins) ────────
function setCORS(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// ── Request body collector ────────────────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end",  () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

// ── Server ────────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  setCORS(res);

  // Pre-flight for CORS
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // GET /ping — health check used by the popup to show connection status
  if (req.method === "GET" && req.url === "/ping") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", saveDir: SAVE_DIR, port: PORT }));
    return;
  }

  // POST /save — receives { filename: string, data: string (base64 PNG) }
  //              writes the file, returns { path: absolutePath }
  if (req.method === "POST" && req.url === "/save") {
    let payload;
    try {
      const body = await readBody(req);
      payload = JSON.parse(body);
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }

    const { filename, data } = payload;

    if (!filename || !data) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing filename or data" }));
      return;
    }

    // Sanitise filename — strip any path traversal attempts
    const safeName = path.basename(filename);
    const filePath = path.join(SAVE_DIR, safeName);

    try {
      const buffer = Buffer.from(data, "base64");
      fs.writeFileSync(filePath, buffer);
      console.log(`[ContextClip] saved  ${filePath}  (${buffer.length} bytes)`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ path: filePath }));
    } catch (err) {
      console.error("[ContextClip] write error:", err.message);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 404 for everything else
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║          ContextClip Companion Server         ║");
  console.log("╠══════════════════════════════════════════════╣");
  console.log(`║  Listening on  http://localhost:${PORT}          ║`);
  console.log(`║  Saving to     ${SAVE_DIR.slice(0, 32).padEnd(32)}  ║`);
  console.log("╚══════════════════════════════════════════════╝");
  console.log("");
  console.log("Configure the extension popup with:");
  console.log(`  Workspace path : ${WORKSPACE}`);
  console.log(`  Server port    : ${PORT}`);
  console.log("");
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[ContextClip] Port ${PORT} is already in use. Try a different port:`);
    console.error(`  node contextclip-server.js ${PORT + 1} ${WORKSPACE}`);
  } else {
    console.error("[ContextClip] Server error:", err.message);
  }
  process.exit(1);
});
