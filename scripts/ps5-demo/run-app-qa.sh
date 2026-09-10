#!/usr/bin/env bash
set -euo pipefail

repo=$(cd "$(dirname "$0")/../.." && pwd)
exec bash "$repo/scripts/ps5-demo/run-app-source.sh" qa "$@"
