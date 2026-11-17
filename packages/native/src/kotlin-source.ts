/**
 * Just enough of Kotlin's lexical structure for the laws and the generator:
 * comments, string literals (with their templates), character literals, and
 * balanced argument lists.
 *
 * Like `swift-source.ts`, the laws read source text and never ask the
 * compiler. They need to tell code from comments and strings, so that a colour
 * named in a comment is not a colour, and to find where a call's arguments end.
 */

export interface KotlinString {
  /** Offset of the opening quote in the source. */
  start: number
  /** Offset just past the closing quote. */
  end: number
  /** The literal's text outside its templates, escapes left as written. */
  text: string
  /** Whether it holds a template, `$name` or `${…}`. */
  interpolated: boolean
}

export interface Lexed {
  /**
   * The source with every comment blanked and every string and character
   * literal's contents blanked, quotes kept. Offsets match the source, so a
   * match here points at the same place there.
   */
  code: string
  /** Every string literal, a literal inside another's template after the one that holds it. */
  strings: KotlinString[]
}

const blank = (text: string) => text.replace(/[^\n]/g, ' ')

/** Lexes `source` into code and string literals. Throws on an unterminated comment or literal. */
export function lex(source: string): Lexed {
  let code = ''
  const strings: KotlinString[] = []
  let at = 0

  while (at < source.length) {
    if (source.startsWith('//', at)) {
      const end = source.indexOf('\n', at)
      const stop = end === -1 ? source.length : end
      code += blank(source.slice(at, stop))
      at = stop
      continue
    }
    if (source.startsWith('/*', at)) {
      const end = blockCommentEnd(source, at)
      code += blank(source.slice(at, end))
      at = end
      continue
    }
    if (source[at] === '"') {
      const nested: KotlinString[] = []
      const literal = readString(source, at, nested)
      strings.push(literal, ...nested)
      const quote = source.startsWith('"""', at) ? '"""' : '"'
      const inner = source.slice(at + quote.length, literal.end - quote.length)
      code += quote + blank(inner) + quote
      at = literal.end
      continue
    }
    if (source[at] === "'") {
      const end = charEnd(source, at)
      code += `'${blank(source.slice(at + 1, end - 1))}'`
      at = end
      continue
    }
    code += source[at]
    at += 1
  }

  return { code, strings }
}

/** The offset just past a block comment opened at `start`. Kotlin block comments nest. */
function blockCommentEnd(source: string, start: number): number {
  let depth = 0
  let end = start
  do {
    if (source.startsWith('/*', end)) {
      depth += 1
      end += 2
    } else if (source.startsWith('*/', end)) {
      depth -= 1
      end += 2
    } else if (end >= source.length) {
      throw new Error('an unterminated block comment')
    } else {
      end += 1
    }
  } while (depth > 0)
  return end
}

/** The offset just past a character literal opened at `start`: `'a'`, `'\n'`, `'A'`. */
function charEnd(source: string, start: number): number {
  let at = start + 1
  if (source[at] === '\\') at += source[at + 1] === 'u' ? 6 : 2
  else at += 1
  if (source[at] !== "'") throw new Error(`an unterminated character literal at offset ${start}`)
  return at + 1
}

function readString(source: string, start: number, nested: KotlinString[] = []): KotlinString {
  const raw = source.startsWith('"""', start)
  const quote = raw ? '"""' : '"'
  let at = start + quote.length
  let text = ''
  let interpolated = false

  while (at < source.length) {
    if (source.startsWith(quote, at)) {
      // A raw string ends at its last quote of a run: `""""` closes after the fourth.
      let close = at
      if (raw) while (source[close + 3] === '"') close += 1
      text += source.slice(at, close)
      return { start, end: close + quote.length, text, interpolated }
    }
    if (source.startsWith('${', at)) {
      // A template: skip to its balanced close, strings inside included.
      interpolated = true
      at += 2
      let depth = 1
      while (at < source.length && depth > 0) {
        if (source[at] === '"') {
          // A string inside a template is a literal of its own, which the
          // laws read as they read any other.
          const inner = readString(source, at, nested)
          nested.push(inner)
          at = inner.end
          continue
        }
        if (source[at] === "'") {
          at = charEnd(source, at)
          continue
        }
        if (source[at] === '{') depth += 1
        if (source[at] === '}') depth -= 1
        at += 1
      }
      continue
    }
    const name = /^\$[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(at, at + 200))
    if (name) {
      interpolated = true
      at += name[0].length
      continue
    }
    if (!raw && source[at] === '\\') {
      text += source.slice(at, at + 2)
      at += 2
      continue
    }
    if (!raw && source[at] === '\n') break
    text += source[at]
    at += 1
  }
  throw new Error(`an unterminated string literal at offset ${start}`)
}

/**
 * The text between the parenthesis at `open` and its balanced close, in the
 * lexed code (so parentheses in strings and comments are already blank).
 */
export function argumentsAt(code: string, open: number): string {
  let depth = 0
  for (let at = open; at < code.length; at += 1) {
    if (code[at] === '(') depth += 1
    if (code[at] === ')') {
      depth -= 1
      if (depth === 0) return code.slice(open + 1, at)
    }
  }
  return code.slice(open + 1)
}

/** The 1-based line of an offset. */
export function lineOf(source: string, offset: number): number {
  let line = 1
  for (let at = 0; at < offset && at < source.length; at += 1) if (source[at] === '\n') line += 1
  return line
}
