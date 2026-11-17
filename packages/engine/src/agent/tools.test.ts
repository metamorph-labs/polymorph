import { afterEach, describe, expect, it, vi } from 'vitest'

import { agentMember } from '../conventions/agent'
import { createAgentBridge, type AgentBridge } from './bridge'
import { agentTools, registerWebMCP } from './tools'

/**
 * The bridge as tools: the plain list an application hands its own agent,
 * and the same tools on the browser's WebMCP API, against a stub of the
 * current draft's shape (`document.modelContext`, unregistered by a signal)
 * and of an earlier build's (`navigator.modelContext`, unregistered by name).
 */

const releases: (() => void)[] = []

afterEach(() => {
  releases.splice(0).forEach((release) => release())
  document.body.replaceChildren()
})

function page(): AgentBridge {
  const box = document.createElement('button')
  box.setAttribute('aria-label', 'Urgent')
  document.body.append(box)
  let checked = false
  releases.push(
    agentMember({
      member: 'Checkbox',
      element: () => box,
      state: () => ({ checked }),
      actions: { check: () => (checked = true) },
    }),
  )
  const bridge = createAgentBridge({ settleMs: 0 })
  releases.push(() => bridge.dispose())
  return bridge
}

/** Puts `value` at `holder.modelContext` for one test. */
function install(holder: object, value: unknown): void {
  Object.defineProperty(holder, 'modelContext', { value, configurable: true })
  releases.push(() => {
    delete (holder as { modelContext?: unknown }).modelContext
  })
}

interface Registered {
  tool: {
    name: string
    description: string
    inputSchema: Record<string, unknown>
    annotations: Record<string, boolean>
    execute: (input: unknown) => Promise<unknown>
  }
  signal?: AbortSignal
}

describe('agentTools', () => {
  it('lists the three tools, each with a schema, a description and its hints', () => {
    const tools = agentTools(page())
    expect(tools.map((tool) => tool.name)).toEqual([
      'polymorph_snapshot',
      'polymorph_query',
      'polymorph_act',
    ])
    for (const tool of tools) {
      expect(tool.inputSchema['type']).toBe('object')
      expect(tool.description.length).toBeGreaterThan(80)
      expect(tool.annotations.untrustedContentHint).toBe(true)
    }
    const [snapshot, query, act] = tools
    expect(snapshot?.annotations.readOnlyHint).toBe(true)
    expect(query?.annotations.readOnlyHint).toBe(true)
    expect(act?.annotations).toEqual({
      readOnlyHint: false,
      untrustedContentHint: true,
      consequentialHint: true,
    })
    // An agent learns from the description that an undeclared action is refused with the allowed list.
    expect(act?.description).toContain('not-allowed')
    expect(act?.description).toContain('allowed actions')
  })

  it('reads and acts through the bridge, and answers a malformed input without throwing', async () => {
    const [snapshot, query, act] = agentTools(page())
    const read = (await snapshot?.execute()) as { members: { id: string }[] }
    const id = read.members[0]?.id
    expect(await query?.execute({ name: 'urg', text: 7 })).toEqual({
      members: [{ id, member: 'Checkbox', name: 'Urgent' }],
    })
    expect(await query?.execute('urgent')).toEqual({
      members: [{ id, member: 'Checkbox', name: 'Urgent' }],
    })
    expect(await act?.execute({ steps: [{ id, action: 'check' }] })).toEqual({
      results: [{ ok: true, id, changed: { checked: { from: false, to: true } } }],
    })
    expect(await act?.execute({ steps: [{ id, action: 'delete' }] })).toEqual({
      results: [
        {
          ok: false,
          id,
          error: { code: 'not-allowed', message: expect.any(String), allowed: ['check'] },
        },
      ],
    })
    expect(await act?.execute(null)).toEqual({
      results: [{ ok: false, error: { code: 'invalid-value', message: expect.any(String) } }],
    })
  })

  it('returns JSON a browser can serialize', async () => {
    const outputs = await Promise.all(agentTools(page()).map((tool) => tool.execute({})))
    for (const output of outputs) expect(JSON.parse(JSON.stringify(output))).toEqual(output)
  })
})

describe('registerWebMCP', () => {
  it('registers the tools on document.modelContext and unregisters them by aborting the signal', async () => {
    const registered: Registered[] = []
    install(document, {
      registerTool: (tool: Registered['tool'], options?: { signal?: AbortSignal }) => {
        registered.push({ tool, signal: options?.signal })
        return Promise.resolve()
      },
    })
    const unregister = registerWebMCP(page())
    expect(registered.map(({ tool }) => tool.name)).toEqual([
      'polymorph_snapshot',
      'polymorph_query',
      'polymorph_act',
    ])
    const [snapshot, query, act] = registered.map(({ tool }) => tool)
    expect(snapshot?.annotations).toEqual({
      readOnlyHint: true,
      untrustedContentHint: true,
      consequentialHint: false,
    })
    expect(query?.annotations['readOnlyHint']).toBe(true)
    expect(act?.annotations['consequentialHint']).toBe(true)
    const read = (await snapshot?.execute({})) as { members: { id: string }[] }
    expect(read.members).toHaveLength(1)

    expect(registered.every(({ signal }) => signal?.aborted === false)).toBe(true)
    unregister()
    expect(registered.every(({ signal }) => signal?.aborted === true)).toBe(true)
    // Unregistering twice does nothing more.
    unregister()
  })

  it('registers on navigator.modelContext in an earlier build and unregisters by name', () => {
    install(document, undefined)
    const names: string[] = []
    const removed: string[] = []
    install(navigator, {
      registerTool: (tool: { name: string }) => {
        names.push(tool.name)
      },
      unregisterTool: (name: string) => {
        removed.push(name)
      },
    })
    const unregister = registerWebMCP(page())
    expect(names).toHaveLength(3)
    unregister()
    expect(removed).toEqual(names)
  })

  it('unregisters through the object an earlier build returns', () => {
    install(document, undefined)
    const unregistered = vi.fn()
    install(navigator, { registerTool: () => ({ unregister: unregistered }) })
    registerWebMCP(page())()
    expect(unregistered).toHaveBeenCalledTimes(3)
  })

  it('prefers document.modelContext when both are present', () => {
    const onDocument = vi.fn(() => Promise.resolve())
    const onNavigator = vi.fn()
    install(document, { registerTool: onDocument })
    install(navigator, { registerTool: onNavigator })
    registerWebMCP(page())()
    expect(onDocument).toHaveBeenCalledTimes(3)
    expect(onNavigator).not.toHaveBeenCalled()
  })

  it('does nothing and throws nothing where the API is absent', () => {
    install(document, undefined)
    install(navigator, undefined)
    const unregister = registerWebMCP(page())
    expect(() => unregister()).not.toThrow()
    install(document, { registerTool: 'not a function' })
    expect(() => registerWebMCP(page())()).not.toThrow()
  })

  it('keeps the other tools when the browser refuses one', async () => {
    const names: string[] = []
    install(document, {
      registerTool: (tool: { name: string }) => {
        if (tool.name === 'polymorph_query') throw new DOMException('taken', 'InvalidStateError')
        if (tool.name === 'polymorph_act')
          return Promise.reject(new DOMException('taken', 'InvalidStateError'))
        names.push(tool.name)
        return Promise.resolve()
      },
      unregisterTool: () => {
        throw new Error('unknown tool')
      },
    })
    const unregister = registerWebMCP(page())
    // Let the rejected registration settle, so an unhandled rejection would show here.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(names).toEqual(['polymorph_snapshot'])
    expect(() => unregister()).not.toThrow()
  })
})
