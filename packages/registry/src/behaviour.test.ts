import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  ANNOUNCEMENTS,
  CLICK_EFFECTS,
  contractFences,
  DISMISSALS,
  isKey,
  KEY_EFFECTS,
  parseStatement,
  readBehaviour,
  readContract,
  resolveState,
  specOfMember,
  stateFaults,
  STATEMENT_KINDS,
} from './behaviour'

/**
 * The behaviour contract's grammar (`docs/conformance.md`).
 *
 * Every spec's contract fences parse, and the grammar rejects what it does not
 * define with the rule that was broken. The conformance law
 * (`packages/react-ui/src/conformance.test.tsx`) runs the statements; this file
 * checks that they mean one thing before anything runs them.
 */

const ROOT = resolve(import.meta.dirname, '../../..')

const SPECS: Record<string, string> = Object.fromEntries(
  ['design/components', 'design/archetypes'].flatMap((dir) =>
    readdirSync(resolve(ROOT, dir))
      .filter((file) => file.endsWith('.md'))
      .map((file) => [`${dir}/${file}`, readFileSync(resolve(ROOT, dir, file), 'utf8')]),
  ),
)

const spec = (...lines: string[]) => lines.join('\n')

describe('every spec’s contract parses', () => {
  const read = Object.entries(SPECS).map(([file, markdown]) => readContract(markdown, file))

  it('finds contracts, so a clean result is meaningful', () => {
    const statements = read.flatMap((result) => result.contract)
    expect(statements.length).toBeGreaterThan(200)
    for (const kind of STATEMENT_KINDS) {
      expect(
        statements.some((statement) => statement.kind === kind),
        kind,
      ).toBe(true)
    }
  })

  it('has no line the grammar rejects, in any spec', () => {
    const faults = read.flatMap((result) =>
      result.faults.map((fault) => `${fault.file}:${fault.line}: ${fault.message}`),
    )
    expect(faults).toEqual([])
  })
})

describe('the grammar', () => {
  it('reads every statement kind into its fields', () => {
    expect(parseStatement('role panel dialog when open md')).toEqual({
      kind: 'role',
      part: 'panel',
      role: 'dialog',
      text: 'role panel dialog when open md',
      state: 'open md',
    })
    expect(parseStatement('name panel from title')).toEqual({
      kind: 'name',
      part: 'panel',
      from: 'title',
      text: 'name panel from title',
    })
    expect(parseStatement('key ArrowDown moves-focus-next on item when open')).toEqual({
      kind: 'key',
      key: 'ArrowDown',
      effect: 'moves-focus-next',
      on: 'item',
      text: 'key ArrowDown moves-focus-next on item when open',
      state: 'open',
    })
    expect(parseStatement('click activates on row when interactive rows')).toEqual({
      kind: 'click',
      effect: 'activates',
      on: 'row',
      text: 'click activates on row when interactive rows',
      state: 'interactive rows',
    })
    expect(parseStatement('focus on-open body')).toMatchObject({ moment: 'on-open', part: 'body' })
    expect(parseStatement('focus on-close previous')).toMatchObject({
      moment: 'on-close',
      target: 'previous',
    })
    expect(parseStatement('focus on-close nearest')).toMatchObject({
      moment: 'on-close',
      target: 'nearest',
    })
    expect(parseStatement('key F8 focuses viewport when the viewport')).toEqual({
      kind: 'key',
      key: 'F8',
      effect: 'focuses',
      into: 'viewport',
      text: 'key F8 focuses viewport when the viewport',
      state: 'the viewport',
    })
    expect(parseStatement('dismiss none when non-dismissible')).toMatchObject({ by: 'none' })
    expect(parseStatement('announces live:polite when loading')).toMatchObject({
      channel: 'live:polite',
      state: 'loading',
    })
    expect(parseStatement('announces live:polite when loading')).not.toHaveProperty('says')
    expect(parseStatement('announces live:polite "Loading options" when loading')).toEqual({
      kind: 'announces',
      channel: 'live:polite',
      says: 'Loading options',
      text: 'announces live:polite "Loading options" when loading',
      state: 'loading',
    })
    expect(parseStatement('attr divider aria-valuenow=50 when even')).toMatchObject({
      part: 'divider',
      attribute: 'aria-valuenow',
      value: '50',
    })
  })

  it('reads an attribute with a quoted value, an empty one, and none', () => {
    expect(parseStatement('attr item data-state="open" when open')).toMatchObject({ value: 'open' })
    expect(parseStatement('attr item data-highlighted="" when open')).toMatchObject({ value: '' })
    expect(parseStatement('attr stage tabindex when loaded')).toMatchObject({
      attribute: 'tabindex',
      value: null,
    })
  })

  it('reads the three attributes that say whether a field changes what is typed', () => {
    for (const [attribute, value] of [
      ['autocorrect', 'off'],
      ['autocapitalize', 'off'],
      ['spellcheck', 'false'],
    ]) {
      expect(parseStatement(`attr field ${attribute}=${value} when exact`)).toMatchObject({
        attribute,
        value,
      })
    }
    expect(() => parseStatement('attr field autocomplete=off when exact')).toThrow(
      /an attribute is a `data-\*` or `aria-\*` name/,
    )
  })

  it('takes the rest of the line as the state, because entry names are sentences', () => {
    expect(parseStatement('role panel dialog when open, guarding a destruction').state).toBe(
      'open, guarding a destruction',
    )
  })

  it('reads a quoted message whole, even when it says "when"', () => {
    expect(
      parseStatement('announces live:assertive "Saved when you left" when the editor closed'),
    ).toMatchObject({ says: 'Saved when you left', state: 'the editor closed' })
  })

  it('collapses runs of spaces, so the ledger’s key does not depend on alignment', () => {
    expect(parseStatement('  key  Escape   closes ').text).toBe('key Escape closes')
  })

  it('takes modifiers before a key, and only before it', () => {
    expect(isKey('Shift+Tab')).toBe(true)
    expect(isKey('Alt+ArrowDown')).toBe(true)
    expect(isKey('Tab+Shift')).toBe(false)
    expect(isKey('Return')).toBe(false)
  })

  it('rejects each thing it does not define, naming the rule', () => {
    const rejects: [string, RegExp][] = [
      ['press Escape', /a statement must be one of/],
      ['role panel dailog', /not a WAI-ARIA role/],
      ['role Panel dialog', /a part is a lower-case anatomy name/],
      ['name panel by title', /expected `name <part> from/],
      ['key Return opens', /a key is one of/],
      ['key Escape vanishes', /a key effect must be one of/],
      ['key Escape closes in panel', /expected `key <Key> <effect> on <part>`/],
      ['key Escape closes panel', /expected `key <Key> <effect> \[on <part>\]`/],
      ['key F8 focuses', /expected `key <Key> focuses <part>`/],
      ['key F8 focuses on viewport', /expected `key <Key> focuses <part>`/],
      ['click activates', /expected `click <effect> on <part>`/],
      ['click opens on trigger', /a click effect must be one of/],
      ['click activates in row', /expected `click <effect> on <part>`/],
      ['focus on-hover panel', /a focus moment must be one of/],
      ['focus on-close anywhere', /a focus return must be one of/],
      ['dismiss sometimes', /a dismissal must be one of/],
      ['announces live:polite', /`announces` needs `when <state>`/],
      ['announces live:polite "Loading"', /`announces` needs `when <state>`/],
      ['announces shout when open', /an announcement channel must be one of/],
      ['announces busy "Loading" when open', /a message is words a live region says/],
      ['announces live:polite "" when open', /a message is words a live region says/],
      ['role panel "dialog" when open', /only `announces` takes a quoted message/],
      ['attr panel role=dialog when open', /an attribute is a `data-\*` or `aria-\*` name/],
      ['attr panel data-state=open', /`attr` needs `when <state>`/],
    ]
    for (const [line, message] of rejects) {
      expect(() => parseStatement(line), line).toThrow(message)
    }
  })

  it('keeps its closed lists closed and free of repeats', () => {
    for (const list of [STATEMENT_KINDS, KEY_EFFECTS, CLICK_EFFECTS, DISMISSALS, ANNOUNCEMENTS]) {
      expect(new Set(list).size).toBe(list.length)
    }
  })
})

describe('fences', () => {
  const markdown = spec(
    '# Widget',
    '',
    '## Anatomy',
    '',
    '```',
    'role panel dialog',
    '```',
    '',
    '## Motion — none. Icons — none. A11y — a real',
    'button, named by its label.',
    '',
    '```contract',
    'role root button',
    '',
    'key Enter activates on root',
    '```',
  )

  it('reads only contract fences, with the line of every statement', () => {
    const fences = contractFences(markdown)
    expect(fences).toHaveLength(1)
    const { contract, lines, faults } = readContract(markdown, 'widget.md')
    expect(faults).toEqual([])
    expect(contract.map((statement) => statement.text)).toEqual([
      'role root button',
      'key Enter activates on root',
    ])
    expect(lines).toEqual([13, 15])
  })

  it('names the section a combined heading runs on into', () => {
    expect(contractFences(markdown)[0]?.section).toContain('A11y — a real button')
  })

  it('runs only a combined heading on into the prose under it', () => {
    const { faults } = readContract(
      spec('## Motion', 'A11y is not this section.', '```contract', 'role root button', '```'),
      'widget.md',
    )
    expect(faults).toEqual([expect.objectContaining({ message: expect.stringMatching(/Motion"/) })])
  })

  it('skips a longer fence whole, with the contract fence it shows', () => {
    const shown = spec(
      '## A11y',
      '````md',
      '```contract',
      'role root dialog',
      '```',
      '````',
      '',
      '```contract',
      'role root button',
      '```',
    )
    expect(readContract(shown, 'widget.md').contract.map((statement) => statement.text)).toEqual([
      'role root button',
    ])
  })

  it('reads a tilde fence and an info string with more than the language', () => {
    const fenced = spec(
      '## A11y',
      '~~~contract',
      'role root button',
      '~~~',
      '``` contract the trigger',
      'key Enter activates on root',
      '```',
      '~~~ts',
      '```contract',
      'role root dialog',
      '~~~',
    )
    expect(readContract(fenced, 'widget.md').contract.map((statement) => statement.text)).toEqual([
      'role root button',
      'key Enter activates on root',
    ])
  })

  it('reports a fence outside an A11y, Behaviour or Keyboard section', () => {
    const { faults } = readContract(
      spec('## Motion', '', '```contract', 'role root button', '```'),
      'widget.md',
    )
    expect(faults).toEqual([
      expect.objectContaining({
        file: 'widget.md',
        line: 3,
        message: expect.stringMatching(/Motion/),
      }),
    ])
  })

  it('reports a statement made twice, and every bad line, not only the first', () => {
    const { faults } = readContract(
      spec('## A11y', '```contract', 'role root button', 'role root button', 'role x y', '```'),
      'widget.md',
    )
    expect(faults.map((fault) => fault.line)).toEqual([4, 5])
  })

  it('reports a claim made twice however it is spelled', () => {
    const { faults } = readContract(
      spec(
        '## A11y',
        '```contract',
        'attr item data-state="open" when open',
        'attr item data-state=open when open',
        '```',
      ),
      'widget.md',
    )
    expect(faults).toEqual([
      expect.objectContaining({ line: 4, message: expect.stringMatching(/stated twice/) }),
    ])
  })

  it('refuses two dismissals for one state', () => {
    const { faults } = readContract(
      spec(
        '## A11y',
        '```contract',
        'dismiss both',
        'dismiss none when forced',
        'dismiss escape',
        'dismiss outside when forced',
        '```',
      ),
      'widget.md',
    )
    expect(faults.map((fault) => [fault.line, fault.message])).toEqual([
      [5, expect.stringMatching(/second `dismiss` for the stateless case/)],
      [6, expect.stringMatching(/second `dismiss` for "forced"/)],
    ])
  })
})

describe('states', () => {
  const entries = ['plain', 'open md — the panel itself', 'open, guarding a destruction', 'opened']

  it('resolves a state to the entry it names, or to the one entry it opens', () => {
    expect(resolveState('plain', entries)).toBe('plain')
    expect(resolveState('open md', entries)).toBe('open md — the panel itself')
    expect(resolveState('open, guarding a destruction', entries)).toBe(
      'open, guarding a destruction',
    )
  })

  it('resolves no state that opens two entries, and says which', () => {
    expect(resolveState('open', entries)).toBeUndefined()
    expect(stateFaults([parseStatement('key Escape closes when open')], entries)).toEqual([
      {
        text: 'key Escape closes when open',
        message:
          '"open" names 2 entries of the states fixture ("open md — the panel itself", ' +
          '"open, guarding a destruction"); lengthen it to one',
      },
    ])
    expect(resolveState('opened', [...entries, 'opened up'])).toBe('opened')
  })

  it('matches at a word boundary only', () => {
    expect(resolveState('ope', entries)).toBeUndefined()
    expect(resolveState('closed', entries)).toBeUndefined()
  })

  it('fails the build with the file and the line of a state no entry has', () => {
    const markdown = spec(
      '## A11y',
      '',
      '```contract',
      'role root button',
      'key Enter opens when gone',
      '```',
    )
    expect(() => readBehaviour(markdown, 'design/components/x.md', entries)).toThrow(
      'design/components/x.md:5: "gone" names no entry of the states fixture',
    )
  })

  it('fails the build with the file and the line of a statement that does not parse', () => {
    const markdown = spec('## A11y', '', '```contract', 'role root buton', '```')
    expect(() => readBehaviour(markdown, 'design/components/x.md', entries)).toThrow(
      'design/components/x.md:4: "buton" is not a WAI-ARIA role',
    )
  })
})

describe('the spec a member’s contract lives in', () => {
  it('is the one its slug names, or the one whose title names it', () => {
    expect(specOfMember('Dialog', SPECS)).toBe('design/components/dialog.md')
    expect(specOfMember('SplitPane', SPECS)).toBe('design/components/split-pane.md')
    expect(specOfMember('RadioGroup', SPECS)).toBe('design/components/radio.md')
    expect(specOfMember('AppShell', SPECS)).toBe('design/archetypes/app-shell.md')
    expect(specOfMember('Nothing', SPECS)).toBeUndefined()
  })
})
