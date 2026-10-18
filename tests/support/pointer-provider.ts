import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

/** Independent toggling provider and opt-in diagnostic recorder for fullscreen CLI tests. */
export default function pointerProvider(pi: ExtensionAPI): void {
  let off: (() => void)[] = [];
  let visible = false;
  const id = 'independent-fixture.toggle-details';
  const advertise = () => {
    pi.events.emit('pi:ui-actions:register:v1', {
      version: 1,
      id,
      target: 'context',
      label: 'Toggle independent fixture details',
    });
  };
  pi.on('session_start', (_event, ctx) => {
    for (const unsubscribe of off) unsubscribe();
    if (ctx.mode !== 'tui') return;
    off = [
      pi.events.on('pi:ui-actions:discover:v1', advertise),
      pi.events.on('pi-footer-dock:interaction-trace:v1', (data) => {
        pi.appendEntry('fixture-pointer-trace', data);
      }),
      pi.events.on('pi:ui-actions:invoke:v1', (data) => {
        if (!data || typeof data !== 'object' || !('id' in data) || data.id !== id) return;
        visible = !visible;
        pi.appendEntry('fixture-pointer-invocation', { id, visible });
        ctx.ui.setWidget(
          'independent-details',
          visible ? ['Fixture details A', 'Fixture details B', 'Fixture details C'] : undefined,
        );
        advertise(); // Re-advertising unchanged metadata must not cancel/lose this action.
      }),
    ];
    advertise();
  });
  pi.registerCommand('fixture-withdraw', {
    description: 'Withdraw the independent test action',
    handler: () => {
      pi.events.emit('pi:ui-actions:unregister:v1', { version: 1, id });
      return Promise.resolve();
    },
  });
  pi.registerCommand('fixture-advertise', {
    description: 'Re-advertise the independent test action',
    handler: () => {
      advertise();
      return Promise.resolve();
    },
  });
  pi.on('session_shutdown', () => {
    for (const unsubscribe of off) unsubscribe();
    off = [];
  });
}
