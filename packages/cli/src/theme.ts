import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import type { Registry } from '@polymorph/registry'
import { admitTheme, paletteJsonSchema, systemJsonSchema, type Admission } from '@polymorph/theme'

/**
 * `polymorph theme`: theme admission from the terminal, for guest pairings.
 *
 * The catalogue verbs (`add theme:pastel`) install *our* systems by name.
 * These verbs take *yours* by path: two JSON documents a product wrote for
 * itself. `admitTheme` judges them, the same function behind the MCP's
 * `propose_theme` verdict. This repository's catalogue laws do not apply, and
 * the report says so. Nothing here reads `design/` or the vocabulary (the
 * thin-front law). The only files opened are the consumer's own, named on the
 * command line, and the engine computes everything.
 *
 * A palette that names a more-contrast partner is admitted with it: the third
 * path, or else the file named for the partner beside the palette
 * (`<partner>.json`), as a catalogue lays its palettes out.
 *
 * `emit` follows the same policy as `pnpm emit:theme`, applied to guests: the
 * output is for handoff and inspection, never an install path. A product
 * installs by keeping its two documents and compiling them in its own build
 * (`@polymorph/engine/vite`, or `polymorph add` for a vendored install), so the
 * sheet is re-derived whenever a decision changes. The banner in every emitted
 * file says so.
 */

export interface ThemeFlags {
  out?: string
}

interface ThemeCli {
  root: string
  registry: Registry
  out: (line: string) => void
}

export function themeCommand(cli: ThemeCli, items: string[], flags: ThemeFlags): { code: number } {
  const [verb, ...paths] = items
  switch (verb) {
    case 'validate':
      return validate(cli, paths)
    case 'emit':
      return emit(cli, paths, flags)
    case 'schema':
      return schema(cli, paths, flags)
    default:
      cli.out(
        'polymorph theme — bring your own system\n\n' +
          '  polymorph theme validate <system.json> <palette.json> [<partner.json>]   the laws, as a report\n' +
          '  polymorph theme emit <system.json> <palette.json> [<partner.json>]       the emitted sheet (--out file.css)\n' +
          '  polymorph theme schema <system|palette>                                  the JSON Schema (--out file.json)\n\n' +
          '  A palette that names a more-contrast partner is admitted with it: <partner.json>,\n' +
          '  or the file named for the partner beside the palette.\n',
      )
      return { code: verb === undefined ? 1 : 1 }
  }
}

/** Reads a consumer path as JSON. A parse failure becomes a report line, not a stack trace. */
function readDocument(cli: ThemeCli, path: string): { document: unknown } | { failure: string } {
  const absolute = resolve(cli.root, path)
  let raw: string
  try {
    raw = readFileSync(absolute, 'utf8')
  } catch (error) {
    return { failure: `could not read ${path} — ${(error as Error).message}` }
  }
  try {
    return { document: JSON.parse(raw) }
  } catch (error) {
    return { failure: `${path} is not JSON — ${(error as Error).message}` }
  }
}

function admitFromPaths(
  cli: ThemeCli,
  paths: string[],
  verb: string,
): { admission: Admission } | { code: number } {
  const [systemPath, palettePath, partnerPath] = paths
  if (!systemPath || !palettePath) {
    cli.out(`polymorph theme ${verb}: name a system JSON and a palette JSON, in that order`)
    return { code: 1 }
  }
  const system = readDocument(cli, systemPath)
  if ('failure' in system) {
    cli.out(`polymorph theme ${verb}: ${system.failure}`)
    return { code: 1 }
  }
  const palette = readDocument(cli, palettePath)
  if ('failure' in palette) {
    cli.out(`polymorph theme ${verb}: ${palette.failure}`)
    return { code: 1 }
  }
  const partner = partnerOf(cli, palettePath, palette.document, partnerPath)
  if ('failure' in partner) {
    cli.out(`polymorph theme ${verb}: ${partner.failure}`)
    return { code: 1 }
  }
  return {
    admission: admitTheme({
      system: system.document,
      palette: palette.document,
      moreContrast: partner.document,
    }),
  }
}

/**
 * The more-contrast partner a palette names: the path given, or else the file
 * named for it beside the palette. Absent when the palette names none, or when
 * no such file is there, and then admission reports the missing partner.
 */
function partnerOf(
  cli: ThemeCli,
  palettePath: string,
  palette: unknown,
  partnerPath: string | undefined,
): { document: unknown } | { failure: string } {
  if (partnerPath !== undefined) return readDocument(cli, partnerPath)
  const named = (palette as { moreContrast?: unknown } | null)?.moreContrast
  if (typeof named !== 'string') return { document: undefined }
  const beside = join(dirname(palettePath), `${named}.json`)
  return existsSync(resolve(cli.root, beside)) ? readDocument(cli, beside) : { document: undefined }
}

/** Where a missing partner can come from, after admission's own sentence. */
function partnerHint(cli: ThemeCli, admission: Admission): void {
  const named = admission.palette?.moreContrast
  if (named === undefined) return
  if (!admission.faults.some((fault) => fault.message.startsWith('moreContrast: '))) return
  cli.out(`  pass ${named}.json as a third path, or put it beside the palette`)
}

function validate(cli: ThemeCli, paths: string[]): { code: number } {
  const outcome = admitFromPaths(cli, paths, 'validate')
  if ('code' in outcome) return outcome
  const admission = outcome.admission

  if (!admission.lawful) {
    cli.out(`unlawful — ${admission.faults.length} fault(s):`)
    for (const fault of admission.faults) cli.out(`  [${fault.law}] ${fault.message}`)
    partnerHint(cli, admission)
    return { code: 1 }
  }

  cli.out(
    `lawful — ${admission.theme.name}: every pairing law holds in both modes ` +
      `(schema, coherence, contrast, gradients${admission.system.axes.depth === 'glass' ? ', glass' : ''}).`,
  )
  cli.out(`  chart cap  ${admission.resolved.chartCap} series may neighbour`)
  if (admission.palette.moreContrast !== undefined) {
    cli.out(`  contrast   ${admission.palette.moreContrast} under prefers-contrast: more`)
  }
  for (const font of admission.fonts) {
    cli.out(`  fonts      ${font.family} (${font.roles.join(', ')}) — install ${font.package}`)
  }

  // A name collision that `admitTheme` cannot detect, because it judges
  // documents, not names. The DOM carries the names as attributes, so a guest
  // system with a shipped system's name collides with any installed catalogue
  // CSS. This is a note, never a fault.
  const shipped = new Set(cli.registry.theme.systems.map((system) => system.name))
  if (shipped.has(admission.system.name)) {
    cli.out(
      `  note       "${admission.system.name}" is also a shipped system — a page that ` +
        'installs both wears one name for two sheets',
    )
  }
  const shippedPalettes = new Set(cli.registry.theme.palettes.map((palette) => palette.name))
  if (shippedPalettes.has(admission.palette.name)) {
    cli.out(
      `  note       "${admission.palette.name}" is also a shipped palette — same hazard, ` +
        'other half',
    )
  }

  for (const exemption of admission.exemptions) cli.out(`  exempt     ${exemption}`)
  return { code: 0 }
}

function emit(cli: ThemeCli, paths: string[], flags: ThemeFlags): { code: number } {
  const outcome = admitFromPaths(cli, paths, 'emit')
  if ('code' in outcome) return outcome
  const admission = outcome.admission

  if (!admission.lawful || admission.css === undefined) {
    cli.out('polymorph theme emit: the pairing is unlawful — `validate` has the report')
    for (const fault of admission.faults) cli.out(`  [${fault.law}] ${fault.message}`)
    partnerHint(cli, admission)
    return { code: 1 }
  }

  const banner =
    `/* polymorph — emitted sheet for ${admission.theme.name}.\n` +
    ' * A HANDOFF AND INSPECTION ARTIFACT, never an install path: a product holds\n' +
    ' * its two JSON documents and compiles them in its own build\n' +
    ' * (@polymorph/engine/vite), so the sheet re-derives when a decision changes. A\n' +
    ' * pasted copy of this file is a fork that has already stopped re-deriving. */\n'
  const css = banner + admission.css

  if (flags.out !== undefined) {
    writeFileSync(resolve(cli.root, flags.out), css, 'utf8')
    cli.out(`polymorph theme emit: wrote ${flags.out} (${(css.length / 1024).toFixed(1)}KB)`)
    return { code: 0 }
  }
  cli.out(css)
  return { code: 0 }
}

function schema(cli: ThemeCli, paths: string[], flags: ThemeFlags): { code: number } {
  const [which] = paths
  if (which !== 'system' && which !== 'palette') {
    cli.out('polymorph theme schema: say which — `system` or `palette`')
    return { code: 1 }
  }
  const document = which === 'system' ? systemJsonSchema() : paletteJsonSchema()
  const json = JSON.stringify(document, null, 2)
  if (flags.out !== undefined) {
    writeFileSync(resolve(cli.root, flags.out), json + '\n', 'utf8')
    cli.out(`polymorph theme schema: wrote ${flags.out}`)
    return { code: 0 }
  }
  cli.out(json)
  return { code: 0 }
}
