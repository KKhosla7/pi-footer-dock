# Changelog

All notable changes to Footer Dock are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows [Semantic Versioning](https://semver.org/); below 1.0, a minor version may change settings (this file says so when it does).

## [Unreleased]

## [0.1.3] - 2026-11-07

### Added

- **New setting `shrink`: choose what gives way first when the footer is too narrow.** A list of step names (`drop:cost`, `shorten:quota`, ...) in the settings file or in `/dock-config`. The steps you name go first, in your order; every other step keeps its default order and goes where `"..."` stands. For example `{"shrink":["...","drop:cost"]}` keeps the cost until almost everything else has given way, and `{"shrink":["drop:speed"]}` makes the speed the first thing to go. The steps and the default order are listed in `docs/footer-configuration.md`. Unknown names are rejected and the project name can never be removed. Versions before 0.1.3 reject a settings file that contains `shrink`, so after going back to 0.1.2 remove that line; an older version that finds it in a saved session configuration ignores that entry.
- `/dock-debug` now says what became of every limit window the provider sent (`quotaProvider.windowReport`): its kind (5h, week, month; primary or secondary for Codex), whether the used share and the reset time were valid (and the length, for Codex), and whether the window is shown. A provider window that is dropped is no longer silent. It holds only names and yes or no answers, never a value or text from the provider. It comes from the Pi window that made the last request; another window shows `null`. `diagnosticVersion` is now 4.

### Fixed

- Moving a footer item behind another one no longer glues them together. Only the two halves of one item (the context bar and its usage, the quota and its `›`) sit against each other, and only when they are next to each other; every other item keeps its own gap wherever you place it. The default footer looks the same.

### Added

- **A red `⚠ N problems` marker and a problems screen.** While Footer Dock cannot apply your settings file, it runs on its defaults and shows `⚠ N problems` at the start of the first row, in red and blinking until you have opened the problems screen (click the marker, or run `/dock-settings`); after that it stays red until the file is valid. The screen lists every problem with where it is, which setting, what is wrong and what to change; press `r` there after fixing the file to apply it without restarting. The blinking stops when the quota animation is turned off in the settings. The marker cannot be hidden and is never given up when the footer is too narrow.

### Changed

- **Settings problems are listed in full, with the fix.** When Footer Dock cannot apply your settings file, or a `/dock-config` command, it now lists every problem it finds in one go: the file or command, the setting, what is wrong in plain words and what to change, and it suggests the name you probably meant (`Did you mean "limits"?`, `did you mean drop:cost?`). Before, it reported only the first problem in a short sentence, and `/dock-config` said "Invalid footer configuration (two rows, unique slots)" whatever was wrong. Nothing is applied in part: a file with any problem runs Footer Dock on its defaults, and a bad `/dock-config` leaves the footer exactly as it was. Your file is never changed. A wrong file permission now says `Run: chmod 600 <file>`. (A marker in the footer and a problems screen follow in the same release.)
- **Parts of an item can be switched off.** The model's provider and its name, and the limit usage's meter and its reset time, are now separate choices: rows on the settings screen ("Model: provider", "Model: name", "Limit usage: meter", "Limit usage: reset time"), or `"slots":{"model":{"layers":{"provider":false}}}` in the settings file and `/dock-config`. A part that is off is never printed; with both parts of the model off the item is hidden. Nothing changes unless you set it. A settings file that has `layers` is not accepted by earlier versions.
- **The limit usage reads without words.** Each window is its name, a bar, the percent and, after the reload icon, the time until it resets: `5h ▰▰▱▱▱▱▱ 34% 󰑓 2h 15m │ week ▰▰▰▱▱▱▱ 48% 󰑓 3d 10h`. The words "left", "used" and "resets in" are gone from the footer. Where room is short, the wide separator between windows slims first, then the bar goes (the reset time outlives it), then the last window folds behind `›`, and the reset times go last. The Nerd Font set draws the reload icon; the portable set keeps `◌`. Click the limits (or run `/dock-info quota`) for a new "In the footer" section that says whether the number is what is left or what is used, and where to change it; the setting row is now called "Limit shows" (`left` or `used`; the key `slots.quota.wording` is unchanged). Because the quota is shorter, more of the row stays visible at the same width.
- **The footer gives way one item at a time.** When a row is too wide, items are shortened or dropped in a fixed order instead of the whole row changing to a more compact look at once. The order: the quota's separators (wide to slim), then cost, compaction, the cache, input and output, then (for items other extensions registered) those, then the quota's detail (the meter, then the last window, then the reset times), then the speed, and the project name last. Apart from the quota (below), the default footer is unchanged at 196 columns and wider. Below that the cost is the first item to go (0.1.2 kept it down to 80 columns and cut the quota's reset times instead); the quota keeps its meter and reset times longer, and the speed no longer changes how the whole row looks.
- The bar of dollars by category (cost screen) and the bar of token categories (cache screen) now have a blank row between the bar and its legend and another after the legend (the cache screen ran its legend straight into the next line), and the legend breaks between entries: a symbol, its name, its amount and its share always stay on one row, where before a narrow terminal could split `▒ cache` from `write`. The footer itself is unchanged.

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
