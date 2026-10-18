const TICK_MS = 1000;

/** Work a screen repeats while it is open: it says whether anything changed, and the screen repaints. */
export interface Refresh {
  /** The least time between two runs; a slow run stretches it to three times its own duration. */
  everyMs: number;
  work: () => Promise<boolean>;
}

/**
 * Keeps an open screen alive: repaints once a second (which is also how it tells the screen is
 * still drawn), and runs its refresh work now and then. Everything stops by itself when the screen is no longer drawn (nothing set `drawn`
 * since the last tick), and when the returned function is called. Nothing runs while no screen is open.
 */
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
