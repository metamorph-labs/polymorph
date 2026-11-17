import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { readAgent, type AgentContract } from './agent'
import {
  agentStaleness,
  auditAgentStaleness,
  compareRegistration,
  declarationOf,
  readDescribedRegistrations,
  readReactRegistrations,
  type AgentCodeReading,
  type AgentRegistration,
  type AgentSubject,
} from './agent-staleness'

/**
 * The agent half of the spec-staleness law, over everything the vocabulary
 * ships, and on inline samples of both code shapes.
 *
 * Over the tree, every member whose spec has an agent fence registers what it
 * declares, in its React member and its description. The samples below show
 * the law failing in each direction, for each shape, and on each kind of
 * difference, so a member that registers wrongly is caught by readers that
 * are known to work.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const REPO = auditAgentStaleness(ROOT)

const REACT_FILE = 'packages/react-ui/src/controls/Checkbox.tsx'
const DESCRIPTION_FILE = 'packages/shells/src/members/checkbox.ts'
const SPEC_FILE = 'design/components/checkbox.md'

const source = (...lines: string[]) => lines.join('\n')

/** The React shape, as a member writes it, with its handle's lines in place of `…`. */
const react = (...handle: string[]) =>
  source(
    "import { useAgentMember } from '@polymorph/react'",
    '',
    'export function Checkbox(props: CheckboxProps) {',
    '  const [checked, setChecked] = useState(false)',
    '  useAgentMember({',
    "    member: 'Checkbox',",
    '    element: () => ref.current,',
    ...handle.map((line) => `    ${line}`),
    '  })',
    '  return null',
    '}',
  )

/** The description shape, with its `agent` block's lines in place of `…`. */
const description = (...agent: string[]) =>
  source(
    "import { describeMember } from '../dsl'",
    '',
    'export default describeMember({',
    "  member: 'Checkbox',",
    "  dir: 'controls',",
    '  agent: {',
    "    on: 'box',",
    ...agent.map((line) => `    ${line}`),
    '  },',
    '  template: [],',
    '})',
  )

const contract = (...lines: string[]) =>
  readAgent(['## Agent', '```agent', ...lines, '```'].join('\n'), SPEC_FILE).agent as AgentContract

const CHECKBOX = declarationOf(
  'Checkbox',
  SPEC_FILE,
  contract(
    'state checked tristate as box aria-checked',
    'state disabled boolean',
    'action check sets checked calls onCheckedChange',
    'action uncheck sets checked calls onCheckedChange',
  ),
)

const only = (reading: AgentCodeReading): AgentRegistration => {
  expect(reading.faults).toEqual([])
  expect(reading.registrations).toHaveLength(1)
  return reading.registrations[0] as AgentRegistration
}

const reactOf = (...handle: string[]) => only(readReactRegistrations(react(...handle), REACT_FILE))
const describedOf = (...agent: string[]) =>
  only(readDescribedRegistrations(description(...agent), DESCRIPTION_FILE))

describe('the law over the tree', () => {
  it('reads every React source and every description, so a pass is meaningful', () => {
    expect(REPO.read.react).toBeGreaterThan(100)
    expect(REPO.read.descriptions).toBeGreaterThan(100)
  })

  it('finds no state, action, secret or destructive the spec and the code disagree on', () => {
    expect(REPO.findings.map((finding) => finding.message)).toEqual([])
  })
})

describe('the React shape', () => {
  it('reads an arrow that returns an object literal, and the other keys', () => {
    expect(
      reactOf(
        "state: () => ({ checked: checked ? true : false, 'read-only': false, disabled: props.disabled }),",
        'actions: { check: () => setChecked(true), uncheck() { setChecked(false) } },',
        "secret: ['checked'] as const,",
        "destructive: () => props.tone === 'danger',",
      ),
    ).toEqual({
      member: 'Checkbox',
      shape: 'react',
      file: REACT_FILE,
      line: 5,
      states: ['checked', 'read-only', 'disabled'],
      actions: ['check', 'uncheck'],
      among: {},
      secret: ['checked'],
      destructive: true,
      withholds: false,
    })
  })

  it('reads a block with one return, ignoring the returns of functions inside it', () => {
    expect(
      reactOf(
        'state: () => {',
        '  const read = () => { return 1 }',
        '  return { checked, disabled: read() > 0 }',
        '},',
        'actions: {},',
      ).states,
    ).toEqual(['checked', 'disabled'])
    expect(reactOf('state() { return { checked } },').states).toEqual(['checked'])
  })

  it('follows a name to the constant in scope that holds the literal', () => {
    const text = source(
      'export function Checkbox() {',
      '  const state = () => ({ checked: true })',
      '  const actions = { check: () => {} }',
      "  const handle = { member: 'Checkbox', element: () => null, state, actions: actions }",
      '  useAgentMember(handle)',
      '}',
    )
    expect(only(readReactRegistrations(text, REACT_FILE))).toMatchObject({
      states: ['checked'],
      actions: ['check'],
      secret: [],
      destructive: false,
      line: 5,
    })
  })

  it('reads every call in a file, so two components that register are compared apart', () => {
    const text = source(
      "function Single() { useAgentMember({ member: 'Select', state: () => ({ value: 1 }) }) }",
      "function Multi() { useAgentMember({ member: 'Select', state: () => ({ values: 1 }) }) }",
      'function Other() { register({}) }',
    )
    expect(
      readReactRegistrations(text, 'Select.tsx').registrations.map(({ states, line }) => [
        states,
        line,
      ]),
    ).toEqual([
      [['value'], 1],
      [['values'], 2],
    ])
  })

  it('reports a handle it cannot read, naming the rule, instead of skipping it', () => {
    const faults = (text: string) =>
      readReactRegistrations(text, REACT_FILE).faults.map((fault) => [fault.member, fault.message])
    expect(faults(react('state: () => ({ ...base }),'))).toEqual([
      ['Checkbox', 'its `state` spreads another object, so the law cannot read its names'],
    ])
    expect(faults(react('actions: { [name]: () => {} },'))).toEqual([
      ['Checkbox', 'its `actions` has a computed key, so the law cannot read its names'],
    ])
    expect(faults(react('state: () => { if (a) return { a }; return { b } },'))).toEqual([
      ['Checkbox', expect.stringContaining('has 2 `return` statements')],
    ])
    expect(faults(react('state: readState,'))).toEqual([
      ['Checkbox', 'its `state` is not a function that returns an object literal'],
    ])
    expect(faults(react('secret: [name],'))).toEqual([
      ['Checkbox', 'its `secret` holds something other than a quoted name'],
    ])
    expect(faults(react("actions: { toggle: { argument: 'id', among: list, run } },"))).toEqual([
      ['Checkbox', 'its `actions` gives "toggle" an `among` that is not a quoted state name'],
    ])
    expect(faults('function A(handle) { useAgentMember(handle) }')).toEqual([
      [null, '`useAgentMember` takes an object literal here, so the law can read it'],
    ])
    expect(faults('useAgentMember({ member: name })')).toEqual([
      [null, expect.stringContaining('names no member as a quoted string')],
    ])
  })
})

describe('the description shape', () => {
  it('reads the `agent` block’s keys, quoted or not', () => {
    expect(
      describedOf(
        "state: { checked: 'api.checked', 'read-only': 'readOnly' },",
        "actions: { check: 'api.setChecked(true)', uncheck: 'api.setChecked(false)' },",
        "secret: ['checked'],",
        'destructive: "tone === \'danger\'",',
      ),
    ).toEqual({
      member: 'Checkbox',
      shape: 'description',
      file: DESCRIPTION_FILE,
      line: 6,
      states: ['checked', 'read-only'],
      actions: ['check', 'uncheck'],
      among: {},
      secret: ['checked'],
      destructive: true,
      withholds: false,
    })
  })

  it('names the member a description describes, with no `agent` block or with one', () => {
    const plain = readDescribedRegistrations(
      "export default describeMember({ member: 'Stack', dir: 'layout' })",
      'packages/shells/src/members/stack.ts',
    )
    expect(plain).toEqual({ registrations: [], faults: [], described: ['Stack'] })
    expect(readDescribedRegistrations(description(), DESCRIPTION_FILE).described).toEqual([
      'Checkbox',
    ])
  })

  it('reads a part’s `agent` block as its member’s registration', () => {
    // Toast renders nothing, and its viewport, a part, registers as `Toast`.
    const reading = readDescribedRegistrations(
      [
        'export default describeMember({',
        "  member: 'Toast',",
        "  dir: 'overlays',",
        '  template: [],',
        '  parts: [',
        "    { name: 'Card', public: false, template: [] },",
        '    {',
        "      name: 'Viewport',",
        '      public: true,',
        '      agent: {',
        "        on: 'region',",
        "        state: { notices: 'n' },",
        "        actions: { dismiss: { argument: 'id', run: 'd' } },",
        "        withholds: 'list',",
        '      },',
        '      template: [],',
        '    },',
        '  ],',
        '})',
      ].join('\n'),
      'packages/shells/src/members/toast.ts',
    )
    expect(reading).toEqual({
      described: ['Toast'],
      faults: [],
      registrations: [
        {
          member: 'Toast',
          shape: 'description',
          file: 'packages/shells/src/members/toast.ts',
          line: 10,
          states: ['notices'],
          actions: ['dismiss'],
          among: {},
          secret: [],
          destructive: false,
          withholds: true,
        },
      ],
    })
  })

  it('reports an `agent` block it cannot read', () => {
    expect(
      readDescribedRegistrations(description('state: { ...shared },'), DESCRIPTION_FILE).faults,
    ).toEqual([
      {
        member: 'Checkbox',
        shape: 'description',
        file: DESCRIPTION_FILE,
        line: 6,
        message: 'its `agent` `state` spreads another object, so the law cannot read its names',
      },
    ])
  })
})

/** Each difference, in each direction, in each shape: the React member's and the description's. */
describe('a registration that differs from its fence', () => {
  const lawful = {
    react: [
      'state: () => ({ checked, disabled: false }),',
      'actions: { check: () => {}, uncheck: () => {} },',
    ],
    description: [
      "state: { checked: 'api.checked', disabled: 'disabled' },",
      "actions: { check: 'api.setChecked(true)', uncheck: 'api.setChecked(false)' },",
    ],
  }
  const readers = {
    react: (lines: string[]) => reactOf(...lines),
    description: (lines: string[]) => describedOf(...lines),
  }
  const differences = (declared: typeof CHECKBOX, registration: AgentRegistration) =>
    compareRegistration(declared, registration).map((finding) => [
      finding.kind,
      finding.direction,
      finding.name,
    ])

  for (const shape of ['react', 'description'] as const) {
    describe(shape, () => {
      const read = readers[shape]
      const at = `${shape === 'react' ? REACT_FILE : DESCRIPTION_FILE}:${shape === 'react' ? 5 : 6}`

      it('matches a fence it registers exactly', () => {
        expect(compareRegistration(CHECKBOX, read(lawful[shape]))).toEqual([])
      })

      it('reports a state and an action registered and not declared, and the reverse', () => {
        const extra =
          shape === 'react'
            ? [
                'state: () => ({ checked, disabled: false, indeterminate: false }),',
                'actions: { check: () => {}, toggle: () => {} },',
              ]
            : [
                "state: { checked: 'c', disabled: 'd', indeterminate: 'i' },",
                "actions: { check: 'a', toggle: 'b' },",
              ]
        const findings = compareRegistration(CHECKBOX, read(extra))
        expect(findings.map((finding) => [finding.kind, finding.direction, finding.name])).toEqual([
          ['state', 'code-only', 'indeterminate'],
          ['action', 'code-only', 'toggle'],
          ['action', 'spec-only', 'uncheck'],
        ])
        expect(findings.map((finding) => finding.message)).toEqual([
          `Checkbox: ${at} registers the state "indeterminate", which ${SPEC_FILE} does not declare`,
          `Checkbox: ${at} registers the action "toggle", which ${SPEC_FILE} does not declare`,
          `Checkbox: ${SPEC_FILE} declares the action "uncheck", which ${at} does not register`,
        ])
        const fewer =
          shape === 'react'
            ? ['state: () => ({ checked }),', ...lawful.react.slice(1)]
            : ["state: { checked: 'c' },", ...lawful.description.slice(1)]
        expect(differences(CHECKBOX, read(fewer))).toEqual([['state', 'spec-only', 'disabled']])
      })

      it('reports a secret the spec marks and the code does not list, and the reverse', () => {
        const declared = { ...CHECKBOX, secret: ['checked'] }
        expect(differences(declared, read(lawful[shape]))).toEqual([
          ['secret', 'spec-only', 'checked'],
        ])
        expect(differences(declared, read([...lawful[shape], "secret: ['checked'],"]))).toEqual([])
        expect(differences(CHECKBOX, read([...lawful[shape], "secret: ['disabled'],"]))).toEqual([
          ['secret', 'code-only', 'disabled'],
        ])
      })

      it('reports a `destructive when` with no `destructive`, and the reverse', () => {
        const declared = { ...CHECKBOX, destructive: true }
        expect(compareRegistration(declared, read(lawful[shape]))).toEqual([
          expect.objectContaining({
            kind: 'destructive',
            direction: 'spec-only',
            message: `Checkbox: ${SPEC_FILE} declares \`destructive when\`, and ${at} gives no \`destructive\``,
          }),
        ])
        const destructive = shape === 'react' ? 'destructive: () => true,' : "destructive: 'true',"
        expect(compareRegistration(declared, read([...lawful[shape], destructive]))).toEqual([])
        expect(differences(CHECKBOX, read([...lawful[shape], destructive]))).toEqual([
          ['destructive', 'code-only', undefined],
        ])
      })

      it('reads `destructive never` as no `destructive` in the code', () => {
        const never = declarationOf(
          'Checkbox',
          SPEC_FILE,
          contract(
            'state checked tristate as box aria-checked',
            'state disabled boolean',
            'action check sets checked calls onCheckedChange',
            'action uncheck sets checked calls onCheckedChange',
            'destructive never',
          ),
        )
        expect(never.destructive).toBe(false)
        expect(compareRegistration(never, read(lawful[shape]))).toEqual([])
        const destructive = shape === 'react' ? 'destructive: () => true,' : "destructive: 'true',"
        expect(differences(never, read([...lawful[shape], destructive]))).toEqual([
          ['destructive', 'code-only', undefined],
        ])
      })

      it('reports an action whose `among` differs from the fence’s, in each direction', () => {
        const lists = declarationOf(
          'Checkbox',
          SPEC_FILE,
          contract(
            'state items choices',
            'state series choices',
            'action choose id among items calls onSelect',
            'action toggle id among series presses key',
          ),
        )
        const handle = (choose: string, toggle: string) =>
          shape === 'react'
            ? [
                'state: () => ({ items: [], series: [] }),',
                `actions: { choose: { argument: 'id',${choose} run: pick }, toggle: { argument: 'id',${toggle} run: (id) => press(id) } },`,
              ]
            : [
                "state: { items: '[]', series: '[]' },",
                `actions: { choose: { argument: 'id',${choose} run: 'pick(value)' }, toggle: { argument: 'id',${toggle} run: 'press(value)' } },`,
              ]
        expect(
          compareRegistration(lists, read(handle(" among: 'items',", " among: 'series',"))),
        ).toEqual([])
        const wrong = compareRegistration(lists, read(handle('', " among: 'items',")))
        expect(wrong.map((finding) => [finding.kind, finding.direction, finding.name])).toEqual([
          ['among', 'spec-only', 'choose'],
          ['among', undefined, 'toggle'],
        ])
        expect(wrong.map((finding) => finding.message)).toEqual([
          `Checkbox: ${SPEC_FILE} declares "choose" \`among items\`, and ${at} gives it no \`among\``,
          `Checkbox: ${SPEC_FILE} declares "toggle" \`among series\`, and ${at} gives it \`among: 'items'\``,
        ])
        // A fence of one list may leave `among` out, and the code then gives none either.
        const unlisted = declarationOf(
          'Checkbox',
          SPEC_FILE,
          contract(
            'state items choices',
            'state series ids',
            'action choose id calls onSelect',
            'action toggle id presses key',
          ),
        )
        expect(compareRegistration(unlisted, read(handle('', '')))).toEqual([])
        expect(differences(unlisted, read(handle(" among: 'items',", '')))).toEqual([
          ['among', 'code-only', 'choose'],
        ])
      })

      it('reports `withholds contents` with no `withholds`, and the reverse', () => {
        const declared = { ...CHECKBOX, withholds: true }
        expect(compareRegistration(declared, read(lawful[shape]))).toEqual([
          expect.objectContaining({
            kind: 'withholds',
            direction: 'spec-only',
            message: `Checkbox: ${SPEC_FILE} declares \`withholds contents\`, and ${at} gives no \`withholds\``,
          }),
        ])
        const withholds =
          shape === 'react' ? 'withholds: () => ref.current,' : "withholds: 'panel',"
        expect(compareRegistration(declared, read([...lawful[shape], withholds]))).toEqual([])
        expect(differences(CHECKBOX, read([...lawful[shape], withholds]))).toEqual([
          ['withholds', 'code-only', undefined],
        ])
      })
    })
  }
})

describe('a member that registers without a fence, or has one and registers nothing', () => {
  const members: AgentSubject[] = [
    { name: 'Checkbox', spec: SPEC_FILE, source: REACT_FILE, description: DESCRIPTION_FILE },
    {
      name: 'Icon',
      spec: 'design/components/icon.md',
      source: 'packages/react/src/icon/Icon.tsx',
      description: null,
    },
  ]
  const run = (declarations: (typeof CHECKBOX)[], readings: AgentCodeReading[]) =>
    agentStaleness({ members, declarations, readings }).map((finding) => [
      finding.kind,
      finding.shape,
      finding.message,
    ])
  const reactReading = readReactRegistrations(
    react('state: () => ({ checked, disabled: false }),', 'actions: { check() {}, uncheck() {} },'),
    REACT_FILE,
  )
  const describedReading = readDescribedRegistrations(
    description(
      "state: { checked: 'c', disabled: 'd' },",
      "actions: { check: 'a', uncheck: 'b' },",
    ),
    DESCRIPTION_FILE,
  )

  it('holds when both shapes register what the fence declares', () => {
    expect(run([CHECKBOX], [reactReading, describedReading])).toEqual([])
  })

  it('names the member, the file and what is missing when a shape registers nothing', () => {
    expect(run([CHECKBOX], [])).toEqual([
      [
        'unregistered',
        'react',
        `Checkbox: ${SPEC_FILE} has an agent fence, and ${REACT_FILE} registers no handle: no ` +
          "`useAgentMember({ member: 'Checkbox', … })` call",
      ],
      [
        'unregistered',
        'description',
        `Checkbox: ${SPEC_FILE} has an agent fence, and ${DESCRIPTION_FILE} has no \`agent\` ` +
          'block on its `describeMember({ … })`',
      ],
    ])
    expect(run([CHECKBOX], [reactReading])).toEqual([
      ['unregistered', 'description', expect.stringContaining(DESCRIPTION_FILE)],
    ])
    expect(run([CHECKBOX], [describedReading])).toEqual([
      ['unregistered', 'react', expect.stringContaining(REACT_FILE)],
    ])
  })

  it('asks only the React member of a member no description generates', () => {
    const icon = { ...CHECKBOX, member: 'Icon', spec: 'design/components/icon.md' }
    expect(run([icon], [])).toEqual([
      ['unregistered', 'react', expect.stringContaining('packages/react/src/icon/Icon.tsx')],
    ])
  })

  it('names the file and the line of a handle registered with no fence, in each shape', () => {
    expect(run([], [reactReading, describedReading])).toEqual([
      [
        'unspecified',
        'react',
        `Checkbox: ${REACT_FILE}:5 registers a handle, and ${SPEC_FILE} has no agent fence`,
      ],
      [
        'unspecified',
        'description',
        `Checkbox: ${DESCRIPTION_FILE}:6 registers a handle, and ${SPEC_FILE} has no agent fence`,
      ],
    ])
  })

  it('reports a handle registered for a name that is no member', () => {
    const stray = readReactRegistrations(
      "useAgentMember({ member: 'Chekbox', state: () => ({}) })",
      'packages/react-ui/src/controls/Stray.tsx',
    )
    expect(run([], [stray])).toEqual([
      [
        'not-a-member',
        'react',
        'Chekbox: packages/react-ui/src/controls/Stray.tsx:1 registers a handle for "Chekbox", ' +
          'which is not a member',
      ],
    ])
  })

  it('reports a handle it cannot read once, and not again as registering nothing', () => {
    const unreadable = readReactRegistrations(react('state: () => ({ ...base }),'), REACT_FILE)
    expect(run([CHECKBOX], [unreadable, describedReading])).toEqual([
      [
        'unreadable',
        'react',
        `Checkbox: ${REACT_FILE}:5: its \`state\` spreads another object, so the law cannot read its names`,
      ],
    ])
  })
})
