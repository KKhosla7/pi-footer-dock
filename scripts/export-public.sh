#!/bin/sh
# Copies the files that belong in the public repository into an empty folder: the product, its tests,
# its user documents and its tooling; not the development notes, evidence or maintainer runbook.
# Usage: scripts/export-public.sh <empty-folder>
set -eu
dest="${1:?usage: scripts/export-public.sh <empty-folder>}"
cd "$(dirname "$0")/.."
mkdir -p "$dest"
[ -z "$(ls -A "$dest")" ] || { echo "$dest is not empty" >&2; exit 1; }
git ls-files -z -- \
  README.md SETUP.md CONTRIBUTING.md SECURITY.md CHANGELOG.md LICENSE NOTICE \
  package.json package-lock.json tsconfig.json eslint.config.js .prettierrc.json .prettierignore \
  .dependency-cruiser.cjs .gitignore .nvmrc .envrc flake.nix flake.lock .github \
  src tests scripts docs/extending-footer-dock.md docs/adding-a-provider.md docs/images \
  | tar --null -T - -cf - | tar -xf - -C "$dest"
echo "exported to $dest"
