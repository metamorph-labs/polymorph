/**
 * The CSS value law as a classifier. The Stylelint rules share it. It is plain
 * JS because node loads Stylelint's config natively.
 *
 * A value is lawful when every colour, length and duration in it comes from a
 * `var(--pm-*)` token. The exceptions are structural values that are not design
 * decisions: `0`, hairlines, `100%`, `auto`, viewport units, `9999px` for a
 * pill, and a unitless `line-height`.
 */

import valueParser from 'postcss-value-parser'

/**
 * Not design decisions: geometry and CSS-wide keywords.
 *
 * `200%` is allowed alongside `100%`. An overlay that sweeps across its host
 * must be wider than it, and the animation determines that width rather than a
 * design choice (motion.json specifies a 200%-wide sheen). Like `100%`, it is
 * relative, and no token could supply it.
 */
export const STRUCTURAL_LITERALS = new Set([
  '0',
  '0px',
  '1px',
  '2px',
  '100%',
  '200%',
  '9999px',
  'auto',
  'none',
  'transparent',
  'currentcolor',
  'inherit',
  'initial',
  'unset',
  'revert',
  'revert-layer',
])

/**
 * Custom properties the positioning engine measures at runtime: the anchor's
 * width, the space below it, the origin a panel grows from. They are geometry
 * the browser computes, like `100%` and `auto`, and no design decision can pass
 * through one because nobody writes their value.
 *
 * This exists because `design/components/select.md` requires the panel's
 * min-width to equal the trigger's measured width, and there is no other way to
 * express that. It is intentionally not a general exemption for any custom
 * property. The namespace is one library's published output, and
 * `packages/recipes/src/controls/select.module.css` is the only vocabulary file
 * that uses it.
 */
const MEASURED_PROPERTY = /^--radix-[a-z0-9-]+$/i

const VIEWPORT_UNIT = /^-?\d*\.?\d+(vw|vh|vi|vb|vmin|vmax|dv[whib]|sv[whib]|lv[whib])$/i
const LENGTH = /^-?\d*\.?\d+(px|rem|em|ch|ex|cap|ic|lh|rlh|pt|pc|in|cm|mm|q|%)$/i
const TIME = /^-?\d*\.?\d+m?s$/i
const HEX = /^#[0-9a-f]{3,8}$/i
const COLOR_FUNCTION = /^(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)$/i
const RECURSIVE_FUNCTION = /^(calc|min|max|clamp|round|mod|rem|env|repeat|fit-content|minmax)$/i

/**
 * Gradients must be inspected, because `background: linear-gradient(#fff, #000)`
 * contains two raw colours that a classifier skipping functions would miss.
 * Their stop positions are not spacing decisions, so inside a gradient only
 * colours are classified.
 */
const GRADIENT_FUNCTION = /^(repeating-)?(linear|radial|conic)-gradient$/i

// The full CSS named-colour set, not only the common ones, because any name
// missing from the list would pass the law.
const NAMED_COLORS = new Set(
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue
   blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk
   crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki
   darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen
   darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue
   dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite
   gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki
   lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan
   lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen
   lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen
   magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen
   mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream
   mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid
   palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum
   powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown
   seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen
   steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow
   yellowgreen`
    .split(/\s+/)
    .filter(Boolean),
)

/**
 * Properties whose values encode a design decision. Everything else (`display`,
 * `flex`, `overflow`) is layout mechanics and is not checked.
 *
 * `z-index` is included. A stacking level decides which layer of the product is
 * above which (announcements over surfaces over the frame), and raw numbers are
 * how two members end up disagreeing. The z scale is four tokens
 * (`--pm-z-raise/shell/overlay/toast`). Unlike the other families, the property
 * may use only its own tokens. `var(--pm-space-3)` on `z-index` is a category
 * error that the generic namespace check would not catch.
 */
const GOVERNED = [
  // colour
  /^color$/,
  /^background(-color|-image)?$/,
  /^border-color$/,
  /^border-(top|right|bottom|left|block|inline)(-(start|end))?-color$/,
  /^outline-color$/,
  /^(fill|stroke|caret-color|accent-color|text-decoration-color|column-rule-color)$/,
  // elevation
  /^(box|text)-shadow$/,
  // space and dimension
  /^(margin|padding)(-(top|right|bottom|left|block|inline)(-(start|end))?)?$/,
  /^(gap|row-gap|column-gap)$/,
  /^inset(-(block|inline))?(-(start|end))?$/,
  /^(top|right|bottom|left)$/,
  /^(min-|max-)?(width|height|block-size|inline-size)$/,
  // radius
  /^border-radius$/,
  /^border-(top|bottom)-(left|right)-radius$/,
  /^border-(start|end)-(start|end)-radius$/,
  // type
  /^font(-size|-family|-weight)?$/,
  /^(line-height|letter-spacing|word-spacing)$/,
  // motion
  /^transition(-duration|-timing-function|-delay|-property)?$/,
  /^animation(-duration|-timing-function|-delay)?$/,
  // shorthands that carry colour and width together
  /^border(-(top|right|bottom|left|block|inline))?$/,
  /^outline$/,
  // stacking
  /^z-index$/,
]

/** Bare numbers are a decision here, unlike a unitless `line-height`, which is structural. */
const NUMERIC_GOVERNED = /^font-weight$/

/** Bare numbers are a stacking layer here, and only z tokens may set one. */
const Z_GOVERNED = /^z-index$/

export function isGovernedProperty(property) {
  const name = property.toLowerCase().replace(/^\*/, '')
  return GOVERNED.some((pattern) => pattern.test(name))
}

/**
 * @typedef {{ text: string, reason: string, index: number }} RawValue
 */

/**
 * Every token in `value` that encodes a design decision without going through a
 * `--pm-*` token.
 *
 * @param {string} value
 * @param {string} property
 * @returns {RawValue[]}
 */
export function findRawValues(value, property) {
  /** @type {RawValue[]} */
  const offenders = []
  const numericGoverned = NUMERIC_GOVERNED.test(property.toLowerCase())
  const zGoverned = Z_GOVERNED.test(property.toLowerCase())

  /**
   * @param {import('postcss-value-parser').Node[]} nodes
   * @param {boolean} coloursOnly inside a gradient: stop positions are not values
   */
  const visit = (nodes, coloursOnly) => {
    for (const node of nodes) {
      if (node.type === 'function') {
        const name = node.value.toLowerCase()

        if (name === 'var') {
          const first = node.nodes[0]
          const referenced = first && first.type === 'word' ? first.value : ''
          if (!referenced.startsWith('--pm-') && !MEASURED_PROPERTY.test(referenced)) {
            offenders.push({
              text: valueParser.stringify(node),
              reason: 'only --pm-* custom properties may be referenced',
              index: node.sourceIndex,
            })
            continue
          }
          // A stacking level may only come from its own family. Any other
          // `--pm-*` on `z-index` puts a space step or a duration into the
          // stacking order, where no other family's value has a meaning.
          if (zGoverned && referenced.startsWith('--pm-') && !referenced.startsWith('--pm-z-')) {
            offenders.push({
              text: valueParser.stringify(node),
              reason: 'a stacking level must come from a z token',
              index: node.sourceIndex,
            })
            continue
          }
          // Keep walking, because a fallback argument can contain a raw value.
          visit(node.nodes.slice(1), coloursOnly)
          continue
        }

        if (COLOR_FUNCTION.test(name)) {
          offenders.push({
            text: valueParser.stringify(node),
            reason: 'a colour must come from a role token',
            index: node.sourceIndex,
          })
          continue
        }

        if (GRADIENT_FUNCTION.test(name)) {
          visit(node.nodes, true)
          continue
        }

        // calc() and similar functions are lawful over tokens. Any other
        // function (url(), cubic-bezier) is opaque, and its arguments are not values.
        if (RECURSIVE_FUNCTION.test(name)) visit(node.nodes, coloursOnly)
        continue
      }

      if (node.type !== 'word') continue

      const raw = node.value
      const lower = raw.toLowerCase()
      if (lower.startsWith('--')) continue
      if (STRUCTURAL_LITERALS.has(lower) || VIEWPORT_UNIT.test(raw)) continue

      let reason = ''
      if (HEX.test(raw) || NAMED_COLORS.has(lower)) reason = 'a colour must come from a role token'
      else if (coloursOnly) continue
      else if (LENGTH.test(raw)) reason = 'a length must come from a space, radius or size token'
      else if (TIME.test(raw)) reason = 'a duration must come from a motion token'
      else if (numericGoverned && /^-?\d*\.?\d+$/.test(raw))
        reason = 'a weight must come from a type token'
      else if (zGoverned && /^-?\d+$/.test(raw))
        reason = 'a stacking level must come from a z token'

      if (reason) offenders.push({ text: raw, reason, index: node.sourceIndex })
    }
  }

  visit(valueParser(value).nodes, false)
  return offenders
}
