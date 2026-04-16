process.env.LIGHTCODE_CANVAS_BACKEND = "cpu"
process.env.TGE_RENDERER_BACKEND = "cpu"
process.env.LIGHTCODE_LOG_FPS = process.env.LIGHTCODE_LOG_FPS ?? "1"

await import("./lightcode-gpu-first")

export {}
