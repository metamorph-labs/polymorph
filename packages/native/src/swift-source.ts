/**
 * Just enough of Swift's lexical structure for the laws: comments, string
 * literals (with their interpolations), and balanced argument lists.
 *
 * The laws are syntactic, like the web's red rules: they read source text and
 * never ask the compiler. What they need from the text is to tell code from
 * comments and strings, so that a colour named in a comment is not a colour,
 * and to find where a call's arguments end.
 */

export interface SwiftString {
  /** Offset of the opening quote in the source. */
  start: number
  /** Offset just past the closing quote. */
  end: number
  /** The literal's text outside its interpolations, escapes left as written. */
  text: string
  /** Whether it holds an interpolation, `\(…)`. */
  interpolated: boolean
}

export interface Lexed {
  /**
   * The source with every comment blanked and every string literal's contents
   * blanked, quotes kept. Offsets match the source, so a match here points at
   * the same place there.
   */
  code: string
  strings: SwiftString[]
}

const blank = (text: string) => text.replace(/[^\n]/g, ' ')

/** Lexes `source` into code and string literals. Throws on an unterminated comment or string. */
export function lex(source: string): Lexed {
  let code = ''
  const strings: SwiftString[] = []
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
      // Swift block comments nest.
      let depth = 0
      let end = at
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
      code += blank(source.slice(at, end))
      at = end
      continue
    }
    const opening = /^(#*)("""|")/.exec(source.slice(at))
    if (opening) {
      const literal = readString(source, at, (opening[1] as string).length, opening[2] === '"""')
      strings.push(literal)
      const quote = source.slice(at, at + (opening[0] as string).length)
      const inner = source.slice(at + quote.length, literal.end - quote.length)
      code += quote + blank(inner) + source.slice(literal.end - quote.length, literal.end)
      at = literal.end
      continue
    }
    code += source[at]
    at += 1
  }

  return { code, strings }
}

function readString(
  source: string,
  start: number,
  hashes: number,
  multiline: boolean,
): SwiftString {
  const pounds = '#'.repeat(hashes)
  const quote = multiline ? '"""' : '"'
  const close = `${quote}${pounds}`
  const escape = `\\${pounds}`
  let at = start + hashes + quote.length
  let text = ''
  let interpolated = false

  while (at < source.length) {
    if (source.startsWith(close, at)) {
      return { start, end: at + close.length, text, interpolated }
    }
    if (source.startsWith(`${escape}(`, at)) {
      // An interpolation: skip to its balanced close, strings inside included.
      interpolated = true
      at += escape.length + 1
      let depth = 1
      while (at < source.length && depth > 0) {
        const nested = /^(#*)("""|")/.exec(source.slice(at))
        if (nested) {
          at = readString(source, at, (nested[1] as string).length, nested[2] === '"""').end
          continue
        }
        if (source[at] === '(') depth += 1
        if (source[at] === ')') depth -= 1
        at += 1
      }
      continue
    }
    if (source.startsWith(escape, at)) {
      text += source.slice(at, at + escape.length + 1)
      at += escape.length + 1
      continue
    }
    if (!multiline && source[at] === '\n') break
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

/**
 * The expression after a label, up to where it ends at the same depth: a
 * comma or a closing parenthesis (an argument: in `spacing: space.s1) {`, the
 * expression after `spacing:` is `space.s1`), a brace (a declaration's body or
 * a trailing closure), or a line end the next line does not continue. A line
 * continues the expression when it starts with an operator or a member
 * access (`?`, `:`, `.`, `+`, `*`, `&&`, …), as a wrapped ternary does. So a
 * stored property `let size: PMControlSize` reads as `PMControlSize`, never
 * as the rest of the type it is declared in.
 */
export function expressionAfter(code: string, from: number): string {
  let depth = 0
  for (let at = from; at < code.length; at += 1) {
    const char = code[at] as string
    if (char === '(' || char === '[') depth += 1
    if (char === ')' || char === ']') {
      if (depth === 0) return code.slice(from, at)
      depth -= 1
    }
    if (depth > 0) continue
    if (char === ',' || char === '{' || char === '}') return code.slice(from, at)
    if (char === '\n' && !/^[ \t]*(?:[?:.+\-*/%&|^<>=!]|\?\?)/.test(code.slice(at + 1))) {
      return code.slice(from, at)
    }
  }
  return code.slice(from)
}

/** The 1-based line of an offset. */
export function lineOf(source: string, offset: number): number {
  let line = 1
  for (let at = 0; at < offset && at < source.length; at += 1) if (source[at] === '\n') line += 1
  return line
}
