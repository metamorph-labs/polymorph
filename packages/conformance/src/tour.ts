import { getByRole } from '@testing-library/dom'
import { page, userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for what a Tour does that the contract grammar cannot state
 * (`design/components/tour.md`, A11y and Placement), which every web shell's
 * Tour test calls with a mount of its own. A contract statement reads one
 * part's role, name or attribute, or one gesture, from a fixture entry. This
 * law reads where focus goes when a step opens and when the tour ends, the
 * words a step says and how often, what each control reports, where the panel
 * and the cut-out are drawn, and the page around a modal step.
 *
 * The law focuses and presses buttons from a script and reads
 * `document.activeElement`, because Tab passes over buttons in WebKit.
 */

/** One step, as the law writes them. */
export interface TourLawStep {
  id: string
  target?: string
  title: string
  body: string
  side?: 'top' | 'right' | 'bottom' | 'left'
}

/** The props the law mounts a Tour with. A prop the law leaves out is not passed. */
export interface TourLawProps {
  steps: readonly TourLawStep[]
  defaultOpen?: boolean
  defaultStep?: number
  onEnd?: (reason: 'finished' | 'dismissed') => void
  onStepChange?: (index: number) => void
}

/**
 * The page every mount draws: a row of three `Tour.Target`s, by these names,
 * each around one Button with this label.
 */
export const TOUR_LAW_TARGETS: readonly { name: string; label: string }[] = [
  { name: 'create', label: 'New ticket' },
  { name: 'filter', label: 'Filter' },
  { name: 'export', label: 'Export' },
]

export interface TourLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /**
   * Mounts the page of `TOUR_LAW_TARGETS` and one Tour with these props, and no
   * other Tour.
   */
  mount(props: TourLawProps): Promise<unknown>
}

const STEPS: readonly TourLawStep[] = [
  {
    id: 'create',
    target: 'create',
    title: 'Create a ticket',
    body: 'Start here to log a new request.',
  },
  {
    id: 'filter',
    target: 'filter',
    title: 'Narrow the list',
    body: 'Filter tickets by status, owner or tag.',
  },
  {
    id: 'export',
    target: 'export',
    title: 'Take the list with you',
    body: 'Export the tickets you see as a file.',
  },
]

/** The one Tour panel on the page, or `null` when none is open. */
const panelOrNull = () => document.querySelector<HTMLElement>('[data-member="tour"]')

const panel = (): HTMLElement => {
  const found = panelOrNull()
  if (found === null) throw new Error('no Tour panel is open')
  return found
}

/** The panel once a step is open, with its title drawn. */
async function opened(title: string): Promise<HTMLElement> {
  await vi.waitFor(() => expect(panel().textContent).toContain(title))
  return panel()
}

const squash = (text: string) => text.replace(/\s+/g, ' ').trim()

/** The text of the elements an `aria-*by` attribute names, in order. */
function referenced(element: Element, attribute: string): string {
  const ids = (element.getAttribute(attribute) ?? '').split(/\s+/).filter(Boolean)
  return squash(ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' '))
}

/** A Button in the panel, by its accessible name. */
const control = (name: string): HTMLButtonElement =>
  getByRole<HTMLButtonElement>(panel(), 'button', { name })

/** The actions row's Buttons, by their names, in order. */
const actions = (): string[] =>
  [...panel().querySelectorAll('[data-tour-part="actions"] button')].map((button) =>
    squash(button.textContent ?? ''),
  )

/** A target's drawn rectangle: its Button's. */
function targetRect(name: string): DOMRect {
  const target = document.querySelector(`[data-tour-target="${name}"]`)
  const button = target?.querySelector('button')
  if (!button) throw new Error(`no target "${name}" with a button`)
  return button.getBoundingClientRect()
}

/** The element the panel is placed by, which says where it was drawn. */
const positioner = (): HTMLElement => {
  const found = panel().closest<HTMLElement>('[data-placement]')
  if (found === null) throw new Error('the panel has no positioner with data-placement')
  return found
}

const scrim = (): HTMLElement => {
  const found = document.querySelector<HTMLElement>('[data-tour-part="scrim"]')
  if (found === null) throw new Error('the Tour draws no scrim')
  return found
}

/** Whether a rectangle lies inside the window, to the pixel. */
const insideWindow = (rect: DOMRect) =>
  rect.left >= -0.5 &&
  rect.top >= -0.5 &&
  rect.right <= document.documentElement.clientWidth + 0.5 &&
  rect.bottom <= document.documentElement.clientHeight + 0.5

/** A button outside the tour, focused before it opens. */
let before: HTMLButtonElement | null = null
/** Space above the page, which puts the targets below the window. */
let spacer: HTMLElement | null = null
/** A button just after `before`, which focus goes to when `before` has left the page. */
let beside: HTMLButtonElement | null = null

function focusBefore(): HTMLButtonElement {
  before = document.createElement('button')
  before.type = 'button'
  before.textContent = 'Before the tour'
  document.body.prepend(before)
  before.focus()
  return before
}

export function tourLaw({ shell, mount }: TourLaw): void {
  describe(`Tour in ${shell}: the shared law`, () => {
    beforeAll(installTestTheme)

    afterEach(() => {
      before?.remove()
      before = null
      beside?.remove()
      beside = null
      spacer?.remove()
      spacer = null
      document.documentElement.removeAttribute('dir')
    })

    it('opens a step as a modal dialog named by its title and described by its body and position', async () => {
      await mount({ steps: STEPS, defaultOpen: true })
      const step = await opened('Create a ticket')

      expect(step.getAttribute('role')).toBe('dialog')
      expect(step.getAttribute('aria-modal')).toBe('true')
      expect(referenced(step, 'aria-labelledby')).toBe('Create a ticket')
      // The description as assistive technology computes it, a space between its paragraphs.
      expect(
        getByRole(document.body, 'dialog', {
          name: 'Create a ticket',
          description: 'Start here to log a new request. Step 1 of 3',
        }),
      ).toBe(step)
    })

    it('says the position once, in the description and in no live region', async () => {
      await mount({ steps: STEPS, defaultOpen: true, defaultStep: 1 })
      const step = await opened('Narrow the list')

      const saying = [...step.querySelectorAll('*')].filter(
        (element) =>
          element.children.length === 0 && squash(element.textContent ?? '') === 'Step 2 of 3',
      )
      expect(saying).toHaveLength(1)
      for (const region of step.querySelectorAll('[aria-live], [role="status"], [role="log"]')) {
        expect(region.textContent ?? '').not.toContain('Step 2 of 3')
      }
      expect(step.hasAttribute('aria-live')).toBe(false)
    })

    it('moves focus to the panel when the tour opens, and again when a step changes', async () => {
      focusBefore()
      await mount({ steps: STEPS, defaultOpen: true })
      const step = await opened('Create a ticket')
      await vi.waitFor(() => expect(document.activeElement).toBe(step))

      control('Next').click()
      await opened('Narrow the list')
      await vi.waitFor(() => expect(document.activeElement).toBe(panel()))
    })

    it('draws no Previous on the first step, and moves and reports once per press', async () => {
      const onStepChange = vi.fn()
      await mount({ steps: STEPS, defaultOpen: true, onStepChange })
      await opened('Create a ticket')
      expect(actions()).toEqual(['Next'])

      control('Next').click()
      await opened('Narrow the list')
      expect(onStepChange).toHaveBeenCalledTimes(1)
      expect(onStepChange).toHaveBeenLastCalledWith(1)
      expect(actions()).toEqual(['Previous', 'Next'])

      control('Previous').click()
      await opened('Create a ticket')
      expect(onStepChange).toHaveBeenCalledTimes(2)
      expect(onStepChange).toHaveBeenLastCalledWith(0)
    })

    it('ends the tour from the last step’s Done and reports it finished, once', async () => {
      const onEnd = vi.fn()
      await mount({ steps: STEPS, defaultOpen: true, defaultStep: 2, onEnd })
      await opened('Take the list with you')
      expect(actions()).toEqual(['Previous', 'Done'])

      control('Done').click()
      await vi.waitFor(() => expect(panelOrNull()).toBeNull())
      expect(onEnd).toHaveBeenCalledTimes(1)
      expect(onEnd).toHaveBeenCalledWith('finished')
    })

    it('ends the tour on Escape from inside the panel and reports it dismissed, once', async () => {
      const onEnd = vi.fn()
      await mount({ steps: STEPS, defaultOpen: true, defaultStep: 1, onEnd })
      await opened('Narrow the list')
      const next = control('Next')
      next.focus()
      await vi.waitFor(() => expect(document.activeElement).toBe(next))

      await userEvent.keyboard('{Escape}')
      await vi.waitFor(() => expect(panelOrNull()).toBeNull())
      expect(onEnd).toHaveBeenCalledTimes(1)
      expect(onEnd).toHaveBeenCalledWith('dismissed')
    })

    it('ends the tour from the close control on any step and reports it dismissed, once', async () => {
      const onEnd = vi.fn()
      await mount({ steps: STEPS, defaultOpen: true, defaultStep: 2, onEnd })
      await opened('Take the list with you')

      control('Close').click()
      await vi.waitFor(() => expect(panelOrNull()).toBeNull())
      expect(onEnd).toHaveBeenCalledTimes(1)
      expect(onEnd).toHaveBeenCalledWith('dismissed')
    })

    it('returns focus to where it was when the tour opened', async () => {
      const outside = focusBefore()
      await mount({ steps: STEPS, defaultOpen: true })
      await opened('Create a ticket')
      await vi.waitFor(() => expect(document.activeElement).toBe(panel()))

      await userEvent.keyboard('{Escape}')
      await vi.waitFor(() => expect(panelOrNull()).toBeNull())
      await vi.waitFor(() => expect(document.activeElement).toBe(outside))
    })

    it('returns focus to the element nearest where it was when that element has left the page', async () => {
      const outside = focusBefore()
      beside = document.createElement('button')
      beside.type = 'button'
      beside.textContent = 'Beside the tour'
      outside.after(beside)
      await mount({ steps: STEPS, defaultOpen: true })
      await opened('Create a ticket')
      await vi.waitFor(() => expect(document.activeElement).toBe(panel()))

      outside.remove()
      await userEvent.keyboard('{Escape}')
      await vi.waitFor(() => expect(panelOrNull()).toBeNull())
      await vi.waitFor(() => expect(document.activeElement).toBe(beside))
    })

    it('keeps the page out of reach while a step is open, and a press on it ends nothing', async () => {
      const onEnd = vi.fn()
      const outside = focusBefore()
      await mount({ steps: STEPS, defaultOpen: true, onEnd })
      const step = await opened('Create a ticket')

      // The page is hidden from assistive technology and takes no presses.
      const target = document.querySelector('[data-tour-target="create"] button')
      await vi.waitFor(() => expect(target?.closest('[aria-hidden="true"]')).not.toBeNull())
      await vi.waitFor(() => expect(getComputedStyle(document.body).pointerEvents).toBe('none'))

      // Focus sent to the page comes back into the panel.
      outside.focus()
      await vi.waitFor(() => expect(step.contains(document.activeElement)).toBe(true))

      // A press on the page, as a reader makes one, leaves the tour open.
      const init = { bubbles: true, cancelable: true, composed: true, clientX: 2, clientY: 2 }
      document.documentElement.dispatchEvent(
        new PointerEvent('pointerdown', { ...init, pointerType: 'mouse', isPrimary: true }),
      )
      document.documentElement.dispatchEvent(new MouseEvent('mousedown', init))
      document.documentElement.dispatchEvent(
        new PointerEvent('pointerup', { ...init, pointerType: 'mouse', isPrimary: true }),
      )
      document.documentElement.dispatchEvent(new MouseEvent('click', init))
      await new Promise((resolve) => setTimeout(resolve, 300))
      expect(panelOrNull()).not.toBeNull()
      expect(onEnd).not.toHaveBeenCalled()
    })

    it('draws the panel beside its target and cuts the target out of the scrim', async () => {
      await mount({ steps: STEPS, defaultOpen: true, defaultStep: 1 })
      await opened('Narrow the list')

      await vi.waitFor(() => expect(positioner().getAttribute('data-placement')).toBe('bottom'))
      const target = targetRect('filter')
      const box = panel().getBoundingClientRect()
      expect(box.top).toBeGreaterThanOrEqual(target.bottom)
      expect(box.left).toBeLessThan(target.right)
      expect(box.right).toBeGreaterThan(target.left)

      const hole = scrim().getBoundingClientRect()
      expect(hole.left).toBeLessThanOrEqual(target.left)
      expect(hole.top).toBeLessThanOrEqual(target.top)
      expect(hole.right).toBeGreaterThanOrEqual(target.right)
      expect(hole.bottom).toBeGreaterThanOrEqual(target.bottom)
    })

    it('draws a step with no target, and one whose target is not drawn, centred', async () => {
      await mount({
        steps: [
          { id: 'welcome', title: 'Welcome to the queue', body: 'Three things to know.' },
          { id: 'assign', target: 'assign', title: 'Assign it', body: 'From its own page.' },
        ],
        defaultOpen: true,
      })

      for (const title of ['Welcome to the queue', 'Assign it']) {
        await opened(title)
        await vi.waitFor(() => expect(positioner().getAttribute('data-placement')).toBe('center'))
        const width = document.documentElement.clientWidth
        const height = document.documentElement.clientHeight
        await vi.waitFor(() => {
          const box = positioner().getBoundingClientRect()
          expect(Math.abs(box.left - (width - box.width) / 2)).toBeLessThan(2)
          expect(Math.abs(box.top - (height - box.height) / 2)).toBeLessThan(2)
        })
        // The whole window is dimmed: there is no cut-out.
        const dim = scrim().getBoundingClientRect()
        expect(dim.width).toBeGreaterThanOrEqual(width - 1)
        expect(dim.height).toBeGreaterThanOrEqual(height - 1)
        if (title === 'Welcome to the queue') control('Next').click()
      }
    })

    it('scrolls a target that starts below the window into view when its step opens', async () => {
      spacer = document.createElement('div')
      spacer.style.blockSize = '250vh'
      document.body.prepend(spacer)
      window.scrollTo(0, 0)

      await mount({ steps: STEPS, defaultOpen: true, defaultStep: 2 })
      await opened('Take the list with you')
      await vi.waitFor(() => expect(insideWindow(targetRect('export'))).toBe(true))
      await vi.waitFor(() => expect(positioner().getAttribute('data-placement')).not.toBe('center'))
      expect(insideWindow(panel().getBoundingClientRect())).toBe(true)
      window.scrollTo(0, 0)
    })

    it('keeps the panel inside the window at phone width, on every side, short or long', async () => {
      const width = window.innerWidth
      const height = window.innerHeight
      await page.viewport(360, 640)
      // A short body gives a panel narrower than the window, placed beside the target; a long one
      // gives a panel as wide as the window allows.
      const long = 'Filter tickets by status, owner or tag, and keep the filter for later. '
      try {
        for (const body of [undefined, long.repeat(3)]) {
          for (const side of ['top', 'right', 'bottom', 'left'] as const) {
            await mount({
              steps: STEPS.map((step) => ({ ...step, side, ...(body ? { body } : {}) })),
              defaultOpen: true,
              defaultStep: 2,
            })
            await opened('Take the list with you')
            await vi.waitFor(() =>
              expect(positioner().style.getPropertyValue('--pm-tour-x')).not.toBe(''),
            )
            await new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            )
            expect(
              insideWindow(panel().getBoundingClientRect()),
              `${side}, ${body ? 'long' : 'short'}`,
            ).toBe(true)
            await userEvent.keyboard('{Escape}')
            await vi.waitFor(() => expect(panelOrNull()).toBeNull())
          }
        }
      } finally {
        await page.viewport(width, height)
      }
    })

    it('keeps a wider panel inside the window when a step after a narrow one opens near its edge', async () => {
      const width = window.innerWidth
      const height = window.innerHeight
      await page.viewport(360, 640)
      try {
        // The first panel is narrow, so it is placed far along the row. The next is wider, and
        // the box the engine measures there must be its whole box, wherever the last one stood.
        await mount({
          steps: [
            { id: 'one', target: 'export', title: 'Export', body: 'A file.' },
            {
              id: 'two',
              target: 'export',
              title: 'Take the list with you',
              body: 'Export the tickets you see as a file.',
            },
          ],
          defaultOpen: true,
        })
        await opened('A file.')
        control('Next').click()
        await opened('Take the list with you')
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        const box = panel().getBoundingClientRect()
        const placed = positioner().getBoundingClientRect()
        expect(box.right).toBeLessThanOrEqual(placed.right + 0.5)
        expect(insideWindow(box)).toBe(true)
      } finally {
        await page.viewport(width, height)
      }
    })

    it('keeps the panel beside its target and inside the window in a right-to-left page', async () => {
      document.documentElement.setAttribute('dir', 'rtl')
      await mount({ steps: STEPS, defaultOpen: true })
      await opened('Create a ticket')

      await vi.waitFor(() => expect(positioner().getAttribute('data-placement')).toBe('bottom'))
      const target = targetRect('create')
      const box = panel().getBoundingClientRect()
      expect(box.top).toBeGreaterThanOrEqual(target.bottom)
      expect(insideWindow(box)).toBe(true)
    })
  })
}
