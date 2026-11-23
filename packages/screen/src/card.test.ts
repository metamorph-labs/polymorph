import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { CHARS_PER_TOKEN, estimateTokens } from '@polymorph/registry'
import { FRAMEWORKS } from '@polymorph/registry/frameworks'
import { describe, expect, it } from 'vitest'

import { outputContract, runtimeCard } from './card'
import { checkScreen } from './check'
import { allowedMembers, CODE_HOSTS } from './members'
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
 * draws, with its props' types, and costs about eleven thousand tokens; a
 * host that draws a few dozen members pays about a quarter of that. Each
 * ceiling is a little above the measured card, so the next member or prop
 * fails here first, and whoever adds it decides whether it is worth its
 * characters. Raise a ceiling only after the growth that needs it, with the
 * reason here.
 */
const BUDGET_CHARS = 47_000
const SUBSET_BUDGET_CHARS = 12_000

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

describe('the output contract', () => {
  it('says what to write, in the order the host draws it', () => {
    const contract = outputContract()
    expect(contract).toContain('`polymorph-screen/1`')
    expect(contract).toContain('and `root` last')
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
    })
  }
})
