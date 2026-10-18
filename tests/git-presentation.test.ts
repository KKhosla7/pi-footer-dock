import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultFooterConfig } from '../src/core/footer-config.js';
import { renderSegment } from '../src/ui/segments.js';
import { nerdGlyphs, portableGlyphs } from '../src/ui/glyphs.js';
import { unknownGit } from '../src/adapters/git.js';
import { demoSnapshot } from './reference.js';

await test('stock Git counters give units/plurals while preserving glyph choices', () => {
  for (const glyphs of [nerdGlyphs, portableGlyphs]) {
    for (const count of [0, 1, 2]) {
      const snapshot = { ...demoSnapshot, git: { branch: 'main', changed: count, ahead: count } };
      const options = { paint: (text: string) => text, glyphs };
      const settings = { config: defaultFooterConfig(), look: 'xl' as const };
      assert.equal(
        renderSegment('changes', snapshot, options, settings).text,
        `${glyphs.changed}  ${count} ${count === 1 ? 'file' : 'files'}`,
      );
      assert.equal(
        renderSegment('ahead', snapshot, options, settings).text,
        `${glyphs.ahead}  ${count} ahead`,
      );
    }
  }
});

await test('unavailable Git coverage is explicitly unavailable rather than zero; no-upstream is not zero', () => {
  const settings = { config: defaultFooterConfig(), look: 'xl' as const };
  const options = { paint: (text: string) => text, glyphs: portableGlyphs };
  const snapshot = { ...demoSnapshot, git: { ...unknownGit, monitoring: 'unavailable' as const } };
  assert.equal(renderSegment('branch', snapshot, options, settings).text, 'Git unavailable');
  assert.equal(renderSegment('changes', snapshot, options, settings).text, '');
  assert.equal(renderSegment('ahead', snapshot, options, settings).text, '');
  assert.equal(
    renderSegment(
      'ahead',
      { ...demoSnapshot, git: { ...demoSnapshot.git, ahead: null } },
      options,
      settings,
    ).text,
    '',
  );
  settings.config.slots.changes = { text: '{changes}' };
  settings.config.slots.ahead = { text: '{ahead}' };
  assert.equal(renderSegment('changes', snapshot, options, settings).text, '—');
  assert.equal(renderSegment('ahead', snapshot, options, settings).text, '—');
});
