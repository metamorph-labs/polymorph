import type {
  RichTextDocument,
  RichTextEntity,
  RichTextFormat,
  RichTextRange,
} from '../rich-text/types'

/**
 * The editor's contract: what a member gives the editor and what it gets back
 * (`design/components/rich-text-input.md`).
 *
 * The editor edits a rich-text document inside an element the member rendered.
 * It owns the caret, the keys, the history, the paste and the document's DOM
 * inside that element, and nothing outside it: the toolbar, the suggestion
 * list, the link form and every word a person reads are the member's. No type
 * here names the library the editor is built on, so a member written against
 * this file does not change when that library does.
 */

/** A kind of entity the reader can insert by typing its trigger. */
export interface RichTextEditorEntityKind {
  /** The application's name for the kind: `user`, `issue`. */
  kind: string
  /** The one character that opens the suggestions: `@`, `#`. */
  trigger: string
}

/**
 * The recipe's class names for what the editor draws. The engine holds no
 * stylesheet, so each element it writes takes its class from the member.
 */
export interface RichTextEditorClasses {
  paragraph: string
  /** By document level: index 0 is level 1. */
  heading: readonly [string, string, string]
  bulletList: string
  orderedList: string
  listItem: string
  blockquote: string
  codeBlock: string
  /** The `code` element inside a code block. */
  codeBlockText: string
  bold: string
  italic: string
  strike: string
  code: string
  link: string
  entity: string
  /** Each drawn fragment of an annotation: text, or an entity. */
  annotation: string
  /** A node of a type this version does not know, kept as one unit. */
  unknown: string
}

/** What a live region announces. The editor names the event and the member writes the words. */
export type RichTextEditorEvent =
  | { type: 'format'; format: Exclude<RichTextFormat, 'link'>; active: boolean }
  | { type: 'heading'; level: 0 | 1 | 2 | 3 }
  | { type: 'link'; active: boolean }
  | { type: 'entity'; entity: RichTextEntity }
  | { type: 'undo' }
  | { type: 'redo' }

/** The keys a suggestion list takes while it is open. */
export type RichTextSuggestionKey = 'ArrowDown' | 'ArrowUp' | 'Enter' | 'Tab' | 'Escape'

/** A rectangle in viewport coordinates, as `getBoundingClientRect` gives. */
export interface RichTextRect {
  top: number
  bottom: number
  left: number
  right: number
}

/**
 * The trigger token the caret is in, while the field has focus and is
 * editable. It is reported while an input method composes too, with the query
 * as composed so far, because a phone's keyboard composes every word; the
 * list's keys are never taken from a composing input method, and a pick made
 * while one composes waits for the composition to end (`insertEntity`).
 */
export interface RichTextSuggestion {
  /** The entity kind whose trigger opened it. */
  kind: string
  trigger: string
  /** The text typed after the trigger, up to the caret. */
  query: string
  /** One value per token: it changes when the caret enters another token, and not when the query does. */
  key: string
  /** Where the token starts on screen, for the list's place. */
  rect: RichTextRect
}

export interface RichTextEditorState {
  /** No entity, and no text but whitespace. */
  empty: boolean
  /** The document's length in code points (`richTextLength`). */
  length: number
  focused: boolean
  /** Whether the selection is a caret. */
  collapsed: boolean
  /** The text in the selection, for a link form's first value. Empty for a caret. */
  selectedText: string
  /** The selection as a range of the document's plain text. */
  range: RichTextRange
  /** The annotations at the selection, drawn or not: the one that starts last comes first. */
  annotations: string[]
  /** The formats on at the selection. `link` is the target of the link the selection is in. */
  active: {
    bold: boolean
    italic: boolean
    strike: boolean
    code: boolean
    link: string | null
    /** 0 outside a heading. */
    heading: 0 | 1 | 2 | 3
    bulletList: boolean
    orderedList: boolean
    blockquote: boolean
    codeBlock: boolean
  }
  /** Whether each command applies at the selection: no mark inside a code block, nothing to undo. */
  can: Record<RichTextFormat, boolean> & { undo: boolean; redo: boolean }
  suggestion: RichTextSuggestion | null
}

export interface RichTextEditorOptions {
  /** The element the member rendered for the document. The editor writes inside it and sets its editing attributes. */
  element: HTMLElement
  /**
   * The document. One of a later format than this version reads
   * (`isRichTextNewer`) is drawn as far as this version reads it and held as it
   * was given: the field is read-only with a caret (`readOnly`) whatever
   * `editable` says, unless it is disabled; the editor's methods that edit
   * refuse it (`annotate` and `removeAnnotation` return false, `insertText`,
   * `insertEntity` and `clear` do nothing); `onChange` is never called; and
   * `getValue()` returns the value as it was given, so nothing this version
   * writes can replace it. A value of this version set later (`setValue`)
   * ends it.
   */
  value: RichTextDocument
  /** What the field allows. A document is restricted to them when it enters the editor. */
  formats: readonly RichTextFormat[]
  entities: readonly RichTextEditorEntityKind[]
  classes: RichTextEditorClasses
  /** False for a field that is read-only or disabled. */
  editable: boolean
  /**
   * With `editable` false: true keeps a caret and the keyboard's selection in
   * the element, for a field that is read-only but not disabled. The reader
   * moves the caret, selects with Shift and the arrows, Home and End, Mod+A and
   * a double press, copies, and submits with Mod+Enter; nothing the reader does
   * changes the document (typing, Enter, Backspace, paste, cut, drop, a typed
   * shortcut, a format key, undo, an input method's text). The element stays
   * `contenteditable`, so the browser draws the caret, with `inputmode="none"`,
   * so a touch device opens no keyboard, and `spellcheck="false"`. The
   * member's own `aria-readonly` says it is read-only. The editor's methods
   * still change the document, because they are the application's acts. False
   * or absent: the element is not editable and holds no caret, as a disabled
   * field's. No effect while `editable` is true.
   */
  readOnly?: boolean
  /**
   * Attributes the editor keeps on `element` beside its own: the member's
   * `id`, `role`, `aria-*` and `tabindex`. An `undefined` value removes the
   * attribute.
   */
  attributes: Readonly<Record<string, string | undefined>>
  /** Drawn while the document is empty, through `data-placeholder` on the first block. */
  placeholder?: string
  /** The page level the document's level 1 heading is drawn at. Default 2. */
  headingLevel?: 2 | 3 | 4
  /**
   * The annotations drawn. `undefined` draws every one the document holds. An
   * annotation that is not drawn stays in the document and leaves no class and
   * no attribute on its text.
   */
  annotations?: readonly string[]
  /** The drawn annotation whose fragments carry `data-active`. */
  activeAnnotation?: string
  /** The document changed by the reader's act or a command. Not called for `setValue`. */
  onChange: (value: RichTextDocument) => void
  /** Called after each change of what `RichTextEditorState` holds. */
  onState: (state: RichTextEditorState) => void
  onEvent?: (event: RichTextEditorEvent) => void
  /** Mod+Enter. Without it the key is the editor's own. */
  onSubmit?: () => void
  /** Mod+K, when links are allowed: the member opens its link form. */
  onLinkRequest?: () => void
  /** A key the open suggestion list may take. Returns whether it took it. */
  onSuggestionKey?: (key: RichTextSuggestionKey) => boolean
  /** Files pasted or dropped. The editor inserts nothing for them. */
  onFiles?: (files: File[]) => void
  onFocus?: () => void
  onBlur?: () => void
}

/** The options a member may change without making a new editor. */
export type RichTextEditorUpdate = Partial<
  Pick<
    RichTextEditorOptions,
    | 'formats'
    | 'entities'
    | 'editable'
    | 'readOnly'
    | 'attributes'
    | 'placeholder'
    | 'annotations'
    | 'activeAnnotation'
    | 'onChange'
    | 'onState'
    | 'onEvent'
    | 'onSubmit'
    | 'onLinkRequest'
    | 'onSuggestionKey'
    | 'onFiles'
    | 'onFocus'
    | 'onBlur'
  >
>

export interface RichTextEditor {
  /** The current document, in normal form; a document of a later format as it was given. */
  getValue(): RichTextDocument
  /** Replaces the document when `value` differs from it. Adds no undo step and calls no `onChange`. */
  setValue(value: RichTextDocument): void
  getState(): RichTextEditorState
  update(options: RichTextEditorUpdate): void
  /** Focus the document, with the caret where it was, or at an end. */
  focus(at?: 'start' | 'end'): void
  /** Turns a mark or a block format on or off at the selection. Returns whether it applied. */
  toggle(format: Exclude<RichTextFormat, 'link' | 'heading'>): boolean
  /** Sets the selected blocks to a heading of `level`, or to paragraphs with 0. */
  setHeading(level: 0 | 1 | 2 | 3): boolean
  /**
   * Links the selection to `href`, or removes the link the selection is in
   * with `null`. With a caret outside a link it inserts `href` as linked text.
   * Refuses a target `richTextHref` refuses, and returns false.
   */
  setLink(href: string | null): boolean
  undo(): boolean
  redo(): boolean
  /** Inserts text at the selection, in place of what is selected. */
  insertText(text: string): void
  /**
   * Replaces the open suggestion token with the entity and a space, or inserts
   * it at the selection. While an input method composes, the editor ends the
   * composition (focus leaves the element and comes back, which commits it,
   * with no `onBlur` or `onFocus`) and inserts the entity once it has ended,
   * so the input method writes no stray characters after it.
   */
  insertEntity(entity: Omit<RichTextEntity, 'type'>): void
  /**
   * Anchors `id` to the selection: every text and entity in it takes the
   * annotation. Returns false for a caret, and for a selection that holds
   * nothing an annotation can sit on (a code block's text). An edit: `onChange`
   * is called and undo reverses it.
   */
  annotate(id: string): boolean
  /** Removes every mark of the annotation `id`. Returns false when the document holds none. An edit. */
  removeAnnotation(id: string): boolean
  /**
   * Where the selection is on screen now, for a bar the member places at it:
   * the box around every selected line. Null for a caret.
   */
  selectionRect(): RichTextRect | null
  /**
   * Where the open suggestion's token starts on screen now, as
   * `state.suggestion.rect` was when it was published, for a list the member
   * keeps at the token as the page scrolls. Null while no suggestion is open.
   */
  tokenRect(): RichTextRect | null
  /** Closes the suggestion for the token the caret is in. It stays closed while the caret is in that token. */
  dismissSuggestion(): void
  /** Empties the document, as the reader's own act: `onChange` is called and undo restores it. */
  clear(): void
  /**
   * Removes the editor from the element: the element's attributes go back to
   * the ones it had when the editor was made, and the document's DOM the
   * editor wrote inside it is removed, so the element is left empty.
   */
  destroy(): void
}
