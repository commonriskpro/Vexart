process.env.TGE_RENDERER_BACKEND = "gpu"
process.env.TGE_EXIT_AFTER_MS = process.env.TGE_EXIT_AFTER_MS ?? "4000"

export {}
await import("./backdrop-corner-radii-test")
