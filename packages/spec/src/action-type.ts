import { unionParts } from '@polymorph/registry/frameworks'

/**
 * Whether a printed TypeScript type is a callback, read from its text.
 *
 * The validator asks it of a screen's inputs and of a member's props on a
 * native platform, the emitters ask it, and the run-time walk asks it of every
 * input and prop it draws. It lives apart from `validate.ts` so the walk loads
 * this and not the validator. `validate.ts` re-exports it.
 */

/**
 * The text without the parentheses around all of it, and without the space
 * `trim` removes inside each pair. Each bracket's closer is found in one pass,
 * so a text of `n` nested pairs costs `n`, not `n²`: a screen declares its
 * input types, and the walk reads them while the screen streams.
 */
function unwrap(text: string): string {
  const blank = (at: number) => (text[at] as string).trim() === ''
  let start = 0
  let end = text.length - 1
  while (start <= end && blank(start)) start += 1
  while (end >= start && blank(end)) end -= 1
  if (text[start] !== '(') return text.slice(start, end + 1)
  const closes = closers(text, start)
  while (start <= end && text[start] === '(' && closes[start] === end) {
    start += 1
    end -= 1
    while (start <= end && blank(start)) start += 1
    while (end >= start && blank(end)) end -= 1
  }
  return text.slice(start, end + 1)
}

/**
 * For each opening bracket from `from` on, the index of the bracket that closes
 * it as `closingParen` counts them, or -1: brackets of every kind share one
 * depth, and `>` after `=` closes nothing.
 */
function closers(text: string, from: number): Int32Array {
  const closes = new Int32Array(text.length).fill(-1)
  const open: number[] = []
  for (let at = from; at < text.length; at += 1) {
    const char = text[at] as string
    if ('(<{['.includes(char)) open.push(at)
    else if (')}]'.includes(char) || (char === '>' && text[at - 1] !== '=')) {
      const opener = open.pop()
      if (opener !== undefined) closes[opener] = at
    }
  }
  return closes
}

/** The index of the bracket that closes the one at 0, or -1. */
function closingParen(text: string): number {
  let depth = 0
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at] as string
    if ('(<{['.includes(char)) depth += 1
    else if (')}]'.includes(char) || (char === '>' && text[at - 1] !== '=')) {
      depth -= 1
      if (depth === 0) return at
    }
  }
  return -1
}

/** Whether one branch of a printed type is a function type: `(…) => R`, generic or not. */
function isFunctionText(part: string): boolean {
  let text = unwrap(part)
  if (text.startsWith('<')) {
    const end = closingParen(text)
    if (end === -1) return false
    text = text.slice(end + 1).trim()
  }
  if (!text.startsWith('(')) return false
  const end = closingParen(text)
  return (
    end !== -1 &&
    text
      .slice(end + 1)
      .trim()
      .startsWith('=>')
  )
}

/**
 * React's handler aliases, `ReactEventHandler<T>` and `CompositionEventHandler<T>`
 * among them: each is a function of one DOM event, named rather than written
 * out.
 */
export const EVENT_HANDLER_ALIAS = /^(?:React\.)?[A-Z]\w*EventHandler(?:<.*>)?$/s

/**
 * Whether a printed or written TypeScript type is a function, alone or in a
 * union with `null` or `undefined`: an action among a screen's inputs, an
 * event among a member's props. A union of functions (`DatePicker`'s
 * `onChange`, one per granularity) is an event too, and so is one of React's
 * handler aliases (`EVENT_HANDLER_ALIAS`). Read from the text, because this
 * half has no compiler; the brackets are tracked, so
 * `(sort: DataTableSort) => void` is one function and `DataTableColumn<Row>[]`
 * none.
 */
export function isActionType(type: string): boolean {
  // A function's result runs to the end of the text: `() => void | Promise<void>`
  // is one function, not a union with a promise.
  if (isFunctionText(type)) return true
  const solid = unionParts(type).filter((part) => part !== 'null')
  return (
    solid.length > 0 &&
    solid.every((part) => isFunctionText(part) || EVENT_HANDLER_ALIAS.test(unwrap(part)))
  )
}
