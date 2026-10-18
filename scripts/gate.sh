#!/bin/sh
# Both gates in the pinned toolchain (flake.nix): the full check on Node 24, then the tests on Node 22.
set -eu
cd "$(dirname "$0")/.."
[ -d node_modules ] || nix develop .#default --command npm ci
nix develop .#default --command npm run check
nix develop .#node22 --command npm test
echo "both gates green"
