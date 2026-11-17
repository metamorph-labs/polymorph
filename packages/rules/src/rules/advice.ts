/**
 * How a red rule's message is written.
 *
 * **Every report carries its answer.** A violation an agent has to think about
 * is a loop iteration, and a person reads it as a refusal. So each message
 * either comes with the one lawful rewrite (a fixer, when exactly one exists) or
 * names the lawful alternatives for what was written: the member, the prop and
 * the token, specific to the code, never a generic sentence.
 *
 * **The names are written in a shape a program can read.** Each alternative is
 * one code span: a member as `<Name prop={…}>`, a prop as `name={…}` or
 * `name="…"`, a token as `--pm-…` or `var(--pm-…)`. A report on a Vue file
 * writes the same spans in template syntax, `:name="…"` for `name={…}`
 * (`templateSyntax` in `vue.ts`). What was found is written
 * outside code spans (`on <Button>`, `var(--pm-accnet-bg)`) or in a span no
 * alternative has the shape of (`className`, `framer-motion`, `12px`).
 * `alternatives.ts` reads the spans back into structured alternatives for the
 * MCP server's `validate`, so the message and the structure cannot disagree.
 *
 * **Under 200 characters.** A report is read in an editor's hover, a terminal
 * line and an agent's context, and the first sentence carries the answer. The
 * extra sentences a rule adds are kept only while the whole message fits.
 */

export const MESSAGE_LIMIT = 200

/** `a`, `a or b`, `a, b or c`. */
export function either(items: readonly string[], word: 'or' | 'and' = 'or'): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} ${word} ${items[items.length - 1]}`
}

/**
 * The sentences that fit after `head`, joined. The first is always kept, so a
 * message is never left without its answer; the rest are added while the whole
 * message stays under the limit.
 */
export function fit(head: string, sentences: readonly string[]): string {
  const [first, ...rest] = sentences.filter((sentence) => sentence !== '')
  if (first === undefined) return ''
  let advice = first
  for (const sentence of rest) {
    if (`${head} ${advice} ${sentence}`.length >= MESSAGE_LIMIT) continue
    advice = `${advice} ${sentence}`
  }
  return advice
}

/** The declared zone, as every message names it. */
export const ZONE = '`<Bespoke reason="…">`'

/** A member as a report names it: its name and the attributes worth writing. */
export interface MemberCall {
  member: string
  /** Attributes in the order the report writes them, `…` for what the author fills in. */
  attributes?: Record<string, string>
}

/** `<Input type="email">`, as a code span. */
export function memberSpan({ member, attributes = {} }: MemberCall): string {
  const written = Object.entries(attributes).map(([name, value]) =>
    value === '' ? ` ${name}` : ` ${name}=${value}`,
  )
  return `\`<${member}${written.join('')}>\``
}
