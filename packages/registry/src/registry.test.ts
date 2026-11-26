import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, relative, resolve } from 'node:path'

import { RULE_NAMES as CSS_RULE_NAMES } from '@polymorph/rules/stylelint'
import { tokenValues } from '@polymorph/rules/stylelint/emitted'
import { CHROMA_BUDGETS, PREPAINT_SCRIPT } from '@polymorph/theme'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { agentSection, readAgent } from './agent'
import { specOfMember } from './behaviour'
import { fixtureFacts, FLATTENED_PARTS } from './vocabulary'
import { buildRegistry, renderRegistry, type Registry } from './build'
import { firstDifference } from './diff'
import { REGISTRY_SHAPE, SCHEMA_ID } from './schema'
import { readTheme } from './theme'
import { jsonSchema, validate } from './shape'

/**
 * The registry's laws.
 *
 * Three assertions state what the registry promises. It validates against its
 * own published schema, it regenerates byte-identical on an unchanged tree,
 * and it covers the whole vocabulary, not only what it happened to reach. The
 * other tests follow the rule this repo applies to every law it writes: they
 * show that each check can fail.
 */

const ROOT = resolve(import.meta.dirname, '../../..')

/** The catalogue as the filesystem lists it. This defines what "finds every X" means. */
function onDisk(dir: string): string[] {
  return readdirSync(resolve(ROOT, dir))
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.replace(/\.json$/, ''))
    .sort()
}

const registry = buildRegistry(ROOT)
const byName = new Map(registry.components.map((component) => [component.name, component]))

describe('the registry validates against its own published schema', () => {
  it('has no faults', () => {
    expect(validate(REGISTRY_SHAPE, registry)).toEqual([])
  })

  it('publishes that schema as JSON Schema, from the same description', () => {
    const schema = jsonSchema(REGISTRY_SHAPE) as {
      type: string
      required: string[]
      additionalProperties: boolean
      properties: Record<string, unknown>
    }

    expect(schema.type).toBe('object')
    expect(schema.additionalProperties).toBe(false)
    expect(schema.required).toEqual([
      'schema',
      'version',
      'platforms',
      'frameworks',
      'components',
      'dataTypes',
      'vendor',
      'packages',
      'icons',
      'theme',
      'exceptions',
      'laws',
    ])
    // Both readings of "lawful" must agree. That is why the validator and the
    // schema are projections of one object, not two hand-written files.
    expect(Object.keys(schema.properties)).toEqual(schema.required)
  })

  it('says which version of the shape it is', () => {
    expect(registry.schema).toBe(SCHEMA_ID)
  })
})

describe('the schema check can fail', () => {
  const broken = (mutate: (draft: Registry) => void): string[] => {
    const draft = JSON.parse(JSON.stringify(registry)) as Registry
    mutate(draft)
    return validate(REGISTRY_SHAPE, draft)
  }

  it('catches a missing field', () => {
    expect(
      broken((draft) => {
        delete (draft.components[0] as { purpose?: string }).purpose
      }),
    ).toContain('$.components[0].purpose: missing')
  })

  it('catches a field of the wrong type', () => {
    expect(
      broken((draft) => {
        ;(draft.components[0] as unknown as { props: unknown }).props = 'a lot'
      }).join('\n'),
    ).toContain('$.components[0].props: expected an array')
  })

  it('catches a field the schema does not describe', () => {
    expect(
      broken((draft) => {
        ;(draft.components[0] as unknown as { extra: number }).extra = 1
      }),
    ).toContainEqual(
      expect.stringContaining(
        '$.components[0].extra: `extra` is not in the schema — the fields here are `name`, ',
      ),
    )
  })

  it('catches a value outside its enum', () => {
    expect(
      broken((draft) => {
        ;(draft.components[0] as { tier: string }).tier = 'somewhere-else'
      }).join('\n'),
    ).toContain('is not one of')
  })

  it('accepts null exactly where the shape allows it', () => {
    expect(
      broken((draft) => {
        ;(draft.components[0] as { spec: string | null }).spec = null
      }),
    ).toEqual([])
    expect(
      broken((draft) => {
        ;(draft.components[0] as unknown as { name: string | null }).name = null
      }).join('\n'),
    ).toContain('expected a string')
  })
})

describe('it regenerates byte-identical on an unchanged tree', () => {
  it('builds the same document twice', () => {
    // A second, independent build, with a fresh TypeScript program and a fresh
    // read of every system and palette. Anything non-deterministic in the
    // generator (an unsorted `Object.keys`, a timestamp, a path with an absolute
    // prefix) shows up here as a diff, not later as unexplained registry churn.
    const again = renderRegistry(buildRegistry(ROOT))
    expect(firstDifference(renderRegistry(registry), again)).toBeNull()
    // This builds a whole TypeScript program over the vocabulary twice. It is
    // slow on a machine also running the browser suite, but the registry's
    // determinism rests on this assertion.
  }, 60_000)

  it('contains no absolute path or timestamp', () => {
    const text = renderRegistry(registry)
    expect(text).not.toContain(ROOT)
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/)
  })
})

describe('it covers the whole vocabulary', () => {
  it('has every component the gallery registry ships', () => {
    // This reads the same source as the completeness law and the
    // spec-staleness law. A component added to the vocabulary is added to the
    // registry in the same commit, because this file keeps no list to update.
    expect(registry.components.length).toBeGreaterThan(50)
    expect(byName.has('Button')).toBe(true)
    expect(byName.has('Combobox')).toBe(true)
    expect(byName.has('AppShell')).toBe(true)
  })

  it('points every component at source that exists', () => {
    for (const component of registry.components) {
      const { source, styles, states } = component.files
      expect(existsSync(resolve(ROOT, source)), `${component.name} source`).toBe(true)
      if (styles !== null) expect(existsSync(resolve(ROOT, styles)), styles).toBe(true)
      if (states !== null) expect(existsSync(resolve(ROOT, states)), states).toBe(true)
    }
  })

  it('gives every component a purpose and a prop surface', () => {
    const mute = registry.components.filter((component) => component.purpose === '')
    expect(mute.map((component) => component.name)).toEqual([])
  })

  it('finds the spec each component was built from', () => {
    const unspecced = registry.components
      .filter((component) => component.spec === null)
      .map((component) => component.name)
    expect(unspecced).toEqual([])
  })
})

describe('every member says how it renders on every platform', () => {
  // The law over the files themselves is `platforms.test.ts`. These check that
  // the registry publishes what the files say, for members and primitives alike.
  it('publishes the platforms, in the order each entry is keyed', () => {
    expect(registry.platforms).toEqual(['web', 'ios', 'android'])
    for (const member of [...registry.components, ...registry.exceptions.primitives]) {
      expect(Object.keys(member.platforms), member.name).toEqual(registry.platforms)
    }
  })

  it('carries each file’s entry verbatim', () => {
    const ios = JSON.parse(readFileSync(resolve(ROOT, 'design/platforms/ios.json'), 'utf8')) as {
      members: Record<string, unknown>
    }
    for (const member of [...registry.components, ...registry.exceptions.primitives]) {
      expect(member.platforms.ios, member.name).toEqual(ios.members[member.name])
    }
  })

  it('has every member native on the web, and names a substitute wherever one is absent', () => {
    expect(registry.components.every((member) => member.platforms.web.status === 'native')).toBe(
      true,
    )
    expect(byName.get('Tooltip')?.platforms.ios).toMatchObject({
      status: 'absent',
      substitute: 'Text',
    })
    expect(byName.get('Dialog')?.platforms.android.status).toBe('adapted')
    expect(byName.get('Dialog')?.platforms.android.as).toBeTruthy()
  })

  it('is held to the schema: three statuses, and an entry for every platform', () => {
    const draft = JSON.parse(JSON.stringify(registry)) as Registry
    const first = draft.components[0] as unknown as { platforms: Record<string, unknown> }
    first.platforms['ios'] = { status: 'unsupported' }
    delete first.platforms['android']
    const faults = validate(REGISTRY_SHAPE, draft).join('\n')
    expect(faults).toContain('$.components[0].platforms.ios.status: "unsupported" is not one of')
    expect(faults).toContain('$.components[0].platforms.android: missing')
  })
})

describe('the prop surfaces are the real ones', () => {
  it('prints types, not just names', () => {
    const variant = byName.get('Button')?.props.find((prop) => prop.name === 'variant')
    expect(variant?.optional).toBe(true)
    expect(variant?.type).toContain('solid')
  })

  it('merges every branch of a discriminated union, not only the first', () => {
    // A walker that keeps only the first occurrence of a prop reports Button's
    // `variant` as `"solid"` alone and loses Accordion's multiple-selection
    // branch. Checking that *every* member is present catches truncation.
    const variant = byName.get('Button')?.props.find((prop) => prop.name === 'variant')
    for (const member of ['solid', 'soft', 'outline', 'ghost']) {
      expect(variant?.type, member).toContain(member)
    }
    const accordion = byName.get('Accordion')?.props.find((prop) => prop.name === 'type')
    expect(accordion?.type).toContain('single')
    expect(accordion?.type).toContain('multiple')
    const shape = byName.get('Skeleton')?.props.find((prop) => prop.name === 'shape')
    for (const member of ['text', 'rect', 'circle']) {
      expect(shape?.type, member).toContain(member)
    }
    // The optional flag records "may be omitted", so the printed union has no `undefined`.
    expect(variant?.type).not.toContain('undefined')
  })

  it('marks a required prop required', () => {
    const label = byName.get('Button')?.props.find((prop) => prop.name === 'label')
    expect(label?.optional).toBe(false)
  })

  it('carries a compound component’s parts under the component that owns them', () => {
    const table = byName.get('Table')
    expect(table?.props.map((prop) => prop.name)).toContain('Row.selected')
  })

  it('flattens only parts the member’s export carries, with the part’s own props', () => {
    // The native contracts are generated from the flattened props, so a part
    // named here that the export lost would leave a contract field nothing renders.
    for (const [member, names] of Object.entries(FLATTENED_PARTS)) {
      const component = byName.get(member)
      for (const name of names) {
        const part = component?.parts.find((candidate) => candidate.name === name)
        expect(part, `${member}.${name}`).toBeDefined()
        const flattened = component?.props
          .filter((prop) => prop.name.startsWith(`${name}.`))
          .map((prop) => prop.name.slice(name.length + 1))
        expect(flattened, `${member}.${name}`).toEqual(part?.props.map((prop) => prop.name))
      }
    }
    // A part outside the list is in `parts` only.
    expect(byName.get('AppShell')?.props.some((prop) => prop.name.includes('.'))).toBe(false)
  })

  it('reads every compound part from the member’s export, with the part’s props', () => {
    const parts = (name: string) => byName.get(name)?.parts.map((part) => part.name)
    expect(parts('Table')).toEqual(['Head', 'Body', 'Foot', 'Row', 'Header', 'Cell'])
    expect(parts('AppShell')).toEqual(['NavItem', 'NavGroup', 'UserCard'])
    expect(parts('Dashboard')).toEqual(['Panel'])
    expect(parts('Tabs')).toEqual(['Content'])
    expect(parts('Button')).toEqual([])
    const navItem = byName.get('AppShell')?.parts.find((part) => part.name === 'NavItem')
    expect(navItem?.props.find((prop) => prop.name === 'label')?.optional).toBe(false)
    // `controlKind` is a fact a parent reads, not a part.
    expect(parts('Checkbox')).toEqual([])
  })

  it('publishes Toast’s real API: the toast function and the components a screen mounts', () => {
    const toast = byName.get('Toast')
    expect(toast?.exports.map((entry) => [entry.name, entry.kind])).toEqual([
      ['toast', 'function'],
      ['ToastHost', 'component'],
      ['ToastNotice', 'component'],
      ['ToastViewportTarget', 'component'],
    ])
    const raise = toast?.exports.find((entry) => entry.name === 'toast')
    expect(raise?.members).toEqual(['success', 'danger', 'warning', 'info', 'promise', 'dismiss'])
    expect(raise?.props.map((prop) => prop.name)).toEqual(toast?.props.map((prop) => prop.name))
    const notice = toast?.exports.find((entry) => entry.name === 'ToastNotice')
    expect(notice?.props.map((prop) => prop.name)).toEqual(
      expect.arrayContaining(['title', 'tone', 'eventKey', 'dismissible', 'onDismiss']),
    )
  })

  it('finds a member’s exports only in its own files, never in another member’s', () => {
    // `CheckboxGroup.tsx` is named like Checkbox's files and declares a member of its own.
    expect(byName.get('Checkbox')?.exports).toEqual([])
    expect(byName.get('FormField')?.exports.map((entry) => entry.name)).toEqual(['ToastFormField'])
    expect(byName.get('Button')?.exports).toEqual([])
  })
})

describe('the data types come from the types the props name', () => {
  const byName = new Map(registry.dataTypes.map((type) => [type.name, type]))
  const field = (type: string, name: string) =>
    byName.get(type)?.fields.find((candidate) => candidate.name === name)

  it('lists each once, sorted by name', () => {
    const names = registry.dataTypes.map(({ name }) => name)
    expect(names).toEqual([...new Set(names)].sort((a, b) => a.localeCompare(b)))
  })

  it('gives an option, a column, a stat and a menu entry their fields', () => {
    expect(field('SelectOption', 'value')).toMatchObject({ type: 'string', optional: false })
    expect(field('SelectOption', 'label')).toMatchObject({ type: 'string', optional: false })
    // A generic type keeps its parameter, as a field's type names it.
    expect(byName.get('DataTableColumn')?.params).toEqual(['Row'])
    expect(field('DataTableColumn', 'cell')?.type).toContain('(row: Row) => ReactNode')
    expect(field('StatProps', 'label')).toMatchObject({ optional: false })
    expect(field('MenuItemEntry', 'onSelect')).toMatchObject({
      type: '() => void',
      optional: false,
    })
  })

  it('names the members of a union of named types, each a data type of its own', () => {
    const entry = byName.get('MenuEntry')
    expect(entry?.fields).toEqual([])
    expect(entry?.union).toContain('MenuItemEntry')
    for (const type of registry.dataTypes) {
      for (const member of type.union ?? [])
        expect(byName.has(member), `${type.name}: ${member}`).toBe(true)
    }
  })

  it('reaches a type nested in another, and none a node’s type argument names', () => {
    // `SelectOptionGroup.options` is `SelectOption[]`; `FormField` takes an element whose props
    // are `FormFieldControlProps`, which is not data a screen writes.
    expect(field('SelectOptionGroup', 'options')?.type).toBe('SelectOption[]')
    expect(byName.has('SelectOption')).toBe(true)
    expect(byName.has('FormFieldControlProps')).toBe(false)
    // A type a dependency declares is not the vocabulary's to describe.
    expect(byName.has('CalendarDate')).toBe(false)
    expect(byName.has('ReactElement')).toBe(false)
  })

  it('lists the own types the printed props name', () => {
    const declared = new Set(registry.dataTypes.map(({ name }) => name))
    // Each name in this list is printed by some member's prop, and is a type the vocabulary declares.
    for (const name of [
      'TabDescriptor',
      'TimelineEvent',
      'DescriptionListItem',
      'RadioOption',
      'ChartSeries',
    ]) {
      expect(declared.has(name), name).toBe(true)
      expect(
        registry.components.some((component) =>
          [...component.props, ...component.parts.flatMap((part) => part.props)].some((prop) =>
            new RegExp(`\\b${name}\\b`).test(prop.type),
          ),
        ),
        name,
      ).toBe(true)
    }
  })
})

describe('the lawful grids come from the typed grids', () => {
  it('reads Button’s cells as data', () => {
    expect(byName.get('Button')?.grid).toEqual({
      solid: ['accent', 'danger'],
      soft: ['accent', 'danger'],
      outline: ['neutral', 'accent', 'danger'],
      ghost: ['neutral', 'accent', 'danger'],
    })
  })

  it('reports null for a component without a grid', () => {
    expect(byName.get('Card')?.grid).toBeNull()
  })
})

describe('the dependency closures come from the import graph', () => {
  /**
   * Icon ships in `@polymorph/react`, so Button reaches a package that a
   * consumer installs, not a file they must be given. Button does not reach the
   * *component* Icon or, through Icon's map, `lucide`. That is the purpose of
   * the boundary. The installer reads this to know that vendoring Button means
   * copying one file and adding one dependency.
   */
  it('resolves what a component reaches, transitively', () => {
    const button = byName.get('Button')
    expect(button?.dependencies.packages).toContain('@polymorph/react')
    expect(button?.dependencies.components).not.toContain('Icon')
    // The icon set stays behind the gateway and the boundary. A consumer never
    // installs `lucide`. They install the React foundation.
    expect(button?.dependencies.packages).not.toContain('lucide')
  })

  it('reaches the engine only through the React foundation', () => {
    // `@polymorph/react` re-exports the engine, and it is the one package of
    // ours the vocabulary's manifest depends on. A member that imported the
    // engine by name would not resolve for a consumer who installs
    // `@polymorph/react-ui` instead of vendoring it.
    for (const component of registry.components) {
      if (component.origin !== 'vendored') continue
      expect(component.dependencies.packages, component.name).not.toContain('@polymorph/engine')
    }
  })

  it('says which side of the boundary each component sits on', () => {
    expect(byName.get('Icon')?.origin).toBe('installed')
    expect(byName.get('Button')?.origin).toBe('vendored')
    expect(byName.get('Icon')?.files.source).toBe('packages/react/src/icon/Icon.tsx')

    // Icon is the only installed member. Adding another is a packaging
    // decision, and its reason belongs here, not only in a diff.
    const installed = registry.components.filter((c) => c.origin === 'installed').map((c) => c.name)
    expect(installed).toEqual(['Icon'])
  })

  it('points each component at its states fixture', () => {
    // The fixture is not always `<slug>.states.tsx` beside the component. Icon
    // ships from the React foundation, but its gallery stays with the
    // vocabulary, because the fixture composes `Inline`. The fixture is read
    // from the gallery registry's own import graph, so the path is always the
    // real one.
    expect(byName.get('Icon')?.files.states).toBe(
      'packages/react-ui/src/conventions/icon.states.tsx',
    )
    expect(byName.get('Button')?.files.states).toBe(
      'packages/react-ui/src/controls/button.states.tsx',
    )
  })

  it('reaches a substrate through the component that owns it', () => {
    const command = byName.get('Command')
    expect(command?.dependencies.packages).toEqual(
      expect.arrayContaining(['@radix-ui/react-dialog', 'react-aria', 'react-stately']),
    )
    expect(command?.dependencies.components).toContain('Kbd')
  })

  it('names no component that is not in the registry, and none that is itself', () => {
    for (const component of registry.components) {
      expect(component.dependencies.components).not.toContain(component.name)
      for (const dependency of component.dependencies.components) {
        expect(byName.has(dependency), `${component.name} -> ${dependency}`).toBe(true)
      }
    }
  })

  it('leaves React out, because it is a peer dependency of everything', () => {
    for (const component of registry.components) {
      expect(component.dependencies.packages).not.toContain('react')
      expect(component.dependencies.packages).not.toContain('react-dom')
    }
  })
})

describe('the token × component matrix comes from the stylesheets', () => {
  it('publishes the tokens each component reads, assignment classes included', () => {
    const button = byName.get('Button')
    expect(button?.tokens).toContain('--pm-radius-control')
    expect(button?.tokens).toContain('--pm-shadow-seat')
    // Own file only: Button composes the focus convention but does not read
    // the ring's tokens itself, and the matrix must not claim it does.
    expect(button?.tokens).not.toContain('--pm-border-focus')
  })

  it('gives every styled component a token list, except the two that read none', () => {
    // Spinner composes everything it uses (the spin convention, currentcolor)
    // and reads no token in its own file. ProviderButton is the second, for
    // the same reason one level up. It is Button `outline`/`neutral` by
    // reference, so every token it uses is read in Button's sheet. Its own
    // sheet adds only a seat for a mark whose colours belong to the provider,
    // so they are not tokens. Any other component at zero is a bug.
    const HONEST_ZEROS = new Set(['Spinner', 'ProviderButton'])
    for (const component of registry.components) {
      if (component.files.styles === null || HONEST_ZEROS.has(component.name)) continue
      expect(component.tokens.length, component.name).toBeGreaterThan(0)
    }
  })
})

describe('the states come from the states fixtures', () => {
  it('lists the entries a fixture renders and the selectors its CSS must carry', () => {
    const select = byName.get('Select')
    expect(select?.states).toContain('closed rest')
    expect(select?.requiredSelectors).toContain('[data-state="open"]')
  })

  it('lists an entry a fixture names once per item of a list it declares', () => {
    expect(byName.get('Icon')?.states).toEqual(
      expect.arrayContaining(['all action roles', 'all form roles']),
    )
    expect(byName.get('Tooltip')?.states).toContain('open, side left')
    const source = ts.createSourceFile(
      'probe.states.tsx',
      [
        "const SIDES = ['top', 'end'] as const",
        'const outside = pick()',
        'export const states = { entries: [',
        '  ...SIDES.flatMap((side) => [1, 2].map((step) => ({ name: `${side} ${step}`, render: () => null }))),',
        '  ...outside.map((cell) => ({ name: `cell ${cell}`, render: () => null })),',
        '] }',
      ].join('\n'),
      ts.ScriptTarget.ESNext,
      true,
      ts.ScriptKind.TSX,
    )
    expect(fixtureFacts(source).states).toEqual(['top 1', 'top 2', 'end 1', 'end 2'])
  })
})

describe('the behaviour contracts come from the specs', () => {
  it('carries each member’s statements as its spec writes them, parsed', () => {
    expect(byName.get('Dialog')?.behaviour).toContainEqual({
      kind: 'key',
      key: 'Escape',
      effect: 'closes',
      text: 'key Escape closes when open md',
      state: 'open md',
    })
  })

  it('gives a member with no keyboard, focus or dismissal behaviour an empty contract', () => {
    expect(byName.get('Stack')?.behaviour).toEqual([])
  })

  it('covers every member with keyboard, focus, dismissal or announcement behaviour', () => {
    // Every overlay and every control, and the members of other tiers that
    // take keys or focus, dismiss or announce. A new member of these is caught
    // here without a fence. The chart tier takes keys and announces too, and
    // has no fence: its laws in `@polymorph/conformance` hold its behaviour
    // (`chart-reading`, `funnel-chart`, `treemap`, `bar-lines`), because a
    // chart's keys move a reading position whose result depends on the data.
    const behaving = [
      'Accordion',
      'Alert',
      'AudioPlayer',
      'Carousel',
      'ChatThread',
      'Collapsible',
      'DataTable',
      'ErrorSummary',
      'JsonTree',
      'LogView',
      'Pagination',
      'Plan',
      'SearchPage',
      'Spinner',
      'Stepper',
      'PromptInput',
      'SplitPane',
      'Table',
      'Tree',
    ]
    const uncovered = registry.components
      .filter(
        (component) =>
          component.tier === 'overlays' ||
          component.tier === 'controls' ||
          behaving.includes(component.name),
      )
      .filter((component) => component.behaviour.length === 0)
      .map((component) => component.name)
    expect(uncovered).toEqual([])
  })

  it('reads every contract from the spec the conformance law reads it from', () => {
    const specs = Object.fromEntries(
      ['design/components', 'design/archetypes'].flatMap((dir) =>
        readdirSync(resolve(ROOT, dir))
          .filter((file) => file.endsWith('.md'))
          .map((file) => [`${dir}/${file}`, readFileSync(resolve(ROOT, dir, file), 'utf8')]),
      ),
    )
    for (const component of registry.components) {
      if (component.spec === null) continue
      expect(specOfMember(component.name, specs), component.name).toBe(component.spec)
    }
  })
})

describe('the agent contracts come from the specs', () => {
  const specText = (component: Registry['components'][number]) =>
    component.spec === null ? '' : readFileSync(resolve(ROOT, component.spec), 'utf8')

  it('gives every member an agent field, null where its spec has no agent fence', () => {
    for (const component of registry.components) {
      expect(Object.hasOwn(component, 'agent'), component.name).toBe(true)
      const { agent } = readAgent(specText(component), component.spec ?? '')
      expect(component.agent, component.name).toEqual(agent)
    }
  })

  /*
   * A control and an overlay are what a person operates, so each one's spec decides what an
   * agent may do with it. A section with a fence grants what the fence states. A section with
   * no fence grants nothing, and its prose gives the reason. A spec with no section has not
   * decided, and neither has one whose section still holds the scaffolder's placeholder.
   */
  const undecided = (markdown: string): string | null => {
    const prose = agentSection(markdown)
    if (prose === null) return 'has no `## Agent` section'
    if (prose === '') return 'has an `## Agent` section with no prose'
    if (prose.includes('DECIDE')) return 'has an `## Agent` section that is not decided'
    return null
  }

  it('finds an `## Agent` section, decided, in the spec of every control and overlay', () => {
    const faults = registry.components
      .filter((component) => component.tier === 'controls' || component.tier === 'overlays')
      .map((component) => [component.name, undecided(specText(component))] as const)
      .filter(([, fault]) => fault !== null)
      .map(([name, fault]) => `${name} ${fault}`)
    expect(faults).toEqual([])
  })

  it('reads a section with prose and no fence as decided, and refuses the other forms', () => {
    expect(
      undecided("## Agent\n\nAn agent has nothing to read here: the text is the trigger's.\n"),
    ).toBe(null)
    expect(undecided('## A11y\n\nA button.\n')).toBe('has no `## Agent` section')
    expect(undecided('## Agent\n\n```agent\nstate disabled boolean\n```\n')).toBe(
      'has an `## Agent` section with no prose',
    )
    expect(undecided('## Agent\n\nDECIDE: what an agent reads and does.\n')).toBe(
      'has an `## Agent` section that is not decided',
    )
    // A heading inside a fence is an example, not the spec's own section.
    expect(undecided('## A11y\n\n````md\n## Agent\n\nAn example.\n````\n')).toBe(
      'has no `## Agent` section',
    )
  })

  it('publishes a parsed fence in the shape the schema describes, and refuses a malformed one', () => {
    const { agent } = readAgent(
      [
        '## Agent',
        '```agent',
        'state checked tristate as box aria-checked',
        'state disabled boolean',
        'action check sets checked calls onCheckedChange',
        '```',
      ].join('\n'),
      'design/components/checkbox.md',
    )
    const draft = JSON.parse(JSON.stringify(registry)) as Registry
    ;(draft.components[0] as { agent: unknown }).agent = agent
    expect(validate(REGISTRY_SHAPE, draft)).toEqual([])
    ;(draft.components[0] as { agent: unknown }).agent = { ...agent, actions: 'check' }
    expect(validate(REGISTRY_SHAPE, draft)).toEqual([
      '$.components[0].agent.actions: expected an array, got a string',
    ])
    ;(draft.components[0] as { agent: unknown }).agent = { ...agent, extra: true }
    expect(validate(REGISTRY_SHAPE, draft)).toEqual([
      expect.stringContaining(
        '$.components[0].agent.extra: `extra` is not in the schema — the fields here are ',
      ),
    ])
  })
})

/**
 * The attribute contract, and the defect it prevents.
 *
 * If `requiredSelectors` also answered this question, a component whose states
 * are all reachable from props would publish an empty contract while its
 * stylesheet keys on half a dozen attributes. The three known cases below can
 * be checked by hand. The shape test after them describes the defect itself,
 * so a regression cannot pass unnoticed.
 */
describe('the attribute contract comes from the stylesheet', () => {
  const attributes = (component: string) =>
    (byName.get(component)?.dataAttributes ?? []).map((attribute) => attribute.name)
  const valuesOf = (component: string, name: string) =>
    byName.get(component)?.dataAttributes.find((attribute) => attribute.name === name)?.values

  it('reads Timeline’s marks and tones out of its own selectors', () => {
    // This case shows the defect. `mark` and `tone` are props, so neither is in
    // `requiredSelectors`, and every attribute here comes from CSS.
    expect(byName.get('Timeline')?.dataAttributes).toEqual([
      { name: 'data-mark', values: ['dot', 'icon'] },
      { name: 'data-tone', values: ['accent', 'danger', 'info', 'success', 'warning'] },
    ])
  })

  it('reads Button’s five configured attributes, with the values its CSS pins', () => {
    expect(attributes('Button')).toEqual(
      expect.arrayContaining([
        'data-variant',
        'data-tone',
        'data-size',
        'data-state',
        'data-icon-only',
      ]),
    )
    expect(valuesOf('Button', 'data-variant')).toEqual(['ghost', 'outline', 'soft', 'solid'])
    // Matched on presence, so no values are published.
    expect(valuesOf('Button', 'data-icon-only')).toBeUndefined()
  })

  it('reads Heading’s level, which no fixture and no required selector mentions', () => {
    expect(attributes('Heading')).toEqual(['data-level'])
  })

  it('publishes a contract for every component whose CSS keys on one', () => {
    // The regression's shape: states reachable by props, an empty
    // `requiredSelectors`, and a stylesheet with attribute selectors. A
    // fixture-derived contract would be wrong for any component in that position.
    const lying = registry.components.filter((component) => {
      if (component.requiredSelectors.length > 0 || component.files.styles === null) return false
      const css = readFileSync(resolve(ROOT, component.files.styles), 'utf8')
      return /\[data-/.test(css) && component.dataAttributes.length === 0
    })
    expect(lying.map((component) => component.name)).toEqual([])

    // A known case, so the filter above cannot pass by matching nothing.
    const heading = byName.get('Heading')
    expect(heading?.requiredSelectors).toEqual([])
    expect(heading?.dataAttributes.length).toBeGreaterThan(0)
  })

  it('scopes a shared stylesheet by the classes each component applies', () => {
    // Stack, Inline and Grid are one stylesheet. A whole-file read would tell an
    // agent that a Stack takes columns and a Grid wraps.
    expect(attributes('Stack')).not.toContain('data-columns')
    expect(attributes('Inline')).toContain('data-wrap')
    expect(attributes('Grid')).toContain('data-columns')
    expect(attributes('Grid')).not.toContain('data-wrap')
  })

  it('follows `composes` into the table a stylesheet borrows rather than restates', () => {
    // Card's own sheet styles the radius and composes layout's padding lookup.
    expect(attributes('Card')).toEqual(expect.arrayContaining(['data-radius', 'data-p']))
    expect(valuesOf('Card', 'data-radius')).toEqual(['lg', 'md', 'none', 'pill', 'sm'])
  })

  it('claims nothing for a component that styles nothing of its own', () => {
    // ConfirmDialog composes Dialog and ships no stylesheet. An inherited
    // contract listed under its name would really be Dialog's.
    expect(byName.get('ConfirmDialog')?.files.styles).toBeNull()
    expect(byName.get('ConfirmDialog')?.dataAttributes).toEqual([])
  })

  it('never publishes the theme runtime’s attributes as a component’s own', () => {
    // `[data-motion='none']` reaches component CSS inside `:global(…)`, which
    // marks a selector as the document's, not the module's.
    const ambient = ['data-system', 'data-palette', 'data-mode', 'data-density', 'data-motion']
    for (const component of registry.components) {
      for (const attribute of component.dataAttributes) {
        expect(ambient, `${component.name} publishes ${attribute.name}`).not.toContain(
          attribute.name,
        )
      }
    }
  })

  it('is sorted and unique, in the document and inside every entry', () => {
    for (const component of registry.components) {
      const names = component.dataAttributes.map((attribute) => attribute.name)
      expect([...names].sort(), component.name).toEqual(names)
      expect([...new Set(names)], component.name).toEqual(names)
      for (const attribute of component.dataAttributes) {
        expect(attribute.values, `${component.name} ${attribute.name}`).not.toEqual([])
      }
    }
  })

  it('checks that stylesheets have the shape the extractor assumes', () => {
    // The extractor reads selectors with a regex, not a CSS parser. Two things
    // would make that unsafe: nested rules, and a `composes` whose target it
    // cannot resolve.
    const sheets = [
      ...new Set(
        registry.components.flatMap((component) => [
          ...(component.files.styles === null ? [] : [component.files.styles]),
          ...component.dependencies.files.filter((file) => file.endsWith('.css')),
        ]),
      ),
    ]
    expect(sheets.length).toBeGreaterThan(10)

    for (const sheet of sheets) {
      const css = readFileSync(resolve(ROOT, sheet), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ')
      expect(css, `${sheet} nests rules`).not.toMatch(/^\s*&/m)
      for (const declaration of css.match(/composes:[^;]*/g) ?? []) {
        expect(declaration, `${sheet} composes from nowhere`).toMatch(/\bfrom\b/)
      }
    }
  })
})

describe('the theme catalogue comes from the engine', () => {
  it('lists eight axes and says which are exposed to recipes', () => {
    expect(registry.theme.axes).toHaveLength(8)
    const exposed = registry.theme.axes.filter((axis) => axis.exposed).map((axis) => axis.name)
    expect(exposed).toEqual(['geometry', 'depth', 'ornament'])
  })

  it('publishes the magnitudes of the two scales that have them', () => {
    // Read from a resolved theme, so the density rounding is the engine's, not
    // a copy of the ladder it starts from.
    const { space, controlHeight } = registry.theme.standardDensity
    expect(Object.keys(space)).toEqual(registry.theme.scales['space'])
    expect(space['0']).toBe('0px')
    expect(space['6']).toBe('24px')
    expect(space['10']).toBe('96px')
    expect(controlHeight).toEqual({ sm: '32px', md: '36px', lg: '40px' })
  })

  it('publishes the custom properties a theme actually emits', () => {
    expect(registry.theme.customProperties).toContain('--pm-accent-bg')
    expect(registry.theme.customProperties).toContain('--pm-space-5')
    // Sorted and unique, so a diff is readable.
    expect([...new Set(registry.theme.customProperties)]).toEqual(registry.theme.customProperties)
    expect([...registry.theme.customProperties].sort()).toEqual(registry.theme.customProperties)
  })

  /**
   * Systems and palettes, in the catalogue's own shape.
   *
   * One row with axes, fonts and colour seeds together would merge what the
   * engine keeps separate, so there are two lists. The assertions below check
   * *shape*, not values. The theme package's law suite owns facts such as
   * "amethyst is hue 298", and a second copy of that table here would be one
   * more thing to update when a hue moves.
   */
  it('finds every system on disk, with its axes, fonts and default palette', () => {
    const systems = registry.theme.systems
    // Derived from the directory, never copied. The claim is "every system on
    // disk", so the disk is the expectation. A new theme is covered as soon as
    // its file exists, with no edit here (the laws suite reads the same
    // directories for the same reason).
    expect(systems.map((system) => system.name)).toEqual(onDisk('design/systems'))

    const names = new Set(registry.theme.palettes.map((palette) => palette.name))
    for (const system of systems) {
      // All eight, always. A system assigns every axis, and a registry that
      // published seven would describe a theme that cannot resolve.
      expect(Object.keys(system.axes).sort(), system.name).toEqual(
        registry.theme.axes.map((axis) => axis.name).sort(),
      )
      expect(system.fonts.flatMap((font) => font.roles).sort(), system.name).toEqual([
        'body',
        'display',
        'mono',
      ])
      // The default pairing must exist, or the eager sheet would be missing
      // this system's block.
      expect(names, system.name).toContain(system.defaultPalette)
      expect(['designed', 'tenant'], system.name).toContain(system.kind)
      expect(existsSync(resolve(ROOT, system.file)), system.file).toBe(true)
    }

    expect(new Map(systems.map((s) => [s.name, s.defaultPalette])).get('harbor')).toBe('ember')
  })

  /**
   * The values the rules name the nearest token with, per system.
   *
   * The rules read them from the CSS the reference pairing emits (`tokenValues`
   * in `@polymorph/rules/stylelint/emitted`). The registry reads them from the
   * resolved theme that CSS is emitted from. For the reference pairing, the
   * first system with its own palette, the two readings must be equal, or an
   * app `polymorph init` writes would name a different step than this
   * repository's own lint config does.
   */
  it('publishes each system’s token values, as the rules read them', () => {
    const [reference] = registry.theme.systems
    expect(reference?.tokenValues).toEqual(tokenValues(ROOT))

    const known = new Set(registry.theme.customProperties)
    for (const system of registry.theme.systems) {
      const values = system.tokenValues
      expect(Object.keys(values), system.name).toEqual([
        'color',
        'space',
        'radius',
        'text',
        'size',
        'duration',
      ])
      for (const [family, tokens] of Object.entries(values)) {
        expect(Object.keys(tokens).length, `${system.name} ${family}`).toBeGreaterThan(0)
        for (const name of Object.keys(tokens)) expect(known, name).toContain(name)
      }
      expect(Object.keys(values.space), system.name).toEqual(
        registry.theme.scales['space']?.map((step) => `--pm-space-${step}`),
      )
      // A colour that is not a role an application paints with is never offered.
      expect(Object.keys(values.color).some((name) => name.includes('chart'))).toBe(false)
    }

    // The values the page renders before any scope attribute: a system's own
    // density, not the catalogue's standard one. A compact system's ladder is
    // tighter, so its report names the step that renders the length written.
    const standard = Object.values(registry.theme.standardDensity.space)
    const byName = new Map(registry.theme.systems.map((system) => [system.name, system]))
    expect(Object.values(byName.get('plain')?.tokenValues.space ?? {})).toEqual(standard)
    expect(byName.get('harbor')?.axes['density']).toBe('compact')
    expect(Object.values(byName.get('harbor')?.tokenValues.space ?? {})).not.toEqual(standard)
  })

  it('finds every palette, and gives it no fonts and no system', () => {
    const palettes = registry.theme.palettes
    expect(palettes.map((palette) => palette.name)).toEqual(onDisk('design/palettes'))

    for (const palette of palettes) {
      // Fonts always belong to the system. A palette that carried one would be
      // a preset, and `polymorph add palette:…` would have to install it.
      expect(Object.keys(palette), palette.name).not.toContain('fonts')
      expect(Object.keys(palette), palette.name).not.toContain('axes')
      expect(palette.accentHue, palette.name).toBeGreaterThanOrEqual(0)
      expect(palette.accentHue, palette.name).toBeLessThanOrEqual(360)
      // The engine's list, not a copy. A copy here and one in `schema.ts` would
      // both need updating whenever a budget is added, and a check that depends
      // on someone remembering is unreliable.
      expect(CHROMA_BUDGETS, palette.name).toContain(palette.chromaBudget)
      expect(existsSync(resolve(ROOT, palette.file)), palette.file).toBe(true)
    }

    // `gradientHue` is absent, not null, when a palette has no partner hue. The
    // no-op form is a missing key, and a `null` would count as a seed.
    const byName = new Map(palettes.map((palette) => [palette.name, palette]))
    expect(byName.get('amethyst')?.gradientHue).toBe(265)
    expect('gradientHue' in (byName.get('petrol') ?? {})).toBe(false)
    // `neutralHue` is optional. The palettes azure, cobalt, iris, ochre,
    // verdigris and zinc set it, some on their accent's hue and some away from
    // it. The rest omit it, which shows the key stays optional.
    expect(
      palettes.filter((palette) => palette.neutralHue !== undefined).map((p) => p.name),
    ).toEqual(['azure', 'cobalt', 'iris', 'ochre', 'verdigris', 'zinc'])
    expect(byName.get('azure')?.neutralHue).toBe(250)
    expect('neutralHue' in (byName.get('petrol') ?? {})).toBe(false)
  })

  /**
   * A rename names a system or palette the catalogue ships, and the old name
   * is one it no longer has. An old name that came back would make an
   * install's recorded name mean two documents, and a current name that went
   * away would move an install onto nothing.
   */
  it('names a shipped successor for every renamed system and palette', () => {
    const halves = [
      ['systems', registry.theme.renamed.systems, registry.theme.systems],
      ['palettes', registry.theme.renamed.palettes, registry.theme.palettes],
    ] as const
    for (const [half, renamed, shipped] of halves) {
      const names = new Set(shipped.map((entry) => entry.name))
      for (const [old, current] of Object.entries(renamed)) {
        expect(names, `${half}: ${old} -> ${current}`).toContain(current)
        expect(names, `${half}: ${old}`).not.toContain(old)
      }
    }
    expect(registry.theme.renamed.systems['shadcn']).toBe('plain')
  })
})

/**
 * The installer's half of the registry.
 *
 * `polymorph add` copies the file list it receives and writes a manifest from
 * the ranges it receives. Without the facts below, the installer would have to
 * work them out itself. The architecture rule forbids that, because a front
 * that computes is a second source of truth.
 */
describe('it says what an install needs, so the installer does not have to guess', () => {
  const vendored = registry.components.filter((component) => component.origin === 'vendored')

  it('gives every vendored component a file closure that contains its own three files', () => {
    for (const component of vendored) {
      const { files } = component.dependencies
      expect(files, component.name).toContain(component.files.source)
      if (component.files.styles) expect(files, component.name).toContain(component.files.styles)
      if (component.files.states) expect(files, component.name).toContain(component.files.states)
    }
  })

  it('carries the convention files a stylesheet composes but no component owns', () => {
    // This case is why the file closure differs from the component closure.
    // Switch depends on no other component but still cannot be copied alone,
    // because `switch.module.css` composes the focus ring and the motion
    // conventions from two files that nothing exports.
    const control = byName.get('Switch')
    expect(control?.dependencies.components).toEqual([])
    expect(control?.dependencies.files).toContain('packages/recipes/src/controls/switch.module.css')
    expect(control?.dependencies.files).toContain(
      'packages/recipes/src/conventions/focus.module.css',
    )
    expect(control?.dependencies.files).toContain(
      'packages/recipes/src/conventions/motion.module.css',
    )
  })

  it('closes over every file, so an install compiles', () => {
    // This walks the published closure again, independently. Every relative
    // import and every `composes` target of every file in a component's closure
    // must itself be in that closure. A file the walk missed becomes a
    // module-not-found error in a consumer's repository.
    const edge = /(?:from\s+['"]([^'"]+)['"])|(?:composes:[^;]*?\bfrom\s+['"]([^'"]+)['"])/g

    for (const component of vendored) {
      const files = new Set(component.dependencies.files)
      for (const file of files) {
        const source = readFileSync(resolve(ROOT, file), 'utf8')
        for (const match of source.matchAll(edge)) {
          const specifier = match[1] ?? match[2] ?? ''
          // A recipe import names a file in the recipes' tree, which is copied too.
          const recipes = registry.vendor.recipes
          if (specifier.startsWith(`${recipes.package}/`)) {
            const recipe = `${recipes.root}/${specifier.slice(recipes.package.length + 1)}`
            expect(files, `${component.name}: ${file} -> ${specifier}`).toContain(recipe)
            continue
          }
          if (!specifier.startsWith('.')) continue

          const base = resolve(dirname(resolve(ROOT, file)), specifier)
          const candidates = [base, `${base}.tsx`, `${base}.ts`, `${base}/index.ts`]
          const resolved = candidates.find(existsSync)
          expect(resolved, `${component.name}: ${file} -> ${specifier}`).toBeDefined()
          expect(files, `${component.name}: ${file} -> ${specifier}`).toContain(
            relative(ROOT, resolved as string),
          )
        }
      }
    }
  })

  it('declares a package for every bare import in the closure, fixture chain included', () => {
    // The other half of "an install compiles". The file closure walks the
    // states fixture and the source walk does not, and the package list must
    // cover the *files*. Dialog's fixture builds a form, the form's field
    // mounts a ToastNotice, and the Toaster behind it imports
    // `@radix-ui/react-visually-hidden`. The install copies that file, so it must
    // declare that package. Otherwise the consumer's typecheck fails on a
    // module that pnpm's hoisting resolved silently here.
    const bare = /(?:^|\n)\s*(?:import|export)[^'"]*?from\s+['"]([^'".][^'"]*)['"]/g
    const fold = (specifier: string) =>
      specifier.startsWith('@')
        ? specifier.split('/').slice(0, 2).join('/')
        : (specifier.split('/')[0] as string)

    for (const component of vendored) {
      const packages = new Set(component.dependencies.packages)
      for (const file of component.dependencies.files) {
        if (!/\.tsx?$/.test(file)) continue
        const source = readFileSync(resolve(ROOT, file), 'utf8')
        for (const match of source.matchAll(bare)) {
          const name = fold(match[1] as string)
          if (name === 'react' || name === 'react-dom') continue
          // A recipe is copied beside its member and imported by a relative path there.
          if (name === registry.vendor.recipes.package) continue
          expect(packages.has(name), `${component.name}: ${file} imports ${name}`).toBe(true)
        }
      }
    }
  })

  it('vendors nothing from the React foundation, because it is installed', () => {
    const trees = [registry.vendor.root, registry.vendor.recipes.root].map((tree) => `${tree}/`)
    for (const component of registry.components) {
      for (const file of component.dependencies.files) {
        expect(
          trees.some((tree) => file.startsWith(tree)),
          `${component.name}: ${file}`,
        ).toBe(true)
      }
      if (component.origin === 'installed') expect(component.dependencies.files).toEqual([])
    }
  })

  it('names the ambient declaration nothing imports and every install needs', () => {
    expect(registry.vendor.support).toEqual(['packages/react-ui/src/css-modules.d.ts'])
    for (const file of registry.vendor.support) expect(existsSync(resolve(ROOT, file))).toBe(true)
  })

  it('names the base layer, which no closure walk can reach either', () => {
    /*
     * The second unreachable file. It is listed here, not in the installer,
     * because *where the base layer lives* is a fact about the vocabulary, and
     * the registry holds such facts. Composing the path inside `packages/cli`
     * would work, but a front would then hold a fact the catalogue should own.
     * If the file moved, the two would disagree and the catalogue would look
     * wrong.
     */
    expect(registry.vendor.base).toBe('packages/recipes/src/base.css')
    expect(existsSync(resolve(ROOT, registry.vendor.base))).toBe(true)

    // It has to be under the recipes' root, or `polymorph add` cannot rebase it
    // into the consumer's install directory.
    expect(registry.vendor.base.startsWith(`${registry.vendor.recipes.root}/`)).toBe(true)

    // It must be the page's base stylesheet, not just any file at that path.
    // The base layer declares no class, which is why no import reaches it.
    const source = readFileSync(resolve(ROOT, registry.vendor.base), 'utf8')
    expect(source).toContain('box-sizing')
    expect(source).not.toMatch(/^\s*\./m)
  })

  it('names the recipes’ package and tree, and finds every member’s recipe there', () => {
    // A member imports its recipe by package name. An install has to know which
    // tree that name points at, to copy the recipe and rewrite the import, and
    // the package's own manifest is the name's source.
    const { recipes } = registry.vendor
    expect(recipes).toEqual({ package: '@polymorph/recipes', root: 'packages/recipes/src' })
    const manifest = JSON.parse(
      readFileSync(resolve(ROOT, recipes.root, '../package.json'), 'utf8'),
    ) as { name: string }
    expect(manifest.name).toBe(recipes.package)

    // Icon ships with `@polymorph/react`, stylesheet included, and is not vendored.
    const styled = [
      ...registry.components.filter((component) => component.origin === 'vendored'),
      ...registry.exceptions.primitives,
    ].filter((member) => member.files.styles !== null)
    expect(styled.length).toBeGreaterThan(90)
    for (const member of styled) {
      expect(member.files.styles, member.name).toMatch(new RegExp(`^${recipes.root}/`))
    }
  })

  it('has a version range for every package a vendored component imports', () => {
    for (const component of vendored) {
      for (const pkg of component.dependencies.packages) {
        expect(registry.packages[pkg], `${component.name} imports ${pkg}`).toBeDefined()
      }
    }
    // Beyond that, only the published packages, whose ranges `install.test.ts`
    // pins. `@polymorph/theme` is bundled into the engine and arrives inside the
    // install boundary, not beside it. Publishing it here would tell a consumer
    // to install what `vendorable-imports` forbids a component from naming.
    expect(registry.packages['@polymorph/react']).toBe(`^${registry.version}`)
    expect(registry.packages['@polymorph/theme']).toBeUndefined()
  })

  it('resolves every system’s fonts to a package the workbench actually installs', () => {
    // The derivation `"Plus Jakarta Sans Variable"` -> `@fontsource-variable/…`
    // applies fontsource's naming convention instead of reading a declared
    // name, so it is checked against the one app that renders every system. A
    // family whose package breaks the convention fails here, not in a
    // consumer's install, where a theme would render in Times New Roman.
    const workbench = JSON.parse(
      readFileSync(resolve(ROOT, 'apps/workbench/package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> }
    const installed = Object.keys(workbench.dependencies).filter((name) =>
      name.startsWith('@fontsource'),
    )

    const required = [
      ...new Set(
        registry.theme.systems.flatMap((system) => system.fonts.map((font) => font.package)),
      ),
    ].sort()

    expect(required).toEqual(installed.sort())
    for (const system of registry.theme.systems) {
      expect(system.fonts.length, system.name).toBeGreaterThan(0)
      expect(existsSync(resolve(ROOT, system.file)), system.file).toBe(true)
    }
  })

  it('publishes the pre-paint script, so a theme install does not need the engine', () => {
    expect(registry.theme.prepaint).toBe(PREPAINT_SCRIPT)
    // Two keys, system and palette. The check against `pm-theme` is the same
    // rule from the other side: the combined key is not written, aliased or
    // applied here.
    expect(registry.theme.prepaint).toContain('pm-system')
    expect(registry.theme.prepaint).toContain('pm-palette')
    expect(registry.theme.prepaint).not.toContain("getItem('pm-theme')")
    // It blocks parsing. The 500-byte limit is `runtime.test.ts`'s law, and this
    // check repeats it for the second reader.
    expect(registry.theme.prepaint.length).toBeLessThan(500)
  })

  it('has no CSS edge the closure walk cannot see', () => {
    // The walk reads only `composes`, which is safe only while the vocabulary's
    // CSS has no other kind of reference. An `@import` or a `url()` would be
    // copied without its target and fail as a 404 in a consumer's build.
    for (const component of vendored) {
      for (const file of component.dependencies.files.filter((path) => path.endsWith('.css'))) {
        const source = readFileSync(resolve(ROOT, file), 'utf8')
        expect(source, file).not.toMatch(/@import\b/)
        expect(source, file).not.toMatch(/\burl\(/)
      }
    }
  })
})

describe('the ladder and the laws come from where they are decided', () => {
  it('has the ladder’s five rungs, in order', () => {
    expect(registry.exceptions.ladder.map((rung) => rung.rung)).toEqual([1, 2, 3, 4, 5])
  })

  it('says what the inventory looks for, at the rungs that have a marker', () => {
    const byRung = new Map(registry.exceptions.ladder.map((rung) => [rung.rung, rung.declaredAs]))
    expect(byRung.get(1)).toBeNull()
    expect(byRung.get(3)).toBe('patch')
    expect(byRung.get(2)).toBe('DensityScope | ToneScope')
    expect(byRung.get(4)).toBe('Bespoke | ThirdParty')
  })

  it('lists every red rule with the stage that turns it on', () => {
    const names = registry.laws.map((law) => law.name)
    expect(names).toContain('polymorph/no-raw-styles')
    expect(names).toContain('polymorph/no-raw-interactive')

    for (const law of registry.laws) {
      expect(law.summary.length, law.name).toBeGreaterThan(10)
      // Stages sort the ESLint application rules by what they need before they
      // can apply. A CSS rule applies wherever its stylesheets are and has no
      // stage, so `language` is the qualifier here rather than `applies`.
      if (law.language === 'code' && law.applies === 'application') {
        expect(law.stage, law.name).toBeGreaterThan(0)
      } else {
        expect(law.stage, law.name).toBeNull()
      }
    }
    // The packaging-boundary rule governs the vocabulary, and the registry says so.
    const boundary = registry.laws.find((law) => law.name === 'polymorph/vendorable-imports')
    expect(boundary?.applies).toBe('vocabulary')
  })

  /**
   * Both halves of the law suite.
   *
   * Without the CSS rules, a front that uses the catalogue fails. `validate` on
   * a stylesheet reports rules the registry does not list, so a violation
   * arrives with no summary and no rung. A registry that describes only half
   * the laws is not reliable for any of them.
   */
  it('carries the Stylelint half as well as the ESLint half', () => {
    const byLanguage = (language: string) =>
      registry.laws.filter((law) => law.language === language).map((law) => law.name)

    // Every rule the Stylelint plugin ships, not a sample. A rule added to the
    // plugin but not to the catalogue produces violations with no summary.
    expect(byLanguage('css').sort()).toEqual(Object.values(CSS_RULE_NAMES).sort())
    expect(byLanguage('code')).toContain('polymorph/no-raw-styles')

    // One name in two plugins: the same law, checked in TypeScript and in CSS.
    const scoped = registry.laws.filter((law) => law.name === 'polymorph/scoped-token-owners')
    expect(scoped.map((law) => law.language)).toEqual(['code', 'css'])
  })

  it('gives every rule the rungs that answer it, or an empty list', () => {
    // The rung table, checked against the ladder this same document publishes.
    // A law that pointed at a missing rung would look authoritative but give an
    // instruction the system cannot follow. `readLaws` throws on one, and this
    // is the positive check.
    const rungs = new Set(registry.exceptions.ladder.map((rung) => rung.rung))
    for (const law of registry.laws) {
      for (const rung of law.climb) expect(rungs, law.name).toContain(rung)
    }

    const styles = registry.laws.find((law) => law.name === 'polymorph/no-raw-styles')
    expect(styles?.climb).toEqual([1, 3, 4])

    // Empty is deliberate. The ladder governs application code, and the
    // vocabulary is what exceptions are taken *from*.
    const boundary = registry.laws.find((law) => law.name === 'polymorph/vendorable-imports')
    expect(boundary?.climb).toEqual([])
  })
})

/**
 * The ladder's primitives can be installed, not only described.
 *
 * Their props let a spec validator check a declared exception. A consumer who
 * vendors the vocabulary needs their location the first time the shipped rules
 * send them to rung 4. `polymorph/no-raw-styles` answers a style decision with
 * "declare a `<Bespoke>` zone", and `polymorph add bespoke` needs something in
 * the catalogue to copy. Otherwise the consumer would have to vendor two files
 * by hand and write their hashes into the manifest by hand. The registry
 * publishes the same two facts a vendored member has, read by the same closure
 * walk.
 */
describe('the ladder’s primitives can be installed, not only described', () => {
  const primitives = registry.exceptions.primitives
  const vendored = new RegExp(`^${registry.vendor.root}/`)
  /** Either tree an install copies from: the source's, or the recipes'. */
  const copied = new RegExp(`^(?:${registry.vendor.root}|${registry.vendor.recipes.root})/`)

  it('publishes each one, by name', () => {
    expect(primitives.map((primitive) => primitive.name)).toEqual([
      'Bespoke',
      'DensityScope',
      'ThirdParty',
      'ToneScope',
    ])
  })

  it('points each one at source that exists, inside the vendorable tree', () => {
    for (const primitive of primitives) {
      const { source, styles } = primitive.files
      expect(source, primitive.name).toMatch(vendored)
      expect(existsSync(resolve(ROOT, source)), source).toBe(true)
      if (styles !== null) expect(existsSync(resolve(ROOT, styles)), styles).toBe(true)
    }
  })

  it('carries a file closure an install can copy whole', () => {
    for (const primitive of primitives) {
      const { files } = primitive.dependencies
      expect(files, primitive.name).toContain(primitive.files.source)
      if (primitive.files.styles !== null) expect(files).toContain(primitive.files.styles)
      for (const file of files) {
        expect(file, primitive.name).toMatch(copied)
        expect(existsSync(resolve(ROOT, file)), file).toBe(true)
      }
      // Sorted, like every list in this document, because the determinism law needs it.
      expect(files).toEqual([...files].sort())
    }
  })

  it('gives the Bespoke zone its stylesheet, and the scopes none', () => {
    // A Bespoke zone is `display: contents` in a CSS Module. The boundary paints
    // nothing, but the declaration that sets this must be copied, or the zone
    // gets a box. The scopes set an attribute and own no stylesheet. Both are
    // declared in one file, so each one's closure is that file.
    const bespoke = primitives.find((primitive) => primitive.name === 'Bespoke')
    expect(bespoke?.files.styles).toBe('packages/recipes/src/exceptions/bespoke.module.css')
    expect(bespoke?.dependencies.files).toEqual([
      'packages/react-ui/src/exceptions/Bespoke.tsx',
      'packages/recipes/src/exceptions/bespoke.module.css',
    ])
    // The boundary around another library's component draws nothing either,
    // by the same declaration in its own stylesheet.
    const thirdParty = primitives.find((primitive) => primitive.name === 'ThirdParty')
    expect(thirdParty?.files.styles).toBe('packages/recipes/src/exceptions/third-party.module.css')
    expect(thirdParty?.dependencies.files).toEqual([
      'packages/react-ui/src/exceptions/ThirdParty.tsx',
      'packages/recipes/src/exceptions/third-party.module.css',
    ])
    expect(thirdParty?.dependencies.packages).toEqual([])
    for (const name of ['DensityScope', 'ToneScope']) {
      const scope = primitives.find((primitive) => primitive.name === name)
      expect(scope?.files.styles, name).toBeNull()
      expect(scope?.dependencies.files, name).toEqual([
        'packages/react-ui/src/exceptions/Scopes.tsx',
      ])
    }
  })

  it('has a version range for every package a primitive imports, as for a member', () => {
    // The scopes import `@polymorph/react` for the attribute names. A Bespoke
    // zone imports only React and its own stylesheet. An install must be able
    // to write a range for whatever a primitive imports. An import without a
    // range would leave the install unable to write its manifest, which is the
    // failure `readPackageVersions` throws on.
    for (const primitive of primitives) {
      for (const pkg of primitive.dependencies.packages) {
        expect(registry.packages[pkg], `${primitive.name} imports ${pkg}`).toMatch(/^\^\d/)
      }
    }
    const scope = primitives.find((primitive) => primitive.name === 'DensityScope')
    expect(scope?.dependencies.packages).toEqual(['@polymorph/react'])
    const bespoke = primitives.find((primitive) => primitive.name === 'Bespoke')
    expect(bespoke?.dependencies.packages).toEqual([])
  })
})

describe('the house emitter emits a palette’s more-contrast partner', () => {
  it('refuses a palette whose partner the catalogue does not hold, and reads one it does', () => {
    // No shipped palette names a partner, so a one-system catalogue is given one.
    const root = mkdtempSync(resolve(tmpdir(), 'polymorph-house-'))
    for (const half of ['systems', 'palettes']) {
      mkdirSync(resolve(root, `design/${half}`), { recursive: true })
    }
    const copy = (half: string, name: string, change: object = {}) => {
      const json = JSON.parse(readFileSync(resolve(ROOT, `design/${half}/${name}.json`), 'utf8'))
      writeFileSync(
        resolve(root, `design/${half}/${name}.json`),
        JSON.stringify({ ...json, ...change }),
      )
    }
    copy('systems', 'plain')
    copy('palettes', 'neutral', { moreContrast: 'iris' })

    expect(() => readTheme(root)).toThrow(/neutral names the more-contrast palette "iris"/)
    copy('palettes', 'iris')
    expect(readTheme(root).palettes.find((palette) => palette.name === 'neutral')).toMatchObject({
      moreContrast: 'iris',
    })
    rmSync(root, { recursive: true, force: true })
  })
})
