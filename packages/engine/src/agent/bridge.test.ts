import { afterEach, describe, expect, it, vi } from 'vitest'

import { agentMember, type AgentAction, type AgentHandle } from '../conventions/agent'
import {
  AGENT_CHANGE_EVENT,
  createAgentBridge,
  type AgentBridge,
  type AgentChangeDetail,
  type AgentStepResult,
} from './bridge'
import { agentTools } from './tools'

/**
 * The runtime laws: what the bridge reports, what it runs and what it never
 * lets out, over members registered by hand on plain markup. Each renderer's
 * members are held to the same bridge by their own tests; these hold the
 * bridge itself.
 */

const releases: (() => void)[] = []
const bridges: AgentBridge[] = []

afterEach(() => {
  releases.splice(0).forEach((release) => release())
  bridges.splice(0).forEach((bridge) => bridge.dispose())
  document.body.replaceChildren()
})

function bridgeOf(options: Parameters<typeof createAgentBridge>[0] = {}): AgentBridge {
  const bridge = createAgentBridge({ settleMs: 60, ...options })
  bridges.push(bridge)
  return bridge
}

function register(handle: AgentHandle): void {
  releases.push(agentMember(handle))
}

/** A checkbox row in the body, registered as a Checkbox member whose actions set `checked`. */
function checkbox(label: string, options: { disabled?: boolean; destructive?: boolean } = {}) {
  const row = document.createElement('label')
  const box = document.createElement('button')
  box.setAttribute('role', 'checkbox')
  const text = document.createElement('span')
  text.textContent = label
  row.append(box, text)
  document.body.append(row)
  const model = { checked: false, disabled: options.disabled ?? false }
  const onCheckedChange = vi.fn()
  const set = (next: boolean) => {
    model.checked = next
    box.setAttribute('aria-checked', String(next))
    onCheckedChange(next)
  }
  register({
    member: 'Checkbox',
    element: () => box,
    state: () => ({ checked: model.checked, disabled: model.disabled }),
    actions: { check: () => set(true), uncheck: () => set(false) },
    destructive: () => options.destructive ?? false,
  })
  return { row, box, model, onCheckedChange }
}

/** A member with any states and actions, on a button named `name`. */
function memberOf(
  name: string,
  state: () => Record<string, unknown>,
  actions: Record<string, AgentAction>,
  extra: Partial<AgentHandle> = {},
) {
  const button = document.createElement('button')
  button.textContent = name
  document.body.append(button)
  register({ member: 'Probe', element: () => button, state, actions, ...extra })
  return button
}

const only = (bridge: AgentBridge) => {
  const [first] = bridge.snapshot().members
  if (!first) throw new Error('the snapshot lists no member')
  return first
}

const errorOf = (result: AgentStepResult | undefined) =>
  result && !result.ok ? result.error : undefined

describe('snapshot', () => {
  it('lists each member with its id, name, state and the actions it allows', () => {
    checkbox('Email me about replies')
    const bridge = bridgeOf()
    expect(bridge.snapshot()).toEqual({
      members: [
        {
          id: expect.stringMatching(/^checkbox-\d+$/),
          member: 'Checkbox',
          name: 'Email me about replies',
          state: { checked: false, disabled: false },
          actions: [{ name: 'check' }, { name: 'uncheck' }],
        },
      ],
    })
  })

  it('lists members in document order and names the member each is inside', () => {
    const outer = document.createElement('div')
    outer.setAttribute('aria-label', 'Filters')
    document.body.append(outer)
    const inner = checkbox('Urgent')
    outer.append(inner.row)
    // Registered after the checkbox, as a React parent's effect runs after its child's.
    register({ member: 'Card', element: () => outer, state: () => ({}), actions: {} })
    checkbox('Waiting')
    const [card, urgent, waiting] = bridgeOf().snapshot().members
    expect([card?.name, urgent?.name, waiting?.name]).toEqual(['Filters', 'Urgent', 'Waiting'])
    expect(urgent?.within).toBe(card?.id)
    expect(waiting && 'within' in waiting).toBe(false)
  })

  it('reads the state each time, not once', () => {
    const { model } = checkbox('Urgent')
    const bridge = bridgeOf()
    model.checked = true
    expect(only(bridge).state).toEqual({ checked: true, disabled: false })
  })

  it('reports a state that is not JSON as plain JSON', () => {
    memberOf('Probe', () => ({ empty: undefined, when: new Date(0), list: [1, 'two'] }), {})
    expect(only(bridgeOf()).state).toEqual({
      empty: null,
      when: '1970-01-01T00:00:00.000Z',
      list: [1, 'two'],
    })
  })

  it('leaves out a member that cannot be read', () => {
    register({
      member: 'Broken',
      element: () => null,
      state: () => {
        throw new Error('unmounted')
      },
      actions: {},
    })
    checkbox('Urgent')
    expect(
      bridgeOf()
        .snapshot()
        .members.map((member) => member.member),
    ).toEqual(['Checkbox'])
  })

  it('reports nothing once the bridge is disposed', () => {
    checkbox('Urgent')
    const bridge = bridgeOf()
    bridge.dispose()
    expect(bridge.snapshot()).toEqual({ members: [] })
    expect(bridge.query({})).toEqual([])
  })
})

describe('query', () => {
  const choices = [
    { id: 'open', label: 'Open' },
    { id: 'closed', label: 'Closed tickets' },
  ]

  it('matches the accessible name, ignoring case, as a substring', () => {
    checkbox('Email me about replies')
    checkbox('Urgent')
    const matches = bridgeOf().query({ name: 'EMAIL' })
    expect(matches).toEqual([
      { id: expect.any(String), member: 'Checkbox', name: 'Email me about replies' },
    ])
  })

  it("matches a choice's label and names the choice", () => {
    memberOf('Status', () => ({ value: 'open', options: choices }), {})
    expect(bridgeOf().query({ name: 'closed' })).toEqual([
      {
        id: expect.any(String),
        member: 'Probe',
        name: 'Status',
        option: { id: 'closed', label: 'Closed tickets' },
      },
    ])
  })

  it('matches the text the element shows and the member by name, all together', () => {
    memberOf('Save draft', () => ({}), {})
    checkbox('Save draft')
    const bridge = bridgeOf()
    expect(bridge.query({ text: 'draft' }).map((match) => match.member)).toEqual(['Probe'])
    expect(bridge.query({ name: 'save', member: 'checkbox' }).map((match) => match.member)).toEqual(
      ['Checkbox'],
    )
    expect(bridge.query({ name: 'save', text: 'nothing' })).toEqual([])
  })
})

describe('act', () => {
  it('runs an action, waits for the state and reports what changed', async () => {
    const { box, onCheckedChange } = checkbox('Urgent')
    const bridge = bridgeOf()
    const { id } = only(bridge)
    const result = await bridge.act([{ id, action: 'check' }])
    expect(result).toEqual({
      results: [{ ok: true, id, changed: { checked: { from: false, to: true } } }],
    })
    expect(onCheckedChange).toHaveBeenCalledWith(true)
    expect(box.getAttribute('aria-checked')).toBe('true')
  })

  it('finds the member a target names, and refuses one it does not name or names twice', async () => {
    checkbox('Urgent')
    checkbox('Waiting on customer')
    checkbox('Waiting on agent')
    const bridge = bridgeOf()
    const [ok] = (
      await bridge.act([{ target: { member: 'Checkbox', name: 'urgent' }, action: 'check' }])
    ).results
    expect(ok?.ok).toBe(true)
    const [partial] = (await bridge.act([{ target: { name: 'customer' }, action: 'check' }]))
      .results
    expect(partial?.ok).toBe(true)
    const [twice] = (await bridge.act([{ target: { name: 'waiting' }, action: 'check' }])).results
    expect(errorOf(twice)?.code).toBe('ambiguous-target')
    const [none] = (await bridge.act([{ target: { name: 'nothing' }, action: 'check' }])).results
    expect(errorOf(none)?.code).toBe('unknown-member')
    const [missing] = (await bridge.act([{ id: 'checkbox-0', action: 'check' }])).results
    expect(errorOf(missing)?.code).toBe('unknown-member')
    const [unnamed] = (await bridge.act([{ action: 'check' }])).results
    expect(errorOf(unnamed)?.code).toBe('unknown-member')
  })

  it('refuses an undeclared action and lists the allowed ones', async () => {
    const { onCheckedChange } = checkbox('Urgent')
    const bridge = bridgeOf()
    const { id } = only(bridge)
    for (const action of ['toggle', 'constructor', '__proto__', 'toString']) {
      const [result] = (await bridge.act([{ id, action }])).results
      expect(result).toEqual({
        ok: false,
        id,
        error: { code: 'not-allowed', message: expect.any(String), allowed: ['check', 'uncheck'] },
      })
    }
    const [unnamed] = (await bridge.act([{ id } as never])).results
    expect(errorOf(unnamed)?.allowed).toEqual(['check', 'uncheck'])
    expect(onCheckedChange).not.toHaveBeenCalled()
  })

  it('stops at the first step that fails', async () => {
    const urgent = checkbox('Urgent')
    const waiting = checkbox('Waiting')
    const bridge = bridgeOf()
    const [first, second] = bridge.snapshot().members
    const { results } = await bridge.act([
      { id: first?.id, action: 'check' },
      { id: second?.id, action: 'toggle' },
      { id: second?.id, action: 'check' },
    ])
    expect(results.map((result) => result.ok)).toEqual([true, false])
    expect(urgent.model.checked).toBe(true)
    expect(waiting.model.checked).toBe(false)
  })

  it('refuses a list that is not a list of steps', async () => {
    const bridge = bridgeOf()
    expect(errorOf((await bridge.act('check' as never)).results[0])?.code).toBe('invalid-value')
    expect(errorOf((await bridge.act([7 as never])).results[0])?.code).toBe('invalid-value')
    expect(await bridge.act([])).toEqual({ results: [] })
  })

  it('reports an action that throws as failed', async () => {
    memberOf('Save', () => ({}), {
      save: () => {
        throw new Error('the server said no')
      },
    })
    const bridge = bridgeOf()
    const [result] = (await bridge.act([{ id: only(bridge).id, action: 'save' }])).results
    expect(errorOf(result)).toEqual({ code: 'failed', message: 'save failed: the server said no' })
  })

  it('awaits an action that returns a promise', async () => {
    let saved = false
    memberOf('Save', () => ({ saved }), {
      save: () =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            saved = true
            resolve()
          }, 30),
        ),
    })
    const bridge = bridgeOf({ settleMs: 0 })
    const [result] = (await bridge.act([{ id: only(bridge).id, action: 'save' }])).results
    expect(result).toEqual({
      ok: true,
      id: expect.any(String),
      changed: { saved: { from: false, to: true } },
    })
  })

  it('runs one act at a time', async () => {
    const order: string[] = []
    memberOf('Save', () => ({}), {
      save: () =>
        new Promise<void>((resolve) => setTimeout(() => (order.push('save'), resolve()), 20)),
      note: () => {
        order.push('note')
      },
    })
    const bridge = bridgeOf({ settleMs: 0 })
    const { id } = only(bridge)
    await Promise.all([bridge.act([{ id, action: 'save' }]), bridge.act([{ id, action: 'note' }])])
    expect(order).toEqual(['save', 'note'])
  })
})

describe('settling', () => {
  it('waits for a renderer that writes the state after the action returns', async () => {
    let checked = false
    memberOf('Urgent', () => ({ checked }), {
      check: () => {
        setTimeout(() => (checked = true), 25)
      },
    })
    const bridge = bridgeOf({ settleMs: 200 })
    const [result] = (await bridge.act([{ id: only(bridge).id, action: 'check' }])).results
    expect(result?.ok && result.changed).toEqual({ checked: { from: false, to: true } })
  })

  it('stops waiting at the limit and reports no change', async () => {
    memberOf('Save', () => ({ saved: false }), { save: () => {} })
    const bridge = bridgeOf({ settleMs: 80 })
    const started = performance.now()
    const [result] = (await bridge.act([{ id: only(bridge).id, action: 'save' }])).results
    const took = performance.now() - started
    expect(result?.ok && result.changed).toEqual({})
    expect(took).toBeGreaterThanOrEqual(75)
    expect(took).toBeLessThan(1000)
  })

  it('waits with timers and never with an animation frame, which a hidden tab does not run', async () => {
    const frame = vi.spyOn(window, 'requestAnimationFrame')
    let checked = false
    memberOf('Urgent', () => ({ checked }), {
      check: () => {
        setTimeout(() => (checked = true), 10)
      },
    })
    const bridge = bridgeOf()
    await bridge.act([{ id: only(bridge).id, action: 'check' }])
    expect(frame).not.toHaveBeenCalled()
    frame.mockRestore()
  })

  it('stops waiting when the member unmounts', async () => {
    const button = document.createElement('button')
    button.textContent = 'Close'
    document.body.append(button)
    let release = () => {}
    release = agentMember({
      member: 'Dialog',
      element: () => button,
      state: () => ({ open: true }),
      actions: { close: () => release() },
    })
    releases.push(release)
    const bridge = bridgeOf({ settleMs: 5000 })
    const started = performance.now()
    const [result] = (await bridge.act([{ id: only(bridge).id, action: 'close' }])).results
    expect(result?.ok).toBe(true)
    expect(performance.now() - started).toBeLessThan(1000)
  })
})

describe('a member with no element', () => {
  /** A closable panel: open, it is in the body and names the member; closed, it is gone. */
  function panelMember() {
    const panel = document.createElement('div')
    panel.setAttribute('aria-label', 'Discard this ticket?')
    document.body.append(panel)
    const model = { open: true }
    register({
      member: 'Dialog',
      element: () => (model.open ? panel : null),
      state: () => ({ open: model.open }),
      actions: {
        close: () => {
          model.open = false
          panel.remove()
        },
      },
    })
    return { panel, model }
  }

  it('is not listed, matched or run while its element is absent or out of the document', async () => {
    const { panel, model } = panelMember()
    const bridge = bridgeOf()
    const { id } = only(bridge)
    model.open = false
    expect(bridge.snapshot().members).toEqual([])
    expect(bridge.query({ member: 'Dialog' })).toEqual([])
    const [byId] = (await bridge.act([{ id, action: 'close' }])).results
    expect(errorOf(byId)?.code).toBe('unknown-member')
    // An element that names the member but has left the document lists nothing either.
    model.open = true
    panel.remove()
    expect(bridge.snapshot().members).toEqual([])
    const [byTarget] = (await bridge.act([{ target: { member: 'Dialog' }, action: 'close' }]))
      .results
    expect(errorOf(byTarget)?.code).toBe('unknown-member')
  })

  it('is not listed, matched or run while its element is in content marked hidden', async () => {
    const { row, onCheckedChange } = checkbox('Notify the assignee')
    const panel = document.createElement('div')
    document.body.append(panel)
    panel.append(row)
    const bridge = bridgeOf()
    const { id } = only(bridge)
    panel.hidden = true
    expect(bridge.snapshot().members).toEqual([])
    expect(bridge.query({ member: 'Checkbox' })).toEqual([])
    const [step] = (await bridge.act([{ id, action: 'check' }])).results
    expect(errorOf(step)?.code).toBe('unknown-member')
    expect(onCheckedChange).not.toHaveBeenCalled()
    // Shown again, it is the same member.
    panel.hidden = false
    expect(only(bridge).id).toBe(id)
  })

  it('reports the step that removes its element, and dispatches on the document', async () => {
    panelMember()
    const bridge = bridgeOf()
    const { id } = only(bridge)
    const heard: AgentChangeDetail[] = []
    bridge.subscribe((change) => heard.push(change))
    const onDocument = vi.fn()
    document.addEventListener(AGENT_CHANGE_EVENT, onDocument)
    try {
      const [result] = (await bridge.act([{ id, action: 'close' }])).results
      expect(result).toEqual({ ok: true, id, changed: { open: { from: true, to: false } } })
      expect(heard).toHaveLength(1)
      expect(onDocument).toHaveBeenCalledOnce()
      expect((onDocument.mock.calls[0]?.[0] as Event).target).toBe(document)
      expect(bridge.snapshot().members).toEqual([])
    } finally {
      document.removeEventListener(AGENT_CHANGE_EVENT, onDocument)
    }
  })

  it('dispatches on the element it named before the step while that is still in the document', async () => {
    const field = document.createElement('input')
    field.setAttribute('aria-label', 'Subject')
    document.body.append(field)
    const model = { editing: true }
    register({
      member: 'Probe',
      element: () => (model.editing ? field : null),
      state: () => ({ editing: model.editing }),
      actions: { stop: () => void (model.editing = false) },
    })
    const bridge = bridgeOf()
    const onField = vi.fn()
    field.addEventListener(AGENT_CHANGE_EVENT, onField)
    const [result] = (await bridge.act([{ id: only(bridge).id, action: 'stop' }])).results
    expect(result).toMatchObject({ ok: true, changed: { editing: { from: true, to: false } } })
    expect(onField).toHaveBeenCalledOnce()
  })
})

describe('descriptions', () => {
  let fields = 0

  /** A field described by a hint and an error, as FormField wires them. */
  function described(type = 'text', hint = 'Use the address on the invoice.') {
    fields += 1
    const field = document.createElement('input')
    field.type = type
    field.setAttribute('aria-label', 'Email')
    field.setAttribute('aria-describedby', `probe-hint-${fields} probe-error-${fields}`)
    const help = document.createElement('p')
    help.id = `probe-hint-${fields}`
    help.textContent = hint
    const error = document.createElement('p')
    error.id = `probe-error-${fields}`
    error.innerHTML = '  Enter an <b>email</b>\n address.  '
    document.body.append(field, help, error)
    return field
  }

  it('reports the text its control names with aria-describedby, in order, and matches it', () => {
    const field = described()
    register({ member: 'Input', element: () => field, state: () => ({}), actions: {} })
    const bridge = bridgeOf()
    expect(only(bridge).description).toBe('Use the address on the invoice. Enter an email address.')
    expect(bridge.query({ text: 'enter an email' }).map((match) => match.member)).toEqual(['Input'])
  })

  it('is left out when empty', () => {
    checkbox('Urgent')
    expect('description' in (only(bridgeOf()) as object)).toBe(false)
  })

  it('never carries a secret: none for a password field or a member that holds a secret', () => {
    const SECRET = 'hunter2-correct-horse'
    const password = described('password', `Your password is ${SECRET}.`)
    password.value = SECRET
    register({ member: 'Input', element: () => password, state: () => ({}), actions: {} })
    const secretField = described('text', `It reads ${SECRET}.`)
    register({
      member: 'PasswordInput',
      element: () => secretField,
      state: () => ({ value: SECRET }),
      actions: {},
      secret: ['value'],
    })
    // Another member whose description repeats the secret has it replaced.
    const other = described('text', `Not ${SECRET} again.`)
    register({ member: 'Probe', element: () => other, state: () => ({}), actions: {} })
    const bridge = bridgeOf()
    const members = bridge.snapshot().members
    expect(members.map((member) => member.description)).toEqual([
      undefined,
      undefined,
      'Not [secret] again. Enter an email address.',
    ])
    expect(JSON.stringify(members)).not.toContain('hunter2')
    expect(bridge.query({ text: 'hunter2' })).toEqual([])
  })
})

describe('change events', () => {
  it('emits one event per step that succeeds, to subscribers and on the element, bubbling', async () => {
    const { box } = checkbox('Urgent')
    const bridge = bridgeOf()
    const { id } = only(bridge)
    const heard: AgentChangeDetail[] = []
    const stop = bridge.subscribe((change) => heard.push(change))
    const dispatched: { target: EventTarget | null; detail: AgentChangeDetail }[] = []
    const onChange = (event: Event) =>
      dispatched.push({
        target: event.target,
        detail: (event as CustomEvent<AgentChangeDetail>).detail,
      })
    document.addEventListener(AGENT_CHANGE_EVENT, onChange)

    await bridge.act([
      { id, action: 'check' },
      { id, action: 'toggle' },
    ])
    const detail = {
      id,
      member: 'Checkbox',
      action: 'check',
      changed: { checked: { from: false, to: true } },
      source: 'agent',
      keys: [],
    }
    expect(heard).toEqual([detail])
    expect(dispatched).toEqual([{ target: box, detail }])

    stop()
    await bridge.act([{ id, action: 'uncheck' }])
    expect(heard).toHaveLength(1)
    expect(dispatched).toHaveLength(2)
    document.removeEventListener(AGENT_CHANGE_EVENT, onChange)
  })

  it('emits an event for an action that changes no state', async () => {
    const onPress = vi.fn()
    memberOf('Save', () => ({}), { press: onPress })
    const bridge = bridgeOf({ settleMs: 0 })
    const heard = vi.fn()
    bridge.subscribe(heard)
    await bridge.act([{ id: only(bridge).id, action: 'press' }])
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(heard).toHaveBeenCalledWith(expect.objectContaining({ action: 'press', changed: {} }))
  })
})

describe('acting', () => {
  it("is true only while a step's action runs", async () => {
    const seen: boolean[] = []
    // The bridge reads the registry when it is asked, so it can be made before the member.
    const bridge = bridgeOf({ settleMs: 0 })
    let finish = () => {}
    memberOf('Save', () => ({}), {
      now: () => {
        seen.push(bridge.acting)
      },
      later: async () => {
        await new Promise<void>((resolve) => (finish = resolve))
        seen.push(bridge.acting)
      },
      broken: () => {
        throw new Error('no')
      },
    })
    const { id } = only(bridge)
    expect(bridge.acting).toBe(false)
    const running = bridge.act([
      { id, action: 'now' },
      { id, action: 'later' },
    ])
    // While the second action waits, the step is still running.
    await vi.waitFor(() => expect(seen).toEqual([true]))
    await vi.waitFor(() => expect(bridge.acting).toBe(true))
    finish()
    await running
    expect(seen).toEqual([true, true])
    expect(bridge.acting).toBe(false)
    await bridge.act([{ id, action: 'broken' }])
    expect(bridge.acting).toBe(false)
  })
})

describe('disabled', () => {
  it('lists no action on a disabled member and refuses a step on it', async () => {
    const { onCheckedChange } = checkbox('Urgent', { disabled: true })
    const bridge = bridgeOf()
    const member = only(bridge)
    expect(member.actions).toEqual([])
    const [result] = (await bridge.act([{ id: member.id, action: 'check' }])).results
    expect(errorOf(result)?.code).toBe('disabled')
    expect(onCheckedChange).not.toHaveBeenCalled()
  })
})

describe('values', () => {
  const choices = [
    { id: 'open', label: 'Open' },
    { id: 'closed', label: 'Closed' },
    { id: 'merged', label: 'Merged', disabled: true },
  ]

  function typed() {
    const ran = vi.fn()
    memberOf('Probe', () => ({ value: 'open', options: choices }), {
      press: () => ran('press'),
      set: { argument: 'boolean', run: (value) => ran(value) },
      step: { argument: 'number', run: (value) => ran(value) },
      fill: { argument: 'text', run: (value) => ran(value) },
      select: { argument: 'id', run: (value) => ran(value) },
      pick: { argument: 'ids', run: (value) => ran(value) },
    })
    return ran
  }

  it('lists the type of each argument', () => {
    typed()
    expect(only(bridgeOf()).actions).toEqual([
      { name: 'press' },
      { name: 'set', argument: 'boolean' },
      { name: 'step', argument: 'number' },
      { name: 'fill', argument: 'text' },
      { name: 'select', argument: 'id' },
      { name: 'pick', argument: 'ids' },
    ])
  })

  it('runs a value of the declared type', async () => {
    const ran = typed()
    const bridge = bridgeOf({ settleMs: 0 })
    const { id } = only(bridge)
    const { results } = await bridge.act([
      { id, action: 'set', value: false },
      { id, action: 'step', value: 3 },
      { id, action: 'fill', value: '' },
      { id, action: 'select', value: 'closed' },
      { id, action: 'pick', value: ['open', 'closed'] },
      { id, action: 'pick', value: [] },
    ])
    expect(results.every((result) => result.ok)).toBe(true)
    expect(ran.mock.calls).toEqual([[false], [3], [''], ['closed'], [['open', 'closed']], [[]]])
  })

  it('refuses a value of another type, or one that names no enabled choice, and runs nothing', async () => {
    const ran = typed()
    const bridge = bridgeOf({ settleMs: 0 })
    const { id } = only(bridge)
    const wrong: [string, unknown][] = [
      ['press', true],
      ['set', 'true'],
      ['set', undefined],
      ['step', '3'],
      ['step', Number.NaN],
      ['step', Number.POSITIVE_INFINITY],
      ['fill', 3],
      ['select', 'pending'],
      ['select', 'merged'],
      ['select', ['open']],
      ['pick', 'open'],
      ['pick', ['open', 'pending']],
      ['pick', ['merged']],
    ]
    for (const [action, value] of wrong) {
      const [result] = (await bridge.act([{ id, action, value }])).results
      expect(errorOf(result)?.code, `${action} ${String(value)}`).toBe('invalid-value')
    }
    expect(ran).not.toHaveBeenCalled()
  })
})

describe('an action that names the list it chooses among', () => {
  /** A chart's two lists: its marks, and the series its legend toggles. */
  function lists() {
    const ran = vi.fn()
    memberOf(
      'Tickets',
      () => ({
        items: [
          { id: '0', label: 'Mon: 32' },
          { id: '1', label: 'Tue: 41' },
        ],
        series: [
          { id: 'opened', label: 'Opened' },
          { id: 'resolved', label: 'Resolved', disabled: true },
        ],
      }),
      {
        choose: { argument: 'id', among: 'items', run: (value) => ran('choose', value) },
        toggle: { argument: 'id', among: 'series', run: (value) => ran('toggle', value) },
        pick: { argument: 'ids', among: 'series', run: (value) => ran('pick', value) },
        any: { argument: 'id', run: (value) => ran('any', value) },
      },
    )
    return ran
  }

  it('lists the state it chooses among beside its argument', () => {
    lists()
    expect(only(bridgeOf()).actions).toEqual([
      { name: 'choose', argument: 'id', among: 'items' },
      { name: 'toggle', argument: 'id', among: 'series' },
      { name: 'pick', argument: 'ids', among: 'series' },
      { name: 'any', argument: 'id' },
    ])
  })

  it('runs an id of its own list, and one of any list without among', async () => {
    const ran = lists()
    const bridge = bridgeOf({ settleMs: 0 })
    const { id } = only(bridge)
    const { results } = await bridge.act([
      { id, action: 'choose', value: '1' },
      { id, action: 'toggle', value: 'opened' },
      { id, action: 'pick', value: ['opened'] },
      { id, action: 'any', value: '0' },
      { id, action: 'any', value: 'opened' },
    ])
    expect(results.every((result) => result.ok)).toBe(true)
    expect(ran.mock.calls).toEqual([
      ['choose', '1'],
      ['toggle', 'opened'],
      ['pick', ['opened']],
      ['any', '0'],
      ['any', 'opened'],
    ])
  })

  it('refuses an id of the other list, or a disabled choice of its own, and runs nothing', async () => {
    const ran = lists()
    const bridge = bridgeOf({ settleMs: 0 })
    const { id } = only(bridge)
    const wrong: [string, unknown][] = [
      ['choose', 'opened'],
      ['toggle', '0'],
      ['toggle', 'resolved'],
      ['pick', ['opened', '1']],
    ]
    for (const [action, value] of wrong) {
      const [result] = (await bridge.act([{ id, action, value }])).results
      expect(errorOf(result)?.code, `${action} ${String(value)}`).toBe('invalid-value')
    }
    const [named] = (await bridge.act([{ id, action: 'toggle', value: '0' }])).results
    expect(errorOf(named)?.message).toBe(
      'toggle takes the id of one of the enabled choices of "series".',
    )
    expect(ran).not.toHaveBeenCalled()
  })

  it('refuses every id while the state it chooses among holds none', async () => {
    const ran = vi.fn()
    memberOf('Tickets', () => ({ items: [], series: [{ id: 'opened', label: 'Opened' }] }), {
      choose: { argument: 'id', among: 'items', run: ran },
      toggle: { argument: 'id', among: 'missing', run: ran },
    })
    const bridge = bridgeOf({ settleMs: 0 })
    const { id } = only(bridge)
    for (const action of ['choose', 'toggle']) {
      const [result] = (await bridge.act([{ id, action, value: 'opened' }])).results
      expect(errorOf(result)?.code, action).toBe('invalid-value')
    }
    expect(ran).not.toHaveBeenCalled()
  })

  it('asks a person only for a choice marked destructive in its own list', async () => {
    const ran = vi.fn()
    memberOf(
      'Then',
      () => ({
        items: [{ id: 'keep', label: 'Keep' }],
        purges: [{ id: 'erase', label: 'Erase everything', destructive: true }],
      }),
      {
        choose: { argument: 'id', among: 'items', run: ran },
        purge: { argument: 'id', among: 'purges', run: ran },
      },
    )
    const bridge = bridgeOf()
    const member = only(bridge)
    expect(member.actions).toEqual([
      { name: 'choose', argument: 'id', among: 'items' },
      { name: 'purge', argument: 'id', among: 'purges', confirm: true },
    ])
    const steps = await bridge.act([
      { id: member.id, action: 'choose', value: 'keep' },
      { id: member.id, action: 'purge', value: 'erase' },
    ])
    expect(steps.results.map((result) => errorOf(result)?.code ?? 'ok')).toEqual([
      'ok',
      'needs-confirmation',
    ])
    expect(ran.mock.calls).toEqual([['keep']])
  })
})

describe('destructive actions', () => {
  it('marks every action of a destructive instance as needing a person', () => {
    checkbox('Delete my account', { destructive: true })
    expect(only(bridgeOf()).actions).toEqual([
      { name: 'check', confirm: true },
      { name: 'uncheck', confirm: true },
    ])
  })

  it('does not run without a person to ask', async () => {
    const { onCheckedChange } = checkbox('Delete my account', { destructive: true })
    const bridge = bridgeOf()
    const [result] = (await bridge.act([{ id: only(bridge).id, action: 'check' }])).results
    expect(errorOf(result)?.code).toBe('needs-confirmation')
    expect(onCheckedChange).not.toHaveBeenCalled()
  })

  it('runs after the person says yes, with what they were asked', async () => {
    const { onCheckedChange } = checkbox('Delete my account', { destructive: true })
    const confirm = vi.fn(() => Promise.resolve(true))
    const bridge = bridgeOf({ confirm })
    const { id } = only(bridge)
    const [result] = (await bridge.act([{ id, action: 'check' }])).results
    expect(result?.ok).toBe(true)
    expect(confirm).toHaveBeenCalledWith({
      id,
      member: 'Checkbox',
      name: 'Delete my account',
      action: 'check',
      keys: [],
    })
    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })

  it('is declined after the person says no, or when asking fails', async () => {
    const { onCheckedChange } = checkbox('Delete my account', { destructive: true })
    for (const confirm of [
      () => false,
      () => Promise.resolve(false),
      () => Promise.reject(new Error('closed')),
    ]) {
      const bridge = bridgeOf({ confirm })
      const [result] = (await bridge.act([{ id: only(bridge).id, action: 'check' }])).results
      expect(errorOf(result)?.code).toBe('declined')
    }
    expect(onCheckedChange).not.toHaveBeenCalled()
  })

  it('asks for a choice marked destructive, and only for it', async () => {
    const ran = vi.fn()
    memberOf(
      'Then',
      () => ({
        options: [
          { id: 'keep', label: 'Keep' },
          { id: 'erase', label: 'Erase everything', destructive: true },
        ],
      }),
      {
        select: { argument: 'id', run: ran },
        pick: { argument: 'ids', run: ran },
        press: () => ran('press'),
      },
    )
    const bridge = bridgeOf()
    const member = only(bridge)
    expect(member.actions).toEqual([
      { name: 'select', argument: 'id', confirm: true },
      { name: 'pick', argument: 'ids', confirm: true },
      { name: 'press' },
    ])
    const steps = await bridge.act([
      { id: member.id, action: 'select', value: 'keep' },
      { id: member.id, action: 'press' },
      { id: member.id, action: 'pick', value: ['keep', 'erase'] },
    ])
    expect(steps.results.map((result) => errorOf(result)?.code ?? 'ok')).toEqual([
      'ok',
      'ok',
      'needs-confirmation',
    ])
    expect(ran.mock.calls).toEqual([['keep'], ['press']])
  })

  it('treats a destructive check that throws as destructive', async () => {
    const ran = vi.fn()
    memberOf(
      'Delete',
      () => ({}),
      { press: ran },
      {
        destructive: () => {
          throw new Error('no props yet')
        },
      },
    )
    const bridge = bridgeOf()
    const [result] = (await bridge.act([{ id: only(bridge).id, action: 'press' }])).results
    expect(errorOf(result)?.code).toBe('needs-confirmation')
    expect(ran).not.toHaveBeenCalled()
  })
})

describe('withheld contents', () => {
  /**
   * A confirm panel that withholds its contents, its own Dialog on the same
   * element, a confirm button inside it, and the trigger outside it.
   */
  function confirmPanel(region?: () => Element | null | undefined) {
    const trigger = document.createElement('button')
    trigger.textContent = 'Discard'
    const panel = document.createElement('div')
    panel.setAttribute('aria-label', 'Discard this ticket?')
    const confirm = document.createElement('button')
    confirm.textContent = 'Discard'
    panel.append(confirm)
    document.body.append(trigger, panel)
    const pressed = vi.fn()
    register({
      member: 'ConfirmDialog',
      element: () => panel,
      state: () => ({ open: true }),
      actions: { cancel: () => {} },
      withholds: region ?? (() => panel),
    })
    register({
      member: 'Dialog',
      element: () => panel,
      state: () => ({ open: true }),
      actions: { close: () => {} },
    })
    register({
      member: 'Button',
      element: () => confirm,
      state: () => ({}),
      actions: { press: pressed },
    })
    register({
      member: 'Button',
      element: () => trigger,
      state: () => ({}),
      actions: { press: () => {} },
    })
    return { trigger, panel, confirm, pressed }
  }

  it('lists the member that withholds, and none of the members on or inside its region', () => {
    confirmPanel()
    const bridge = bridgeOf()
    expect(bridge.snapshot().members.map((member) => [member.member, member.name])).toEqual([
      ['Button', 'Discard'],
      ['ConfirmDialog', 'Discard this ticket?'],
    ])
    expect(bridge.query({ member: 'Dialog' })).toEqual([])
    expect(bridge.query({ name: 'discard' }).map((match) => match.member)).toEqual([
      'Button',
      'ConfirmDialog',
    ])
  })

  it('refuses a step on a withheld member, by its id or by a target, and runs nothing', async () => {
    const { confirm, pressed } = confirmPanel()
    // The id the member had before its region was withheld, read from a bridge that saw it.
    const open = bridgeOf()
    const outside = open.snapshot().members.find((member) => member.member === 'Button')
    for (const step of [
      { target: { member: 'Dialog' }, action: 'close' },
      { target: { member: 'Button', name: 'Discard' }, action: 'press' },
    ]) {
      const { results } = await open.act([step])
      if (step.target.member === 'Dialog') {
        expect(errorOf(results[0])?.code).toBe('unknown-member')
      } else {
        // The one Button the target names is the trigger outside the region.
        expect(results[0]).toMatchObject({ ok: true, id: outside?.id })
      }
    }
    expect(pressed).not.toHaveBeenCalled()
    expect(confirm.isConnected).toBe(true)
  })

  it('cannot be undone by a policy that hides nothing', () => {
    confirmPanel()
    const seen: string[] = []
    const bridge = bridgeOf({
      policy: {
        hide: (member) => {
          seen.push(member.member)
          return false
        },
      },
    })
    const listed = bridge.snapshot().members.map((member) => member.member)
    expect(listed).not.toContain('Dialog')
    expect(listed.filter((member) => member === 'Button')).toHaveLength(1)
    // The policy is never asked about a withheld member, so it cannot list one.
    expect(seen).not.toContain('Dialog')
  })

  it('withholds each element of a list, and the members beside them stay listed', async () => {
    // A composer: its own send Button and attachment row are withheld, and the application's
    // control in the toolbar between them is not.
    const composer = document.createElement('div')
    const field = document.createElement('textarea')
    field.setAttribute('aria-label', 'Message')
    const chips = document.createElement('div')
    const remove = document.createElement('button')
    remove.textContent = 'Remove notes.pdf'
    chips.append(remove)
    const toolbar = document.createElement('div')
    const model = document.createElement('button')
    model.textContent = 'Model'
    const send = document.createElement('button')
    send.textContent = 'Send'
    toolbar.append(model, send)
    composer.append(chips, field, toolbar)
    document.body.append(composer)
    const pressed = vi.fn()
    register({
      member: 'PromptInput',
      element: () => field,
      state: () => ({}),
      actions: {},
      withholds: () => [chips, null, send],
    })
    for (const [name, control] of [
      ['Remove notes.pdf', remove],
      ['Model', model],
      ['Send', send],
    ] as const) {
      register({
        member: 'Button',
        element: () => control,
        state: () => ({}),
        actions: { press: () => pressed(name) },
      })
    }
    const bridge = bridgeOf()
    expect(bridge.snapshot().members.map((member) => [member.member, member.name])).toEqual([
      ['PromptInput', 'Message'],
      ['Button', 'Model'],
    ])
    for (const name of ['Send', 'Remove notes.pdf']) {
      const [result] = (await bridge.act([{ target: { member: 'Button', name }, action: 'press' }]))
        .results
      expect(errorOf(result)?.code).toBe('unknown-member')
    }
    const [model1] = (await bridge.act([{ target: { name: 'Model' }, action: 'press' }])).results
    expect(model1).toMatchObject({ ok: true })
    expect(pressed.mock.calls).toEqual([['Model']])
  })

  it('withholds nothing while its region is absent, and its own element when the region throws', () => {
    const { panel } = confirmPanel(() => null)
    expect(
      bridgeOf()
        .snapshot()
        .members.map((member) => member.member),
    ).toContain('Dialog')
    releases.splice(0).forEach((release) => release())
    panel.remove()
    confirmPanel(() => {
      throw new Error('not mounted')
    })
    const members = bridgeOf()
      .snapshot()
      .members.map((member) => member.member)
    expect(members).not.toContain('Dialog')
    expect(members.filter((member) => member === 'Button')).toHaveLength(1)
  })
})

describe('policy', () => {
  it('hides a member and denies an action', async () => {
    checkbox('Urgent')
    const { onCheckedChange } = checkbox('Delete account')
    const bridge = bridgeOf({
      policy: {
        hide: (member) => member.name === 'Urgent',
        deny: (member, action) => member.name === 'Delete account' && action === 'check',
      },
    })
    const members = bridge.snapshot().members
    expect(members.map((member) => member.name)).toEqual(['Delete account'])
    expect(members[0]?.actions).toEqual([{ name: 'uncheck' }])
    expect(bridge.query({ name: 'urgent' })).toEqual([])
    const [denied] = (await bridge.act([{ id: members[0]?.id, action: 'check' }])).results
    expect(errorOf(denied)).toEqual({
      code: 'not-allowed',
      message: expect.any(String),
      allowed: ['uncheck'],
    })
    expect(onCheckedChange).not.toHaveBeenCalled()
  })

  it('cannot act on a hidden member by its id', async () => {
    const { onCheckedChange } = checkbox('Urgent')
    const open = bridgeOf()
    const { id } = only(open)
    const hidden = bridgeOf({ policy: { hide: () => true } })
    const [result] = (await hidden.act([{ id, action: 'check' }])).results
    expect(errorOf(result)?.code).toBe('unknown-member')
    expect(onCheckedChange).not.toHaveBeenCalled()
  })

  it('cannot add a member, a state or an action', async () => {
    const { onCheckedChange } = checkbox('Urgent')
    const seen: string[][] = []
    const bridge = bridgeOf({
      policy: {
        hide: (member) => {
          seen.push(Object.keys(member))
          return false
        },
        // A policy that answers with more than a yes or a no is a yes: the action is denied.
        deny: (_member, action) =>
          action === 'check' ? (['check', 'delete'] as unknown as boolean) : false,
      },
    })
    const member = only(bridge)
    expect(seen[0]).toEqual(['id', 'member', 'name', 'element', 'keys'])
    expect(member.state).toEqual({ checked: false, disabled: false })
    expect(member.actions).toEqual([{ name: 'uncheck' }])
    const [result] = (await bridge.act([{ id: member.id, action: 'delete' }])).results
    expect(errorOf(result)?.allowed).toEqual(['uncheck'])
    expect(onCheckedChange).not.toHaveBeenCalled()
  })

  it('hides a member whose policy throws, including one that writes to what it reads', () => {
    checkbox('Urgent')
    const writes = bridgeOf({
      policy: {
        hide: (member) => {
          ;(member as unknown as { actions: string[] }).actions = ['delete']
          return false
        },
      },
    })
    expect(writes.snapshot().members).toEqual([])
    const adds = bridgeOf({
      policy: {
        hide: ({ keys }) => {
          ;(keys as string[]).push('trusted')
          return false
        },
      },
    })
    expect(adds.snapshot().members).toEqual([])
    const throws = bridgeOf({
      policy: {
        deny: () => {
          throw new Error('no answer')
        },
      },
    })
    expect(only(throws).actions).toEqual([])
  })
})

describe('keys', () => {
  /** An element around `inner` that gives the members inside it `key`. */
  function keyed(key: string, inner: Element): HTMLElement {
    const region = document.createElement('div')
    region.setAttribute('data-agent-key', key)
    inner.replaceWith(region)
    region.append(inner)
    return region
  }

  it('gives the policy the key on the element and on each element around it, the nearest first', () => {
    const urgent = checkbox('Urgent')
    const order = checkbox('Place order')
    keyed('checkout', keyed('  place-order  ', order.row))
    // An empty key names nothing.
    keyed('', urgent.row)
    const seen = new Map<string, readonly string[] | undefined>()
    bridgeOf({
      policy: {
        hide: ({ name, keys }) => {
          seen.set(name, keys)
          return false
        },
      },
    }).snapshot()
    expect(seen.get('Place order')).toEqual(['place-order', 'checkout'])
    expect(seen.get('Urgent')).toEqual([])
    expect(Object.isFrozen(seen.get('Place order'))).toBe(true)
  })

  it('names a member whatever its name says, so a policy hides one and denies another by key', async () => {
    const order = checkbox('Commander')
    keyed('place-order', order.row)
    const notes = checkbox('Notes internes')
    keyed('internal-notes', keyed('admin', notes.row))
    checkbox('Urgent')
    const bridge = bridgeOf({
      policy: {
        hide: ({ keys = [] }) => keys.includes('admin'),
        deny: ({ keys = [] }, action) => keys.includes('place-order') && action === 'check',
      },
    })
    const members = bridge.snapshot().members
    expect(members.map((member) => member.name)).toEqual(['Commander', 'Urgent'])
    expect(members[0]?.actions).toEqual([{ name: 'uncheck' }])
    const [denied] = (await bridge.act([{ target: { name: 'Commander' }, action: 'check' }]))
      .results
    expect(errorOf(denied)?.code).toBe('not-allowed')
    expect(order.onCheckedChange).not.toHaveBeenCalled()
  })

  it('hands the keys to confirm and to the change event, and never to the agent', async () => {
    const order = checkbox('Place order', { destructive: true })
    keyed('place-order', order.row)
    const confirm = vi.fn(() => Promise.resolve(true))
    const bridge = bridgeOf({ confirm })
    const heard: AgentChangeDetail[] = []
    bridge.subscribe((change) => heard.push(change))
    const { id } = only(bridge)
    const tools = agentTools(bridge)
    const outputs = [
      bridge.snapshot(),
      bridge.query({ name: 'place' }),
      await bridge.act([{ id, action: 'check' }]),
      ...(await Promise.all(
        tools.map((tool) =>
          tool.execute(tool.name === 'polymorph_act' ? { steps: [{ id, action: 'uncheck' }] } : {}),
        ),
      )),
    ]
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ keys: ['place-order'] }))
    expect(heard.map((change) => change.keys)).toEqual([['place-order'], ['place-order']])
    for (const output of outputs) expect(JSON.stringify(output)).not.toContain('place-order')
  })
})

describe('secrets', () => {
  const SECRET = 'hunter2-correct-horse'

  /**
   * A page with a secret in every place it can be: a state the handle marks
   * secret, a password field inside a member that marks nothing, a state of
   * another member that holds the same text, a choice's label, a member's
   * name and its text.
   */
  function page() {
    const marked = memberOf(
      'Password',
      () => ({ value: SECRET, visible: false }),
      {
        reveal: () => {},
      },
      { secret: ['value'] },
    )

    const field = document.createElement('input')
    field.type = 'password'
    field.value = SECRET
    const wrapper = document.createElement('div')
    wrapper.setAttribute('aria-label', `Field ${SECRET}`)
    wrapper.append(field)
    document.body.append(wrapper)
    let echo = ''
    register({
      member: 'Unmarked',
      element: () => wrapper,
      state: () => ({ value: field.value, echo, options: [{ id: 'a', label: `Use ${SECRET}` }] }),
      actions: {
        copy: () => {
          echo = `copied ${SECRET}`
        },
        fail: () => {
          throw new Error(`could not send ${SECRET}`)
        },
      },
    })
    const shows = memberOf(`Shows ${SECRET}`, () => ({ note: 'plain' }), { press: () => {} })
    return { marked, field, shows }
  }

  const holds = (value: unknown) =>
    JSON.stringify(value).includes(SECRET) || JSON.stringify(value).includes('hunter2')

  it('reports a secret state as { secret: true }, and any state that holds a secret the same way', () => {
    page()
    const members = bridgeOf().snapshot().members
    expect(members.map((member) => member.state)).toEqual([
      { value: { secret: true }, visible: false },
      { value: { secret: true }, echo: '', options: { secret: true } },
      { note: 'plain' },
    ])
    expect(holds(members)).toBe(false)
  })

  it('lists no member on or inside a member that holds a secret, and runs none of its actions', async () => {
    const field = document.createElement('input')
    field.value = SECRET
    const frame = document.createElement('span')
    frame.append(field)
    document.body.append(frame)
    const fill = vi.fn()
    register({
      member: 'PasswordInput',
      element: () => field,
      state: () => ({ value: field.value }),
      actions: {},
      secret: ['value'],
    })
    // The field the secret member draws, registered as a member of its own.
    register({
      member: 'Input',
      element: () => field,
      state: () => ({ value: field.value }),
      actions: { fill: { argument: 'text', run: fill } },
    })
    // A control beside the field, not inside it, is not the secret member's part.
    const beside = document.createElement('button')
    frame.append(beside)
    register({ member: 'Probe', element: () => beside, state: () => ({}), actions: {} })
    const bridge = bridgeOf()
    expect(bridge.snapshot().members.map((member) => member.member)).toEqual([
      'PasswordInput',
      'Probe',
    ])
    expect(bridge.query({ member: 'Input' })).toEqual([])
    const { results } = await bridge.act([
      { target: { member: 'Input' }, action: 'fill', value: 'written' },
    ])
    expect(results[0]).toMatchObject({ ok: false, error: { code: 'unknown-member' } })
    expect(fill).not.toHaveBeenCalled()
  })

  it('treats a password field as secret whatever the handle says', () => {
    const { field } = page()
    field.value = 'different-pass'
    const bridge = bridgeOf()
    const unmarked = bridge.snapshot().members[1]
    expect(unmarked?.state['value']).toEqual({ secret: true })
    expect(JSON.stringify(bridge.snapshot())).not.toContain('different-pass')
  })

  it('never matches or returns a secret in a query', () => {
    page()
    const bridge = bridgeOf()
    for (const needle of [SECRET, 'hunter2', 'horse', 'r2-c']) {
      expect(bridge.query({ name: needle }), needle).toEqual([])
      expect(bridge.query({ text: needle }), needle).toEqual([])
    }
    expect(holds(bridge.query({}))).toBe(false)
    expect(holds(bridge.query({ name: 'shows' }))).toBe(false)
  })

  it('never reports a secret in a step, its error or its change event', async () => {
    page()
    const bridge = bridgeOf({ settleMs: 0 })
    const heard: unknown[] = []
    bridge.subscribe((change) => heard.push(change))
    const dispatched: unknown[] = []
    const onChange = (event: Event) => dispatched.push((event as CustomEvent).detail)
    document.addEventListener(AGENT_CHANGE_EVENT, onChange)
    const [marked, unmarked] = bridge.snapshot().members
    const results = [
      await bridge.act([{ id: marked?.id, action: 'reveal' }]),
      await bridge.act([{ id: unmarked?.id, action: 'copy' }]),
      await bridge.act([{ id: unmarked?.id, action: 'fail' }]),
      await bridge.act([{ id: unmarked?.id, action: 'missing' }]),
    ]
    document.removeEventListener(AGENT_CHANGE_EVENT, onChange)
    expect(results[1]?.results[0]).toEqual({ ok: true, id: unmarked?.id, changed: {} })
    expect(errorOf(results[2]?.results[0])?.code).toBe('failed')
    expect(heard).toHaveLength(2)
    expect(holds(results)).toBe(false)
    expect(holds(heard)).toBe(false)
    expect(holds(dispatched)).toBe(false)
  })

  it('never hands a secret to a tool', async () => {
    page()
    const bridge = bridgeOf({ settleMs: 0 })
    const outputs: unknown[] = []
    for (const tool of agentTools(bridge)) {
      outputs.push(await tool.execute({}))
      outputs.push(await tool.execute({ name: 'hunter2' }))
      outputs.push(
        await tool.execute({ steps: [{ target: { member: 'Unmarked' }, action: 'copy' }] }),
      )
    }
    expect(holds(outputs)).toBe(false)
  })

  it('names a member whose name holds a secret without the secret', () => {
    page()
    const names = bridgeOf()
      .snapshot()
      .members.map((member) => member.name)
    expect(names).toEqual(['Password', 'Field [secret]', 'Shows [secret]'])
  })
})
