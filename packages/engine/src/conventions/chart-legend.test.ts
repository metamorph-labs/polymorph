import { afterEach, describe, expect, it, vi } from 'vitest'

import { chartHiddenSeries, chartSeries, toggleChartSeries } from './chart-legend'

/**
 * What an agent toggles in a chart's legend (the `## Agent` section of each
 * chart whose legend toggles): the series read from the legend's keys in the
 * chart's element, in the legend's order, and a press on a key's own button.
 * The chart here is plain DOM with the shape every renderer's chart frame
 * draws: a figure whose legend is a list of buttons, each a swatch, an icon
 * and the series' label, with the table twin's toggle beside it.
 */

afterEach(() => document.body.replaceChildren())

/** The legend recipe's key class, as a CSS module may write it: the value holds two. */
const KEY = 'legend-key legend-key-x1'

const SERIES = [{ key: 'opened' }, { key: 'resolved' }, { key: 'backlog' }]

/** A chart's figure whose legend draws a key per label, pressed unless its series is hidden. */
function chart(labels: string[], hidden: string[] = []): HTMLElement {
  const figure = document.createElement('figure')
  figure.setAttribute('aria-label', 'Tickets by day')
  const keys = labels
    .map((label, at) => {
      const pressed = !hidden.includes(SERIES[at]?.key ?? '')
      return (
        `<li><button type="button" class="${KEY}" aria-pressed="${pressed}">` +
        `<span aria-hidden="true"></span><span><svg aria-hidden="true"></svg></span>` +
        `<span>${label}</span></button></li>`
      )
    })
    .join('')
  figure.innerHTML =
    `<div><div role="img" tabindex="0"></div></div><ul>${keys}</ul>` +
    '<div><button type="button" aria-label="Show the table">t</button></div>'
  document.body.append(figure)
  return figure
}

describe('chartSeries', () => {
  it('lists each key in the legend’s order, by its series’ key, labelled by what it says', () => {
    expect(chartSeries(chart(['Opened', 'Resolved', '  Open backlog ']), KEY, SERIES)).toEqual([
      { id: 'opened', label: 'Opened' },
      { id: 'resolved', label: 'Resolved' },
      { id: 'backlog', label: 'Open backlog' },
    ])
  })

  it('lists nothing for a chart whose legend draws no key, or with no key class', () => {
    const figure = chart([])
    expect(chartSeries(figure, KEY, [])).toEqual([])
    expect(chartSeries(chart(['Opened', 'Resolved', 'Open backlog']), undefined, SERIES)).toEqual(
      [],
    )
    expect(chartSeries(chart(['Opened']), ' ', SERIES.slice(0, 1))).toEqual([])
    expect(chartSeries(null, KEY, SERIES)).toEqual([])
  })

  it('lists nothing when the keys and the series it is given do not pair', () => {
    expect(chartSeries(chart(['Opened', 'Resolved']), KEY, SERIES)).toEqual([])
  })
})

describe('chartHiddenSeries', () => {
  it('lists the series whose keys are not pressed, in the legend’s order', () => {
    const figure = chart(['Opened', 'Resolved', 'Open backlog'], ['backlog', 'opened'])
    expect(chartHiddenSeries(figure, KEY, SERIES)).toEqual(['opened', 'backlog'])
    expect(chartHiddenSeries(chart(['Opened', 'Resolved', 'Backlog']), KEY, SERIES)).toEqual([])
  })
})

describe('toggleChartSeries', () => {
  it('presses the key the id names with its own click', () => {
    const figure = chart(['Opened', 'Resolved', 'Open backlog'])
    const keys = Array.from(figure.querySelectorAll('ul button'))
    const pressed: string[] = []
    for (const key of keys) {
      key.addEventListener('click', () => pressed.push(key.textContent ?? ''))
    }
    toggleChartSeries(figure, KEY, SERIES, 'resolved')
    expect(pressed).toEqual(['Resolved'])
  })

  it('refuses an id that names no key, and presses nothing', () => {
    const figure = chart(['Opened', 'Resolved', 'Open backlog'])
    const click = vi.fn()
    figure.addEventListener('click', click)
    expect(() => toggleChartSeries(figure, KEY, SERIES, 'Opened')).toThrow(
      `No key of the chart's legend has the id "Opened".`,
    )
    expect(() => toggleChartSeries(figure, KEY, SERIES, '0')).toThrow()
    expect(click).not.toHaveBeenCalled()
  })
})
