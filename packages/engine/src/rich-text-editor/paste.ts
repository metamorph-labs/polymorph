import {
  Fragment,
  type Node as PMNode,
  type ResolvedPos,
  type Schema,
  Slice,
} from 'prosemirror-model'
import { Plugin } from 'prosemirror-state'

import { richTextFromText, richTextHref } from '../rich-text/index'
import { annotationType, withoutAnnotations } from './annotations'
import { EVENT_META, linkApplies } from './commands'
import { toEditorDoc } from './convert'
import { MARK, clipboardSerializer } from './schema'

/**
 * What a paste or a drop puts in the document.
 *
 * Rich HTML is read through the schema's parse rules and nothing else, so
 * only what the schema names survives: no script, no style, no event
 * attribute, no class, no id, no image, no element the schema does not know,
 * and no link whose target `richTextHref` refuses. A format the field does not
 * allow has no rule, so it reads as its text, the way `restrictRichText`
 * reads it.
 *
 * Plain text, and every paste with the platform's paste-as-plain-text key, is
 * read as `richTextFromText` reads it: a blank line separates paragraphs and a
 * single line break is a hard break. Inside a code block it is the block's
 * text. A single URL pasted over a selection links the selection.
 *
 * Files are the member's: a paste or a drop that carries files and no text
 * hands them to `onFiles` and inserts nothing. A word processor puts a picture
 * of the copied text beside the text, so a paste with text is read as text.
 *
 * Nothing pasted or dropped carries an annotation, from inside the field or
 * outside it: an anchor is not content, and a copy would anchor one thread in
 * two places. The clipboard's drawing holds no annotation, and every slice
 * that enters is stripped of them, so plain text pasted inside an annotation
 * is outside it too. The one exception is a drag inside the field that moves
 * text: the text leaves one place for another and keeps its anchor. A drag
 * that copies (the platform's copy modifier held at the drop) is stripped once
 * ProseMirror has inserted it, because only the drop decides which it is.
 */

export interface PasteHooks {
  onFiles: () => ((files: File[]) => void) | undefined
}

/** A pasted URL that may link a selection: an absolute web or mail target the model keeps. */
function pastedLink(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed || /\s/.test(trimmed) || !/^(https?:\/\/|mailto:)/i.test(trimmed)) return null
  return richTextHref(trimmed)
}

function files(data: DataTransfer | null): File[] {
  if (!data) return []
  return Array.from(data.files ?? [])
}

function hasText(data: DataTransfer | null): boolean {
  if (!data) return false
  return Boolean(
    data.getData('text/plain').trim() ||
    data
      .getData('text/html')
      .replace(/<[^>]*>/g, '')
      .trim(),
  )
}

/** Plain text as the model reads it, with the marks the paste position carries. */
function textSlice(schema: Schema, text: string, $context: ResolvedPos): Slice {
  const doc = toEditorDoc(schema, richTextFromText(text))
  const marks = $context.marks()
  if (marks.length === 0) return Slice.maxOpen(doc.content)
  const blocks: PMNode[] = []
  doc.content.forEach((block) => {
    const allowed = marks.filter((m) => block.type.allowsMarkType(m.type))
    const inline: PMNode[] = []
    block.forEach((child) => {
      inline.push(
        child.isText ? child.mark(allowed.reduce((set, m) => m.addToSet(set), child.marks)) : child,
      )
    })
    blocks.push(block.copy(Fragment.from(inline)))
  })
  return Slice.maxOpen(Fragment.from(blocks))
}

export function pastePlugin(schema: Schema, hooks: PasteHooks): Plugin {
  const serializer = clipboardSerializer(schema)
  const annotation = annotationType(schema)
  const takeFiles = (event: ClipboardEvent | DragEvent, data: DataTransfer | null) => {
    const list = files(data)
    if (list.length === 0 || hasText(data)) return false
    event.preventDefault()
    hooks.onFiles()?.(list)
    return true
  }
  /** The field's own dragged slice is dropped as a copy: its annotations go once it is inserted. */
  let dropCopies = false
  return new Plugin({
    appendTransaction: (transactions, _old, state) => {
      if (!dropCopies || !transactions.some((tr) => tr.getMeta('uiEvent') === 'drop')) return null
      dropCopies = false
      // ProseMirror selects what a drop inserted.
      const { from, to } = state.selection
      if (!state.doc.rangeHasMark(from, to, annotation)) return null
      return state.tr.removeMark(from, to, annotation)
    },
    props: {
      clipboardSerializer: serializer,
      clipboardTextParser: (text, $context) => textSlice(schema, text, $context),
      transformPasted: (slice, view) =>
        view.dragging && slice === view.dragging.slice ? slice : withoutAnnotations(slice, schema),
      handlePaste: (view, event) => {
        const data = event.clipboardData
        if (takeFiles(event, data)) return true
        const link = schema.marks[MARK.link]
        const { state } = view
        if (link && data && !state.selection.empty && linkApplies(state)) {
          const href = pastedLink(data.getData('text/plain'))
          if (href !== null) {
            const { from, to } = state.selection
            view.dispatch(
              state.tr
                .removeMark(from, to, link)
                .addMark(from, to, link.create({ href }))
                .setMeta(EVENT_META, { type: 'link', active: true })
                .setMeta('uiEvent', 'paste'),
            )
            return true
          }
        }
        return false
      },
      handleDrop: (view, event, slice, moved) => {
        dropCopies = Boolean(view.dragging && slice === view.dragging.slice && !moved)
        return takeFiles(event, event.dataTransfer)
      },
    },
  })
}
