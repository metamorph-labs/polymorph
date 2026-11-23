import { history } from 'prosemirror-history'
import type { Node as PMNode, Schema } from 'prosemirror-model'
import {
  EditorState,
  NodeSelection,
  Plugin,
  Selection,
  TextSelection,
  type Transaction,
} from 'prosemirror-state'
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view'

import {
  isRichTextNewer,
  parseRichText,
  restrictRichText,
  richTextEntities,
  richTextPlainText,
} from '../rich-text/index'
import { codePoints } from '../rich-text/text'
import type { RichTextDocument, RichTextEntity, RichTextFormat } from '../rich-text/types'
import {
  type AnnotationDrawing,
  annotateCommand,
  annotationsPlugin,
  copyMarks,
  removeAnnotationCommand,
  sameButMarks,
  selectionRect,
} from './annotations'
import {
  EVENT_META,
  type PendingEvent,
  entityCommand,
  headingCommand,
  linkCommand,
  redoCommand,
  textCommand,
  undoCommand,
} from './commands'
import { fromEditorDoc, isBareDoc, toEditorDoc } from './convert'
import { keyPlugins } from './keys'
import { stickyMarksPlugin } from './marks'
import { pastePlugin } from './paste'
import { rulesPlugin } from './rules'
import { NODE, buildSchema } from './schema'
import {
  activeFormats,
  computeState,
  formatCommands,
  sameState,
  type FormatCommands,
} from './state'
import { dismissMeta, suggestionPlugin, tokenOf } from './suggestion'
import type {
  RichTextEditor,
  RichTextEditorOptions,
  RichTextEditorState,
  RichTextEditorUpdate,
  RichTextRect,
  RichTextSuggestion,
} from './types'

/**
 * `createRichTextEditor`: the controller a rich-text field mounts on the
 * element it rendered.
 *
 * The editor is a ProseMirror view mounted on the member's element. The view
 * writes the document's DOM inside the element and sets the element's editing
 * attributes (`contenteditable`, the member's `attributes`, `data-focused`);
 * it writes nothing outside it. Every value the member gives can change
 * without a new editor: `update` swaps callbacks and attributes in place, and
 * a change of `formats` or entity kinds builds a new schema and a new state
 * from the current document, because the schema is what keeps a disallowed
 * format out.
 *
 * Two paths change the document. A reader's act and a command run through
 * `dispatchTransaction`, which emits `onChange` and the announcement the
 * transaction carries. `setValue` replaces only the range that differs, with
 * no history step and no `onChange`, so a member that passes its `value` back
 * on every render keeps the caret and the undo history. A value that differs
 * only in marks (an annotation the application added with
 * `annotateRichText`) is applied as mark changes, which move no position, so
 * the selection stays exactly where it was.
 *
 * Which annotations are drawn, and which is active, are options of the
 * drawing and not of the document: `update` changes them without an edit.
 *
 * The document is read once per change of ProseMirror's document: the JSON,
 * its serialization, its emptiness and its length are kept by the document's
 * identity, so a keystroke converts the document once and a caret move reads
 * none of it.
 *
 * A read-only field that keeps its caret (`readOnly`) is a ProseMirror view
 * that is editable, so the browser draws the caret and moves it with the
 * keys, under a filter that refuses every transaction from the reader that
 * changes the document. The browser's own edits are refused before they
 * happen (`beforeinput`, paste, cut, drop); an input method's text, which a
 * page cannot refuse, is read by ProseMirror as a change, refused by the
 * filter, and the DOM is drawn again from the document.
 *
 * A document of a later format (`isRichTextNewer`) is drawn as far as this
 * version reads it and held as it was given. The field is then read-only with
 * a caret, its methods that edit refuse, and `getValue()` returns the held
 * value, so nothing this version writes replaces what a later one stored.
 *
 * Nothing here reads `window`, `document` or `navigator` until the function
 * runs, so the module can be imported on a server.
 */

/** Metadata on a transaction `setValue` or a rebuild made: no `onChange`, no announcement. */
const SILENT = 'polymorphRichTextSilent'
/** Metadata on the transaction that records a focus change. */
const FOCUS = 'polymorphRichTextFocus'
/** Metadata on a transaction one of the editor's methods made: the application's act, which a read-only field takes. */
const APP = 'polymorphRichTextApp'

/** The document as the editor read it: kept by the identity of ProseMirror's document. */
interface Read {
  doc: PMNode
  value: RichTextDocument
  /** The value's serialization: the normal form's JSON, so equal documents give equal text. */
  text: string
  empty: boolean
  length: number
}

/**
 * The text caret nearest an end of the document. A document that begins or
 * ends with a node of a later version (drawn as one unit) would otherwise
 * select that node, and the first keystroke would replace it. A document with
 * no text position at all keeps the end's own selection.
 */
function caretAt(doc: PMNode, side: 'start' | 'end'): Selection {
  return side === 'start'
    ? (Selection.findFrom(doc.resolve(0), 1, true) ?? Selection.atStart(doc))
    : (Selection.findFrom(doc.resolve(doc.content.size), -1, true) ?? Selection.atEnd(doc))
}

/** The text caret nearest `pos`, or the selection ProseMirror finds there when there is no text. */
function caretNear(doc: PMNode, pos: number): Selection {
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)))
  return (
    Selection.findFrom($pos, 1, true) ?? Selection.findFrom($pos, -1, true) ?? Selection.near($pos)
  )
}

type Callbacks = Omit<
  RichTextEditorUpdate,
  | 'formats'
  | 'entities'
  | 'editable'
  | 'readOnly'
  | 'attributes'
  | 'placeholder'
  | 'annotations'
  | 'activeAnnotation'
>

const ZERO_RECT: RichTextRect = { top: 0, bottom: 0, left: 0, right: 0 }

function toFormatSet(formats: readonly RichTextFormat[]): ReadonlySet<RichTextFormat> {
  return new Set(formats)
}

/** Whether two lists hold the same entries, in any order. */
function sameEntries(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a)
  const right = new Set(b)
  return left.size === right.size && [...left].every((entry) => right.has(entry))
}

const kindKeys = (kinds: readonly { kind: string; trigger: string }[]) =>
  kinds.map(({ kind, trigger }) => JSON.stringify([kind, trigger]))

export function createRichTextEditor(options: RichTextEditorOptions): RichTextEditor {
  const element = options.element
  const headingLevel = options.headingLevel ?? 2
  const originalAttributes = Array.from(element.attributes, (a) => [a.name, a.value] as const)

  let formats = [...options.formats]
  let entities = [...options.entities]
  let editable = options.editable
  let readOnly = options.readOnly === true
  /** A document of a later format, as it was given: drawn as far as it is read, and never written. */
  let held: RichTextDocument | null = null
  /** Whether the reader may change the document. */
  const writable = () => editable && held === null
  /**
   * Read-only with a caret: the view is editable and the filter refuses the reader's edits. A
   * held document makes an editable field read-only; a disabled field stays disabled.
   */
  const caretOnly = () => !writable() && (readOnly || (editable && held !== null))
  let attributes: Readonly<Record<string, string | undefined>> = { ...options.attributes }
  let placeholder = options.placeholder
  let drawing: AnnotationDrawing = {
    drawn: options.annotations === undefined ? undefined : [...options.annotations],
    active: options.activeAnnotation,
    className: options.classes.annotation,
  }
  const callbacks: Callbacks = {
    onChange: options.onChange,
    onState: options.onState,
    onEvent: options.onEvent,
    onSubmit: options.onSubmit,
    onLinkRequest: options.onLinkRequest,
    onSuggestionKey: options.onSuggestionKey,
    onFiles: options.onFiles,
    onFocus: options.onFocus,
    onBlur: options.onBlur,
  }

  let focused = element.ownerDocument.activeElement === element
  let published: RichTextEditorState | null = null
  let pendingValue: RichTextDocument | null = null
  /** An entity picked while an input method composed, inserted once the composition ends. */
  let pendingEntity: Omit<RichTextEntity, 'type'> | null = null
  /** While the editor ends a composition by moving focus out and back, which no callback hears. */
  let ending = false
  let destroyed = false

  let schema: Schema
  let allowed: ReadonlySet<RichTextFormat>
  let commands: FormatCommands
  let read: Read | null = null
  /** The value `setValue` last applied, and the document it left, so the same value is not read again. */
  let applied: { input: RichTextDocument; doc: PMNode } | null = null

  /**
   * The document a value becomes in this field: read tolerantly and restricted to the formats. A
   * document of a later format is read as far as this version can, for drawing only.
   */
  const admit = (input: RichTextDocument): RichTextDocument =>
    restrictRichText(isRichTextNewer(input) ? parseRichText(input).value : input, formats)

  /** The document as JSON, with its serialization, emptiness and length: read once per document. */
  const readOf = (doc: PMNode): Read => {
    if (read !== null && read.doc === doc) return read
    const value = fromEditorDoc(doc)
    // `richTextLength` and `isRichTextEmpty` from one projection: the plain text with no block
    // separator, whose code points are the length, and which is blank in an empty document
    // unless the document holds an entity.
    const plain = richTextPlainText(value, { blockSeparator: '' })
    read = {
      doc,
      value,
      text: JSON.stringify(value),
      length: codePoints(plain),
      empty: plain.trim() === '' && richTextEntities(value).length === 0,
    }
    return read
  }

  /** `data-placeholder` on the only block of an empty document, and `data-selected` on a selected entity or unknown node. */
  const decorations = (state: EditorState): DecorationSet | null => {
    const found: Decoration[] = []
    const first = state.doc.firstChild
    if (
      placeholder &&
      first &&
      state.doc.childCount === 1 &&
      first.isTextblock &&
      first.content.size === 0
    ) {
      found.push(Decoration.node(0, first.nodeSize, { 'data-placeholder': placeholder }))
    }
    const sel = state.selection
    if (sel instanceof NodeSelection && sel.node.isAtom) {
      found.push(Decoration.node(sel.from, sel.to, { 'data-selected': '' }))
    }
    return found.length ? DecorationSet.create(state.doc, found) : null
  }

  /** Event handlers on the element: focus, composition, links that are not followed, and the browser's own formatting refused. */
  const domPlugin = new Plugin({
    props: {
      handleDOMEvents: {
        focus: (view) => {
          if (ending) return false
          if (!focused) {
            focused = true
            view.dispatch(view.state.tr.setMeta(FOCUS, true))
            callbacks.onFocus?.()
          }
          return false
        },
        blur: (view) => {
          if (ending) return false
          if (focused) {
            focused = false
            view.dispatch(view.state.tr.setMeta(FOCUS, false))
            callbacks.onBlur?.()
          }
          return false
        },
        compositionend: () => {
          // ProseMirror ends its composition after this handler; the
          // suggestion and a deferred `setValue` follow once it has.
          void Promise.resolve().then(afterComposition)
          return false
        },
        click: (_view, event) => {
          const target = event.target as Element | null
          if (target?.closest?.('a')) event.preventDefault()
          return false
        },
        auxclick: (_view, event) => {
          const target = event.target as Element | null
          if (target?.closest?.('a')) event.preventDefault()
          return false
        },
        beforeinput: (view, event) => {
          const type = (event as InputEvent).inputType ?? ''
          if (type.startsWith('format')) {
            event.preventDefault()
            return true
          }
          if (type === 'historyUndo' || type === 'historyRedo') {
            event.preventDefault()
            const command = type === 'historyUndo' ? undoCommand : redoCommand
            command(view.state, view.dispatch, view)
            return true
          }
          return false
        },
      },
    },
  })

  /** A browser edit a read-only field refuses before it happens. */
  const refuse = (_view: EditorView, event: Event) => {
    if (!caretOnly()) return false
    event.preventDefault()
    return true
  }
  /** A drag over a read-only field: no drop. */
  const refuseDrop = (_view: EditorView, event: DragEvent) => {
    if (!caretOnly()) return false
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'none'
    return true
  }

  /**
   * First of the plugins, so its handlers run before the others'. In a
   * read-only field with a caret, it refuses every transaction that changes
   * the document unless one of the editor's methods made it (or ProseMirror
   * appended it to one), and every browser edit before it happens. In any
   * field, typing while a node of a later version is selected as one unit
   * writes a new paragraph after it, so a keystroke never replaces what this
   * version cannot show.
   */
  const guardPlugin = new Plugin({
    filterTransaction: (tr) => {
      if (!caretOnly() || !tr.docChanged) return true
      const root = (tr.getMeta('appendedTransaction') as Transaction | undefined) ?? tr
      return root.getMeta(APP) === true || root.getMeta(SILENT) === true
    },
    props: {
      handleDOMEvents: {
        beforeinput: refuse,
        paste: refuse,
        cut: refuse,
        drop: refuse,
        dragover: refuseDrop,
        dragenter: refuseDrop,
      },
      handleTextInput: (view, _from, _to, text) => {
        const selection = view.state.selection
        if (
          text === '' ||
          !(selection instanceof NodeSelection) ||
          selection.node.type.name !== NODE.unknownBlock
        )
          return false
        const paragraph = view.state.schema.nodes[NODE.paragraph]
        if (paragraph === undefined) return false
        const at = selection.to
        const tr = view.state.tr.insert(at, paragraph.create(null, view.state.schema.text(text)))
        tr.setSelection(TextSelection.create(tr.doc, at + 1 + text.length))
        view.dispatch(tr.scrollIntoView())
        return true
      },
    },
  })

  const plugins = (): Plugin[] => [
    guardPlugin,
    ...keyPlugins(schema, formats, {
      suggestionOpen: () => published?.suggestion !== null && published?.suggestion !== undefined,
      onSuggestionKey: () => callbacks.onSuggestionKey,
      onSubmit: () => callbacks.onSubmit,
      onLinkRequest: () => callbacks.onLinkRequest,
      readOnly: caretOnly,
    }),
    rulesPlugin(schema),
    stickyMarksPlugin(),
    history(),
    suggestionPlugin(() => entities),
    pastePlugin(schema, { onFiles: () => callbacks.onFiles }),
    domPlugin,
    annotationsPlugin(() => drawing),
  ]

  const configure = (doc: RichTextDocument) => {
    schema = buildSchema({ formats, entities, classes: options.classes, headingLevel })
    allowed = toFormatSet(formats)
    commands = formatCommands(schema)
    held = isRichTextNewer(doc) ? doc : null
    const editorDoc = toEditorDoc(schema, admit(doc))
    readOf(editorDoc)
    return EditorState.create({
      schema,
      doc: editorDoc,
      selection: caretAt(editorDoc, 'start'),
      plugins: plugins(),
    })
  }

  const currentValue = (): RichTextDocument => held ?? readOf(view.state.doc).value

  // The token is followed while an input method composes, so a phone's keyboard, which composes
  // every word, shows the list as the word is typed.
  const suggestionFor = (state: EditorState): RichTextSuggestion | null => {
    const token = tokenOf(state)
    if (!token || token.dismissed || !focused || !writable()) return null
    let rect = ZERO_RECT
    try {
      const coords = view.coordsAtPos(token.from, 1)
      rect = { top: coords.top, bottom: coords.bottom, left: coords.left, right: coords.right }
    } catch {
      // A view that is not laid out has no coordinates; the member places the list at the field.
    }
    return { kind: token.kind, trigger: token.trigger, query: token.query, key: token.key, rect }
  }

  const stateNow = (): RichTextEditorState => {
    const { empty, length } = readOf(view.state.doc)
    return computeState(view.state, allowed, commands, {
      empty,
      length,
      focused,
      suggestion: suggestionFor(view.state),
    })
  }

  const publish = () => {
    if (destroyed) return
    const next = stateNow()
    if (sameState(published, next)) return
    published = next
    callbacks.onState?.(next)
  }

  const announce = (pending: PendingEvent, before: EditorState, after: EditorState) => {
    const onEvent = callbacks.onEvent
    if (!onEvent) return
    if (pending.type !== 'toggle') {
      onEvent(pending)
      return
    }
    const was = activeFormats(before)[pending.format]
    const is = activeFormats(after)[pending.format]
    if (was === is) return
    onEvent({ type: 'format', format: pending.format, active: Boolean(is) })
  }

  const dispatchTransaction = (tr: Transaction) => {
    if (destroyed) return
    const before = view.state
    const silent = tr.getMeta(SILENT) === true
    const next = before.apply(tr)
    view.updateState(next)
    const changed = next.doc !== before.doc
    if (changed && !silent && held === null) {
      const previous = readOf(before.doc).text
      const current = readOf(next.doc)
      if (current.text !== previous) callbacks.onChange?.(current.value)
    }
    publish()
    const pending = tr.getMeta(EVENT_META) as PendingEvent | undefined
    if (pending && !silent && (changed || pending.type === 'toggle'))
      announce(pending, before, next)
    // ProseMirror also ends a composition without `compositionend` (a key that is not composing
    // arrives); what waited for it follows.
    if ((pendingValue || pendingEntity) && !view.composing)
      void Promise.resolve().then(afterComposition)
  }

  const attributesFor = (): Record<string, string> => {
    const out: Record<string, string> = {}
    for (const [name, v] of Object.entries(attributes)) {
      if (v !== undefined && name !== 'contenteditable' && name !== 'class') out[name] = v
    }
    if (focused) out['data-focused'] = ''
    // Read-only with a caret: a touch device opens no keyboard, and no word is marked misspelt.
    if (caretOnly()) {
      out['inputmode'] = 'none'
      out['spellcheck'] = 'false'
    }
    return out
  }

  /** An attribute the member asked to remove, which ProseMirror never set, is removed by hand. */
  const removeUnsetAttributes = () => {
    for (const [name, v] of Object.entries(attributes)) {
      if (v === undefined) element.removeAttribute(name)
    }
  }

  const initial = configure(options.value)
  const view: EditorView = new EditorView(
    { mount: element },
    {
      state: initial,
      editable: () => editable || caretOnly(),
      attributes: attributesFor,
      decorations,
      dispatchTransaction,
    },
  )
  removeUnsetAttributes()
  published = stateNow()

  /**
   * The range of the document that differs from `next`, replaced so the
   * selection and the history map through it. When only marks differ, the
   * marks are changed in place and no position moves.
   */
  const replaceWith = (next: PMNode) => {
    const current = view.state.doc
    if (sameButMarks(current, next)) {
      const tr = view.state.tr
      copyMarks(tr, next)
      if (tr.doc.eq(next)) {
        view.dispatch(tr.setMeta('addToHistory', false).setMeta(SILENT, true))
        return
      }
    }
    const start = current.content.findDiffStart(next.content)
    if (start === null) return
    const end = current.content.findDiffEnd(next.content)
    let endA = end ? end.a : current.content.size
    let endB = end ? end.b : next.content.size
    const overlap = start - Math.min(endA, endB)
    if (overlap > 0) {
      endA += overlap
      endB += overlap
    }
    let tr = view.state.tr.replace(start, endA, next.slice(start, endB))
    if (!tr.doc.eq(next)) tr = view.state.tr.replaceWith(0, current.content.size, next.content)
    tr.setMeta('addToHistory', false).setMeta(SILENT, true)
    view.dispatch(tr)
  }

  /**
   * The value compared is the one this editor would emit for `input`: read
   * through the schema and back. A value as given may hold a format the field
   * does not allow, or not be in normal form, so comparing the raw value would
   * replace the document on every render of a member that passes back what it
   * was given.
   */
  const applyValue = (input: RichTextDocument) => {
    // The same value over the same document, or the value this editor gave: nothing to read.
    const drawn = readOf(view.state.doc)
    const same = applied?.input === input && applied.doc === view.state.doc
    if (held === null ? input === drawn.value || same : input === held) {
      applied = { input, doc: view.state.doc }
      return
    }
    const wasHeld = held !== null
    held = isRichTextNewer(input) ? input : null
    const next = toEditorDoc(schema, admit(input))
    if (JSON.stringify(fromEditorDoc(next)) !== drawn.text) replaceWith(next)
    applied = { input, doc: view.state.doc }
    // A document of a later format arriving or leaving changes whether the reader may edit.
    if (wasHeld !== (held !== null)) {
      view.setProps({})
      publish()
    }
  }

  /** The open token replaced by the entity and a space, or the entity at the selection. */
  const putEntity = (entity: Omit<RichTextEntity, 'type'>) => {
    const token = tokenOf(view.state)
    const open = token && !token.dismissed ? { from: token.from, to: token.to } : null
    run(entityCommand(schema, entity, open))
  }

  function afterComposition() {
    if (destroyed || view.composing) return
    if (pendingValue) {
      const next = pendingValue
      pendingValue = null
      applyValue(next)
    }
    if (pendingEntity) {
      const entity = pendingEntity
      pendingEntity = null
      putEntity(entity)
    }
    publish()
  }

  /**
   * Ends an input method's composition: focus leaves the element and comes
   * back, which commits the composed text in every engine. Neither move is a
   * focus change the member hears.
   */
  const endComposition = () => {
    if (element.ownerDocument.activeElement !== element) return
    ending = true
    try {
      element.blur()
      element.focus({ preventScroll: true })
    } finally {
      ending = false
    }
  }

  const rebuild = () => {
    const doc = currentValue()
    const { from, to } = view.state.selection
    const state = configure(doc)
    let next = state
    try {
      // The selection where it can be kept: a range that still fits, else a caret near its start.
      const size = state.doc.content.size
      const selection =
        to <= size && from !== to
          ? TextSelection.between(state.doc.resolve(from), state.doc.resolve(to))
          : caretNear(state.doc, from)
      next = state.apply(state.tr.setSelection(selection))
    } catch {
      next = state
    }
    view.updateState(next)
    publish()
  }

  /**
   * Runs one of the editor's methods: its transactions are the application's, which a read-only
   * field takes. A document of a later format takes none.
   */
  const run = (command: (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean) =>
    !destroyed && held === null && command(view.state, (tr) => view.dispatch(tr.setMeta(APP, true)))

  const editor: RichTextEditor = {
    getValue: () => currentValue(),
    setValue(input) {
      if (destroyed) return
      if (view.composing) {
        pendingValue = input
        return
      }
      applyValue(input)
    },
    getState: () => published ?? stateNow(),
    update(change) {
      if (destroyed) return
      const { formats: nextFormats, entities: nextEntities, editable: nextEditable } = change
      for (const key of Object.keys(change) as (keyof RichTextEditorUpdate)[]) {
        if (key.startsWith('on')) (callbacks as Record<string, unknown>)[key] = change[key]
      }
      if (change.attributes !== undefined) attributes = { ...change.attributes }
      if ('placeholder' in change) placeholder = change.placeholder
      if (nextEditable !== undefined) editable = nextEditable
      if ('readOnly' in change) readOnly = change.readOnly === true
      if ('annotations' in change || 'activeAnnotation' in change) {
        const drawn = 'annotations' in change ? change.annotations : drawing.drawn
        const active = 'activeAnnotation' in change ? change.activeAnnotation : drawing.active
        // A new object only for a new drawing, so a member that passes the same
        // list on every render does not make the annotations plugin draw again.
        if (JSON.stringify(drawn) !== JSON.stringify(drawing.drawn) || active !== drawing.active) {
          drawing = {
            ...drawing,
            drawn: drawn === undefined ? undefined : [...drawn],
            active,
          }
        }
      }
      // The schema depends on which formats and kinds there are, not on their order.
      const schemaChanged =
        (nextFormats !== undefined && !sameEntries(nextFormats, formats)) ||
        (nextEntities !== undefined && !sameEntries(kindKeys(nextEntities), kindKeys(entities)))
      if (nextFormats !== undefined) formats = [...nextFormats]
      if (nextEntities !== undefined) entities = [...nextEntities]
      if (schemaChanged) rebuild()
      else view.setProps({})
      removeUnsetAttributes()
      publish()
    },
    focus(at) {
      if (destroyed) return
      if (at) view.dispatch(view.state.tr.setSelection(caretAt(view.state.doc, at)))
      // ProseMirror focuses only a view it edits; a disabled field's element takes focus itself.
      if (editable || caretOnly()) view.focus()
      else element.focus({ preventScroll: true })
    },
    toggle(format) {
      if (!allowed.has(format)) return false
      return run(commands[format])
    },
    setHeading(level) {
      if (
        level === 0 ? !allowed.has('heading') && !allowed.has('codeBlock') : !allowed.has('heading')
      )
        return false
      return run(headingCommand(schema, level))
    },
    setLink(href) {
      if (!allowed.has('link')) return false
      return run(linkCommand(schema, href))
    },
    undo: () => run(undoCommand),
    redo: () => run(redoCommand),
    insertText(text) {
      run(textCommand(text))
    },
    insertEntity(entity) {
      if (destroyed || held !== null) return
      // A pick while an input method composes waits for the composition to end, which the
      // editor brings about, so the input method commits no characters after the entity.
      if (view.composing) {
        pendingEntity = entity
        endComposition()
        return
      }
      putEntity(entity)
    },
    // The application's act, not the reader's typing: both work on a field that
    // is not editable, where a reviewer comments on what they may not change.
    annotate: (id) => run(annotateCommand(id)),
    removeAnnotation: (id) => run(removeAnnotationCommand(id)),
    selectionRect: () => (destroyed ? null : selectionRect(view)),
    tokenRect: () => (destroyed ? null : (suggestionFor(view.state)?.rect ?? null)),
    dismissSuggestion() {
      const token = tokenOf(view.state)
      if (destroyed || !token || token.dismissed) return
      const [key, meta] = dismissMeta()
      view.dispatch(view.state.tr.setMeta(key, meta))
    },
    clear() {
      if (destroyed || held !== null || isBareDoc(view.state.doc)) return
      const paragraph = schema.nodes[NODE.paragraph]!.create()
      const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, paragraph)
      tr.setSelection(TextSelection.create(tr.doc, 1))
      view.dispatch(tr.scrollIntoView().setMeta(APP, true))
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      view.destroy()
      const keep = new Map(originalAttributes)
      for (const name of Array.from(element.attributes, (a) => a.name)) {
        if (!keep.has(name)) element.removeAttribute(name)
      }
      for (const [name, v] of keep) {
        if (element.getAttribute(name) !== v) element.setAttribute(name, v)
      }
      element.replaceChildren()
    },
  }
  return editor
}
