/** The reserve that makes Pi compact at this percent of the window: the part left over above it. */
export const reserveFor = (capacity: number, percent: number): number =>
  Math.round((capacity * (100 - percent)) / 100);
