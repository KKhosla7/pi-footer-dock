export const STAT_SQUARES = 5;

/** How many of the five squares are green, red and neutral for a change of this size. */
export function statSquares(
  added: number,
  removed: number,
): { green: number; red: number; neutral: number } {
  const total = added + removed;
  if (total <= 0) return { green: 0, red: 0, neutral: STAT_SQUARES };
  const green = Math.floor((STAT_SQUARES * added) / total);
  const red = Math.floor((STAT_SQUARES * removed) / total);
  return { green, red, neutral: STAT_SQUARES - green - red };
}
