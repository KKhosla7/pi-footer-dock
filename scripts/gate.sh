#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
[ -d node_modules ] || nix develop .#default --command npm ci
nix develop .#default --command npm run check
nix develop .#default --command sh scripts/check-secrets.sh history
nix develop .#default --command sh scripts/check-secrets.sh tree
nix develop .#node22 --command npm test
echo "both gates green"
