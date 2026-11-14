#!/bin/sh
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

exported=$(mktemp)
leftout=$(mktemp)
trap 'rm -f "$exported" "$leftout"' EXIT
if sh scripts/public-files.sh > "$leftout" && [ -s "$leftout" ]; then
  tr '\0' '\n' < "$leftout" | LC_ALL=C sort > "$exported"
  git ls-files | LC_ALL=C sort | LC_ALL=C comm -23 - "$exported" > "$leftout"
  if [ -s "$leftout" ]; then
    names=$(tr '\n' '\0' < "$exported" | xargs -0 git grep -I -n -o -F -f "$leftout" -- || true)
    [ -z "$names" ] || fail "an exported file names a file the export leaves out: $(echo "$names" | tr '\n' ' ')"
  fi
else
  fail "scripts/public-files.sh gave no list of exported files"
fi

[ "$failed" -eq 0 ] || exit 1
echo "hygiene: ok"
