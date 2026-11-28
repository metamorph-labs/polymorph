/**
 * The law of drawn props: a native member reads every field of its contract
 * for something other than its identifier, or `undrawn.ts` says why it does
 * not.
 *
 * A contract field a rendering never reads is a value an app passes and nothing
 * shows. The contract cannot leave such a field out, because a member keeps its
 * props on every platform (`docs/native.md`), so the gap is declared instead:
 * one entry in `UNDRAWN`, with the reason. This file finds the reads; the law
 * runs in `laws.test.ts` for SwiftUI and in `kotlin-laws.test.ts` for Compose.
 *
 * A read that only builds the member's identifier is not a drawing. The
 * identifier is what `pmMember` is handed: a test and an audit read it, and no
 * person sees or hears it. A field with no other read is held as recorded: the
 * law asks for its entry, and accepts the entry. `identityStretches` says
 * which reads those are.
 *
 * The law finds a field that is not read. It does not prove that a field is
 * drawn. Any other read counts, whatever is done with the value: a presence
 * check (`props.rowDetail != nil`) counts, and so does a value read into a
 * property that nothing draws. A reviewer still checks what a read does.
 *
 * Like the other native laws it is syntactic. It reads source text and never
 * asks a compiler, so it holds two kinds of field by two rules:
 *
 * - **A field of a props struct** (`PM<Member>Props`, and a part's
 *   `PM<Member><Part>Props`) is read where `props.<field>` is written under a
 *   binding of that struct: a stored property or a parameter `props:
 *   PM<Member>Props`, in a member file or a foundation file. Both packages
 *   name a rendering's props `props`; a binding by another name is not
 *   followed, so a read through one does not count. A read that only hands the
 *   value to another member's props counts when that member reads the field it
 *   lands in, so a prop passed on to a member that drops it is not drawn.
 * - **A field of any other struct of the contract** (a shape a prop holds:
 *   `PMDataTableMessages`, `PMCitationSource`) is read where `.<field>` is
 *   written on a value of that struct, in the file of the member the shape is
 *   named for or in a foundation file, and anywhere when no member's name
 *   starts the shape's. A range's `start` is not a read of a message's
 *   `start`. The law follows a value by the types the source writes and the
 *   values it hands on (`typingOf`): a field the contract types as the struct
 *   (`props.messages`), a name whose type is written as the struct (a
 *   parameter, for its body; a property or a local), a local that starts with
 *   such a value (`let messages = props.messages ?? …`), a case's value that a
 *   pattern or a smart cast binds, a parameter of a closure or a loop handed a
 *   list of the struct or the value itself, a key path's root, a function's
 *   written result, and a parameter of a closure that is the value of a
 *   function-typed field of the contract. An extension of the struct reads its
 *   fields by their names alone. A write, `.<field> = …`, is not a read, and a
 *   read from a value whose type the source does not say counts for no
 *   struct. A shape the hand-written sources build is left out: the member
 *   writes it for the app to read, as an event's payload.
 *
 * Three things are exempt:
 *
 * - A field the contract types `PMUnsupported…` is declared by its type, which
 *   an app cannot give a value (`Generated/Unsupported.swift`,
 *   `Unsupported.kt`).
 * - A states fixture is not a rendering, so nothing in one is a read.
 * - A shape the hand-written sources build is not held, as the second rule
 *   says.
 */

import { lex as lexKotlin } from './kotlin-source'
import { lex as lexSwift } from './swift-source'
import type { UndrawnProps } from './undrawn'

export type NativeLanguage = 'swift' | 'kotlin'

export interface NativeSource {
  /** The file's name in its package's source directory, `Badge.swift`. */
  path: string
  source: string
}

/** Every struct of a generated contract: its name, then each field's type. */
export function contractStructs(
  contract: string,
  language: NativeLanguage,
): Map<string, Map<string, string>> {
  const open =
    language === 'swift'
      ? /^public struct (PM\w+)(?:<[^>]*>)? \{$/
      : /^data class (PM\w+)(?:<[^>]*>)?\($/
  const close = language === 'swift' ? /^\}/ : /^\)/
  const field =
    language === 'swift' ? /^ {2}public var `?(\w+)`?: (.+)$/ : /^ {4}val `?(\w+)`?: (.+?),?$/
  const structs = new Map<string, Map<string, string>>()
  let current: Map<string, string> | null = null
  for (const line of contract.split('\n')) {
    const opened = open.exec(line)
    if (opened !== null) {
      current = new Map()
      structs.set(opened[1] as string, current)
    } else if (close.test(line)) {
      current = null
    } else if (current !== null) {
      const found = field.exec(line)
      if (found !== null) current.set(found[1] as string, found[2] as string)
    }
  }
  return structs
}

const blank = (text: string) => text.replace(/[^\n]/g, ' ')

/** A stretch of a file: the offsets of its first and last characters. */
type Stretch = readonly [number, number]

interface Prepared {
  path: string
  /** Comments, string contents and the states fixture blank: braces and parentheses here are code. */
  structure: string
  /** Comments and the states fixture blank, strings kept: a read inside an interpolation is a read. */
  text: string
  /** The stretches that only build the member's identifier (`identityStretches`). */
  identity: readonly Stretch[]
  /** `text` with the identity stretches blank too: what is left can draw. */
  drawing: string
}

/** The offset of the brace or parenthesis that closes the one at `open`. */
function closeOf(code: string, open: number): number {
  const opener = code[open] as string
  const closer = opener === '{' ? '}' : ')'
  let depth = 0
  for (let at = open; at < code.length; at += 1) {
    if (code[at] === opener) depth += 1
    if (code[at] === closer) {
      depth -= 1
      if (depth === 0) return at
    }
  }
  return code.length
}

function prepare(file: NativeSource, language: NativeLanguage): Prepared {
  const lexed = language === 'swift' ? lexSwift(file.source) : lexKotlin(file.source)
  let structure = lexed.code
  // Strings back in, comments still blank. A string inside another's
  // interpolation lies inside the outer one, which is restored whole.
  let text = lexed.code
  for (const literal of lexed.strings) {
    text =
      text.slice(0, literal.start) +
      file.source.slice(literal.start, literal.end) +
      text.slice(literal.end)
  }
  const fixture =
    language === 'swift'
      ? /\bstruct\s+\w+States\s*:\s*PMStates\b/g
      : /\bobject\s+\w+States\s*:\s*PMStates\b/g
  for (const match of structure.matchAll(fixture)) {
    const open = structure.indexOf('{', match.index)
    if (open === -1) continue
    const close = closeOf(structure, open)
    structure =
      structure.slice(0, open) +
      blank(structure.slice(open, close + 1)) +
      structure.slice(close + 1)
    text = text.slice(0, open) + blank(text.slice(open, close + 1)) + text.slice(close + 1)
  }
  const identity = identityStretches(structure, language)
  let drawing = text
  for (const [from, to] of identity) {
    drawing = drawing.slice(0, from) + blank(drawing.slice(from, to + 1)) + drawing.slice(to + 1)
  }
  return { path: file.path, structure, text, identity, drawing }
}

/** The offset of the unmatched `opener` before `from`, or -1 when a brace or the file's start comes first. */
function enclosing(code: string, from: number, opener: '(' | '{'): number {
  let parens = 0
  let braces = 0
  for (let at = from - 1; at >= 0; at -= 1) {
    const char = code[at]
    if (char === ')') parens += 1
    else if (char === '}') braces += 1
    else if (char === '(') {
      if (parens === 0) return opener === '(' ? at : -1
      parens -= 1
    } else if (char === '{') {
      if (braces === 0) return opener === '{' ? at : -1
      braces -= 1
    }
  }
  return -1
}

/** The innermost brace block around `from`: the offsets of its braces. */
function blockAround(code: string, from: number): [number, number] {
  let depth = 0
  for (let at = from - 1; at >= 0; at -= 1) {
    if (code[at] === '}') depth += 1
    if (code[at] === '{') {
      if (depth === 0) return [at, closeOf(code, at)]
      depth -= 1
    }
  }
  return [0, code.length]
}

const indentOf = (line: string) => line.length - line.trimStart().length

/**
 * Where a Kotlin expression body ends: at the first later line indented no
 * further than the declaration that does not close a bracket of the body.
 */
function expressionEnd(code: string, declared: number, from: number): number {
  const lineStart = code.lastIndexOf('\n', declared) + 1
  const base = indentOf(code.slice(lineStart, code.indexOf('\n', lineStart)))
  let at = code.indexOf('\n', from)
  while (at !== -1) {
    const next = code.indexOf('\n', at + 1)
    const line = code.slice(at + 1, next === -1 ? code.length : next)
    if (line.trim() !== '' && indentOf(line) <= base && !/^[)}\]]/.test(line.trim())) return at
    at = next
  }
  return code.length
}

/** The bracket that encloses `from` most closely, `(`, `[` or `{`, or none at the file's top. */
function openerAround(code: string, from: number): string | undefined {
  const closers: Record<string, string> = { ')': '(', ']': '[', '}': '{' }
  const pending: string[] = []
  for (let at = from - 1; at >= 0; at -= 1) {
    const char = code[at] as string
    if (char in closers) pending.push(closers[char] as string)
    else if (char === '(' || char === '[' || char === '{') {
      if (pending.length === 0) return char
      pending.pop()
    }
  }
  return undefined
}

/** The first comma from `from` up to `to` that no bracket encloses, or -1. */
function topLevelComma(code: string, from: number, to: number): number {
  let depth = 0
  for (let at = from; at < to; at += 1) {
    const char = code[at]
    if (char === '(' || char === '[' || char === '{') depth += 1
    else if (char === ')' || char === ']' || char === '}') depth -= 1
    else if (char === ',' && depth === 0) return at
  }
  return -1
}

/**
 * The name an attributes argument is built under: the argument when it is a
 * name, and what it calls when it is a call. A helper the file does not
 * declare that is handed one argument returns that argument changed
 * (`pmInSheet(attributes)`), so the name is the argument's.
 */
function builderOf(argument: string, declares: (name: string) => boolean): string | undefined {
  const found = /^\s*(?:[A-Za-z_]\w*\s*\.\s*)*([A-Za-z_]\w*)\s*(?:\(([\s\S]*)\))?\s*$/.exec(
    argument,
  )
  if (found === null) return undefined
  const name = found[1] as string
  const handed = found[2]
  if (handed === undefined || declares(name)) return name
  return topLevelComma(handed, 0, handed.length) === -1 ? builderOf(handed, declares) : undefined
}

/**
 * The condition of an `if` that only decides what is written to a builder: the
 * stretch from the `if` to the write at `from` when no block is between them,
 * and to the block that holds the write when every statement in the block is a
 * write to the builder.
 */
function conditionOver(
  code: string,
  from: number,
  writes: readonly Stretch[],
): Stretch | undefined {
  const balanced = (text: string) =>
    text.split('(').length === text.split(')').length && !/[{};]/.test(text)
  const lastIf = (before: number): number => {
    const window = Math.max(0, before - 400)
    const starts = [...code.slice(window, before).matchAll(/(?<![\w.])if\b/g)].map(
      (match) => window + match.index,
    )
    return starts.reverse().find((start) => balanced(code.slice(start, before))) ?? -1
  }
  const line = code.lastIndexOf('\n', from) + 1
  const bare = lastIf(from)
  if (bare >= line) return [bare, from]
  const [open, close] = blockAround(code, from)
  let inside = code.slice(open + 1, close)
  for (const [start, end] of writes) {
    if (start <= open || start >= close) continue
    const at = start - open - 1
    const to = Math.min(end, close - 1) - open
    inside = inside.slice(0, at) + blank(inside.slice(at, to)) + inside.slice(to)
  }
  if (inside.trim() !== '') return undefined
  const header = lastIf(open)
  return header === -1 ? undefined : [header, open]
}

/**
 * The stretches that build the attributes a file names `name`: the body of a
 * function or a computed property of that name, the value a variable of that
 * name starts with, each later write to the variable, and the condition of an
 * `if` that only decides such a write.
 */
function builderStretches(code: string, name: string, language: NativeLanguage): Stretch[] {
  const stretches: Stretch[] = []
  const callable =
    language === 'swift'
      ? `\\bfunc\\s+${name}\\s*\\(`
      : `\\bfun\\s+(?:\\w+\\s*\\.\\s*)?${name}\\s*\\(`
  for (const match of code.matchAll(new RegExp(callable, 'g'))) {
    const after = closeOf(code, match.index + match[0].length - 1)
    const body = /[{=]/.exec(code.slice(after))
    if (body === null) continue
    const start = after + body.index
    stretches.push([
      start,
      body[0] === '{' ? closeOf(code, start) : expressionEnd(code, match.index, start),
    ])
  }
  const variable = language === 'swift' ? `\\b(?:var|let)\\s+${name}\\b` : `\\bva[lr]\\s+${name}\\b`
  let stored = false
  for (const match of code.matchAll(new RegExp(variable, 'g'))) {
    const end = match.index + match[0].length
    // The type, when it is written, then the `=` of a stored value or the `{` of a computed one.
    const body = /^\s*(?::[^={\n]*)?([={])/.exec(code.slice(end))
    if (body === null) continue
    const start = end + body[0].length - 1
    if (body[1] === '{') {
      stretches.push([start, closeOf(code, start)])
    } else {
      stretches.push([start, expressionEnd(code, match.index, start)])
      stored = true
    }
  }
  if (!stored) return stretches
  const write = new RegExp(
    `(?<![\\w.])${name}\\s*(?:\\[[^\\]\\n]*\\]\\s*=(?!=)|\\.\\s*(?:put|putAll|merge|updateValue)\\s*\\(|\\+=)`,
    'g',
  )
  const writes: Stretch[] = [...code.matchAll(write)].map((match) => [
    match.index,
    expressionEnd(code, match.index, match.index),
  ])
  for (const [from] of writes) {
    const condition = conditionOver(code, from, writes)
    if (condition !== undefined) stretches.push(condition)
  }
  return [...stretches, ...writes]
}

/**
 * The stretches of a file that only build a member's identifier: what
 * `pmMember` is handed, which a test and an audit read and no person sees or
 * hears. They are:
 *
 * - the arguments of each `pmMember` call;
 * - when the attributes argument is a name the file declares or a call of
 *   one, what builds that name (`builderStretches`);
 * - the value of a local that nothing outside these stretches uses:
 *   `let resize = props.resize ?? .vertical`, when `resize` is written only
 *   into the attributes.
 *
 * The rule errs towards a drawing. A use it cannot place, a name in an
 * argument label or a local a second scope declares again, keeps the local's
 * value out of the stretches, so its reads count as drawn.
 */
function identityStretches(code: string, language: NativeLanguage): Stretch[] {
  const keywords = language === 'swift' ? 'func|var|let' : 'fun|val|var'
  const declares = (name: string) =>
    new RegExp(`\\b(?:${keywords})\\s+(?:\\w+\\s*\\.\\s*)?${name}\\b`).test(code)
  const stretches: Stretch[] = []
  const builders = new Set<string>()
  for (const call of code.matchAll(/\.\s*pmMember\s*\(/g)) {
    // The modifier's own declaration is not a call of it.
    const line = code.lastIndexOf('\n', call.index) + 1
    if (/\bfunc?\b/.test(code.slice(line, call.index))) continue
    const open = call.index + call[0].length - 1
    const close = closeOf(code, open)
    stretches.push([open, close])
    const first = topLevelComma(code, open + 1, close)
    if (first === -1) continue
    const second = topLevelComma(code, first + 1, close)
    const argument = code.slice(first + 1, second === -1 ? close : second)
    // Kotlin may name the argument: `attributes = attributes`.
    const name = builderOf(argument.replace(/^\s*\w+\s*=(?!=)/, ''), declares)
    if (name !== undefined && declares(name)) builders.add(name)
  }
  for (const name of builders) stretches.push(...builderStretches(code, name, language))

  // Each local with a value, the stretch of that value, and where its scope ends.
  const local =
    language === 'swift'
      ? /\b(?:let|var)\s+([A-Za-z_]\w*)\b\s*(?::[^={\n]*)?=(?!=)/g
      : /\bva[lr]\s+([A-Za-z_]\w*)\b\s*(?::[^={\n]*)?=(?!=)/g
  const locals = [...code.matchAll(local)].map((match) => {
    const from = match.index + match[0].length - 1
    return {
      name: match[1] as string,
      value: [from, expressionEnd(code, match.index, from)] as Stretch,
      scopeEnd: blockAround(code, match.index)[1],
      placed: false,
    }
  })
  const within = (offset: number) => stretches.some(([from, to]) => from <= offset && offset <= to)
  // An argument's label is not a use of a local of the same name:
  // `PMRowLabel(label, required: false)`, `PMRowLabel(label, required = false)`.
  const labels = language === 'swift' ? /^\s*:/ : /^\s*=(?!=)/
  const isLabel = (at: number, name: string) =>
    labels.test(code.slice(at + name.length)) &&
    /[(,]\s*$/.test(code.slice(Math.max(0, at - 200), at)) &&
    openerAround(code, at) === '('
  for (let grew = true; grew;) {
    grew = false
    for (const candidate of locals) {
      if (candidate.placed || within(candidate.value[0])) continue
      const after = candidate.value[1] + 1
      const uses = [
        ...code
          .slice(after, candidate.scopeEnd)
          .matchAll(new RegExp(`(?<![\\w.])${candidate.name}\\b`, 'g')),
      ]
        .map((match) => after + match.index)
        .filter((at) => !isLabel(at, candidate.name))
      if (uses.length === 0 || !uses.every(within)) continue
      stretches.push(candidate.value)
      candidate.placed = true
      grew = true
    }
  }
  return stretches
}

interface Binding {
  struct: string
  from: number
  to: number
}

/** Every `props: PM…Props` a file declares, with the stretch of the file it is in scope for. */
function bindings(code: string, language: NativeLanguage): Binding[] {
  const found: Binding[] = []
  for (const match of code.matchAll(/\bprops\s*:\s*(PM\w+Props)\b(?:<[^<>]*>)?/g)) {
    const end = match.index + match[0].length
    // An argument label before the struct's initialiser, not a declaration.
    if (/^\s*[(.]/.test(code.slice(end))) continue
    const struct = match[1] as string
    const parameters = enclosing(code, match.index, '(')
    if (parameters === -1) {
      const [from, to] = blockAround(code, match.index)
      found.push({ struct, from, to })
      continue
    }
    // A parameter is in scope for its function's body.
    const after = closeOf(code, parameters)
    const body = /[{=]/.exec(code.slice(after))
    if (body === null) continue
    const start = after + body.index
    if (body[0] === '{') found.push({ struct, from: start, to: closeOf(code, start) })
    else if (language === 'kotlin') {
      found.push({ struct, from: start, to: expressionEnd(code, parameters, start) })
    }
  }
  if (language === 'kotlin') return found
  // A Swift extension of a type reads the type's stored properties, so a
  // binding a type's body declares is in scope for each extension of the type
  // in the same file.
  for (const extension of code.matchAll(/\bextension\s+(\w+)\b[^{}]*\{/g)) {
    const type = new RegExp(`\\b(?:struct|class|actor|enum)\\s+${extension[1]}\\b[^{}]*\\{`).exec(
      code,
    )
    if (type === null) continue
    const body = type.index + type[0].length - 1
    const from = extension.index + extension[0].length - 1
    const to = closeOf(code, from)
    for (const binding of found.filter((candidate) => candidate.from === body)) {
      found.push({ struct: binding.struct, from, to })
    }
  }
  return found
}

/** A place a rendering reads a field of its props. */
export interface PropRead {
  /** The props struct the binding in scope has, `PMBadgeProps`. */
  struct: string
  field: string
  path: string
  offset: number
  /** The field of another member's props the value is handed to and nothing else, when that is all the read does. */
  forward?: { struct: string; field: string }
  /** Set when the read only builds the member's identifier (`identityStretches`), which draws nothing. */
  identity?: true
}

/** Every `props.<field>` in hand-written files, under the binding in scope where it is written. */
export function propReads(files: readonly NativeSource[], language: NativeLanguage): PropRead[] {
  const reads: PropRead[] = []
  for (const file of files) {
    const { structure, text, path, identity } = prepare(file, language)
    const bound = bindings(structure, language)
    if (bound.length === 0) continue
    const read = /(?<![\w.])(?:(?:self|this)\s*\.\s*)?props\s*[?!]?\s*\.\s*`?([A-Za-z_]\w*)`?/g
    for (const match of text.matchAll(read)) {
      const offset = match.index
      const scope = bound
        .filter((binding) => binding.from <= offset && offset <= binding.to)
        .sort((a, b) => a.to - a.from - (b.to - b.from))[0]
      if (scope === undefined) continue
      const field = match[1] as string
      const forward = forwardAt(structure, offset, offset + match[0].length, language)
      reads.push({
        struct: scope.struct,
        field,
        path,
        offset,
        ...(forward === undefined ? {} : { forward }),
        ...(identity.some(([from, to]) => from <= offset && offset <= to)
          ? { identity: true }
          : {}),
      })
    }
  }
  return reads
}

/**
 * The props field a read hands its value to, when the read is a whole argument
 * of another member's props: `PMInputProps(id: props.id)` in Swift,
 * `PMInput(id = props.id)` or `PMInputProps(id = props.id)` in Kotlin.
 */
function forwardAt(
  code: string,
  start: number,
  end: number,
  language: NativeLanguage,
): { struct: string; field: string } | undefined {
  if (!/^\s*[,)]/.test(code.slice(end))) return undefined
  const label = (language === 'swift' ? /(\w+)`?\s*:\s*$/ : /(\w+)`?\s*(?<![=!<>])=\s*$/).exec(
    code.slice(Math.max(0, start - 200), start),
  )
  if (label === null) return undefined
  const call = enclosing(code, start, '(')
  if (call === -1) return undefined
  const callee = /\b(PM\w+)(?:<[^<>]*>)?\s*$/.exec(code.slice(Math.max(0, call - 200), call))
  if (callee === null) return undefined
  const name = callee[1] as string
  if (language === 'swift' && !name.endsWith('Props')) return undefined
  return { struct: name.endsWith('Props') ? name : `${name}Props`, field: label[1] as string }
}

const keyOf = (struct: string, field: string) => `${struct}.${field}`

/**
 * The props fields the reads draw: each with a read of its own, and each handed
 * to a field of another member's props that is drawn. A read that only builds
 * the identifier draws nothing.
 */
export function drawnFields(
  reads: readonly PropRead[],
  structs: ReadonlyMap<string, ReadonlyMap<string, string>>,
): Set<string> {
  const isField = (struct: string, field: string) => structs.get(struct)?.has(field) === true
  const drawn = new Set<string>()
  const forwards: PropRead[] = []
  for (const read of reads) {
    if (read.identity === true) continue
    if (read.forward !== undefined && isField(read.forward.struct, read.forward.field)) {
      forwards.push(read)
    } else {
      drawn.add(keyOf(read.struct, read.field))
    }
  }
  for (let grew = true; grew;) {
    grew = false
    for (const read of forwards) {
      const key = keyOf(read.struct, read.field)
      const target = read.forward as { struct: string; field: string }
      if (!drawn.has(key) && drawn.has(keyOf(target.struct, target.field))) {
        drawn.add(key)
        grew = true
      }
    }
  }
  return drawn
}

/**
 * A value's type as the law follows it: a struct by name, a list of a type,
 * Kotlin's `PMSome` around one, or an element with its index (Swift's
 * `enumerated()` pair, Kotlin's `IndexedValue`).
 */
type Shape =
  | { readonly struct: string }
  | { readonly list: Shape }
  | { readonly some: Shape }
  | { readonly pair: Shape }

const shapeKey = (shape: Shape): string =>
  'struct' in shape
    ? shape.struct
    : 'list' in shape
      ? `[${shapeKey(shape.list)}]`
      : 'some' in shape
        ? `some(${shapeKey(shape.some)})`
        : `pair(${shapeKey(shape.pair)})`

/** The structs a law reads fields of: each struct's name, then each field's written type. */
type Structs = ReadonlyMap<string, ReadonlyMap<string, string>>

/** The collections whose first type argument is their element. */
const COLLECTIONS = new Set([
  'Array',
  'ArraySlice',
  'Collection',
  'Iterable',
  'List',
  'MutableList',
  'MutableSet',
  'Sequence',
  'Set',
])

/**
 * The shape a written type names: `PMDateRange?`, `[PMAccordionItem]`,
 * `List<PMAccordionItem>`, `PMSome<PMDateRange?>? = null`. A function, a
 * tuple, a dictionary, a dotted name and a type whose name does not start
 * with `PM` name none.
 */
function shapeOfType(written: string): Shape | undefined {
  const type = written
    .replace(/\s=\s[\s\S]*$/, '')
    .trim()
    .replace(/^(?:@\w+(?:\([^)]*\))?\s*|inout\s+)+/, '')
    .replace(/[?!]+$/, '')
    .trim()
  const square = /^\[([\s\S]*)\]$/.exec(type)
  if (square !== null) {
    const inner = square[1] as string
    let depth = 0
    for (const char of inner) {
      if ('([<'.includes(char)) depth += 1
      else if (')]>'.includes(char)) depth -= 1
      else if (char === ':' && depth === 0) return undefined
    }
    const element = shapeOfType(inner)
    return element === undefined ? undefined : { list: element }
  }
  const named = /^([A-Za-z_]\w*)\s*(?:<([\s\S]*)>)?$/.exec(type)
  if (named === null) return undefined
  const name = named[1] as string
  const argument = named[2]
  if (argument !== undefined && (COLLECTIONS.has(name) || name === 'PMSome')) {
    const comma = topLevelComma(argument, 0, argument.length)
    const inner = shapeOfType(comma === -1 ? argument : argument.slice(0, comma))
    if (inner === undefined) return undefined
    return name === 'PMSome' ? { some: inner } : { list: inner }
  }
  return /^PM[A-Z]/.test(name) ? { struct: name } : undefined
}

/**
 * The shape of each parameter of a written function type, in order:
 * `(@MainActor (PMFilterResultCount) -> String)?` in Swift,
 * `((PMFilterResultCount) -> String)? = null` in Kotlin.
 */
function parameterShapes(written: string): Shape[][] {
  let type = written
    .replace(/\s=\s[\s\S]*$/, '')
    .trim()
    .replace(/\?$/, '')
  // The parentheses around an optional function type.
  while (type.startsWith('(') && closeOf(type, 0) === type.length - 1)
    type = type.slice(1, -1).trim()
  type = type.replace(/^(?:@\w+\s*)+/, '')
  if (!type.startsWith('(')) return []
  const close = closeOf(type, 0)
  if (!/^\s*->/.test(type.slice(close + 1))) return []
  const list = type.slice(1, close)
  const shapes: Shape[][] = []
  for (let from = 0; from <= list.length;) {
    const comma = topLevelComma(list, from, list.length)
    const to = comma === -1 ? list.length : comma
    const part = list.slice(from, to).replace(/^\s*\w+\s*:(?!:)/, '')
    const shape = shapeOfType(part)
    shapes.push(shape === undefined ? [] : [shape])
    from = to + 1
  }
  return shapes
}

/** The methods of a list that return one of its elements. */
const ELEMENT_METHODS = new Set([
  'elementAt',
  'find',
  'first',
  'firstOrNull',
  'getOrNull',
  'last',
  'lastOrNull',
  'randomElement',
  'single',
  'singleOrNull',
])

/** The methods of a list that return a list of its elements. */
const LIST_METHODS = new Set([
  'drop',
  'dropFirst',
  'dropLast',
  'filter',
  'filterNot',
  'orEmpty',
  'prefix',
  'reversed',
  'shuffled',
  'sorted',
  'sortedBy',
  'sortedByDescending',
  'suffix',
  'take',
])

/** The methods of a list that pair each element with its index. */
const INDEXED_METHODS = new Set(['enumerated', 'withIndex'])

/** Kotlin's methods whose lambda takes an element's index, then the element. */
const INDEXED_LAMBDAS = new Set([
  'filterIndexed',
  'forEachIndexed',
  'itemsIndexed',
  'mapIndexed',
  'mapIndexedNotNull',
])

/**
 * Kotlin's scope functions: their lambda takes the value itself, and
 * `takeIf`, `takeUnless`, `also` and `apply` return it.
 */
const SCOPE_FUNCTIONS = new Set(['also', 'apply', 'let', 'run', 'takeIf', 'takeUnless'])
const RETURNS_RECEIVER = new Set(['also', 'apply', 'takeIf', 'takeUnless'])

/** The words before which a `.` starts an implicit member, not a member of the word. */
const KEYWORDS = new Set([
  'as',
  'await',
  'case',
  'default',
  'else',
  'for',
  'guard',
  'if',
  'in',
  'is',
  'let',
  'return',
  'switch',
  'throw',
  'try',
  'val',
  'var',
  'when',
  'where',
  'while',
])

/** What a closure's parameters stand for. */
interface Subject {
  /** The value the closure is handed: a list whose elements it takes, or a value it takes whole. */
  shapes: readonly Shape[]
  /** The method the closure is handed to, when it is one: `map`, `let`, `forEachIndexed`. */
  method?: string
  /** Each parameter's shapes, when the closure is the value of a function-typed contract field. */
  fixed?: readonly (readonly Shape[])[]
}

/** The shapes of parameter `index` of a closure with `count` parameters. */
function parameterOf(subject: Subject, index: number, count: number): Shape[] {
  if (subject.fixed !== undefined) return [...(subject.fixed[index] ?? [])]
  const method = subject.method ?? ''
  if (SCOPE_FUNCTIONS.has(method)) return index === 0 ? [...subject.shapes] : []
  const indexed = INDEXED_LAMBDAS.has(method)
  const found: Shape[] = []
  for (const shape of subject.shapes) {
    if (!('list' in shape)) {
      if (index === 0) found.push(shape)
      continue
    }
    const element = shape.list
    if (indexed) {
      if (index === 1) found.push(element)
    } else if ('pair' in element && count > 1) {
      if (index === 1) found.push(element.pair)
    } else {
      found.push(element)
    }
  }
  return found
}

interface Closure {
  open: number
  close: number
  subject: Subject
}

/** What one file says about the values its names hold. */
interface Typing {
  code: string
  /** The contract's structs, and Kotlin's sealed cases that carry a value (`PMMenuEntry.Label`). */
  structs: Structs
  /**
   * Each name's shapes, for the whole file: from the type written for a
   * property or a local, the value a local starts with, a pattern it is bound
   * by, or the closure or the loop it is a parameter of.
   */
  names: Map<string, Shape[]>
  /** Each parameter whose type is written, with its function's or its closure's body. */
  parameters: { name: string; shapes: Shape[]; from: number; to: number }[]
  /**
   * Each name's shapes from every type written for it, parameters included:
   * the fallback for a member of a value the file does not type.
   */
  members: Map<string, Shape[]>
  /** Each function's result, by the function's name. */
  results: Map<string, Shape[]>
  /** The closures with a subject, for `$0`, `$1` and `it`. */
  closures: Closure[]
}

/** The shapes of a name written alone at `at`: its innermost parameter, else the file's. */
function nameShapes(typing: Typing, name: string, at: number): Shape[] {
  const parameter = typing.parameters
    .filter((candidate) => candidate.name === name && candidate.from <= at && at <= candidate.to)
    .sort((a, b) => a.to - a.from - (b.to - b.from))[0]
  return parameter === undefined ? (typing.names.get(name) ?? []) : parameter.shapes
}

/**
 * The body a parameter whose type is written at `at` is in scope for: its
 * closure's, `{ (value: PMType) in … }`, or its function's, `func f(value:
 * PMType) { … }`, `fun f(value: PMType) = …`. Undefined when `at` is in no
 * parameter list.
 */
function parameterScope(
  code: string,
  at: number,
  closes: ReadonlyMap<number, number>,
): [number, number] | undefined {
  const list = enclosing(code, at, '(')
  if (list === -1) return undefined
  const before = back(code, list)
  if (before >= 0 && code[before] === '{') return [before, closes.get(before) ?? code.length]
  const head = code.slice(Math.max(0, list - 300), list)
  if (!/\b(?:func|fun|init|subscript|constructor)\b[^(){};]*$/.test(head)) return undefined
  const close = closeOf(code, list)
  const body = /[{=]/.exec(code.slice(close))
  if (body === null) return undefined
  const start = close + body.index
  return body[0] === '{'
    ? [start, closes.get(start) ?? code.length]
    : [start, expressionEnd(code, list, start)]
}

const add = (into: Map<string, Shape[]>, name: string, shapes: readonly Shape[]): boolean => {
  const known = into.get(name) ?? []
  const fresh = shapes.filter((shape) => !known.some((had) => shapeKey(had) === shapeKey(shape)))
  if (fresh.length === 0) return false
  into.set(name, [...known, ...fresh])
  return true
}

/** The offset of the bracket that opens the one that closes at `close`, or -1. */
function openOf(code: string, close: number): number {
  const closer = code[close] as string
  const opener = closer === ')' ? '(' : closer === ']' ? '[' : '{'
  let depth = 0
  for (let at = close; at >= 0; at -= 1) {
    if (code[at] === closer) depth += 1
    else if (code[at] === opener) {
      depth -= 1
      if (depth === 0) return at
    }
  }
  return -1
}

/** The last offset before `at` that is not white space, or -1. */
function back(code: string, at: number): number {
  let from = at - 1
  while (from >= 0 && /\s/.test(code[from] as string)) from -= 1
  return from
}

/** Where the identifier that ends at `last` starts. */
function identifierStart(code: string, last: number): number {
  let from = last
  while (from > 0 && /[\w$`]/.test(code[from - 1] as string)) from -= 1
  return from
}

/** The identifier that ends at `last`, backticks left out. */
const identifierAt = (code: string, last: number): string =>
  code.slice(identifierStart(code, last), last + 1).replace(/`/g, '')

/** Each shape a member named `name` of a value of `shapes` has. */
function memberShapes(typing: Typing, shapes: readonly Shape[], name: string): Shape[] {
  const found: Shape[] = []
  for (const shape of shapes) {
    if ('struct' in shape) {
      const written = typing.structs.get(shape.struct)?.get(name)
      const field = written === undefined ? undefined : shapeOfType(written)
      if (field !== undefined) found.push(field)
    } else if ('some' in shape) {
      if (name === 'value') found.push(shape.some)
    } else if ('pair' in shape) {
      if (name === 'element' || name === 'value') found.push(shape.pair)
    } else if (ELEMENT_METHODS.has(name)) {
      found.push(shape.list)
    }
  }
  return found
}

/**
 * What a call of `callee` on a value of `receiver` returns, or a call of
 * `callee` alone when `receiver` is undefined.
 */
function callShapes(
  typing: Typing,
  callee: string,
  receiver: readonly Shape[] | undefined,
): Shape[] {
  const found: Shape[] = []
  for (const shape of receiver ?? []) {
    if (RETURNS_RECEIVER.has(callee)) found.push(shape)
    else if (!('list' in shape)) continue
    else if (ELEMENT_METHODS.has(callee)) found.push(shape.list)
    else if (LIST_METHODS.has(callee)) found.push(shape)
    else if (INDEXED_METHODS.has(callee)) found.push({ list: { pair: shape.list } })
  }
  if (found.length > 0) return found
  if (receiver === undefined && typing.structs.has(callee)) return [{ struct: callee }]
  return typing.results.get(callee) ?? []
}

/**
 * The call that the argument at `at` is written in: where its arguments open,
 * the callee's name, and the shapes of the value the callee is a method of,
 * undefined when it is a function.
 */
function callAround(
  typing: Typing,
  at: number,
): { open: number; callee: string; receiver: Shape[] | undefined } | undefined {
  const { code } = typing
  const open = enclosing(code, at, '(')
  const calleeEnd = open === -1 ? -1 : back(code, open)
  if (calleeEnd < 0 || !/[\w`]/.test(code[calleeEnd] as string)) return undefined
  const start = identifierStart(code, calleeEnd)
  const callee = identifierAt(code, calleeEnd)
  const dot = back(code, start)
  const receiver = dot >= 0 && code[dot] === '.' ? shapesBefore(typing, dot) : undefined
  return { open, callee, receiver }
}

/**
 * The value a key path starts from: an element of the list the call it is an
 * argument of works through, `ForEach(items, id: \.id)`, `items.map(\.value)`.
 */
function keyPathRoot(typing: Typing, slash: number): Shape[] {
  const call = callAround(typing, slash)
  if (call === undefined) return []
  const list = call.receiver ?? headShapes(typing, call.open + 1, closeOf(typing.code, call.open))
  return list.flatMap((shape) => ('list' in shape ? [shape.list] : []))
}

/**
 * The shapes of the value of the expression that ends at `end` (exclusive): a
 * name, a member of a value, a key path's root, a call, a subscript, a
 * trailing closure's call, or a group, whose value is its first operand's.
 */
function shapesBefore(typing: Typing, end: number, depth = 0): Shape[] {
  const { code } = typing
  if (depth > 16) return []
  let at = back(code, end)
  if (at >= 0 && code[at] === '\\') return keyPathRoot(typing, at)
  // Optional chaining and unwrapping, written against the value: `value?`, `value!!`.
  if (at >= 0 && /[?!]/.test(code[at] as string)) {
    while (at >= 0 && /[?!]/.test(code[at] as string)) at -= 1
    if (at < 0 || /\s/.test(code[at] as string)) return []
  }
  if (at < 0) return []
  const char = code[at] as string
  if (/[\w$`]/.test(char)) {
    const start = identifierStart(code, at)
    const name = identifierAt(code, at)
    const dot = back(code, start)
    if (dot >= 0 && code[dot] === '.' && code[dot - 1] !== '.') {
      const receiver = shapesBefore(typing, dot, depth + 1)
      const found = memberShapes(typing, receiver, name)
      return found.length > 0 ? found : (typing.members.get(name) ?? [])
    }
    if (KEYWORDS.has(name)) return []
    const implicit = /^\$(\d)$/.exec(name)
    if (implicit !== null || name === 'it') {
      const closure = typing.closures
        .filter((candidate) => candidate.open < start && start < candidate.close)
        .sort((a, b) => b.open - a.open)[0]
      if (closure === undefined) return []
      const index = implicit === null ? 0 : Number(implicit[1])
      return parameterOf(closure.subject, index, index + 1)
    }
    return nameShapes(typing, name, start)
  }
  if (char === ')' || char === '}') {
    const open = openOf(code, at)
    if (open === -1) return []
    const calleeEnd = back(code, open)
    // A trailing closure after a call's arguments: `items.first(where:) { … }`.
    if (char === '}' && calleeEnd >= 0 && code[calleeEnd] === ')') {
      return shapesBefore(typing, calleeEnd + 1, depth + 1)
    }
    if (calleeEnd >= 0 && /[\w`]/.test(code[calleeEnd] as string)) {
      const start = identifierStart(code, calleeEnd)
      const callee = identifierAt(code, calleeEnd)
      const dot = back(code, start)
      if (dot >= 0 && code[dot] === '.') {
        return callShapes(typing, callee, shapesBefore(typing, dot, depth + 1))
      }
      if (KEYWORDS.has(callee)) return []
      // `Array(items)`, `Array(items.enumerated())`: the argument's value.
      if (char === ')' && (callee === 'Array' || callee === 'List' || callee === 'Set')) {
        return headShapes(typing, open + 1, at, depth + 1)
      }
      return callShapes(typing, callee, undefined)
    }
    return char === ')' ? headShapes(typing, open + 1, at, depth + 1) : []
  }
  if (char === ']') {
    const open = openOf(code, at)
    const before = open === -1 ? -1 : back(code, open)
    if (before < 0 || !/[\w)\]?!]/.test(code[before] as string)) return []
    return shapesBefore(typing, open, depth + 1).flatMap((shape) =>
      'list' in shape ? [shape.list] : [],
    )
  }
  return []
}

/**
 * The shapes of the first operand of the expression from `from` to `to`: what
 * comes before its first `??`, `?:`, `,`, `;`, `else`, `where`, or a line end
 * outside brackets. A brace ends it when it opens the body of a Swift `if let`
 * or `guard let` (`condition`); otherwise it opens a trailing closure, which
 * the expression goes on past. A conditional's value is its first branch's:
 * Swift's `c ? a : b`, Kotlin's `if (c) a else b`.
 */
function headShapes(
  typing: Typing,
  from: number,
  to: number,
  depth = 0,
  condition = false,
): Shape[] {
  const { code } = typing
  if (depth > 16) return []
  let start = from
  while (start < to && /\s/.test(code[start] as string)) start += 1
  const branch = /^if\s*\(/.exec(code.slice(start, start + 8))
  if (branch !== null) {
    let body = closeOf(code, start + branch[0].length - 1) + 1
    while (body < to && /\s/.test(code[body] as string)) body += 1
    return code[body] === '{'
      ? headShapes(typing, body + 1, closeOf(code, body), depth + 1)
      : headShapes(typing, body, to, depth + 1)
  }
  let level = 0
  for (let at = start; at < to; at += 1) {
    const char = code[at] as string
    if (char === '(' || char === '[') level += 1
    else if (char === ')' || char === ']') level -= 1
    if (level < 0) return shapesBefore(typing, at, depth)
    if (level > 0) continue
    if (char === '{' && !condition) {
      at = closeOf(code, at)
      continue
    }
    const rest = code.slice(at, at + 7)
    if (/^\s\?\s/.test(rest)) return headShapes(typing, at + 3, to, depth + 1, condition)
    if (
      /^(?:\?\?|\?:|,|;|\{|\n)/.test(rest) ||
      /^\s(?:else|where)\b/.test(rest) ||
      /^\s:\s/.test(rest)
    ) {
      // A chain broken over lines goes on: `props.messages\n  .start`.
      if (char === '\n' && /^\s*\./.test(code.slice(at + 1, at + 200))) continue
      return shapesBefore(typing, at, depth)
    }
  }
  return shapesBefore(typing, to, depth)
}

/**
 * What the parameters of the closure that opens at `open` stand for: the list
 * or the value of the method it is handed to (`items.map { … }`,
 * `value?.let { … }`), the first argument of a function it is the trailing or
 * a named argument of (`ForEach(items) { … }`, `items(lines, key = { … })`),
 * or the parameters of the contract's function-typed field it is the value
 * of (`PMFilterBarMessages(resultCount: { count in … })`).
 */
function subjectOf(typing: Typing, open: number): Subject | undefined {
  const { code } = typing
  const before = back(code, open)
  if (before < 0) return undefined
  const char = code[before] as string
  if (/[\w`]/.test(char)) {
    // `items.forEach { … }`, `value?.let { … }`.
    const start = identifierStart(code, before)
    const dot = back(code, start)
    if (dot < 0 || code[dot] !== '.') return undefined
    return { shapes: shapesBefore(typing, dot), method: identifierAt(code, before) }
  }
  if (char === ')') {
    // A trailing closure: `items.map(…) { … }`, `ForEach(items, id: \.value) { … }`.
    const call = openOf(code, before)
    const calleeEnd = call === -1 ? -1 : back(code, call)
    if (calleeEnd < 0 || !/[\w`]/.test(code[calleeEnd] as string)) return undefined
    const start = identifierStart(code, calleeEnd)
    const method = identifierAt(code, calleeEnd)
    const dot = back(code, start)
    return dot >= 0 && code[dot] === '.'
      ? { shapes: shapesBefore(typing, dot), method }
      : { shapes: headShapes(typing, call + 1, before), method }
  }
  if (char === '(' || char === ',' || char === ':' || (char === '=' && code[before - 1] !== '=')) {
    const call = callAround(typing, open)
    if (call === undefined) return undefined
    const label = char === ':' || char === '=' ? back(code, before) : -1
    const field =
      label >= 0 && call.receiver === undefined
        ? typing.structs.get(call.callee)?.get(identifierAt(code, label))
        : undefined
    if (field !== undefined) return { shapes: [], fixed: parameterShapes(field) }
    if (call.receiver !== undefined) return { shapes: call.receiver, method: call.callee }
    // A named argument of a function, after its first: `items(lines, key = { … })`.
    if (char !== '(') {
      return { shapes: headShapes(typing, call.open + 1, open), method: call.callee }
    }
  }
  return undefined
}

/**
 * The names a closure's or a loop's parameter list declares, in order:
 * `item`, `index, item`, `(a, b)`. A parameter with no name, `_`, keeps its
 * place as an empty name.
 */
const parameterNames = (list: string): string[] =>
  list
    .replace(/[()]/g, ' ')
    .split(',')
    .map((part) => (part.split(':')[0] as string).trim())
    .map((name) => (/^[A-Za-z]\w*$/.test(name) ? name : ''))

/**
 * What the contract's enums carry. In Swift, each case that holds a value, by
 * the case's name (`case band(PMChartBandAnnotation)`), for a pattern that
 * binds it (`case .band(let band)`). In Kotlin, each case of a sealed
 * interface that holds a value, as a struct of one field, `value`
 * (`PMMenuEntry.Label`), for a smart cast (`is PMMenuEntry.Label`).
 */
function contractCases(
  contract: string,
  language: NativeLanguage,
): { cases: Map<string, Shape[]>; nested: Map<string, Map<string, string>> } {
  const cases = new Map<string, Shape[]>()
  const nested = new Map<string, Map<string, string>>()
  let current: string | null = null
  for (const line of contract.split('\n')) {
    const opened =
      language === 'swift'
        ? /^public enum (PM\w+)\b/.exec(line)
        : /^sealed interface (PM\w+)\b/.exec(line)
    if (opened !== null) {
      current = opened[1] as string
    } else if (/^\}/.test(line)) {
      current = null
    } else if (current !== null) {
      if (language === 'swift') {
        const found = /^ {2}case (\w+)\((?:\w+:\s*)?([^,]+)\)$/.exec(line)
        const shape = found === null ? undefined : shapeOfType(found[2] as string)
        if (found !== null && shape !== undefined) add(cases, found[1] as string, [shape])
      } else {
        const found = /^ {4}data class (\w+)\(val value: (.+)\) : /.exec(line)
        if (found !== null) {
          nested.set(`${current}.${found[1]}`, new Map([['value', found[2] as string]]))
        }
      }
    }
  }
  return { cases, nested }
}

/**
 * What a file says about the values its names hold: each name with a type
 * written for it, each local that starts with a value the law can follow, each
 * name a pattern or a smart cast binds to a case's value, each parameter of a
 * closure or a loop handed a list or a value, and each function's result. A
 * parameter whose type is written is typed for its function's or its
 * closure's body. Every other name is typed for the whole file, not for its
 * scope, which errs towards a read.
 */
function typingOf(
  code: string,
  structs: Structs,
  cases: ReadonlyMap<string, readonly Shape[]>,
  language: NativeLanguage,
): Typing {
  const typing: Typing = {
    code,
    structs,
    names: new Map(),
    parameters: [],
    members: new Map(),
    results: new Map(),
    closures: [],
  }
  // Each brace's partner, in one pass: a file has thousands.
  const closes = new Map<number, number>()
  const stack: number[] = []
  for (let at = 0; at < code.length; at += 1) {
    if (code[at] === '{') stack.push(at)
    else if (code[at] === '}') {
      const open = stack.pop()
      if (open !== undefined) closes.set(open, at)
    }
  }

  // A type written for a name: a parameter, a stored or computed property, a local.
  for (const match of code.matchAll(/(?<![\w.$])([A-Za-z_]\w*)\s*:(?!:)\s*/g)) {
    let at = match.index + match[0].length
    let level = 0
    const from = at
    for (; at < code.length; at += 1) {
      const char = code[at] as string
      if (char === '-' && code[at + 1] === '>') {
        at += 1
        continue
      }
      if ('([<'.includes(char)) level += 1
      else if (')]>'.includes(char)) {
        if (level === 0) break
        level -= 1
      } else if (level === 0 && /[,={;\n]/.test(char)) break
    }
    const shape = shapeOfType(code.slice(from, at))
    if (shape === undefined) continue
    const name = match[1] as string
    add(typing.members, name, [shape])
    const scope = parameterScope(code, match.index, closes)
    if (scope === undefined) add(typing.names, name, [shape])
    else typing.parameters.push({ name, shapes: [shape], from: scope[0], to: scope[1] })
  }

  // A case's value bound by a pattern, `case .band(let band)`, or a smart
  // cast, `entry is PMMenuEntry.Label`.
  if (language === 'swift') {
    for (const match of code.matchAll(
      /\.(\w+)\(\s*(?:let|var)\s+(\w+)\s*\)|\b(?:let|var)\s+\.(\w+)\(\s*(\w+)\s*\)/g,
    )) {
      const shapes = cases.get((match[1] ?? match[3]) as string) ?? []
      add(typing.names, (match[2] ?? match[4]) as string, shapes)
    }
  } else {
    for (const match of code.matchAll(/\b(\w+)\s+is\s+(PM\w+(?:\.\w+)?)/g)) {
      add(typing.names, match[1] as string, [{ struct: match[2] as string }])
    }
    for (const match of code.matchAll(/\bwhen\s*\(\s*(?:val\s+(\w+)\s*=\s*)?([^)]*?)\s*\)\s*\{/g)) {
      const subject = match[1] ?? /(\w+)\W*$/.exec(match[2] as string)?.[1]
      if (subject === undefined) continue
      const open = match.index + match[0].length - 1
      const body = code.slice(open, closeOf(code, open))
      for (const branch of body.matchAll(/(?:^|[\s,{])is\s+(PM\w+(?:\.\w+)?)/g)) {
        add(typing.names, subject, [{ struct: branch[1] as string }])
      }
    }
  }

  // A function's result: `func name(…) -> PMType`, `fun name(…): PMType`.
  const callable =
    language === 'swift'
      ? /\bfunc\s+(\w+)\s*(?:<[^>]*>)?\s*\(/g
      : /\bfun\s+(?:<[^>]*>\s*)?(?:\w+\s*\.\s*)?(\w+)\s*\(/g
  for (const match of code.matchAll(callable)) {
    const close = closeOf(code, match.index + match[0].length - 1)
    const result = (
      language === 'swift' ? /^\s*(?:async\s+)?(?:throws\s+)?->\s*([^{\n]+)/ : /^\s*:\s*([^{=\n]+)/
    ).exec(code.slice(close + 1, close + 400))
    const shape =
      result === null
        ? undefined
        : shapeOfType((result[1] as string).replace(/\bwhere\b[\s\S]*$/, ''))
    if (shape !== undefined) add(typing.results, match[1] as string, [shape])
  }

  const opens = [...closes].map(([open, close]) => {
    const head =
      language === 'swift'
        ? /^\{\s*(?:\[[^\]\n]*\]\s*)?(\([^()\n]*\)|\w+(?:\s*,\s*\w+)*)(?:\s*->[^{}\n]*?)?\s+in\b/.exec(
            code.slice(open, open + 160),
          )
        : /^\{\s*(\([\w\s,]*\)|\w+(?:\s*,\s*\w+)*)\s*->/.exec(code.slice(open, open + 160))
    return { open, close, names: head === null ? [] : parameterNames(head[1] as string) }
  })
  const assignments = [...code.matchAll(/\b(?:let|var|val)\s+([A-Za-z_]\w*)\s*=(?!=)/g)]
  const loops =
    language === 'swift'
      ? [...code.matchAll(/\bfor\s+(?:case\s+let\s+)?(\(\s*\w+(?:\s*,\s*\w+)*\s*\)|\w+)\s+in\s+/g)]
      : [...code.matchAll(/\bfor\s*\(\s*(\(\s*\w+(?:\s*,\s*\w+)*\s*\)|\w+)\s+in\s+/g)]

  // The values flow from one name to the next, so the table is filled until it stops growing.
  for (let pass = 0, grew = true; grew && pass < 8; pass += 1) {
    grew = false
    for (const match of assignments) {
      const from = match.index + match[0].length
      // `if let`, `guard let`, `while let` and a later binding of the same condition end at a brace.
      const condition = /(?:\b(?:if|guard|while)|,)\s*$/.test(
        code.slice(Math.max(0, match.index - 12), match.index),
      )
      const shapes = headShapes(typing, from, Math.min(code.length, from + 400), 0, condition)
      if (add(typing.names, match[1] as string, shapes)) grew = true
    }
    for (const match of loops) {
      const from = match.index + match[0].length
      const end =
        language === 'swift'
          ? code.indexOf('{', from)
          : closeOf(code, code.indexOf('(', match.index))
      if (end === -1) continue
      const names = parameterNames(match[1] as string)
      const subject: Subject = { shapes: headShapes(typing, from, end) }
      names.forEach((name, index) => {
        if (name !== '' && add(typing.names, name, parameterOf(subject, index, names.length))) {
          grew = true
        }
      })
    }
    typing.closures = []
    for (const { open, close, names } of opens) {
      const subject = subjectOf(typing, open)
      if (subject === undefined) continue
      if (names.length === 0) typing.closures.push({ open, close, subject })
      names.forEach((name, index) => {
        if (name !== '' && add(typing.names, name, parameterOf(subject, index, names.length))) {
          grew = true
        }
      })
    }
  }
  return typing
}

/** A place a rendering reads a field of a value of one of the contract's structs. */
interface ShapeRead {
  struct: string
  field: string
  /** Set when the read only builds the member's identifier. */
  identity: boolean
}

/**
 * Every read of a field named in `fields`, `.<field>`, in a file, with the
 * struct of the value it is read from. A write, `.<field> = …`, is not a read,
 * and a read from a value whose shape the file does not say counts for no
 * struct.
 */
function shapeReads(
  file: Prepared,
  structs: Structs,
  cases: ReadonlyMap<string, readonly Shape[]>,
  fields: ReadonlySet<string>,
  language: NativeLanguage,
): ShapeRead[] {
  const typing = typingOf(file.structure, structs, cases, language)
  // The file's text, strings kept, so that a read inside an interpolation is typed too.
  const text: Typing = { ...typing, code: file.text }
  const reads: ShapeRead[] = []
  for (const match of file.text.matchAll(/\.\s*`?([A-Za-z_]\w*)`?(?!\s*=(?!=))/g)) {
    const field = match[1] as string
    if (!fields.has(field) || file.text[match.index - 1] === '.') continue
    const offset = match.index
    const identity = file.identity.some(([from, to]) => from <= offset && offset <= to)
    for (const shape of shapesBefore(text, offset)) {
      if ('struct' in shape && structs.get(shape.struct)?.has(field) === true) {
        reads.push({ struct: shape.struct, field, identity })
      }
    }
  }

  // An extension of a struct reads its fields by their names alone, or through `self` or `this`.
  const { structure } = file
  const extension =
    language === 'swift'
      ? /\bextension\s+(PM\w+)\b[^{]*\{/g
      : /\bfun\s+(?:<[^>]*>\s*)?(PM\w+)(?:<[^>]*>)?\s*\.\s*\w+\s*\(/g
  const label = language === 'swift' ? /^\s*:(?!:)/ : /^\s*=(?!=)/
  for (const match of structure.matchAll(extension)) {
    const struct = match[1] as string
    const own = structs.get(struct)
    if (own === undefined) continue
    let open = match.index + match[0].length - 1
    let close: number
    if (language === 'swift') {
      close = closeOf(structure, open)
    } else {
      const parameters = closeOf(structure, open)
      const body = /[{=]/.exec(structure.slice(parameters))
      if (body === null) continue
      open = parameters + body.index
      close =
        body[0] === '{' ? closeOf(structure, open) : expressionEnd(structure, match.index, open)
    }
    const names = /(?<![\w$.])(?:(?:self|this)\s*\.\s*)?([A-Za-z_]\w*)\b/g
    for (const name of file.text.slice(open, close).matchAll(names)) {
      const field = name[1] as string
      const at = open + name.index
      if (!own.has(field) || label.test(file.text.slice(at + name[0].length, at + 80))) continue
      const identity = file.identity.some(([from, to]) => from <= at && at <= to)
      reads.push({ struct, field, identity })
    }
  }
  return reads
}

export interface DrawnInput {
  language: NativeLanguage
  /** The key of `UNDRAWN`'s member lists for this platform. */
  platform: 'ios' | 'android'
  /** The generated contract, `Contracts.swift` or `Contracts.kt`. */
  contract: string
  /** Every hand-written file of the member package, the foundation's included. */
  files: readonly NativeSource[]
  /** Whether a file is the foundation or one of its further files. */
  isFoundation: (path: string) => boolean
  /** The member a member file is named for. */
  memberOf: (path: string) => string
  /** Every member the platform map marks native or adapted, pending ones included. */
  members: readonly string[]
  declared: readonly UndrawnProps[]
}

/** What a rendering does with a field the law holds. */
type Held = 'drawn' | 'recorded' | 'unread'

/**
 * Every contract field a rendering does not read, or writes only into its
 * identifier, that `declared` does not name, and every way `declared` has gone
 * stale: a field that is read outside the identifier, a member without a
 * rendering, a prop no listed member has, a member with none of an entry's
 * props, a pair named twice, an entry without a reason.
 */
export function undrawnViolations(input: DrawnInput): string[] {
  const { language, platform, files, members, declared } = input
  const structs = contractStructs(input.contract, language)
  const reads = propReads(files, language)
  const drawn = drawnFields(reads, structs)
  const recorded = new Set(
    reads.filter((read) => read.identity === true).map((read) => keyOf(read.struct, read.field)),
  )
  const prepared = files.map((file) => prepare(file, language))
  const memberFiles = new Map(
    prepared
      .filter((file) => !input.isFoundation(file.path))
      .map((file) => [input.memberOf(file.path), file]),
  )
  const foundation = prepared.filter((file) => input.isFoundation(file.path))
  const everything = prepared.map((file) => file.text).join('\n')
  const shapeFields = new Set(
    [...structs]
      .filter(([struct]) => !struct.endsWith('Props'))
      .flatMap(([, fields]) => [...fields.keys()]),
  )
  const { cases, nested } = contractCases(input.contract, language)
  const typed: Structs = new Map([...structs, ...nested])
  const readsIn = new Map(
    prepared.map((file) => [file.path, shapeReads(file, typed, cases, shapeFields, language)]),
  )

  /** The member a struct is named for: the longest member name that starts it. */
  const ownerOf = (struct: string): string | undefined => {
    const bare = struct.replace(/^PM/, '')
    return members
      .filter(
        (member) =>
          bare === member ||
          (bare.startsWith(member) && /[A-Z]/.test(bare[member.length] as string)),
      )
      .sort((a, b) => b.length - a.length)[0]
  }

  // Every field the law holds, with what the rendering does with it: by
  // `Member.field` for the member's own props, `Member.Struct.field` for any
  // other struct named for the member, and `Struct.field` for a shape no
  // member is named for.
  const held = new Map<string, Held>()
  for (const [struct, fields] of structs) {
    const owner = ownerOf(struct)
    const isProps = struct.endsWith('Props')
    if (owner !== undefined && !memberFiles.has(owner)) continue
    if (isProps && owner === undefined) continue
    if (!isProps && new RegExp(`\\b${struct}\\s*\\(`).test(everything)) continue
    const readers =
      owner === undefined ? prepared : [memberFiles.get(owner) as Prepared, ...foundation]
    const bare = struct.replace(/^PM/, '')
    for (const [field, type] of fields) {
      if (type.startsWith('PMUnsupported')) continue
      const name =
        owner === undefined
          ? `${bare}.${field}`
          : struct === `PM${owner}Props`
            ? `${owner}.${field}`
            : `${owner}.${bare}.${field}`
      const key = keyOf(struct, field)
      const reads = readers.flatMap((file) =>
        (readsIn.get(file.path) ?? []).filter(
          (read) => read.struct === struct && read.field === field,
        ),
      )
      const isDrawn = isProps ? drawn.has(key) : reads.some((read) => !read.identity)
      const isRecorded = isProps ? recorded.has(key) : reads.length > 0
      held.set(name, isDrawn ? 'drawn' : isRecorded ? 'recorded' : 'unread')
    }
  }

  const faults: string[] = []
  const named = new Set<string>()
  for (const entry of declared) {
    const listed = entry[platform] ?? []
    const where = `undrawn.ts (${entry.props.join(', ')})`
    if (entry.reason.trim() === '') faults.push(`${where}: the entry has no reason`)
    if (entry.ios === undefined && entry.android === undefined) {
      faults.push(`${where}: the entry names no member on either platform`)
    }
    const used = new Set<string>()
    const own = new Set<string>()
    for (const member of listed) {
      if (!memberFiles.has(member)) {
        faults.push(`${where}: ${member} has no rendering on ${platform}`)
        continue
      }
      let any = false
      for (const prop of entry.props) {
        // A shape no member is named for is declared by its own name, once,
        // whichever members the entry lists.
        const name = held.has(`${member}.${prop}`)
          ? `${member}.${prop}`
          : prop.includes('.') && held.has(prop)
            ? prop
            : undefined
        if (name === undefined) continue
        any = true
        used.add(prop)
        if (own.has(name)) continue
        own.add(name)
        if (named.has(name)) faults.push(`${where}: ${name} is declared twice on ${platform}`)
        named.add(name)
        if (held.get(name) === 'drawn') {
          faults.push(
            `${where}: ${name} is read by its rendering on ${platform} — remove it from the entry`,
          )
        }
      }
      if (!any) faults.push(`${where}: ${member} has none of the entry’s props on ${platform}`)
    }
    if (listed.length > 0) {
      for (const prop of entry.props) {
        if (!used.has(prop)) {
          faults.push(`${where}: no member the entry lists on ${platform} has \`${prop}\``)
        }
      }
    }
  }
  const remedy = 'draw it, or declare it in undrawn.ts with the reason'
  for (const [name, state] of held) {
    if (state === 'drawn' || named.has(name)) continue
    faults.push(
      state === 'recorded'
        ? `${name}: the rendering on ${platform} writes it into its identifier and draws nothing from it — ${remedy}`
        : `${name}: the contract carries it and the rendering on ${platform} never reads it — ${remedy}`,
    )
  }
  return faults
}
