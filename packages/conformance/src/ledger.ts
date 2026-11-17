/**
 * One entry of a shell's conformance ledger: a statement the shell deliberately
 * does not meet, and why (`docs/conformance.md`).
 *
 * An entry is a decision, not a skipped test. It belongs in a ledger only when
 * the substrate behaves differently from the spec for a reason that can be
 * stated and the spec should keep its claim. The law runs every entry and
 * fails on one that passes, because a divergence that has closed is a stale
 * exemption, and on one that fails for any reason but the declared one.
 */
export interface ConformanceDivergence {
  /** The member, as the gallery names it. */
  member: string
  /** The statement, exactly as the spec's contract fence writes it. */
  statement: string
  /** Why the shell keeps the divergence. */
  reason: string
  /** Words of the runner's reason for the failure, which the law requires to appear in it. */
  fails: string
}

/**
 * The divergences every shell built on Zag's machines shares, which each such
 * shell's ledger holds.
 */
export const ZAG_LEDGER: readonly ConformanceDivergence[] = [
  {
    member: 'Tooltip',
    statement: 'dismiss both when long content',
    reason:
      'Zag closes a tooltip when the pointer leaves its trigger, when focus leaves it, on Escape ' +
      'and on scroll, and keeps no outside-press listener. A tooltip a reader opens is held by ' +
      'the pointer over its trigger or by focus on it, and the runner’s press outside moves both, ' +
      'as a reader’s does. This entry opens its tooltip with `defaultOpen`, which holds neither, ' +
      'so a press outside leaves it open, where Radix closes it on any press outside. The Escape ' +
      'half holds, and the spec keeps the claim.',
    fails: 'a press outside does not close it',
  },
]
