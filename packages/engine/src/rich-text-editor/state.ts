import { redoDepth, undoDepth } from 'prosemirror-history'
import type { Schema } from 'prosemirror-model'
import { type EditorState, NodeSelection } from 'prosemirror-state'

import type { RichTextFormat } from '../rich-text/types'
import { annotationsAt, selectionRange } from './annotations'
import {
  codeBlockCommand,
  headingCommand,
  insideType,
  linkApplies,
  linkAt,
  listAround,
  listCommand,
  markActive,
  markCommand,
  quoteCommand,
} from './commands'
import { MARK, NODE } from './schema'
import type { RichTextEditorState, RichTextSuggestion } from './types'

/**
 * What the member reads after each change: the document's emptiness and
 * length, the selection as a range and the annotations at it, the formats on
 * at the selection, and which commands apply there.
 *
 * `active` and `can` are read with the same commands the keys run, asked
 * without performing them, so a toolbar control is enabled exactly when its
 * key would do something. A format the field does not allow is never active
 * and never applies.
 */

export interface StateFacts {
  empty: boolean
  length: number
  focused: boolean
  suggestion: RichTextSuggestion | null
}

export interface FormatCommands {
  bold: ReturnType<typeof markCommand>
  italic: ReturnType<typeof markCommand>
  strike: ReturnType<typeof markCommand>
  code: ReturnType<typeof markCommand>
  bulletList: ReturnType<typeof listCommand>
  orderedList: ReturnType<typeof listCommand>
  blockquote: ReturnType<typeof quoteCommand>
  codeBlock: ReturnType<typeof codeBlockCommand>
  headings: readonly ReturnType<typeof headingCommand>[]
}

export function formatCommands(schema: Schema): FormatCommands {
  return {
    bold: markCommand(schema, 'bold'),
    italic: markCommand(schema, 'italic'),
    strike: markCommand(schema, 'strike'),
    code: markCommand(schema, 'code'),
    bulletList: listCommand(schema, 'bulletList'),
    orderedList: listCommand(schema, 'orderedList'),
    blockquote: quoteCommand(schema),
    codeBlock: codeBlockCommand(schema),
    headings: [headingCommand(schema, 1), headingCommand(schema, 2), headingCommand(schema, 3)],
  }
}

export function activeFormats(state: EditorState): RichTextEditorState['active'] {
  const { schema } = state
  const $from = state.selection.$from
  const parent = state.selection instanceof NodeSelection ? state.selection.node : $from.parent
  const list = listAround(state)
  const level = parent.type.name === NODE.heading ? (parent.attrs.level as 1 | 2 | 3) : 0
  return {
    bold: markActive(state, schema.marks[MARK.bold]),
    italic: markActive(state, schema.marks[MARK.italic]),
    strike: markActive(state, schema.marks[MARK.strike]),
    code: markActive(state, schema.marks[MARK.code]),
    link: linkAt(state),
    heading: level,
    bulletList: list?.node.type.name === NODE.bulletList,
    orderedList: list?.node.type.name === NODE.orderedList,
    blockquote: insideType(state, NODE.blockquote),
    codeBlock: parent.type.name === NODE.codeBlock,
  }
}

export function computeState(
  state: EditorState,
  formats: ReadonlySet<RichTextFormat>,
  commands: FormatCommands,
  facts: StateFacts,
): RichTextEditorState {
  const { selection, doc } = state
  const selectedText = selection.empty
    ? ''
    : doc.textBetween(
        selection.from,
        selection.to,
        '\n',
        (leaf) => leaf.type.spec.leafText?.(leaf) ?? '',
      )
  const applies = (format: RichTextFormat, run: () => boolean) => formats.has(format) && run()
  return {
    empty: facts.empty,
    length: facts.length,
    focused: facts.focused,
    collapsed: selection.empty,
    selectedText,
    range: selectionRange(state),
    annotations: annotationsAt(state),
    active: activeFormats(state),
    can: {
      bold: applies('bold', () => commands.bold(state)),
      italic: applies('italic', () => commands.italic(state)),
      strike: applies('strike', () => commands.strike(state)),
      code: applies('code', () => commands.code(state)),
      link: applies('link', () => linkApplies(state)),
      heading: applies('heading', () => commands.headings.some((command) => command(state))),
      bulletList: applies('bulletList', () => commands.bulletList(state)),
      orderedList: applies('orderedList', () => commands.orderedList(state)),
      blockquote: applies('blockquote', () => commands.blockquote(state)),
      codeBlock: applies('codeBlock', () => commands.codeBlock(state)),
      undo: undoDepth(state) > 0,
      redo: redoDepth(state) > 0,
    },
    suggestion: facts.suggestion,
  }
}

/** Whether two states hold the same values, so `onState` is called only for a change. */
export function sameState(a: RichTextEditorState | null, b: RichTextEditorState): boolean {
  return a !== null && JSON.stringify(a) === JSON.stringify(b)
}
