import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const script = join(import.meta.dirname, '../scripts/check-hygiene.sh');
const GITHUB = '4499768+someone@users.noreply.github.com';
// Built at run time, so this file holds no address or home path of its own (the check would flag it).
const PERSONAL = ['jane', 'mail.test'].join('@');
const LINUX_HOME = ['/home', 'jane', 'Projects', 'x', ''].join('/');
const MAC_HOME = ['/Users', 'jane', 'Projects', 'x', ''].join('/');
const NEUTRAL_GIT = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };

/** A scratch repository with the script in it and one clean commit; `done` removes it. */
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'hygiene-'));
  const git = (args: string[], env: Record<string, string> = {}): string =>
    execFileSync('git', args, {
      cwd: dir,
      env: { ...process.env, ...NEUTRAL_GIT, ...env },
      encoding: 'utf8',
    });
  git(['init', '-q', '-b', 'main']);
  mkdirSync(join(dir, 'scripts'));
  copyFileSync(script, join(dir, 'scripts/check-hygiene.sh'));
  const commit = (message: string, author = GITHUB, committer = author): string => {
    git(['add', '-A']);
    git(['commit', '-q', '-m', message], {
      GIT_AUTHOR_NAME: 'A',
      GIT_AUTHOR_EMAIL: author,
      GIT_COMMITTER_NAME: 'C',
      GIT_COMMITTER_EMAIL: committer,
    });
    return git(['rev-parse', 'HEAD']).trim();
  };
  const write = (name: string, text: string): void => {
    mkdirSync(join(dir, name, '..'), { recursive: true });
    writeFileSync(join(dir, name), text);
  };
  const check = (base?: string) =>
    spawnSync('sh', ['scripts/check-hygiene.sh', ...(base ? [base] : [])], {
      cwd: dir,
      encoding: 'utf8',
    });
  write('README.md', 'Fixtures: a@example.com and /home/someone/project/\n');
  const first = commit('First');
  return {
    git,
    commit,
    write,
    check,
    first,
    done: () => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

await test('a clean history and tree passes', () => {
  const s = scratch();
  try {
    s.write('more.md', 'plain\n');
    s.commit('Add a file');
    const result = s.check(s.first);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /hygiene: ok/u);
  } finally {
    s.done();
  }
});

await test('a personal author or committer address fails, and is never repeated in the output', () => {
  for (const [author, committer] of [
    [PERSONAL, GITHUB],
    [GITHUB, PERSONAL],
  ] as const) {
    const s = scratch();
    try {
      s.write('more.md', 'plain\n');
      s.commit('Add a file', author, committer);
      const result = s.check(s.first);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /not a GitHub noreply address/u);
      assert.equal(
        (result.stdout + result.stderr).includes(PERSONAL),
        false,
        'the address is not echoed',
      );
    } finally {
      s.done();
    }
  }
});

await test('trailers and generated-with lines fail, in any letter case', () => {
  const messages = [
    'Add\n\nCo-authored-by: Someone <a@example.com>',
    'Add\n\nsigned-off-by: Someone <a@example.com>',
    'Add\n\nREVIEWED-BY: Someone',
    'Add\n\nGenerated with [A tool](https://example.com)',
  ];
  for (const message of messages) {
    const s = scratch();
    try {
      s.write('more.md', 'plain\n');
      s.commit(message);
      const result = s.check(s.first);
      assert.equal(result.status, 1, message);
      assert.match(result.stderr, /trailer or a generated-with line/u);
    } finally {
      s.done();
    }
  }
});

await test('an email address, a home-folder path or a cache file in a tracked file fails', () => {
  const cases: [string, string, RegExp][] = [
    ['notes.md', `write to ${PERSONAL}\n`, /email address in: notes\.md/u],
    ['notes.md', `see ${LINUX_HOME}\n`, /home-folder path in: notes\.md/u],
    ['notes.md', `see ${MAC_HOME}\n`, /home-folder path in: notes\.md/u],
    ['scripts/__pycache__/a.pyc', 'x', /tracked cache files/u],
    ['.DS_Store', 'x', /tracked cache files/u],
  ];
  for (const [name, text, expected] of cases) {
    const s = scratch();
    try {
      s.write(name, text);
      s.commit('Add');
      const result = s.check(s.first);
      assert.equal(result.status, 1, name + text);
      assert.match(result.stderr, expected);
      assert.equal(result.stderr.includes('jane'), false, 'the finding itself is not echoed');
    } finally {
      s.done();
    }
  }
});

await test('merge commits are skipped, and an unknown base checks only the last commit', () => {
  const s = scratch();
  try {
    s.git(['checkout', '-q', '-b', 'side']);
    s.write('side.md', 'plain\n');
    s.commit('Side');
    s.git(['checkout', '-q', 'main']);
    s.write('main.md', 'plain\n');
    s.commit('Main');
    s.git(['merge', '--no-ff', '-q', 'side', '-m', 'Merge side'], {
      GIT_AUTHOR_NAME: 'A',
      GIT_AUTHOR_EMAIL: PERSONAL,
      GIT_COMMITTER_NAME: 'C',
      GIT_COMMITTER_EMAIL: PERSONAL,
    });
    assert.equal(s.check(s.first).status, 0, 'the merge commit itself is not judged');
    assert.equal(
      s.check('0'.repeat(40)).status,
      0,
      'only HEAD is checked: a merge is skipped, the commit before it is clean',
    );
  } finally {
    s.done();
  }
});
