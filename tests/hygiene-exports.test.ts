import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { GITHUB, NEUTRAL_GIT, exporter, scratch } from './support/hygiene-scratch.js';

await test('an exported file that names a file the export leaves out fails, with the file and the line', () => {
  const s = scratch();
  try {
    s.write('docs/design-note.md', 'a private note\n');
    s.write('README.md', 'Intro\nSee docs/design-note.md for why.\n');
    s.commit('Point at a private note');
    const result = s.check(s.first);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /names a file the export leaves out/u);
    assert.match(result.stderr, /README\.md:2:docs\/design-note\.md/u);
  } finally {
    s.done();
  }
});

await test('naming an exported file passes, and so does a left-out file nobody names', () => {
  const s = scratch();
  try {
    s.write('docs/footer-configuration.md', 'a user document\n');
    s.write('docs/design-note.md', 'a private note, named by nobody\n');
    s.write(
      'README.md',
      'See docs/footer-configuration.md. A folder like docs/ in prose is fine.\n',
    );
    s.commit('Point at a public document');
    const result = s.check(s.first);
    assert.equal(result.status, 0, result.stderr);
  } finally {
    s.done();
  }
});

await test('one list decides what is exported and what is checked', () => {
  const exportScript = readFileSync(exporter, 'utf8');
  assert.equal(exportScript.includes('git ls-files'), false, 'the export holds no list of its own');
  assert.match(exportScript, /public-files\.sh/u);
});

await test('the tree as it will be published passes the whole check', () => {
  const out = mkdtempSync(join(tmpdir(), 'hygiene-export-'));
  try {
    const run = (command: string, args: string[], cwd: string) =>
      execFileSync(command, args, {
        cwd,
        env: { ...process.env, ...NEUTRAL_GIT },
        encoding: 'utf8',
      });
    run('sh', [exporter, out], join(import.meta.dirname, '..'));
    run('git', ['init', '-q', '-b', 'main'], out);
    run('git', ['add', '-A'], out);
    execFileSync(
      'git',
      ['-c', 'gc.auto=0', '-c', 'maintenance.auto=false', 'commit', '-q', '-m', 'Public tree'],
      {
        cwd: out,
        env: {
          ...process.env,
          ...NEUTRAL_GIT,
          GIT_AUTHOR_NAME: 'A',
          GIT_AUTHOR_EMAIL: GITHUB,
          GIT_COMMITTER_NAME: 'C',
          GIT_COMMITTER_EMAIL: GITHUB,
        },
      },
    );
    const result = spawnSync('sh', ['scripts/check-hygiene.sh'], { cwd: out, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(out, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
