import { isActionType } from '@polymorph/spec/action-type'

/**
 * What a callback answers, and what fills an input a host gave no data for.
 *
 * A screen's callbacks are inputs whose type is a function. What a member is
 * handed for one is decided by the prop or the field that receives it, not by
 * the type the input declares, as a member calls a prop by the prop's type:
 *
 *  - A receiver that returns nothing (`void`, `undefined`, or a promise of
 *    either) is handed an **action**: the person did something, and the host
 *    is told. A member that waits on it (ConfirmDialog while it saves) waits on
 *    the promise the host's handler returns.
 *  - A receiver that returns a value (`getRowId: (row: Row) => string`) asks
 *    a **question** while the member draws: a row's key, whether a date can be
 *    picked. A document cannot answer it, so a receiver that may be left out
 *    is handed nothing and the member answers by default, and a required one
 *    is handed a stub that answers by the receiver's return type. The host is
 *    never told, as a table asks one question per row on every drawing.
 *  - A receiver that is no callback is handed nothing (`walk.ts`).
 *
 * The input's own type says what its `Fill` reads. A required callback the
 * document leaves unbound answers by the member's prop type, and is never told
 * either.
 *
 * A data input the host gave no value for is absent when the screen runs. A
 * picture of the screen (the composer, the MCP tool `render_screen`) asks for
 * a sample instead, from the input's type: a string is its own name in
 * brackets, a list is empty, a domain object is absent. No data is invented.
 */

/** How one declared input was filled. The screen page's report to `render_screen` is a list of these. */
export interface Fill {
  name: string
  type: string
  /**
   * `data`: the host gave a value under the input's name. `stub`: the input is
   * a callback, which the screen makes: an action told to the host, or a
   * question its stub answers (`value` says which). `sample`: no value, and
   * the screen asked for one from the type. `absent`: no value, and the input
   * is left out.
   */
  from: 'data' | 'sample' | 'stub' | 'absent'
  /** The sampled value, or what the callback does. Absent for data, which the caller already has. */
  value?: string
}

/**
 * The longest type a screen may declare for an input, in characters. The
 * longest any screen in `design/screens/` or the core's fixtures declares is 78
 * (`{ open: StatProps; urgent: StatProps; response: StatProps; solved:
 * StatProps }`). A longer type is a fault, and the input is data the host has
 * no value for: its text is never read as a type.
 */
export const MAX_TYPE_LENGTH = 500

/** The fault's words for an input whose type is longer than `MAX_TYPE_LENGTH`. */
export const typeTooLong = (name: string, length: number): string =>
  `the type of input \`${name}\` is ${length} characters long, and a type a screen declares is ` +
  `${MAX_TYPE_LENGTH} at most; the input is data with no value`

/** Whether an input's or a prop's printed type is a callback: a function, alone or in a union with `undefined`. */
export const isCallback = (type: string): boolean => isActionType(type)

/**
 * Whether a callback is an action: its declared return type is nothing,
 * `void`, `undefined` or a promise of either. Any other callback is a question.
 */
export function isAction(type: string): boolean {
  return /^(?:|void|undefined|Promise<\s*(?:void|undefined)\s*>)$/.test(returnTypeOf(type))
}

/**
 * What a callback input does, in words, for its `Fill`. The words read for a
 * running screen, whose host is told each action, and for a picture of one,
 * which has no host: an action is named as one, and a question says only what
 * it answers.
 */
export function callbackFill(type: string): string {
  if (!isAction(type)) return `answers ${stubFor(type).answers}`
  return /^Promise</.test(returnTypeOf(type))
    ? 'an action; answers a promise'
    : 'an action; answers nothing'
}

/**
 * The declared return type of a callback: the first type after its last arrow.
 * `(row: Ticket) => string` gives `string`, and `(() => Promise<void>) | undefined` gives
 * `Promise<void>`.
 */
export function returnTypeOf(type: string): string {
  const after = type.slice(type.lastIndexOf('=>') + 2)
  let depth = 0
  let end = after.length
  for (let index = 0; index < after.length; index += 1) {
    const char = after[index]
    if (char === '<' || char === '(' || char === '[' || char === '{') depth += 1
    else if (depth > 0 && (char === '>' || char === ')' || char === ']' || char === '}')) depth -= 1
    else if (depth === 0 && (char === ')' || char === '|' || char === '&')) {
      end = index
      break
    }
  }
  return after.slice(0, end).trim()
}

/** A serial for each object a key callback is asked about, so two rows never share a key. */
const serials = new WeakMap<object, string>()
let nextSerial = 0

/**
 * A key for a value: itself when it is text or a number, its `id` when it has one, and a serial
 * otherwise. A callback that returns a string is nearly always asked for a row's key.
 */
function keyOf(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (typeof value !== 'object' || value === null) return ''
  const id = (value as { id?: unknown }).id
  if (typeof id === 'string' || typeof id === 'number') return String(id)
  const known = serials.get(value)
  if (known !== undefined) return known
  nextSerial += 1
  const serial = `row-${nextSerial}`
  serials.set(value, serial)
  return serial
}

export interface Stub {
  stub: (...args: unknown[]) => unknown
  /** What it answers, in words, for a `Fill`. */
  answers: string
}

/**
 * What a callback answers by the return type its type declares, and the words
 * that say so. Each `Promise<…>` around the return type is peeled in one pass
 * over the text, so no depth of promises makes it throw or take longer than
 * the text is long.
 */
export function stubFor(type: string): Stub {
  const returns = returnTypeOf(type)
  let start = 0
  let end = returns.length
  let promises = 0
  // A line break is no part of a type a member declares; a return type that holds one is no promise.
  if (!/[\n\r\u2028\u2029]/.test(returns)) {
    while (end - start > 'Promise<>'.length - 1 && returns.startsWith('Promise<', start)) {
      if (returns[end - 1] !== '>') break
      promises += 1
      start += 'Promise<'.length
      end -= 1
      while (start < end && (returns[start] as string).trim() === '') start += 1
      while (end > start && (returns[end - 1] as string).trim() === '') end -= 1
    }
  }
  const answer = answerOf(returns.slice(start, end))
  // A promise of a promise is one promise when awaited, so one `Promise.resolve` waits for all.
  return promises === 0
    ? answer
    : {
        stub: (...args) => Promise.resolve(answer.stub(...args)),
        answers: `${'a promise of '.repeat(promises)}${answer.answers}`,
      }
}

/** What a callback answers for a return type that is no promise. */
function answerOf(returns: string): Stub {
  if (returns === 'string') {
    return { stub: (first) => keyOf(first), answers: 'the key of its first argument' }
  }
  if (returns === 'boolean') return { stub: () => false, answers: 'false' }
  if (returns === 'number') return { stub: () => 0, answers: '0' }
  if (returns.endsWith('[]')) return { stub: () => [], answers: 'an empty list' }
  return { stub: () => undefined, answers: 'nothing' }
}

/** Whether a value is a promise, or anything else a member can wait on. */
export const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  (typeof value === 'object' || typeof value === 'function') &&
  value !== null &&
  typeof (value as { then?: unknown }).then === 'function'

/**
 * What a callback returns to the member that called it, given what the host's
 * handler returned (`undefined` where the host was not told).
 *
 * An action hands the member the host's promise, so a member that waits on
 * its callback (ConfirmDialog while it saves) waits on the host; without one,
 * an action declared to return a promise answers a promise of nothing, and
 * any other answers nothing. A question answers by its stub, whatever the
 * host returned, as the host is never asked one.
 */
export function answerFor(type: string, answer: unknown, args: readonly unknown[]): unknown {
  if (!isAction(type)) return stubFor(type).stub(...args)
  if (isThenable(answer)) return answer
  return /^Promise</.test(returnTypeOf(type)) ? Promise.resolve(undefined) : undefined
}

/**
 * A sample for an input with no data, from its declared type: what the
 * composer has always drawn. A string samples as the path in brackets, so the
 * picture shows where the data goes; a boolean is `false`, a number `0`, a
 * list empty, a nullable type `null`; anything else, a domain object or a
 * union, is absent, so an optional prop takes its default.
 */
export function sampleOf(path: string, type: string): unknown {
  if (type === 'boolean') return false
  if (type === 'number') return 0
  if (type.includes('[]') || type.startsWith('readonly')) return []
  if (type === 'string') return `⟨${path}⟩`
  // A type that includes `null` accepts it, for example a clearable Select's "nothing chosen".
  // `undefined` lets optional props use their defaults, whereas `null` would suggest a value
  // exists and the member would dereference it.
  if (type.includes('null')) return null
  return undefined
}

/** A sampled value as a `Fill` shows it. `undefined` has no JSON form, so it is named. */
export const shown = (value: unknown): string =>
  value === undefined ? 'absent' : JSON.stringify(value)

/**
 * The value at a binding's path. The head names an input, and each later name reads a property.
 * A path through a value that is absent is absent, as optional data is.
 */
export function valueAt(path: string, values: ReadonlyMap<string, unknown>): unknown {
  const [head = '', ...rest] = path.split('.')
  let value = values.get(head)
  for (const key of rest) {
    if (value === null || value === undefined) return undefined
    if (typeof value !== 'object' && typeof value !== 'function') return undefined
    // A property of the value's own, never one it inherits: `constructor` reads nothing.
    if (!Object.prototype.hasOwnProperty.call(value, key)) return undefined
    value = (value as Record<string, unknown>)[key]
  }
  return value
}
