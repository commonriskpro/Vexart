#!/usr/bin/env bash
set -euo pipefail

# Run the source-public QA in an isolated consumer-shaped tree. The app JSX
# still imports only `vexart`; the engine testing adapter is used only by the
# QA process to observe pixels and input dispatch. Nothing is installed into
# the repository and the pinned dist/native snapshot is not rebuilt.
repo=$(cd "$(dirname "$0")/../.." && pwd)
work=$(mktemp -d "${TMPDIR:-/tmp}/vexart-ps5-source-qa.XXXXXX")
trap 'rm -rf "$work"' EXIT

mkdir -p "$work/examples/ps5/probes" "$work/scripts" "$work/node_modules/@vexart"
cp "$repo/examples/ps5/probes/public-consumer.tsx" "$work/examples/ps5/probes/public-consumer.tsx"
cp "$repo/examples/ps5/probes/source-public-qa.tsx" "$work/examples/ps5/probes/source-public-qa.tsx"
ln -s "$repo/examples/ps5/catalog.json" "$work/examples/ps5/catalog.json"
ln -s "$repo/examples/ps5/assets" "$work/examples/ps5/assets"
ln -s "$repo/packages" "$work/packages"
ln -s "$repo/scripts/ps5-demo" "$work/scripts/ps5-demo"

# Resolve the source public barrel and all source package peers as packages,
# while keeping the repository node_modules read-only.
cat > "$work/node_modules/vexart-package.json" <<EOF_PACKAGE
{
  "name": "vexart",
  "type": "module",
  "main": "../../packages/app/src/barrel.ts",
  "types": "../../packages/app/src/barrel.ts"
}
EOF_PACKAGE
mkdir "$work/node_modules/vexart"
cp "$work/node_modules/vexart-package.json" "$work/node_modules/vexart/package.json"
rm "$work/node_modules/vexart-package.json"
for package in app engine headless styled; do
  ln -s "$repo/packages/$package" "$work/node_modules/@vexart/$package"
done

# Source dependencies are linked into the isolated tree rather than copied or
# installed, so this runner cannot alter the root lockfile/configuration.
for dependency in "$repo/node_modules"/*; do
  name=$(basename "$dependency")
  [ "$name" = "@vexart" ] && continue
  [ "$name" = "vexart" ] && continue
  ln -s "$dependency" "$work/node_modules/$name"
done
cat > "$work/bunfig.toml" <<EOF_BUNFIG
preload = ["$repo/solid-plugin.ts"]
EOF_BUNFIG

log="$repo/scripts/ps5-demo/artifacts/source-public-qa-stop.log"
set +e
(
  cd "$work"
  bun --config="$work/bunfig.toml" --conditions=browser "$work/examples/ps5/probes/source-public-qa.tsx"
) 2>&1 | tee "$log"
status=${PIPESTATUS[0]}
set -e
exit "$status"
