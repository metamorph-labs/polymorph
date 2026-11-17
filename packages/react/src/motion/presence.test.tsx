import { DATA_ATTRS, type MotionTemperament } from '@polymorph/engine'
import { installTestTheme } from '@polymorph/engine/testing'
import { render } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { MotionPresence, MotionSurface } from './presence'

/**
 * The interruption laws (`design/motion/motion.md`). They need a real animation
 * on a real compositor, which is why this package's tests and the vocabulary's
 * run in chromium rather than jsdom.
 *
 * The demo overlay and toast stack stand in for Dialog and Toast. They show
 * that the engine handles rapid toggling. Components get that behaviour without
 * extra code, which is why exit coordination lives in one place.
 */

beforeAll(installTestTheme)

afterEach(() => {
  document.documentElement.removeAttribute(DATA_ATTRS.motion)
  document.body.replaceChildren()
})

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))

function temperament(value: MotionTemperament): void {
  document.documentElement.setAttribute(DATA_ATTRS.motion, value)
}

/** Stands in for Dialog: a scrim and a panel that mount and unmount together. */
function DemoOverlay({ open }: { open: boolean }) {
  return (
    <MotionPresence>
      {open ? (
        <MotionSurface key="scrim" binding="dialog.scrim" data-state="open" id="scrim">
          <MotionSurface key="panel" binding="dialog.panel" id="panel" role="dialog">
            panel
          </MotionSurface>
        </MotionSurface>
      ) : null}
    </MotionPresence>
  )
}

function panels(): HTMLElement[] {
  return [...document.querySelectorAll('#panel')] as HTMLElement[]
}

function opacityOf(element: Element): number {
  return Number.parseFloat(getComputedStyle(element).opacity)
}

describe('exit coordination', () => {
  it('keeps an exiting panel mounted until its exit finishes', async () => {
    const view = render(<DemoOverlay open={false} />)
    view.rerender(<DemoOverlay open />)
    await sleep(400)
    expect(panels()).toHaveLength(1)

    view.rerender(<DemoOverlay open={false} />)
    // Still mounted mid-exit. Unmounting here would be the jump the laws forbid.
    await frame()
    expect(panels(), 'panel unmounted before its exit ran').toHaveLength(1)

    await sleep(400)
    expect(panels(), 'panel outlived its exit').toHaveLength(0)
  })

  it('leaves no orphaned panel after rapid toggling', async () => {
    const view = render(<DemoOverlay open={false} />)

    for (let i = 0; i < 12; i += 1) {
      view.rerender(<DemoOverlay open={i % 2 === 0} />)
      await frame()
      // The key invariant: never two panels at once. A presence implementation
      // that queues fails here, not at the end.
      expect(panels().length, `after toggle ${i}`).toBeLessThanOrEqual(1)
    }

    view.rerender(<DemoOverlay open={false} />)
    await sleep(500)
    expect(panels(), 'orphan left after mashing').toHaveLength(0)
  })

  it('ends open when rapid toggling stops on open', async () => {
    const view = render(<DemoOverlay open={false} />)
    for (let i = 0; i < 8; i += 1) {
      view.rerender(<DemoOverlay open={i % 2 === 0} />)
      await frame()
    }
    view.rerender(<DemoOverlay open />)
    await sleep(500)

    expect(panels()).toHaveLength(1)
    expect(opacityOf(panels()[0] as Element)).toBeCloseTo(1, 1)
  })
})

describe('law 1 — a reversal continues from the current value', () => {
  it('does not restart from the endpoint when an enter is interrupted', async () => {
    temperament('expressive') // longest durations, widest sampling window
    const view = render(<DemoOverlay open={false} />)

    view.rerender(<DemoOverlay open />)
    await sleep(90)

    const midEnter = opacityOf(panels()[0] as Element)
    expect(midEnter, 'sampled outside the animation').toBeGreaterThan(0)
    expect(midEnter, 'enter finished before it could be interrupted').toBeLessThan(1)

    view.rerender(<DemoOverlay open={false} />)
    await frame()

    const afterReversal = opacityOf(panels()[0] as Element)
    // A restart shows as a jump to 1 (or to 0) at the moment of reversal.
    // Continuing means the value stays close to where it was.
    expect(afterReversal).toBeGreaterThan(0)
    expect(afterReversal).toBeLessThan(1)
    expect(Math.abs(afterReversal - midEnter)).toBeLessThan(0.4)
  })

  it('does not restart from the endpoint when an exit is interrupted', async () => {
    temperament('expressive')
    const view = render(<DemoOverlay open={false} />)
    view.rerender(<DemoOverlay open />)
    await sleep(500)

    view.rerender(<DemoOverlay open={false} />)
    await sleep(90)
    const midExit = opacityOf(panels()[0] as Element)
    expect(midExit).toBeGreaterThan(0)
    expect(midExit).toBeLessThan(1)

    view.rerender(<DemoOverlay open />)
    await frame()
    const afterReversal = opacityOf(panels()[0] as Element)
    expect(Math.abs(afterReversal - midExit)).toBeLessThan(0.4)
  })
})

describe('law 3 — motion never blocks input', () => {
  it('keeps the panel clickable while entering and exiting', async () => {
    const view = render(<DemoOverlay open={false} />)
    view.rerender(<DemoOverlay open />)

    for (let i = 0; i < 10; i += 1) {
      await frame()
      const panel = panels()[0]
      if (panel) expect(getComputedStyle(panel).pointerEvents, `frame ${i}`).not.toBe('none')
    }

    view.rerender(<DemoOverlay open={false} />)
    for (let i = 0; i < 10; i += 1) {
      await frame()
      const panel = panels()[0]
      if (panel) expect(getComputedStyle(panel).pointerEvents, `exit frame ${i}`).not.toBe('none')
    }
  })
})

describe('temperament switching rescales the engine', () => {
  /*
   * These tests read the Web Animation the engine starts on the element instead
   * of sampling opacity after a sleep. A sleep depends on machine load: under
   * load a 20ms wait can end before the first frame. An animation's duration, or
   * its absence, reflects the temperament directly.
   */

  /** The panel's enter animation, once the engine has started it. */
  async function enterAnimation(): Promise<Animation | undefined> {
    for (let i = 0; i < 60; i += 1) {
      await frame()
      const animation = panels()[0]?.getAnimations()[0]
      if (animation) return animation
    }
    return undefined
  }

  /** Waits a few frames in which nothing should start, then returns what is running. */
  async function animationsAfterSettling(): Promise<Animation[]> {
    for (let i = 0; i < 5; i += 1) await frame()
    return panels()[0]?.getAnimations() ?? []
  }

  async function enterDuration(value: MotionTemperament): Promise<number> {
    temperament(value)
    const view = render(<DemoOverlay open={false} />)
    view.rerender(<DemoOverlay open />)
    const duration = Number((await enterAnimation())?.effect?.getComputedTiming().duration)
    view.unmount()
    document.body.replaceChildren()
    return duration
  }

  it('applies instantly at none, because the engine is bypassed', async () => {
    temperament('none')
    const view = render(<DemoOverlay open={false} />)
    view.rerender(<DemoOverlay open />)
    // Bypassed means no animation at all, not a very short one.
    expect(await animationsAfterSettling()).toEqual([])
    expect(opacityOf(panels()[0] as Element)).toBeCloseTo(1, 1)
    view.unmount()
  })

  it('starts a shorter enter at subtle and a longer one at expressive', async () => {
    const subtle = await enterDuration('subtle')
    const standard = await enterDuration('standard')
    const expressive = await enterDuration('expressive')

    expect(subtle, 'no enter animation ran').toBeGreaterThan(0)
    expect(subtle).toBeLessThan(standard)
    expect(standard).toBeLessThan(expressive)
  })

  it('picks up a switch made while mounted', async () => {
    temperament('none')
    const view = render(<DemoOverlay open={false} />)
    view.rerender(<DemoOverlay open />)
    expect(await animationsAfterSettling(), 'none should not animate').toEqual([])

    // Same mounted tree, new temperament. The cascade picks up the change, so
    // the MutationObserver must too.
    view.rerender(<DemoOverlay open={false} />)
    await animationsAfterSettling()
    temperament('expressive')
    await frame()
    view.rerender(<DemoOverlay open />)
    const animation = await enterAnimation()
    expect(
      Number(animation?.effect?.getComputedTiming().duration),
      'expressive should animate the enter',
    ).toBeGreaterThan(0)
  })
})

/** Stands in for Toast: a stack whose members can be removed from the middle. */
function DemoStack({ ids }: { ids: number[] }) {
  return (
    <MotionPresence>
      {ids.map((id) => (
        <MotionSurface key={id} binding="toast.enter" data-state="open" id={`toast-${id}`}>
          {`toast ${id}`}
        </MotionSurface>
      ))}
    </MotionPresence>
  )
}

describe('a stack that loses a member from the middle', () => {
  it('keeps the exiting toast mounted and the others intact', async () => {
    const view = render(<DemoStack ids={[]} />)
    view.rerender(<DemoStack ids={[1, 2, 3]} />)
    await sleep(400)
    expect(document.querySelectorAll('[id^="toast-"]')).toHaveLength(3)

    view.rerender(<DemoStack ids={[1, 3]} />)
    await frame()
    // Three during the exit, because the removed one is still animating out.
    expect(document.querySelectorAll('[id^="toast-"]')).toHaveLength(3)
    expect(document.querySelector('#toast-2')).not.toBeNull()

    await sleep(400)
    expect(document.querySelectorAll('[id^="toast-"]')).toHaveLength(2)
    expect(document.querySelector('#toast-2')).toBeNull()
    expect(document.querySelector('#toast-1')).not.toBeNull()
    expect(document.querySelector('#toast-3')).not.toBeNull()
  })

  it('handles a member being added and removed repeatedly', async () => {
    function Harness() {
      const [ids, setIds] = useState<number[]>([1])
      return (
        <>
          <button type="button" id="toggle" onClick={() => setIds(ids.length > 1 ? [1] : [1, 2])}>
            toggle
          </button>
          <DemoStack ids={ids} />
        </>
      )
    }

    render(<Harness />)
    const toggle = document.querySelector('#toggle') as HTMLButtonElement
    for (let i = 0; i < 10; i += 1) {
      toggle.click()
      await frame()
      expect(document.querySelectorAll('#toast-2').length, `toggle ${i}`).toBeLessThanOrEqual(1)
    }

    await sleep(500)
    expect(document.querySelector('#toast-1')).not.toBeNull()
  })
})

/**
 * What a surface needs to work under a Radix `asChild`, which is how the
 * overlays use it: it can be a list item, it keeps the host's ref, and it keeps
 * the host's inline style. Popper's transform origin and DismissableLayer's
 * `pointer-events` are positioning values, not decoration.
 */
describe('the asChild surface', () => {
  it('renders as the element the host needs', () => {
    render(
      <MotionPresence>
        <ul>
          <MotionSurface key="item" as="li" binding="toast.enter" id="item" />
        </ul>
      </MotionPresence>,
    )
    expect(document.querySelector('#item')?.tagName).toBe('LI')
  })

  it('composes the host ref rather than replacing it', () => {
    let seen: HTMLElement | null = null
    render(
      <MotionPresence>
        <MotionSurface
          key="panel"
          binding="dialog.panel"
          id="panel"
          ref={(node) => {
            seen = node
          }}
        />
      </MotionPresence>,
    )
    expect(seen).toBe(document.querySelector('#panel'))
  })

  it('gives the host style precedence and keeps its own alongside it', () => {
    render(
      <MotionPresence>
        <MotionSurface
          key="bubble"
          binding="tooltip.bubble"
          side="top"
          id="bubble"
          style={{ pointerEvents: 'auto', zIndex: 5 }}
        />
      </MotionPresence>,
    )
    const style = getComputedStyle(document.querySelector('#bubble') as HTMLElement)
    expect(style.pointerEvents).toBe('auto')
    expect(style.zIndex).toBe('5')
    // The origin the engine resolved is still applied.
    expect(style.transformOrigin).toBeTruthy()
  })

  it('refuses a layout binding that is not a spring', () => {
    expect(() =>
      render(
        <MotionPresence>
          <MotionSurface key="x" binding="toast.enter" layoutBinding="dialog.panel" />
        </MotionPresence>,
      ),
    ).toThrow(/not a spring binding/)
  })
})
