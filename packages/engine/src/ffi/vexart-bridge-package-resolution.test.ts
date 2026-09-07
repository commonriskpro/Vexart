import { describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, cpSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { suffix } from "bun:ffi"

function platformPackageName(): string {
  const arch = process.arch
  const os = process.platform
  if (os === "darwin") return arch === "arm64" ? "@vexart-native/darwin-arm64" : "@vexart-native/darwin-x64"
  if (os === "linux") return arch === "arm64" ? "@vexart-native/linux-arm64" : "@vexart-native/linux-x64"
  return "@vexart-native/win32-x64"
}

function nativeFixturePath(): string | undefined {
  const libName = `libvexart.${suffix}`
  const candidates = [
    join(import.meta.dir, "../../../../target/release/deps", libName),
    join(import.meta.dir, "../../../../target/release", libName),
    join(import.meta.dir, "../../../../native/libvexart/target/release", libName),
    join(import.meta.dir, "../../../../dist/platform", `${process.platform}-${process.arch}`, libName),
  ]
  return candidates.find((path) => existsSync(path))
}

describe("vexart bridge native package resolution", () => {
  test("loads a platform package beside the engine when cwd is unrelated", () => {
    const nativeFixture = nativeFixturePath()
    if (!nativeFixture) {
      expect(nativeFixture).toBeDefined()
      return
    }

    const root = mkdtempSync(join(tmpdir(), "vexart-native-loader-"))
    const cwd = mkdtempSync(join(tmpdir(), "vexart-native-loader-cwd-"))
    const packageRoot = join(root, "node_modules", "vexart")
    const nativeRoot = join(root, "node_modules", platformPackageName())
    const libName = `libvexart.${suffix}`
    const bridgePath = join(packageRoot, "vexart-bridge.ts")
    const packageLibPath = join(nativeRoot, libName)

    try {
      mkdirSync(packageRoot, { recursive: true })
      mkdirSync(nativeRoot, { recursive: true })
      cpSync(join(import.meta.dir, "vexart-bridge.ts"), bridgePath)
      symlinkSync(nativeFixture, packageLibPath)
      writeFileSync(join(nativeRoot, "package.json"), JSON.stringify({
        name: platformPackageName(),
        version: "0.0.0-test",
        type: "module",
        files: [libName],
      }))

      const child = Bun.spawnSync([
        process.execPath,
        "-e",
        `import(${JSON.stringify(pathToFileURL(bridgePath).href)}).then(({ openVexartLibrary, closeVexartLibrary }) => {
          openVexartLibrary()
          closeVexartLibrary()
          console.log("loaded")
        }).catch((error) => {
          console.error(error)
          process.exitCode = 1
        })`,
      ], { cwd, stdout: "pipe", stderr: "pipe" })

      expect(child.exitCode).toBe(0)
      expect(child.stdout.toString()).toContain("loaded")
    } finally {
      rmSync(root, { recursive: true, force: true })
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})
