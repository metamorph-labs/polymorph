import { dataFlag, Icon, type IconRole, memberAttr } from '@polymorph/react'
import styles from '@polymorph/recipes/structure/badge.module.css'

/**
 * Small read-only label for status or category (`design/components/badge.md`).
 *
 * An interactive chip is a different component. Every variant works with every
 * tone: a badge has no interactive states, so Button's "no neutral fill" rule
 * does not apply. Overline style: uppercase `text.xs`, emphasis from case and
 * tracking, not weight (`design/components/README.md`, "Type usage").
 *
 * Two more forms take the text's place. `count` draws a number, capped at
 * `max`, and draws nothing at zero, because "no unread items" is the absence of
 * the mark. `dot` draws a mark with no number, and keeps `children` as the
 * words a screen reader hears.
 */

export type BadgeVariant = 'soft' | 'solid' | 'outline'
export type BadgeTone = 'neutral' | 'accent' | 'danger' | 'warning' | 'success' | 'info'

export const BADGE_VARIANTS: readonly BadgeVariant[] = ['soft', 'solid', 'outline']
export const BADGE_TONES: readonly BadgeTone[] = [
  'neutral',
  'accent',
  'danger',
  'warning',
  'success',
  'info',
]

/** The largest count a Badge draws as it is, unless `max` says otherwise. */
const COUNT_MAX = 99

export interface BadgeProps {
  variant?: BadgeVariant
  tone?: BadgeTone
  /** Leading and decorative; the text carries the meaning. Not drawn by a count or a dot. */
  icon?: IconRole
  /**
   * Short text, about two words at most. A dot does not draw it and keeps it
   * for assistive technology. Required unless `count` is given.
   */
  children?: string
  /**
   * A number drawn in the text's place. Past `max` it reads as `max` and a
   * plus sign. Zero or less draws nothing.
   */
  count?: number
  /** The largest count drawn as it is; default 99. */
  max?: number
  /**
   * A mark with no number, for "something is new". `children` names it to a
   * screen reader; without `children` it is hidden from assistive technology.
   */
  dot?: boolean
}

export function Badge({
  variant = 'soft',
  tone = 'neutral',
  icon,
  children,
  count,
  max = COUNT_MAX,
  dot = false,
}: BadgeProps) {
  if (count !== undefined) {
    // `!(count > 0)` also refuses `NaN`, which would otherwise draw as text.
    if (!(count > 0)) return null
    return (
      <span
        className={styles.badge}
        data-variant={variant}
        data-tone={tone}
        {...dataFlag('count', true)}
        {...memberAttr('Badge')}
      >
        {count > max ? `${max}+` : String(count)}
      </span>
    )
  }

  if (dot) {
    const named = children !== undefined && children !== ''
    return (
      <span
        className={styles.badge}
        data-variant={variant}
        data-tone={tone}
        aria-hidden={named ? undefined : true}
        {...dataFlag('dot', true)}
        {...memberAttr('Badge')}
      >
        {named ? <span className={styles.spoken}>{children}</span> : null}
      </span>
    )
  }

  return (
    <span className={styles.badge} data-variant={variant} data-tone={tone} {...memberAttr('Badge')}>
      {icon === undefined ? null : (
        <span className={styles.glyph}>
          <Icon name={icon} size="sm" />
        </span>
      )}
      {children}
    </span>
  )
}
