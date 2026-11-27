import { Icon, type IconRole, memberAttr } from '@polymorph/react'
import { Sparkline } from '../charts/Sparkline'
import { Badge } from './Badge'
import { Skeleton } from './Skeleton'
import styles from '@polymorph/recipes/structure/stat.module.css'

/**
 * A key number and how it moved (`design/components/stat.md`).
 *
 * Content, not a surface: Dashboard wraps these in Cards, so a Stat's own box
 * would nest. `value` is pre-formatted, because separators, currency, precision
 * and locale are data logic this component cannot know.
 *
 * While `loading`, the label row stays and every part that states the number is
 * a Skeleton of that part's size, so the card keeps its height when the number
 * arrives. Nothing the caller passes about the number is in the document then:
 * not the value, the delta's words, the chip's label, the spark or the footer.
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
 * The delta's spoken sentence, given its value, its direction and its
 * sentiment resolved (`positive` is never absent here). A function, not three
 * words, because the order of the words is grammar and belongs to the catalog.
 */
export type StatDeltaLabel = (delta: {
  value: string
  direction: DeltaDirection
  positive: boolean
}) => string

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
  /**
   * The delta's spoken sentence in the host's words, the localization seam;
   * the default is `{direction} {value} — positive` or `— negative`.
   */
  deltaLabel?: StatDeltaLabel
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
  /**
   * The number has not arrived. The label row stays, and the value and each part
   * the caller passes that states the number is a Skeleton of that part's size.
   * `value` stays required, as a chart's rows do with its `loading`: pass what
   * there is, `''` or the last value, and it is not drawn.
   */
  loading?: boolean
  /**
   * What a screen reader hears in the value's place while `loading`, the
   * value's Skeleton's name. Default "Loading".
   */
  loadingLabel?: string
}

const defaultSparkLabel = (label: string) => `${label}, recent trend`

const defaultDeltaLabel: StatDeltaLabel = ({ value, direction, positive }) =>
  `${direction} ${value} — ${positive ? 'positive' : 'negative'}`

export function Stat({
  label,
  value,
  numeric = true,
  icon,
  delta,
  deltaLabel = defaultDeltaLabel,
  trend,
  spark,
  sparkLabel = defaultSparkLabel,
  description,
  footer,
  loading = false,
  loadingLabel = 'Loading',
}: StatProps) {
  const positive = delta === undefined ? undefined : (delta.positive ?? delta.direction === 'up')

  return (
    <div
      className={styles.stat}
      data-loading={loading ? '' : undefined}
      aria-busy={loading ? true : undefined}
      {...memberAttr('Stat')}
    >
      <div className={styles.labelRow}>
        <span className={styles.label}>{label}</span>

        {icon === undefined && trend === undefined ? null : (
          <span className={styles.labelEnd}>
            {icon === undefined ? null : (
              <span className={styles.glyph}>
                <Icon name={icon} />
              </span>
            )}
            {trend === undefined ? null : loading ? (
              // The chip's box with its line held by a Skeleton, so the label
              // row keeps the chip's height and states no movement yet.
              <span className={styles.trendPlaceholder}>
                <Skeleton textStep="xs" width={7} />
              </span>
            ) : (
              <Badge variant="outline" icon={trend.direction}>
                {trend.label}
              </Badge>
            )}
          </span>
        )}
      </div>

      <div className={styles.valueRow}>
        {loading ? (
          // The value's line box, and the one placeholder a screen reader hears.
          <Skeleton textStep="3xl" width={10} label={loadingLabel} />
        ) : (
          <span className={styles.value} data-numeric={numeric ? '' : undefined}>
            {value}
          </span>
        )}

        {/*
         * Sparkline is the one chart with no table twin, so its accessible name
         * carries the trend in this Stat's words. The wrapper never shrinks,
         * because a squashed spark is a different shape. While loading, the
         * placeholder is shorter than the value's line box, so the row keeps
         * its height.
         */}
        {spark === undefined ? null : (
          <span className={styles.spark}>
            {loading ? (
              <Skeleton shape="rect" size={6} width={9} />
            ) : (
              <Sparkline data={spark} label={sparkLabel(label)} />
            )}
          </span>
        )}
      </div>

      {delta === undefined ? (
        description === undefined ? null : loading ? (
          <Skeleton textStep="xs" width={10} />
        ) : (
          <span className={styles.description}>{description}</span>
        )
      ) : loading ? (
        // No direction, value or sentiment for a number that has not arrived.
        <Skeleton textStep="sm" width={9} />
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
           * the direction and the sentiment, in the host's words from `deltaLabel`.
           */}
          <span className={styles.spoken}>
            {deltaLabel({
              value: delta.value,
              direction: delta.direction,
              positive: positive === true,
            })}
          </span>
        </span>
      )}

      {footer === undefined ? null : loading ? (
        // The footer's box and two lines of its step: the interpretation and
        // the period come with the number.
        <div className={styles.footer}>
          <Skeleton textStep="sm" />
          <Skeleton textStep="sm" width={10} />
        </div>
      ) : (
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
