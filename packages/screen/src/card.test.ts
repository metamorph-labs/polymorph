import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { CHARS_PER_TOKEN, estimateTokens } from '@polymorph/registry'
import { FRAMEWORKS } from '@polymorph/registry/frameworks'
import { describe, expect, it } from 'vitest'

import { outputContract, runtimeCard } from './card'
import { checkScreen } from './check'
import { addressNeed, allowedMembers, CODE_HOSTS, defaultMembers, surfaceOf } from './members'
import { ADDRESS_KEYS } from './urls'
import { VOCABULARY } from './vocabulary'

/**
 * The run-time card's laws.
 *
 * A host puts the card in a model's system prompt and asks for a screen in
 * one call, with no tool to look anything up. So the card lists exactly the
 * members the host draws, each with what writing it lawfully needs, and it
 * fits a prompt a host caches: its size is a ceiling, as the system card's
 * is (`packages/registry/src/card.test.ts`).
 */

/**
 * The budgets, in characters. The default card lists every member a framework
 * draws, with its props' types, and the data types those props take, and costs
 * about fifteen thousand tokens; a host that draws a few dozen members pays
 * under a quarter of that. Each ceiling is a little above the measured card,
 * so the next member or prop fails here first, and whoever adds it decides
 * whether it is worth its characters. Raise a ceiling only after the growth
 * that needs it, with the reason here.
 *
 * The ceilings include the data types section: every named type a listed
 * member's props take, with its fields (about thirteen thousand characters on the
 * default card, twelve hundred on the subset). A model not told a
 * `SelectOption`'s fields guesses them, the guess validates, because the
 * validator does not read a structured object's fields, and the Select draws
 * no options. The section prints each type once, a function field that
 * returns a value as `fn`, and a member's props type as a pointer to the
 * member's line. It also includes the output contract's sentence that a
 * callback returning a value is answered and never told to the host, and the
 * one that asks for an element's plain props before its props that hold
 * elements, because a screen drawn as it is written draws an element once its
 * plain props are whole.
 *
 * It also includes RichTextContent and RichTextInput with the rich-text
 * document's types: its blocks, inline nodes and marks. A model that writes a
 * RichTextContent writes its document, and one not told a paragraph holds
 * `content` and a code block `text` writes a document the reader draws as
 * nothing.
 *
 * It also includes two sentences a measured run needed. One says the mark for
 * the four ARIA props is not a prop and how each is written, because a model
 * wrote `aria` as a prop holding an object. The other says a control's name is
 * used once in a screen, because two forms on one screen each named a field
 * `email`.
 *
 * It also includes TagInput's `removedLabel`, the seam for the sentence a
 * screen-reader user hears when a tag is removed. Its type is printed by its
 * name, the shortest form, and no sentence of TagInput's own on the card was
 * left to shorten in its place.
 *
 * It also includes ArtifactPane's `streamingLabel`, the seam for what a
 * screen-reader user hears while an artifact is being written, which the
 * generated members wrote in English. ArtifactPane's purpose is shorter in its
 * place.
 */
const BUDGET_CHARS = 60_840
const SUBSET_BUDGET_CHARS = 13_600

/** What a host that draws forms, lists and simple pages might allow. */
const SUBSET = [
  'Stack',
  'Inline',
  'Grid',
  'Card',
  'Heading',
  'Text',
  'Badge',
  'Separator',
  'Alert',
  'EmptyState',
  'Stat',
  'List',
  'Table',
  'Button',
  'Input',
  'Textarea',
  'Select',
  'Checkbox',
  'Switch',
  'RadioGroup',
  'FormField',
  'DatePicker',
  'Link',
]

const line = (card: string, name: string) =>
  card.split('\n').find((row) => row.startsWith(`- **${name}**`)) ?? ''

describe('the card lists the members a host draws', () => {
  it('lists every member the framework draws by default, and none that hosts another library’s code', () => {
    for (const framework of FRAMEWORKS) {
      const card = runtimeCard({ framework })
      for (const name of allowedMembers(VOCABULARY, { framework })) {
        expect(card, `${framework}: ${name}`).toContain(`- **${name}**`)
      }
      for (const host of CODE_HOSTS) expect(card, framework).not.toContain(`**${host}**`)
    }
  })

  it('leaves out of React’s card a member React draws through a function, and keeps it where it is an element', () => {
    expect(runtimeCard()).not.toContain('- **Toast**')
    expect(runtimeCard({ framework: 'elements' })).toContain('- **Toast**')
  })

  it('lists a host’s members alone, with their parts', () => {
    const card = runtimeCard({ members: SUBSET })
    const listed = card
      .slice(0, card.indexOf('### Data types'))
      .split('\n')
      .filter((row) => row.startsWith('- **'))
      .map((row) => /\*\*(.+?)\*\*/.exec(row)?.[1])
    expect(listed.sort()).toEqual([...SUBSET].sort())
    expect(card).toContain('  - **Table.Row**')
    expect(card).toContain('  - **List.Item**')
    expect(card).not.toContain('**DataTable**')
  })

  it('names the host’s members that host another library’s code where the host allows them', () => {
    const card = runtimeCard({ members: ['Stack', 'ThirdParty'] })
    expect(card).toContain('- **ThirdParty** (rung 4)')
    expect(card).toContain('`ThirdParty` is rung 4')
  })
})

describe('each member says what writing it lawfully needs', () => {
  const card = runtimeCard()

  it('gives each prop its type, marks a required one, and names the lawful cells', () => {
    const button = line(card, 'Button')
    expect(button).toContain(' · label*: string')
    expect(button).toContain(' · variant: "solid"|"soft"|"outline"|"ghost"')
    expect(button).toContain(' · icon: IconRole')
    expect(button).toContain(' · cells: solid(accent|danger)')
    // The DOM event a callback is handed is not an action's argument.
    expect(button).toContain(' · onClick: () => void')
    expect(line(card, 'Input')).toContain(' · onChange: (value: string) => void')
    // A function's result runs to the end of its text.
    expect(line(card, 'ConfirmDialog')).toContain(' · onConfirm*: () => void|Promise<void>')
  })

  it('says where a member takes children, as it is a fault elsewhere', () => {
    expect(line(card, 'Stack')).toContain(' · children: node')
    expect(line(card, 'Heading')).toContain(' · children*: string')
    expect(line(card, 'Separator')).not.toContain('children')
  })

  it('lists the icon roles once, and leaves out what a document cannot hold', () => {
    expect(card.split('An `IconRole` is a meaning')).toHaveLength(2)
    for (const role of VOCABULARY.icons.roles) expect(card).toContain(role.name)
    expect(card).not.toContain('controlRef')
    expect(card).not.toContain('| undefined')
    expect(card).not.toContain('ReactNode')
    expect(card).not.toContain('--pm-')
  })
})

describe('the data types a member’s props take', () => {
  const card = runtimeCard()
  const types = (text: string) =>
    text
      .slice(text.indexOf('### Data types'))
      .split('\n')
      .filter((row) => row.startsWith('- **'))

  it('prints each type a listed member reaches once, with its fields', () => {
    const rows = types(card)
    expect(new Set(rows).size).toBe(rows.length)
    expect(line(card, 'SelectOption')).toBe(
      '- **SelectOption** · description: string · disabled: boolean · label*: string · value*: string',
    )
    expect(line(card, 'SelectOptionGroup')).toContain(' · options*: SelectOption[]')
    expect(card).toContain('- **DataTableColumn<Row>** · cell: fn · header*: string · key*: string')
    expect(card).toContain('- **MenuEntry** = MenuItemEntry | MenuCheckboxEntry')
    expect(line(card, 'MenuItemEntry')).toContain(' · onSelect*: () => void')
  })

  it('points a member’s props type at the member’s line, where the member is listed', () => {
    expect(line(card, 'StatProps')).toBe('- **StatProps** · the props of `Stat`')
    const alone = runtimeCard({ members: ['Dashboard'] })
    expect(line(alone, 'StatProps')).toContain(' · label*: string')
    expect(line(alone, 'StatDelta')).toContain(' · direction*: "up"|"down"')
  })

  it('marks the four ARIA props with a word no document can hold as a key', () => {
    // A member's line that said `aria` was read as a prop of that name, holding an object.
    expect(line(card, 'Input')).toMatch(/ · aria-\*$/)
    for (const row of card.split('\n').filter((row) => row.startsWith('- **'))) {
      expect(row, row.slice(0, 40)).not.toMatch(/ · aria(?: ·|$)/)
    }
    expect(card.replace(/\s+/g, ' ')).toContain(
      '`aria-*` stands for four props, each written under its own name (`aria-label`, ' +
        '`aria-labelledby`, `aria-describedby`, `aria-required`); no member has a prop named `aria`',
    )
  })

  it('prints only the types the listed members reach, and none a callback alone names', () => {
    const select = types(runtimeCard({ members: ['Select'] })).map(
      (row) => /\*\*(.+?)\*\*/.exec(row)?.[1],
    )
    expect(select).toEqual(['SelectOption', 'SelectOptionGroup'])
    // `onSortChange: (sort: DataTableSort) => void` alone would not print `DataTableSort`; the
    // `sort` prop does.
    expect(types(runtimeCard({ members: ['Text'] }))).toEqual([])
  })
})

describe('the output contract', () => {
  it('says what to write, in the order the host draws it', () => {
    const contract = outputContract()
    expect(contract).toContain('`polymorph-screen/1`')
    expect(contract).toContain('and `root` last')
    expect(contract.replace(/\s+/g, ' ')).toContain(
      'Write an element’s plain props before its props that hold elements, and `props` before `children`',
    )
    // Two forms on one screen each named a field `email`, and `values` holds one of them.
    expect(contract.replace(/\s+/g, ' ')).toContain('A name is used once in a screen')
    for (const key of ADDRESS_KEYS) expect(contract).toContain(`\`${key}\``)
    expect(contract).toContain('`DensityScope` is rung 2')
    expect(contract).toContain('`Bespoke` is rung 4')
    expect(contract).not.toContain('ThirdParty')
  })

  it('names only the rungs the host’s members can take', () => {
    expect(outputContract({ members: ['Text'] })).not.toContain('declared exception')
    expect(outputContract({ members: ['Card'] })).toContain('a `patch` prop (on `Card`) is rung 3')
  })
})

describe('the card for a host that refuses addresses', () => {
  const card = runtimeCard({ addresses: 'refused' })
  const rows = card.split('\n').filter((row) => /^\s*- \*\*/.test(row))

  it('lists no prop, part’s prop or data type field that takes an address', () => {
    for (const row of rows) {
      for (const key of ADDRESS_KEYS) expect(row, row.slice(0, 40)).not.toContain(` · ${key}`)
    }
    expect(line(card, 'Card')).not.toContain(' · href')
    expect(card).toContain('  - **List.Item** · ')
    expect(card.split('\n').find((row) => row.startsWith('  - **List.Item**'))).not.toContain(
      ' · href',
    )
    expect(line(card, 'BreadcrumbItem')).toBe(
      '- **BreadcrumbItem** · label*: string · onSelect: () => void',
    )
    // The default card lists them.
    expect(line(runtimeCard(), 'Card')).toContain(' · href: string')
  })

  it('lists no member that needs an address, and every other member it lists by default', () => {
    const needs = defaultMembers(VOCABULARY).filter(
      (name) => addressNeed(VOCABULARY, name) !== null,
    )
    expect(needs).toEqual(expect.arrayContaining(['Link', 'Image', 'Markdown', 'SectionNav']))
    expect(needs).not.toContain('Card')
    for (const name of defaultMembers(VOCABULARY)) {
      expect(card.includes(`- **${name}**`), name).toBe(!needs.includes(name))
    }
    // A member the host names is left out too.
    expect(runtimeCard({ members: ['Stack', 'Link'], addresses: 'refused' })).not.toContain(
      '**Link**',
    )
  })

  it('tells the model to write no address, in place of the schemes', () => {
    expect(outputContract({ addresses: 'refused' })).toContain(
      '- This host shows no link and loads nothing from an address: write no `avatar`, `href`, ' +
        '`nextHref`, `previousHref`, `src` or `srcSet`, in a prop or a field.',
    )
    expect(outputContract({ addresses: 'refused' })).not.toContain('`https:`')
    expect(outputContract()).toContain('`https:`')
  })

  it('passes, under the same option, a screen that holds no address', () => {
    // A document the refusing card describes is one the check passes under the same option.
    const plain = {
      spec: 'polymorph-screen/1',
      name: 'Plain',
      purpose: 'A card with a title and a list.',
      inputs: [],
      root: {
        component: 'Card',
        props: { title: 'Orders' },
        children: [
          {
            component: 'List',
            props: { label: 'Orders' },
            children: [{ component: 'List.Item', props: { title: 'Order 1042' } }],
          },
        ],
      },
    }
    expect(checkScreen(plain, { addresses: 'refused' }).faults).toEqual([])
  })
})

describe('the card fits a prompt a host caches', () => {
  it(`is under ${BUDGET_CHARS} characters (~${Math.round(BUDGET_CHARS / CHARS_PER_TOKEN)} tokens) in every framework`, () => {
    for (const framework of FRAMEWORKS) {
      const card = runtimeCard({ framework })
      expect(
        card.length,
        `${framework}: ${card.length} chars (~${estimateTokens(card)} tokens)`,
      ).toBeLessThanOrEqual(BUDGET_CHARS)
    }
  })

  it(`is under ${SUBSET_BUDGET_CHARS} characters for a host that draws a few dozen members`, () => {
    const card = runtimeCard({ members: SUBSET })
    expect(
      card.length,
      `${card.length} chars (~${estimateTokens(card)} tokens)`,
    ).toBeLessThanOrEqual(SUBSET_BUDGET_CHARS)
  })
})

/**
 * Whether a structured object has the fields its data type declares: none it
 * lacks, every required one, a literal one of its literals, and each nested
 * object as its own field's type says. The validator does not read a
 * structured object's fields, so this is what tells a working object from a
 * lawful guess. A union fits when one of its types does.
 */
function objectFaults(value: unknown, printed: string, path: string): string[] {
  const catalogue = new Map((VOCABULARY.dataTypes ?? []).map((type) => [type.name, type]))
  const names = (printed.match(/\b[A-Z][A-Za-z0-9]*\b/g) ?? []).filter((name) =>
    catalogue.has(name),
  )
  if (names.length === 0) return []
  if (Array.isArray(value))
    return value.flatMap((item, at) => objectFaults(item, printed, `${path}[${at}]`))
  if (typeof value !== 'object' || value === null || !('$object' in value)) return []
  const fields = (value as { $object: Record<string, unknown> }).$object
  const fit = (name: string, seen: Set<string>): string[] => {
    const type = catalogue.get(name)
    if (type === undefined || seen.has(name)) return [`${path}: no type ${name}`]
    if (type.union !== undefined) {
      const fits = type.union.map((member) => fit(member, new Set([...seen, name])))
      return fits.some((faults) => faults.length === 0) ? [] : (fits[0] ?? [])
    }
    const declared = new Map(type.fields.map((field) => [field.name, field]))
    const faults: string[] = []
    for (const [key, item] of Object.entries(fields)) {
      const field = declared.get(key)
      if (field === undefined) {
        faults.push(`${path}: ${name} has no field ${key}`)
        continue
      }
      const literals = field.type.split(' | ').filter((part) => /^"[^"]*"$/.test(part))
      if (
        typeof item === 'string' &&
        literals.length > 0 &&
        literals.length === field.type.split(' | ').length
      ) {
        if (!literals.includes(JSON.stringify(item)))
          faults.push(`${path}.${key}: ${item} is not ${field.type}`)
      }
      faults.push(...objectFaults(item, field.type, `${path}.${key}`))
    }
    for (const field of type.fields) {
      if (!field.optional && !(field.name in fields))
        faults.push(`${path}: ${name} needs ${field.name}`)
    }
    return faults
  }
  const fits = names.map((name) => fit(name, new Set()))
  return fits.some((faults) => faults.length === 0) ? [] : fits.flat()
}

/** Every structured object a document writes at a prop, held to the prop's type. */
function documentFaults(value: unknown, path: string): string[] {
  if (Array.isArray(value))
    return value.flatMap((item, at) => documentFaults(item, `${path}[${at}]`))
  if (typeof value !== 'object' || value === null) return []
  const record = value as Record<string, unknown>
  const faults: string[] = []
  if (typeof record['component'] === 'string') {
    const surface = surfaceOf(VOCABULARY, record['component'])
    for (const [name, item] of Object.entries((record['props'] ?? {}) as Record<string, unknown>)) {
      const prop = surface?.props.find((candidate) => candidate.name === name)
      if (prop !== undefined) faults.push(...objectFaults(item, prop.type, `${path}.props.${name}`))
    }
  }
  for (const [key, item] of Object.entries(record))
    faults.push(...documentFaults(item, `${path}.${key}`))
  return faults
}

describe('a screen written from the card alone is lawful', () => {
  // Each was written by reading the card and nothing else: no registry, no tool, no spec.
  const FIXTURES = resolve(import.meta.dirname, '../fixtures')
  const written = readdirSync(FIXTURES).filter((file) => file.endsWith('.json'))

  it('reads the screens', () => {
    expect(written.length).toBeGreaterThanOrEqual(3)
  })

  for (const file of written) {
    it(file, () => {
      const document = JSON.parse(readFileSync(join(FIXTURES, file), 'utf8')) as unknown
      for (const framework of ['react', 'elements'] as const) {
        expect(checkScreen(document, { framework }).faults, framework).toEqual([])
      }
      // Each structured object has the fields the card prints for its type.
      expect(documentFaults(document, '$')).toEqual([])
    })
  }

  it('writes options, columns, stats, tabs and menu entries as objects the card describes', () => {
    const objects = written.flatMap((file) => {
      const text = readFileSync(join(FIXTURES, file), 'utf8')
      return ['"tabs"', '"columns": [', '"items": [', '"stats": [', '"options": ['].filter((key) =>
        text.includes(key),
      )
    })
    expect(new Set(objects).size).toBe(5)
  })

  it('tells a guessed object from one the card describes', () => {
    const guessed = {
      component: 'Select',
      props: { options: [{ $object: { id: 'a', text: 'A' } }] },
    }
    expect(documentFaults(guessed, '$')).toEqual(
      expect.arrayContaining(['$.props.options[0]: SelectOption has no field id']),
    )
    const nested = {
      component: 'Dashboard',
      props: {
        stats: [{ $object: { label: 'A', value: '1', delta: { $object: { dir: 'up' } } } }],
      },
    }
    expect(documentFaults(nested, '$')).toEqual(
      expect.arrayContaining(['$.props.stats[0].delta: StatDelta has no field dir']),
    )
    const entry = {
      component: 'Menu',
      props: { items: [{ $object: { kind: 'checkbox', label: 'Compact' } }] },
    }
    expect(documentFaults(entry, '$').length).toBeGreaterThan(0)
  })
})
