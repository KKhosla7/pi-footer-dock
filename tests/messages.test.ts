import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { DeferredRefresh } from '../src/adapters/deferred-refresh.js';
import { runsFrom, withoutPersonalPaths } from '../src/adapters/diagnostics.js';
import { clean, say } from '../src/notify.js';

const noticeOf = (text: string): string[] => {
  const shown: string[] = [];
  say({ ui: { notify: (message: string) => shown.push(message) } } as never, text);
  return shown;
};

await test('messages are cleaned: terminal sequences and controls go, line breaks stay, length is bounded', () => {
  assert.equal(clean('a\u001b[31mred\u001b[0m b\u0007\u0000c\nd\te'), 'ared bc\nd\te');
  assert.equal(clean('\u001b]0;title\u0007hello'), 'hello');
  const huge = noticeOf('x'.repeat(1_000_000))[0] ?? '';
  assert.ok(huge.length < 8_100 && huge.endsWith('… (cut)'));
  assert.deepEqual(noticeOf('plain'), ['plain']);
});

await test('a message that cannot be shown never throws (a stale context after /reload)', () => {
  const stale = {
    ui: {
      notify: () => {
        throw new Error('This extension ctx is stale after session replacement or reload');
      },
    },
  };
  assert.doesNotThrow(() => {
    say(stale as never, 'hello', 'error');
  });
});

await test('no source file calls ui.notify directly: say() in src/notify.ts is the only door', () => {
  const offenders: string[] = [];
  const walk = (folder: string): void => {
    for (const entry of readdirSync(folder)) {
      const path = join(folder, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith('.ts') && !path.endsWith(join('src', 'notify.ts')))
        if (readFileSync(path, 'utf8').includes('.notify(')) offenders.push(path);
    }
  };
  walk(resolve('src'));
  assert.deepEqual(offenders, []);
});

await test('a deferred refresh that throws cannot escape its timer, and later refreshes still run', async () => {
  const escaped: unknown[] = [];
  const catcher = (error: unknown): void => {
    escaped.push(error);
  };
  process.on('uncaughtException', catcher);
  try {
    const deferred = new DeferredRefresh();
    deferred.schedule(() => {
      throw new Error('refresh failed');
    });
    await delay(30);
    let ran = false;
    deferred.schedule(() => {
      ran = true;
    });
    await delay(30);
    assert.equal(ran, true);
    assert.deepEqual(escaped, []);
  } finally {
    process.off('uncaughtException', catcher);
  }
});

await test('the diagnostics text names no home folder, and says only where the extension runs from', () => {
  const home = homedir();
  const text = withoutPersonalPaths(`{"a":"${home}/project","b":"${home}/.pi/agent/x.jsonl"}`);
  assert.ok(!text.includes(home));
  assert.match(text, /"~\/project"/u);
  assert.equal(
    runsFrom('file:///home/someone/x/node_modules/pi-footer-dock/src/runtime.js'),
    'installed package',
  );
  assert.equal(
    runsFrom('file:///home/someone/dev/pi-footer-dock/src/runtime.ts'),
    'development checkout',
  );
});
