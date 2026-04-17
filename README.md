# SAI MCP AE

Control **Adobe After Effects** directly from Claude — create comps, add layers, animate, apply effects, set expressions. No API keys required.

## How it works

```
Claude Desktop
    ↓ writes command
~/Documents/ae-mcp-bridge/command.json
    ↑ polls every 1.5s
After Effects (silent background script)
    ↓ executes, writes result
~/Documents/ae-mcp-bridge/result.json
    ↑ reads
Claude Desktop → returns result
```

## Setup (5 minutes)

### 1. Clone & build
```bash
git clone https://github.com/YOUR_USERNAME/sai-mcp-ae.git
cd sai-mcp-ae
npm install
npm run build
```

### 2. Install the AE background script
```bash
# After Effects (Beta)
sudo cp scripts/ae-mcp-startup.jsx "/Applications/Adobe After Effects (Beta)/Scripts/Startup/ae-mcp-startup.jsx"

# After Effects 2025
sudo cp scripts/ae-mcp-startup.jsx "/Applications/Adobe After Effects 2025/Scripts/Startup/ae-mcp-startup.jsx"
```

### 3. Add to Claude Desktop
Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "sai-mcp-ae": {
      "command": "node",
      "args": ["/absolute/path/to/sai-mcp-ae/build/index.js"]
    }
  }
}
```
> Replace `/absolute/path/to/sai-mcp-ae` with the actual path where you cloned the repo.

### 4. Restart both apps
- Quit and reopen **After Effects** (startup script auto-loads)
- Quit and reopen **Claude Desktop** (MCP server connects)

---

## Available tools

| Tool | Description |
|---|---|
| `list_comps` | List all compositions in the project |
| `create_comp` | Create a new composition |
| `add_layer` | Add solid / text / null / shape layer |
| `set_keyframe` | Animate any transform property |
| `set_expression` | Set expressions (wiggle, loopOut, etc.) |
| `apply_effect` | Apply any AE effect by match name |
| `trim_layer` | Set layer in/out points |
| `get_layer_info` | Get all layers in a comp |
| `run_script` | Run arbitrary ExtendScript |

## Example prompts

```
Create a 1920x1080 comp at 24fps with a soft gradient background and title text "Hello World" that fades in over 1 second

Add a wiggle expression to the Position of layer "Title"

Apply a Gaussian Blur to layer "BG" with blurriness 30

Animate the scale of "Logo" from 0% to 100% between 0 and 0.5 seconds with overshoot
```

## Requirements

- Adobe After Effects (2023 or later / Beta)
- Node.js 18+
- Claude Desktop

## Optional: Panel UI

If you want a visible status panel in AE:
```bash
sudo cp scripts/sai-ae-mcp.jsx "/Applications/Adobe After Effects (Beta)/Scripts/ScriptUI Panels/sai-ae-mcp.jsx"
```
Then open via **Window → sai-ae-mcp.jsx** in After Effects.
