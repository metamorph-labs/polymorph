/**
 * What the system card (`card.ts`) and the run-time card (`runtime-card.ts`)
 * share: the conventions stated once, the tiers' reading order and titles,
 * how a paragraph is wrapped, and how a member React draws through a function
 * is found.
 *
 * It imports nothing, so the run-time card reaches none of the registry
 * builder through it.
 */

/** Conventions the whole vocabulary shares, stated once and omitted from each row. */
export const CONVENTION_PROPS: ReadonlySet<string> = new Set([
  'children',
  'aria-label',
  'aria-labelledby',
  'aria-describedby',
  'aria-required',
])

// Content, then data, then pages. This is the reading order `galleries.ts` uses.
export const TIER_ORDER: readonly string[] = [
  'icon',
  'layout',
  'controls',
  'overlays',
  'structure',
  'charts',
  'ai',
  'archetypes',
]

export const TIER_TITLE: Readonly<Record<string, string>> = {
  icon: 'Iconography',
  layout: 'Layout primitives',
  controls: 'Controls',
  overlays: 'Overlays',
  structure: 'Structure',
  ai: 'AI — the conversation',
  archetypes: 'Page archetypes',
}

/**
 * A paragraph broken into lines of at most `width` characters, at spaces outside
 * a code span, so `polymorph init --framework` stays on one line.
 */
export function wrapped(paragraph: string, width = 84): string[] {
  const words = paragraph.match(/(?:`[^`]*`|[^\s`])+/g) ?? []
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    if (line !== '' && line.length + 1 + word.length > width) {
      lines.push(line)
      line = word
    } else line = line === '' ? word : `${line} ${word}`
  }
  if (line !== '') lines.push(line)
  return lines
}

/** An export as `optionsCarrier` reads it: its kind and the props it takes. */
interface CarrierExport {
  readonly kind: string
  readonly props: readonly { readonly name: string }[]
}

/**
 * The function export whose options are the member's own props (`toast()` for
 * Toast), or `undefined`. React has no component of the member's name then:
 * a call site calls the function, and the member's props are its options.
 */
export function optionsCarrier<Export extends CarrierExport>(component: {
  readonly props: readonly { readonly name: string }[]
  readonly exports: readonly Export[]
}): Export | undefined {
  const own = component.props.filter((prop) => !prop.name.includes('.'))
  const names = new Set(own.map((prop) => prop.name))
  return component.exports.find(
    (other) =>
      other.kind === 'function' &&
      other.props.length === own.length &&
      other.props.every((prop) => names.has(prop.name)),
  )
}
