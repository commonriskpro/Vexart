#!/usr/bin/env bash
set -euo pipefail

# Run the PS5 app (or a test entrypoint) against the source public barrel in an
# isolated consumer-shaped tree. The repository node_modules, dist, config,
# and lockfiles are never modified. With no argument stdin/stdout remain a
# normal interactive terminal for src/main.tsx.
repo=$(cd "$(dirname "$0")/../.." && pwd)
example="$repo/examples/ps5"
entry="src/main.tsx"
mode=run

case "${1:-}" in
  ""|app|source|--app|--source)
    [ "$#" -eq 0 ] || shift
    ;;
  qa|test|visual|--qa|--test)
    if [ "$1" = "test" ] || [ "$1" = "--test" ]; then
      mode=test
      entry="tests"
      shift
      if [ "$#" -gt 0 ] && [ -e "$example/$1" ]; then
        entry=$1
        shift
      fi
    else
      entry="tests/visual.tsx"
      shift
    fi
    ;;
  --help|-h)
    cat <<'USAGE'
Usage: bash scripts/ps5-demo/run-app-source.sh [app|qa|test|ENTRY] [args...]

Runs examples/ps5/src/main.tsx by default. `qa` runs
examples/ps5/tests/visual.tsx when that offscreen script exists. `test` runs
the Bun test runner over examples/ps5/tests. ENTRY is a relative path under
examples/ps5, copied into an isolated source consumer.
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

case "$entry" in
  examples/ps5/*) entry=${entry#examples/ps5/} ;;
  /*|../*|*/../*)
    echo "PS5 source runner entry must be a relative path under examples/ps5: $entry" >&2
    exit 2
    ;;
esac

if [ "$mode" = test ]; then
  if [ ! -d "$example/$entry" ] && [ ! -f "$example/$entry" ]; then
    echo "PS5 source runner test path not found: examples/ps5/$entry" >&2
    exit 2
  fi
elif [ ! -f "$example/$entry" ]; then
  echo "PS5 source runner entry not found: examples/ps5/$entry" >&2
  exit 2
fi

work=$(mktemp -d "${TMPDIR:-/tmp}/vexart-ps5-source.XXXXXX")
trap 'rm -rf "$work"' EXIT

mkdir -p "$work/examples/ps5" "$work/node_modules/@vexart" "$work/scripts"
for path in src tests; do
  if [ -d "$example/$path" ]; then
    cp -R "$example/$path" "$work/examples/ps5/$path"
  fi
done
for path in catalog.json catalog-provenance.json assets; do
  if [ -e "$example/$path" ]; then
    ln -s "$example/$path" "$work/examples/ps5/$path"
  fi
done

# Keep QA artifacts in the repository when a future visual test writes them
# through a path relative to its temporary examples/ps5 tree.
ln -s "$repo/scripts/ps5-demo" "$work/scripts/ps5-demo"
ln -s "$repo/packages" "$work/packages"

# Resolve the source public barrel as the consumer's `vexart` package and
# resolve every source peer to the same temporary package tree. This keeps one
# source Solid universal reconciler instance for both JSX and the barrel.
cat > "$work/node_modules/vexart-package.json" <<EOF_PACKAGE
{
  "name": "vexart",
  "private": true,
  "type": "module",
  "main": "../../packages/app/src/barrel.ts",
  "types": "../../packages/app/src/barrel.ts"
}
EOF_PACKAGE
mkdir "$work/node_modules/vexart"
mv "$work/node_modules/vexart-package.json" "$work/node_modules/vexart/package.json"
for package in app engine headless styled; do
  ln -s "$repo/packages/$package" "$work/node_modules/@vexart/$package"
done

# Reuse installed dependencies read-only. In particular, do not let the
# consumer fall back to the stale root node_modules/vexart package.
for dependency in "$repo/node_modules"/*; do
  name=$(basename "$dependency")
  [ "$name" = "@vexart" ] && continue
  [ "$name" = "vexart" ] && continue
  ln -s "$dependency" "$work/node_modules/$name"
done

cat > "$work/bunfig.toml" <<EOF_BUNFIG
preload = ["$repo/solid-plugin.ts"]
EOF_BUNFIG

cd "$work"
if [ "$mode" = test ]; then
  bun --config="$work/bunfig.toml" --conditions=browser test --preload "$repo/solid-plugin.ts" "$work/examples/ps5/$entry" "$@"
else
  bun --config="$work/bunfig.toml" --conditions=browser "$work/examples/ps5/$entry" "$@"
fi
