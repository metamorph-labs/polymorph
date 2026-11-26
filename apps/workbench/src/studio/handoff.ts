import {
  AXIS_NAMES,
  composeTheme,
  emitThemeCSS,
  FONT_ROLES,
  fontSlot,
  resolveTheme,
} from '@polymorph/engine'

import { deriveDraft, diffDraftTokens, saveable, serializeDraft, type Draft } from './draft'

/**
 * The handoff: the draft as three files that someone else can act on.
 *
 * `handoff.md` is for people. It lists every decision with its reason, the exact command a
 * developer runs, and the steps an agent follows. `theme.css` is the emitted sheet as a file. It
 * is a **handoff and inspection artifact, never an install path**. Consumers use the data and
 * runtime emission (the CLI's generated theme module). The banner says so, so that a pasted
 * sheet does not become an unnoticed fork that no longer re-derives.
 */

const CSS_BANNER = (systemName: string, paletteName: string) =>
  `/* polymorph — emitted sheet for ${systemName}/${paletteName}.
 * A HANDOFF AND INSPECTION ARTIFACT, never an install path: products consume
 * the two design/*.json documents and emit at runtime (polymorph add), so the
 * sheet re-derives when a decision changes. A pasted copy of this file is a
 * fork that has already stopped re-deriving. */
`

export function renderThemeCSS(draft: Draft, systemName: string, paletteName: string): string {
  const named = saveable(draft, systemName, paletteName)
  // Resolved under the save names, never the reserved preview pair. `deriveDraft` renames to
  // `pm-draft` on purpose, and pm-draft must never appear in a file that leaves this page. This
  // throws on an unlawful draft. The button is disabled unless the law panel reports the draft
  // lawful.
  const theme = resolveTheme(composeTheme(named.system, named.palette))
  return CSS_BANNER(systemName, paletteName) + emitThemeCSS(theme)
}

const step = (value: string | number) => `\`${String(value)}\``

/** A browser download. The file is saved only to the user's downloads, never to the repository. */
export function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

export function renderHandoff(draft: Draft, systemName: string, paletteName: string): string {
  const named = saveable(draft, systemName, paletteName)
  const { system, palette } = named
  const amendments = diffDraftTokens(draft)
  const exceptions = system.overrides?.exceptions ?? []
  const derivation = deriveDraft(draft)

  const lines: string[] = []
  const push = (text = '') => lines.push(text)

  push(`# ${systemName} / ${paletteName} — handoff`)
  push()
  push(
    derivation.faults.length === 0
      ? `Lawful: coherence holds and ${derivation.checked} contrast pairings were measured against the emitted values across both modes.`
      : `**Unlawful as handed off** — the laws said: ${derivation.faults.join(' ')}`,
  )
  push()
  push('## The decisions')
  push()
  push('| Axis | Value |')
  push('| --- | --- |')
  for (const axis of AXIS_NAMES) push(`| ${axis} | ${step(system.axes[axis])} |`)
  push()
  push('| Seed | Value |')
  push('| --- | --- |')
  push(`| accentHue | ${step(palette.accentHue)} |`)
  if (palette.gradientHue !== undefined) push(`| gradientHue | ${step(palette.gradientHue)} |`)
  if (palette.neutralHue !== undefined) push(`| neutralHue | ${step(palette.neutralHue)} |`)
  push(`| neutralTint | ${step(palette.neutralTint)} |`)
  push(`| chromaBudget | ${step(palette.chromaBudget)} |`)
  push()
  push('| Font role | Family |')
  push('| --- | --- |')
  for (const role of FONT_ROLES) push(`| ${role} | ${step(fontSlot(system.fonts, role).family)} |`)
  push()

  if (amendments.length > 0) {
    push('## What the amendments moved')
    push()
    push('Measured on the emitted stylesheet — the same system re-emitted without')
    push('its `overrides`, line-diffed. Everything else still follows the axes.')
    push()
    push('| Token | Base | Now |')
    push('| --- | --- | --- |')
    for (const amendment of amendments) {
      push(`| \`${amendment.token}\` | \`${amendment.base}\` | \`${amendment.now}\` |`)
    }
    push()
  }

  if (exceptions.length > 0) {
    push('## Declared exceptions')
    push()
    push('One member, one decision, one step — each with the reason it ships with.')
    push()
    for (const exception of exceptions) {
      push(
        `- **${exception.component}** — \`--pm-${exception.family}-${exception.class}\` → ` +
          `${step(exception.step)}. Because: ${exception.because}`,
      )
    }
    push()
  }

  push('## For a developer')
  push()
  push('The pair is two JSON documents — land them in the repo that owns design:')
  push()
  push(`- \`design/systems/${systemName}.json\``)
  push(`- \`design/palettes/${paletteName}.json\``)
  push()
  push('A product vendored with the CLI installs or updates the pairing with:')
  push()
  push('```bash')
  push(`polymorph add theme:${systemName} palette:${paletteName}`)
  push('```')
  push()
  push('`theme.css` beside this file is for inspection and review only — products')
  push('emit at runtime from the JSON, so the sheet re-derives when a decision')
  push('changes. Do not paste it into a codebase.')
  push()
  push('## For an agent')
  push()
  push('The MCP server (`pnpm mcp`) speaks this system natively:')
  push()
  push('1. `get_theme_axes` — the axes, seeds and scales, this pairing included once saved.')
  push(
    '2. `propose_theme { intent, basedOn: { system: "' +
      systemName +
      '" } }` — lawful variations on it.',
  )
  push('3. `save_theme { system, palette }` — land a variation as two JSON files.')
  push('4. `validate` — hold any generated screen or spec to the same laws this pair passed.')
  push()
  push("The interchange shape is the same everywhere: paste this handoff's JSON")
  push("into the studio's import box and the controls populate exactly as saved.")
  push()
  push('## The pair, verbatim')
  push()
  push('```json')
  push(serializeDraft(named).trimEnd())
  push('```')
  push()

  return lines.join('\n')
}
