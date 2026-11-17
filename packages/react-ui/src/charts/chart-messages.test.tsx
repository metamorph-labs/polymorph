import { cleanup, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'
import {
  type ChartMessages,
  DEFAULT_CHART_MESSAGES,
  DEFAULT_GRID_MESSAGES,
  DEFAULT_RANGE_MESSAGES,
  type ValueFormat,
} from '@polymorph/react'
import { AreaChart } from './AreaChart'
import { BarChart } from './BarChart'
import { DonutChart } from './DonutChart'
import { FunnelChart } from './FunnelChart'
import { Heatmap } from './Heatmap'
import { Histogram } from './Histogram'
import { LineChart } from './LineChart'
import { RadarChart } from './RadarChart'
import { ScatterChart } from './ScatterChart'
import { Treemap } from './Treemap'

/**
 * Tests the chart tier's localization through rendered output.
 *
 * `packages/rules/src/localization.test.ts` reads JSX, and most of what a chart
 * says is not written at a JSX site. The summary is composed in the engine, the
 * gap word in the readout, and the twin's headings in an object literal. So this
 * file checks the rendered output instead. Every member is rendered for a French
 * host, with its twin open and its reading position on a gap. *Everything* a
 * person can see or hear is collected and checked against the English defaults.
 *
 * The forbidden vocabulary is derived from `DEFAULT_CHART_MESSAGES`, not written
 * out, so a sentence added to the defaults is checked immediately.
 */

beforeAll(installTestTheme)
afterEach(cleanup)

const noop = () => {}

const LIST = new Intl.ListFormat('fr', { type: 'conjunction' })

const FR: ChartMessages = {
  // The catalog owns word order and plural rules: the name comes first, the
  // series are joined by the platform's French "et", and one reading is singular.
  summary: ({ label, series, points }) =>
    `${label}${series.length === 0 ? '' : ` : ${LIST.format(series)}`} — ${
      points === 1 ? 'un relevé' : `${points} relevés`
    }. Les mêmes chiffres existent sous forme de tableau.`,
  donutSummary: ({ label, segments }) =>
    `${label} — ${segments === 1 ? 'une part' : `${segments} parts`}. Les mêmes chiffres existent sous forme de tableau.`,
  heatmapSummary: ({ label, grid }) =>
    grid === undefined
      ? `${label}. Les mêmes chiffres existent sous forme de tableau.`
      : `${label} — ${grid.rows} lignes sur ${grid.columns} colonnes. Les mêmes chiffres existent sous forme de tableau.`,
  radarSummary: ({ label, axes, series, max }) =>
    `${label} — ${axes} critères, ${series} profils, une seule échelle de zéro à ${max}. Les mêmes chiffres existent sous forme de tableau.`,
  funnelSummary: ({ label, stages }) =>
    `${label} — ${stages === 1 ? 'une étape' : `${stages} étapes`}. Les mêmes chiffres existent sous forme de tableau.`,
  treemapSummary: ({ label, items, groups, absent }) =>
    `${label} — ${items === 1 ? 'un élément' : `${items} éléments`}${
      groups === 0 ? '' : ` répartis en ${groups} groupes`
    }.${
      absent === 0
        ? ''
        : ` ${absent} sans valeur au-dessus de zéro, ${absent === 1 ? 'non tracé' : 'non tracés'}.`
    } Les mêmes chiffres existent sous forme de tableau.`,
  activationHint: 'Entrée ou Espace sélectionne la lecture en cours.',
  empty: 'Aucun relevé',
  noData: 'Aucune mesure',
  showTable: (label) => `Afficher le tableau de « ${label} »`,
  hideTable: (label) => `Masquer le tableau de « ${label} »`,
  tableLabel: (label) => `${label} — chiffres`,
  segmentColumn: 'Part',
  valueColumn: 'Valeur',
  shareColumn: 'Proportion',
  rangeColumn: 'Intervalle',
  countColumn: 'Effectif',
  stageColumn: 'Étape',
  continuedColumn: 'Poursuivi',
  continued: (taux) => `${taux} ont poursuivi`,
  groupColumn: 'Groupe',
  itemColumn: 'Élément',
  // The only notation key: a French quarter is a trimestre.
  quarter: (trimestre) => `T${trimestre}`,
}

/** Every word of three letters or more, lowercased. Both sides are compared as these words. */
const words = (text: string) =>
  new Set((text.match(/\p{L}{3,}/gu) ?? []).map((w) => w.toLowerCase()))

/**
 * Every word a catalog can produce, as a set.
 *
 * Each message is called with every argument shape the tier passes, with empty
 * names, a singular and a plural count, and the bare number the quarter label
 * takes. So "point" and "points" are both in the set and no host string is. A
 * message called with the wrong shape throws or prints a placeholder such as
 * `undefined`; both results are discarded.
 */
function vocabulary(messages: ChartMessages, extra: readonly string[] = []): Set<string> {
  const shapes = [1, 2].flatMap((n) => [
    '',
    n,
    { label: '', series: ['', '', ''], points: n },
    { label: '', series: [], points: n },
    { label: '', segments: n },
    { label: '' },
    { label: '', grid: { rows: n, columns: n } },
    { label: '', axes: n, series: n, max: '' },
    { label: '', stages: n },
    { label: '', items: n, groups: n, absent: n },
    { label: '', items: n, groups: 0, absent: 0 },
  ])
  const said = Object.values(messages).flatMap((message) => {
    if (typeof message === 'string') return [message]
    const say = message as (fact: unknown) => string
    return shapes.map((shape) => {
      try {
        const sentence = String(say(shape))
        return /undefined|\[object|NaN/.test(sentence) ? '' : sentence
      } catch {
        return ''
      }
    })
  })
  return words([...said, ...extra].join(' '))
}

/** The English vocabulary of all three default catalogs, so a reworded default is caught. */
const ENGLISH = new Set(
  [DEFAULT_CHART_MESSAGES, DEFAULT_RANGE_MESSAGES, DEFAULT_GRID_MESSAGES].flatMap((catalog) => [
    ...vocabulary(catalog),
  ]),
)

/**
 * Everything a person can see or hear from the rendered tree.
 *
 * Collected text node by text node, not with `textContent`, which joins
 * adjacent cells into one token (a twin's headings read `CréneauQ3Q4matin`). A
 * joined word is invisible to a word regex and to `\b`, so a joined `Q3` heading
 * would pass the quarter check below.
 */
function heard(container: HTMLElement): string {
  const texts: string[] = []
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    texts.push(node.textContent ?? '')
  }
  const spoken = [...container.querySelectorAll('*')].flatMap((node) =>
    ['aria-label', 'aria-description', 'aria-roledescription', 'aria-valuetext', 'title'].map(
      (name) => node.getAttribute(name) ?? '',
    ),
  )
  return [...texts, ...spoken].join(' ')
}

function english(container: HTMLElement): string[] {
  return [...words(heard(container))].filter((word) => ENGLISH.has(word)).sort()
}

const JOURS = [
  { jour: 'lun.', ouverts: 12, clos: 9 },
  { jour: 'mar.', ouverts: 18, clos: null },
  { jour: 'mer.', ouverts: 7, clos: 11 },
]
const DUO = [
  { key: 'ouverts', label: 'Ouverts' },
  { key: 'clos', label: 'Clos' },
]
const MESURES = [
  { delai: 2, note: 4.1, volume: 30 },
  { delai: 5, note: null, volume: 18 },
  { delai: 9, note: 2.4, volume: 12 },
]
const CRITERES = [
  { key: 'delai', label: 'Délai' },
  { key: 'qualite', label: 'Qualité' },
  { key: 'ecoute', label: 'Écoute' },
]
const PROFILS = [
  { agent: 4.5, equipe: 3.8 },
  { agent: null, equipe: 3.6 },
  { agent: 4.8, equipe: 4.1 },
]
const GRILLE = [
  { jour: 'lun.', heure: 'matin', appels: 12 },
  { jour: 'lun.', heure: 'soir', appels: null },
  { jour: 'mar.', heure: 'matin', appels: 4 },
  { jour: 'mar.', heure: 'soir', appels: 9 },
]

interface Subject {
  name: string
  chart: (label: string) => ReactElement
  empty: (label: string) => ReactElement
  /** The summary sentence this host's catalog should produce. */
  summary: string
  /** Keys that move the reading position onto a gap, when the member can have one. */
  toGap?: string
  /** Column headings the member supplies itself, which no axis prop names. */
  headings?: string[]
}

const shared = { messages: FR, locale: 'fr-FR', onSelect: noop }
const TABLE = 'Les mêmes chiffres existent sous forme de tableau.'

const SUBJECTS: Subject[] = [
  {
    name: 'BarChart',
    chart: (label) => (
      <BarChart
        data={JOURS}
        series={DUO}
        x={{ key: 'jour', label: 'Jour' }}
        label={label}
        {...shared}
      />
    ),
    empty: (label) => (
      <BarChart
        data={[]}
        series={DUO}
        x={{ key: 'jour', label: 'Jour' }}
        label={label}
        {...shared}
      />
    ),
    summary: `Tickets : Ouverts et Clos — 3 relevés. ${TABLE}`,
    // Second band, then Up/Down onto the series with the gap.
    toGap: '{ArrowRight}{ArrowRight}{ArrowDown}{ArrowDown}',
  },
  {
    name: 'LineChart',
    chart: (label) => (
      <LineChart
        data={JOURS}
        series={DUO}
        x={{ key: 'jour', label: 'Jour' }}
        label={label}
        {...shared}
      />
    ),
    empty: (label) => (
      <LineChart
        data={[]}
        series={DUO}
        x={{ key: 'jour', label: 'Jour' }}
        label={label}
        {...shared}
      />
    ),
    summary: `Tickets : Ouverts et Clos — 3 relevés. ${TABLE}`,
    toGap: '{ArrowRight}{ArrowRight}',
  },
  {
    name: 'AreaChart',
    chart: (label) => (
      <AreaChart
        data={JOURS}
        series={DUO}
        x={{ key: 'jour', label: 'Jour' }}
        label={label}
        {...shared}
      />
    ),
    empty: (label) => (
      <AreaChart
        data={[]}
        series={DUO}
        x={{ key: 'jour', label: 'Jour' }}
        label={label}
        {...shared}
      />
    ),
    summary: `Tickets : Ouverts et Clos — 3 relevés. ${TABLE}`,
    toGap: '{ArrowRight}{ArrowRight}',
  },
  {
    name: 'ScatterChart',
    chart: (label) => (
      <ScatterChart
        data={MESURES}
        series={[{ key: 'note', label: 'Note' }]}
        x={{ key: 'delai', label: 'Délai' }}
        bubble={{ key: 'volume', label: 'Volume traité' }}
        label={label}
        {...shared}
      />
    ),
    empty: (label) => (
      <ScatterChart
        data={[]}
        series={[{ key: 'note', label: 'Note' }]}
        x={{ key: 'delai', label: 'Délai' }}
        label={label}
        {...shared}
      />
    ),
    summary: `Tickets : Note — 3 relevés. ${TABLE}`,
    toGap: '{ArrowRight}{ArrowRight}',
  },
  {
    name: 'Histogram',
    // No `x.label` and no `y.label`, so the member supplies the headings.
    chart: (label) => <Histogram data={[1, 2, 2, 3, 3, 3, 8]} label={label} {...shared} />,
    empty: (label) => <Histogram data={[]} label={label} {...shared} />,
    summary: `Tickets — 7 relevés. ${TABLE}`,
    headings: ['Intervalle', 'Effectif'],
  },
  {
    name: 'DonutChart',
    chart: (label) => (
      <DonutChart
        segments={[
          { key: 'mail', label: 'Courriel', value: 60 },
          { key: 'tel', label: 'Téléphone', value: 40 },
        ]}
        label={label}
        {...shared}
      />
    ),
    empty: (label) => <DonutChart segments={[]} label={label} {...shared} />,
    summary: `Tickets — 2 parts. ${TABLE}`,
    headings: ['Part', 'Valeur', 'Proportion'],
  },
  {
    name: 'Heatmap',
    chart: (label) => (
      <Heatmap
        data={GRILLE}
        x={{ key: 'jour' }}
        y={{ key: 'heure', label: 'Créneau' }}
        value={{ key: 'appels' }}
        label={label}
        {...shared}
      />
    ),
    empty: (label) => (
      <Heatmap
        data={[]}
        x={{ key: 'jour' }}
        y={{ key: 'heure', label: 'Créneau' }}
        value={{ key: 'appels' }}
        label={label}
        {...shared}
      />
    ),
    summary: `Tickets — 2 lignes sur 2 colonnes. ${TABLE}`,
    // First column, second row: the unmeasured cell.
    toGap: '{ArrowRight}{ArrowDown}',
  },
  {
    name: 'FunnelChart',
    chart: (label) => (
      <FunnelChart
        stages={[
          { key: 'visites', label: 'Visites', value: 200 },
          { key: 'inscriptions', label: 'Inscriptions', value: 120 },
          { key: 'achats', label: 'Achats', value: 30 },
        ]}
        label={label}
        {...shared}
      />
    ),
    empty: (label) => <FunnelChart stages={[]} label={label} {...shared} />,
    summary: `Tickets — 3 étapes. ${TABLE}`,
    headings: ['Étape', 'Valeur', 'Proportion', 'Poursuivi'],
  },
  {
    name: 'Treemap',
    chart: (label) => (
      <Treemap
        items={[
          {
            key: 'support',
            label: 'Assistance',
            value: 90,
            children: [
              { key: 'courriel', label: 'Courriel', value: 60 },
              { key: 'tel', label: 'Téléphone', value: 30 },
            ],
          },
          { key: 'ventes', label: 'Ventes', value: 40 },
          { key: 'vide', label: 'Juridique', value: 0 },
        ]}
        label={label}
        {...shared}
      />
    ),
    empty: (label) => <Treemap items={[]} label={label} {...shared} />,
    summary: `Tickets — 4 éléments répartis en 3 groupes. 1 sans valeur au-dessus de zéro, non tracé. ${TABLE}`,
    headings: ['Groupe', 'Élément', 'Valeur', 'Proportion'],
  },
  {
    name: 'RadarChart',
    chart: (label) => (
      <RadarChart
        axes={CRITERES}
        data={PROFILS}
        series={[
          { key: 'agent', label: 'Agent' },
          { key: 'equipe', label: 'Équipe' },
        ]}
        label={label}
        {...shared}
      />
    ),
    empty: (label) => (
      <RadarChart
        axes={CRITERES}
        data={[]}
        series={[{ key: 'agent', label: 'Agent' }]}
        label={label}
        {...shared}
      />
    ),
    summary: `Tickets — 3 critères, 2 profils, une seule échelle de zéro à 5. ${TABLE}`,
    toGap: '{ArrowRight}{ArrowRight}',
  },
]

describe('the English vocabulary derived from the default catalogs', () => {
  it('contains words from the default sentences', () => {
    // An empty vocabulary would make every check below pass.
    for (const word of ['showing', 'points', 'point', 'table', 'segments', 'rows', 'columns']) {
      expect(ENGLISH.has(word), word).toBe(true)
    }
    for (const word of ['selects', 'hide', 'show', 'data', 'count', 'range', 'share', 'activity']) {
      expect(ENGLISH.has(word), word).toBe(true)
    }
  })

  it('shares no word with the French catalog', () => {
    // A shared word ("points", "segments" and "axes" are French too) would
    // look like a leak and send someone looking for one.
    expect([...vocabulary(FR)].filter((word) => ENGLISH.has(word))).toEqual([])
  })
})

describe.each(SUBJECTS)('a French host gets no English from $name', (subject) => {
  it('in the summary, the twin and the reading', async () => {
    const { container } = render(subject.chart('Tickets'))

    // The summary sentence and its activation hint.
    expect(container.textContent).toContain(subject.summary)
    expect(container.textContent).toContain(FR.activationHint)

    // The twin: its toggle in both states, the table's name, and the member's headings.
    await userEvent.click(
      screen.getByRole('button', { name: 'Afficher le tableau de « Tickets »' }),
    )
    expect(screen.getByRole('button', { name: 'Masquer le tableau de « Tickets »' })).toBeTruthy()
    const table = screen.getByRole('table', { name: 'Tickets — chiffres' })
    for (const heading of subject.headings ?? []) {
      expect(table.textContent, heading).toContain(heading)
    }

    // A gap, announced in the host's words.
    if (subject.toGap !== undefined) {
      const plot = container.querySelector('[tabindex="0"]') as HTMLElement
      plot.focus()
      await userEvent.keyboard(subject.toGap)
      const live = container.querySelector('[aria-live="polite"]') as HTMLElement
      expect(live.textContent).toContain('Aucune mesure')
    }

    expect(english(container)).toEqual([])
  })

  it('in the empty state', () => {
    const { container } = render(subject.empty('Tickets'))
    expect(container.querySelector('[data-state="empty"]')).toBeTruthy()
    expect(container.textContent).toContain('Aucun relevé')
    expect(english(container)).toEqual([])
  })
})

/**
 * A quarter is the only date label `Intl` cannot format, so `format.ts` asks the
 * catalog (`ChartMessages.quarter`, whose doc explains why it is there and not
 * on `ValueFormat`). Neither check above can see `Q3`, because it has two
 * characters and `words` needs three. So these tests look for the label itself
 * on every surface that prints an x value (the axis, the twin's first column,
 * the live region), and through every way to get a quarterly axis: a series
 * chart's time scale, a band of dates, a scatter's time ticks, and a heatmap's
 * dated columns.
 */
const TRIMESTRES = [
  { trimestre: '2026-07-01', ouverts: 7, clos: 11 },
  { trimestre: '2026-10-01', ouverts: 12, clos: 9 },
  { trimestre: '2027-01-01', ouverts: 18, clos: 4 },
]
const GRILLE_TRIMESTRES = [
  { trimestre: '2026-07-01', heure: 'matin', appels: 12 },
  { trimestre: '2026-07-01', heure: 'soir', appels: 3 },
  { trimestre: '2026-10-01', heure: 'matin', appels: 4 },
  { trimestre: '2026-10-01', heure: 'soir', appels: 9 },
]
const QUARTERLY: ValueFormat = { style: 'date', granularity: 'quarter' }

interface QuarterSubject {
  name: string
  /** `undefined` stands for a host that passes no messages. */
  chart: (messages: ChartMessages | undefined) => ReactElement
}

const QUARTER_SUBJECTS: QuarterSubject[] = [
  {
    name: 'LineChart on a time scale',
    chart: (messages) => (
      <LineChart
        data={TRIMESTRES}
        series={DUO}
        x={{ key: 'trimestre', scale: 'time', format: QUARTERLY, label: 'Trimestre' }}
        label="Tickets"
        locale="fr-FR"
        messages={messages}
      />
    ),
  },
  {
    name: 'BarChart on a band of dates',
    chart: (messages) => (
      <BarChart
        data={TRIMESTRES}
        series={DUO}
        x={{ key: 'trimestre', format: QUARTERLY, label: 'Trimestre' }}
        label="Tickets"
        locale="fr-FR"
        messages={messages}
      />
    ),
  },
  {
    name: 'ScatterChart on a time scale',
    chart: (messages) => (
      <ScatterChart
        data={TRIMESTRES}
        series={[{ key: 'ouverts', label: 'Ouverts' }]}
        x={{ key: 'trimestre', scale: 'time', format: QUARTERLY, label: 'Trimestre' }}
        label="Tickets"
        locale="fr-FR"
        messages={messages}
      />
    ),
  },
  {
    name: 'Heatmap with dated columns',
    chart: (messages) => (
      <Heatmap
        data={GRILLE_TRIMESTRES}
        x={{ key: 'trimestre', format: QUARTERLY }}
        y={{ key: 'heure', label: 'Créneau' }}
        value={{ key: 'appels' }}
        label="Tickets"
        locale="fr-FR"
        messages={messages}
      />
    ),
  },
]

/** The quarter labels themselves, which `words` cannot see. */
const ENGLISH_QUARTER = /\bQ[1-4]\b/
const FRENCH_QUARTER = /\bT[1-4]\b/

describe.each(QUARTER_SUBJECTS)('a quarterly axis uses the host’s label: $name', (subject) => {
  it('shows T3, never Q3, to a French host', async () => {
    const { container } = render(subject.chart(FR))
    await userEvent.click(
      screen.getByRole('button', { name: 'Afficher le tableau de « Tickets »' }),
    )

    // Move the reading position to the first quarter, so the live region announces it too.
    const plot = container.querySelector('[tabindex="0"]') as HTMLElement
    plot.focus()
    await userEvent.keyboard('{ArrowRight}')
    const live = container.querySelector('[aria-live="polite"]') as HTMLElement
    expect(live.textContent).toContain('T3')

    const everything = heard(container)
    expect(everything).toContain('T3')
    expect(everything).not.toMatch(ENGLISH_QUARTER)
    expect(english(container)).toEqual([])
  })

  it('keeps Q3 for a host that passes no messages', async () => {
    const { container } = render(subject.chart(undefined))
    await userEvent.click(screen.getByRole('button', { name: 'Show the data table for Tickets' }))
    const everything = heard(container)
    expect(everything).toContain('Q3')
    expect(everything).not.toMatch(FRENCH_QUARTER)
  })
})

describe('a host that passes no messages gets the English defaults', () => {
  it('keeps every default, including each member’s own empty sentence', async () => {
    const { container } = render(
      <LineChart data={JOURS} series={DUO} x={{ key: 'jour' }} label="Tickets" onSelect={noop} />,
    )
    expect(container.textContent).toContain(
      'Tickets showing Ouverts and Clos, 3 points. The same data is available as a table. Enter or Space selects the current reading.',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Show the data table for Tickets' }))
    expect(screen.getByRole('table', { name: 'Tickets — data' })).toBeTruthy()
    cleanup()

    render(<LineChart data={[]} series={DUO} x={{ key: 'jour' }} label="Tickets" />)
    expect(screen.getByText('No data in this range')).toBeTruthy()
    cleanup()

    render(
      <Heatmap
        data={[]}
        x={{ key: 'jour' }}
        y={{ key: 'heure' }}
        value={{ key: 'appels' }}
        label="Appels"
      />,
    )
    expect(screen.getByText('No activity in this range')).toBeTruthy()
  })

  it('lets a host override one sentence for one chart', () => {
    // The catalog is shared across the tier, but a panel sometimes needs its own
    // empty sentence.
    render(
      <BarChart
        data={[]}
        series={DUO}
        x={{ key: 'jour' }}
        label="Tickets"
        messages={{ ...FR, empty: 'Aucun ticket cette semaine' }}
      />,
    )
    expect(screen.getByText('Aucun ticket cette semaine')).toBeTruthy()
  })
})
