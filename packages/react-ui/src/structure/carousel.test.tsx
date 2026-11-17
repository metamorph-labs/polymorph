import { render, screen } from '@testing-library/react'
import { useState } from 'react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { DensityScope } from '../exceptions/Scopes'
import { Carousel, type CarouselProps, type CarouselSlide } from './Carousel'

/**
 * Carousel, in a real browser, where the viewport really scrolls.
 *
 * Buttons, dots and the reader's own scroll all move one index, reported by
 * `onIndexChange`. The absence of autoplay is tested by waiting.
 */

beforeAll(installTestTheme)

const TOUR: CarouselSlide[] = [
  { id: 'compose', label: 'Compose', content: <p>Compose a request</p> },
  { id: 'send', label: 'Send', content: <p>Send and inspect</p> },
  { id: 'share', label: 'Share', content: <p>Share the run</p> },
]

const labels = {
  label: 'Product tour',
  previousLabel: 'Previous step',
  nextLabel: 'Next step',
}

function mount(node: React.ReactElement) {
  const { container } = render(<div style={{ inlineSize: '320px' }}>{node}</div>)
  return container.firstElementChild?.firstElementChild as HTMLElement
}

const dot = (name: string) => screen.getByRole('button', { name })
const current = () =>
  [...document.querySelectorAll('[aria-current="true"]')].map((node) =>
    node.getAttribute('aria-label'),
  )

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<CarouselProps>(true)
  })
})

describe('the grouping', () => {
  it('is a labelled carousel of labelled slides', () => {
    mount(<Carousel slides={TOUR} {...labels} />)
    // The container is also a group (not a landmark, because the viewport inside
    // is the labelled region), so slides are found by their "slide" description.
    const root = document.querySelector('[aria-roledescription="carousel"]')
    expect(root?.getAttribute('aria-label')).toBe('Product tour')
    expect(root?.getAttribute('role')).toBe('group')
    const slides = screen
      .getAllByRole('group')
      .filter((group) => group.getAttribute('aria-roledescription') === 'slide')
    expect(slides).toHaveLength(3)
    expect(slides.map((slide) => slide.getAttribute('aria-label'))).toEqual([
      'Compose',
      'Send',
      'Share',
    ])
  })

  it('renders nothing at all with nothing to show', () => {
    const { container } = render(<Carousel slides={[]} {...labels} />)
    expect(container.firstElementChild).toBeNull()
  })

  it('keeps every slide in the DOM and not aria-hidden, since scroll reaches all', () => {
    mount(<Carousel slides={TOUR} {...labels} />)
    expect(screen.getByText('Share the run')).toBeTruthy()
    expect(
      document.querySelectorAll('[aria-hidden="true"][aria-roledescription="slide"]'),
    ).toHaveLength(0)
  })
})

describe('one position, three inputs', () => {
  it('moves on the buttons and reports each move', async () => {
    const onIndexChange = vi.fn()
    mount(<Carousel slides={TOUR} {...labels} onIndexChange={onIndexChange} />)
    expect(current()).toEqual(['Compose'])

    await userEvent.click(screen.getByRole('button', { name: 'Next step' }))
    expect(current()).toEqual(['Send'])
    expect(onIndexChange).toHaveBeenLastCalledWith(1)

    await userEvent.click(screen.getByRole('button', { name: 'Previous step' }))
    expect(current()).toEqual(['Compose'])
    expect(onIndexChange).toHaveBeenLastCalledWith(0)
  })

  it('jumps from the dots', async () => {
    mount(<Carousel slides={TOUR} {...labels} />)
    await userEvent.click(dot('Share'))
    expect(current()).toEqual(['Share'])
  })

  it('reads a user scroll back into the same position', async () => {
    const onIndexChange = vi.fn()
    const root = mount(<Carousel slides={TOUR} {...labels} onIndexChange={onIndexChange} />)
    const viewport = root.querySelector('div') as HTMLElement
    viewport.scrollTo({ left: viewport.clientWidth * 2 })
    await vi.waitFor(() => {
      expect(current()).toEqual(['Share'])
      expect(onIndexChange).toHaveBeenLastCalledWith(2)
    })
  })

  it('scrolls the viewport when a button is pressed', async () => {
    const root = mount(<Carousel slides={TOUR} {...labels} />)
    const viewport = root.querySelector('div') as HTMLElement
    expect(viewport.scrollLeft).toBe(0)
    await userEvent.click(screen.getByRole('button', { name: 'Next step' }))
    await vi.waitFor(() => {
      expect(viewport.scrollLeft).toBeGreaterThan(0)
    })
  })

  it('positions the current slide when layout arrives late, as at zero-width mount', async () => {
    const { container } = render(
      <div style={{ display: 'none', inlineSize: '320px' }}>
        <Carousel slides={TOUR} {...labels} defaultIndex={1} />
      </div>,
    )
    const host = container.firstElementChild as HTMLElement
    const viewport = host.querySelector('[aria-roledescription="carousel"] div') as HTMLElement
    expect(viewport.scrollLeft).toBe(0)
    // Layout arrives, and the ResizeObserver scrolls to the current index.
    host.style.display = 'block'
    await vi.waitFor(() => {
      expect(viewport.scrollLeft).toBeGreaterThan(0)
    })
  })

  it('scrolls only itself, never the page around it', async () => {
    // Positioning scrolls no ancestors, unlike `scrollIntoView`, so a gallery
    // that mounts this two screens down does not scroll.
    const { container } = render(
      <div style={{ blockSize: '200px', overflowY: 'auto' }}>
        <div style={{ blockSize: '1200px' }}>filler above the deck</div>
        <div style={{ inlineSize: '320px' }}>
          <Carousel slides={TOUR} {...labels} defaultIndex={2} />
        </div>
      </div>,
    )
    const page = container.firstElementChild as HTMLElement
    const viewport = page.querySelector('[aria-roledescription="carousel"] div') as HTMLElement
    await vi.waitFor(() => {
      expect(viewport.scrollLeft).toBeGreaterThan(0)
    })
    expect(page.scrollTop).toBe(0)
  })
})

describe('the dots', () => {
  it('grow each dot’s hit area to the hit target at every density', () => {
    // A dot is drawn smaller than a finger. Its pseudo-element is the target,
    // and compact density shrinks the space steps, never the hit target.
    render(
      <DensityScope value="compact">
        <Carousel slides={TOUR} {...labels} />
      </DensityScope>,
    )
    const floor = getComputedStyle(document.documentElement).getPropertyValue('--pm-hit-target')
    expect(floor.trim()).toBe('24px')
    const target = getComputedStyle(dot('Send'), '::after')
    expect([target.width, target.height]).toEqual(['24px', '24px'])
  })

  /** What a touch at a point lands on: the dot it would press, by name. */
  const pressed = (x: number, y: number) =>
    document.elementFromPoint(x, y)?.closest('button')?.getAttribute('aria-label') ?? null

  for (const density of ['standard', 'compact'] as const) {
    it(`gives every dot the whole hit target around it, at ${density} density`, () => {
      // The hit areas are wider than the dots. Dots closer together than one hit
      // target put each area over the next dot, and a press on a dot lands on the
      // dot after it.
      render(
        <DensityScope value={density}>
          <Carousel slides={TOUR} {...labels} defaultIndex={1} />
        </DensityScope>,
      )
      const reach = 11
      for (const name of ['Compose', 'Send', 'Share']) {
        const box = dot(name).getBoundingClientRect()
        const x = box.left + box.width / 2
        const y = box.top + box.height / 2
        expect(pressed(x, y), `the centre of ${name}`).toBe(name)
        expect(pressed(x - reach, y), `before ${name}`).toBe(name)
        expect(pressed(x + reach, y), `after ${name}`).toBe(name)
        expect(pressed(x, y - reach), `above ${name}`).toBe(name)
        expect(pressed(x, y + reach), `below ${name}`).toBe(name)
      }
    })
  }

  it('keeps the other dots in place when the current one widens', async () => {
    mount(<Carousel slides={TOUR} {...labels} />)
    const centre = (name: string) => {
      const box = dot(name).getBoundingClientRect()
      return box.left + box.width / 2
    }
    const before = ['Compose', 'Send', 'Share'].map(centre)
    expect((before[1] ?? 0) - (before[0] ?? 0)).toBeCloseTo(24, 0)
    expect((before[2] ?? 0) - (before[1] ?? 0)).toBeCloseTo(24, 0)

    await userEvent.click(dot('Send'))
    expect(current()).toEqual(['Send'])
    await vi.waitFor(() => {
      const after = ['Compose', 'Send', 'Share'].map(centre)
      for (const [at, x] of after.entries()) expect(x).toBeCloseTo(before[at] ?? 0, 0)
    })
  })

  it('wraps a rail too long for its line, inside the carousel', () => {
    const many = Array.from({ length: 14 }, (_, at) => ({
      id: `slide-${at}`,
      label: `Step ${at + 1}`,
      content: <p>{`Step ${at + 1}`}</p>,
    }))
    const root = mount(<Carousel slides={many} {...labels} />)
    const edge = root.getBoundingClientRect()
    const tops = new Set<number>()
    for (const slide of many) {
      const box = dot(slide.label).getBoundingClientRect()
      expect(box.left, slide.label).toBeGreaterThanOrEqual(edge.left)
      expect(box.right, slide.label).toBeLessThanOrEqual(edge.right)
      tops.add(Math.round(box.top))
    }
    expect(tops.size).toBeGreaterThan(1)
  })
})

describe('the ends', () => {
  it('disables the button past each end without loop', () => {
    mount(<Carousel slides={TOUR} {...labels} defaultIndex={2} />)
    expect((screen.getByRole('button', { name: 'Next step' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect(
      (screen.getByRole('button', { name: 'Previous step' }) as HTMLButtonElement).disabled,
    ).toBe(false)
  })

  it('wraps around with loop', async () => {
    const onIndexChange = vi.fn()
    mount(<Carousel slides={TOUR} {...labels} loop onIndexChange={onIndexChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Previous step' }))
    expect(current()).toEqual(['Share'])
    expect(onIndexChange).toHaveBeenLastCalledWith(2)
    await userEvent.click(screen.getByRole('button', { name: 'Next step' }))
    expect(current()).toEqual(['Compose'])
  })
})

describe('no autoplay', () => {
  it('never moves on its own', async () => {
    mount(<Carousel slides={TOUR} {...labels} />)
    expect(current()).toEqual(['Compose'])
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(current()).toEqual(['Compose'])
  })
})

/**
 * An agent moves to a slide through the bridge, as the spec's `agent` fence declares
 * (`design/components/carousel.md`, Agent). The Carousel withholds its travel Buttons, and a
 * slide's content stays an agent's.
 */
describe('an agent', () => {
  it('moves an uncontrolled and a controlled Carousel, and lists no travel Button', async () => {
    const bridge = createAgentBridge()
    try {
      const free = vi.fn()
      const held = vi.fn()
      function Held() {
        const [index, setIndex] = useState(2)
        return (
          <Carousel
            slides={TOUR}
            {...labels}
            label="Held tour"
            index={index}
            onIndexChange={(next) => {
              held(next)
              setIndex(next)
            }}
          />
        )
      }
      mount(
        <>
          <Carousel slides={TOUR} {...labels} onIndexChange={free} />
          <Held />
        </>,
      )
      const { members } = bridge.snapshot()
      expect(members.map((member) => member.member)).toEqual(['Carousel', 'Carousel'])
      const [one, two] = members
      expect(one).toMatchObject({
        name: 'Product tour',
        state: {
          index: 0,
          slides: [
            { id: 'compose', label: 'Compose' },
            { id: 'send', label: 'Send' },
            { id: 'share', label: 'Share' },
          ],
        },
      })

      const moved = await bridge.act([{ id: one?.id, action: 'set', value: 2 }])
      expect(moved.results[0]).toEqual({
        ok: true,
        id: one?.id,
        changed: { index: { from: 0, to: 2 } },
      })
      expect(free).toHaveBeenLastCalledWith(2)

      const back = await bridge.act([{ id: two?.id, action: 'set', value: 0 }])
      expect(back.results[0]).toMatchObject({ changed: { index: { from: 2, to: 0 } } })
      expect(held).toHaveBeenLastCalledWith(0)

      const outside = await bridge.act([{ id: one?.id, action: 'set', value: 3 }])
      expect(outside.results[0]).toMatchObject({ ok: false, error: { code: 'failed' } })
    } finally {
      bridge.dispose()
    }
  })
})
