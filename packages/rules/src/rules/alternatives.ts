/**
 * The lawful alternatives a red rule's message names, read back as data.
 *
 * Every message names its answers in code spans of three shapes
 * (`advice.ts`): a member `<Name prop=…>`, a prop `name={…}`, and a token
 * `--pm-…` or `var(--pm-…)`. A report on a Vue file writes a prop in template
 * syntax (`:name="…"`, `@event="…"`), which reads as the same prop, and a
 * report on an Angular file writes a member by its selector (`<pm-inline>` is
 * `Inline`) and a prop as a binding (`[name]="…"`, `(event)="…"`). This reads those spans, so the MCP server's
 * `validate` can hand an agent `{ member, prop, token, rung }` instead of a
 * sentence to parse. Reading the message, rather than a second structure each
 * rule fills in, means the two cannot disagree: whatever the message says is
 * exactly what the structure holds.
 *
 * What was found is never in one of those shapes. A message quotes the
 * offending element bare (`on <Button>`), and the offending value or package
 * in a span no answer has the shape of (`className`, `12px`, `framer-motion`).
 */

export interface Alternative {
  /** A member of the vocabulary, `Table.Row` for a part. */
  member?: string
  /** A prop, on `member` when both are named together. */
  prop?: string
  /** A `--pm-*` custom property. */
  token?: string
  /**
   * The rung of the exception ladder (`docs/rules.md`) the answer is on: 1 for
   * the vocabulary as it is, 2 for a scope, 3 for a patch, 4 for a zone, 5 for
   * a promotion. `null` for the vocabulary's own rules, which no rung answers:
   * there the answer is to fix the code.
   */
  rung: number | null
}

const MEMBER = /^<(?:([A-Z][\w.]*)|pm-([a-z][a-z0-9-]*))(?:\s+[:@[(]?([a-zA-Z][\w-]*))?/
const TOKEN = /^(?:var\()?(--pm-[a-z0-9]+(?:-[a-z0-9]+)*)\)?$/
const PROP = /^(?:[:@]|\[|\()?([a-zA-Z][\w-]*)[\])]?=/

/** A member an Angular selector names: `pm-data-table` is `DataTable`. */
const fromSelector = (selector: string): string =>
  selector
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
const SPAN = /`([^`]+)`/g

/**
 * The rung a token named on its own is on. Application code writes a
 * `var(--pm-…)` only inside a `<Bespoke>` zone, so for an application rule a
 * bare token is a zone's answer. Where it explains a prop (`It is space step 4
 * (--pm-space-4): write gap={4}`), the prop is the rung-1 answer beside it.
 */
const TOKEN_RUNG = 4

/** The rung a member answer is on: the ladder's own primitives are its rungs. */
function memberRung(member: string, prop: string | undefined): number {
  if (member === 'Bespoke' || member === 'ThirdParty') return 4
  if (member === 'DensityScope' || member === 'ToneScope') return 2
  if (prop === 'patch') return 3
  return 1
}

/**
 * The alternatives in `message`, in the order it names them. `climb` is the
 * rule's entry in `RULE_CLIMB`: empty means the rule protects the vocabulary
 * itself, and its answers are on no rung.
 */
export function alternativesIn(message: string, climb: readonly number[]): Alternative[] {
  const laddered = climb.length > 0
  const found: Alternative[] = []
  const add = (alternative: Alternative) => {
    const same = found.some(
      (existing) =>
        existing.member === alternative.member &&
        existing.prop === alternative.prop &&
        existing.token === alternative.token &&
        existing.rung === alternative.rung,
    )
    if (!same) found.push(alternative)
  }

  for (const [, span] of message.matchAll(SPAN)) {
    const text = (span as string).trim()
    const member = MEMBER.exec(text)
    if (member) {
      const [, written, selector, prop] = member
      const name = written ?? fromSelector(selector as string)
      const token = /--pm-[a-z0-9]+(?:-[a-z0-9]+)*/.exec(text)?.[0]
      add({
        member: name as string,
        ...(prop ? { prop } : {}),
        ...(token ? { token } : {}),
        rung: laddered ? memberRung(name as string, prop) : null,
      })
      continue
    }
    const token = TOKEN.exec(text)
    if (token) {
      add({ token: token[1] as string, rung: laddered ? TOKEN_RUNG : null })
      continue
    }
    const prop = PROP.exec(text)
    if (prop) add({ prop: prop[1] as string, rung: laddered ? 1 : null })
  }

  // A rung the message names with nothing in a span, such as promotion: the
  // answer is a change to the vocabulary, not a name to write.
  if (laddered) {
    for (const [, rung] of message.replace(SPAN, '').matchAll(/\(rung (\d)\)/g)) {
      const number = Number(rung)
      if (!found.some((alternative) => alternative.rung === number)) add({ rung: number })
    }
  }
  return found
}
