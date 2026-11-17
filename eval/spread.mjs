/**
 * How far a rate measured on a few runs can be trusted
 * (`docs/verification.md`, "The agent eval").
 *
 * A run either is lawful or is not, so a rate is a count of successes out of a
 * number of runs, and a small number of runs fixes it only loosely: 6 lawful
 * runs out of 8 is what a model that is lawful 60% of the time produces
 * often, and so does one that is lawful 90% of the time. `eval/run.mjs`
 * records the interval beside every rate, and `eval/report.mjs` prints it and
 * says which differences the sample cannot establish.
 *
 * The runs of one brief are treated as independent trials of one rate. An
 * overall rate pools briefs whose rates differ. With the same number of runs
 * for each brief, that makes its interval no narrower than these briefs need.
 * No interval says anything about a screen that is not among the briefs.
 */

/** The normal deviate of a two-sided 95% interval. */
const Z = 1.959964

/**
 * The 95% Wilson score interval of `successes` out of `total`, or `null` for
 * no runs. Wilson's interval is used, and not the textbook one built on the
 * measured rate's own standard error, because that one collapses to a single
 * point at 0% and 100%, which is where a small sample most often lands.
 */
export function interval(successes, total) {
  if (total === 0) return null
  const rate = successes / total
  const scale = 1 + Z ** 2 / total
  const centre = (rate + Z ** 2 / (2 * total)) / scale
  const half = (Z * Math.sqrt((rate * (1 - rate)) / total + Z ** 2 / (4 * total ** 2))) / scale
  return {
    low: successes === 0 ? 0 : Math.max(0, centre - half),
    high: successes === total ? 1 : Math.min(1, centre + half),
  }
}

/**
 * Whether two measured rates can be told apart: the 95% interval of their
 * difference leaves out zero. The interval is Newcombe's, built from the two
 * Wilson intervals. Two rates whose Wilson intervals do not overlap are
 * always apart, and two whose intervals overlap a little can be as well.
 * Each argument is `{ successes, total }`.
 */
export function apart(one, other) {
  if (one.total === 0 || other.total === 0) return false
  const [a, b] = [one.successes / one.total, other.successes / other.total]
  const [first, second] = [
    interval(one.successes, one.total),
    interval(other.successes, other.total),
  ]
  const low = a - b - Math.hypot(a - first.low, second.high - b)
  const high = a - b + Math.hypot(first.high - a, b - second.low)
  return low > 0 || high < 0
}

/**
 * What another sample of the same size would have to measure to be told apart
 * from this one: `below`, the highest count that is apart on the low side, and
 * `above`, the lowest on the high side. Either is `null` when no count on that
 * side is apart. Both are for a single run. Two runs tell only 0% from 100%.
 */
export function resolution(successes, total) {
  const counts = Array.from({ length: total + 1 }, (_, count) => count)
  const told = (count) => apart({ successes, total }, { successes: count, total })
  return {
    below: counts.findLast((count) => count < successes && told(count)) ?? null,
    above: counts.find((count) => count > successes && told(count)) ?? null,
  }
}

/**
 * The fewest runs by which two counts out of `total` must differ before any
 * two of them can be told apart, or `null` when none can. It is the best
 * case, reached at the ends of the scale: counts near the middle need more.
 */
export function smallestGap(total) {
  for (let gap = 1; gap <= total; gap += 1) {
    for (let low = 0; low + gap <= total; low += 1) {
      if (apart({ successes: low, total }, { successes: low + gap, total })) return gap
    }
  }
  return null
}
