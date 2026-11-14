#!/bin/sh
set -eu
dest="${1:?usage: scripts/export-public.sh <empty-folder>}"
cd "$(dirname "$0")/.."
mkdir -p "$dest"
[ -z "$(ls -A "$dest")" ] || { echo "$dest is not empty" >&2; exit 1; }
sh scripts/public-files.sh | tar --null -T - -cf - | tar -xf - -C "$dest"
for linked in $(grep -o 'docs/video/[A-Za-z0-9._-]*' "$dest/README.md" | sort -u); do
  [ -e "$dest/$linked" ] || { echo "README.md links $linked, which is not part of the export" >&2; exit 1; }
done
echo "exported to $dest"
