import type { IconRole } from '../icon/roles'

/**
 * The imperative side of Toast (`design/components/toast.md`), without a
 * framework in it.
 *
 * A toast is raised where the outcome happens, such as a submit handler or a
 * mutation callback, and those places should not render a component. So the
 * API is a function over a store, and each foundation creates one store for
 * its framework (`createToastStore`), typed with its own node type for a
 * toast's `content`. The viewport subscribes to it; `toast()` works from
 * anywhere without a hook, a context or prop drilling. Every framework's store
 * evicts, updates in place and settles a promise by the same rules, because
 * they are this function.
 *
 * Toasts report outcomes. They never ask confirmation questions (that is Dialog).
 * State-owned error notices persist until resolved or explicitly dismissed;
 * required recovery controls cannot disappear while their owning state remains.
 * A toast's tone sets how long it stays unless the call says (`toneLifetime`),
 * and a toast with an action waits to be dismissed, so a toast raised by
 * `toast()`, a declared Toast and React's ToastNotice keep one rule.
 */

export type ToastTone = 'neutral' | 'success' | 'danger' | 'warning' | 'info'

export interface ToastAction {
  label: string
  onClick: () => void
}

/** A toast, as raised. `Content` is the framework's node type. */
export interface ToastStoreOptions<Content = unknown> {
  title: string
  description?: string
  /** Content supplied by the host, including current, controller-gated recovery controls. */
  content?: Content
  /** Required recovery actions stay reachable until their owning state resolves. */
  dismissible?: boolean
  /**
   * State-owned notices are removed by their owner, never evicted by another notification.
   * A call that sets neither this nor `durationMs` takes its tone's lifetime: danger and
   * warning are retained and pinned, and the other tones leave after the default duration.
   */
  retained?: boolean
  tone?: ToastTone
  /**
   * At most one; a shortcut, never the only way to do what it does. A call with
   * an action that sets neither `durationMs` nor `retained` is pinned, so a
   * reader has the time to reach the action.
   */
  action?: ToastAction
  /**
   * `Infinity` pins the toast until it is dismissed. A call that sets neither this nor
   * `retained` takes its tone's lifetime (see `retained`); one that sets only `retained`
   * gets `TOAST_DEFAULT_DURATION_MS`.
   */
  durationMs?: number
  /**
   * A live toast's id updates it in place: same card and position, new content,
   * timer restarted. An unknown id raises a new toast. `toast.promise` uses
   * this, not a special path.
   */
  id?: string
  /**
   * Called once when the toast leaves for a reason other than its owner's: the
   * reader dismissed it, its time ran out, `toast.dismiss` closed it, or a newer
   * toast evicted it. Removing it (`remove`) and updating it in place do not
   * call it, because the owner already knows.
   */
  onDismiss?: () => void
}

/** A toast, as the viewport draws it. */
export interface ToastStoreRecord<Content = unknown> extends ToastStoreOptions<Content> {
  id: string
  tone: ToastTone
  durationMs: number
  /**
   * The pending state of `toast.promise`: the `loading` glyph spins in the
   * tone-icon slot. It is a record field, not an option, because no call site
   * asks for a spinner; the promise's pending phase sets it.
   */
  loading?: boolean
  /**
   * How many times this record has been replaced in place. The card reads it to
   * restart the dismiss timer on update. Swapping content alone would keep the
   * old timer running, and an updated toast needs a full countdown.
   */
  revision: number
  /**
   * Which raise the record came from: the store's count of `toast()` calls when it was raised.
   * An update in place keeps it, and a toast raised again under the same id gets a new one, so
   * the viewport says it again (`announceToasts`) while an update that changes no words says
   * nothing.
   */
  raised: number
  /**
   * Set while the toast leaves. Dismissal has two steps so that a toast closed
   * by hand passes through the same `data-state="closed"` as one that timed
   * out. That state styles a leaving card and stops it taking clicks during the
   * exit.
   */
  closing?: boolean
}

/**
 * One phase of `toast.promise`, as one value in the form `toast.success` takes:
 * a title string, or an options object without `tone` (the phase sets the
 * tone).
 */
export type ToastStorePhase<Content = unknown> = string | Omit<ToastStoreOptions<Content>, 'tone'>

export interface ToastStorePromiseSpec<Content = unknown> {
  loading: ToastStorePhase<Content>
  success: ToastStorePhase<Content>
  error: ToastStorePhase<Content>
}

type Toned<Content> = (
  title: string,
  options?: Omit<ToastStoreOptions<Content>, 'title' | 'tone'>,
) => string

/** `toast(options)`, with the per-tone shorthands, `promise` and `dismiss` on it. */
export type ToastFunction<Content = unknown> = ((options: ToastStoreOptions<Content>) => string) & {
  success: Toned<Content>
  danger: Toned<Content>
  warning: Toned<Content>
  info: Toned<Content>
  /** The async outcome as one card: loading, then the settled state, in place. */
  promise: (promise: Promise<unknown>, spec: ToastStorePromiseSpec<Content>) => string
  /** Omit the id to dismiss every toast. */
  dismiss: (id?: string) => void
}

export interface ToastStore<Content = unknown> {
  toast: ToastFunction<Content>
  /** Calls `listener` after every change; returns the unsubscribe. */
  subscribe: (listener: () => void) => () => void
  /** The records, referentially stable between changes. */
  get: () => readonly ToastStoreRecord<Content>[]
  /** Step two of dismissal, called by the card once its closed state has been rendered. */
  remove: (id: string) => void
}

export const TOAST_DEFAULT_DURATION_MS = 5000

/**
 * Four transient notices. State-owned errors are retained in a scrollable
 * viewport so a burst cannot silently evict a validation error or recovery action.
 */
export const TOAST_MAX_VISIBLE = 4

/**
 * How long a toast of a tone stays when its call does not say
 * (`design/components/toast.md`). A danger or warning toast reports an outcome
 * the reader may have to act on, so it is retained and pinned until it is
 * resolved or dismissed. Any other tone reports an outcome that needs nothing
 * once read, so it leaves after `TOAST_DEFAULT_DURATION_MS` and may be evicted.
 */
export function toneLifetime(tone: ToastTone): { retained: boolean; durationMs: number } {
  return tone === 'danger' || tone === 'warning'
    ? { retained: true, durationMs: Number.POSITIVE_INFINITY }
    : { retained: false, durationMs: TOAST_DEFAULT_DURATION_MS }
}

/**
 * The lifetime a call gets: the tone's when it sets neither `retained` nor
 * `durationMs`, and otherwise what it sets, with the default duration and no
 * retention for the one it leaves out, as before the tone decided.
 *
 * A toast with an action that sets neither is pinned until it is dismissed,
 * whatever its tone. A reader who works by keyboard or with a screen reader
 * hears the toast, then has to reach its action with F8 and Tab, and a timer
 * that ends first takes the action away (WCAG 2.2.1, timing adjustable). The
 * tone still decides whether newer toasts may evict it.
 */
function lifetimeOf(options: ToastStoreOptions<unknown>): {
  retained: boolean | undefined
  durationMs: number
} {
  if (options.retained === undefined && options.durationMs === undefined) {
    const lifetime = toneLifetime(options.tone ?? 'neutral')
    return options.action === undefined
      ? lifetime
      : { ...lifetime, durationMs: Number.POSITIVE_INFINITY }
  }
  return {
    retained: options.retained,
    durationMs: options.durationMs ?? TOAST_DEFAULT_DURATION_MS,
  }
}

/** Tone → the icon role that marks it. Neutral has no mark. */
export const TOAST_TONE_ICON: Record<Exclude<ToastTone, 'neutral'>, IconRole> = {
  success: 'success',
  danger: 'error',
  warning: 'warning',
  info: 'info',
}

/** A store and its `toast()`. A foundation creates one, so a page has one per framework. */
export function createToastStore<Content = unknown>(): ToastStore<Content> {
  type Options = ToastStoreOptions<Content>
  type Record = ToastStoreRecord<Content>

  let records: readonly Record[] = []
  let sequence = 0
  const listeners = new Set<() => void>()

  function publish(next: readonly Record[]): void {
    records = next
    for (const listener of listeners) listener()
  }

  /** Raise or update. `loading` is internal to the store (the promise's pending state). */
  function raise(options: Options & { loading?: boolean }): string {
    sequence += 1
    const id = options.id ?? `toast-${sequence}`

    // Update in place: a live toast's id replaces that record at the same index,
    // so the card keeps its position. The springs are for arrivals and
    // departures, and an update is neither. A closing card cannot be updated; its
    // id raises a new toast instead.
    const live = records.findIndex((record) => record.id === id && record.closing !== true)
    if (live !== -1) {
      const previous = records[live] as Record
      const record: Record = {
        ...options,
        id,
        tone: options.tone ?? 'neutral',
        ...lifetimeOf(options),
        revision: previous.revision + 1,
        raised: previous.raised,
      }
      publish(records.map((entry, index) => (index === live ? record : entry)))
      return id
    }

    const record: Record = {
      ...options,
      id,
      tone: options.tone ?? 'neutral',
      ...lifetimeOf(options),
      revision: 0,
      raised: sequence,
    }
    // The oldest are evicted, so the toast just raised is always kept.
    const next = [...records, record]
    const expendable = next.filter((entry) => !entry.retained && entry.dismissible !== false)
    const evicted = expendable.slice(0, Math.max(0, next.length - TOAST_MAX_VISIBLE))
    publish(next.filter((entry) => !evicted.includes(entry)))
    left(evicted)
    return record.id
  }

  /**
   * Tells each toast's owner that it left. It runs after the change is
   * published, so a callback that raises a toast adds it to the new records.
   * A toast already closing has told its owner.
   */
  function left(gone: readonly Record[]): void {
    for (const record of gone) if (record.closing !== true) record.onDismiss?.()
  }

  /** Step one: mark it closing. `remove` is step two, and the card asks for it. */
  function dismiss(id?: string): void {
    const closed = records.filter((record) => id === undefined || record.id === id)
    publish(
      records.map((record) =>
        id === undefined || record.id === id ? { ...record, closing: true } : record,
      ),
    )
    left(closed)
  }

  function remove(id: string): void {
    publish(records.filter((record) => record.id !== id))
  }

  const toned =
    (tone: Exclude<ToastTone, 'neutral'>): Toned<Content> =>
    (title, options = {}) =>
      raise({ ...options, title, tone })

  const phased = (phase: ToastStorePhase<Content>): Omit<Options, 'tone'> =>
    typeof phase === 'string' ? { title: phase } : phase

  /**
   * Shows an async outcome as one card. The `loading` state is raised at once:
   * neutral surface, the `loading` glyph in the tone-icon slot, and a pinned
   * duration, because a wait must not time out. On settling it becomes the
   * `success` or `error` state **in place**: same id, tone from the phase, and
   * the timer starts then. Returns the id used for the whole lifecycle. The
   * phases are fixed values; a function of the settled value is deliberately not
   * accepted.
   */
  function promised(promise: Promise<unknown>, spec: ToastStorePromiseSpec<Content>): string {
    const id = raise({
      ...phased(spec.loading),
      durationMs: Number.POSITIVE_INFINITY,
      loading: true,
    })
    promise.then(
      () => raise({ ...phased(spec.success), id, tone: 'success' }),
      () => raise({ ...phased(spec.error), id, tone: 'danger' }),
    )
    return id
  }

  /**
   * `toast(options)` raises a toast and returns its id. The per-tone shorthands
   * are the same call with the tone filled in, because `toast.success('Saved')`
   * reads better at the call site.
   */
  const toast: ToastFunction<Content> = Object.assign(
    (options: Options): string => raise(options),
    {
      success: toned('success'),
      danger: toned('danger'),
      warning: toned('warning'),
      info: toned('info'),
      promise: promised,
      dismiss,
    },
  )

  return {
    toast,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    get: () => records,
    remove,
  }
}
