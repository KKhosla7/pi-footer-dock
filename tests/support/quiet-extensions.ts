import { ExtensionBus } from '../../src/adapters/ext-bus.js';

/** An extension bus with nothing registered and nobody listening, for tests of the footer alone. */
export function quietExtensions(): ExtensionBus {
  const events = { on: () => () => undefined, emit: () => undefined };
  return new ExtensionBus({ events }, () => undefined);
}
