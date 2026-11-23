/**
 * The document a model has written so far, from the text it has written so
 * far.
 *
 * A model writes a screen as it thinks, and a host draws what has arrived.
 * Text cut at any point is not JSON, so this reads it as JSON that stops: it
 * closes what is open, and decides for the one thing being written at the cut
 * whether it can be drawn yet.
 *
 *  - A string a reader reads (a child, a prop's value, a field of a
 *    structured object) is kept while it is written, so text appears as it
 *    arrives. Its path is `open`, so a renderer can hold it back where a
 *    half-written word means something else (a variant, an address).
 *  - Anything else still being written is left out until it is whole: a
 *    `component` name or a prop name (`Butt` is not `Button`), a number (`12`
 *    may be `120`), `true` and its siblings, a binding (`draft` may be
 *    `draft.subject`), an input, an exception, and an object that does not yet
 *    say what it is (an element without its `component`).
 *
 * The schema writes `root` last (`packages/spec/src/schema.ts`), so the
 * inputs arrive before the tree, and the tree is what streams. Each cut is a
 * document whose every name, number and binding is one the whole document
 * holds at the same path, and whose drawn text only grows; the whole text
 * gives exactly `JSON.parse`'s result.
 *
 * The text may be a model's answer: prose, then a fenced `json` block. The
 * document is read from the first fence marked `json` (or unmarked), and from
 * the first brace that opens an object when the text has no fence.
 */

export interface PartialDocument {
  /** The document the text holds so far; `undefined` before the document's first brace. */
  document: unknown
  /** Whether the document's outermost brace has closed. */
  complete: boolean
  /** The path of the string still being written, when the document holds it: `$.root.children[2]`. */
  open: string | null
  /** Where the text stops being JSON before it ends, and why. The document holds what came before. */
  error: { at: number; message: string } | null
}

/** A value the cut leaves out. */
const OMIT: unique symbol = Symbol('omit')

/**
 * What the parser is reading, which decides what it keeps of a value the cut
 * goes through:
 *
 *  - `document`: the outermost object, kept with every member that is whole.
 *  - `opaque`: anything kept only when whole (`spec`, `name`, `types`, a
 *    `component` name, a binding's path, an exception).
 *  - `inputs`: the inputs, kept with every input that is whole.
 *  - `value`: a value in the tree (`reader` when a reader reads a string
 *    there): an element, a binding, a structured object, a literal or a list.
 *  - `map`: an element's props, or a structured object's fields; each entry is
 *    a value a reader reads.
 */
type Context = 'document' | 'opaque' | 'inputs' | 'value' | 'map'

interface Parsed {
  value: unknown
  /** Whether the value closed before the cut. */
  whole: boolean
  open: string | null
}

const WHITESPACE = new Set([' ', '\t', '\n', '\r'])

/** A JSON number, from its first character to the last that can belong to it. */
const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y

const LITERALS: Readonly<Record<string, unknown>> = { true: true, false: false, null: null }

const ESCAPES: Readonly<Record<string, string>> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
}

class Stop extends Error {}

/** Where the document starts in a model's answer, or -1 before it does. */
function documentStart(text: string): number {
  const fence = /^[ \t]*```[ \t]*([^\s`]*)[^\n]*\n/gm
  let inside = false
  for (const match of text.matchAll(fence)) {
    const info = (match[1] ?? '').toLowerCase()
    if (inside) {
      inside = false
      continue
    }
    if (info === '' || info === 'json') {
      const brace = text.indexOf('{', (match.index ?? 0) + match[0].length)
      return brace
    }
    inside = true
  }
  // A fence whose line has not ended yet starts the document's block: wait for it, rather than
  // read a brace in the prose before it.
  const last = text.slice(text.lastIndexOf('\n') + 1)
  if (/^[ \t]*`/.test(last)) return -1
  // A brace that opens an object: a member's name, a closing brace or the end of the text follows
  // it. A brace in prose (`{ braces }`) does not.
  return /\{[ \t\r\n]*(?:"|\}|$)/.exec(text)?.index ?? -1
}

/** Sets a member as the object's own, `__proto__` included, as `JSON.parse` does. */
function own(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  })
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function parsePartial(text: string): PartialDocument {
  const start = documentStart(text)
  if (start === -1) return { document: undefined, complete: false, open: null, error: null }

  let at = start
  /** Where the readable text ends: its end, or where it stops being JSON. */
  let limit = text.length
  let error: PartialDocument['error'] = null

  /** The text is not JSON from here: what came before is read as a cut. */
  const fail = (message: string): never => {
    if (error === null) error = { at, message }
    limit = at
    throw new Stop()
  }
  const space = () => {
    while (at < limit && WHITESPACE.has(text[at] as string)) at += 1
  }

  /** A string from its opening quote: the text so far, and whether its closing quote came. */
  const string = (): { text: string; whole: boolean } => {
    at += 1
    let out = ''
    let run = at
    while (at < limit) {
      const char = text[at] as string
      if (char === '"') {
        out += text.slice(run, at)
        at += 1
        return { text: out, whole: true }
      }
      if (char.charCodeAt(0) < 0x20) fail('a control character inside a string, which JSON escapes')
      if (char !== '\\') {
        at += 1
        continue
      }
      out += text.slice(run, at)
      if (at + 1 >= limit) {
        at = limit
        return { text: out, whole: false }
      }
      const escape = text[at + 1] as string
      if (escape === 'u') {
        const hex = text.slice(at + 2, Math.min(at + 6, limit))
        if (at + 6 > limit) {
          if (!/^[0-9a-fA-F]*$/.test(hex)) fail('an escape that is not four hexadecimal digits')
          at = limit
          return { text: out, whole: false }
        }
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('an escape that is not four hexadecimal digits')
        out += String.fromCharCode(parseInt(hex, 16))
        at += 6
      } else {
        const unescaped = ESCAPES[escape]
        if (unescaped === undefined) fail(`\`\\${escape}\` is not an escape JSON has`)
        out += unescaped
        at += 2
      }
      run = at
    }
    out += text.slice(run, at)
    return { text: out, whole: false }
  }

  /** The context of a member's value, by the object's own context, its kind so far and the key. */
  const memberContext = (
    context: Context,
    kind: 'element' | 'binding' | 'object' | null,
    key: string,
  ): { context: Context; reader: boolean } => {
    if (context === 'document') {
      if (key === 'root') return { context: 'value', reader: false }
      if (key === 'inputs') return { context: 'inputs', reader: false }
      return { context: 'opaque', reader: false }
    }
    if (context === 'map') return { context: 'value', reader: true }
    if (context === 'value') {
      // `$object` says what the object is, so it is read as one from its first member.
      if (key === '$object' && (kind === null || kind === 'object')) {
        return { context: 'map', reader: false }
      }
      if (kind === 'element' && key === 'props') return { context: 'map', reader: false }
      if (kind === 'element' && key === 'children') return { context: 'value', reader: true }
    }
    return { context: 'opaque', reader: false }
  }

  const object = (context: Context, path: string): Parsed => {
    at += 1
    const out: Record<string, unknown> = {}
    let kind: 'element' | 'binding' | 'object' | null = null
    const cut = (last?: { key: string; parsed: Parsed }): Parsed => {
      let open: string | null = null
      if (last !== undefined && last.parsed.value !== OMIT) {
        own(out, last.key, last.parsed.value)
        open = last.parsed.open
        if (context === 'value' && kind === null && last.key === '$object') kind = 'object'
      }
      const kept =
        context === 'document' || context === 'map' || (context === 'value' && kind !== null)
      return kept ? { value: out, whole: false, open } : { value: OMIT, whole: false, open: null }
    }

    space()
    if (at >= limit) return cut()
    if (text[at] === '}') {
      at += 1
      return { value: out, whole: true, open: null }
    }
    for (;;) {
      space()
      if (at >= limit) return cut()
      if (text[at] !== '"') fail('a member’s name, in double quotes')
      const key = string()
      if (!key.whole) return cut()
      space()
      if (at >= limit) return cut()
      if (text[at] !== ':') fail('a colon after a member’s name')
      at += 1
      const inner = memberContext(context, kind, key.text)
      // A structured object's fields sit at its own path, as the validator writes them.
      const where = context === 'value' && key.text === '$object' ? path : `${path}.${key.text}`
      const parsed = value(inner.context, inner.reader, where)
      if (!parsed.whole) return cut({ key: key.text, parsed })
      own(out, key.text, parsed.value)
      if (context === 'value' && kind === null) {
        if (key.text === 'component' && typeof parsed.value === 'string') kind = 'element'
        else if (key.text === '$' && typeof parsed.value === 'string') kind = 'binding'
        else if (key.text === '$object') kind = 'object'
      }
      space()
      if (at >= limit) return cut()
      if (text[at] === ',') {
        at += 1
        continue
      }
      if (text[at] === '}') {
        at += 1
        return { value: out, whole: true, open: null }
      }
      fail('a comma or a closing brace after a member')
    }
  }

  const array = (context: Context, reader: boolean, path: string): Parsed => {
    at += 1
    const out: unknown[] = []
    const item: Context = context === 'value' ? 'value' : 'opaque'
    const cut = (last?: Parsed): Parsed => {
      if (context === 'opaque') return { value: OMIT, whole: false, open: null }
      // An input is kept only when it is whole.
      if (last !== undefined && last.value !== OMIT && context === 'value') {
        out.push(last.value)
        return { value: out, whole: false, open: last.open }
      }
      return { value: out, whole: false, open: null }
    }

    space()
    if (at >= limit) return cut()
    if (text[at] === ']') {
      at += 1
      return { value: out, whole: true, open: null }
    }
    for (;;) {
      const parsed = value(item, reader, `${path}[${out.length}]`)
      if (!parsed.whole) return cut(parsed)
      out.push(parsed.value)
      space()
      if (at >= limit) return cut()
      if (text[at] === ',') {
        at += 1
        space()
        if (at >= limit) return cut()
        continue
      }
      if (text[at] === ']') {
        at += 1
        return { value: out, whole: true, open: null }
      }
      fail('a comma or a closing bracket after an item')
    }
  }

  /**
   * A number. One the cut reaches may go on (`12` may be `120`, `1.` may be
   * `1.5`), so it is whole only once a character that cannot continue it
   * follows.
   */
  const number = (): Parsed => {
    const cut = (): Parsed => {
      at = limit
      return { value: OMIT, whole: false, open: null }
    }
    NUMBER.lastIndex = at
    const match = NUMBER.exec(text)
    if (match === null) return at + 1 >= limit ? cut() : fail('a number')
    const end = at + match[0].length
    if (end >= limit) return cut()
    if (/[0-9.eE+-]/.test(text[end] as string)) {
      // `1.` and `1e+` with the rest still to come; any other continuation is not JSON.
      if (/^(?:\.|[eE][+-]?)$/.test(text.slice(end, limit))) return cut()
      at = end
      return fail('a number')
    }
    at = end
    return { value: Number(match[0]), whole: true, open: null }
  }

  const value = (context: Context, reader: boolean, path: string): Parsed => {
    space()
    if (at >= limit) return { value: OMIT, whole: false, open: null }
    const char = text[at] as string
    if (char === '{') return object(context === 'document' ? 'document' : context, path)
    if (char === '[') return array(context, reader, path)
    if (char === '"') {
      const read = string()
      if (read.whole) return { value: read.text, whole: true, open: null }
      if (context !== 'value' || !reader) return { value: OMIT, whole: false, open: null }
      // A lone high surrogate waits for its pair.
      const last = read.text.charCodeAt(read.text.length - 1)
      const text = last >= 0xd800 && last <= 0xdbff ? read.text.slice(0, -1) : read.text
      return { value: text, whole: false, open: path }
    }
    if (char === '-' || (char >= '0' && char <= '9')) return number()
    for (const [word, literal] of Object.entries(LITERALS)) {
      const written = text.slice(at, Math.min(limit, at + word.length))
      if (written === word) {
        at += word.length
        return { value: literal, whole: true, open: null }
      }
      if (word.startsWith(written) && at + written.length >= limit) {
        at = limit
        return { value: OMIT, whole: false, open: null }
      }
    }
    return fail('a value')
  }

  let parsed: Parsed
  for (;;) {
    at = start
    try {
      parsed = value('document', false, '$')
      break
    } catch (stop) {
      if (!(stop instanceof Stop)) throw stop
      // Read again up to where the text stopped being JSON, as a cut there.
    }
  }
  const document = parsed.value === OMIT ? undefined : parsed.value
  return {
    document: isRecord(document) || document === undefined ? document : undefined,
    complete: parsed.whole,
    open: parsed.value === OMIT ? null : parsed.open,
    error,
  }
}
