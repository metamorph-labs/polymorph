'use client'

import { useEffect, useRef, type MouseEvent } from 'react'

import {
  agentPress,
  type ControlSize,
  dataAttrs,
  dataFlag,
  Icon,
  type IconRole,
  type LawfulVariants,
  memberAttr,
  nameTip,
  useAgentMember,
} from '@polymorph/react'
import styles from '@polymorph/recipes/controls/button.module.css'

import { Badge } from '../structure/Badge'

/**
 * The action primitive (`design/components/button.md`).
 *
 * `tone="neutral"` is allowed for `outline` and `ghost` and is a **type error** for the filled
 * variants. The catalogue has no neutral interactive fill, because a grey filled button competes
 * with every surface role it sits on. The grid is a union type (`conventions/variants.ts`), so an
 * unlawful cell fails at the call site instead of rendering.
 */

/** The lawful cells, as a type. `lawfulCells(BUTTON_GRID)` is the same table as data. */
export interface ButtonGrid {
  solid: 'accent' | 'danger'
  soft: 'accent' | 'danger'
  outline: 'neutral' | 'accent' | 'danger'
  ghost: 'neutral' | 'accent' | 'danger'
}

export const BUTTON_GRID = {
  solid: ['accent', 'danger'],
  soft: ['accent', 'danger'],
  outline: ['neutral', 'accent', 'danger'],
  ghost: ['neutral', 'accent', 'danger'],
} as const satisfies { [V in keyof ButtonGrid]: readonly ButtonGrid[V][] }

export type ButtonAppearance = LawfulVariants<ButtonGrid>

/**
 * A count drawn on a Button's corner, such as the unread items behind a bell, with the
 * accessible name that says it. The words are the app's, so `label` comes from it.
 */
export interface ButtonCount {
  /** The number. Past 99 it draws as "99+". Zero or less draws nothing. */
  value: number
  /**
   * The button's accessible name while `value` is above zero, in the app's words:
   * "Notifications, 3 unread". It says the whole number, not the capped one.
   */
  label: string
}

export type ButtonProps = ButtonAppearance & {
  size?: ControlSize
  /** Leading icon. It is decorative, because the label names the action. */
  icon?: IconRole
  trailingIcon?: IconRole
  /** Square (width = control height). `label` is still required as the accessible name. */
  iconOnly?: boolean
  /** Required. Visible text, or the accessible name when `iconOnly`. */
  label: string
  loading?: boolean
  disabled?: boolean
  /**
   * Marks the button as the current location with `aria-current="page"`.
   *
   * It sets one attribute and changes no styling. Pagination uses it, because its current page is
   * a `soft/accent` Button that must also announce that it is current. Without this prop, a
   * component would have to render its own `<button>` and repeat this recipe to add one attribute.
   */
  current?: boolean
  /**
   * The id of a label elsewhere that names the button, as when `SettingsRow` labels a whole row.
   * `label` is still the visible text. This prop sets the accessible name.
   */
  'aria-labelledby'?: string
  /** Overrides the visible label as the accessible action name when context must be explicit. */
  'aria-label'?: string
  /** Associates supporting status or help copy with the action. */
  'aria-describedby'?: string
  /**
   * Makes the button a toggle. `aria-pressed` mirrors it and `data-state="on|off"` exposes it to
   * CSS. When it is omitted, the button is not a toggle and neither attribute renders. `loading`
   * takes precedence in `data-state`, so a busy toggle reports busy, while `aria-pressed` still
   * reports the toggle state.
   */
  pressed?: boolean
  /**
   * Makes the button a disclosure's trigger. `aria-expanded` mirrors it. When it is omitted, the
   * button discloses nothing and the attribute does not render. It changes no styling: the icon
   * the caller passes shows the state.
   */
  expanded?: boolean
  /**
   * The id of the region the button shows and hides. Set it only while the region is in the
   * document, because an id that names nothing is a broken reference.
   */
  'aria-controls'?: string
  /**
   * A count on the button's corner, with the name that says it. Above zero, the count
   * shows as a Badge and `count.label` is the accessible name. At zero, neither shows
   * and `label` names the button.
   */
  count?: ButtonCount
  type?: 'button' | 'submit'
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
}

export function Button({
  variant = 'solid',
  tone = 'accent',
  size = 'md',
  icon,
  trailingIcon,
  iconOnly = false,
  label,
  loading = false,
  disabled = false,
  current = false,
  pressed,
  expanded,
  type = 'button',
  'aria-labelledby': labelledBy,
  'aria-label': ariaLabel,
  'aria-describedby': describedBy,
  'aria-controls': controls,
  count,
  onClick,
}: ButtonProps) {
  // Loading takes precedence over the toggle in `data-state`, so a busy toggle reports busy.
  // `aria-pressed` below still reports the toggle state.
  const state = loading ? 'loading' : pressed === undefined ? undefined : pressed ? 'on' : 'off'
  // `value > 0` is false for `NaN` as well, which Badge would not draw either.
  const counted = count !== undefined && count.value > 0

  // An agent's press is the button's own click (`agentPress`), so a submit button submits its
  // form, and a disabled or loading one does nothing, as for a person. `pressed` and `expanded`
  // are `null` on a button without the prop, so a plain command is not read as off or collapsed.
  const ref = useRef<HTMLButtonElement>(null)
  useAgentMember({
    member: 'Button',
    element: () => ref.current,
    state: () => ({ disabled, loading, pressed: pressed ?? null, expanded: expanded ?? null }),
    actions: { press: () => agentPress(ref.current) },
    destructive: () => tone === 'danger',
  })

  // An icon-only button shows its label on hover and keyboard focus, in the Tooltip's bubble
  // (`nameTip`). A disabled one takes neither, so it shows nothing.
  useEffect(
    () => nameTip(ref.current, iconOnly && !disabled ? label : undefined, styles.tip),
    [iconOnly, disabled, label],
  )

  return (
    <button
      ref={ref}
      type={type}
      className={styles.button}
      disabled={disabled}
      aria-busy={loading ? true : undefined}
      aria-current={current ? 'page' : undefined}
      aria-label={ariaLabel ?? (counted ? count.label : iconOnly ? label : undefined)}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-controls={controls}
      // Loading is not disabled, so it keeps its colours, focus and name. The click is guarded here
      // as well as by `pointer-events`, because a keyboard Enter must not fire a command that is
      // already in flight.
      onClick={loading ? undefined : onClick}
      {...dataAttrs({ variant, tone, size, state, disabled })}
      {...dataFlag('icon-only', iconOnly)}
      {...memberAttr('Button')}
    >
      {loading ? (
        <span className={styles.spinner}>
          <Icon name="loading" size={size} />
        </span>
      ) : icon ? (
        <span className={styles.glyph}>
          <Icon name={icon} size={size} />
        </span>
      ) : null}

      {iconOnly ? null : <span className={styles.label}>{label}</span>}

      {trailingIcon !== undefined && !iconOnly ? (
        <span className={styles.glyph}>
          <Icon name={trailingIcon} size={size} />
        </span>
      ) : null}

      {/* Drawn for the eye. The name says the count in the app's words. */}
      {counted ? (
        <span className={styles.count} aria-hidden="true">
          <Badge variant="solid" tone="accent" count={count.value} />
        </span>
      ) : null}
    </button>
  )
}
