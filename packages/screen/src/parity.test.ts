import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { buildRegistry } from '@polymorph/registry'
import { FRAMEWORKS } from '@polymorph/registry/frameworks'
import { renderRuntimeCard } from '@polymorph/registry/runtime-card'
import { compactTable, expandTable, renderTableModule } from '@polymorph/registry/screen-table'
import { validateSpec } from '@polymorph/spec/validate'
import { describe, expect, it } from 'vitest'

import { DEFINITIONS } from '../../elements-ui/src/definitions'
import { allowedMembers, CODE_HOSTS } from './members'
import { ADDRESS_KEYS } from './urls'
import { VOCABULARY } from './vocabulary'

/**
 * The laws that hold the run-time vocabulary table to the registry it is
 * generated from.
 *
 * The table exists so a page can check a document without the registry. It
 * is worth that only if it gives every document the faults the registry
 * gives, so the first law runs `validateSpec` against both over every screen
 * in `design/screens/` and a set of documents written to reach each branch of
 * the validator that reads the vocabulary, in every framework. The others hold
 * what the table adds: the controlled pairs are the elements', the addresses
 * are every prop that takes one, and the card a host renders from the table
 * is the card the registry renders.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const registry = buildRegistry(ROOT)
const table = expandTable(compactTable(registry))

/** Every JSON document under `design/screens/`, the agent loop's attempts included. */
function screens(dir: string): { file: string; document: unknown }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return screens(path)
    if (!entry.name.endsWith('.json')) return []
    return [{ file: path.slice(ROOT.length + 1), document: JSON.parse(readFileSync(path, 'utf8')) }]
  })
}

const element = (component: string, props?: object, children?: unknown[]) => ({
  component,
  ...(props === undefined ? {} : { props }),
  ...(children === undefined ? {} : { children }),
})

const screen = (root: object, extra: object = {}) => ({
  spec: 'polymorph-screen/1',
  name: 'Probe',
  purpose: 'A document written to reach one branch of the validator.',
  inputs: [
    { name: 'title', type: 'string' },
    { name: 'onSave', type: '() => void' },
    { name: 'rows', type: 'Row[]' },
  ],
  root,
  ...extra,
})

/** Documents that reach every branch of `validateSpec` that reads the vocabulary. */
const FAULTY: Record<string, unknown> = {
  'a near miss': screen(element('Stack', {}, [element('Buton', { label: 'Save' })])),
  'an industry term': screen(element('Modal')),
  'an unknown part': screen(element('Table', {}, [element('Table.Rows')])),
  'a part React does not record': screen(element('Toast.Viewport')),
  'three segments': screen(element('Table.Row.Cell')),
  'an unknown prop': screen(element('Button', { lable: 'Save', label: 'Save', className: 'x' })),
  'values of the wrong type': screen(element('Button', { label: 42, size: 'xxl' })),
  'a missing required prop': screen(element('Button', { variant: 'solid', tone: 'accent' })),
  'cells that are not lawful': screen(
    element('Stack', {}, [
      element('Button', { label: 'A', variant: 'solid', tone: 'neutral' }),
      element('Button', { label: 'B', variant: 'huge' }),
    ]),
  ),
  'icons that are not roles': screen(
    element('Stack', {}, [
      element('Button', { label: 'A', icon: 'trash' }),
      element('Button', { label: 'B', icon: 'searc' }),
      element('EmptyState', { title: 'None', icon: 'x' }),
    ]),
  ),
  'children where none are taken': screen(element('Separator', {}, ['text'])),
  'an undeclared exception': screen(element('DensityScope', { value: 'compact' })),
  'exceptions declared wrong': screen(
    element('Stack', {}, [
      { ...element('ToneScope', { value: 'inverse' }), exception: { rung: 3, because: 'x' } },
      { ...element('Text', {}, ['a']), exception: { rung: 2, because: 'no reason at all here' } },
      {
        ...element('Bespoke', { reason: 'r' }),
        exception: { rung: 5, because: 'four words are here' },
      },
      element('Stack', { patch: { gap: 2 } }),
    ]),
  ),
  'a prop written beside props': screen({
    ...element('AuthPage', { title: 'Sign in' }, [element('Text', {}, ['a'])]),
    cardFooter: element('Text', {}, ['b']),
  }),
  'a structured object where a child goes': screen(
    element('Stack', {}, [{ $object: { a: 1 } }, { $: 'missing' }]),
  ),
  'a member absent in a framework': screen(element('ImageEditor', { label: 'Crop' })),
  'a third-party boundary on iOS': screen(
    {
      ...element('ThirdParty', { library: 'leaflet', reason: 'The map draws itself.' }),
      exception: { rung: 4, because: 'The map is another library entirely.' },
    },
    { platform: 'ios' },
  ),
  'a name the tree imports': screen(
    element('Tabs', {}, [element('Tabs.Content', { value: 'a' })]),
    {
      name: 'TabsContent',
    },
  ),
  'a member absent on iOS': screen(
    element('ListPage', { title: 'A', emptyState: { $object: { title: 'None' } } }, [
      element('Tooltip', { content: 'Tip' }, [element('Button', { label: 'A' })]),
    ]),
    { platform: 'ios' },
  ),
  'a native screen out of contract': screen(
    element('Stack', {}, [
      element('Button', { label: 'A', onClick: { $: 'title' }, variant: 'ghost' }),
      element('Text', {}, [{ $: 'onSave' }]),
      element('Heading', {}, ['one', 'two']),
      element('Table', {}, [element('Table.Head')]),
    ]),
    { platform: 'android' },
  ),
  'an archetype’s load state on a native screen': screen(
    element('ListPage', {
      title: 'A',
      empty: true,
      onRetry: { $: 'onSave' },
      emptyState: { $object: { title: 'None' } },
    }),
    { platform: 'ios' },
  ),
  'the app frame on a native screen': screen(
    element('AppShell', { sidebar: element('Text', {}, ['a']) }, [element('Text', {}, ['b'])]),
    { platform: 'ios' },
  ),
  'not a screen': { spec: 'polymorph-screen/1', root: element('Buton') },
}

describe('the run-time table gives every document the registry’s faults', () => {
  const documents = [
    ...screens(resolve(ROOT, 'design/screens')),
    ...Object.entries(FAULTY).map(([file, document]) => ({ file, document })),
  ]

  it('reads every screen in design/screens and every faulty document', () => {
    expect(
      documents.filter(({ file }) => file.startsWith('design/screens/')).length,
    ).toBeGreaterThanOrEqual(5)
  })

  for (const { file, document } of documents) {
    it(file, () => {
      for (const framework of FRAMEWORKS) {
        const full = validateSpec(registry, document, {}, { framework })
        const slim = validateSpec(table, document, {}, { framework })
        expect(slim, `${file} in ${framework}`).toEqual(full)
      }
    })
  }

  it('reaches faults, so agreement is not agreement on nothing', () => {
    for (const [file, document] of Object.entries(FAULTY)) {
      const faults = FRAMEWORKS.flatMap(
        (framework) => validateSpec(table, document, {}, { framework }).faults,
      )
      expect(faults.length, file).toBeGreaterThan(0)
    }
  })
})

describe('the generated table is the registry’s', () => {
  it('is what `pnpm registry` writes from this tree', () => {
    const written = readFileSync(resolve(ROOT, 'packages/screen/src/vocabulary.gen.ts'), 'utf8')
    // A table generated from another tree ships another vocabulary: run `pnpm registry`.
    expect(written === renderTableModule(compactTable(registry)), 'run `pnpm registry`').toBe(true)
    expect(VOCABULARY).toEqual(table)
  })

  it('keeps every member, primitive and icon role, in the registry’s order', () => {
    expect(table.components.map(({ name }) => name)).toEqual(
      registry.components.map(({ name }) => name),
    )
    expect(table.exceptions.primitives.map(({ name }) => name)).toEqual(
      registry.exceptions.primitives.map(({ name }) => name),
    )
    expect(table.icons.roles).toEqual(registry.icons.roles.map(({ name }) => ({ name })))
    for (const [at, member] of table.components.entries()) {
      const source = registry.components[at]
      expect(member.props, member.name).toEqual(
        source?.props.map(({ name, type, optional }) => ({ name, type, optional })),
      )
      expect(member.grid, member.name).toEqual(source?.grid)
    }
  })

  it('names the members React draws through a function', () => {
    expect(
      table.components
        .filter((member) => member.call !== null)
        .map(({ name, call }) => `${name} → ${call}`),
    ).toEqual(['Toast → toast'])
  })
})

describe('the controlled pairs are the ones an element follows the reader through', () => {
  // The element's name for a part joins it to its member: `TabsContent` for `Tabs.Content`.
  const pairs = new Map<string, Readonly<Record<string, string>>>()
  for (const member of table.components) {
    pairs.set(member.name, member.controlled)
    for (const part of member.parts) pairs.set(`${member.name}${part.name}`, part.controlled)
  }
  for (const primitive of table.exceptions.primitives)
    pairs.set(primitive.name, primitive.controlled)

  it('agrees with every element definition `pnpm shells` writes', () => {
    let compared = 0
    for (const definition of Object.values(DEFINITIONS)) {
      const expected = pairs.get(definition.member)
      if (expected === undefined) continue
      expect(definition.controlled ?? {}, definition.member).toEqual(expected)
      compared += 1
    }
    expect(compared).toBeGreaterThan(100)
    expect(pairs.get('Dialog')).toEqual({ open: 'onOpenChange' })
    expect(pairs.get('Input')).toEqual({ value: 'onChange' })
    expect(pairs.get('Checkbox')).toEqual({ checked: 'onCheckedChange' })
  })
})

describe('the addresses are every prop that takes one', () => {
  /** HTML's attributes whose value is a URL. */
  const URL_ATTRIBUTES = [
    'href',
    'src',
    'action',
    'formAction',
    'poster',
    'cite',
    'srcSet',
    'ping',
    'background',
    'longDesc',
    'useMap',
    'codebase',
    'manifest',
  ]
  const text = (type: string) => /^string( \| undefined)?$/.test(type)
  // A structured object's fields reach a member as a prop's do (a breadcrumb's `href`), so the data
  // types' fields are read with the props.
  const props = [
    ...[...registry.components, ...registry.exceptions.primitives].flatMap((member) => [
      ...member.props.map((prop) => ({ ...prop, where: `${member.name}.${prop.name}` })),
      ...('parts' in member ? member.parts : []).flatMap((part) =>
        part.props.map((prop) => ({ ...prop, where: `${member.name}.${part.name}.${prop.name}` })),
      ),
    ]),
    ...registry.dataTypes.flatMap((type) =>
      type.fields.map((field) => ({ ...field, where: `${type.name}.${field.name}` })),
    ),
  ]

  it('reads the data types’ fields, where a breadcrumb’s and an image’s addresses are', () => {
    const where = new Set(props.map((prop) => prop.where))
    for (const field of ['BreadcrumbItem.href', 'LightboxImage.src']) {
      expect(where.has(field), field).toBe(true)
    }
  })

  // A prop documented as "The speaker's picture" holds one, and one whose doc mentions a picture
  // for another reason (an image's `alt`) does not. A doc that says its text is "not a URL" (a
  // source's domain, drawn as text) is read as saying so.
  const NOT_A_URL = /\bnot an? URL\b/
  const documented = (doc: string | undefined) =>
    /\bURL\b|^The \S+['’]s picture\b/.test(
      (doc ?? '').replace(new RegExp(NOT_A_URL.source, 'g'), ''),
    )

  it('holds each text prop and field named for a URL in HTML, or documented as a URL or as someone’s picture', () => {
    const addresses = props.filter(
      (prop) =>
        text(prop.type) &&
        (URL_ATTRIBUTES.includes(prop.name.split('.').at(-1) ?? '') || documented(prop.doc)),
    )
    expect(addresses.length).toBeGreaterThan(5)
    for (const prop of addresses) {
      expect(ADDRESS_KEYS.has(prop.name.split('.').at(-1) ?? ''), prop.where).toBe(true)
    }
  })

  it('reads a doc as saying its text is not a URL only where it says so', () => {
    const negated = props.filter((prop) => NOT_A_URL.test(prop.doc ?? '')).map(({ where }) => where)
    expect(negated).toEqual(['CitationSource.domain'])
  })

  it('names only props the vocabulary has, and text props among them', () => {
    for (const key of ADDRESS_KEYS) {
      const named = props.filter((prop) => prop.name.split('.').at(-1) === key)
      expect(named.length, key).toBeGreaterThan(0)
      expect(
        named.some((prop) => text(prop.type)),
        key,
      ).toBe(true)
    }
  })
})

describe('the members that host another library’s code are off by default', () => {
  it('finds no member that takes markup, a script’s address or an embed, in a prop, a part’s prop or a field', () => {
    const suspect =
      /^(?:html|innerHTML|dangerouslySetInnerHTML|srcDoc|srcdoc|script|scriptSrc|embed|iframe)$/i
    const read = [
      ...[...registry.components, ...registry.exceptions.primitives].flatMap((member) => [
        ...member.props.map((prop) => ({ prop, where: `${member.name}.${prop.name}` })),
        ...('parts' in member ? member.parts : []).flatMap((part) =>
          part.props.map((prop) => ({ prop, where: `${member.name}.${part.name}.${prop.name}` })),
        ),
      ]),
      ...registry.dataTypes.flatMap((type) =>
        type.fields.map((prop) => ({ prop, where: `${type.name}.${prop.name}` })),
      ),
    ]
    expect(read.some(({ where }) => where.split('.').length === 3)).toBe(true)
    for (const { prop, where } of read) {
      expect(suspect.test(prop.name), where).toBe(false)
      expect(prop.type, where).not.toContain('__html')
    }
  })

  it('names the boundary around another library’s component, and leaves it out of every default', () => {
    const hosts = registry.exceptions.primitives.filter((primitive) =>
      /another library/.test(primitive.purpose),
    )
    expect(hosts.map(({ name }) => name)).toEqual([...CODE_HOSTS])
    for (const framework of FRAMEWORKS) {
      const allowed = allowedMembers(table, { framework })
      for (const host of CODE_HOSTS) expect(allowed.has(host), framework).toBe(false)
    }
  })
})

describe('the card a host renders from the table is the registry’s', () => {
  it('in every framework', () => {
    for (const framework of FRAMEWORKS) {
      const members = allowedMembers(table, { framework })
      expect(renderRuntimeCard(table, { framework, members }), framework).toBe(
        renderRuntimeCard(registry, { framework, members }),
      )
    }
  })
})
