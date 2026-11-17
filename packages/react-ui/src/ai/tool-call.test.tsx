import { render, screen } from '@testing-library/react'
import { useState } from 'react'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assertGoverned } from '@polymorph/react'
import { createAgentBridge } from '@polymorph/engine/agent'
import { agentRegistrations, installTestTheme } from '@polymorph/engine/testing'
import { CodeBlock } from '../structure/CodeBlock'
import { ToolCall, type ToolCallProps } from './ToolCall'

/**
 * ToolCall, in a real browser.
 *
 * The status must reach a reader in two ways: as a glyph that moves or changes
 * colour, and as text in the trigger's name. The body must render its input
 * by type: a value as a tree, a string as code. Collapsible's tests cover the
 * disclosure. These tests check that a call with no body is a row and not a
 * button that opens nothing.
 */

beforeAll(installTestTheme)

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<ToolCallProps>(true)
  })
})

describe('status reaches a reader in two ways', () => {
  it('names the row with the tool and the status, and spins while running', () => {
    const { container } = render(
      <ToolCall name="read_file" summary="src/a.ts" status="running" input={{ path: 'a' }} />,
    )
    const trigger = screen.getByRole('button', { name: /read_file.*Running/ })
    expect(trigger).toBeTruthy()
    expect((container.firstElementChild as HTMLElement).getAttribute('aria-busy')).toBe('true')
    const spinning = container.querySelector('[class*="spinning"]') as HTMLElement
    // The glyph runs one animation, and while running it is the loop and not the fade.
    expect(getComputedStyle(spinning).animationName).toContain('spin')
    expect(getComputedStyle(spinning).animationIterationCount).toBe('infinite')
  })

  it('fades in the glyph of a status that is not running', () => {
    const { container } = render(
      <ToolCall name="read_file" summary="src/a.ts" status="done" input={{ path: 'a' }} />,
    )
    const glyph = container.querySelector('[class*="_status_"]') as HTMLElement
    expect(getComputedStyle(glyph).animationName).toContain('tool-call-status')
  })

  it('announces the status in the app’s text', () => {
    render(
      <ToolCall
        name="read_file"
        status="done"
        input="x"
        messages={{
          input: 'Eingabe',
          output: 'Ausgabe',
          status: {
            pending: 'Wartet',
            running: 'Läuft',
            done: 'Fertig',
            error: 'Fehlgeschlagen',
            denied: 'Abgelehnt',
            approval: 'Wartet auf Freigabe',
          },
        }}
      />,
    )
    expect(screen.getByRole('button', { name: /Fertig/ })).toBeTruthy()
  })
})

describe('the body renders its content by type', () => {
  it('renders a value as a JsonTree and the output as composed', async () => {
    render(
      <ToolCall
        name="read_file"
        status="done"
        input={{ path: 'src/a.ts', range: { start: 1, end: 80 } }}
        output={<CodeBlock>export const A = 1</CodeBlock>}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /read_file/ }))
    expect(document.querySelector('[data-member="json-tree"]')).toBeTruthy()
    expect(document.querySelector('[data-member="code-block"]')?.textContent).toBe(
      'export const A = 1',
    )
    expect(screen.getByText('Input')).toBeTruthy()
    expect(screen.getByText('Output')).toBeTruthy()
  })

  it('renders a string as a CodeBlock', async () => {
    render(<ToolCall name="run_command" status="done" input="pnpm test" defaultOpen />)
    expect(document.querySelector('[data-member="code-block"]')?.textContent).toBe('pnpm test')
    expect(document.querySelector('[data-member="json-tree"]')).toBeNull()
  })

  it('shows the app’s text for a failure', async () => {
    render(
      <ToolCall name="search_web" status="error" message="Provider returned 429." defaultOpen />,
    )
    expect(screen.getByText('Provider returned 429.')).toBeTruthy()
  })
})

describe('a call with nothing inside', () => {
  it('is a row, not a button that opens nothing', () => {
    render(<ToolCall name="list_tools" status="done" />)
    const trigger = screen.getByRole('button', { name: /list_tools/ }) as HTMLButtonElement
    expect(trigger.disabled).toBe(true)
    expect(trigger.querySelectorAll('svg')).toHaveLength(2)
  })
})

/**
 * An agent reads a call's status and expands its details (`design/components/tool-call.md`,
 * Agent) through the member's own open state, so `onOpenChange` reports it in both forms.
 */
describe('an agent', () => {
  it('expands an uncontrolled and a controlled call through its own open state', async () => {
    const free = vi.fn()
    const held = vi.fn()
    function Held() {
      const [open, setOpen] = useState(false)
      return (
        <ToolCall
          name="run_command"
          status="done"
          input="pnpm test"
          open={open}
          onOpenChange={(next) => {
            held(next)
            setOpen(next)
          }}
        />
      )
    }
    render(
      <>
        <ToolCall name="read_file" status="running" input={{ path: 'a.ts' }} onOpenChange={free} />
        <Held />
      </>,
    )
    const bridge = createAgentBridge()
    try {
      const [one, two] = bridge.snapshot().members
      expect(one).toMatchObject({
        member: 'ToolCall',
        name: expect.stringContaining('read_file'),
        state: { status: 'running', expanded: false },
      })
      for (const member of [one, two]) {
        const { results } = await bridge.act([{ id: member?.id, action: 'expand' }])
        expect(results[0]).toMatchObject({
          ok: true,
          changed: { expanded: { from: false, to: true } },
        })
      }
      expect(free).toHaveBeenCalledWith(true)
      expect(held).toHaveBeenCalledWith(true)
      expect(
        screen.getByRole('button', { name: /run_command/ }).getAttribute('aria-expanded'),
      ).toBe('true')
    } finally {
      bridge.dispose()
    }
  })

  it('lists a value input’s JsonTree by its label, and the members the app passed as output', () => {
    render(
      <>
        <ToolCall name="run_command" status="done" input="pnpm test" defaultOpen />
        <ToolCall
          name="read_file"
          status="done"
          input={{ path: 'src/a.ts' }}
          output={
            <CodeBlock label="Output" copyable copyLabel="Copy the output">
              ok
            </CodeBlock>
          }
          defaultOpen
        />
      </>,
    )
    // A string input's CodeBlock has no copy control, so it registers nothing. A value input's
    // JsonTree registers, and so does the copy Button of the output the app passed.
    const calls = [...document.querySelectorAll('[data-member="tool-call"]')]
    expect(calls).toHaveLength(2)
    const inside = agentRegistrations().filter(
      (entry) =>
        entry.member !== 'ToolCall' && calls.some((call) => call.contains(entry.element ?? null)),
    )
    expect(inside.map((entry) => entry.member).sort()).toEqual(['Button', 'JsonTree'])
    expect(calls[0]?.contains(inside[0]?.element ?? null)).toBe(false)
    expect(calls[0]?.contains(inside[1]?.element ?? null)).toBe(false)
    const bridge = createAgentBridge()
    try {
      const members = bridge.snapshot().members
      expect(members.map((member) => member.member)).toEqual([
        'ToolCall',
        'ToolCall',
        'JsonTree',
        'Button',
      ])
      const [, call, tree, copy] = members
      expect(call?.name).toContain('read_file')
      expect(tree).toMatchObject({
        name: 'Input',
        actions: [
          { name: 'expand', argument: 'id' },
          { name: 'collapse', argument: 'id' },
        ],
      })
      expect(copy).toMatchObject({ name: 'Copy the output' })
      expect(new Set([tree?.id, copy?.id])).toEqual(new Set(inside.map((entry) => entry.id)))
      // The call's element is its trigger, which holds neither its input nor its output.
      expect(tree?.within).toBeUndefined()
      expect(copy?.within).toBeUndefined()
    } finally {
      bridge.dispose()
    }
  })

  it('lets an agent open a branch of a value input as a person does', async () => {
    render(
      <ToolCall
        name="read_file"
        status="done"
        input={{ path: 'src/a.ts', range: { start: 1, end: 80 } }}
        defaultOpen
      />,
    )
    const bridge = createAgentBridge()
    try {
      const tree = bridge.snapshot().members.find((member) => member.member === 'JsonTree')
      expect(tree?.state['expanded']).toEqual([''])
      const { results } = await bridge.act([{ id: tree?.id, action: 'expand', value: '/range' }])
      expect(results[0]).toMatchObject({
        ok: true,
        changed: { expanded: { from: [''], to: ['', '/range'] } },
      })
      expect(screen.getByRole('button', { name: /range/ }).getAttribute('aria-expanded')).toBe(
        'true',
      )
    } finally {
      bridge.dispose()
    }
  })

  it('refuses to expand a call with nothing inside, whose trigger is disabled', async () => {
    const onOpenChange = vi.fn()
    render(<ToolCall name="list_tools" status="done" onOpenChange={onOpenChange} />)
    const bridge = createAgentBridge()
    try {
      const [call] = bridge.snapshot().members
      const { results } = await bridge.act([{ id: call?.id, action: 'expand' }])
      expect(results[0]).toMatchObject({
        ok: false,
        error: { code: 'failed', message: expect.stringContaining('nothing to show') },
      })
      expect(onOpenChange).not.toHaveBeenCalled()
      expect(bridge.snapshot().members[0]?.state).toEqual({ status: 'done', expanded: false })
    } finally {
      bridge.dispose()
    }
  })
})
