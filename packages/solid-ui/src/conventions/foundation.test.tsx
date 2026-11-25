import * as dialog from '@zag-js/dialog'
import {
  createComputed,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  type JSX,
} from 'solid-js'
import { hydrate, insert } from 'solid-js/web'
import { page } from 'vitest/browser'
import { describe, expect, it, vi } from 'vitest'

import {
  Each,
  hostMember,
  itemOf,
  Keyed,
  mergeParts,
  ResolvedSlot,
  resolveSlot,
  useMachine,
  useMediaQuery,
  watchEffect,
  type Slot,
} from '@polymorph/solid'

import Checkbox from '../controls/Checkbox'
import FormField from '../controls/FormField'
import { mount } from '../mount'
import Badge from '../structure/Badge'

/**
 * The Solid foundation's conventions that the members' own tests reach only
 * through a member: when a machine applies an event, when a watched effect
 * runs, what a keyed row hands a callback, when keyed content is made again,
 * which source wins an attribute two
 * spell differently, when a slot resolved in a branch is made, what a
 * slot's plain elements keep once a member stops handing them an attribute,
 * and what a media query reads while a member is hydrated.
 */

/**
 * A dialog machine with no focus trap, no scroll lock and nothing hidden, for
 * its states alone. Its content is an empty element, which the open state's
 * dismissable layer tracks.
 */
function machineProbe(onOpenChange: () => void, before?: (service: dialog.Service) => void) {
  let service: dialog.Service | undefined
  function Probe(): JSX.Element {
    service = useMachine(dialog.machine, () => ({ id: 'probe', modal: false, onOpenChange }))
    before?.(service)
    return <div id="dialog:probe:content" />
  }
  return {
    Probe,
    get service() {
      return service as dialog.Service
    },
  }
}

describe('useMachine', () => {
  it('applies an event before send returns', async () => {
    const onOpenChange = vi.fn()
    const probe = machineProbe(onOpenChange)
    await mount(() => <probe.Probe />)
    expect(probe.service.state.get()).toBe('closed')
    probe.service.send({ type: 'OPEN' })
    expect(probe.service.state.get()).toBe('open')
    expect(onOpenChange).toHaveBeenCalledTimes(1)
    probe.service.send({ type: 'CLOSE' })
    expect(probe.service.state.get()).toBe('closed')
    expect(onOpenChange).toHaveBeenCalledTimes(2)
  })

  it('holds an event sent before the machine starts until it starts', async () => {
    const probe = machineProbe(vi.fn(), (service) => service.send({ type: 'OPEN' }))
    await mount(() => <probe.Probe />)
    expect(probe.service.state.get()).toBe('open')
  })

  it('keeps only the last of the held events that replace one another', async () => {
    const onOpenChange = vi.fn()
    const probe = machineProbe(onOpenChange, (service) => {
      service.send({ type: 'OPEN', replaces: 'open' })
      service.send({ type: 'CLOSE', replaces: 'open' })
    })
    await mount(() => <probe.Probe />)
    expect(probe.service.state.get()).toBe('closed')
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('drops an event sent after its member is disposed', async () => {
    const onOpenChange = vi.fn()
    const probe = machineProbe(onOpenChange)
    const { unmount } = await mount(() => <probe.Probe />)
    unmount()
    probe.service.send({ type: 'OPEN' })
    expect(probe.service.state.get()).toBe('closed')
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})

describe('watchEffect', () => {
  it('runs once in the microtask after the changes one task makes, and again for a later change', async () => {
    const [count, setCount] = createSignal(0)
    const run = vi.fn()
    function Probe(): JSX.Element {
      watchEffect(
        createMemo(() => count()),
        run,
        false,
      )
      return null
    }
    await mount(() => <Probe />)
    expect(run).not.toHaveBeenCalled()
    setCount(1)
    setCount(2)
    setCount(3)
    expect(run).not.toHaveBeenCalled()
    await Promise.resolve()
    expect(run).toHaveBeenCalledTimes(1)
    setCount(4)
    await Promise.resolve()
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('runs on mount when asked, and never after its member is disposed', async () => {
    const [count, setCount] = createSignal(0)
    const run = vi.fn()
    function Probe(): JSX.Element {
      watchEffect(
        createMemo(() => count()),
        run,
        true,
      )
      return null
    }
    const { unmount } = await mount(() => <Probe />)
    expect(run).toHaveBeenCalledTimes(1)
    setCount(1)
    unmount()
    await Promise.resolve()
    expect(run).toHaveBeenCalledTimes(1)
  })

  // Vue reads a watched value as the member is set up, so a mount effect that changes it runs
  // the watch after the mount. The toast viewport reads the store again as it mounts and says
  // the toasts it finds once their cards are drawn.
  it('runs again after the mount for a change made between setup and the mount, once it is drawn', async () => {
    const [count, setCount] = createSignal(0)
    const drawn: number[] = []
    let list: HTMLUListElement | undefined
    function Probe(): JSX.Element {
      onMount(() => setCount(2))
      watchEffect(
        createMemo(() => count()),
        () => drawn.push(list?.children.length ?? -1),
        true,
      )
      return (
        <ul ref={list}>
          <For each={Array.from({ length: count() }, (_, index) => index)}>{() => <li />}</For>
        </ul>
      )
    }
    await mount(() => <Probe />)
    expect(drawn).toHaveLength(2)
    expect(drawn.at(-1)).toBe(2)
  })
})

describe('Each', () => {
  interface Ticket {
    id: string
    subject: string
  }

  it('hands a row a view of its item, and itemOf the latest object of its key itself', async () => {
    const first: Ticket[] = [
      { id: 'a', subject: 'Webhook retries' },
      { id: 'b', subject: 'SSO loop' },
    ]
    const [tickets, setTickets] = createSignal(first)
    const views: Ticket[] = []
    const { host } = await mount(() => (
      <Each of={tickets()} by={(ticket) => ticket.id}>
        {(ticket) => {
          views.push(ticket)
          return <span>{ticket.subject}</span>
        }}
      </Each>
    ))
    expect(views.map((view) => itemOf(view))).toEqual(first)
    expect(itemOf(views[1])).toBe(first[1])
    expect(first.indexOf(itemOf(views[1] as Ticket))).toBe(1)
    expect(structuredClone(itemOf(views[0]))).toEqual(first[0])

    const next = first.map((ticket) => ({ ...ticket, subject: `${ticket.subject}, again` }))
    setTickets(next)
    expect(views).toHaveLength(2)
    expect(itemOf(views[0])).toBe(next[0])
    expect(host.textContent).toBe('Webhook retries, againSSO loop, again')
  })

  it('returns any other value as it is', () => {
    const date = new Date(0)
    expect(itemOf(date)).toBe(date)
    expect(itemOf('a')).toBe('a')
    expect(itemOf(null)).toBeNull()
  })
})

describe('Keyed', () => {
  it('makes its content again when its key changes, and keeps it otherwise', async () => {
    const [month, setMonth] = createSignal('2026-07')
    const [label, setLabel] = createSignal('July')
    const { host } = await mount(() => (
      <Keyed by={month()}>{() => <table aria-label={label()} />}</Keyed>
    ))
    const first = host.querySelector('table')
    setLabel('Juillet')
    expect(host.querySelector('table')).toBe(first)
    expect(first?.getAttribute('aria-label')).toBe('Juillet')
    setMonth('2026-08')
    expect(host.querySelector('table')).not.toBe(first)
    expect(host.querySelectorAll('table')).toHaveLength(1)
  })
})

describe('mergeParts', () => {
  it('reads an attribute in either casing as one, so a later source takes it away', async () => {
    const machine = { tabIndex: 0, role: 'slider', 'aria-label': 'Hue' }
    const own = { tabindex: undefined, role: undefined, 'aria-label': undefined }
    expect(mergeParts(machine, own)).toEqual(own)
    const { host } = await mount(() => <span {...mergeParts(machine, own)} />)
    const span = host.querySelector('span') as HTMLElement
    expect(span.hasAttribute('tabindex')).toBe(false)
    expect(span.hasAttribute('role')).toBe(false)
  })

  it('runs both sources’ handlers for one event, and keeps the casing Solid reads', () => {
    const order: string[] = []
    const merged = mergeParts(
      { onKeyDown: () => order.push('machine'), textContent: 'Hue' },
      { onKeydown: () => order.push('own') },
    )
    expect(Object.keys(merged)).toEqual(['onkeydown', 'textContent'])
    ;(merged['onkeydown'] as () => void)()
    expect(order).toEqual(['machine', 'own'])
  })
})

describe('ResolvedSlot', () => {
  it('makes the slot’s content each time its branch opens, and disposes it as the branch closes', async () => {
    const [open, setOpen] = createSignal(true)
    let made = 0
    let disposed = 0
    function Save(): JSX.Element {
      made += 1
      onCleanup(() => (disposed += 1))
      return <button>Save</button>
    }
    function Host(props: { footer: JSX.Element }): JSX.Element {
      return (
        <>
          {open() ? (
            <ResolvedSlot of={() => props.footer}>
              {(footer) => <>{footer.filled() ? <footer>{footer()}</footer> : null}</>}
            </ResolvedSlot>
          ) : null}
        </>
      )
    }
    const { host } = await mount(() => <Host footer={<Save />} />)
    expect([made, disposed]).toEqual([1, 0])
    setOpen(false)
    expect([made, disposed]).toEqual([1, 1])
    expect(host.querySelector('button')).toBeNull()
    setOpen(true)
    expect([made, disposed]).toEqual([2, 1])
    expect(host.querySelector('footer button')).not.toBeNull()
  })
})

describe('a slot’s plain elements', () => {
  function Host(props: { children: JSX.Element; hint: string | undefined }): JSX.Element {
    const slot = resolveSlot(
      () => props.children,
      () => ({ 'aria-describedby': props.hint }),
    )
    return <div>{slot()}</div>
  }

  it('take what the member hands them, and keep their own once it stops', async () => {
    const [hint, setHint] = createSignal<string | undefined>('hint')
    const { host } = await mount(() => (
      <Host hint={hint()}>
        <input aria-label="Own" aria-describedby="own" />
        <input aria-label="Bare" />
      </Host>
    ))
    const [own, bare] = [...host.querySelectorAll('input')]
    expect(own?.getAttribute('aria-describedby')).toBe('hint')
    expect(bare?.getAttribute('aria-describedby')).toBe('hint')
    setHint('other')
    expect(own?.getAttribute('aria-describedby')).toBe('other')
    setHint(undefined)
    expect(own?.getAttribute('aria-describedby')).toBe('own')
    expect(bare?.hasAttribute('aria-describedby')).toBe(false)
  })

  it('count beside the members, and take `pass` with their own attributes', async () => {
    let read: Slot | undefined
    function Counter(props: { children: JSX.Element }): JSX.Element {
      const slot = resolveSlot(
        () => props.children,
        (child) => ({ 'data-seen': String(child['data-own'] ?? 'none') }),
      )
      read = slot
      return <div>{slot()}</div>
    }
    const { host } = await mount(() => (
      <Counter>
        <Badge>New</Badge>
        <input aria-label="Own" data-own="mine" />
      </Counter>
    ))
    expect(read?.slotted().count).toBe(2)
    expect(host.querySelector('input')?.getAttribute('data-seen')).toBe('mine')
    expect(host.querySelector('[data-member="badge"]')?.hasAttribute('data-seen')).toBe(false)
  })

  it('are FormField’s control: its own `disabled` marks the field, and follows the element', async () => {
    const [disabled, setDisabled] = createSignal(true)
    const { host } = await mount(() => (
      <FormField label="Subject">
        <input disabled={disabled()} />
      </FormField>
    ))
    const field = host.querySelector('[data-member="form-field"]') as HTMLElement
    const input = host.querySelector('input') as HTMLInputElement
    expect(field.hasAttribute('data-disabled')).toBe(true)
    expect(input.id).not.toBe('')
    expect(host.querySelector('label')?.htmlFor).toBe(input.id)
    setDisabled(false)
    await vi.waitFor(() => expect(field.hasAttribute('data-disabled')).toBe(false))
  })
})

describe('a member rendered into an element of its own', () => {
  /** A member rendered into a host element the slot holds in its place, as `@polymorph/elements` renders one. */
  function Hosted(props: { render: () => JSX.Element }): JSX.Element {
    const element = document.createElement('x-host')
    const rendered = props.render()
    hostMember(element, rendered)
    insert(element, rendered)
    return element
  }

  it('is that member to the slot: its kind, its props, and `pass` taken as props', async () => {
    const { host } = await mount(() => (
      <FormField label="Agree" description="Read them first.">
        <Hosted render={() => <Checkbox name="agree" />} />
      </FormField>
    ))
    const field = host.querySelector('[data-member="form-field"]') as HTMLElement
    const element = host.querySelector('x-host') as HTMLElement
    const box = element.querySelector('button') as HTMLElement
    expect(field.getAttribute('data-kind')).toBe('row-labelled')
    expect(box.id).not.toBe('')
    expect(box.getAttribute('aria-describedby')).toContain(`${box.id}-description`)
    expect([...element.attributes].map((attribute) => attribute.name)).toEqual([])
  })

  it('counts beside the elements the caller wrote', async () => {
    let read: Slot | undefined
    function Counter(props: { children: JSX.Element }): JSX.Element {
      const slot = resolveSlot(
        () => props.children,
        () => ({ 'data-seen': 'passed' }),
      )
      read = slot
      return <div>{slot()}</div>
    }
    const { host } = await mount(() => (
      <Counter>
        <Hosted render={() => <Badge>New</Badge>} />
        <input aria-label="Own" />
      </Counter>
    ))
    expect(read?.slotted().count).toBe(2)
    expect(host.querySelector('input')?.getAttribute('data-seen')).toBe('passed')
    expect(host.querySelector('x-host')?.hasAttribute('data-seen')).toBe(false)
  })
})

describe('useMediaQuery', () => {
  /** A member that records each value the query reads, from its first render on. */
  function recorder(seen: boolean[]) {
    return function Probe(): JSX.Element {
      const phone = useMediaQuery('phone')
      createComputed(() => seen.push(phone()))
      return null
    }
  }

  it('reads the server’s `false` while it hydrates, and the query once mounted', async () => {
    // A server has no window, so it rendered the member with the query not matching.
    await page.viewport(375, 800)
    // What Solid's `HydrationScript` defines on a page a server rendered.
    const script = globalThis as { _$HY?: object }
    script._$HY = { events: [], completed: new WeakSet(), r: {} }
    const host = document.createElement('div')
    document.body.append(host)
    const seen: boolean[] = []
    const Probe = recorder(seen)
    let dispose = () => {}
    try {
      dispose = hydrate(() => <Probe />, host)
      expect(seen[0]).toBe(false)
      await vi.waitFor(() => expect(seen.at(-1)).toBe(true))
    } finally {
      dispose()
      delete script._$HY
      host.remove()
      await page.viewport(1280, 800)
    }
  })

  it('reads the query on the first render of a member mounted in the browser', async () => {
    await page.viewport(375, 800)
    try {
      const seen: boolean[] = []
      const Probe = recorder(seen)
      await mount(() => <Probe />)
      expect(seen[0]).toBe(true)
    } finally {
      await page.viewport(1280, 800)
    }
  })
})
