import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  AGENT_KEYWORDS,
  AGENT_SHAPE,
  AGENT_STATEMENT_KINDS,
  agentApiFaults,
  agentContractOf,
  agentStatements,
  ARGUMENT_TYPES,
  DESTRUCTIVE_NEVER,
  entryHandlers,
  WITHHOLDS_CONTENTS,
  EVIDENCE_KINDS,
  isFunctionType,
  literalValues,
  parseAgentStatement,
  readAgent,
  readAgentContract,
  resolveState,
  STATE_TYPES,
  STATE_TYPES_WITHOUT_EVIDENCE,
  stateFaults,
  typeBranches,
  type AgentContract,
  type AgentProp,
  type AgentState,
} from './agent'
import { validate } from './shape'

/**
 * The agent contract's grammar.
 *
 * Every spec's agent fence parses, and the grammar rejects what it does not
 * define with the rule that was broken and the line. Each fault the registry
 * build reports is shown on an inline sample, so a rule that stopped firing
 * would fail here before a spec relied on it. The conformance law runs the
 * statements against each renderer; this file checks that they mean one thing
 * before anything runs them.
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

/** The evidence of one `state` line. */
const evidenceOf = (line: string) => (parseAgentStatement(line) as AgentState).evidence

/** A spec whose `## Agent` section ends with a fence of these lines, starting on line 5. */
const fenced = (...lines: string[]) => spec('# Widget', '', '## Agent', '```agent', ...lines, '```')

const messages = (markdown: string) =>
  readAgent(markdown, 'widget.md').faults.map((fault) => [fault.line, fault.message])

const CHECKBOX_PROPS: AgentProp[] = [
  { name: 'checked', type: 'boolean | "indeterminate"' },
  { name: 'disabled', type: 'boolean' },
  { name: 'label', type: 'string' },
  { name: 'onCheckedChange', type: '((checked: CheckedState) => void) | undefined' },
  { name: 'items', type: '{ onClick: () => void; }[]' },
]

describe('every spec’s agent fence parses', () => {
  const read = Object.entries(SPECS).map(([file, markdown]) => readAgent(markdown, file))

  it('reads every spec, so a clean result is meaningful', () => {
    expect(read.length).toBeGreaterThan(100)
  })

  it('has no line the grammar rejects, in any spec', () => {
    const faults = read.flatMap((result) =>
      result.faults.map((fault) => `${fault.file}:${fault.line}: ${fault.message}`),
    )
    expect(faults).toEqual([])
  })

  it('gives a spec with no fence no contract, so agents cannot see its member', () => {
    for (const [file, markdown] of Object.entries(SPECS)) {
      if (markdown.includes('```agent')) continue
      expect(readAgent(markdown, file).agent, file).toBeNull()
    }
  })
})

describe('the grammar', () => {
  it('reads a state into its fields, with and without evidence, secret and a state', () => {
    expect(parseAgentStatement('state checked tristate as box aria-checked')).toEqual({
      kind: 'state',
      name: 'checked',
      type: 'tristate',
      secret: false,
      evidence: { part: 'box', reading: 'attribute', attribute: 'aria-checked', value: null },
      text: 'state checked tristate as box aria-checked',
    })
    expect(parseAgentStatement('state disabled boolean')).toEqual({
      kind: 'state',
      name: 'disabled',
      type: 'boolean',
      secret: false,
      text: 'state disabled boolean',
    })
    expect(parseAgentStatement('state value text secret when filled in')).toEqual({
      kind: 'state',
      name: 'value',
      type: 'text',
      secret: true,
      text: 'state value text secret when filled in',
      state: 'filled in',
    })
    expect(parseAgentStatement('state open boolean as panel data-state="open"')).toMatchObject({
      evidence: { part: 'panel', reading: 'attribute', attribute: 'data-state', value: 'open' },
    })
    expect(evidenceOf('state query text as field value')).toEqual({
      part: 'field',
      reading: 'value',
    })
    expect(evidenceOf('state title text as heading text')).toEqual({
      part: 'heading',
      reading: 'text',
    })
    expect(evidenceOf('state open boolean as panel present')).toEqual({
      part: 'panel',
      reading: 'present',
    })
  })

  it('reads every state type and every evidence form it defines', () => {
    for (const type of STATE_TYPES) {
      expect(parseAgentStatement(`state probe ${type}`)).toMatchObject({ type })
    }
    expect(EVIDENCE_KINDS).toEqual(['attribute', 'value', 'text', 'present'])
  })

  it('reads an action into its fields, with each optional part', () => {
    expect(parseAgentStatement('action check sets checked calls onCheckedChange')).toEqual({
      kind: 'action',
      name: 'check',
      sets: 'checked',
      calls: 'onCheckedChange',
      text: 'action check sets checked calls onCheckedChange',
    })
    expect(parseAgentStatement('action fill text sets value when empty')).toEqual({
      kind: 'action',
      name: 'fill',
      argument: 'text',
      sets: 'value',
      text: 'action fill text sets value when empty',
      state: 'empty',
    })
    expect(parseAgentStatement('action press calls onClick')).toEqual({
      kind: 'action',
      name: 'press',
      calls: 'onClick',
      text: 'action press calls onClick',
    })
    expect(parseAgentStatement('action go id presses item when drawer closed')).toEqual({
      kind: 'action',
      name: 'go',
      argument: 'id',
      presses: 'item',
      text: 'action go id presses item when drawer closed',
      state: 'drawer closed',
    })
    expect(parseAgentStatement('action choose id calls onSelect presses item')).toMatchObject({
      calls: 'onSelect',
      presses: 'item',
    })
    for (const argument of ARGUMENT_TYPES) {
      expect(parseAgentStatement(`action pick ${argument} calls onChange`)).toMatchObject({
        argument,
      })
    }
  })

  it('reads the list an id or ids action chooses among, before its other clauses', () => {
    expect(parseAgentStatement('action toggle id among series presses key when legend')).toEqual({
      kind: 'action',
      name: 'toggle',
      argument: 'id',
      among: 'series',
      presses: 'key',
      text: 'action toggle id among series presses key when legend',
      state: 'legend',
    })
    expect(
      parseAgentStatement('action pick ids among picked-rows sets chosen calls onChange'),
    ).toMatchObject({ argument: 'ids', among: 'picked-rows', sets: 'chosen', calls: 'onChange' })
    expect(parseAgentStatement('action choose id calls onSelect')).not.toHaveProperty('among')
  })

  it('reads every destructive statement', () => {
    expect(parseAgentStatement('destructive never')).toEqual({
      kind: 'destructive-never',
      text: 'destructive never',
    })
    expect(parseAgentStatement('destructive   never ').text).toBe(DESTRUCTIVE_NEVER)
    expect(parseAgentStatement('destructive when tone=danger')).toEqual({
      kind: 'destructive',
      prop: 'tone',
      value: 'danger',
      text: 'destructive when tone=danger',
    })
    expect(parseAgentStatement('destructive option when destructive="true"')).toEqual({
      kind: 'destructive-option',
      field: 'destructive',
      value: 'true',
      text: 'destructive option when destructive="true"',
    })
  })

  it('reads `withholds contents`, with and without a state', () => {
    expect(parseAgentStatement('withholds contents')).toEqual({
      kind: 'withholds-contents',
      text: WITHHOLDS_CONTENTS,
    })
    expect(parseAgentStatement('withholds  contents when open, guarding a destruction')).toEqual({
      kind: 'withholds-contents',
      text: 'withholds contents when open, guarding a destruction',
      state: 'open, guarding a destruction',
    })
  })

  it('takes the rest of the line as the state, because entry names are sentences', () => {
    expect(parseAgentStatement('action open sets open when closed, with a long title')).toEqual(
      expect.objectContaining({ state: 'closed, with a long title' }),
    )
  })

  it('collapses runs of spaces, so the ledger’s key does not depend on alignment', () => {
    expect(parseAgentStatement('  state   checked  boolean ').text).toBe('state checked boolean')
  })

  it('rejects each thing it does not define, naming the rule', () => {
    const rejects: [string, RegExp][] = [
      ['read checked boolean', /an agent statement must be one of state, action, destructive/],
      ['state Checked boolean', /a state name is lower-case words joined by `-`/],
      ['state selected_ids ids', /a state name is lower-case words joined by `-`/],
      ['state checked', /a state type must be one of boolean, tristate/],
      ['state checked bool', /a state type must be one of/],
      ['state value secret text', /a state type must be one of/],
      ['state checked boolean as box', /expected `state <name> <type> \[secret\]/],
      ['state checked boolean as Box aria-checked', /a part is a lower-case anatomy name/],
      ['state checked boolean as box checked', /evidence is an `aria-\*` or `data-\*` attribute/],
      ['state checked boolean as box role=checkbox', /evidence is an `aria-\*` or `data-\*`/],
      ['state checked boolean hidden', /expected `state <name> <type> \[secret\]/],
      ['state checked boolean when', /expected `state <name> <type> \[secret\]/],
      ['action Check calls onClick', /an action name is lower-case words joined by `-`/],
      ['action fill string sets value', /an argument type must be one of boolean, number/],
      ['action fill choices sets value', /an argument type must be one of/],
      ['action check sets', /the state an action sets is lower-case words/],
      ['action press calls', /an action calls a prop as a call site writes it/],
      ['action press calls on-click', /an action calls a prop as a call site writes it/],
      ['action check calls onClick sets checked', /expected `action <name> \[<type>\]/],
      ['action check sets checked sets open', /expected `action <name> \[<type>\]/],
      ['action go id presses', /the part an action presses is lower-case words/],
      ['action go id presses Item', /the part an action presses is lower-case words/],
      ['action go id presses item calls onSelect', /expected `action <name> \[<type>\]/],
      ['action toggle among series', /`among` names the list an `id` or `ids` argument/],
      ['action fill text among series', /and "fill" takes `text`/],
      ['action toggle id among', /the state an action chooses among is lower-case words/],
      ['action toggle id among Series', /the state an action chooses among is lower-case words/],
      ['action toggle id sets hidden among series', /expected `action <name> \[<type>\]/],
      ['action toggle id among series among items', /expected `action <name> \[<type>\]/],
      ['destructive tone=danger', /expected `destructive when <prop>=<value>`/],
      ['destructive when tone=danger when danger', /expected `destructive when <prop>=<value>`/],
      ['destructive when tone', /expected a prop and one value, `<name>=<value>`/],
      ['destructive when Tone=danger', /expected a prop and one value/],
      ['destructive when tone=', /expected a prop and one value/],
      ['destructive option tone=danger', /expected `destructive option when <field>=<value>`/],
      ['destructive option when destructive', /expected a choice field and one value/],
      ['destructive never when tone=danger', /expected `destructive never`/],
      ['destructive nothing', /or `destructive never`/],
      ['withholds', /expected `withholds contents \[when <state>\]`/],
      ['withholds everything', /expected `withholds contents \[when <state>\]`/],
      ['withholds contents of the panel', /expected `withholds contents \[when <state>\]`/],
    ]
    for (const [line, message] of rejects) {
      expect(() => parseAgentStatement(line), line).toThrow(message)
    }
  })

  it('rejects evidence on a state no part shows', () => {
    for (const type of STATE_TYPES_WITHOUT_EVIDENCE) {
      expect(() => parseAgentStatement(`state probe ${type} as list data-state`), type).toThrow(
        `no part shows a \`${type}\` state, so it takes no evidence`,
      )
    }
  })

  it('keeps its closed lists closed and free of repeats', () => {
    for (const list of [
      AGENT_KEYWORDS,
      AGENT_STATEMENT_KINDS,
      STATE_TYPES,
      ARGUMENT_TYPES,
      EVIDENCE_KINDS,
      STATE_TYPES_WITHOUT_EVIDENCE,
    ]) {
      expect(new Set(list).size).toBe(list.length)
    }
    for (const type of [...ARGUMENT_TYPES, ...STATE_TYPES_WITHOUT_EVIDENCE]) {
      expect(STATE_TYPES).toContain(type)
    }
  })
})

describe('fences', () => {
  const markdown = spec(
    '# Widget',
    '',
    '## API',
    '',
    '```ts',
    'state checked boolean',
    '```',
    '',
    '## Agent',
    '',
    'An agent reads whether the box is checked and sets it.',
    '',
    '```agent',
    'state checked tristate as box aria-checked',
    '',
    'state disabled boolean',
    'action check sets checked calls onCheckedChange',
    'action uncheck sets checked calls onCheckedChange',
    '```',
  )

  it('reads only agent fences, with the line of every statement', () => {
    const { agent, statements, lines, faults } = readAgent(markdown, 'widget.md')
    expect(faults).toEqual([])
    expect(statements.map((statement) => statement.text)).toEqual([
      'state checked tristate as box aria-checked',
      'state disabled boolean',
      'action check sets checked calls onCheckedChange',
      'action uncheck sets checked calls onCheckedChange',
    ])
    expect(lines).toEqual([14, 16, 17, 18])
    expect(agent?.states.map((state) => state.name)).toEqual(['checked', 'disabled'])
    expect(agent?.actions.map((action) => action.name)).toEqual(['check', 'uncheck'])
    expect(agent?.destructive).toEqual([])
    expect(agent?.destructiveOptions).toEqual([])
  })

  it('groups the statements by kind and lists them back', () => {
    const { agent, statements } = readAgent(markdown, 'widget.md')
    expect(agentContractOf(statements)).toEqual(agent)
    expect(agentStatements(agent as AgentContract)).toEqual(statements)
    const never = readAgent(
      fenced('state open boolean as panel present', 'action close sets open', 'destructive never'),
      'widget.md',
    )
    expect(never.agent?.destructiveNever).toBe(true)
    expect(agentStatements(never.agent as AgentContract)).toEqual(never.statements)
    // A fence may withhold with no action: a person answers what it holds.
    const withholds = readAgent(fenced('state title text', 'withholds contents'), 'widget.md')
    expect(withholds.faults).toEqual([])
    expect(withholds.agent?.withholdsContents).toBe(true)
    expect(agentStatements(withholds.agent as AgentContract)).toEqual(withholds.statements)
  })

  it('skips a longer fence whole, with the agent fence it shows', () => {
    const shown = spec(
      '## Agent',
      '````md',
      '```agent',
      'state never boolean',
      '```',
      '````',
      '',
      '~~~agent',
      'state disabled boolean',
      '~~~',
    )
    const { agent, faults } = readAgent(shown, 'widget.md')
    expect(faults).toEqual([])
    expect(agent?.states.map((state) => state.name)).toEqual(['disabled'])
  })

  it('gives an empty fence an empty contract, which still makes the member visible', () => {
    expect(readAgent(fenced(), 'widget.md').agent).toEqual({
      states: [],
      actions: [],
      destructive: [],
      destructiveOptions: [],
      destructiveNever: false,
      withholdsContents: false,
    })
  })

  it('reports a fence outside the `## Agent` section, with the line it opens on', () => {
    for (const heading of ['## A11y', '## Agent access', '## Behaviour — Agent']) {
      expect(messages(spec(heading, '', '```agent', 'state disabled boolean', '```'))).toEqual([
        [3, expect.stringContaining(`this one is under "${heading.slice(3)}"`)],
      ])
    }
    expect(messages(spec('```agent', 'state disabled boolean', '```'))).toEqual([
      [1, expect.stringContaining('this one is under "no heading"')],
    ])
  })

  it('reports every bad line, not only the first', () => {
    expect(
      messages(fenced('state disabled boolean', 'state x bool', 'action Y calls onClick')).map(
        ([line]) => line,
      ),
    ).toEqual([6, 7])
  })
})

/** One sample per fault the registry build reports, each with its rule and its line. */
describe('the faults the spec alone can judge', () => {
  it('reports a state declared twice, and an action declared twice', () => {
    expect(
      messages(
        fenced(
          'state checked boolean as box aria-checked',
          'state checked tristate',
          'action check sets checked',
          'action check calls onCheckedChange',
        ),
      ),
    ).toEqual([
      [6, 'the state "checked" is declared twice'],
      [8, 'the action "check" is declared twice'],
    ])
  })

  it('lets a state and an action share a name', () => {
    expect(
      messages(fenced('state open boolean as panel present', 'action open boolean sets open')),
    ).toEqual([])
  })

  it('reports a destructive statement made twice however it is quoted', () => {
    expect(
      messages(
        fenced(
          'action press calls onClick',
          'destructive when tone=danger',
          'destructive when tone="danger"',
          'destructive option when destructive=true',
          'destructive option when destructive="true"',
        ),
      ),
    ).toEqual([
      [7, '"destructive when tone="danger"" is stated twice'],
      [9, '"destructive option when destructive="true"" is stated twice'],
    ])
    expect(
      messages(fenced('action dismiss calls onDismiss', 'destructive never', 'destructive never')),
    ).toEqual([[7, '"destructive never" is stated twice']])
    expect(messages(fenced('withholds contents', 'withholds contents when open'))).toEqual([
      [6, '"withholds contents when open" is stated twice'],
    ])
  })

  it('reports `destructive never` beside a statement that says an action needs a person', () => {
    const both =
      /^"destructive never" says no action needs a person, and "destructive when tone=danger" says one does/
    expect(
      messages(
        fenced('action press calls onClick', 'destructive when tone=danger', 'destructive never'),
      ),
    ).toEqual([[7, expect.stringMatching(both)]])
    expect(
      messages(
        fenced(
          'action choose id calls onSelect',
          'destructive never',
          'destructive option when tone=danger',
        ),
      ),
    ).toEqual([
      [6, expect.stringContaining('and "destructive option when tone=danger" says one does')],
    ])
  })

  it('reports `sets` naming a state the fence does not declare', () => {
    expect(messages(fenced('action check sets checked calls onCheckedChange'))).toEqual([
      [5, '"check" sets "checked", which the fence declares no state for'],
    ])
  })

  it('reads a state declared after the action that sets it', () => {
    expect(
      messages(fenced('action check sets checked', 'state checked boolean as box aria-checked')),
    ).toEqual([])
  })

  it('reports `secret` on a state an action sets with evidence', () => {
    expect(
      messages(fenced('state value text secret as field value', 'action fill text sets value')),
    ).toEqual([
      [5, expect.stringMatching(/^"value" is secret and has evidence, and "fill" sets it/)],
    ])
  })

  it('allows a secret state with evidence that no action sets, and a secret one set by a call', () => {
    expect(messages(fenced('state value text secret as field value'))).toEqual([])
    expect(
      messages(fenced('state value text secret', 'action fill text sets value calls onChange')),
    ).toEqual([])
  })

  it('reports an action with nothing the law can check', () => {
    const nothing = /has nothing the law can check: it needs `sets` on a state with evidence/
    expect(messages(fenced('action open'))).toEqual([[5, expect.stringMatching(nothing)]])
    expect(messages(fenced('state open boolean', 'action open sets open'))).toEqual([
      [6, expect.stringMatching(nothing)],
    ])
    // A press on a part is something the law sees: the click reaches the part's element.
    expect(messages(fenced('state destinations choices', 'action go id presses item'))).toEqual([])
  })

  it('reports `among` naming a state the fence does not declare, or one that is not choices', () => {
    expect(
      messages(fenced('state series choices', 'action toggle id among items presses key')),
    ).toEqual([[6, '"toggle" chooses among "items", which the fence declares no state for']])
    expect(
      messages(fenced('state hidden ids', 'action toggle id among hidden presses key')),
    ).toEqual([
      [
        6,
        '"toggle" chooses among "hidden", whose type is `ids`; an action chooses among a `choices` state',
      ],
    ])
  })

  it('reports an id or ids action that names no list in a fence of more than one', () => {
    const lists = fenced(
      'state items choices',
      'state series choices',
      'action choose id calls onSelect',
      'action toggle id among series presses key',
      'action pick ids presses key',
    )
    expect(messages(lists)).toEqual([
      [
        7,
        '"choose" takes an id, and the fence declares 2 `choices` states (items, series), so it names the one it chooses among (`among <state>`)',
      ],
      [9, expect.stringMatching(/^"pick" takes ids, and the fence declares 2 `choices` states/)],
    ])
    // With one list, `among` may be written or left out; an action with no id never takes it.
    expect(
      messages(
        fenced(
          'state items choices',
          'state position number as root data-position',
          'action choose id calls onSelect',
          'action pick id among items presses key',
          'action read number sets position',
        ),
      ),
    ).toEqual([])
  })

  it('reports a `when` that names no fixture entry, or two', () => {
    const entries = ['unchecked', 'checked', 'checked and disabled']
    const { statements } = readAgent(
      fenced(
        'state checked boolean as box aria-checked when unchecked',
        'action check sets checked when gone',
        'action uncheck sets checked when checked and',
      ),
      'widget.md',
    )
    expect(stateFaults(statements, entries)).toEqual([
      {
        text: 'action check sets checked when gone',
        message: '"gone" names no entry of the states fixture',
      },
    ])
    expect(resolveState('checked', entries)).toBe('checked')
    expect(stateFaults(statements, ['checked and disabled', 'checked and invalid'])).toEqual([
      expect.objectContaining({ message: '"unchecked" names no entry of the states fixture' }),
      expect.objectContaining({ message: '"gone" names no entry of the states fixture' }),
      expect.objectContaining({
        message: expect.stringContaining('"checked and" names 2 entries of the states fixture'),
      }),
    ])
  })
})

describe('the faults the member’s API judges', () => {
  const contract = (...lines: string[]) =>
    readAgent(fenced(...lines), 'widget.md').agent as AgentContract

  it('reports `calls` naming a prop the API lacks, or one that is not a function', () => {
    expect(
      agentApiFaults(
        contract(
          'action check calls onCheckedChange',
          'action press calls onPress',
          'action pick calls items',
          'action name calls label',
        ),
        CHECKBOX_PROPS,
      ).map((fault) => fault.message),
    ).toEqual([
      '"press" calls "onPress", which is not a prop of the member',
      '"pick" calls "items", which is a `{ onClick: () => void; }[]`, not a function',
      '"name" calls "label", which is a `string`, not a function',
    ])
  })

  it('reports a `destructive when` whose prop or value the API does not declare', () => {
    const props: AgentProp[] = [
      { name: 'tone', type: '"accent" | "danger" | "neutral"' },
      { name: 'title', type: 'string' },
      { name: 'onClick', type: '(() => void) | undefined' },
    ]
    expect(
      agentApiFaults(
        contract(
          'action press calls onClick',
          'destructive when tone=danger',
          'destructive when tone=warning',
          'destructive when variant=danger',
          'destructive when title=delete',
        ),
        props,
      ).map((fault) => [fault.text, fault.message]),
    ).toEqual([
      [
        'destructive when tone=warning',
        '"tone" is a `"accent" | "danger" | "neutral"`, which does not declare "warning"',
      ],
      ['destructive when variant=danger', '"variant" is not a prop of the member'],
      ['destructive when title=delete', '"title" is a `string`, which does not declare "delete"'],
    ])
  })

  it('reports a member whose tone admits danger, with an action and no `destructive when tone=danger`', () => {
    const props: AgentProp[] = [
      { name: 'tone', type: '"accent" | "danger"' },
      { name: 'onClick', type: '(() => void) | undefined' },
    ]
    expect(agentApiFaults(contract('action press calls onClick'), props)).toEqual([
      {
        text: 'action press calls onClick',
        message: expect.stringContaining('so it declares `destructive when tone=danger`'),
      },
    ])
    expect(
      agentApiFaults(contract('action press calls onClick', 'destructive when tone=danger'), props),
    ).toEqual([])
    // A fence that declares no action has nothing to confirm.
    expect(agentApiFaults(contract('state disabled boolean'), props)).toEqual([])
    // A tone without danger asks for nothing.
    expect(
      agentApiFaults(contract('action press calls onClick'), [
        { name: 'tone', type: '"accent" | "neutral"' },
        { name: 'onClick', type: '() => void' },
      ]),
    ).toEqual([])
  })

  it('takes `destructive never` for a tone that colours only what the member says', () => {
    const props: AgentProp[] = [
      { name: 'tone', type: '"info" | "danger"' },
      { name: 'onDismiss', type: '(() => void) | undefined' },
    ]
    expect(
      agentApiFaults(contract('action dismiss calls onDismiss', 'destructive never'), props),
    ).toEqual([])
    // With no tone that admits danger, or no action, it says nothing the law can check.
    expect(
      agentApiFaults(contract('action dismiss calls onDismiss', 'destructive never'), [
        { name: 'tone', type: '"info" | "warning"' },
        { name: 'onDismiss', type: '() => void' },
      ]),
    ).toEqual([
      {
        text: 'destructive never',
        message: expect.stringContaining('answers a `tone` that admits `danger`'),
      },
    ])
    expect(agentApiFaults(contract('state open boolean', 'destructive never'), props)).toEqual([
      {
        text: 'destructive never',
        message: expect.stringContaining('the fence declares no action'),
      },
    ])
  })

  it('lets an action that takes an id call a handler the API declares on its entries', () => {
    const markdown = spec(
      '# Menu',
      '## API',
      '| Prop | Type |',
      '| `items` | `MenuEntry[]` |',
      '```ts',
      'type MenuEntry =',
      "  | { kind?: 'item'; label: string; onSelect: () => void }",
      "  | { kind: 'checkbox'; checked: boolean; onCheckedChange: (checked: boolean) => void }",
      '```',
      '## States',
      '```ts',
      'interface Other { onIgnored: () => void }',
      '```',
    )
    expect(entryHandlers(markdown)).toEqual(['onCheckedChange', 'onSelect'])
    const props: AgentProp[] = [{ name: 'items', type: 'MenuEntry[]' }]
    const handlers = entryHandlers(markdown)
    expect(agentApiFaults(contract('action choose id calls onSelect'), props, handlers)).toEqual([])
    // An action that takes no id names no entry, so the handler must be a prop.
    expect(
      agentApiFaults(contract('action run calls onSelect'), props, handlers).map((f) => f.message),
    ).toEqual(['"run" calls "onSelect", which is not a prop of the member'])
    // A handler declared outside the API section is not the API's.
    expect(
      agentApiFaults(contract('action choose id calls onIgnored'), props, handlers).map(
        (fault) => fault.message,
      ),
    ).toEqual([
      '"choose" calls "onIgnored", which is not a prop of the member, nor a function its API ' +
        'declares on the entries it chooses among',
    ])
  })

  it('reads a function in every form the registry prints one', () => {
    for (const type of [
      '() => void',
      '(() => void) | undefined',
      '((checked: CheckedState) => void) | undefined',
      '() => void | Promise<void>',
      'undefined | ((href: string) => void) | undefined',
      '((value: string) => void) | undefined | ((values: string[]) => void) | undefined',
      '(cb: (value: "a" | "b") => void) => void',
      '<T>(value: T) => void',
    ]) {
      expect(isFunctionType(type), type).toBe(true)
    }
    for (const type of [
      'string',
      'boolean | undefined',
      '{ retry: string; remove: (name: string) => string; } | undefined',
      'ReactElement<{ onClick?: ((event: MouseEvent) => void) | undefined; }, string> | undefined',
      '(() => void)[]',
      '"(" | ")"',
    ]) {
      expect(isFunctionType(type), type).toBe(false)
    }
  })

  it('reads the literal values a printed type declares', () => {
    expect(literalValues('"accent" | "danger" | "neutral"')).toEqual([
      'accent',
      'danger',
      'neutral',
    ])
    expect(literalValues('boolean | undefined')).toEqual(['true', 'false'])
    expect(literalValues('false | "auto" | 2')).toEqual(['false', 'auto', '2'])
    expect(literalValues('string')).toEqual([])
    expect(typeBranches('"a|b" | (x: 1 | 2) => void')).toEqual(['"a|b"', '(x: 1 | 2) => void'])
  })
})

describe('the registry build', () => {
  const entries = ['unchecked', 'checked']

  it('returns the contract of a lawful fence, and null for a spec with none', () => {
    const agent = readAgentContract(
      fenced(
        'state checked boolean as box aria-checked',
        'action check sets checked when unchecked',
      ),
      'design/components/widget.md',
      entries,
      CHECKBOX_PROPS,
    )
    expect(agent?.actions).toEqual([expect.objectContaining({ name: 'check', state: 'unchecked' })])
    expect(
      readAgentContract(spec('# Widget'), 'design/components/widget.md', entries, []),
    ).toBeNull()
  })

  it('fails with the file and the line of every fault, in line order', () => {
    const markdown = fenced(
      'state checked boolean as box aria-checked',
      'action check sets checked calls onCheck',
      'action uncheck sets checked when gone',
      'state checked bool',
    )
    expect(() =>
      readAgentContract(markdown, 'design/components/widget.md', entries, CHECKBOX_PROPS),
    ).toThrow(
      [
        'registry: the agent fence is not lawful:',
        '  design/components/widget.md:6: "check" calls "onCheck", which is not a prop of the member',
        '  design/components/widget.md:7: "gone" names no entry of the states fixture',
        '  design/components/widget.md:8: a state type must be one of boolean, tristate, number, ' +
          'text, id, ids, choices, list; got "bool"',
      ].join('\n'),
    )
  })

  it('publishes a contract the registry’s shape accepts, and refuses one it does not', () => {
    const { agent } = readAgent(
      fenced(
        'state checked tristate as box aria-checked',
        'state open boolean as panel data-state=open',
        'state value text secret',
        'state options choices',
        'action pick id sets options calls onValueChange when open',
        'destructive when tone=danger',
        'destructive option when destructive=true',
      ),
      'widget.md',
    )
    expect(validate(AGENT_SHAPE, agent)).toEqual([])
    expect(validate(AGENT_SHAPE, null)).toEqual([])
    expect(
      validate(AGENT_SHAPE, { ...agent, states: [{ ...agent?.states[0], name: 'Checked' }] }),
    ).toEqual([expect.stringContaining('$.states[0].name: "Checked" does not match')])
  })
})

describe('the browser can import it', () => {
  /** Value imports only, as `packages/spec/src/browser-surface.test.ts` reads them. */
  const imports = (file: string): string[] =>
    [
      ...readFileSync(file, 'utf8').matchAll(
        /(^|\n)\s*(import|export)\s+(type\s+)?([^'"]*?)from\s+['"]([^'"]+)['"]/g,
      ),
    ]
      .filter((match) => match[3] === undefined)
      .map((match) => match[5] as string)

  it('reaches no node-only module, through its own imports or theirs', () => {
    const seen = new Set<string>()
    const reached: string[] = []
    const walk = (file: string) => {
      if (seen.has(file)) return
      seen.add(file)
      for (const specifier of imports(file)) {
        if (specifier.startsWith('.')) walk(resolve(dirname(file), `${specifier}.ts`))
        else reached.push(specifier)
      }
    }
    walk(resolve(import.meta.dirname, 'agent.ts'))
    expect(seen.size).toBeGreaterThan(1)
    expect(reached).toEqual([])
  })
})
