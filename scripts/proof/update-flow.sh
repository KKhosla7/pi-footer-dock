#!/bin/sh
set -eu
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
REPO="$repo" PI_BIN="${PI_BIN:-$repo/node_modules/.bin/pi}" exec python3 "$here/update_flow.py"
