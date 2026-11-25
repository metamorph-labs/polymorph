import { beforeAll, describe, expect, it } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for FormPage's actions row with a leading action
 * (`design/archetypes/form-page.md`), which every web shell's FormPage test
 * calls with a mount of its own states entry. A contract statement reads one
 * part's role, name or focus. This law reads boxes: the leading action at the
 * row's start, the actions at its end, in either direction, and the row
 * wrapping at a narrow width with the actions still at the end.
 *
 * The column is the page's content box, which the actions row spans.
 */

/** The states entry whose Delete is the leading action, in every shell's fixture. */
export const FORM_PAGE_LEADING = 'with a destructive tertiary, leftmost and quiet'

export interface FormPageRowLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /** Mounts the states entry `FORM_PAGE_LEADING`, and returns the element that holds it. */
  mount(): Promise<{ host: HTMLElement; unmount(): void }>
}

/** A pixel, for a box whose edge falls on a fraction. */
const EPSILON = 1

/** Wide enough for the page's whole measure, so the row is on one line. */
const WIDE = 720
/** Narrower than the leading action and the actions side by side, so the row wraps. */
const NARROW = 300

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))

interface Boxes {
  column: { left: number; right: number }
  leading: DOMRect
  cancel: DOMRect
  save: DOMRect
}

function boxes(host: HTMLElement): Boxes {
  const page = host.querySelector<HTMLElement>('[data-member="form-page"]')
  if (page === null) throw new Error('no FormPage is mounted')
  const buttons = [...host.querySelectorAll<HTMLButtonElement>('button')]
  const button = (label: string) => {
    const found = buttons.find((candidate) => candidate.textContent?.includes(label))
    if (found === undefined) throw new Error(`no Button "${label}" in FormPage's row`)
    return found.getBoundingClientRect()
  }
  const box = page.getBoundingClientRect()
  const style = getComputedStyle(page)
  return {
    column: {
      left: box.left + parseFloat(style.paddingLeft),
      right: box.right - parseFloat(style.paddingRight),
    },
    leading: button('Delete ticket'),
    cancel: button('Cancel'),
    save: button('Save changes'),
  }
}

async function measured(host: HTMLElement, width: number, direction: 'ltr' | 'rtl') {
  host.style.inlineSize = `${width}px`
  host.dir = direction
  await frame()
  await frame()
  return boxes(host)
}

export function formPageRowLaw({ shell, mount }: FormPageRowLaw): void {
  describe(`${shell} FormPage — the leading action at the row's start, the actions at its end`, () => {
    beforeAll(installTestTheme)

    for (const direction of ['ltr', 'rtl'] as const) {
      const start = direction === 'ltr' ? 'left' : 'right'
      const end = direction === 'ltr' ? 'right' : 'left'

      it(`draws the leading action at the start and the actions at the end, on one line, ${direction}`, async () => {
        const { host, unmount } = await mount()
        try {
          const { column, leading, cancel, save } = await measured(host, WIDE, direction)
          expect(
            Math.abs(leading[start] - column[start]),
            'the leading action',
          ).toBeLessThanOrEqual(EPSILON)
          expect(Math.abs(save[end] - column[end]), 'the last action').toBeLessThanOrEqual(EPSILON)
          expect(Math.abs(leading.top - save.top), 'one line').toBeLessThanOrEqual(EPSILON)
          // Cancel comes before Save in reading order, so it sits between the two.
          if (direction === 'ltr') expect(cancel.right).toBeLessThanOrEqual(save.left)
          else expect(cancel.left).toBeGreaterThanOrEqual(save.right)
          // The space between the two groups is the row's, not the actions' gap alone.
          const between =
            direction === 'ltr' ? cancel.left - leading.right : leading.left - cancel.right
          const gap = direction === 'ltr' ? save.left - cancel.right : cancel.left - save.right
          expect(between).toBeGreaterThan(gap)
        } finally {
          unmount()
        }
      })

      it(`wraps at a narrow width, the actions still at the end, ${direction}`, async () => {
        const { host, unmount } = await mount()
        try {
          const { column, leading, save } = await measured(host, NARROW, direction)
          expect(
            Math.abs(leading[start] - column[start]),
            'the leading action',
          ).toBeLessThanOrEqual(EPSILON)
          expect(Math.abs(save[end] - column[end]), 'the last action').toBeLessThanOrEqual(EPSILON)
          expect(save.top, 'the actions on a later line').toBeGreaterThanOrEqual(
            leading.bottom - EPSILON,
          )
        } finally {
          unmount()
        }
      })
    }
  })
}
