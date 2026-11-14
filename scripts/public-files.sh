#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
git ls-files -z -- \
  README.md SETUP.md CONTRIBUTING.md SECURITY.md CHANGELOG.md LICENSE NOTICE \
  package.json package-lock.json tsconfig.json eslint.config.js .prettierrc.json .prettierignore \
  .dependency-cruiser.cjs .gitignore .gitattributes .nvmrc .envrc flake.nix flake.lock .github \
  .gitleaks.toml .githooks \
  src dist tests scripts ':(exclude)scripts/video' docs/extending-footer-dock.md docs/adding-a-provider.md docs/footer-configuration.md docs/images
