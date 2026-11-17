import {
  afterNextRender,
  computed,
  DestroyRef,
  effect,
  inject,
  Injector,
  untracked,
} from '@angular/core'
import {
  createScope,
  findTransition,
  getExitEnterStates,
  hasTag,
  INIT_STATE,
  MachineStatus,
  matchesState,
  resolveStateValue,
  type EventObject,
  type Machine,
  type MachineSchema,
  type Params,
  type Service,
} from '@zag-js/core'
import {
  callAll,
  compact,
  ensure,
  isEqual,
  isFunction,
  isString,
  toArray,
  warn,
} from '@zag-js/utils'

import { createBindable } from './bindable'

/**
 * Runs a Zag machine in an Angular component, driven by signals.
 *
 * Zag ships no Angular binding, so this is one, written the way
 * `@zag-js/vue` and `@zag-js/svelte` are: the machine's context and state are
 * signals (`createBindable`), its props are a `computed` over the function the
 * member passes, so a member's signal inputs reach the machine as they change,
 * and its `watch` tracks are effects. Call it in an injection context (a
 * field initializer or the constructor).
 *
 * The machine starts after the member's first render, as Vue's adapter starts
 * it on mount, because its entry effects read the elements it renders (a
 * dialog opened on mount traps focus inside its panel). An event sent before
 * then waits and is applied when it starts. Once started, an event is applied
 * when it is sent, as in the Vue and React adapters: the descriptions are
 * written against a machine whose state has changed when `send` returns. It
 * stops when the member is destroyed, running its exit actions and the
 * cleanups of its effects.
 */
export function useMachine<T extends MachineSchema>(
  machine: Machine<T>,
  userProps: () => Partial<T['props']> = () => ({}),
): Service<T> {
  const injector = inject(Injector)
  const destroyRef = inject(DestroyRef)
  const bindable = createBindable(destroyRef)

  const scope = computed(() => {
    const { id, ids, getRootNode } = userProps() as {
      id?: string
      ids?: Record<string, unknown>
      getRootNode?: () => ShadowRoot | Document | Node
    }
    return createScope({ id, ids, getRootNode } as Parameters<typeof createScope>[0])
  })
  const debug = (...args: unknown[]) => {
    if (machine.debug) console.log(...args)
  }
  const props = computed(
    () =>
      machine.props?.({
        props: compact(userProps()) as Partial<T['props']>,
        get scope() {
          return scope()
        },
      }) ?? (userProps() as T['props']),
  )
  const prop = ((key: keyof T['props']) =>
    (props() as NonNullable<T['props']>)[key]) as Params<T>['prop']

  /**
   * Applies a change at once, as the React, Svelte and Solid adapters' `flush`
   * does: the machine reads the value it set before its next animation frame
   * (Tabs reads the focused tab it just recorded to select it). Angular
   * renders the change at its next check.
   */
  const flush = (fn: VoidFunction) => {
    fn()
  }

  /** A machine's `watch` dependency: `effect` runs when any of `deps` changes, by value. */
  const track = (deps: (() => unknown)[], fn: VoidFunction) => {
    let previous: unknown[] | undefined
    effect(
      () => {
        const current = deps.map((dep) => dep())
        untracked(() => {
          const changed =
            previous !== undefined && current.some((value, at) => !isEqual(previous?.[at], value))
          previous = current
          if (changed) fn()
        })
      },
      { injector },
    )
  }

  const ctx = {
    get(key: string) {
      return context?.[key]?.get()
    },
    set(key: string, value: unknown) {
      context?.[key]?.set(value)
    },
    initial(key: string) {
      return context?.[key]?.initial
    },
    hash(key: string) {
      const current = context?.[key]?.get()
      return context?.[key]?.hash(current)
    },
  } as unknown as Params<T>['context']
  const context = machine.context?.({
    prop,
    bindable,
    get scope() {
      return scope()
    },
    flush,
    getContext() {
      return ctx
    },
    getComputed() {
      return computedValue
    },
    getRefs() {
      return refs
    },
    getEvent() {
      return getEvent()
    },
  } as Parameters<NonNullable<Machine<T>['context']>>[0]) as
    Record<string, ReturnType<typeof bindable>> | undefined

  let effects = new Map<string, VoidFunction>()
  let transitionRef: { reenter?: boolean; actions?: unknown } | null = null
  const previousEventRef: { current: EventObject | null } = { current: null }
  const eventRef: { current: EventObject } = { current: { type: '' } }
  const getEvent = () => ({
    ...eventRef.current,
    current() {
      return eventRef.current
    },
    previous() {
      return previousEventRef.current
    },
  })
  const getState = () => ({
    ...state,
    matches(...values: string[]) {
      const currentState = state.get()
      return values.some((value) => matchesState(currentState as string, value))
    },
    hasTag(tag: string) {
      return hasTag(machine, state.get() as string, tag)
    },
  })

  const refsValue = { current: machine.refs?.({ prop, context: ctx }) ?? {} } as {
    current: Record<string, unknown>
  }
  const refs = {
    get(key: string) {
      return refsValue.current[key]
    },
    set(key: string, value: unknown) {
      refsValue.current[key] = value
    },
  }

  const getParams = (): Params<T> =>
    ({
      state: getState(),
      context: ctx,
      event: getEvent(),
      prop,
      send,
      action,
      guard,
      track,
      refs,
      computed: computedValue,
      flush,
      get scope() {
        return scope()
      },
      choose,
    }) as unknown as Params<T>

  type Implementations = Record<string, ((params: Params<T>) => unknown) | undefined>
  const implementations = (kind: 'actions' | 'guards' | 'effects'): Implementations =>
    ((machine.implementations as Record<string, Implementations | undefined> | undefined)?.[kind] ??
      {}) as Implementations

  const action = (keys: unknown) => {
    const names = (isFunction(keys) ? keys(getParams()) : keys) as string[] | undefined
    if (!names) return
    const fns = names.map((name) => {
      const fn = implementations('actions')[name]
      if (!fn) warn(`[zag-js] No implementation found for action "${JSON.stringify(name)}"`)
      return fn
    })
    for (const fn of fns) fn?.(getParams())
  }
  const guard = (name: unknown) => {
    if (isFunction(name)) return name(getParams())
    const fn = implementations('guards')[name as string]
    if (!fn) warn(`[zag-js] No implementation found for guard "${JSON.stringify(name)}"`)
    return fn?.(getParams())
  }
  const effectOf = (keys: unknown) => {
    const names = (isFunction(keys) ? keys(getParams()) : keys) as string[] | undefined
    if (!names) return
    const fns = names.map((name) => {
      const fn = implementations('effects')[name]
      if (!fn) warn(`[zag-js] No implementation found for effect "${JSON.stringify(name)}"`)
      return fn
    })
    const cleanups: VoidFunction[] = []
    for (const fn of fns) {
      const cleanup = fn?.(getParams())
      if (typeof cleanup === 'function') cleanups.push(cleanup as VoidFunction)
    }
    return () => cleanups.forEach((fn) => fn())
  }
  const choose = (transitions: unknown) =>
    toArray(transitions as object).find((transition) => {
      const { guard: test } = transition as { guard?: unknown }
      if (!test) return true
      if (isString(test)) return !!guard(test)
      if (isFunction(test)) return !!test(getParams())
      return false
    })
  const computedValue = ((key: string) => {
    ensure(machine.computed, () => `[zag-js] No computed object found on machine`)
    const fn = (machine.computed as Record<string, (params: unknown) => unknown>)[key]
    return fn?.({
      context: ctx,
      event: getEvent(),
      prop,
      refs,
      get scope() {
        return scope()
      },
      computed: computedValue,
    })
  }) as Params<T>['computed']

  const state = bindable(() => ({
    defaultValue: resolveStateValue(machine, machine.initialState({ prop })),
    onChange(nextState: unknown, prevState: unknown) {
      const { exiting, entering } = getExitEnterStates(
        machine,
        prevState as string,
        nextState as string,
        transitionRef?.reenter,
      )
      exiting.forEach((item) => {
        effects.get(item.path)?.()
        effects.delete(item.path)
      })
      exiting.forEach((item) => {
        action(item.state?.exit)
      })
      action(transitionRef?.actions)
      entering.forEach((item) => {
        const cleanup = effectOf(item.state?.effects)
        if (cleanup) {
          const existing = effects.get(item.path)
          effects.set(item.path, existing ? callAll(existing, cleanup) : cleanup)
        }
      })
      if (prevState === INIT_STATE) {
        action(machine.entry)
        const cleanup = effectOf(machine.effects)
        if (cleanup) {
          const existing = effects.get(INIT_STATE)
          effects.set(INIT_STATE, existing ? callAll(existing, cleanup) : cleanup)
        }
      }
      entering.forEach((item) => {
        action(item.state?.entry)
      })
    },
  }))

  let status = MachineStatus.NotStarted
  let pendingEvents: EventObject[] = []

  afterNextRender(
    () => {
      if (status === MachineStatus.Stopped) return
      const started = status === MachineStatus.Started
      status = MachineStatus.Started
      debug(started ? 'rehydrating...' : 'initializing...')
      untracked(() => {
        state.invoke(state.initial as T['state'], INIT_STATE as T['state'])
        const events = pendingEvents
        pendingEvents = []
        for (const event of events) send(event)
      })
    },
    { injector },
  )

  destroyRef.onDestroy(() => {
    status = MachineStatus.Stopped
    pendingEvents = []
    debug('unmounting...')
    for (const fn of effects.values()) fn()
    effects = new Map()
    action(machine.exit)
  })

  function send(event: EventObject): void {
    if (status !== MachineStatus.Started) {
      pendingEvents.push(event)
      return
    }
    untracked(() => {
      previousEventRef.current = eventRef.current
      eventRef.current = event
      const currentState = state.get() as string
      const { transitions, source } = findTransition(machine, currentState, event.type)
      const transition = choose(transitions) as
        { target?: string; reenter?: boolean; actions?: unknown } | undefined
      if (!transition) return
      transitionRef = transition
      const target = resolveStateValue(machine, transition.target ?? currentState, source)
      debug(
        'transition',
        event.type,
        transition.target || currentState,
        `(${String(transition.actions)})`,
      )
      if (target !== currentState) state.set(target as T['state'])
      else if (transition.reenter)
        state.invoke(currentState as T['state'], currentState as T['state'])
      else action(transition.actions)
    })
  }

  machine.watch?.(getParams())

  return {
    state: getState(),
    send,
    context: ctx,
    prop,
    get scope() {
      return scope()
    },
    refs,
    computed: computedValue,
    event: getEvent(),
    getStatus: () => status,
  } as unknown as Service<T>
}
