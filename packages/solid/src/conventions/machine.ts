/*
 * `useMachine` and its bindable values, tracked dependencies and refs are
 * adapted from `@zag-js/solid` 1.46.0 (`src/machine.ts`, `src/bindable.ts`,
 * `src/track.ts`, `src/refs.ts`), under the MIT License:
 *
 * Copyright (c) 2021 Chakra UI
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import {
  createScope,
  findTransition,
  getExitEnterStates,
  hasTag,
  INIT_STATE,
  MachineStatus,
  matchesState,
  resolveStateValue,
  type ActionsOrFn,
  type Bindable,
  type BindableContext,
  type BindableFn,
  type BindableParams,
  type BindableRefs,
  type ChooseFn,
  type ComputedFn,
  type EffectsOrFn,
  type GuardFn,
  type Machine,
  type MachineSchema,
  type Params,
  type PropFn,
  type Scope,
  type Service,
  type Transition,
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
import {
  createEffect,
  createMemo,
  createSignal,
  mergeProps,
  onCleanup,
  onMount,
  untrack,
  type Accessor,
} from 'solid-js'

/**
 * A Zag machine for a Solid member: `@zag-js/solid`'s `useMachine`, except
 * that `send` applies an event before it returns.
 *
 * Zag's Solid adapter applies each event in a microtask after `send`. Its Vue
 * and React adapters apply it at once, and the descriptions are written
 * against that: Carousel moves its machine into the state that reads a scroll
 * and then hands it the scroll, and MultiSelect opens its list and then
 * highlights the row an arrow key chose. So `send` here runs the transition as
 * the Vue adapter's does, for the member's events and the machine's own alike.
 * The transition runs untracked, so a computation that sends an event does not
 * subscribe to what the transition reads. An event sent before the machine
 * starts waits until it starts, as in the Vue adapter, and one sent after the
 * member is disposed is dropped. Of the waiting events, a later one with the
 * same `replaces` key drops an earlier one, which is what the Solid adapter's
 * replace tracker does for its queued events.
 */
export function useMachine<T extends MachineSchema>(
  machine: Machine<T>,
  userProps: Partial<T['props']> | Accessor<Partial<T['props']>> = {},
): Service<T> {
  const scope = createMemo(() => {
    const { id, ids, getRootNode } = (access(userProps) ?? {}) as Partial<ScopeProps>
    return createScope({ id, ids, getRootNode } as ScopeProps)
  })
  const debug = (...args: unknown[]) => {
    if (machine.debug === true) console.log(...args)
  }
  const props = createMemo(
    () =>
      machine.props?.({
        props: compact(access(userProps) as Record<string, unknown>) as Partial<T['props']>,
        scope: scope(),
      }) ?? access(userProps),
  )
  const prop: PropFn<T> = (key) => (props() as NonNullable<T['props']>)[key]

  const context = machine.context?.({
    prop,
    bindable: createBindable,
    get scope() {
      return scope()
    },
    flush,
    getContext() {
      return ctx
    },
    getComputed() {
      return computed
    },
    getRefs() {
      return refs
    },
    getEvent() {
      return getEvent()
    },
  })
  const ctx: BindableContext<T> = {
    get: (key) => context?.[key].get() as NonNullable<T['context']>[typeof key],
    set: (key, value) => context?.[key].set(value),
    initial: (key) => context?.[key].initial as NonNullable<T['context']>[typeof key],
    hash: (key) => {
      const entry = context?.[key]
      return entry?.hash(entry.get()) as string
    },
  }

  let effects = new Map<string, VoidFunction>()
  let transition: Transition<T> | null = null
  let previousEvent: MachineEvent<T> | null = null
  let currentEvent = { type: '' } as MachineEvent<T>

  const getEvent = () =>
    mergeProps(currentEvent, {
      current: () => currentEvent,
      previous: () => previousEvent as MachineEvent<T>,
    })
  const getState = () =>
    mergeProps(state, {
      matches: (...values: T['state'][]) => {
        const current = state.get()
        return values.some((value) => matchesState(current, value as string))
      },
      hasTag: (tag: T['tag']) => hasTag(machine, state.get(), tag),
    })
  const refs = createRefs(machine.refs?.({ prop, context: ctx }) ?? {}) as BindableRefs<T>

  const getParams = (): Params<T> => ({
    state: getState(),
    context: ctx,
    event: getEvent(),
    prop,
    send,
    action,
    guard,
    track: createTrack,
    refs,
    computed,
    flush,
    get scope() {
      return scope()
    },
    choose,
  })

  const action = (keys: ActionsOrFn<T> | undefined) => {
    const names = isFunction(keys) ? keys(getParams()) : keys
    if (!names) return
    const fns = names.map((name) => {
      const fn = machine.implementations?.actions?.[name]
      if (!fn) warn(`[zag-js] No implementation found for action "${JSON.stringify(name)}"`)
      return fn
    })
    for (const fn of fns) fn?.(getParams())
  }
  const guard = (key: T['guard'] | GuardFn<T>) => {
    if (isFunction(key)) return key(getParams())
    const fn = machine.implementations?.guards?.[key as NonNullable<T['guard']>]
    if (!fn) warn(`[zag-js] No implementation found for guard "${JSON.stringify(key)}"`)
    return fn?.(getParams())
  }
  const effect = (keys: EffectsOrFn<T> | undefined) => {
    const names = isFunction(keys) ? keys(getParams()) : keys
    if (!names) return undefined
    const fns = names.map((name) => {
      const fn = machine.implementations?.effects?.[name]
      if (!fn) warn(`[zag-js] No implementation found for effect "${JSON.stringify(name)}"`)
      return fn
    })
    const cleanups: VoidFunction[] = []
    for (const fn of fns) {
      const cleanup = fn?.(getParams())
      if (cleanup) cleanups.push(cleanup)
    }
    return () => cleanups.forEach((fn) => fn())
  }
  const choose: ChooseFn<T> = (transitions) =>
    toArray(transitions).find((candidate) => {
      let result = !candidate.guard
      if (isString(candidate.guard)) result = !!guard(candidate.guard)
      else if (isFunction(candidate.guard)) result = candidate.guard(getParams())
      return result
    }) as Transition<T> | undefined
  const computed: ComputedFn<T> = (key) => {
    ensure(machine.computed, () => `[zag-js] No computed object found on machine`)
    const fn = machine.computed[key]
    return fn({
      context: ctx,
      event: currentEvent,
      prop,
      refs,
      scope: scope(),
      computed,
    })
  }

  /** Records a state's effect cleanup, after any it already holds. */
  const hold = (path: string, cleanup: VoidFunction | undefined) => {
    if (!cleanup) return
    const existing = effects.get(path)
    effects.set(path, existing ? callAll(existing, cleanup) : cleanup)
  }
  const state = createBindable<T['state']>(() => ({
    defaultValue: resolveStateValue(machine, machine.initialState({ prop })),
    onChange(nextState, prevState) {
      const { exiting, entering } = getExitEnterStates(
        machine,
        prevState,
        nextState,
        transition?.reenter,
      )
      exiting.forEach((item) => {
        effects.get(item.path)?.()
        effects.delete(item.path)
      })
      exiting.forEach((item) => action(item.state.exit))
      action(transition?.actions)
      entering.forEach((item) => hold(item.path, effect(item.state.effects)))
      if (prevState === INIT_STATE) {
        action(machine.entry)
        hold(INIT_STATE, effect(machine.effects))
      }
      entering.forEach((item) => action(item.state.entry))
    },
  }))

  let status = MachineStatus.NotStarted
  let waiting: MachineEvent<T>[] = []

  onMount(() => {
    const started = status === MachineStatus.Started
    status = MachineStatus.Started
    debug(started ? 'rehydrating...' : 'initializing...')
    state.invoke(state.initial as T['state'], INIT_STATE as T['state'])
    const events = waiting
    waiting = []
    for (const event of events) send(event)
  })
  onCleanup(() => {
    const started = status === MachineStatus.Started
    status = MachineStatus.Stopped
    waiting = []
    if (!started) return
    debug('unmounting...')
    effects.forEach((fn) => fn())
    effects = new Map()
    transition = null
    action(machine.exit)
  })

  /** One event's transition, as the Solid adapter's queued task runs it, without the queue. */
  const apply = (event: MachineEvent<T>) => {
    previousEvent = currentEvent
    currentEvent = event
    const current = state.get()
    const { transitions, source } = findTransition(machine, current, event.type as string)
    const chosen = choose(transitions)
    if (!chosen) return
    transition = chosen
    const target = resolveStateValue(machine, chosen.target ?? current, source)
    debug('transition', event.type, chosen.target ?? current, `(${String(chosen.actions)})`)
    if (target !== current) state.set(target)
    else if (chosen.reenter) state.invoke(current, current)
    else action(chosen.actions)
  }
  const send = (event: MachineEvent<T>) => {
    if (status === MachineStatus.NotStarted) {
      const key = event.replaces
      if (key !== undefined) waiting = waiting.filter((queued) => queued.replaces !== key)
      waiting.push(event)
      return
    }
    if (status !== MachineStatus.Started) return
    untrack(() => apply(event))
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
    computed,
    event: getEvent(),
    getStatus: () => status,
  }
}

/** What a machine's scope is made from: its id, its parts' ids and the root its elements are in. */
type ScopeProps = Pick<Scope, 'id' | 'ids' | 'getRootNode'>

/** An event a machine's service takes. */
type MachineEvent<T extends MachineSchema> = Parameters<Service<T>['send']>[0]

function flush(fn: VoidFunction): void {
  fn()
}

function access<V>(value: V | Accessor<V>): V {
  return isFunction(value) ? (value as Accessor<V>)() : value
}

/**
 * A value a machine holds: its own signal, or the caller's `value` while the
 * caller controls it. `onChange` runs when `set` changes it.
 */
function bindable<V>(props: () => BindableParams<V>): Bindable<V> {
  const initial = props().value ?? props().defaultValue
  const equal = props().isEqual ?? Object.is
  const [value, setValue] = createSignal(initial as V)
  const controlled = createMemo(() => props().value !== undefined)
  const valueRef = { current: value() }
  createEffect(() => {
    valueRef.current = controlled() ? (props().value as V) : value()
  })
  const set = (next: V | ((prev: V) => V)) => {
    const prev = untrack(() => (controlled() ? (props().value as V) : value()))
    const resolved = isFunction(next) ? (next as (prev: V) => V)(prev) : next
    if (props().debug) {
      console.log(`[bindable > ${String(props().debug)}] setValue`, { next: resolved, prev })
    }
    if (!controlled()) setValue(() => resolved)
    if (!equal(resolved, prev)) props().onChange?.(resolved, prev)
  }
  const get = (): V => {
    const read = controlled() ? props().value : value
    return (isFunction(read) ? read() : read) as V
  }
  return {
    initial,
    ref: valueRef,
    get,
    set,
    invoke(nextValue, prevValue) {
      props().onChange?.(nextValue, prevValue)
    },
    hash(current) {
      return props().hash?.(current) ?? String(current)
    },
  }
}

const createBindable: BindableFn = Object.assign(bindable, {
  cleanup: (fn: VoidFunction) => onCleanup(() => fn()),
  ref: <V>(defaultValue: V) => {
    let value = defaultValue
    return {
      get: () => value,
      set: (next: V) => {
        value = next
      },
    }
  },
})

/** Runs `effect` each time one of `deps` returns a value unequal to the one it last returned. */
function createTrack(deps: ReadonlyArray<() => unknown>, effect: VoidFunction): void {
  let previous: unknown[] = []
  let first = true
  createEffect(() => {
    if (first) {
      previous = deps.map(access)
      first = false
      return
    }
    const changed = deps.some((dep, index) => !isEqual(previous[index], access(dep)))
    if (changed) {
      previous = deps.map(access)
      effect()
    }
  })
}

/** A machine's refs: plain values it keeps across transitions, which nothing tracks. */
function createRefs<R extends Record<string, unknown>>(refs: R) {
  const ref = { current: refs }
  return {
    get: <K extends keyof R>(key: K): R[K] => ref.current[key],
    set: <K extends keyof R>(key: K, value: R[K]) => {
      ref.current[key] = value
    },
  }
}
