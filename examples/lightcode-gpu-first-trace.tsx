process.env.LIGHTCODE_LOG_FPS = process.env.LIGHTCODE_LOG_FPS ?? "1"
process.env.LIGHTCODE_GPU_FIRST_TRACE = process.env.LIGHTCODE_GPU_FIRST_TRACE ?? "1"

export {}

await import("./lightcode-gpu-first")
