import { render } from '@testing-library/react'
import { useState } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { TOUR_LAW_TARGETS, tourLaw } from '@polymorph/conformance/tour'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { Button } from '../controls/Button'
import { Inline } from '../layout/Inline'
import { Stack } from '../layout/Stack'
import { Tour, type TourProps, type TourStep, type TourTargetProps } from './Tour'

/**
 * Where focus goes, what a step says and reports, and where its panel is drawn
 * are the law every shell runs (`@polymorph/conformance/tour`). The tests after
 * it are the claims a browser settles for the React member alone: the target
 * adds no box, and a tour with no steps draws nothing.
 */

beforeAll(installTestTheme)

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<TourProps>(true)
    assertGoverned<TourTargetProps>(true)
  })
})

tourLaw({
  shell: 'React',
  async mount(props) {
    render(
      <Stack gap={4}>
        <Inline gap={3}>
          {TOUR_LAW_TARGETS.map((target) => (
            <Tour.Target key={target.name} name={target.name}>
              <Button label={target.label} />
            </Tour.Target>
          ))}
        </Inline>
        <Tour {...props} />
      </Stack>,
    )
  },
})

const STEP: TourStep = { id: 'one', target: 'one', title: 'One', body: 'The first.' }

describe('Tour.Target', () => {
  it('adds no box, so what it wraps lays out as if it were not there', () => {
    const { container } = render(
      <Inline gap={3}>
        <Tour.Target name="one">
          <Button label="Inside" />
        </Tour.Target>
        <Button label="Beside" />
      </Inline>,
    )
    const target = container.querySelector<HTMLElement>('[data-tour-target="one"]')
    expect(target).not.toBeNull()
    expect(getComputedStyle(target as HTMLElement).display).toBe('contents')
    // The button inside is a flex item of the row, as the one beside it is.
    const [inside, beside] = [...container.querySelectorAll('button')]
    expect(inside?.getBoundingClientRect().top).toBe(beside?.getBoundingClientRect().top)
  })
})

describe('Tour', () => {
  it('draws nothing with no steps', () => {
    render(<Tour defaultOpen steps={[]} />)
    expect(document.querySelector('[data-member="tour"]')).toBeNull()
  })

  it('follows a controlled step and reports a press without moving', async () => {
    const onStepChange = vi.fn()
    render(
      <>
        <Tour.Target name="one">
          <Button label="One" />
        </Tour.Target>
        <Tour
          defaultOpen
          step={0}
          onStepChange={onStepChange}
          steps={[STEP, { id: 'two', title: 'Two', body: 'The second.' }]}
        />
      </>,
    )
    await vi.waitFor(() => expect(document.querySelector('[data-member="tour"]')).not.toBeNull())
    const next = [
      ...document.querySelectorAll<HTMLButtonElement>('[data-tour-part="actions"] button'),
    ]
    next[next.length - 1]?.click()
    expect(onStepChange).toHaveBeenCalledWith(1)
    // The application holds the step, so the panel stays on the first until it passes another.
    expect(document.querySelector('[data-member="tour"]')?.textContent).toContain('One')
  })

  it('leaves the page where the reader scrolled it when the application renders again', async () => {
    // The steps are written inline, so each render passes a new array and a new step.
    const page = () => (
      <>
        <div style={{ blockSize: '300vh' }} />
        <Tour.Target name="one">
          <Button label="One" />
        </Tour.Target>
        <div style={{ blockSize: '300vh' }} />
        <Tour defaultOpen steps={[{ ...STEP }]} />
      </>
    )
    const frames = () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      )

    const { rerender } = render(page())
    await vi.waitFor(() => expect(document.querySelector('[data-member="tour"]')).not.toBeNull())
    // The step that opened brought its target into view.
    await vi.waitFor(() => expect(window.scrollY).toBeGreaterThan(0))

    window.scrollTo(0, 0)
    await vi.waitFor(() => expect(window.scrollY).toBe(0))
    rerender(page())
    await frames()
    expect(window.scrollY).toBe(0)
    window.scrollTo(0, 0)
  })
})

/**
 * An agent moves through a tour and ends it through the bridge, as the spec's `agent` fence
 * declares (`design/components/tour.md`, Agent): through the member's own step, so
 * `onStepChange` reports it whether or not the caller controls the step, and never with the last
 * step's Done, which is the reader's.
 */
describe('Tour — an agent', () => {
  const STEPS: TourStep[] = [
    { id: 'one', title: 'One', body: 'The first.' },
    { id: 'two', title: 'Two', body: 'The second.' },
  ]

  it('moves a controlled tour, is refused past either end, and ends it as dismissed', async () => {
    const bridge = createAgentBridge()
    try {
      const reported = vi.fn()
      const onEnd = vi.fn()
      function Held() {
        const [step, setStep] = useState(0)
        return (
          <Tour
            defaultOpen
            steps={STEPS}
            step={step}
            onEnd={onEnd}
            onStepChange={(next) => {
              reported(next)
              setStep(next)
            }}
          />
        )
      }
      render(<Held />)
      await vi.waitFor(() => expect(document.querySelector('[data-member="tour"]')).not.toBeNull())
      const { members } = bridge.snapshot()
      // Previous, Next and Close are the tour's own Buttons, so none is listed.
      expect(members.filter((each) => each.member === 'Button')).toEqual([])
      const member = members.find((each) => each.member === 'Tour')
      expect(member).toMatchObject({
        name: 'One',
        state: {
          open: true,
          step: 0,
          steps: [
            { id: 'one', title: 'One', body: 'The first.' },
            { id: 'two', title: 'Two', body: 'The second.' },
          ],
        },
      })

      const back = await bridge.act([{ id: member?.id, action: 'previous' }])
      expect(back.results[0]).toMatchObject({
        ok: false,
        error: { code: 'failed', message: 'previous failed: This is the first step.' },
      })
      const moved = await bridge.act([{ id: member?.id, action: 'next' }])
      expect(moved.results[0]).toMatchObject({ ok: true, changed: { step: { from: 0, to: 1 } } })
      expect(reported).toHaveBeenLastCalledWith(1)
      const done = await bridge.act([{ id: member?.id, action: 'next' }])
      expect(done.results[0]).toMatchObject({
        ok: false,
        error: {
          code: 'failed',
          message: 'next failed: On the last step, an agent ends a tour with dismiss.',
        },
      })
      expect(onEnd).not.toHaveBeenCalled()

      const ended = await bridge.act([{ id: member?.id, action: 'dismiss' }])
      expect(ended.results[0]).toMatchObject({
        ok: true,
        changed: { open: { from: true, to: false } },
      })
      expect(onEnd).toHaveBeenCalledWith('dismissed')
      expect(reported).toHaveBeenCalledTimes(1)
    } finally {
      bridge.dispose()
    }
  })
})
