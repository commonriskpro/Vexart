/**
 * Bun preload plugin for TGE consumers.
 *
 * Transforms .tsx/.jsx files through babel-preset-solid with
 * { generate: "universal", moduleName: "tge" }.
 *
 * Setup in your bunfig.toml:
 *   preload = ["tge/solid-plugin.ts"]
 */

import { plugin } from "bun"

plugin({
  name: "tge-solid-jsx",
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
              moduleName: "tge",
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
