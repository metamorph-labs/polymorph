import { render } from '@testing-library/react'
import { useState } from 'react'
import { beforeAll, describe, expect, it } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { planLaw, type PlanLawProps } from '@polymorph/conformance/plan'
import { installTestTheme } from '@polymorph/engine/testing'
import { Plan, type PlanProps, type PlanStep } from './Plan'

/**
 * What a Plan says, and when its status line changes, is the law every shell
 * runs (`@polymorph/conformance/plan`). The tests after it are the claims a
 * browser settles for the recipe, which every shell shares: a running glyph
 * spins and the others fade in, a pending or skipped step is quieter than a
 * done one, and the glyph stays beside a wrapped title's first line.
 */

beforeAll(installTestTheme)

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<PlanProps>(true)
  })
})

planLaw({
  shell: 'React',
  mount(props) {
    let change: (next: Partial<PlanLawProps>) => void = () => {}
    function Held() {
      const [held, setHeld] = useState(props)
      change = (next) => setHeld((was) => ({ ...was, ...next }))
      return <Plan label="Plan for this run" {...held} />
    }
    render(<Held />)
    return Promise.resolve({ set: (next) => change(next) })
  },
})

const EVERY_STATUS: PlanStep[] = [
  { id: 'done', title: 'A step that is done', status: 'done' },
  { id: 'running', title: 'A step that is running', status: 'running' },
  { id: 'error', title: 'A step that failed', status: 'error' },
  { id: 'skipped', title: 'A step that was skipped', status: 'skipped' },
  { id: 'pending', title: 'A step that has not started', status: 'pending' },
]

/** The step with this status, as drawn. */
const stepOf = (status: string) =>
  document.querySelector<HTMLElement>(
    `[data-member="plan"] li[data-status="${status}"]`,
  ) as HTMLElement

/** A step's title: the first part of its text. */
const titleOf = (status: string) =>
  stepOf(status).querySelector<HTMLElement>(':scope > :last-child > :first-child') as HTMLElement

/** A step's glyph: the element inside its mark that animates. */
const glyphOf = (status: string) =>
  stepOf(status).querySelector<HTMLElement>('[aria-hidden="true"] > span') as HTMLElement

describe('the recipe', () => {
  it('spins a running glyph and fades the others in', () => {
    render(<Plan label="Every status" steps={EVERY_STATUS} />)

    expect(getComputedStyle(glyphOf('running')).animationName).toContain('spin')
    for (const status of ['done', 'error', 'skipped', 'pending']) {
      expect(getComputedStyle(glyphOf(status)).animationName).toContain('plan-status')
    }
  })

  it('draws a pending or skipped step quieter than a done one, by its text role', () => {
    render(<Plan label="Every status" steps={EVERY_STATUS} />)

    const colour = (status: string) => getComputedStyle(titleOf(status)).color
    expect(titleOf('done').textContent).toBe('A step that is done')
    expect(colour('pending')).not.toBe(colour('done'))
    expect(colour('skipped')).toBe(colour('pending'))
    // A running or failed step reads as plainly as a done one: the glyph shows the flag.
    expect(colour('running')).toBe(colour('done'))
    expect(colour('error')).toBe(colour('done'))
  })

  it('keeps the glyph beside the first line of a title that wraps', () => {
    const { container } = render(
      <Plan
        label="Plan for this run"
        steps={[
          {
            id: 'long',
            title: 'Build the idempotency key after the promo code is applied, then retry',
            status: 'done',
          },
        ]}
      />,
    )
    ;(container.firstElementChild as HTMLElement).style.inlineSize = '10rem'

    const title = titleOf('done').getBoundingClientRect()
    const mark = (stepOf('done').firstElementChild as HTMLElement).getBoundingClientRect()
    const lineHeight = Number.parseFloat(getComputedStyle(titleOf('done')).lineHeight)
    expect(title.height).toBeGreaterThan(lineHeight * 1.5)
    expect(Math.abs(mark.top - title.top)).toBeLessThan(1)
    expect(Math.abs(mark.height - lineHeight)).toBeLessThan(1)
  })
})
