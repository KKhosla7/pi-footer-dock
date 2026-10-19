#!/bin/sh
# Takes the README pictures from a real Pi session: Pi runs in a pseudo-terminal against a local
# stand-in provider and a throw-away project and agent folder (no account, no network, none of your
# own settings), the screen is read with pyte and drawn with a real font by headless Chromium.
# Usage: scripts/capture/make-screens.sh [picture-name ...]   (default: all)   (needs: nix develop, Chromium or Chrome)
set -eu
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
work="$(mktemp -d)"
trap 'kill "${server:-0}" 2>/dev/null || true; rm -rf "$work"' EXIT
port=$((20000 + $$ % 20000))
(cd "$repo" && exec npx tsx scripts/capture/fixture-provider.ts "$port") &
server=$!

mkdir -p "$work/home/projects" "$work/agent" "$work/remote.git"
echo '{"quietStartup":true}' > "$work/agent/settings.json"
cat > "$work/agent/models.json" <<JSON
{"providers":{"example":{"baseUrl":"http://127.0.0.1:$port/v1","api":"openai-completions","apiKey":"demo",
"models":[{"id":"example-coder","name":"Example Coder","contextWindow":200000,"maxTokens":8192,"reasoning":false,
"cost":{"input":1.5,"output":6,"cacheRead":0.15,"cacheWrite":1.9}}]}}}
JSON

git() { command git -c user.name=Demo -c user.email=demo@example.com -c init.defaultBranch=main "$@"; }
git init -q --bare "$work/remote.git"
app="$work/home/projects/my-app"
mkdir -p "$app/src/auth" "$app/tests" "$app/docs"
cd "$app"
git init -q
i=1; while [ $i -le 40 ]; do echo "export const rule$i = (value: string): boolean => value.length > $i;" >> src/auth/login.ts; i=$((i+1)); done
cp src/auth/login.ts src/auth/session.ts; cp src/auth/login.ts tests/login.test.ts
printf '# Auth\n\nHow sign-in works.\n' > docs/auth.md
git add -A; git commit -q -m "Initial commit"
git remote add origin "$work/remote.git"; git push -q -u origin main 2>/dev/null
git checkout -q -b feature/login-validation; git push -q -u origin feature/login-validation 2>/dev/null
echo "export const extra = true;" >> docs/auth.md; git commit -qam "Document sign-in"
sed -i '3s/.*/export const rule3 = (value: string): boolean => value.trim().length > 3;/;7,9d' src/auth/login.ts
sed -i '5,6d' src/auth/session.ts; echo "export const timeout = 900;" >> src/auth/session.ts
echo "describe('login', () => {});" >> tests/login.test.ts
printf 'export function validateLogin() {}\n' > src/auth/validate.ts

cd "$repo"
PI_BIN="${PI_BIN:-$repo/node_modules/.bin/pi}" WORK="$work" REPO="$repo" python3 "$here/capture.py" "$@"
