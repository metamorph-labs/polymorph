import { afterEach, describe, expect, it, vi } from 'vitest'

import { agentMember } from '../conventions/agent'
import { createAgentBridge, type AgentBridge } from './bridge'
import { AGENT_TOOLS_HOLDER } from './context'
import * as agent from './index'
import { AGENT_ATTRIBUTE, applyAgentSetting } from './setting'
import { agentTools, registerWebMCP } from './tools'
import { registerWebMCPOnCall, type AgentBridgeModule } from './webmcp'

// The setting loads the bridge with `import('./index')`; a spy on each export counts the bridges it creates.
vi.mock('./index', { spy: true })

/**
 * The tools registered before the bridge is loaded (`registerWebMCPOnCall`),
 * a page's agent setting (`applyAgentSetting`), and the rule that one
 * registration of the tools stands on a page at a time, against a stub of
 * the current draft's WebMCP API on `document.modelContext`.
 */

const releases: (() => void)[] = []

afterEach(() => {
  releases.splice(0).forEach((release) => release())
  document.body.replaceChildren()
  vi.restoreAllMocks()
  // A test that failed before unregistering leaves the names held for the next.
  delete (globalThis as { [AGENT_TOOLS_HOLDER]?: unknown })[AGENT_TOOLS_HOLDER]
})

/** A Checkbox on the page, registered with the agent registry. */
function checkbox(): void {
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
}

interface Registered {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: Record<string, boolean>
  execute: (input: unknown) => Promise<unknown>
}

/** A WebMCP stub on `document.modelContext` for one test, and what it holds. */
function webmcp(): { tools: Map<string, Registered>; signals: AbortSignal[] } {
  const tools = new Map<string, Registered>()
  const signals: AbortSignal[] = []
  const context = {
    registerTool: (tool: Registered, options?: { signal?: AbortSignal }) => {
      if (tools.has(tool.name))
        return Promise.reject(new DOMException('taken', 'InvalidStateError'))
      tools.set(tool.name, tool)
      const signal = options?.signal
      if (signal) {
        signals.push(signal)
        signal.addEventListener('abort', () => tools.delete(tool.name))
      }
      return Promise.resolve()
    },
  }
  Object.defineProperty(document, 'modelContext', { value: context, configurable: true })
  releases.push(() => {
    delete (document as { modelContext?: unknown }).modelContext
  })
  return { tools, signals }
}

/** No WebMCP API on the page for one test. */
function noWebMCP(): void {
  for (const holder of [document, navigator]) {
    Object.defineProperty(holder, 'modelContext', { value: undefined, configurable: true })
    releases.push(() => {
      delete (holder as { modelContext?: unknown }).modelContext
    })
  }
}

/** A loader of the real bridge module that counts its calls and the bridges it made. */
function loader(): {
  load: () => Promise<AgentBridgeModule>
  calls: () => number
  made: AgentBridge[]
} {
  let calls = 0
  const made: AgentBridge[] = []
  return {
    calls: () => calls,
    made,
    load: () => {
      calls += 1
      return Promise.resolve({
        createAgentBridge: (options) => {
          const bridge = createAgentBridge({ settleMs: 0, ...options })
          made.push(bridge)
          return bridge
        },
        agentTools,
      })
    },
  }
}

/** A tool's definition as a page reads it: everything but the function that runs it. */
const definition = ({ name, title, description, inputSchema, annotations }: Registered) => ({
  name,
  title,
  description,
  inputSchema,
  annotations,
})

/** Lets the modules a setting imports load, and what waits on them run. */
async function settled(): Promise<void> {
  await Promise.all([import('./webmcp'), import('./index')])
  await new Promise((resolve) => setTimeout(resolve, 20))
}

describe('registerWebMCPOnCall', () => {
  it('registers the three tools with the definitions agentTools gives, and loads nothing', () => {
    const { tools } = webmcp()
    const { load, calls } = loader()
    releases.push(registerWebMCPOnCall(load))
    const bridge = createAgentBridge()
    releases.push(() => bridge.dispose())
    expect([...tools.values()].map(definition)).toEqual(
      agentTools(bridge).map((tool) => definition(tool as unknown as Registered)),
    )
    expect([...tools.keys()]).toEqual(['polymorph_snapshot', 'polymorph_query', 'polymorph_act'])
    expect(calls()).toBe(0)
  })

  it('loads once for calls that arrive together, and runs each against the bridge it made', async () => {
    checkbox()
    const { tools } = webmcp()
    const { load, calls, made } = loader()
    releases.push(registerWebMCPOnCall(load))
    const snapshot = tools.get('polymorph_snapshot')
    const query = tools.get('polymorph_query')
    const [read, found] = (await Promise.all([
      snapshot?.execute({}),
      query?.execute({ name: 'urgent' }),
    ])) as [{ members: { id: string; member: string }[] }, { members: { id: string }[] }]
    expect(calls()).toBe(1)
    expect(made).toHaveLength(1)
    const id = read.members[0]?.id
    expect(read.members.map(({ member }) => member)).toEqual(['Checkbox'])
    expect(found.members.map((match) => match.id)).toEqual([id])

    expect(await tools.get('polymorph_act')?.execute({ steps: [{ id, action: 'check' }] })).toEqual(
      {
        results: [{ ok: true, id, changed: { checked: { from: false, to: true } } }],
      },
    )
    expect(calls()).toBe(1)
  })

  it('passes its options to the bridge it creates', async () => {
    const { tools } = webmcp()
    const { load, made } = loader()
    const hide = vi.fn(() => true)
    releases.push(registerWebMCPOnCall(load, { policy: { hide } }))
    checkbox()
    expect(await tools.get('polymorph_snapshot')?.execute({})).toEqual({ members: [] })
    expect(made).toHaveLength(1)
    expect(hide).toHaveBeenCalled()
  })

  it('resolves a call with an error value when the load fails, and loads again on the next call', async () => {
    checkbox()
    const { tools } = webmcp()
    const real = loader()
    let failures = 1
    const load = vi.fn(() =>
      failures-- > 0 ? Promise.reject(new TypeError('Failed to fetch')) : real.load(),
    )
    releases.push(registerWebMCPOnCall(load))
    const snapshot = tools.get('polymorph_snapshot')

    const [first, second] = await Promise.all([snapshot?.execute({}), snapshot?.execute({})])
    for (const failed of [first, second]) {
      expect(failed).toEqual({
        error: { code: 'failed', message: expect.stringContaining('Failed to fetch') },
      })
    }
    expect(load).toHaveBeenCalledTimes(1)

    const read = (await snapshot?.execute({})) as { members: unknown[] }
    expect(read.members).toHaveLength(1)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('resolves with an error value when the loader throws', async () => {
    const { tools } = webmcp()
    releases.push(
      registerWebMCPOnCall(() => {
        throw new Error('no bridge here')
      }),
    )
    await expect(tools.get('polymorph_act')?.execute({ steps: [] })).resolves.toEqual({
      error: { code: 'failed', message: expect.stringContaining('no bridge here') },
    })
  })

  it('unregisters the tools and disposes of the bridge it made', async () => {
    checkbox()
    const { tools, signals } = webmcp()
    const { load, made } = loader()
    const unregister = registerWebMCPOnCall(load)
    await tools.get('polymorph_snapshot')?.execute({})
    const bridge = made[0]
    expect(bridge?.snapshot().members).toHaveLength(1)

    unregister()
    expect(signals.every((signal) => signal.aborted)).toBe(true)
    expect(tools.size).toBe(0)
    expect(bridge?.snapshot().members).toEqual([])
    // Unregistering twice does nothing more.
    unregister()
  })

  it('creates no bridge when the tools are unregistered while it loads', async () => {
    const { tools } = webmcp()
    const { load, made } = loader()
    const unregister = registerWebMCPOnCall(load)
    const call = tools.get('polymorph_snapshot')?.execute({})
    unregister()
    expect(await call).toEqual({ error: { code: 'failed', message: expect.any(String) } })
    expect(made).toEqual([])
  })

  it('registers nothing and never loads where the API is absent', () => {
    noWebMCP()
    const load = vi.fn(loader().load)
    const unregister = registerWebMCPOnCall(load)
    expect(() => unregister()).not.toThrow()
    expect(load).not.toHaveBeenCalled()
  })
})

describe('one registration of the tools at a time', () => {
  it('refuses a second registration, with a warning, until the first is unregistered', () => {
    const { tools } = webmcp()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const bridge = createAgentBridge()
    releases.push(() => bridge.dispose())

    const first = registerWebMCPOnCall(loader().load)
    releases.push(first)
    const second = registerWebMCP(bridge)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toBe(
      'polymorph: registerWebMCP registers nothing, because registerWebMCPOnCall already registered the agent tools on this page',
    )
    // The second's function does nothing: the first registration stands.
    second()
    expect(tools.size).toBe(3)

    first()
    expect(tools.size).toBe(0)
    releases.push(registerWebMCP(bridge))
    expect(tools.size).toBe(3)
    expect(warn).toHaveBeenCalledTimes(1)
  })
})

describe('applyAgentSetting', () => {
  it('registers nothing, and warns nothing, without a setting', () => {
    const { tools } = webmcp()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    releases.push(applyAgentSetting(null), applyAgentSetting(undefined))
    expect(tools.size).toBe(0)
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns once for a value it does not know, and registers nothing', async () => {
    const { tools } = webmcp()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    releases.push(applyAgentSetting('always'))
    await settled()
    expect(tools.size).toBe(0)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toBe(
      `polymorph: ${AGENT_ATTRIBUTE}="always" is neither on-call nor eager, so no agent tools are registered`,
    )
  })

  it('does nothing where the browser has no WebMCP API', async () => {
    noWebMCP()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const setting of ['on-call', 'eager']) releases.push(applyAgentSetting(setting))
    await settled()
    // It holds no names: a registration on a page that gains the API is not refused.
    const { tools } = webmcp()
    const bridge = createAgentBridge()
    releases.push(() => bridge.dispose(), registerWebMCP(bridge))
    expect(tools.size).toBe(3)
    expect(warn).not.toHaveBeenCalled()
  })

  it('with on-call, registers the tools and creates the bridge on the first call', async () => {
    checkbox()
    const { tools } = webmcp()
    const create = vi.mocked(agent.createAgentBridge)
    create.mockClear()
    releases.push(applyAgentSetting('on-call'))
    await vi.waitFor(() => expect(tools.size).toBe(3))
    expect(create).not.toHaveBeenCalled()

    const read = (await tools.get('polymorph_snapshot')?.execute({})) as {
      members: { member: string }[]
    }
    expect(read.members.map(({ member }) => member)).toEqual(['Checkbox'])
    // The bridge a setting creates has no `confirm`.
    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith({})
  })

  it('with eager, creates the bridge without waiting for a call', async () => {
    const { tools } = webmcp()
    const create = vi.mocked(agent.createAgentBridge)
    create.mockClear()
    releases.push(applyAgentSetting('eager'))
    await vi.waitFor(() => expect(tools.size).toBe(3))
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1))
  })

  it('holds the names as it is read, so a registration the page makes afterwards warns', () => {
    const { tools } = webmcp()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    releases.push(applyAgentSetting('on-call'))
    const bridge = createAgentBridge()
    releases.push(() => bridge.dispose())
    // Before the setting's own registration has loaded.
    registerWebMCP(bridge)()
    expect(tools.size).toBe(0)
    expect(warn).toHaveBeenCalledWith(
      `polymorph: registerWebMCP registers nothing, because ${AGENT_ATTRIBUTE}="on-call" already registered the agent tools on this page`,
    )
  })

  it('registers nothing, and warns, when the page registered the tools before the setting was read', async () => {
    const { tools } = webmcp()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const bridge = createAgentBridge()
    releases.push(() => bridge.dispose(), registerWebMCP(bridge))
    releases.push(applyAgentSetting('eager'))
    await settled()
    expect(warn).toHaveBeenCalledWith(
      `polymorph: ${AGENT_ATTRIBUTE}="eager" registers nothing, because registerWebMCP already registered the agent tools on this page`,
    )
    // The page's own registration stands.
    expect(await tools.get('polymorph_snapshot')?.execute({})).toEqual(bridge.snapshot())
  })

  it('unregisters a registration that had not happened when it was asked to', async () => {
    const { tools } = webmcp()
    applyAgentSetting('on-call')()
    await settled()
    expect(tools.size).toBe(0)
    const bridge = createAgentBridge()
    releases.push(() => bridge.dispose(), registerWebMCP(bridge))
    expect(tools.size).toBe(3)
  })
})
