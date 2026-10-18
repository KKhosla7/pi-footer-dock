import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

export default function configProvider(pi: ExtensionAPI): void {
  let off: (() => void)[] = [];
  const actions = [
    {
      version: 1,
      id: 'independent.vendor.details',
      target: 'vendor-details',
      label: 'Vendor details',
    },
    { version: 1, id: 'independent.vendor.context', target: 'context', label: 'Context details' },
  ];
  const advertise = () => {
    for (const action of actions) pi.events.emit('pi:ui-actions:register:v1', action);
  };
  pi.on('session_start', () => {
    for (const unsubscribe of off) unsubscribe();
    off = [
      pi.events.on('pi:ui-actions:discover:v1', advertise),
      pi.events.on('pi:ui-actions:invoke:v1', (data) => {
        if (!data || typeof data !== 'object' || !('id' in data)) return;
        const action = actions.find((item) => item.id === data.id);
        if (action)
          pi.appendEntry('fixture-dynamic-invocation', { id: action.id, target: action.target });
      }),
    ];
    advertise();
  });
  pi.on('session_shutdown', () => {
    for (const unsubscribe of off) unsubscribe();
    off = [];
  });
}
