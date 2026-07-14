#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <package.json> [task-suffix] [platform...] [options]" >&2
  echo "State-driven safe runner: inspect parallel -> upload parallel -> UI/cover repair sequential -> verify parallel." >&2
  exit 2
fi

exec node "${script_dir}/v2/publisher.mjs" "$@"
