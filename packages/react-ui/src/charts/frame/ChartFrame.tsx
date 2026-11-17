'use client'

import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { type ReactNode, type Ref } from 'react'

import { type ChartSize, type ChartState, memberAttr } from '@polymorph/react'
import styles from '@polymorph/recipes/charts/frame/chart-frame.module.css'

/**
 * The frame that every chart member renders (`docs/charts.md`).
 *
 * It is anatomy, not a member: it has no `.states.tsx`, no export from
 * `index.ts` and no route. Application code cannot compose it on purpose,
 * because the closed grammar composes charts for it. A screen uses
 * `<BarChart>`, and `<BarChart>` uses this.
 *
 * **The frame has no chrome.** No title, no card, no surface: `Dashboard.Panel`
 * and `Card` own those, as Stat's "content, not surface" rule requires. It also
 * keeps one heading per panel, because a frame with its own title would add a
 * second heading inside every panel.
 *
 * **The gutter is sized by CSS, not computed.** The plot region is a two-by-two
 * grid, with the y axis beside the plot and the x axis beneath it. The y column
 * sizes itself to its widest tick label and the x row to its own line box. That
 * meets the rule "the y gutter is sized to the widest rendered tick label"
 * exactly, with no measuring pass. JavaScript still measures the plot cell,
 * because the marks are drawn in real pixels.
 */

export interface ChartFrameProps {
  /**
   * The member name (`BarChart`, `Heatmap`), set as the identity attribute
   * (`data-member`). It is required because the frame *is* the member's
   * outermost element. The legend, the axes and the twin all sit inside it with
   * the member's classes. An identity on the plot surface instead would leave
   * most of the chart out of reach of the exception seam.
   */
  member: string
  /** The accessible name. */
  label: string
  /**
   * Height from `--pm-chart-height-*`. Width comes from the container. The
   * height *includes* the x-axis band, so a chart never has its own scrollbar.
   */
  size?: ChartSize
  /** `loading` takes precedence over `empty`; both are derived from the data and props. */
  state?: ChartState
  /** The marks, drawn at the measured plot size. */
  children: ReactNode
  /**
   * A ref for the plot cell, so the **member** owns the measurement.
   *
   * The frame sets the plot's size, with its height from a token through CSS.
   * The member needs the number, for the axes and the tooltip as well as the
   * marks. A render prop would give it only to the marks. Passing the ref out
   * means one `useMeasuredBox` in the member serves all of them, and the height
   * token is never read back from the DOM.
   */
  plotRef?: (node: HTMLDivElement | null) => void
  /**
   * A ref for the figure, the member's outermost element, which a chart
   * registers with the agent registry as the element an agent reads its name
   * from.
   */
  frameRef?: Ref<HTMLElement>
  /** The y axis, in its own grid column. */
  yAxis?: ReactNode
  /** The x axis, in its own grid row, under the plot. */
  xAxis?: ReactNode
  /**
   * The legend, derived from the series count and never a prop of the member
   * (the shared grammar, `docs/charts.md`).
   */
  legend?: ReactNode
  /** The table twin and its toggle: mandatory anatomy, supplied by the member. */
  twin?: ReactNode
  /** The empty state's text. The spec sets the copy, never the frame. */
  empty?: ReactNode
  /** The tooltip layer, positioned within the frame rather than portalled. */
  tooltip?: ReactNode
  /**
   * The text a screen reader gets instead of the plot: one orienting sentence.
   * The table twin carries the *data*.
   */
  summary?: string
  /**
   * What the keyboard reading position is currently on. Announced politely, so
   * arrowing along a series reads each point without interrupting.
   */
  announcement?: string
  /**
   * The reading position along the chart, 0-based, or `null` while nothing is
   * read. The figure carries it as `data-position`, which is where an agent's
   * `position` state is shown (the `## Agent` section of each chart's spec).
   */
  position?: number | null
}

export function ChartFrame({
  member,
  label,
  size = 'md',
  state = 'ready',
  children,
  plotRef,
  frameRef,
  yAxis,
  xAxis,
  legend,
  twin,
  empty,
  tooltip,
  summary,
  announcement,
  position = null,
}: ChartFrameProps) {
  return (
    <figure
      ref={frameRef}
      className={styles.frame}
      data-size={size}
      data-state={state}
      data-position={position ?? undefined}
      aria-label={label}
      {...memberAttr(member)}
    >
      <div className={styles.region}>
        <div className={styles.yAxis}>{yAxis}</div>
        <div className={styles.plot} ref={plotRef}>
          {state === 'empty' && empty !== undefined ? (
            <div className={styles.empty}>{empty}</div>
          ) : (
            children
          )}
          {tooltip}
        </div>
        <div className={styles.xAxis}>{xAxis}</div>
      </div>

      {legend}

      {/*
       * The relief channel that the palette law's soft gates depend on (the
       * accessibility rules, `docs/charts.md`). It is mandatory anatomy, so the
       * summary sentence and the twin are both here and neither is optional in
       * a member.
       */}
      {summary === undefined ? null : <VisuallyHidden>{summary}</VisuallyHidden>}
      {twin}

      {/*
       * `aria-live` is on an element that is always mounted, not one that
       * appears with its announcement. Most screen readers do not announce a
       * live region added to the DOM at the same time as its content.
       */}
      <VisuallyHidden>
        <div aria-live="polite" aria-atomic="true">
          {announcement ?? ''}
        </div>
      </VisuallyHidden>
    </figure>
  )
}
