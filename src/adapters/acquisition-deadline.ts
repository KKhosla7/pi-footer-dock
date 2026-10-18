export const MAX_ACQUISITION_MS = 30_000;

export class AcquisitionDeadlineError extends Error {
  constructor() {
    super('quota acquisition deadline exceeded');
  }
}
export class AcquisitionCancelledError extends Error {
  constructor() {
    super('quota acquisition cancelled');
  }
}

function assertBeforeDeadline(
  started: number,
  milliseconds: number,
  now: () => number,
  controller: AbortController,
): void {
  if (now() - started < milliseconds) return;
  const error = new AcquisitionDeadlineError();
  controller.abort(error);
  throw error;
}

/** Bound the await, abort cooperative work, and observe late rejections safely. */
export async function withAcquisitionDeadline<T>(
  run: (signal: AbortSignal) => Promise<T>,
  milliseconds: number,
  caller?: AbortSignal,
  now: () => number = () => performance.now(),
): Promise<T> {
  if (!Number.isInteger(milliseconds) || milliseconds < 1 || milliseconds > MAX_ACQUISITION_MS)
    throw new Error('Invalid acquisition deadline');
  if (caller?.aborted) throw new AcquisitionCancelledError();
  const started = now();
  const controller = new AbortController();
  const cancel = () => {
    controller.abort(new AcquisitionCancelledError());
  };
  let rejectAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = () => {
      const reason: unknown = controller.signal.reason;
      reject(reason instanceof Error ? reason : new AcquisitionCancelledError());
    };
    controller.signal.addEventListener('abort', rejectAbort, { once: true });
  });
  caller?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => {
    controller.abort(new AcquisitionDeadlineError());
  }, milliseconds);
  try {
    const work = Promise.resolve().then(() => {
      controller.signal.throwIfAborted();
      assertBeforeDeadline(started, milliseconds, now, controller);
      return run(controller.signal);
    });
    const result = await Promise.race([work, aborted]);
    if (caller?.aborted) throw new AcquisitionCancelledError();
    // A paused event loop can resume a promise before its overdue timer runs.
    assertBeforeDeadline(started, milliseconds, now, controller);
    return result;
  } finally {
    clearTimeout(timer);
    caller?.removeEventListener('abort', cancel);
    if (rejectAbort) controller.signal.removeEventListener('abort', rejectAbort);
  }
}
