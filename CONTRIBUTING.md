# Contributing

Thank you for helping. Footer Dock is open source under the Apache License 2.0, and contributions are welcome: bug reports, documentation, tests and small fixes are as valuable as features. It is small on purpose, so please read this first. It is maintained by one person in spare time: a review may take a few days, and a feature that does not fit may be declined with a reason.

**Where to start:** an issue for a bug or an idea; a pull request for a fix, a test or a documentation change. For a new feature, open an issue first (see "Design first" below).

## Setup

```bash
git clone https://github.com/KKhosla7/pi-footer-dock
cd pi-footer-dock
nix develop    # optional: the pinned Node, npm, Python and Git (flake.nix); without Nix, use Node 24
npm ci --ignore-scripts
npm run check      # format, lint, types, architecture rules, tests
```

Use Node.js 24 for `npm run check` (CI also runs the tests on Node 22). Try your copy in Pi without installing it: `pi -e ./src/index.ts`.

## Ground rules

- **One change, one reason.** Small pull requests with a clear description are reviewed fastest.
- **Tests come with behaviour.** Every change to what Footer Dock shows or does has a test that fails without it.
- **Design first for anything new.** For a new feature or a new data source, open an issue describing the problem, what could go wrong, and what must always be true. Read `docs/` for how earlier decisions were made.
- **Keep the architecture.** `npm run architecture` enforces the layers: `core` is pure and imports nothing that does I/O; every Git call goes through one guarded function; provider sources do not import each other. Do not work around these rules; change them in the open if they are wrong.
- **Files and functions stay small** (the lint limits are the rule, not a suggestion): 220 lines per file, 65 per function, low complexity.
- **Security matters.** Text from outside (repository content, model names, provider data) is untrusted: strip it before drawing it. Do not add a network request, a stored credential, a repository write or a new place files are written without discussing it first. See [SECURITY.md](SECURITY.md).

## What `npm run check` runs

Prettier (format), ESLint (types-aware), `tsc`, dependency-cruiser (architecture), and the test suite (`node:test` through `tsx`). Tests that need Git create throwaway repositories; none touches your real Pi folder or network.

## Pictures

The pictures in the README are real: `npm run screenshots` packs the package and installs it into a throw-away Pi folder the way a user would, runs Pi in a pseudo-terminal against a local stand-in provider and a throw-away project (your own settings and accounts are never touched), reads the screen and draws it with a Nerd Font and a soft lavender palette (the 16 terminal colours are mapped to it) in headless Chromium. It needs `nix develop` (for Python and `pyte`), a Chromium or Chrome on the path, and the JetBrainsMono Nerd Font installed; pass picture names to redo only some (`npm run screenshots -- footer-wide diff`). If you change what a screen looks like, run it and commit the new pictures.

## Licence

By contributing you agree that your contribution is licensed under the Apache License 2.0, the same as the project.
