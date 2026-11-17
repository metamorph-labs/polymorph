import { z } from 'zod'

import { GLASS_SURFACE_MIX } from './derive'
import { auditCoherence, coherenceMessage } from './coherence'
import { auditGlassPairings, auditGradientPairings, auditPairings } from './color/resolve'
import { buildRoleMap } from './color/role-map'
import { emitThemeCSS } from './emit'
import { gradientPairingId, isDelineation, pairingId } from './pairings'
import { resolveTheme } from './resolve-theme'
import { GRADIENT_BASE, type ColorRole } from './roles'
import { fontPackage, FONT_ROLES, type FontFamilies, type FontRole } from './seeds'
import {
  composeTheme,
  paletteSchema,
  systemDocumentSchema,
  systemSchema,
  type Palette,
  type System,
} from './systems'
import { MODES, type Mode, type ResolvedTheme, type Theme } from './theme'

/**
 * Admission: the law-checked entry point for a pairing this repository does
 * not know.
 *
 * The catalogue in `design/` is this repository's own, but the engine does not
 * care whose documents it resolves. A product with its own design gets the same
 * checks without this repository knowing its name. `admitTheme` takes two JSON
 * documents and returns everything a shipped pairing gets (schema checks,
 * composed theme, resolved tokens, emitted CSS, fonts to install), plus a
 * report in the laws' own messages when anything is unlawful.
 *
 * Three properties:
 *
 *  1. **No catalogue.** Nothing here reads `design/`, the registry, or a name
 *     list. A guest system named `plain` is the guest's risk; the CLI warns,
 *     this function checks documents, not names.
 *  2. **Only the laws that apply to a pairing.** Schema, ladder monotony,
 *     coherence, and the contrast, gradient and glass floors. The
 *     catalogue-management laws (axis divergence, accent-hue band) keep this
 *     repository's catalogue distinct, so they do not run, and `exemptions`
 *     says so, so their absence is not mistaken for enforcement.
 *  3. **Never throws.** Every failure (unparseable document, incoherent axes,
 *     resolution fault) is returned as data with the law named, because an app
 *     can render a report but not a stack trace.
 */

export interface AdmissionFault {
  /** Which law failed. `resolution` means the engine stopped mid-derivation. */
  law: 'schema' | 'resolution' | 'coherence' | 'contrast' | 'gradient' | 'glass'
  /** The law's own message, as the MCP server and the studio show it. */
  message: string
}

/** What a guest application must install for the pairing's type to arrive. */
export interface AdmittedFont {
  /** Which slots this family fills, often more than one. */
  roles: FontRole[]
  family: string
  /** The fontsource package; the family's suffix selects variable or static. */
  package: string
}

/**
 * The catalogue laws a guest pairing is exempt from, as printable sentences.
 * Fixed text, because an exemption that varied with input would be a judgement.
 */
export const ADMISSION_EXEMPTIONS: readonly string[] = [
  'Axis divergence (≥3 apart) is a catalogue law — it keeps *this* repository’s shelf ' +
    'of systems legible, and a guest system’s distance from ours is the guest’s business.',
  'The accent-hue band (±20°) is a catalogue law for the same reason: pigments on one ' +
    'shelf must not crowd. A guest palette answers only to its own shelf.',
  'Name uniqueness is judged by the application’s installed catalogue, not here — the ' +
    'DOM wears names as attributes, so colliding with an installed system is a real ' +
    'hazard this seam cannot see.',
]

interface AdmissionBase {
  /** Every law that failed, in the order the laws run. Empty when `lawful`. */
  faults: AdmissionFault[]
  /** The catalogue laws that deliberately did not run. See `ADMISSION_EXEMPTIONS`. */
  exemptions: readonly string[]
}

export interface RefusedAdmission extends AdmissionBase {
  lawful: false
  /** Present when its document parsed, even though the pairing was refused. */
  system?: System
  palette?: Palette
  theme?: Theme
  resolved?: ResolvedTheme
  css?: string
  fonts?: AdmittedFont[]
}

export interface LawfulAdmission extends AdmissionBase {
  lawful: true
  system: System
  palette: Palette
  theme: Theme
  resolved: ResolvedTheme
  /** The pairing's emitted block, ready for `installThemeCSS`/`appendThemeCSS`. */
  css: string
  fonts: AdmittedFont[]
}

export type Admission = LawfulAdmission | RefusedAdmission

/** The two documents exactly as the guest provides them, unparsed. */
export interface AdmissionInput {
  system: unknown
  palette: unknown
  /**
   * The palette `palette.moreContrast` names, when it names one. The partner
   * pairing is admitted under the same laws, and its colours are written into
   * the emitted block under the more-contrast media query. A palette that names
   * a partner is refused without it, because its block would have no such query
   * and a reader who asks for more contrast would not get it.
   */
  moreContrast?: unknown
}

/** Zod's issues flattened into report entries, with the path in the message. */
function schemaFaults(
  which: 'system' | 'palette' | 'moreContrast',
  error: z.ZodError,
): AdmissionFault[] {
  return error.issues.map((issue) => ({
    law: 'schema' as const,
    message: `${which}${issue.path.length > 0 ? `.${issue.path.join('.')}` : ''}: ${issue.message}`,
  }))
}

/** The install list: one entry per family, with every role it fills. */
function admittedFonts(fonts: FontFamilies): AdmittedFont[] {
  const byFamily = new Map<string, AdmittedFont>()
  for (const role of FONT_ROLES) {
    const family = fonts[role].family
    const entry = byFamily.get(family)
    if (entry) entry.roles.push(role)
    else byFamily.set(family, { roles: [role], family, package: fontPackage(family) })
  }
  return [...byFamily.values()]
}

/**
 * Every audit over a resolved theme, in the laws' own messages. Shared with
 * the MCP server's `verdict`, so the agent tool, the CLI and applications
 * report identically. Order: coherence, contrast in both modes, gradient
 * stops, then for glass the pane over both worst-case backdrops.
 */
export function auditResolvedTheme(theme: ResolvedTheme): AdmissionFault[] {
  const faults: AdmissionFault[] = auditCoherence(theme.axes, theme.tokens).map((violation) => ({
    law: 'coherence' as const,
    message: coherenceMessage(violation),
  }))

  for (const mode of MODES) {
    for (const result of auditPairings(theme.color[mode])) {
      if (result.passes) continue
      // A delineation pair is stated in ΔL, so its fault is too: its Lc floor is 0.
      const measure = isDelineation(result.pairing)
        ? `ΔL ${result.deltaL.toFixed(3)}, floor is ${result.pairing.minDeltaL}`
        : `Lc ${result.lc.toFixed(1)}, floor is ${result.pairing.minLc}`
      faults.push({
        law: 'contrast',
        message:
          `${theme.name} (${mode}): ${pairingId(result.pairing)} reached ${measure}.` +
          pinNote(theme, mode, [result.pairing.foreground, result.pairing.background]),
      })
    }
    for (const result of auditGradientPairings(theme.color[mode], theme.gradient[mode])) {
      if (result.passes) continue
      faults.push({
        law: 'gradient',
        message:
          `${theme.name} (${mode}): ${gradientPairingId(result.pairing)} reached Lc ` +
          `${result.lc.toFixed(1)} at its '${result.worstStop}' stop, floor is ` +
          `${result.pairing.minLc}.` +
          pinNote(theme, mode, [
            result.pairing.foreground,
            GRADIENT_BASE[result.pairing.background],
          ]),
      })
    }
    if (theme.axes.depth === 'glass') {
      for (const result of auditGlassPairings(theme.color[mode], GLASS_SURFACE_MIX[mode])) {
        if (result.passes) continue
        faults.push({
          law: 'glass',
          message:
            `${theme.name} (${mode}, pane over ${result.extreme}): ` +
            `${pairingId(result.pairing)} reached Lc ${result.lc.toFixed(1)}, floor is ` +
            `${result.pairing.minLc}.` +
            pinNote(theme, mode, [result.pairing.foreground, result.pairing.background]),
        })
      }
    }
  }

  return faults
}

/**
 * Names the pins behind a failing pairing: a pinned role in it, or the pinned
 * fill a derived label in it was chosen against. The law never moves a pin, so
 * the palette's author is the one who can fix the fault, and the report says
 * which value to change.
 */
function pinNote(theme: ResolvedTheme, mode: Mode, roles: readonly ColorRole[]): string {
  const pins: Partial<Record<ColorRole, string>> = theme.seeds.pins?.[mode] ?? {}
  if (Object.keys(pins).length === 0) return ''
  const roleMap = buildRoleMap(theme.axes, mode, theme.seeds.chromaBudget)
  const notes: string[] = []
  const pinned = roles.filter((role) => pins[role] !== undefined)
  if (pinned.length > 0) notes.push(`The palette pins ${pinned.join(' and ')} in ${mode} mode.`)
  for (const role of roles) {
    const source = roleMap[role]
    if (pins[role] !== undefined || source.kind !== 'bestOn') continue
    if (pins[source.against] === undefined || roles.includes(source.against)) continue
    notes.push(
      `${role} is chosen against ${source.against}, which the palette pins in ${mode} mode.`,
    )
  }
  return notes.map((note) => ` ${note}`).join('')
}

export function admitTheme(input: AdmissionInput): Admission {
  const faults: AdmissionFault[] = []

  const systemResult = systemSchema.safeParse(input.system)
  if (!systemResult.success) faults.push(...schemaFaults('system', systemResult.error))
  const paletteResult = paletteSchema.safeParse(input.palette)
  if (!paletteResult.success) faults.push(...schemaFaults('palette', paletteResult.error))
  const partnerResult =
    input.moreContrast === undefined ? undefined : paletteSchema.safeParse(input.moreContrast)
  if (partnerResult?.success === false) {
    faults.push(...schemaFaults('moreContrast', partnerResult.error))
  }
  // A palette that names a partner is admitted with it. Without it the block
  // would have no more-contrast query, and nothing would say so.
  if (
    paletteResult.success &&
    paletteResult.data.moreContrast !== undefined &&
    input.moreContrast === undefined
  ) {
    faults.push({
      law: 'schema',
      message:
        `moreContrast: "${paletteResult.data.name}" names "${paletteResult.data.moreContrast}" as ` +
        'its more-contrast palette, and admission was not given that palette, so the block would ' +
        'have no more-contrast query',
    })
  }
  // The partner given must be the one the palette names, so a document cannot
  // be paired with a partner it never chose.
  if (
    paletteResult.success &&
    partnerResult?.success === true &&
    paletteResult.data.moreContrast !== partnerResult.data.name
  ) {
    faults.push({
      law: 'schema',
      message:
        `moreContrast: admission was given the palette "${partnerResult.data.name}", and ` +
        (paletteResult.data.moreContrast === undefined
          ? `"${paletteResult.data.name}" names no more-contrast partner`
          : `"${paletteResult.data.name}" names "${paletteResult.data.moreContrast}"`),
    })
  }

  if (!systemResult.success || !paletteResult.success || faults.length > 0) {
    return {
      lawful: false,
      faults,
      exemptions: ADMISSION_EXEMPTIONS,
      ...(systemResult.success ? { system: systemResult.data } : {}),
      ...(paletteResult.success ? { palette: paletteResult.data } : {}),
      ...(systemResult.success ? { fonts: admittedFonts(systemResult.data.fonts) } : {}),
    }
  }

  const system = systemResult.data
  const palette = paletteResult.data
  const partner = partnerResult?.success === true ? partnerResult.data : undefined
  const theme = composeTheme(system, palette)
  const fonts = admittedFonts(system.fonts)

  let resolved: ResolvedTheme
  let resolvedPartner: ResolvedTheme | undefined
  try {
    resolved = resolveTheme(theme)
    resolvedPartner =
      partner === undefined ? undefined : resolveTheme(composeTheme(system, partner))
  } catch (error) {
    // The engine stopped mid-derivation, usually because the nudge budget ran
    // out. Rare, because the derivation adjusts towards the floors.
    faults.push({
      law: 'resolution',
      message: error instanceof Error ? error.message : String(error),
    })
    return {
      lawful: false,
      faults,
      exemptions: ADMISSION_EXEMPTIONS,
      system,
      palette,
      theme,
      fonts,
    }
  }

  faults.push(...auditResolvedTheme(resolved))
  // The partner shares the system, so its coherence is this pairing's and is
  // reported once. Its colours are its own, and every colour law runs on them.
  if (resolvedPartner !== undefined) {
    faults.push(...auditResolvedTheme(resolvedPartner).filter((fault) => fault.law !== 'coherence'))
  }
  const css = emitThemeCSS(
    resolved,
    resolvedPartner === undefined ? {} : { moreContrast: resolvedPartner },
  )

  if (faults.length > 0) {
    return {
      lawful: false,
      faults,
      exemptions: ADMISSION_EXEMPTIONS,
      system,
      palette,
      theme,
      resolved,
      css,
      fonts,
    }
  }

  return {
    lawful: true,
    faults,
    exemptions: ADMISSION_EXEMPTIONS,
    system,
    palette,
    theme,
    resolved,
    css,
    fonts,
  }
}

/**
 * The JSON Schemas a guest author's editor reads, generated from the
 * refinement-free document shapes so they cannot go stale. `admitTheme` checks
 * the cross-field rules.
 */
export function systemJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(systemDocumentSchema) as Record<string, unknown>
}

export function paletteJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(paletteSchema) as Record<string, unknown>
}
