# Vexart Application Template Starter

A minimal, production-ready starter setup for Bun + Vexart.

## 1. `package.json`
```json
{
  "name": "my-vexart-app",
  "module": "src/index.tsx",
  "type": "module",
  "scripts": {
    "dev": "bun --conditions=browser run src/index.tsx",
    "start": "bun --conditions=browser run src/index.tsx"
  },
  "dependencies": {
    "vexart": "^0.10.0"
  },
  "devDependencies": {
    "@babel/core": "^7.26.0",
    "babel-preset-solid": "^1.9.0",
    "typescript": "^5.8.0"
  }
}
```

## 2. `solid-plugin.ts`
```ts
import { plugin } from "bun"
import { transformSync } from "@babel/core"
import solidPreset from "babel-preset-solid"

plugin({
  name: "solid-transform",
  setup(build) {
    build.onLoad({ filter: /\.[jt]sx$/ }, async (args) => {
      const source = await Bun.file(args.path).text()
      const result = transformSync(source, {
        filename: args.path,
        presets: [
          [
            solidPreset,
            {
              generate: "universal",
              moduleName: "vexart/jsx-runtime",
            },
          ],
        ],
      })
      return {
        contents: result?.code ?? "",
        loader: "js",
      }
    })
  },
})
```

## 3. `bunfig.toml`
```toml
preload = ["./solid-plugin.ts"]
```

## 4. `src/index.tsx`
```tsx
import { createApp, colors, VoidCard, VoidCardTitle, VoidButton } from "vexart"

function App() {
  return (
    <box
      width="100%"
      height="100%"
      direction="column"
      backgroundColor={colors.background}
      alignX="center"
      alignY="center"
    >
      <VoidCard width={400}>
        <VoidCardTitle>Welcome to Vexart</VoidCardTitle>
        <VoidButton variant="primary" onPress={() => console.log("Hello!")}>
          Get Started
        </VoidButton>
      </VoidCard>
    </box>
  )
}

createApp(() => <App />, { quit: ["ctrl+c"] })
```

## 5. Running
```bash
bun install
bun run dev
```

