/**
 * A reader for the prop types the registry prints.
 *
 * The registry prints each prop's TypeScript type as a string
 * (`packages/registry/src/vocabulary.ts`, `printPropType`): literal unions in
 * full, everything else as the checker prints it. The contract generator needs
 * the structure of that string — which branches a union has, what a function
 * takes and returns — and this module parses it without the TypeScript
 * compiler, which a front over the registry does not link.
 *
 * The grammar is the subset the checker prints for a prop: unions, arrays,
 * tuples, parenthesised types, function types, object literal types, type
 * references with arguments, and string, number and boolean literals. Anything
 * else (an intersection, an indexed access, a generic function) is a syntax
 * this reader refuses with a `TypeSyntaxError`, and the generator records the
 * prop as unsupported rather than guessing.
 */

export type TsType =
  | { kind: 'keyword'; name: string }
  | { kind: 'literal'; value: string | number | boolean }
  | { kind: 'reference'; name: string; args: TsType[] }
  | { kind: 'array'; element: TsType }
  | { kind: 'tuple'; elements: TsType[] }
  | { kind: 'union'; types: TsType[] }
  | { kind: 'function'; params: TsParam[]; returns: TsType }
  | { kind: 'object'; members: TsMember[] }

export interface TsParam {
  name: string
  type: TsType
  optional: boolean
  rest: boolean
}

export interface TsMember {
  name: string
  type: TsType
  optional: boolean
}

/** The printed keywords the reader knows. Any other bare name is a type reference. */
const KEYWORDS = new Set([
  'any',
  'bigint',
  'boolean',
  'never',
  'null',
  'number',
  'object',
  'string',
  'symbol',
  'undefined',
  'unknown',
  'void',
])

export class TypeSyntaxError extends Error {
  override readonly name = 'TypeSyntaxError'
}

type Token =
  | { kind: 'name'; text: string }
  | { kind: 'string'; text: string }
  | { kind: 'number'; text: string }
  | { kind: 'punct'; text: string }

const PUNCTUATION = [
  '=>',
  '...',
  '|',
  '&',
  '(',
  ')',
  '[',
  ']',
  '{',
  '}',
  '<',
  '>',
  ',',
  ':',
  ';',
  '?',
  '.',
]

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let at = 0
  while (at < source.length) {
    const char = source[at] as string
    if (/\s/.test(char)) {
      at += 1
      continue
    }
    if (char === '"' || char === "'") {
      let text = ''
      at += 1
      while (at < source.length && source[at] !== char) {
        if (source[at] === '\\') {
          text += source[at + 1] ?? ''
          at += 2
        } else {
          text += source[at]
          at += 1
        }
      }
      if (at >= source.length) throw new TypeSyntaxError(`an unterminated string in ${source}`)
      at += 1
      tokens.push({ kind: 'string', text })
      continue
    }
    const number = /^-?\d+(?:\.\d+)?/.exec(source.slice(at))
    if (number && (char !== '-' || tokens.at(-1)?.kind === 'punct' || tokens.length === 0)) {
      tokens.push({ kind: 'number', text: number[0] })
      at += number[0].length
      continue
    }
    const name = /^[A-Za-z_$][\w$]*/.exec(source.slice(at))
    if (name) {
      tokens.push({ kind: 'name', text: name[0] })
      at += name[0].length
      continue
    }
    const punct = PUNCTUATION.find((candidate) => source.startsWith(candidate, at))
    if (punct === undefined) throw new TypeSyntaxError(`"${char}" in ${source}`)
    tokens.push({ kind: 'punct', text: punct })
    at += punct.length
  }
  return tokens
}

class Parser {
  private at = 0
  private readonly tokens: Token[]
  private readonly source: string

  constructor(tokens: Token[], source: string) {
    this.tokens = tokens
    this.source = source
  }

  parse(): TsType {
    const type = this.union()
    if (this.at !== this.tokens.length) this.fail('trailing text')
    return type
  }

  private peek(offset = 0): Token | undefined {
    return this.tokens[this.at + offset]
  }

  private isPunct(text: string, offset = 0): boolean {
    const token = this.peek(offset)
    return token?.kind === 'punct' && token.text === text
  }

  private eat(text: string): void {
    if (!this.isPunct(text)) this.fail(`expected "${text}"`)
    this.at += 1
  }

  private fail(message: string): never {
    const token = this.peek()
    throw new TypeSyntaxError(
      `${message} at ${token ? `"${token.text}"` : 'the end'} in ${this.source}`,
    )
  }

  private union(): TsType {
    // A leading bar is legal TypeScript and the printer may write one.
    if (this.isPunct('|')) this.at += 1
    const types = [this.postfix()]
    while (this.isPunct('|')) {
      this.at += 1
      types.push(this.postfix())
    }
    if (this.isPunct('&')) this.fail('an intersection')
    return types.length === 1 ? (types[0] as TsType) : { kind: 'union', types }
  }

  private postfix(): TsType {
    let type = this.primary()
    while (this.isPunct('[')) {
      if (!this.isPunct(']', 1)) this.fail('an indexed access')
      this.at += 2
      type = { kind: 'array', element: type }
    }
    return type
  }

  private primary(): TsType {
    const token = this.peek()
    if (token === undefined) this.fail('a missing type')

    if (token.kind === 'string') {
      this.at += 1
      return { kind: 'literal', value: token.text }
    }
    if (token.kind === 'number') {
      this.at += 1
      return { kind: 'literal', value: Number(token.text) }
    }
    if (token.kind === 'name') {
      if (token.text === 'readonly') {
        // `readonly T[]` reads as `T[]`: Swift arrays are values, so the
        // modifier has nothing to say there.
        this.at += 1
        return this.postfix()
      }
      if (token.text === 'true' || token.text === 'false') {
        this.at += 1
        return { kind: 'literal', value: token.text === 'true' }
      }
      if (token.text === 'typeof' || token.text === 'keyof' || token.text === 'infer') {
        this.fail(`a \`${token.text}\` type`)
      }
      if (KEYWORDS.has(token.text) && !this.isPunct('.', 1)) {
        this.at += 1
        return { kind: 'keyword', name: token.text }
      }
      return this.reference()
    }
    if (this.isPunct('('))
      return this.isFunctionAhead() ? this.functionType() : this.parenthesised()
    if (this.isPunct('[')) return this.tuple()
    if (this.isPunct('{')) return this.objectType()
    if (this.isPunct('<')) this.fail('a generic function type')
    return this.fail('an unexpected token')
  }

  private reference(): TsType {
    let name = (this.peek() as Token).text
    this.at += 1
    while (this.isPunct('.') && this.peek(1)?.kind === 'name') {
      name += `.${(this.peek(1) as Token).text}`
      this.at += 2
    }
    const args: TsType[] = []
    if (this.isPunct('<')) {
      this.at += 1
      args.push(this.union())
      while (this.isPunct(',')) {
        this.at += 1
        args.push(this.union())
      }
      this.eat('>')
    }
    return { kind: 'reference', name, args }
  }

  /** `(` opens a function's parameters when what follows can only be parameters. */
  private isFunctionAhead(): boolean {
    const next = this.peek(1)
    if (next === undefined) return false
    if (next.kind === 'punct') return next.text === ')' || next.text === '...'
    if (next.kind !== 'name') return false
    const after = this.peek(2)
    return (
      after?.kind === 'punct' && (after.text === ':' || after.text === '?' || after.text === ',')
    )
  }

  private parenthesised(): TsType {
    this.eat('(')
    const type = this.union()
    this.eat(')')
    return type
  }

  private functionType(): TsType {
    const params = this.parameters()
    this.eat('=>')
    return { kind: 'function', params, returns: this.union() }
  }

  /** `(name: T, rest?: U, ...more: V[])`, the parentheses included. */
  private parameters(): TsParam[] {
    this.eat('(')
    const params: TsParam[] = []
    while (!this.isPunct(')')) {
      const rest = this.isPunct('...')
      if (rest) this.at += 1
      const name = this.peek()
      if (name?.kind !== 'name') this.fail('a parameter name')
      this.at += 1
      const optional = this.isPunct('?')
      if (optional) this.at += 1
      this.eat(':')
      params.push({ name: name.text, type: this.union(), optional, rest })
      if (!this.isPunct(')')) this.eat(',')
    }
    this.eat(')')
    return params
  }

  private tuple(): TsType {
    this.eat('[')
    const elements: TsType[] = []
    while (!this.isPunct(']')) {
      elements.push(this.union())
      if (!this.isPunct(']')) this.eat(',')
    }
    this.eat(']')
    return { kind: 'tuple', elements }
  }

  private objectType(): TsType {
    this.eat('{')
    const members: TsMember[] = []
    while (!this.isPunct('}')) {
      const key = this.peek()
      if (key?.kind !== 'name' && key?.kind !== 'string') this.fail('a member name')
      this.at += 1
      const optional = this.isPunct('?')
      if (optional) this.at += 1
      let type: TsType
      if (this.isPunct('(')) {
        // A method signature, `name(param: T): R`, is a member of function type.
        const params = this.parameters()
        this.eat(':')
        type = { kind: 'function', params, returns: this.union() }
      } else {
        this.eat(':')
        type = this.union()
      }
      members.push({ name: key.text, type, optional })
      if (this.isPunct(';') || this.isPunct(',')) this.at += 1
    }
    this.eat('}')
    return { kind: 'object', members }
  }
}

/** The structure of a printed TypeScript type. Throws `TypeSyntaxError` on what it cannot read. */
export function parseType(source: string): TsType {
  return new Parser(tokenize(source), source).parse()
}

/** The branches of a union, or the type itself as the only branch. */
export function branches(type: TsType): TsType[] {
  return type.kind === 'union' ? type.types.flatMap(branches) : [type]
}

export const isKeyword = (type: TsType, name: string): boolean =>
  type.kind === 'keyword' && type.name === name
