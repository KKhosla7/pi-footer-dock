#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if ! command -v gitleaks >/dev/null 2>&1; then
  echo "secrets: gitleaks is not installed, so nothing was checked. Install it (https://github.com/gitleaks/gitleaks) or run inside 'nix develop'." >&2
  exit 1
fi
mode="${1:-tree}"
run() {
  if gitleaks "$@" --config .gitleaks.toml --redact --no-banner -v; then
    echo "secrets: ok ($mode)"
  else
    echo "secrets: a possible secret or credential file was found ($mode); nothing printed above is the secret itself" >&2
    exit 1
  fi
}
case "$mode" in
  staged) run git --staged . ;;
  tree) run dir . ;;
  history) run git . ;;
  range) run git --log-opts "${2:?usage: scripts/check-secrets.sh range <git log options>}" . ;;
  *) echo "usage: scripts/check-secrets.sh staged | tree | history | range <git log options>" >&2; exit 2 ;;
esac
