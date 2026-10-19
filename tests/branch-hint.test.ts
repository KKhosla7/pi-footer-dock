import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withBranchHint } from '../src/core/branch-hint.js';
import type { GitState } from '../src/core/model.js';

const unread: GitState = { branch: null, changed: null, ahead: null };

await test('before Git is read, the branch Pi already knows is shown; counts stay unknown', () => {
  assert.deepEqual(withBranchHint(unread, 'main'), { branch: 'main', changed: null, ahead: null });
});

await test('a state that is already known, or unavailable, is never changed', () => {
  const read: GitState = { branch: 'feature', changed: 2, ahead: 1 };
  assert.equal(withBranchHint(read, 'main'), read);
  const unavailable: GitState = { ...unread, monitoring: 'unavailable' };
  assert.equal(withBranchHint(unavailable, 'main'), unavailable);
  const clean: GitState = { branch: 'main', changed: 0, ahead: 0 };
  assert.equal(withBranchHint(clean, 'other'), clean);
});

await test('no branch known (not a repository) shows nothing', () => {
  assert.equal(withBranchHint(unread, null), unread);
  assert.equal(withBranchHint(unread, ''), unread);
});
