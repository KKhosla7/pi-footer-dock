import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * A ratchet on how far each stock slot is spread over the source.
 * A slot's id quoted in many files means a new slot, or a change to one, touches many places. The
 * numbers below are today's counts and may only go down; the goal is 7 or fewer. A
 * count includes unrelated uses of a plain word (`'input'`, `'model'`), which is why it is a
 * ratchet and not a rule: lower a number when the code improves, raise one only with a reason in
 * the commit that does it.
 */
const BASELINE: Record<string, number> = {
  workspace: 9,
  branch: 9,
  changes: 9,
  ahead: 13,
  model: 13,
  thinking: 8,
  context: 9,
  'context-usage': 6,
  compaction: 8,
  input: 9,
  output: 9,
  cache: 7,
  speed: 7,
  quota: 9,
  'quota-more': 2,
  cost: 9,
};
const source = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const files = (readdirSync(source, { recursive: true }) as string[])
  .filter((name) => name.endsWith('.ts'))
  .map((name) => readFileSync(join(source, name), 'utf8'));
const spread = (id: string): number =>
  files.filter((text) => text.includes(`'${id}'`) || text.includes(`"${id}"`)).length;

await test('no stock slot is spread over more source files than its baseline', () => {
  assert.ok(files.length > 100, 'the source tree was not read');
  for (const [id, limit] of Object.entries(BASELINE))
    assert.ok(
      spread(id) <= limit,
      `${id} is quoted in ${spread(id)} files, the ratchet is ${limit}`,
    );
});
