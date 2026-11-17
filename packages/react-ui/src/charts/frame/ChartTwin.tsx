'use client'

import { useState } from 'react'

import { Button } from '../../controls/Button'
import { Table } from '../../structure/Table'
import type { ChartMessages, ChartTwinColumn } from '@polymorph/react'
import styles from '@polymorph/recipes/charts/frame/chart-twin.module.css'

/**
 * The table twin: **mandatory anatomy, not an option** (the accessibility
 * rules, `docs/charts.md`).
 *
 * It is the relief channel the palette laws depend on. The wheel accepts an
 * adjacent CVD floor of ΔE 6 and two sub-3:1 relief slots in the flagship
 * pairing *because* every chart has secondary encoding: a legend at two or
 * more series, selective direct labels, and this table. Without the twin those
 * measurements would not pass the laws, so every member renders it and a screen
 * cannot turn it off.
 *
 * It is a real `Table`, not a hand-built grid, so assistive software gets a
 * real table and every value is reachable without hover. Tooltips add to the
 * table; they never replace it.
 *
 * The component owns its open state. A chart takes no prop for whether its data
 * is showing, because that is the reader's choice, not a property of the data.
 * `Table`'s scroll state is not a prop for the same reason.
 */

export interface ChartTwinProps {
  /** The chart's name, so the toggle says which chart it opens. */
  label: string
  columns: readonly ChartTwinColumn[]
  /**
   * Cells, pre-formatted by the member through `format.ts`. They are strings,
   * not numbers, because the twin must print exactly what the tooltip printed.
   * A second formatting path could print a different value.
   */
  rows: readonly (readonly string[])[]
  /**
   * The member's whole string catalog. It is required: the twin is anatomy, a
   * member always has a catalog (at least its defaults), and an optional prop
   * here could leave the toggle in English under a French chart.
   */
  messages: ChartMessages
}

export function ChartTwin({ label, columns, rows, messages }: ChartTwinProps) {
  const [open, setOpen] = useState(false)
  const tableLabel = messages.tableLabel(label)

  return (
    <div className={styles.twin} data-state={open ? 'open' : 'closed'}>
      <div className={styles.toggle}>
        <Button
          variant="ghost"
          tone="neutral"
          size="sm"
          icon="table"
          iconOnly
          label={open ? messages.hideTable(label) : messages.showTable(label)}
          onClick={() => setOpen((was) => !was)}
        />
      </div>

      {/*
       * Unmounted, not hidden. Some screen readers still account for a
       * `display: none` table, and layout always does. A dashboard often has a
       * dozen charts, so a dozen hidden tables is a real cost for a state that
       * is usually closed.
       *
       * Named twice, because there are two things to name. `label` names the
       * *scroll region* when the columns outgrow the panel. `caption` names the
       * table itself, and is what a reader hears when listing the tables on a
       * dashboard. Without it every twin on the page is just "table", which is
       * why `Table` takes a `caption` (`table.md`).
       *
       * The caption is announced, not drawn, because the chart above already
       * shows the name.
       */}
      {open ? (
        <div className={styles.table}>
          <Table label={tableLabel} caption={tableLabel}>
            <Table.Head>
              <Table.Row>
                {columns.map((column) => (
                  <Table.Header key={column.key} numeric={column.numeric}>
                    {column.label}
                  </Table.Header>
                ))}
              </Table.Row>
            </Table.Head>
            <Table.Body>
              {rows.map((row, index) => (
                <Table.Row key={index}>
                  {row.map((cell, at) => (
                    <Table.Cell key={columns[at]?.key ?? at} numeric={columns[at]?.numeric}>
                      {/* An absent measurement shows an em dash instead of a blank cell. */}
                      {cell === '' ? '—' : cell}
                    </Table.Cell>
                  ))}
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      ) : null}
    </div>
  )
}
