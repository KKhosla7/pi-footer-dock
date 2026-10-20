#!/bin/sh
# Keeps personal details out of the public repository: commit addresses and trailers, emails and
# home-folder paths in tracked files, and bytecode or cache files. It reads, never writes, and its
# messages never repeat what it found (the log of a public run is public).
# Usage: scripts/check-hygiene.sh [<base>]
# Checks the commits after <base> (only the last commit when <base> is missing or unknown) and every tracked file.
set -eu
cd "$(dirname "$0")/.."
base="${1:-}"
failed=0
fail() {
  echo "hygiene: $1" >&2
  failed=1
}

if [ -n "$base" ] && git cat-file -e "$base^{commit}" 2>/dev/null; then
  commits=$(git rev-list --no-merges "$base..HEAD")
else
  commits=$(git rev-list --no-merges -n 1 HEAD)
fi

# GitHub's own addresses: the account's noreply form (what web edits and web merges use) and the web committer.
noreply='^([0-9]+\+[A-Za-z0-9-]+@users\.noreply\.github\.com|noreply@github\.com)$'
for commit in $commits; do
  short=$(git rev-parse --short "$commit")
  for address in $(git log -1 --format='%ae %ce' "$commit"); do
    echo "$address" | grep -Eq "$noreply" || fail "commit $short: author or committer address is not a GitHub noreply address"
  done
  if git log -1 --format=%B "$commit" | grep -Eiq '^(co-authored-by|signed-off-by|reviewed-by|acked-by|tested-by|reported-by|suggested-by|helped-by):|generated with \['; then
    fail "commit $short: the message has a trailer or a generated-with line"
  fi
done

# Matches of a shape in tracked text files that are not an allowed fixture: prints file:line only.
unexpected() {
  git grep -I -n -o -E "$1" | while IFS= read -r line; do
    match=${line##*:}
    echo "$match" | grep -Eiq "$2" || echo "${line%:*}"
  done
}
emails=$(unexpected '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' "^(.+@([A-Za-z0-9-]+\.)*example\.(com|invalid|test)|[0-9]+\+[A-Za-z0-9-]+@users\.noreply\.github\.com|noreply@github\.com)\$")
[ -z "$emails" ] || fail "an email address in: $(echo "$emails" | tr '\n' ' ')"
paths=$(unexpected '(/home|/Users)/[A-Za-z0-9._-]+/' '^(/home|/Users)/(someone|projects|u|fixture|runner)/$')
[ -z "$paths" ] || fail "a home-folder path in: $(echo "$paths" | tr '\n' ' ')"
cache=$(git ls-files | grep -E '\.pyc$|(^|/)__pycache__/|(^|/)\.DS_Store$' || true)
[ -z "$cache" ] || fail "tracked cache files: $(echo "$cache" | tr '\n' ' ')"

[ "$failed" -eq 0 ] || exit 1
echo "hygiene: ok"
