/**
 * Bun preload plugin for Vexart consumers.
 *
 * Transforms .tsx/.jsx files through babel-preset-solid with
 * { generate: "universal", moduleName: "@vexart/engine" }.
 *
 * Setup in your bunfig.toml:
 *   preload = ["vexart/solid-plugin.ts"]
 */

import { plugin } from "bun"

plugin({
  name: "vexart-solid-jsx",
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
