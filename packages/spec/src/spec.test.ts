import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { verify } from '@polymorph/rules/verify'
import { buildRegistry, jsonSchema, type Registry } from '@polymorph/registry'
import { describe, expect, it } from 'vitest'

import { emitScreen } from './emit'
import { emitCheckedScreen, validateSpec } from './lawful'
import { SCREEN_SHAPE, SPEC_ID, type ScreenSpec } from './schema'
import { validateSpec as validateComposition } from './validate'

/**
 * The spec format's laws.
 *
 * The claim is that a screen can be *described* instead of written, and that
 * the description can be checked in ways the code cannot. So the tests come in
 * three groups. The format holds only what it should. A spec is checked against
 * the real vocabulary, not only a schema. The output passes every rule this
 * repository applies to hand-written code.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const registry: Registry = buildRegistry(ROOT)

const screen = (name: string): ScreenSpec =>
  JSON.parse(readFileSync(resolve(ROOT, `design/screens/${name}.json`), 'utf8')) as ScreenSpec

const SCREENS = ['inbox', 'new-ticket', 'settings']

/** A minimal lawful spec, changed in one way per test, so each test shows one thing. */
const base = (): ScreenSpec => ({
  spec: SPEC_ID,
  name: 'Probe',
  purpose: 'A probe.',
  inputs: [{ name: 'onSave', type: '() => void' }],
  root: {
    component: 'Stack',
    props: { gap: 4 },
    children: [{ component: 'Button', props: { label: 'Save', onClick: { $: 'onSave' } } }],
  },
})

describe('the format', () => {
  it('publishes as JSON Schema, recursively', () => {
    const schema = jsonSchema(SCREEN_SHAPE) as {
      $defs: Record<string, unknown>
      properties: Record<string, unknown>
    }

    // An element tree contains element trees. `$defs`/`$ref` is JSON Schema's
    // own mechanism for this, so a consumer's validator resolves the recursion
    // without extra support. That is the reason to publish a schema.
    expect(Object.keys(schema.$defs).sort()).toEqual([
      'Binding',
      'Element',
      'Exception',
      'ObjectValue',
      'Value',
    ])
    expect(schema.properties['root']).toEqual({ $ref: '#/$defs/Element' })
  })

  it('has no field for a style or for logic', () => {
    // This is a survey of the schema, not a denylist. The document has six
    // fields and a tree of components and props, and none of them can hold a
    // colour or an expression. `validate` rejects a *prop* named `style`,
    // because no component has one.
    const schema = JSON.stringify(jsonSchema(SCREEN_SHAPE))
    for (const forbidden of ['className', 'style', 'css', 'transition', 'animation']) {
      expect(schema, forbidden).not.toContain(`"${forbidden}"`)
    }
  })

  it('rejects a document that is not a screen spec', () => {
    expect(validateSpec(registry, {}).ok).toBe(false)
    expect(validateSpec(registry, { ...base(), spec: 'something-else' }).ok).toBe(false)
    expect(validateSpec(registry, { ...base(), extra: 1 }).faults[0]?.message).toContain(
      'not in the schema',
    )
  })
})

describe('a document of the wrong shape is told what its author wrote', () => {
  const faults = (mutate: (spec: Record<string, unknown>) => void) => {
    const spec = base() as unknown as Record<string, unknown>
    mutate(spec)
    return validateSpec(registry, spec).faults
  }

  it('lists the fields a document, an input and an element have beside a key they lack', () => {
    expect(faults((spec) => (spec['notes'] = 'A finding.'))).toEqual([
      {
        path: '$.notes',
        message:
          '`notes` is not in the schema — the fields here are `spec`, `name`, `purpose`, ' +
          '`platform`, `types`, `inputs` and `root`',
      },
    ])
    expect(
      faults((spec) => {
        ;(spec['inputs'] as Record<string, unknown>[])[0]!['optional'] = true
      }),
    ).toEqual([
      {
        path: '$.inputs[0].optional',
        message: '`optional` is not in the schema — the fields here are `name`, `type` and `doc`',
      },
    ])
  })

  it('reports a misspelt field of a nested element at that field', () => {
    const nested = { component: 'Text', text: 'Saved' }
    expect(
      faults((spec) => ((spec['root'] as { children: unknown[] }).children = [nested])),
    ).toEqual([
      {
        path: '$.root.children[0].text',
        message:
          '`text` is not in the schema — the fields here are `component`, `props`, `children` ' +
          'and `exception`',
      },
    ])
  })

  it('says a prop written beside `props` is a prop, and where it goes', () => {
    const button = { component: 'Button', props: { label: 'Save' }, onClick: { $: 'onSave' } }
    expect(
      faults((spec) => ((spec['root'] as { children: unknown[] }).children = [button])),
    ).toEqual([
      {
        path: '$.root.children[0].onClick',
        message:
          '`onClick` is a prop of `Button`, written here as a field of the element — a prop goes ' +
          'inside `props`: `{ "component": "Button", "props": { "onClick": … } }`',
      },
    ])
    // A key that is no prop of the member is still a key the schema lacks.
    const noted = { component: 'Button', props: { label: 'Save', onClick: { $: 'onSave' } } }
    expect(
      faults(
        (spec) =>
          ((spec['root'] as { children: unknown[] }).children = [{ ...noted, note: 'Primary' }]),
      )[0]?.message,
    ).toBe(
      '`note` is not in the schema — the fields here are `component`, `props`, `children` and ' +
        '`exception`',
    )
  })

  it('says how a plain object is written, where a value is one', () => {
    const props = { label: 'Save', onClick: { $: 'onSave' }, badge: { text: 'New' } }
    expect(
      faults(
        (spec) =>
          ((spec['root'] as { children: unknown[] }).children = [{ component: 'Button', props }]),
      ),
    ).toEqual([
      {
        path: '$.root.children[0].props.badge',
        message:
          'an object here has `$`, `component` or `$object`, and this one has `text` — a binding ' +
          'is `{ "$": "anInput" }`, an element is `{ "component": … }`, and a plain object, such ' +
          'as a column or an option, is written `{ "$object": { … } }`',
      },
    ])
  })

  it('lists `root` last, and reads a document in any key order', () => {
    // A tree written last is closed by closing everything. Written before `inputs`, its
    // brackets must be closed exactly in the middle of the document.
    const schema = jsonSchema(SCREEN_SHAPE) as { properties: Record<string, unknown> }
    expect(Object.keys(schema.properties).at(-1)).toBe('root')
    const { inputs, root, ...rest } = base()
    expect(validateSpec(registry, { ...rest, root, inputs })).toEqual({ ok: true, faults: [] })
    expect(validateSpec(registry, { inputs, root, ...rest })).toEqual({ ok: true, faults: [] })
  })

  it('says how a type is imported, where `types` holds a default or a namespace import', () => {
    for (const entry of ['default as React', '* as React']) {
      expect(faults((spec) => (spec['types'] = { react: [entry] }))).toEqual([
        {
          path: '$.types.react[0]',
          message:
            `\`${entry}\` is not a type name — an import names identifiers. A spec has no ` +
            'default or namespace import: name the type itself (`ReactNode`), and write it in ' +
            'the input’s type without the namespace (`ReactNode`, not `React.ReactNode`)',
        },
      ])
    }
    expect(faults((spec) => (spec['types'] = { './types': ['Ticket[]'] }))).toEqual([
      {
        path: '$.types../types[0]',
        message: '`Ticket[]` is not a type name — an import names identifiers',
      },
    ])
  })
})

describe('a spec is checked against the vocabulary, not only against a shape', () => {
  const fault = (mutate: (spec: ScreenSpec) => void) => {
    const spec = base()
    mutate(spec)
    const result = validateSpec(registry, spec)
    expect(result.ok).toBe(false)
    return result.faults
  }

  it('accepts the lawful base spec, so the failures below are meaningful', () => {
    expect(validateSpec(registry, base())).toEqual({ ok: true, faults: [] })
  })

  it('refuses an unknown component, and suggests a real one', () => {
    const [first] = fault((spec) => {
      spec.root.component = 'VStack'
    })
    expect(first?.message).toContain('no component called `VStack`')
    expect(first?.message).toContain('`Stack`')
  })

  it('refuses an unknown prop, which is how style is kept out', () => {
    // `className` fails for the same reason `titel` fails: no component has
    // one. The law works by having no place to write it, not by a list of
    // banned words that someone must maintain.
    const messages = fault((spec) => {
      spec.root.props = { ...spec.root.props, className: 'wide', style: 'x' }
    }).map((entry) => entry.message)

    expect(messages).toContain('`Stack` has no prop `className`')
    expect(messages).toContain('`Stack` has no prop `style`')
  })

  it('emits a callable component for a screen with no inputs, as the composer writes', async () => {
    // The composer writes literal-first documents with zero inputs, which no
    // shipped spec has. An emitter that ignored this case would write
    // `function X(: XProps)`. Emit must produce parseable TSX for an empty
    // input list.
    const still: ScreenSpec = {
      ...base(),
      name: 'StillLife',
      inputs: [],
      root: { component: 'Stack', props: { gap: 4 }, children: [{ component: 'Spinner' }] },
    }
    const tsx = await emitScreen(still)
    expect(tsx).toContain('export function StillLife()')
    expect(tsx).not.toContain('(: ')
  })

  it('refuses a value outside an alias or a long union', () => {
    // If the registry printed `Badge.tone` as `BadgeTone`, or `Button.trailingIcon`
    // as a truncated union, `valueFault` would skip both and `tone: "florange"`
    // would validate. These two refusals depend on the registry printing prop
    // types in full.
    const toneFaults = fault((spec) => {
      spec.root.children = [{ component: 'Badge', props: { tone: 'florange' }, children: ['x'] }]
    }).map((entry) => entry.message)
    expect(toneFaults.some((message) => message.includes('florange'))).toBe(true)

    const iconFaults = fault((spec) => {
      spec.root.children = [
        { component: 'Button', props: { label: 'Save', trailingIcon: 'floop' } },
      ]
    }).map((entry) => entry.message)
    expect(iconFaults.some((message) => message.includes('floop'))).toBe(true)
  })

  it('refuses a variant × tone cell the grid does not have', () => {
    // The plausible invention is a filled neutral button. At a call site it is a
    // type error. In a spec it would be a screen that renders wrong, so it is
    // caught here instead.
    const [first] = fault((spec) => {
      spec.root.children = [
        { component: 'Button', props: { label: 'Save', variant: 'solid', tone: 'neutral' } },
      ]
    })
    expect(first?.message).toContain('no `solid` × `neutral` cell')
    expect(first?.message).toContain('accent, danger')
  })

  it('refuses a binding to an input the screen does not declare', () => {
    const [first] = fault((spec) => {
      spec.root.children = [
        { component: 'Button', props: { label: 'x', onClick: { $: 'onCancel' } } },
      ]
    })
    expect(first?.message).toContain('does not declare as an input')
  })

  it('refuses children on a component that takes none', () => {
    const [first] = fault((spec) => {
      spec.root.children = [{ component: 'Input', children: ['text'] }]
    })
    expect(first?.message).toBe('`Input` takes no children')
  })

  it('accepts a compound part and checks its own props', () => {
    const withGroup = base()
    withGroup.root = {
      component: 'SettingsRow.Group',
      props: { title: 'Appearance' },
      children: [
        {
          component: 'SettingsRow',
          // `control` is required in TSX, so the spec must include one too.
          // The requirement check catches what a name check would miss.
          props: { label: 'Theme', control: { component: 'Switch', props: {} } },
        },
      ],
    }
    expect(validateSpec(registry, withGroup).ok).toBe(true)

    withGroup.root.props = { heading: 'Appearance' }
    expect(validateSpec(registry, withGroup).faults[0]?.message).toContain(
      '`SettingsRow.Group` has no prop `heading`',
    )
  })

  it('rejects values the prop types cannot hold, and only those', () => {
    // `label: 42`, `size: "xxl"` and `disabled: "not-a-boolean"` all pass a
    // check of names alone. There are exactly three faults, because the lawful
    // binding on the same element must not be reported.
    const bad = base()
    bad.root.children = [
      {
        component: 'Button',
        props: {
          label: 42,
          size: 'xxl',
          disabled: 'not-a-boolean',
          onClick: { $: 'onSave' },
        },
      },
    ]
    const { ok, faults } = validateSpec(registry, bad)
    expect(ok).toBe(false)
    expect(faults).toHaveLength(3)
    const at = (path: string) => faults.find((fault) => fault.path === path)?.message ?? ''
    expect(at('$.root.children[0].props.label')).toContain('wants `string`')
    expect(at('$.root.children[0].props.size')).toContain('got "xxl"')
    expect(at('$.root.children[0].props.disabled')).toContain('boolean')
  })

  it('refuses an explicit null where the printed type has no null in it', () => {
    /*
     * `label: null` must not validate on any component in the vocabulary.
     * `null` is an object to `typeof`, so a validator that forgets it takes the
     * uncheckable-structure exit before the printed type is consulted, and the
     * emitted screen renders a Button with no name.
     *
     * A JSON author who writes `null` has written a value. Absence is a
     * separate question, and the required-prop check answers it.
     */
    const [first] = fault((spec) => {
      spec.root.children = [{ component: 'Button', props: { label: null } }]
    })
    expect(first?.path).toBe('$.root.children[0].props.label')
    expect(first?.message).toContain('wants `string`')
    expect(first?.message).toContain('got null')
  })

  it('accepts null where the type is `string | null`, because nothing chosen is a value', () => {
    // Select's `value` is the clearable-control case the schema handles. `null`
    // means "nothing is selected", which differs from the prop being absent.
    // The check must tell them apart in both directions.
    const clearable = base()
    clearable.root.children = [{ component: 'Select', props: { value: null, options: [] } }]
    expect(validateSpec(registry, clearable)).toEqual({ ok: true, faults: [] })

    // The union's other part is still checked, so accepting `null` above is a
    // real check and not a skip.
    const wrong = base()
    wrong.root.children = [{ component: 'Select', props: { value: 42, options: [] } }]
    expect(validateSpec(registry, wrong).faults[0]?.message).toContain('got 42')
  })
})

describe('the usage rules, told to a spec as the red rules tell code', () => {
  const button = (props: Record<string, unknown> = {}) => ({
    component: 'Button',
    props: { label: 'Go', onClick: { $: 'onSave' }, ...props },
  })
  const faultsOf = (root: ScreenSpec['root']) =>
    validateSpec(registry, { ...base(), root }).faults.map(({ path, message }) => ({
      path,
      message,
    }))

  it('reports a second main Button in a dialog, on the one in the body, and not the trigger', () => {
    const faults = faultsOf({
      component: 'Dialog',
      props: {
        title: 'Rename',
        trigger: button({ label: 'Rename' }),
        footer: [button({ variant: 'outline', tone: 'neutral', label: 'Cancel' }), button()],
      },
      children: [button({ label: 'Reset' })],
    } as ScreenSpec['root'])
    expect(faults).toEqual([
      {
        path: '$.root.children[0]',
        message:
          'a second main Button in this `Dialog` — a dialog has one solid accent Button, which marks its next step; make this one `"variant": "outline", "tone": "neutral"`',
      },
    ])
  })

  it('counts a Card inside a Dialog apart, and leaves a page alone', () => {
    expect(
      faultsOf({
        component: 'Stack',
        children: [
          button(),
          button(),
          {
            component: 'Dialog',
            props: { title: 'Plans', footer: button() },
            children: [{ component: 'Card', props: { title: 'Pro' }, children: [button()] }],
          },
        ],
      } as ScreenSpec['root']),
    ).toEqual([])
  })

  it('reports a danger Button first in its group, and not last, nor alone in a group of its own', () => {
    const danger = button({ variant: 'ghost', tone: 'danger', label: 'Delete' })
    const cancel = button({ variant: 'outline', tone: 'neutral', label: 'Cancel' })
    const first = faultsOf({
      component: 'Inline',
      children: [danger, cancel],
    } as ScreenSpec['root'])
    expect(first.map(({ path }) => path)).toEqual(['$.root.children[0]'])
    expect(first[0]?.message).toContain('the destructive one comes last')
    expect(
      faultsOf({ component: 'Inline', children: [cancel, danger] } as ScreenSpec['root']),
    ).toEqual([])
    expect(
      faultsOf({
        component: 'Inline',
        props: { justify: 'between' },
        children: [danger, { component: 'Inline', children: [cancel, button()] }],
      } as ScreenSpec['root']),
    ).toEqual([])
  })

  it('reports a trailing icon that neither points nor opens, and names the roles that may', () => {
    const faults = faultsOf({
      component: 'Stack',
      children: [
        button({ trailingIcon: 'next' }),
        button({ variant: 'ghost', trailingIcon: 'delete' }),
      ],
    } as ScreenSpec['root'])
    expect(faults).toEqual([
      {
        path: '$.root.children[1].props.trailingIcon',
        message:
          '`delete` does not trail its text — an icon leads its text, and only `collapse`, `down`, `expand`, `forward`, `next` and `open-external` trail it; make it `"icon": "delete"`',
      },
    ])
  })

  it('reads no value bound to an input', () => {
    expect(
      faultsOf({
        component: 'Card',
        props: { title: 'Plan' },
        children: [button(), button({ variant: { $: 'onSave' } })],
      } as ScreenSpec['root']).filter(({ message }) => message.includes('main Button')),
    ).toEqual([])
  })
})

describe('the names the emitter has to write', () => {
  /*
   * Three problems the shape check cannot see. In each, the emitter would fail
   * on a document that passed the shape. The schema's name pattern
   * (`^[a-z][A-Za-z0-9]*$`) allows `class`. A Set of input names merges two
   * inputs called `onSave` into one. And the shape does not compare the
   * screen's own name with the identifiers the emitted file imports. Each would
   * show up far from the document, as a raw Prettier parse error, a `tsc`
   * duplicate identifier, or a component that renders itself forever. This
   * validator reports them at the document instead.
   */
  const named = (inputs: ScreenSpec['inputs']): ScreenSpec => ({ ...base(), inputs })

  it('refuses an input named with a JavaScript reserved word', () => {
    // `destructure()` writes every input name into a binding pattern, so
    // `{ onSave, class }` is a parse error with no path back to `$.inputs[1]`.
    for (const word of ['class', 'delete', 'new', 'default', 'if', 'await', 'static']) {
      const result = validateSpec(
        registry,
        named([
          { name: 'onSave', type: '() => void' },
          { name: word, type: 'string' },
        ]),
      )
      expect(result.ok, word).toBe(false)
      const fault = result.faults.find((entry) => entry.path === '$.inputs[1].name')
      expect(fault?.message, word).toContain(`\`${word}\``)
    }
  })

  it('accepts an input name that only starts like a reserved word', () => {
    // `className` is not `class`. A validator that matched prefixes would refuse
    // many plausible names.
    expect(validateSpec(registry, named([{ name: 'onSave', type: '() => void' }])).ok).toBe(true)
    for (const fine of ['classes', 'newest', 'ifNeeded', 'deleted']) {
      const result = validateSpec(
        registry,
        named([
          { name: 'onSave', type: '() => void' },
          { name: fine, type: 'string' },
        ]),
      )
      expect(result.faults, fine).toEqual([])
    }
  })

  it('refuses two inputs with the same name', () => {
    const result = validateSpec(
      registry,
      named([
        { name: 'onSave', type: '() => void' },
        { name: 'onSave', type: '(draft: string) => void' },
      ]),
    )
    expect(result.ok).toBe(false)
    const fault = result.faults.find((entry) => entry.path === '$.inputs[1].name')
    expect(fault?.message).toContain('`onSave`')
  })

  it('refuses a screen named after a member its own tree composes', () => {
    // `name: "Stack"` on a tree with a Stack in it emits `import { Stack }` and
    // `export function Stack`, and the declaration shadows the import. The
    // component then renders itself until the call stack overflows.
    const result = validateSpec(registry, { ...base(), name: 'Stack' })
    expect(result.ok).toBe(false)
    const fault = result.faults.find((entry) => entry.path === '$.name')
    expect(fault?.message).toContain('`Stack`')
  })

  it('refuses a screen whose name, or whose Props name, collides with a type it imports', () => {
    const clash = validateSpec(registry, {
      ...base(),
      name: 'Ticket',
      types: { './tickets': ['Ticket'] },
    })
    expect(clash.faults.find((entry) => entry.path === '$.name')?.message).toContain('`Ticket`')

    // The emitter also writes `${name}Props`, and that name collides the same way.
    const propsClash = validateSpec(registry, {
      ...base(),
      name: 'Ticket',
      types: { './tickets': ['TicketProps'] },
    })
    expect(propsClash.faults.find((entry) => entry.path === '$.name')?.message).toContain(
      '`TicketProps`',
    )
  })

  it('accepts a screen name that only resembles a member', () => {
    expect(validateSpec(registry, { ...base(), name: 'StackScreen' }).faults).toEqual([])
  })
})

describe('the exception ladder, at the point the deviation is authored', () => {
  const scoped = (): ScreenSpec => ({
    ...base(),
    root: {
      component: 'DensityScope',
      props: { value: 'compact' },
      exception: { rung: 2, because: 'A queue is scanned rather than read.' },
      children: [{ component: 'Stack', props: { gap: 4 } }],
    },
  })

  it('accepts a declared scope', () => {
    expect(validateSpec(registry, scoped()).ok).toBe(true)
  })

  it('refuses an undeclared scope, which the ladder exists to prevent', () => {
    const spec = scoped()
    delete spec.root.exception
    const [first] = validateSpec(registry, spec).faults
    expect(first?.message).toContain('rung-2 exception and is not declared')
  })

  it('refuses one declared at the wrong rung', () => {
    const spec = scoped()
    spec.root.exception = { rung: 4, because: 'It seemed like a bespoke zone.' }
    expect(validateSpec(registry, spec).faults[0]?.message).toContain(
      'is rung 2, declared as rung 4',
    )
  })

  it('refuses a reason that says nothing', () => {
    const spec = scoped()
    spec.root.exception = { rung: 2, because: 'needed' }
    expect(validateSpec(registry, spec).faults[0]?.message).toContain('say why')
  })

  it('refuses an exception on a node that takes none', () => {
    // The reverse fault matters as much. An inventory that counts exceptions
    // nobody took cannot be trusted.
    const spec = base()
    spec.root.exception = { rung: 4, because: 'This is a perfectly ordinary Stack.' }
    expect(validateSpec(registry, spec).faults[0]?.message).toContain('takes no exception')
  })

  it('detects a rung-3 patch from the prop, not from a list', () => {
    const spec = base()
    spec.root.props = { gap: 4, patch: { $object: { gap: '6' } } }
    expect(validateSpec(registry, spec).faults[0]?.message).toContain('rung-3 exception')

    spec.root.exception = { rung: 3, because: 'This one screen genuinely needs tighter spacing.' }
    expect(validateSpec(registry, spec).ok).toBe(true)
  })
})

describe('the platform a screen is for', () => {
  /** A Tooltip around the base spec's Button: present on the web, absent on phones. */
  const hinted = (platform?: ScreenSpec['platform']): ScreenSpec => ({
    ...base(),
    ...(platform === undefined ? {} : { platform }),
    root: {
      component: 'Tooltip',
      props: { content: 'Saves the draft' },
      children: [{ component: 'Button', props: { label: 'Save', onClick: { $: 'onSave' } } }],
    },
  })

  it('is the web when the document names none, where every member exists', () => {
    expect(validateSpec(registry, hinted())).toEqual({ ok: true, faults: [] })
    expect(validateSpec(registry, hinted('web')).ok).toBe(true)
  })

  it('refuses a member absent on the platform, and names its substitute and the reason', () => {
    const entry = registry.components.find((member) => member.name === 'Tooltip')?.platforms.ios
    expect(entry?.status).toBe('absent')

    const { ok, faults } = validateSpec(registry, hinted('ios'))
    expect(ok).toBe(false)
    // The native screen contract also refuses a root that is not a page
    // archetype (`emit-swift.test.ts`); the platform map's fault is this one.
    expect(faults.filter((fault) => fault.message.includes('is absent on'))).toEqual([
      {
        path: '$.root',
        message: `\`Tooltip\` is absent on ios — use \`${entry?.substitute ?? ''}\` instead. ${entry?.reason ?? ''}`,
      },
    ])
  })

  it('accepts an adapted member, which renders on the platform in another form', () => {
    // A native screen's root is a page archetype, so the Dialog sits inside one.
    const spec: ScreenSpec = {
      ...base(),
      platform: 'android',
      root: {
        component: 'SettingsPage',
        props: { title: 'Settings' },
        children: [{ component: 'Dialog', props: { title: 'Rename' }, children: ['Body'] }],
      },
    }
    expect(
      registry.components.find((member) => member.name === 'Dialog')?.platforms.android.status,
    ).toBe('adapted')
    expect(validateSpec(registry, { ...spec, inputs: [] })).toEqual({ ok: true, faults: [] })
  })

  it('refuses a platform the registry does not map', () => {
    const faults = validateSpec(registry, { ...hinted(), platform: 'watchos' }).faults
    expect(faults[0]?.path).toBe('$.platform')
    expect(faults[0]?.message).toContain('is not one of web | ios | android')
  })

  it('reports an absent compound member once, at its owner, and says when nothing replaces it', () => {
    // A registry where Table has no rendering on iOS and no substitute, so the
    // walk reaches its parts and the message for `none` both.
    const draft = JSON.parse(JSON.stringify(registry)) as Registry
    const table = draft.components.find((member) => member.name === 'Table')
    if (table) table.platforms.ios = { status: 'absent', reason: 'Not here.', substitute: 'none' }

    const spec: ScreenSpec = {
      ...base(),
      platform: 'ios',
      root: {
        component: 'Table',
        children: [
          { component: 'Table.Row', children: [{ component: 'Table.Cell', children: ['A'] }] },
          { component: 'Table.Row', children: [{ component: 'Table.Cell', children: ['B'] }] },
        ],
      },
    }
    const absent = validateSpec(draft, spec).faults.filter((fault) =>
      fault.message.includes('is absent on'),
    )
    expect(absent).toEqual([
      {
        path: '$.root',
        message: '`Table` is absent on ios — it has no substitute, so leave it out. Not here.',
      },
    ])
  })
})

describe('what comes out', () => {
  it('passes every red rule that governs application code', async () => {
    // The same `verify` that the MCP server and this repository's fixture suite
    // call. Emitted code meets the same standard as hand-written code.
    for (const name of SCREENS) {
      const code = await emitScreen(screen(name), { filepath: emittedPath(name) })
      const result = await verify(code, { filename: emittedPath(name) })

      expect(result.fatal, name).toBeNull()
      expect(result.diagnostics, name).toEqual([])
    }
  })

  it('is already formatted the way this repository formats code', async () => {
    // Emitted code that fails `prettier --check` cannot be committed, so the
    // emitter resolves the *consumer's* config instead of using its own.
    const { format, resolveConfig } = await import('prettier')
    for (const name of SCREENS) {
      const path = emittedPath(name)
      const code = await emitScreen(screen(name), { filepath: path })
      const local = await resolveConfig(path)
      expect(await format(code, { ...local, filepath: path }), name).toBe(code)
    }
  })

  it('emits the same bytes twice', async () => {
    const spec = screen('settings')
    const once = await emitScreen(spec, { filepath: emittedPath('settings') })
    const twice = await emitScreen(spec, { filepath: emittedPath('settings') })
    expect(twice).toBe(once)
  })

  it('imports exactly what the tree mentions', async () => {
    const code = await emitScreen(screen('settings'), { filepath: emittedPath('settings') })
    expect(code).toContain(
      "import { Checkbox, Select, SettingsPage, SettingsRow, Switch } from '@polymorph/react-ui'",
    )
    // `SettingsRow.Group` contributes its owner, once.
    expect(code.match(/SettingsRow,/g)).toHaveLength(1)
  })

  it('writes one import per module, with a type joining the existing value import', async () => {
    // The emitter's doc comment says a `@polymorph/react-ui` type joins the
    // existing value import instead of opening a second import from the same
    // module. This checks that it does. Two imports from one module are not an
    // error, but a person would not write them, and this file is source the
    // consumer owns.
    const code = await emitScreen(screen('inbox'), { filepath: emittedPath('inbox') })
    expect(code.match(/from '@polymorph\/react-ui'/g)).toHaveLength(1)
    expect(code).toContain('type DataTableColumn')
    // The other module keeps its own `import type` line, because it has no value import.
    expect(code).toContain("import type { Ticket } from './tickets'")
  })

  it('carries the declared reason into the file', async () => {
    // `pnpm inventory` counts the exception from the code. The emit must
    // preserve the *why*, which nothing else carries into the file.
    const code = await emitScreen(screen('inbox'), { filepath: emittedPath('inbox') })
    expect(code).toContain('Rung 2, declared: A queue is scanned rather than read')
    expect(code).toContain('<DensityScope value="compact" as="section">')
  })

  it('writes attributes the way a person would', async () => {
    const code = await emitScreen(screen('settings'), { filepath: emittedPath('settings') })
    expect(code).toContain('title="Settings"')
    expect(code).not.toContain("title={'Settings'}")
  })
})

/**
 * The fields the emitter prints verbatim.
 *
 * A prop's name and a string's characters are checked against the registry or
 * quoted on output. A component's name, a binding, an input's type and the
 * names in the `types` block are code, printed as code. A purpose, a doc and an
 * exception's reason are prose, printed into comments. In each of these places,
 * a document that composes only vocabulary members could still put something
 * else into the file. So the code must be exactly what it claims to be, and the
 * prose is printed so that it can only be prose.
 */
describe('nothing a spec carries can become code', () => {
  /** A lawful screen given a list and an object to bind to. */
  const bound = (binding: string): ScreenSpec => ({
    ...base(),
    inputs: [
      { name: 'items', type: 'Item[]' },
      { name: 'draft', type: 'Draft' },
      { name: 'onSave', type: '() => void' },
    ],
    root: { component: 'Stack', props: { gap: 4 }, children: [{ $: binding }] },
  })

  it('accepts a binding that is a name, or a dotted path of names', () => {
    for (const binding of ['items', 'draft.subject', 'draft.author.name', 'draft.$meta._id']) {
      expect(validateSpec(registry, bound(binding)).faults, binding).toEqual([])
    }
  })

  it('refuses a binding that is an expression, even on a declared input', () => {
    // Each of these starts with an input the screen really has, so a check of
    // the head alone would pass them. The first shows why that matters: the
    // emitter prints a binding verbatim, so this would be a raw `<button>` in a
    // document that has no field for one.
    for (const binding of [
      'items.map((item) => <button onClick={item.go}>Go</button>)',
      'onSave()',
      'items[0]',
      'items.length > 0',
      'draft.subject ?? "Untitled"',
      'draft.',
      'draft..subject',
      'draft.subject }',
      ' draft',
    ]) {
      const { ok, faults } = validateSpec(registry, bound(binding))
      expect(ok, binding).toBe(false)
      expect(faults, binding).toHaveLength(1)
      expect(faults[0]?.path, binding).toBe('$.root.children[0]')
      expect(faults[0]?.message, binding).toContain('is not a binding')
    }
  })

  it('says where the expression belongs, and keeps the fault to one line', () => {
    const long = `items.filter((item) => item.open).map((item) => ${'item.title + '.repeat(12)}'')`
    const [fault] = validateSpec(registry, bound(long)).faults

    expect(fault?.message).toContain('handed in as an input')
    expect(fault?.message).toContain('…')
    expect(fault?.message.includes('\n')).toBe(false)
  })

  const typed = (type: string): ScreenSpec => ({
    ...base(),
    inputs: [{ name: 'onSave', type }],
  })

  it('accepts an input type that is one type, however it is built', () => {
    for (const type of [
      'Ticket[]',
      '() => void',
      '(value: string, index: number) => Promise<void>',
      'Record<string, number>',
      'Map<string, Array<Set<number>>>',
      '{ id: string; title: string }[]',
      "'asc' | 'desc' | null",
      "'asc'\n  | 'desc'",
      '`id-${string}`',
      '`${Uppercase<`a;b`>}`',
      '[first: string, rest: number[]]',
      '<T>(value: T) => T',
      '({ id, title }: Ticket) => void',
      'T extends string ? keyof T : never',
      '{ readonly [K in keyof T]?: T[K] }',
      "'a string with a ; and a } in it'",
      'string /* a note */',
    ]) {
      expect(validateSpec(registry, typed(type)).faults, type).toEqual([])
    }
  })

  it('refuses an input type that is not exactly one type', () => {
    // The type is written into the middle of an interface. A type that closes a
    // bracket it never opened closes the interface, and what follows becomes a
    // statement in the emitted file. The compiler's own parser decides where a
    // type ends. The second case hides its closing brace in a string inside a
    // template, which is where a hand-written scanner loses count.
    for (const [type, why] of [
      ['void }\nexport const smuggled = 1\ninterface Rest { a: string', 'is not a type'],
      [
        '`${\'`\'}` }\nimport { execSync } from "node:child_process"\nexport const smuggled = execSync("id")\ninterface Rest { a: /* \' */ string',
        'is not a type',
      ],
      ['string; extra: number', 'runs on past the end of one type'],
      ['string\nextra: number', 'runs on past the end of one type'],
      // A line break that the language counts but a reader may not notice.
      ['() => void\u2028extra: number', 'runs on past the end of one type'],
      ['string, number', 'is not a type'],
      ['{ id: string', 'is not a type'],
      ["'unterminated", 'is not a type'],
      ['   ', 'is not a type'],
    ] as const) {
      const { faults } = validateSpec(registry, typed(type))
      expect(
        faults.map((fault) => fault.path),
        type,
      ).toEqual(['$.inputs[0].type'])
      expect(faults[0]?.message, type).toContain(why)
    }
  })

  it('refuses code sitting inside something that parses as a type', () => {
    // The parser is deliberately lenient. It accepts a default value on a
    // function type's parameter, an expression in a computed key and a body on
    // an accessor, and leaves the error to the checker. Each is a place an
    // expression can sit, so every node in the tree must be type syntax.
    for (const type of [
      '{ [globalThis.fetch("/x")]: 1 }',
      '{ [<button onClick={() => go()}>x</button>]: 1 }',
      "(a = fetch('/x')) => void",
      '{ a: string = 1 }',
      '{ get a() { return sideEffect() } }',
    ]) {
      const { faults } = validateSpec(registry, typed(type))
      expect(
        faults.map((fault) => fault.path),
        type,
      ).toEqual(['$.inputs[0].type'])
      expect(faults[0]?.message, type).toContain('code rather than part of a type')
    }
  })

  it('skips the type check in the browser half, which has no compiler', () => {
    // `validate.ts` has no parser because the composer imports it, so it checks
    // the composition and says nothing about a type. Every entry point that
    // emits goes through the root entry, which supplies the type check.
    const closing = typed('void }\nexport const smuggled = 1\ninterface Rest { a: string')
    expect(validateComposition(registry, closing).ok).toBe(true)
    expect(validateSpec(registry, closing).ok).toBe(false)
  })

  it('refuses a `types` block that is not names and a module', () => {
    const imported = (types: Record<string, string[]>) =>
      validateSpec(registry, { ...base(), types })

    expect(
      imported({ './tickets': ['Ticket'], '@internationalized/date': ['CalendarDate'] }).ok,
    ).toBe(true)

    const names = imported({ './tickets': ['Ticket', "X } from 'y'; run(); import { Z"] })
    expect(names.faults.map((fault) => fault.path)).toEqual(['$.types../tickets[1]'])
    expect(names.faults[0]?.message).toContain('is not a type name')

    const module_ = imported({ "./a'; run(); '": ['Ticket'] })
    expect(module_.faults).toHaveLength(1)
    expect(module_.faults[0]?.message).toContain('is not a module specifier')

    // A name with a valid shape that is a reserved word.
    const reserved = imported({ './tickets': ['default'] })
    expect(reserved.faults[0]?.message).toContain('is not a type name')
  })

  it('checks a component’s whole name, not only its first two segments', () => {
    // The name is printed as the element's tag. If only the part up to the
    // second dot were checked, anything after it would be unchecked text in a
    // code position: an attribute, a second element or a second statement.
    const named = (component: string): ScreenSpec => ({
      ...base(),
      root: { component: 'SettingsRow', props: { label: 'x' }, children: [{ component }] },
    })
    for (const component of [
      'SettingsRow.Group.x',
      'SettingsRow.Group.x className="big"',
      'SettingsRow.Group.x />);}\nexport const leaked = 1;\nexport function Other() { return (<SettingsRow.Group',
      'Stack />\n<button>raw</button>\n<Stack',
    ]) {
      const { ok, faults } = validateSpec(registry, named(component))
      expect(ok, component).toBe(false)
      expect(faults.map((fault) => fault.message).join(' '), component).toContain(
        'no component called',
      )
    }
  })

  it('refuses a structured object where things are drawn', () => {
    // An object is data for a prop. Among children, or in a list that holds an
    // element (a fragment), it cannot be drawn as anything.
    const child: ScreenSpec = {
      ...base(),
      root: { component: 'Stack', props: { gap: 4 }, children: [{ $object: { a: 1 } }] },
    }
    expect(validateSpec(registry, child).faults.map((fault) => fault.path)).toEqual([
      '$.root.children[0]',
    ])
    expect(validateSpec(registry, child).faults[0]?.message).toContain('is data')
  })

  it('publishes the binding rule, so another validator reaches the same verdict', () => {
    const schema = jsonSchema(SCREEN_SHAPE) as {
      $defs: { Binding: { properties: { $: { pattern: string } } } }
    }
    const pattern = new RegExp(schema.$defs.Binding.properties.$.pattern)
    expect(pattern.test('draft.subject')).toBe(true)
    expect(pattern.test('items.map((item) => item)')).toBe(false)
  })

  /* ---- prose, printed so it stays prose ---------------------------------- */

  /** The statements a file exports. An injected declaration would add to these. */
  const exported = (code: string) => code.match(/^export .*$/gm) ?? []

  it('keeps prose inside its comment, whatever the prose contains', async () => {
    const hostile: ScreenSpec = {
      ...base(),
      purpose: 'Saves the draft. */ export const fromPurpose = 1; /* and then',
      inputs: [
        {
          name: 'onSave',
          type: '() => void',
          doc: 'Called on save. */ fromDoc: string; /** and',
        },
      ],
      root: {
        component: 'DensityScope',
        props: { value: 'compact' },
        exception: {
          rung: 2,
          because: 'A queue is scanned */} <button onClick={onSave}>x</button> {/* not read.',
        },
        children: [{ component: 'Button', props: { label: 'Save', onClick: { $: 'onSave' } } }],
      },
    }
    // Prose may contain anything, so none of this is a fault.
    expect(validateSpec(registry, hostile).faults).toEqual([])

    const code = await emitScreen(hostile)

    // None of it escapes its comment. The file exports what every emitted file
    // exports, declares the one input, and passes the rules.
    expect(exported(code)).toEqual([
      'export interface ProbeProps {',
      'export function Probe({ onSave }: ProbeProps) {',
    ])
    expect(code).not.toMatch(/^\s*fromDoc: string/m)
    // The `<button>` in the reason is still present, as text. A real one would
    // be a raw control, and the rules find none.
    expect((await verify(code)).diagnostics).toEqual([])
    // All the words are still present for the reader.
    expect(code).toContain('export const fromPurpose = 1;')
    expect(code).toContain('<button onClick={onSave}>x</button>')
    expect(code).toContain('not read.')
  })

  it('keeps a reason inside its comment in every place a comment is written', async () => {
    // A declared exception's comment is `{/* … */}` among children and a plain
    // comment at the root or in a prop. The reason tries to escape both.
    const because = 'Scanned, not read */} <button onClick={onSave}>x</button> {/* by design.'
    const scope = (children: ScreenSpec['root'][]): ScreenSpec['root'] => ({
      component: 'DensityScope',
      props: { value: 'compact' },
      exception: { rung: 2, because },
      children,
    })
    const nested: ScreenSpec = {
      ...base(),
      // At the root, and as a child of the root.
      root: scope([scope([{ component: 'Stack', props: { gap: 4 } }])]),
    }
    expect(validateSpec(registry, nested).faults).toEqual([])

    const code = await emitScreen(nested, { filepath: emittedPath('probe') })

    expect(code.match(/Rung 2, declared: Scanned, not read/g)).toHaveLength(2)
    expect(code).toMatch(/\n {4}\/\* Rung 2, declared/)
    expect(code).toMatch(/\{\/\* Rung 2, declared/)
    expect((await verify(code)).diagnostics).toEqual([])
    expect(exported(code)).toHaveLength(2)

    // In a prop, the braces belong to the attribute, so a plain comment is used.
    // This is emitted directly, because which props take an element is the
    // validator's concern, and how one is written is this test's.
    const inProp = await emitScreen(
      {
        ...base(),
        root: { component: 'Stack', props: { gap: 4, aside: scope([]) } },
      },
      { filepath: emittedPath('probe') },
    )
    expect(inProp).toMatch(/aside=\{\s*\/\* Rung 2, declared/)
    expect((await verify(inProp)).fatal).toBeNull()
  })

  it('keeps a purpose that runs to a second line inside the comment’s margin', async () => {
    const code = await emitScreen({ ...base(), purpose: 'First line.\nSecond line.' })
    expect(code).toContain('/**\n * First line.\n * Second line.\n *\n')
  })

  it('writes a string so the file contains exactly what the spec says', async () => {
    const spec: ScreenSpec = {
      ...base(),
      root: {
        component: 'Stack',
        props: { gap: 4 },
        children: [
          // A line break: a string literal cannot hold one as written.
          { component: 'Button', props: { label: 'Save\nand close', onClick: { $: 'onSave' } } },
          // A character reference: an attribute would decode it into `&`.
          { component: 'Button', props: { label: 'Fish &amp; chips', onClick: { $: 'onSave' } } },
          // Space at the edges of a text child, which JSX would drop.
          ' · ',
          // The ordinary case, written as a person would write it.
          'Plain text',
        ],
      },
    }
    expect(validateSpec(registry, spec).faults).toEqual([])

    const code = await emitScreen(spec, { filepath: emittedPath('probe') })

    expect(code).toContain("label={'Save\\nand close'}")
    expect(code).toContain("label={'Fish &amp; chips'}")
    expect(code).toContain("{' · '}")
    expect(code).toMatch(/^\s*Plain text$/m)
    expect((await verify(code)).fatal).toBeNull()
  })

  it('does not turn a line break between two strings into a space', async () => {
    const code = await emitScreen(
      {
        ...base(),
        root: {
          component: 'Stack',
          props: { gap: 4 },
          // Two adjacent strings render as "Total:42". Written as two lines of
          // text, they would read as one text with a space where the break was.
          // A run of spaces, or a tab, is collapsed by both JSX and the
          // formatter.
          children: ['Total:', '42', { $: 'onSave' }, 'after a binding', 'two  spaces\tand a tab'],
        },
      },
      { filepath: emittedPath('probe') },
    )

    expect(code).toMatch(/Total:\s*\{'42'\}/)
    expect(code).toMatch(/\{onSave\}\s*after a binding/)
    expect(code).toContain("{'two  spaces\\tand a tab'}")
  })

  it('writes `__proto__` as a key, not as a prototype', async () => {
    const code = await emitScreen(
      {
        ...base(),
        root: {
          component: 'Stack',
          // Parsed, not written as a literal. In a literal this key would set
          // the test's own prototype, which is the hazard under test.
          props: {
            gap: 4,
            meta: {
              $object: JSON.parse('{ "__proto__": "x", "plain": 1 }') as Record<string, string>,
            },
          },
        },
      },
      { filepath: emittedPath('probe') },
    )
    expect(code).toContain("['__proto__']: 'x'")
    expect(code).toContain('plain: 1')
  })

  /* ---- and what a lawful spec can still say ------------------------------ */

  it('checks the emitted file against the red rules, because a value can be a design value', async () => {
    // Nothing above stops a label from *being* a colour. The format knows a
    // label is a string, and only the rules know what a string holds. So the
    // check that decides whether a file may be written runs on the file.
    const coloured: ScreenSpec = {
      ...base(),
      root: { component: 'Button', props: { label: '#7c3aed', onClick: { $: 'onSave' } } },
    }
    expect(validateSpec(registry, coloured).ok).toBe(true)

    const refused = await emitCheckedScreen(coloured)
    expect(refused.fatal).toBeNull()
    expect(refused.violations.map((violation) => violation.rule)).toEqual([
      'polymorph/no-raw-styles',
    ])
    expect(refused.code).toContain('label="#7c3aed"')

    const lawful = await emitCheckedScreen(base())
    expect(lawful).toMatchObject({ violations: [], fatal: null })
    expect(lawful.code).toBe(await emitScreen(base()))
  })

  /* ---- a value, written as what it is where it sits ---------------------- */

  it('writes an exception’s comment to suit where its element sits', async () => {
    // `{/* … */}` is a comment only among an element's children. At the root
    // of the `return` the same braces open an object literal, and the file does
    // not parse. So at the root a plain comment is used.
    const rooted: ScreenSpec = {
      ...base(),
      root: {
        component: 'DensityScope',
        props: { value: 'compact' },
        exception: { rung: 2, because: 'A queue is scanned rather than read.' },
        children: [
          {
            component: 'DensityScope',
            props: { value: 'comfortable' },
            exception: { rung: 2, because: 'The summary inside it is read slowly.' },
            children: [{ component: 'Stack', props: { gap: 4 } }],
          },
        ],
      },
    }
    expect(validateSpec(registry, rooted).faults).toEqual([])

    const code = await emitScreen(rooted, { filepath: emittedPath('probe') })

    expect(code).toContain('    /* Rung 2, declared: A queue is scanned rather than read. */\n')
    expect(code).toContain('{/* Rung 2, declared: The summary inside it is read slowly. */}')
    expect((await verify(code)).diagnostics).toEqual([])
  })

  it('writes a list in a prop as a fragment when it holds an element, and as data when it does not', async () => {
    // Emitted directly. What a member's prop accepts is the validator's
    // concern. This test is about the emitter: the same list is written
    // differently depending on its contents.
    const listed: ScreenSpec = {
      ...base(),
      root: {
        component: 'Stack',
        props: {
          gap: 4,
          // Data: an array, each item an expression.
          choices: ['open', 'closed', { $: 'onSave' }],
          // Elements, with text between them: a fragment, each item a child.
          actions: [
            { component: 'Button', props: { label: 'Save', onClick: { $: 'onSave' } } },
            ' or ',
            { $: 'onSave' },
          ],
        },
      },
    }

    const code = await emitScreen(listed, { filepath: emittedPath('probe') })

    expect(code).toContain("choices={['open', 'closed', onSave]}")
    expect(code).toMatch(
      /actions=\{\s*<>\s*<Button label="Save" onClick=\{onSave\} \/>\s*\{' or '\}\s*\{onSave\}\s*<\/>\s*\}/,
    )
  })
})

function emittedPath(name: string): string {
  return resolve(ROOT, `apps/workbench/src/relay/${name}.view.tsx`)
}

describe('a native screen is emitted against its member package', () => {
  const screen = {
    spec: 'polymorph-screen/1',
    name: 'NativeOnly',
    purpose: 'A screen written for Android.',
    platform: 'android',
    inputs: [],
    root: { component: 'SettingsPage', props: { title: 'Native' }, children: [] },
  } as unknown as ScreenSpec

  it('throws from emitScreen without the package, naming it', async () => {
    await expect(emitScreen(screen)).rejects.toThrow(
      /A screen for android is emitted against its member package/,
    )
  })

  it('comes back as a fatal result with no code from the checked emitter', async () => {
    const result = await emitCheckedScreen(screen)
    expect(result.code).toBe('')
    expect(result.violations).toEqual([])
    expect(result.fatal).toMatch(/readNativePackage\(root, 'android'\)/)
  })

  it('emits a web screen whether platform is absent or web', async () => {
    const web = { ...screen, platform: 'web' } as ScreenSpec
    const absent = { ...screen } as ScreenSpec
    delete (absent as { platform?: string }).platform
    expect(await emitScreen(web)).toContain('export function NativeOnly')
    expect(await emitScreen(absent)).toContain('export function NativeOnly')
  })
})
