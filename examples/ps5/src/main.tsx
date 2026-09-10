import { createApp } from "vexart"
import { Ps5App } from "./app"
import { createDefaultSeed } from "./catalog"
import { createPs5Store } from "./store"
import { homedir } from "node:os"
import { join } from "node:path"

export { Ps5App } from "./app"
export type { Ps5AppProps } from "./app"

const statePath = process.env.PS5_DEMO_STATE ?? join(homedir(), ".local", "state", "vexart", "ps5-demo", "state.json")
const store = createPs5Store(createDefaultSeed(), { persistence: statePath })

await createApp(() => <Ps5App store={store} />, {
  quit: ["ctrl+c"],
})
