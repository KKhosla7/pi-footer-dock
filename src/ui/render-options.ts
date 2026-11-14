import type { ExtensionRegistry } from '../core/ext/registry.js';
import type { Glyphs } from './glyphs.js';
import type { Paint } from './palette.js';

export interface RenderOptions {
  paint: Paint;
  glyphs: Glyphs;
  now?: number;
  quotaFrame?: number;
  problems?: { count: number; bright: boolean };
  quotaExpanded?: boolean;
  extensions?: ExtensionRegistry;
}
