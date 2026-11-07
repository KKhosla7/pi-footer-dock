# Configurable footer slots and click explanations

Every stock/custom slot goes through one segment renderer, final-column geometry pass and normalized click dispatcher. No per-icon mouse handler is required. The footer keeps exactly two adjacent rows, theme-native styling, regular-mode keyboard fallbacks and optional action-provider dependencies.

## Default behavior

- Click a visible stock icon/value to show what it measures via a non-focus-taking Pi notification.
- The `context` icon still invokes the advertised context action. Without an action, it explains itself.
- The context meter is a separate `context-usage` slot: clicking it explains context usage, never invokes the context action by accident.
- Gaps/gutters, clipped-out text, secondary buttons, modified gestures, wheel and drag are not activation targets. Pi retains handled presses and synthesizes clicks; activation never happens on press/release alone.
- Regular mode has no added mouse tracking. `/dock-info <slot>` explains values, `/dock-action <target>` invokes an advertised action, and `/dock-context` remains compatible.

Stock IDs: `workspace`, `branch`, `changes`, `ahead`, `model`, `thinking`, `context`, `context-usage`, `compaction`, `input`, `output`, `cache`, `speed`, `quota`, `cost`.

## Quota meters and cost

The default quota group uses seven fixed-width remaining-quota segments per window, a reported percentage formatted for display, and reset countdowns separated by a muted divider. Any positive remaining quota has at least one filled cell; true zero has none. Thus 7% renders `▰▱▱▱▱▱▱ 7%`, not an exhausted-looking empty bar. The cells are a coarse visual summary; small positive percentages retain a nonzero numeric label. Filled cells are lavender (`#b4a0e5`); empty cells stay theme-dim. At 25% remaining or lower, warning color takes priority. Windows are included only when the whole formatted window fits; meters never change the two-row layout or right-edge alignment.

A finite 490 ms bold highlight sweeps the **already filled** cells only after a real remaining-percentage change. It does not interpolate usage, alter numeric values, or generate requests. Initial acquisition, unchanged refreshes, model/window switches and stale data do not animate; disposal cancels the timer. Quota polling remains at the existing refresh cadence, not token-by-token realtime telemetry.

The stock quota group has no leading hourglass in either glyph set. Click quota or use `/dock-info quota` for exact observation age. Existing minute redraws update countdown text without triggering acquisition. Explicit custom icons (including a static hourglass) and custom quota text remain supported.

To use the active theme accent or disable the meter update highlight:

```text
/dock-config {"slots":{"quota":{"meterColor":"theme","animation":false}}}
```

Use `"lavender"` to explicitly select the default fill. Configuration replaces previous preferences; preserve your other settings when editing.

The default row includes a separate `≈$…` **API-equivalent estimate**, not a subscription bill or remaining allowance. Prices come from Pi's model registry. Each recorded assistant response uses the cost Pi recorded for it; when Pi recorded none, it is repriced from the registry's rate for its own provider/model across uncached input, cache-read, cache-write and output tokens, including long-context tiers. A model with no registry price, or a price of zero, is excluded rather than counted as free. Tool charges, regional uplifts and other fees are excluded, and registry prices can lag a provider's current prices. Click cost or use `/dock-info cost` for the sources and coverage counts. If some contributions cannot be priced, the full total stays unavailable; a safe priced portion is explicitly labelled `partial ≈$…`. With nothing priced, or with ambiguous data, the cost item is hidden. Empty sessions show nothing; positive estimates under a cent show `≈<$0.01`. Saved slot configurations are preserved; use `/dock-config reset` to adopt the current defaults (also resets other customizations).

## Commands and persistence

- `/dock-config show`: show the current JSON.
- `/dock-config <JSON>`: validate and replace the session-local configuration.
- `/dock-config reset`: restore defaults.
- `/dock-info <slot>`: explain a visible slot; omit the argument to choose one by keyboard.
- `/dock-action <target>`: invoke an action advertised for a configured semantic target.

Preferences are stored in `pi-footer-dock-config-v1` session metadata and restored on reload/resume. No global settings, installed packages or credential files are edited. JSON is a **replacement configuration**, not a patch: omitted `rows` or `slots` use defaults. To retain other edits, copy/edit the full output of `show`.

## Layout and custom slots

Each row declares ordered `left` and `right` arrays. Omit a stock ID to hide it; move it to another array to relocate it. IDs must be unique across the footer. Each row's right group independently ends at the terminal's right edge; shorter groups are not left-aligned to the wider row's starting column. Final clipped text determines hit coverage. No whitespace preceding a segment is included in that segment's click target; the context icon's existing trailing spacer remains part of its own segment.

Example JSON (paste after `/dock-config` on one line):

```json
{
  "version": 1,
  "rows": [
    { "left": ["workspace", "branch", "details"], "right": ["model", "thinking"] },
    { "left": ["context", "context-usage", "input", "output", "speed"], "right": ["quota", "cost"] }
  ],
  "slots": {
    "speed": { "help": "Last completed response average—not a live token rate." },
    "details": {
      "icon": "★",
      "text": "{icon} Details",
      "help": "Show details supplied by an optional provider.",
      "click": "action",
      "actionTarget": "vendor-details",
      "gap": 3
    }
  }
}
```

Every slot can override:

| Field          | Behavior                                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------------------------- |
| `text`         | Plain template instead of stock formatting; custom slots require text.                                     |
| `icon`         | Override its glyph, measured in terminal columns.                                                          |
| `help`         | Explanation displayed when explicitly requested or when an action is unavailable.                          |
| `click`        | `help` (default for values), `action` (default for context), or `none`.                                    |
| `actionTarget` | Semantic advertised target, not a provider action ID or executable command.                                |
| `gap`          | 0–6 columns preceding the slot; suppressed when it is first in its group.                                  |
| `meterColor`   | Quota fill: `lavender` (default) or `theme` (active accent).                                               |
| `animation`    | Quota update highlight: `true` (default) or `false`.                                                       |
| `hideAt`       | `xl`, `lg`, `md`, `sm` or `xs`: hide this slot when its row needs that look or a narrower one (see below). |
| `layers`       | Parts of an item you can switch off, as `{"name": false}`: see "Parts of an item" below.                   |

## Parts of an item (layers)

An item can have parts that you switch off without hiding the item. Set `layers` under the item to the parts you do not want, each `false`:

```json
{
  "version": 1,
  "slots": {
    "model": { "layers": { "provider": false } },
    "quota": { "layers": { "reset": false } }
  }
}
```

| Item    | Parts you can switch off                                                                  |
| ------- | ----------------------------------------------------------------------------------------- |
| `model` | `provider` (before the name; it is the first part to give way on a narrow row) and `name` |
| `quota` | `meter` (the bar) and `reset` (the reload icon and the time until the limit resets)       |

A part that is off is never printed, at any width; a part that is on is shown unless the shrink plan removes it. With both parts of the model off the item is not shown, which is the same as hiding it. The same choices are rows on the settings screen (`/dock-settings`: "Model: provider", "Model: name", "Limit usage: meter", "Limit usage: reset time"). A name that is not one of the item's parts, or `layers` under another item, is reported as a problem. A settings file that has `layers` is not accepted by versions before 0.1.3.

## How the footer gives way (the shrink plan)

When a row is too wide, Footer Dock takes steps one at a time, in a fixed order, and stops at the first step after which the row fits. A row that already fits is never touched, and a wider terminal always shows at least what a narrower one shows. A step either shortens an item to its next shorter wording (`shorten:<item>`) or removes it (`drop:<item>`). The project name is never removed; as a last resort it is cut with `…`.

The default order, first to go first (the quota's `shorten` steps are listed once per wording it has: its separators slim, then its meter goes, then the last window folds behind the `›`, then its reset times go; items that other extensions registered give way after `drop:output`, the last registered first):

| Order | Step                    | What it does                                                               |
| ----- | ----------------------- | -------------------------------------------------------------------------- |
| 1     | `shorten:quota`         | the quota's separators slim (the first of its steps; no data is lost)      |
| 2     | `drop:cost`             | removes the cost                                                           |
| 3     | `drop:compaction`       | removes the compaction countdown                                           |
| 4     | `shorten:cache`         | the cache item gets its short form                                         |
| 5     | `drop:cache`            | removes the cache item                                                     |
| 6     | `shorten:input`         | shortens the input tokens                                                  |
| 7     | `shorten:output`        | shortens the output tokens                                                 |
| 8     | `drop:input`            | removes the input tokens                                                   |
| 9     | `drop:output`           | removes the output tokens                                                  |
| 10    | `shorten:quota`         | three more steps: the meter, the last window folds behind `›`, reset times |
| 11    | `drop:speed`            | removes the speed                                                          |
| 12    | `shorten:context-usage` | twice: shorter, then just the percentage                                   |
| 13    | `shorten:changes`       | `2 files` becomes `2`                                                      |
| 14    | `shorten:ahead`         | `1 ahead` becomes `1`                                                      |
| 15    | `shorten:workspace`     | twice: `~/…/project`, then just the project name                           |
| 16    | `shorten:model`         | drops the provider from the model                                          |
| 17    | `drop:ahead`            | removes the commits-ahead count                                            |
| 18    | `drop:changes`          | removes the changed-files count                                            |
| 19    | `drop:context-usage`    | removes the context numbers                                                |
| 20    | `drop:context`          | removes the context bar                                                    |
| 21    | `drop:quota-more`       | removes the `›` (after this, folded windows cannot be brought back)        |
| 22    | `drop:quota`            | removes the usage limits                                                   |
| 23    | `drop:thinking`         | removes the thinking level                                                 |
| 24    | `drop:model`            | removes the model                                                          |
| 25    | `drop:branch`           | removes the branch                                                         |

**Changing the order.** Set `shrink` to a list of step names. To keep it, add `"shrink": [...]` to the settings file (`~/.pi/agent/pi-footer-dock.json`, which must stay private to you, mode 600); a value that is not valid makes Footer Dock ignore the whole file and say so, so try the list first with `/dock-config`, which checks it and changes nothing when it is invalid. `/dock-config` replaces the configuration of the current session only (start from `/dock-config show`), and the session wins over the file. The steps you name go first, in your order; every other step keeps its default order and goes where `"..."` stands (at the end when there is no `"..."`). A name may appear as many times as the plan has it. Examples: `{"shrink":["drop:speed"]}` makes the speed the first thing to go; `{"shrink":["...","drop:cost"]}` keeps the cost until almost everything else has given way; `{"shrink":["drop:speed","...","drop:cost"]}` does both. Unknown names, a name used too often, two `"..."` and lists longer than 64 are rejected, and the project name is never a step. Versions before 0.1.3 reject a settings file that has `shrink`.

Use `hideAt` to hide any slot earlier, for example `{"slots":{"cache":{"hideAt":"lg"}}}`: "hidden from `lg`" means the slot is removed once the row would have needed the `lg` look (the old five looks, `xl` fullest to `xs` most compact, still name these levels).

Git slots show `1 file` / `0 files` and `1 ahead`; file changes and ahead commits are different units. Native filesystem events plus Pi lifecycle/tool hints trigger automatic single-flight Git reads, not periodic polling. No upstream is unknown, not zero. `Git unavailable` means observation/watch coverage is unavailable; `/dock-debug` reports health and numeric monitor counters without file contents or credentials. Filesystem limitations apply and no timed fallback is enabled. To retain compact icon/count formatting, use `"changes":{"text":"{icon} {changes}"}` and `"ahead":{"text":"{icon} {ahead}"}` in `slots`; unknown count placeholders render `—`. Existing custom icons, gaps and text remain session-local.

Templates support `{icon}`, `{provider}`, `{model}`, `{thinking}`, `{changes}`, `{ahead}`, `{capacity}`, `{percent}`, `{input}`, `{output}`, `{cache}`, `{speed}`, `{cost}`, `{cacheread}`, `{cachewrite}`, `{cacheinput}` and `{cachereuse}`. Unknown placeholders stay literal; there is no evaluation, shell interpolation or arbitrary code execution. Text/help/icons reject terminal controls. Configurations are bounded to two rows, 32 unique visible slots, bounded text/options and a 16 KiB command. Invalid configurations leave existing preferences unchanged.

The stock cache slot shows `last 80% · 800 read · 100 written`, with zero writes omitted. `last` means a completed primary response, not live streaming, even while a task is running. No sample shows `cache pending`; zero reads show `last no reuse reported`, not a confirmed miss. Near-full non-full reuse shows `<100%` rather than rounding to100%. Read/written values are token counts, not bytes or cache occupancy. `{cache}` remains the cumulative session read count. The four cache placeholders describe only the last completed primary response: reported reads/writes, uncached input and reported token-reuse percentage. They are not live cache size, a confirmed miss counter or expiry. A normalized zero read can represent an omitted field; `{cachereuse}` therefore shows `—` rather than claiming a zero hit rate. Missing/invalid counts and overflowing prompt sums remain unknown. Model/thinking/branch changes, reload and glyph rebuild clear this live sample; history totals still restore.

Opt-in example (replacement configuration; copy your other preferences from `show` first):

```text
/dock-config {"slots":{"cache":{"text":"{icon} {cachereuse} R{cacheread} W{cachewrite} U{cacheinput}"}}}
```

For read800, uncached100 and write100, this shows `80% R800 W100 U100`. The default shows these as `last 80% · 800 read · 100 written`, with zero writes omitted. To restore cumulative reads, set cache text to `"{icon} {cache}"`. `/dock-info cache` explains both scopes, normalization ambiguity, declared best-effort TTL policy and unknown actual expiry. No extra rows, images or provider requests are introduced.

The speed slot now uses reported output divided by SDK monotonic duration, including request/header wait. It clears before the next turn requests a response. Missing timing or sub-20ms intervals stay unavailable; there is no invented live rate. `/dock-info speed` exposes timing scope and observed first-content/text latency. Custom help overrides remain deliberate user choices.

Overriding `speed.text` can deliberately display an unknown placeholder, but the stock speed slot hides itself without a completed measured response. No template can supply missing account quota data.

## Optional action providers

The existing `pi.events` v1 protocol remains unchanged:

- Consumer subscribes before emitting `pi:ui-actions:discover:v1` with `{ version: 1 }`.
- A provider advertises `pi:ui-actions:register:v1` with `{ version: 1, id, target, label }`.
- The example custom slot uses target `vendor-details`; the provider chooses its own opaque action ID.
- One advertised action invokes directly; multiple actions open the existing label selector; none falls back to the slot explanation.
- Invocation emits `pi:ui-actions:invoke:v1` with the **selected advertised ID**.
- Providers remove registrations with `pi:ui-actions:unregister:v1`.

Configuration changes refresh the allowed semantic targets and rediscover actions. Identical re-advertisements do not replace active selections; removal/restart cancels stale selections. No adjacent extension import/detection, action ID, command or executable binding is hardcoded.

## OpenAI quota distinction

For active `openai`, the extension now observes public `before_provider_request` and `after_provider_response` callbacks. When actual responses contain documented `x-ratelimit-limit-*`, `x-ratelimit-remaining-*` and `x-ratelimit-reset-*` fields, it displays **API tokens/requests remaining** with reset countdowns. Limits are matched to the captured active request model, invalidated on model changes/stop and not restored from account-ambiguous session history.

These are API rate buckets, **not ChatGPT five-hour/weekly subscription quotas**. The installed `openai` OAuth flow requests resource `https://api.openai.com/v1` and scope `chatgpt.tokens.use.direct`. It is not automatically interchangeable with `openai-codex` authentication for the ChatGPT usage endpoint. The latter remains a separate supported quota source.

Without actual valid OpenAI headers, `account quota unavailable` remains honest. No verified account-query contract for the user's direct OpenAI connection has been established. `/dock-debug` version 2 reports `capabilities`, loaded `source`, active provider/API/OAuth metadata and safe `headerEvents` counters/result/present **known header names only**. It never prints header values, cookies or tokens. Zero callbacks, missing/invalid headers and request-model mismatch can be distinguished without issuing a paid request solely for testing.
