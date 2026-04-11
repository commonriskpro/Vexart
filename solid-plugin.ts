/**
 * Bun preload plugin — transforms .tsx/.jsx files through babel-preset-solid
 * with { generate: "universal", moduleName: "@tge/renderer" }.
 *
 * This makes SolidJS JSX compile to our custom createRenderer instead of
 * the DOM renderer. Without this, Bun's built-in JSX transpiler would
 * emit React-style createElement calls.
 *
 * Registered via bunfig.toml: preload = ["./solid-plugin.ts"]
 */

import { plugin } from "bun"

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
              moduleName: "@tge/renderer",
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
