# Changelog

All notable changes to Footer Dock are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows [Semantic Versioning](https://semver.org/); below 1.0, a minor version may change settings (this file says so when it does).

## [Unreleased]

## [0.1.2] - 2026-10-20

### Added

- The first time Footer Dock starts for a user who never chose an icon set, it says once what to do if the icons look like empty boxes (`/dock-glyphs`, or install a Nerd Font). It is remembered in the settings file as `glyphHintShown`; a settings file that had to be ignored is never rewritten for this. The README now says in the Install section that the icons need a Nerd Font. **New setting:** `glyphHintShown` (written automatically; you never need to set it). Versions before 0.1.2 reject a settings file that contains it, so after going back to 0.1.1 or 0.1.0 delete that line.
- The package manifest now names the launch video (`pi.video`), so the package page on pi.dev can play it. The video is hosted by GitHub as an attachment (the same one the README plays); it is not part of the npm package.

### Fixed

- The cost screen's bar of dollars by category sat directly under the "This session" and "This month" lines; there is now a blank row between them, as on the other screens.

## [0.1.1] - 2026-10-19

### Changed

- The branch is shown from the first draw (Pi already knows it); the file and commit counts follow as soon as Git has been read.
- The extension now loads from one bundled JavaScript file (`dist/index.js`) instead of about 180 TypeScript modules that Pi had to transpile on every start and `/reload`. `/reload` went from about 1.3 s to under 0.1 s, and the footer first appears in about 0.3 to 0.8 s after start instead of 2.3 s (measured in an isolated Pi). The package is smaller (9 files, about 110 kB).

### Fixed

- A folder that is not a Git repository no longer shows "Git unavailable": there is nothing to show, so the Git items are simply absent and the space is free. "Git unavailable" is kept for the real failures (Git missing, or a repository too large to read).
- Status lines that other extensions set with `ctx.ui.setStatus` were hidden once Footer Dock replaced Pi's footer. They are now shown on a last line, as Pi's own footer does (sorted by key, cut to the width; colours kept, other terminal escape sequences removed). Nothing changes for extensions: no registration is needed.

## [0.1.0] - 2026-10-19

### Added

- Two-row footer that chooses what to show for the width available: workspace, Git branch, changed files, commits ahead, model, thinking level, context, compaction, input and output tokens, cache, speed, provider limits and cost.
- Explanations for every value as live, scrollable screens that state what the value reports and when it can be missing; limit usage with pace per window; cost with a breakdown by category and model; cache with idle-time effects.
- Cost across sessions by day, week or month, built from Pi's own session logs, with a chart and tables by project and model.
- Click actions: open the project folder; model and thinking pickers with search; branch list that prepares a switch command; changed-files list with a diff that shows line numbers.
- `/dock-settings` menu with per-item visibility, limit windows, wording, cost period and icon set; settings shared by every Pi window.
- Provider limits for ClinePass, OpenCode Go and OpenAI Codex. Off by default (nothing is sent until the user turns on _Ask providers for limits_); the footer says `limits off` meanwhile. A guide for adding a provider: `docs/adding-a-provider.md`.
- Git reads are inert (a repository's own configuration cannot make Git run a program) and fall back to events mode on very large repositories.
- A registration protocol so other extensions can have Footer Dock manage their footer items, settings and explanations (`docs/extending-footer-dock.md`).
