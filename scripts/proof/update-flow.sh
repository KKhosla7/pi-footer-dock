#!/bin/sh
# Proves install, update notice and `pi update --extensions` with a real Pi against a stand-in registry.
# Needs: nix develop (npm, Python and pyte). PI_BIN picks the Pi to test (default: the one in node_modules).
set -eu
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
REPO="$repo" PI_BIN="${PI_BIN:-$repo/node_modules/.bin/pi}" exec python3 "$here/update_flow.py"
