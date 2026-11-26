import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { buildRegistry, renderSystemCard, type Registry } from '@polymorph/registry'
// The engine, so `propose_theme`'s verdict is checked against a second run of
// the laws instead of against itself.
import {
  auditCoherence,
  auditPairings,
  composeTheme,
  MAX_NEUTRAL_TINT,
  parsePalette,
  parseSystem,
  resolveTheme,
} from '@polymorph/theme'
import { describe, expect, it } from 'vitest'

import {
  DEGREES,
  fix,
  getComponent,
  getInstallPlan,
  getSystemCard,
  getThemeAxes,
  IGNORED,
  PROJECTIONS,
  proposeTheme,
  searchComponents,
  UnknownComponentError,
  UnknownItemError,
  validate,
  vocabulary,
  type ToolContext,
} from './tools'

/**
 * What an agent can learn, tested without a protocol.
 *
 * The tools are ordinary functions, so this file needs no subprocess, no
 * transport and no client. `transcript.test.ts` supplies those, once, over the
 * real server. This file checks the *answers*: that discovery ranks results the
 * way an agent needs, that a wrong name gets a correction instead of an empty
 * list, and that `validate` names the rung to climb.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const registry: Registry = buildRegistry(ROOT)
const context: ToolContext = { registry, root: ROOT }

describe('search_components', () => {
  it('puts an exact name first, and says that is why', () => {
    const [first] = searchComponents(context, { query: 'dialog' })
    expect(first?.name).toBe('Dialog')
    expect(first?.matched).toBe('name')
    expect(first?.purpose).toContain('Modal')
  })

  it('ranks a name above a mention of the same word', () => {
    const hits = searchComponents(context, { query: 'toast' })
    expect(hits[0]?.name).toBe('Toast')
    // Other members mention toasts in their purpose, and none may outrank the
    // member with that name. An agent that asks for Toast and gets Toaster's
    // neighbours will build its own.
    expect(hits.slice(1).every((hit) => hit.matched !== 'name')).toBe(true)
  })

  it('finds a component by its purpose when the name does not match', () => {
    const hits = searchComponents(context, { query: 'keyboard' })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.every((hit) => hit.matched !== 'name')).toBe(true)
  })

  it('finds one by a prop, and names the prop', () => {
    const hits = searchComponents(context, { query: 'clearable' })
    const combobox = hits.find((hit) => hit.name === 'Combobox')
    expect(combobox?.matched).toContain('clearable')
  })

  it('lists the catalogue when asked nothing', () => {
    // "What is in this system" is the question before "what do you call a
    // dropdown", and a search that demanded a term would make an agent guess.
    const all = searchComponents(context, { limit: 200 })
    expect(all).toHaveLength(registry.components.length)
    expect(all.every((hit) => hit.matched === 'listed')).toBe(true)
  })

  it('narrows by tier and by which side of the boundary a member sits on', () => {
    const archetypes = searchComponents(context, { tier: 'archetypes', limit: 100 })
    expect(archetypes.length).toBeGreaterThan(4)
    expect(archetypes.every((hit) => hit.tier === 'archetypes')).toBe(true)

    const installed = searchComponents(context, { origin: 'installed', limit: 100 })
    expect(installed.map((hit) => hit.name)).toEqual(['Icon'])
  })

  it('returns nothing for a word the system does not use', () => {
    // A word no member's name or purpose uses.
    expect(searchComponents(context, { query: 'zeppelin' })).toEqual([])
  })

  it('leaves out what a platform lacks, and searches the web when told nothing', () => {
    // The web is the vocabulary itself, so the default is the whole catalogue.
    expect(searchComponents(context, { limit: 200 })).toHaveLength(registry.components.length)

    const ios = searchComponents(context, { platform: 'ios', limit: 200 }).map((hit) => hit.name)
    expect(ios).not.toContain('Tooltip')
    expect(ios).toContain('Dialog')
    expect(ios).toHaveLength(
      registry.components.filter((component) => component.platforms.ios.status !== 'absent').length,
    )
  })
})

describe('get_component', () => {
  it('answers with the fields of each data type a prop names, and the types those name', () => {
    const { types } = getComponent(context, { name: 'PromptInput' })
    const names = types.map((type) => type.name)
    // `triggers` is typed `PromptTrigger[]`, whose `options` is typed `PromptTriggerOption[]`.
    expect(names).toContain('PromptTrigger')
    expect(names).toContain('PromptTriggerOption')
    const trigger = types.find((type) => type.name === 'PromptTrigger')
    expect(trigger?.fields.map((field) => field.name)).toContain('char')
    // Each type is the registry's own entry, and a member whose props name none has none.
    for (const type of types) expect(registry.dataTypes).toContain(type)
    expect(new Set(names).size).toBe(names.length)
    expect(getComponent(context, { name: 'Separator' }).types).toEqual([])
  })

  it('answers with the description, not the files', () => {
    const { component, files } = getComponent(context, { name: 'Button' })
    expect(files).toBeUndefined()
    // The grid is keyed by variant and lists the tones lawful with each. There
    // is no neutral *filled* button, and the table shows that.
    expect(Object.keys(component.grid ?? {})).toContain('solid')
    expect(component.grid?.['solid']).toEqual(['accent', 'danger'])
    expect(component.grid?.['outline']).toContain('neutral')
    expect(component.props.map((prop) => prop.name)).toContain('label')
    expect(component.states.length).toBeGreaterThan(5)
    // An attribute plus the values its CSS sets. The front passes on what the
    // registry derived from the stylesheet and adds nothing.
    expect(component.dataAttributes).toContainEqual({
      name: 'data-variant',
      values: ['ghost', 'outline', 'soft', 'solid'],
    })
  })

  it('returns the three files that make up the component, when asked', () => {
    const { files } = getComponent(context, { name: 'button', source: true })
    expect(files?.map((file) => file.path)).toEqual([
      'packages/react-ui/src/controls/Button.tsx',
      'packages/recipes/src/controls/button.module.css',
      'packages/react-ui/src/controls/button.states.tsx',
    ])
    // Byte for byte what is on disk. The registry named the path and the tool
    // followed it. Anything else would be a second copy of the source.
    for (const file of files ?? []) {
      expect(file.contents).toBe(readFileSync(resolve(ROOT, file.path), 'utf8'))
    }
  })

  it('does not confuse the component with its closure', () => {
    // Dialog has three files of its own and an install closure of fourteen. An
    // agent that asked to see Dialog and got Input, FormField and Stack would
    // waste its context. The closure is `get_install_plan`'s answer.
    const { files } = getComponent(context, { name: 'Dialog', source: true })
    expect(files).toHaveLength(3)
  })

  it('takes any spelling of the name', () => {
    for (const spelling of ['DatePicker', 'date-picker', 'datepicker']) {
      expect(getComponent(context, { name: spelling }).component.name, spelling).toBe('DatePicker')
    }
  })

  it('corrects a wrong name instead of returning nothing', () => {
    // An agent told "no such component" builds one. An agent told "did you mean
    // Dialog" does not.
    expect(() => getComponent(context, { name: 'Dialogue' })).toThrow(UnknownComponentError)
    expect(() => getComponent(context, { name: 'Dialogue' })).toThrow('"Dialog"')
  })

  it('answers the industry word with the component the system has', () => {
    // No edit distance finds this case: an agent asks for `Modal` because that
    // is the common name. The suggestion comes from search, which reads
    // purposes, and Dialog's starts "Modal interruption".
    expect(() => getComponent(context, { name: 'Modal' })).toThrow('"Dialog"')

    // The limit of that approach: a synonym that no purpose uses gets no
    // suggestion. `Snackbar` appears nowhere in the vocabulary's own prose, so
    // the correct answer is "no component called Snackbar". Adding the word to a
    // docstring to make this line pass would describe the system to the test
    // instead of to a reader.
    expect(() => getComponent(context, { name: 'Snackbar' })).toThrow('no component called')
  })
})

describe('get_install_plan', () => {
  it('is the CLI’s resolver, not a second opinion about what an install is', () => {
    const plan = getInstallPlan(context, { items: ['button', 'theme:pastel'] })
    expect(plan.requested).toEqual(['Button'])
    expect(plan.systems[0]?.fonts.map((font) => font.package)).toContain(
      '@fontsource-variable/plus-jakarta-sans',
    )
    // The pairing bundle, resolved by the CLI and reported unchanged: a system
    // and the palette it declares, which an agent would otherwise have to know
    // to ask for separately.
    expect(plan.systems[0]?.defaultPalette).toBe('amethyst')
    expect(plan.palettes.map((palette) => palette.name)).toEqual(['amethyst'])
    expect(plan.files.map((file) => file.to)).toContain(
      'src/polymorph/conventions/focus.module.css',
    )
    expect(plan.packages['@polymorph/react']).toBe(`^${registry.version}`)
  })

  it('resolves the palette form the same way the CLI does', () => {
    const plan = getInstallPlan(context, { items: ['palette:orchid'] })
    expect(plan.systems).toEqual([])
    expect(plan.palettes.map((palette) => palette.file.to)).toEqual([
      'src/polymorph/themes/palettes/orchid.json',
    ])
    // A palette carries no fonts. It still asks for the engine, whose runtime
    // the generated theme module imports, and for the rules, which the
    // generated lint configs import. It vendors no member, so not the React
    // foundation.
    expect(plan.packages).toEqual({
      '@polymorph/engine': registry.packages['@polymorph/engine'],
    })
    expect(plan.devPackages).toEqual({
      '@polymorph/rules': registry.packages['@polymorph/rules'],
    })
  })

  it('plans the rung `validate` sends an agent to', () => {
    // A violation's climb ends at `Bespoke`. An agent told to declare a zone but
    // unable to install one would be stuck. The person it passed the command to
    // would find `polymorph add bespoke` refusing a name the same server had
    // just recommended.
    const plan = getInstallPlan(context, { items: ['bespoke'] })
    expect(plan.requested).toEqual(['Bespoke'])
    expect(plan.files.map((file) => file.to)).toContain('src/polymorph/exceptions/Bespoke.tsx')
  })

  it('writes nothing', () => {
    // The tool is annotated read-only, and this checks that it is. The plan is
    // a description. Applying it is `install`, a different tool whose own
    // annotations say so.
    const before = readFileSync(resolve(ROOT, 'package.json'), 'utf8')
    getInstallPlan(context, { items: ['dialog'] })
    expect(readFileSync(resolve(ROOT, 'package.json'), 'utf8')).toBe(before)
  })

  it('passes a bad item’s correction through', () => {
    expect(() => getInstallPlan(context, { items: ['pastel'] })).toThrow(UnknownItemError)
    expect(() => getInstallPlan(context, { items: ['pastel'] })).toThrow('"theme:pastel"')
    // Including the correction for a palette asked for as a theme.
    expect(() => getInstallPlan(context, { items: ['theme:orchid'] })).toThrow('"palette:orchid"')
  })
})

describe('get_system_card and get_theme_axes', () => {
  it('renders the card the registry renders', () => {
    const card = getSystemCard(context)
    expect(card).toContain('# Polymorph')
    expect(card.length).toBeGreaterThan(5_000)
    // The budget is set and justified in `packages/registry/src/card.test.ts`.
    // This is the same number, checked from the tool that serves the card.
    expect(card.length).toBeLessThan(40_871)
  })

  it('renders the card for a platform, from the registry, and the web card by default', () => {
    expect(getSystemCard(context)).toBe(renderSystemCard(registry))
    const android = getSystemCard(context, { platform: 'android' })
    expect(android).toBe(renderSystemCard(registry, { platform: 'android' }))
    expect(android).toContain('Rendered for **android**')
    expect(android).not.toContain('- **BarChart**')
    expect(android).toContain('- **Dialog** (adapted:')
  })

  it('gives the axes and both halves of a theme, and keeps the long list behind a flag', () => {
    const theme = getThemeAxes(context)
    expect(theme.axes).toHaveLength(8)
    // The split as an agent sees it: two lists that combine, not one list of pairs.
    expect(theme.systems.map((system) => system.name)).toContain('pastel')
    expect(theme.palettes.map((palette) => palette.name)).toContain('orchid')
    expect(theme.systems.find((system) => system.name === 'pastel')?.defaultPalette).toBe(
      'amethyst',
    )
    expect(theme.customProperties).toBeUndefined()

    expect(getThemeAxes(context, { customProperties: true }).customProperties?.length).toBe(
      registry.theme.customProperties.length,
    )
  })

  it('keeps each system’s token values behind a flag', () => {
    // Every system's values together are larger than the rest of the answer.
    const lean = getThemeAxes(context)
    for (const system of lean.systems) expect(system, system.name).not.toHaveProperty('tokenValues')
    expect(JSON.stringify(lean).length).toBeLessThan(
      JSON.stringify(registry.theme.systems.map((system) => system.tokenValues)).length,
    )

    const full = getThemeAxes(context, { tokenValues: true })
    expect(full.systems).toEqual(registry.theme.systems)
    expect(full.customProperties).toBeUndefined()
    // The registry itself keeps them: the answer leaves them out, it does not remove them.
    expect(registry.theme.systems.every((system) => system.tokenValues !== undefined)).toBe(true)
  })

  it('does not answer a theme question with a script tag', () => {
    // The pre-paint script is an install detail and it is in the install plan.
    expect(JSON.stringify(getThemeAxes(context))).not.toContain('localStorage')
  })
})

describe('validate', () => {
  const screen = (body: string) => `export function Screen() {\n  return ${body}\n}\n`

  it('passes a screen that only composes and binds', async () => {
    const answer = await validate(context, {
      code: "import { Button } from '@polymorph/react-ui'\n\n" + screen('<Button label="Save" />'),
    })
    expect(answer.violations).toEqual([])
    expect(answer.ok).toBe(true)
  })

  it('reports a warning apart from the violations, and calls the source lawful', async () => {
    const answer = await validate(context, {
      code:
        "import { Button, Inline } from '@polymorph/react-ui'\n\n" +
        screen(
          '<Inline><Button tone="danger" label="Delete" /><Button variant="outline" tone="neutral" label="Keep" /></Inline>',
        ),
    })
    expect(answer.ok).toBe(true)
    expect(answer.violations).toEqual([])
    expect(answer.warnings?.map((warning) => [warning.rule, warning.severity])).toEqual([
      ['polymorph/danger-last', 'warning'],
    ])
    expect(answer.warnings?.[0]?.climb.map((rung) => rung.rung)).toEqual([1, 4])
  })

  it('reports a style decision with the rungs that answer it', async () => {
    const answer = await validate(context, {
      code: screen("<div style={{ padding: 12, color: 'rebeccapurple' }} />"),
    })

    const [violation] = answer.violations ?? []
    expect(answer.ok).toBe(false)
    expect(violation?.rule).toBe('polymorph/no-raw-styles')
    expect(violation?.line).toBe(2)
    expect(violation?.law).toContain('does not express style')

    // The rungs turn a refusal into an instruction. Highest rung first: the
    // variant probably exists, then a token patch, then a declared zone.
    expect(violation?.climb.map((rung) => rung.rung)).toEqual([1, 3, 4])
    expect(violation?.climb[0]?.name).toContain('Variant')
    expect(violation?.climb[2]?.declaredAs).toBe('Bespoke | ThirdParty')
  })

  it('has a rung for every violation it can report on a screen', async () => {
    const answer = await validate(context, {
      code: readFileSync(resolve(ROOT, 'packages/rules/fixtures/app-violations.tsx'), 'utf8'),
      filename: 'apps/app/src/Screen.tsx',
    })
    expect((answer.violations ?? []).length).toBeGreaterThan(4)
    for (const violation of answer.violations ?? []) {
      expect(violation.law, violation.rule).not.toBe('')
      // `scoped-token-owners` is the one application rule with no rung. That is
      // declared, not a gap: the answer is ownership.
      if (violation.rule !== 'polymorph/scoped-token-owners') {
        expect(violation.climb.length, violation.rule).toBeGreaterThan(0)
      }
    }
  })

  it('routes CSS to Stylelint, and guesses when it is not told', async () => {
    const answer = await validate(context, { code: '.hero {\n  transition: opacity 200ms;\n}\n' })
    expect(answer.filename?.endsWith('.css')).toBe(true)
    expect(answer.violations?.[0]?.rule).toBe('polymorph/no-motion-outside-vocabulary')
    // Rung 1 when the motion is a member's own, rung 4 for a one-off.
    expect(answer.violations?.[0]?.climb.map((rung) => rung.rung)).toEqual([1, 4])
  })

  it('holds the vocabulary to its own laws instead of the screen’s', async () => {
    const css = '.button {\n  padding: 12px;\n  color: rebeccapurple;\n}\n'
    const vocabulary = await validate(context, { code: css, surface: 'vocabulary' })
    expect((vocabulary.violations ?? []).map((violation) => violation.rule)).toContain(
      'polymorph/token-values-only',
    )

    // A component *is* where style decisions belong, so the same file judged as
    // a component is unlawful for writing raw values, not for making decisions.
    const application = await validate(context, { code: css })
    expect(application.violations).toEqual([])
  })

  it('says a fragment is unparseable rather than calling it lawful', async () => {
    const answer = await validate(context, { code: 'export function Broken() { return <div>\n' })
    expect(answer.ok).toBe(false)
    expect(answer.violations).toEqual([])
    expect(answer.fatal).toBeTruthy()
  })

  it('never executes the code it is given', async () => {
    // This property makes an open `validate` safe. If the code were evaluated
    // instead of parsed, the module-level throw would surface as a crash instead
    // of a lint result.
    const answer = await validate(context, {
      code: "throw new Error('executed')\nexport const x = 1\n",
    })
    expect(answer.fatal).toBeNull()
    expect(answer.violations).toEqual([])
  })
})

/**
 * `propose_theme` is the one tool that answers about something that does not
 * exist yet, so its answer must be *checked*, not looked up.
 *
 * The tests check the three claims the tool makes, not only whether it changes
 * an axis: its candidates are schema-valid by construction, its verdict comes
 * from the engine, and a word it does not know is returned, not guessed at.
 */
describe('fix', () => {
  /** A screen as it is written without the system. */
  const code =
    "import { Card } from '@polymorph/react-ui'\n" +
    "import { Trash2 } from 'lucide-react'\n\n" +
    'export const Row = ({ onDelete }) => (\n' +
    '  <Card className="p-4">\n' +
    "    <div style={{ display: 'flex' }}>\n" +
    '      <Trash2 />\n' +
    '      <button type="button" onClick={onDelete}>Delete</button>\n' +
    '    </div>\n' +
    '  </Card>\n' +
    ')\n'

  it('returns the code with every single-answer violation rewritten', async () => {
    const answer = await fix(context, { code })

    expect(answer.changed).toBe(true)
    expect(answer.code).toContain("import { Card, Icon, Button } from '@polymorph/react-ui'")
    expect(answer.code).toContain('<Icon name="delete" />')
    expect(answer.code).toContain('<Button label="Delete" onClick={onDelete} />')
    expect(answer.code).toContain('<Card>')
    expect(answer.code).not.toContain('lucide-react')
    expect(answer.fixed).toEqual({
      'polymorph/no-external-icons': 1,
      'polymorph/no-raw-interactive': 1,
      'polymorph/no-raw-styles': 1,
    })
  })

  it('leaves the decisions, and says which rungs answer them', async () => {
    const answer = await fix(context, { code })

    // The `style` on a plain element is live layout. Its replacement (a layout
    // primitive, a patch, a zone) is a choice, so it is reported as `validate`
    // reports it, not chosen.
    expect(answer.ok).toBe(false)
    expect(answer.violations.map((violation) => violation.rule)).toEqual([
      'polymorph/no-raw-styles',
    ])
    expect(answer.violations[0]?.climb.map((rung) => rung.rung)).toEqual([1, 3, 4])
  })

  it('reports what `validate` reports about the code it returns', async () => {
    // Both tools share one path, so an agent that fixes and then validates gets
    // the same answer twice, not two different answers.
    const answer = await fix(context, { code })
    const checked = await validate(context, { code: answer.code })
    expect(answer.violations).toEqual(checked.violations)
  })

  it('returns lawful code as it was', async () => {
    const lawful =
      'import { Button } from \'@polymorph/react-ui\'\n\nexport const A = () => <Button label="Save" />\n'
    expect(await fix(context, { code: lawful })).toMatchObject({
      ok: true,
      changed: false,
      code: lawful,
      fixed: {},
      violations: [],
    })
  })

  it('reports a stylesheet the way `validate` does, and rewrites none of it', async () => {
    // No CSS rule has a fix. A wrong token name is usually a guess, and the
    // nearest real name is a different token, not a correction.
    const css = '.hero {\n  color: var(--pm-accent-fg);\n}\n'
    const answer = await fix(context, { code: css })

    expect(answer.filename.endsWith('.css')).toBe(true)
    expect(answer).toMatchObject({ ok: false, changed: false, code: css, fixed: {} })
    expect(answer.violations).toEqual((await validate(context, { code: css })).violations)
    expect(answer.violations[0]?.message).toContain('Did you mean')
  })

  it('does not import `Button` from a package a vendoring project does not have', async () => {
    // Recorded as vendoring: an install manifest, and no dependency on the
    // vocabulary's package. Its members are imported by path, so there is no
    // single module a rewritten `<button>` could name.
    const vendoring = mkdtempSync(resolve(tmpdir(), 'polymorph-mcp-vendored-'))
    writeFileSync(resolve(vendoring, 'package.json'), '{ "dependencies": {} }')
    writeFileSync(resolve(vendoring, 'polymorph.json'), '{}')

    const answer = await fix({ ...context, project: vendoring }, { code })
    rmSync(vendoring, { recursive: true, force: true })

    expect(answer.code).toContain('<button type="button" onClick={onDelete}>')
    expect(answer.code).not.toContain('Button')
    // The icon gateway ships in `@polymorph/react`, which a vendoring project
    // does have.
    expect(answer.code).toContain('<Icon name="delete" />')
  })

  it('changes nothing in a fragment it cannot parse, and says so', async () => {
    const broken = 'export const A = () => <button onClick={send}>Send</button'
    const answer = await fix(context, { code: broken })
    expect(answer.fatal).not.toBeNull()
    expect(answer.code).toBe(broken)
    expect(answer.changed).toBe(false)
  })
})

describe('propose_theme', () => {
  it('maps intent words to axis and seed moves, and says which word did what', () => {
    // Based on a named system, not the catalogue's first. The default base is
    // alphabetical, and `dew` sorts first and already uses Fraunces. From there
    // "editorial" has no display move to make, and the claim below would test
    // the catalogue's order instead of the table.
    const answer = proposeTheme(context, {
      intent: 'calmer, more editorial, warmer paper',
      basedOn: { system: 'flint' },
    })

    const words = answer.rationale.map((entry) => entry.word)
    expect(words).toEqual(['calmer', 'editorial', 'warmer', 'paper'])

    // Every entry carries the table's own sentence, so an agent reading the
    // answer learns the *reason* and not only the diff.
    for (const entry of answer.rationale) expect(entry.why.length).toBeGreaterThan(20)

    const fields = answer.rationale.flatMap((entry) => entry.moves.map((move) => move.field))
    expect(fields).toContain('axes.typePersonality')
    expect(fields).toContain('axes.motionTemperament')
    expect(fields).toContain('palette.accentHue')
    expect(fields).toContain('palette.neutralTint')
    // "Editorial" is a type decision first: the display slot takes the
    // catalogue's own editorial face instead of a font name hard-coded here.
    expect(fields).toContain('fonts.display')
  })

  it('produces candidates the schemas accept', () => {
    // The claim is "schema-valid by construction", which means something only if
    // something other than the tool checks it.
    for (const intent of [
      'calmer',
      'bolder, gradient, layered',
      'monochrome still dense technical',
      'stark warm grain dark',
      '',
    ]) {
      const answer = proposeTheme(context, { intent })
      expect(() => parseSystem(answer.system), intent).not.toThrow()
      expect(() => parsePalette(answer.palette), intent).not.toThrow()
      // The pair is proposed together, so the system names the palette beside it.
      expect((answer.system as { defaultPalette: string }).defaultPalette).toBe(
        (answer.palette as { name: string }).name,
      )
    }
  })

  it('carries a heading face the system states, and none for a system without one', () => {
    const plain = proposeTheme(context, { intent: 'calmer', basedOn: { system: 'plain' } })
    expect((plain.system as { fonts: object }).fonts).not.toHaveProperty('heading')

    // The catalogue states no heading face, so the test gives plain one.
    const headed: Registry = {
      ...registry,
      theme: {
        ...registry.theme,
        systems: registry.theme.systems.map((system) =>
          system.name !== 'plain'
            ? system
            : {
                ...system,
                fonts: [
                  ...system.fonts.map((font) => ({
                    ...font,
                    roles: font.roles.filter((role) => role !== 'heading'),
                  })),
                  {
                    roles: ['heading'],
                    family: 'Source Serif 4 Variable',
                    package: '@fontsource-variable/source-serif-4',
                  },
                ],
              },
        ),
      },
    }
    const answer = proposeTheme(
      { registry: headed },
      { intent: 'calmer', basedOn: { system: 'plain' } },
    )
    expect(answer.lawful).toBe(true)
    expect(parseSystem(answer.system).fonts.heading).toEqual({ family: 'Source Serif 4 Variable' })
  })

  it('clamps at the end of a scale', () => {
    // Ten "calmer"s cannot take a budget below `none` or motion below `none`,
    // and a seed cannot leave the range the schema allows. Repetition is the
    // cheapest way to find an unbounded move.
    const answer = proposeTheme(context, { intent: 'calmer '.repeat(10) })
    const palette = answer.palette as { chromaBudget: string; neutralTint: number }
    expect(palette.chromaBudget).toBe('none')
    expect(palette.neutralTint).toBeGreaterThanOrEqual(0)
    expect(() => parsePalette(answer.palette)).not.toThrow()

    const warm = proposeTheme(context, { intent: 'warmer '.repeat(20) })
    expect((warm.palette as { neutralTint: number }).neutralTint).toBeLessThanOrEqual(
      MAX_NEUTRAL_TINT,
    )
  })

  it('returns a word it does not know instead of guessing at one', () => {
    const answer = proposeTheme(context, { intent: 'make it feel zesty and brutalist' })
    expect(answer.unmapped).toEqual(['zesty', 'brutalist'])
    // Nothing changed, because no word was understood. A proposal that changed
    // an axis here would mean the tool invented a meaning.
    expect(answer.rationale).toEqual([])
    expect(answer.system).toMatchObject({ axes: expect.any(Object) })
  })

  it('ignores the function words rather than reporting them as misses', () => {
    // A stop list keeps a real miss such as "zesty" from being hidden among
    // articles. The list is data, and this check keeps it apart from the
    // vocabulary and from the words of degree, which are reported.
    const answer = proposeTheme(context, { intent: 'make it feel more calm please' })
    expect(answer.unmapped).toEqual([])
    expect(answer.unread).toEqual([])
    expect(answer.rationale.map((entry) => entry.word)).toEqual(['calm'])
    for (const word of [...IGNORED, ...Object.keys(DEGREES)]) {
      expect(vocabulary()).not.toContain(word)
    }
    for (const word of IGNORED) expect(Object.keys(DEGREES)).not.toContain(word)
  })

  it('reports a word of degree as not read, with why, instead of dropping it', () => {
    // "Slightly rounded" is read as "rounded", the roundest geometry, so the
    // answer has to say that "slightly" moved nothing.
    const answer = proposeTheme(context, {
      intent: 'slightly rounded, a bit denser, very calm, less stark',
      basedOn: { system: 'plain' },
    })
    expect(answer.rationale.map((entry) => entry.word)).toEqual([
      'rounded',
      'denser',
      'calm',
      'stark',
    ])
    expect(answer.unmapped).toEqual(['slightly', 'bit', 'very', 'less'])
    expect(answer.unread.map((entry) => entry.word)).toEqual(answer.unmapped)
    for (const entry of answer.unread) expect(entry.why).toContain('<axis>=<value>')
    expect(answer.unread[0]?.why).toContain('never part of one')
    expect(answer.unread[3]?.why).toContain('does not turn the word after it around')
    // A name every object has is a word like any other, not a degree.
    const unknown = proposeTheme(context, { intent: 'constructor' })
    expect([unknown.unmapped, unknown.unread]).toEqual([['constructor'], []])
  })

  it('sets an axis to the value `<axis>=<value>` names, for every value the catalogue lists', () => {
    // The axes and their values are the registry's, so a value the catalogue
    // gains can be named without a change here.
    for (const { name, values } of registry.theme.axes) {
      for (const value of values) {
        const answer = proposeTheme(context, { intent: `${name}=${value}` })
        expect((answer.system as { axes: Record<string, string> }).axes[name], name).toBe(value)
        expect(answer.unmapped, `${name}=${value}`).toEqual([])
        expect(() => parseSystem(answer.system)).not.toThrow()
      }
    }

    const answer = proposeTheme(context, {
      intent: 'Geometry=Crisp.',
      basedOn: { system: 'plain' },
    })
    expect(answer.rationale).toEqual([
      {
        word: 'geometry=crisp',
        why: expect.stringContaining('sharp, crisp, soft, round'),
        moves: [{ field: 'axes.geometry', from: 'soft', to: 'crisp' }],
      },
    ])
    expect((answer.system as { name: string }).name).toBe('plain-crisp')
  })

  it('reports an axis or a value the catalogue does not have, names the lawful ones, and moves nothing', () => {
    const base = proposeTheme(context, { intent: '', basedOn: { system: 'plain' } })
    const answer = proposeTheme(context, {
      intent: 'geometry=softer shape=round accent=#1F4FD8',
      basedOn: { system: 'plain' },
    })
    expect(answer.rationale).toEqual([])
    expect(answer.system).toEqual(base.system)
    expect(answer.unmapped).toEqual(['geometry=softer', 'shape=round', 'accent=#1F4FD8'])
    const geometry = registry.theme.axes.find((axis) => axis.name === 'geometry')?.values ?? []
    expect(answer.unread.map((entry) => entry.why)).toEqual([
      `geometry takes ${geometry.join(', ')}`,
      `no axis is called shape — the axes are ${registry.theme.axes.map((axis) => axis.name).join(', ')}`,
      expect.stringContaining('no axis is called accent'),
    ])
  })

  it('reads an exact value with ordinary words, and lets the later of two on one axis win', () => {
    const mixed = proposeTheme(context, {
      intent: 'denser, geometry=sharp; calmer',
      basedOn: { system: 'plain' },
    })
    expect(mixed.rationale.map((entry) => entry.word)).toEqual([
      'denser',
      'geometry=sharp',
      'calmer',
    ])
    const axes = (answer: { system: unknown }) =>
      (answer.system as { axes: Record<string, string> }).axes
    expect(axes(mixed)).toMatchObject({ density: 'compact', geometry: 'sharp' })

    // As "calmer but bolder" ends bolder.
    const plain = { basedOn: { system: 'plain' } }
    expect(
      axes(proposeTheme(context, { intent: 'rounder geometry=crisp', ...plain })).geometry,
    ).toBe('crisp')
    expect(
      axes(proposeTheme(context, { intent: 'geometry=crisp rounder', ...plain })).geometry,
    ).toBe('round')
  })

  it('lets a later word win a contradiction, the way a sentence does', () => {
    const calm = proposeTheme(context, { intent: 'calmer', basedOn: { system: 'pastel' } })
    const both = proposeTheme(context, {
      intent: 'calmer but bolder',
      basedOn: { system: 'pastel' },
    })
    expect((calm.palette as { chromaBudget: string }).chromaBudget).not.toBe(
      (both.palette as { chromaBudget: string }).chromaBudget,
    )
  })

  it('starts from a named pair when it is given one', () => {
    const answer = proposeTheme(context, {
      intent: 'denser',
      basedOn: { system: 'press', palette: 'petrol' },
    })
    expect(answer.basedOn).toEqual({ system: 'press', palette: 'petrol' })
    expect((answer.palette as { accentHue: number }).accentHue).toBe(
      registry.theme.palettes.find((palette) => palette.name === 'petrol')?.accentHue,
    )
    expect((answer.system as { name: string }).name).toBe('press-dense')
  })

  it('names a base it does not have instead of silently substituting one', () => {
    const answer = proposeTheme(context, { intent: 'calmer', basedOn: { palette: 'chartreuse' } })
    expect(answer.lawful).toBe(false)
    expect(answer.faults[0]).toContain('no palette called "chartreuse"')
    // The catalogue is in the message, so the correction is actionable.
    expect(answer.faults[0]).toContain('amethyst')
    // A complete proposal still comes back, so the agent can see what it would
    // have got.
    expect(() => parseSystem(answer.system)).not.toThrow()
  })

  it('gets its verdict from the engine rather than from the table', () => {
    const answer = proposeTheme(context, { intent: 'stark monochrome grain' })
    expect(answer.lawful).toBe(true)
    expect(answer.faults).toEqual([])

    // The same pair, resolved here. If the tool asserted a verdict instead of
    // measuring one, the two results would differ here.
    const theme = resolveTheme(
      composeTheme(parseSystem(answer.system), parsePalette(answer.palette)),
    )
    expect(auditCoherence(theme.axes, theme.tokens)).toEqual([])
    for (const mode of ['light', 'dark'] as const) {
      expect(auditPairings(theme.color[mode]).filter((result) => !result.passes)).toEqual([])
    }
  })

  it('publishes its vocabulary, and every word in it moves something', () => {
    expect(vocabulary()).toEqual(PROJECTIONS.map((projection) => projection.words[0]))

    // No word may appear in two entries: an intent word that selected two moves
    // would make the answer depend on table order instead of on the sentence.
    const all = PROJECTIONS.flatMap((projection) => [...projection.words])
    expect(new Set(all).size).toBe(all.length)

    // Every canonical word is reachable and changes *some* base. A word in the
    // table that changes nothing would be advertised in the tool's description
    // but have no effect.
    for (const word of vocabulary()) {
      const moved = registry.theme.systems.some((system) => {
        const answer = proposeTheme(context, { intent: word, basedOn: { system: system.name } })
        return answer.rationale[0]?.moves.length ?? 0 > 0
      })
      expect(moved, word).toBe(true)
    }
  })

  it('writes nothing', () => {
    const before = readFileSync(resolve(ROOT, 'design/systems/pastel.json'), 'utf8')
    proposeTheme(context, { intent: 'calmer', basedOn: { system: 'pastel' } })
    expect(readFileSync(resolve(ROOT, 'design/systems/pastel.json'), 'utf8')).toBe(before)
  })
})
