/**
 * What became of one window a provider sent, for `/dock-debug`. It carries names from a closed set
 * and yes/no answers, never a value, text or key from the provider's reply.
 */
export type WindowType = '5h' | 'week' | 'month' | 'primary' | 'secondary' | 'unrecognized';
export interface WindowReport {
  type: WindowType;
  /** The provider's reply held this window at all. */
  sent: boolean;
  /** Its used share was a number from 0 to 100; absent when the type is not recognized. */
  share?: boolean;
  /** Its reset time was a valid time; absent when the type is not recognized. */
  reset?: boolean;
  /** Its length was a positive number (only providers that send one). */
  span?: boolean;
  /** The window is shown: everything it needs was valid. */
  kept: boolean;
}
/** Receives one report per window a provider's reply holds or should hold. */
export type ObserveWindow = (report: WindowReport) => void;
