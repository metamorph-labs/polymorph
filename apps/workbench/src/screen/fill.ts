import type { ScreenInput } from '@polymorph/spec/schema'

import { sampleBinding } from '../composer/draw'

/**
 * What fills the inputs a spec declares, on the screen page.
 *
 * A spec binds its content to inputs and holds no data, so a picture of it needs some. Each input
 * is filled in one of three ways:
 *
 *  - `data`: the caller gave a JSON value under the input's name, and the screen is drawn with it.
 *  - `sample`: the caller gave none, so the value comes from the input's declared type by the
 *    composer's rule (`sampleBinding`). A string is its own name in brackets, a list is empty, a
 *    domain object is absent. No data is invented.
 *  - `stub`: the input is a callback. JSON cannot hold a function, so a callback is always a stub
 *    that answers by its declared return type.
 *
 * The result says how each input was filled, so a reader of the picture knows which parts of it
 * are the caller's data.
 */

export interface Fill {
  name: string
  type: string
  from: 'data' | 'sample' | 'stub'
  /** The sampled value, or what the stub answers. Absent for data, which the caller already has. */
  value?: string
}

export interface Filled {
  values: ReadonlyMap<string, unknown>
  fills: Fill[]
}

/** A callback's declared type has an arrow. The composer's sampler uses the same test. */
const isCallback = (type: string): boolean => type.includes('=>')

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

/** What a stub answers, by the return type its input declares, and the words that say so. */
function stubFor(type: string): { stub: (...args: unknown[]) => unknown; answers: string } {
  const returns = returnTypeOf(type)
  const promised = /^Promise<(.*)>$/.exec(returns)
  if (promised !== null) {
    const inner = stubFor(`=> ${promised[1] ?? 'void'}`)
    return {
      stub: (...args) => Promise.resolve(inner.stub(...args)),
      answers: `a promise of ${inner.answers}`,
    }
  }
  if (returns === 'string') {
    return { stub: (first) => keyOf(first), answers: 'the key of its first argument' }
  }
  if (returns === 'boolean') return { stub: () => false, answers: 'false' }
  if (returns === 'number') return { stub: () => 0, answers: '0' }
  if (returns.endsWith('[]')) return { stub: () => [], answers: 'an empty list' }
  return { stub: () => undefined, answers: 'nothing' }
}

/** A sampled value as the answer shows it. `undefined` has no JSON form, so it is named. */
const shown = (value: unknown): string => (value === undefined ? 'absent' : JSON.stringify(value))

/**
 * A value for every declared input: the caller's data where there is some, a stub for a callback,
 * and a sample from the type for the rest.
 */
export function fillInputs(
  inputs: readonly ScreenInput[],
  data: Readonly<Record<string, unknown>>,
): Filled {
  const values = new Map<string, unknown>()
  const fills: Fill[] = []

  for (const { name, type } of inputs) {
    if (isCallback(type)) {
      const { stub, answers } = stubFor(type)
      values.set(name, stub)
      fills.push({ name, type, from: 'stub', value: `answers ${answers}` })
    } else if (Object.hasOwn(data, name)) {
      values.set(name, data[name])
      fills.push({ name, type, from: 'data' })
    } else {
      const sample = sampleBinding(name, inputs)
      values.set(name, sample)
      fills.push({ name, type, from: 'sample', value: shown(sample) })
    }
  }

  return { values, fills }
}

/**
 * The value at a binding's path. The head names an input, and each later name reads a property.
 * A path through a value that is absent is absent, as optional data is.
 */
export function valueAt(path: string, values: ReadonlyMap<string, unknown>): unknown {
  const [head = '', ...rest] = path.split('.')
  let value = values.get(head)
  for (const key of rest) {
    if (value === null || value === undefined) return undefined
    value = (value as Record<string, unknown>)[key]
  }
  return value
}
