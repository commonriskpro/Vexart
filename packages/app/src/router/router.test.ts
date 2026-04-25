import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { createAppRouter, matchRoute, normalizePath, RouteOutlet, type AppRouteDefinition } from "./router"

const Component = () => null

describe("app router", () => {
  const routes: AppRouteDefinition[] = [
    { path: "/", component: Component },
    { path: "/projects", component: Component },
    { path: "/projects/[id]", component: Component },
  ]

  test("normalizes paths", () => {
    expect(normalizePath("projects/alpha?tab=logs")).toBe("/projects/alpha")
    expect(normalizePath("/")).toBe("/")
  })

  test("matches static and dynamic routes", () => {
    expect(matchRoute(routes, "/projects")?.params).toEqual({})
    expect(matchRoute(routes, "/projects/abc")?.params).toEqual({ id: "abc" })
    expect(matchRoute(routes, "/missing")).toBeNull()
  })

  test("matches catch-all routes for generated not-found pages", () => {
    const match = matchRoute([
      { path: "/", component: Component },
      { path: "/[...notFound]", component: Component },
    ], "/missing/deep")

    expect(match?.params).toEqual({ notFound: "missing/deep" })
  })

  test("navigates with push replace back and forward", () => createRoot((dispose) => {
    const router = createAppRouter(routes, "/")

    router.push("/projects")
    router.push("/projects/abc")
    expect(router.current()).toEqual({ path: "/projects/abc", params: { id: "abc" } })
    expect(router.back()).toBe(true)
    expect(router.current().path).toBe("/projects")
    router.replace("/projects/xyz")
    expect(router.current()).toEqual({ path: "/projects/xyz", params: { id: "xyz" } })
    expect(router.forward()).toBe(true)
    expect(router.current().path).toBe("/projects/abc")

    dispose()
  }))

  test("renders current route through RouteOutlet", () => createRoot((dispose) => {
    const router = createAppRouter([
      { path: "/", component: () => "home" },
      { path: "/projects/[id]", component: (props) => `project:${props.params.id}` },
    ], "/projects/abc")

    expect(RouteOutlet({ router })).toBe("project:abc")

    dispose()
  }))

  test("wraps route components with layouts", () => createRoot((dispose) => {
    const router = createAppRouter([
      {
        path: "/",
        component: () => "content",
        layouts: [
          (props) => `outer:${props.children}`,
          (props) => `inner:${props.children}`,
        ],
      },
    ])

    expect(RouteOutlet({ router })).toBe("outer:inner:content")

    dispose()
  }))

  test("renders route error boundary", () => createRoot((dispose) => {
    const router = createAppRouter([
      {
        path: "/",
        component: () => { throw new Error("boom") },
        error: (props) => props.error instanceof Error ? props.error.message : "unknown",
      },
    ])

    expect(RouteOutlet({ router })).toBe("boom")

    dispose()
  }))

  test("restores focus after navigation", async () => {
    const restored: string[] = []
    const router = createAppRouter(routes, "/", {
      onFocus: (focusId) => restored.push(focusId),
    })

    router.push("/projects", { focusId: "projects-list" })
    await new Promise((resolve) => queueMicrotask(resolve))

    expect(restored).toEqual(["projects-list"])
  })
})
