import type { ReactNode } from 'react'

import styles from '@polymorph/recipes/exceptions/bespoke.module.css'

/**
 * Rung 4 of the exception ladder (`docs/rules.md`): a declared escape zone.
 *
 * Anything the vocabulary forbids, such as a raw element, a hand-written
 * animation or a one-off illustration, is allowed inside a `<Bespoke>` and
 * forbidden outside one. The system does not try to cover every case. It makes
 * the uncovered cases visible.
 *
 * `reason` is required. The inventory prints it and reviewers read it, so the
 * inventory lists every place an escape was needed and why. A zone with a
 * reason is a recorded decision. A bare `eslint-disable` is an undeclared
 * deviation, and `pnpm inventory` fails on one.
 *
 * A Bespoke zone does **not** turn off:
 *
 *  - the theme. Tokens still cascade in, so bespoke work still re-themes.
 *  - accessibility. The a11y rules apply inside a zone exactly as outside it.
 */

export interface BespokeProps {
  /** Why the vocabulary was not enough, for a reviewer reading the inventory. */
  reason: string
  children?: ReactNode
}

export function Bespoke({ reason, children }: BespokeProps) {
  return (
    <div className={styles.bespoke} data-bespoke={reason}>
      {children}
    </div>
  )
}
