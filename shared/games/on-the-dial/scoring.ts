export const MAX_BARS = 5;

/** How far off (out of 100) a needle can be and still pick up 5, 4, 3, 2 or 1 bars. */
export const BAR_RANGES = [2, 5, 9, 14, 20];

/** Signal strength for a needle: 5 bars on top of the signal, fading to 0 as it drifts away. */
export function signalBars(needle: number, target: number): number {
  const off = Math.abs(needle - target);
  const i = BAR_RANGES.findIndex((range) => off <= range);
  return i === -1 ? 0 : MAX_BARS - i;
}
