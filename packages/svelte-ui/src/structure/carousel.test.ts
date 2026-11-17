import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import { render } from '../mount'
import CarouselHarness from '../testing/CarouselHarness.svelte'
import { live } from '../testing/live.svelte'
import { html } from '../testing/snippets'

/**
 * Carousel in the Svelte shell keeps one position whichever input moves it
 * (`design/components/carousel.md`), as the React member's test holds it:
 * the buttons, the dots and the reader's own scroll each move it and report
 * it, and a press scrolls the viewport. Zag's machine keeps the position and
 * the scroll in step.
 */

beforeAll(installTestTheme)

const TOUR = [
  { id: 'compose', label: 'Compose', content: 'Compose a request' },
  { id: 'send', label: 'Send', content: 'Send and inspect' },
  { id: 'share', label: 'Share', content: 'Share the run' },
]

const LABELS = { label: 'Product tour', previousLabel: 'Previous step', nextLabel: 'Next step' }

/** The Carousel in a box 320px wide (`testing/CarouselHarness.svelte`). */
const show = (props: Record<string, unknown> = {}) =>
  render(CarouselHarness, { slides: TOUR, ...LABELS, ...props })

const button = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (element) =>
      element.getAttribute('aria-label') === name || element.textContent?.trim() === name,
  ) as HTMLButtonElement

const current = () =>
  [...document.querySelectorAll('[aria-current="true"]')].map((node) =>
    node.getAttribute('aria-label'),
  )

const viewport = () => document.querySelector<HTMLElement>('[role="region"]') as HTMLElement

/** The machine measures the snap points and positions the viewport two frames after mount. */
const settled = () =>
  new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )

describe('one position, three inputs', () => {
  it('moves on the buttons and reports each move', async () => {
    const onIndexChange = vi.fn()
    await show({ onIndexChange })
    expect(current()).toEqual(['Compose'])
    await userEvent.click(button('Next step'))
    await vi.waitFor(() => expect(current()).toEqual(['Send']))
    expect(onIndexChange).toHaveBeenLastCalledWith(1)
    await userEvent.click(button('Previous step'))
    await vi.waitFor(() => expect(current()).toEqual(['Compose']))
    expect(onIndexChange).toHaveBeenLastCalledWith(0)
  })

  it('jumps from the dots and scrolls the viewport there', async () => {
    await show()
    await userEvent.click(button('Share'))
    await vi.waitFor(() => expect(current()).toEqual(['Share']))
    await vi.waitFor(() => expect(viewport().scrollLeft).toBeGreaterThan(0))
  })

  it('reads a scroll back into the same position, whatever made it', async () => {
    const onIndexChange = vi.fn()
    await show({ onIndexChange })
    await settled()
    // One instant scroll, as focusing a control in another slide makes: no wheel or touch
    // comes before it.
    viewport().scrollTo({ left: viewport().clientWidth * 2 })
    await vi.waitFor(() => {
      expect(current()).toEqual(['Share'])
      expect(onIndexChange).toHaveBeenLastCalledWith(2)
    })
  })

  it('starts at its default slide', async () => {
    await show({ defaultIndex: 2 })
    expect(current()).toEqual(['Share'])
    await vi.waitFor(() => expect(viewport().scrollLeft).toBeGreaterThan(0))
  })
})

describe('what the machine leaves to the member', () => {
  it('keeps its default slide through a mount at zero width', async () => {
    // The host the harness mounts into is the body's last box, hidden until the machine has
    // measured nothing.
    const hide = document.createElement('style')
    hide.textContent = 'body > div:last-of-type { display: none }'
    document.head.append(hide)
    try {
      await show({ defaultIndex: 2 })
      await settled()
    } finally {
      hide.remove()
    }
    await vi.waitFor(() => expect(viewport().scrollLeft).toBeGreaterThan(0))
    await settled()
    expect(current()).toEqual(['Share'])
  })

  it('stays a tab stop when its slides hold focusable content', async () => {
    await show({
      slides: TOUR.map((slide) => ({
        ...slide,
        content: html(`<a href="#">${slide.label}</a>`),
      })),
    })
    await settled()
    expect(viewport().getAttribute('tabindex')).toBe('0')
  })

  it('moves on a controlled change as the motion setting says', async () => {
    const props = live({ slides: TOUR, ...LABELS, index: 0 })
    await render(CarouselHarness, props)
    await settled()
    const scrolls = vi.spyOn(viewport(), 'scrollTo')
    const lastBehavior = () => (scrolls.mock.calls.at(-1)?.[0] as ScrollToOptions).behavior
    props.index = 2
    await vi.waitFor(() => expect(current()).toEqual(['Share']))
    await vi.waitFor(() => expect(scrolls).toHaveBeenCalled())
    expect(lastBehavior()).toBe('smooth')
    viewport().focus()
    document.documentElement.setAttribute('data-motion', 'none')
    try {
      scrolls.mockClear()
      props.index = 0
      await vi.waitFor(() => expect(current()).toEqual(['Compose']))
      await vi.waitFor(() => expect(scrolls).toHaveBeenCalled())
      expect(lastBehavior()).not.toBe('smooth')
    } finally {
      document.documentElement.removeAttribute('data-motion')
    }
  })
})

describe('the ends', () => {
  it('disables the button past each end without loop', async () => {
    await show({ defaultIndex: 2 })
    expect(button('Next step').disabled).toBe(true)
    expect(button('Previous step').disabled).toBe(false)
  })

  it('wraps around with loop', async () => {
    const onIndexChange = vi.fn()
    await show({ loop: true, onIndexChange })
    await userEvent.click(button('Previous step'))
    await vi.waitFor(() => expect(current()).toEqual(['Share']))
    expect(onIndexChange).toHaveBeenLastCalledWith(2)
  })
})

describe('no autoplay', () => {
  it('never moves on its own', async () => {
    await show()
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(current()).toEqual(['Compose'])
  })
})
