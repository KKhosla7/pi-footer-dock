import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { commentLines, commentsInRepository } from '../scripts/check-comments.js';

await test('the check finds every kind of comment in TypeScript and JavaScript, and only comments', () => {
  const text = [
    '#!/usr/bin/env node',
    'const a = 1; // trailing',
    '/* block */',
    '/** doc */',
    "const s = '// not a comment';",
    'const r = /\\/\\//u;',
    'const t = `${"//"} /* nor this */`;',
    'function f() {',
    '  return 2; /* inline */',
    '}',
  ].join('\n');
  assert.deepEqual(commentLines(text, 'script'), [2, 3, 4, 9]);
  assert.deepEqual(commentLines('const clean = 1;\n', 'script'), []);
  assert.deepEqual(commentLines('{ // empty block\n}\n', 'script'), [1]);
});

await test('the check finds shell comments and leaves quotes, $#, ${#x} and the shebang alone', () => {
  const text = [
    '#!/bin/sh',
    '# a comment',
    'echo "# in double quotes" \'# in single quotes\'',
    'count=$# length=${#name}',
    'cmd arg # trailing',
    'echo a\\#b',
  ].join('\n');
  assert.deepEqual(commentLines(text, 'shell'), [2, 5]);
  assert.deepEqual(commentLines('set -eu\n', 'shell'), []);
});

await test('the check finds Python comments and leaves strings and docstrings alone', () => {
  const text = [
    '#!/usr/bin/env python3',
    '# a comment',
    'x = "#"',
    "y = '# not'",
    '"""A docstring with # inside',
    'and a second line."""',
    'z = 1  # trailing',
  ].join('\n');
  assert.deepEqual(commentLines(text, 'python'), [2, 7]);
});

await test('the repository has no comment in its code', () => {
  const found = commentsInRepository(join(import.meta.dirname, '..'));
  assert.deepEqual(found, []);
});
