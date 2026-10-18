process.env.TZ = 'America/New_York';
import assert from 'node:assert/strict';
import { appendFileSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { test } from 'node:test';
import { groupBy, sum } from '../src/core/history/queries.js';
import { NO_PRICES } from '../src/core/price-source.js';
import { UsageScanner } from '../src/adapters/history/scanner.js';
import type { ScanOptions } from '../src/adapters/history/scanner.js';
import { Sessions } from './support/history-fixture.js';

const scanner = (sessions: Sessions, extra: Partial<ScanOptions> = {}) =>
  new UsageScanner({
    root: sessions.sessions,
    cachePath: sessions.cache,
    prices: () => NO_PRICES,
    ...extra,
  });
const run = (s: UsageScanner) => s.scan(new AbortController().signal);

await test('the rollup totals equal the sum of the replies, by project', async () => {
  const fixture = new Sessions();
  const a = fixture.folder('alpha');
  const b = fixture.folder('beta');
  fixture.log(a, 'a', [
    { input: 100, read: 900, output: 10, total: 0.5 },
    { input: 50, read: 450, output: 5, total: 0.25 },
  ]);
  fixture.log(b, 'b', [{ input: 1_000, read: 0, output: 100, total: 2 }]);
  const history = await run(scanner(fixture));
  const total = sum(history.rows);
  assert.deepEqual(
    [total.responses, total.input, total.read, total.output, total.cost],
    [3, 1_150, 1_350, 115, 2.75],
  );
  assert.equal(history.files, 2);
  assert.equal(new Set(history.rows.map((row) => row.project)).size, 2);
  const costs = [...groupBy(history.rows, 'project').values()].map((totals) => totals.cost);
  assert.deepEqual(costs.sort(), [0.75, 2]);
});

await test('worktrees of one repository are one project; another repository is another', async () => {
  const fixture = new Sessions();
  const main = fixture.repository('main-repo');
  const other = fixture.repository('other-repo');
  const { execFileSync } = await import('node:child_process');
  const tree = `${fixture.root}/tree`;
  execFileSync('git', ['worktree', 'add', '--quiet', tree, '-b', 'side'], { cwd: main });
  fixture.log(main, 'm', [{ input: 1, read: 0, output: 1, total: 1 }]);
  fixture.log(tree, 't', [{ input: 1, read: 0, output: 1, total: 1 }]);
  fixture.log(other, 'o', [{ input: 1, read: 0, output: 1, total: 1 }]);
  const projects = new Set((await run(scanner(fixture))).rows.map((row) => row.project));
  assert.equal(projects.size, 2);
});

await test('scanning twice gives the same rows, and a second scan reads only what was appended', async () => {
  const fixture = new Sessions();
  const cwd = fixture.folder('proj');
  const log = fixture.log(cwd, 'p', [
    { input: 10, read: 90, output: 1, total: 0.1 },
    { input: 20, read: 80, output: 2, total: 0.2 },
  ]);
  const first = await run(scanner(fixture));
  const again = await run(scanner(fixture));
  assert.deepEqual(again.rows, first.rows);
  // Overwrite the first reply's token count in place (same length). A scan that re-read the file
  // would see the new number; an incremental one keeps what it had.
  const text = readFileSync(log.file(), 'utf8');
  writeFileSync(log.file(), text.replace('"input":10,', '"input":99,'));
  fixture.reply(log.manager, { input: 30, read: 70, output: 3, total: 0.3 });
  const grown = sum((await run(scanner(fixture))).rows);
  assert.equal(grown.input, 10 + 20 + 30, 'the earlier lines were not read again');
  assert.equal(grown.responses, 3);
  const rebuilt = new Sessions();
  rebuilt.log(rebuilt.folder('proj'), 'p', [
    { input: 10, read: 90, output: 1, total: 0.1 },
    { input: 20, read: 80, output: 2, total: 0.2 },
    { input: 30, read: 70, output: 3, total: 0.3 },
  ]);
  assert.equal(
    sum((await run(scanner(rebuilt))).rows).input,
    60,
    'a full scan gives the same total',
  );
});

await test('a replaced or shortened log is rebuilt from the start, never half added', async () => {
  const fixture = new Sessions();
  const cwd = fixture.folder('proj');
  const log = fixture.log(cwd, 'p', [
    { input: 10, read: 0, output: 1, total: 1 },
    { input: 20, read: 0, output: 1, total: 1 },
  ]);
  await run(scanner(fixture));
  const other = new Sessions();
  const replacement = other.log(other.folder('proj'), 'q', [
    { input: 7, read: 0, output: 1, total: 1 },
  ]);
  writeFileSync(log.file(), readFileSync(replacement.file(), 'utf8'));
  const after = sum((await run(scanner(fixture))).rows);
  assert.deepEqual([after.responses, after.input], [1, 7]);
});

await test('the log in use is refreshed on its own, reading only the lines it gained', async () => {
  const fixture = new Sessions();
  const cwd = fixture.folder('proj');
  const live = fixture.log(cwd, 'live', [{ input: 10, read: 0, output: 1, total: 1 }]);
  fixture.log(cwd, 'old', [{ input: 5, read: 0, output: 1, total: 1 }]);
  const reader = scanner(fixture);
  assert.equal(sum((await run(reader)).rows).input, 15);
  const text = readFileSync(live.file(), 'utf8');
  writeFileSync(live.file(), text.replace('"input":10,', '"input":99,'));
  fixture.reply(live.manager, { input: 7, read: 0, output: 1, total: 1 });
  const after = await reader.refresh(live.file(), new AbortController().signal);
  assert.equal(
    sum(after.rows).input,
    10 + 5 + 7,
    'only the new reply was read, and the old log counted once',
  );
  assert.equal(after.files, 2);
  assert.deepEqual(
    (await reader.refresh('/no/such/log.jsonl', new AbortController().signal)).rows,
    after.rows,
  );
});

await test('lines that cannot be read are counted, and links, newer formats and giant lines are passed over', async () => {
  const fixture = new Sessions();
  const cwd = fixture.folder('proj');
  const log = fixture.log(cwd, 'p', [{ input: 10, read: 0, output: 1, total: 1 }]);
  appendFileSync(log.file(), '{"type":"message","usage": broken\n');
  appendFileSync(log.file(), `{"type":"custom","data":"${'x'.repeat(5 * 1024 * 1024)}"}\n`);
  fixture.reply(log.manager, { input: 5, read: 0, output: 1, total: 1 });
  const newer = fixture.log(cwd, 'new', [{ input: 99, read: 0, output: 1, total: 1 }]);
  writeFileSync(
    newer.file(),
    readFileSync(newer.file(), 'utf8').replace('"version":3', '"version":99'),
  );
  symlinkSync(log.file(), `${fixture.sessions}/p/link.jsonl`);
  const history = await run(scanner(fixture));
  const total = sum(history.rows);
  assert.deepEqual([total.input, total.responses], [15, 2]);
  assert.ok(history.skipped >= 2, `${history.skipped} skipped`);
  assert.equal(history.files, 1, 'the newer format and the link were not read');
});

await test('the cache is private, and a damaged or foreign cache is ignored and rebuilt', async () => {
  const fixture = new Sessions();
  fixture.log(fixture.folder('proj'), 'p', [{ input: 10, read: 0, output: 1, total: 1 }]);
  const first = await run(scanner(fixture));
  assert.equal(statSync(fixture.cache).mode & 0o777, 0o600);
  writeFileSync(
    fixture.cache,
    readFileSync(fixture.cache, 'utf8').replace('"day":', '"day":"nope","x":'),
  );
  assert.deepEqual((await run(scanner(fixture))).rows, first.rows);
  writeFileSync(fixture.cache, '{"version":9,"files":[]}');
  assert.deepEqual((await run(scanner(fixture))).rows, first.rows);
});

await test('a cancelled scan writes nothing and leaves the previous cache alone', async () => {
  const fixture = new Sessions();
  fixture.log(fixture.folder('proj'), 'p', [{ input: 10, read: 0, output: 1, total: 1 }]);
  await run(scanner(fixture));
  const before = readFileSync(fixture.cache, 'utf8');
  fixture.log(fixture.folder('proj2'), 'q', [{ input: 99, read: 0, output: 1, total: 1 }]);
  const stop = new AbortController();
  stop.abort();
  await scanner(fixture).scan(stop.signal);
  assert.equal(readFileSync(fixture.cache, 'utf8'), before);
});
