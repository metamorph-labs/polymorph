import {
  cssVarName,
  LAWFUL_GRADIENT_PAIRINGS,
  LAWFUL_PAIRINGS,
  PAIRING_EXEMPTIONS,
} from '@polymorph/theme'

import type { SwatchKind } from '../harness/Swatches'
import type { Registry } from '@polymorph/registry'
import { REGISTRY } from '../registry'

/**
 * What the tokens page says about each colour role, read from the contrast law and the registry.
 *
 * The contrast law (`LAWFUL_PAIRINGS`) lists every text and edge a role may draw on another, with
 * the reason it exists and the floor it is held to. The registry lists the tokens each component
 * reads. Together they say what a role is for without a sentence written per role: a text role's
 * reason, the surface it is checked on, and which components read it.
 */

const PAIRINGS: readonly {
  foreground: string
  background: string
  minLc: number
  minRatio?: number
  kind: 'text' | 'delineation' | 'focus'
  reason: string
}[] = [
  ...LAWFUL_PAIRINGS,
  ...LAWFUL_GRADIENT_PAIRINGS.map((pairing) => ({ ...pairing, kind: 'text' as const })),
]

/** Roles drawn over the page rather than as a surface: the scrim and the glows. */
const VEILS = /^(bg\.scrim|.*\.glow)$/
/** Roles that are edges. */
const LINES = /^(border\..*|.*\.border|accent\.underline)$/

export interface RolePaint {
  kind: SwatchKind
  ink?: string
  on?: string
}

/** How the swatch for a role is drawn, from the pairings the contrast law holds it to. */
export function paintOf(role: string): RolePaint {
  if (VEILS.test(role)) return { kind: 'veil' }
  const asSurface = PAIRINGS.find(
    (pairing) => pairing.background === role && pairing.kind === 'text',
  )
  if (LINES.test(role)) {
    const edge = PAIRINGS.find((pairing) => pairing.foreground === role)
    return { kind: 'line', on: edge?.background }
  }
  if (asSurface !== undefined) return { kind: 'fill', ink: asSurface.foreground }
  const asText = PAIRINGS.find((pairing) => pairing.foreground === role && pairing.kind === 'text')
  if (asText !== undefined) return { kind: 'ink', on: asText.background }
  if (role.startsWith('text.')) return { kind: 'ink' }
  return { kind: 'fill' }
}

const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * The role's purpose in a sentence, where the engine states one: the contrast law's reason for
 * a text or edge role, with the floor a text role is held to. A surface has no reason of its own
 * in the law, so it has none here, and the page says which components read it instead.
 */
export function purposeOf(role: string): string | undefined {
  if (PAIRING_EXEMPTIONS.some((exemption) => exemption.role === role)) {
    return 'Disabled text. It skips the contrast check on purpose, so it looks unavailable.'
  }
  if (VEILS.test(role) && role !== 'bg.scrim') {
    return 'A soft halo, for decoration only. It never stands in for the focus ring.'
  }
  const pairing = PAIRINGS.find((candidate) => candidate.foreground === role)
  if (pairing === undefined) return undefined
  if (pairing.kind === 'text') {
    return `${capitalise(pairing.reason)}. Contrast at least Lc ${pairing.minLc}.`
  }
  if (pairing.kind === 'focus') {
    return `${capitalise(pairing.reason)}. Contrast at least ${pairing.minRatio}:1.`
  }
  return `${capitalise(pairing.reason)}.`
}

/** The components whose recipes read a role's custom property. */
export function readersOf(role: string): string[] {
  const property = cssVarName(role)
  return REGISTRY.components
    .filter((component) => component.tokens.includes(property))
    .map((component) => component.name)
}

/** "Used by Tooltip and Badge", or "Used by 39 components". */
export function usageOf(role: string): string | undefined {
  const readers = readersOf(role)
  if (readers.length === 0) return undefined
  if (readers.length === 1) return `Used by ${readers[0]}.`
  if (readers.length <= 3) {
    return `Used by ${readers.slice(0, -1).join(', ')} and ${readers[readers.length - 1]}.`
  }
  return `Used by ${readers.length} components.`
}

/** A rem size as pixels at the browser's default 16px, for a label: `0.875rem` -> `14px`. */
export function pixels(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const rem = /^([\d.]+)rem$/.exec(value)
  if (rem === null) return value
  const px = Math.round(Number(rem[1]) * 16 * 10) / 10
  return `${px}px`
}

type TokenValues = Registry['theme']['systems'][number]['tokenValues']

/** A system's token values, by family, from the registry. */
export function tokenValuesOf(system: string): Partial<TokenValues> {
  return REGISTRY.theme.systems.find((entry) => entry.name === system)?.tokenValues ?? {}
}

/** Words joined as a sentence lists them: "a", "a and b", "a, b and c". */
function listed(words: readonly string[]): string {
  if (words.length <= 1) return words.join('')
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

/**
 * A system's fonts in words: "Geist for text, Fraunces for display titles and Geist Mono for
 * code". A system with no heading face of its own sets its headings in its text face, so
 * "text" says it and the heading role is not named again.
 */
export function fontsOf(system: string): string {
  const fonts = REGISTRY.theme.systems.find((entry) => entry.name === system)?.fonts ?? []
  const words: Record<string, string> = {
    body: 'text',
    heading: 'headings',
    display: 'display titles',
    mono: 'code',
  }
  const order = ['body', 'heading', 'display', 'mono']
  const slots = (roles: readonly string[]) =>
    roles
      .filter((slot) => !(slot === 'heading' && roles.includes('body')))
      .sort((a, b) => order.indexOf(a) - order.indexOf(b))
  const rank = (roles: readonly string[]) => Math.min(...roles.map((slot) => order.indexOf(slot)))
  const parts = [...fonts]
    .sort((a, b) => rank(a.roles) - rank(b.roles))
    .map(
      (font) =>
        `${font.family.replace(/ Variable$/, '')} for ${listed(slots(font.roles).map((slot) => words[slot] ?? slot))}`,
    )
  return listed(parts)
}
