import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

/** Independent protocol fixture: no consumer imports and no production provider dependency. */
export default function fixtureProvider(pi: ExtensionAPI): void {
  let subscriptions: (() => void)[] = [];
  const advertise = () => {
    pi.events.emit('pi:ui-actions:register:v1', {
      version: 1,
      id: 'fixture-vendor.context-inspect',
      target: 'context',
      label: 'Inspect fixture context',
    });
  };
  pi.on('session_start', (_event, ctx) => {
    if (ctx.mode !== 'tui') return;
    for (const off of subscriptions) off();
    subscriptions = [
      pi.events.on('pi:ui-actions:discover:v1', advertise),
      pi.events.on('pi:ui-actions:invoke:v1', (data) => {
        if (data !== null && typeof data === 'object' && 'id' in data) {
          if (data.id === 'fixture-vendor.context-inspect') {
            pi.appendEntry('fixture-context-invocation', { id: data.id });
          }
        }
      }),
    ];
    advertise();
  });
  pi.on('session_shutdown', () => {
    for (const off of subscriptions) off();
    subscriptions = [];
    pi.events.emit('pi:ui-actions:unregister:v1', {
      version: 1,
      id: 'fixture-vendor.context-inspect',
    });
  });
}
