import type { ExtensionRegistry } from '../core/ext/registry.js';
import type { Glyphs } from './glyphs.js';
import type { Paint } from './palette.js';

/** What every footer item needs to draw itself; shared so items need not import each other. */
export interface RenderOptions {
  paint: Paint;
  glyphs: Glyphs;
  now?: number;
  quotaFrame?: number;
  /** Whether the quota shows every window where it would otherwise collapse. */
  quotaExpanded?: boolean;
  /** Items other extensions registered; empty or absent changes nothing. */
  extensions?: ExtensionRegistry;
}
