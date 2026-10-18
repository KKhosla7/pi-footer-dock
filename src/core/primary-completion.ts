const completed = new Set(['stop', 'toolUse', 'length']);

/**
 * Whether a finished assistant message is a real, successful response (not an error, an abort or
 * a deferred placeholder). Only such a response may replace the last speed or cache sample.
 */
export function isPrimaryCompletion(stopReason: string, deferred: unknown): boolean {
  return completed.has(stopReason) && deferred === undefined;
}
