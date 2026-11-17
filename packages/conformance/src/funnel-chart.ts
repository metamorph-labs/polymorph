import { getByRole } from '@testing-library/dom'
import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for what a FunnelChart draws and says (`design/components/funnel-chart.md`),
 * which every web shell's FunnelChart test calls with a mount of its own. The
 * chart tier has no contract fence, and the contract grammar reads one part's
 * role, name or attribute: it cannot state a bar's length against its value,
 * which text fits beside it, or what the live region says as the reader walks
 * the stages. This law reads those from the drawn chart, in every renderer.
 *
 * The law sets the width of the page's body to draw a chart at phone width,
 * and the document's direction to draw it right to left, and puts both back
 * after each test. It focuses the plot from a script, because Tab does not
 * stop on every element in WebKit.
 */

/** A stage as the law passes it, in the shape of the member's `FunnelStage`. */
export interface FunnelLawStage {
  key: string
  label: string
  value: number
}

/** The props the law mounts a FunnelChart with. A prop the law leaves out is not passed. */
export interface FunnelLawProps {
  stages: FunnelLawStage[]
  label: string
  size?: 'sm' | 'md' | 'lg'
  onSelect?: (selection: { index: number; key: string; label: string; value: number }) => void
}

export interface FunnelLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /** Mounts one FunnelChart with these props, and no other chart. */
  mount(props: FunnelLawProps): Promise<unknown>
}

/** Relay's tickets this month, the spec's first state. */
const LIFECYCLE: FunnelLawStage[] = [
  { key: 'opened', label: 'Opened', value: 1240 },
  { key: 'assigned', label: 'Assigned', value: 1180 },
  { key: 'replied', label: 'First reply', value: 1020 },
  { key: 'resolved', label: 'Resolved', value: 860 },
  { key: 'rated', label: 'Rated', value: 312 },
]

/** A stage that rises: drawn as given, against the largest. */
const RISING: FunnelLawStage[] = [
  { key: 'trial', label: 'Started a trial', value: 400 },
  { key: 'invited', label: 'Invited a teammate', value: 520 },
  { key: 'paid', label: 'Paid', value: 180 },
]

const TWELVE: FunnelLawStage[] = Array.from({ length: 12 }, (_, index) => ({
  key: `step-${index + 1}`,
  label: `Step ${index + 1}`,
  value: Math.round(9600 * 0.82 ** index),
}))

const LONG = 'Started the identity verification with a passport or a national card'

/** The one FunnelChart on the page. */
const figure = (): HTMLElement => {
  const element = document.querySelector<HTMLElement>('[data-member="funnel-chart"]')
  if (element === null) throw new Error('the FunnelChart rendered nothing')
  return element
}

const surface = () => figure().querySelector<HTMLElement>('[role="img"]') as HTMLElement
const live = () => figure().querySelector<HTMLElement>('[aria-live="polite"]') as HTMLElement
const bars = () => [...figure().querySelectorAll<SVGPathElement>('path[class*="bar"]')]
const hits = () => [...figure().querySelectorAll<SVGRectElement>('rect[class*="hit"]')]

/** The words the plot draws: the layer of HTML text over the marks. */
const words = (kind: 'label' | 'value' | 'step') => {
  const layer = surface().querySelector(':scope > div[aria-hidden="true"]')
  return [...(layer?.querySelectorAll<HTMLElement>(`span[class*="${kind}"]`) ?? [])]
}

/** The rows the reading position marks. */
const active = () => figure().querySelectorAll('g[data-active]')

/**
 * Waits until the plot is measured, every stage has its row, and the entrance
 * has ended. A bar grows from a zero scale, and an engine may report no box at
 * all for an element under a transform that cannot be inverted.
 */
async function drawn(count: number): Promise<void> {
  await vi.waitFor(() => expect(hits()).toHaveLength(count))
  await Promise.all(
    figure()
      .getAnimations({ subtree: true })
      .map((motion) => motion.finished),
  )
}

async function openTwin(label: string): Promise<HTMLTableElement> {
  await userEvent.click(getByRole(figure(), 'button', { name: /show the data table/i }))
  return (await vi.waitFor(() =>
    getByRole(figure(), 'table', { name: `${label} — data` }),
  )) as HTMLTableElement
}

const cells = (table: HTMLTableElement) =>
  [...table.querySelectorAll('tbody tr')].map((row) =>
    [...row.querySelectorAll('td, th')].map((cell) => cell.textContent?.trim() ?? ''),
  )

export function funnelChartLaw({ shell, mount }: FunnelLaw): void {
  describe(`FunnelChart — the ${shell} shell`, () => {
    beforeAll(installTestTheme)

    afterEach(() => {
      document.documentElement.removeAttribute('dir')
      document.body.style.removeProperty('inline-size')
    })

    it('is a named figure with a plot image, a summary and one row of the twin per stage', async () => {
      await mount({ stages: LIFECYCLE, label: 'Tickets' })
      await drawn(5)
      expect(figure().tagName).toBe('FIGURE')
      expect(figure().getAttribute('aria-label')).toBe('Tickets')
      expect(getByRole(figure(), 'img', { name: 'Tickets' })).toBe(surface())
      expect(figure().textContent).toContain(
        'Tickets, 5 stages. The same data is available as a table.',
      )
      // One series: no legend.
      expect(figure().querySelector('ul[data-key-shape]')).toBeNull()

      const table = await openTwin('Tickets')
      expect([...table.querySelectorAll('thead th')].map((cell) => cell.textContent)).toEqual([
        'Stage',
        'Value',
        'Share',
        'Continued',
      ])
      expect(cells(table)).toEqual([
        ['Opened', '1,240', '100%', '—'],
        ['Assigned', '1,180', '95.2%', '95.2%'],
        ['First reply', '1,020', '82.3%', '86.4%'],
        ['Resolved', '860', '69.4%', '84.3%'],
        ['Rated', '312', '25.2%', '36.3%'],
      ])
    })

    for (const [name, stages] of [
      ['stages that fall', LIFECYCLE],
      ['a stage that rises', RISING],
    ] as const) {
      it(`draws each bar from one start, its length its value against the largest stage, for ${name}`, async () => {
        await mount({ stages: [...stages], label: 'Lengths' })
        await drawn(stages.length)
        const boxes = bars().map((bar) => bar.getBBox())
        expect(boxes).toHaveLength(stages.length)
        const largest = Math.max(...stages.map((stage) => stage.value))
        const longest = Math.max(...boxes.map((box) => box.width))
        stages.forEach((stage, index) => {
          const box = boxes[index] as DOMRect
          expect(Math.abs(box.x - (boxes[0] as DOMRect).x)).toBeLessThanOrEqual(0.5)
          // Within a pixel of the value's share of the largest stage.
          expect(Math.abs(box.width - (stage.value / largest) * longest)).toBeLessThanOrEqual(1)
        })
      })
    }

    it('prints each label, value and share beside its bar, and the step rate between two bars', async () => {
      await mount({ stages: LIFECYCLE, label: 'Words' })
      await drawn(5)
      expect(words('label').map((word) => word.textContent)).toEqual(
        LIFECYCLE.map((stage) => stage.label),
      )
      expect(words('value').map((word) => word.textContent)).toEqual([
        '1,240 · 100%',
        '1,180 · 95.2%',
        '1,020 · 82.3%',
        '860 · 69.4%',
        '312 · 25.2%',
      ])
      const steps = words('step')
      expect(steps.map((word) => word.textContent)).toEqual([
        '95.2% continued',
        '86.4% continued',
        '84.3% continued',
        '36.3% continued',
      ])
      const rects = bars().map((bar) => bar.getBoundingClientRect())
      steps.forEach((step, index) => {
        const box = step.getBoundingClientRect()
        const middle = box.top + box.height / 2
        expect(middle).toBeGreaterThanOrEqual((rects[index] as DOMRect).bottom)
        expect(middle).toBeLessThanOrEqual((rects[index + 1] as DOMRect).top)
      })
      // Every word is whole: none is cut by its own box.
      for (const word of [...words('label'), ...words('value'), ...steps]) {
        expect(word.scrollWidth, word.textContent ?? '').toBeLessThanOrEqual(word.clientWidth + 1)
      }
      // A label sits in its column before the bars, and a value past its bar's end, inside the plot.
      const plot = surface().getBoundingClientRect()
      words('label').forEach((word, index) => {
        expect(word.getBoundingClientRect().right).toBeLessThanOrEqual(
          (rects[index] as DOMRect).left + 0.5,
        )
      })
      words('value').forEach((word, index) => {
        const box = word.getBoundingClientRect()
        expect(box.left).toBeGreaterThanOrEqual((rects[index] as DOMRect).right - 0.5)
        expect(box.right).toBeLessThanOrEqual(plot.right + 1)
      })
    })

    it('ends a label longer than its column in an ellipsis, before the bars start', async () => {
      document.body.style.setProperty('inline-size', '420px')
      await mount({
        stages: [
          { key: 'verify', label: LONG, value: 2048 },
          { key: 'approved', label: 'Approved', value: 1410 },
        ],
        label: 'Verification',
      })
      await drawn(2)
      const [long, short] = words('label') as [HTMLElement, HTMLElement]
      expect(long.textContent).toBe(LONG)
      expect(long.scrollWidth).toBeGreaterThan(long.clientWidth)
      expect(getComputedStyle(long).textOverflow).toBe('ellipsis')
      expect(short.scrollWidth).toBeLessThanOrEqual(short.clientWidth + 1)
      const start = Math.min(...bars().map((bar) => bar.getBoundingClientRect().left))
      expect(long.getBoundingClientRect().right).toBeLessThanOrEqual(start)
    })

    it('fits twelve stages at phone width: every label on its own line and every value in the plot', async () => {
      document.body.style.setProperty('inline-size', '343px')
      await mount({ stages: TWELVE, label: 'Twelve' })
      await drawn(12)
      const labels = words('label')
      expect(labels.map((word) => word.textContent)).toEqual(TWELVE.map((stage) => stage.label))
      const boxes = labels.map((word) => word.getBoundingClientRect())
      for (let index = 1; index < boxes.length; index += 1) {
        expect((boxes[index] as DOMRect).top).toBeGreaterThanOrEqual(
          (boxes[index - 1] as DOMRect).bottom - 1,
        )
      }
      // The rows are shorter than a line and a bar, so the steps are left to the tooltip and the twin.
      expect(words('step')).toEqual([])
      const plot = surface().getBoundingClientRect()
      for (const word of words('value')) {
        expect(word.getBoundingClientRect().right).toBeLessThanOrEqual(plot.right + 1)
      }
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
    })

    it('drops whole labels at an even stride when the rows are shorter than a line', async () => {
      await mount({ stages: TWELVE, size: 'sm', label: 'Small' })
      await drawn(12)
      const shown = words('label').map((word) => word.textContent)
      expect(shown.length).toBeLessThan(12)
      expect(shown[0]).toBe('Step 1')
      expect(shown.at(-1)).toBe('Step 12')
      expect(words('value')).toHaveLength(shown.length)
    })

    it('states no share and no step after a first stage of zero, and draws no bar for a zero', async () => {
      await mount({
        stages: [
          { key: 'invited', label: 'Invited', value: 0 },
          { key: 'joined', label: 'Joined', value: 0 },
        ],
        label: 'Invited',
      })
      await drawn(2)
      expect(bars()).toHaveLength(0)
      expect(figure().textContent).not.toMatch(/NaN|Infinity/)
      const table = await openTwin('Invited')
      expect(cells(table)).toEqual([
        ['Invited', '0', '—', '—'],
        ['Joined', '0', '—', '—'],
      ])
    })

    it('walks the stages with the arrow keys, Home and End, and says each one', async () => {
      await mount({ stages: LIFECYCLE, label: 'Keys' })
      await drawn(5)
      surface().focus()
      expect(live().textContent, 'a resting pointer had already set the position').toBe('')

      await userEvent.keyboard('{ArrowRight}')
      await vi.waitFor(() => expect(live().textContent).toBe('Opened: 1,240, 100%'))
      expect(active()).toHaveLength(1)
      await userEvent.keyboard('{ArrowRight}')
      await vi.waitFor(() =>
        expect(live().textContent).toBe('Assigned: 1,180, 95.2%, 95.2% continued'),
      )
      await userEvent.keyboard('{End}')
      await vi.waitFor(() => expect(live().textContent).toBe('Rated: 312, 25.2%, 36.3% continued'))
      await userEvent.keyboard('{Home}')
      await vi.waitFor(() => expect(live().textContent).toBe('Opened: 1,240, 100%'))
      await userEvent.keyboard('{Escape}')
      await vi.waitFor(() => expect(active()).toHaveLength(0))
    })

    it('reports the stage read on Enter and on a press, through onSelect', async () => {
      const onSelect = vi.fn()
      await mount({ stages: LIFECYCLE, label: 'Selectable', onSelect })
      await drawn(5)
      surface().focus()
      await userEvent.keyboard('{ArrowRight}{ArrowRight}{Enter}')
      await vi.waitFor(() =>
        expect(onSelect).toHaveBeenCalledWith({
          index: 1,
          key: 'assigned',
          label: 'Assigned',
          value: 1180,
        }),
      )
      onSelect.mockClear()
      await userEvent.click(hits()[3] as SVGRectElement)
      await vi.waitFor(() =>
        expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ key: 'resolved' })),
      )
    })

    it('shows the stage under the pointer, with its step as the tooltip’s header', async () => {
      await mount({ stages: LIFECYCLE, label: 'Pointer' })
      await drawn(5)
      await userEvent.hover(hits()[2] as SVGRectElement)
      const tooltip = await vi.waitFor(() => {
        const element = figure().querySelector<HTMLElement>('[class*="tooltip"]')
        expect(element).not.toBeNull()
        return element as HTMLElement
      })
      expect(tooltip.textContent).toContain('86.4% continued')
      expect(tooltip.textContent).toContain('1,020 · 82.3%')
      expect(tooltip.textContent).toContain('First reply')
      expect(active()).toHaveLength(1)
    })

    it('shows the empty sentence for no stages', async () => {
      await mount({ stages: [], label: 'Nothing' })
      await vi.waitFor(() => expect(figure().getAttribute('data-state')).toBe('empty'))
      expect(figure().textContent).toContain('No data yet')
      expect(bars()).toHaveLength(0)
    })

    it('starts the bars at the inline start in a right-to-left document', async () => {
      document.documentElement.setAttribute('dir', 'rtl')
      await mount({ stages: LIFECYCLE, label: 'Right to left' })
      await drawn(5)
      const rects = bars().map((bar) => bar.getBoundingClientRect())
      const labels = words('label').map((word) => word.getBoundingClientRect())
      const first = rects[0] as DOMRect
      for (const [index, rect] of rects.entries()) {
        expect(Math.abs(rect.right - first.right)).toBeLessThanOrEqual(0.5)
        // The label column is at the inline start, now on the right.
        expect((labels[index] as DOMRect).left).toBeGreaterThanOrEqual(rect.right - 0.5)
      }
      // The longest bar runs from the labels toward the inline end, the left.
      expect(first.left).toBeGreaterThan(surface().getBoundingClientRect().left)
      for (const [index, word] of words('value').entries()) {
        expect(word.getBoundingClientRect().right).toBeLessThanOrEqual(
          (rects[index] as DOMRect).left + 0.5,
        )
      }
    })
  })
}
