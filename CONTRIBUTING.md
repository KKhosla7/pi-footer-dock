# Contributing

Thank you for helping. Footer Dock is small on purpose; please read this first.

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

The images in the README are drawn from the real code by `npm run screenshots`. If you change what a screen looks like, run it and commit the new pictures.

## Licence

By contributing you agree that your contribution is licensed under the Apache License 2.0, the same as the project.
