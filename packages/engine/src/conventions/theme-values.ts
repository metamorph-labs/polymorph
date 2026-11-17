'use client'

import type {
  ChartRole,
  ColorRole,
  DurationRole,
  FontRole,
  Mode,
  RadiusAssignmentClass,
  RadiusStep,
  SpaceStep,
  TextStep,
} from '@polymorph/theme'
import { cssVarName, DATA_ATTRS, MORE_CONTRAST_QUERY } from '@polymorph/theme/runtime'

import { readDirection, watchDirection, type ReadingDirection } from './direction'
import type { ControlSize } from './size'

/**
 * The theme as data, for a component that is not styled by CSS.
 *
 * A member reads its values through the cascade: its recipe writes
 * `var(--pm-accent-bg)` and the browser resolves it. Another library's
 * component often cannot. A map takes its colours in a style object, a canvas
 * grid in a theme parameter, a code editor in a theme it registers by name.
 * `readThemeValues` gives such a component the values an element resolves
 * to, as the strings and numbers a JavaScript API takes, and `watchTheme`
 * says when to read them again.
 *
 * The values are read from the document and not derived. The pairing is
 * already on the page as custom properties, so reading them costs no theme
 * engine in the bundle, and it is the only reading that sees a scope: inside
 * a `<DensityScope>`, a `<ToneScope>` or a nested pairing an element resolves
 * different values from the root, and a derivation from the pairing's
 * documents would not know.
 *
 * A token no reader below covers (a shadow, a z-index step, an easing) is read
 * with `value`, as the text the cascade resolved.
 */

/** A type step as numbers: sizes in pixels, the line height as the ratio the token holds. */
export interface ThemeTextStyle {
  family: string
  size: number
  lineHeight: number
  weight: number
  /** Letter spacing in pixels at this step's size. */
  tracking: number
}

/** Red, green and blue from 0 to 255, and alpha from 0 to 1. */
export type ColorChannels = readonly [red: number, green: number, blue: number, alpha: number]

export interface ThemeValues {
  /**
   * False where no pairing's tokens reach the element: on a server render, and
   * in a document with no theme installed. Every colour is then the empty
   * string and every number 0.
   */
  readonly themed: boolean
  /** The colour mode the element is drawn in. Inside an inverse tone scope it is the opposite mode. */
  readonly mode: Mode
  /** The document's reading direction (`readDirection`). */
  readonly direction: ReadingDirection
  /** A colour role as `#rrggbb`, or as `rgba(r, g, b, a)` when it is translucent. */
  color(role: ColorRole | ChartRole): string
  /** The same colour as numbers, for an API that takes channels. */
  channels(role: ColorRole | ChartRole): ColorChannels
  /** A space step in pixels, at the density the element is in. */
  space(step: SpaceStep): number
  /** A radius in pixels: a step, or the step a class of member wears (`control`, `surface`, `detail`). */
  radius(step: RadiusStep | RadiusAssignmentClass): number
  /** A font slot's family list, as CSS writes it. */
  font(role: FontRole): string
  /** A type step. */
  text(step: TextStep): ThemeTextStyle
  /** A control's height in pixels, at the density the element is in. */
  controlHeight(size: ControlSize): number
  /** A duration in milliseconds, already scaled by the motion temperament. */
  duration(role: DurationRole): number
  /** Any other token, as the text the cascade resolved: `value('--pm-shadow-raised')`. */
  value(name: `--pm-${string}`): string
}

/** Where the values are read: an element, or a function that finds it when a value is first read. */
export type ThemeValuesSource = Element | (() => Element | null | undefined) | null | undefined

const TRANSPARENT: ColorChannels = [0, 0, 0, 0]

const clampByte = (value: number) => Math.min(255, Math.max(0, Math.round(value)))
const clampUnit = (value: number) => Math.min(1, Math.max(0, value))

/** `50%` of `scale`, or the number itself. */
function component(text: string, scale: number): number {
  const value = Number.parseFloat(text)
  if (Number.isNaN(value)) return Number.NaN
  return text.trim().endsWith('%') ? (value / 100) * scale : value
}

/**
 * A colour as channels, from the two forms the emitter writes (`#rrggbb`,
 * `rgb(r g b / a)`) and the forms a browser serialises a computed colour in
 * (`rgb(r, g, b)`, `rgba(r, g, b, a)`, `color(srgb r g b / a)`). `null` for
 * anything else.
 */
export function parseColor(text: string): ColorChannels | null {
  const value = text.trim().toLowerCase()
  const hex = /^#([0-9a-f]{3,8})$/.exec(value)?.[1]
  if (hex !== undefined && [3, 4, 6, 8].includes(hex.length)) {
    const wide = hex.length <= 4 ? [...hex].map((digit) => digit + digit).join('') : hex
    const byte = (at: number) => Number.parseInt(wide.slice(at, at + 2), 16)
    return [byte(0), byte(2), byte(4), wide.length === 8 ? byte(6) / 255 : 1]
  }
  const rgb = /^rgba?\(([^)]*)\)$/.exec(value)?.[1]
  if (rgb !== undefined) {
    const parts = rgb.split(/[\s,/]+/).filter((part) => part !== '')
    if (parts.length !== 3 && parts.length !== 4) return null
    const [red, green, blue] = parts.slice(0, 3).map((part) => component(part, 255))
    const alpha = parts[3] === undefined ? 1 : component(parts[3], 1)
    if ([red, green, blue, alpha].some((part) => part === undefined || Number.isNaN(part))) {
      return null
    }
    return [
      clampByte(red as number),
      clampByte(green as number),
      clampByte(blue as number),
      clampUnit(alpha),
    ]
  }
  const srgb = /^color\(srgb\s+([^)]*)\)$/.exec(value)?.[1]
  if (srgb !== undefined) {
    const parts = srgb.split(/[\s/]+/).filter((part) => part !== '')
    if (parts.length !== 3 && parts.length !== 4) return null
    const [red, green, blue] = parts.slice(0, 3).map((part) => component(part, 1))
    const alpha = parts[3] === undefined ? 1 : component(parts[3], 1)
    if ([red, green, blue, alpha].some((part) => part === undefined || Number.isNaN(part))) {
      return null
    }
    return [
      clampByte((red as number) * 255),
      clampByte((green as number) * 255),
      clampByte((blue as number) * 255),
      clampUnit(alpha),
    ]
  }
  return null
}

/** `#rrggbb` for an opaque colour, `rgba(r, g, b, a)` for a translucent one. */
export function formatColor([red, green, blue, alpha]: ColorChannels): string {
  if (alpha >= 1) {
    return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
  }
  return `rgba(${red}, ${green}, ${blue}, ${Number(alpha.toFixed(3))})`
}

/**
 * A colour the reader above does not parse, resolved by the browser: the
 * value is set as a probe's `color` and read back computed, which every
 * engine serialises in a form `parseColor` reads for an sRGB colour. The
 * emitter writes none today. A palette document that gained another colour
 * space would reach here.
 */
function resolveColor(text: string, within: Element): ColorChannels | null {
  if (text === '') return null
  const probe = document.createElement('span')
  probe.style.color = text
  within.append(probe)
  try {
    return parseColor(getComputedStyle(probe).color)
  } finally {
    probe.remove()
  }
}

/** The mode an element is drawn in: its nearest mode scope, turned over by a nearer inverse tone. */
function modeOf(element: Element): Mode {
  const scope = element.closest(`[${DATA_ATTRS.mode}]`)
  const mode: Mode = scope?.getAttribute(DATA_ATTRS.mode) === 'dark' ? 'dark' : 'light'
  const inverse = element.closest(`[${DATA_ATTRS.tone}="inverse"]`)
  // An inversion applies inside the mode scope it is in, so the nearer of the two decides.
  const inverted =
    inverse !== null && scope !== null && scope !== inverse && scope.contains(inverse)
  if (!inverted) return mode
  return mode === 'dark' ? 'light' : 'dark'
}

/**
 * The reading where no pairing reaches: every colour the empty string and
 * every number 0. A server render reads it, because it has no document. A
 * foundation also returns it while its framework hydrates the server's markup,
 * so the first render in the browser is the one the server made, and gives the
 * document's reading after.
 */
export const UNTHEMED_VALUES: ThemeValues = {
  themed: false,
  mode: 'light',
  direction: 'ltr',
  color: () => '',
  channels: () => TRANSPARENT,
  space: () => 0,
  radius: () => 0,
  font: () => '',
  text: () => ({ family: '', size: 0, lineHeight: 0, weight: 0, tracking: 0 }),
  controlHeight: () => 0,
  duration: () => 0,
  value: () => '',
}

/**
 * The theme's values as `source` resolves them now. `source` is an element,
 * or a function that returns one, called when a value is read: a component
 * passes `() => ref.current`, and a value read in an effect is read from the
 * mounted element. Without a source, or while it gives none, the values are
 * the document root's. They are the root's for an element that is not in the
 * document too: the browser resolves no token there, and a variable can hold
 * an element after its framework has removed it.
 *
 * The result is a snapshot. It reads each token, the mode and the direction
 * once and keeps the answer, so the mode it gives is the one its colours were
 * read in. It does not follow a later change: `watchTheme` says when to take
 * another.
 */
export function readThemeValues(source?: ThemeValuesSource): ThemeValues {
  if (typeof document === 'undefined') return UNTHEMED_VALUES

  const element = (): Element => {
    const found = typeof source === 'function' ? source() : source
    return found?.isConnected ? found : document.documentElement
  }

  let readFrom: Element | null = null
  let styles: CSSStyleDeclaration | null = null
  let mode: Mode | null = null
  let direction: ReadingDirection | null = null
  const texts = new Map<string, string>()
  const colors = new Map<string, ColorChannels>()

  /**
   * The element the answers kept below belong to. A function source can give
   * the root before its element mounts and the element after, an element can
   * leave the document, and what was read from one says nothing about the
   * other.
   */
  const reading = (): Element => {
    const current = element()
    if (current !== readFrom) {
      readFrom = current
      styles = getComputedStyle(current)
      mode = null
      direction = null
      texts.clear()
      colors.clear()
    }
    return current
  }

  const value = (name: string): string => {
    reading()
    const known = texts.get(name)
    if (known !== undefined) return known
    const text = (styles as CSSStyleDeclaration).getPropertyValue(name).trim()
    texts.set(name, text)
    return text
  }

  const rootFontSize = () =>
    Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16

  /** `12px`, `0.875rem` or `0` as pixels. 0 when the token is absent. */
  const pixels = (name: string): number => {
    const text = value(name)
    const amount = Number.parseFloat(text)
    if (Number.isNaN(amount)) return 0
    return text.endsWith('rem') ? amount * rootFontSize() : amount
  }

  const number = (name: string): number => Number.parseFloat(value(name)) || 0

  const channels = (role: ColorRole | ChartRole): ColorChannels => {
    const name = cssVarName(role)
    const text = value(name)
    const known = colors.get(name)
    if (known !== undefined) return known
    const read = parseColor(text) ?? resolveColor(text, element()) ?? TRANSPARENT
    colors.set(name, read)
    return read
  }

  return {
    get themed() {
      return value(cssVarName('space.1')) !== ''
    },
    get mode() {
      const from = reading()
      return (mode ??= modeOf(from))
    },
    get direction() {
      reading()
      return (direction ??= readDirection())
    },
    color: (role) => (value(cssVarName(role)) === '' ? '' : formatColor(channels(role))),
    channels,
    space: (step) => pixels(cssVarName(`space.${step}`)),
    radius: (step) => pixels(cssVarName(`radius.${step}`)),
    font: (role) => value(cssVarName(`font.${role}`)),
    text: (step) => {
      const size = pixels(cssVarName(`text.${step}.size`))
      return {
        family: value(cssVarName(`text.${step}.family`)),
        size,
        lineHeight: number(cssVarName(`text.${step}.lineHeight`)),
        weight: number(cssVarName(`text.${step}.weight`)),
        // The token is in `em`, a share of this step's size.
        tracking: number(cssVarName(`text.${step}.tracking`)) * size,
      }
    },
    controlHeight: (size) => pixels(cssVarName(`controlHeight.${size}`)),
    duration: (role) => {
      const text = value(cssVarName(`motion.duration.${role}`))
      const amount = Number.parseFloat(text)
      if (Number.isNaN(amount)) return 0
      return text.endsWith('ms') ? amount : amount * 1000
    },
    value,
  }
}

/** Every attribute a pairing, a mode, a density, a tone or a motion temperament is worn as. */
const THEME_ATTRIBUTES: string[] = Object.values(DATA_ATTRS)

/**
 * What the theme's sheet tells apart in an attribute's value. A reading can
 * differ only when this does.
 *
 * A member writes `data-tone` and `data-mode` for a variant of its own: a
 * Text's `danger`, a BarChart's `stacked`. No selector of the sheet matches
 * those values, so a change from one to another leaves every reading as it
 * was. The sheet matches a tone only as `inverse`. It matches a mode as
 * `light` and as `dark`, and it declares the tokens that refer to a mode's
 * colours again on an element that has the attribute with any value, so the
 * attribute's presence counts too.
 *
 * Every value of the other attributes counts. A system and a palette are
 * names, and only a scope or the runtime writes a density or a motion
 * temperament.
 */
function matched(attribute: string, value: string | null): string | null {
  if (attribute === DATA_ATTRS.tone) return value === 'inverse' ? value : null
  if (attribute === DATA_ATTRS.mode && value !== null) {
    return value === 'light' || value === 'dark' ? value : ''
  }
  return value
}

/**
 * Whether a record is a change the sheet can see. The record holds the value
 * before the change and the element holds the value now. Several changes to
 * one attribute arrive as several records, and each is compared with the
 * value now: if any two values in the run differ to the sheet, one of the
 * earlier ones differs from the last.
 */
function changesTheme(record: MutationRecord): boolean {
  const name = record.attributeName
  if (name === null || !(record.target instanceof Element)) return false
  return matched(name, record.oldValue) !== matched(name, record.target.getAttribute(name))
}

/** The eager sheet's id and a lazily appended pairing's attribute (`installThemeCSS`, `appendThemeCSS`). */
const isThemeSheet = (node: Node | null): boolean =>
  node instanceof HTMLStyleElement &&
  (node.id === 'pm-themes' || node.hasAttribute('data-pm-pairing'))

/**
 * Whether a record is a theme sheet arriving, leaving or taking new text.
 * `installThemeCSS` replaces the text of the sheet that is already there,
 * which changes the sheet's own children and not those of `<head>`.
 */
function changesSheet(record: MutationRecord): boolean {
  // The sheet's text node was edited in place.
  if (record.type === 'characterData') return isThemeSheet(record.target.parentNode)
  return (
    isThemeSheet(record.target) ||
    // `Array.from` reads a `NodeList` where the DOM's iterable types are not loaded.
    Array.from(record.addedNodes).some(isThemeSheet) ||
    Array.from(record.removedNodes).some(isThemeSheet)
  )
}

const listeners = new Set<() => void>()
let release: (() => void) | null = null
let version = 0

/**
 * A number that grows each time a reading may have changed: with each change
 * `watchTheme` reports, and when `watchTheme` takes its first listener. No
 * observer runs while it has none, so a change made then is not seen, and a
 * reading from before it is not known to be current.
 *
 * A framework's store reads the number as its snapshot, so a component takes a
 * new reading only when it has grown. Only a caller that holds a listener can
 * rely on it. A caller that holds none takes a new reading each time.
 */
export function themeVersion(): number {
  return version
}

/**
 * Calls `listener` each time the values an element resolves may have changed,
 * until the function it returns is called. That is a change of system,
 * palette, mode, density or motion temperament on any element (a scope can be
 * anywhere above the reader), an element entering or leaving an inverse tone,
 * a pairing's sheet arriving, leaving or being installed again, the reader's
 * request for more contrast, and the document's reading direction. A tone or
 * a mode that a member writes for its own variant is not one (`matched`). The
 * listener takes a new `readThemeValues`. Every listener shares one observer,
 * which is released with the last of them.
 */
export function watchTheme(listener: () => void): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {}
  listeners.add(listener)
  if (release === null) {
    // Nothing watched until now, so a reading taken before this may be out of date.
    version += 1
    const notify = () => {
      version += 1
      for (const each of [...listeners]) each()
    }
    const attributes = new MutationObserver((records) => {
      if (records.some(changesTheme)) notify()
    })
    attributes.observe(document.documentElement, {
      attributes: true,
      attributeFilter: THEME_ATTRIBUTES,
      attributeOldValue: true,
      subtree: true,
    })
    const sheets = new MutationObserver((records) => {
      if (records.some(changesSheet)) notify()
    })
    sheets.observe(document.head, { childList: true, characterData: true, subtree: true })
    const contrast = typeof matchMedia === 'undefined' ? null : matchMedia(MORE_CONTRAST_QUERY)
    contrast?.addEventListener('change', notify)
    const releaseDirection = watchDirection(notify)
    release = () => {
      attributes.disconnect()
      sheets.disconnect()
      contrast?.removeEventListener('change', notify)
      releaseDirection()
    }
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size > 0) return
    release?.()
    release = null
  }
}
