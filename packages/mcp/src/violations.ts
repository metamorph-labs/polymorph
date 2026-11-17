import type { Alternative, Diagnostic, DiagnosticFix } from '@polymorph/rules/verify'
import type { Registry } from '@polymorph/registry'

/**
 * A diagnostic, with the ladder rungs that answer it.
 *
 * `validate` and `fix` both return this for everything they report. It is a
 * separate module because the tool that reads a file from the project and the
 * tools that take code as an argument answer in the same shape, and they sit
 * on opposite sides of the boundary `thin-front.test.ts` draws around writing.
 *
 * **Every violation carries its answer.** An agent that has to think about a
 * violation spends a loop on it, so each one comes with what to write instead:
 *
 *  - `fix`: the rule's own rewrite, when the violation has exactly one. It is
 *    the edit `eslint --fix` makes, as a range of the submitted code and the
 *    text that replaces it; the `fix` tool applies every one of them.
 *  - `alternatives`: the lawful answers the message names, as data. Each is a
 *    member, a prop, a token or a combination, with the rung of the exception
 *    ladder it is on (`null` for the vocabulary's own rules, which no rung
 *    answers). They are read from the message itself, so the two never
 *    disagree.
 *  - `message`: the same answers in a sentence, under 200 characters.
 *  - `climb`: every rung that answers the rule, for when none of the named
 *    alternatives fits.
 */

export interface Rung {
  rung: number
  name: string
  summary: string
  declaredAs: string | null
}

export type { Alternative, DiagnosticFix }

export interface Violation extends Diagnostic {
  /** The rule's own rewrite, or `null` when the answer is a decision. */
  fix: DiagnosticFix | null
  /** The lawful answers the message names: member, prop, token and rung. */
  alternatives: Alternative[]
  /** What the rule is for, from the registry's law catalogue. */
  law: string
  /**
   * The lawful ways to do this anyway, highest rung first. Empty means no
   * exception exists, not that none was found.
   */
  climb: Rung[]
}

/**
 * Adds the ladder rungs to each diagnostic. The rung turns a refusal into an
 * instruction. A rule that only says no gets worked around, with
 * `eslint-disable`, a wrapper div or a copy of the component. Each of those is
 * an invisible deviation, which the system exists to prevent. So every
 * violation carries the ladder entries that answer it, in order, from the
 * registry, beside the fix and the alternatives the diagnostic already holds.
 */
export function withClimb(registry: Registry, diagnostics: Diagnostic[]): Violation[] {
  const rungs = new Map(registry.exceptions.ladder.map((rung) => [rung.rung, rung]))
  const laws = new Map(registry.laws.map((law) => [law.name, law]))

  return diagnostics.map((diagnostic): Violation => {
    const law = laws.get(diagnostic.rule)
    return {
      ...diagnostic,
      fix: diagnostic.fix ?? null,
      alternatives: diagnostic.alternatives ?? [],
      law: law?.summary ?? '',
      climb: (law?.climb ?? [])
        .map((rung) => rungs.get(rung))
        .filter((rung): rung is Rung => rung !== undefined),
    }
  })
}
