/**
 * The TypeScript counterpart to the CSS value law. A design value written as a
 * string in application code is the same violation as one in a stylesheet, and
 * drifts the same way.
 */

export interface RawValueHit {
  /** The value as written: `#4087de`, `12px`, `rgba(0 0 0 / 0.4)`. */
  text: string
  /** Which family it should have come from, so the report can name the nearest token. */
  kind: 'colour' | 'length'
  reason: string
}

/**
 * Hex must be a whole token (`#fff`, `#1a2b3c`), so `'#root'` and `'#/route'`
 * stay legal. Lengths must not follow a word character, which rules out false
 * positives like `'noreply@2px'`.
 */
const PATTERNS: { pattern: RegExp; kind: RawValueHit['kind']; reason: string }[] = [
  {
    pattern: /(?:^|[^\w#])(#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8}))(?![0-9a-z])/i,
    kind: 'colour',
    reason: 'a colour must come from a role token',
  },
  {
    pattern: /(?:^|[^\w.$-])(-?\d+(?:\.\d+)?(?:px|rem|em))(?![\w-])/i,
    kind: 'length',
    reason: 'a length must come from a space, radius or size token',
  },
  {
    pattern: /\b((?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\s*\()/i,
    kind: 'colour',
    reason: 'a colour must come from a role token',
  },
]

/**
 * A colour function written out to its closing parenthesis, so the report can
 * quote it whole and compare it with the theme's values. A function with a
 * nested call or an interpolation inside it (`rgb(${r} …)`) is quoted as far
 * as its opening.
 */
function wholeCall(text: string, start: number, opening: string): string {
  const close = text.indexOf(')', start)
  const inner = close === -1 ? '' : text.slice(start + opening.length, close)
  return close === -1 || /[(${}]/.test(inner) ? opening : text.slice(start, close + 1)
}

/** The first colour in `text`, or `undefined` if it has none. */
export function findRawColour(text: string): RawValueHit | undefined {
  return findRawValue(text, 'colour')
}

/** The first design value in `text`, or `undefined` if it is clean. */
export function findRawValue(text: string, only?: RawValueHit['kind']): RawValueHit | undefined {
  for (const { pattern, kind, reason } of PATTERNS) {
    if (only !== undefined && kind !== only) continue
    const match = pattern.exec(text)
    const found = match?.[1]
    if (!match || !found) continue
    const start = match.index + match[0].length - found.length
    return { text: found.endsWith('(') ? wholeCall(text, start, found) : found, kind, reason }
  }
  return undefined
}

/**
 * The functions that make a colour and that `PATTERNS` does not name. One is
 * refused in any property of a style a boundary lifts, a custom property
 * included.
 */
const COLOUR_FUNCTIONS = new Set([
  'color',
  'color-mix',
  'light-dark',
  'contrast-color',
  'device-cmyk',
])

/**
 * The words a colour property takes that are no colour of the file's own.
 * `invert` is `outline-color`'s, and paints the inverse of what is behind it.
 */
const COLOUR_KEYWORDS = new Set(
  (
    'transparent currentcolor inherit initial unset revert revert-layer none auto important ' +
    'context-fill context-stroke invert'
  ).split(' '),
)

/**
 * The other words of each grammar a value that carries a colour is written
 * in. They are read as one list, because a word of one grammar written in
 * another property paints nothing: none of them names a colour.
 *
 * A word that is missing here is reported as a colour, and a report inside a
 * boundary has no answer but a zone. So each shorthand's grammar is listed
 * whole, and `raw-values.test.ts` holds a lawful value for every word here.
 */
const CARRIER_GRAMMAR = {
  // A border's, an outline's, a column rule's and a text stroke's width and style.
  line: 'thin medium thick hidden dotted dashed solid double groove ridge inset outset',
  // A text decoration's line, style and thickness, and a text emphasis's mark.
  decoration:
    'underline overline line-through blink spelling-error grammar-error wavy from-font ' +
    'filled open dot circle double-circle triangle sesame',
  // A background's repeat, attachment, box, size and position.
  background:
    'repeat repeat-x repeat-y no-repeat space round scroll fixed local border-box padding-box ' +
    'content-box border-area text cover contain top right bottom left center start end ' +
    'x-start x-end y-start y-end block-start block-end inline-start inline-end',
  // A border image's slice and repeat, and a caret's animation and shape.
  image: 'fill stretch manual bar block underscore',
  // A gradient's direction, shape, extent and interpolation.
  gradient:
    'to at from in ellipse closest-side closest-corner farthest-side farthest-corner srgb ' +
    'srgb-linear display-p3 display-p3-linear a98-rgb prophoto-rgb rec2020 rec2100-pq ' +
    'rec2100-hlg rec2100-linear xyz xyz-d50 xyz-d65 hsl hwb lab lch oklab oklch shorter longer ' +
    'increasing decreasing hue',
  // A calculation's constants, and the strategies `round()` takes.
  maths: 'infinity -infinity nan pi e up down nearest to-zero',
}

const CARRIER_WORDS = new Set(Object.values(CARRIER_GRAMMAR).flatMap((words) => words.split(' ')))

/**
 * Every word the check takes for no colour, in a colour's own property or in
 * a shorthand. Exported so the tests can hold a lawful value for each and can
 * check that none is a colour's name.
 */
export const COLOURLESS_WORDS: ReadonlySet<string> = new Set([...COLOUR_KEYWORDS, ...CARRIER_WORDS])

/** The functions a value that carries a colour may call, none of which makes one. */
const PLAIN_FUNCTIONS = new Set(
  (
    'var env attr url calc min max clamp round mod rem abs sign sin cos tan asin acos atan atan2 ' +
    'pow sqrt hypot log exp linear-gradient radial-gradient conic-gradient ' +
    'repeating-linear-gradient repeating-radial-gradient repeating-conic-gradient image ' +
    'image-set type cross-fade element paint blur brightness contrast drop-shadow grayscale ' +
    'hue-rotate invert opacity saturate sepia'
  ).split(' '),
)

/** The shorthands that carry a colour among other values. A border's are matched by name. */
const CARRIERS = new Set(
  (
    'background background-image border-image border-image-source list-style-image outline ' +
    'column-rule text-decoration text-emphasis text-stroke box-shadow text-shadow filter ' +
    'backdrop-filter caret'
  ).split(' '),
)

/**
 * How a property takes a colour: as its whole value (`color`, `fill`,
 * `border-color`, a custom property named for colour), among other values
 * (`border`, `background`, `box-shadow`), or not at all (`null`).
 * `color-scheme` and `print-color-adjust` name no colour.
 *
 * A custom property is named for colour when its name ends in `color`
 * (`--rdg-background-color`). One with `color` inside its name may hold a
 * mode or a scheme (`--x-color-mode: dark`), whose words no list can hold, so
 * it is not read. A mask is not read either: its image paints no colour, and
 * only its alpha or its luminance is used.
 */
function colourKind(property: string): 'colour' | 'carrier' | null {
  const name = property.toLowerCase().replace(/^-(?:webkit|moz|ms|o)-/, '')
  if (name.startsWith('--')) return /-colou?r$/.test(name) ? 'colour' : null
  if (/(^|-)colou?r$/.test(name) || name === 'fill' || name === 'stroke') return 'colour'
  if (CARRIERS.has(name)) return 'carrier'
  return /^border(-(top|right|bottom|left|block|inline)(-(start|end))?)?$/.test(name)
    ? 'carrier'
    : null
}

/**
 * The colour a declaration writes that no pattern above names, or `null`.
 *
 * `PATTERNS` lists the colour syntaxes it knows. A named colour (`red`), a
 * system colour (`ButtonText`), `color-mix()` and any syntax CSS adds later
 * are on no such list, and a list of them would be out of date when it was
 * written. So this reads the other way. A property that takes a colour takes
 * only what is known to be none of the file's own: a custom property read
 * (`var(--pm-bg-subtle)`), a number, a keyword that names no colour
 * (`transparent`, `currentColor`, `inherit`, `none`), and for a shorthand the
 * other words and functions its grammar has. Any other word or function is
 * refused, whatever colour syntax it is.
 *
 * What it does not read: a custom property not named for colour
 * (`--grid-accent: white`), and a value that reaches the style through a
 * variable.
 */
export function refusedColour(property: string, value: string): string | null {
  const kind = colourKind(property)
  // Quoted text and a URL hold words that are not the value's own. So do the
  // name `attr()`, `env()` and `paint()` take first, and a type in angle
  // brackets (`type(<color>)`).
  const text = value
    .replace(/(["'])(?:\\.|(?!\1)[^\\])*\1/g, '""')
    .replace(/\burl\([^)]*\)/gi, 'url()')
    .replace(/\b(attr|env|paint)\(\s*[\w-]+/gi, '$1(')
    .replace(/<[a-z-]+>/gi, '')
  // A word, with the parenthesis that makes it a call. A unit (`1px`), a hex
  // digit run and a custom property's own name are not words.
  for (const match of text.matchAll(/(?<![\w.#%@-])(-{0,2}[a-z_][\w-]*)(\s*\()?/gi)) {
    const written = match[1] as string
    if (written.startsWith('--')) continue
    const name = written.toLowerCase().replace(/^-(?:webkit|moz|ms|o)-/, '')
    const call = match[2] !== undefined
    if (call && COLOUR_FUNCTIONS.has(name)) return wholeCall(text, match.index, `${written}(`)
    if (kind === null) continue
    const plain = call
      ? PLAIN_FUNCTIONS.has(name)
      : COLOUR_KEYWORDS.has(name) || (kind === 'carrier' && CARRIER_WORDS.has(name))
    if (!plain) return call ? `${written}(` : written
  }
  return null
}
