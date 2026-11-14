export type WindowType = '5h' | 'week' | 'month' | 'primary' | 'secondary' | 'unrecognized';
export interface WindowReport {
  type: WindowType;
  sent: boolean;
  share?: boolean;
  reset?: boolean;
  span?: boolean;
  kept: boolean;
}
export type ObserveWindow = (report: WindowReport) => void;
