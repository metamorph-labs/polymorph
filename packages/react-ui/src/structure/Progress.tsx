import { type IconSize, memberAttr } from '@polymorph/react'

import styles from '@polymorph/recipes/structure/progress.module.css'

/**
 * Bar showing how much of a task is done (`design/components/progress.md`).
 *
 * Determinate only. Unknown duration is `Spinner`, kept separate so each answers
 * one question. It renders no text: pair it with a `Stat` or a FormField-style
 * row, because "47%", "3 of 7 files" and "about a minute left" are all valid
 * captions, and the screen chooses. A measured value against a limit, which
 * goes down as well as up, is `Meter`.
 *
 * `shape="ring"` draws the same value as a ring at Spinner's sizes, for the
 * place a Spinner sits once the task knows how far it has got. A ring with no
 * value is Spinner, so `value` stays required.
 */

export type ProgressTone = 'accent' | 'danger'

export type ProgressShape = 'bar' | 'ring'

export interface ProgressProps {
  /** 0–100, clamped, because a bar cannot show more than full or less than empty. */
  value: number
  /** Required, because an unnamed progress bar tells a screen reader nothing. */
  label: string
  /** `danger` is for a task that failed or ran past its budget, not for "nearly done". */
  tone?: ProgressTone
  /** A bar as wide as its container, or a ring at an icon's size. */
  shape?: ProgressShape
  /** The ring's size, Spinner's sizes. A bar takes the width of its container and no size. */
  size?: IconSize
}

const clamp = (value: number) => Math.min(100, Math.max(0, value))

export function Progress({
  value,
  label,
  tone = 'accent',
  shape = 'bar',
  size = 'md',
}: ProgressProps) {
  const percent = clamp(value)
  const named = {
    'data-tone': tone,
    role: 'progressbar',
    'aria-label': label,
    'aria-valuenow': percent,
    'aria-valuemin': 0,
    'aria-valuemax': 100,
    ...memberAttr('Progress'),
  } as const

  if (shape === 'ring') {
    return (
      <div className={styles.ring} data-shape="ring" data-size={size} {...named}>
        {/*
         * Two circles on the box's own radius: the groove, then the arc. The
         * arc's length is 100, so its dash offset is the part not done. The
         * offset is data, as the bar's scale is.
         */}
        <svg className={styles.dial} aria-hidden="true" focusable="false">
          <circle className={styles.groove} cx="50%" cy="50%" r="50%" />
          <circle
            className={styles.arc}
            cx="50%"
            cy="50%"
            r="50%"
            pathLength={100}
            style={{ strokeDashoffset: `${100 - percent}` }}
          />
        </svg>
      </div>
    )
  }

  return (
    <div className={styles.track} {...named}>
      {/*
       * Scaled, not sized: the compositor-only law allows `transform`
       * (`docs/motion.md`), and a width transition updating every few hundred ms
       * would cause a layout pass each time.
       *
       * The vocabulary's only inline style, carrying data (`0.47`), not a design
       * decision. Spacing and colour use attribute selectors so the token law can
       * see them, but a continuous ratio from a prop has no attribute or token,
       * like Radix's measured widths.
       */}
      <div className={styles.fill} style={{ transform: `scaleX(${percent / 100})` }} />
    </div>
  )
}
