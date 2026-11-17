import { memberSlug } from './exceptions'
import { arr, nullable, obj, str, union, type Shape } from './shape'

/**
 * The behaviour contract: the testable lines of a spec's A11y, Behaviour and
 * Keyboard sections, in a small fixed grammar.
 *
 * A spec says in prose what a member does: which keys do what, where focus
 * lands, how an overlay dismisses, what is announced. The prose stays. Below
 * it, a fenced block marked `contract` restates the testable part one
 * statement per line, and the conformance law
 * (`packages/react-ui/src/conformance.test.tsx`) runs every line against the
 * React shell. The same lines run against any other framework's shell through
 * a mount adapter, so two behaviour layers cannot drift apart unnoticed.
 *
 * ```contract
 * role panel dialog when open
 * key Escape closes when open
 * focus on-close trigger
 * ```
 *
 * The grammar is data. The statement kinds, the keys, the key and click
 * effects, the dismissal and announcement channels and the ARIA roles are
 * closed lists, so a typo is a parse error with the file and the line, and the
 * registry build fails on it. Part names come from the spec's anatomy and state names from its
 * states fixture; the registry checks every state against the fixture, and
 * the law checks every part against its locator table.
 *
 * This module reads no file, so the browser can import it
 * (`@polymorph/registry/behaviour`). The registry build reads the specs
 * (`vocabulary.ts`), and the law reads them through Vite.
 */

/** The info string of a contract fence: ```` ```contract ````. */
export const CONTRACT_FENCE = 'contract'

/** The spec sections a contract fence may sit in. */
export const CONTRACT_SECTION = /\b(?:A11y|Behaviou?r|Keyboard)\b/

export const STATEMENT_KINDS = [
  'role',
  'name',
  'key',
  'click',
  'focus',
  'dismiss',
  'announces',
  'attr',
] as const
export type StatementKind = (typeof STATEMENT_KINDS)[number]

/**
 * What a key does. `increments` and `decrements` are the value controls'
 * effects (a slider, a number field, a date segment, a splitter), which move a
 * value rather than focus or a selection.
 */
export const KEY_EFFECTS = [
  'opens',
  'closes',
  'activates',
  'moves-focus-next',
  'moves-focus-previous',
  'moves-focus-first',
  'moves-focus-last',
  'selects',
  'clears',
  'commits',
  'increments',
  'decrements',
  'nothing',
] as const
export type KeyEffect = (typeof KEY_EFFECTS)[number]

/**
 * What a pointer click on a part does. `activates` is the one effect: a click
 * always reaches the element it presses, so the claim is that the member's
 * handler runs or the part's state changes.
 */
export const CLICK_EFFECTS = ['activates'] as const
export type ClickEffect = (typeof CLICK_EFFECTS)[number]

/** Key names as `KeyboardEvent.key` spells them, except `Space` for `' '`. */
export const KEYS = [
  'Enter',
  'Space',
  'Escape',
  'Tab',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Backspace',
  'Delete',
  'F8',
  'F10',
] as const

/** Written before the key and joined with `+`: `Shift+Enter`, `Shift+F10`. */
export const MODIFIERS = ['Shift', 'Control', 'Alt', 'Meta'] as const

export const FOCUS_MOMENTS = ['on-open', 'on-close'] as const

/** Where focus goes when an overlay closes: its trigger, or wherever it was before. */
export const FOCUS_RETURNS = ['trigger', 'previous'] as const
export type FocusReturn = (typeof FOCUS_RETURNS)[number]

/** Which gestures close an overlay: a press outside it, Escape, both, or neither. */
export const DISMISSALS = ['outside', 'escape', 'both', 'none'] as const
export type Dismissal = (typeof DISMISSALS)[number]

/** `aria-busy`, a polite live region (`role="status"` included), an assertive one. */
export const ANNOUNCEMENTS = ['busy', 'live:polite', 'live:assertive'] as const
export type Announcement = (typeof ANNOUNCEMENTS)[number]

/** The WAI-ARIA 1.2 roles, so `role panel dailog` is a parse error and not a failing test. */
export const ARIA_ROLES = [
  'alert',
  'alertdialog',
  'application',
  'article',
  'banner',
  'blockquote',
  'button',
  'caption',
  'cell',
  'checkbox',
  'code',
  'columnheader',
  'combobox',
  'complementary',
  'contentinfo',
  'definition',
  'deletion',
  'dialog',
  'document',
  'emphasis',
  'feed',
  'figure',
  'form',
  'generic',
  'grid',
  'gridcell',
  'group',
  'heading',
  'img',
  'insertion',
  'link',
  'list',
  'listbox',
  'listitem',
  'log',
  'main',
  'marquee',
  'math',
  'menu',
  'menubar',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'meter',
  'navigation',
  'none',
  'note',
  'option',
  'paragraph',
  'presentation',
  'progressbar',
  'radio',
  'radiogroup',
  'region',
  'row',
  'rowgroup',
  'rowheader',
  'scrollbar',
  'search',
  'searchbox',
  'separator',
  'slider',
  'spinbutton',
  'status',
  'strong',
  'subscript',
  'superscript',
  'switch',
  'tab',
  'table',
  'tablist',
  'tabpanel',
  'term',
  'textbox',
  'time',
  'timer',
  'toolbar',
  'tooltip',
  'tree',
  'treegrid',
  'treeitem',
] as const

/* -------------------------------------------------------------------------- */
/* Statements                                                                 */
/* -------------------------------------------------------------------------- */

interface Statement {
  /** The line as the spec writes it, with runs of spaces collapsed. The ledger's key. */
  text: string
  /**
   * The states fixture entry the statement starts from, as `when <state>` names
   * it. Absent means the runner picks the first entry that renders the parts
   * the statement needs.
   */
  state?: string
}

/** `role <part> <role>`: the part has that ARIA role, explicit or native. */
export interface RoleContract extends Statement {
  kind: 'role'
  part: string
  role: string
}

/** `name <part> from <prop|children>`: the accessible name comes from that prop, or from content. */
export interface NameContract extends Statement {
  kind: 'name'
  part: string
  from: string
}

/** `key <Key> <effect> [on <part>]`: pressing the key, with focus on the part, has the effect. */
export interface KeyContract extends Statement {
  kind: 'key'
  key: string
  effect: KeyEffect
  on?: string
}

/** `click <effect> on <part>`: a pointer click on the part has the effect. */
export interface ClickContract extends Statement {
  kind: 'click'
  effect: ClickEffect
  on: string
}

/** `focus on-open <part>`: opening the member puts focus in the part. */
export interface FocusOpenContract extends Statement {
  kind: 'focus'
  moment: 'on-open'
  part: string
}

/** `focus on-close <trigger|previous>`: closing it puts focus back there. */
export interface FocusCloseContract extends Statement {
  kind: 'focus'
  moment: 'on-close'
  target: FocusReturn
}

/** `dismiss <outside|escape|both|none>`: exactly these gestures close it. */
export interface DismissContract extends Statement {
  kind: 'dismiss'
  by: Dismissal
}

/**
 * `announces <channel> ["<message>"] when <state>`: in that state, the member
 * carries that channel, and with a message, a region of it says those words.
 * The bare form is for a region that must exist before its first message; a
 * member whose region is always there states the message.
 */
export interface AnnouncesContract extends Statement {
  kind: 'announces'
  channel: Announcement
  /** Words the region holds in the state, compared as a substring. */
  says?: string
  state: string
}

/**
 * `attr <part> <attribute>[=<value>] when <state>`: in that state, the part
 * carries the attribute. A `data-*` or `aria-*` attribute, `tabindex`
 * (whether a part is a tab stop is behaviour), or `autocorrect`,
 * `autocapitalize` or `spellcheck` (whether a field changes what is typed is
 * behaviour); without a value, presence is the claim.
 */
export interface AttrContract extends Statement {
  kind: 'attr'
  part: string
  attribute: string
  value: string | null
  state: string
}

/** One statement of a member's behaviour contract. */
export type Contract =
  | RoleContract
  | NameContract
  | KeyContract
  | ClickContract
  | FocusOpenContract
  | FocusCloseContract
  | DismissContract
  | AnnouncesContract
  | AttrContract

/* -------------------------------------------------------------------------- */
/* Parsing                                                                    */
/* -------------------------------------------------------------------------- */

const PART = /^[a-z][a-z0-9-]*$/
/** A prop as a call site writes it, or `children`. */
const SOURCE = /^(?:children|[a-z][A-Za-z0-9]*|aria-[a-z]+)$/
const ATTRIBUTE =
  /^(?:(?:data|aria)-[a-z][a-z0-9-]*|tabindex|autocorrect|autocapitalize|spellcheck)$/

const ROLE_SET = new Set<string>(ARIA_ROLES)
const KEY_SET = new Set<string>(KEYS)
const MODIFIER_SET = new Set<string>(MODIFIERS)

/** A statement that does not parse. The message names the rule it broke. */
export class ContractSyntaxError extends Error {}

function oneOf<T extends string>(value: string | undefined, list: readonly T[], what: string): T {
  if (value !== undefined && (list as readonly string[]).includes(value)) return value as T
  throw new ContractSyntaxError(`${what} must be one of ${list.join(', ')}; got "${value ?? ''}"`)
}

function part(value: string | undefined): string {
  if (value !== undefined && PART.test(value)) return value
  throw new ContractSyntaxError(
    `a part is a lower-case anatomy name such as \`panel\` or \`trigger\`; got "${value ?? ''}"`,
  )
}

/** `Enter`, `Shift+Tab`, `Shift+F10`: any modifiers, then exactly one key. */
export function isKey(value: string): boolean {
  const pieces = value.split('+')
  const key = pieces.pop() as string
  return KEY_SET.has(key) && pieces.every((piece) => MODIFIER_SET.has(piece))
}

function arity(tokens: string[], counts: number[], shape: string): void {
  if (!counts.includes(tokens.length)) {
    throw new ContractSyntaxError(`expected \`${shape}\`; got "${tokens.join(' ')}"`)
  }
}

/** `data-state=open`, `data-state="open"`, `data-highlighted=""` or a bare `data-loading`. */
function attribute(token: string | undefined): { attribute: string; value: string | null } {
  const match = /^([^=]+)(?:=(.*))?$/.exec(token ?? '')
  const name = match?.[1] ?? ''
  if (!ATTRIBUTE.test(name)) {
    throw new ContractSyntaxError(
      `an attribute is a \`data-*\` or \`aria-*\` name, \`tabindex\`, \`autocorrect\`, \`autocapitalize\` or \`spellcheck\`; got "${token ?? ''}"`,
    )
  }
  const raw = match?.[2]
  if (raw === undefined) return { attribute: name, value: null }
  return { attribute: name, value: raw.replace(/^"(.*)"$/, '$1') }
}

/**
 * Parses one statement. Throws `ContractSyntaxError` with the rule it broke.
 *
 * `when <state>` takes the rest of the line, because entry names are
 * sentences. It is optional everywhere except `announces` and `attr`, whose
 * claims are about one state.
 */
export function parseStatement(line: string): Contract {
  const text = line.trim().replace(/\s+/g, ' ')
  // The first ` when ` outside a quoted message starts the state.
  const split = /^((?:[^"]|"[^"]*")*?) when (.+)$/.exec(text)
  const head = split ? (split[1] as string) : text
  const state = split ? (split[2] as string) : undefined
  const quoted = /^(\S+ \S+) "([^"]*)"$/.exec(head)
  const tokens = (quoted ? (quoted[1] as string) : head).split(' ')
  const kind = oneOf(tokens[0], STATEMENT_KINDS, 'a statement')
  const when = state === undefined ? {} : { state }
  if (quoted !== null && kind !== 'announces') {
    throw new ContractSyntaxError('only `announces` takes a quoted message')
  }

  switch (kind) {
    case 'role': {
      arity(tokens, [3], 'role <part> <role>')
      const role = tokens[2] as string
      if (!ROLE_SET.has(role)) throw new ContractSyntaxError(`"${role}" is not a WAI-ARIA role`)
      return { kind, part: part(tokens[1]), role, text, ...when }
    }
    case 'name': {
      arity(tokens, [4], 'name <part> from <prop|children>')
      if (tokens[2] !== 'from') {
        throw new ContractSyntaxError('expected `name <part> from <prop|children>`')
      }
      const from = tokens[3] as string
      if (!SOURCE.test(from)) {
        throw new ContractSyntaxError(`a name comes from a prop or \`children\`; got "${from}"`)
      }
      return { kind, part: part(tokens[1]), from, text, ...when }
    }
    case 'key': {
      arity(tokens, [3, 5], 'key <Key> <effect> [on <part>]')
      const key = tokens[1] as string
      if (!isKey(key)) {
        throw new ContractSyntaxError(
          `a key is one of ${KEYS.join(', ')}, after any of ${MODIFIERS.join(', ')} joined by +; ` +
            `got "${key}"`,
        )
      }
      const effect = oneOf(tokens[2], KEY_EFFECTS, 'a key effect')
      if (tokens.length === 5 && tokens[3] !== 'on') {
        throw new ContractSyntaxError('expected `key <Key> <effect> on <part>`')
      }
      const on = tokens.length === 5 ? { on: part(tokens[4]) } : {}
      return { kind, key, effect, ...on, text, ...when }
    }
    case 'click': {
      arity(tokens, [4], 'click <effect> on <part>')
      const effect = oneOf(tokens[1], CLICK_EFFECTS, 'a click effect')
      if (tokens[2] !== 'on') throw new ContractSyntaxError('expected `click <effect> on <part>`')
      return { kind, effect, on: part(tokens[3]), text, ...when }
    }
    case 'focus': {
      arity(tokens, [3], 'focus on-open <part>` or `focus on-close <trigger|previous>')
      const moment = oneOf(tokens[1], FOCUS_MOMENTS, 'a focus moment')
      if (moment === 'on-open') return { kind, moment, part: part(tokens[2]), text, ...when }
      return {
        kind,
        moment,
        target: oneOf(tokens[2], FOCUS_RETURNS, 'a focus return'),
        text,
        ...when,
      }
    }
    case 'dismiss': {
      arity(tokens, [2], 'dismiss <outside|escape|both|none>')
      return { kind, by: oneOf(tokens[1], DISMISSALS, 'a dismissal'), text, ...when }
    }
    case 'announces': {
      arity(tokens, [2], 'announces <busy|live:polite|live:assertive> ["<message>"] when <state>')
      const channel = oneOf(tokens[1], ANNOUNCEMENTS, 'an announcement channel')
      if (state === undefined) throw new ContractSyntaxError('`announces` needs `when <state>`')
      if (quoted === null) return { kind, channel, text, state }
      const says = quoted[2] as string
      if (says.trim() === '' || channel === 'busy') {
        throw new ContractSyntaxError(
          'a message is words a live region says, quoted after `live:polite` or `live:assertive`',
        )
      }
      return { kind, channel, says, text, state }
    }
    case 'attr': {
      arity(tokens, [3], 'attr <part> <attribute>[=<value>] when <state>')
      if (state === undefined) throw new ContractSyntaxError('`attr` needs `when <state>`')
      return { kind, part: part(tokens[1]), ...attribute(tokens[2]), text, state }
    }
  }
}

/** One fenced contract block: where its body starts, and its lines. */
export interface ContractFence {
  /** 1-based line of the first statement line, so `line + index` is a statement's line. */
  line: number
  lines: string[]
  /**
   * The `##` heading the fence sits under, with the lines a combined heading
   * runs on into, or `null` above the first heading.
   */
  section: string | null
}

/**
 * A fence line as CommonMark reads it: up to three spaces, then three or more
 * backticks or tildes, then an info string whose first word is the language.
 * A backtick fence's info string holds no backtick.
 */
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/

/** A combined heading names several sections in one line: `## Motion — none. A11y — …`. */
const COMBINED = ' — '

/**
 * Every ```` ```contract ```` fence in a spec, with the section it sits in.
 *
 * Other fences are skipped whole, so an anatomy tree or a `ts` block that
 * happens to contain the word is never read as a contract. A fence closes only
 * on a run of its own character at least as long as the one that opened it, so
 * a ```` ````md ```` block that shows a contract fence is skipped too.
 */
export function contractFences(markdown: string): ContractFence[] {
  return fencesIn(markdown, CONTRACT_FENCE)
}

/**
 * Every fence in a spec whose language is `language`, with the section it sits
 * in, read as `contractFences` reads a contract fence. The agent fence
 * (`agent.ts`) is read by the same function, so both fences open, close and
 * take their section by one rule.
 */
export function fencesIn(markdown: string, language: string): ContractFence[] {
  const lines = markdown.split('\n')
  const fences: ContractFence[] = []
  let section: string | null = null
  // A combined heading runs on into the next lines ("## Motion — none. Icons —
  // none. A11y — …"), and those lines are part of what the section is called.
  // A plain heading does not: the prose under `## Motion` is not its name.
  let continuing = false
  /** The fence being skipped or read: its run of backticks or tildes. */
  let fenced: string | null = null
  let open: ContractFence | null = null

  for (const [index, line] of lines.entries()) {
    if (fenced !== null) {
      const run = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line)?.[1]
      const closes = run !== undefined && run[0] === fenced[0] && run.length >= fenced.length
      if (closes) {
        if (open !== null) fences.push(open)
        open = null
        fenced = null
      } else open?.lines.push(line)
      continue
    }
    const fence = FENCE.exec(line)
    if (fence && !(fence[1]?.startsWith('`') && fence[2]?.includes('`'))) {
      continuing = false
      fenced = fence[1] as string
      const info = (fence[2] ?? '').trim().split(/\s+/)[0]
      if (info === language) open = { line: index + 2, lines: [], section }
      continue
    }
    if (/^##\s/.test(line)) {
      section = line.replace(/^##\s+/, '').trim()
      continuing = section.includes(COMBINED)
    } else if (continuing && line.trim() !== '') section = `${section} ${line.trim()}`
    else continuing = false
  }
  if (open !== null) fences.push(open)
  return fences
}

/** A statement that failed to parse, with where it is. */
export interface ContractFault {
  file: string
  line: number
  message: string
}

/**
 * What a statement claims, without how it is spelled: its parsed fields, less
 * the text. Two lines that differ only in quoting or spacing claim one thing.
 */
function claim(statement: Contract): string {
  const fields = Object.entries(statement).filter(([field]) => field !== 'text')
  return JSON.stringify(fields.sort(([a], [b]) => a.localeCompare(b)))
}

/**
 * Parses every contract fence in a spec.
 *
 * Returns the statements and every fault, so a spec with three bad lines
 * reports all three. A blank line is allowed; a fence outside an A11y,
 * Behaviour or Keyboard section is a fault, because readers look for the
 * contract beside the prose it restates. A claim made twice is a fault however
 * it is spelled, and so is a second `dismiss` for one state, because exactly
 * one set of gestures closes a member.
 */
export function readContract(
  markdown: string,
  file: string,
): { contract: Contract[]; lines: number[]; faults: ContractFault[] } {
  const contract: Contract[] = []
  const lines: number[] = []
  const faults: ContractFault[] = []
  const seen = new Set<string>()
  const dismissed = new Map<string, string>()

  for (const fence of contractFences(markdown)) {
    if (fence.section === null || !CONTRACT_SECTION.test(fence.section)) {
      faults.push({
        file,
        line: fence.line - 1,
        message:
          'a contract fence sits at the end of an A11y, Behaviour or Keyboard section; ' +
          `this one is under "${fence.section ?? 'no heading'}"`,
      })
    }
    fence.lines.forEach((raw, index) => {
      if (raw.trim() === '') return
      const line = fence.line + index
      try {
        const statement = parseStatement(raw)
        const key = claim(statement)
        if (seen.has(key)) {
          faults.push({ file, line, message: `"${statement.text}" is stated twice` })
          return
        }
        if (statement.kind === 'dismiss') {
          const state = statement.state ?? ''
          const earlier = dismissed.get(state)
          if (earlier !== undefined) {
            faults.push({
              file,
              line,
              message:
                `"${statement.text}" is a second \`dismiss\` for ` +
                `${state === '' ? 'the stateless case' : `"${state}"`}, after "${earlier}"`,
            })
            return
          }
          dismissed.set(state, statement.text)
        }
        seen.add(key)
        contract.push(statement)
        lines.push(line)
      } catch (error) {
        if (!(error instanceof ContractSyntaxError)) throw error
        faults.push({ file, line, message: error.message })
      }
    })
  }
  return { contract, lines, faults }
}

/**
 * The fixture entries a state could name: the entry with exactly that name,
 * else every entry whose name starts with it and continues past a word
 * boundary.
 */
export function stateCandidates(state: string, entries: readonly string[]): string[] {
  if (entries.includes(state)) return [state]
  return entries.filter(
    (entry) => entry.startsWith(state) && /^[^\p{L}\p{N}]/u.test(entry.slice(state.length)),
  )
}

/**
 * The fixture entry a statement's state names: the entry with exactly that
 * name, else the one entry whose name starts with it and continues past a word
 * boundary. Fixture entries are sentences ("open md — the panel itself, at the
 * size it defaults to"), and a contract names them by their opening words
 * ("open md"), the way the spec's States table does. Opening words that two
 * entries share name neither, so a new entry cannot silently take over a
 * statement written for an old one.
 */
export function resolveState(state: string, entries: readonly string[]): string | undefined {
  const candidates = stateCandidates(state, entries)
  return candidates.length === 1 ? candidates[0] : undefined
}

/**
 * Faults for every `when <state>` that names no entry of the member's states
 * fixture, or two. It takes any statement with a text and an optional state, so
 * the agent fence's statements (`agent.ts`) are judged by the same words.
 */
export function stateFaults(
  contract: readonly { readonly text: string; readonly state?: string }[],
  entries: readonly string[],
): { text: string; message: string }[] {
  return contract.flatMap((statement) => {
    if (statement.state === undefined) return []
    const candidates = stateCandidates(statement.state, entries)
    if (candidates.length === 1) return []
    return [
      {
        text: statement.text,
        message:
          candidates.length === 0
            ? `"${statement.state}" names no entry of the states fixture`
            : `"${statement.state}" names ${candidates.length} entries of the states fixture ` +
              `(${candidates.map((entry) => `"${entry}"`).join(', ')}); lengthen it to one`,
      },
    ]
  })
}

/**
 * A member's contract, as the registry build reads it: every statement parses
 * and every state it names is an entry of the states fixture, or the build
 * fails with the file and the line of each fault. The build reads entry names
 * from the fixture's source, so a state names an entry whose name is a
 * literal, not a template.
 */
export function readBehaviour(
  markdown: string,
  file: string,
  entries: readonly string[],
): Contract[] {
  const { contract, lines, faults } = readContract(markdown, file)
  const unresolved = stateFaults(contract, entries).map((fault) => ({
    file,
    line: lines[contract.findIndex((statement) => statement.text === fault.text)] ?? 0,
    message: fault.message,
  }))
  const all = [...faults, ...unresolved].sort((a, b) => a.line - b.line)
  if (all.length > 0) {
    throw new Error(
      `registry: the behaviour contract does not parse:\n  ${all
        .map((fault) => `${fault.file}:${fault.line}: ${fault.message}`)
        .join('\n  ')}`,
    )
  }
  return contract
}

/**
 * Which of `specs` (path to markdown) a member's contract lives in: the file
 * named by its slug, else the one whose title names the member in parentheses
 * (`# Radio (RadioGroup)`), which is how a spec filed under another name says
 * what it specifies. The law reads specs through this; the registry's own
 * mapping (`vocabulary.ts`) must agree, and `registry.test.ts` checks it.
 */
export function specOfMember(
  member: string,
  specs: Readonly<Record<string, string>>,
): string | undefined {
  const paths = Object.keys(specs)
  const slug = memberSlug(member)
  return (
    paths.find((path) => path.endsWith(`/${slug}.md`)) ??
    paths.find((path) => (specs[path] ?? '').split('\n', 1)[0]?.includes(`(${member})`))
  )
}

/* -------------------------------------------------------------------------- */
/* The registry's shape                                                       */
/* -------------------------------------------------------------------------- */

const TEXT = str({ description: 'The statement as the spec writes it.' })
const STATE = str({ description: 'The states fixture entry it starts from (`when <state>`).' })
const PART_FIELD = str({ description: 'An anatomy part, located by the conformance runner.' })
const optionalState = { optional: ['state'] }

/** One statement, as the registry publishes it: a union keyed by `kind`. */
export const CONTRACT_SHAPE: Shape = union(
  [
    obj(
      {
        kind: str({ enum: ['role'] }),
        part: PART_FIELD,
        role: str({ enum: ARIA_ROLES }),
        text: TEXT,
        state: STATE,
      },
      optionalState,
    ),
    obj(
      { kind: str({ enum: ['name'] }), part: PART_FIELD, from: str(), text: TEXT, state: STATE },
      optionalState,
    ),
    obj(
      {
        kind: str({ enum: ['key'] }),
        key: str(),
        effect: str({ enum: KEY_EFFECTS }),
        on: PART_FIELD,
        text: TEXT,
        state: STATE,
      },
      { optional: ['on', 'state'] },
    ),
    obj(
      {
        kind: str({ enum: ['click'] }),
        effect: str({ enum: CLICK_EFFECTS }),
        on: PART_FIELD,
        text: TEXT,
        state: STATE,
      },
      optionalState,
    ),
    obj(
      {
        kind: str({ enum: ['focus'] }),
        moment: str({ enum: ['on-open'] }),
        part: PART_FIELD,
        text: TEXT,
        state: STATE,
      },
      optionalState,
    ),
    obj(
      {
        kind: str({ enum: ['focus'] }),
        moment: str({ enum: ['on-close'] }),
        target: str({ enum: FOCUS_RETURNS }),
        text: TEXT,
        state: STATE,
      },
      optionalState,
    ),
    obj(
      { kind: str({ enum: ['dismiss'] }), by: str({ enum: DISMISSALS }), text: TEXT, state: STATE },
      optionalState,
    ),
    obj(
      {
        kind: str({ enum: ['announces'] }),
        channel: str({ enum: ANNOUNCEMENTS }),
        says: str({ description: 'Words a live region of the member holds in the state.' }),
        text: TEXT,
        state: STATE,
      },
      { optional: ['says'] },
    ),
    obj({
      kind: str({ enum: ['attr'] }),
      part: PART_FIELD,
      attribute: str(),
      value: nullable(str()),
      text: TEXT,
      state: STATE,
    }),
  ],
  {
    description:
      'One line of the spec’s ```contract fence (`docs/conformance.md`). The conformance law runs ' +
      'every line against the shell.',
  },
)

export const BEHAVIOUR_SHAPE: Shape = arr(CONTRACT_SHAPE, {
  description:
    'The member’s behaviour contract, parsed from its spec. Empty for a member with no keyboard, ' +
    'focus or dismissal behaviour.',
})
