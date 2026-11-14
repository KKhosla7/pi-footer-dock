export const reserveFor = (capacity: number, percent: number): number =>
  Math.round((capacity * (100 - percent)) / 100);
