import { render, screen } from '@testing-library/react'
import { useState } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { FormField } from './FormField'
import { SearchInput, type SearchInputProps } from './SearchInput'

/**
 * SearchInput, in a real browser.
 *
 * The member's behaviour (the fixed `search` icon, `clearable`, and the hint that gives
 * way to the clear button) comes from Input through composition and is tested in
 * `input.test.tsx`. This file tests the one thing composition does not provide: the
 * final width.
 *
 * A wrapper around an Input affects its width. The Input inside is a flex item of the
 * wrapper, so by default it sizes to its content, whatever width the root has.
 * PasswordInput has the same structure and the same fix (`password-input.test.tsx`).
 * Here FilterBar shows the problem: below `36rem` it gives each control its own line,
 * and the search box would be narrower than the Selects below it.
 */

beforeAll(installTestTheme)

/** The Input's bordered frame, not the bare `<input>`, because the frame is the field. */
const frame = () =>
  (document.querySelector('input') as HTMLInputElement).parentElement as HTMLElement

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<SearchInputProps>(true)
  })
})

describe('it fills the width it is given', () => {
  const WIDE = 640

  /** The harness from `form-field.test.tsx`: the container is sized and the field is not. */
  function inWideColumn(node: React.ReactElement): HTMLElement {
    const { container } = render(node)
    ;(container as HTMLElement).style.inlineSize = `${WIDE}px`
    return container.firstElementChild as HTMLElement
  }

  it('stretches the composed Input to the width of a column-labelled field', () => {
    const column = inWideColumn(
      <FormField label="Search accounts">
        <SearchInput />
      </FormField>,
    )
    expect(column.getBoundingClientRect().width).toBeCloseTo(WIDE, 0)
    expect(frame().getBoundingClientRect().width).toBeCloseTo(WIDE, 0)
  })

  it('fills a stretched row as FilterBar stretches one below 36rem', () => {
    // Not FilterBar itself. The test is about a root that something else has widened,
    // and the bar's container query would make this a test of the bar.
    const { container } = render(<SearchInput aria-label="Search tickets" />)
    const holder = container as HTMLElement
    holder.style.display = 'flex'
    holder.style.inlineSize = `${WIDE}px`
    const root = holder.firstElementChild as HTMLElement
    root.style.flex = '1 0 100%'

    expect(root.getBoundingClientRect().width).toBeCloseTo(WIDE, 0)
    expect(frame().getBoundingClientRect().width).toBeCloseTo(WIDE, 0)
  })

  it('keeps its own width when nothing stretches it', () => {
    // The rule uses grow rather than `inline-size: 100%`. An unstretched search box is
    // as wide as its content, like an Input, and filter rows contain many of them. The
    // root and the field inside it share the same edges in both cases.
    const root = inWideColumn(<SearchInput aria-label="Search tickets" />)
    const width = root.getBoundingClientRect().width
    expect(width).toBeLessThan(WIDE)
    expect(frame().getBoundingClientRect().width).toBeCloseTo(width, 0)
  })
})

/**
 * An agent sees one SearchInput where a person sees one search box, with the Input it draws
 * withheld, and fills and clears it through the field, as its spec's `agent` fence declares
 * (`design/components/search-input.md`, Agent), whether or not the caller controls the value.
 */
describe('an agent', () => {
  it('sees one member, and fills and clears an uncontrolled and a controlled SearchInput', async () => {
    const bridge = createAgentBridge()
    try {
      const free = vi.fn()
      function Held() {
        const [value, setValue] = useState('first')
        return <SearchInput aria-label="Held" value={value} onChange={setValue} />
      }
      render(
        <>
          <SearchInput aria-label="Free" onChange={free} />
          <Held />
        </>,
      )
      const members = bridge.snapshot().members
      expect(members.map((member) => [member.member, member.name])).toEqual([
        ['SearchInput', 'Free'],
        ['SearchInput', 'Held'],
      ])
      expect(bridge.query({ member: 'Input' })).toEqual([])
      const [one, two] = members

      const filled = await bridge.act([{ id: one?.id, action: 'fill', value: 'webhook' }])
      expect(filled.results[0]).toEqual({
        ok: true,
        id: one?.id,
        changed: { value: { from: '', to: 'webhook' } },
      })
      expect(free).toHaveBeenLastCalledWith('webhook')

      const held = await bridge.act([
        { id: two?.id, action: 'fill', value: 'second' },
        { id: two?.id, action: 'clear' },
      ])
      expect(held.results).toMatchObject([
        { ok: true, changed: { value: { from: 'first', to: 'second' } } },
        { ok: true, changed: { value: { from: 'second', to: '' } } },
      ])
      expect(screen.getByLabelText('Held')).toHaveProperty('value', '')
    } finally {
      bridge.dispose()
    }
  })
})
