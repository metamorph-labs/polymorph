import {
  Fragment,
  type Node as PMNode,
  type NodeType,
  type ResolvedPos,
  type Schema,
  Slice,
} from 'prosemirror-model'
import { Plugin, type Transaction } from 'prosemirror-state'

import { richTextFromText, richTextHref } from '../rich-text/index'
import { flattenedBlocks } from '../rich-text/read'
import { RICH_TEXT_MAX_DEPTH } from '../rich-text/types'
import { annotationType, annotationsInside, insertedRange, withoutAnnotations } from './annotations'
import { EVENT_META, linkApplies } from './commands'
import { blockJson, blocks, toEditorDoc } from './convert'
import { MARK, NODE, type WordListItem, clipboardSerializer, codeLanguage } from './schema'

/**
 * What a paste or a drop puts in the document.
 *
 * Rich HTML is read through the schema's parse rules and nothing else, so
 * only what the schema names survives: no script, no style, no event
 * attribute, no class, no id, no image, no element the schema does not know,
 * and no link whose target `richTextHref` refuses. A format the field does not
 * allow has no rule, so it reads as its text, the way `restrictRichText`
 * reads it. `schema.ts` says what is read from other applications' HTML.
 *
 * Three things are finished here, after the rules have read the HTML:
 *
 *  - A word processor's list paragraphs, which the rules mark one by one,
 *    become lists: a run of them is one list, each level one deeper, a new
 *    list starting where the kind changes or, at the first level, where the
 *    word processor's list does. The first number of a numbered list is the
 *    number its first item drew. A kind of list the field does not allow
 *    becomes its items' paragraphs, as `restrictRichText` reads it.
 *  - A code editor puts the language's name beside its HTML
 *    (`vscode-editor-data`); a code block pasted from one takes it.
 *  - What a paste or a drop nests deeper than `RICH_TEXT_MAX_DEPTH` is
 *    flattened with the reader's own rule (`flattenedBlocks`), so the field
 *    draws what its value holds.
 *
 * Plain text, and every paste with the platform's paste-as-plain-text key, is
 * read as `richTextFromText` reads it: a blank line separates paragraphs and a
 * single line break is a hard break. Text that is only white space is inserted
 * as it is, a line break as a hard break. Inside a code block it is the
 * block's text. A single URL pasted over a selection links the selection.
 *
 * Files are the member's: a paste or a drop that carries files and no text
 * hands them to `onFiles` and inserts nothing. A word processor puts a picture
 * of the copied text beside the text, so a paste with text is read as text.
 *
 * Nothing pasted or dropped brings an annotation with it, from inside the
 * field or outside it: an anchor is not content, and a copy would anchor one
 * thread in two places. The clipboard's drawing holds no annotation, and every
 * slice that enters is stripped of them. What is inserted then takes the
 * annotations its place is inside (`annotationsInside`), as typed text does,
 * so a paste in the middle of an annotated sentence leaves no gap in it. A
 * drag inside the field that moves text is the one slice that keeps its own
 * annotations: the text leaves one place for another and keeps its anchor. A
 * drag that copies (the platform's copy modifier held at the drop) is stripped
 * once ProseMirror has inserted it, because only the drop decides which it is.
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

/** Inline content for text that is only white space: the text itself, each line break a hard break. */
function whiteSpace(schema: Schema, text: string): PMNode {
  const inline: PMNode[] = []
  text.split(/\r\n?|\n/).forEach((line, index) => {
    if (index > 0) inline.push(schema.node(NODE.hardBreak))
    if (line) inline.push(schema.text(line))
  })
  return schema.node(NODE.paragraph, null, inline)
}

/** Plain text as the model reads it, with the marks the paste position carries. */
function textSlice(schema: Schema, text: string, $context: ResolvedPos): Slice {
  const doc =
    text.trim() === ''
      ? schema.node(NODE.doc, null, [whiteSpace(schema, text)])
      : toEditorDoc(schema, richTextFromText(text))
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

/* -------------------------------------------------------------------------- */
/* A word processor's lists                                                    */
/* -------------------------------------------------------------------------- */

const itemOf = (node: PMNode): WordListItem | null =>
  node.type.name === NODE.paragraph ? (node.attrs.wordList as WordListItem | null) : null

interface OpenList {
  level: number
  item: WordListItem
  items: { paragraph: PMNode; children: PMNode[] }[]
}

/** A built list, or its items' blocks when the field does not allow that kind of list. */
function closeList(schema: Schema, list: OpenList): PMNode[] {
  const type: NodeType | undefined =
    schema.nodes[list.item.ordered ? NODE.orderedList : NODE.bulletList]
  const listItem = schema.nodes[NODE.listItem]
  if (!type || !listItem) return list.items.flatMap((entry) => [entry.paragraph, ...entry.children])
  const attrs =
    type.name === NODE.orderedList && list.item.start !== 1 ? { start: list.item.start } : null
  return [
    type.create(
      attrs,
      list.items.map((entry) => listItem.create(null, [entry.paragraph, ...entry.children])),
    ),
  ]
}

/** One run of list paragraphs as lists, nested by level. */
function wordList(schema: Schema, run: readonly PMNode[]): PMNode[] {
  const out: PMNode[] = []
  const open: OpenList[] = []
  const close = () => {
    const list = open.pop() as OpenList
    const made = closeList(schema, list)
    const parent = open.at(-1)
    if (parent) parent.items.at(-1)?.children.push(...made)
    else out.push(...made)
  }
  for (const node of run) {
    const item = itemOf(node) as WordListItem
    const paragraph = node.type.create({ ...node.attrs, wordList: null }, node.content, node.marks)
    while ((open.at(-1)?.level ?? 0) > item.level) close()
    const top = open.at(-1)
    const differs =
      top !== undefined &&
      top.level === item.level &&
      (top.item.ordered !== item.ordered || (open.length === 1 && top.item.list !== item.list))
    if (differs) close()
    if (open.length === 0 || (open.at(-1)?.level ?? 0) < item.level) {
      open.push({ level: item.level, item, items: [] })
    }
    open.at(-1)?.items.push({ paragraph, children: [] })
  }
  while (open.length > 0) close()
  return out
}

/** The paragraphs of a run as they are, with no mark of a list. */
const unmarked = (run: readonly PMNode[]): PMNode[] =>
  run.map((node) => node.type.create({ ...node.attrs, wordList: null }, node.content, node.marks))

/**
 * The fragment with each run of a word processor's list paragraphs made lists.
 * Where a list cannot stand (a list item's first block), the run stays
 * paragraphs. No paragraph keeps the mark either way.
 */
function wordLists(schema: Schema, fragment: Fragment, parent: NodeType | null = null): Fragment {
  let changed = false
  const out: PMNode[] = []
  let run: PMNode[] = []
  const flush = () => {
    if (run.length === 0) return
    const first = out.length === 0
    const lists = wordList(schema, run)
    const fits =
      !parent || !first || parent.contentMatch.matchFragment(Fragment.from(lists)) !== null
    out.push(...(fits ? lists : unmarked(run)))
    run = []
    changed = true
  }
  fragment.forEach((node) => {
    if (itemOf(node)) {
      run.push(node)
      return
    }
    flush()
    if (node.isTextblock || node.isLeaf) {
      out.push(node)
      return
    }
    const content = wordLists(schema, node.content, node.type)
    if (content !== node.content) changed = true
    out.push(content === node.content ? node : node.copy(content))
  })
  flush()
  return changed ? Fragment.from(out) : fragment
}

/* -------------------------------------------------------------------------- */
/* A code editor's language                                                    */
/* -------------------------------------------------------------------------- */

/** The language a code editor put beside a copy, as a name `codeLanguage` accepts, or `''`. */
function editorLanguage(data: DataTransfer | null): string {
  try {
    const mode = (JSON.parse(data?.getData('vscode-editor-data') || '{}') as { mode?: unknown })
      .mode
    return typeof mode === 'string' && mode !== 'plaintext' ? codeLanguage(mode) : ''
  } catch {
    return ''
  }
}

/** The fragment with each code block that has no language given `language`. */
function withLanguage(fragment: Fragment, language: string): Fragment {
  let changed = false
  const out: PMNode[] = []
  fragment.forEach((node) => {
    let next = node
    if (node.type.name === NODE.codeBlock && !node.attrs.language) {
      next = node.type.create({ ...node.attrs, language }, node.content, node.marks)
    } else if (!node.isTextblock && !node.isLeaf) {
      const content = withLanguage(node.content, language)
      if (content !== node.content) next = node.copy(content)
    }
    if (next !== node) changed = true
    out.push(next)
  })
  return changed ? Fragment.from(out) : fragment
}

/* -------------------------------------------------------------------------- */
/* Depth                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Replaces each quote or list that sits inside `RICH_TEXT_MAX_DEPTH` quotes
 * and lists with the paragraphs the reader makes of it, deepest last so the
 * positions found first stay true. Returns whether it replaced any.
 */
function flattenTooDeep(tr: Transaction, schema: Schema): boolean {
  const found: { pos: number; node: PMNode }[] = []
  const visit = (node: PMNode, pos: number, depth: number) => {
    node.forEach((child, offset) => {
      const at = pos + offset
      if (child.isTextblock || child.isLeaf) return
      const container = child.type.name !== NODE.listItem
      if (container && depth >= RICH_TEXT_MAX_DEPTH) {
        found.push({ pos: at, node: child })
        return
      }
      visit(child, at + 1, container ? depth + 1 : depth)
    })
  }
  visit(tr.doc, 0, 0)
  for (const { pos, node } of found.reverse()) {
    const flat = blocks(schema, flattenedBlocks(blockJson(node)))
    tr.replaceWith(pos, pos + node.nodeSize, flat)
  }
  return found.length > 0
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
  /** The language a code editor named beside the paste being read. */
  let language = ''
  return new Plugin({
    appendTransaction: (transactions, _old, state) => {
      const index = transactions.findIndex((tr) => {
        const event = tr.getMeta('uiEvent')
        return event === 'paste' || event === 'drop'
      })
      if (index < 0) return null
      const inserting = transactions[index]!
      const drop = inserting.getMeta('uiEvent') === 'drop'
      const copies = drop && dropCopies
      if (drop) dropCopies = false
      let range = insertedRange(inserting)
      if (range === null) return null
      for (const later of transactions.slice(index + 1)) {
        range = { from: later.mapping.map(range.from, -1), to: later.mapping.map(range.to, 1) }
      }
      const tr = state.tr
      if (copies) tr.removeMark(range.from, range.to, annotation)
      for (const mark of annotationsInside(state.doc, range.from, range.to))
        tr.addMark(range.from, range.to, mark)
      // Mark steps move no position, so the depth is read on the document they made.
      flattenTooDeep(tr, schema)
      return tr.docChanged ? tr : null
    },
    props: {
      clipboardSerializer: serializer,
      clipboardTextParser: (text, $context) => textSlice(schema, text, $context),
      transformPasted: (slice, view) => {
        const named = language
        language = ''
        if (view.dragging && slice === view.dragging.slice) return slice
        const lists = wordLists(schema, slice.content)
        // A list made here changes the slice's shape, so it is opened as the parser opens one.
        let read = lists === slice.content ? slice : Slice.maxOpen(lists, true)
        if (named) {
          const content = withLanguage(read.content, named)
          if (content !== read.content) read = new Slice(content, read.openStart, read.openEnd)
        }
        return withoutAnnotations(read, schema)
      },
      handleDOMEvents: {
        paste: (_view, event) => {
          language = editorLanguage((event as ClipboardEvent).clipboardData)
          return false
        },
      },
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
