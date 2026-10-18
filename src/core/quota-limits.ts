/** Shared acquisition policy; UI reload and manual refresh never relax these bounds. */
export const QUOTA_INTERVAL_MS = 60_000;
export const QUOTA_MAX_AGE_MS = 300_000;
export const QUOTA_MAX_WINDOWS = 8;
export const QUOTA_MAX_BODY_BYTES = 65_536;
export const QUOTA_ACQUISITION_MS = 10_000;
/** The worker's fetch deadline. Nothing waits on it in the UI, so a slow server may take this long. */
export const QUOTA_FETCH_BUDGET_MS = 20_000;
/** Client watchdog: the fetch deadline plus slack for the worker to record the result and reply. */
export const QUOTA_SYNC_BUDGET_MS = 25_000;
/** Whole refresh budget: credential resolution, worker attach and sync. */
export const QUOTA_TOTAL_BUDGET_MS = 30_000;
/** Provider quota sources: politeness floor, backoff ceiling, fetch bound and activity window. */
export const PROVIDER_QUOTA_INTERVAL_MS = 30_000;
export const PROVIDER_QUOTA_MAX_BACKOFF_MS = 900_000;
export const PROVIDER_QUOTA_FETCH_MS = 20_000;
export const PROVIDER_QUOTA_FLIGHT_MS = 45_000;
export const PROVIDER_QUOTA_ACTIVE_MS = 600_000;
