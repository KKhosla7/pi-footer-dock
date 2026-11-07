import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { SCENARIOS, WIDTHS, render } from './support/layout-matrix.js';

/**
 * The golden matrix: what the footer prints, as plain text, over many widths and configurations.
 * It records today's behaviour so that every change of the layout is a reviewed diff of
 * `tests/golden/layout-matrix.txt` (regenerate with UPDATE_GOLDEN=1, then read the diff).
 */
const goldenFile = join(dirname(fileURLToPath(import.meta.url)), 'golden', 'layout-matrix.txt');

function matrix(): string {
  return SCENARIOS.flatMap((scenario) => [
    `# ${scenario.name}`,
    ...WIDTHS.flatMap((width) => [`## ${width}`, ...render(scenario, width)]),
    '',
  ]).join('\n');
}

await test('the footer matches the golden matrix (UPDATE_GOLDEN=1 rewrites it; read the diff)', () => {
  const actual = matrix();
  if (process.env.UPDATE_GOLDEN === '1') {
    mkdirSync(dirname(goldenFile), { recursive: true });
    writeFileSync(goldenFile, actual);
    return;
  }
  assert.ok(
    existsSync(goldenFile),
    'tests/golden/layout-matrix.txt is missing: run with UPDATE_GOLDEN=1',
  );
  const expected = readFileSync(goldenFile, 'utf8');
  if (actual === expected) return;
  const a = actual.split('\n');
  const e = expected.split('\n');
  const at = a.findIndex((line, index) => line !== e[index]);
  assert.fail(
    `layout changed from the golden matrix at line ${at + 1}:\n  expected: ${e[at]}\n  actual:   ${a[at]}\nRegenerate with UPDATE_GOLDEN=1 and review the diff.`,
  );
});
