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

// ── apply_keying ──────────────────────────────────────────────────────────────
server.tool(
  "apply_keying",
  "Apply chroma keying to a layer using Keylight. Removes green/blue screen backgrounds.",
  {
    compName:    z.string().describe("Composition name"),
    layerName:   z.string().describe("Layer name to key"),
    screenColor: z.tuple([z.coerce.number(), z.coerce.number(), z.coerce.number()])
                  .describe("Screen color to remove as [r, g, b] each 0-1. e.g. [0,1,0] for green, [0,0,1] for blue"),
    screenGain:  z.coerce.number().optional().describe("Screen gain 0-200 (default 100)"),
    screenBalance: z.coerce.number().optional().describe("Screen balance 0-1 (default 0.5)"),
  },
  async (args) => {
    try { return ok(await runCommand("applyKeying", args)); }
    catch (e) { return err(String(e)); }
  }
);

// ── stabilize ────────────────────────────────────────────────────────────────
server.tool(
  "stabilize",
  "Apply Warp Stabilizer to smooth out camera shake on a layer",
  {
    compName:     z.string().describe("Composition name"),
    layerName:    z.string().describe("Layer name"),
    smoothness:   z.coerce.number().optional().describe("Smoothness percentage (default 50)"),
    method:       z.enum(["subspace_warp", "perspective", "similarity", "position"]).optional()
                   .describe("Stabilization method (default: subspace_warp)"),
  },
  async (args) => {
    try { return ok(await runCommand("stabilize", args)); }
    catch (e) { return err(String(e)); }
  }
);

// ── add_camera ────────────────────────────────────────────────────────────────
server.tool(
  "add_camera",
  "Add a 3D camera to a composition",
  {
    compName:   z.string().describe("Composition name"),
    name:       z.string().optional().describe("Camera name (default: Camera 1)"),
    focalLength: z.coerce.number().optional().describe("Focal length in mm (default: 50)"),
    cameraType: z.enum(["one_node", "two_node"]).optional().describe("Camera type (default: two_node)"),
  },
  async (args) => {
    try { return ok(await runCommand("addCamera", args)); }
    catch (e) { return err(String(e)); }
  }
);

// ── set_3d ────────────────────────────────────────────────────────────────────
server.tool(
  "set_3d",
  "Enable or disable 3D on a layer",
  {
    compName:  z.string().describe("Composition name"),
    layerName: z.string().describe("Layer name"),
    enabled:   z.boolean().describe("true to enable 3D, false to disable"),
  },
  async (args) => {
    try { return ok(await runCommand("set3D", args)); }
    catch (e) { return err(String(e)); }
  }
);

// ── duplicate_layer ───────────────────────────────────────────────────────────
server.tool(
  "duplicate_layer",
  "Duplicate a layer in a composition",
  {
    compName:  z.string().describe("Composition name"),
    layerName: z.string().describe("Layer name to duplicate"),
    newName:   z.string().optional().describe("Name for the duplicated layer"),
  },
  async (args) => {
    try { return ok(await runCommand("duplicateLayer", args)); }
    catch (e) { return err(String(e)); }
  }
);

// ── parent_layer ──────────────────────────────────────────────────────────────
server.tool(
  "parent_layer",
  "Set the parent of a layer to another layer (for linked transforms)",
  {
    compName:   z.string().describe("Composition name"),
    layerName:  z.string().describe("Child layer name"),
    parentName: z.string().describe("Parent layer name. Pass empty string to remove parent."),
  },
  async (args) => {
    try { return ok(await runCommand("parentLayer", args)); }
    catch (e) { return err(String(e)); }
  }
);

// ── add_mask ──────────────────────────────────────────────────────────────────
server.tool(
  "add_mask",
  "Add a rectangular or elliptical mask to a layer",
  {
    compName:  z.string().describe("Composition name"),
    layerName: z.string().describe("Layer name"),
    shape:     z.enum(["rect", "ellipse"]).describe("Mask shape"),
    position:  z.tuple([z.coerce.number(), z.coerce.number()]).optional()
                .describe("Centre position [x, y] in pixels (default: comp centre)"),
    size:      z.tuple([z.coerce.number(), z.coerce.number()]).optional()
                .describe("Mask size [width, height] in pixels (default: half comp size)"),
    feather:   z.coerce.number().optional().describe("Feather amount in pixels (default: 0)"),
    inverted:  z.boolean().optional().describe("Invert the mask (default: false)"),
  },
  async (args) => {
    try { return ok(await runCommand("addMask", args)); }
    catch (e) { return err(String(e)); }
  }
);

// ── pre_compose ───────────────────────────────────────────────────────────────
server.tool(
  "pre_compose",
  "Pre-compose a layer into its own composition",
  {
    compName:    z.string().describe("Composition name"),
    layerName:   z.string().describe("Layer name to pre-compose"),
    newCompName: z.string().describe("Name for the new pre-comp"),
    moveAll:     z.boolean().optional().describe("Move all attributes into new comp (default: true)"),
  },
  async (args) => {
    try { return ok(await runCommand("preCompose", args)); }
    catch (e) { return err(String(e)); }
  }
);

// ── track_camera ──────────────────────────────────────────────────────────────
server.tool(
  "track_camera",
  "Apply 3D Camera Tracker effect to a layer for 3D scene reconstruction",
  {
    compName:  z.string().describe("Composition name"),
    layerName: z.string().describe("Footage layer name to track"),
  },
  async (args) => {
    try { return ok(await runCommand("trackCamera", args)); }
    catch (e) { return err(String(e)); }
  }
);

// ── color_grade ───────────────────────────────────────────────────────────────
server.tool(
  "color_grade",
  "Apply a colour grade preset to a layer. Presets: cinematic, warm, cool, vintage, clean, moody, bright.",
  {
    compName:   z.string().describe("Composition name"),
    layerName:  z.string().describe("Layer name"),
    preset:     z.enum(["cinematic", "warm", "cool", "vintage", "clean", "moody", "bright"])
                 .describe("Grade preset to apply"),
    intensity:  z.coerce.number().min(0).max(100).optional()
                 .describe("Blend strength 0-100 (default: 100)"),
  },
  async (args) => {
    try { return ok(await runCommand("colorGrade", args)); }
    catch (e) { return err(String(e)); }
  }
);

// ── adjust_color ──────────────────────────────────────────────────────────────
server.tool(
  "adjust_color",
  "Fine-tune colour properties on a layer: brightness, contrast, saturation, hue, temperature.",
  {
    compName:    z.string().describe("Composition name"),
    layerName:   z.string().describe("Layer name"),
    brightness:  z.coerce.number().optional().describe("Brightness -100 to 100"),
    contrast:    z.coerce.number().optional().describe("Contrast -100 to 100"),
    saturation:  z.coerce.number().optional().describe("Saturation -100 to 100 (0 = no change)"),
    hue:         z.coerce.number().optional().describe("Hue rotation in degrees"),
    temperature: z.coerce.number().optional().describe("Warm/cool shift -100 (cool) to 100 (warm)"),
    vignette:    z.boolean().optional().describe("Add a vignette (default: false)"),
  },
  async (args) => {
    try { return ok(await runCommand("adjustColor", args)); }
    catch (e) { return err(String(e)); }
  }
);

// ── animate_text ──────────────────────────────────────────────────────────────
server.tool(
  "animate_text",
  "Animate text character by character. Types: typewriter, fade_up, fade_in, scale_in, blur_in, slide_right.",
  {
    compName:   z.string().describe("Composition name"),
    layerName:  z.string().describe("Text layer name"),
    type:       z.enum(["typewriter", "fade_up", "fade_in", "scale_in", "blur_in", "slide_right"])
                 .describe("Animation style"),
    startTime:  z.coerce.number().optional().describe("Animation start time in seconds (default: 0)"),
    duration:   z.coerce.number().optional().describe("Total animation duration in seconds (default: 1)"),
    direction:  z.enum(["in", "out", "both"]).optional()
                 .describe("Animate in, out, or both (default: in)"),
  },
  async (args) => {
    try { return ok(await runCommand("animateText", args)); }
    catch (e) { return err(String(e)); }
  }
);

// ─── Start ────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
