import { fencesIn, stateFaults } from './behaviour'
import { arr, bool, nullable, obj, str, union, type Shape } from './shape'

/**
 * The agent contract: what an agent on a running page may read from a member
 * and do with it, as the last lines of the spec's `## Agent` section restate
 * it in a small fixed grammar.
 *
 * The section's prose says what an agent can do with the member and why
 * anything is withheld. An `agent` fence at the end of the section restates it
 * one statement per line, as the `contract` fence restates behaviour
 * (`behaviour.ts`). A member with no `agent` fence is not visible to agents:
 * the fence is the only thing that grants access.
 *
 * ```agent
 * state checked tristate as box aria-checked
 * state disabled boolean
 * action check sets checked calls onCheckedChange
 * action uncheck sets checked calls onCheckedChange
 * ```
 *
 * The statement kinds, the state types, the argument types and the evidence
 * forms are closed lists, so a typo is a parse error with the file and the
 * line, and the registry build fails on it. Part names come from the spec's
 * anatomy, located by the table the contract fence uses
 * (`packages/conformance/src/parts.ts`). State names in `when` name a states
 * fixture entry, resolved as the contract fence resolves them.
 *
 * This module reads no file, so the browser can import it
 * (`@polymorph/registry/agent`). The registry build reads the specs and checks
 * each fence against the member's API and states fixture (`readAgentContract`);
 * the conformance runner reads a spec it was handed (`readAgent`).
 */

/** The info string of an agent fence: ```` ```agent ````. */
export const AGENT_FENCE = 'agent'

/** The heading of the one section an agent fence may sit in: `## Agent`. */
export const AGENT_SECTION = 'Agent'

/** The words a statement opens with. `destructive option when` is a `destructive` line. */
export const AGENT_KEYWORDS = ['state', 'action', 'destructive', 'withholds'] as const

/**
 * What a parsed statement is. `destructive-option` is
 * `destructive option when <field>=<value>`, and `destructive-never` is
 * `destructive never`.
 */
export const AGENT_STATEMENT_KINDS = [
  'state',
  'action',
  'destructive',
  'destructive-option',
  'destructive-never',
  'withholds-contents',
] as const
export type AgentStatementKind = (typeof AGENT_STATEMENT_KINDS)[number]

/**
 * What a state holds. `tristate` is `true`, `false` or `mixed`; a `number`
 * and an `id` are `null` while the member holds none (an empty NumberInput,
 * a Select with nothing chosen); `choices` is a list of
 * `{ id, label, disabled?, destructive? }`; `list` is a list of JSON records,
 * read only. An action's `number` argument is never `null`: a field is
 * emptied with an action of its own (`clear`).
 */
export const STATE_TYPES = [
  'boolean',
  'tristate',
  'number',
  'text',
  'id',
  'ids',
  'choices',
  'list',
] as const
export type AgentStateType = (typeof STATE_TYPES)[number]

/** What an action takes, when it takes one argument. */
export const ARGUMENT_TYPES = ['boolean', 'number', 'text', 'id', 'ids'] as const
export type AgentArgumentType = (typeof ARGUMENT_TYPES)[number]

/**
 * How a part shows a state's value: an `aria-*` or `data-*` attribute
 * (`attribute`), optionally with the value it must equal; the part's value
 * property (`value`); its text content (`text`); or whether the part is in the
 * document (`present`).
 */
export const EVIDENCE_KINDS = ['attribute', 'value', 'text', 'present'] as const
export type AgentEvidenceKind = (typeof EVIDENCE_KINDS)[number]

/** The attribute an `attribute` evidence reads: `aria-checked`, `data-state`. */
export const EVIDENCE_ATTRIBUTE = /^(?:aria|data)-[a-z][a-z0-9-]*$/

/**
 * The state types no part shows in the document, so a state of one takes no
 * evidence: an id names a choice, and a list of choices or records is data.
 */
export const STATE_TYPES_WITHOUT_EVIDENCE: readonly AgentStateType[] = [
  'id',
  'ids',
  'choices',
  'list',
]

/* -------------------------------------------------------------------------- */
/* Statements                                                                 */
/* -------------------------------------------------------------------------- */

/** `as <part> <evidence>`: the part, and how it shows the value. */
export type AgentEvidence =
  | {
      part: string
      reading: 'attribute'
      attribute: string
      /** The value the attribute must hold for the state to read `true`, or `null` when its value is the reading. */
      value: string | null
    }
  | { part: string; reading: 'value' | 'text' | 'present' }

/** `state <name> <type> [secret] [as <part> <evidence>] [when <state>]`: an agent reads this value. */
export interface AgentState {
  kind: 'state'
  name: string
  type: AgentStateType
  /** Never returned to an agent: the runtime returns `{ secret: true }` in its place. */
  secret: boolean
  evidence?: AgentEvidence
  /** The line as the spec writes it, with runs of spaces collapsed. The ledger's key. */
  text: string
  /** The states fixture entry the law starts from, as `when <state>` names it. */
  state?: string
}

/**
 * `action <name> [<type>] [among <state>] [sets <state>] [calls <handler>] [presses <part>]
 * [when <state>]`: an agent may run this.
 */
export interface AgentAction {
  kind: 'action'
  name: string
  /** The type of the one argument the action takes, when it takes one. */
  argument?: AgentArgumentType
  /**
   * For an `id` or `ids` argument: the `choices` state of the fence whose choices the argument
   * names. Without it the argument names a choice of any `choices` state the member has.
   */
  among?: string
  /** The state the action changes. */
  sets?: string
  /** The prop, a function, the action calls. */
  calls?: string
  /**
   * The part the action presses with the element's own `click()`: for an action that takes an
   * id, the element of the part that is the choice it names.
   */
  presses?: string
  text: string
  state?: string
}

/** `destructive when <prop>=<value>`: on an instance with this prop value, a person confirms each action. */
export interface AgentDestructive {
  kind: 'destructive'
  prop: string
  value: string
  text: string
}

/** `destructive option when <field>=<value>`: an action whose argument names such a choice needs a person. */
export interface AgentDestructiveOption {
  kind: 'destructive-option'
  /** A field of a `choices` entry: `destructive`. */
  field: string
  value: string
  text: string
}

/**
 * `destructive never`: the member's `danger` tone colours what it says and not
 * what its actions do, so no action needs a person to confirm it.
 */
export interface AgentDestructiveNever {
  kind: 'destructive-never'
  text: string
}

/**
 * `withholds contents [when <state>]`: the registered members inside the
 * member's region (a panel, a card) are not an agent's. The bridge lists,
 * matches and runs none of them, and lists the member in their place.
 */
export interface AgentWithholdsContents {
  kind: 'withholds-contents'
  text: string
  /** The states fixture entry the law starts from, as `when <state>` names it. */
  state?: string
}

/** One statement of an agent fence. */
export type AgentStatement =
  | AgentState
  | AgentAction
  | AgentDestructive
  | AgentDestructiveOption
  | AgentDestructiveNever
  | AgentWithholdsContents

/** A member's agent contract: its fence's statements, by kind, in the order the spec writes them. */
export interface AgentContract {
  states: AgentState[]
  actions: AgentAction[]
  destructive: AgentDestructive[]
  destructiveOptions: AgentDestructiveOption[]
  /** Whether the fence says `destructive never`. */
  destructiveNever: boolean
  /** Whether the fence says `withholds contents`. */
  withholdsContents: boolean
}

/** The text of the `destructive never` statement, as `parseAgentStatement` writes it. */
export const DESTRUCTIVE_NEVER = 'destructive never'

/** The text of the `withholds contents` statement, without a `when`. */
export const WITHHOLDS_CONTENTS = 'withholds contents'

/* -------------------------------------------------------------------------- */
/* Parsing                                                                    */
/* -------------------------------------------------------------------------- */

/** A state or action name: lower-case words joined by `-`. */
const NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
/** An anatomy part, as the contract fence names one. */
const PART = /^[a-z][a-z0-9-]*$/
/** A prop or a choice field, as a call site writes it. */
const PROP = /^[a-z][A-Za-z0-9]*$/

const WHEN = ' when '

/** The words that open an action's clauses after its name, so none of them is read as its type. */
const ACTION_CLAUSES: readonly string[] = ['among', 'sets', 'calls', 'presses']

/** A statement that does not parse. The message names the rule it broke. */
export class AgentSyntaxError extends Error {}

function oneOf<T extends string>(value: string | undefined, list: readonly T[], what: string): T {
  if (value !== undefined && (list as readonly string[]).includes(value)) return value as T
  throw new AgentSyntaxError(`${what} must be one of ${list.join(', ')}; got "${value ?? ''}"`)
}

function named(value: string | undefined, what: string): string {
  if (value !== undefined && NAME.test(value)) return value
  throw new AgentSyntaxError(
    `${what} is lower-case words joined by \`-\`, such as \`checked\` or \`selected-ids\`; got "${value ?? ''}"`,
  )
}

function expected(shape: string, tokens: readonly string[]): AgentSyntaxError {
  return new AgentSyntaxError(`expected \`${shape}\`; got "${tokens.join(' ')}"`)
}

/** `aria-checked`, `data-state=open`, `data-state="open"`, `value`, `text` or `present`. */
function evidenceOf(part: string | undefined, token: string | undefined): AgentEvidence {
  if (part === undefined || !PART.test(part)) {
    throw new AgentSyntaxError(
      `a part is a lower-case anatomy name such as \`box\` or \`field\`; got "${part ?? ''}"`,
    )
  }
  if (token === 'value' || token === 'text' || token === 'present') return { part, reading: token }
  const match = /^([^=]+)(?:=(.*))?$/.exec(token ?? '')
  const attribute = match?.[1] ?? ''
  if (!EVIDENCE_ATTRIBUTE.test(attribute)) {
    throw new AgentSyntaxError(
      'evidence is an `aria-*` or `data-*` attribute (optionally `=<value>`), `value`, `text` ' +
        `or \`present\`; got "${token ?? ''}"`,
    )
  }
  const raw = match?.[2]
  return {
    part,
    reading: 'attribute',
    attribute,
    value: raw === undefined ? null : raw.replace(/^"(.*)"$/, '$1'),
  }
}

/** `tone=danger` or `tone="danger"`: a prop or field, and one value. */
function pairOf(token: string | undefined, what: string): { key: string; value: string } {
  const match = /^([^=]+)=(.+)$/.exec(token ?? '')
  const key = match?.[1] ?? ''
  const value = (match?.[2] ?? '').replace(/^"(.*)"$/, '$1')
  if (!PROP.test(key) || !/^[^\s"=]+$/.test(value)) {
    throw new AgentSyntaxError(
      `expected ${what} and one value, \`<name>=<value>\`; got "${token ?? ''}"`,
    )
  }
  return { key, value }
}

function stateStatement(
  tokens: readonly string[],
  text: string,
  when: { state?: string },
): AgentState {
  const shape = 'state <name> <type> [secret] [as <part> <evidence>] [when <state>]'
  const name = named(tokens[1], 'a state name')
  const type = oneOf(tokens[2], STATE_TYPES, 'a state type')
  let at = 3
  const secret = tokens[at] === 'secret'
  if (secret) at += 1
  let evidence: AgentEvidence | undefined
  if (tokens[at] === 'as') {
    if (tokens.length < at + 3) throw expected(shape, tokens)
    evidence = evidenceOf(tokens[at + 1], tokens[at + 2])
    at += 3
  }
  if (at !== tokens.length) throw expected(shape, tokens)
  if (evidence !== undefined && STATE_TYPES_WITHOUT_EVIDENCE.includes(type)) {
    throw new AgentSyntaxError(
      `no part shows a \`${type}\` state, so it takes no evidence (\`as <part> <evidence>\`)`,
    )
  }
  return { kind: 'state', name, type, secret, ...(evidence ? { evidence } : {}), text, ...when }
}

function actionStatement(
  tokens: readonly string[],
  text: string,
  when: { state?: string },
): AgentAction {
  const shape =
    'action <name> [<type>] [among <state>] [sets <state>] [calls <handler>] [presses <part>] ' +
    '[when <state>]'
  const name = named(tokens[1], 'an action name')
  let at = 2
  let argument: AgentArgumentType | undefined
  const next = tokens[at]
  if (next !== undefined && !ACTION_CLAUSES.includes(next)) {
    argument = oneOf(next, ARGUMENT_TYPES, 'an argument type')
    at += 1
  }
  let among: string | undefined
  if (tokens[at] === 'among') {
    if (argument !== 'id' && argument !== 'ids') {
      throw new AgentSyntaxError(
        '`among` names the list an `id` or `ids` argument chooses from, and ' +
          `"${name}" takes ${argument === undefined ? 'no argument' : `\`${argument}\``}`,
      )
    }
    among = named(tokens[at + 1], 'the state an action chooses among')
    at += 2
  }
  let sets: string | undefined
  if (tokens[at] === 'sets') {
    sets = named(tokens[at + 1], 'the state an action sets')
    at += 2
  }
  let calls: string | undefined
  if (tokens[at] === 'calls') {
    calls = tokens[at + 1]
    if (calls === undefined || !PROP.test(calls)) {
      throw new AgentSyntaxError(
        `an action calls a prop as a call site writes it, such as \`onCheckedChange\`; got "${calls ?? ''}"`,
      )
    }
    at += 2
  }
  let presses: string | undefined
  if (tokens[at] === 'presses') {
    presses = named(tokens[at + 1], 'the part an action presses')
    at += 2
  }
  if (at !== tokens.length) throw expected(shape, tokens)
  return {
    kind: 'action',
    name,
    ...(argument ? { argument } : {}),
    ...(among ? { among } : {}),
    ...(sets ? { sets } : {}),
    ...(calls ? { calls } : {}),
    ...(presses ? { presses } : {}),
    text,
    ...when,
  }
}

function destructiveStatement(
  tokens: readonly string[],
  text: string,
): AgentDestructive | AgentDestructiveOption | AgentDestructiveNever {
  if (tokens[1] === 'never') {
    if (tokens.length !== 2) throw expected(DESTRUCTIVE_NEVER, tokens)
    return { kind: 'destructive-never', text }
  }
  if (tokens[1] === 'option') {
    if (tokens.length !== 4 || tokens[2] !== 'when') {
      throw expected('destructive option when <field>=<value>', tokens)
    }
    const { key, value } = pairOf(tokens[3], 'a choice field')
    return { kind: 'destructive-option', field: key, value, text }
  }
  if (tokens.length !== 3 || tokens[1] !== 'when') {
    throw expected(
      'destructive when <prop>=<value>`, `destructive option when <field>=<value>` or ' +
        '`destructive never',
      tokens,
    )
  }
  const { key, value } = pairOf(tokens[2], 'a prop')
  return { kind: 'destructive', prop: key, value, text }
}

/**
 * Parses one statement. Throws `AgentSyntaxError` with the rule it broke.
 *
 * A `state`, `action` or `withholds` line may end with `when <state>`, which
 * takes the rest of the line, because entry names are sentences. A
 * `destructive` line's `when` is its own syntax, and it takes no state.
 */
export function parseAgentStatement(line: string): AgentStatement {
  const text = line.trim().replace(/\s+/g, ' ')
  const keyword = oneOf(text.split(' ')[0], AGENT_KEYWORDS, 'an agent statement')
  if (keyword === 'destructive') return destructiveStatement(text.split(' '), text)
  const at = text.indexOf(WHEN)
  const head = at === -1 ? text : text.slice(0, at)
  const when = at === -1 ? {} : { state: text.slice(at + WHEN.length) }
  const tokens = head.split(' ')
  if (keyword === 'withholds') {
    if (tokens.length !== 2 || tokens[1] !== 'contents') {
      throw expected('withholds contents [when <state>]', tokens)
    }
    return { kind: 'withholds-contents', text, ...when }
  }
  return keyword === 'state'
    ? stateStatement(tokens, text, when)
    : actionStatement(tokens, text, when)
}

/** A statement that broke a rule, with where it is. */
export interface AgentFault {
  file: string
  line: number
  message: string
}

/** A spec's agent fences, read. */
export interface AgentReading {
  /** The contract, or `null` for a spec with no agent fence: a member agents cannot see. */
  agent: AgentContract | null
  /** Every statement that parsed, in the order the spec writes them. */
  statements: AgentStatement[]
  /** The 1-based line of each statement, index for index. */
  lines: number[]
  faults: AgentFault[]
}

/** Why a statement repeats one before it, or `null`. A state and an action may share a name. */
function repeated(statement: AgentStatement, before: readonly AgentStatement[]): string | null {
  for (const earlier of before) {
    if (earlier.kind !== statement.kind) continue
    if (
      (statement.kind === 'state' || statement.kind === 'action') &&
      (earlier as AgentState | AgentAction).name === statement.name
    ) {
      return `the ${statement.kind} "${statement.name}" is declared twice`
    }
    if (
      (statement.kind === 'destructive' &&
        earlier.kind === 'destructive' &&
        earlier.prop === statement.prop &&
        earlier.value === statement.value) ||
      (statement.kind === 'destructive-option' &&
        earlier.kind === 'destructive-option' &&
        earlier.field === statement.field &&
        earlier.value === statement.value) ||
      statement.kind === 'destructive-never' ||
      statement.kind === 'withholds-contents'
    ) {
      return `"${statement.text}" is stated twice`
    }
  }
  return null
}

/**
 * The faults that need the whole fence: an action that chooses among a state
 * the fence does not declare, or one that is not `choices`; an action that
 * takes an id in a fence of more than one `choices` state and does not say
 * which it chooses among; an action that sets a state the fence does not
 * declare; an action the law has nothing to check of; a secret state whose
 * evidence an action's check would read; `destructive never` beside a
 * statement that says an action does need a person.
 */
function fenceFaults(
  statements: readonly AgentStatement[],
  lines: readonly number[],
  file: string,
): AgentFault[] {
  const states = new Map<string, AgentState>()
  for (const statement of statements) {
    if (statement.kind === 'state') states.set(statement.name, statement)
  }
  const lists = [...states.values()].filter((state) => state.type === 'choices')
  const faults: AgentFault[] = []
  statements.forEach((statement, index) => {
    const line = lines[index] ?? 0
    if (statement.kind === 'action' && statement.among !== undefined) {
      const list = states.get(statement.among)
      if (list === undefined || list.type !== 'choices') {
        faults.push({
          file,
          line,
          message:
            list === undefined
              ? `"${statement.name}" chooses among "${statement.among}", which the fence declares no state for`
              : `"${statement.name}" chooses among "${statement.among}", whose type is ` +
                `\`${list.type}\`; an action chooses among a \`choices\` state`,
        })
      }
    }
    if (
      statement.kind === 'action' &&
      statement.among === undefined &&
      (statement.argument === 'id' || statement.argument === 'ids') &&
      lists.length > 1
    ) {
      faults.push({
        file,
        line,
        message:
          `"${statement.name}" takes ${statement.argument === 'id' ? 'an id' : 'ids'}, and the ` +
          `fence declares ${lists.length} \`choices\` states (${lists.map((list) => list.name).join(', ')}), ` +
          'so it names the one it chooses among (`among <state>`)',
      })
    }
    if (statement.kind === 'action') {
      const target = statement.sets === undefined ? undefined : states.get(statement.sets)
      if (statement.sets !== undefined && target === undefined) {
        faults.push({
          file,
          line,
          message: `"${statement.name}" sets "${statement.sets}", which the fence declares no state for`,
        })
      } else if (
        statement.calls === undefined &&
        statement.presses === undefined &&
        target?.evidence === undefined
      ) {
        faults.push({
          file,
          line,
          message:
            `"${statement.name}" has nothing the law can check: it needs \`sets\` on a state with ` +
            'evidence (`as <part> <evidence>`), `calls <handler>` or `presses <part>`',
        })
      }
    }
    if (statement.kind === 'destructive-never') {
      const other = statements.find(
        (candidate) => candidate.kind === 'destructive' || candidate.kind === 'destructive-option',
      )
      if (other !== undefined) {
        faults.push({
          file,
          line,
          message:
            `"${DESTRUCTIVE_NEVER}" says no action needs a person, and "${other.text}" says one ` +
            'does; a fence says one of the two',
        })
      }
    }
    if (statement.kind === 'state' && statement.secret && statement.evidence !== undefined) {
      const setter = statements.find(
        (other): other is AgentAction => other.kind === 'action' && other.sets === statement.name,
      )
      if (setter !== undefined) {
        faults.push({
          file,
          line,
          message:
            `"${statement.name}" is secret and has evidence, and "${setter.name}" sets it, so ` +
            'the check of the action would read the value off the part; a secret state an action ' +
            'sets takes no evidence',
        })
      }
    }
  })
  return faults
}

/** The statements grouped into a contract, each kind in the order the spec writes it. */
export function agentContractOf(statements: readonly AgentStatement[]): AgentContract {
  return {
    states: statements.filter((statement): statement is AgentState => statement.kind === 'state'),
    actions: statements.filter(
      (statement): statement is AgentAction => statement.kind === 'action',
    ),
    destructive: statements.filter(
      (statement): statement is AgentDestructive => statement.kind === 'destructive',
    ),
    destructiveOptions: statements.filter(
      (statement): statement is AgentDestructiveOption => statement.kind === 'destructive-option',
    ),
    destructiveNever: statements.some((statement) => statement.kind === 'destructive-never'),
    withholdsContents: statements.some((statement) => statement.kind === 'withholds-contents'),
  }
}

/**
 * Every statement of a contract: states, then actions, then the destructive
 * statements, then `withholds contents`. The registry keeps whether the fence
 * withholds and not its `when`, so the law reads that from the spec.
 */
export function agentStatements(agent: AgentContract): AgentStatement[] {
  return [
    ...agent.states,
    ...agent.actions,
    ...agent.destructive,
    ...agent.destructiveOptions,
    ...(agent.destructiveNever
      ? [{ kind: 'destructive-never' as const, text: DESTRUCTIVE_NEVER }]
      : []),
    ...(agent.withholdsContents
      ? [{ kind: 'withholds-contents' as const, text: WITHHOLDS_CONTENTS }]
      : []),
  ]
}

/**
 * The prose of a spec's `## Agent` section: its lines outside any fence, joined
 * and trimmed. `null` when the spec has no such section. A section with no
 * `agent` fence is a decision that agents get nothing from the member, and its
 * prose is where the reason is written, so the coverage law reads it.
 */
export function agentSection(markdown: string): string | null {
  const prose: string[] = []
  let inside = false
  let found = false
  let fenced: string | null = null
  for (const line of markdown.split('\n')) {
    const run = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1]
    if (fenced !== null) {
      if (run !== undefined && run[0] === fenced[0] && run.length >= fenced.length) fenced = null
      continue
    }
    if (run !== undefined) {
      fenced = run
      continue
    }
    if (/^##\s/.test(line)) {
      inside = line.replace(/^##\s+/, '').trim() === AGENT_SECTION
      found ||= inside
      continue
    }
    if (inside) prose.push(line)
  }
  return found ? prose.join('\n').trim() : null
}

/**
 * Parses every agent fence in a spec and judges what the spec alone can judge.
 *
 * Returns the statements and every fault, so a spec with three bad lines
 * reports all three. A blank line is allowed. A fence outside the `## Agent`
 * section is a fault, because readers look for the fence beside the prose it
 * restates. A name declared twice is a fault; a state and an action may share
 * one (`state open`, `action open`). An action that sets a state the fence
 * does not declare, an action with nothing the law can check, and a secret
 * state whose evidence an action's check would read are faults. So are an
 * action that chooses among a state that is not one of the fence's `choices`
 * states, and an `id` or `ids` action that names none in a fence that has
 * more than one.
 *
 * Whether each `when` names one fixture entry (`stateFaults`) and whether each
 * prop the fence names is in the member's API (`agentApiFaults`) are judged by
 * the caller, which has the fixture and the API.
 */
export function readAgent(markdown: string, file: string): AgentReading {
  const fences = fencesIn(markdown, AGENT_FENCE)
  const statements: AgentStatement[] = []
  const lines: number[] = []
  const faults: AgentFault[] = []

  for (const fence of fences) {
    if (fence.section?.trim() !== AGENT_SECTION) {
      faults.push({
        file,
        line: fence.line - 1,
        message:
          `an agent fence sits at the end of the \`## ${AGENT_SECTION}\` section; ` +
          `this one is under "${fence.section ?? 'no heading'}"`,
      })
    }
    fence.lines.forEach((raw, index) => {
      if (raw.trim() === '') return
      const line = fence.line + index
      try {
        const statement = parseAgentStatement(raw)
        const twice = repeated(statement, statements)
        if (twice !== null) {
          faults.push({ file, line, message: twice })
          return
        }
        statements.push(statement)
        lines.push(line)
      } catch (error) {
        if (!(error instanceof AgentSyntaxError)) throw error
        faults.push({ file, line, message: error.message })
      }
    })
  }

  faults.push(...fenceFaults(statements, lines, file))
  faults.sort((a, b) => a.line - b.line)
  return {
    agent: fences.length === 0 ? null : agentContractOf(statements),
    statements,
    lines,
    faults,
  }
}

/* -------------------------------------------------------------------------- */
/* The member's API                                                           */
/* -------------------------------------------------------------------------- */

/** A prop as the registry prints it: its name and its type (`registry.json`). */
export interface AgentProp {
  readonly name: string
  readonly type: string
}

/** The index of the bracket that closes the one at `open`, or -1. `=>` is not a bracket. */
function closing(text: string, open: number): number {
  let depth = 0
  let quote: string | null = null
  for (let at = open; at < text.length; at += 1) {
    const char = text[at] as string
    if (quote !== null) {
      if (char === '\\') at += 1
      else if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'" || char === '`') quote = char
    else if (char === '=' && text[at + 1] === '>') at += 1
    else if ('([{<'.includes(char)) depth += 1
    else if (')]}>'.includes(char)) {
      depth -= 1
      if (depth === 0) return at
    }
  }
  return -1
}

/**
 * The branches of a printed type, split at each `|` outside brackets and
 * quotes: `((checked: boolean) => void) | undefined` is two.
 */
export function typeBranches(type: string): string[] {
  const branches: string[] = []
  let depth = 0
  let quote: string | null = null
  let start = 0
  for (let at = 0; at < type.length; at += 1) {
    const char = type[at] as string
    if (quote !== null) {
      if (char === '\\') at += 1
      else if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'" || char === '`') quote = char
    else if (char === '=' && type[at + 1] === '>') at += 1
    else if ('([{<'.includes(char)) depth += 1
    else if (')]}>'.includes(char)) depth -= 1
    else if (char === '|' && depth === 0) {
      branches.push(type.slice(start, at).trim())
      start = at + 1
    }
  }
  branches.push(type.slice(start).trim())
  return branches.filter((branch) => branch !== '')
}

/** Whether one branch of a printed type is a function: `(…) => …`, `<T>(…) => …`, in any parentheses. */
function isFunctionBranch(branch: string): boolean {
  let rest = branch.trim()
  while (rest.startsWith('(') && closing(rest, 0) === rest.length - 1)
    rest = rest.slice(1, -1).trim()
  if (rest.startsWith('<')) {
    const end = closing(rest, 0)
    if (end === -1) return false
    rest = rest.slice(end + 1).trim()
  }
  if (!rest.startsWith('(')) return false
  const end = closing(rest, 0)
  return (
    end !== -1 &&
    rest
      .slice(end + 1)
      .trim()
      .startsWith('=>')
  )
}

/**
 * Whether a prop's printed type is a function a call site passes, which is
 * what `calls <handler>` names: some branch of it is a function type.
 * `((checked: boolean) => void) | undefined` is; an object that holds a
 * function (`{ onClick: () => void }`) is not.
 */
export function isFunctionType(type: string): boolean {
  return typeBranches(type).some(isFunctionBranch)
}

/**
 * The literal values a printed type declares, as a `destructive when` writes
 * them: `"accent" | "danger"` declares `accent` and `danger`, `boolean`
 * declares `true` and `false`. An open type (`string`) declares none.
 */
export function literalValues(type: string): string[] {
  return typeBranches(type).flatMap((branch) => {
    if (branch === 'boolean') return ['true', 'false']
    if (branch === 'true' || branch === 'false') return [branch]
    if (/^"(?:[^"\\]|\\.)*"$/.test(branch)) return [JSON.parse(branch) as string]
    if (/^-?\d+(?:\.\d+)?$/.test(branch)) return [branch]
    return []
  })
}

/**
 * The handlers a spec's API declares on the entries a member takes: every
 * member of a type in a fence of its API section (`## API`, `## Anatomy & API`)
 * whose type is a function, such as `onSelect: () => void` on Menu's
 * `MenuEntry`. An action that takes the id of one of those entries may call
 * the entry's handler (`action choose id calls onSelect`).
 */
export function entryHandlers(markdown: string): string[] {
  const lines = markdown.split('\n')
  const start = lines.findIndex((line) => /^##\s.*\bAPI\b/.test(line))
  if (start === -1) return []
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => /^##\s/.test(line))
  const found = new Set<string>()
  let fenced = false
  for (const line of end === -1 ? rest : rest.slice(0, end)) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced
      continue
    }
    if (!fenced) continue
    for (const match of line.matchAll(/(?:^|[\s{;,|])([a-z][A-Za-z0-9]*)\??\s*:\s*\(/g)) {
      found.add(match[1] as string)
    }
  }
  return [...found].sort()
}

/**
 * Faults for every prop a fence names that the member's API does not declare
 * as the fence needs it: a `calls` whose prop is not a function, a
 * `destructive when` whose prop or value the API does not declare. An action
 * that takes an `id` or `ids` may instead call a handler the API declares on
 * the entries it chooses among (`handlers`, as `entryHandlers` reads them).
 *
 * A member whose `tone` admits `danger` and whose fence declares an action
 * says which kind of danger the tone is: `destructive when tone=danger`, when
 * a danger-toned instance is the one a person is asked to confirm, or
 * `destructive never`, when the tone colours what the member says and its
 * actions do nothing a person must confirm. `destructive never` on a member
 * with no such tone, or with no action, says nothing the law can check.
 */
export function agentApiFaults(
  agent: AgentContract,
  props: readonly AgentProp[],
  handlers: readonly string[] = [],
): { text: string; message: string }[] {
  const byName = new Map(props.map((prop) => [prop.name, prop]))
  const faults: { text: string; message: string }[] = []
  for (const action of agent.actions) {
    if (action.calls === undefined) continue
    const prop = byName.get(action.calls)
    const chooses = action.argument === 'id' || action.argument === 'ids'
    if (prop === undefined) {
      if (chooses && handlers.includes(action.calls)) continue
      faults.push({
        text: action.text,
        message: chooses
          ? `"${action.name}" calls "${action.calls}", which is not a prop of the member, nor a ` +
            'function its API declares on the entries it chooses among'
          : `"${action.name}" calls "${action.calls}", which is not a prop of the member`,
      })
    } else if (!isFunctionType(prop.type)) {
      faults.push({
        text: action.text,
        message: `"${action.name}" calls "${action.calls}", which is a \`${prop.type}\`, not a function`,
      })
    }
  }
  for (const destructive of agent.destructive) {
    const prop = byName.get(destructive.prop)
    if (prop === undefined) {
      faults.push({
        text: destructive.text,
        message: `"${destructive.prop}" is not a prop of the member`,
      })
    } else if (!literalValues(prop.type).includes(destructive.value)) {
      faults.push({
        text: destructive.text,
        message: `"${destructive.prop}" is a \`${prop.type}\`, which does not declare "${destructive.value}"`,
      })
    }
  }
  const tone = byName.get('tone')
  const danger = tone !== undefined && literalValues(tone.type).includes('danger')
  const [first] = agent.actions
  const confirms = agent.destructive.some(
    (destructive) => destructive.prop === 'tone' && destructive.value === 'danger',
  )
  if (danger && first && !confirms && !agent.destructiveNever) {
    faults.push({
      text: first.text,
      message:
        'the member’s `tone` admits `danger` and the fence declares an action, so it declares ' +
        '`destructive when tone=danger`, or `destructive never` when the tone colours only what ' +
        'the member says',
    })
  }
  if (agent.destructiveNever && !danger) {
    faults.push({
      text: DESTRUCTIVE_NEVER,
      message:
        '`destructive never` answers a `tone` that admits `danger`, and the member has none, so ' +
        'the law has nothing to check',
    })
  } else if (agent.destructiveNever && first === undefined) {
    faults.push({
      text: DESTRUCTIVE_NEVER,
      message:
        '`destructive never` says no action needs a person, and the fence declares no action',
    })
  }
  return faults
}

/**
 * A member's agent contract, as the registry build reads it: every statement
 * parses, every rule `readAgent` judges holds, every `when` names one entry of
 * the states fixture, and every prop the fence names is in the member's API,
 * or the build fails with the file and the line of each fault. `null` for a
 * spec with no agent fence.
 */
export function readAgentContract(
  markdown: string,
  file: string,
  entries: readonly string[],
  props: readonly AgentProp[],
): AgentContract | null {
  const { agent, statements, lines, faults } = readAgent(markdown, file)
  if (agent === null) return null
  const lineOf = (text: string) =>
    lines[statements.findIndex((statement) => statement.text === text)] ?? 0
  const judged = [
    ...stateFaults(statements, entries),
    ...agentApiFaults(agent, props, entryHandlers(markdown)),
  ].map((fault) => ({ file, line: lineOf(fault.text), message: fault.message }))
  const all = [...faults, ...judged].sort((a, b) => a.line - b.line)
  if (all.length > 0) {
    throw new Error(
      `registry: the agent fence is not lawful:\n  ${all
        .map((fault) => `${fault.file}:${fault.line}: ${fault.message}`)
        .join('\n  ')}`,
    )
  }
  return agent
}

export { resolveState, stateCandidates, stateFaults } from './behaviour'

/* -------------------------------------------------------------------------- */
/* The registry's shape                                                       */
/* -------------------------------------------------------------------------- */

const TEXT = str({ description: 'The statement as the spec writes it.' })
const STATE = str({ description: 'The states fixture entry the law starts from (`when <state>`).' })
const NAME_FIELD = str({
  description: 'Lower-case words joined by `-`.',
  pattern: NAME.source,
})
const PART_FIELD = str({ description: 'An anatomy part, located by the conformance runner.' })

const EVIDENCE_SHAPE: Shape = union(
  [
    obj({
      part: PART_FIELD,
      reading: str({ enum: ['attribute'] }),
      attribute: str({ description: 'An `aria-*` or `data-*` attribute.' }),
      value: nullable(
        str({ description: 'The value that reads `true`; `null` when the value is the reading.' }),
      ),
    }),
    obj({ part: PART_FIELD, reading: str({ enum: ['value', 'text', 'present'] }) }),
  ],
  { description: 'How the part shows the value (`as <part> <evidence>`).' },
)

/** A member's agent contract, as the registry publishes it, or `null` for a member agents cannot see. */
export const AGENT_SHAPE: Shape = nullable(
  obj(
    {
      states: arr(
        obj(
          {
            kind: str({ enum: ['state'] }),
            name: NAME_FIELD,
            type: str({ enum: STATE_TYPES }),
            secret: bool({ description: 'Never returned to an agent.' }),
            evidence: EVIDENCE_SHAPE,
            text: TEXT,
            state: STATE,
          },
          { optional: ['evidence', 'state'] },
        ),
        { description: 'What an agent reads.' },
      ),
      actions: arr(
        obj(
          {
            kind: str({ enum: ['action'] }),
            name: NAME_FIELD,
            argument: str({ enum: ARGUMENT_TYPES }),
            among: str({
              description:
                'The `choices` state whose choices an `id` or `ids` argument names (`among <state>`).',
              pattern: NAME.source,
            }),
            sets: NAME_FIELD,
            calls: str({ description: 'The prop, a function, the action calls.' }),
            presses: PART_FIELD,
            text: TEXT,
            state: STATE,
          },
          { optional: ['argument', 'among', 'sets', 'calls', 'presses', 'state'] },
        ),
        { description: 'What an agent may do.' },
      ),
      destructive: arr(
        obj({ kind: str({ enum: ['destructive'] }), prop: str(), value: str(), text: TEXT }),
        { description: 'An instance with this prop value needs a person to confirm each action.' },
      ),
      destructiveOptions: arr(
        obj({
          kind: str({ enum: ['destructive-option'] }),
          field: str(),
          value: str(),
          text: TEXT,
        }),
        {
          description:
            'An action whose argument names a choice with this field value needs a person to confirm.',
        },
      ),
      destructiveNever: bool({
        description:
          'The fence says `destructive never`: the member’s `danger` tone colours what it says, so no action needs a person.',
      }),
      withholdsContents: bool({
        description:
          'The fence says `withholds contents`: the registered members inside the member are not an agent’s, and the bridge lists the member in their place.',
      }),
    },
    {
      description:
        'What an agent on the page may read from the member and do with it, parsed from the ' +
        '```agent fence of the spec’s `## Agent` section. `null` for a member with no fence, which ' +
        'agents cannot see.',
    },
  ),
)
