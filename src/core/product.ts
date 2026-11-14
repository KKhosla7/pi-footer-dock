export const PRODUCT = 'Footer Dock';

export const NAMES = {
  settingsFile: 'pi-footer-dock.json',
  legacySettingsFiles: ['pi-telltale.json', 'pi-glance.json'],
  configEntry: 'pi-footer-dock-config-v1',
  legacyConfigEntries: ['pi-telltale-config-v1', 'pi-glance-config-v1'],
  limitsEntry: 'pi-footer-dock-rate-limits-v1',
  legacyLimitsEntries: ['pi-telltale-rate-limits-v1', 'pi-glance-rate-limits-v1'],
  cacheDir: 'pi-footer-dock',
  traceChannel: 'pi-footer-dock:interaction-trace:v1',
  pointerDebugEnv: 'PI_FOOTER_DOCK_POINTER_DEBUG',
} as const satisfies Record<string, string | readonly string[]>;
