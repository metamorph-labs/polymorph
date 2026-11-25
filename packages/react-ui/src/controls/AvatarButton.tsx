'use client'

import { useEffect, useRef, type MouseEvent } from 'react'

import {
  agentPress,
  type ControlSize,
  dataAttrs,
  Icon,
  memberAttr,
  nameTip,
  useAgentMember,
} from '@polymorph/react'
import styles from '@polymorph/recipes/controls/avatar-button.module.css'
import { Avatar } from '../structure/Avatar'

/**
 * A Button preset whose face is an Avatar (`design/components/avatar-button.md`). It puts a
 * person's or a workspace's image, initials or glyph on a control that takes a press, and its
 * main use is the trigger of an account menu. It relates to Button as CopyButton and
 * ProviderButton do.
 *
 * AvatarButton is not an Avatar. An Avatar identifies and takes no press, and beside a visible
 * name it is hidden from assistive technology. This is a command, so `label` names what it does
 * ("Account menu") and the face stays decorative. It is not `Button iconOnly` either: an icon is
 * a meaning the theme draws in `currentColor`, and a face is a picture with fills of its own, so
 * it comes from `Avatar` and no icon role stands for it.
 *
 * The appearance is fixed at Button `ghost`/`neutral`, because a filled or bordered cell around
 * a face would be a second colour decision beside the identity tone. The styling is composed, as
 * in CopyButton and ProviderButton: this element sets Button's data attributes and `composes` its
 * recipe, because Button's props have no slot for a face.
 */

export interface AvatarButtonProps {
  /** Avatar's `name`: the initials, and the `user` glyph when it is empty. Never the accessible name. */
  name: string
  /** Avatar's `src`: the image. A URL that fails to load leaves the initials. */
  src?: string
  /**
   * The accessible name of the action, such as "Account menu". It is required and it is not the
   * person's name: a face says who, and a button says what a press does.
   */
  label: string
  /** The face's size, which is Avatar's. The box around it is never smaller than the size's control height. */
  size?: ControlSize
  disabled?: boolean
  /** The action has started and not finished. Keeps focus and name, hides the face behind the spinner, and ignores presses. */
  loading?: boolean
  /**
   * Makes the button a toggle, as Button's `pressed` does: `aria-pressed` mirrors it and
   * `data-state="on|off"` exposes it to CSS. Omitted, the button is not a toggle.
   */
  pressed?: boolean
  /** Marks the button as the current location with `aria-current="page"`, as Button's `current` does. */
  current?: boolean
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
}

export function AvatarButton({
  name,
  src,
  label,
  size = 'md',
  disabled = false,
  loading = false,
  pressed,
  current = false,
  onClick,
}: AvatarButtonProps) {
  // Button's rule: loading takes precedence over the toggle in `data-state`, and `aria-pressed`
  // still reports the toggle.
  const state = loading ? 'loading' : pressed === undefined ? undefined : pressed ? 'on' : 'off'

  // An agent's press is the button's own click (`agentPress`), as Button's is, so a disabled or
  // loading button does nothing, and as the trigger of a Menu it opens the menu.
  const ref = useRef<HTMLButtonElement>(null)
  useAgentMember({
    member: 'AvatarButton',
    element: () => ref.current,
    state: () => ({ disabled, loading }),
    actions: { press: () => agentPress(ref.current) },
  })

  // The face draws no text, so the label shows as a name tip on hover and keyboard focus, as on
  // an icon-only Button (`nameTip`). A disabled button takes neither, so it shows nothing.
  useEffect(() => nameTip(ref.current, disabled ? undefined : label, styles.tip), [disabled, label])

  return (
    <button
      ref={ref}
      type="button"
      className={styles.button}
      disabled={disabled}
      // The face shows no text, so the name is set here, as on an icon-only Button.
      aria-label={label}
      aria-busy={loading ? true : undefined}
      aria-current={current ? 'page' : undefined}
      aria-pressed={pressed}
      // The same guard as Button. Loading is not disabled, so this stops a keyboard Enter from
      // running a command that is already in flight.
      onClick={loading ? undefined : onClick}
      {...dataAttrs({ variant: 'ghost', tone: 'neutral', size, state, disabled })}
      {...memberAttr('AvatarButton')}
    >
      {/* Decorative: an Avatar without a `label` is `aria-hidden`. It stays mounted while
          loading, hidden by the recipe, so the box keeps the face's size under the spinner. */}
      <span className={styles.face}>
        <Avatar name={name} src={src} size={size} />
      </span>

      {loading ? (
        <span className={styles.spinner}>
          <Icon name="loading" size={size} />
        </span>
      ) : null}
    </button>
  )
}
