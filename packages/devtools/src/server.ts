#!/usr/bin/env bun
/**
 * TGE DevTools MCP Server
 *
 * An MCP server that gives AI agents direct control over TGE demos:
 * - Launch demos in Kitty terminal windows
 * - Capture screenshots and return them as images
 * - Send keyboard/mouse inputs (clicks, drags, scrolls)
 * - Inspect running demos via IPC debug channel
 * - Stop running demos
 *
 * Usage:
 *   bun run packages/devtools/src/server.ts
 *
 * MCP config (opencode/claude):
 *   { "command": "bun", "args": ["run", "packages/devtools/src/server.ts"] }
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { readFileSync, existsSync } from "fs"
import {
  findKittySocket,
  listWindows,
  launchTab,
  sendText,
  sendKey,
  focusWindow,
  closeWindow,
  getText,
  findCGWindowId,
  screenshot,
  sendMouseClick,
  sendMouseDrag,
  sendMouseScroll,
} from "./kitty"

// ── State ──

type RunningDemo = {
  windowId: number
  pid: number
  script: string
  launchedAt: number
  socket: string
  ipcPort?: number
}

const demos = new Map<string, RunningDemo>()
let cachedSocket: string | null = null

async function getSocket(): Promise<string> {
  if (cachedSocket) {
    // Verify it still exists
    if (existsSync(cachedSocket)) return cachedSocket
    cachedSocket = null
  }
  const socket = await findKittySocket()
  if (!socket) {
    throw new Error(
      "No kitty socket found. Launch kitty with:\n" +
      "  kitty --override allow_remote_control=yes --override 'listen_on=unix:/tmp/kitty'"
    )
  }
  cachedSocket = socket
  return socket
}

// ── MCP Server ──

const server = new McpServer(
  { name: "tge-devtools", version: "0.0.1" },
  {
    capabilities: { logging: {} },
    instructions: [
      "TGE DevTools — control TGE terminal demos from the AI agent.",
      "",
      "Workflow:",
      "1. tge_launch — start a demo in a new kitty tab",
      "2. tge_screenshot — see what's on screen (returns image)",
      "3. tge_send_key / tge_click / tge_drag / tge_scroll — interact",
      "4. tge_inspect — get layout tree from running demo (requires IPC)",
      "5. tge_stop — kill the demo",
      "",
      "The tge_status tool shows all running demos and kitty connection info.",
      "",
      "Mouse coordinates are in TERMINAL CELLS (col, row), not pixels.",
      "To find where to click, take a screenshot and estimate cell position.",
      "A typical terminal cell is ~7px wide and ~14px tall.",
    ].join("\n"),
  }
)

// ── Tool: tge_status ──

server.registerTool(
  "tge_status",
  {
    title: "TGE Status",
    description: "Show kitty connection status, running demos, and available windows",
    inputSchema: z.object({}),
  },
  async () => {
    try {
      const socket = await getSocket()
      const windows = await listWindows(socket)

      const lines = [
        `Socket: ${socket}`,
        `OS Windows: ${windows.length}`,
        "",
      ]

      for (const osWin of windows) {
        lines.push(`OS Window ${osWin.id} (platform=${osWin.platformWindowId}, active=${osWin.isActive})`)
        for (const tab of osWin.tabs) {
          lines.push(`  Tab "${tab.title}" (id=${tab.id}, active=${tab.isActive})`)
          for (const win of tab.windows) {
            lines.push(`    Window ${win.id}: "${win.title}" ${win.columns}x${win.lines} cwd=${win.cwd}`)
          }
        }
      }

      if (demos.size > 0) {
        lines.push("", "Running demos:")
        for (const [name, demo] of demos) {
          const age = Math.round((Date.now() - demo.launchedAt) / 1000)
          lines.push(`  ${name}: window=${demo.windowId} script=${demo.script} age=${age}s`)
        }
      } else {
        lines.push("", "No demos running")
      }

      return { content: [{ type: "text" as const, text: lines.join("\n") }] }
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: `Error: ${e.message}` }], isError: true }
    }
  }
)

// ── Tool: tge_launch ──

server.registerTool(
  "tge_launch",
  {
    title: "Launch TGE Demo",
    description:
      "Launch a TGE demo script in a new kitty tab. " +
      "Pass the script path relative to the vexart project root (e.g. 'examples/lightcode.tsx'). " +
      "Returns the demo name for use with other tools.",
    inputSchema: z.object({
      script: z.string().describe("Path to the TGE script (e.g. 'examples/lightcode.tsx')"),
      name: z.string().optional().describe("Name for this demo instance (default: script basename)"),
      env: z.record(z.string(), z.string()).optional().describe("Extra environment variables"),
    }),
  },
  async ({ script, name, env }) => {
    try {
      const socket = await getSocket()
      const projectRoot = process.env.TGE_PROJECT_ROOT || "/Users/dev/vexart"

      // Resolve script path
      const scriptPath = script.startsWith("/") ? script : `${projectRoot}/${script}`
      if (!existsSync(scriptPath)) {
        return {
          content: [{ type: "text" as const, text: `Script not found: ${scriptPath}` }],
          isError: true,
        }
      }

      const demoName = name || script.replace(/^.*\//, "").replace(/\.[^.]+$/, "")

      // Stop existing demo with same name
      if (demos.has(demoName)) {
        try {
          await closeWindow(demos.get(demoName)!.socket, demos.get(demoName)!.windowId)
        } catch { /* ignore */ }
        demos.delete(demoName)
      }

      // Build the bun command
      const cmd = ["bun", "--conditions=browser", "run", scriptPath]

      const windowId = await launchTab(socket, {
        title: `TGE: ${demoName}`,
        cwd: projectRoot,
        cmd,
        env,
      })

      // Focus the demo tab so screenshots capture it
      await Bun.sleep(300)
      await focusWindow(socket, windowId)

      // Give the demo a moment to render
      await Bun.sleep(1500)

      // Find the actual PID from kitty
      const windows = await listWindows(socket)
      let pid = 0
      for (const osWin of windows) {
        for (const tab of osWin.tabs) {
          for (const win of tab.windows) {
            if (win.id === windowId) pid = win.pid
          }
        }
      }

      demos.set(demoName, {
        windowId,
        pid,
        script,
        launchedAt: Date.now(),
        socket,
      })

      return {
        content: [{
          type: "text" as const,
          text: [
            `Launched "${demoName}" in kitty window ${windowId}`,
            `Script: ${script}`,
            `PID: ${pid}`,
            ``,
            `Use tge_screenshot to see the output.`,
            `Use tge_stop with name="${demoName}" to kill it.`,
          ].join("\n"),
        }],
      }
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: `Launch failed: ${e.message}` }], isError: true }
    }
  }
)

// ── Tool: tge_screenshot ──

server.registerTool(
  "tge_screenshot",
  {
    title: "Screenshot TGE Demo",
    description:
      "Capture a screenshot of the kitty window running a TGE demo. " +
      "Returns the image directly so you can see what's on screen. " +
      "If no demo name given, captures the most recently launched demo.",
    inputSchema: z.object({
      name: z.string().optional().describe("Demo name (from tge_launch). If omitted, captures the active kitty window."),
      delay: z.number().optional().describe("Delay in ms before capturing (default: 200, useful for animations)"),
    }),
  },
  async ({ name, delay }) => {
    try {
      // Focus the demo tab first so the screenshot shows it
      if (name) {
        const demo = demos.get(name)
        if (demo) {
          await focusWindow(demo.socket, demo.windowId)
          await Bun.sleep(200)
        }
      }

      if (delay) await Bun.sleep(delay)

      // Find the CGWindowID for the kitty OS window
      const cgId = await findCGWindowId({
        title: name ? `TGE: ${name}` : undefined,
      })

      if (!cgId) {
        return {
          content: [{ type: "text" as const, text: "No visible kitty window found for screenshot" }],
          isError: true,
        }
      }

      const outPath = `/tmp/tge-screenshot-${Date.now()}.png`
      await screenshot(cgId, outPath)

      // Read and return as base64 image
      const imageData = readFileSync(outPath)
      const base64 = imageData.toString("base64")

      return {
        content: [
          {
            type: "image" as const,
            data: base64,
            mimeType: "image/png",
          },
          {
            type: "text" as const,
            text: `Screenshot captured (${imageData.length} bytes, CGWindowID=${cgId})`,
          },
        ],
      }
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: `Screenshot failed: ${e.message}` }], isError: true }
    }
  }
)

// ── Tool: tge_send_key ──

server.registerTool(
  "tge_send_key",
  {
    title: "Send Key to TGE Demo",
    description:
      "Send keyboard input to a running TGE demo. " +
      "Accepts kitty key names: 'escape', 'enter', 'tab', 'backspace', 'up', 'down', 'left', 'right', " +
      "'a'-'z', '0'-'9', 'f1'-'f12', 'ctrl+c', 'ctrl+d', etc. " +
      "For plain text, use tge_send_text instead.",
    inputSchema: z.object({
      name: z.string().describe("Demo name (from tge_launch)"),
      key: z.string().describe("Key to send (e.g. 'escape', 'enter', 'tab', 'ctrl+c')"),
    }),
  },
  async ({ name, key }) => {
    try {
      const demo = demos.get(name)
      if (!demo) {
        return {
          content: [{ type: "text" as const, text: `No demo named "${name}". Use tge_status to see running demos.` }],
          isError: true,
        }
      }
      await sendKey(demo.socket, demo.windowId, key)
      return { content: [{ type: "text" as const, text: `Sent key "${key}" to ${name}` }] }
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: `Send key failed: ${e.message}` }], isError: true }
    }
  }
)

// ── Tool: tge_send_text ──

server.registerTool(
  "tge_send_text",
  {
    title: "Send Text to TGE Demo",
    description: "Send raw text to a running TGE demo (as if typed).",
    inputSchema: z.object({
      name: z.string().describe("Demo name"),
      text: z.string().describe("Text to send (use \\n for newline)"),
    }),
  },
  async ({ name, text }) => {
    try {
      const demo = demos.get(name)
      if (!demo) {
        return {
          content: [{ type: "text" as const, text: `No demo named "${name}".` }],
          isError: true,
        }
      }
      await sendText(demo.socket, demo.windowId, text)
      return { content: [{ type: "text" as const, text: `Sent text to ${name}` }] }
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: `Send text failed: ${e.message}` }], isError: true }
    }
  }
)

// ── Tool: tge_click ──

server.registerTool(
  "tge_click",
  {
    title: "Click in TGE Demo",
    description:
      "Send a mouse click at terminal cell coordinates (col, row). " +
      "Col 1 and Row 1 are the top-left corner. " +
      "Take a screenshot first to find the right coordinates.",
    inputSchema: z.object({
      name: z.string().describe("Demo name"),
      col: z.number().int().min(1).describe("Column (1-based, left to right)"),
      row: z.number().int().min(1).describe("Row (1-based, top to bottom)"),
      button: z.enum(["left", "middle", "right"]).optional().describe("Mouse button (default: left)"),
    }),
  },
  async ({ name, col, row, button }) => {
    try {
      const demo = demos.get(name)
      if (!demo) {
        return {
          content: [{ type: "text" as const, text: `No demo named "${name}".` }],
          isError: true,
        }
      }
      const btn = button === "right" ? 2 : button === "middle" ? 1 : 0
      await sendMouseClick(demo.socket, demo.windowId, col, row, btn as 0 | 1 | 2)
      return { content: [{ type: "text" as const, text: `Clicked (${col}, ${row}) button=${button || "left"} in ${name}` }] }
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: `Click failed: ${e.message}` }], isError: true }
    }
  }
)

// ── Tool: tge_drag ──

server.registerTool(
  "tge_drag",
  {
    title: "Drag in TGE Demo",
    description:
      "Send a mouse drag from (startCol, startRow) to (endCol, endRow). " +
      "Generates press → motion → release events. Useful for dragging panels, sliders, etc.",
    inputSchema: z.object({
      name: z.string().describe("Demo name"),
      startCol: z.number().int().min(1).describe("Start column"),
      startRow: z.number().int().min(1).describe("Start row"),
      endCol: z.number().int().min(1).describe("End column"),
      endRow: z.number().int().min(1).describe("End row"),
      steps: z.number().int().min(2).max(100).optional().describe("Number of motion steps (default: 10)"),
    }),
  },
  async ({ name, startCol, startRow, endCol, endRow, steps }) => {
    try {
      const demo = demos.get(name)
      if (!demo) {
        return {
          content: [{ type: "text" as const, text: `No demo named "${name}".` }],
          isError: true,
        }
      }
      await sendMouseDrag(demo.socket, demo.windowId, startCol, startRow, endCol, endRow, 0, steps || 10)
      return {
        content: [{
          type: "text" as const,
          text: `Dragged (${startCol},${startRow}) → (${endCol},${endRow}) in ${name}`,
        }],
      }
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: `Drag failed: ${e.message}` }], isError: true }
    }
  }
)

// ── Tool: tge_scroll ──

server.registerTool(
  "tge_scroll",
  {
    title: "Scroll in TGE Demo",
    description: "Send mouse scroll events at the given position.",
    inputSchema: z.object({
      name: z.string().describe("Demo name"),
      col: z.number().int().min(1).describe("Column"),
      row: z.number().int().min(1).describe("Row"),
      direction: z.enum(["up", "down"]).describe("Scroll direction"),
      count: z.number().int().min(1).max(50).optional().describe("Number of scroll ticks (default: 3)"),
    }),
  },
  async ({ name, col, row, direction, count }) => {
    try {
      const demo = demos.get(name)
      if (!demo) {
        return {
          content: [{ type: "text" as const, text: `No demo named "${name}".` }],
          isError: true,
        }
      }
      await sendMouseScroll(demo.socket, demo.windowId, col, row, direction, count || 3)
      return { content: [{ type: "text" as const, text: `Scrolled ${direction} x${count || 3} at (${col},${row}) in ${name}` }] }
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: `Scroll failed: ${e.message}` }], isError: true }
    }
  }
)

// ── Tool: tge_stop ──

server.registerTool(
  "tge_stop",
  {
    title: "Stop TGE Demo",
    description: "Stop a running TGE demo by closing its kitty window.",
    inputSchema: z.object({
      name: z.string().describe("Demo name to stop"),
    }),
  },
  async ({ name }) => {
    try {
      const demo = demos.get(name)
      if (!demo) {
        return {
          content: [{ type: "text" as const, text: `No demo named "${name}". Running: ${[...demos.keys()].join(", ") || "none"}` }],
          isError: true,
        }
      }

      try {
        await closeWindow(demo.socket, demo.windowId)
      } catch {
        // Window might already be closed
      }
      demos.delete(name)

      return { content: [{ type: "text" as const, text: `Stopped demo "${name}"` }] }
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: `Stop failed: ${e.message}` }], isError: true }
    }
  }
)

// ── Tool: tge_get_text ──

server.registerTool(
  "tge_get_text",
  {
    title: "Get Terminal Text",
    description: "Get the text content visible in the demo's terminal window (for reading logs/errors).",
    inputSchema: z.object({
      name: z.string().describe("Demo name"),
    }),
  },
  async ({ name }) => {
    try {
      const demo = demos.get(name)
      if (!demo) {
        return {
          content: [{ type: "text" as const, text: `No demo named "${name}".` }],
          isError: true,
        }
      }
      const text = await getText(demo.socket, demo.windowId)
      return { content: [{ type: "text" as const, text }] }
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: `Get text failed: ${e.message}` }], isError: true }
    }
  }
)

// ── Tool: tge_resize ──

server.registerTool(
  "tge_resize",
  {
    title: "Resize Kitty Window",
    description: "Resize the kitty OS window for consistent screenshot dimensions.",
    inputSchema: z.object({
      width: z.number().int().min(200).describe("Width in pixels"),
      height: z.number().int().min(200).describe("Height in pixels"),
    }),
  },
  async ({ width, height }) => {
    try {
      const socket = await getSocket()
      const { $ } = await import("bun")
      await $`kitty @ --to unix:${socket} resize-os-window --width ${width} --height ${height} --unit pixels`.quiet()
      return { content: [{ type: "text" as const, text: `Resized kitty window to ${width}x${height}px` }] }
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: `Resize failed: ${e.message}` }], isError: true }
    }
  }
)

// ── Launch server ──

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("TGE DevTools MCP server running on stdio")
  console.error(`Project root: ${process.env.TGE_PROJECT_ROOT || "/Users/dev/vexart"}`)

  // Try to find socket at startup
  try {
    const socket = await findKittySocket()
    if (socket) {
      console.error(`Kitty socket: ${socket}`)
      cachedSocket = socket
    } else {
      console.error("No kitty socket found — launch kitty with remote control enabled")
    }
  } catch {
    console.error("Could not discover kitty socket at startup")
  }
}

main().catch((e) => {
  console.error("Fatal:", e)
  process.exit(1)
})
