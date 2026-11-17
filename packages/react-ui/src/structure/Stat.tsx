import { Icon, type IconRole, memberAttr } from '@polymorph/react'
import { Sparkline } from '../charts/Sparkline'
import { Badge } from './Badge'
import styles from '@polymorph/recipes/structure/stat.module.css'

/**
 * A key number with its label and direction of change
 * (`design/components/stat.md`).
 *
 * Content, not a surface: Dashboard wraps these in Cards, so a Stat's own box
 * would nest. `value` is pre-formatted, because separators, currency, precision
 * and locale are data logic this component cannot know.
 */

export type DeltaDirection = 'up' | 'down'

export interface StatDelta {
  value: string
  direction: DeltaDirection
  /**
   * Defaults to `direction === 'up'`. Direction and sentiment are separate:
   * open tickets going *down* is good news.
   */
  positive?: boolean
}

/**
 * The movement, as a neutral outline chip on the label row, the way the
 * dashboard block's reference design draws it.
 *
 * Separate from `delta`, the *sentiment* line, which is coloured success or
 * danger and says whether the change is good. `trend` says only that the number
 * moved and which way. A card uses one of them, or it would state the same fact
 * twice.
 */
export interface StatTrend {
  direction: DeltaDirection
  /** Pre-formatted, like `value`: "+12.5%", "-20%", "4 fewer". */
  label: string
}

/**
 * The two lines under the number.
 *
 * `primary` interprets the number and `secondary` names the period, so they are
 * one slot: either alone is half a statement (the completeness law at card
 * size).
 */
export interface StatFooter {
  primary: string
  secondary: string
}

export interface StatProps {
  label: string
  /** Already formatted by the app. */
  value: string
  /** Tabular figures, so a column of these lines up. */
  numeric?: boolean
  icon?: IconRole
  delta?: StatDelta
  /** The neutral movement chip, top-right. See `StatTrend` for why it is not `delta`. */
  trend?: StatTrend
  /**
   * The trend as a shape: a `Sparkline` at the value row's inline end. It can
   * sit beside `trend` (words for the direction, a shape for the path) and
   * replaces neither `delta` nor `footer`. `Sparkline` draws it, and renders
   * nothing for fewer than two points.
   */
  spark?: readonly number[]
  /**
   * The sparkline's accessible name, as a function of the stat's label because the
   * wording belongs to the catalog; the default is `{label}, recent trend`.
   */
  sparkLabel?: (label: string) => string
  /** Shown when there is no delta, such as "vs last week". */
  description?: string
  /** The two-line footer: the interpretation, then the period it covers. */
  footer?: StatFooter
}

const defaultSparkLabel = (label: string) => `${label}, recent trend`

export function Stat({
  label,
  value,
  numeric = true,
  icon,
  delta,
  trend,
  spark,
  sparkLabel = defaultSparkLabel,
  description,
  footer,
}: StatProps) {
  const positive = delta === undefined ? undefined : (delta.positive ?? delta.direction === 'up')

  return (
    <div className={styles.stat} {...memberAttr('Stat')}>
      <div className={styles.labelRow}>
        <span className={styles.label}>{label}</span>

        {icon === undefined && trend === undefined ? null : (
          <span className={styles.labelEnd}>
            {icon === undefined ? null : (
              <span className={styles.glyph}>
                <Icon name={icon} />
              </span>
            )}
            {trend === undefined ? null : (
              <Badge variant="outline" icon={trend.direction}>
                {trend.label}
              </Badge>
            )}
          </span>
        )}
      </div>

      <div className={styles.valueRow}>
        <span className={styles.value} data-numeric={numeric ? '' : undefined}>
          {value}
        </span>

        {/*
         * Sparkline is the one chart with no table twin, so its accessible name
         * carries the trend in this Stat's words. The wrapper never shrinks,
         * because a squashed spark is a different shape.
         */}
        {spark === undefined ? null : (
          <span className={styles.spark}>
            <Sparkline data={spark} label={sparkLabel(label)} />
          </span>
        )}
      </div>

      {delta === undefined ? (
        description === undefined ? null : (
          <span className={styles.description}>{description}</span>
        )
      ) : (
        <span
          className={styles.delta}
          data-direction={delta.direction}
          data-positive={positive ? '' : undefined}
        >
          <Icon name={delta.direction} size="sm" />
          <span aria-hidden="true">{delta.value}</span>

          {/*
           * Spoken text: colour and the arrow are not read aloud, so this states
           * the direction and the sentiment.
           */}
          <span className={styles.spoken}>
            {`${delta.direction} ${delta.value} — ${positive ? 'positive' : 'negative'}`}
          </span>
        </span>
      )}

      {footer === undefined ? null : (
        <div className={styles.footer}>
          <span className={styles.footerPrimary}>
            {footer.primary}
            {/*
             * The trend glyph again, as in the reference design: the chip starts
             * the reading and this ends it. Derived from `trend`, so the two
             * cannot disagree.
             */}
            {trend === undefined ? null : (
              <span className={styles.footerGlyph}>
                <Icon name={trend.direction} size="sm" />
              </span>
            )}
          </span>
          <span className={styles.footerSecondary}>{footer.secondary}</span>
        </div>
      )}
    </div>
  )
}
