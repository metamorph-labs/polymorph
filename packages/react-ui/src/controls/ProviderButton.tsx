'use client'

import { useRef, type MouseEvent } from 'react'

import {
  agentPress,
  BrandMark,
  type BrandName,
  type ControlSize,
  dataAttrs,
  Icon,
  memberAttr,
  useAgentMember,
} from '@polymorph/react'
import styles from '@polymorph/recipes/controls/provider-button.module.css'

/**
 * A Button preset for signing in with an identity provider
 * (`design/components/provider-button.md`). It shows the provider's mark and the app's
 * label, and its appearance is fixed. It relates to Button as CopyButton does.
 *
 * ProviderButton is not a Button with an `icon`. An icon is a symbol the theme draws in
 * `currentColor`. A provider's mark belongs to the provider, with geometry and colours
 * fixed by their brand terms. So it comes through a separate component (`BrandMark`) and
 * cannot be recoloured, resized off the scale, or replaced with the app's own drawing. It
 * is not a Link either: the press starts a sign-in flow that the app's controller owns,
 * and does not name a destination.
 *
 * The appearance is fixed at Button `outline`/`neutral`. A multi-colour mark is only
 * legible, and only allowed by the providers' terms, on a neutral surface. So
 * `solid`/`accent` is not offered at all. The styling is composed, as in Link and
 * CopyButton: this element sets Button's data attributes and `composes` its recipe,
 * because Button's props deliberately have no slot for a mark.
 */

export type ProviderButtonProvider = BrandName

export interface ProviderButtonProps {
  /** Which mark is drawn, from `BrandMark`'s fixed set. */
  provider: ProviderButtonProvider
  /**
   * The full label in the app's language, such as "Continue with Google". It is required
   * and passed whole, because the vocabulary has no built-in text, word order around a
   * brand name differs by language, and the provider's terms govern the wording.
   */
  label: string
  size?: ControlSize
  /**
   * The sign-in flow has started and not finished. Keeps focus, colours and name, and
   * ignores presses.
   */
  loading?: boolean
  disabled?: boolean
  type?: 'button' | 'submit'
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
  /** Links supporting text, such as "Your organization requires single sign-on", to the button. */
  'aria-describedby'?: string
}

export function ProviderButton({
  provider,
  label,
  size = 'md',
  loading = false,
  disabled = false,
  type = 'button',
  onClick,
  'aria-describedby': describedBy,
}: ProviderButtonProps) {
  // An agent's press is the button's own click (`agentPress`), as Button's is, so a disabled or
  // loading button does nothing. The press starts the sign-in, and the person completes it with
  // the provider.
  const ref = useRef<HTMLButtonElement>(null)
  useAgentMember({
    member: 'ProviderButton',
    element: () => ref.current,
    state: () => ({ disabled, loading }),
    actions: { press: () => agentPress(ref.current) },
  })

  return (
    <button
      ref={ref}
      type={type}
      className={styles.button}
      disabled={disabled}
      aria-busy={loading ? true : undefined}
      aria-describedby={describedBy}
      // The same guard as Button. Loading is not disabled, so this stops a keyboard
      // Enter from starting a sign-in that is already in progress.
      onClick={loading ? undefined : onClick}
      {...dataAttrs({
        variant: 'outline',
        tone: 'neutral',
        size,
        state: loading ? 'loading' : undefined,
        disabled,
      })}
      data-provider={provider}
      {...memberAttr('ProviderButton')}
    >
      {loading ? (
        <span className={styles.spinner}>
          <Icon name="loading" size={size} />
        </span>
      ) : (
        // Decorative. The label already names the provider, and a named mark would be
        // read as "Google, Continue with Google".
        <span className={styles.mark}>
          <BrandMark name={provider} size={size} />
        </span>
      )}

      <span className={styles.label}>{label}</span>
    </button>
  )
}
