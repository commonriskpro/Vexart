process.env.LIGHTCODE_CANVAS_BACKEND = "wgpu"
process.env.TGE_RENDERER_BACKEND = "gpu"
process.env.LIGHTCODE_LOG_FPS = process.env.LIGHTCODE_LOG_FPS ?? "1"
process.env.TGE_FORCE_TRANSMISSION_MODE = "shm"
process.env.TGE_DEBUG_CADENCE = "1"
process.env.TGE_DEBUG_DIRTY = "1"

await import("./lightcode-gpu-first")

export {}
