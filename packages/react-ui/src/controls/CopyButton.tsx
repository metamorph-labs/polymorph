'use client'

import { useEffect, useRef, useState } from 'react'

import { dataAttrs, dataFlag, Icon, memberAttr, nameTip } from '@polymorph/react'
import styles from '@polymorph/recipes/controls/copy-button.module.css'

/**
 * A Button preset for copying a value to the clipboard (`design/components/copy-button.md`). It
 * fixes the glyph, the gesture and the confirmation, so screens do not re-decide them. It relates
 * to Button as SearchInput relates to Input.
 *
 * CopyButton does *not* act on the product's data. Only the clipboard changes. Copying an entity
 * inside the app uses the `duplicate` role on an ordinary Button, so if the click changes state,
 * it is not a CopyButton. There is no `onCopy`, because the clipboard is the whole outcome, and a
 * callback would invite using the button for other click actions.
 *
 * The anatomy is Button `ghost`/`neutral`/`iconOnly` **by reference**, following Link's
 * precedent. The recipe cells come through `composes`, and this element sets Button's data
 * attributes itself, because it must also carry `data-state="copied"`, a state the Button
 * component has no reason to offer.
 */

/**
 * How long the confirmation shows before it reverts. CodeBlock's copy button uses the same
 * duration, so both members give the same feedback. It is a plain number on purpose: two
 * consumers share it by reference, and a third would make it a motion token (the rule of three).
 * It is a timer, not a motion, so it does not scale with temperament.
 */
const COPY_FEEDBACK_MS = 2000

declare const process: { env: { NODE_ENV?: string } }

export interface CopyButtonProps {
  /** Written to the clipboard exactly as given, including whitespace. */
  value: string
  /** The accessible name ("Copy install command"). No default, because naming is a decision (Button's law). */
  label: string
  /**
   * The confirmation announced to assistive technology ("Copied"). It is required, because a
   * screen reader user cannot perceive the icon change, so an announcement must exist. The
   * vocabulary writes no prose, so the app supplies both of this member's strings.
   */
  copiedLabel: string
  /** Button's sizes without `lg`. A copy button is secondary, and at `lg` it would look like a main action. */
  size?: 'sm' | 'md'
  disabled?: boolean
}

export function CopyButton({
  value,
  label,
  copiedLabel,
  size = 'md',
  disabled = false,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const revert = useRef<number>(undefined)
  const control = useRef<HTMLButtonElement>(null)

  // The timer must not outlive the component, because a timer firing into an unmounted tree is a
  // race that causes a React warning (CodeBlock's rule).
  useEffect(() => () => window.clearTimeout(revert.current), [])

  // The glyph is the only thing drawn, so the label shows as a name tip on hover and keyboard
  // focus, as on an icon-only Button (`nameTip`). Not while the confirmation shows: the press
  // closed the tip, and a tip that named the copy beside the confirming glyph would say two
  // things at once. It is back when the confirmation reverts.
  useEffect(
    () => nameTip(control.current, disabled || copied ? undefined : label, styles.tip),
    [disabled, copied, label],
  )

  function handleCopy() {
    void navigator.clipboard.writeText(value).then(
      () => {
        // A click during the confirmation copies again and restarts the timer.
        setCopied(true)
        window.clearTimeout(revert.current)
        revert.current = window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS)
      },
      (refusal: unknown) => {
        // A refused write (permissions, insecure context) changes no glyph and announces nothing,
        // because a false confirmation is worse than none. The rejection is logged for developers
        // instead.
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`polymorph: CopyButton could not write to the clipboard: ${String(refusal)}`)
        }
      },
    )
  }

  return (
    <>
      <button
        ref={control}
        type="button"
        className={styles.button}
        disabled={disabled}
        // The accessible name never changes. A control whose name changes to "Copied" is announced
        // as a different button mid-task. The confirmation goes through the status region below.
        aria-label={label}
        onClick={handleCopy}
        {...dataAttrs({ variant: 'ghost', tone: 'neutral', size, disabled })}
        {...dataFlag('icon-only', true)}
        // Not `aria-pressed`, because copying is an action, not a toggle, and a pressed state would
        // claim the button is still "on". `copied` is this member's own state value, set directly.
        // CodeBlock sets the same state the same way.
        data-state={copied ? 'copied' : undefined}
        {...memberAttr('CopyButton')}
      >
        {/* Both glyphs stay mounted in one grid cell so the confirmation can fade out, because
            an unmounting node cannot animate its exit (the `input.clear` binding's reasoning).
            Both are decorative. `label` names the button, and the state change is announced
            through the status region, never through the glyph. */}
        <span className={styles.glyphs} aria-hidden="true">
          <span className={styles.copyGlyph}>
            <Icon name="copy" size={size} />
          </span>
          <span className={styles.confirmGlyph}>
            <Icon name="confirm" size={size} />
          </span>
        </span>
      </button>

      {/* Spinner's rule: one polite announcement, never two competing sources. Rendered empty
          from the start so the region exists before its first announcement. */}
      <span role="status" className={styles.status}>
        {copied ? copiedLabel : null}
      </span>
    </>
  )
}
