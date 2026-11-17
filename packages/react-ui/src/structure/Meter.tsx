import { Icon, memberAttr } from '@polymorph/react'

import styles from '@polymorph/recipes/structure/meter.module.css'

/**
 * A measured value in a known range (`design/components/meter.md`).
 *
 * Storage used of a quota, money spent of a budget, seats taken of a plan.
 *
 * It is not Progress. Progress is a task moving towards done, and only moves
 * forward. A meter's value goes up and down, and its colour says where the
 * value stands against the thresholds the app passes. The member picks the tone
 * from them, so a screen states the rule once, in numbers.
 *
 * It renders no label. The name is `label`, for assistive technology, as
 * Progress's is. The words a reader sees and hears are the app's `valueText`
 * ("42 GB of 50 GB"), because the unit and the formatting are data logic.
 */

/** The tone the value's band gives the fill: below every threshold, past `warning`, past `danger`. */
type MeterTone = 'accent' | 'warning' | 'danger'

/** The words for the status glyph, which is never only a colour. */
export interface MeterMessages {
  /** The glyph's name past `warning`: "High". */
  warning: string
  /** The glyph's name past `danger`: "Critical". */
  danger: string
}

export interface MeterProps {
  /** Required, because an unnamed meter tells a screen reader nothing. */
  label: string
  /** The measured value, in the range's units. It is drawn clamped to `min`–`max`. */
  value: number
  /** The bottom of the range. */
  min?: number
  /** The top of the range: the limit, the quota, the budget. */
  max?: number
  /** From this value up, the meter is in its warning band. */
  warning?: number
  /** From this value up, the meter is in its danger band. */
  danger?: number
  /** The value in the app's words, seen under the bar and heard as the meter's value. */
  valueText?: string
  /** The status glyph's names. English when omitted. */
  messages?: MeterMessages
}

const DEFAULT_MESSAGES: MeterMessages = { warning: 'High', danger: 'Critical' }

/** The glyph for each band past a threshold, the roles Alert gives the same tones. */
const STATUS_GLYPH = { warning: 'warning', danger: 'error' } as const

/**
 * The tone of a value against its thresholds. It reads the value as given, not
 * clamped, so a value past `max` is still past a threshold that sits above it.
 * `danger` wins where the two bands overlap.
 */
function meterTone(value: number, warning?: number, danger?: number): MeterTone {
  if (danger !== undefined && value >= danger) return 'danger'
  if (warning !== undefined && value >= warning) return 'warning'
  return 'accent'
}

export function Meter({
  label,
  value,
  min = 0,
  max = 100,
  warning,
  danger,
  valueText,
  messages = DEFAULT_MESSAGES,
}: MeterProps) {
  // Clamped, because a bar cannot show more than full or less than empty, and
  // `aria-valuenow` must sit inside the range it names.
  const shown = Math.min(max, Math.max(min, value))
  const ratio = max > min ? (shown - min) / (max - min) : 0
  const tone = meterTone(value, warning, danger)
  const status = tone === 'accent' ? undefined : tone

  return (
    <div className={styles.meter} data-tone={tone} {...memberAttr('Meter')}>
      <div
        className={styles.track}
        role="meter"
        aria-label={label}
        aria-valuenow={shown}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={valueText}
      >
        {/* Scaled, not sized, as Progress's fill is: the ratio is data, which no token holds. */}
        <div className={styles.fill} style={{ transform: `scaleX(${ratio})` }} />
      </div>
      {status === undefined && valueText === undefined ? null : (
        <div className={styles.readout}>
          {/* The second channel: a glyph whose shape and name say the band, after the meter. */}
          {status === undefined ? null : (
            <span className={styles.status}>
              <Icon name={STATUS_GLYPH[status]} size="sm" label={messages[status]} />
            </span>
          )}
          {/* Hidden, because the meter's `aria-valuetext` already says it. */}
          {valueText === undefined ? null : (
            <span className={styles.value} aria-hidden="true">
              {valueText}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
