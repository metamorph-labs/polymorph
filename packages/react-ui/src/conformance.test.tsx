import { beforeAll, describe, expect, it, vi } from 'vitest'

import {
  conform,
  type BehaviourStatement,
  HANDLERS,
  PARTS,
  type ConformanceStatement,
  type ConformanceSubject,
  type MountAdapter,
} from '@polymorph/conformance'
import { TAB_PASSES_BUTTONS } from '@polymorph/conformance/engines'
import { harness } from '@polymorph/conformance/harness'
import { focusAfterRemovalLaw } from '@polymorph/conformance/focus-after-removal'
import { agentConformanceLaw, FALSE_STATEMENTS, isAgentText } from '@polymorph/conformance/law'
import { installTestTheme } from '@polymorph/engine/testing'
import { gallerySlug } from '@polymorph/react'
import { readAgent } from '@polymorph/registry/agent'
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

import { CONFORMANCE_LEDGER } from './conformance/ledger'
import { reactAdapter as adapter } from './conformance/react'
import { GALLERIES } from './galleries'

/** The React adapter, held to the runner's interface. */
const reactAdapter: MountAdapter = adapter

/**
 * The behaviour conformance law (`docs/conformance.md`).
 *
 * Every statement in every spec's contract fence holds against the React
 * shell, in a real browser, starting from the states fixture entry it names.
 * A statement the shell deliberately does not meet is in the ledger with its
 * reason, and the law runs it anyway: an entry that passes is stale and fails,
 * and so does one that fails for a reason other than the one it declares.
 *
 * The contracts are read from the specs here, through the same parser the
 * registry build uses, rather than from the generated registry, so an edited
 * spec is checked without regenerating anything.
 */

beforeAll(installTestTheme)

// The adapter renders outside testing-library's `act`, as a second
// framework's shell would. React's act-environment warnings are about tests
// that assert between an update and its commit, and the runner waits instead.
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
})

// The clipboard accepts every write, as it does on a page the reader has
// focused. A headless engine refuses writes from the test frame, and the
// subject is the member's behaviour, not the engine's permission policy
// (`copy-button.test.tsx` stubs it for the same reason).
beforeAll(() => {
  vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
})

const SPECS = import.meta.glob<string>('../../../design/{components,archetypes}/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})

interface Subject {
  member: string
  spec: string
  markdown: string
  contract: Contract[]
  /** The spec line of each statement, by index. */
  lines: number[]
  faults: ContractFault[]
  states: string[]
}

const SUBJECTS: Subject[] = GALLERIES.flatMap((gallery) => {
  const spec = specOfMember(gallery.component, SPECS)
  if (spec === undefined) return []
  const file = spec.replace(/^(\.\.\/)+/, '')
  const markdown = SPECS[spec] as string
  const { contract, lines, faults } = readContract(markdown, file)
  return [
    {
      member: gallery.component,
      spec: file,
      markdown,
      contract,
      lines,
      faults,
      states: gallery.entries.map((entry) => entry.name),
    },
  ]
})

const WITH_CONTRACTS = SUBJECTS.filter((subject) => subject.contract.length > 0)

/** The parts a statement names, so each can be checked against the locator table. */
function partsOf(statement: Contract): string[] {
  switch (statement.kind) {
    case 'role':
    case 'name':
    case 'attr':
      return [statement.part]
    case 'key':
      return statement.on ? [statement.on] : []
    case 'click':
      return [statement.on]
    case 'focus':
      return statement.moment === 'on-open'
        ? ['trigger', 'panel', statement.part]
        : ['trigger', 'panel']
    case 'dismiss':
      return ['panel']
    case 'announces':
      return []
  }
}

/** The lines of a spec's API section (`## API`, `## Anatomy & API`), each marked as in a fence or not. */
function apiSection(markdown: string): { line: string; fenced: boolean }[] {
  const lines = markdown.split('\n')
  const start = lines.findIndex((line) => /^##\s.*\bAPI\b/.test(line))
  if (start === -1) return []
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => /^##\s/.test(line))
  let fenced = false
  return (end === -1 ? rest : rest.slice(0, end)).flatMap((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced
      return []
    }
    return [{ line, fenced }]
  })
}

/**
 * Whether an API section declares a prop: in the first cell of a props table
 * row (`` `onClick` ``, `` `onChange(values)` ``, or one of the names a cell
 * joins with `/`), or as a member of a type in a fence (`onSubmit:`,
 * `onRowClick?:`).
 */
function declares(api: { line: string; fenced: boolean }[], prop: string): boolean {
  const cell = new RegExp(`^\\|[^|]*\`${prop}(?:\\([^\`]*\\))?\``)
  const member = new RegExp(`(?:^|[\\s{;,])${prop}\\??\\s*:`)
  return api.some(({ line, fenced }) => (fenced ? member.test(line) : cell.test(line)))
}

/** The statement as the runner takes it: its state resolved to a full entry name. */
function resolved(subject: Subject, statement: Contract): BehaviourStatement {
  if (statement.state === undefined) return statement
  return { ...statement, state: resolveState(statement.state, subject.states) as string }
}

function runnerSubject(subject: Subject): ConformanceSubject {
  return {
    member: subject.member,
    slug: gallerySlug(subject.member),
    states: subject.states,
    contract: subject.contract.map((statement) => resolved(subject, statement)),
    parts: PARTS[subject.member] ?? {},
    handlers: HANDLERS[subject.member] ?? [],
  }
}

describe('every contract is well formed', () => {
  it('reads the specs and finds contracts, so a pass is meaningful', () => {
    expect(Object.keys(SPECS).length).toBeGreaterThan(100)
    expect(WITH_CONTRACTS.length).toBeGreaterThan(0)
  })

  it('parses, with no line the grammar rejects', () => {
    const faults = SUBJECTS.flatMap((subject) =>
      subject.faults.map((fault) => `${fault.file}:${fault.line}: ${fault.message}`),
    )
    expect(faults).toEqual([])
  })

  it('names only states its fixture renders, each by words no other entry shares', () => {
    const faults = WITH_CONTRACTS.flatMap((subject) =>
      stateFaults(subject.contract, subject.states).map((fault) => {
        const line = subject.lines[subject.contract.findIndex((s) => s.text === fault.text)]
        return `${subject.spec}:${line ?? 0}: ${fault.message}`
      }),
    )
    expect(faults).toEqual([])
  })

  it('names only parts the locator table can find', () => {
    const missing = WITH_CONTRACTS.flatMap((subject) => {
      const parts = PARTS[subject.member] ?? {}
      return subject.contract.flatMap((statement) =>
        partsOf(statement)
          .filter((part) => part !== 'root' && !(part in parts))
          .map((part) => `${subject.member}: "${statement.text}" names "${part}"`),
      )
    })
    expect([...new Set(missing)]).toEqual([])
  })

  it('locates no part by the role or the attribute a statement claims for it', () => {
    // `attr dot aria-current=true` cannot be checked on an element found by
    // `[aria-current]`, nor `role panel menu` on one found by `[role="menu"]`:
    // the locator would make the statement true by construction.
    const circular = WITH_CONTRACTS.flatMap((subject) => {
      const parts = PARTS[subject.member] ?? {}
      return subject.contract.flatMap((statement) => {
        if (statement.kind !== 'role' && statement.kind !== 'attr') return []
        const selector = parts[statement.part]
        const claimed = statement.kind === 'role' ? 'role' : statement.attribute
        if (selector === undefined || !selector.toLowerCase().includes(`[${claimed}`)) return []
        return [`${subject.member}: "${statement.text}" — "${statement.part}" is ${selector}`]
      })
    })
    expect([...new Set(circular)]).toEqual([])
  })

  it('keeps a locator and a handler list only for a member with a contract', () => {
    const contracted = new Set(WITH_CONTRACTS.map((subject) => subject.member))
    // An agent fence names parts too: a state's evidence (`state expanded boolean as trigger
    // aria-expanded`), a secret state's field and the part an action presses (`action go id
    // presses item`). A member with no contract keeps the locators its agent fence names.
    const read = new Set(
      SUBJECTS.filter((subject) =>
        readAgent(subject.markdown, subject.spec).statements.some(
          (statement) =>
            (statement.kind === 'state' &&
              (statement.secret || (statement.evidence?.part ?? 'root') !== 'root')) ||
            (statement.kind === 'action' && statement.presses !== undefined),
        ),
      ).map((subject) => subject.member),
    )
    expect(
      Object.keys(PARTS).filter((member) => !contracted.has(member) && !read.has(member)),
    ).toEqual([])
    expect(Object.keys(HANDLERS).filter((member) => !contracted.has(member))).toEqual([])
  })

  it('spies only on handler props the member’s spec declares', () => {
    // Declared means a row of the API section's props table names it, or a
    // type in that section's fences has it as a member. A mention in prose
    // declares nothing.
    const undeclared = Object.entries(HANDLERS).flatMap(([member, handlers]) => {
      const subject = SUBJECTS.find((candidate) => candidate.member === member)
      const api = apiSection(subject?.markdown ?? '')
      return handlers
        .filter((handler) => !declares(api, handler))
        .map((handler) => `${member}: ${handler}`)
    })
    expect(undeclared).toEqual([])
  })

  it('keeps every ledger entry on a statement that exists, with a reason and its failure', () => {
    for (const entry of CONFORMANCE_LEDGER.filter(
      (divergence) => !isAgentText(divergence.statement),
    )) {
      const subject = WITH_CONTRACTS.find((candidate) => candidate.member === entry.member)
      expect(
        subject?.contract.map((statement) => statement.text),
        entry.member,
      ).toContain(entry.statement)
      expect(entry.reason.length, `${entry.member}: ${entry.statement}`).toBeGreaterThan(40)
      expect(entry.fails.trim(), `${entry.member}: ${entry.statement}`).not.toBe('')
    }
  })
})

describe('behaviour conformance — the React shell', () => {
  for (const subject of WITH_CONTRACTS) {
    describe(subject.member, () => {
      const target = runnerSubject(subject)
      for (const statement of target.contract) {
        const divergence = CONFORMANCE_LEDGER.find(
          (entry) => entry.member === subject.member && entry.statement === statement.text,
        )
        // A `key Tab` statement reads the engine's Tab setting where Tab passes over buttons.
        const tabs = statement.kind === 'key' && statement.key === 'Tab'
        it.skipIf(TAB_PASSES_BUTTONS && tabs)(statement.text, { timeout: 30_000 }, async () => {
          const outcome = await conform(target, statement, reactAdapter, harness)
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

describe('the runner detects a divergence', () => {
  /**
   * A law is trusted once it has been seen to fail. Each statement here is
   * false of the React shell, and the runner says so for the reason given:
   * one of every statement kind and every key and click effect, so no kind of
   * check can pass vacuously without this suite noticing. The generated
   * shells' law shows the same statements failing through their adapters.
   * The agent statements among them are run by `agentConformanceLaw`, below.
   */
  const FALSE = FALSE_STATEMENTS.filter(([, text]) => !isAgentText(text))

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
    const statements = FALSE.map(([, text]) => parseStatement(text))
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

  for (const [member, text, reason] of FALSE) {
    it(`fails ${member}: ${text}`, { timeout: 30_000 }, async () => {
      const subject = SUBJECTS.find((candidate) => candidate.member === member) as Subject
      const outcome = await conform(
        runnerSubject(subject),
        falsely(subject, text),
        reactAdapter,
        harness,
      )
      expect(outcome.pass ? 'holds' : outcome.reason).toMatch(reason)
    })
  }
})

/**
 * The agent conformance law (`docs/agents.md`): every statement of every
 * spec's agent fence holds against the React shell, with an agent bridge
 * installed, and the agent statements of `FALSE_STATEMENTS` fail through the
 * React adapter. The generated shells run the same law through
 * `conformanceLaw`.
 */
agentConformanceLaw({
  shell: 'React',
  adapter: reactAdapter,
  galleries: GALLERIES,
  ledger: CONFORMANCE_LEDGER,
  specs: SPECS,
})

/**
 * Where focus goes when an Alert, a Banner or an ArtifactPane that holds it
 * leaves the page (`@polymorph/conformance/focus-after-removal`). The
 * generated shells run the same law through `conformanceLaw`.
 */
focusAfterRemovalLaw('React', reactAdapter)

describe('the runner’s statements are the registry’s', () => {
  it('takes every statement the grammar can write', () => {
    // A compile-time pin: a statement kind or key effect the grammar gains is a
    // type error here until the runner can execute it.
    const pinned: readonly ConformanceStatement[] = WITH_CONTRACTS.flatMap(
      (subject) => subject.contract,
    )
    expect(pinned.length).toBeGreaterThan(0)
  })
})
