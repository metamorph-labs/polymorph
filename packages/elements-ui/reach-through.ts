/**
 * The reach-through transform: the recipes as the custom elements need them.
 *
 * A page-written element (`<poly-card>`) stays in the document around the
 * member it renders and draws no box: it carries the custom state
 * `poly-host` and has `display: contents`. A recipe selector that relates an
 * element to its parent or its siblings (`.grid > *`, `.row + .row`,
 * `.item:first-child`) does not match through such a host, because the host
 * is the parent or the sibling in the document. The transform adds to each
 * such selector the forms that also match through one host:
 *
 *  - a child step reaches the host's member: `.grid > *` also reads
 *    `.grid > :where(:state(poly-host)) > *`;
 *  - a sibling step reads the hosts as the siblings: `.row + .row` also reads
 *    `:where(:state(poly-host)):has(> .row:where(:last-child)) + :where(:state(poly-host)) > .row:where(:first-child)`;
 *  - a structural pseudo-class reads the host's position:
 *    `.item:first-child` also reads
 *    `:where(:state(poly-host)):first-child > .item:where(:first-child)`;
 *  - a relative selector in `:has()`, `:is()` or `:where()` gains the same forms.
 *
 * Each added form keeps the specificity of the selector it comes from: the
 * host and the position the transform adds are inside `:where()`, and a
 * pseudo-class moved to the host keeps its weight. So a rule wins and loses
 * against the same rules as it does for the other renderers. The added forms
 * match only where a host intervenes, which happens only where a page wrote an
 * element, so the members' own anatomy reads the recipe unchanged.
 *
 * A compound with an `-of-type` pseudo-class has no added form: a host's tag
 * is not its member's.
 *
 * The shared recipes in `@polymorph/recipes` are written for every renderer
 * and are not changed. The elements apply the transform when they load the
 * recipes: the `elements` test project through `reachThroughPlugin`, and the
 * elements' published build through the same plugin.
 */

/** The host's mark, inside `:where()` so it adds no specificity. */
const HOST = ':where(:state(poly-host))'

/** The pseudo-classes that read a position among siblings, which a host takes in its member's place. */
const STRUCTURAL = new Set([
  'first-child',
  'last-child',
  'only-child',
  'nth-child',
  'nth-last-child',
])

/** The pseudo-classes whose position counts elements of one tag, which a host does not share. */
const OF_TYPE = new Set([
  'first-of-type',
  'last-of-type',
  'only-of-type',
  'nth-of-type',
  'nth-last-of-type',
])

/** The pseudo-classes whose argument is a selector list the transform reads too. */
const LISTS = new Set(['has', 'is', 'where'])

/** The legacy pseudo-elements written with one colon. */
const LEGACY_ELEMENTS = new Set(['before', 'after', 'first-line', 'first-letter'])

type Combinator = ' ' | '>' | '+' | '~'

/** One simple selector of a compound: a pseudo-class with its name and argument, or any other text. */
interface Simple {
  text: string
  /** A pseudo-class's name, lowercased, without its colon. */
  pseudo?: string
  /** A pseudo-class's argument, without its parentheses. */
  argument?: string
  /** A pseudo-element (`::before`), which ends a compound. */
  element?: true
}

/** A complex selector: its compounds and the combinator before each one but the first. */
interface Complex {
  compounds: Simple[][]
  /** `combinators[i]` stands before `compounds[i]`; `combinators[0]` is a relative selector's leading one. */
  combinators: (Combinator | null)[]
}

/** The index just past the closing bracket, parenthesis or quote that `text[at]` opens. */
function skip(text: string, at: number): number {
  const open = text[at] as string
  if (open === '"' || open === "'") {
    let index = at + 1
    while (index < text.length && text[index] !== open) index += text[index] === '\\' ? 2 : 1
    return index + 1
  }
  const close = open === '(' ? ')' : ']'
  let depth = 0
  for (let index = at; index < text.length; index++) {
    const char = text[index] as string
    if (char === '\\') index++
    else if (char === '"' || char === "'") index = skip(text, index) - 1
    else if (char === open) depth++
    else if (char === close && --depth === 0) return index + 1
  }
  return text.length
}

/** A list split at its top-level commas, outside comments, strings, brackets and parentheses. */
export function splitList(text: string): string[] {
  const parts: string[] = []
  let start = 0
  for (let index = 0; index < text.length; index++) {
    const char = text[index] as string
    if (char === '\\') index++
    else if (char === '/' && text[index + 1] === '*') {
      const end = text.indexOf('*/', index + 2)
      index = end === -1 ? text.length : end + 1
    } else if (char === '(' || char === '[' || char === '"' || char === "'")
      index = skip(text, index) - 1
    else if (char === ',') {
      parts.push(text.slice(start, index))
      start = index + 1
    }
  }
  parts.push(text.slice(start))
  return parts
}

/** A compound's simple selectors. */
function simples(compound: string): Simple[] {
  const out: Simple[] = []
  let index = 0
  while (index < compound.length) {
    const start = index
    const char = compound[index] as string
    if (char === ':') {
      const element = compound[index + 1] === ':'
      index += element ? 2 : 1
      while (index < compound.length && /[-\w]/.test(compound[index] as string)) index++
      const name = compound.slice(start + (element ? 2 : 1), index).toLowerCase()
      let argument: string | undefined
      if (compound[index] === '(') {
        const end = skip(compound, index)
        argument = compound.slice(index + 1, end - 1)
        index = end
      }
      const text = compound.slice(start, index)
      if (element || LEGACY_ELEMENTS.has(name)) out.push({ text, element: true })
      else out.push({ text, pseudo: name, ...(argument !== undefined ? { argument } : {}) })
      continue
    }
    if (char === '[') index = skip(compound, index)
    else {
      index++
      while (index < compound.length && !':[.#'.includes(compound[index] as string)) {
        if (compound[index] === '\\') index++
        index++
      }
    }
    out.push({ text: compound.slice(start, index) })
  }
  return out
}

/** A complex selector read into its compounds and combinators, or `null` when it has none to read. */
function parse(selector: string): Complex | null {
  const compounds: Simple[][] = []
  const combinators: (Combinator | null)[] = []
  let pending: Combinator | null = null
  let current = ''
  const flush = () => {
    if (current === '') return
    combinators.push(compounds.length === 0 && pending === null ? null : (pending ?? ' '))
    compounds.push(simples(current))
    current = ''
    pending = null
  }
  for (let index = 0; index < selector.length; index++) {
    const char = selector[index] as string
    if (char === '\\') {
      current += selector.slice(index, index + 2)
      index++
    } else if (char === '(' || char === '[' || char === '"' || char === "'") {
      const end = skip(selector, index)
      current += selector.slice(index, end)
      index = end - 1
    } else if (/\s/.test(char)) {
      if (current !== '') {
        flush()
        pending = ' '
      }
    } else if (char === '>' || char === '+' || char === '~') {
      if (current !== '') flush()
      if (compounds.length === 0) {
        // A relative selector: an empty compound stands for the element it is relative to.
        compounds.push([])
        combinators.push(null)
      }
      pending = char
    } else current += char
  }
  flush()
  return compounds.length === 0 ? null : { compounds, combinators }
}

/** Whether a `:not()` argument reads only positions among siblings (`:not(:first-child, :last-child)`). */
function structuralNot(argument: string): boolean {
  return splitList(argument).every((part) => {
    const read = simples(part.trim())
    return read.length > 0 && read.every((simple) => STRUCTURAL.has(simple.pseudo ?? ''))
  })
}

/** Whether a simple selector reads the compound's position among its siblings. */
const positional = (simple: Simple) =>
  STRUCTURAL.has(simple.pseudo ?? '') ||
  (simple.pseudo === 'not' && structuralNot(simple.argument ?? ''))

/** A compound's text, with a list pseudo-class's argument read through the transform. */
function write(compound: readonly Simple[]): string {
  return compound
    .map((simple) =>
      simple.pseudo !== undefined && LISTS.has(simple.pseudo) && simple.argument !== undefined
        ? `:${simple.pseudo}(${transformList(simple.argument)})`
        : simple.text,
    )
    .join('')
}

/** A compound with pseudo-classes added before its pseudo-element, if it has one. */
function withPosition(compound: readonly Simple[], added: string): string {
  const at = compound.findIndex((simple) => simple.element === true)
  const head = at === -1 ? compound : compound.slice(0, at)
  const tail = at === -1 ? [] : compound.slice(at)
  return `${write(head)}${added}${write(tail)}`
}

/**
 * The forms of one complex selector that also match through a host, each
 * with the specificity of the original. The original is not among them.
 */
export function reachThrough(selector: string): string[] {
  const complex = parse(selector.replace(/\/\*[\s\S]*?\*\//g, ' ').trim())
  if (complex === null) return []
  const { compounds, combinators } = complex
  const last = compounds.length - 1
  // The compounds whose relation to a parent or a sibling a host can stand between.
  const reaching = compounds.map((compound, index) => {
    if (compound.length === 0 || compound.some((simple) => OF_TYPE.has(simple.pseudo ?? ''))) {
      return false
    }
    const before = combinators[index]
    const after = combinators[index + 1]
    return (
      before === '>' ||
      before === '+' ||
      before === '~' ||
      after === '+' ||
      after === '~' ||
      compound.some(positional)
    )
  })
  const candidates = reaching.flatMap((reach, index) => (reach ? [index] : []))
  const joint = (index: number) => {
    const before = combinators[index]
    return index === 0 ? '' : before === ' ' ? ' ' : ` ${before} `
  }
  // The same selector with each list pseudo-class read through: a form of its own when it differs.
  const inner = compounds.map((compound, index) => `${joint(index)}${write(compound)}`).join('')
  const plain = compounds
    .map((compound, index) => `${joint(index)}${compound.map((simple) => simple.text).join('')}`)
    .join('')
  const forms: string[] = inner === plain ? [] : [inner.trim()]
  for (let mask = 1; mask < 1 << candidates.length; mask++) {
    const wrapped = new Set(candidates.filter((_, bit) => (mask & (1 << bit)) !== 0))
    let out = ''
    compounds.forEach((compound, index) => {
      const before = combinators[index]
      if (!wrapped.has(index)) {
        out += `${joint(index)}${write(compound)}`
        return
      }
      const moved = compound.filter(positional)
      const kept = compound.filter((simple) => !positional(simple))
      const names = new Set(moved.map((simple) => simple.pseudo))
      const after = combinators[index + 1]
      const first = names.has('first-child') || names.has('only-child') || before === '+'
      const lastOne =
        names.has('last-child') || names.has('only-child') || (index < last && after === '+')
      const position =
        first && lastOne
          ? ':where(:only-child)'
          : first
            ? ':where(:first-child)'
            : lastOne
              ? ':where(:last-child)'
              : ''
      const host = `${HOST}${moved.map((simple) => simple.text).join('')}`
      const element = withPosition(kept.length === 0 ? [{ text: '*' }] : kept, position)
      out +=
        index < last && (after === '+' || after === '~')
          ? `${joint(index)}${host}:has(> ${element})`
          : `${joint(index)}${host} > ${element}`
    })
    forms.push(out.trim())
  }
  return forms
}

/** A selector list with every form `reachThrough` adds after each selector. */
export function transformList(list: string): string {
  return splitList(list)
    .flatMap((selector) => [selector, ...reachThrough(selector).map((form) => ` ${form}`)])
    .join(',')
}

/** The at-rules whose blocks hold rules rather than keyframes or declarations. */
const GROUPING = /^@(media|supports|container|layer|scope|document|starting-style)\b/i

/**
 * A stylesheet with every rule's selector list transformed. Everything else
 * is written as it is: comments, declarations, at-rule preludes, and the
 * selectors of `@keyframes`.
 */
export function reachThroughCss(css: string): string {
  let out = ''
  let prelude = ''
  /** For each open block, whether its rules' preludes are selectors. */
  const blocks: boolean[] = []
  const selectors = () => blocks.length === 0 || (blocks.at(-1) as boolean)
  for (let index = 0; index < css.length; index++) {
    const char = css[index] as string
    if (char === '/' && css[index + 1] === '*') {
      const end = css.indexOf('*/', index + 2)
      const stop = end === -1 ? css.length : end + 2
      prelude += css.slice(index, stop)
      index = stop - 1
    } else if (char === '"' || char === "'") {
      const end = skip(css, index)
      prelude += css.slice(index, end)
      index = end - 1
    } else if (char === '{') {
      const text = prelude.trimStart()
      if (text.startsWith('@')) {
        out += `${prelude}{`
        blocks.push(GROUPING.test(text))
      } else if (selectors()) {
        const lead = prelude.slice(0, prelude.length - prelude.trimStart().length)
        const body = prelude.trimStart()
        const trail = body.slice(body.trimEnd().length)
        out += `${lead}${transformList(body.trimEnd())}${trail}{`
        // A style rule's block holds declarations and, under nesting, rules.
        blocks.push(true)
      } else {
        out += `${prelude}{`
        blocks.push(false)
      }
      prelude = ''
    } else if (char === ';' || char === '}') {
      out += `${prelude}${char}`
      prelude = ''
      if (char === '}') blocks.pop()
    } else prelude += char
  }
  return out + prelude
}

/**
 * The transform as a Vite plugin: each stylesheet `@polymorph/recipes` holds,
 * transformed before Vite reads it (and its CSS Modules classes), for a build
 * or a test project that renders the elements.
 */
export function reachThroughPlugin(): {
  name: string
  enforce: 'pre'
  transform(code: string, id: string): string | null
} {
  return {
    name: 'polymorph:reach-through',
    enforce: 'pre',
    transform(code, id) {
      const path = id.split('?')[0] ?? id
      if (!/[\\/](packages|@polymorph)[\\/]recipes[\\/]src[\\/].+\.css$/.test(path)) return null
      return reachThroughCss(code)
    },
  }
}
