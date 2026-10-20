#!/bin/sh
# Copies the files that belong in the public repository into an empty folder: the product, its tests,
# its user documents and its tooling; not the development notes, evidence or maintainer runbook.
# The launch-video tooling (scripts/video) stays in the development repository.
# Usage: scripts/export-public.sh <empty-folder>
set -eu
dest="${1:?usage: scripts/export-public.sh <empty-folder>}"
cd "$(dirname "$0")/.."
mkdir -p "$dest"
[ -z "$(ls -A "$dest")" ] || { echo "$dest is not empty" >&2; exit 1; }
git ls-files -z -- \
  README.md SETUP.md CONTRIBUTING.md SECURITY.md CHANGELOG.md LICENSE NOTICE \
  package.json package-lock.json tsconfig.json eslint.config.js .prettierrc.json .prettierignore \
  .dependency-cruiser.cjs .gitignore .gitattributes .nvmrc .envrc flake.nix flake.lock .github \
  src dist tests scripts ':(exclude)scripts/video' docs/extending-footer-dock.md docs/adding-a-provider.md docs/images \
  | tar --null -T - -cf - | tar -xf - -C "$dest"
# Nothing in docs/video/ is exported: the launch video is a GitHub attachment (README and pi.video) and is on YouTube. A README that links a file in docs/video/ would show a broken link.
for linked in $(grep -o 'docs/video/[A-Za-z0-9._-]*' "$dest/README.md" | sort -u); do
  [ -e "$dest/$linked" ] || { echo "README.md links $linked, which is not part of the export" >&2; exit 1; }
done
echo "exported to $dest"
