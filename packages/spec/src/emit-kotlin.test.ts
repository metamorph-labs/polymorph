import { execFile, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

import { buildRegistry, type Registry } from '@polymorph/registry'
import { describe, expect, it } from 'vitest'

import { EMITTED_MARKER, emitScreen } from './emit'
import {
  KOTLIN_RULES,
  kotlinNames,
  kotlinPackageOf,
  KotlinPackageError,
  kotlinScreenViolations,
} from './emit-kotlin'
import {
  MissingContractError,
  NATIVE_FILES,
  nativeInputFault,
  readNativePackage,
} from './emit-native'
import { emitCheckedScreen, validateSpec } from './lawful'
import { isElement, SPEC_ID, type ScreenInput, type ScreenSpec, type SpecElement } from './schema'
import { isActionType, type NativePackage } from './validate'

/**
 * The Compose emitter's law (`design/native/screen-contract.md`, "What is
 * checkable"), over what it emits.
 *
 * Relay's three screens for Android (`platforms/android/examples/relay/Screens/`)
 * are emitted against the generated contract and pinned as snapshots, beside
 * the web's and SwiftUI's emissions of the same screens, which
 * `emit-swift.test.ts` pins. Every statement the contract gives the emitter is
 * a test here: the three names and the inert object, the partition of inputs,
 * the prose carried into comments, and no state, coroutine, navigation, theme
 * or token in the file. The validator's faults for an Android screen come back
 * at the contract's paths. The example app (`platforms/android/examples/relay/`)
 * holds the emitted inbox, which must be what the emitter writes today, and on
 * a machine with Gradle it builds and renders.
 *
 * The snapshots are emitted against the member package as if it drew every
 * member it declares (`asIfDrawn`), so each pins what the emitter writes for
 * its screen. Against the package as it is, a screen that uses a member with
 * no Compose rendering is a fault at that member before anything is written,
 * and the law below holds each Relay screen's faults to exactly those.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const registry: Registry = buildRegistry(ROOT)
const android = readNativePackage(ROOT, 'android')

/** The member package as if it drew every member and part its contract declares. */
const asIfDrawn = (native: NativePackage): NativePackage => ({
  ...native,
  rendered: [...native.contract.matchAll(/^data class (PM\w+?)Props\b/gm)].map(
    (match) => match[1] as string,
  ),
})
const everyMember = asIfDrawn(android)

const SCREENS = ['inbox', 'new-ticket', 'settings']
const EXAMPLE = 'platforms/android/examples/relay'
const EMITTED = `${EXAMPLE}/src/main/kotlin/dev/polymorph/examples/relay/InboxScreen.kt`

const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8')
const native = (name: string): ScreenSpec =>
  JSON.parse(read(`${EXAMPLE}/Screens/${name}.json`)) as ScreenSpec
const swift = (name: string): ScreenSpec =>
  JSON.parse(read(`platforms/ios/Examples/Relay/Screens/${name}.json`)) as ScreenSpec

/** A Relay screen's emission, every member taken as drawn. */
const emitKotlin = (spec: ScreenSpec) => emitScreen(spec, { native: everyMember })
/** A probe's emission, against the package as it is. */
const emitProbe = (spec: ScreenSpec) => emitScreen(spec, { native: android })

/** Every comment's text, line and KDoc, joined, so wrapped prose reads as written. */
const commentText = (code: string) =>
  code
    .split('\n')
    .map((line) => /^\s*(?:\/\/|\/\*\*|\*\/|\*)(.*?)(?:\*\/)?$/.exec(line)?.[1]?.trim())
    .filter((line): line is string => line !== undefined)
    .join(' ')

const words = (text: string) => text.replace(/\s+/g, ' ').trim()

/** A lawful Android screen: a settings page holding one button. */
const probe = (overrides: Partial<ScreenSpec> = {}): ScreenSpec => ({
  spec: SPEC_ID,
  name: 'ProbeScreen',
  purpose: 'A probe.',
  platform: 'android',
  inputs: [{ name: 'onSave', type: '() => void' }],
  root: {
    component: 'SettingsPage',
    props: { title: 'Probe' },
    children: [{ component: 'Button', props: { label: 'Save', onClick: { $: 'onSave' } } }],
  },
  ...overrides,
})

/** The lines inside `<declaration> … }` at the left margin, nested blocks included. */
function block(code: string, declaration: string): string[] {
  const lines = code.split('\n')
  const start = lines.findIndex((line) => line.startsWith(declaration))
  expect(start, declaration).toBeGreaterThan(-1)
  const end = lines.findIndex((line, index) => index > start && /^[)}]/.test(line))
  return lines.slice(start + 1, end)
}

/** Every element in a value, depth first: in props, in structured objects, among children. */
function elementsIn(value: unknown): SpecElement[] {
  if (Array.isArray(value)) return value.flatMap(elementsIn)
  if (typeof value !== 'object' || value === null) return []
  if (isElement(value as never)) {
    const node = value as SpecElement
    return [
      node,
      ...Object.values(node.props ?? {}).flatMap(elementsIn),
      ...(node.children ?? []).flatMap(elementsIn),
    ]
  }
  return Object.values(value as Record<string, unknown>).flatMap(elementsIn)
}

describe('Relay’s screens, emitted for Android', () => {
  for (const name of SCREENS) {
    it(`${name} is the iOS screen but for its name and platform`, () => {
      const { name: _, platform: __, ...rest } = native(name)
      const { name: ___, platform: ____, ...ios } = swift(name)
      expect(rest).toEqual(ios)
      expect(native(name).platform).toBe('android')
    })

    it(`${name} is lawful for Android but for the members Compose does not draw yet`, () => {
      const spec = native(name)
      expect(validateSpec(registry, spec)).toEqual({ ok: true, faults: [] })
      const drawn = new Set(android.rendered)
      const pending = elementsIn(spec.root)
        .map((node) => node.component)
        .filter((component) => !drawn.has(`PM${component.replace('.', '')}`))
      const { faults } = validateSpec(registry, spec, { native: android })
      expect(
        faults.map((fault) => /^`([\w.]+)` has no Compose rendering yet/.exec(fault.message)?.[1]),
      ).toEqual(pending)
    })

    it(`${name} is the same bytes as its snapshot, and the same bytes twice`, async () => {
      const code = await emitKotlin(native(name))
      expect(await emitKotlin(native(name))).toBe(code)
      await expect(code).toMatchFileSnapshot(`./__snapshots__/${name}.screen.kt.snap`)
    })

    it(`${name} passes the checked emitter`, async () => {
      const result = await emitCheckedScreen(native(name), { native: everyMember })
      expect(result.fatal).toBeNull()
      expect(result.violations).toEqual([])
      expect(result.code).toBe(await emitKotlin(native(name)))
    })
  }
})

describe('the emitter’s law', () => {
  for (const name of SCREENS) {
    describe(name, () => {
      const spec = native(name)
      const names = kotlinNames(spec.name)
      const emitted = emitKotlin(spec)

      it('declares exactly the model, the actions, the screen and the inert actions', async () => {
        const code = await emitted
        // Every line at the left margin that is not blank, a comment, an
        // import, a closing bracket or the screen's annotation opens a declaration.
        const declarations = code
          .split('\n')
          .filter((line) => /^\S/.test(line))
          .filter((line) => !/^(\/\/|\/\*\*|\*\/| \*|import |[)}]|@Composable$)/.test(line))
        expect(declarations).toEqual([
          `data class ${names.model}(`,
          `interface ${names.actions} {`,
          `fun ${names.screen}(model: ${names.model}, actions: ${names.actions}) {`,
          `object ${names.inert} : ${names.actions} {`,
        ])
        expect(code).toContain(`@Composable\nfun ${names.screen}(`)
      })

      it('partitions the inputs: each function among the actions, everything else in the model', async () => {
        const code = await emitted
        const model = block(code, `data class ${names.model}(`)
          .filter((line) => !/^\s+(\/\*\*|\*)/.test(line))
          .map((line) => /^ {4}val (\w+): /.exec(line)?.[1])
        expect(model).toEqual([
          'loadStatus',
          ...spec.inputs.filter((input) => !isActionType(input.type)).map((input) => input.name),
        ])
        const actions = block(code, `interface ${names.actions} {`)
          .filter((line) => /^ {4}(fun|val) /.test(line))
          .map((line) => /^ {4}(?:fun|val) (\w+)/.exec(line)?.[1])
        expect(actions).toEqual(
          spec.inputs.filter((input) => isActionType(input.type)).map((input) => input.name),
        )
        const inert = block(code, `object ${names.inert}`).map(
          (line) => /^ {4}override (?:fun|val) (\w+)/.exec(line)?.[1],
        )
        expect(inert).toEqual(actions)
        // The app owns every coroutine, so no action suspends.
        expect(code).not.toMatch(/\bsuspend\b/)
      })

      it('carries the purpose, every doc and every reason into comments', async () => {
        const comments = words(commentText(await emitted))
        expect(comments).toContain(words(spec.purpose))
        for (const input of spec.inputs) {
          if (input.doc !== undefined) expect(comments).toContain(words(input.doc))
        }
        for (const node of elementsIn(spec.root)) {
          if (node.exception !== undefined)
            expect(comments).toContain(words(node.exception.because))
        }
      })

      it('writes each reason directly above the member that takes it, at its indent', async () => {
        const lines = (await emitted).split('\n')
        for (const node of elementsIn(spec.root).filter((each) => each.exception !== undefined)) {
          const opening = `// Rung ${String(node.exception?.rung)}, declared: `
          const start = lines.findIndex((line) => line.trimStart().startsWith(opening))
          expect(start, node.component).toBeGreaterThan(-1)
          const indent = ' '.repeat((lines[start] as string).search(/\S/))
          let end = start
          while ((lines[end + 1] ?? '').startsWith(`${indent}//`)) end += 1
          expect(lines[end + 1]).toMatch(
            new RegExp(`^${indent}PM${node.component.replace('.', '')}[({]`),
          )
        }
      })

      it('holds no state, coroutine, navigation, theme or token', async () => {
        const code = await emitted
        expect(kotlinScreenViolations(code)).toEqual([])
        const outsideComments = code
          .split('\n')
          .filter((line) => !/^\s*(\/\/|\/\*\*|\*)/.test(line))
          .join('\n')
        for (const construct of [
          'remember',
          'mutableStateOf',
          'LaunchedEffect',
          'rememberCoroutineScope',
          'suspend',
          'launch',
          'NavHost',
          'NavController',
          'navigate(',
          'PMTheme',
          'LocalPMTheme',
          'MaterialTheme',
          'PM.theme',
          'dev.polymorph.tokens',
        ]) {
          expect(outsideComments, construct).not.toContain(construct)
        }
      })

      it('carries the emitted marker and the spec name in its header, and imports what it uses', async () => {
        const code = await emitted
        expect(code.startsWith(`// ${EMITTED_MARKER} (\`${SPEC_ID}\`): \`${spec.name}\``)).toBe(
          true,
        )
        const imports = code
          .split('\n')
          .filter((line) => line.startsWith('import '))
          .map((line) => line.slice('import '.length))
        expect(imports).toEqual([...imports].sort())
        expect(imports).toContain('androidx.compose.runtime.Composable')
        for (const used of new Set(code.match(/(?<![.\w])PM[A-Z]\w*/g) ?? [])) {
          expect(imports, used).toContain(`dev.polymorph.ui.${used}`)
        }
        // Printed or written outside a source root, the file declares no package.
        expect(code).not.toMatch(/^package /m)
      })

      it('hands the root archetype the load status, first', async () => {
        const code = await emitted
        expect(code).toMatch(
          new RegExp(
            `actions: ${names.actions}\\) \\{\\n {4}PM${spec.root.component}\\(\\n {8}loadStatus = model\\.loadStatus,`,
          ),
        )
      })
    })
  }

  it('finds each construct it refuses in code, and none in comments, strings or names', () => {
    const faults = kotlinScreenViolations(
      [
        'var draft by remember { mutableStateOf("") }',
        'val saved = rememberSaveable { 0 }',
        'LaunchedEffect(Unit) { load() }',
        'val scope = rememberCoroutineScope()',
        'suspend fun load() {}',
        'scope.launch { load() }',
        'NavHost(controller, "inbox") {}',
        'controller.navigate("ticket")',
        'val theme = PM.theme',
        'CompositionLocalProvider(LocalPMTheme provides PMThemes.default) {}',
      ].join('\n'),
    )
    expect(faults.map((fault) => fault.replace(/^`[^`]*` /, ''))).toEqual([
      '(state of its own)',
      '(state of its own)',
      '(state of its own)',
      '(an asynchronous call)',
      '(an asynchronous call)',
      '(an asynchronous call)',
      '(an asynchronous call)',
      '(navigation)',
      '(navigation)',
      '(a theme or a token)',
      '(a theme or a token)',
      '(a theme or a token)',
    ])
    expect(
      kotlinScreenViolations(
        [
          '// A comment may name remember, LaunchedEffect and PMTheme.',
          '/** KDoc may too: navigate(), suspend fun. */',
          'PMText { Text("remember { launch() } \\"PMTheme\\"") }',
          // Actions of those names are the app's, referenced and declared.
          'PMButton(label = "x", onClick = actions::navigate)',
          'PMSwitch(checked = model.remember, onCheckedChange = actions.launch)',
          'interface ProbeActions {',
          '    fun navigate()',
          '    fun remember(value: Boolean)',
          '}',
          'val launch: Boolean',
        ].join('\n'),
      ),
    ).toEqual([])
  })
})

describe('the type table, in Kotlin', () => {
  const types = {
    '@internationalized/date': ['CalendarDate'],
    '@polymorph/react-ui': ['DataTableColumn', 'SelectOption', 'SelectOptionGroup', 'CheckedState'],
    './tickets': ['Ticket'],
    react: ['MouseEvent'],
  }
  const kotlinOf = async (inputs: ScreenInput[]) =>
    emitProbe(probe({ inputs: [...inputs, { name: 'onSave', type: '() => void' }], types }))

  it('maps each kind of type as the contract’s table does', async () => {
    const code = await kotlinOf([
      { name: 'title', type: 'string', doc: 'The heading.' },
      { name: 'count', type: 'number' },
      { name: 'open', type: 'boolean' },
      { name: 'tickets', type: 'Ticket[]' },
      { name: 'pinned', type: 'readonly Ticket[]' },
      { name: 'tags', type: 'Array<string>' },
      { name: 'picked', type: 'ReadonlySet<string>' },
      { name: 'chosen', type: 'string | null' },
      { name: 'note', type: 'string | undefined' },
      { name: 'columns', type: 'DataTableColumn<Ticket>[]' },
      { name: 'options', type: '(SelectOption | SelectOptionGroup)[]' },
      { name: 'agreed', type: 'CheckedState' },
      { name: 'due', type: 'CalendarDate | null' },
      { name: 'stage', type: "'new' | 'in-progress' | '2nd-line' | 'default'" },
    ])
    const model = block(code, 'data class ProbeModel(').join('\n')
    expect(model).toContain('    /** The heading. */\n    val title: String,')
    expect(model).toContain('    val count: Double,')
    expect(model).toContain('    val open: Boolean,')
    expect(model).toContain('    val tickets: List<Ticket>,')
    expect(model).toContain('    val pinned: List<Ticket>,')
    expect(model).toContain('    val tags: List<String>,')
    expect(model).toContain('    val picked: Set<String>,')
    expect(model).toContain('    val chosen: String?,')
    expect(model).toContain('    val note: String?,')
    expect(model).toContain('    val columns: List<PMDataTableColumn<Ticket>>,')
    expect(model).toContain('    val options: List<PMSelectOptionEntry>,')
    expect(model).toContain('    val agreed: PMCheckedState,')
    expect(model).toContain('    val due: PMCalendarDate?,')
    expect(model).toContain('    val stage: Stage,')
    expect(code).toContain(
      ') {\n    enum class Stage(val value: String) {\n        New("new"),\n        InProgress("in-progress"),\n' +
        '        Stage2ndLine("2nd-line"),\n        Default("default"),\n    }\n\n',
    )
    expect(code).toContain('    companion object\n}')
  })

  it('declares each action as a function with its parameters’ names, and leaves its DOM event out', async () => {
    const code = await kotlinOf([
      { name: 'onPick', type: '(ticket: Ticket, event: MouseEvent<HTMLElement>) => void' },
      { name: 'onClose', type: '(() => void) | null' },
      { name: 'getLabel', type: '(ticket: Ticket, index?: number) => string' },
      { name: 'getCount', type: '() => number' },
      { name: 'isOpen', type: '(ticket: Ticket) => boolean' },
      { name: 'getTags', type: '() => string[]' },
      { name: 'getPicked', type: '() => Set<string>' },
      { name: 'getNote', type: '() => string | null' },
      { name: 'getTicket', type: '() => Ticket' },
      { name: 'getHandler', type: '() => () => void' },
      { name: 'getMaybe', type: '(() => string | null) | null' },
      { name: 'onSync', type: '() => void | Promise<void>' },
      { name: 'onPicked', type: 'React.ReactEventHandler<HTMLElement>' },
      { name: 'onMove', type: '(object: Ticket) => void' },
      { name: 'onStage', type: "(stage: 'open' | 'closed') => void" },
    ])
    const actions = block(code, 'interface ProbeActions {').join('\n')
    expect(actions).toContain('    fun onPick(ticket: Ticket)\n')
    expect(actions).toContain('    val onClose: (() -> Unit)?\n')
    expect(actions).toContain('    fun getLabel(ticket: Ticket, index: Double?): String\n')
    expect(actions).toContain('    fun getHandler(): () -> Unit\n')
    expect(actions).toContain('    val getMaybe: (() -> String?)?\n')
    expect(actions).toContain('    fun onSync()\n')
    expect(actions).toContain('    fun onPicked()\n')
    expect(actions).toContain('    fun onMove(`object`: Ticket)\n')
    expect(actions).toContain('    fun onStage(stage: OnStage)\n')
    expect(actions).toContain(
      '\n    enum class OnStage(val value: String) {\n        Open("open"),\n        Closed("closed"),\n    }',
    )

    const inert = block(code, 'object ProbeInert').join('\n')
    expect(inert).toContain('    override fun onPick(ticket: Ticket) {}')
    expect(inert).toContain('    override val onClose: (() -> Unit)? = {}')
    expect(inert).toContain(
      '    override fun getLabel(ticket: Ticket, index: Double?): String = ""',
    )
    expect(inert).toContain('    override fun getCount(): Double = 0.0')
    expect(inert).toContain('    override fun isOpen(ticket: Ticket): Boolean = false')
    expect(inert).toContain('    override fun getTags(): List<String> = emptyList()')
    expect(inert).toContain('    override fun getPicked(): Set<String> = emptySet()')
    expect(inert).toContain('    override fun getNote(): String? = null')
    expect(inert).toContain(
      '    override fun getTicket(): Ticket = error("ProbeInert: `getTicket` answers with a value it has no empty form of")',
    )
    expect(inert).toContain('    override val getMaybe: (() -> String?)? = { null }')
    // Outside the interface, its nested enum is written through it.
    expect(inert).toContain('    override fun onStage(stage: ProbeActions.OnStage) {}')
  })

  it('writes an inert object with nothing in it for a screen with no actions', async () => {
    const code = await emitProbe(
      probe({
        inputs: [],
        root: { component: 'SettingsPage', props: { title: 'Probe' }, children: [] },
      }),
    )
    expect(code).toContain('\ninterface ProbeActions\n')
    expect(code).toContain('\nobject ProbeInert : ProbeActions\n')
    expect(code).toContain('PMSettingsPage(loadStatus = model.loadStatus, title = "Probe") {}')
  })

  it('refuses what the table does not map, in Kotlin’s words', () => {
    const fault = (type: string, name = 'value') =>
      nativeInputFault({ name, type }, { ...probe(), types }, KOTLIN_RULES, null, [])
    expect(fault('{ shown: number; total: number }')).toMatch(
      /^is an object type literal — Kotlin types by name/,
    )
    expect(fault('string | number')).toMatch(/which no one Kotlin type holds/)
    expect(fault('null')).toMatch(/which has no Kotlin type/)
    expect(fault('({ id }: Ticket) => void')).toMatch(
      /has a destructured parameter, `\{ id \}: Ticket`, and Kotlin declares each/,
    )
    expect(fault("'a-b' | 'aB'")).toMatch(/both the case `AB` once PascalCased/)
    expect(fault("'a' | 'b'", 'unit')).toMatch(/enum named `Unit`/)
    expect(fault("'a' | 'b'", 'companion')).toMatch(/enum named `Companion`/)
    expect(fault('(value: string) => void')).toBeNull()
    // The web's `File` and `unknown` are the member package's `PMFile` and `PMJSONValue`.
    expect(fault('File[]')).toBeNull()
    expect(fault('unknown')).toBeNull()
  })
})

describe('literals, written in the member package’s terms', () => {
  it('writes each literal as the entry, class or text the contract declares', async () => {
    const code = await emitProbe(
      probe({
        types: { '@polymorph/react-ui': ['CheckedState'] },
        inputs: [
          { name: 'agreed', type: 'CheckedState' },
          { name: 'heading', type: 'string' },
          { name: 'onAgree', type: '(next: CheckedState) => void' },
          { name: 'onRetry', type: '(() => void) | null' },
        ],
        root: {
          component: 'SettingsPage',
          props: {
            title: 'A "quoted" \\ ${title}\nwith $dollars',
            onRetry: { $: 'onRetry' },
          },
          children: [
            {
              component: 'Card',
              children: [
                {
                  component: 'Checkbox',
                  props: { checked: true, onCheckedChange: { $: 'onAgree' } },
                },
                {
                  component: 'Checkbox',
                  props: { checked: 'indeterminate', defaultChecked: { $: 'agreed' } },
                },
              ],
            },
            {
              component: 'Grid',
              props: { columns: 4, gap: 6, patch: { $object: { gap: 2 } } },
              exception: {
                rung: 3,
                because: 'This grid needs a tighter gap here, on two lines.\nSecond line.',
              },
              children: [
                { component: 'Card', children: ['Text in a card', 42, { $: 'heading' }] },
                { component: 'Badge', props: { children: 7, tone: 'success' } },
                { component: 'Heading', children: ['One heading'] },
                {
                  component: 'Button',
                  props: { label: 'Small', size: 'sm', variant: 'solid', tone: 'danger' },
                },
                {
                  component: 'Select',
                  props: {
                    value: null,
                    defaultValue: 'a',
                    options: [
                      { $object: { value: 'a', label: 'A' } },
                      {
                        $object: {
                          label: 'Group',
                          options: [{ $object: { value: 'b', label: 'B', disabled: true } }],
                        },
                      },
                    ],
                  },
                },
                { component: 'Stat', props: { label: 'Stat', value: '1', spark: [1, 2.5, -3] } },
                { component: 'Stack', props: { as: 'section' } },
              ],
            },
          ],
        },
      }),
    )
    expect(code).toContain('title = "A \\"quoted\\" \\\\ \\${title}\\nwith \\$dollars",')
    expect(code).toContain('onRetry = actions.onRetry,')
    expect(code).toContain('checked = PMCheckedState.Checked')
    expect(code).toContain('checked = PMCheckedState.Indeterminate')
    expect(code).toContain('defaultChecked = model.agreed')
    expect(code).toContain('onCheckedChange = actions::onAgree')
    expect(code).toMatch(
      /\n( +)\/\/ Rung 3, declared: This grid needs a tighter gap here, on two lines\.\n\1\/\/ Second line\.\n\1PMGrid\(/,
    )
    expect(code).toContain('columns = PMGridColumns.Columns4,')
    expect(code).toContain('gap = PMSpaceStep.S6,')
    expect(code).toContain('patch = PMLayoutPatch(gap = PMSpaceStep.S2),')
    expect(code).toMatch(
      /PMCard \{\n +Text\("Text in a card"\)\n +Text\("42"\)\n +Text\(model\.heading\)\n/,
    )
    expect(code).toContain('PMBadge(children = "7", tone = PMBadgeTone.Success)')
    expect(code).toContain('PMHeading(children = "One heading")')
    expect(code).toMatch(
      /PMButton\(\n +label = "Small",\n +size = PMControlSize\.Sm,\n +appearance = PMButtonAppearance\.SolidDanger,\n/,
    )
    expect(code).toContain('defaultValue = PMSome("a"),')
    expect(code).toContain('value = PMSome(null),')
    expect(code).toContain('PMSelectOptionEntry.Option(PMSelectOption(value = "a", label = "A")),')
    expect(code).toMatch(
      /options = listOf\(\n +PMSelectOption\(value = "b", label = "B", disabled = true\),\n +\),/,
    )
    expect(code).toContain('spark = listOf(1.0, 2.5, -3.0)')
    expect(code).toContain('PMStack(`as` = PMStackAs.Section)')
    expect(code).toContain('import androidx.compose.material3.Text\n')
  })

  it('writes a plain value where the contract declares a union of payload cases', async () => {
    const code = await emitProbe(
      probe({
        inputs: [],
        root: {
          component: 'SettingsPage',
          props: { title: 'Probe' },
          children: [
            { component: 'Slider', props: { ariaLabel: 'Volume', defaultValue: 40 } },
            {
              component: 'ChoiceCard',
              props: {
                label: 'Plan',
                mode: 'single',
                value: 'billing',
                options: [{ $object: { value: 'billing', label: 'Billing' } }],
              },
            },
            {
              component: 'ChoiceCard',
              props: {
                label: 'Add-ons',
                mode: 'multiple',
                defaultValue: ['audit', 'export'],
                options: [{ $object: { value: 'audit', label: 'Audit' } }],
              },
            },
          ],
        },
      }),
    )
    expect(code).toContain('defaultValue = PMSliderValue.Single(40.0)')
    expect(code).toContain('value = PMChoiceValue.Single("billing")')
    expect(code).toContain('defaultValue = PMChoiceValue.Multiple(listOf("audit", "export"))')
  })

  it('writes a structured prop as the class its type names, and a slot as a lambda', async () => {
    const code = await emitProbe(
      probe({
        inputs: [
          { name: 'heading', type: 'string' },
          { name: 'onSave', type: '() => void' },
        ],
        root: {
          component: 'ListPage',
          props: {
            title: 'Probe',
            emptyState: {
              $object: {
                title: 'Nothing',
                icon: 'mode-dark',
                action: [
                  { component: 'Button', props: { label: 'Add', onClick: { $: 'onSave' } } },
                  null,
                ],
                secondaryAction: false,
              },
            },
            summary: null,
          },
          children: [{ $: 'heading' }, { component: 'Badge', children: ['New'] }],
        },
      }),
    )
    expect(code).toContain('emptyState = PMEmptyStateProps(')
    expect(code).toContain('action = { PMButton(label = "Add", onClick = actions::onSave) },')
    expect(code).toContain('icon = PMIconRole.ModeDark,')
    expect(code).not.toContain('secondaryAction')
    expect(code).not.toContain('summary =')
    expect(code).toMatch(
      /\) \{\n {8}Text\(model\.heading\)\n {8}PMBadge\(children = "New"\)\n {4}\}/,
    )
  })

  it('reports what the contract has no place for instead of guessing', async () => {
    const refused = async (spec: ScreenSpec, native = android) => {
      const result = await emitCheckedScreen(spec, { native })
      expect(result.code).toBe('')
      return result.fatal ?? ''
    }
    const page = (children: ScreenSpec['root']['children']): ScreenSpec =>
      probe({ root: { component: 'SettingsPage', props: { title: 'Probe' }, children } })

    expect(await refused(page([{ component: 'Grid', props: { columns: 5 } }]))).toMatch(
      /^The Kotlin contract cannot express this screen: .*no case for 5 in `PMGridColumns`/,
    )
    expect(await refused(page([{ component: 'Badge', children: ['a', 'b'] }]))).toMatch(
      /one `String`, and the spec gives it 2 children/,
    )
    expect(
      await refused(page([{ component: 'Button', props: { label: 'x', variant: 'ghost' } }])),
    ).toMatch(/more than one lawful cell for ghost/)
    expect(
      await refused(page([{ component: 'Select', props: { size: 'xl', options: [] } }])),
    ).toMatch(/no case for "xl" in `PMControlSize`/)
    // A prop the contract cannot express yet is left out, not written into.
    expect(
      await refused(
        page([{ component: 'Input', props: { 'aria-label': 'Name', onSelect: { $: 'onSave' } } }]),
      ),
    ).toMatch(
      /`Input`’s `onSelect` is `PMUnsupportedInputOnSelect\?`, a prop the Kotlin contract cannot express yet/,
    )
    // A member the package does not draw would not compile.
    const undrawn = { ...android, rendered: android.rendered.filter((name) => name !== 'PMButton') }
    expect(await refused(probe(), undrawn)).toMatch(/`Button` has no Compose rendering yet/)
    expect(
      await refused(
        probe({
          inputs: [
            { name: 'busy', type: 'string' },
            { name: 'onSave', type: '() => void' },
          ],
          root: {
            component: 'SettingsPage',
            props: { title: 'Probe' },
            children: [{ component: 'Button', props: { label: 'x', disabled: { $: 'busy' } } }],
          },
        }),
      ),
    ).toMatch(/`Button`’s `disabled` is `Boolean\?`, and `busy` is `String`/)
  })

  it('needs the member package, of its own platform, and says so as a refusal', async () => {
    await expect(emitScreen(probe())).rejects.toThrow(MissingContractError)
    const result = await emitCheckedScreen(probe())
    expect(result).toMatchObject({ code: '', violations: [] })
    expect(result.fatal).toContain(NATIVE_FILES.android.contract)
    await expect(emitScreen(probe(), { native: readNativePackage(ROOT, 'ios') })).rejects.toThrow(
      /the one passed as `native` is ios’s/,
    )
  })
})

describe('a screen for Android is checked against the contract before anything is written', () => {
  const faults = (spec: ScreenSpec) => validateSpec(registry, spec, { native: android }).faults

  it('accepts the probe, so each fault below is the one change', () => {
    expect(validateSpec(registry, probe(), { native: android })).toEqual({ ok: true, faults: [] })
  })

  it('refuses a root that is not a page archetype', () => {
    expect(
      faults(probe({ root: { component: 'Stack', props: { gap: 4 }, children: [] } })).map(
        (fault) => fault.path,
      ),
    ).toEqual(['$.root'])
  })

  it('refuses `loadStatus`, words Kotlin has taken and Any’s functions as input names', () => {
    expect(
      faults(
        probe({
          inputs: [
            { name: 'loadStatus', type: 'string' },
            { name: 'fun', type: 'string' },
            { name: 'toString', type: '() => string' },
            { name: 'func', type: 'string' },
            { name: 'onSave', type: '() => void' },
          ],
        }),
      ).map((fault) => [fault.path, fault.message.slice(0, 41)]),
    ).toEqual([
      ['$.inputs[0].name', '`loadStatus` is the model’s first field, '],
      ['$.inputs[1].name', '`fun` is a word Kotlin has taken — every '],
      ['$.inputs[2].name', '`toString` is a word Kotlin has taken — e'],
    ])
  })

  it('refuses a type the table does not map, at the input’s type', () => {
    expect(
      faults(probe({ inputs: [{ name: 'shape', type: '{ a: number }' }, ...probe().inputs] })),
    ).toEqual([
      {
        path: '$.inputs[0].type',
        message: expect.stringMatching(/is an object type literal — Kotlin types by name/),
      },
    ])
  })

  it('refuses a bound `empty`, an event bound to data and a path into an action', () => {
    const spec = probe({
      inputs: [
        { name: 'isEmpty', type: 'boolean' },
        { name: 'onSave', type: '() => void' },
      ],
      root: {
        component: 'ListPage',
        props: { title: 'x', empty: { $: 'isEmpty' }, emptyState: { $object: { title: 'x' } } },
        children: [
          { component: 'Button', props: { label: { $: 'onSave.x' }, onClick: { $: 'isEmpty' } } },
        ],
      },
    })
    expect(faults(spec).map((fault) => fault.path)).toEqual([
      '$.root.props.empty',
      '$.root.children[0].props.label',
      '$.root.children[0].props.onClick',
    ])
  })

  it('accepts `onRetry` on a page archetype', () => {
    const retry = probe({
      inputs: [
        { name: 'onRetry', type: '() => void' },
        { name: 'onSave', type: '() => void' },
      ],
      root: { ...probe().root, props: { title: 'x', onRetry: { $: 'onRetry' } } },
    })
    expect(faults(retry)).toEqual([])
  })

  it('refuses a name whose four declarations `types` already names', () => {
    expect(
      faults(probe({ name: 'InboxView', types: { './app': ['InboxScreen', 'InboxInert'] } })),
    ).toEqual([
      {
        path: '$.name',
        message:
          'the emitted file declares `InboxScreen`, which `types` also names from `./app` — name the screen something else',
      },
      {
        path: '$.name',
        message:
          'the emitted file declares `InboxInert`, which `types` also names from `./app` — name the screen something else',
      },
    ])
    expect(faults(probe({ name: 'Screen' }))[0]?.message).toBe(
      '`Screen` leaves no name once its suffix is gone, and the file declares `<Name>Model`, ' +
        '`<Name>Actions`, `<Name>Screen` and `<Name>Inert` — name the screen for what it shows',
    )
  })
})

describe('names and the package', () => {
  it('names the four declarations from the screen’s name', () => {
    expect(kotlinNames('InboxView')).toEqual({
      model: 'InboxModel',
      actions: 'InboxActions',
      screen: 'InboxScreen',
      inert: 'InboxInert',
    })
  })

  it('declares the package the file’s directory names under its source root', async () => {
    expect(kotlinPackageOf(undefined)).toBeNull()
    expect(kotlinPackageOf('/tmp/out/ProbeScreen.kt')).toBeNull()
    expect(kotlinPackageOf('/work/kotlin/app/src/main/kotlin/dev/acme/inbox/InboxScreen.kt')).toBe(
      'dev.acme.inbox',
    )
    expect(kotlinPackageOf('app/src/main/java/dev/acme/InboxScreen.kt')).toBe('dev.acme')
    expect(kotlinPackageOf('app/src/main/kotlin/InboxScreen.kt')).toBeNull()
    expect(() => kotlinPackageOf('src/main/kotlin/dev/my-app/InboxScreen.kt')).toThrow(
      KotlinPackageError,
    )
    expect(() => kotlinPackageOf('src/main/kotlin/dev/in/InboxScreen.kt')).toThrow(
      /no package name/,
    )
    const code = await emitScreen(probe(), {
      native: android,
      filepath: resolve(ROOT, 'app/src/main/kotlin/dev/acme/ProbeScreen.kt'),
    })
    expect(code).toContain('\n\npackage dev.acme\n\nimport androidx.compose.runtime.Composable\n')
  })

  it('writes prose as KDoc that cannot close or open a comment', async () => {
    const code = await emitProbe(probe({ purpose: 'Reads */ and /* as text.' }))
    expect(code).toContain('/** Reads &#42;/ and /&#42; as text. */\n@Composable\n')
  })
})

describe('the Relay example', () => {
  it('holds the inbox the emitter writes today (`pnpm emit:examples`)', async () => {
    const spec = native('inbox')
    expect(validateSpec(registry, spec, { native: android })).toEqual({ ok: true, faults: [] })
    expect(read(EMITTED)).toBe(
      await emitScreen(spec, { native: android, filepath: resolve(ROOT, EMITTED) }),
    )
  })

  /*
   * Gradle builds the example and renders the inbox in its four load states
   * (`examples/relay/src/test/kotlin`), as `pnpm gate:android` does, through
   * the build's own wrapper (`platforms/android/gradlew`), which runs the
   * Gradle version the build pins. The test runs where that run needs no
   * network and can start: the wrapper's Gradle is already downloaded, or
   * `PM_GRADLE=1` allows the download, and the wrapper's JDK is 17 or later,
   * the oldest the build's plugins run on. Otherwise it is skipped, with the
   * reason in its title. Gradle holds a lock on the build's caches, so a build
   * that starts while another runs waits for it.
   */
  const PROJECT = resolve(ROOT, 'platforms/android')
  const GRADLEW = resolve(PROJECT, 'gradlew')
  /** The major version of the JDK the wrapper runs, `JAVA_HOME`'s or the one on `PATH`, if any. */
  const javaMajor = ((): number | undefined => {
    const java = process.env.JAVA_HOME ? resolve(process.env.JAVA_HOME, 'bin/java') : 'java'
    const run = spawnSync(java, ['-version'], { encoding: 'utf8' })
    if (run.status !== 0) return undefined
    const version = /version "(\d+)(?:\.(\d+))?/.exec(`${run.stderr}${run.stdout}`)
    if (version === null) return undefined
    // Java 8 and earlier call themselves 1.8 and below.
    return Number(version[1] === '1' ? version[2] : version[1])
  })()
  /** Whether the Gradle distribution the wrapper pins is downloaded already. */
  const gradleCached = ((): boolean => {
    const properties = read('platforms/android/gradle/wrapper/gradle-wrapper.properties')
    const zip = /^distributionUrl=(.*)$/m.exec(properties)?.[1]?.split('/').at(-1)
    if (zip === undefined) return false
    const home = process.env.GRADLE_USER_HOME ?? resolve(homedir(), '.gradle')
    const dists = resolve(home, 'wrapper/dists', zip.replace(/\.zip$/, ''))
    return (
      existsSync(dists) &&
      readdirSync(dists).some((hash) => existsSync(resolve(dists, hash, `${zip}.ok`)))
    )
  })()
  const skipped =
    javaMajor === undefined
      ? 'no JDK here'
      : javaMajor < 17
        ? `the JDK here is ${javaMajor}, and the build needs 17 or later`
        : !gradleCached && process.env.PM_GRADLE !== '1'
          ? "the wrapper's Gradle is not downloaded; PM_GRADLE=1 downloads it"
          : undefined
  const TIMEOUT = 10 * 60_000

  it.skipIf(skipped !== undefined)(
    `builds against the member module and renders with the Gradle wrapper${skipped ? ` (skipped: ${skipped})` : ''}`,
    async () => {
      const result = await promisify(execFile)(
        GRADLEW,
        ['-p', PROJECT, ':examples:relay:jvmTest', '--console=plain', '-q'],
        { timeout: TIMEOUT, maxBuffer: 64 * 1024 * 1024 },
      ).catch((error: { stdout?: string; stderr?: string; message: string }) => error)
      expect(
        'message' in result
          ? `${result.stdout ?? ''}\n${result.stderr ?? ''}\n${result.message}`
          : '',
      ).toBe('')
    },
    TIMEOUT,
  )
})
