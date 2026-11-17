import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for how a Lightbox moves between its pictures, where focus is at its
 * ends, how it fits a picture inside the window, and where focus goes when it
 * closes (`design/components/lightbox.md`), which every web shell's Lightbox
 * test calls with a mount of its own. A contract statement reads one part's
 * role, name or attribute, or one key's effect on an open or closed member
 * (`docs/conformance.md`). This law reads what the grammar cannot state: the
 * picture a key or a press moves to, the position the status says, focus after
 * a travel Button is disabled, and the picture's box against the window.
 *
 * The law mounts the lightbox open (`defaultOpen`) with no trigger, so it
 * needs no slot in any shell. It focuses a Button from a script and reads
 * `document.activeElement`, because Tab passes over buttons in WebKit, and it
 * waits for each reading, because a shell commits a change a moment after the
 * event.
 */

/** A picture as the law passes it, in the shape of the member's `LightboxImage`. */
export interface LightboxLawImage {
  src: string
  alt: string
}

/** What the law sets on the lightbox after it mounts. */
export interface LightboxLawProps {
  images: LightboxLawImage[]
  /** The picture shown, while the application holds it. `undefined` hands it to the lightbox. */
  index: number | undefined
}

export interface LightboxLawMount {
  /** The props the lightbox mounts with. */
  readonly props: LightboxLawProps
  readonly defaultIndex: number | undefined
  readonly onIndexChange: (index: number) => void
  readonly onOpenChange: (open: boolean) => void
}

export interface MountedLightbox {
  /** Sets props on the lightbox, as its parent's state would. */
  set(next: Partial<LightboxLawProps>): void | Promise<void>
}

export interface LightboxLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /**
   * Mounts a Lightbox labelled `Photographs`, open from its first render
   * (`defaultOpen`), with no trigger, and the props and handlers given.
   */
  mount(options: LightboxLawMount): Promise<MountedLightbox>
}

/** A picture of `width` by `height` pixels: one colour field, with its size as its only content. */
const picture = (width: number, height: number, fill: string, alt: string): LightboxLawImage => ({
  src:
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${fill}"/></svg>`,
    ),
  alt,
})

const HARBOUR = picture(1200, 800, '#2f4a6b', 'A harbour at dusk')
const RIDGE = picture(800, 1000, '#3b5d3a', 'A pine ridge in the morning')
const CLIFFS = picture(1200, 900, '#6b3f2f', 'Red cliffs over a dry river')
const THREE = [HARBOUR, RIDGE, CLIFFS]

const panel = () => document.querySelector<HTMLElement>('[data-member="lightbox"]')

const open = (): HTMLElement => {
  const element = panel()
  if (element === null) throw new Error('the Lightbox is not open')
  return element
}

/** A travel or close Button, by its part. */
const control = (part: 'previous' | 'next' | 'close'): HTMLButtonElement | null =>
  open().querySelector<HTMLButtonElement>(
    part === 'close'
      ? '[data-dialog-part="close"] button'
      : `[data-lightbox-part="${part}"] button`,
  )

const button = (part: 'previous' | 'next' | 'close'): HTMLButtonElement => {
  const element = control(part)
  if (element === null) throw new Error(`the Lightbox draws no ${part} Button`)
  return element
}

/** The picture shown: its `alt`, read from the image or, once it has failed, its fallback. */
const shown = () =>
  open().querySelector('img')?.getAttribute('alt') ??
  open().querySelector('[role="img"]')?.getAttribute('aria-label') ??
  null

const status = () => open().querySelector('[role="status"]')

const said = () => status()?.textContent ?? null

/** Focuses an element from a script, as a press or Tab would leave it. */
async function focus(element: HTMLElement) {
  element.focus()
  await vi.waitFor(() => expect(document.activeElement).toBe(element))
}

/**
 * The picture once it has arrived, with its box: the one `alt` names, because a
 * shell draws the new picture a moment after the index changes.
 */
async function arrived(alt: string): Promise<{ box: DOMRect; image: HTMLImageElement }> {
  const image = await vi.waitFor(() => {
    const element = open().querySelector('img')
    expect(element?.getAttribute('alt')).toBe(alt)
    expect(element?.complete && element.naturalWidth > 0, 'the picture has not arrived').toBe(true)
    return element as HTMLImageElement
  })
  return { box: image.getBoundingClientRect(), image }
}

/**
 * The panel's entrance, played to its end: the box of a panel that is still
 * scaling up from its trigger is smaller than the box it rests at.
 */
const settled = () =>
  vi.waitFor(() => {
    const transform = getComputedStyle(open()).transform
    const scale = getComputedStyle(open()).scale
    expect(transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)').toBe(true)
    expect(scale === 'none' || scale === '1').toBe(true)
  })

export function lightboxLaw({ shell, mount }: LightboxLaw): void {
  describe(`${shell} Lightbox — moving, its ends, the fit and focus`, () => {
    beforeAll(installTestTheme)

    let outside: HTMLElement[] = []

    afterEach(() => {
      for (const element of outside) element.remove()
      outside = []
      document.documentElement.removeAttribute('dir')
    })

    /** A control of the page behind the lightbox, at the end of the body. */
    function pageControl(): HTMLButtonElement {
      const element = document.createElement('button')
      element.textContent = 'Attachments'
      document.body.append(element)
      outside.push(element)
      return element
    }

    /** The lightbox, open, with a spy in each handler, and the application's `set`. */
    async function lightbox({
      props = {},
      defaultIndex,
    }: { props?: Partial<LightboxLawProps>; defaultIndex?: number } = {}) {
      const onIndexChange = vi.fn<(index: number) => void>()
      const onOpenChange = vi.fn<(open: boolean) => void>()
      const mounted = await mount({
        props: { images: THREE, index: undefined, ...props },
        defaultIndex,
        onIndexChange,
        onOpenChange,
      })
      // Dialog's policy puts focus on close once the panel is open.
      await vi.waitFor(() => expect(document.activeElement).toBe(control('close')))
      return { set: mounted.set.bind(mounted), onIndexChange, onOpenChange }
    }

    it('draws no previous, no next and no position for one picture', async () => {
      await lightbox({ props: { images: [HARBOUR] } })

      expect(shown()).toBe('A harbour at dusk')
      expect(control('previous')).toBeNull()
      expect(control('next')).toBeNull()
      expect(status()).toBeNull()
    })

    it('moves one picture with next and previous, says the position, and reports each move', async () => {
      const { onIndexChange } = await lightbox()

      expect(shown()).toBe('A harbour at dusk')
      expect(said()).toBe('1 of 3')
      expect(button('previous').disabled).toBe(true)

      await userEvent.click(button('next'))
      await vi.waitFor(() => expect(shown()).toBe('A pine ridge in the morning'))
      expect(said()).toBe('2 of 3')
      expect(onIndexChange).toHaveBeenLastCalledWith(1)
      expect(button('previous').disabled).toBe(false)

      await userEvent.click(button('previous'))
      await vi.waitFor(() => expect(shown()).toBe('A harbour at dusk'))
      expect(said()).toBe('1 of 3')
      expect(onIndexChange).toHaveBeenLastCalledWith(0)
      expect(onIndexChange).toHaveBeenCalledTimes(2)
    })

    it('moves one picture with ArrowRight and ArrowLeft, and an arrow at an end does nothing', async () => {
      const { onIndexChange } = await lightbox()

      // From close, which is neither travel Button: the keys work anywhere in the panel.
      await userEvent.keyboard('{ArrowRight}')
      await vi.waitFor(() => expect(said()).toBe('2 of 3'))
      await userEvent.keyboard('{ArrowRight}')
      await vi.waitFor(() => expect(said()).toBe('3 of 3'))
      expect(shown()).toBe('Red cliffs over a dry river')
      expect(button('next').disabled).toBe(true)

      await userEvent.keyboard('{ArrowRight}')
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(said(), 'ArrowRight moved past the last picture').toBe('3 of 3')
      expect(onIndexChange).toHaveBeenCalledTimes(2)

      await userEvent.keyboard('{ArrowLeft}')
      await vi.waitFor(() => expect(said()).toBe('2 of 3'))
      expect(onIndexChange).toHaveBeenLastCalledWith(1)
      expect(document.activeElement).toBe(control('close'))
    })

    it('keeps focus in the panel when next reaches the last picture, on previous', async () => {
      await lightbox({ defaultIndex: 1 })

      await focus(button('next'))
      await userEvent.keyboard('{Enter}')
      await vi.waitFor(() => expect(said()).toBe('3 of 3'))
      expect(button('next').disabled).toBe(true)
      await vi.waitFor(() => expect(document.activeElement).toBe(control('previous')))
    })

    it('keeps focus in the panel when previous reaches the first picture, on next', async () => {
      await lightbox({ defaultIndex: 1 })

      await focus(button('previous'))
      await userEvent.keyboard('{Enter}')
      await vi.waitFor(() => expect(said()).toBe('1 of 3'))
      await vi.waitFor(() => expect(document.activeElement).toBe(control('next')))
    })

    it('moves only when the application passes the index, while it holds it', async () => {
      const { set, onIndexChange } = await lightbox({ props: { index: 0 } })

      await userEvent.click(button('next'))
      await vi.waitFor(() => expect(onIndexChange).toHaveBeenLastCalledWith(1))
      expect(said(), 'a controlled lightbox moved by itself').toBe('1 of 3')

      await set({ index: 1 })
      await vi.waitFor(() => expect(said()).toBe('2 of 3'))
      expect(shown()).toBe('A pine ridge in the morning')

      // An index past the list shows its last picture, as Carousel's does.
      await set({ index: 9 })
      await vi.waitFor(() => expect(said()).toBe('3 of 3'))
    })

    it('mirrors the arrows and the keys in a right-to-left page', async () => {
      document.documentElement.setAttribute('dir', 'rtl')
      const { onIndexChange } = await lightbox({ defaultIndex: 1 })
      await settled()

      const previous = button('previous').getBoundingClientRect()
      const next = button('next').getBoundingClientRect()
      expect(previous.left, 'previous is not at the right edge').toBeGreaterThan(next.left)

      await userEvent.keyboard('{ArrowLeft}')
      await vi.waitFor(() => expect(said()).toBe('3 of 3'))
      expect(onIndexChange).toHaveBeenLastCalledWith(2)

      await userEvent.keyboard('{ArrowRight}')
      await vi.waitFor(() => expect(said()).toBe('2 of 3'))
      expect(onIndexChange).toHaveBeenLastCalledWith(1)
    })

    it('fits a wide and a tall picture inside the window whole, and never enlarges a small one', async () => {
      const wide = picture(2400, 900, '#2f4a6b', 'A panorama of the harbour')
      const tall = picture(600, 1600, '#3b5d3a', 'The settings screen on a phone')
      const small = picture(120, 80, '#6b3f2f', 'A stamp')
      const { set } = await lightbox({ props: { images: [wide, tall, small], index: 0 } })
      await settled()

      for (const [index, { alt }, width, height] of [
        [0, wide, 2400, 900],
        [1, tall, 600, 1600],
      ] as const) {
        await set({ index })
        const { box, image } = await arrived(alt)
        expect(image.naturalWidth).toBe(width)
        // Inside the window, on both axes.
        expect(box.left).toBeGreaterThanOrEqual(0)
        expect(box.top).toBeGreaterThanOrEqual(0)
        expect(box.right).toBeLessThanOrEqual(window.innerWidth)
        expect(box.bottom).toBeLessThanOrEqual(window.innerHeight)
        // Smaller than its own size here, and at its own ratio, so nothing is cropped or stretched.
        expect(box.width).toBeLessThan(width)
        expect(box.width / box.height).toBeCloseTo(width / height, 1)
        // Fitted: one axis reaches the window, less the panel's padding.
        expect(
          Math.max(box.width / window.innerWidth, box.height / window.innerHeight),
        ).toBeGreaterThan(0.85)
        // Centred on both axes.
        expect(Math.abs(box.left + box.width / 2 - window.innerWidth / 2)).toBeLessThan(2)
        expect(Math.abs(box.top + box.height / 2 - window.innerHeight / 2)).toBeLessThan(2)
      }

      await set({ index: 2 })
      const { box } = await arrived(small.alt)
      expect([box.width, box.height]).toEqual([120, 80])
    })

    it('draws Image’s fallback, named by the picture’s alt, for a picture that fails', async () => {
      await lightbox({ props: { images: [{ src: '', alt: 'The uploaded receipt' }] } })

      const fallback = open().querySelector('[role="img"]')
      expect(fallback?.getAttribute('aria-label')).toBe('The uploaded receipt')
      expect(open().querySelector('img')).toBeNull()
    })

    it('closes on a press beside the picture, and not on a press on the picture', async () => {
      const { onOpenChange } = await lightbox()
      await settled()
      await arrived(HARBOUR.alt)

      // The picture is in the middle of the window, and a press on it keeps the panel. The
      // press is performed, because the pointer harness aims at the picture's centre.
      const middle = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)
      expect(
        middle !== null && open().contains(middle),
        'the picture is not under the middle',
      ).toBe(true)
      await userEvent.click(middle as Element)
      await new Promise((resolve) => setTimeout(resolve, 150))
      expect(panel(), 'a press on the picture closed the lightbox').not.toBeNull()
      expect(onOpenChange).not.toHaveBeenCalled()

      // The panel's corner is its padding, which takes no clicks: the scrim is under it. The
      // press is dispatched there, because the harness would aim at the scrim's centre, which
      // is the picture's.
      const corner = document.elementFromPoint(4, window.innerHeight - 4)
      expect(corner !== null && !open().contains(corner), 'the panel takes the corner').toBe(true)
      const scrim = corner as Element
      const at = { clientX: 4, clientY: window.innerHeight - 4 }
      const init = { bubbles: true, cancelable: true, composed: true, ...at }
      for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
        scrim.dispatchEvent(
          type.startsWith('pointer')
            ? new PointerEvent(type, { ...init, pointerType: 'mouse', isPrimary: true })
            : new MouseEvent(type, init),
        )
      }
      await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
      await vi.waitFor(() => expect(panel()).toBeNull())
    })

    it('returns focus on Escape to where it was before it opened', async () => {
      const before = pageControl()
      await focus(before)
      const { onOpenChange } = await lightbox()

      await userEvent.click(button('next'))
      await vi.waitFor(() => expect(said()).toBe('2 of 3'))
      await focus(button('close'))
      await userEvent.keyboard('{Escape}')
      await vi.waitFor(() => expect(panel()).toBeNull())
      expect(onOpenChange).toHaveBeenCalledWith(false)
      await vi.waitFor(() => expect(document.activeElement).toBe(before))
    })
  })
}
