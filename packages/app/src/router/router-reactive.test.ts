import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { createAppRouter, RouteOutlet } from "./router"

describe("RouteOutlet reactivity", () => {
  test("re-renders after router.push", () => createRoot((dispose) => {
    const router = createAppRouter([
      { path: "/", component: () => "home" },
      { path: "/about", component: () => "about" },
    ], "/")

    const outlet = RouteOutlet({ router }) as unknown as () => unknown
    expect(outlet()).toBe("home")

    router.push("/about")
    expect(outlet()).toBe("about")

    dispose()
  }))

  test("re-renders after router.back", () => createRoot((dispose) => {
    const router = createAppRouter([
      { path: "/", component: () => "home" },
      { path: "/about", component: () => "about" },
    ], "/")

    const outlet = RouteOutlet({ router }) as unknown as () => unknown
    router.push("/about")
    expect(outlet()).toBe("about")

    router.back()
    expect(outlet()).toBe("home")

    dispose()
  }))
})
