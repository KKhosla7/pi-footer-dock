# Contributing

Thank you for helping. Footer Dock is open source under the Apache License 2.0, and contributions are welcome: bug reports, documentation, tests and small fixes are as valuable as features. It is small on purpose, so please read this first. It is maintained by one person in spare time: a review may take a few days, and a feature that does not fit may be declined with a reason.

**Where to start:** an issue for a bug or an idea; a pull request for a fix, a test or a documentation change. For a new feature, open an issue first (see "Design first" below).

## Setup

```bash
git clone https://github.com/KKhosla7/pi-footer-dock
cd pi-footer-dock
nix develop    # optional: the pinned Node, npm, Python and Git (flake.nix); without Nix, use Node 24
npm ci --ignore-scripts
npm run check      # format, lint, no comments, types, architecture rules, tests
```

Use Node.js 24 for `npm run check` (CI also runs the tests on Node 22). Try your copy in Pi without installing it: `pi -e ./src/index.ts`.

## Ground rules

- **One change, one reason.** Small pull requests with a clear description are reviewed fastest.
- **Tests come with behaviour.** Every change to what Footer Dock shows or does has a test that fails without it.
- **Design first for anything new.** For a new feature or a new data source, open an issue describing the problem, what could go wrong, and what must always be true. Read `docs/` for how earlier decisions were made.
- **Keep the architecture.** `npm run architecture` enforces the layers: `core` is pure and imports nothing that does I/O; every Git call goes through one guarded function; provider sources do not import each other. Do not work around these rules; change them in the open if they are wrong.
- **Files and functions stay small** (the lint limits are the rule, not a suggestion): 220 lines per file, 65 per function, low complexity.
- **Security matters.** Text from outside (repository content, model names, provider data) is untrusted: strip it before drawing it. Do not add a network request, a stored credential, a repository write or a new place files are written without discussing it first. See [SECURITY.md](SECURITY.md).

## Secrets stay out

[gitleaks](https://github.com/gitleaks/gitleaks) scans for credentials: `sh scripts/check-secrets.sh staged | tree | history | range <git log options>`. Its rules are `.gitleaks.toml` (the default rules plus a refusal of files that hold credentials by name: `auth.json`, `.env`, `*.pem`, SSH keys). Run `sh scripts/install-hooks.sh` once per clone: git then checks every commit before it is made and every push before it leaves. Pull requests run the same check over the whole history in CI. The output names the rule, the file and the line, and never the secret. Without gitleaks installed the check fails instead of passing quietly; `nix develop` provides it. If a real secret was ever pushed, rotate it first; removing it from history does not make it safe again.

## No comments in the code

TypeScript, JavaScript, shell and Python files carry no comments at all (`npm run comments` fails on one; a shebang line is not a comment). A comment is a second copy of a decision that drifts from the code. Instead:

- Say what code does with names: a function, a type or a test whose name says it.
- Say why in the documentation, next to the behaviour it explains: `docs/footer-configuration.md` for settings and what they do, `docs/extending-footer-dock.md` for extensions, `CHANGELOG.md` for what changed and why. A change that alters behaviour updates the matching document in the same pull request.
- Say why a test exists in its name; a test that guards a past mistake names the mistake.
- Settings of the tools (a lint rule switched off for a file) live in the tool's configuration file, which is not code. YAML, Nix and JSON configuration may carry comments.

## Adding a provider

A provider's limit windows are one small module and one line in a registry. Read [docs/adding-a-provider.md](docs/adding-a-provider.md); it lists what a source must and must not do.

## The bundled file

Pi loads the extension from `dist/index.js`, one file built from `src/` (`npm run build`). It is committed so that installs from Git and from a folder work, and `npm run check` fails when it is out of date: after changing `src/`, run `npm run build` and commit the result. Develop against the sources with `pi -e ./src/index.ts`.

## What `npm run check` runs

Prettier (format), ESLint (types-aware), a check that the code has no comments, `tsc`, dependency-cruiser (architecture), a check that `dist/index.js` is up to date, and the test suite (`node:test` through `tsx`). Tests that need Git create throwaway repositories; none touches your real Pi folder or network.

## Pictures

The pictures in the README are real: `npm run screenshots` packs the package and installs it into a throw-away Pi folder the way a user would, runs Pi in a pseudo-terminal against a local stand-in provider and a throw-away project (your own settings and accounts are never touched), reads the screen and draws it with a Nerd Font and a soft lavender palette (the 16 terminal colours are mapped to it) in headless Chromium. It needs `nix develop` (for Python and `pyte`), a Chromium or Chrome on the path, and the JetBrainsMono Nerd Font installed; pass picture names to redo only some (`npm run screenshots -- footer-wide diff`). If you change what a screen looks like, run it and commit the new pictures.

## Licence

By contributing you agree that your contribution is licensed under the Apache License 2.0, the same as the project.
