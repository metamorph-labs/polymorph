/**
 * The nearest token to a raw value: what a red rule names when it reports a
 * colour, a length or a duration written by hand.
 *
 * A rule that only says "use a token" leaves the reader to search ~200 names.
 * This module compares the raw value with the values the theme emits and names
 * the closest one, so the report carries its own answer. Both plugins use it:
 * `token-values-only` for a recipe and `no-raw-styles` for application code.
 *
 * **Where the values come from.** The rules receive them as an option, a
 * `TokenValues`. In this repository it is built from the reference pairing
 * (`emitted.ts`, `tokenValues`); in a consumer, `polymorph add` writes it into
 * the lint fragments from the consumer's compiled theme. The rules never import
 * the engine, because `@polymorph/engine` is an optional peer of this package
 * and a lint config must load without it. With no values, the reports still
 * name the token family and the props that carry it, only not the step.
 *
 * **How colours are compared.** In OKLab, the Cartesian form of OKLCH, where
 * Euclidean distance tracks perceived difference (ΔE OK), plus the difference in
 * alpha. A translucent black is then nearer the scrim than the text colour of
 * the same hue. The values are one pairing in its default mode, so the answer
 * is the role whose value is nearest there. The role is what the code should
 * name, and every pairing repaints it.
 *
 * Plain JS, like its neighbours, because node loads `stylelint.config.js`
 * natively.
 */

/* -------------------------------------------------------------------------- */
/* Colours                                                                    */
/* -------------------------------------------------------------------------- */

/** sRGB channel (0–1) to linear light. */
const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

/** sRGB (0–1 each) to OKLab, from Björn Ottosson's reference matrices. */
function oklabOf(r, g, b) {
  const [lr, lg, lb] = [linear(r), linear(g), linear(b)]
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  }
}

/** HSL (h in degrees, s and l 0–1) to sRGB (0–1 each). */
function rgbOfHsl(h, s, l) {
  const k = (n) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
  return [f(0), f(8), f(4)]
}

/** `50%` -> 0.5 of `scale`, `0.5` -> 0.5, `128` -> 128. */
function number(text, scale) {
  const value = Number.parseFloat(text)
  if (Number.isNaN(value)) return null
  return text.endsWith('%') ? (value / 100) * scale : value
}

/** `120deg`, `0.5turn`, `1rad` or a bare number of degrees. */
function degrees(text) {
  const value = Number.parseFloat(text)
  if (Number.isNaN(value)) return null
  if (text.endsWith('turn')) return value * 360
  if (text.endsWith('grad')) return value * 0.9
  if (text.endsWith('rad')) return (value * 180) / Math.PI
  return value
}

/**
 * A CSS colour as OKLab plus alpha, or `null` for anything this does not read:
 * a named colour, `color-mix()`, `lab()`/`lch()`, a `var()` inside a function.
 * `#hex` in all four lengths, `rgb()`/`rgba()`, `hsl()`/`hsla()`, `oklab()` and
 * `oklch()` are read, in both the comma and the space syntax.
 *
 * @param {string} text
 * @returns {{ L: number, a: number, b: number, alpha: number } | null}
 */
export function parseColor(text) {
  const value = text.trim().toLowerCase()

  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(value)
  if (hex) {
    let digits = hex[1]
    if (digits.length <= 4) digits = [...digits].map((d) => d + d).join('')
    const channel = (i) => Number.parseInt(digits.slice(i, i + 2), 16) / 255
    return {
      ...oklabOf(channel(0), channel(2), channel(4)),
      alpha: digits.length === 8 ? channel(6) : 1,
    }
  }

  const call = /^(rgba?|hsla?|oklab|oklch)\(([^()]*)\)$/.exec(value)
  if (!call) return null
  const [, name, body] = call
  const parts = body.split(/[\s,/]+/).filter(Boolean)
  if (parts.length < 3 || parts.length > 4) return null
  const alpha = parts[3] === undefined ? 1 : number(parts[3], 1)
  if (alpha === null) return null

  if (name.startsWith('rgb')) {
    const channels = parts.slice(0, 3).map((part) => number(part, 255))
    if (channels.some((c) => c === null)) return null
    const [r, g, b] = channels.map((c) => Math.min(255, Math.max(0, c)) / 255)
    return { ...oklabOf(r, g, b), alpha }
  }

  if (name.startsWith('hsl')) {
    const h = degrees(parts[0])
    const s = number(parts[1].endsWith('%') ? parts[1] : `${parts[1]}%`, 1)
    const l = number(parts[2].endsWith('%') ? parts[2] : `${parts[2]}%`, 1)
    if (h === null || s === null || l === null) return null
    const [r, g, b] = rgbOfHsl(((h % 360) + 360) % 360, s, l)
    return { ...oklabOf(r, g, b), alpha }
  }

  const L = number(parts[0], 1)
  if (L === null) return null
  if (name === 'oklab') {
    const a = number(parts[1], 0.4)
    const b = number(parts[2], 0.4)
    return a === null || b === null ? null : { L, a, b, alpha }
  }
  const chroma = number(parts[1], 0.4)
  const hue = degrees(parts[2])
  if (chroma === null || hue === null) return null
  const radians = (hue * Math.PI) / 180
  return { L, a: chroma * Math.cos(radians), b: chroma * Math.sin(radians), alpha }
}

/** ΔE OK between two parsed colours, plus their difference in alpha. */
export function colorDistance(x, y) {
  return Math.hypot(x.L - y.L, x.a - y.a, x.b - y.b) + Math.abs(x.alpha - y.alpha)
}

/**
 * Past this distance no role is "near", and naming one would be a guess. A
 * validator that guesses sends the reader to the wrong place with confidence.
 * 0.15 is a visibly different colour of the same family: a hand-picked blue
 * still finds the accent role, and a magenta finds nothing rather than the
 * accent.
 */
const COLOUR_CEILING = 0.15

/** Two values this close are the same colour, so their roles tie. */
const COLOUR_TIE = 0.004

/**
 * Which roles a property paints, by the role's name. `color: #fff` wants a text
 * role, and `background: #fff` a background role, although both are white.
 *
 * The background family is named by prefix, not by suffix alone, because
 * `--pm-border-subtle` ends like `--pm-accent-subtle` and is a border colour.
 */
const ROLE_FAMILIES = [
  {
    property: /^(color|fill|stroke|caret-color|text-decoration-color|column-rule-color)$/,
    role: /^--pm-text-|-(text|contrast|underline)$/,
  },
  {
    property: /^background(-color|-image)?$/,
    role: /^--pm-bg-|^--pm-(accent|danger|warning|success|info|selection)-(bg|solid|subtle)(-hover|-active)?$/,
  },
  {
    property: /^(border|outline)(-[a-z]+)*$/,
    role: /^--pm-border-|-border$/,
  },
  { property: /^(box|text)-shadow$/, role: /-glow$|^--pm-bg-scrim$/ },
]

/** `backgroundColor` -> `background-color`, so a style object key reads like CSS. */
export function cssProperty(key) {
  return key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`).toLowerCase()
}

/**
 * The colour role nearest a raw colour, with any role whose value is the same
 * colour, or `null` when the colour cannot be read or nothing is near.
 *
 * @param {string} text the raw colour as written
 * @param {Record<string, string> | undefined} roles name -> emitted value
 * @param {string} [property] the CSS property it was written for, if known
 * @returns {{ names: string[], value: string } | null}
 */
export function nearestColor(text, roles, property) {
  const raw = parseColor(text)
  if (!raw || !roles) return null

  const family = property && ROLE_FAMILIES.find((entry) => entry.property.test(property))
  const all = Object.entries(roles)
  const fitting = family ? all.filter(([name]) => family.role.test(name)) : all

  const ranked = (fitting.length > 0 ? fitting : all)
    .map(([name, value]) => {
      const parsed = parseColor(value)
      return parsed && { name, value, gap: colorDistance(raw, parsed) }
    })
    .filter(Boolean)
    // Stable, so equal values keep the theme's role order.
    .sort((a, b) => a.gap - b.gap)

  const [best] = ranked
  if (!best || best.gap > COLOUR_CEILING) return null
  const names = ranked.filter((entry) => entry.gap - best.gap <= COLOUR_TIE).map((e) => e.name)
  return { names: names.slice(0, 2), value: best.value }
}

/* -------------------------------------------------------------------------- */
/* Lengths and durations                                                      */
/* -------------------------------------------------------------------------- */

/** The root font size `rem` is read against. Browsers default to it. */
const ROOT_PX = 16

/**
 * A length in px: `12px`, `0.75rem`, `1em` (taken as `rem`), or a bare number,
 * which is what React writes `px` as in a style object. `null` for anything
 * relative to a box (`%`, `vw`) or not a length.
 *
 * @param {string | number} value
 * @returns {number | null}
 */
export function lengthPx(value) {
  if (typeof value === 'number') return value
  const match = /^(-?\d*\.?\d+)(px|rem|em)?$/i.exec(value.trim())
  if (!match) return null
  const amount = Number.parseFloat(match[1])
  return match[2] && match[2].toLowerCase() !== 'px' ? amount * ROOT_PX : amount
}

/** `120ms` or `0.2s` in ms, or `null`. */
export function durationMs(value) {
  const match = /^(\d*\.?\d+)(ms|s)$/i.exec(value.trim())
  if (!match) return null
  const amount = Number.parseFloat(match[1])
  return match[2].toLowerCase() === 's' ? amount * 1000 : amount
}

/**
 * The token in `family` whose value is nearest `amount`, or `null` when none is
 * near. `read` turns each emitted value into the same unit; a token whose value
 * is a reference (`var(…)`) is skipped.
 *
 * "Near" is within a quarter of the amount, or 2 units for small amounts. A
 * 13px gap is step 4 (12px) mistyped; a 320px width is no space step at all,
 * and naming the largest one would be a guess.
 *
 * A negative amount is compared by its size, because every step is positive:
 * `-12px` is step 4 negated, and `negative` says so. Two steps equally near
 * (`10px` between 8px and 12px) are both named, the second as `also`, because
 * choosing one would be a guess.
 *
 * @param {number} amount
 * @param {Record<string, string> | undefined} family name -> emitted value
 * @param {(value: string) => number | null} read
 * @returns {import("./catalogue").NearestAmount | null}
 */
export function nearestAmount(amount, family, read) {
  if (!family) return null
  const size = Math.abs(amount)
  let best = null
  let also = null
  for (const [name, value] of Object.entries(family)) {
    const own = read(value)
    if (own === null) continue
    const gap = Math.abs(own - size)
    if (best === null || gap < best.gap - 1e-9) {
      best = { name, value, gap, own }
      also = null
    } else if (Math.abs(gap - best.gap) <= 1e-9 && own !== best.own && also === null) {
      also = { name, value }
    }
  }
  if (best === null || best.gap > Math.max(2, size / 4)) return null
  return {
    name: best.name,
    value: best.value,
    exact: best.gap < 0.5,
    ...(amount < 0 ? { negative: true } : {}),
    ...(also !== null && best.gap >= 0.5 ? { also } : {}),
  }
}

/**
 * Which length family a property draws from. A radius is a radius step and a
 * font size a type step, whatever their pixel value, and the `font` shorthand
 * carries a font size. Everything else that takes a length (padding, gap,
 * inset, margin) is space.
 *
 * @param {string | undefined} property
 * @returns {'radius' | 'text' | 'size' | 'space'}
 */
export function lengthFamily(property) {
  if (!property) return 'space'
  if (/radius/.test(property)) return 'radius'
  if (property === 'font-size' || property === 'font') return 'text'
  if (/^(min-|max-)?(width|height|block-size|inline-size)$/.test(property)) return 'size'
  return 'space'
}

/**
 * The nearest token for a raw length written for `property`.
 *
 * @param {string | number} raw
 * @param {import("./catalogue").TokenValues | undefined} values
 * @param {string} [property]
 */
export function nearestLength(raw, values, property) {
  const px = lengthPx(raw)
  if (px === null || !values) return null
  const family = lengthFamily(property)
  const candidates =
    family === 'size' ? { ...values.size, ...values.space } : (values[family] ?? values.space)
  return nearestAmount(px, candidates, lengthPx)
}

/** The nearest duration token for a raw `120ms`. */
export function nearestDuration(raw, values) {
  const ms = durationMs(raw)
  return ms === null || !values ? null : nearestAmount(ms, values.duration, durationMs)
}

/** `--pm-space-4` -> 4, the number a layout prop takes. */
export function spaceStep(name) {
  const match = /^--pm-space-(\d+)$/.exec(name)
  return match ? Number(match[1]) : null
}
