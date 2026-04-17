#!/usr/bin/env node
// Copies ae-mcp-panel.jsx into After Effects ScriptUI Panels folder

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const SRC = path.join(import.meta.dirname, "scripts", "ae-mcp-panel.jsx");

const AE_SCRIPT_PATHS = [
  "/Applications/Adobe After Effects (Beta)/Scripts/ScriptUI Panels",
  "/Applications/Adobe After Effects 2025/Scripts/ScriptUI Panels",
  "/Applications/Adobe After Effects 2024/Scripts/ScriptUI Panels",
  "/Applications/Adobe After Effects 2023/Scripts/ScriptUI Panels",
];

let dest = null;
for (const p of AE_SCRIPT_PATHS) {
  if (fs.existsSync(p)) { dest = p; break; }
}

if (!dest) {
  console.error("❌ Could not find After Effects Scripts folder. Searched:");
  AE_SCRIPT_PATHS.forEach(p => console.error("   " + p));
  console.error("\nManually copy scripts/ae-mcp-panel.jsx to your AE Scripts/ScriptUI Panels folder.");
  process.exit(1);
}

const destFile = path.join(dest, "ae-mcp-panel.jsx");
fs.copyFileSync(SRC, destFile);
console.log("✅ Installed to:", destFile);
console.log("\nNext steps:");
console.log("  1. Open After Effects");
console.log("  2. Go to Window > ae-mcp-panel.jsx");
console.log("  3. The panel will say 'Listening...' when ready");
console.log("  4. Add this MCP to Claude Code's config (see README)");
