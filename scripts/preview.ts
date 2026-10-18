import { demoSnapshot } from '../tests/reference.js';
import { portableGlyphs, nerdGlyphs } from '../src/ui/glyphs.js';
import { layoutFooter } from '../src/ui/layout.js';
import { createPaint } from '../src/ui/palette.js';

const width = Number(process.env.COLUMNS ?? 220);
const glyphs = process.argv.includes('--portable') ? portableGlyphs : nerdGlyphs;
const layout = layoutFooter(demoSnapshot, Number.isFinite(width) ? width : 140, {
  paint: createPaint({
    fg: (color, text) => {
      const code = color === 'dim' ? 90 : color === 'warning' ? 33 : color === 'accent' ? 36 : 37;
      return `\u001b[${code}m${text}\u001b[39m`;
    },
    bold: (text) => `\u001b[1m${text}\u001b[22m`,
    underline: (text) => `\u001b[4m${text}\u001b[24m`,
  }),
  glyphs,
  now: 4_000_000_000_000,
});
process.stdout.write(layout.lines.join('\n') + '\u001b[0m\n');
