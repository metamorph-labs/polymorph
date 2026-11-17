import { describe, expect, it, vi } from 'vitest'

import { createBrush } from '../charts/brush'
import { createReading } from '../charts/reading'
import { brushChartRange, chartRange, type ChartRangeSource } from './chart-range'

/**
 * What an agent reads of a chart's brush and how it builds a range (the
 * `## Agent` section of LineChart and AreaChart): the range a person sees, in
 * rows, and a range built with the keys a person presses, through the
 * engine's own brush and reading machines, which every renderer's chart
 * drives. `onCommit` receives the pair a person's committed range gives.
 */

/** Ten rows, ten pixels apart, with a brush that records each commit. */
function chart(overrides: Partial<{ brushable: boolean; brushOn: boolean; count: number }> = {}) {
  const { brushable = true, brushOn = true, count = 10 } = overrides
  const onCommit = vi.fn()
  const positions = Array.from({ length: count }, (_, index) => index * 10)
  const brush = createBrush({ enabled: brushOn, count, positions, onCommit })
  const reading = createReading({ count })
  const source: ChartRangeSource = { walk: { count }, input: { brushable }, model: { brushOn } }
  return { source, brush, reading, onCommit }
}

/** A person's keys on the same machines, as the plot's key handler gives them: the brush first. */
function press(made: ReturnType<typeof chart>, keys: [string, boolean][]) {
  for (const [key, shift] of keys) {
    if (!made.brush.key(key, shift, made.reading)) made.reading.key(key)
  }
}

describe('chartRange', () => {
  it('is no range at rest, and the rows a range starts and ends on, in the order it was built', () => {
    const made = chart()
    expect(chartRange(made.source, made.brush)).toEqual({ start: null, end: null })
    press(made, [
      ['End', false],
      ['ArrowLeft', true],
      ['ArrowLeft', true],
    ])
    expect(chartRange(made.source, made.brush)).toEqual({ start: 9, end: 7 })
    press(made, [['Enter', false]])
    expect(chartRange(made.source, made.brush)).toEqual({ start: 9, end: 7 })
    press(made, [['Escape', false]])
    expect(chartRange(made.source, made.brush)).toEqual({ start: null, end: null })
  })

  it('reads no range built on rows the chart no longer has', () => {
    const made = chart()
    press(made, [
      ['ArrowRight', true],
      ['ArrowRight', true],
    ])
    expect(chartRange(made.source, made.brush)).toEqual({ start: 0, end: 1 })
    expect(chartRange({ walk: { count: 12 } }, made.brush)).toEqual({ start: null, end: null })
  })
})

describe('brushChartRange', () => {
  it('builds a range from the reading position and commits it, as Shift, the arrows and Enter do', () => {
    const agent = chart()
    agent.reading.moveTo(3)
    brushChartRange(agent.source, 7, agent.brush, agent.reading)
    expect(agent.onCommit).toHaveBeenCalledExactlyOnceWith(3, 7)
    expect(chartRange(agent.source, agent.brush)).toEqual({ start: 3, end: 7 })
    expect(agent.reading.now().index).toBe(7)

    const person = chart()
    person.reading.moveTo(3)
    press(person, [
      ...Array.from({ length: 4 }, (): [string, boolean] => ['ArrowRight', true]),
      ['Enter', false],
    ])
    expect(person.onCommit.mock.calls).toEqual(agent.onCommit.mock.calls)
    expect(person.brush.state()).toEqual(agent.brush.state())
  })

  it('runs left from the reading position to a row before it', () => {
    const made = chart()
    made.reading.moveTo(6)
    brushChartRange(made.source, 2, made.brush, made.reading)
    expect(made.onCommit).toHaveBeenCalledExactlyOnceWith(6, 2)
  })

  it('starts where Shift and the first arrow land with nothing read: an end of the chart', () => {
    const right = chart()
    brushChartRange(right.source, 4, right.brush, right.reading)
    expect(right.onCommit).toHaveBeenCalledExactlyOnceWith(0, 4)
    const person = chart()
    press(person, [
      ...Array.from({ length: 5 }, (): [string, boolean] => ['ArrowRight', true]),
      ['Enter', false],
    ])
    expect(person.onCommit.mock.calls).toEqual(right.onCommit.mock.calls)

    // A range that ends on the first row runs left, from the last.
    const left = chart()
    brushChartRange(left.source, 0, left.brush, left.reading)
    expect(left.onCommit).toHaveBeenCalledExactlyOnceWith(9, 0)
  })

  it('extends a range a person has begun and not committed, from where it started', () => {
    const made = chart()
    made.reading.moveTo(2)
    press(made, [
      ['ArrowRight', true],
      ['ArrowRight', true],
    ])
    brushChartRange(made.source, 6, made.brush, made.reading)
    expect(made.onCommit).toHaveBeenCalledExactlyOnceWith(2, 6)
    // A committed range is the application's: the next range starts at the reading position.
    brushChartRange(made.source, 8, made.brush, made.reading)
    expect(made.onCommit).toHaveBeenLastCalledWith(6, 8)
  })

  it('refuses a chart with no brush, saying why, and presses nothing', () => {
    for (const [overrides, message] of [
      [
        { brushable: false, brushOn: false },
        'The chart has no brush, because it takes no onBrushEnd.',
      ],
      [{ brushOn: false }, 'The chart has no brush, because its x is not one this chart brushes.'],
    ] as const) {
      const made = chart(overrides)
      expect(() => brushChartRange(made.source, 4, made.brush, made.reading)).toThrow(message)
      expect(made.reading.now().index).toBeNull()
      expect(made.onCommit).not.toHaveBeenCalled()
    }
  })

  it('refuses a number that is not a row, and a range of one row, and presses nothing', () => {
    const made = chart()
    for (const row of [10, -1, 2.5]) {
      expect(() => brushChartRange(made.source, row, made.brush, made.reading)).toThrow(
        `The chart's rows are 0 to 9, and ${row} is not one of them.`,
      )
    }
    made.reading.moveTo(5)
    expect(() => brushChartRange(made.source, 5, made.brush, made.reading)).toThrow(
      'A range runs between two rows, and this one would start and end on row 5.',
    )
    const one = chart({ count: 1 })
    expect(() => brushChartRange(one.source, 0, one.brush, one.reading)).toThrow(
      'A range runs between two rows',
    )
    const none = chart({ count: 0 })
    expect(() => brushChartRange(none.source, 0, none.brush, none.reading)).toThrow(
      'The chart has no rows to brush.',
    )
    expect(made.brush.state()).toBeNull()
    expect(made.reading.now().index).toBe(5)
    expect(made.onCommit).not.toHaveBeenCalled()
  })
})
