'use client'

import { Icon, type ResolvedSeries } from '@polymorph/react'
import type { CSSProperties, ReactNode } from 'react'

import styles from '@polymorph/recipes/charts/frame/chart-legend.module.css'

/**
 * The chart legend (`docs/charts.md`).
 *
 * **Derived, never a prop.** Two or more series get a legend. A single series
 * gets none, because the panel's title already names it and a legend of one
 * only moves the label further from the chart. `legendFor` makes that decision
 * once, and this component draws the result.
 *
 * **The key matches the mark.** A filled form gets a rect and a stroked one a
 * line, so a reader matches the legend to the plot by shape as well as colour.
 * This is the first of the four non-colour channels the accessibility rules
 * rely on (legend, direct labels, `markers`, the table twin).
 *
 * **Toggle-to-isolate**: when a member passes `onToggle`, the keys become
 * buttons with `aria-pressed`, pressed while the series is shown and unpressed
 * once the reader hides it. The member owns the state, because it refits its
 * domains to the remaining series; this component only shows which keys are
 * pressed. A hidden key becomes hollow, so its state is shown by shape, not
 * colour alone, and a hidden series never looks shown.
 *
 * An `icon` on a series renders *beside* the key, never instead of it, because
 * the mark identifies the series and the icon is supplementary. Series names
 * are data and render as text nodes.
 */

/**
 * The class the legend gives each key that toggles a series, which a chart's
 * agent handle reads its legend's keys by (`chartSeries`).
 */
export const legendKeyClass: string | undefined = styles.key

export interface ChartLegendProps {
  series: readonly ResolvedSeries[]
  /** `rect` for fills, `line` for strokes, matching what the plot draws. */
  keyShape?: 'rect' | 'line'
  /**
   * The series drawn as lines in a plot whose other series are fills
   * (`BarChart`'s `lines`): their keys are lines whatever `keyShape` says.
   */
  lineKeys?: readonly string[]
  /** The keys the reader has toggled off. The member owns this, because it refits its domains. */
  hidden?: ReadonlySet<string>
  /** When present, the keys are buttons. When absent, the legend only labels. */
  onToggle?: (key: string) => void
  /**
   * The member's class for this root, composed from `.legend` in this sheet.
   * This is how the hidden key's recipe joins the member's `composes` closure,
   * where the selectors law reads it (see the note in the specs).
   */
  className?: string
}

export function ChartLegend({
  series,
  keyShape = 'rect',
  lineKeys,
  hidden,
  onToggle,
  className,
}: ChartLegendProps) {
  if (series.length === 0) return null

  const key = (entry: ResolvedSeries): ReactNode => (
    <>
      <span
        className={styles.swatch}
        /*
         * The one custom property set from JavaScript. It holds a *token
         * reference*, not a colour: `paint` is `var(--pm-chart-3)`, built from
         * the theme's name for slot 3. A palette change repaints it without the
         * component knowing.
         */
        style={{ '--pm-chart-key': entry.paint } as CSSProperties}
        aria-hidden="true"
      />
      {/* Beside the key, never instead of it. It is decorative, because the
          label next to it names the series. */}
      {entry.icon === undefined ? null : (
        <span className={styles.glyph}>
          <Icon name={entry.icon} size="sm" />
        </span>
      )}
      <span className={styles.label}>{entry.label}</span>
    </>
  )

  return (
    <ul className={className ?? styles.legend} data-key-shape={keyShape}>
      {series.map((entry) => (
        <li
          key={entry.key}
          className={styles.item}
          data-key-shape={lineKeys?.includes(entry.key) ? 'line' : undefined}
        >
          {onToggle === undefined ? (
            key(entry)
          ) : (
            <button
              type="button"
              className={styles.key}
              aria-pressed={!(hidden?.has(entry.key) ?? false)}
              onClick={() => onToggle(entry.key)}
            >
              {key(entry)}
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
