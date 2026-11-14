import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const root = join(import.meta.dirname, '..');
const hasGitleaks = spawnSync('gitleaks', ['version'], { encoding: 'utf8' }).status === 0;
const TOKEN = ['ghp_', 'aB3dE5fG7hI9jK1lM3nO5pQ7rS9tU1vW3xYz'].join('');
const NEUTRAL = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };
const IDENTITY = {
  GIT_AUTHOR_NAME: 'A',
  GIT_AUTHOR_EMAIL: '1+someone@users.noreply.github.com',
  GIT_COMMITTER_NAME: 'C',
  GIT_COMMITTER_EMAIL: '1+someone@users.noreply.github.com',
};

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'secrets-'));
  const git = (args: string[]) =>
    spawnSync('git', args, {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, ...NEUTRAL, ...IDENTITY },
    });
  const ok = (args: string[]): string => {
    const result = git(args);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  execFileSync('git', ['init', '-q', '-b', 'main'], {
    cwd: dir,
    env: { ...process.env, ...NEUTRAL },
  });
  mkdirSync(join(dir, 'scripts'));
  copyFileSync(join(root, 'scripts/check-secrets.sh'), join(dir, 'scripts/check-secrets.sh'));
  copyFileSync(join(root, 'scripts/install-hooks.sh'), join(dir, 'scripts/install-hooks.sh'));
  copyFileSync(join(root, '.gitleaks.toml'), join(dir, '.gitleaks.toml'));
  cpSync(join(root, '.githooks'), join(dir, '.githooks'), { recursive: true });
  writeFileSync(join(dir, 'notes.txt'), 'plain text\n');
  ok(['add', '-A']);
  ok(['commit', '-q', '-m', 'First']);
  const check = (...args: string[]) =>
    spawnSync('sh', ['scripts/check-secrets.sh', ...args], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, ...NEUTRAL },
    });
  return {
    dir,
    git,
    ok,
    check,
    write: (name: string, text: string) => {
      mkdirSync(join(dir, name, '..'), { recursive: true });
      writeFileSync(join(dir, name), text);
    },
    done: () => {
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    },
  };
}
const seen = (result: { stdout: string; stderr: string }): string => result.stdout + result.stderr;

await test('a clean repository passes in every mode', { skip: !hasGitleaks }, () => {
  const s = scratch();
  try {
    for (const mode of ['staged', 'tree', 'history']) {
      const result = s.check(mode);
      assert.equal(result.status, 0, `${mode}: ${seen(result)}`);
      assert.match(result.stdout, /secrets: ok/u);
    }
    assert.equal(s.check('range', 'HEAD').status, 0);
  } finally {
    s.done();
  }
});

await test(
  'a token is found in staged, tree, history and range, and is never printed',
  { skip: !hasGitleaks },
  () => {
    const s = scratch();
    try {
      s.write('src/leak.ts', `export const t = "${TOKEN}";\n`);
      s.ok(['add', 'src/leak.ts']);
      for (const args of [['staged'], ['tree']]) {
        const result = s.check(...args);
        assert.equal(result.status, 1, args.join());
        assert.match(seen(result), /github-pat/u);
        assert.match(seen(result), /src\/leak\.ts/u);
        assert.equal(seen(result).includes(TOKEN), false, 'the token is not echoed');
        assert.equal(seen(result).includes(TOKEN.slice(4, 20)), false, 'nor a part of it');
      }
      s.ok(['commit', '-q', '--no-verify', '-m', 'Leak']);
      assert.equal(s.check('history').status, 1);
      assert.equal(s.check('range', 'HEAD~1..HEAD').status, 1);
      s.write('later.txt', 'clean\n');
      s.ok(['add', '-A']);
      s.ok(['commit', '-q', '--no-verify', '-m', 'Clean']);
      assert.equal(
        s.check('range', 'HEAD~1..HEAD').status,
        0,
        'the range sees only its own commits',
      );
    } finally {
      s.done();
    }
  },
);

await test(
  'a credential file is refused by name, whatever it holds',
  { skip: !hasGitleaks },
  () => {
    for (const name of ['auth.json', '.env', '.env.local', 'keys/server.pem', 'id_ed25519']) {
      const s = scratch();
      try {
        s.write(name, '{}\n');
        s.ok(['add', '-f', name]);
        const result = s.check('staged');
        assert.equal(result.status, 1, name);
        assert.match(seen(result), /credential-file/u);
      } finally {
        s.done();
      }
    }
    const s = scratch();
    try {
      s.write('.envrc', 'use flake\n');
      s.write('docs/author.json', '{}\n');
      s.ok(['add', '-A']);
      assert.equal(s.check('staged').status, 0, '.envrc and a similar name are fine');
    } finally {
      s.done();
    }
  },
);

await test('without gitleaks the check fails and says so, instead of passing', () => {
  const s = scratch();
  try {
    const result = spawnSync('sh', ['scripts/check-secrets.sh', 'tree'], {
      cwd: s.dir,
      encoding: 'utf8',
      env: { PATH: '/usr/bin:/bin', ...NEUTRAL },
    });
    const bare = spawnSync('sh', ['-c', 'command -v gitleaks'], { env: { PATH: '/usr/bin:/bin' } });
    if (bare.status === 0) return;
    assert.equal(result.status, 1);
    assert.match(result.stderr, /gitleaks is not installed/u);
  } finally {
    s.done();
  }
});

await test(
  'the hooks stop a commit and a push that carry a secret, and let clean ones through',
  { skip: !hasGitleaks },
  () => {
    const s = scratch();
    try {
      s.ok(['config', 'core.hooksPath', '.githooks']);
      const remote = join(s.dir, '..', `${s.dir.split('/').at(-1)}-remote.git`);
      execFileSync('git', ['init', '-q', '--bare', remote], {
        env: { ...process.env, ...NEUTRAL },
      });
      s.ok(['remote', 'add', 'origin', remote]);
      s.write('clean.txt', 'clean\n');
      s.ok(['add', '-A']);
      s.ok(['commit', '-q', '-m', 'Clean']);
      s.ok(['push', '-q', 'origin', 'main']);
      s.write('leak.ts', `export const t = "${TOKEN}";\n`);
      s.ok(['add', 'leak.ts']);
      const before = s.ok(['rev-parse', 'HEAD']);
      const blocked = s.git(['commit', '-q', '-m', 'Leak']);
      assert.notEqual(blocked.status, 0, 'the commit is stopped');
      assert.equal(s.ok(['rev-parse', 'HEAD']), before, 'no commit was made');
      assert.equal(seen(blocked).includes(TOKEN), false);
      s.ok(['commit', '-q', '--no-verify', '-m', 'Leak anyway']);
      const push = s.git(['push', 'origin', 'main']);
      assert.notEqual(push.status, 0, 'the push is stopped');
      assert.equal(seen(push).includes(TOKEN), false);
      const remoteHead = execFileSync('git', ['rev-parse', 'main'], {
        cwd: remote,
        encoding: 'utf8',
        env: { ...process.env, ...NEUTRAL },
      });
      assert.notEqual(
        remoteHead.trim(),
        s.ok(['rev-parse', 'HEAD']).trim(),
        'the remote did not get the commit',
      );
      rmSync(remote, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    } finally {
      s.done();
    }
  },
);

await test('the installer points git at the hooks', () => {
  const s = scratch();
  try {
    const result = spawnSync('sh', ['scripts/install-hooks.sh'], {
      cwd: s.dir,
      encoding: 'utf8',
      env: { ...process.env, ...NEUTRAL },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(s.ok(['config', 'core.hooksPath']).trim(), '.githooks');
  } finally {
    s.done();
  }
});

await test(
  'this repository, its history and its tree carry no secret',
  { skip: !hasGitleaks },
  () => {
    for (const mode of ['history', 'tree']) {
      const result = spawnSync('sh', ['scripts/check-secrets.sh', mode], {
        cwd: root,
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, `${mode}: ${seen(result)}`);
    }
  },
);
