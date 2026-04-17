#!/usr/bin/env node
// SAI MCP AE — Auto installer
// Detects AE version, installs startup script, updates Claude Desktop config

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const HOME      = os.homedir();
const REPO_DIR  = path.dirname(new URL(import.meta.url).pathname);
const JSX_SRC   = path.join(REPO_DIR, "scripts", "ae-mcp-startup.jsx");
const BUILD_JS  = path.join(REPO_DIR, "build", "index.js");
const CLAUDE_CFG = path.join(HOME, "Library", "Application Support", "Claude", "claude_desktop_config.json");

// ── 1. Find After Effects Startup folder ─────────────────────────────────────
const AE_STARTUP_PATHS = [
  "/Applications/Adobe After Effects (Beta)/Scripts/Startup",
  "/Applications/Adobe After Effects 2025/Scripts/Startup",
  "/Applications/Adobe After Effects 2024/Scripts/Startup",
  "/Applications/Adobe After Effects 2023/Scripts/Startup",
];

let aeDest = null;
for (const p of AE_STARTUP_PATHS) {
  if (fs.existsSync(p)) { aeDest = p; break; }
}

if (!aeDest) {
  console.error("❌  Could not find After Effects. Searched:");
  AE_STARTUP_PATHS.forEach(p => console.error("     " + p));
  process.exit(1);
}

// Copy JSX with sudo
const jsxDest = path.join(aeDest, "ae-mcp-startup.jsx");
try {
  execSync(`sudo cp "${JSX_SRC}" "${jsxDest}"`, { stdio: "inherit" });
  console.log("✅  AE startup script installed →", jsxDest);
} catch (e) {
  console.error("❌  Failed to copy JSX (try running with sudo):", e.message);
  process.exit(1);
}

// ── 2. Update Claude Desktop config ──────────────────────────────────────────
if (!fs.existsSync(CLAUDE_CFG)) {
  console.error("❌  Claude Desktop config not found at:", CLAUDE_CFG);
  console.error("    Is Claude Desktop installed?");
  process.exit(1);
}

let cfg;
try {
  cfg = JSON.parse(fs.readFileSync(CLAUDE_CFG, "utf8"));
} catch (e) {
  console.error("❌  Could not parse Claude config:", e.message);
  process.exit(1);
}

if (!cfg.mcpServers) cfg.mcpServers = {};

cfg.mcpServers["sai-mcp-ae"] = {
  command: "node",
  args: [BUILD_JS]   // absolute path auto-detected, no manual editing needed
};

fs.writeFileSync(CLAUDE_CFG, JSON.stringify(cfg, null, 2));
console.log("✅  Claude Desktop config updated →", CLAUDE_CFG);
console.log("    MCP path:", BUILD_JS);

// ── Done ──────────────────────────────────────────────────────────────────────
console.log("\n🎉  All done! Next steps:");
console.log("   1. Restart After Effects  (startup script auto-loads)");
console.log("   2. Restart Claude Desktop (MCP server connects)");
console.log("   3. Ask Claude to create a comp in After Effects!");
