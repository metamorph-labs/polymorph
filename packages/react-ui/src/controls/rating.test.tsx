import { render, screen } from '@testing-library/react'
import { useState } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { ratingLaw } from '@polymorph/conformance/rating'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { FormField } from './FormField'
import { Rating, type RatingProps } from './Rating'

/**
 * Rating (`design/components/rating.md`). What a press and a key do, the clear rule, the posted
 * value and the drawing are `@polymorph/conformance/rating`, which every web shell's Rating
 * test calls. This file adds what only the React member shows: its closed surface and
 * FormField's wiring.
 */

beforeAll(installTestTheme)

ratingLaw({
  shell: 'React',
  async mount(props) {
    render(<Rating {...props} />)
  },
})

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<RatingProps>(true)
  })
})

describe('in a FormField', () => {
  it('is named by the field label, and carries its error and required state', () => {
    render(
      <FormField label="How was this answer?" error="Choose a rating." required>
        <Rating label="Answer rating" />
      </FormField>,
    )
    const group = screen.getByRole('radiogroup', {
      name: 'How was this answer?',
      description: 'Choose a rating.',
    })
    expect(group.getAttribute('aria-invalid')).toBe('true')
    expect(group.getAttribute('aria-required')).toBe('true')
    expect(group.dataset['invalid']).toBe('')
  })
})

/**
 * An agent chooses a mark and clears a Rating as a press does, as its spec's `agent` fence
 * declares (`design/components/rating.md`, Agent), and is refused what no press does.
 */
describe('an agent', () => {
  it('sets and clears an uncontrolled and a controlled Rating, reporting each change once', async () => {
    const bridge = createAgentBridge()
    try {
      const onChange = vi.fn()
      function Held() {
        const [value, setValue] = useState<number | null>(2)
        return <Rating label="Held" value={value} onChange={setValue} />
      }
      render(
        <>
          <Rating label="Free" onChange={onChange} />
          <Held />
        </>,
      )
      const [free, held] = bridge.snapshot().members
      expect(free).toMatchObject({
        member: 'Rating',
        name: 'Free',
        state: { value: null, max: 5, readonly: false },
      })
      const { results } = await bridge.act([
        { id: free?.id, action: 'set', value: 4 },
        { id: free?.id, action: 'set', value: 4 },
        { id: free?.id, action: 'clear' },
        { id: held?.id, action: 'set', value: 5 },
      ])
      expect(results).toMatchObject([
        { ok: true, changed: { value: { from: null, to: 4 } } },
        { ok: true, changed: {} },
        { ok: true, changed: { value: { from: 4, to: null } } },
        { ok: true, changed: { value: { from: 2, to: 5 } } },
      ])
      expect(onChange.mock.calls).toEqual([[4], [null]])
    } finally {
      bridge.dispose()
    }
  })

  it('refuses what no press does: a number that is no mark, a required clear, a shown rating', async () => {
    const bridge = createAgentBridge()
    try {
      const onChange = vi.fn()
      render(
        <>
          <Rating label="Score" defaultValue={3} aria-required onChange={onChange} />
          <Rating label="Average" value={4.3} readOnly />
        </>,
      )
      const [score, average] = bridge.snapshot().members
      expect(average?.state).toMatchObject({ value: 4.3, readonly: true })
      for (const [id, step, words] of [
        [score?.id, { action: 'set', value: 0 }, 'whole number from 1 to 5'],
        [score?.id, { action: 'set', value: 6 }, 'whole number from 1 to 5'],
        [score?.id, { action: 'set', value: 2.5 }, 'whole number from 1 to 5'],
        [score?.id, { action: 'clear' }, 'keeps its mark'],
        [average?.id, { action: 'set', value: 4 }, 'takes no press'],
      ] as const) {
        const { results } = await bridge.act([{ id, ...step }])
        expect(results[0]).toMatchObject({
          ok: false,
          error: { code: 'failed', message: expect.stringContaining(words) },
        })
      }
      expect(onChange).not.toHaveBeenCalled()
    } finally {
      bridge.dispose()
    }
  })
})
