import { type EditorState, Plugin, PluginKey, TextSelection } from 'prosemirror-state'

import { MARK, NODE } from './schema'
import type { RichTextEditorEntityKind } from './types'

/**
 * The entity token at the caret, which opens the member's suggestion list.
 *
 * A token is a registered trigger character at the start of a word (the start
 * of a text block or after whitespace), followed by the text up to the caret
 * with no whitespace in it. It is plain text until the reader picks an entity:
 * leaving it inserts nothing and leaves the typed characters.
 *
 * The plugin follows one token across transactions by mapping its start, so
 * the token keeps its `key` while the query changes and gets a new one when the
 * caret is in another token. A dismissed token stays dismissed until the caret
 * leaves it. Whether the list is shown also depends on what only the view
 * knows (focus, an input method composing), so the editor publishes the
 * suggestion from this state and those facts together.
 */

export interface Token {
  kind: string
  trigger: string
  query: string
  /** The trigger's position. */
  from: number
  /** The caret's position. */
  to: number
  key: string
  dismissed: boolean
}

interface TokenState {
  token: Token | null
  /** How many tokens have been opened, for each token's `key`. */
  count: number
}

export const suggestionKey = new PluginKey<TokenState>('polymorphRichTextSuggestion')

/** The transaction metadata that closes the list for the token the caret is in. */
const DISMISS = 'dismiss'

/** The leaf the token scanner reads in place of an inline atom: not whitespace, so it ends no word, and not a trigger. */
const OBJECT = '￼'

export function findToken(
  state: EditorState,
  kinds: readonly RichTextEditorEntityKind[],
): Omit<Token, 'key' | 'dismissed'> | null {
  const sel = state.selection
  if (!(sel instanceof TextSelection) || !sel.empty || kinds.length === 0) return null
  const $pos = sel.$from
  const parent = $pos.parent
  if (!parent.isTextblock || parent.type.spec.code) return null
  const code = state.schema.marks[MARK.code]
  if (code && code.isInSet(state.storedMarks ?? $pos.marks())) return null
  const before = parent.textBetween(0, $pos.parentOffset, undefined, (leaf) =>
    leaf.type.name === NODE.hardBreak ? '\n' : OBJECT,
  )
  const match = /\S*$/.exec(before)
  const word = match ? match[0] : ''
  if (!word || word.includes(OBJECT)) return null
  for (const { kind, trigger } of kinds) {
    if (!trigger || !word.startsWith(trigger)) continue
    const from = $pos.pos - word.length
    return { kind, trigger, query: word.slice(trigger.length), from, to: $pos.pos }
  }
  return null
}

export function suggestionPlugin(
  kinds: () => readonly RichTextEditorEntityKind[],
): Plugin<TokenState> {
  return new Plugin<TokenState>({
    key: suggestionKey,
    state: {
      init: (_, state) => {
        const found = findToken(state, kinds())
        return {
          token: found ? { ...found, key: '1', dismissed: false } : null,
          count: found ? 1 : 0,
        }
      },
      apply: (tr, prev, _old, state) => {
        const found = findToken(state, kinds())
        if (!found) return prev.token ? { token: null, count: prev.count } : prev
        const before = prev.token
        const same =
          before !== null &&
          tr.mapping.map(before.from) === found.from &&
          before.kind === found.kind
        const dismissed = tr.getMeta(suggestionKey) === DISMISS || (same && before.dismissed)
        if (same) return { token: { ...found, key: before.key, dismissed }, count: prev.count }
        const count = prev.count + 1
        return { token: { ...found, key: String(count), dismissed }, count }
      },
    },
  })
}

export function dismissMeta(): [PluginKey<TokenState>, string] {
  return [suggestionKey, DISMISS]
}

export function tokenOf(state: EditorState): Token | null {
  return suggestionKey.getState(state)?.token ?? null
}
