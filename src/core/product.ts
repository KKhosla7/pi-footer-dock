/** The name the user sees on screens and in messages. One place, so a rename is one line. */
export const PRODUCT = 'Footer Dock';

/**
 * Names Footer Dock writes under, and the earlier names it still reads, so nothing a user saved
 * under a development name is lost. New data is always written under the current name.
 */
export const NAMES = {
  settingsFile: 'pi-footer-dock.json',
  legacySettingsFiles: ['pi-telltale.json', 'pi-glance.json'],
  configEntry: 'pi-footer-dock-config-v1',
  legacyConfigEntries: ['pi-telltale-config-v1', 'pi-glance-config-v1'],
  limitsEntry: 'pi-footer-dock-rate-limits-v1',
  legacyLimitsEntries: ['pi-telltale-rate-limits-v1', 'pi-glance-rate-limits-v1'],
  /** Folder under the user's cache folder; everything in it can be rebuilt. */
  cacheDir: 'pi-footer-dock',
  traceChannel: 'pi-footer-dock:interaction-trace:v1',
  pointerDebugEnv: 'PI_FOOTER_DOCK_POINTER_DEBUG',
} as const satisfies Record<string, string | readonly string[]>;
