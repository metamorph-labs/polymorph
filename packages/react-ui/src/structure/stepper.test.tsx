import { render, screen } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { TAB_PASSES_BUTTONS } from '@polymorph/conformance/engines'
import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { fixedWidthHost, installTestTheme } from '@polymorph/engine/testing'
import { tokenColor } from '../controls/token-probe'
import { Stepper, type StepperProps } from './Stepper'

/**
 * Stepper, in a real browser.
 *
 * The spec's two strongest claims: the three states derive from one index, and
 * the numbered circle carries no meaning, because each step states its position
 * in words.
 */

beforeAll(installTestTheme)

const MIGRATION = [
  { label: 'Connect' },
  { label: 'Map fields' },
  { label: 'Review' },
  { label: 'Import' },
]

const steps = () => [...document.querySelectorAll('li')]
const statesOf = () => steps().map((node) => node.dataset['state'])

/** The circles, which screen readers must never read. */
const indicators = () =>
  steps().map((step) => step.firstElementChild?.firstElementChild as HTMLElement)

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<StepperProps>(true)
  })
})

describe('one index, three states', () => {
  it('marks steps before the active one completed and steps after it upcoming', () => {
    render(<Stepper steps={MIGRATION} activeIndex={2} />)
    expect(statesOf()).toEqual(['completed', 'completed', 'active', 'upcoming'])
  })

  it('has no completed steps at index 0', () => {
    render(<Stepper steps={MIGRATION} activeIndex={0} />)
    expect(statesOf()).toEqual(['active', 'upcoming', 'upcoming', 'upcoming'])
  })

  it('ends with the last step current rather than done', () => {
    render(<Stepper steps={MIGRATION} activeIndex={3} />)
    expect(statesOf()).toEqual(['completed', 'completed', 'completed', 'active'])
  })

  it('marks exactly one step with aria-current', () => {
    render(<Stepper steps={MIGRATION} activeIndex={2} />)
    const current = steps().filter((node) => node.getAttribute('aria-current') === 'step')
    expect(current).toHaveLength(1)
    expect(current[0]?.textContent).toContain('Review')
  })

  it('reports its orientation, which is the only thing the layout branches on', () => {
    render(<Stepper steps={MIGRATION} activeIndex={1} orientation="vertical" />)
    const root = document.querySelector('ol') as HTMLElement
    expect(root.dataset['orientation']).toBe('vertical')
  })
})

describe('the number is visual only', () => {
  it('states each step’s position and state in words', () => {
    render(<Stepper steps={MIGRATION} activeIndex={2} />)
    expect(screen.getByText(', step 1 of 4, completed')).toBeTruthy()
    expect(screen.getByText(', step 3 of 4, current')).toBeTruthy()
    expect(screen.getByText(', step 4 of 4, not started')).toBeTruthy()
  })

  it('exposes the whole accessible name once, without the number', () => {
    // A revisitable step is the only one with an accessible *name* to check, and
    // it is composed from exactly the parts that are not hidden.
    render(<Stepper steps={MIGRATION} activeIndex={2} onStepSelect={() => {}} />)
    // A pattern rather than a string. The accessibility layer decides how the
    // parts of a name are joined, and asserting its spacing would test that layer.
    expect(screen.getByRole('button', { name: /^Connect\b.*step 1 of 4, completed$/ })).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /^Map fields\b.*step 2 of 4, completed$/ }),
    ).toBeTruthy()
  })

  it('hides the indicator from screen readers, whatever it contains', () => {
    render(<Stepper steps={MIGRATION} activeIndex={2} />)
    for (const indicator of indicators()) {
      expect(indicator.getAttribute('aria-hidden')).toBe('true')
    }
  })

  it('swaps the number for a check once a step is done', () => {
    const { container } = render(<Stepper steps={MIGRATION} activeIndex={2} />)
    // Two completed steps, two glyphs, and no digit left in either of them.
    expect(container.querySelectorAll('svg')).toHaveLength(2)
    expect(indicators().map((node) => node.textContent)).toEqual(['', '', '3', '4'])
  })

  it('keeps the check decorative, because the state is already in words', () => {
    const { container } = render(<Stepper steps={MIGRATION} activeIndex={1} />)
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('reads a description as part of the step rather than as a second row', () => {
    render(
      <Stepper
        steps={[{ label: 'Connect', description: 'Point us at your old help desk' }]}
        activeIndex={0}
        onStepSelect={() => {}}
      />,
    )
    expect(screen.getByText('Point us at your old help desk')).toBeTruthy()
    expect(screen.getByText(', step 1 of 1, current')).toBeTruthy()
  })
})

describe('revisiting', () => {
  it('renders no controls without onStepSelect', () => {
    render(<Stepper steps={MIGRATION} activeIndex={2} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(steps().some((node) => node.hasAttribute('data-interactive'))).toBe(false)
  })

  it('turns completed steps into real buttons, and nothing else', () => {
    render(<Stepper steps={MIGRATION} activeIndex={2} onStepSelect={() => {}} />)
    expect(screen.getAllByRole('button')).toHaveLength(2)
    expect(steps().map((node) => node.hasAttribute('data-interactive'))).toEqual([
      true,
      true,
      false,
      false,
    ])
  })

  it('reports which step was chosen', async () => {
    const onStepSelect = vi.fn()
    render(<Stepper steps={MIGRATION} activeIndex={2} onStepSelect={onStepSelect} />)
    await userEvent.click(screen.getAllByRole('button')[1] as HTMLElement)
    expect(onStepSelect).toHaveBeenCalledWith(1)
  })

  it.skipIf(TAB_PASSES_BUTTONS)('never lets an upcoming step be reached by keyboard', async () => {
    render(<Stepper steps={MIGRATION} activeIndex={2} onStepSelect={() => {}} />)
    const controls = screen.getAllByRole('button')
    ;(controls[0] as HTMLElement).focus()

    await userEvent.keyboard('{Tab}')
    expect(document.activeElement).toBe(controls[1])

    await userEvent.keyboard('{Tab}')
    expect(document.activeElement).not.toBe(controls[1])
    expect(steps()[3]?.contains(document.activeElement)).toBe(false)
  })
})

describe('the errored step', () => {
  const FAILED = [
    { label: 'Connect' },
    { label: 'Map fields', error: true },
    { label: 'Review' },
    { label: 'Import' },
  ]

  it('replaces the walk state in data-state with error', () => {
    render(<Stepper steps={FAILED} activeIndex={2} />)
    expect(statesOf()).toEqual(['completed', 'error', 'active', 'upcoming'])
  })

  it('uses the danger family on the indicator and replaces the number with the glyph', async () => {
    render(<Stepper steps={FAILED} activeIndex={2} />)
    const mark = indicators()[1] as HTMLElement
    expect(mark.querySelector('svg[data-icon="error"]')).toBeTruthy()
    expect(mark.textContent).not.toContain('2')
    await vi.waitFor(() => {
      const style = getComputedStyle(mark)
      expect(style.color).toBe(tokenColor('--pm-danger-text'))
      expect(style.backgroundColor).toBe(tokenColor('--pm-danger-subtle'))
      expect(style.borderTopColor).toBe(tokenColor('--pm-danger-border'))
    })
  })

  it('keeps the label in its walk colour', () => {
    render(<Stepper steps={FAILED} activeIndex={2} />)
    const label = screen.getByText('Map fields')
    expect(getComputedStyle(label).color).toBe(tokenColor('--pm-text-primary'))
  })

  it('announces "error" as the state word, not through the glyph', () => {
    render(<Stepper steps={FAILED} activeIndex={2} />)
    expect(steps()[1]?.textContent).toContain('step 2 of 4, error')
  })

  it('keeps aria-current on an errored active step, because position decides it', () => {
    render(
      <Stepper
        steps={[{ label: 'Connect' }, { label: 'Map fields', error: true }]}
        activeIndex={1}
      />,
    )
    expect(statesOf()).toEqual(['completed', 'error'])
    expect(steps()[1]?.getAttribute('aria-current')).toBe('step')
  })

  it('keeps the connector fill on activeIndex, and an errored completed step revisitable', () => {
    // The connectors stay filled despite the flag, and the errored step stays a
    // button, because it is the step the reader most needs to revisit.
    render(<Stepper steps={FAILED} activeIndex={2} onStepSelect={() => {}} />)
    const filled = steps().map((step) => step.querySelector('[data-filled]') !== null)
    expect(filled).toEqual([true, true, false, false])
    expect(screen.getAllByRole('button')).toHaveLength(2)
    expect(steps()[1]?.hasAttribute('data-interactive')).toBe(true)
  })
})

/**
 * An agent revisits a completed step through the bridge, as the spec's `agent` fence declares
 * (`design/components/stepper.md`, Agent). An upcoming step is never revisited.
 */
describe('an agent', () => {
  it('reads the steps, and revisits a completed step and no other', async () => {
    const bridge = createAgentBridge()
    try {
      const onStepSelect = vi.fn()
      render(
        <Stepper
          steps={[
            { label: 'Connect' },
            { label: 'Map fields', error: true },
            ...MIGRATION.slice(2),
          ]}
          activeIndex={2}
          onStepSelect={onStepSelect}
        />,
      )
      const [stepper] = bridge.snapshot().members
      expect(stepper?.state).toEqual({
        'active-index': 2,
        steps: [
          { label: 'Connect', state: 'completed' },
          { label: 'Map fields', state: 'error' },
          { label: 'Review', state: 'active' },
          { label: 'Import', state: 'upcoming' },
        ],
      })
      const back = await bridge.act([{ id: stepper?.id, action: 'set', value: 1 }])
      expect(back.results[0]).toMatchObject({ ok: true })
      expect(onStepSelect).toHaveBeenCalledWith(1)
      for (const index of [2, 3, -1]) {
        const refused = await bridge.act([{ id: stepper?.id, action: 'set', value: index }])
        expect(refused.results[0]).toMatchObject({ ok: false, error: { code: 'failed' } })
      }
      expect(onStepSelect).toHaveBeenCalledTimes(1)
    } finally {
      bridge.dispose()
    }
  })

  it('refuses every step when the steps are not revisitable', async () => {
    const bridge = createAgentBridge()
    try {
      render(<Stepper steps={MIGRATION} activeIndex={2} />)
      const [stepper] = bridge.snapshot().members
      const { results } = await bridge.act([{ id: stepper?.id, action: 'set', value: 0 }])
      expect(results[0]).toMatchObject({ ok: false, error: { code: 'failed' } })
    } finally {
      bridge.dispose()
    }
  })
})

/**
 * A horizontal Stepper in a container narrower than its steps. The steps'
 * labels are content, so the row gives a step the width its words need and
 * moves the steps that do not fit to the next line, in order. Nothing is cut
 * and no step is drawn over the one after it.
 */
describe('in a narrow container', () => {
  const box = (node: Element) => node.getBoundingClientRect()

  const overlapping = () => {
    const boxes = steps().map(box)
    return boxes.some((a, i) =>
      boxes.some(
        (b, j) =>
          j > i && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom,
      ),
    )
  }

  const insideItsStep = () =>
    steps().every((step) => {
      const label = step.querySelector('span[class*="label"]')
      return label !== null && box(label).right <= box(step).right + 0.5
    })

  it.each([
    [280, 'a phone’s column'],
    [420, 'a narrow pane'],
  ])('keeps every label inside its own step at %ipx, %s', (width) => {
    const host = fixedWidthHost(width)
    render(<Stepper steps={MIGRATION} activeIndex={2} />, { container: host })
    const root = host.querySelector('ol') as HTMLElement
    expect(insideItsStep()).toBe(true)
    expect(overlapping()).toBe(false)
    expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth)
    host.remove()
  })

  it('moves the steps that do not fit to the next line, in order', () => {
    const host = fixedWidthHost(280)
    render(<Stepper steps={MIGRATION} activeIndex={2} />, { container: host })
    const tops = steps().map((step) => Math.round(box(step).top))
    expect(new Set(tops).size).toBeGreaterThan(1)
    expect([...tops].sort((a, b) => a - b)).toEqual(tops)
    host.remove()
  })

  it('stays one row where the steps fit', () => {
    const host = fixedWidthHost(900)
    render(<Stepper steps={MIGRATION} activeIndex={2} />, { container: host })
    expect(new Set(steps().map((step) => Math.round(box(step).top))).size).toBe(1)
    host.remove()
  })
})
