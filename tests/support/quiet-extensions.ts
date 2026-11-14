import { ExtensionBus } from '../../src/adapters/ext-bus.js';

export function quietExtensions(): ExtensionBus {
  const events = { on: () => () => undefined, emit: () => undefined };
  return new ExtensionBus({ events }, () => undefined);
}
