#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
git config core.hooksPath .githooks
echo "hooks: git now runs .githooks (a secrets check before every commit and push)"
