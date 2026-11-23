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
  isRichTextEmpty,
  restrictRichText,
  richTextEquals,
  richTextLength,
} from '../rich-text/index'
import type { RichTextDocument, RichTextFormat } from '../rich-text/types'
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
 * on every render keeps the caret and the undo history.
 *
 * Nothing here reads `window`, `document` or `navigator` until the function
 * runs, so the module can be imported on a server.
 */

/** Metadata on a transaction `setValue` or a rebuild made: no `onChange`, no announcement. */
const SILENT = 'polymorphRichTextSilent'
/** Metadata on the transaction that records a focus change. */
const FOCUS = 'polymorphRichTextFocus'

type Callbacks = Omit<
  RichTextEditorUpdate,
  'formats' | 'entities' | 'editable' | 'attributes' | 'placeholder'
>

const ZERO_RECT: RichTextRect = { top: 0, bottom: 0, left: 0, right: 0 }

function toFormatSet(formats: readonly RichTextFormat[]): ReadonlySet<RichTextFormat> {
  return new Set(formats)
}

export function createRichTextEditor(options: RichTextEditorOptions): RichTextEditor {
  const element = options.element
  const headingLevel = options.headingLevel ?? 2
  const originalAttributes = Array.from(element.attributes, (a) => [a.name, a.value] as const)

  let formats = [...options.formats]
  let entities = [...options.entities]
  let editable = options.editable
  let attributes: Readonly<Record<string, string | undefined>> = { ...options.attributes }
  let placeholder = options.placeholder
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
  let destroyed = false

  let schema: Schema
  let allowed: ReadonlySet<RichTextFormat>
  let commands: FormatCommands
  let value: RichTextDocument
  let valueDoc: PMNode

  /** The document a value becomes in this field: read tolerantly and restricted to the formats. */
  const admit = (input: RichTextDocument): RichTextDocument => restrictRichText(input, formats)

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
          if (!focused) {
            focused = true
            view.dispatch(view.state.tr.setMeta(FOCUS, true))
            callbacks.onFocus?.()
          }
          return false
        },
        blur: (view) => {
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

  const plugins = (): Plugin[] => [
    ...keyPlugins(schema, formats, {
      suggestionOpen: () => published?.suggestion !== null && published?.suggestion !== undefined,
      onSuggestionKey: () => callbacks.onSuggestionKey,
      onSubmit: () => callbacks.onSubmit,
      onLinkRequest: () => callbacks.onLinkRequest,
    }),
    rulesPlugin(schema),
    stickyMarksPlugin(),
    history(),
    suggestionPlugin(() => entities),
    pastePlugin(schema, { onFiles: () => callbacks.onFiles }),
    domPlugin,
  ]

  const configure = (doc: RichTextDocument) => {
    schema = buildSchema({ formats, entities, classes: options.classes, headingLevel })
    allowed = toFormatSet(formats)
    commands = formatCommands(schema)
    value = admit(doc)
    valueDoc = toEditorDoc(schema, value)
    value = fromEditorDoc(valueDoc)
    return EditorState.create({ schema, doc: valueDoc, plugins: plugins() })
  }

  const currentValue = (): RichTextDocument => {
    const doc = view.state.doc
    if (doc !== valueDoc) {
      valueDoc = doc
      value = fromEditorDoc(doc)
    }
    return value
  }

  const suggestionFor = (state: EditorState): RichTextSuggestion | null => {
    const token = tokenOf(state)
    if (!token || token.dismissed || !focused || !editable || view.composing) return null
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
    const doc = currentValue()
    return computeState(view.state, allowed, commands, {
      empty: isRichTextEmpty(doc),
      length: richTextLength(doc),
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
    const previous = silent ? value : currentValue()
    const next = before.apply(tr)
    view.updateState(next)
    const changed = next.doc !== before.doc
    if (changed && !silent) {
      const current = currentValue()
      if (!richTextEquals(previous, current)) callbacks.onChange?.(current)
    }
    publish()
    const pending = tr.getMeta(EVENT_META) as PendingEvent | undefined
    if (pending && !silent && (changed || pending.type === 'toggle'))
      announce(pending, before, next)
  }

  const attributesFor = (): Record<string, string> => {
    const out: Record<string, string> = {}
    for (const [name, v] of Object.entries(attributes)) {
      if (v !== undefined && name !== 'contenteditable' && name !== 'class') out[name] = v
    }
    if (focused) out['data-focused'] = ''
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
      editable: () => editable,
      attributes: attributesFor,
      decorations,
      dispatchTransaction,
    },
  )
  removeUnsetAttributes()
  published = stateNow()

  /** The range of the document that differs from `next`, replaced so the selection and the history map through it. */
  const replaceWith = (next: PMNode) => {
    const current = view.state.doc
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
   * through the schema and back. The model's normal form keeps what the schema
   * leaves out (bold in a heading, bold beside inline code), so comparing the
   * raw value would replace the document on every render of a member that
   * passes back what it was given.
   */
  const applyValue = (input: RichTextDocument) => {
    const next = toEditorDoc(schema, admit(input))
    if (richTextEquals(fromEditorDoc(next), currentValue())) return
    replaceWith(next)
  }

  function afterComposition() {
    if (destroyed || view.composing) return
    if (pendingValue) {
      const next = pendingValue
      pendingValue = null
      applyValue(next)
    }
    publish()
  }

  const rebuild = () => {
    const doc = currentValue()
    const selection = view.state.selection
    const state = configure(doc)
    let next = state
    const pos = Math.min(selection.from, state.doc.content.size)
    try {
      next = state.apply(state.tr.setSelection(Selection.near(state.doc.resolve(pos))))
    } catch {
      next = state
    }
    view.updateState(next)
    publish()
  }

  const run = (command: (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean) =>
    !destroyed && command(view.state, view.dispatch)

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
      const schemaChanged =
        (nextFormats !== undefined && nextFormats.join() !== formats.join()) ||
        (nextEntities !== undefined &&
          nextEntities.map((e) => `${e.kind}:${e.trigger}`).join() !==
            entities.map((e) => `${e.kind}:${e.trigger}`).join())
      if (nextFormats !== undefined) formats = [...nextFormats]
      if (nextEntities !== undefined) entities = [...nextEntities]
      if (schemaChanged) rebuild()
      else view.setProps({})
      removeUnsetAttributes()
      publish()
    },
    focus(at) {
      if (destroyed) return
      if (at) {
        const selection =
          at === 'start' ? Selection.atStart(view.state.doc) : Selection.atEnd(view.state.doc)
        view.dispatch(view.state.tr.setSelection(selection))
      }
      // ProseMirror focuses only an editable view; a read-only field is still focusable and selectable.
      if (editable) view.focus()
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
      const token = tokenOf(view.state)
      const open = token && !token.dismissed ? { from: token.from, to: token.to } : null
      run(entityCommand(schema, entity, open))
    },
    dismissSuggestion() {
      const token = tokenOf(view.state)
      if (destroyed || !token || token.dismissed) return
      const [key, meta] = dismissMeta()
      view.dispatch(view.state.tr.setMeta(key, meta))
    },
    clear() {
      if (destroyed || isBareDoc(view.state.doc)) return
      const paragraph = schema.nodes[NODE.paragraph]!.create()
      const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, paragraph)
      tr.setSelection(TextSelection.create(tr.doc, 1))
      view.dispatch(tr.scrollIntoView())
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
