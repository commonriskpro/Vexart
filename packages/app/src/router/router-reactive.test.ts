import { describe, expect, test } from "bun:test"
import { createComputed, createRoot, onCleanup } from "solid-js"
import { createAppRouter, RouteOutlet, type RouteComponent } from "./router"

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

  test("synchronous strict disposal executes onCleanup immediately when navigating from Route A to Route B", () => createRoot((dispose) => {
    let cleanedUpA = false
    let cleanedUpB = false

    const router = createAppRouter([
      {
        path: "/a",
        component: () => {
          onCleanup(() => {
            cleanedUpA = true
          })
          return "page-a"
        },
      },
      {
        path: "/b",
        component: () => {
          onCleanup(() => {
            cleanedUpB = true
          })
          return "page-b"
        },
      },
    ], "/a")

    const outlet = RouteOutlet({ router }) as unknown as () => unknown
    expect(outlet()).toBe("page-a")
    expect(cleanedUpA).toBe(false)
    expect(cleanedUpB).toBe(false)

    router.push("/b")
    expect(outlet()).toBe("page-b")
    expect(cleanedUpA).toBe(true)
    expect(cleanedUpB).toBe(false)

    dispose()
    expect(cleanedUpB).toBe(true)
  }))

  test("navigating with dynamic params does not remount component and updates params reactively", () => createRoot((dispose) => {
    let mountCount = 0
    let currentParamId = ""

    const router = createAppRouter([
      {
        path: "/items/[id]",
        component: ((props: { params: Record<string, string> }) => {
          mountCount++
          createComputed(() => {
            currentParamId = props.params.id
          })
          return () => `item:${props.params.id}`
        }) as unknown as RouteComponent,
      },
    ], "/items/1")

    const outlet = RouteOutlet({ router }) as unknown as () => () => string
    const render1 = outlet()
    expect(mountCount).toBe(1)
    expect(render1()).toBe("item:1")
    expect(currentParamId).toBe("1")

    router.push("/items/2")
    const render2 = outlet()
    expect(mountCount).toBe(1)
    expect(render2).toBe(render1)
    expect(currentParamId).toBe("2")
    expect(render2()).toBe("item:2")

    router.push("/items/3")
    const render3 = outlet()
    expect(mountCount).toBe(1)
    expect(render3).toBe(render1)
    expect(currentParamId).toBe("3")
    expect(render3()).toBe("item:3")

    dispose()
  }))

  test("keepAlive: true preserves route without calling onCleanup and restores without remounting", () => createRoot((dispose) => {
    let mountCountA = 0
    let cleanedUpA = false
    let mountCountB = 0
    let cleanedUpB = false

    const router = createAppRouter([
      {
        path: "/keep-a",
        keepAlive: true,
        component: () => {
          mountCountA++
          onCleanup(() => {
            cleanedUpA = true
          })
          return "keep-a-content"
        },
      },
      {
        path: "/normal-b",
        component: () => {
          mountCountB++
          onCleanup(() => {
            cleanedUpB = true
          })
          return "normal-b-content"
        },
      },
    ], "/keep-a")

    const outlet = RouteOutlet({ router }) as unknown as () => unknown
    expect(outlet()).toBe("keep-a-content")
    expect(mountCountA).toBe(1)
    expect(cleanedUpA).toBe(false)

    router.push("/normal-b")
    expect(outlet()).toBe("normal-b-content")
    expect(mountCountB).toBe(1)
    expect(cleanedUpA).toBe(false)
    expect(cleanedUpB).toBe(false)

    router.push("/keep-a")
    expect(outlet()).toBe("keep-a-content")
    expect(mountCountA).toBe(1)
    expect(cleanedUpA).toBe(false)
    expect(cleanedUpB).toBe(true)

    dispose()
    expect(cleanedUpA).toBe(true)
  }))

  test("keepAlive LRU cache disposes oldest cached page when exceeding capacity of 3", () => createRoot((dispose) => {
    const cleanedUp: Record<string, boolean> = {
      k1: false,
      k2: false,
      k3: false,
      k4: false,
      k5: false,
    }

    const router = createAppRouter([
      {
        path: "/k1",
        keepAlive: true,
        component: () => {
          onCleanup(() => { cleanedUp.k1 = true })
          return "k1"
        },
      },
      {
        path: "/k2",
        keepAlive: true,
        component: () => {
          onCleanup(() => { cleanedUp.k2 = true })
          return "k2"
        },
      },
      {
        path: "/k3",
        keepAlive: true,
        component: () => {
          onCleanup(() => { cleanedUp.k3 = true })
          return "k3"
        },
      },
      {
        path: "/k4",
        keepAlive: true,
        component: () => {
          onCleanup(() => { cleanedUp.k4 = true })
          return "k4"
        },
      },
      {
        path: "/k5",
        component: () => {
          onCleanup(() => { cleanedUp.k5 = true })
          return "k5"
        },
      },
    ], "/k1")

    const outlet = RouteOutlet({ router }) as unknown as () => unknown
    expect(outlet()).toBe("k1")

    // Navigate to k2 (k1 cached)
    router.push("/k2")
    expect(outlet()).toBe("k2")
    expect(cleanedUp.k1).toBe(false)

    // Navigate to k3 (k1, k2 cached)
    router.push("/k3")
    expect(outlet()).toBe("k3")
    expect(cleanedUp.k1).toBe(false)
    expect(cleanedUp.k2).toBe(false)

    // Navigate to k4 (k1, k2, k3 cached - capacity 3 reached)
    router.push("/k4")
    expect(outlet()).toBe("k4")
    expect(cleanedUp.k1).toBe(false)
    expect(cleanedUp.k2).toBe(false)
    expect(cleanedUp.k3).toBe(false)

    // Navigate to k5 (k4 added, cache size exceeds 3 -> oldest k1 is disposed)
    router.push("/k5")
    expect(outlet()).toBe("k5")
    expect(cleanedUp.k1).toBe(true)
    expect(cleanedUp.k2).toBe(false)
    expect(cleanedUp.k3).toBe(false)
    expect(cleanedUp.k4).toBe(false)

    dispose()
  }))

  test("keepAlive LRU cache updates access recency on re-navigation", () => createRoot((dispose) => {
    const cleanedUp: Record<string, boolean> = {
      k1: false,
      k2: false,
      k3: false,
      k4: false,
    }

    const router = createAppRouter([
      {
        path: "/k1",
        keepAlive: true,
        component: () => {
          onCleanup(() => { cleanedUp.k1 = true })
          return "k1"
        },
      },
      {
        path: "/k2",
        keepAlive: true,
        component: () => {
          onCleanup(() => { cleanedUp.k2 = true })
          return "k2"
        },
      },
      {
        path: "/k3",
        keepAlive: true,
        component: () => {
          onCleanup(() => { cleanedUp.k3 = true })
          return "k3"
        },
      },
      {
        path: "/k4",
        keepAlive: true,
        component: () => {
          onCleanup(() => { cleanedUp.k4 = true })
          return "k4"
        },
      },
      {
        path: "/target",
        component: () => "target",
      },
    ], "/k1")

    const outlet = RouteOutlet({ router }) as unknown as () => unknown
    expect(outlet()).toBe("k1")

    // Cache k1, k2; active is k3
    router.push("/k2")
    outlet()
    router.push("/k3")
    outlet()

    // Re-visit k1: touches k1, making it newer than k2
    router.push("/k1")
    outlet()

    // Navigate to k4: caches k1. Active is k4. Cache has k2, k3, k1.
    router.push("/k4")
    outlet()

    // Navigate to /target: caches k4. Cache has k2, k3, k1, k4 (4 items).
    // Oldest is k2, so k2 must be disposed, NOT k1!
    router.push("/target")
    expect(outlet()).toBe("target")
    expect(cleanedUp.k2).toBe(true)
    expect(cleanedUp.k1).toBe(false)
    expect(cleanedUp.k3).toBe(false)
    expect(cleanedUp.k4).toBe(false)

    dispose()
  }))

  test("unmounting RouteOutlet disposes activeRoot and all cached entries", () => createRoot((dispose) => {
    let cleanedUpA = false
    let cleanedUpB = false

    const router = createAppRouter([
      {
        path: "/a",
        keepAlive: true,
        component: () => {
          onCleanup(() => { cleanedUpA = true })
          return "a"
        },
      },
      {
        path: "/b",
        keepAlive: true,
        component: () => {
          onCleanup(() => { cleanedUpB = true })
          return "b"
        },
      },
    ], "/a")

    const outlet = RouteOutlet({ router }) as unknown as () => unknown
    expect(outlet()).toBe("a")
    router.push("/b")
    expect(outlet()).toBe("b")
    expect(cleanedUpA).toBe(false)
    expect(cleanedUpB).toBe(false)

    dispose()
    expect(cleanedUpA).toBe(true)
    expect(cleanedUpB).toBe(true)
  }))
})
