/**
 * A made-up extension that knows Footer Dock only through the published messages (docs/extending-footer-dock.md):
 * it uses nothing but `pi.events`. Footer Dock's tests load it next to Footer Dock to prove that the
 * document is enough.
 */
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { registration } from './fake-registration.js';

export default function (pi: ExtensionAPI): void {
  const log = ((globalThis as Record<string, unknown>).__acme ??= {
    clicks: [],
    settings: [],
    rejected: [],
  }) as Record<string, unknown[]>;
  const announce = (): void => {
    pi.events.emit('footer-dock/register/v1', registration());
  };
  pi.events.on('footer-dock/ready/v1', announce);
  pi.events.on('footer-dock/click/v1', (data) => log.clicks?.push(data));
  pi.events.on('footer-dock/setting/v1', (data) => log.settings?.push(data));
  pi.events.on('footer-dock/rejected/v1', (data) => log.rejected?.push(data));
  pi.events.emit('footer-dock/hello/v1', { v: 1 });
}
