import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadSettings } from '../src/adapters/settings-file.js';
import type { SettingsLoad } from '../src/adapters/settings-file.js';
import { explainConfig } from '../src/core/config-command.js';
import { MAX_PROBLEMS, formatProblems, problem, shown } from '../src/core/problems.js';
import type { Problem } from '../src/core/problems.js';
import { checkConfig, checkSettings } from '../src/core/settings-problems.js';
import { defaultSettings } from '../src/core/settings.js';

/** Configuration problems as records: validators that list every problem. */
const FILE = '~/.pi/agent/pi-footer-dock.json';
const complete = (item: Problem): void => {
  for (const field of [item.where, item.setting, item.reason, item.fix])
    assert.ok(typeof field === 'string' && field.length > 0, JSON.stringify(item));
};
const settingsOf = (value: unknown): string[] =>
  checkSettings(value, FILE).map((item) => item.setting);

await test('every class of invalid settings gives a complete problem and never throws', () => {
  const invalid: unknown[] = [
    [],
    null,
    5,
    'x',
    {},
    { version: 2 },
    { version: 1, limitz: 'on' },
    { version: 1, glyphs: 'both' },
    { version: 1, limits: true },
    { version: 1, clicks: 3 },
    { version: 1, quotaExpanded: 'yes' },
    { version: 1, openWith: 'xdg-open' },
    { version: 1, shrink: 'drop:cost' },
    { version: 1, shrink: ['drop:nobody'] },
    { version: 1, slots: [] },
    { version: 1, slots: { qota: {} } },
    { version: 1, slots: { quota: [] } },
    { version: 1, slots: { quota: { wordin: 'left' } } },
    { version: 1, slots: { quota: { wording: 'right' } } },
    { version: 1, slots: { cost: { wording: 'left' } } },
    { version: 1, slots: { branch: { gap: 99 } } },
  ];
  for (const value of invalid) {
    const problems = checkSettings(value, FILE);
    assert.ok(problems.length >= 1, `no problem for ${JSON.stringify(value)}`);
    problems.forEach(complete);
  }
  assert.deepEqual(
    checkSettings({ version: 1, limits: 'on', slots: { quota: { wording: 'used' } } }, FILE),
    [],
  );
});

await test('several problems in one file are all reported in one pass, each at its own setting', () => {
  const found = settingsOf({
    version: 1,
    glyphs: 'x',
    limits: 'y',
    shrink: ['drop:cots'],
    slots: { quota: { wording: 'z' }, qota: {}, cost: { gap: 99 } },
  });
  for (const setting of [
    'glyphs',
    'limits',
    'shrink',
    'slots.quota.wording',
    'slots.qota',
    'slots.cost.gap',
  ])
    assert.ok(found.includes(setting), `${setting} is missing from ${found.join(', ')}`);
  assert.equal(found.length, 6);
});

await test('a mistyped name gets the name it was probably meant for', () => {
  const text = (value: unknown): string => formatProblems('x', checkSettings(value, FILE));
  assert.match(text({ version: 1, limitz: 'on' }), /Did you mean "limits"/u);
  assert.match(text({ version: 1, slots: { qota: {} } }), /Did you mean "quota"/u);
  assert.match(
    text({ version: 1, slots: { quota: { wordin: 'left' } } }),
    /Did you mean "wording"/u,
  );
  assert.match(text({ version: 1, shrink: ['drop:cots'] }), /did you mean drop:cost/u);
  assert.match(
    text({ version: 1, zzzzzzzz: 1 }),
    /Use one of: version, glyphs/u,
    'no near name: list the valid ones',
  );
});

await test('the fix says what is valid, for a value and for a place', () => {
  const [wording] = checkSettings({ version: 1, slots: { quota: { wording: 'right' } } }, FILE);
  assert.match(wording?.fix ?? '', /left or used/u);
  const [misplaced] = checkSettings({ version: 1, slots: { cost: { wording: 'left' } } }, FILE);
  assert.match(misplaced?.fix ?? '', /not available for cost/u);
});

await test('text from the file is cut, stripped of controls, and the list is bounded', () => {
  const [long] = checkSettings({ version: 1, glyphs: `a\u001b[31m${'b'.repeat(500)}` }, FILE);
  assert.ok(long);
  assert.ok(!long.reason.includes('\u001b'));
  assert.ok(long.reason.length <= 200 && shown('b'.repeat(500)).length <= 40);
  const many = Array.from({ length: MAX_PROBLEMS + 5 }, (_, index) =>
    problem(FILE, `key${index}`, 'wrong', 'change it'),
  );
  const text = formatProblems('Not applied', many);
  assert.match(text, /\(25 problems\)/u);
  assert.match(text, /… and 5 more\./u);
  assert.equal(text.split('\n').filter((line) => /^\d+\. /u.test(line)).length, MAX_PROBLEMS);
});

await test('/dock-config names the setting, the reason and the fix, and says nothing changed', () => {
  const said = explainConfig('{"shrink":["drop:cots"]}');
  assert.match(said, /Nothing changed/u);
  assert.match(said, /\/dock-config: shrink/u);
  assert.match(said, /did you mean drop:cost/u);
  const several = explainConfig(
    '{"shrink":["drop:cots"],"slots":{"quota":{"wording":"x"}},"rows":[]}',
  );
  assert.match(several, /\(3 problems\)/u);
  const syntax = explainConfig('{"shrink": [');
  assert.match(syntax, /not valid JSON/u);
  assert.match(syntax, /one JSON object on one line/u);
  assert.match(explainConfig('x'.repeat(20_000)), /longer than 16 KiB/u);
});

await test('a configuration that breaks a rule across parts is reported once, as a whole', () => {
  const problems = checkConfig(
    {
      rows: [
        { left: ['workspace', 'workspace'], right: [] },
        { left: [], right: [] },
      ],
    },
    '/dock-config',
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0]?.fix ?? '', /unique/u);
  assert.deepEqual(
    checkConfig({ shrink: ['...', 'drop:cost'], slots: { cost: { gap: 2 } } }, '/dock-config'),
    [],
  );
});

const dir = mkdtempSync(join(tmpdir(), 'dock-problems-'));
const write = (name: string, text: string, mode = 0o600): string => {
  const path = join(dir, name);
  writeFileSync(path, text, { mode });
  chmodSync(path, mode);
  return path;
};

await test('a file with any problem applies nothing of itself, lists every problem, and is never changed', () => {
  const text = '{"version":1,"glyphs":"portable","limits":"maybe","shrink":["drop:cots"]}';
  const path = write('bad.json', text);
  const loaded = loadSettings(path);
  assert.deepEqual(
    loaded.settings,
    defaultSettings(),
    'not even the valid glyphs setting is applied',
  );
  assert.equal(loaded.problems?.length, 2);
  assert.ok(loaded.problem);
  assert.equal(readFileSync(path, 'utf8'), text, 'the file is byte-identical');
  const fixed = write(
    'good.json',
    '{"version":1,"glyphs":"portable","limits":"on","shrink":["drop:cost"]}',
  );
  const applied = loadSettings(fixed);
  assert.equal(applied.problems, undefined);
  assert.equal(applied.settings.glyphs, 'portable');
  assert.equal(applied.settings.limits, 'on');
});

const first = (loaded: SettingsLoad): Problem => {
  const item = loaded.problems?.[0];
  assert.ok(item, 'a problem was expected');
  return item;
};

await test('problems with the file itself say where and what to run', () => {
  const syntax = first(loadSettings(write('syntax.json', '{"version":1,')));
  assert.equal(syntax.setting, '(file)');
  assert.match(syntax.reason, /not valid JSON/u);
  const open = first(loadSettings(write('open.json', '{"version":1}', 0o644)));
  assert.match(open.fix, /^Run: chmod 600 /u);
  const big = first(loadSettings(write('big.json', `{"version":1,"x":"${'a'.repeat(20_000)}"}`)));
  assert.match(big.fix, /16 KiB/u);
  for (const item of [syntax, open, big]) complete(item);
});

await test('a file with a problem always gives the defaults; a missing file is not a problem', () => {
  for (const name of ['syntax.json', 'open.json', 'big.json'])
    assert.deepEqual(loadSettings(join(dir, name)).settings, defaultSettings(), name);
  assert.equal(loadSettings(join(dir, 'missing.json')).problem, undefined);
});
