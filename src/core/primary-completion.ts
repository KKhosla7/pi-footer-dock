const completed = new Set(['stop', 'toolUse', 'length']);

export function isPrimaryCompletion(stopReason: string, deferred: unknown): boolean {
  return completed.has(stopReason) && deferred === undefined;
}
