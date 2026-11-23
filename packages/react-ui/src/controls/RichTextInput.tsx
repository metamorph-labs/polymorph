import { memberAttr } from '@polymorph/react'

import styles from '@polymorph/recipes/controls/rich-text-input.module.css'

/**
 * DECIDE: one sentence saying what a RichTextInput is, in the product's words
 * (`design/components/rich-text-input.md`).
 *
 * DECIDE: and one saying what it is *not* — the neighbour a reader will confuse
 * it with, and the rule that separates them. The specs that read best in this
 * repository all do this (`timeline.md` against Stepper, `alert.md` against
 * Toast); a component whose boundary is written down is one nobody has to
 * re-argue.
 */

/*
 * DECIDE: `'use client'`, or nothing. This stub carries no directive, which is
 * a claim — that nothing here calls a hook, attaches a handler, reads the DOM,
 * or imports a client-only substrate (Radix, motion, react-aria). Put the
 * directive on the very first line, with a blank line under it, the moment that
 * stops being true.
 *
 * The law runs in **both directions** (`packages/rules/src/client-directive.test.ts`):
 * a module that needs the directive and has none breaks an RSC consumer's build,
 * and a module that carries one it does not need drags itself and everything
 * under it into the client bundle. Nothing else in the repository notices
 * either.
 */

export interface RichTextInputProps {
  /** DECIDE: the real surface. One documented prop per decision the caller makes. */
  label: string
}

export function RichTextInput({ label }: RichTextInputProps) {
  // The identity attribute: the exception seam's address. The root — and
  // any portaled surface this member grows — wears it; the identity law in
  // `laws.test.tsx` reds a member whose fixtures never show it.
  return (
    <div className={styles.root} {...memberAttr('RichTextInput')}>
      {label}
    </div>
  )
}
