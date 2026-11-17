import { getAllByRole, getByRole, queryByRole } from '@testing-library/dom'
import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for what a Rating is, what a press and a key do to it, and how it
 * draws its marks (`design/components/rating.md`), which every web shell's
 * Rating test calls with a mount of its own. A contract statement reads one
 * part from a fixture entry in a left-to-right document. This law reads what
 * the grammar cannot state: the clear rule, a report made once, the ends of
 * the row, the arrows in a right-to-left document, the posted value, and a
 * mark's drawing.
 *
 * A mark's drawing is read from its shape, not its colour. Each mark holds two
 * glyphs: the outline, and a filled copy over it inside a box cut to the share
 * the value covers. A filled mark paints its copy, an empty one hides it.
 *
 * The law focuses a mark from a script and reads `document.activeElement`,
 * because Tab passes over buttons in WebKit. It waits for each reading,
 * because a shell commits a change a moment after the event.
 */

/** The props the law mounts a Rating with, by their React names. */
export interface RatingLawProps {
  label: string
  value?: number | null
  defaultValue?: number | null
  max?: number
  readOnly?: boolean
  disabled?: boolean
  name?: string
  'aria-required'?: boolean
  onChange?: (value: number | null) => void
}

export interface RatingLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /** Mounts one Rating with these props, and no other Rating. A prop the law leaves out is not passed. */
  mount(props: RatingLawProps): Promise<unknown>
}

/** The one Rating on the page. */
const root = (): HTMLElement => {
  const element = document.querySelector<HTMLElement>('[data-member="rating"]')
  if (element === null) throw new Error('the Rating rendered nothing')
  return element
}

/** The marks in document order: a control's radios, or a shown rating's spans. */
const marks = (): HTMLElement[] =>
  [...root().children].filter(
    (child): child is HTMLElement => child instanceof HTMLElement && child.tagName !== 'INPUT',
  )

const radio = (name: string) => getByRole(root(), 'radio', { name })

const fills = () => marks().map((mark) => mark.getAttribute('data-fill'))

const checked = () =>
  getAllByRole(root(), 'radio')
    .filter((element) => element.getAttribute('aria-checked') === 'true')
    .map((element) => element.getAttribute('aria-label'))

/**
 * A mark's two glyphs and the box that cuts the filled one: the child of the
 * mark's drawing that holds the filled glyph. It is found by what it holds,
 * because a shell may wrap each glyph in an element of its own (Angular's
 * `pm-icon`).
 */
function drawing(mark: HTMLElement) {
  const [outline, filled] = [...mark.querySelectorAll('svg')]
  const cut = [...(mark.firstElementChild?.children ?? [])].find(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && filled !== undefined && child.contains(filled),
  )
  if (outline === undefined || filled === undefined || cut === undefined) {
    throw new Error('a mark draws an outline and, in a box of its own, a filled copy')
  }
  return { outline, filled, cut }
}

/** Whether a mark paints its filled copy: the copy's box shows and its glyph is filled. */
function painted(mark: HTMLElement): boolean {
  const { filled, cut } = drawing(mark)
  return getComputedStyle(cut).visibility !== 'hidden' && getComputedStyle(filled).fill !== 'none'
}

const STARS = ['1 star', '2 stars', '3 stars', '4 stars', '5 stars']

export function ratingLaw({ shell, mount }: RatingLaw): void {
  describe(`${shell} Rating — what it is, what a press and a key do, and how it draws`, () => {
    beforeAll(installTestTheme)

    afterEach(() => {
      document.documentElement.removeAttribute('dir')
    })

    async function control(props: Partial<RatingLawProps> = {}) {
      const onChange = vi.fn<(value: number | null) => void>()
      await mount({ label: 'Rate this answer', onChange, ...props })
      await vi.waitFor(() => expect(marks()).toHaveLength(props.max ?? 5))
      return onChange
    }

    async function focus(element: HTMLElement) {
      element.focus()
      await vi.waitFor(() => expect(document.activeElement).toBe(element))
    }

    /* ---------------------------------------------------------------------- */
    /* What it is                                                             */
    /* ---------------------------------------------------------------------- */

    it('is a radio group named by its label, with one radio per mark named for its value', async () => {
      await control()
      expect(getByRole(document.body, 'radiogroup', { name: 'Rate this answer' })).toBe(root())
      expect(
        getAllByRole(root(), 'radio').map((element) => element.getAttribute('aria-label')),
      ).toEqual(STARS)
      expect(checked()).toEqual([])
      // One tab stop, on the first mark while nothing is chosen.
      expect(marks().map((mark) => mark.getAttribute('tabindex'))).toEqual([
        '0',
        '-1',
        '-1',
        '-1',
        '-1',
      ])
    })

    it('draws the marks up to the chosen one filled, and tells them apart by shape', async () => {
      await control({ defaultValue: 3 })
      expect(checked()).toEqual(['3 stars'])
      expect(fills()).toEqual(['full', 'full', 'full', 'none', 'none'])
      expect(marks().map(painted)).toEqual([true, true, true, false, false])
      // The outline is never filled, so an empty mark is an outline and a filled one is solid.
      for (const mark of marks()) expect(getComputedStyle(drawing(mark).outline).fill).toBe('none')
      // The tab stop is the chosen mark.
      expect(radio('3 stars').getAttribute('tabindex')).toBe('0')
    })

    /* ---------------------------------------------------------------------- */
    /* A press                                                                */
    /* ---------------------------------------------------------------------- */

    it('chooses the pressed mark, and reports it once', async () => {
      const onChange = await control()
      await userEvent.click(radio('4 stars'))
      await vi.waitFor(() => expect(checked()).toEqual(['4 stars']))
      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenCalledWith(4)
      expect(fills()).toEqual(['full', 'full', 'full', 'full', 'none'])
    })

    it('clears the rating when the chosen mark is pressed again, and reports null once', async () => {
      const onChange = await control({ defaultValue: 3 })
      await userEvent.click(radio('3 stars'))
      await vi.waitFor(() => expect(checked()).toEqual([]))
      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenCalledWith(null)
      expect(fills()).toEqual(['none', 'none', 'none', 'none', 'none'])
      // With nothing chosen, the tab stop is the first mark again.
      expect(marks()[0]?.getAttribute('tabindex')).toBe('0')
    })

    it('clears with Space on the chosen mark, the press a pointer makes', async () => {
      const onChange = await control({ defaultValue: 2 })
      await focus(radio('2 stars'))
      await userEvent.keyboard(' ')
      await vi.waitFor(() => expect(checked()).toEqual([]))
      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenCalledWith(null)
    })

    it('keeps a required rating’s mark when it is pressed again, and reports nothing', async () => {
      const onChange = await control({ defaultValue: 3, 'aria-required': true })
      expect(root().getAttribute('aria-required')).toBe('true')
      await userEvent.click(radio('3 stars'))
      // A beat for a report that should not come.
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(onChange).not.toHaveBeenCalled()
      expect(checked()).toEqual(['3 stars'])
    })

    /* ---------------------------------------------------------------------- */
    /* The keys                                                               */
    /* ---------------------------------------------------------------------- */

    it('moves and chooses with the arrows, Home and End, and stops at each end', async () => {
      const onChange = await control({ defaultValue: 1 })
      await focus(radio('1 star'))

      // Each key and the mark it leaves focused and chosen. A key at an end leaves both.
      const steps: [string, string][] = [
        ['ArrowRight', '2 stars'],
        ['ArrowDown', '3 stars'],
        ['End', '5 stars'],
        ['ArrowRight', '5 stars'],
        ['ArrowDown', '5 stars'],
        ['ArrowLeft', '4 stars'],
        ['ArrowUp', '3 stars'],
        ['Home', '1 star'],
        ['ArrowLeft', '1 star'],
        ['ArrowUp', '1 star'],
      ]
      for (const [key, mark] of steps) {
        await userEvent.keyboard(`{${key}}`)
        await vi.waitFor(() => {
          expect(document.activeElement).toBe(radio(mark))
          expect(checked()).toEqual([mark])
        })
      }
      // One report for each change: 2, 3, 5, 4, 3, 1. The presses at an end changed nothing.
      expect(onChange.mock.calls.map(([value]) => value)).toEqual([2, 3, 5, 4, 3, 1])
    })

    it('starts the row at the right in a right-to-left document, where the arrow that points left moves on', async () => {
      document.documentElement.setAttribute('dir', 'rtl')
      const onChange = await control({ defaultValue: 2 })
      const [first, second] = marks() as [HTMLElement, HTMLElement]
      expect(first.getBoundingClientRect().left).toBeGreaterThan(
        second.getBoundingClientRect().left,
      )

      await focus(radio('2 stars'))
      await userEvent.keyboard('{ArrowLeft}')
      await vi.waitFor(() => {
        expect(document.activeElement).toBe(radio('3 stars'))
        expect(checked()).toEqual(['3 stars'])
      })
      await userEvent.keyboard('{ArrowRight}')
      await vi.waitFor(() => expect(checked()).toEqual(['2 stars']))
      // Down and Up do not depend on the direction.
      await userEvent.keyboard('{ArrowDown}')
      await vi.waitFor(() => expect(checked()).toEqual(['3 stars']))
      expect(onChange.mock.calls.map(([value]) => value)).toEqual([3, 2, 3])
    })

    it('does nothing on Enter', async () => {
      const onChange = await control()
      await focus(radio('2 stars'))
      await userEvent.keyboard('{Enter}')
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(onChange).not.toHaveBeenCalled()
      expect(checked()).toEqual([])
    })

    /* ---------------------------------------------------------------------- */
    /* Disabled, and the form                                                 */
    /* ---------------------------------------------------------------------- */

    it('disables every mark when disabled, so none takes focus or a press', async () => {
      // Read from the attributes: a disabled button takes no click, so a click would only
      // show that the driver waits.
      await control({ defaultValue: 2, disabled: true, name: 'rating' })
      expect(root().getAttribute('data-disabled')).toBe('')
      for (const mark of getAllByRole(root(), 'radio')) {
        expect(mark).toHaveProperty('disabled', true)
      }
      expect(checked()).toEqual(['2 stars'])
      // A disabled field posts nothing.
      expect(root().querySelector<HTMLInputElement>('input[name="rating"]')?.disabled).toBe(true)
    })

    it('posts the value it holds through its name, and an empty value once cleared', async () => {
      await control({ defaultValue: 3, name: 'rating' })
      const field = () => root().querySelector<HTMLInputElement>('input[name="rating"]')
      expect(field()?.type).toBe('hidden')
      expect(field()?.value).toBe('3')
      expect(field()?.disabled).toBe(false)
      await userEvent.click(radio('3 stars'))
      await vi.waitFor(() => expect(field()?.value).toBe(''))
      await userEvent.click(radio('5 stars'))
      await vi.waitFor(() => expect(field()?.value).toBe('5'))
    })

    /* ---------------------------------------------------------------------- */
    /* Shown                                                                  */
    /* ---------------------------------------------------------------------- */

    it('shows a read-only rating as one image named by a sentence, which takes no press', async () => {
      const onChange = vi.fn<(value: number | null) => void>()
      await mount({ label: 'Average rating', value: 4.3, readOnly: true, onChange })
      await vi.waitFor(() => expect(marks()).toHaveLength(5))

      expect(getByRole(document.body, 'img', { name: 'Average rating: 4.3 out of 5' })).toBe(root())
      expect(root().getAttribute('data-readonly')).toBe('')
      expect(queryByRole(document.body, 'radiogroup')).toBeNull()
      expect(root().querySelector('button, [tabindex]')).toBeNull()

      await userEvent.click(marks()[1] as HTMLElement)
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(onChange).not.toHaveBeenCalled()
    })

    for (const dir of ['ltr', 'rtl'] as const) {
      it(`fills the mark a fraction lands in by its share, from the inline start (${dir})`, async () => {
        document.documentElement.setAttribute('dir', dir)
        await mount({ label: 'Average rating', value: 4.3, readOnly: true })
        await vi.waitFor(() => expect(marks()).toHaveLength(5))

        expect(fills()).toEqual(['full', 'full', 'full', 'full', 'part'])
        expect(marks().map(painted)).toEqual([true, true, true, true, true])

        const { outline, cut } = drawing(marks()[4] as HTMLElement)
        const whole = outline.getBoundingClientRect()
        const share = cut.getBoundingClientRect()
        // Three tenths of the star, to a pixel, from the edge the row starts at.
        expect(Math.abs(share.width - whole.width * 0.3)).toBeLessThan(1)
        if (dir === 'ltr') expect(Math.abs(share.left - whole.left)).toBeLessThan(1)
        else expect(Math.abs(share.right - whole.right)).toBeLessThan(1)
      })
    }
  })
}
