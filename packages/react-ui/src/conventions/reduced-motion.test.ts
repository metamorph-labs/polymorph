import { describe, expect, it } from 'vitest'

/**
 * The reduced-motion projection law for the CSS side (`design/motion/motion.md`,
 * "Reduced-motion projections").
 *
 * The motion spec requires a projection for every pattern, and the engine
 * follows it: `packages/engine/src/motion/patterns.ts` projects every binding it
 * drives, and `presence.test.tsx` beside it tests that. But most of the
 * vocabulary's motion never reaches the engine. Most bindings are a
 * `transition` or an `@keyframes` in a stylesheet, because CSS transitions are
 * interruptible (`motion.module.css` explains this at the top of the file). A
 * projection that a stylesheet carries only by convention is easy for the next
 * stylesheet to omit.
 *
 * This law checks it. It reads every stylesheet the package ships and asks, for
 * every animation that moves or scales an element, whether a
 * `prefers-reduced-motion: reduce` rule removes the movement.
 *
 * The spec names two lawful answers:
 *
 *  - **The pattern keeps its time and loses its transform.** `scale-fade` and
 *    `slide-fade` project to the plain `fade` they decorate. Durations stay,
 *    because an opacity change is vestibular-safe. In CSS this is the same
 *    `@keyframes` redeclared inside the media query with the opacity and
 *    without the transform. Select, Checkbox, Radio, FormField and DataTable
 *    write it that way.
 *  - **The animation stops.** This is the spec's projection for the ambient
 *    loops, and the only correct one for movement with no opacity to fall back
 *    on. A drawer cannot fade in from off-screen, so it arrives instantly, as
 *    `design/components/dialog.md` specifies for a scrim and panel at `none`.
 *    In CSS this is `animation: none` or `transition: none` on every rule that
 *    starts the movement.
 *
 * Movement means `transform` and its individual properties (`translate`,
 * `scale`, `rotate`). The vocabulary uses both on purpose. Tooltip and Toast use
 * the longhand so that a static offset and an animated transform can share an
 * element without overwriting each other. A law that checked only the shorthand
 * would miss those two files.
 *
 * The law reads source, for the same reason `selectors.test.ts` does: a media
 * query the browser is not matching has no computed value to sample, so the
 * shipped text is the only evidence. The limit is that the law asks for the
 * same selector, not for proof of the cascade. So the natural way to satisfy it
 * is to write the projection at least as specific as the rule it projects.
 */

/**
 * Every recipe, keyed by its path in `@polymorph/recipes`
 * (`controls/select.module.css`). The glob is relative because Vite resolves
 * no package name in one.
 */
const SHEETS: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('../../../recipes/src/**/*.module.css', {
      query: '?raw',
      import: 'default',
      eager: true,
    }),
  ).map(([path, source]) => [path.replace('../../../recipes/src/', ''), source]),
)

/** The properties that move an element. `transform-origin` is not one. */
const MOVES = new Set(['transform', 'translate', 'scale', 'rotate'])

/** What a `transition` value has to name for the rule to animate movement. */
const TRAVELS = new Set([...MOVES, 'all'])

type Block = {
  /** The selector list, or the at-rule prelude. */
  prelude: string
  /** Everything between the braces, verbatim. */
  body: string
  /** Nested anywhere inside `prefers-reduced-motion: reduce`. */
  reduced: boolean
}

/** Comments often mention `transform`, so they are stripped. `text-transform` is not motion. */
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** The index of the `}` that closes the `{` at `open`. */
function closingBrace(css: string, open: number): number {
  let depth = 0
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    else if (css[i] === '}') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return css.length
}

/**
 * Flatten a stylesheet to its braced blocks, recording whether each block is
 * inside a reduced-motion query. The walk enters conditional at-rules, because
 * AppShell's drawer is under a width query and its projection must be allowed
 * there too. It does not enter `@keyframes`, because the law reads the
 * `from`/`to` blocks as its body.
 */
function blocksOf(css: string, reduced: boolean, into: Block[]): Block[] {
  let at = 0
  while (at < css.length) {
    const open = css.indexOf('{', at)
    if (open === -1) break
    const prelude = css.slice(at, open).trim()
    const close = closingBrace(css, open)
    const body = css.slice(open + 1, close)

    if (prelude.startsWith('@keyframes')) into.push({ prelude, body, reduced })
    else if (prelude.startsWith('@'))
      blocksOf(body, reduced || prelude.includes('prefers-reduced-motion'), into)
    else into.push({ prelude, body, reduced })

    at = close + 1
  }
  return into
}

/**
 * The declarations in a block body, as `[property, value]`. Brace-delimited
 * prefixes are dropped rather than parsed, so a `@keyframes` body reads as a
 * flat list of declarations, which is all this law needs.
 */
function declarationsOf(body: string): [string, string][] {
  return body.split(';').flatMap((part): [string, string][] => {
    const colon = part.indexOf(':')
    if (colon === -1) return []
    const property = part
      .slice(0, colon)
      .replace(/[\s\S]*[{}]/, '')
      .trim()
      .toLowerCase()
    if (!/^[a-z-]+$/.test(property)) return []
    return [
      [
        property,
        part
          .slice(colon + 1)
          .replace(/[{}]/g, ' ')
          .trim(),
      ],
    ]
  })
}

const tokensOf = (value: string) =>
  value
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(Boolean)

/** `@keyframes  name` -> `name`. */
const keyframeName = (prelude: string) => prelude.slice('@keyframes'.length).trim()

/**
 * A selector list as its members, normalised. Quoting and combinator spacing do
 * not change a selector's meaning, so comparing them would test formatting.
 */
const selectorsOf = (prelude: string) =>
  prelude
    .split(',')
    .map((selector) =>
      selector
        .replace(/['"]/g, '"')
        .replace(/\s*([>+~])\s*/g, ' $1 ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean)

type Sheet = {
  /** Keyframes that move, declared outside the media query: name -> body. */
  moving: Map<string, string>
  /** Keyframes redeclared inside the media query: name -> body. */
  projected: Map<string, string>
  /** Selector -> the keyframes it starts, outside the media query. */
  starts: Map<string, Set<string>>
  /** Selectors whose transition travels, outside the media query. */
  travelling: Set<string>
  /** Selectors the media query stops: `animation: none`. */
  stopped: Set<string>
  /** Selectors the media query stills: `transition: none`. */
  stilled: Set<string>
}

function read(css: string): Sheet {
  const sheet: Sheet = {
    moving: new Map(),
    projected: new Map(),
    starts: new Map(),
    travelling: new Set(),
    stopped: new Set(),
    stilled: new Set(),
  }
  const blocks = blocksOf(stripComments(css), false, [])

  for (const block of blocks) {
    if (block.prelude.startsWith('@keyframes')) {
      const name = keyframeName(block.prelude)
      if (block.reduced) sheet.projected.set(name, block.body)
      else if (declarationsOf(block.body).some(([property]) => MOVES.has(property)))
        sheet.moving.set(name, block.body)
      continue
    }

    for (const [property, value] of declarationsOf(block.body)) {
      const tokens = tokensOf(value)
      const selectors = selectorsOf(block.prelude)

      if (property === 'animation' || property === 'animation-name') {
        if (block.reduced && tokens.includes('none'))
          for (const s of selectors) sheet.stopped.add(s)
        else if (!block.reduced)
          for (const s of selectors)
            sheet.starts.set(s, new Set([...(sheet.starts.get(s) ?? []), ...tokens]))
      }

      if (property === 'transition' || property === 'transition-property') {
        // `none` stills a selector. So does a reduced-motion re-list with no
        // travelling property. The pressable members keep their colour fade
        // under reduced motion, as every non-pressable member does, so the
        // projection removes the movement but not the feedback.
        if (
          block.reduced &&
          (tokens.includes('none') || !tokens.some((token) => TRAVELS.has(token)))
        )
          for (const s of selectors) sheet.stilled.add(s)
        else if (!block.reduced && tokens.some((token) => TRAVELS.has(token)))
          for (const s of selectors) sheet.travelling.add(s)
      }
    }
  }
  return sheet
}

/**
 * Why a moving `@keyframes` is unlawful, or `null` if it is projected. It checks
 * the two lawful projections the motion spec names, in the spec's order.
 */
function keyframeFault(sheet: Sheet, name: string, body: string): string | null {
  const projection = sheet.projected.get(name)
  if (projection !== undefined) {
    const moves = declarationsOf(projection).filter(([property]) => MOVES.has(property))
    if (moves.length > 0)
      return `\`@keyframes ${name}\` is redeclared under reduced motion but still moves (\`${moves[0]?.[0]}\`)`
    const faded = declarationsOf(body).some(([property]) => property === 'opacity')
    const stillFades = declarationsOf(projection).some(([property]) => property === 'opacity')
    if (faded && !stillFades)
      return `\`@keyframes ${name}\` projects to nothing — the projection keeps the fade, only the transform goes`
    return null
  }

  const starters = [...sheet.starts]
    .filter(([, names]) => names.has(name))
    .map(([selector]) => selector)
  if (starters.length === 0)
    return `\`@keyframes ${name}\` moves, and no reduced-motion rule redeclares it or stops it`
  const running = starters.filter((selector) => !sheet.stopped.has(selector))
  if (running.length > 0)
    return `\`@keyframes ${name}\` moves and \`${running[0]}\` still runs it under reduced motion`
  return null
}

/** Every reason a stylesheet is unlawful, as sentences. */
function faultsIn(css: string): string[] {
  const sheet = read(css)
  const faults: string[] = []

  for (const [name, body] of sheet.moving) {
    const fault = keyframeFault(sheet, name, body)
    if (fault !== null) faults.push(fault)
  }
  for (const selector of sheet.travelling) {
    if (!sheet.stilled.has(selector))
      faults.push(`\`${selector}\` transitions a transform with no reduced-motion projection`)
  }
  return faults
}

describe('the law covers every stylesheet', () => {
  it('reads every recipe', () => {
    // A glob that resolved to nothing would make every assertion below vacuous.
    expect(Object.keys(SHEETS).length).toBeGreaterThan(20)
    for (const path of Object.keys(SHEETS)) expect(path.endsWith('.module.css'), path).toBe(true)
  })

  it('sees the animations it is meant to govern', () => {
    // The named five are CSS bindings known to carry a projection. If the
    // parser stops finding them, the law passes without checking anything.
    const seen = Object.entries(SHEETS)
      .filter(([, css]) => {
        const sheet = read(css)
        return sheet.moving.size > 0 || sheet.travelling.size > 0
      })
      .map(([path]) => path)

    expect(seen).toEqual(
      expect.arrayContaining([
        'controls/select.module.css',
        'controls/checkbox.module.css',
        'controls/switch.module.css',
        'controls/form-field.module.css',
        'structure/data-table.module.css',
      ]),
    )
  })
})

describe('every CSS animation that moves projects under reduced motion', () => {
  for (const [path, css] of Object.entries(SHEETS).sort()) {
    it(`${path} projects reduced motion as the motion spec requires`, () => {
      expect(faultsIn(css), `${path} breaks the projection law`).toEqual([])
    })
  }
})

describe('the law catches faults', () => {
  const scaleFade = `
    .panel[data-state='open'] { animation: panel-enter 200ms; }
    @keyframes panel-enter { from { opacity: 0; transform: scale(0.94); } }
  `

  it('catches a scale-fade that ships without its projection', () => {
    expect(faultsIn(scaleFade)).toHaveLength(1)
  })

  it('accepts the projection Select writes', () => {
    expect(
      faultsIn(`${scaleFade}
        @media (prefers-reduced-motion: reduce) {
          @keyframes panel-enter { from { opacity: 0; } }
        }`),
    ).toEqual([])
  })

  it('rejects a projection that keeps the transform', () => {
    expect(
      faultsIn(`${scaleFade}
        @media (prefers-reduced-motion: reduce) {
          @keyframes panel-enter { from { opacity: 0; transform: scale(0.99); } }
        }`),
    ).toHaveLength(1)
  })

  it('rejects a projection that drops the fade along with the transform', () => {
    // The projection keeps durations. The panel still fades; it only stops
    // growing.
    expect(
      faultsIn(`${scaleFade}
        @media (prefers-reduced-motion: reduce) {
          @keyframes panel-enter { from { visibility: hidden; } }
        }`),
    ).toHaveLength(1)
  })

  it('accepts an ambient loop stopped where it is started, as the motion spec requires', () => {
    const spin = `
      .spin { animation: pm-spin 900ms linear infinite; }
      @keyframes pm-spin { to { transform: rotate(360deg); } }
    `
    expect(faultsIn(spin)).toHaveLength(1)
    expect(
      faultsIn(`${spin}
        @media (prefers-reduced-motion: reduce) { .spin { animation: none; } }`),
    ).toEqual([])
  })

  it('catches a travelling transition, and the longhand that hides one', () => {
    expect(faultsIn(`.drawer { transition: transform 200ms; }`)).toHaveLength(1)
    expect(faultsIn(`.card { transition: translate 140ms; }`)).toHaveLength(1)
    expect(faultsIn(`.thing { transition: all 140ms; }`)).toHaveLength(1)
    expect(
      faultsIn(`.drawer { transition: transform 200ms; }
        @media (prefers-reduced-motion: reduce) { .drawer { transition: none; } }`),
    ).toEqual([])
  })

  it('requires the projection on the selector that moves, not a less specific one', () => {
    // A bare `.sidebar` does not outrank `.shell[data-drawer] .sidebar`, so a
    // projection written only for the first would leave the open state travelling.
    expect(
      faultsIn(`.shell[data-drawer] .sidebar { transition-property: transform; }
        @media (prefers-reduced-motion: reduce) { .sidebar { transition: none; } }`),
    ).toHaveLength(1)
  })

  it('leaves alone what does not move', () => {
    expect(faultsIn(`.badge { text-transform: uppercase; }`)).toEqual([])
    expect(faultsIn(`.skip { transform: translateY(-200%); }`)).toEqual([])
    expect(faultsIn(`.bubble { translate: 0 -8px; }`)).toEqual([])
    expect(faultsIn(`.item { transition: background-color 140ms, color 140ms; }`)).toEqual([])
    expect(
      faultsIn(`.clear { animation: fade 140ms; } @keyframes fade { from { opacity: 0; } }`),
    ).toEqual([])
  })

  it('is not fooled by prose about transforms', () => {
    expect(faultsIn(`/* the engine animates \`transform\` here */ .a { color: red; }`)).toEqual([])
  })
})
