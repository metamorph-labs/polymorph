'use client'

import {
  chartMarks,
  chartPosition,
  type ChartMessages,
  type ChartSize,
  type ChartTooltipConfig,
  chooseChartMark,
  DEFAULT_CHART_MESSAGES,
  readChartPosition,
  treemapModel,
  treemapReadout,
  treemapSelection,
  type TreemapItem,
  useAgentMember,
  useDevWarnings,
  type ValueFormat,
} from '@polymorph/react'
import { useCallback, useMemo, useRef, type CSSProperties, type KeyboardEvent } from 'react'

import { ChartFrame } from './frame/ChartFrame'
import { ChartLegend } from './frame/ChartLegend'
import { ChartTooltip } from './frame/ChartTooltip'
import { ChartTwin } from './frame/ChartTwin'
import { useMeasuredBox } from './frame/use-measured-box'
import { useReading } from './frame/use-reading'
import styles from '@polymorph/recipes/charts/treemap.module.css'

export type { TreemapItem } from '@polymorph/react'

/**
 * A treemap of parts of a whole (`design/components/treemap.md`).
 *
 * It answers "what takes the space": many parts, each a rectangle whose area
 * is its value, in up to two levels, with each group's items in its colour. It
 * is **not** a `DonutChart`, which splits a whole into at most six parts a
 * reader compares at a glance, and not a `BarChart`, which compares close
 * values by length, the measure a reader judges best.
 */

export interface TreemapProps {
  /** The parts. An item with children is a group; deeper items are summed into the second level. */
  items: readonly TreemapItem[]
  /** Formats each item's value on its label, in the tooltip and in the twin. */
  format?: ValueFormat
  size?: ChartSize
  label: string
  locale?: string
  tooltip?: ChartTooltipConfig | false
  /** Called with the read item's key, label, value and share, on Enter, Space or click. */
  onSelect?: (selection: { key: string; label: string; value: number; share: number }) => void
  loading?: boolean
  /**
   * The chart tier's string catalog (`ChartMessages`). Defaults to generic
   * English; a localized host passes the same object to every chart.
   */
  messages?: ChartMessages
}

export function Treemap({
  items,
  format,
  size = 'md',
  label,
  locale,
  tooltip = {},
  onSelect,
  loading = false,
  messages = DEFAULT_CHART_MESSAGES,
}: TreemapProps) {
  const { ref: plotRef, box } = useMeasuredBox<HTMLDivElement>()

  /*
   * The drawing, from the engine (`treemapModel`): the layout, the colours,
   * the gaps, the labels that fit and the readout's words, decided once for
   * every framework's Treemap. The reading position is not an input, so a
   * pointer move lays nothing out again.
   */
  const selectable = onSelect !== undefined
  const input = useMemo(
    () => ({ items, format, label, locale, messages, loading, selectable, box }),
    [items, format, label, locale, messages, loading, selectable, box],
  )
  const model = useMemo(() => treemapModel(input), [input])
  useDevWarnings(model.warnings)

  const walk = { count: model.leaves.length }
  const reading = useReading(walk)
  const readout = treemapReadout({ ...input, tooltip }, model, reading)

  /**
   * Reports the read item, with its share. It reads the live position, not the
   * rendered one; see LineChart's note on click timing.
   */
  const activate = useCallback(() => {
    if (onSelect === undefined) return
    const selection = treemapSelection(input, model, reading.now())
    if (selection !== null) onSelect(selection)
  }, [onSelect, input, model, reading])

  /*
   * The spec's `agent` fence, which every chart that takes `onSelect` shares
   * (`chartMarks`): a mark an agent picks is a position the keys reach, named
   * by what the live region says there, and `choose` moves the reading to it
   * and runs `activate`, as Enter does. `items` is the window of marks around
   * the reading position, and `read` moves the reading as Left and Right do.
   * Without `onSelect` a person has nothing to pick, so the chart registers
   * nothing.
   */
  const frame = useRef<HTMLElement>(null)
  const marks = { walk, input, model, readout: treemapReadout, selection: treemapSelection }
  useAgentMember(
    {
      member: 'Treemap',
      element: () => frame.current,
      state: () => ({
        items: chartMarks(marks, reading),
        position: chartPosition(marks, reading),
        count: walk.count,
      }),
      actions: {
        read: {
          argument: 'number',
          run: (position) => readChartPosition(marks, position, reading),
        },
        choose: { argument: 'id', run: (id) => chooseChartMark(marks, id, reading, activate) },
      },
    },
    { unless: onSelect === undefined },
  )

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (onSelect !== undefined && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      activate()
      return
    }
    reading.onKeyDown(event)
  }

  const { plot } = model

  return (
    <ChartFrame
      member="Treemap"
      frameRef={frame}
      position={reading.active ? reading.index : null}
      label={label}
      size={size}
      state={model.state}
      plotRef={plotRef}
      summary={model.summary}
      announcement={readout.announcement}
      legend={model.legend ? <ChartLegend series={model.painted} keyShape="rect" /> : null}
      twin={
        <ChartTwin
          label={label}
          columns={model.twin.columns}
          rows={model.twin.rows}
          messages={messages}
        />
      }
      empty={<span>{messages.empty}</span>}
      tooltip={readout.tooltip === null ? null : <ChartTooltip {...readout.tooltip} />}
    >
      {/* One focus stop. Left/Right walk the tiles, group by group, largest first. */}
      <div
        className={styles.surface}
        tabIndex={0}
        role="img"
        aria-label={label}
        onKeyDown={onKeyDown}
        onClick={() => activate()}
        onPointerLeave={reading.clear}
        onBlur={reading.clear}
      >
        {plot === null ? null : (
          <>
            <svg
              className={styles.marks}
              data-reading={reading.active ? '' : undefined}
              width={plot.width}
              height={plot.height}
              aria-hidden="true"
              focusable="false"
            >
              <g>
                {plot.tiles.map((tile) => (
                  <rect
                    key={tile.id}
                    className={styles.tile}
                    style={{ '--pm-chart-mark': tile.fill } as CSSProperties}
                    data-active={tile.index === reading.index ? '' : undefined}
                    x={tile.paint.x}
                    y={tile.paint.y}
                    width={tile.paint.width}
                    height={tile.paint.height}
                    rx={plot.radius}
                  />
                ))}
              </g>

              {/*
               * The pointer targets, over the paint and in reading order, so a
               * small item's target, grown to 24px, sits over its larger
               * neighbour's. A click moves the reading to the item before the
               * surface reports it.
               */}
              <g>
                {plot.tiles.map((tile) => (
                  <rect
                    key={tile.id}
                    className={styles.hit}
                    x={tile.hit.x}
                    y={tile.hit.y}
                    width={tile.hit.width}
                    height={tile.hit.height}
                    onPointerEnter={() => reading.moveTo(tile.index)}
                    onClick={() => reading.moveTo(tile.index)}
                  />
                ))}
              </g>
            </svg>

            {/*
             * The labels are HTML on a surface plate, so their contrast is the
             * theme's text on its surface in every palette, never text on a
             * series colour. They are hidden from the tree: the live region and
             * the twin say the same.
             */}
            <div className={styles.text} aria-hidden="true">
              {plot.tiles.map((tile) =>
                tile.plate === null ? null : (
                  <span
                    key={tile.id}
                    className={styles.plate}
                    style={
                      {
                        '--pm-chart-text-x': `${tile.plate.x}px`,
                        '--pm-chart-text-y': `${tile.plate.y}px`,
                        '--pm-chart-text-width': `${tile.plate.width}px`,
                      } as CSSProperties
                    }
                  >
                    <span className={styles.plateLabel}>{tile.plate.label}</span>
                    <span className={styles.plateValue}>{tile.plate.value}</span>
                  </span>
                ),
              )}
            </div>
          </>
        )}
      </div>
    </ChartFrame>
  )
}
