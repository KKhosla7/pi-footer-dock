import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

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
