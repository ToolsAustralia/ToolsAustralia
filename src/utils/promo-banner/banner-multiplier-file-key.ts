/** Map effective multiplier to a filename tier; odd/null → 10 so a single 10x asset always resolves. */
export function bannerMultiplierFileKey(multiplier: number | null): 2 | 3 | 5 | 10 {
  if (multiplier === 2 || multiplier === 3 || multiplier === 5 || multiplier === 10) {
    return multiplier;
  }
  return 10;
}
