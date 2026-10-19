# Setting up Footer Dock

Everything you need to install, update, remove and troubleshoot Footer Dock. For what it shows and why, see [README.md](README.md).

## Before you start

- **Pi** 1.2 or newer (`pi --version`). Footer Dock is a Pi package, so it installs with Pi's own package commands.
- **Node.js** 22.19 or newer, which Pi itself needs.
- A **terminal with mouse support** if you want to click (most do). Everything also works from the keyboard.
- Optional: a [Nerd Font](https://www.nerdfonts.com/) in your terminal for the nicest icons. Without one, run `/dock-glyphs` once.

## Install

```bash
pi install npm:pi-footer-dock
```

Pi writes the package into your personal settings (`~/.pi/agent/settings.json`) and loads it in every session. Start a new Pi session, or run `/reload` in a running one.

Other ways, if you need them:

| What you want                          | Command                                                  |
| -------------------------------------- | -------------------------------------------------------- |
| Try it for one run, without installing | `pi -e npm:pi-footer-dock`                               |
| Install from GitHub                    | `pi install git:github.com/KKhosla7/pi-footer-dock`      |
| Install a copy you are developing      | `pi install ./path/to/pi-footer-dock`                    |
| Install for one project only           | `pi install -l npm:pi-footer-dock` (needs project trust) |

**Pinning a version.** `pi install npm:pi-footer-dock@0.1.0` pins that exact version, and updates will not move it. Install without a version (as above) to receive updates.

## First minute

1. Look at the footer: two rows under the editor. Resize the terminal and watch it adapt.
2. **Click the text of any item** (for example the cache figure): an explanation opens. Esc closes it; clicking the same item again closes it too.
3. Run `/dock-settings` to hide items, change the cost period, or switch the icon set.
4. If you see boxes instead of icons, run `/dock-glyphs`.

Nothing else to configure. If you use ClinePass, OpenCode Go or OpenAI Codex and want to see your limit windows, turn on _Ask providers for limits_ in `/dock-settings`: it is off until you do (see [README.md](README.md#provider-limits-off-until-you-turn-them-on)).

## Update

Footer Dock is updated like any other Pi package.

| What you want to update                       | Command                        |
| --------------------------------------------- | ------------------------------ |
| Footer Dock and every other installed package | `pi update --extensions`       |
| Only Footer Dock                              | `pi update npm:pi-footer-dock` |
| Pi itself and all packages                    | `pi update --all`              |

Restart Pi (or `/reload`) afterwards. Your settings and history are kept: they live in separate files, not in the package, and new versions read what older versions wrote. See [CHANGELOG.md](CHANGELOG.md) for what changed; a change that affects your settings is called out there.

**You are told when there is a new version.** Each time Pi starts, it checks the npm registry for newer versions of the packages you installed (Pi does this itself; Footer Dock makes no request for it). When one is found, Pi shows a notice in the chat:

```
Package Updates Available
Run pi update --extensions
Packages:
- pi-footer-dock
```

Pi never installs an update by itself: you run the command above and restart Pi. No notice appears if you pinned a version (`@0.1.0`; to move, install the version you want), if you installed from a local folder, if Pi runs offline (`PI_OFFLINE` set), or if the registry cannot be reached at that moment.

## Remove

```bash
pi remove npm:pi-footer-dock
```

This removes the package. Two small things stay behind and can be deleted by hand if you want a clean slate:

| What                      | Where                                                             |
| ------------------------- | ----------------------------------------------------------------- |
| Your Footer Dock settings | `pi-footer-dock.json` in Pi's folder (`~/.pi/agent/`)             |
| The rebuildable cache     | `~/.cache/pi-footer-dock/` (or `$XDG_CACHE_HOME/pi-footer-dock/`) |

## Troubleshooting

| Symptom                                        | What to do                                                                                                                                                                    |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No footer after installing                     | Start a new Pi session or `/reload`. `pi list` should show `pi-footer-dock`. Check you are in Pi's interactive mode.                                                          |
| Icons are boxes or question marks              | `/dock-glyphs`, or install a Nerd Font in your terminal.                                                                                                                      |
| Clicks do nothing                              | Your terminal may not send mouse events to Pi. Use the keyboard path: `/dock-info cache`, `/dock-settings`.                                                                   |
| Limits show `quota unsupported`                | Your provider has no limit source. Only ClinePass, OpenCode Go and OpenAI Codex have one; to add yours see `docs/adding-a-provider.md`.                                       |
| Limits show `limits off`                       | Asking providers for limits is off (the default). Turn on _Ask providers for limits_ in `/dock-settings` to see them.                                                         |
| Limits show `quota auth rejected`              | Sign in again with `/login` for that provider.                                                                                                                                |
| Git items say `refreshed after each Pi action` | The repository is too large to watch. Values are still real; they refresh after each tool call and turn.                                                                      |
| Cost shows `≈$12.40 mo`, not my session        | That is the month across all sessions. Change _Cost period_ in `/dock-settings`.                                                                                              |
| Something else                                 | Run `/dock-debug` and include its output in a bug report. It holds counters and settings only: no messages, no secrets, and no file paths (your home folder is shown as `~`). |

## Where Footer Dock keeps things

| Data                 | Location                                       | Kept how                                                                       |
| -------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------ |
| Settings             | `~/.pi/agent/pi-footer-dock.json`              | Private file (mode 600), written atomically                                    |
| Provider limit state | `~/.cache/pi-footer-dock/providers-v1/`        | Private, no credentials, rebuildable                                           |
| Cost history         | `~/.cache/pi-footer-dock/usage-v1/rollup.json` | Private, numbers and folder names only, rebuildable from Pi's own session logs |

Footer Dock reads Pi's session logs (`~/.pi/agent/sessions/`) to build the cost history. It only reads them, and keeps numbers, never message text.

## Getting help

Open an issue at <https://github.com/KKhosla7/pi-footer-dock/issues>. For a security problem, see [SECURITY.md](SECURITY.md) instead.
