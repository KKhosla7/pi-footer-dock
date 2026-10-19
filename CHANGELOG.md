# Changelog

All notable changes to Footer Dock are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows [Semantic Versioning](https://semver.org/); below 1.0, a minor version may change settings (this file says so when it does).

## [Unreleased]

### Fixed

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
