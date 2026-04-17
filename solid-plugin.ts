/**
 * Bun preload plugin — transforms .tsx/.jsx files through babel-preset-solid
 * with { generate: "universal", moduleName: "@vexart/engine" }.
 *
 * This makes SolidJS JSX compile to our custom createRenderer instead of
 * the DOM renderer. Without this, Bun's built-in JSX transpiler would
 * emit React-style createElement calls.
 *
 * Also guards against SolidJS server mode — if solid-js resolves to
 * dist/server.js, all reactivity is dead (createEffect is a no-op).
 *
 * Registered via bunfig.toml: preload = ["./solid-plugin.ts"]
 */

import { plugin } from "bun"

// ── Guard: detect SolidJS server mode (zero reactivity) ──
// Bun resolves solid-js to dist/server.js under the "node" export condition.
// The server build has NO reactive scheduling — createEffect, createMemo, etc.
// are all no-ops. This kills ALL interactivity in TGE.
// Fix: run with --conditions=browser (e.g. bun --conditions=browser run file.tsx)
//
// Only check when running .tsx files — build scripts and tools don't need
// SolidJS reactivity and shouldn't be blocked.
const entryFile = Bun.main
if (entryFile.endsWith(".tsx")) {
  const solidPath = require.resolve("solid-js")
  if (solidPath.includes("server")) {
    console.error("\x1b[31m" + "━".repeat(70))
    console.error("FATAL: SolidJS resolved to server mode (no reactivity)")
    console.error(`  → ${solidPath}`)
    console.error("")
    console.error("TGE requires the browser runtime. Run with --conditions=browser:")
    console.error("  bun --conditions=browser run your-app.tsx")
    console.error("  bun run showcase  (uses the flag automatically)")
    console.error("━".repeat(70) + "\x1b[0m")
    process.exit(1)
  }
}

plugin({
  name: "solid-jsx",
  setup(build) {
    const { transformSync } = require("@babel/core")

    build.onLoad({ filter: /\.[jt]sx$/ }, async (args) => {
      const source = await Bun.file(args.path).text()

      const result = transformSync(source, {
        filename: args.path,
        presets: [
          [
            "babel-preset-solid",
            {
              generate: "universal",
              moduleName: "@vexart/engine",
            },
          ],
          ["@babel/preset-typescript", { onlyRemoveTypeImports: true }],
        ],
        sourceMaps: "inline",
      })

      return {
        contents: result?.code ?? source,
        loader: "js",
      }
    })
  },
})
