# Letting Footer Dock manage your extension's footer

**For extension authors, and for the AI that writes their code.** Give this file to your coding assistant and ask it to "register my extension with Footer Dock". Everything it needs is here.

## What you get, and what Footer Dock does not do

If your extension registers with Footer Dock, Footer Dock draws its status in the Pi footer, lists its settings in `/dock-settings`, and shows its explanation screen when the user clicks it. Your extension then needs no footer code of its own.

Footer Dock is a **registry, not an owner**:

- It knows nothing about your extension before it registers, and nothing after it unregisters or Pi stops. Nothing is written to disk. Registrations live in memory for one session.
- It stores **no** setting of yours, not even "show this item". Your extension stores its own values; Footer Dock shows them and tells you when the user changes one.
- It runs **nothing** of yours. A click is a message sent to you; you decide what happens.
- Without Footer Dock installed, your extension runs normally. Registration is a broadcast nobody hears.

There is no import in either direction. All messages travel on Pi's event bus: `pi.events.on(channel, handler)` and `pi.events.emit(channel, data)`.

**Extensions that already use `ctx.ui.setStatus(key, text)` need to change nothing.** Footer Dock shows those texts on one last line (sorted by key, cut to the width; colour codes kept, other terminal escape sequences removed), as Pi's own footer does. Register with the protocol below when you want a place among the items, a settings sub-menu, clicks and an explanation.

## The five-minute version

```ts
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

export default function (pi: ExtensionAPI): void {
  let jobs = 0;

  const registration = () => ({
    v: 1,
    ext: 'acme', // your id: ^[a-z][a-z0-9-]{0,23}$
    label: 'Acme', // shown in the settings menu and "Provided by"
    items: [
      {
        id: 'jobs', // footer id becomes "acme:jobs"
        region: 'row2.right', // see "Where an item goes"
        at: {
          xl: { text: `Acme: ${jobs} jobs running`, icon: 'dot', tone: 'success' },
          md: { text: `${jobs} jobs`, icon: 'dot' },
          xs: 'hide',
        },
        clicks: { text: 'explain' }, // the default: Footer Dock's explanation screen
        explain: {
          title: 'Acme jobs',
          reports: ['How many Acme jobs are running now.'],
          missingWhen: ['Acme is not running.'],
        },
      },
    ],
  });

  const announce = () => pi.events.emit('footer-dock/register/v1', registration());
  pi.events.on('footer-dock/ready/v1', announce); // Footer Dock (re)started: say hello again
  pi.events.emit('footer-dock/hello/v1', { v: 1 }); // are you there? (answered with "ready")

  // later, when the number changes:
  pi.events.emit('footer-dock/update/v1', {
    v: 1,
    ext: 'acme',
    items: [{ id: 'jobs', at: { xl: { text: `Acme: ${++jobs} jobs running`, icon: 'dot' } } }],
  });
}
```

Always register **both** when you start (send `hello`) **and** whenever you hear `ready`. Then load order never matters and `/reload` just works. Sending the same registration twice is the same as sending it once.

## The messages

Every message carries `v: 1`. Messages with another version are ignored.

| Channel                     | From → to              | Payload                                                                  |
| --------------------------- | ---------------------- | ------------------------------------------------------------------------ |
| `footer-dock/ready/v1`      | Footer Dock → everyone | `{ v: 1 }`. Sent when Footer Dock starts and in reply to every `hello`.  |
| `footer-dock/hello/v1`      | you → Footer Dock      | `{ v: 1 }`. "Is Footer Dock here?"                                       |
| `footer-dock/register/v1`   | you → Footer Dock      | The whole registration (below). Replaces your previous one.              |
| `footer-dock/update/v1`     | you → Footer Dock      | Only what changed: item forms, explanations, setting values.             |
| `footer-dock/unregister/v1` | you → Footer Dock      | `{ v: 1, ext }`. Remove everything of yours.                             |
| `footer-dock/click/v1`      | Footer Dock → everyone | `{ v: 1, ext, item, token }`, `token` is `'icon'` or `'text'`.           |
| `footer-dock/setting/v1`    | Footer Dock → everyone | `{ v: 1, ext, row, value }`. The user picked a value in your sub-menu.   |
| `footer-dock/rejected/v1`   | Footer Dock → everyone | `{ v: 1, ext, problems: string[] }`. Why something you sent was dropped. |

`click`, `setting` and `rejected` go to everyone on the bus, so **check `ext` is yours** before acting.

## The registration

```jsonc
{
  "v": 1,
  "ext": "acme", // required. ^[a-z][a-z0-9-]{0,23}$
  "label": "Acme", // required. ≤ 40 characters
  "items": [/* up to 12 */],
  "settings": {
    // optional
    "note": "How Acme shows itself.", // ≤ 120 characters
    "rows": [/* up to 16 */],
  },
}
```

### Items

```jsonc
{
  "id": "jobs",              // required. same id pattern; "icon" is reserved
  "region": "row2.right",    // required
  "at": { "xl": FORM, "lg": FORM, "md": FORM, "sm": FORM, "xs": FORM | "hide" },
  "clicks": { "icon": "event", "text": "explain" },
  "explain": { /* see "Explanations" */ }
}
```

**Where an item goes.** `region` is one of `row1.left`, `row1.right`, `row2.left`, `row2.right`, `row3.left`, `row3.right`. Your items come **after** Footer Dock's own in the region. Footer Dock has two rows; **a third row exists only while some item uses it**, so a registration that stays in rows 1 and 2 costs no extra line.

**How an item looks.** Footer Dock picks, per row, the richest _look_ that fits the terminal width: `xl`, `lg`, `md`, `sm`, `xs` (rich to compact). Give a form for each look you care about:

- `xl` is **required**: a form, or `"hide"`.
- A look you leave out **inherits the nearest richer one** (like desktop-first CSS), so write only where the item changes.
- `"hide"` removes the item at that look.
- When space runs out, Footer Dock removes extension items **before** its own essentials. The footer never exceeds the terminal width.

A **form** is:

```jsonc
{
  "text": "Acme: 3 jobs running", // required, ≤ 60 characters, one line
  "icon": "dot", // optional, from the icon list
  "tone": "success", // optional, from the tone list
  "dim": false,
} // optional
```

**Icons** (Footer Dock owns the glyphs for the Nerd-Font and the plain-ASCII sets, so the item looks right in both): `folder branch changed ahead chip input output cache robot reasoning hourglass reset speed dot check warn error info clock user star`.

**Tones:** `text muted accent success warning error`. Colours come from the user's Pi theme.

**Clicks.**

| Setting                            | What a click does                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| `clicks.text: "explain"` (default) | Opens (or closes) Footer Dock's explanation screen for the item.               |
| `clicks.text: "event"`             | Sends `footer-dock/click/v1` with `token: "text"`. You do the rest.            |
| `clicks.text: "none"`              | Nothing.                                                                       |
| `clicks.icon: "event"`             | The icon becomes its own target and sends `token: "icon"`. Default: no target. |

Footer Dock executes nothing for you. To open your own screen on a click:

```ts
pi.events.on('footer-dock/click/v1', (m: { ext?: string; item?: string; token?: string }) => {
  if (m.ext !== 'acme' || m.item !== 'jobs') return;
  // open your own UI, run your own command, whatever you want
});
```

### Explanations

An item's explanation is shown in Footer Dock's own frame: a `Now:` line (the current text of the item), **What it reports**, the body you supply, and **Can be missing when**. The screen is the same as for Footer Dock's own items (scrolling window, live repaint).

```jsonc
"explain": {
  "title": "Acme jobs",                         // required, ≤ 40
  "reports": ["How many Acme jobs run now."],   // required, 1–8 lines
  "missingWhen": ["Acme is not running."],      // required, 1–8 lines
  "status": { "available": true, "text": "3 running" },   // optional
  "blocks": [ /* up to 30, optional */ ]
}
```

`reports` and `missingWhen` are required because every Footer Dock item answers the same two questions: _what is this showing me_ and _why might it be blank_.

**Blocks** are plain data; Footer Dock draws them with the same renderer as its own screens. All block `tone` values are `accent success warning error muted dim`.

| `kind`    | Fields                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------ |
| `heading` | `text`                                                                                           |
| `facts`   | `rows: [{ label, value, note?, tone? }]` (≤ 12 rows)                                             |
| `meters`  | `rows: [{ label, fraction (0–1 or null), text, mark? (0–1), tone? }]`                            |
| `table`   | `head: [..]` (≤ 6 columns), `rows: [[..]]` (≤ 16 rows), `right: [column numbers to right-align]` |
| `bullets` | `items: [{ text, term?, tone? }]` (≤ 8)                                                          |
| `stack`   | `parts: [{ label, amount, tone, text? }]`: one bar split in proportion to `amount`               |
| `bars`    | `chart: { values: number[] (≤ 60), axis: [left, right], peak, current?, tone? }`: a column chart |
| `note`    | `text` (≤ 600 characters, line breaks kept), `tone?`                                             |
| `gap`     | none: one blank line                                                                             |

Update an explanation any time with an `update` message; an open screen repaints by itself.

### Settings sub-menu

```jsonc
"settings": {
  "note": "How Acme shows itself.",
  "rows": [
    { "id": "mode",                      // same id pattern
      "label": "Mode",                   // ≤ 40
      "description": "How much to say.", // ≤ 120
      "values": ["brief", "full"],       // 2–8 values, ≤ 24 characters each
      "current": "brief",                // must be one of values
      "default": "brief" }               // optional, one of values
  ]
}
```

Footer Dock draws this as a group named after your `label` in `/dock-settings`. When the user picks a value Footer Dock sends:

```ts
pi.events.on('footer-dock/setting/v1', (m: { ext?: string; row?: string; value?: string }) => {
  if (m.ext !== 'acme') return;
  save(m.row, m.value); // YOUR storage: Footer Dock keeps nothing
  pi.events.emit('footer-dock/update/v1', {
    v: 1,
    ext: 'acme',
    settings: [{ row: m.row, current: m.value }],
  });
});
```

Until you confirm with `update`, Footer Dock shows the value the user picked. If you want a "show this item" switch, make it one of your rows and change your `at` with `"hide"` yourself. Footer Dock has no opinion.

### Updates

```jsonc
{ "v": 1, "ext": "acme",
  "items": [ { "id": "jobs", "at": { "xl": FORM }, "explain": { /* whole explanation */ } } ],
  "settings": [ { "row": "mode", "current": "full" } ] }
```

An `update` replaces only what it names: an item's whole `at` table and/or whole `explain`, and setting `current` values. It cannot add or remove items or rows; send `register` again for that. An `update` for an extension that is not registered is rejected.

Footer Dock redraws at most once per 100 ms however often you send, so you may update on every event. Don't send faster than you need.

### Unregistering

`{ v: 1, ext: 'acme' }` on `footer-dock/unregister/v1` removes your items, your settings group and your explanations immediately. Pi stopping does the same without any message.

## Limits (everything you send is untrusted data)

Footer Dock cleans everything on the way in. Escape sequences and control characters are stripped, text is cut to its limit, unknown fields are ignored, and a wrong type drops that item or row (never the whole registration, and never an exception in the footer). What was dropped is reported on `footer-dock/rejected/v1`.

| What                          | Limit                |
| ----------------------------- | -------------------- |
| Extensions registered at once | 8                    |
| Items per extension           | 12                   |
| Setting rows per extension    | 16 (2–8 values each) |
| Explanation blocks per item   | 30                   |
| Form text                     | 60 characters        |
| Labels / titles               | 40 characters        |
| Notes / descriptions          | 120 characters       |
| Paragraph (`note`, bullets)   | 600 characters       |
| Table                         | 6 columns, 16 rows   |
| Chart                         | 60 values            |

The first registration of an `ext` id claims it and later ones with the same id replace it (a reload re-registers). Extensions share one process, so Footer Dock does not try to defend one from another; it defends the terminal, the layout and the user's settings.

## Checklist for the AI writing the code

1. Pick an `ext` id and a `label`. Choose the items, each with a region and a form per look. `xl` first, `hide` at `xs` unless it is essential.
2. Register on start (`hello`) and on every `ready`. No import of Footer Dock. No dependency on it.
3. Give every item an `explain` with `title`, `reports`, `missingWhen`.
4. Use only icons, tones and regions from the lists above.
5. For a settings sub-menu: store the value yourself; handle `footer-dock/setting/v1` (check `ext`) and reply with `update`.
6. For clicks that open your own UI: set `clicks` to `event` and handle `footer-dock/click/v1` (check `ext` and `item`).
7. Listen to `footer-dock/rejected/v1` (check `ext`) while developing. It tells you in words what was dropped.
8. Don't rely on Footer Dock being installed. Nothing should break if no message is ever answered.

## Trying it

Run Pi with both extensions: `pi -e <path-to-footer-dock> -e <path-to-your-extension>`. Your item appears after Footer Dock's own in its region; click it, then open `/dock-settings`.

Footer Dock's own test suite carries a made-up extension written from this document alone (`tests/support/acme-extension.ts`) and checks it in a real Pi session. If this document and Footer Dock disagree, that is a bug in one of them; please open an issue.
