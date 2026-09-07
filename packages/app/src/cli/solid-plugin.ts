type BabelTransform = {
  transformSync: (source: string, options: {
    filename: string
    presets: unknown[]
    sourceMaps: "inline"
  }) => { code?: string | null } | null
}

/**
 * Transform consumer JSX to Solid's universal renderer for `vexart build`.
 *
 * The published package owns the `vexart/engine` entry point, so generated
 * code uses the same engine module as the unified `vexart` barrel.
 */
export const solidJsxPlugin: Bun.BunPlugin = {
  name: "vexart-solid-jsx",
  target: "bun",
  setup(build) {
    build.onLoad({ filter: /\.[jt]sx$/ }, async ({ path }) => {
      const { transformSync } = require("@babel/core") as BabelTransform
      const source = await Bun.file(path).text()
      const result = transformSync(source, {
        filename: path,
        presets: [
          ["babel-preset-solid", { generate: "universal", moduleName: "vexart/engine" }],
          ["@babel/preset-typescript", { onlyRemoveTypeImports: true }],
        ],
        sourceMaps: "inline",
      })
      return { contents: result?.code ?? source, loader: "js" }
    })
  },
}
