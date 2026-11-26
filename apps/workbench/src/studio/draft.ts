import {
  appendThemeCSS,
  auditGlassPairings,
  auditGradientPairings,
  auditPairings,
  auditCoherence,
  coherenceMessage,
  composeTheme,
  DATA_ATTRS,
  emitThemeCSS,
  FONT_ROLES,
  fontSlot,
  GLASS_SURFACE_MIX,
  gradientPairingId,
  MODES,
  paletteNameSchema,
  paletteSchema,
  pairingId,
  pairingMeasure,
  resolveTheme,
  systemNameSchema,
  systemSchema,
  type Palette,
  type ResolvedTheme,
  type System,
} from '@polymorph/engine'

import { auditExceptions } from '@polymorph/registry/exceptions'

import { DRAFT_PAIR, DRAFT_PALETTE, DRAFT_SYSTEM, previewNames } from '../draft-boot'
import { REGISTRY } from '../registry'
import { PALETTES, SYSTEMS } from '../themes'

/**
 * The studio's draft: one system and one palette, held in memory and derived through the real
 * engine on every keystroke.
 *
 * This file holds the logic. The page holds the composition. Two parts of the logic are
 * guarantees rather than helpers: which pairing a draft is applied under while it is edited, and
 * what the laws report about it. Both are kept here so they can be read together.
 */

/**
 * The reserved pairing names are defined in `../draft-boot`, because boot installs a persisted
 * draft before this chunk loads. They are re-exported here because the studio's files use them as
 * draft names, not as boot internals.
 */
export { DRAFT_PAIR, DRAFT_PALETTE, DRAFT_SYSTEM } from '../draft-boot'

/**
 * The selector every draft block starts with, because `emitThemeCSS` always writes the pair
 * selector first. It is built from `DATA_ATTRS` rather than typed out, so the pairing scope format
 * still comes from the engine.
 */
const DRAFT_SELECTOR = `[${DATA_ATTRS.system}="${DRAFT_SYSTEM}"][${DATA_ATTRS.palette}="${DRAFT_PALETTE}"]`

export interface Draft {
  system: System
  palette: Palette
}

/**
 * The structural shape of a zod schema issue. It is declared here so this file can format an
 * issue without importing zod for the type.
 */
interface SchemaIssue {
  readonly path: readonly PropertyKey[]
  readonly message: string
}

/**
 * The studio's single refusal format: **`path: message`**, using the schema's message.
 *
 * Every entry point uses it: the law panel while a draft is edited, the paste box, and the notice
 * shown when the current schema refuses a stored draft. Printing a `ZodError` directly is not an
 * option, because its `error.message` is the issue array as JSON, with brackets and
 * `expected`/`received` keys. That reads like a stack trace to a designer.
 *
 * `half` prefixes the path when the subject is a whole document rather than one system. So
 * `accentHue` becomes `palette.accentHue`, and a missing palette becomes `palette`.
 */
function issueLine(issue: SchemaIssue, half?: 'system' | 'palette'): string {
  const path = half === undefined ? issue.path : [half, ...issue.path]
  return `${path.join('.')}: ${issue.message}`
}

/**
 * The font families the app loads, collected from the loaded systems rather than listed here.
 *
 * The app has a webfont loader for every family a shipped system declares (`fonts.ts`), and
 * `registry.test.ts` keeps those two lists in step. So the families in `design/systems/` are
 * exactly the families with a webfont. A hand-written list here would be a third copy that could
 * disagree. A draft can therefore only choose fonts that will render.
 */
export const FONT_FAMILIES: readonly string[] = [
  ...new Set(
    SYSTEMS.flatMap((system) => FONT_ROLES.map((role) => fontSlot(system.fonts, role).family)),
  ),
].sort()

/**
 * The starting draft: a copy of the shipped default pairing.
 *
 * It is not an empty form. Every axis and every seed is required, so a blank studio would open
 * with eight empty fields. Starting from a real system means the first action is an edit, which
 * is how a designer builds a variant.
 */
export function startingDraft(systemName: string): Draft {
  const system = SYSTEMS.find((candidate) => candidate.name === systemName) ?? SYSTEMS[0]
  if (!system) throw new Error('studio: no systems in design/systems, so there is nothing to edit')
  const palette =
    PALETTES.find((candidate) => candidate.name === system.defaultPalette) ?? PALETTES[0]
  if (!palette) throw new Error('studio: no palettes in design/palettes, so nothing can be painted')
  return { system, palette }
}

/**
 * The draft under the reserved names, which is what gets resolved and emitted. `previewNames`
 * spreads the objects rather than rebuilding them. So a field the studio has no control for, such
 * as a seed the schema gains later, passes through derivation and save unchanged. The studio
 * changes only the decisions it renders.
 */
function previewPair(draft: Draft): { system: System; palette: Palette } {
  return previewNames(draft.system, draft.palette)
}

export interface Derivation {
  /** `null` when a law refused the draft, because `resolveTheme` is all-or-nothing. */
  theme: ResolvedTheme | null
  css: string | null
  /** The laws' messages, verbatim. Empty means the draft is lawful. */
  faults: string[]
  /** How many contrast pairings were measured, so "lawful" comes with a count. */
  checked: number
}

/**
 * Derives a draft the same way the product derives a shipped pairing, and reports the laws'
 * findings.
 *
 * There are three checkers, run in this order, because they fail in different ways:
 *
 *  - **`resolveTheme`**, in a `try`. The contrast law throws from inside colour resolution when
 *    the nudge budget runs out, and it throws instead of returning a theme. There is no partial
 *    result to preview, so an unresolvable draft leaves the last lawful block installed rather
 *    than clearing the pane.
 *  - **`auditCoherence`**, over the derived tokens. It returns violations rather than throwing,
 *    because axes that are each valid but contradict each other are a property of the derivation,
 *    not an error in it.
 *  - **`auditPairings`** and **`auditGradientPairings`**, over the emitted values in both modes.
 *    These report what `resolveTheme` cannot: the law adjusts what it can, and the audit measures
 *    the final values.
 *
 * The messages come from the laws. Where a law has a message function, this uses it
 * (`ContrastLawError.message`, `coherenceMessage`). Where it has none, because a failing
 * `PairingResult` is data and not an exception, the sentence uses the same wording as the thrown
 * form. So a designer sees one wording for each failure.
 */
export function deriveDraft(draft: Draft): Derivation {
  const pair = previewPair(draft)

  let theme: ResolvedTheme
  try {
    theme = resolveTheme(composeTheme(pair.system, pair.palette))
  } catch (error) {
    return {
      theme: null,
      css: null,
      faults: [error instanceof Error ? error.message : String(error)],
      checked: 0,
    }
  }

  const faults = auditCoherence(theme.axes, theme.tokens).map(coherenceMessage)
  let checked = 0

  // Runs the schema's refinements (for example a non-monotone radius ladder) inline. The steppers
  // write directly into the draft object, so the parse the save endpoint would run is run here
  // first. The fault then shows next to the control instead of at save time, with the same
  // wording the save endpoint would use.
  const parsed = systemSchema.safeParse(pair.system)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) faults.push(issueLine(issue))
  }

  // The registry's part of the exceptions law, run inline. The schema checks shape, but only the
  // registry knows whether a member exists and reads the class token being re-pointed. The save
  // endpoint repeats this check with the same message.
  faults.push(...auditExceptions(REGISTRY.components, pair.system.overrides?.exceptions ?? []))

  for (const mode of MODES) {
    for (const result of auditPairings(theme.color[mode])) {
      checked += 1
      if (result.passes) continue
      // Each pair's fault is stated in the measure its floor is: Lc, ΔL or the WCAG ratio.
      faults.push(
        `${theme.name} (${mode}): ${pairingId(result.pairing)} reached ` +
          `${pairingMeasure(result.pairing, result)}.`,
      )
    }

    for (const result of auditGradientPairings(theme.color[mode], theme.gradient[mode])) {
      checked += 1
      if (result.passes) continue
      faults.push(
        `${theme.name} (${mode}): ${gradientPairingId(result.pairing)} reached Lc ` +
          `${result.lc.toFixed(1)} at its '${result.worstStop}' stop, floor is ` +
          `${result.pairing.minLc}.`,
      )
    }

    // The glass law, when the draft uses glass: the pane over its worst-case backdrops, with the
    // law's wording (laws.test.ts checks the shipped catalogue with the same message).
    if (theme.axes.depth === 'glass') {
      for (const result of auditGlassPairings(theme.color[mode], GLASS_SURFACE_MIX[mode])) {
        checked += 1
        if (result.passes) continue
        faults.push(
          `${theme.name} (${mode}, pane over ${result.extreme}): ` +
            `${pairingId(result.pairing)} reached Lc ${result.lc.toFixed(1)}, floor is ` +
            `${result.pairing.minLc}.`,
        )
      }
    }
  }

  return { theme, css: emitThemeCSS(theme), faults, checked }
}

/** One token the draft's amendments changed, with its emitted value before and after. */
export interface TokenAmendment {
  token: string
  base: string
  now: string
}

/**
 * What the overrides changed, measured on the emitted CSS. The same system and palette are
 * re-emitted without `overrides` and the two are diffed by property name. The result is exact:
 * assignments, scales and their knock-on effects all appear, and nothing else can, because seeds
 * and axes are identical on both sides. Only the first occurrence of each property is compared,
 * which is the base block at the system's default density. The other densities re-derive
 * proportionally. An unresolvable draft returns no changes, because the law panel already reports
 * it.
 */
export function diffDraftTokens(draft: Draft): TokenAmendment[] {
  if (draft.system.overrides === undefined) return []

  const declarations = (system: System): Map<string, string> => {
    const css = emitThemeCSS(resolveTheme(composeTheme(system, draft.palette)))
    const map = new Map<string, string>()
    for (const match of css.matchAll(/(--pm-[a-z0-9-]+):\s*([^;]+);/g)) {
      const name = match[1] as string
      if (!map.has(name)) map.set(name, (match[2] as string).trim())
    }
    return map
  }

  try {
    const { overrides: _dropped, ...plain } = draft.system
    const base = declarations(plain)
    const now = declarations(draft.system)
    const changed: TokenAmendment[] = []
    for (const [token, value] of now) {
      const was = base.get(token)
      if (was !== undefined && was !== value) changed.push({ token, base: was, now: value })
    }
    return changed
  } catch {
    return []
  }
}

/**
 * Installs the draft's block, replacing the previous one.
 *
 * `appendThemeCSS` is the same function a cross-pairing uses, and it runs once per id. A second
 * call with the same id does nothing, which does not work for a block that changes on every slider
 * frame. So each revision is appended under a new id, and the previous draft blocks are removed
 * **afterwards**. That order means the page always has draft CSS and the preview never shows an
 * unstyled frame.
 *
 * The blocks to remove are found by their opening selector rather than by the private attribute
 * `appendThemeCSS` writes. The runtime does not publish that attribute, and building the scope
 * from `DATA_ATTRS` stays correct if it changes. No other block can start with the reserved pair's
 * selector, because no file may be named `pm-draft`.
 */
let revision = 0

function draftBlocks(): HTMLStyleElement[] {
  return [...document.querySelectorAll('style')].filter((style) =>
    (style.textContent ?? '').startsWith(DRAFT_SELECTOR),
  )
}

export function installDraftCSS(css: string): void {
  const stale = draftBlocks()

  revision += 1
  appendThemeCSS(css, `${DRAFT_PAIR}#${revision}`)

  for (const style of stale) style.remove()
}

/** Used on discard. Removes every draft block from the page, including the one boot added. */
export function removeDraftCSS(): void {
  for (const style of draftBlocks()) style.remove()
}

/* -------------------------------------------------------------------------- */
/* Import / export                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The interchange shape. It matches `propose_theme`'s output shape on purpose, so an agent's
 * proposal pastes into the box unedited. The tool's extra fields about the proposal (rationale,
 * verdict, unmapped words) are ignored rather than rejected. The studio re-derives the verdict
 * itself and does not trust a supplied one.
 */
export interface DraftDocument {
  system: unknown
  palette: unknown
}

/** 2-space JSON with a trailing newline, the format of every design file. */
export function serializeDraft(draft: Draft): string {
  return `${JSON.stringify({ system: draft.system, palette: draft.palette }, null, 2)}\n`
}

export interface ImportResult {
  draft: Draft | null
  /** The parser's message, such as a Zod path or a JSON syntax error, passed through unchanged. */
  error: string | null
}

/**
 * Parses one document with both the system and the palette, using the same schemas the engine
 * uses for shipped files. That is the whole check, and it makes the paste box safe. A pasted pair
 * must meet exactly the standard a file in `design/systems/` meets, and any draft that reaches the
 * controls has already passed it.
 *
 * It uses `safeParse` rather than the throwing `parseSystem`/`parsePalette`, because a thrown
 * `ZodError`'s `message` is the issue array as JSON and a caller can only print it. Both parts are
 * checked even when the first fails, so a designer fixing a pasted proposal sees every problem at
 * once.
 */
function parseDocument(text: string): { draft: Draft | null; faults: string[] } {
  let document: unknown
  try {
    document = JSON.parse(text)
  } catch (error) {
    return { draft: null, faults: [error instanceof Error ? error.message : String(error)] }
  }

  if (typeof document !== 'object' || document === null) {
    return { draft: null, faults: ['expected an object with a `system` and a `palette`'] }
  }

  const { system, palette } = document as Partial<DraftDocument>
  const parsedSystem = systemSchema.safeParse(system)
  const parsedPalette = paletteSchema.safeParse(palette)

  if (parsedSystem.success && parsedPalette.success) {
    return { draft: { system: parsedSystem.data, palette: parsedPalette.data }, faults: [] }
  }

  return {
    draft: null,
    faults: [
      ...(parsedSystem.success
        ? []
        : parsedSystem.error.issues.map((issue) => issueLine(issue, 'system'))),
      ...(parsedPalette.success
        ? []
        : parsedPalette.error.issues.map((issue) => issueLine(issue, 'palette'))),
    ],
  }
}

/** Parses a pasted document into a draft. The faults are joined into one message. */
export function importDraft(text: string): ImportResult {
  const { draft, faults } = parseDocument(text)
  return { draft, error: draft === null ? faults.join('\n') : null }
}

/**
 * The reasons a stored draft failed to restore. The studio's notice card prints them next to the
 * download offer. Empty for a document that parses, in which case the notice does not appear.
 */
export function refusalFaults(text: string): string[] {
  return parseDocument(text).faults
}

/* -------------------------------------------------------------------------- */
/* Names                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Checks that a name is a valid file name, using the schema's rule rather than a second regex
 * here. Both names are used in attribute selectors and in localStorage, so both must be slugs.
 */
export function nameFault(kind: 'system' | 'palette', name: string): string | null {
  const schema = kind === 'system' ? systemNameSchema : paletteNameSchema
  const result = schema.safeParse(name)
  return result.success ? null : (result.error.issues[0]?.message ?? 'invalid name')
}

/** Names already on disk. Saving to one of these amends the file instead of creating one. */
export function existingNames(): { systems: readonly string[]; palettes: readonly string[] } {
  return {
    systems: SYSTEMS.map((system) => system.name),
    palettes: PALETTES.map((palette) => palette.name),
  }
}

/**
 * The pair as it will be written, with the user's names, and with the system's default palette
 * set to the palette it was designed with.
 *
 * The default palette is set on purpose. A system's `defaultPalette` is the palette it uses unless
 * someone chooses another, and the pair on screen is that choice. Saving a system with a different
 * default would record a decision nobody made.
 */
export function saveable(draft: Draft, systemName: string, paletteName: string): Draft {
  return {
    system: { ...draft.system, name: systemName, defaultPalette: paletteName },
    palette: { ...draft.palette, name: paletteName },
  }
}
