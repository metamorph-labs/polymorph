/**
 * The conformance ledger: every statement a shell deliberately does not meet,
 * and why (`docs/conformance.md`).
 *
 * An entry is a decision, not a skipped test. It belongs here only when the
 * substrate (React Aria, Radix) behaves differently from the spec for a reason
 * that can be stated and the spec should keep its claim. When the shell is
 * right and the spec is wrong, the spec changes instead. The law runs every
 * entry and fails on one that passes, because a divergence that has closed is
 * a stale exemption, and on one that fails for any reason but the declared
 * one, because an entry excuses one divergence, not every way the statement
 * could break.
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

export const CONFORMANCE_LEDGER: readonly ConformanceDivergence[] = [
  {
    member: 'Toast',
    statement: 'announces live:polite when the viewport',
    reason:
      'Radix announces each toast from a visually hidden `role="status"` node it portals to the ' +
      'end of the body and removes a second later. The polite announcement is real, but it is ' +
      'never inside the viewport or the card, where the runner looks, and the spec keeps the ' +
      'claim because the reader hears it.',
    fails: 'nothing in the member matches',
  },
]
