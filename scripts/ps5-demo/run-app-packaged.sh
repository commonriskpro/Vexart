#!/usr/bin/env bash
set -euo pipefail

# Build the current source into a temporary real npm package, then run a
# consumer against that package. The repository dist/, node_modules/, config,
# and lockfiles are never touched.
repo=$(cd "$(dirname "$0")/../.." && pwd)
example="$repo/examples/ps5"
entry="probes/packaged-consumer.tsx"
mode=run

case "${1:-}" in
  ""|probe|consumer|--probe)
    [ "$#" -eq 0 ] || shift
    ;;
  app|source|--app|--source)
    entry="src/main.tsx"
    shift
    ;;
  verify|diagnostic|--verify)
    mode=verify
    entry=""
    shift
    ;;
  test|--test)
    mode=test
    entry="tests/store.test.ts"
    shift
    if [ "$#" -gt 0 ] && [ -e "$example/$1" ]; then
      entry=$1
      shift
    fi
    ;;
  --help|-h)
    cat <<'USAGE'
Usage: bash scripts/ps5-demo/run-app-packaged.sh [probe|app|verify|test|ENTRY] [args...]

Builds a fresh package from the current source in a temporary workspace, then
runs probes/packaged-consumer.tsx by default. `app` runs src/main.tsx and
`verify` checks the packaged public barrel/engine singleton, native bridge, and
real offscreen GPU output. `test` runs the packaged-safe store test (or a
supplied test path). ENTRY selects a relative examples/ps5 file.
USAGE
    exit 0
    ;;
  *)
    entry=$1
    shift
    ;;
esac

case "$entry" in
  *.test.ts|*.test.tsx|*.spec.ts|*.spec.tsx) mode=test ;;
esac

if [ "$mode" != verify ]; then
  case "$entry" in
    examples/ps5/*) entry=${entry#examples/ps5/} ;;
    /*|../*|*/../*)
      echo "PS5 packaged runner entry must be a relative path under examples/ps5: $entry" >&2
      exit 2
      ;;
  esac
fi

if [ "$mode" = verify ]; then
  :
elif [ "$mode" = test ]; then
  if [ ! -d "$example/$entry" ] && [ ! -f "$example/$entry" ]; then
    echo "PS5 packaged runner test path not found: examples/ps5/$entry" >&2
    exit 2
  fi
elif [ ! -f "$example/$entry" ]; then
  echo "PS5 packaged runner entry not found: examples/ps5/$entry" >&2
  exit 2
fi

work=$(mktemp -d "${TMPDIR:-/tmp}/vexart-ps5-packaged.XXXXXX")
trap 'rm -rf "$work"' EXIT
build="$work/build"
consumer="$work/consumer"

# build-dist.ts is intentionally copied rather than run from the repository:
# it cleans and writes only this workspace's dist/ directory.
mkdir -p "$build/packages" "$build/scripts"
for package in app engine headless styled; do
  cp -R "$repo/packages/$package" "$build/packages/$package"
done
cp -R "$repo/types" "$build/types"
cp "$repo/package.json" "$build/package.json"
cp "$repo/tsconfig.json" "$build/tsconfig.json"
cp "$repo/README.md" "$build/README.md"
[ -f "$repo/LICENSE" ] && cp "$repo/LICENSE" "$build/LICENSE"
cp "$repo/scripts/build-dist.ts" "$build/scripts/build-dist.ts"
cp "$repo/scripts/release-verification.mjs" "$build/scripts/release-verification.mjs"
cp "$repo/scripts/solid-plugin-dist.ts" "$build/scripts/solid-plugin-dist.ts"
ln -s "$repo/node_modules" "$build/node_modules"
[ -d "$repo/target" ] && ln -s "$repo/target" "$build/target"

(
  cd "$build"
  bun run scripts/build-dist.ts
)

mkdir -p "$consumer/examples/ps5" "$consumer/node_modules/@vexart" "$consumer/node_modules/@vexart-native"
for path in src tests probes; do
  if [ -d "$example/$path" ]; then
    cp -R "$example/$path" "$consumer/examples/ps5/$path"
  fi
done
for path in catalog.json catalog-provenance.json assets; do
  if [ -e "$example/$path" ]; then
    ln -s "$example/$path" "$consumer/examples/ps5/$path"
  fi
done
ln -s "$build/packages" "$consumer/packages"
ln -s "$build/dist" "$consumer/node_modules/vexart"

case "$(uname -s)" in
  Darwin) platform_os=darwin ;;
  Linux) platform_os=linux ;;
  *) platform_os=$(uname -s | tr '[:upper:]' '[:lower:]') ;;
esac
case "$(uname -m)" in
  arm64|aarch64) platform_arch=arm64 ;;
  *) platform_arch=x64 ;;
esac
platform_tag="$platform_os-$platform_arch"
if [ -d "$build/dist/platform/$platform_tag" ]; then
  ln -s "$build/dist/platform/$platform_tag" "$consumer/node_modules/@vexart-native/$platform_tag"
else
  echo "PS5 packaged runner platform package missing: $platform_tag" >&2
  exit 1
fi

# Reuse installed dependencies read-only, excluding stale vexart and native
# package aliases so the generated package is the only package under test.
for dependency in "$repo/node_modules"/*; do
  name=$(basename "$dependency")
  [ "$name" = "@vexart" ] && continue
  [ "$name" = "@vexart-native" ] && continue
  [ "$name" = "vexart" ] && continue
  ln -s "$dependency" "$consumer/node_modules/$name"
done

cat > "$consumer/bunfig.toml" <<EOF_BUNFIG
preload = ["$build/dist/solid-plugin.ts"]
EOF_BUNFIG

cd "$consumer"
if [ "$mode" = verify ]; then
  cat > "$consumer/packaged-verify.tsx" <<'EOF_VERIFY'
import { createSignal as solidCreateSignal } from "solid-js"
import { Box, createComponent as publicCreateComponent, createSignal } from "vexart"
import { assertBridgeVersion, createComponent as engineCreateComponent, createElement, createGpuRendererBackend, createRenderLoop, dispatchInput, EXPECTED_BRIDGE_VERSION, getLatestInteractionTrace, getRendererBackend, setRendererBackend, solidRender, vexartVersion } from "vexart/engine"
import { Ps5App } from "./examples/ps5/src/app"
import { createDefaultSeed } from "./examples/ps5/src/catalog"
import { createPs5Store } from "./examples/ps5/src/store"

const root = createElement("box")
const [width] = createSignal(3)
const dispose = solidRender(() => <Box width={width()} height={2} />, root)
const child = root.children[0]
if (createSignal !== solidCreateSignal) throw new Error("packaged public barrel did not share solid-js")
if (publicCreateComponent !== engineCreateComponent) throw new Error("packaged public barrel did not share engine singleton")
if (!child || child.kind !== "box") throw new Error(`packaged Box did not render through packaged engine: ${child?.kind ?? "missing"}`)
const version = vexartVersion()
assertBridgeVersion(version)
if (version !== EXPECTED_BRIDGE_VERSION) throw new Error(`unexpected packaged bridge version: ${version}`)
console.error(JSON.stringify({ packagedSolid: true, packagedEngine: true, boxKind: child.kind, bridgeVersion: version }))
dispose()

async function scene(width: number, height: number) {
  const frames: Array<{ width: number; height: number; paints: number; commands: number; ended: boolean; output: string | null }> = []
  const real = createGpuRendererBackend()
  const backend = {
    name: "packaged-verifier",
    beginFrame(ctx: { viewportWidth: number; viewportHeight: number }) {
      frames.push({ width: ctx.viewportWidth, height: ctx.viewportHeight, paints: 0, commands: 0, ended: false, output: null })
      return real.beginFrame?.(ctx)
    },
    paint(ctx: { commands: unknown[] }) {
      const frame = frames.at(-1)
      if (!frame) throw new Error("packaged scene backend paint ran before beginFrame")
      frame.paints += 1
      frame.commands += ctx.commands.length
      return real.paint(ctx)
    },
    reuseLayer(ctx: Parameters<NonNullable<typeof real.reuseLayer>>[0]) {
      return real.reuseLayer?.(ctx)
    },
    compositeRetainedFrame(ctx: Parameters<NonNullable<typeof real.compositeRetainedFrame>>[0]) {
      return real.compositeRetainedFrame?.(ctx)
    },
    endFrame(ctx: Parameters<NonNullable<typeof real.endFrame>>[0]) {
      const frame = frames.at(-1)
      if (!frame) throw new Error("packaged scene backend endFrame ran before beginFrame")
      frame.ended = true
      const result = real.endFrame?.(ctx)
      frame.output = result?.output ?? "none"
      return result
    },
    drainProfile() {
      return real.drainProfile?.()
    },
    destroy() {
      real.destroy?.()
    },
  }
  const previousBackend = getRendererBackend()
  setRendererBackend(backend)
  const terminal = {
    kind: "kitty",
    caps: {
      kind: "kitty",
      kittyGraphics: true,
      kittyPlaceholder: false,
      kittyKeyboard: false,
      sixel: false,
      truecolor: true,
      mouse: false,
      focus: false,
      bracketedPaste: false,
      syncOutput: false,
      tmux: false,
      parentKind: null,
      transmissionMode: "direct",
    },
    size: { cols: Math.floor(width / 8), rows: Math.floor(height / 16), pixelWidth: width, pixelHeight: height, cellWidth: 8, cellHeight: 16 },
    write() {},
    rawWrite() {},
    writeBytes() {},
    beginSync() {},
    endSync() {},
    onResize() { return () => {} },
    onData() { return () => {} },
    bgColor: [0, 0, 0],
    fgColor: [255, 255, 255],
    isDark: true,
    setTitle() {},
    writeClipboard() {},
    suspend() {},
    resume() {},
    destroy() {},
  }
  const loop = createRenderLoop(terminal, { experimental: { nativePresentation: false, nativeLayerRegistry: false } })
  const store = createPs5Store(createDefaultSeed())
  const user = store.state().users[0]
  if (!user) throw new Error("packaged PS5 seed did not contain a user")
  store.actions.dispatch({ type: "user/select", userId: user.id })
  if (store.state().screen !== "home" || store.state().homeTiles.length !== 26) throw new Error("packaged PS5 store did not reach the 26-tile home")
  const appDispose = solidRender(() => <Ps5App store={store} width={width} height={height} />, loop.root)
  loop.frame()
  dispatchInput({ type: "key", key: "tab", char: "\t", mods: { shift: false, alt: false, ctrl: false, meta: false } })
  loop.frame()
  // Image decode is deliberately asynchronous. Give cold catalog assets a few
  // real event-loop turns so this validates the same settled scene that the
  // source visual runner captures, rather than a first-frame placeholder.
  for (let index = 0; index < 3; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50))
    loop.frame()
  }
  const frame = [...frames].reverse().find((candidate) => candidate.ended)
  const pixels = real.readbackForTest(width, height)
  let nonzeroBytes = 0
  let variedPixels = 0
  let minChannel = 255
  let maxChannel = 0
  if (pixels) {
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index] ?? 0
      const green = pixels[index + 1] ?? 0
      const blue = pixels[index + 2] ?? 0
      if (red > 0 || green > 0 || blue > 0) nonzeroBytes += 1
      minChannel = Math.min(minChannel, red, green, blue)
      maxChannel = Math.max(maxChannel, red, green, blue)
      if (Math.max(red, green, blue) - Math.min(red, green, blue) > 8) variedPixels += 1
    }
  }
  const rgbRange = maxChannel - minChannel
  if (!frame || frame.width !== width || frame.height !== height || frame.paints === 0 || frame.commands === 0 || !frame.ended || frame.output === "none" || pixels?.length !== width * height * 4 || nonzeroBytes < 1000 || rgbRange <= 20 || variedPixels < 1000) throw new Error(`packaged PS5 scene did not produce settled real GPU output at ${width}x${height}`)
  if (getLatestInteractionTrace().kind !== "key:tab") throw new Error("packaged PS5 scene did not receive public dispatchInput")
  appDispose()
  loop.destroy()
  setRendererBackend(previousBackend)
  return { width, height, rootChildren: loop.root.children.length, paints: frame.paints, commands: frame.commands, output: frame.output, pixels: pixels?.length ?? 0, nonzeroBytes, variedPixels, rgbRange }
}

const scene1280 = await scene(1280, 720)
const scene1920 = await scene(1920, 1080)
console.error(JSON.stringify({ packagedScene: true, scenes: [scene1280, scene1920], homeTiles: 26, backend: "public-setRendererBackend", physicalKitty: false }))
EOF_VERIFY
  bun --config="$consumer/bunfig.toml" --conditions=browser "$consumer/packaged-verify.tsx" >/dev/null
elif [ "$mode" = test ]; then
  bun --config="$consumer/bunfig.toml" --conditions=browser test --preload "$build/dist/solid-plugin.ts" "$consumer/examples/ps5/$entry" "$@"
else
  bun --config="$consumer/bunfig.toml" --conditions=browser "$consumer/examples/ps5/$entry" "$@"
fi
