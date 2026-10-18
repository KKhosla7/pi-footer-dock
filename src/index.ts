import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { runOpenWith } from './open-with-command.js';
import { DockRuntime } from './runtime.js';
import { say } from './notify.js';

export default function footerDock(pi: ExtensionAPI): void {
  const runtime = new DockRuntime(pi);
  pi.on('session_start', (_event, ctx) => {
    runtime.start(ctx);
  });
  pi.on('session_shutdown', () => {
    runtime.stop();
  });
  registerResponseEvents(pi, runtime);
  pi.on('before_provider_request', (_event, ctx) => {
    runtime.quotaFeed()?.begin(ctx);
  });
  pi.on('after_provider_response', (event, ctx) => {
    runtime.quotaFeed()?.ingestHeaders(event.headers, ctx);
  });
  pi.on('provider_stream_event', (event) => {
    runtime.quotaFeed()?.ingest(event);
  });
  pi.on('turn_end', (_event, ctx) => {
    runtime.refresh(ctx);
  });
  pi.on('session_compact', (_event, ctx) => {
    runtime.refreshHistory(ctx, true);
  });
  pi.on('session_tree', (_event, ctx) => {
    runtime.refreshHistory(ctx, true);
  });
  pi.on('model_select', (_event, ctx) => {
    runtime.modelChanged(ctx);
  });
  pi.on('thinking_level_select', (_event, ctx) => {
    // The last response still happened; only a model change makes its figures about another model.
    runtime.refresh(ctx);
  });
  pi.on('tool_execution_end', () => {
    runtime.refreshGit();
  });
  pi.on('agent_end', (_event, ctx) => {
    runtime.refresh(ctx);
    runtime.refreshGit();
  });
  pi.on('agent_settled', (_event, ctx) => {
    runtime.refreshHistory(ctx);
    runtime.refreshQuotas(ctx);
  });
  registerCommands(pi, runtime);
}

function registerResponseEvents(pi: ExtensionAPI, runtime: DockRuntime): void {
  pi.on('turn_start', (_event, ctx) => {
    runtime.telemetry.start();
    runtime.refresh(ctx);
  });
  pi.on('message_start', (event, ctx) => {
    if (event.message.role === 'assistant') runtime.refresh(ctx);
  });
  pi.on('message_update', (event) => {
    runtime.telemetry.update(event.assistantMessageEvent);
  });
  pi.on('message_end', (event, ctx) => {
    if (event.message.role === 'assistant') runtime.telemetry.complete(event.message);
    runtime.refreshAfterPersistence(ctx);
  });
}

function registerInteractionCommands(pi: ExtensionAPI, runtime: DockRuntime): void {
  pi.registerCommand('dock-config', {
    description: 'Show, reset or apply session-local footer JSON configuration',
    handler: (args, ctx) => {
      runtime.interactions.configure(args, ctx);
      return Promise.resolve();
    },
  });
  pi.registerCommand('dock-info', {
    description: 'Explain a footer slot (or choose one by keyboard)',
    handler: (args, ctx) => runtime.interactions.info(args, ctx),
  });
  pi.registerCommand('dock-action', {
    description: 'Invoke an advertised action for a configured semantic target',
    handler: (args, ctx) => runtime.interactions.invokeTarget(args.trim(), ctx),
  });
  pi.registerCommand('dock-settings', {
    description: 'Open the footer settings: what to show or hide, limit wording, icons',
    handler: (_args, ctx) => runtime.openSettings(ctx),
  });
  pi.registerCommand('dock-open', {
    description: 'Open the project folder in your file manager (keyboard form of the click)',
    handler: (_args, ctx) => runtime.interactions.openFolder(ctx),
  });
  pi.registerCommand('dock-open-with', {
    description: 'Choose the app that opens the project folder, e.g. thunar {path}; default resets',
    handler: (args, ctx) => {
      runOpenWith(args, ctx, runtime.settings);
      return Promise.resolve();
    },
  });
  pi.registerCommand('dock-quota', {
    description: 'Expand or collapse the quota windows (keyboard form of the › click)',
    handler: () => {
      runtime.interactions.toggleQuota();
      return Promise.resolve();
    },
  });
  pi.registerCommand('dock-pointer-debug', {
    description: 'Opt-in pointer/action metadata trace: on, off, clear, or show',
    handler: (args, ctx) => {
      const mode = args.trim();
      if (mode === 'on') runtime.pointerTrace.enabled = true;
      if (mode === 'off') runtime.pointerTrace.enabled = false;
      if (mode === 'clear') runtime.pointerTrace.clear();
      say(
        ctx,
        JSON.stringify({
          enabled: runtime.pointerTrace.enabled,
          records: mode === 'show' ? runtime.pointerTrace.snapshot() : undefined,
        }),
        'info',
      );
      return Promise.resolve();
    },
  });
}

function registerCommands(pi: ExtensionAPI, runtime: DockRuntime): void {
  registerInteractionCommands(pi, runtime);
  pi.registerCommand('dock-context', {
    description: 'Invoke an optional registered context UI action',
    handler: (_args, ctx) => runtime.contextAction(ctx),
  });
  pi.registerCommand('dock-debug', {
    description:
      'Show loaded source, bound session and live/cached usage (no conversation content)',
    handler: (_args, ctx) => {
      say(ctx, runtime.diagnostics(ctx), 'info');
      return Promise.resolve();
    },
  });
  pi.registerCommand('dock-glyphs', {
    description: 'Toggle Nerd Font / portable glyphs',
    handler: (_args, ctx) => {
      runtime.toggleGlyphs(ctx);
      return Promise.resolve();
    },
  });
  pi.registerCommand('dock-refresh', {
    description: 'Refresh live context and Git information',
    handler: (_args, ctx) => {
      runtime.refreshHistory(ctx);
      runtime.refreshGit();
      runtime.refreshQuotas(ctx);
      return Promise.resolve();
    },
  });
}
