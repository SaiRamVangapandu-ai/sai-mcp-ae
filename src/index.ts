import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { z } from "zod";
import { randomUUID } from "crypto";

// ─── Bridge directory (shared with AE panel) ──────────────────────────────────
const BRIDGE_DIR = path.join(os.homedir(), "Documents", "ae-mcp-bridge");
const CMD_FILE   = path.join(BRIDGE_DIR, "command.json");
const RESULT_FILE = path.join(BRIDGE_DIR, "result.json");

function ensureBridgeDir() {
  if (!fs.existsSync(BRIDGE_DIR)) fs.mkdirSync(BRIDGE_DIR, { recursive: true });
}

// ─── Write command & wait for matching result ─────────────────────────────────
async function runCommand(
  command: string,
  args: Record<string, unknown> = {},
  timeoutMs = 10000
): Promise<unknown> {
  ensureBridgeDir();
  const id = randomUUID();

  fs.writeFileSync(CMD_FILE, JSON.stringify({ id, command, args, status: "pending" }, null, 2));

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(300);
    if (!fs.existsSync(RESULT_FILE)) continue;
    try {
      const raw = fs.readFileSync(RESULT_FILE, "utf8");
      const result = JSON.parse(raw);
      if (result.id === id) return result;
    } catch {
      // file mid-write; retry
    }
  }
  throw new Error(`Timed out waiting for AE to respond to "${command}". Is the panel open in AE?`);
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function err(msg: string) {
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true as const };
}

// ─── Server ───────────────────────────────────────────────────────────────────
const server = new McpServer({ name: "SAI MCP AE", version: "1.0.0" });

// ── list_comps ────────────────────────────────────────────────────────────────
server.tool("list_comps", "List all compositions in the open After Effects project", {}, async () => {
  try { return ok(await runCommand("listComps")); }
  catch (e) { return err(String(e)); }
});

// ── create_comp ───────────────────────────────────────────────────────────────
server.tool(
  "create_comp",
  "Create a new composition in After Effects",
  {
    name:      z.string().describe("Composition name"),
    width:     z.coerce.number().int().positive().describe("Width in pixels"),
    height:    z.coerce.number().int().positive().describe("Height in pixels"),
    frameRate: z.coerce.number().positive().describe("Frame rate (e.g. 24, 30, 60)"),
    duration:  z.coerce.number().positive().describe("Duration in seconds"),
    bgColor:   z.tuple([z.number(), z.number(), z.number()]).optional()
                .describe("Background color as [r, g, b] each 0-1"),
  },
  async (args) => {
    try { return ok(await runCommand("createComp", args)); }
    catch (e) { return err(String(e)); }
  }
);

// ── add_layer ─────────────────────────────────────────────────────────────────
server.tool(
  "add_layer",
  "Add a layer to a composition (solid, text, null, or shape)",
  {
    compName:  z.string().describe("Target composition name"),
    layerType: z.enum(["solid", "text", "null", "shape"]).describe("Type of layer to add"),
    name:      z.string().optional().describe("Layer name"),
    text:      z.string().optional().describe("Text content (for text layers)"),
    color:     z.tuple([z.number(), z.number(), z.number()]).optional()
                .describe("Color as [r, g, b] each 0-1 (for solid layers)"),
    width:     z.number().int().positive().optional().describe("Solid width (defaults to comp width)"),
    height:    z.number().int().positive().optional().describe("Solid height (defaults to comp height)"),
    fontSize:  z.number().positive().optional().describe("Font size for text layers"),
  },
  async (args) => {
    try { return ok(await runCommand("addLayer", args)); }
    catch (e) { return err(String(e)); }
  }
);

// ── set_keyframe ──────────────────────────────────────────────────────────────
server.tool(
  "set_keyframe",
  "Set a keyframe on a layer property",
  {
    compName:  z.string().describe("Composition name"),
    layerName: z.string().describe("Layer name"),
    property:  z.string().describe("Property name, e.g. 'Position', 'Scale', 'Opacity', 'Rotation'"),
    time:      z.coerce.number().describe("Time in seconds"),
    value:     z.union([z.coerce.number(), z.array(z.coerce.number())]).describe("Keyframe value"),
  },
  async (args) => {
    try { return ok(await runCommand("setKeyframe", args)); }
    catch (e) { return err(String(e)); }
  }
);

// ── set_expression ────────────────────────────────────────────────────────────
server.tool(
  "set_expression",
  "Set a JavaScript expression on a layer property",
  {
    compName:   z.string().describe("Composition name"),
    layerName:  z.string().describe("Layer name"),
    property:   z.string().describe("Property name, e.g. 'Position', 'Opacity'"),
    expression: z.string().describe("Expression string. Empty string removes expression."),
  },
  async (args) => {
    try { return ok(await runCommand("setExpression", args)); }
    catch (e) { return err(String(e)); }
  }
);

// ── apply_effect ──────────────────────────────────────────────────────────────
server.tool(
  "apply_effect",
  "Apply an effect to a layer by its After Effects match name",
  {
    compName:       z.string().describe("Composition name"),
    layerName:      z.string().describe("Layer name"),
    effectMatchName: z.string().describe("AE internal effect name, e.g. 'ADBE Gaussian Blur 2'"),
    properties:     z.record(z.unknown()).optional().describe("Effect property values to set"),
  },
  async (args) => {
    try { return ok(await runCommand("applyEffect", args)); }
    catch (e) { return err(String(e)); }
  }
);

// ── trim_layer ────────────────────────────────────────────────────────────────
server.tool(
  "trim_layer",
  "Set the in/out points of a layer",
  {
    compName:  z.string().describe("Composition name"),
    layerName: z.string().describe("Layer name"),
    inPoint:   z.number().optional().describe("In point in seconds"),
    outPoint:  z.number().optional().describe("Out point in seconds"),
  },
  async (args) => {
    try { return ok(await runCommand("trimLayer", args)); }
    catch (e) { return err(String(e)); }
  }
);

// ── get_layer_info ────────────────────────────────────────────────────────────
server.tool(
  "get_layer_info",
  "Get info about all layers in a composition",
  {
    compName: z.string().describe("Composition name"),
  },
  async (args) => {
    try { return ok(await runCommand("getLayerInfo", args)); }
    catch (e) { return err(String(e)); }
  }
);

// ── run_script ────────────────────────────────────────────────────────────────
server.tool(
  "run_script",
  "Run arbitrary ExtendScript code in After Effects and return the result",
  {
    code: z.string().describe("ExtendScript (JavaScript ES3) code to execute. Must return a JSON string."),
  },
  async (args) => {
    try { return ok(await runCommand("runScript", args)); }
    catch (e) { return err(String(e)); }
  }
);

// ─── Start ────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
