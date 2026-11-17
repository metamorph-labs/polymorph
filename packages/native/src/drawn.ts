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
 *   `PMDataTableMessages`, `PMCitationSource`) is read where a field of its
 *   name is read, `.<field>`, in the file of the member the shape is named for
 *   or in a foundation file, and anywhere when no member's name starts the
 *   shape's. This rule goes by the name alone, so it cannot tell a shape's
 *   `label` from another value's. A shape the hand-written sources build is
 *   left out: the member writes it for the app to read, as an event's payload.
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
  const join = (from: readonly Prepared[], part: 'text' | 'drawing') =>
    from.map((file) => file[part]).join('\n')

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
      const named = new RegExp(`\\.\\s*\`?${field}\`?\\b`)
      const isDrawn = isProps ? drawn.has(key) : named.test(join(readers, 'drawing'))
      const isRecorded = isProps ? recorded.has(key) : named.test(join(readers, 'text'))
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
