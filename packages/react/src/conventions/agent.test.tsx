import { act, cleanup, render } from '@testing-library/react'
import { StrictMode, useRef, useState } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { agentFill, agentPress } from '@polymorph/engine'
import { createAgentBridge, type AgentBridge } from '@polymorph/engine/agent'

import { useAgentMember } from './agent'

/**
 * `useAgentMember`, which registers a React member with the agent registry
 * while it is mounted, and the engine's `agentFill` against React's own
 * change tracking.
 */

const bridges: AgentBridge[] = []

afterEach(() => {
  cleanup()
  bridges.splice(0).forEach((bridge) => bridge.dispose())
})

/**
 * Runs an agent's steps as they run on a page, outside React's test `act`
 * scope. Inside it React holds every update until the scope ends, so the
 * bridge, which waits for the member to render, would wait for nothing.
 */
async function asAgent<T>(run: () => Promise<T>): Promise<T> {
  const scope = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  const was = scope.IS_REACT_ACT_ENVIRONMENT
  scope.IS_REACT_ACT_ENVIRONMENT = false
  try {
    return await run()
  } finally {
    scope.IS_REACT_ACT_ENVIRONMENT = was
  }
}

function bridgeOf(): AgentBridge {
  const bridge = createAgentBridge({ settleMs: 100 })
  bridges.push(bridge)
  return bridge
}

/** A counter registered as an agent member: it reads `count` and runs `add` and `set`. */
function Counter({
  label = 'Count',
  onChange,
}: {
  label?: string
  onChange?: (next: number) => void
}) {
  const [count, setCount] = useState(0)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const change = (next: number) => {
    setCount(next)
    onChange?.(next)
  }
  useAgentMember({
    member: 'Counter',
    element: () => buttonRef.current,
    state: () => ({ count }),
    actions: {
      add: () => change(count + 1),
      set: { argument: 'number', run: (value) => change(value) },
    },
  })
  return (
    <button ref={buttonRef} type="button" aria-label={label} onClick={() => change(count + 1)}>
      {count}
    </button>
  )
}

describe('useAgentMember', () => {
  it('registers a member on mount and removes it on unmount', () => {
    const bridge = bridgeOf()
    const { unmount } = render(<Counter />)
    expect(bridge.snapshot().members).toEqual([
      {
        id: expect.stringMatching(/^counter-\d+$/),
        member: 'Counter',
        name: 'Count',
        state: { count: 0 },
        actions: [{ name: 'add' }, { name: 'set', argument: 'number' }],
      },
    ])
    unmount()
    expect(bridge.snapshot().members).toEqual([])
  })

  it('reads the latest render and calls the latest setter, without registering again', async () => {
    const bridge = bridgeOf()
    const onChange = vi.fn()
    const { rerender, container } = render(<Counter onChange={onChange} />)
    const [first] = bridge.snapshot().members
    const id = first?.id

    // A person's press, then a new prop: the handle reads both.
    act(() => (container.querySelector('button') as HTMLButtonElement).click())
    rerender(<Counter label="Total" onChange={onChange} />)
    expect(
      bridge.snapshot().members.map((member) => [member.id, member.name, member.state]),
    ).toEqual([[id, 'Total', { count: 1 }]])

    // An action runs the closure of the render on screen: one more than the count shown.
    const result = await asAgent(() =>
      bridge.act([
        { id, action: 'add' },
        { id, action: 'set', value: 7 },
      ]),
    )
    expect(result.results).toEqual([
      { ok: true, id, changed: { count: { from: 1, to: 2 } } },
      { ok: true, id, changed: { count: { from: 2, to: 7 } } },
    ])
    expect(onChange.mock.calls).toEqual([[1], [2], [7]])
    expect(container.textContent).toBe('7')
  })

  it('hands the bridge the list an id action chooses among, and the bridge holds it to that list', async () => {
    function Picker({ onPick }: { onPick: (id: string) => void }) {
      const ref = useRef<HTMLButtonElement>(null)
      useAgentMember({
        member: 'Picker',
        element: () => ref.current,
        state: () => ({
          items: [{ id: 'a', label: 'A' }],
          series: [{ id: 's', label: 'S' }],
        }),
        actions: {
          choose: { argument: 'id', among: 'items', run: (id) => onPick(id) },
          toggle: { argument: 'id', among: 'series', run: (id) => onPick(id) },
        },
      })
      return <button ref={ref} type="button" aria-label="Picker" />
    }
    const bridge = bridgeOf()
    const onPick = vi.fn()
    render(<Picker onPick={onPick} />)
    const [picker] = bridge.snapshot().members
    expect(picker?.actions).toEqual([
      { name: 'choose', argument: 'id', among: 'items' },
      { name: 'toggle', argument: 'id', among: 'series' },
    ])
    const { results } = await asAgent(() =>
      bridge.act([
        { id: picker?.id, action: 'toggle', value: 's' },
        { id: picker?.id, action: 'choose', value: 's' },
      ]),
    )
    expect(results.map((result) => (result.ok ? 'ok' : result.error.code))).toEqual([
      'ok',
      'invalid-value',
    ])
    expect(onPick.mock.calls).toEqual([['s']])
  })

  it('holds one registration under strict mode', () => {
    const bridge = bridgeOf()
    render(
      <StrictMode>
        <Counter />
      </StrictMode>,
    )
    expect(bridge.snapshot().members).toHaveLength(1)
  })

  it('registers nothing while `unless` holds, and registers when it stops holding', () => {
    function Stood({ stoodFor }: { stoodFor: boolean }) {
      const ref = useRef<HTMLButtonElement>(null)
      useAgentMember(
        { member: 'Stood', element: () => ref.current, state: () => ({}), actions: {} },
        { unless: stoodFor },
      )
      return <button ref={ref} type="button" aria-label="Stood" />
    }
    const bridge = bridgeOf()
    const { rerender } = render(<Stood stoodFor />)
    expect(bridge.snapshot().members).toEqual([])
    rerender(<Stood stoodFor={false} />)
    expect(bridge.snapshot().members.map((member) => member.member)).toEqual(['Stood'])
    rerender(<Stood stoodFor />)
    expect(bridge.snapshot().members).toEqual([])
  })

  it('registers nothing in a server render', () => {
    const bridge = bridgeOf()
    expect(renderToString(<Counter />)).toContain('aria-label="Count"')
    expect(bridge.snapshot().members).toEqual([])
  })

  it("tells the member's handler that an agent made the change", async () => {
    const bridge = bridgeOf()
    const seen: boolean[] = []
    const { container } = render(<Counter onChange={() => seen.push(bridge.acting)} />)
    const id = bridge.snapshot().members[0]?.id
    await asAgent(() => bridge.act([{ id, action: 'add' }]))
    act(() => (container.querySelector('button') as HTMLButtonElement).click())
    expect(seen).toEqual([true, false])
  })
})

describe("agentFill and React's change tracking", () => {
  function Field({ onValue }: { onValue: (value: string) => void }) {
    const [value, setValue] = useState('')
    return (
      <input
        aria-label="Title"
        value={value}
        onChange={(event) => {
          setValue(event.target.value)
          onValue(event.target.value)
        }}
      />
    )
  }

  it("runs a controlled field's onChange and keeps the value React renders", () => {
    const onValue = vi.fn()
    const { container } = render(<Field onValue={onValue} />)
    const field = container.querySelector('input') as HTMLInputElement
    act(() => agentFill(field, 'Ada'))
    expect(onValue).toHaveBeenCalledWith('Ada')
    expect(field.value).toBe('Ada')
    act(() => agentFill(field, 'Ada Lovelace'))
    expect(onValue).toHaveBeenLastCalledWith('Ada Lovelace')
    expect(field.value).toBe('Ada Lovelace')
  })

  it("is needed: a write through the element's own value is a change React does not hear", () => {
    const onValue = vi.fn()
    const { container } = render(<Field onValue={onValue} />)
    const field = container.querySelector('input') as HTMLInputElement
    act(() => {
      field.value = 'Ada'
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(onValue).not.toHaveBeenCalled()
  })

  it("runs an uncontrolled textarea's onChange", () => {
    const onChange = vi.fn()
    const { container } = render(
      <textarea aria-label="Notes" onChange={(event) => onChange(event.target.value)} />,
    )
    act(() => agentFill(container.querySelector('textarea'), 'Two\nlines'))
    expect(onChange).toHaveBeenCalledWith('Two\nlines')
  })

  it("presses with React's own click handling", () => {
    const onClick = vi.fn()
    const { container } = render(
      <button type="button" onClick={onClick}>
        Save
      </button>,
    )
    act(() => agentPress(container.querySelector('button')))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
