import { describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { discoverAppRoutes, routeFilePathToRoutePath, writeRouteManifestModule } from "./manifest"

async function write(path: string, content = "export default function Page() { return null }\n") {
  mkdirSync(dirname(path), { recursive: true })
  await Bun.write(path, content)
}

describe("filesystem route manifest", () => {
  test("maps app files to route paths", () => {
    expect(routeFilePathToRoutePath("app/page.tsx")).toBe("/")
    expect(routeFilePathToRoutePath("app/projects/[id]/page.tsx")).toBe("/projects/[id]")
    expect(routeFilePathToRoutePath("app/(marketing)/about/page.tsx")).toBe("/about")
  })

  test("discovers pages layouts groups and private folders", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vexart-routes-test-"))
    try {
      await write(join(dir, "app/page.tsx"))
      await write(join(dir, "app/layout.tsx"), "export default function Layout(props) { return props.children }\n")
      await write(join(dir, "app/(workspace)/projects/[id]/page.tsx"))
      await write(join(dir, "app/(workspace)/projects/[id]/loading.tsx"))
      await write(join(dir, "app/(workspace)/layout.tsx"), "export default function Layout(props) { return props.children }\n")
      await write(join(dir, "app/_private/page.tsx"))

      const manifest = await discoverAppRoutes({ root: dir })

      expect(manifest.routes.map((route) => route.path)).toEqual(["/", "/projects/[id]"])
      expect(manifest.routes[1].layouts).toEqual(["app/layout.tsx", "app/(workspace)/layout.tsx"])
      expect(manifest.routes[1].loading).toBe("app/(workspace)/projects/[id]/loading.tsx")
      expect(manifest.files.some((file) => file.path.includes("_private"))).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("writes generated route module", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vexart-route-module-test-"))
    try {
      await write(join(dir, "app/page.tsx"))
      await write(join(dir, "app/not-found.tsx"))
      const manifest = await writeRouteManifestModule({ root: dir })

      expect(manifest.routes).toHaveLength(1)
      expect(existsSync(join(dir, ".vexart/routes.ts"))).toBe(true)
      expect(await Bun.file(join(dir, ".vexart/routes.ts")).text()).toContain("export const routes")
      expect(await Bun.file(join(dir, ".vexart/routes.ts")).text()).toContain("/[...notFound]")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
