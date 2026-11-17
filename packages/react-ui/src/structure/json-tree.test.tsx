import { render, screen } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { JsonTree, type JsonTreeProps } from './JsonTree'

/**
 * JsonTree, in a real browser.
 *
 * The tree draws whatever shape the data has (nested, empty, primitive, not JSON)
 * without crashing. Browsing is native disclosure: real buttons named by their
 * contents, reachable by Tab, with `aria-expanded` as the only state.
 */

beforeAll(installTestTheme)

const PAYLOAD = {
  id: 'tkt_5417',
  priority: 2,
  resolved: false,
  assignee: { name: 'Ada Okonkwo', team: 'Platform' },
  labels: ['sync', 'performance'],
  closedAt: null,
}

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<JsonTreeProps>(true)
  })
})

describe('the data’s own shape', () => {
  it('is a named list with the first level open by default', () => {
    render(<JsonTree data={PAYLOAD} label="Response body" />)
    expect(screen.getByRole('list', { name: 'Response body' })).toBeTruthy()
    // Level one is visible: primitive leaves and two collapsed branches.
    expect(screen.getByText('"tkt_5417"')).toBeTruthy()
    expect(screen.getByRole('button', { name: /assignee.*2 keys/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /labels.*2 items/ })).toBeTruthy()
    // Level two is not. Collapsed means unmounted, not hidden.
    expect(screen.queryByText('"Ada Okonkwo"')).toBeNull()
  })

  it('marks every kind with an attribute and prints values as JSON does', () => {
    render(<JsonTree data={PAYLOAD} label="Response body" />)
    expect(screen.getByText('"tkt_5417"').getAttribute('data-kind')).toBe('string')
    expect(screen.getByText('2').getAttribute('data-kind')).toBe('number')
    expect(screen.getByText('false').getAttribute('data-kind')).toBe('boolean')
    expect(screen.getByText('null').getAttribute('data-kind')).toBe('null')
  })

  it('draws empty containers as leaves, with no toggle', () => {
    render(<JsonTree data={{ empty: {}, none: [] }} label="Empty" defaultDepth={Infinity} />)
    // One toggle, for the root, which holds the two entries. The empty
    // containers inside it get no toggle of their own.
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByText('{}')).toBeTruthy()
    expect(screen.getByText('[]')).toBeTruthy()
  })

  it('draws a primitive root as a single leaf', () => {
    render(<JsonTree data={42} label="A number alone" />)
    expect(screen.getByText('42').getAttribute('data-kind')).toBe('number')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('prints non-JSON values instead of crashing', () => {
    render(<JsonTree data={{ oops: undefined }} label="Not quite JSON" />)
    expect(screen.getByText('undefined').getAttribute('data-kind')).toBe('null')
  })
})

describe('browsing', () => {
  it('opens and closes from the toggle, and collapsed means unmounted', async () => {
    render(<JsonTree data={PAYLOAD} label="Response body" />)
    const branch = screen.getByRole('button', { name: /assignee.*2 keys/ })
    expect(branch.getAttribute('aria-expanded')).toBe('false')

    await userEvent.click(branch)
    expect(branch.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('"Ada Okonkwo"')).toBeTruthy()

    await userEvent.click(branch)
    expect(branch.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('"Ada Okonkwo"')).toBeNull()
  })

  it('opens every level with defaultDepth Infinity, with indexes for array entries', () => {
    render(<JsonTree data={PAYLOAD} label="Response body" defaultDepth={Infinity} />)
    expect(screen.getByText('"Ada Okonkwo"')).toBeTruthy()
    expect(screen.getByText('"sync"')).toBeTruthy()
    for (const toggle of screen.getAllByRole('button')) {
      expect(toggle.getAttribute('aria-expanded')).toBe('true')
    }
  })

  it('starts fully collapsed at depth 0', () => {
    render(<JsonTree data={PAYLOAD} label="Response body" defaultDepth={0} />)
    const [root] = screen.getAllByRole('button')
    expect(root?.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('"tkt_5417"')).toBeNull()
  })

  it('toggles on Enter through native button behaviour, with no key script', async () => {
    render(<JsonTree data={PAYLOAD} label="Response body" />)
    const branch = screen.getByRole('button', { name: /assignee.*2 keys/ })
    branch.focus()
    await userEvent.keyboard('{Enter}')
    expect(branch.getAttribute('aria-expanded')).toBe('true')
  })
})

describe('an agent', () => {
  it('reads the branches a reader can see by their JSON Pointer, and which are open', () => {
    const bridge = createAgentBridge()
    try {
      render(<JsonTree data={PAYLOAD} label="Response body" />)
      const [tree] = bridge.snapshot().members
      expect(tree).toMatchObject({
        member: 'JsonTree',
        name: 'Response body',
        state: {
          expanded: [''],
          branches: [
            { id: '', label: '{…} 6 keys' },
            { id: '/assignee', label: 'assignee:{…} 2 keys' },
            { id: '/labels', label: 'labels:[…] 2 items' },
          ],
        },
        actions: [
          { name: 'expand', argument: 'id' },
          { name: 'collapse', argument: 'id' },
        ],
      })
    } finally {
      bridge.dispose()
    }
  })

  it('opens and closes a branch by pressing its toggle, and keeps every other id', async () => {
    const bridge = createAgentBridge()
    try {
      render(<JsonTree data={{ outer: { inner: { deep: 1 } } }} label="Nested" />)
      const id = bridge.snapshot().members[0]?.id ?? ''
      const opened = await bridge.act([
        { id, action: 'expand', value: '/outer' },
        { id, action: 'expand', value: '/outer/inner' },
      ])
      expect(opened.results.every((result) => result.ok)).toBe(true)
      expect(bridge.snapshot().members[0]?.state['expanded']).toEqual([
        '',
        '/outer',
        '/outer/inner',
      ])
      expect(screen.getByText('1')).toBeTruthy()

      const closed = await bridge.act([{ id, action: 'collapse', value: '/outer' }])
      expect(closed.results[0]).toMatchObject({
        ok: true,
        changed: { expanded: { from: ['', '/outer', '/outer/inner'], to: [''] } },
      })
      // A branch inside a closed one is not drawn, so it is not a choice.
      const hidden = await bridge.act([{ id, action: 'expand', value: '/outer/inner' }])
      expect(hidden.results[0]).toMatchObject({ ok: false, error: { code: 'invalid-value' } })
    } finally {
      bridge.dispose()
    }
  })
})
