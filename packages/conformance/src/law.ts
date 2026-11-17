import { beforeAll, describe, expect, it, vi } from 'vitest'

import { gallerySlug } from '@polymorph/engine'
import { installTestTheme } from '@polymorph/engine/testing'
import {
  CLICK_EFFECTS,
  KEY_EFFECTS,
  parseStatement,
  readContract,
  resolveState,
  specOfMember,
  STATEMENT_KINDS,
  stateFaults,
  type Contract,
  type ContractFault,
} from '@polymorph/registry/behaviour'

import {
  AGENT_KEYWORDS,
  AGENT_STATEMENT_KINDS,
  parseAgentStatement,
  readAgent,
  type AgentContract,
  type AgentFault,
  type AgentStatement,
} from '@polymorph/registry/agent'

import {
  conformAgentMember,
  disabledEntry,
  type AgentConformanceContract,
  type AgentConformanceStatement,
} from './agent'
import { TAB_PASSES_BUTTONS } from './engines'
import { harness } from './harness'
import type { ConformanceDivergence } from './ledger'
import { CHOICE_PROBES, HANDLERS, PARTS, VALUE_PROBES, WINDOW_SIZES } from './parts'
import { conform, type BehaviourStatement, type ConformanceSubject, type MountAdapter } from './run'

/**
 * The behaviour conformance law for a generated shell (`docs/conformance.md`),
 * which each shell's `src/conformance.test.ts` calls with its own adapter,
 * galleries and ledger.
 *
 * Every statement in the contract fence of every member the shell ships holds
 * against the generated member, in a real browser, through the same runner,
 * locator table, handler list and harness as the React shell's law
 * (`packages/react-ui/src/conformance.test.tsx`), starting from the states
 * fixture entry of the same name. A statement the shell deliberately does not
 * meet is in its ledger with the reason; an entry that holds, or fails for
 * another reason, fails the law. Then each statement of `FALSE_STATEMENTS` is
 * shown to fail through the shell's adapter, for the reason given. The agent
 * fences are held the same way, by `agentConformanceLaw`, which this law
 * calls.
 */

/** A states fixture as the law reads it: the member and its entries' names. */
export interface GalleryLike {
  readonly component: string
  readonly entries: readonly { readonly name: string }[]
}

export interface ShellLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /** The shell's mount adapter. */
  readonly adapter: MountAdapter
  /** Every states fixture the shell ships (its `galleries.ts`). */
  readonly galleries: readonly GalleryLike[]
  /** The statements the shell deliberately does not meet. */
  readonly ledger: readonly ConformanceDivergence[]
  /**
   * The specs, by path, as the test file reads them with
   * `import.meta.glob('../../../design/{components,archetypes}/*.md', { query: '?raw', import: 'default', eager: true })`,
   * which Vite resolves relative to the file that calls it.
   */
  readonly specs: Readonly<Record<string, string>>
}

/**
 * Statements that are false of every shell, each with the words of the
 * runner's reason: one of every statement kind, both focus moments and every
 * key and click effect, so no check can pass vacuously through an adapter. An adapter
 * whose spied handlers never fired, or whose mount reached no member, would
 * pass the `nothing` statements and fail here. The React law shows the same
 * statements failing through the React adapter.
 */
export const FALSE_STATEMENTS: readonly (readonly [
  member: string,
  statement: string,
  reason: RegExp,
])[] = [
  ['Dialog', 'role panel menu when open md', /has the role dialog/],
  ['Dialog', 'name panel from description when open md', /is named "/],
  ['Dialog', 'attr panel aria-modal=false when open md', /has aria-modal="true"/],
  ['Dialog', 'announces live:assertive when open md', /nothing in the member matches/],
  ['Combobox', 'announces live:polite "Nothing at all" when loading', /no live:polite region/],
  ['Dialog', 'focus on-open close when with a form', /outside the part "close"/],
  ['DatePicker', 'focus on-close previous', /not to the previous/],
  ['Dialog', 'dismiss none', /Escape closes it; a press outside closes it/],
  ['Dialog', 'key Escape opens', /the panel did not open/],
  ['Dialog', 'key Tab closes when open md', /the panel did not close/],
  ['ProviderButton', 'key Enter activates on root when loading', /none of onClick ran/],
  ['Tabs', 'key ArrowDown moves-focus-next on tab', /focus went from/],
  ['Tabs', 'key ArrowDown moves-focus-previous on tab', /focus went from/],
  ['Tabs', 'key End moves-focus-first on tab', /focus went from/],
  ['Tabs', 'key Home moves-focus-last on tab', /focus went from/],
  ['Checkbox', 'key Enter selects on box when unchecked', /is not selected/],
  ['Textarea', 'key Escape clears on field', /the field still reads/],
  ['PromptInput', 'key Shift+Enter commits on field when with a prompt', /still holds/],
  ['Slider', 'key ArrowLeft increments on thumb when rest', /the value went from/],
  ['Slider', 'key ArrowRight decrements on thumb when rest', /the value went from/],
  ['Dialog', 'key Escape nothing when open md', /the key changed/],
  ['ProviderButton', 'key Enter nothing on root', /the key called onClick/],
  ['Table', 'click activates on row when basic', /took the click and nothing changed/],
  // One false statement of every agent kind, run by `agentConformanceLaw`.
  ['Checkbox', 'state checked number', /"checked" is not number/],
  ['Checkbox', 'state checked tristate as box data-state', /data-state="unchecked"/],
  ['Checkbox', 'action check sets disabled when unchecked', /left "disabled" at false/],
  ['Checkbox', 'action check calls onClick when unchecked', /onClick was not called/],
  // The fixture reports a notice's handlers, and a dismissal runs no action's `onClick`.
  ['Toast', 'action dismiss id calls onClick', /onClick was not called; onDismiss was/],
  [
    'Select',
    'action choose id presses trigger when open with a disabled option',
    /pressed no element of the part "trigger"/,
  ],
  // The chart's `choose` names a mark, so a fence that has it choose among the legend's series is false.
  [
    'LineChart',
    'action choose id among series calls onSelect when selectable',
    /the snapshot lists "choose" among items, and the fence gives it among series/,
  ],
  ['Button', 'destructive when variant=ghost', /does not mark "press" for a person to confirm/],
  ['Select', 'destructive option when tone=danger', /has no choice marked destructive/],
  ['Button', 'destructive never', /marks "press" for a person to confirm/],
  // A member is unlisted only while its part is gone: the trigger stays when the panel closes.
  [
    'Dialog',
    'state open boolean as trigger present',
    /the part "trigger" is in the document, and Dialog is not listed/,
  ],
  [
    'Dialog',
    'withholds contents',
    /the snapshot lists Button .*inside the region Dialog withholds/,
  ],
]

/** Whether a statement of `FALSE_STATEMENTS` is an agent fence's (`state`, `action`, `destructive`). */
export function isAgentText(text: string): boolean {
  return (AGENT_KEYWORDS as readonly string[]).includes(text.split(' ')[0] ?? '')
}

interface Subject {
  member: string
  spec: string
  contract: Contract[]
  lines: number[]
  faults: ContractFault[]
  states: string[]
}

/** Runs the conformance law for one shell. Call it once, at the top level of a test file. */
export function conformanceLaw({ shell, adapter, galleries, ledger, specs }: ShellLaw): void {
  beforeAll(installTestTheme)

  // The clipboard accepts every write, as the React law arranges, for the same reason.
  beforeAll(() => {
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
  })

  const subjects: Subject[] = galleries.flatMap((gallery) => {
    const spec = specOfMember(gallery.component, specs)
    if (spec === undefined) return []
    const file = spec.replace(/^(\.\.\/)+/, '')
    const { contract, lines, faults } = readContract(specs[spec] as string, file)
    return [
      {
        member: gallery.component,
        spec: file,
        contract,
        lines,
        faults,
        states: gallery.entries.map((entry) => entry.name),
      },
    ]
  })

  const withContracts = subjects.filter((subject) => subject.contract.length > 0)

  const resolved = (subject: Subject, statement: Contract): BehaviourStatement => {
    if (statement.state === undefined) return statement
    return { ...statement, state: resolveState(statement.state, subject.states) as string }
  }

  const runnerSubject = (subject: Subject): ConformanceSubject => ({
    member: subject.member,
    slug: gallerySlug(subject.member),
    states: subject.states,
    contract: subject.contract.map((statement) => resolved(subject, statement)),
    parts: PARTS[subject.member] ?? {},
    handlers: HANDLERS[subject.member] ?? [],
  })

  describe(`every contract the ${shell} shell is held to is well formed`, () => {
    it('reads the specs and finds the contracts of the members the shell ships', () => {
      expect(Object.keys(specs).length).toBeGreaterThan(100)
      expect(withContracts.length).toBeGreaterThan(0)
    })

    it('parses, with no line the grammar rejects', () => {
      const faults = subjects.flatMap((subject) =>
        subject.faults.map((fault) => `${fault.file}:${fault.line}: ${fault.message}`),
      )
      expect(faults).toEqual([])
    })

    it(`names only states the ${shell} fixture renders, each by words no other entry shares`, () => {
      const faults = withContracts.flatMap((subject) =>
        stateFaults(subject.contract, subject.states).map((fault) => {
          const line = subject.lines[subject.contract.findIndex((s) => s.text === fault.text)]
          return `${subject.spec}:${line ?? 0}: ${fault.message}`
        }),
      )
      expect(faults).toEqual([])
    })

    it('keeps every ledger entry on a statement that exists, with a reason and its failure', () => {
      for (const entry of ledger.filter((divergence) => !isAgentText(divergence.statement))) {
        const subject = withContracts.find((candidate) => candidate.member === entry.member)
        expect(
          subject?.contract.map((statement) => statement.text),
          entry.member,
        ).toContain(entry.statement)
        expect(entry.reason.length, `${entry.member}: ${entry.statement}`).toBeGreaterThan(40)
        expect(entry.fails.trim(), `${entry.member}: ${entry.statement}`).not.toBe('')
      }
    })
  })

  describe(`behaviour conformance — the ${shell} shell`, () => {
    for (const subject of withContracts) {
      describe(subject.member, () => {
        const target = runnerSubject(subject)
        for (const statement of target.contract) {
          const divergence = ledger.find(
            (entry) => entry.member === subject.member && entry.statement === statement.text,
          )
          // A `key Tab` statement reads the engine's Tab setting where Tab passes over buttons.
          const tabs = statement.kind === 'key' && statement.key === 'Tab'
          it.skipIf(TAB_PASSES_BUTTONS && tabs)(statement.text, { timeout: 30_000 }, async () => {
            const outcome = await conform(target, statement, adapter, harness)
            if (divergence) {
              expect(
                outcome.pass,
                `a ledger entry that now holds is stale: ${divergence.reason}`,
              ).toBe(false)
              // `dismiss` joins each wrong gesture with "; ", so an entry for one
              // gesture must not excuse another.
              expect(
                outcome.pass ? [] : outcome.reason.split('; '),
                'a ledger entry excuses the failure it declares, and no other',
              ).toEqual([expect.stringContaining(divergence.fails)])
              return
            }
            expect(outcome.pass ? 'holds' : `${subject.spec}: ${outcome.reason}`).toBe('holds')
          })
        }
      })
    }
  })

  describe(`the runner detects a divergence through the ${shell} adapter`, () => {
    const falsely = (subject: Subject, text: string) => {
      const { contract, faults } = readContract(
        ['## A11y', '```contract', text, '```'].join('\n'),
        'x',
      )
      expect(faults).toEqual([])
      const statement = contract[0] as Contract
      if (statement.state !== undefined) {
        expect(stateFaults([statement], subject.states), text).toEqual([])
      }
      return resolved(subject, statement)
    }

    it('is shown one false statement of every kind and every key and click effect', () => {
      const statements = BEHAVIOUR_FALSE.map(([, text]) => parseStatement(text))
      for (const kind of STATEMENT_KINDS) {
        expect(
          statements.some((statement) => statement.kind === kind),
          kind,
        ).toBe(true)
      }
      for (const moment of ['on-open', 'on-close'] as const) {
        expect(
          statements.some((statement) => statement.kind === 'focus' && statement.moment === moment),
          moment,
        ).toBe(true)
      }
      for (const effect of KEY_EFFECTS) {
        expect(
          statements.some((statement) => statement.kind === 'key' && statement.effect === effect),
          effect,
        ).toBe(true)
      }
      for (const effect of CLICK_EFFECTS) {
        expect(
          statements.some((statement) => statement.kind === 'click' && statement.effect === effect),
          `click ${effect}`,
        ).toBe(true)
      }
    })

    for (const [member, text, reason] of BEHAVIOUR_FALSE) {
      it(`fails ${member}: ${text}`, { timeout: 30_000 }, async () => {
        const subject = subjects.find((candidate) => candidate.member === member) as Subject
        expect(subject, `${member} has a ${shell} fixture`).toBeDefined()
        const outcome = await conform(
          runnerSubject(subject),
          falsely(subject, text),
          adapter,
          harness,
        )
        expect(outcome.pass ? 'holds' : outcome.reason).toMatch(reason)
      })
    }
  })

  agentConformanceLaw({ shell, adapter, galleries, ledger, specs })
}

/** The statements of `FALSE_STATEMENTS` a contract fence writes. */
const BEHAVIOUR_FALSE = FALSE_STATEMENTS.filter(([, text]) => !isAgentText(text))

/** The statements of `FALSE_STATEMENTS` an agent fence writes. */
const AGENT_FALSE = FALSE_STATEMENTS.filter(([, text]) => isAgentText(text))

interface AgentSubject {
  member: string
  spec: string
  agent: AgentContract
  statements: AgentStatement[]
  /** The spec line of each statement, by index. */
  lines: number[]
  faults: AgentFault[]
  states: string[]
}

/** The parts an agent statement reads: its evidence's, a secret state's field, or the part pressed. */
function agentParts(statement: AgentStatement): string[] {
  if (statement.kind === 'action') return statement.presses === undefined ? [] : [statement.presses]
  if (statement.kind !== 'state') return []
  if (statement.evidence !== undefined) return [statement.evidence.part]
  return statement.secret ? ['field'] : []
}

/**
 * The agent conformance law for one shell (`docs/agents.md`,
 * `docs/conformance.md`): every statement of every agent fence of every member
 * the shell ships holds against it, from a fresh mount of one of its fixture
 * entries with an agent bridge installed. Each member with a fence also
 * refuses an action its fence does not declare, with the fence's actions as
 * the allowed list, and on its disabled entry lists no action and refuses a
 * step. Then each agent statement of `FALSE_STATEMENTS` fails through the
 * shell's adapter, for the reason given.
 *
 * `conformanceLaw` calls it for a generated shell, and the React shell's law
 * calls it beside its own contract statements.
 */
export function agentConformanceLaw({ shell, adapter, galleries, ledger, specs }: ShellLaw): void {
  const subjects: AgentSubject[] = galleries.flatMap((gallery) => {
    const spec = specOfMember(gallery.component, specs)
    if (spec === undefined) return []
    const file = spec.replace(/^(\.\.\/)+/, '')
    const { agent, statements, lines, faults } = readAgent(specs[spec] as string, file)
    if (agent === null) return []
    return [
      {
        member: gallery.component,
        spec: file,
        agent,
        statements,
        lines,
        faults,
        states: gallery.entries.map((entry) => entry.name),
      },
    ]
  })

  /** The statement as the runner takes it: its state resolved to a full entry name. */
  function resolved(subject: AgentSubject, statement: AgentStatement): AgentConformanceStatement {
    if (
      statement.kind !== 'state' &&
      statement.kind !== 'action' &&
      statement.kind !== 'withholds-contents'
    )
      return statement
    if (statement.state === undefined) return statement
    return { ...statement, state: resolveState(statement.state, subject.states) as string }
  }

  function fenceOf(subject: AgentSubject): AgentConformanceContract {
    const { agent } = subject
    return {
      states: agent.states.map((state) => ({
        ...state,
        ...(state.state === undefined
          ? {}
          : { state: resolveState(state.state, subject.states) as string }),
      })),
      actions: agent.actions.map((action) => ({
        ...action,
        ...(action.state === undefined
          ? {}
          : { state: resolveState(action.state, subject.states) as string }),
      })),
      destructive: agent.destructive,
      destructiveOptions: agent.destructiveOptions,
      destructiveNever: agent.destructiveNever,
      withholdsContents: agent.withholdsContents,
      entries: [
        ...new Set(
          subject.statements.flatMap((statement) => {
            const named = 'state' in statement ? statement.state : undefined
            const entry = named === undefined ? undefined : resolveState(named, subject.states)
            return entry === undefined ? [] : [entry]
          }),
        ),
      ],
    }
  }

  const runnerSubject = (subject: AgentSubject): ConformanceSubject => {
    const probes = CHOICE_PROBES[subject.member]
    const valueProbe = VALUE_PROBES[subject.member]
    const windows = WINDOW_SIZES[subject.member]
    return {
      member: subject.member,
      slug: gallerySlug(subject.member),
      states: subject.states,
      contract: [],
      agent: fenceOf(subject),
      parts: PARTS[subject.member] ?? {},
      handlers: HANDLERS[subject.member] ?? [],
      ...(probes === undefined ? {} : { choiceProbes: probes }),
      ...(valueProbe === undefined ? {} : { valueProbe }),
      ...(windows === undefined ? {} : { windows }),
    }
  }

  describe(`every agent fence the ${shell} shell is held to is well formed`, () => {
    it('parses, with no line the grammar rejects', () => {
      const faults = subjects.flatMap((subject) =>
        subject.faults.map((fault) => `${fault.file}:${fault.line}: ${fault.message}`),
      )
      expect(faults).toEqual([])
    })

    it(`names only states the ${shell} fixture renders, each by words no other entry shares`, () => {
      const faults = subjects.flatMap((subject) =>
        stateFaults(subject.statements, subject.states).map((fault) => {
          const line = subject.lines[subject.statements.findIndex((s) => s.text === fault.text)]
          return `${subject.spec}:${line ?? 0}: ${fault.message}`
        }),
      )
      expect(faults).toEqual([])
    })

    it('names only parts the locator table can find, by nothing the statement claims', () => {
      // `state checked tristate as box aria-checked` cannot be checked on a box found by
      // `[aria-checked]`: the locator would make the evidence agree by construction.
      const faults = subjects.flatMap((subject) => {
        const parts = PARTS[subject.member] ?? {}
        return subject.statements.flatMap((statement) =>
          agentParts(statement).flatMap((part) => {
            if (part === 'root') return []
            const selector = parts[part]
            if (selector === undefined) {
              return [
                `${subject.member}: "${statement.text}" names "${part}", which has no locator`,
              ]
            }
            const evidence = statement.kind === 'state' ? statement.evidence : undefined
            if (
              evidence?.reading === 'attribute' &&
              selector.toLowerCase().includes(`[${evidence.attribute}`)
            ) {
              return [`${subject.member}: "${statement.text}" — "${part}" is ${selector}`]
            }
            return []
          }),
        )
      })
      expect([...new Set(faults)]).toEqual([])
    })

    it('keeps choice probes only for a member whose fence calls an entry’s handler', () => {
      const calling = new Set(
        subjects
          .filter((subject) =>
            subject.agent.actions.some(
              (action) =>
                action.calls !== undefined &&
                (action.argument === 'id' || action.argument === 'ids'),
            ),
          )
          .map((subject) => subject.member),
      )
      const shipped = new Set(galleries.map((gallery) => gallery.component))
      expect(
        Object.keys(CHOICE_PROBES).filter((member) => shipped.has(member) && !calling.has(member)),
      ).toEqual([])
    })

    it('keeps value probes only for a member whose fence has an action that takes text or a number', () => {
      const taking = new Set(
        subjects
          .filter((subject) =>
            subject.agent.actions.some(
              (action) => action.argument === 'text' || action.argument === 'number',
            ),
          )
          .map((subject) => subject.member),
      )
      const shipped = new Set(galleries.map((gallery) => gallery.component))
      expect(
        Object.keys(VALUE_PROBES).filter((member) => shipped.has(member) && !taking.has(member)),
      ).toEqual([])
    })

    it('mounts at another window size only an entry the fixture has and a statement names', () => {
      const faults = Object.entries(WINDOW_SIZES).flatMap(([member, entries]) => {
        if (specOfMember(member, specs) === undefined) {
          return [`WINDOW_SIZES names ${member}, which is no member`]
        }
        const gallery = galleries.find((candidate) => candidate.component === member)
        // A member the shell does not ship has no entry to mount here.
        if (gallery === undefined) return []
        const names = gallery.entries.map((entry) => entry.name)
        const subject = subjects.find((candidate) => candidate.member === member)
        return Object.keys(entries).flatMap((entry) => {
          if (!names.includes(entry)) {
            return [`WINDOW_SIZES names ${member}'s entry "${entry}", which its fixture lacks`]
          }
          const pinned = subject?.statements.some(
            (statement) =>
              'state' in statement &&
              statement.state !== undefined &&
              resolveState(statement.state, names) === entry,
          )
          return pinned === true
            ? []
            : [`WINDOW_SIZES names ${member}'s entry "${entry}", and no agent statement names it`]
        })
      })
      expect(faults).toEqual([])
    })

    it('keeps every agent ledger entry on a statement that exists, with a reason and its failure', () => {
      for (const entry of ledger.filter((divergence) => isAgentText(divergence.statement))) {
        const subject = subjects.find((candidate) => candidate.member === entry.member)
        expect(
          subject?.statements.map((statement) => statement.text),
          entry.member,
        ).toContain(entry.statement)
        expect(entry.reason.length, `${entry.member}: ${entry.statement}`).toBeGreaterThan(40)
        expect(entry.fails.trim(), `${entry.member}: ${entry.statement}`).not.toBe('')
      }
    })
  })

  describe(`agent conformance — the ${shell} shell`, () => {
    for (const subject of subjects) {
      describe(subject.member, () => {
        const target = runnerSubject(subject)
        // The spec's statements, in its order, each with its `when`.
        for (const statement of subject.statements) {
          const divergence = ledger.find(
            (entry) => entry.member === subject.member && entry.statement === statement.text,
          )
          it(statement.text, { timeout: 60_000 }, async () => {
            const outcome = await conform(target, resolved(subject, statement), adapter, harness)
            if (divergence) {
              expect(
                outcome.pass,
                `a ledger entry that now holds is stale: ${divergence.reason}`,
              ).toBe(false)
              expect(outcome.pass ? '' : outcome.reason).toContain(divergence.fails)
              return
            }
            expect(outcome.pass ? 'holds' : `${subject.spec}: ${outcome.reason}`).toBe('holds')
          })
        }

        it(
          'refuses an action its fence does not declare, with the fence’s actions as allowed',
          {
            timeout: 30_000,
          },
          async () => {
            const outcome = await conformAgentMember(target, 'undeclared', adapter, harness)
            expect(outcome.pass ? 'holds' : `${subject.spec}: ${outcome.reason}`).toBe('holds')
          },
        )

        const disabled = disabledEntry(subject.states)
        it.skipIf(disabled === undefined)(
          `lists no action on its disabled entry, and refuses a step there`,
          { timeout: 30_000 },
          async () => {
            const outcome = await conformAgentMember(target, 'disabled', adapter, harness)
            expect(outcome.pass ? 'holds' : `${subject.spec}: ${outcome.reason}`).toBe('holds')
          },
        )
      })
    }
  })

  describe(`the agent runner detects a divergence through the ${shell} adapter`, () => {
    it('is shown one false statement of every agent kind', () => {
      const kinds = new Set(AGENT_FALSE.map(([, text]) => parseAgentStatement(text).kind))
      expect([...AGENT_STATEMENT_KINDS].filter((kind) => !kinds.has(kind))).toEqual([])
    })

    for (const [member, text, reason] of AGENT_FALSE) {
      it(`fails ${member}: ${text}`, { timeout: 60_000 }, async () => {
        const subject = subjects.find((candidate) => candidate.member === member)
        expect(subject, `${member} has a ${shell} fixture and an agent fence`).toBeDefined()
        const statement = parseAgentStatement(text)
        if ('state' in statement && statement.state !== undefined) {
          expect(stateFaults([statement], (subject as AgentSubject).states), text).toEqual([])
        }
        const outcome = await conform(
          runnerSubject(subject as AgentSubject),
          resolved(subject as AgentSubject, statement),
          adapter,
          harness,
        )
        expect(outcome.pass ? 'holds' : outcome.reason).toMatch(reason)
      })
    }
  })
}
