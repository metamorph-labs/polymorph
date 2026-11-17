import { page } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for how a Dialog fits a window that is shorter than its content
 * (`design/components/dialog.md`, Dimensions and the sheet below `30rem`),
 * which every web shell's Dialog test calls with a mount of its own. A
 * contract statement reads one part's role, name or attribute. This law reads
 * boxes: the panel's against the window, the title's and the footer's against
 * the panel, and whether the body is the part that scrolls.
 *
 * The law sets the viewport, mounts the dialog open (`defaultOpen`) with no
 * trigger, and waits for the panel's entrance to end before it measures,
 * because a panel that is still scaling or sliding in has a different box from
 * the one it rests at.
 */

export interface DialogFitLawMount {
  readonly title: string
  /** Passed only when it is not `undefined`. */
  readonly description: string | undefined
  readonly size: 'sm' | 'md' | 'lg'
  readonly presentation: 'auto' | 'sheet'
  /** The body: one `<p>` for each string, in order. */
  readonly paragraphs: readonly string[]
  /** The footer: one Button with this label, or no footer when it is `undefined`. */
  readonly footer: string | undefined
}

export interface DialogFitLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /** Mounts one Dialog, open from its first render (`defaultOpen`), with no trigger. */
  mount(options: DialogFitLawMount): Promise<unknown>
}

/** A phone held upright, shorter than a long body. */
const PHONE = { width: 375, height: 600 }
/** A laptop window with little height left for the page. */
const SHORT_DESKTOP = { width: 1280, height: 500 }
/** The browser projects' own viewport (`vitest.config.ts`), restored after each test. */
const DESKTOP = { width: 1280, height: 800 }

const SENTENCE =
  'A body long enough to scroll keeps its title and its actions in place, so the reader can still close the dialog or act on it.'

/** A body many windows long. */
const LONG_BODY = Array.from({ length: 60 }, (_, at) => `Paragraph ${at + 1}. ${SENTENCE}`)
const SHORT_BODY = ['One short paragraph.']
const LONG_DESCRIPTION = Array.from({ length: 30 }, () => SENTENCE).join(' ')

/** Half a pixel, for a box whose edge falls on a fraction. */
const EPSILON = 0.5

const panel = (): HTMLElement => {
  const element = document.querySelector<HTMLElement>('[role="dialog"], [role="alertdialog"]')
  if (element === null) throw new Error('no Dialog is open')
  return element
}

const part = (name: 'body' | 'footer' | 'close'): HTMLElement => {
  const element = panel().querySelector<HTMLElement>(`[data-dialog-part="${name}"]`)
  if (element === null) throw new Error(`the Dialog draws no ${name}`)
  return element
}

const title = (): HTMLElement => {
  const element = panel().querySelector<HTMLElement>('h2')
  if (element === null) throw new Error('the Dialog draws no title')
  return element
}

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))

/** The panel once its entrance has ended: its box the same on two frames in a row. */
async function settled(): Promise<DOMRect> {
  return vi.waitFor(async () => {
    const before = panel().getBoundingClientRect()
    await frame()
    await frame()
    const after = panel().getBoundingClientRect()
    expect(after.toJSON(), 'the panel is still moving').toEqual(before.toJSON())
    const style = getComputedStyle(panel())
    expect(style.transform === 'none' || style.transform === 'matrix(1, 0, 0, 1, 0, 0)').toBe(true)
    expect(style.scale === 'none' || style.scale === '1').toBe(true)
    expect(style.translate === 'none' || /^0px( 0px)?$/.test(style.translate)).toBe(true)
    return after
  })
}

/** `inner` lies inside `outer`, to half a pixel. */
function within(
  inner: DOMRect,
  outer: { top: number; left: number; bottom: number; right: number },
  what: string,
) {
  expect(inner.top, `${what}: top`).toBeGreaterThanOrEqual(outer.top - EPSILON)
  expect(inner.left, `${what}: left`).toBeGreaterThanOrEqual(outer.left - EPSILON)
  expect(inner.bottom, `${what}: bottom`).toBeLessThanOrEqual(outer.bottom + EPSILON)
  expect(inner.right, `${what}: right`).toBeLessThanOrEqual(outer.right + EPSILON)
}

const windowBox = () => ({ top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth })

export function dialogFitLaw({ shell, mount }: DialogFitLaw): void {
  describe(`${shell} Dialog — the panel fits the window and the body scrolls`, () => {
    beforeAll(installTestTheme)

    afterEach(async () => {
      await page.viewport(DESKTOP.width, DESKTOP.height)
    })

    async function open(
      viewport: { width: number; height: number },
      options: Partial<DialogFitLawMount> = {},
    ) {
      await page.viewport(viewport.width, viewport.height)
      await mount({
        title: 'Terms of the trial',
        description: undefined,
        size: 'md',
        presentation: 'auto',
        paragraphs: LONG_BODY,
        footer: 'Accept',
        ...options,
      })
      await vi.waitFor(() => panel())
      return settled()
    }

    /** What every case holds: the panel inside the window, its title and footer inside it. */
    function fits(box: DOMRect, { footer }: { footer: boolean }) {
      within(box, windowBox(), 'the panel')
      within(title().getBoundingClientRect(), box, 'the title')
      within(part('close').getBoundingClientRect(), box, 'the close button')
      if (footer) within(part('footer').getBoundingClientRect(), box, 'the footer')
      // Nothing spills out of the panel, so nothing but the body moves when it scrolls.
      expect(panel().scrollHeight, 'the panel overflows').toBeLessThanOrEqual(
        panel().clientHeight + 1,
      )
    }

    /**
     * A description taller than the window. The description does not shrink, so
     * the body cannot make room for it. The panel scrolls instead: it stays
     * inside the window, scrolling it to its start brings the title into view,
     * and scrolling it to its end brings the footer into view. The law sets
     * both ends, because where the panel rests after it opens depends on
     * whether the shell scrolls the control it focuses into view.
     */
    async function descriptionInReach(
      viewport: { width: number; height: number },
      presentation: DialogFitLawMount['presentation'],
    ) {
      const box = await open(viewport, {
        presentation,
        description: LONG_DESCRIPTION,
        paragraphs: SHORT_BODY,
      })
      within(box, windowBox(), 'the panel')
      const scroller = panel()
      expect(scroller.scrollHeight, 'the panel does not scroll').toBeGreaterThan(
        scroller.clientHeight,
      )
      scroller.scrollTop = 0
      await vi.waitFor(() => within(title().getBoundingClientRect(), box, 'the title, scrolled to'))
      scroller.scrollTop = scroller.scrollHeight
      await vi.waitFor(() =>
        within(part('footer').getBoundingClientRect(), box, 'the footer, scrolled to'),
      )
    }

    function bodyScrolls() {
      const body = part('body')
      expect(getComputedStyle(body).overflowY).toBe('auto')
      expect(body.scrollHeight, 'the body does not scroll').toBeGreaterThan(body.clientHeight)
    }

    for (const presentation of ['auto', 'sheet'] as const) {
      for (const size of ['sm', 'md', 'lg'] as const) {
        it(`keeps a ${size} ${presentation} dialog with a long body inside a phone, and scrolls the body`, async () => {
          const box = await open(PHONE, { presentation, size })
          fits(box, { footer: true })
          bodyScrolls()
        })
      }

      it(`keeps a ${presentation} dialog with a long body and no footer inside a phone`, async () => {
        const box = await open(PHONE, { presentation, footer: undefined })
        fits(box, { footer: false })
        bodyScrolls()
      })

      it(`keeps a ${presentation} dialog with a long description inside a phone, with its footer in reach`, async () => {
        await descriptionInReach(PHONE, presentation)
      })
    }

    for (const size of ['sm', 'md', 'lg'] as const) {
      it(`keeps a ${size} dialog with a long body inside a short desktop window`, async () => {
        const box = await open(SHORT_DESKTOP, { size })
        fits(box, { footer: true })
        bodyScrolls()
      })
    }

    it('keeps a dialog with a long description inside a short desktop window, with its footer in reach', async () => {
      await descriptionInReach(SHORT_DESKTOP, 'auto')
    })
  })
}
