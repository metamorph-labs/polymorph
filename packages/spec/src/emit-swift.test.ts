import { execFile, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

import { buildRegistry, type Registry } from '@polymorph/registry'
import { describe, expect, it } from 'vitest'

import { EMITTED_MARKER, emitScreen } from './emit'
import {
  MissingContractError,
  NATIVE_FILES,
  nativeInputFault,
  readNativePackage,
} from './emit-native'
import { SWIFT_RULES, swiftNames, swiftScreenViolations } from './emit-swift'
import { emitCheckedScreen, validateSpec } from './lawful'
import { isElement, SPEC_ID, type ScreenInput, type ScreenSpec, type SpecElement } from './schema'
import {
  isActionType,
  screenStem,
  validateSpec as validateComposition,
  type NativePackage,
} from './validate'

/**
 * The SwiftUI emitter's law (`design/native/screen-contract.md`, "What is
 * checkable"), over what it emits.
 *
 * Relay's three screens for iOS (`platforms/ios/Examples/Relay/Screens/`) are
 * emitted against the generated contract and pinned as snapshots, beside the
 * web emissions of the same screens, which do not move. Every statement the
 * contract gives the emitter is a test here: the three names, the partition of
 * inputs, the prose carried into comments, and no state, asynchronous call,
 * navigation, theme or token in the file. The validator's faults for a native
 * screen come back at the contract's paths. The example app
 * (`platforms/ios/Examples/Relay/`) holds the emitted inbox, which must be what
 * the emitter writes today, and on a machine with Swift it builds and renders.
 *
 * The snapshots are emitted against the member package as if it drew every
 * member it declares (`asIfDrawn`), so each pins what the emitter writes for
 * its screen. Against the package as it is, a screen that uses a member with
 * no SwiftUI rendering is a fault at that member before anything is written,
 * and the law below holds each Relay screen's faults to exactly those.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const registry: Registry = buildRegistry(ROOT)
const ios = readNativePackage(ROOT, 'ios')

/** The member package as if it drew every member its contract declares. */
const asIfDrawn = (native: NativePackage): NativePackage => ({
  ...native,
  rendered: [...native.contract.matchAll(/^public struct (PM\w+?)Props\b/gm)].map(
    (match) => match[1] as string,
  ),
})
const everyMember = asIfDrawn(ios)

const SCREENS = ['inbox', 'new-ticket', 'settings']
const EXAMPLE = 'platforms/ios/Examples/Relay'

const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8')
const native = (name: string): ScreenSpec =>
  JSON.parse(read(`${EXAMPLE}/Screens/${name}.json`)) as ScreenSpec
const web = (name: string): ScreenSpec =>
  JSON.parse(read(`design/screens/${name}.json`)) as ScreenSpec

/** A Relay screen's emission, every member taken as drawn. */
const emitSwift = (spec: ScreenSpec) => emitScreen(spec, { native: everyMember })
/** A probe's emission, against the package as it is. */
const emitProbe = (spec: ScreenSpec) => emitScreen(spec, { native: ios })

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

/** Every line comment's text, joined, so wrapped prose reads as written. */
const commentText = (code: string) =>
  code
    .split('\n')
    .map((line) => /^\s*\/\/\/?(.*)$/.exec(line)?.[1]?.trim())
    .filter((line): line is string => line !== undefined)
    .join(' ')

const words = (text: string) => text.replace(/\s+/g, ' ').trim()

/** A lawful iOS screen: a settings page holding one button. */
const probe = (overrides: Partial<ScreenSpec> = {}): ScreenSpec => ({
  spec: SPEC_ID,
  name: 'ProbeView',
  purpose: 'A probe.',
  platform: 'ios',
  inputs: [{ name: 'onSave', type: '() => void' }],
  root: {
    component: 'SettingsPage',
    props: { title: 'Probe' },
    children: [{ component: 'Button', props: { label: 'Save', onClick: { $: 'onSave' } } }],
  },
  ...overrides,
})

/** The body of `struct <name> { … }` in emitted Swift, nested enums included. */
function block(code: string, declaration: string): string[] {
  const lines = code.split('\n')
  const start = lines.findIndex((line) => line.startsWith(declaration))
  expect(start, declaration).toBeGreaterThan(-1)
  const end = lines.findIndex((line, index) => index > start && line === '}')
  return lines.slice(start + 1, end)
}

describe('Relay’s screens, emitted for iOS', () => {
  for (const name of SCREENS) {
    it(`${name} is lawful for iOS but for the members SwiftUI does not draw yet`, () => {
      const spec = native(name)
      expect(validateSpec(registry, spec)).toEqual({ ok: true, faults: [] })
      const drawn = new Set(ios.rendered)
      const pending = elementsIn(spec.root)
        .map((node) => node.component)
        .filter((component) => !drawn.has(`PM${component.split('.')[0] as string}`))
      const { faults } = validateSpec(registry, spec, { native: ios })
      expect(
        faults.map((fault) => /^`([\w.]+)` has no SwiftUI rendering yet/.exec(fault.message)?.[1]),
      ).toEqual(pending)
    })

    it(`${name} is the same bytes as its snapshot, and the same bytes twice`, async () => {
      const code = await emitSwift(native(name))
      expect(await emitSwift(native(name))).toBe(code)
      await expect(code).toMatchFileSnapshot(`./__snapshots__/${name}.view.swift.snap`)
    })

    it(`${name} leaves the web’s TSX and Vue emissions as they were`, async () => {
      const filepath = resolve(ROOT, `apps/workbench/src/relay/${name}.view.tsx`)
      await expect(await emitScreen(web(name), { filepath })).toMatchFileSnapshot(
        `./__snapshots__/${name}.view.tsx.snap`,
      )
      await expect(
        await emitScreen(web(name), {
          framework: 'vue',
          registry,
          filepath: filepath.replace(/\.tsx$/, '.vue'),
        }),
      ).toMatchFileSnapshot(`./__snapshots__/${name}.view.vue.snap`)
    })

    it(`${name} passes the checked emitter`, async () => {
      const result = await emitCheckedScreen(native(name), { native: everyMember })
      expect(result.fatal).toBeNull()
      expect(result.violations).toEqual([])
      expect(result.code).toBe(await emitSwift(native(name)))
    })
  }
})

describe('the emitter’s law', () => {
  for (const name of SCREENS) {
    describe(name, () => {
      const spec = native(name)
      const names = swiftNames(spec.name)
      const emitted = emitSwift(spec)

      it('declares exactly the model, the actions and the view, named for the screen', async () => {
        const code = await emitted
        // Every line at the left margin that is not blank, a comment, an
        // import, a closing brace or the view's attribute opens a declaration.
        const declarations = code
          .split('\n')
          .filter((line) => /^\S/.test(line))
          .filter((line) => !/^(\/\/|import |\}$|@MainActor$)/.test(line))
        expect(declarations).toEqual([
          `struct ${names.model} {`,
          `struct ${names.actions} {`,
          `struct ${names.view}: View {`,
          `extension ${names.actions} {`,
        ])
        expect(code).toContain(`@MainActor\nstruct ${names.view}: View {`)
        expect(code).toContain(`  let model: ${names.model}\n  let actions: ${names.actions}\n`)
      })

      it('partitions the inputs: each function among the actions, everything else in the model', async () => {
        const code = await emitted
        /** Every stored property of a block, whichever keyword declares it. */
        const fields = (lines: string[]) => {
          const declared = lines.filter((line) => /^\s+(?:var|let) /.test(line))
          const names = declared.map((line) => /^ {2}(?:var|let) (\w+): /.exec(line)?.[1])
          expect(names, 'every property sits at the record’s own level').not.toContain(undefined)
          return { names: names as string[], lines: declared }
        }
        const model = fields(block(code, `struct ${names.model}`))
        const actions = fields(block(code, `struct ${names.actions}`))

        expect(model.lines.every((line) => line.startsWith('  var '))).toBe(true)
        expect(model.names).toEqual([
          'loadStatus',
          ...spec.inputs.filter((input) => !isActionType(input.type)).map((input) => input.name),
        ])
        expect(actions.names).toEqual(
          spec.inputs.filter((input) => isActionType(input.type)).map((input) => input.name),
        )
        for (const line of actions.lines) expect(line).toMatch(/^ {2}let \w+: \(?@MainActor \(/)
      })

      it('carries the purpose, every doc and every reason into comments', async () => {
        const comments = words(commentText(await emitted))
        expect(comments).toContain(words(spec.purpose))
        for (const input of spec.inputs) {
          if (input.doc !== undefined) expect(comments).toContain(words(input.doc))
        }
        const reasons = JSON.stringify(spec).match(/"because":"((?:[^"\\]|\\.)*)"/g) ?? []
        for (const reason of reasons) {
          const because = JSON.parse(`{${reason}}`) as { because: string }
          expect(comments).toContain(words(because.because))
        }
      })

      it('writes each reason directly above the member that takes it, at its indent', async () => {
        const lines = (await emitted).split('\n')
        const excepted = elementsIn(spec.root).filter((node) => node.exception !== undefined)
        for (const node of excepted) {
          const opening = `// Rung ${String(node.exception?.rung)}, declared: `
          const start = lines.findIndex((line) => line.trimStart().startsWith(opening))
          expect(start, node.component).toBeGreaterThan(-1)
          const indent = (lines[start] as string).search(/\S/)
          let end = start
          while ((lines[end + 1] ?? '').startsWith(`${' '.repeat(indent)}//`)) end += 1
          expect(lines[end + 1]).toBe(`${' '.repeat(indent)}PM${node.component}(`)
        }
      })

      it('holds no state, asynchronous call, navigation, theme or token', async () => {
        const code = await emitted
        expect(swiftScreenViolations(code)).toEqual([])
        const outsideComments = code
          .split('\n')
          .filter((line) => !/^\s*\/\//.test(line))
          .join('\n')
        for (const construct of [
          '@State',
          '@StateObject',
          '@ObservedObject',
          '@Bindable',
          '@Environment',
          'Task {',
          'Task(',
          'Task.',
          'async',
          'await',
          '.task',
          '.onAppear',
          'URLSession',
          'NavigationLink',
          'NavigationStack',
          '.navigationDestination',
          'openURL',
          '.sheet',
          'PMTheme',
          'pmTheme',
          'PolymorphTokens',
          'theme.',
        ]) {
          expect(outsideComments, construct).not.toContain(construct)
        }
      })

      it('carries the emitted marker and the spec name in its header', async () => {
        const code = await emitted
        expect(code.startsWith(`// ${EMITTED_MARKER} (\`${SPEC_ID}\`): \`${spec.name}\``)).toBe(
          true,
        )
        expect(code).toContain('\nimport PolymorphUI\nimport SwiftUI\n')
      })

      it('hands the root archetype the load status, first', async () => {
        const code = await emitted
        expect(code).toMatch(
          new RegExp(
            `var body: some View \\{\\n {4}PM${spec.root.component}\\(\\n {6}props: \\.init\\(\\n {8}loadStatus: model\\.loadStatus,`,
          ),
        )
      })
    })
  }

  it('finds each construct it refuses in code, and none in comments, strings or fields', () => {
    const faults = swiftScreenViolations(
      [
        '@State var draft = ""',
        '@Environment(\\.dismiss) var dismiss',
        'Task { await load() }',
        'URLSession.shared',
        'view.task { }',
        'view.onAppear { }',
        'NavigationLink("Open") { }',
        'view.sheet(isPresented: $open) { }',
        'view.navigationDestination(for: Int.self) { _ in }',
        'let theme = PMTheme.default',
        'view.pmTextStyle(theme.text.md)',
        'Task.detached { }',
      ].join('\n'),
    )
    expect(faults.map((fault) => fault.replace(/^`[^`]*` /, ''))).toEqual([
      '(state of its own)',
      '(state of its own)',
      '(an asynchronous call)',
      '(an asynchronous call)',
      '(an asynchronous call)',
      '(an asynchronous call)',
      '(an asynchronous call)',
      '(an asynchronous call)',
      '(navigation)',
      '(navigation)',
      '(navigation)',
      '(a theme or a token)',
      '(a theme or a token)',
    ])
    expect(
      swiftScreenViolations(
        [
          '// A comment may name @State, Task and PMTheme.',
          'PMText(props: .init(children: AnyView(Text(verbatim: "Task: await \\"PMTheme\\""))))',
          'PMSwitch(props: .init(checked: model.task, onCheckedChange: actions.sheet))',
          // An app type of that name is a type, not a task begun.
          'var current: Task',
          'var queue: [Task]',
        ].join('\n'),
      ),
    ).toEqual([])
  })
})

describe('the type table', () => {
  const types = {
    '@internationalized/date': ['CalendarDate'],
    '@polymorph/react-ui': ['DataTableColumn', 'SelectOption', 'SelectOptionGroup', 'CheckedState'],
    './tickets': ['Ticket'],
    react: ['MouseEvent'],
  }
  const swiftOf = async (inputs: ScreenInput[]) =>
    emitSwift(probe({ inputs: [...inputs, { name: 'onSave', type: '() => void' }], types }))

  it('maps each kind of type as the contract’s table does', async () => {
    const code = await swiftOf([
      { name: 'title', type: 'string', doc: 'The heading.' },
      { name: 'count', type: 'number' },
      { name: 'open', type: 'boolean' },
      { name: 'tickets', type: 'Ticket[]' },
      { name: 'pinned', type: 'readonly Ticket[]' },
      { name: 'tags', type: 'Array<string>' },
      { name: 'picked', type: 'string | null' },
      { name: 'note', type: 'string | undefined' },
      { name: 'columns', type: 'DataTableColumn<Ticket>[]' },
      { name: 'options', type: '(SelectOption | SelectOptionGroup)[]' },
      { name: 'agreed', type: 'CheckedState' },
      { name: 'stage', type: "'new' | 'in-progress' | '2nd-line' | 'default'" },
    ])
    const model = block(code, 'struct ProbeModel').join('\n')
    expect(model).toContain('  /// The heading.\n  var title: String')
    expect(model).toContain('  var count: Double')
    expect(model).toContain('  var open: Bool')
    expect(model).toContain('  var tickets: [Ticket]')
    expect(model).toContain('  var pinned: [Ticket]')
    expect(model).toContain('  var tags: [String]')
    expect(model).toContain('  var picked: String?')
    expect(model).toContain('  var note: String?')
    expect(model).toContain('  var columns: [PMDataTableColumn<Ticket>]')
    expect(model).toContain('  var options: [PMSelectOptionEntry]')
    expect(model).toContain('  var agreed: PMCheckedState')
    expect(model).toContain(
      '  enum Stage: String {\n    case new, inProgress = "in-progress", stage2ndLine = "2nd-line", `default`\n  }',
    )
    expect(model).toContain('  var stage: Stage')
  })

  it('maps an action’s parameters and result, and leaves its DOM event out', async () => {
    const code = await swiftOf([
      { name: 'onPick', type: '(ticket: Ticket, event: MouseEvent<HTMLElement>) => void' },
      { name: 'onClose', type: '(() => void) | null' },
      { name: 'getLabel', type: '(ticket: Ticket, index?: number) => string' },
      { name: 'getCount', type: '() => number' },
      { name: 'isOpen', type: '(ticket: Ticket) => boolean' },
      { name: 'getTags', type: '() => string[]' },
      { name: 'getNote', type: '() => string | null' },
      { name: 'getTicket', type: '() => Ticket' },
      { name: 'getHandler', type: '() => () => void' },
      { name: 'onStage', type: "(stage: 'open' | 'closed') => void" },
    ])
    const actions = block(code, 'struct ProbeActions').join('\n')
    expect(actions).toContain('  let onPick: @MainActor (Ticket) -> Void')
    expect(actions).toContain('  let onClose: (@MainActor () -> Void)?')
    expect(actions).toContain('  let getLabel: @MainActor (Ticket, Double?) -> String')
    expect(actions).toContain('  let getHandler: @MainActor () -> (@MainActor () -> Void)')
    expect(actions).toContain('  enum OnStage: String {\n    case open, closed\n  }')
    expect(actions).toContain('  let onStage: @MainActor (OnStage) -> Void')

    const inert = block(code, 'extension ProbeActions').join('\n')
    expect(inert).toContain('    onPick: { _ in },')
    expect(inert).toContain('    onClose: {},')
    expect(inert).toContain('    getLabel: { _, _ in "" },')
    expect(inert).toContain('    getCount: { 0 },')
    expect(inert).toContain('    isOpen: { _ in false },')
    expect(inert).toContain('    getTags: { [] },')
    expect(inert).toContain('    getNote: { nil },')
    expect(inert).toContain(
      '    getTicket: { fatalError("ProbeActions.inert: `getTicket` answers with a value it has no empty form of") },',
    )
    expect(inert).toContain('  @MainActor static let inert: Self = Self(')
  })

  it('writes an inert record with nothing in it for a screen with no actions', async () => {
    const code = await emitSwift(
      probe({
        inputs: [],
        root: { component: 'SettingsPage', props: { title: 'Probe' }, children: [] },
      }),
    )
    expect(code).toContain('struct ProbeActions {\n}')
    expect(code).toContain('  @MainActor static let inert: Self = Self()')
    expect(code).toContain('children: AnyView(EmptyView())')
  })

  it('maps a set, a promise of nothing, a handler alias and a package type the contract declares', async () => {
    const code = await swiftOf([
      { name: 'picked', type: 'ReadonlySet<string>' },
      { name: 'tags', type: 'Set<string>' },
      { name: 'due', type: 'CalendarDate | null' },
      { name: 'attachments', type: 'File[]' },
      { name: 'payload', type: 'unknown' },
      { name: 'onSaveDraft', type: '() => Promise<void>' },
      { name: 'onSync', type: '() => void | Promise<void>' },
      { name: 'onPicked', type: 'React.ReactEventHandler<HTMLElement>' },
      { name: 'getNote', type: '(() => string | null) | null' },
    ])
    const model = block(code, 'struct ProbeModel').join('\n')
    expect(model).toContain('  var picked: Set<String>')
    expect(model).toContain('  var tags: Set<String>')
    expect(model).toContain('  var due: PMCalendarDate?')
    expect(model).toContain('  var attachments: [PMFile]')
    expect(model).toContain('  var payload: PMJSONValue')
    const actions = block(code, 'struct ProbeActions').join('\n')
    expect(actions).toContain('  let onSaveDraft: @MainActor () -> Void')
    expect(actions).toContain('  let onSync: @MainActor () -> Void')
    expect(actions).toContain('  let onPicked: @MainActor () -> Void')
    // An optional action whose result is optional stays an optional closure.
    expect(actions).toContain('  let getNote: (@MainActor () -> String?)?')
  })

  it('refuses an enum name the records already use', () => {
    const fault = (name: string, extra: Record<string, string[]> = {}) =>
      nativeInputFault(
        { name, type: "'a' | 'b'" },
        { ...probe(), types: { ...types, ...extra } },
        SWIFT_RULES,
        null,
        ['ProbeModel', 'ProbeActions', 'ProbeView'],
      )
    expect(fault('type')).toMatch(/enum named `Type` after the input, and the file already uses/)
    expect(fault('string')).toMatch(/enum named `String`/)
    expect(fault('ticket')).toMatch(/enum named `Ticket`/)
    expect(fault('probeModel')).toMatch(/enum named `ProbeModel`/)
    expect(fault('stage')).toBeNull()
  })

  it('refuses what the table does not map, naming why', () => {
    const fault = (type: string, name = 'value') =>
      nativeInputFault(
        { name, type },
        { ...probe(), types: { ...types, './shapes': ['Pair'] } },
        SWIFT_RULES,
        null,
        [],
      )
    expect(fault('{ shown: number; total: number }')).toMatch(/^is an object type literal/)
    expect(fault('{ shown: number }[]')).toMatch(/^is an object type literal/)
    expect(fault('string | number')).toMatch(/union of unlike types/)
    expect(fault('boolean | "indeterminate"')).toMatch(/`CheckedState`/)
    expect(fault('Ticket | Pair')).toMatch(/union of unlike types/)
    expect(fault('Unknown')).toMatch(/names `Unknown`, which `types` does not declare/)
    expect(fault('1 | 2')).toMatch(/only a union of string literals maps/)
    expect(fault('true')).toMatch(/only a union of string literals maps/)
    expect(fault('null')).toMatch(/`null` or `undefined` alone/)
    expect(fault('void')).toMatch(/does not map/)
    expect(fault('[string, number]')).toMatch(/does not map/)
    expect(fault('Record<string, string>')).toMatch(/`Record`/)
    expect(fault('(...rest: string[]) => void')).toMatch(/rest parameter/)
    expect(fault('<T>(value: T) => void')).toMatch(/generic function/)
    expect(fault('(value) => void')).toMatch(/parameter with no type/)
    expect(fault("('a' | 'b')[] | ('c' | 'd')")).toMatch(/union of unlike types/)
    expect(fault("(a: 'x' | 'y') => 'z' | 'w'")).toMatch(/two unions of string literals/)
    expect(fault("'a-b' | 'aB'")).toMatch(/both the case `aB`/)
    expect(fault('React.MouseEvent')).toMatch(/does not map/)
    expect(fault('string')).toBeNull()
    expect(fault('File[]')).toBeNull()
    expect(fault('unknown')).toBeNull()
    expect(fault('(event: React.MouseEvent<HTMLElement>) => void')).toBeNull()
    expect(fault('(SelectOption | SelectOptionGroup)[]')).toBeNull()
  })

  it('refuses a union of vocabulary types the member package has no enum for, at the input', async () => {
    const spec = probe({
      types: { '@polymorph/react-ui': ['SelectOption', 'CheckedState', 'Gadget'] },
      inputs: [
        { name: 'mixed', type: 'SelectOption | CheckedState' },
        { name: 'gadget', type: 'Gadget' },
      ],
      root: { component: 'SettingsPage', props: { title: 'Probe' }, children: [] },
    })
    // Without the member package, the table cannot know the package's names.
    expect(validateSpec(registry, spec).ok).toBe(true)
    expect(validateSpec(registry, spec, { native: ios }).faults).toEqual([
      {
        path: '$.inputs[0].type',
        message: expect.stringMatching(/declares no enum of those branches$/),
      },
      {
        path: '$.inputs[1].type',
        message: expect.stringMatching(/the member package declares no `PMGadget`/),
      },
    ])
    const result = await emitCheckedScreen(spec, { native: ios })
    expect(result.code).toBe('')
    expect(result.fatal).toMatch(/declares no enum of those branches/)
  })
})

describe('literals, written in the member package’s terms', () => {
  it('writes each literal as the case, struct or text the contract declares', async () => {
    const code = await emitSwift(
      probe({
        types: { '@polymorph/react-ui': ['CheckedState'] },
        inputs: [
          { name: 'agreed', type: 'CheckedState' },
          { name: 'onAgree', type: '(next: CheckedState) => void' },
          { name: 'onRetry', type: '() => void' },
        ],
        root: {
          component: 'SettingsPage',
          props: {
            title: 'A "quoted" \\ title\nwith \\(no) interpolation',
            onRetry: { $: 'onRetry' },
          },
          children: [
            {
              component: 'SettingsRow.Group',
              props: { title: 'Group' },
              children: [
                {
                  component: 'SettingsRow',
                  props: {
                    label: 'Agree',
                    control: {
                      component: 'Checkbox',
                      props: { checked: true, onCheckedChange: { $: 'onAgree' } },
                    },
                  },
                },
                {
                  component: 'SettingsRow',
                  props: {
                    label: 'Maybe',
                    control: {
                      component: 'Checkbox',
                      props: { checked: 'indeterminate', defaultChecked: { $: 'agreed' } },
                    },
                  },
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
                { component: 'Card', children: ['Text in a card', 42] },
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
              ],
            },
          ],
        },
      }),
    )
    expect(code).toContain('title: "A \\"quoted\\" \\\\ title\\nwith \\\\(no) interpolation"')
    expect(code).toContain('onRetry: actions.onRetry,')
    expect(code).toContain('PMSettingsRow.Group(')
    expect(code).toContain('checked: .checked')
    expect(code).toContain('checked: .indeterminate')
    expect(code).toContain('defaultChecked: model.agreed')
    expect(code).toContain('columns: .columns4')
    expect(code).toContain('gap: .s6')
    expect(code).toContain('patch: PMLayoutPatch(gap: .s2)')
    // A reason is line comments above the node, one per line of prose.
    expect(code).toMatch(
      /\n( +)\/\/ Rung 3, declared: This grid needs a tighter gap here, on two lines\.\n\1\/\/ Second line\.\n\1PMGrid\(/,
    )
    expect(code).toContain('Text(verbatim: "Text in a card")')
    expect(code).toContain('Text(verbatim: "42")')
    expect(code).toContain('PMBadge(props: .init(children: "7", tone: .success))')
    expect(code).toContain('PMHeading(props: .init(children: "One heading"))')
    expect(code).toContain('size: .sm, appearance: .solidDanger')
    expect(code).toContain('defaultValue: "a"')
    expect(code).toContain('value: .some(nil)')
    expect(code).toContain('.option(PMSelectOption(value: "a", label: "A"))')
    expect(code).toMatch(/\.group\(\n +PMSelectOptionGroup\(\n +label: "Group",\n/)
    expect(code).toContain('options: [PMSelectOption(value: "b", label: "B", disabled: true)]')
    expect(code).toContain('spark: [1, 2.5, -3]')
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
    expect(code).toContain('defaultValue: .single(40)')
    expect(code).toContain('value: .single("billing")')
    expect(code).toContain('defaultValue: .multiple(["audit", "export"])')
  })

  it('writes a structured prop as the struct its type names, and text where a view goes', async () => {
    const code = await emitSwift(
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
          children: [{ $: 'heading' }, { component: 'Separator' }],
        },
      }),
    )
    expect(code).toContain('emptyState: PMEmptyStateProps(')
    expect(code).toContain('icon: .modeDark')
    expect(code).not.toContain('secondaryAction')
    expect(code).not.toContain('summary:')
    expect(code).toContain('Text(verbatim: model.heading)')
    expect(code).toContain('Group {')
  })

  it('writes a compound part from its generated props: a Tabs panel', async () => {
    const code = await emitProbe(
      probe({
        root: {
          component: 'SettingsPage',
          props: { title: 'Probe' },
          children: [
            {
              component: 'Tabs',
              props: {
                tabs: [
                  { $object: { value: 'replies', label: 'Replies' } },
                  { $object: { value: 'notes', label: 'Notes' } },
                ],
              },
              children: [
                {
                  component: 'Tabs.Content',
                  props: { value: 'replies' },
                  children: ['Two replies'],
                },
                { component: 'Tabs.Content', props: { value: 'notes' }, children: ['No notes'] },
              ],
            },
          ],
        },
      }),
    )
    expect(code).toContain('PMTabs.Content(')
    expect(code).toMatch(
      /PMTabs\.Content\(\s*props: \.init\(\s*children: AnyView\(Text\(verbatim: "Two replies"\)\),\s*value: "replies"/,
    )
  })

  it('reports what the contract has no place for instead of guessing', async () => {
    const refused = async (spec: ScreenSpec, native = ios) => {
      const result = await emitCheckedScreen(spec, { native })
      expect(result.code).toBe('')
      return result.fatal ?? ''
    }
    const page = (children: ScreenSpec['root']['children']): ScreenSpec =>
      probe({ root: { component: 'SettingsPage', props: { title: 'Probe' }, children } })

    // Each of these validates for the web vocabulary's types, and the Swift
    // contract types the prop more narrowly.
    expect(await refused(page([{ component: 'Grid', props: { columns: 5 } }]))).toMatch(
      /no case for 5 in `PMGridColumns`/,
    )
    expect(await refused(page([{ component: 'Badge', children: ['a', 'b'] }]))).toMatch(
      /one `String`, and the spec gives it 2 children/,
    )
    expect(
      await refused(page([{ component: 'Badge', children: [{ component: 'Separator' }] }])),
    ).toMatch(/one `String`, and the spec gives it a view/)
    expect(
      await refused(page([{ component: 'Grid', props: { patch: { $object: { margin: 2 } } } }])),
    ).toMatch(/`PMLayoutPatch`, which declares no `margin`/)
    expect(
      await refused(page([{ component: 'Stack', props: { patch: { $object: { gap: [1] } } } }])),
    ).toMatch(/gives it a list/)
    expect(
      await refused(
        page([{ component: 'Select', props: { options: [{ $object: { label: 'L' } }] } }]),
      ),
    ).toMatch(/no case takes an object with `label`/)
    expect(await refused(page([{ component: 'Card', children: [{ $object: { a: 1 } }] }]))).toMatch(
      /draws views, and the spec gives it a structured object/,
    )
    expect(
      await refused(page([{ component: 'Button', props: { label: 'x', variant: 'ghost' } }])),
    ).toMatch(/more than one lawful cell for ghost/)
    expect(
      await refused(page([{ component: 'Heading', props: { level: 9 }, children: ['x'] }])),
    ).toMatch(/no case for 9/)
    expect(
      await refused(page([{ component: 'Stat', props: { label: 'a', value: null } }])),
    ).toMatch(/gives it `null`/)
    expect(
      await refused(page([{ component: 'Stat', props: { label: 'a', value: '1', spark: 'x' } }])),
    ).toMatch(/gives it the text "x"/)
    expect(
      await refused(
        page([{ component: 'Stat', props: { label: 'a', value: { component: 'Separator' } } }]),
      ),
    ).toMatch(/gives it the element `Separator`/)
    expect(
      await refused(page([{ component: 'Stat', props: { label: 'a', value: true } }])),
    ).toMatch(/gives it `true`/)
    expect(
      await refused(
        page([{ component: 'Stat', props: { label: 'a', value: '1', spark: [null] } }]),
      ),
    ).toMatch(/`Double`, and the spec gives it `null`/)
    expect(await refused(page([{ component: 'Grid', props: { gap: 4.5 } }]))).toMatch(
      /no case for 4.5/,
    )
    expect(
      await refused(
        page([
          {
            component: 'Stat',
            props: { label: 'a', value: '1', delta: { $object: { value: '1' } } },
          },
        ]),
      ),
    ).toMatch(/`direction` is required in `PMStatDelta`/)
    expect(await refused(page([{ component: 'Stat', props: { value: '1' } }]))).toMatch(
      /`Stat`’s `label` is required/,
    )
    expect(
      await refused(
        page([{ component: 'Stat', props: { label: 'a', value: '1', colour: 'red' } }]),
      ),
    ).toMatch(/declares no `colour`/)
    expect(await refused(page([{ component: 'Gadget' }]))).toMatch(/declares no `PMGadgetProps`/)
    expect(
      await refused(
        page([{ component: 'Button', props: { label: 'x', variant: { $: 'onSave' } } }]),
      ),
    ).toMatch(/written as literals/)
    expect(
      await refused(
        page([{ component: 'Button', props: { label: 'x', variant: 'solid', tone: 'neutral' } }]),
      ),
    ).toMatch(/no lawful cell for solid and neutral/)
    expect(await refused(page([{ component: 'Checkbox', props: { checked: 'maybe' } }]))).toMatch(
      /no case for 'maybe' in `PMCheckedState`/,
    )
    expect(
      await refused(page([{ component: 'Button', props: { label: 'x', icon: 'not-a-role' } }])),
    ).toMatch(/no case for "not-a-role" in `PMIconRole`/)
    // A size the foundation does not declare is no case, not a guess at one.
    expect(
      await refused(page([{ component: 'Select', props: { size: 'xl', options: [] } }])),
    ).toMatch(/no case for "xl" in `PMControlSize`/)
  })

  it('refuses a prop the contract cannot express yet, rather than writing into it', async () => {
    const spec = probe({
      root: {
        component: 'SettingsPage',
        props: { title: 'Probe' },
        children: [
          { component: 'Input', props: { 'aria-label': 'Name', onSelect: { $: 'onSave' } } },
        ],
      },
    })
    expect(validateSpec(registry, spec, { native: ios })).toEqual({ ok: true, faults: [] })
    const result = await emitCheckedScreen(spec, { native: ios })
    expect(result.code).toBe('')
    expect(result.fatal).toMatch(
      /`Input`’s `onSelect` is `PMUnsupportedInputOnSelect\?`, a prop the Swift contract cannot express yet/,
    )
  })

  it('refuses a binding whose input is not of the type the prop wants', async () => {
    const refused = async (inputs: ScreenInput[], children: ScreenSpec['root']['children']) => {
      const result = await emitCheckedScreen(
        probe({
          types: { '@polymorph/react-ui': ['DataTableColumn'] },
          inputs,
          root: { component: 'SettingsPage', props: { title: 'Probe' }, children },
        }),
        { native: ios },
      )
      expect(result.code).toBe('')
      return result.fatal ?? ''
    }
    expect(
      await refused(
        [{ name: 'count', type: 'number' }],
        [{ component: 'Heading', children: [{ $: 'count' }] }],
      ),
    ).toMatch(/`Heading`’s `children` is `String`, and `count` is `Double`/)
    expect(
      await refused(
        [{ name: 'count', type: 'number' }],
        [{ component: 'Card', children: [{ $: 'count' }] }],
      ),
    ).toMatch(/`Card`’s `children` is `String`, and `count` is `Double`/)
    expect(
      await refused(
        [{ name: 'busy', type: 'string' }],
        [{ component: 'Button', props: { label: 'x', disabled: { $: 'busy' } } }],
      ),
    ).toMatch(/`Button`’s `disabled` is `Bool\?`, and `busy` is `String`/)
    expect(
      await refused(
        [
          { name: 'rows', type: 'string[]' },
          { name: 'columns', type: 'DataTableColumn<string>[]' },
          { name: 'getRowId', type: '((row: string) => string) | null' },
        ],
        [
          {
            component: 'DataTable',
            props: {
              label: 'Rows',
              data: { $: 'rows' },
              columns: { $: 'columns' },
              getRowId: { $: 'getRowId' },
              emptyState: { $object: { title: 'None' } },
            },
          },
        ],
      ),
    ).toMatch(
      /`DataTable`’s `getRowId` is `@MainActor \(Row\) -> String`, and `getRowId` is `\(@MainActor \(String\) -> String\)\?`/,
    )
  })

  it('refuses a member its package does not draw, before anything is written', async () => {
    const undrawn = { ...ios, rendered: ios.rendered.filter((name) => name !== 'PMButton') }
    expect(validateSpec(registry, probe(), { native: undrawn }).faults).toEqual([
      {
        path: '$.root.children[0]',
        message: expect.stringMatching(
          /^`Button` has no SwiftUI rendering yet \(`packages\/native\/src\/pending\.ts`\)/,
        ),
      },
    ])
    const result = await emitCheckedScreen(probe(), { native: undrawn })
    expect(result.code).toBe('')
    expect(result.fatal).toMatch(/`Button` has no SwiftUI rendering yet/)
  })

  it('needs the member package, of its own platform, and says so as a refusal', async () => {
    await expect(emitScreen(probe())).rejects.toThrow(MissingContractError)
    const result = await emitCheckedScreen(probe())
    expect(result).toMatchObject({ code: '', violations: [] })
    expect(result.fatal).toContain(NATIVE_FILES.ios.contract)
    const android = readNativePackage(ROOT, 'android')
    await expect(emitScreen(probe(), { native: android })).rejects.toThrow(
      /the one passed as `native` is android’s/,
    )
  })
})

describe('a native screen is checked against the contract before anything is written', () => {
  const faults = (spec: ScreenSpec) => validateSpec(registry, spec).faults

  it('accepts the probe, so each fault below is the one change', () => {
    expect(validateSpec(registry, probe())).toEqual({ ok: true, faults: [] })
  })

  it('refuses a type the table does not map, at the input’s type', () => {
    expect(
      faults(
        probe({
          inputs: [
            { name: 'resultCount', type: '{ shown: number; total: number }' },
            { name: 'level', type: "('a' | 'b')[] | 'c'" },
            { name: 'stage', type: "(from: 'a' | 'b') => 'c' | 'd'" },
            { name: 'thing', type: 'Thing' },
            { name: 'onSave', type: '() => void' },
          ],
        }),
      ),
    ).toEqual([
      {
        path: '$.inputs[0].type',
        message:
          '`{ shown: number; total: number }` is an object type literal — Swift types by name, so ' +
          'name the structure: a vocabulary type such as `FilterResultCount`, or one of the app’s, ' +
          'in `types`',
      },
      {
        path: '$.inputs[1].type',
        message: expect.stringMatching(/^`\('a' \| 'b'\)\[\] \| 'c'` is a union of unlike types/),
      },
      {
        path: '$.inputs[2].type',
        message: expect.stringMatching(/holds two unions of string literals/),
      },
      {
        path: '$.inputs[3].type',
        message: expect.stringMatching(/names `Thing`, which `types` does not declare/),
      },
    ])
  })

  it('leaves a type that is not one TypeScript type to its own fault', () => {
    const found = faults(probe({ inputs: [{ name: 'onSave', type: '() => void }; let x = {' }] }))
    expect(found.filter((fault) => fault.path === '$.inputs[0].type')).toHaveLength(1)
  })

  it('skips the type table in the browser half, which has no parser', () => {
    const spec = probe({
      inputs: [
        { name: 'onSave', type: '() => void' },
        { name: 'x', type: '{ a: 1 }' },
      ],
    })
    expect(validateComposition(registry, spec).faults).toEqual([])
  })

  it('refuses `loadStatus` and words Swift has taken as input names', () => {
    expect(
      faults(
        probe({
          inputs: [
            { name: 'loadStatus', type: 'string' },
            { name: 'func', type: 'string' },
            { name: 'async', type: 'string' },
            { name: 'onSave', type: '() => void' },
          ],
        }),
      ).map((fault) => [fault.path, fault.message.slice(0, 40)]),
    ).toEqual([
      ['$.inputs[0].name', '`loadStatus` is the model’s first field,'],
      ['$.inputs[1].name', '`func` is a word Swift has taken — every'],
      ['$.inputs[2].name', '`async` is a word Swift has taken — ever'],
    ])
  })

  it('refuses a root that is not a page archetype, AppShell included', () => {
    const stack = faults(
      probe({
        root: {
          component: 'Stack',
          children: [{ component: 'Button', props: { label: 'x', onClick: { $: 'onSave' } } }],
        },
      }),
    )
    expect(stack).toEqual([
      {
        path: '$.root',
        message:
          'a native screen’s root is a page archetype that draws the four load states, and `Stack` ' +
          'is not one — use ListPage, DetailPage, FormPage, Dashboard, SettingsPage, ' +
          'MasterDetailPage, SearchPage, ConversationPage or AuthPage',
      },
    ])
    const shell = faults(
      probe({ root: { component: 'AppShell', props: { brand: 'x' }, children: ['x'] } }),
    )
    expect(shell.find((fault) => fault.message.includes('page archetype'))?.message).toMatch(
      /AppShell is the app’s frame around its router$/,
    )
  })

  it('refuses a bound `empty` or `pending`, which the status sets', () => {
    const list = probe({
      inputs: [
        { name: 'isEmpty', type: 'boolean' },
        { name: 'onSave', type: '() => void' },
      ],
      root: {
        component: 'ListPage',
        props: { title: 'x', empty: { $: 'isEmpty' }, emptyState: { $object: { title: 'x' } } },
        children: ['x'],
      },
    })
    expect(faults(list)).toEqual([
      {
        path: '$.root.props.empty',
        message:
          '`ListPage`’s `empty` is set from `loadStatus` on a native screen — remove it, and set ' +
          'the model’s `loadStatus` in the app’s store',
      },
    ])
    const auth = probe({
      root: { component: 'AuthPage', props: { title: 'x', pending: true }, children: ['x'] },
    })
    expect(faults(auth).map((fault) => fault.path)).toEqual(['$.root.props.pending'])
  })

  it('refuses an event bound to data, data bound to an action, and a path into an action', () => {
    const spec = probe({
      inputs: [
        { name: 'label', type: 'string' },
        { name: 'onSave', type: '() => void' },
      ],
      root: {
        component: 'SettingsPage',
        props: { title: { $: 'onSave' }, onRetry: 'again' },
        children: [
          { component: 'Button', props: { label: { $: 'onSave.name' }, onClick: { $: 'label' } } },
          { $: 'onSave' },
          { component: 'Card', children: [{ component: 'Text', children: [{ $: 'onSave.x' }] }] },
        ],
      },
    })
    expect(faults(spec)).toEqual([
      {
        path: '$.root.props.title',
        message: '`title` holds data, and `onSave` is an action — bind it to a model input',
      },
      {
        path: '$.root.props.onRetry',
        message:
          '`onRetry` is an event, and an event is handed an action — bind it to a function-typed input',
      },
      {
        path: '$.root.children[0].props.label',
        message:
          '`onSave.name` is a path into the action `onSave`, and an action has no fields — bind `onSave` itself, or a model input',
      },
      {
        path: '$.root.children[0].props.onClick',
        message:
          '`onClick` is an event, and `label` is model data — bind it to a function-typed input, an action',
      },
      {
        path: '$.root.children[1]',
        message: 'a child is drawn, and `onSave` is an action — bind a model input',
      },
      {
        path: '$.root.children[2].children[0].children[0]',
        message:
          '`onSave.x` is a path into the action `onSave`, and an action has no fields — bind `onSave` itself, or a model input',
      },
    ])
  })

  it('accepts `onRetry` on a page archetype for a native platform only', () => {
    const retry = probe({
      inputs: [
        { name: 'onRetry', type: '() => void' },
        { name: 'onSave', type: '() => void' },
      ],
      root: { ...probe().root, props: { title: 'x', onRetry: { $: 'onRetry' } } },
    })
    expect(validateSpec(registry, retry).ok).toBe(true)
    const { platform: _, ...forWeb } = retry
    expect(validateSpec(registry, forWeb).faults[0]?.message).toMatch(/has no prop `onRetry`/)
  })

  it('refuses a variant or a tone that names no single cell, or is bound', () => {
    const page = (props: Record<string, unknown>) =>
      probe({
        inputs: [
          { name: 'tone', type: 'string' },
          { name: 'onSave', type: '() => void' },
        ],
        root: {
          ...probe().root,
          children: [{ component: 'Button', props: { label: 'x', ...props } as never }],
        },
      })
    expect(faults(page({ variant: 'ghost' }))).toEqual([
      {
        path: '$.root.children[0].props.variant',
        message:
          '`Button`’s variant and tone are one lawful cell on a native screen, and `ghost` pairs ' +
          'with `neutral`, `accent`, `danger` — give `tone` too',
      },
    ])
    expect(faults(page({ tone: 'neutral' })).map((fault) => fault.message)).toEqual([
      expect.stringMatching(/`neutral` pairs with `outline`, `ghost` — give `variant` too$/),
    ])
    expect(faults(page({ variant: 'solid' }))).toHaveLength(1)
    expect(faults(page({ variant: 'soft', tone: 'danger' }))).toEqual([])
    expect(faults(page({ tone: { $: 'tone' } })).map((fault) => fault.path)).toEqual([
      '$.root.children[0].props.tone',
    ])
  })

  it('refuses several texts where a member takes one', () => {
    const spec = probe({
      inputs: [
        { name: 'name', type: 'string' },
        { name: 'onSave', type: '() => void' },
      ],
      root: {
        ...probe().root,
        children: [{ component: 'Heading', children: ['Hello, ', { $: 'name' }] }],
      },
    })
    expect(faults(spec)).toEqual([
      {
        path: '$.root.children[0].children',
        message:
          '`Heading` takes its children as one text on a native screen, and this has 2 — join them in the app’s store and bind one input',
      },
    ])
  })

  it('refuses a name that leaves no stem, or whose declarations `types` or SwiftUI already names', () => {
    expect(faults(probe({ name: 'View' })).map((fault) => fault.path)).toEqual(['$.name'])
    expect(faults(probe({ name: 'Screen' }))[0]?.message).toBe(
      '`Screen` leaves no name once its suffix is gone, and the file declares `<Name>Model`, ' +
        '`<Name>Actions` and `<Name>View` — name the screen for what it shows',
    )
    for (const name of ['AnyView', 'EmptyScreen']) {
      expect(faults(probe({ name }))).toEqual([
        {
          path: '$.name',
          message: expect.stringMatching(/which it also uses from SwiftUI — name the screen/),
        },
      ])
    }
    expect(
      faults(probe({ name: 'InboxScreen', types: { './app': ['InboxModel', 'InboxView'] } })),
    ).toEqual([
      {
        path: '$.name',
        message:
          'the emitted file declares `InboxModel`, which `types` also names from `./app` — name the screen something else',
      },
      {
        path: '$.name',
        message:
          'the emitted file declares `InboxView`, which `types` also names from `./app` — name the screen something else',
      },
    ])
  })
})

describe('names', () => {
  it('drops a trailing View or Screen from the screen’s name, once', () => {
    expect(screenStem('InboxView')).toBe('Inbox')
    expect(screenStem('InboxScreen')).toBe('Inbox')
    expect(screenStem('Inbox')).toBe('Inbox')
    expect(swiftNames('PreviewScreen')).toEqual({
      model: 'PreviewModel',
      actions: 'PreviewActions',
      view: 'PreviewView',
    })
  })

  it('tells a function type from data by its text, as a printed prop or a written input', () => {
    expect(isActionType('() => void')).toBe(true)
    expect(
      isActionType('((event: MouseEvent<HTMLButtonElement, MouseEvent>) => void) | undefined'),
    ).toBe(true)
    expect(isActionType('() => void | Promise<void>')).toBe(true)
    expect(isActionType('(() => void) | null')).toBe(true)
    expect(isActionType('<T>(value: T) => void')).toBe(true)
    expect(isActionType('((a: string) => void) | ((b: string[]) => void) | undefined')).toBe(true)
    expect(isActionType('DataTableColumn<Row>[]')).toBe(false)
    expect(isActionType('(() => void)[]')).toBe(false)
    expect(isActionType('string | (() => void)')).toBe(false)
    expect(isActionType('(string)')).toBe(false)
    expect(isActionType('<T(value: T) => void')).toBe(false)
    expect(isActionType('(value: T => void')).toBe(false)
  })
})

describe('the Relay example', () => {
  it.each([
    ['inbox', 'InboxView'],
    ['new-ticket', 'NewTicketView'],
  ])('holds the %s screen the emitter writes today (`pnpm emit:examples`)', async (name, view) => {
    const spec = native(name)
    expect(validateSpec(registry, spec, { native: ios })).toEqual({ ok: true, faults: [] })
    expect(read(`${EXAMPLE}/Sources/RelayExample/${view}.swift`)).toBe(await emitProbe(spec))
  })

  /*
   * The Swift package builds the example and renders the inbox in its four
   * load states and the new-ticket form in four of its own
   * (`Examples/Relay/Tests/RelayExampleTests`), where the Swift
   * toolchain exists, as `packages/theme/src/swift-build.test.ts` builds the
   * token package. SwiftPM holds a lock on the package's build directory, so a
   * build that starts while another runs waits for it.
   */
  const PACKAGE = resolve(ROOT, 'platforms/ios')
  const hasSwift = spawnSync('xcrun', ['--find', 'swift'], { stdio: 'ignore' }).status === 0
  const TIMEOUT = 5 * 60_000
  const title = (text: string) => (hasSwift ? text : `${text} (skipped: no \`xcrun swift\` here)`)

  /** Runs `xcrun` with `args`; the output when it fails, or '' when it succeeds. */
  async function xcrun(args: string[]): Promise<string> {
    const result = await promisify(execFile)('xcrun', args, {
      timeout: TIMEOUT,
      maxBuffer: 64 * 1024 * 1024,
    }).catch((error: { stdout?: string; stderr?: string; message: string }) => error)
    return 'message' in result
      ? `${result.stdout ?? ''}\n${result.stderr ?? ''}\n${result.message}`
      : ''
  }

  it.skipIf(!hasSwift)(
    title('builds against PolymorphUI with swift build'),
    async () => {
      expect(
        await xcrun(['swift', 'build', '--package-path', PACKAGE, '--target', 'RelayExample']),
      ).toBe('')
    },
    TIMEOUT,
  )

  it.skipIf(!hasSwift)(
    title('renders the inbox and the new-ticket form with swift test'),
    async () => {
      expect(
        await xcrun(['swift', 'test', '--package-path', PACKAGE, '--filter', 'RelayExampleTests']),
      ).toBe('')
    },
    TIMEOUT,
  )
})
