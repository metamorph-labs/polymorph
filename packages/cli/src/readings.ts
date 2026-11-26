import type {
  Framework,
  RegistryComponent,
  RegistryDataType,
  RegistryPalette,
  RegistrySystem,
  SearchHit,
  ThemeCatalogue,
} from '@polymorph/registry'
import type { Alternative, Diagnostic } from '@polymorph/rules/verify'

import type { InstallPlan } from './plan'

/**
 * The plain readings the verbs print without `--json`.
 *
 * Each function turns a tool's answer into lines, and adds nothing the answer
 * does not hold. The answers are typed here by the fields a reading reads,
 * because this package may not import `@polymorph/mcp`, which declares them;
 * `verbs.test.ts` in that package checks that each answer fits its reading.
 */

/** One aligned row. Every label pads to the width of the widest one, `kept yours`. */
export const row = (label: string, value: string) => `  ${label.padEnd(11)}${value}`

/* -------------------------------------------------------------------------- */
/* An install plan, as `add --dry-run` prints it                              */
/* -------------------------------------------------------------------------- */

/**
 * What an install names: where it lands, the members asked for and the ones
 * that came along, the systems and palettes, and how many files. `add` prints
 * these rows before it writes, and `--dry-run` and `plan` print them alone.
 */
export function planHeadLines(plan: InstallPlan): string[] {
  const themeFiles = plan.systems.length + plan.palettes.length
  const dragged = plan.components.filter((name) => !plan.requested.includes(name))
  // Palettes that a system declares, as opposed to palettes the user named.
  // This is the same rule as `came along` for components.
  const declared = new Set(plan.systems.map((system) => system.defaultPalette))

  const lines = [`polymorph ${plan.version} → ${plan.dir}`]
  if (plan.requested.length > 0) lines.push(row('components', plan.requested.join(', ')))
  // Components pulled in as dependencies are always listed by name. An install
  // that adds components silently would surprise the consumer later.
  if (dragged.length > 0) lines.push(row('came along', dragged.join(', ')))
  for (const system of plan.systems) {
    const fonts = system.fonts.map((font) => font.family).join(', ')
    lines.push(row('system', `${system.name} + ${system.defaultPalette} (${fonts})`))
  }
  for (const palette of plan.palettes.filter((entry) => !declared.has(entry.name))) {
    lines.push(row('palette', palette.name))
  }
  lines.push(row('files', String(plan.files.length + themeFiles)))
  return lines
}

/** Whether an install plan writes nothing at all. Its notes then say why. */
export const writesNothing = (plan: InstallPlan): boolean =>
  plan.files.length + plan.systems.length + plan.palettes.length === 0

/** A plan as `add --dry-run` prints it: the rows, every file, and the packages. */
export function planLines(plan: InstallPlan): string[] {
  if (plan.framework === 'elements') return pagePlanLines(plan)
  if (writesNothing(plan)) return plan.notes.map((note) => `  · ${note}`)

  const lines = planHeadLines(plan)
  for (const file of plan.files) lines.push(`    ${file.to}`)
  for (const entry of [...plan.systems, ...plan.palettes]) lines.push(`    ${entry.file.to}`)
  lines.push(row('packages', Object.keys(plan.packages).join(', ')))
  if (Object.keys(plan.devPackages).length > 0) {
    lines.push(row('dev', Object.keys(plan.devPackages).join(', ')))
  }
  return lines
}

/**
 * A plan for a page with no build: it vendors no member, so the notes say what
 * happens to each one named, and every system and palette joins one sheet.
 */
function pagePlanLines(plan: InstallPlan): string[] {
  const lines = plan.notes.map((note) => `  · ${note}`)
  for (const system of plan.systems) lines.push(row('system', system.name))
  for (const palette of plan.palettes) lines.push(row('palette', palette.name))
  const sheet = [...plan.systems, ...plan.palettes][0]?.file.to
  if (sheet !== undefined) lines.push(`    ${sheet}`)
  return lines
}

/* -------------------------------------------------------------------------- */
/* Violations and faults                                                      */
/* -------------------------------------------------------------------------- */

/** A red-rule report as `validate`, `fix` and `fix_file` answer it, with the rungs that answer its rule. */
export interface Reported extends Pick<Diagnostic, 'rule' | 'message' | 'line' | 'column'> {
  fix?: Diagnostic['fix']
  alternatives?: Alternative[]
  climb?: readonly { rung: number; name: string }[]
}

/** A spec fault: where in the document, and what is wrong there. */
export interface Fault {
  path: string
  message: string
}

/**
 * One line for each report, `file:line:column  rule  message`, and under it
 * the lawful answer: the rule's own rewrite when it has one, the members,
 * props and tokens the message names, and the ladder's rungs. A warning is
 * marked after its rule (`marked`, ` (warning)`), as `polymorph check` marks one.
 */
export function violationLines(
  name: string,
  violations: readonly Reported[],
  marked = '',
): string[] {
  return violations.flatMap((violation) => {
    const lines = [
      `${name}:${violation.line}:${violation.column}  ${violation.rule}${marked}  ${violation.message}`,
    ]
    if (violation.fix) lines.push(`    fix    ${rewrite(violation.fix.text)}`)
    const alternatives = (violation.alternatives ?? []).map(alternative)
    if (alternatives.length > 0) lines.push(`    use    ${alternatives.join(' · ')}`)
    if (violation.climb !== undefined) lines.push(`    climb  ${climbLine(violation.climb)}`)
    return lines
  })
}

/**
 * The rule's own rewrite, shown when it fits on a line. A longer one, such as
 * a `<button>` rewritten with the import it needs, is named for `polymorph fix`
 * to apply, and `--json` holds its text.
 */
function rewrite(text: string): string {
  if (text === '') return 'remove the reported text'
  if (!text.includes('\n') && text.length <= 72) return `rewrite as ${JSON.stringify(text)}`
  return 'one lawful rewrite, which `polymorph fix` applies'
}

/** An alternative as the message names it: `<Inline gap>`, `--pm-space-4`, with its rung. */
function alternative(answer: Alternative): string {
  const named =
    answer.member !== undefined
      ? `<${answer.member}${answer.prop === undefined ? '' : ` ${answer.prop}`}>`
      : (answer.token ?? answer.prop ?? '')
  return answer.rung === null ? named : `${named} (rung ${answer.rung})`
}

/** The rungs that answer a rule: `rung 1 variant selection · rung 4 …`, or what to do without one. */
function climbLine(climb: readonly { rung: number; name: string }[]): string {
  if (climb.length === 0) return 'no rung: fix the code'
  return climb.map((rung) => `rung ${rung.rung} ${rung.name.toLowerCase()}`.trimEnd()).join(' · ')
}

/** One line for each spec fault: `file  path  message`. */
export const faultLines = (name: string, faults: readonly Fault[]): string[] =>
  faults.map((fault) => `${name}  ${fault.path || '(document)'}  ${fault.message}`)

/**
 * The last line of a check: how many reports and faults, or that there were
 * none, then how many warnings, which leave the answer lawful.
 */
export function countLine(counts: {
  violations: number
  faults: number
  unread: number
  warnings?: number
}): string {
  const parts = [
    counts.violations > 0 ? plural(counts.violations, 'violation') : '',
    counts.faults > 0 ? plural(counts.faults, 'fault') : '',
    counts.unread > 0 ? `${plural(counts.unread, 'file')} not read` : '',
  ].filter(Boolean)
  const said = parts.length === 0 ? 'No violations.' : `${parts.join(', ')}.`
  const warnings = counts.warnings ?? 0
  return warnings > 0 ? `${said} ${plural(warnings, 'warning')}.` : said
}

/** How a warning is marked after its rule, as `polymorph check` marks one. */
export const WARNING = ' (warning)'

export const plural = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? '' : 's'}`

/* -------------------------------------------------------------------------- */
/* Looking up                                                                 */
/* -------------------------------------------------------------------------- */

/** One line for each hit: name, tier, origin, purpose, and what it matched on. */
export function searchLines(hits: readonly SearchHit[], query: string | undefined): string[] {
  if (hits.length === 0) {
    return [query === undefined ? 'No member.' : `No member matches "${query}".`]
  }
  const name = Math.max(...hits.map((hit) => hit.name.length))
  const tier = Math.max(...hits.map((hit) => hit.tier.length))
  return hits.map(
    (hit) =>
      `${hit.name.padEnd(name)}  ${hit.tier.padEnd(tier)}  ${hit.purpose}  (${hit.origin}; ` +
      `matched ${hit.matched})`,
  )
}

export interface ComponentReading {
  component: RegistryComponent
  types?: RegistryDataType[]
  files?: { path: string; contents: string }[]
}

/** A Markdown code span that holds any text: a backtick inside widens the fence. */
const code = (text: string): string => {
  const fence = text.includes('`') ? '``' : '`'
  return `${fence}${fence.length > 1 ? ' ' : ''}${text}${fence.length > 1 ? ' ' : ''}${fence}`
}

/** The longest note a field prints whole. */
const FIELD_DOC_MAX = 320

/**
 * A field's note as the types section prints it: whole, or its first sentence
 * when it is long. A few fields carry the reasoning for a decision, which the
 * source keeps and a reader choosing a value does not need.
 */
function fieldDoc(doc: string): string {
  if (doc.length <= FIELD_DOC_MAX) return doc
  const end = doc.search(/\.\s+[A-Z`]/)
  return end === -1 ? doc : doc.slice(0, end + 1)
}

/**
 * A member as Markdown, as the system card is: its purpose, its props (a
 * trailing `?` marks an optional one), its parts, the fields of the data types
 * its props name, its lawful cells, its
 * states, its data attributes, where it renders, and what it depends on.
 * `framework` narrows the frameworks line to that one framework.
 */
export function componentLines(answer: ComponentReading, framework?: Framework): string[] {
  const member = answer.component
  const lines = [
    `# ${member.name}`,
    '',
    `${member.purpose}. ${member.tier}, ${member.origin}${member.spec === null ? '' : `; spec ${member.spec}`}.`,
    '',
    '## Props',
    '',
    ...member.props.map(
      (prop) =>
        `- ${code(`${prop.name}${prop.optional ? '?' : ''}`)}: ${code(prop.type)}` +
        (prop.doc === undefined ? '' : ` — ${prop.doc}`),
    ),
  ]
  if (member.props.length === 0) lines.push('None.')

  if (member.parts.length > 0) {
    lines.push('', '## Parts', '')
    for (const part of member.parts) {
      const props = part.props.map((prop) => `${prop.name}${prop.optional ? '?' : ''}`)
      lines.push(`- ${code(`${member.name}.${part.name}`)}: ${props.join(', ') || 'no props'}`)
    }
  }

  // The fields of each data type a prop names, so that a prop typed
  // `PromptTrigger[]` can be written from this one reading.
  const types = answer.types ?? []
  if (types.length > 0) lines.push('', '## Types')
  for (const type of types) {
    const params = type.params.length === 0 ? '' : `<${type.params.join(', ')}>`
    lines.push('', `### ${type.name}${params}`, '')
    if (type.union !== undefined) lines.push(`One of ${type.union.map(code).join(', ')}.`)
    for (const field of type.fields) {
      lines.push(
        `- ${code(`${field.name}${field.optional ? '?' : ''}`)}: ${code(field.type)}` +
          (field.doc === undefined ? '' : ` — ${fieldDoc(field.doc)}`),
      )
    }
  }

  if (member.grid !== null) {
    lines.push('', '## Lawful cells', '')
    for (const [variant, tones] of Object.entries(member.grid)) {
      lines.push(`- ${variant}: ${tones.join(', ')}`)
    }
  }

  if (member.states.length > 0)
    lines.push('', '## States', '', ...member.states.map((s) => `- ${s}`))

  if (member.dataAttributes.length > 0) {
    lines.push('', '## Data attributes', '')
    for (const attribute of member.dataAttributes) {
      lines.push(
        `- ${code(attribute.name)}` +
          (attribute.values === undefined ? '' : `: ${attribute.values.join(', ')}`),
      )
    }
  }

  lines.push('', '## Where it renders', '')
  const frameworks = Object.entries(member.frameworks).filter(
    ([name]) => framework === undefined || name === framework,
  )
  for (const [name, entry] of frameworks) {
    lines.push(
      `- ${name}: ${entry.status}${entry.reason === undefined ? '' : ` — ${entry.reason}`}`,
    )
  }
  for (const [name, entry] of Object.entries(member.platforms)) {
    const detail = [
      entry.as,
      entry.reason,
      entry.substitute === undefined ? undefined : `use ${entry.substitute}`,
    ].filter((part) => part !== undefined)
    lines.push(`- ${name}: ${entry.status}${detail.length === 0 ? '' : ` — ${detail.join('; ')}`}`)
  }

  lines.push('', '## Depends on', '')
  lines.push(`- members: ${member.dependencies.components.join(', ') || 'none'}`)
  lines.push(`- packages: ${member.dependencies.packages.join(', ') || 'none'}`)

  if (member.anatomy !== null) lines.push('', '## Anatomy', '', '```text', member.anatomy, '```')

  for (const file of answer.files ?? []) {
    lines.push('', `## ${file.path}`, '', '```', file.contents.replace(/\n$/, ''), '```')
  }
  return lines
}

/** What `get_theme_axes` answers: the catalogue, with its long parts only when asked for. */
export type AxesReading = Omit<ThemeCatalogue, 'customProperties' | 'prepaint' | 'systems'> & {
  systems: (Omit<RegistrySystem, 'tokenValues'> & { tokenValues?: RegistrySystem['tokenValues'] })[]
  customProperties?: string[]
}

/** The theme's parameter space as Markdown: axes, systems, palettes, roles and scales. */
/** The mode a system opens a first visit in, in words: `system` is the device's. */
const opensIn = (mode: string): string => (mode === 'system' ? "in the device's mode" : mode)

export function axesLines(answer: AxesReading): string[] {
  const lines = ['# Theme axes', '', '## Axes', '']
  for (const axis of answer.axes) {
    lines.push(
      `- ${axis.name}: ${axis.values.join(' · ')}${axis.exposed ? '' : ' (not exposed to recipes)'}`,
    )
  }

  lines.push('', '## Systems', '')
  for (const system of answer.systems) {
    const axes = Object.entries(system.axes).map(([axis, value]) => `${axis} ${value}`)
    const fonts = system.fonts.map((font) => font.family).join(', ')
    lines.push(
      `- ${system.name} (${system.kind}): palette ${system.defaultPalette}, opens ${opensIn(system.defaultMode)}; ` +
        `${axes.join(', ')}; fonts ${fonts}`,
    )
  }

  lines.push('', '## Palettes', '')
  for (const palette of answer.palettes) lines.push(`- ${paletteLine(palette)}`)

  lines.push('', '## Colour roles', '')
  for (const [group, roles] of Object.entries(answer.colorRoles)) {
    lines.push(`- ${group}: ${roles.join(', ')}`)
  }

  lines.push('', '## Scales', '')
  for (const [scale, steps] of Object.entries(answer.scales))
    lines.push(`- ${scale}: ${steps.join(' · ')}`)

  lines.push('', '## Standard density', '')
  for (const [family, steps] of Object.entries(answer.standardDensity)) {
    const values = Object.entries(steps).map(([step, value]) => `${step} ${value}`)
    lines.push(`- ${family}: ${values.join(' · ')}`)
  }

  const renamed = [
    ...Object.entries(answer.renamed.systems).map(([from, to]) => `system ${from} → ${to}`),
    ...Object.entries(answer.renamed.palettes).map(([from, to]) => `palette ${from} → ${to}`),
  ]
  if (renamed.length > 0) lines.push('', '## Renamed', '', ...renamed.map((entry) => `- ${entry}`))

  if (answer.customProperties !== undefined) {
    lines.push(
      '',
      '## Custom properties',
      '',
      ...answer.customProperties.map((name) => `- ${name}`),
    )
  }

  for (const system of answer.systems) {
    if (system.tokenValues === undefined) continue
    lines.push('', `## Token values: ${system.name}`, '')
    for (const [family, values] of Object.entries(system.tokenValues)) {
      for (const [property, value] of Object.entries(values)) lines.push(`- ${property}: ${value}`)
      if (Object.keys(values).length === 0) lines.push(`- ${family}: none`)
    }
  }
  return lines
}

function paletteLine(palette: RegistryPalette): string {
  const parts = [`accent ${palette.accentHue}°`]
  if (palette.gradientHue !== undefined) parts.push(`gradient ${palette.gradientHue}°`)
  if (palette.neutralHue !== undefined) parts.push(`neutral ${palette.neutralHue}°`)
  parts.push(`tint ${palette.neutralTint}`, `chroma ${palette.chromaBudget}`)
  if (palette.moreContrast !== undefined) parts.push(`more contrast ${palette.moreContrast}`)
  return `${palette.name}: ${parts.join(', ')}`
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                  */
/* -------------------------------------------------------------------------- */

export interface RenderReading {
  ok: boolean
  fatal: string | null
  specFaults?: Fault[]
  pairing?: { system: string; palette: string; mode: string }
  states?: {
    state: string
    inputs: { name: string; from: string; value?: string }[]
    views: {
      viewport: string
      window: { width: number; height: number }
      pageHeight: number
      image: number
      imageHeight: number
      faults: { kind: string; element: string; message: string }[]
      truncated: string[]
      failed: { path: string; component: string; message: string }[]
    }[]
  }[]
  blocked?: string[]
  errors?: string[]
}

/** The file a view's picture is written to: `<state>-<viewport>.png`. */
export const pictureName = (state: string, viewport: string): string => `${state}-${viewport}.png`

/**
 * The drawing as lines: the pairing, then each view with the path of its
 * picture and its faults under it, how each input was filled, and what the
 * page refused or threw.
 */
export function renderLines(
  name: string,
  answer: RenderReading,
  picture: (state: string, viewport: string) => string,
): string[] {
  const lines: string[] = []
  if (answer.fatal !== null) lines.push(`${name}  not drawn: ${answer.fatal}`)
  lines.push(...faultLines(name, answer.specFaults ?? []))
  if (answer.pairing !== undefined) {
    const { system, palette, mode } = answer.pairing
    lines.push(`${system} + ${palette}, ${mode}`)
  }

  for (const state of answer.states ?? []) {
    const fills = state.inputs.map(
      (input) =>
        `${input.name} (${input.from}${input.value === undefined ? '' : ` ${input.value}`})`,
    )
    if (fills.length > 0) lines.push(`  ${state.state} inputs: ${fills.join(', ')}`)
    for (const view of state.views) {
      const cut = view.imageHeight < view.pageHeight ? `, pictured to ${view.imageHeight}px` : ''
      lines.push(
        `${state.state} ${view.viewport}  ${view.window.width}×${view.window.height}, page ` +
          `${view.pageHeight}px${cut}  ${picture(state.state, view.viewport)}`,
      )
      for (const fault of view.faults) {
        lines.push(`    ${fault.kind}  ${fault.element}  ${fault.message}`)
      }
      for (const failure of view.failed) {
        lines.push(`    failed  ${failure.component} at ${failure.path}  ${failure.message}`)
      }
      for (const text of view.truncated) lines.push(`    truncated  ${text}`)
    }
  }

  for (const url of answer.blocked ?? []) lines.push(`  blocked  ${url}`)
  for (const error of answer.errors ?? []) lines.push(`  page error  ${error}`)
  return lines
}

/* -------------------------------------------------------------------------- */
/* Themes                                                                     */
/* -------------------------------------------------------------------------- */

export interface ProposalReading {
  system: unknown
  palette: unknown
  basedOn: { system: string; palette: string }
  rationale: { word: string; why: string; moves: { field: string; from: string; to: string }[] }[]
  unmapped: string[]
  /** The words in `unmapped` the table read and could not apply, each with why. */
  unread: { word: string; why: string }[]
  lawful: boolean
  faults: string[]
}

/** The name a theme document carries, for a line that names it. */
const nameOf = (document: unknown): string => {
  const name = (document as { name?: unknown } | null)?.name
  return typeof name === 'string' ? name : '(unnamed)'
}

/** A proposal: what it is called, where it started, what each word moved, and the verdict. */
export function proposalLines(answer: ProposalReading): string[] {
  const lines = [
    `${nameOf(answer.system)} + ${nameOf(answer.palette)}, from ` +
      `${answer.basedOn.system} + ${answer.basedOn.palette}`,
  ]
  for (const entry of answer.rationale) {
    lines.push(`  ${entry.word}  ${entry.why}`)
    for (const move of entry.moves) lines.push(`    ${move.field}  ${move.from} → ${move.to}`)
    if (entry.moves.length === 0) lines.push('    no change: the draft already had these values')
  }
  const explained = new Set(answer.unread.map((entry) => entry.word))
  const unknown = answer.unmapped.filter((word) => !explained.has(word))
  if (unknown.length > 0) lines.push(`  not in the table: ${unknown.join(', ')}`)
  for (const entry of answer.unread) lines.push(`  not read: ${entry.word} — ${entry.why}`)
  lines.push(answer.lawful ? 'Lawful.' : 'Not lawful:')
  for (const fault of answer.faults) lines.push(`  ${fault}`)
  return lines
}

export interface SavedReading {
  saved: boolean
  faults: string[]
  written: string[]
  unchanged: string[]
  existing: string[]
  fonts: { family: string; package: string }[]
  notes: string[]
  next: string
}

/** A save: what was written, what was already there, the fonts to install, and what to do next. */
export function savedLines(answer: SavedReading): string[] {
  const lines: string[] = []
  for (const path of answer.written) lines.push(row('wrote', path))
  for (const path of answer.unchanged) lines.push(row('unchanged', path))
  for (const path of answer.existing) lines.push(row('kept yours', path))
  for (const fault of answer.faults) lines.push(`  ${fault}`)
  if (answer.fonts.length > 0) {
    lines.push(row('fonts', answer.fonts.map((font) => font.package).join(', ')))
  }
  for (const note of answer.notes) lines.push(`  · ${note}`)
  lines.push(answer.next)
  return lines
}
