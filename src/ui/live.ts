const TICK_MS = 1000;

export interface Refresh {
  everyMs: number;
  work: () => Promise<boolean>;
}

export function startLive(
  tui: { requestRender(): void },
  view: { drawn: boolean },
  refresh?: Refresh,
): () => void {
  let stopped = false;
  const stop = (): void => {
    stopped = true;
    clearInterval(timer);
  };
  const timer = setInterval(() => {
    if (!view.drawn) {
      stop();
      return;
    }
    view.drawn = false;
    tui.requestRender();
  }, TICK_MS);
  timer.unref();
  if (refresh) {
    loop(
      refresh,
      () => stopped,
      () => {
        tui.requestRender();
      },
    ).catch(() => undefined);
  }
  return stop;
}

async function loop(refresh: Refresh, stopped: () => boolean, render: () => void): Promise<void> {
  let wait = refresh.everyMs;
  while (!stopped()) {
    await new Promise<void>((resume) => {
      setTimeout(resume, wait).unref();
    });
    if (stopped()) return;
    const started = performance.now();
    const changed = await refresh.work().catch(() => false);
    if (stopped()) return;
    if (changed) render();
    wait = Math.max(refresh.everyMs, 3 * (performance.now() - started));
  }
}
