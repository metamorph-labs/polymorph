/**
 * The token a composer's suggestion list follows, and the text a pick leaves
 * (`design/components/prompt-input.md`, Mentions and commands). Every
 * framework's PromptInput calls these, so `@` and `/` open, filter and insert
 * by one rule.
 *
 * A token is a trigger's character at a place it may open, followed by the
 * text up to the caret, with no whitespace in between. `at: 'word'` lets the
 * character open at the start of the prompt or after whitespace, so the `@`
 * of an email address opens nothing. `at: 'start'` lets it open only as the
 * prompt's first character, which is where a command belongs.
 */

/** What the rule reads of a trigger. */
export interface PromptTokenTrigger {
  char: string
  at?: 'word' | 'start'
}

/** The token the caret is in. */
export interface PromptToken {
  /** The trigger's index in the list the composer was given. */
  trigger: number
  /** Where the trigger's character is in the text. */
  start: number
  /** The text between the character and the caret. */
  query: string
}

const SPACE = /\s/

/**
 * The token the caret is in, or `null`. A `null` caret is a field without
 * focus or with a range selected, and is in no token. The walk goes back from
 * the caret and stops at the first whitespace, so a query never holds a space
 * and a space closes the list.
 */
export function promptToken(
  text: string,
  caret: number | null,
  triggers: readonly PromptTokenTrigger[],
): PromptToken | null {
  if (caret === null || triggers.length === 0) return null
  for (let at = Math.min(caret, text.length) - 1; at >= 0; at -= 1) {
    const char = text[at] as string
    if (SPACE.test(char)) return null
    const trigger = triggers.findIndex((candidate) => candidate.char === char)
    if (trigger === -1) continue
    const placed =
      (triggers[trigger] as PromptTokenTrigger).at === 'start'
        ? at === 0
        : at === 0 || SPACE.test(text[at - 1] as string)
    if (placed) return { trigger, start: at, query: text.slice(at + 1, caret) }
  }
  return null
}

/**
 * The text and caret after a pick. The token, from its character to the
 * caret, is replaced by `insertion`, and one space follows it unless the text
 * after the caret starts with whitespace already. The caret lands after that
 * whitespace, so it is in no token and the list stays closed. An empty
 * insertion removes the token and adds nothing, for a pick the app acts on
 * instead of writing.
 */
export function promptPick(
  text: string,
  token: PromptToken,
  caret: number,
  insertion: string,
): { text: string; caret: number } {
  const after = text.slice(caret)
  if (insertion === '') return { text: text.slice(0, token.start) + after, caret: token.start }
  const space = SPACE.test(after.charAt(0)) ? '' : ' '
  return {
    text: text.slice(0, token.start) + insertion + space + after,
    caret: token.start + insertion.length + 1,
  }
}
