'use client'

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from 'react'
import { useFilter } from 'react-aria'

import {
  createRichTextEditor,
  emptyRichText,
  focusOnLabelPress,
  followSelectionBar,
  Icon,
  type IconRole,
  idPart,
  isRichTextEmpty,
  isRichTextNewer,
  memberAttr,
  placeTokenList,
  RICH_TEXT_FORMATS,
  type RichTextDocument,
  type RichTextEditor,
  type RichTextEditorClasses,
  type RichTextEditorEntityKind,
  type RichTextEditorEvent,
  type RichTextEditorState,
  type RichTextFormat,
  type RichTextSuggestionKey,
  richTextFromText,
  richTextHref,
  richTextLength,
  richTextPlainText,
  serializeRichText,
  useAgentMember,
  useControlRef,
} from '@polymorph/react'
import styles from '@polymorph/recipes/controls/rich-text-input.module.css'

import { Menu, type MenuEntry } from '../overlays/Menu'
import { Popover, PopoverPanelMember } from '../overlays/Popover'
import { Separator } from '../structure/Separator'
import { Skeleton } from '../structure/Skeleton'
import { Button } from './Button'
import { FormField } from './FormField'
import { Input } from './Input'
import { SelectionBar, useToolbarKeys } from './selection-bar'

/**
 * A field that holds a rich-text document: a comment, an issue's description,
 * a note (`design/components/rich-text-input.md`). The person formats the text
 * with the toolbar, the keys or typed shortcuts, mentions people and things
 * the app suggests, and the field gives back the document model's JSON
 * (`@polymorph/engine/rich-text`), which the app stores and RichTextContent
 * draws.
 *
 * It is not Textarea, which holds plain text, and not PromptInput, whose prompt
 * stays plain text because a model reads it. It is not RichTextContent either,
 * which shows a stored document and loads no editor.
 *
 * The editor is the engine's (`@polymorph/engine/rich-text-editor`), mounted on
 * the surface this member renders, in an effect, so a server renders the frame,
 * the toolbar and an empty surface. The editor owns the caret, the keys, the
 * history and the paste inside the surface; this member owns everything a
 * person reads: the toolbar, the link form, the suggestion list, the count,
 * the footer and every announcement.
 */

export type RichTextInputMinRows = 1 | 3 | 6 | 12
export type RichTextInputMaxRows = 6 | 12 | 24 | 'none'
export type RichTextToolbarPlacement = 'fixed' | 'selection'

/**
 * A stretch of the document's plain text, the model's `RichTextRange`, read
 * from the editor's state.
 */
type RichTextRange = RichTextEditorState['range']

/** One suggestion: a person, an issue, a file. */
export interface RichTextEntityOption {
  /** The app's id, which the inserted entity carries. */
  id: string
  label: string
  /** A second line under the label. */
  description?: string
  /** A decorative glyph before the label. */
  icon?: IconRole
  /** The app's own drawing before the label, such as an Avatar. Decorative: the label names the option. */
  leading?: ReactNode
  /** The words the entity reads as in the document. Default: the trigger and the label, `@Ada Lovelace`. */
  entityLabel?: string
}

/** A kind of entity the field suggests while the person types its trigger. */
export interface RichTextEntitySource {
  /** The app's stable name for the kind: `user`, `issue`. */
  kind: string
  /** The one character that opens the list: `@`, `#`. */
  trigger: string
  /** The list's accessible name: `People`. */
  label: string
  options: RichTextEntityOption[]
  /** Combobox's filter. `false` means the app filters, and its options are shown as given. */
  filter?: 'contains' | 'startsWith' | false
  /** The app is loading options: skeleton rows under the options. */
  loading?: boolean
  /** The app could not load: the list's one row and the status say this. */
  error?: string
  /** Called with the typed query when the list opens and each time the query changes. */
  onQueryChange?: (query: string) => void
}

/** The selection as the app's controls read it. */
export interface RichTextInputSelection {
  /** True for a caret. */
  empty: boolean
  /** The selected text, an entity as its label. */
  text: string
  /** The selection in the document's plain text (`RichTextRange`). */
  range: RichTextRange
}

/**
 * The field, handed to the app's toolbar, selection actions and footer, and to
 * `onSubmit`. Its values are the field as it was drawn; its methods act on
 * the field as it is now.
 */
export interface RichTextInputEditor {
  /** Focus the text, with the caret where it was. */
  focus(): void
  /** Empties the document, as the person's own act: `onChange` is called and undo restores it. */
  clear(): void
  /** Inserts text at the selection, in place of what is selected: an emoji picker's pick. */
  insertText(text: string): void
  /** Inserts an entity at the selection. */
  insertEntity(entity: { kind: string; id: string; label: string }): void
  /** Anchors the annotation `id` to the selection. False for a caret. An edit: `onChange` is called. */
  annotate(id: string): boolean
  /** Removes every mark of the annotation `id`. False when the document holds none. An edit. */
  removeAnnotation(id: string): boolean
  readonly value: RichTextDocument
  readonly empty: boolean
  /** The length in code points, as `richTextLength` counts. */
  readonly length: number
  readonly overLimit: boolean
  /** Disabled, read-only or pending: the app's controls follow it. */
  readonly disabled: boolean
  readonly selection: RichTextInputSelection
}

/**
 * Every label and announcement, in the app's words. Each key is optional, and
 * one left out keeps its English default.
 */
export interface RichTextInputMessages {
  /** The fixed toolbar's name. Default: `Formatting`. */
  toolbar?: string
  /** The selection bar's name. Default: `Selection`. */
  selectionBar?: string
  /** Said once, when a selection bar first appears after the text took focus. */
  selectionBarReady?: string
  bold?: string
  italic?: string
  strike?: string
  code?: string
  link?: string
  /** The heading Menu's trigger. Default: `Text style`. */
  textStyle?: string
  paragraph?: string
  heading?: (level: 1 | 2 | 3) => string
  bulletList?: string
  orderedList?: string
  blockquote?: string
  codeBlock?: string
  undo?: string
  redo?: string
  /** The link form's name. Default: `Link`. */
  linkForm?: string
  /** The link form's field. Default: `Address`. */
  linkAddress?: string
  linkApply?: string
  linkRemove?: string
  /** The link form's error for an empty or unsafe address. */
  linkInvalid?: string
  /** A format turned on, by its name: `Bold on`. */
  formatOn?: (format: string) => string
  formatOff?: (format: string) => string
  linkAdded?: string
  linkRemoved?: string
  /** An entity inserted, by its label. */
  inserted?: (label: string) => string
  undone?: string
  redone?: string
  /** The count: `12 / 280`. */
  count?: (length: number, maxLength: number) => string
  /** The count over the limit, and the announcement when the text crosses it. */
  overLimit?: (over: number) => string
  /** Announced when the text comes back within the limit. */
  withinLimit?: string
  /** A submit refused because the field is empty. */
  submitEmpty?: string
  /** A submit refused because the text is over the limit. */
  submitOverLimit?: (over: number) => string
  /** A submit refused because the app is saving. */
  submitPending?: string
  /** The status while the suggestion list is open. Default: `1 suggestion`, `{count} suggestions`. */
  suggestions?: (count: number) => string
  /** The status while the app loads options. Default: `Loading suggestions…`. */
  loadingSuggestions?: string
  /** The list's one row, and the status, when no option matches. Default: `No results`. */
  noSuggestions?: string
}

export interface RichTextInputProps {
  value?: RichTextDocument
  defaultValue?: RichTextDocument
  onChange?: (value: RichTextDocument) => void
  /** What the field allows. Default: all ten. */
  formats?: RichTextFormat[]
  /** The kinds of entity the field suggests, each with its trigger. */
  entities?: RichTextEntitySource[]
  placeholder?: string
  /** The surface's minimum height, in body lines. Default 3. */
  minRows?: RichTextInputMinRows
  /** How tall the text grows before it scrolls, in body lines. Default 12. */
  maxRows?: RichTextInputMaxRows
  /** A soft limit in code points (`richTextLength`): draws the count, and marks the field invalid past it. */
  maxLength?: number
  invalid?: boolean
  disabled?: boolean
  readOnly?: boolean
  /** Focus at mount, with the caret at the end. For a surface that has already moved the person here. */
  autoFocus?: boolean
  /** Mod+Enter and the submit control. */
  onSubmit?: (value: RichTextDocument, editor: RichTextInputEditor) => void
  /** Draws the default footer's submit Button; needs `onSubmit`. */
  submitLabel?: string
  onCancel?: () => void
  /** Draws the default footer's cancel Button; needs `onCancel`. */
  cancelLabel?: string
  /** The app is saving: the submit shows loading, the field is read-only, and a submit is refused. */
  pending?: boolean
  /** The app's own controls at the toolbar's end: attach, emoji. */
  toolbar?: (editor: RichTextInputEditor) => ReactNode
  /** Where the format controls are: a fixed row over the text, or a bar at the selected text. */
  toolbarPlacement?: RichTextToolbarPlacement
  /** The app's controls for the selected text (comment, react), first in the selection bar. */
  selectionActions?: (editor: RichTextInputEditor) => ReactNode
  /** The app's own footer, in place of the default. */
  footer?: (editor: RichTextInputEditor) => ReactNode
  /** Files pasted or dropped. The field inserts nothing for them. */
  onFiles?: (files: File[]) => void
  /** The annotations drawn. Default: every one the document holds. */
  annotations?: string[]
  /** The drawn annotation that is active, such as the thread the app shows. */
  activeAnnotation?: string
  /** The caret entered a drawn annotation, or a press landed on one. */
  onAnnotationSelect?: (id: string) => void
  /** Focus entered the field: its text, its toolbars, the link form or the text style menu, from outside them. */
  onFocus?: () => void
  /** Focus left the field as a whole, for validation on leaving. Moving between its own parts is not leaving. */
  onBlur?: () => void
  /** The editable element. */
  controlRef?: Ref<HTMLDivElement>
  /** Every label and announcement, in the app's words. */
  messages?: RichTextInputMessages
  id?: string
  /** Adds a hidden input holding `serializeRichText(value)`. */
  name?: string
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-required'?: boolean
}

const DEFAULT_MESSAGES = {
  toolbar: 'Formatting',
  selectionBar: 'Selection',
  selectionBarReady: 'Controls for the selection are available: Alt+F10',
  bold: 'Bold',
  italic: 'Italic',
  strike: 'Strikethrough',
  code: 'Code',
  link: 'Link',
  textStyle: 'Text style',
  paragraph: 'Paragraph',
  heading: (level: 1 | 2 | 3) => `Heading ${level}`,
  bulletList: 'Bulleted list',
  orderedList: 'Numbered list',
  blockquote: 'Quote',
  codeBlock: 'Code block',
  undo: 'Undo',
  redo: 'Redo',
  linkForm: 'Link',
  linkAddress: 'Address',
  linkApply: 'Apply',
  linkRemove: 'Remove link',
  linkInvalid: 'Enter a web address, an email address or a phone number.',
  formatOn: (format: string) => `${format} on`,
  formatOff: (format: string) => `${format} off`,
  linkAdded: 'Link added',
  linkRemoved: 'Link removed',
  inserted: (label: string) => `${label} inserted`,
  undone: 'Undone',
  redone: 'Redone',
  count: (length: number, maxLength: number) => `${length} / ${maxLength}`,
  overLimit: (over: number) => `${over} ${over === 1 ? 'character' : 'characters'} over the limit`,
  withinLimit: 'Within the limit',
  submitEmpty: 'There is nothing to submit yet.',
  submitOverLimit: (over: number) =>
    `Remove ${over} ${over === 1 ? 'character' : 'characters'} to submit.`,
  submitPending: 'Still saving.',
  suggestions: (count: number) => (count === 1 ? '1 suggestion' : `${count} suggestions`),
  loadingSuggestions: 'Loading suggestions…',
  noSuggestions: 'No results',
} satisfies Required<RichTextInputMessages>

type Messages = typeof DEFAULT_MESSAGES

/** The app's messages over the defaults, a key it left out or set to `undefined` keeping its default. */
function withDefaults(messages: RichTextInputMessages | undefined): Messages {
  if (messages === undefined) return DEFAULT_MESSAGES
  const given = Object.fromEntries(
    Object.entries(messages).filter(([, text]) => text !== undefined),
  )
  return { ...DEFAULT_MESSAGES, ...given }
}

const cls = (name: string) => styles[name] ?? ''

/**
 * The recipe's classes for what the editor draws. Bold, italic and strike draw
 * the bare `strong`, `em` and `s` RichTextContent draws inside a paragraph,
 * which Text's recipe styles there, and the code inside a code block takes no
 * class, as CodeBlock's does, so each names no class of its own.
 */
const CLASSES: RichTextEditorClasses = {
  paragraph: cls('paragraph'),
  heading: [cls('heading1'), cls('heading2'), cls('heading3')],
  bulletList: cls('list'),
  orderedList: cls('list'),
  listItem: cls('item'),
  blockquote: cls('quote'),
  codeBlock: cls('codeBlock'),
  codeBlockText: '',
  bold: '',
  italic: '',
  strike: '',
  code: cls('code'),
  link: cls('link'),
  entity: cls('entity'),
  annotation: cls('annotation'),
  unknown: cls('unknown'),
}

type MarkFormat = 'bold' | 'italic' | 'strike' | 'code'
type BlockFormat = 'bulletList' | 'orderedList' | 'blockquote' | 'codeBlock'

const MARKS: readonly [MarkFormat, IconRole][] = [
  ['bold', 'bold'],
  ['italic', 'italic'],
  ['strike', 'strikethrough'],
  ['code', 'code'],
]

const BLOCKS: readonly [BlockFormat, IconRole][] = [
  ['bulletList', 'list-bulleted'],
  ['orderedList', 'list-numbered'],
  ['blockquote', 'quote'],
  ['codeBlock', 'code-block'],
]

const LEVELS: readonly (0 | 1 | 2 | 3)[] = [0, 1, 2, 3]

/** Three rows at option height, Combobox's loading rows. */
const SKELETON_ROWS = [0, 1, 2]

const NO_SOURCES: RichTextEntitySource[] = []
const EMPTY_RANGE: RichTextRange = { start: 0, end: 0 }

/** The formats in the toolbar's order, the same array while the same formats are given. */
function useFormats(formats: readonly RichTextFormat[] | undefined): RichTextFormat[] {
  const key = (formats ?? RICH_TEXT_FORMATS).join(' ')
  return useMemo(() => {
    const given = new Set(key.split(' '))
    return RICH_TEXT_FORMATS.filter((format) => given.has(format))
  }, [key])
}

/** The entity kinds, the same array while the same kinds and triggers are given. */
function useKinds(sources: readonly RichTextEntitySource[]): RichTextEditorEntityKind[] {
  const key = JSON.stringify(sources.map(({ kind, trigger }) => [kind, trigger]))
  return useMemo(
    () => (JSON.parse(key) as [string, string][]).map(([kind, trigger]) => ({ kind, trigger })),
    [key],
  )
}

/** A list of ids, the same array while the same ids are given. */
function useIds(ids: readonly string[] | undefined): string[] | undefined {
  const key = ids === undefined ? null : JSON.stringify(ids)
  return useMemo(() => (key === null ? undefined : (JSON.parse(key) as string[])), [key])
}

function interleave(groups: readonly (ReactNode | null)[]): ReactNode[] {
  const drawn: ReactNode[] = []
  groups.forEach((group, index) => {
    if (group === null) return
    if (drawn.length > 0)
      drawn.push(<Separator key={`separator-${index}`} orientation="vertical" />)
    drawn.push(group)
  })
  return drawn
}

export function RichTextInput(props: RichTextInputProps) {
  const {
    value,
    defaultValue,
    onChange,
    formats,
    entities = NO_SOURCES,
    placeholder,
    minRows = 3,
    maxRows = 12,
    maxLength,
    invalid = false,
    disabled = false,
    readOnly = false,
    autoFocus = false,
    onSubmit,
    submitLabel,
    onCancel,
    cancelLabel,
    pending = false,
    toolbar,
    toolbarPlacement = 'fixed',
    selectionActions,
    footer,
    onFiles,
    annotations,
    activeAnnotation,
    onAnnotationSelect,
    onFocus,
    onBlur,
    controlRef,
    messages,
    id,
    name,
    'aria-label': ariaLabel,
    'aria-labelledby': labelledBy,
    'aria-describedby': describedBy,
    'aria-required': required,
  } = props
  const say = withDefaults(messages)

  /* The document --------------------------------------------------------- */

  /** The first document, which a form's reset puts back. */
  const [initial] = useState<RichTextDocument>(() => defaultValue ?? emptyRichText())
  const [own, setOwn] = useState<RichTextDocument>(initial)
  /** The editor, for the callbacks the editor and the toolbars run. */
  const editorRef = useRef<RichTextEditor | null>(null)
  // A field that stops being controlled keeps the document the editor holds, so the count, the
  // emptiness, the form value and the submit control read what the text shows.
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    // The editor holds the last value the app gave: it puts it back over any change the app
    // did not take.
    if (value === undefined && lastValue !== undefined) setOwn(lastValue)
  }
  const doc = value ?? own
  // What is read from the whole document, once for each document.
  const { empty, length, newer } = useMemo(
    () => ({
      empty: isRichTextEmpty(doc),
      length: richTextLength(doc),
      newer: isRichTextNewer(doc),
    }),
    [doc],
  )
  /** The form's value, serialized once for each document and not for each caret move. */
  const posted = useMemo(() => (name === undefined ? '' : serializeRichText(doc)), [doc, name])
  const over = maxLength === undefined ? 0 : Math.max(0, length - maxLength)
  const overLimit = over > 0
  /** Read-only, pending, or a document of a later format, which this version never writes over. */
  const unwritable = readOnly || pending || newer
  /** Disabled, read-only or pending: nothing edits the text. */
  const locked = disabled || unwritable
  const editable = !locked
  const allowed = useFormats(formats)
  const has = (format: RichTextFormat) => allowed.includes(format)
  const kinds = useKinds(entities)
  const drawnAnnotations = useIds(annotations)

  const uid = useId()
  const surfaceId = id ?? `${uid}-surface`
  const listId = `${uid}-suggestions`
  /** An option's id, by the option's own id, so the active one's id changes with the option. */
  const optionId = (option: RichTextEntityOption) => `${uid}-suggestion-${idPart(option.id)}`
  const countId = `${uid}-count`

  const [surfaceRef, attachSurface] = useControlRef(controlRef)
  /** The same editor, for the handle the app's slots are drawn with. */
  const [mounted, setMounted] = useState<RichTextEditor | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const controlsRef = useRef<HTMLDivElement>(null)
  const actionsRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const linkPanelRef = useRef<HTMLElement | null>(null)
  /** The link form's panel, which the Popover lends to this member's agent handle to withhold. */
  const holdLinkPanel = useCallback((panel: HTMLElement | null) => {
    linkPanelRef.current = panel
  }, [])

  /** What the editor last published; null until it is mounted. */
  const [state, setState] = useState<RichTextEditorState | null>(null)
  const active = state?.active
  const can = state?.can
  const selection: RichTextInputSelection = {
    empty: state?.collapsed ?? true,
    text: state?.selectedText ?? '',
    range: state?.range ?? EMPTY_RANGE,
  }

  /* Announcements ---------------------------------------------------------- */

  /** The status region's words, each with a number of its own so the same words are heard again. */
  const [said, setSaid] = useState({ text: '', at: 0 })
  const announce = (text: string) => setSaid((last) => ({ text, at: last.at + 1 }))
  /** Whether this turn said something, read from the announcement the last render drew. */
  const [seenSaid, setSeenSaid] = useState(said.at)
  const saidThisTurn = said.at !== seenSaid
  if (saidThisTurn) setSeenSaid(said.at)

  const formatName = (format: Exclude<RichTextFormat, 'link'>): string =>
    ({
      heading: say.textStyle,
      bold: say.bold,
      italic: say.italic,
      strike: say.strike,
      code: say.code,
      bulletList: say.bulletList,
      orderedList: say.orderedList,
      blockquote: say.blockquote,
      codeBlock: say.codeBlock,
    })[format]

  function heard(event: RichTextEditorEvent) {
    switch (event.type) {
      case 'format':
        announce((event.active ? say.formatOn : say.formatOff)(formatName(event.format)))
        return
      case 'heading':
        announce(event.level === 0 ? say.paragraph : say.heading(event.level))
        return
      case 'link':
        announce(event.active ? say.linkAdded : say.linkRemoved)
        return
      case 'entity':
        announce(say.inserted(event.entity.label))
        return
      case 'undo':
        announce(say.undone)
        return
      case 'redo':
        announce(say.redone)
    }
  }

  /** The document the person or a command changed: the field's own copy, the app's handler and the limit. */
  function changed(next: RichTextDocument) {
    // A document of a later format is never written over.
    if (newer) return
    if (maxLength !== undefined) {
      const was = richTextLength(doc) > maxLength
      const nextOver = Math.max(0, richTextLength(next) - maxLength)
      if (!was && nextOver > 0) announce(say.overLimit(nextOver))
      else if (was && nextOver === 0) announce(say.withinLimit)
    }
    setOwn(next)
    onChange?.(next)
  }

  /** Replaces the document as one change, as an agent's fill does. */
  function replace(editor: RichTextEditor, next: RichTextDocument) {
    editor.setValue(next)
    changed(editor.getValue())
  }

  /* The suggestion list ---------------------------------------------------- */

  const { contains, startsWith } = useFilter({ sensitivity: 'base' })
  const suggestion = editable ? (state?.suggestion ?? null) : null
  const source =
    suggestion === null ? undefined : entities.find((entry) => entry.kind === suggestion.kind)
  const open = suggestion !== null && source !== undefined
  const query = suggestion?.query ?? ''
  const loading = open && source.loading === true
  const failed = open && !loading && source.error !== undefined && source.error !== ''
  const shown =
    !open || failed
      ? []
      : source.filter === false
        ? source.options
        : source.options.filter((option) =>
            (source.filter === 'startsWith' ? startsWith : contains)(option.label, query),
          )
  /** The list for one token and one query: the active option starts at the first again. */
  const listKey = open ? `${suggestion.key}:${query}` : ''
  const [highlight, setHighlight] = useState({ key: '', index: 0 })
  const activeOption =
    shown.length === 0
      ? -1
      : highlight.key === listKey
        ? Math.min(highlight.index, shown.length - 1)
        : 0

  // The list's status is said each time it changes while the list is open.
  const listStatus = !open
    ? null
    : loading
      ? say.loadingSuggestions
      : failed
        ? (source.error ?? '')
        : shown.length === 0
          ? say.noSuggestions
          : say.suggestions(shown.length)
  const [listHeard, setListHeard] = useState<string | null>(null)
  if (listStatus !== listHeard) {
    setListHeard(listStatus)
    if (listStatus !== null) announce(listStatus)
  }

  /** The query the app last heard, by token and query. */
  const reportedRef = useRef<string | null>(null)

  function pick(index: number) {
    const option = shown[index]
    const editor = editorRef.current
    if (option === undefined || source === undefined || editor === null) return
    reportedRef.current = null
    editor.insertEntity({
      kind: source.kind,
      id: option.id,
      label: option.entityLabel ?? `${source.trigger}${option.label}`,
    })
  }

  /** The keys the open list takes. Returns whether it took the key. */
  function suggestionKey(key: RichTextSuggestionKey): boolean {
    if (!open) return false
    const move = (index: number) => setHighlight({ key: listKey, index })
    switch (key) {
      case 'ArrowDown':
        if (shown.length === 0) return false
        move(Math.min(activeOption + 1, shown.length - 1))
        return true
      case 'ArrowUp':
        if (shown.length === 0) return false
        move(Math.max(activeOption - 1, 0))
        return true
      // Enter picks the active option. While the options load it does nothing, because they
      // are about to arrive. When nothing matches it is the editor's own Enter.
      case 'Enter':
        if (activeOption === -1) return loading
        pick(activeOption)
        return true
      case 'Tab':
        if (activeOption === -1) return false
        pick(activeOption)
        return true
      case 'Escape':
        editorRef.current?.dismissSuggestion()
        return true
    }
  }

  /* Annotations ----------------------------------------------------------- */

  const drawn = (annotation: string) =>
    drawnAnnotations === undefined || drawnAnnotations.includes(annotation)
  /** The drawn annotation the caret was last reported in. */
  const caretAnnotationRef = useRef<string | null>(null)
  /** While a press is down, the annotation the caret entered during it, so the press does not report it twice. */
  const pressRef = useRef<{ reported: string | null } | null>(null)

  /* The editor's state ----------------------------------------------------- */

  function stated(next: RichTextEditorState) {
    setState(next)
    // The app hears the query when the list opens and at each change while it is open.
    const token = next.suggestion
    const nextSource =
      token === null ? undefined : entities.find((entry) => entry.kind === token.kind)
    const key = token === null || nextSource === undefined ? null : `${token.key}:${token.query}`
    if (key !== reportedRef.current) {
      reportedRef.current = key
      if (token !== null && key !== null) nextSource?.onQueryChange?.(token.query)
    }
    // The caret entered a drawn annotation.
    const at = next.collapsed ? ((next.annotations ?? []).find(drawn) ?? null) : null
    if (at !== null && at !== caretAnnotationRef.current) {
      if (pressRef.current !== null) pressRef.current.reported = at
      onAnnotationSelect?.(at)
    }
    caretAnnotationRef.current = at
  }

  /* Submitting ------------------------------------------------------------- */

  const handle: RichTextInputEditor = {
    focus: () => mounted?.focus(),
    clear: () => mounted?.clear(),
    insertText: (text) => mounted?.insertText(text),
    insertEntity: (entity) => mounted?.insertEntity(entity),
    annotate: (annotation) => mounted?.annotate(annotation) ?? false,
    removeAnnotation: (annotation) => mounted?.removeAnnotation(annotation) ?? false,
    value: doc,
    empty,
    length,
    overLimit,
    disabled: locked,
    selection,
  }

  /** Mod+Enter and the submit control: refused, with the reason said, while the field cannot be submitted. */
  function submit() {
    if (onSubmit === undefined || disabled) return
    if (pending) return announce(say.submitPending)
    if (empty) return announce(say.submitEmpty)
    if (overLimit) return announce(say.submitOverLimit(over))
    onSubmit(editorRef.current?.getValue() ?? doc, handle)
  }

  /* The link form ---------------------------------------------------------- */

  const [linkOpen, setLinkOpen] = useState(false)
  const [linkDraft, setLinkDraft] = useState('')
  const [linkError, setLinkError] = useState<string | undefined>(undefined)
  /** The target of the link the selection was in when the form opened. */
  const [linkTarget, setLinkTarget] = useState<string | null>(null)

  function openLink(next: boolean) {
    if (next) {
      const target = editorRef.current?.getState().active.link ?? null
      setLinkDraft(target ?? '')
      setLinkError(undefined)
      setLinkTarget(target)
    }
    setLinkOpen(next)
  }

  function applyLink(event: FormEvent<HTMLFormElement>) {
    // The form is the field's own: a form around the field does not hear it.
    event.preventDefault()
    event.stopPropagation()
    const raw = linkDraft.trim()
    const editor = editorRef.current
    if (raw === '' || richTextHref(raw, { typed: true }) === null || editor === null) {
      setLinkError(say.linkInvalid)
      return
    }
    if (!editor.setLink(raw)) {
      setLinkError(say.linkInvalid)
      return
    }
    setLinkOpen(false)
  }

  function removeLink() {
    editorRef.current?.setLink(null)
    setLinkOpen(false)
  }

  /* The heading menu ------------------------------------------------------- */

  const [headingOpen, setHeadingOpen] = useState(false)
  /** Whether the menu was opened with the pointer, which returns focus to the text when it closes. */
  const headingByPointerRef = useRef(false)
  const pointerDownRef = useRef(false)

  function chooseHeading(level: 0 | 1 | 2 | 3) {
    editorRef.current?.setHeading(level)
    setHeadingOpen(false)
  }

  /* Focus going back to the text ------------------------------------------- */

  // The link form returns focus to the text when it closes, with the selection as it was, unless
  // the person moved focus somewhere else. The menu does when it was opened with the pointer;
  // from the keys, focus goes back to its control, as a menu's does.
  const linkWasOpenRef = useRef(false)
  const headingWasOpenRef = useRef(false)
  useEffect(() => {
    if (linkOpen) linkWasOpenRef.current = true
    else if (linkWasOpenRef.current) {
      linkWasOpenRef.current = false
      const root = rootRef.current
      const owner = root?.ownerDocument
      const at = owner?.activeElement ?? null
      const panel = linkPanelRef.current
      const kept =
        at === null ||
        at === owner?.body ||
        root?.contains(at) === true ||
        panel?.contains(at) === true
      if (kept) editorRef.current?.focus()
    }
    if (headingOpen) headingWasOpenRef.current = true
    else if (headingWasOpenRef.current) {
      headingWasOpenRef.current = false
      if (headingByPointerRef.current) editorRef.current?.focus()
    }
  }, [linkOpen, headingOpen])

  /* The selection bar ------------------------------------------------------ */

  const formatsInBar = toolbarPlacement === 'selection' && editable && allowed.length > 0
  const actionsInBar = selectionActions !== undefined && !disabled
  const [barFocus, setBarFocus] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [barDismissed, setBarDismissed] = useState<string | null>(null)
  const rangeKey = `${selection.range.start}:${selection.range.end}`
  // Escape hides the bar for one selection: another selection, or a caret, ends that.
  if (barDismissed !== null && (selection.empty || barDismissed !== rangeKey)) setBarDismissed(null)
  const barPopup = formatsInBar && (linkOpen || headingOpen)
  const barOpen =
    (formatsInBar || actionsInBar) &&
    state !== null &&
    !state.collapsed &&
    (state.focused || barFocus || barPopup) &&
    !selecting &&
    barDismissed !== rangeKey
  // Said once each time focus enters the field from outside it, and never over what this turn
  // already said (the link form's "Link added" as the text takes focus back).
  const [barHeard, setBarHeard] = useState(false)
  if (barOpen && !barHeard) {
    setBarHeard(true)
    if (!saidThisTurn) announce(say.selectionBarReady)
  }

  /** Escape on the text: the list first, then the bar. Returns whether either took it. */
  function escape(): boolean {
    if (open) {
      editorRef.current?.dismissSuggestion()
      return true
    }
    if (barOpen) {
      setBarDismissed(rangeKey)
      return true
    }
    return false
  }

  // A pointer selection shows the bar when the press ends, not while it is dragged.
  useEffect(() => {
    const view = rootRef.current?.ownerDocument.defaultView
    if (!selecting || view === null || view === undefined) return
    const release = () => setSelecting(false)
    view.addEventListener('pointerup', release, true)
    view.addEventListener('pointercancel', release, true)
    return () => {
      view.removeEventListener('pointerup', release, true)
      view.removeEventListener('pointercancel', release, true)
    }
  }, [selecting])

  /* The toolbars' keys ----------------------------------------------------- */

  const toolbarKeys = useToolbarKeys(toolbarRef, () => editorRef.current?.focus())
  const barKeys = useToolbarKeys(barRef, () => editorRef.current?.focus())

  /* The surface and the editor --------------------------------------------- */

  const countShown = maxLength !== undefined
  const describedByAll =
    [describedBy, countShown ? countId : undefined]
      .filter((part) => part !== undefined)
      .join(' ') || undefined
  const suggesting = entities.length > 0
  /** The surface's attributes, which React draws and the editor keeps. */
  const attributes: Record<string, string | undefined> = {
    id: surfaceId,
    role: 'textbox',
    'aria-multiline': 'true',
    'aria-label': ariaLabel,
    'aria-labelledby': labelledBy,
    'aria-describedby': describedByAll,
    'aria-required': required === true ? 'true' : undefined,
    'aria-invalid': invalid || overLimit ? 'true' : undefined,
    'aria-disabled': disabled ? 'true' : undefined,
    'aria-readonly': !disabled && unwritable ? 'true' : undefined,
    // Editable text is a tab stop of its own; read-only text stays one, so it can be selected
    // and read; disabled text is none.
    tabindex: disabled ? undefined : '0',
    'aria-autocomplete': suggesting ? 'list' : undefined,
    'aria-haspopup': suggesting ? 'listbox' : undefined,
    'aria-controls': open && shown.length > 0 ? listId : undefined,
    'aria-activedescendant':
      open && activeOption !== -1 && shown[activeOption] !== undefined
        ? optionId(shown[activeOption])
        : undefined,
  }

  // What the editor's callbacks read: this render's values, after it commits.
  const latestRef = useRef<{
    doc: RichTextDocument
    allowed: RichTextFormat[]
    kinds: RichTextEditorEntityKind[]
    editable: boolean
    readOnly: boolean
    disabled: boolean
    attributes: Record<string, string | undefined>
    placeholder: string | undefined
    annotations: string[] | undefined
    activeAnnotation: string | undefined
    autoFocus: boolean
    submits: boolean
    takesFiles: boolean
    changed: (next: RichTextDocument) => void
    stated: (next: RichTextEditorState) => void
    heard: (event: RichTextEditorEvent) => void
    submit: () => void
    requestLink: () => void
    suggestionKey: (key: RichTextSuggestionKey) => boolean
    files: (files: File[]) => void
    entered: () => void
    left: () => void
    reset: () => void
    escape: () => boolean
    mount: (editor: RichTextEditor | null) => void
  } | null>(null)
  useLayoutEffect(() => {
    latestRef.current = {
      doc,
      allowed,
      kinds,
      editable,
      readOnly: !disabled && unwritable,
      disabled,
      attributes,
      placeholder,
      annotations: drawnAnnotations,
      activeAnnotation,
      autoFocus,
      submits: onSubmit !== undefined,
      takesFiles: onFiles !== undefined,
      changed,
      stated,
      heard,
      submit,
      requestLink: () => {
        const editor = editorRef.current
        // The form opens from its control, which the selection bar draws only for a selection.
        const anchored = toolbarPlacement === 'fixed' || barOpen
        if (editor === null || !editable || !editor.getState().can.link || !anchored) return
        openLink(true)
      },
      suggestionKey,
      files: (files) => onFiles?.(files),
      entered: () => {
        setBarHeard(false)
        onFocus?.()
      },
      left: () => onBlur?.(),
      reset: () => {
        // A form's reset puts the first document back, as the person's act, as Checkbox's does.
        const editor = editorRef.current
        if (editor === null || serializeRichText(editor.getValue()) === serializeRichText(initial))
          return
        replace(editor, initial)
      },
      escape,
      mount: (editor) => {
        setMounted(editor)
        if (editor !== null) stated(editor.getState())
      },
    }
  })

  /**
   * The first Escape on the text is the list's, then the bar's. A dialog's layer
   * hears Escape on the document in the capture phase, before the text does, and
   * closes unless the key's default is prevented. So while either is open the
   * field prevents it on the window, which the key reaches first, and acts on it
   * there; the editor then leaves the key alone, as it does any key whose
   * default is prevented.
   */
  const holding = open || barOpen
  useEffect(() => {
    const element = surfaceRef.current
    const view = element?.ownerDocument.defaultView
    if (!holding || element === null || view === null || view === undefined) return
    const hold = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing || event.target !== element) return
      if (latestRef.current?.escape() === true) event.preventDefault()
    }
    view.addEventListener('keydown', hold, true)
    return () => view.removeEventListener('keydown', hold, true)
  }, [holding, surfaceRef])

  // The editor, mounted on the surface once and destroyed with it. Every callback reads the
  // latest render's values, so the editor never needs a new one.
  useEffect(() => {
    const element = surfaceRef.current
    const live = latestRef.current
    if (element === null || live === null) return
    const editor = createRichTextEditor({
      element,
      value: live.doc,
      formats: live.allowed,
      entities: live.kinds,
      classes: CLASSES,
      editable: live.editable,
      readOnly: live.readOnly,
      attributes: live.attributes,
      placeholder: live.placeholder,
      annotations: live.annotations,
      activeAnnotation: live.activeAnnotation,
      onChange: (next) => latestRef.current?.changed(next),
      onState: (next) => latestRef.current?.stated(next),
      onEvent: (event) => latestRef.current?.heard(event),
      onSubmit: live.submits ? () => latestRef.current?.submit() : undefined,
      onLinkRequest: () => latestRef.current?.requestLink(),
      onSuggestionKey: (key) => latestRef.current?.suggestionKey(key) ?? false,
      onFiles: live.takesFiles ? (files) => latestRef.current?.files(files) : undefined,
    })
    editorRef.current = editor
    // The editor calls `onState` after a change, and not at mount.
    latestRef.current?.mount(editor)
    if (live.autoFocus) editor.focus('end')
    return () => {
      editor.destroy()
      editorRef.current = null
      latestRef.current?.mount(null)
    }
  }, [surfaceRef])

  // What changes without a new editor: the schema's formats and kinds (stable arrays, so the
  // history survives a render), editing, the attributes, the placeholder and the annotations.
  const options = JSON.stringify([
    allowed,
    kinds,
    editable,
    !disabled && unwritable,
    attributes,
    placeholder ?? null,
    drawnAnnotations ?? null,
    activeAnnotation ?? null,
    onSubmit !== undefined,
    onFiles !== undefined,
  ])
  const appliedRef = useRef<string | null>(null)
  useLayoutEffect(() => {
    const editor = editorRef.current
    const live = latestRef.current
    if (editor === null || live === null || appliedRef.current === options) return
    appliedRef.current = options
    editor.update({
      formats: live.allowed,
      entities: live.kinds,
      editable: live.editable,
      readOnly: live.readOnly,
      attributes: live.attributes,
      placeholder: live.placeholder,
      annotations: live.annotations,
      activeAnnotation: live.activeAnnotation,
      onSubmit: live.submits ? () => latestRef.current?.submit() : undefined,
      onFiles: live.takesFiles ? (files) => latestRef.current?.files(files) : undefined,
    })
  })

  // A controlled value is the document. The editor compares it with its own and replaces only a
  // document that differs, with no change event and no undo step; the same value over the same
  // document, or the value the editor gave, it does not read again.
  useLayoutEffect(() => {
    if (value !== undefined) editorRef.current?.setValue(value)
  })

  // The list sits at the token: its start at the token's start, under the token's line, or
  // above it when there is less room below in the part of the window a person sees, inside the
  // field and the window (`placeTokenList`). It is fixed, so it follows the token as the page
  // scrolls, the window resizes and a virtual keyboard opens.
  const placeList = () =>
    placeTokenList(
      panelRef.current,
      rootRef.current,
      editorRef.current?.tokenRect() ?? suggestion?.rect,
    )
  useLayoutEffect(placeList)
  const placeListRef = useRef(placeList)
  useLayoutEffect(() => {
    placeListRef.current = placeList
  })
  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!open || panel === null) return
    return followSelectionBar(panel, () => placeListRef.current())
  }, [open])

  // A press on the FormField's label focuses the text, as a native label's does for its control:
  // a `group` is named by `aria-labelledby`, which a label's `for` cannot reach.
  useEffect(
    () =>
      focusOnLabelPress(
        surfaceRef.current,
        () => editorRef.current?.focus(),
        () => latestRef.current?.disabled !== true,
      ),
    [labelledBy, surfaceRef],
  )

  // A form's reset puts the first document back.
  useEffect(() => {
    const form = rootRef.current?.closest('form')
    if (form === null || form === undefined) return
    const reset = () => latestRef.current?.reset()
    form.addEventListener('reset', reset)
    return () => form.removeEventListener('reset', reset)
  }, [])

  /**
   * Whether an element is part of the field: inside its root, in the link
   * form's panel, or in a popup a control of the field controls (the text
   * style menu), which are drawn elsewhere in the document.
   */
  function inField(node: EventTarget | null): boolean {
    const root = rootRef.current
    if (!(node instanceof Node) || root === null) return false
    if (root.contains(node) || linkPanelRef.current?.contains(node) === true) return true
    for (let at = node instanceof Element ? node : node.parentElement; at !== null;) {
      if (at.id !== '' && root.querySelector(`[aria-controls~="${CSS.escape(at.id)}"]`) !== null)
        return true
      at = at.parentElement
    }
    return false
  }

  /**
   * Focus entering and leaving the field as a whole: `onFocus`, `onBlur` and
   * the selection bar's announcement hear these, not each move between the
   * field's own parts. Focus that leaves for no element (a control removed, or
   * the editor ending an input method's composition) is read once the moves
   * running now have finished, so focus that comes straight back never left.
   */
  const focusRef = useRef({ inside: false, moves: 0 })
  const focusProps = {
    onFocus: () => {
      const focus = focusRef.current
      focus.moves += 1
      if (focus.inside) return
      focus.inside = true
      latestRef.current?.entered()
    },
    onBlur: (event: FocusEvent) => {
      const focus = focusRef.current
      if (!focus.inside || inField(event.relatedTarget)) return
      const move = (focus.moves += 1)
      const leave = () => {
        if (focus.moves !== move || !focus.inside) return
        focus.inside = false
        latestRef.current?.left()
      }
      if (event.relatedTarget === null) queueMicrotask(leave)
      else leave()
    },
  }

  /* The agent -------------------------------------------------------------- */

  // An agent reads the text and fills, clears and submits it, as a person's keys do: through the
  // editor, so `onChange` is called in either form. The field's own controls (the toolbar's, the
  // selection bar, the link form and the default footer) are withheld; the app's toolbar slot and
  // its footer are the app's, and stay an agent's.
  function writable(): RichTextEditor {
    if (newer) throw new Error('The document is of a later format than this field writes.')
    if (unwritable) throw new Error('The field is read-only.')
    const editor = editorRef.current
    if (editor === null) throw new Error('The field is not ready.')
    return editor
  }
  useAgentMember({
    member: 'RichTextInput',
    element: () => surfaceRef.current,
    state: () => ({
      value: richTextPlainText(doc),
      disabled,
      invalid: invalid || overLimit,
      readonly: unwritable,
      empty,
    }),
    actions: {
      fill: { argument: 'text', run: (text) => replace(writable(), richTextFromText(text)) },
      clear: () => writable().clear(),
      submit: () => {
        if (onSubmit === undefined) throw new Error('The field has no submit.')
        if (pending) throw new Error('The app is saving; wait for it to finish.')
        if (empty) throw new Error('The field is empty, and an empty field is not submitted.')
        if (overLimit) throw new Error(`The text is ${over} characters over the limit.`)
        onSubmit(editorRef.current?.getValue() ?? doc, handle)
      },
    },
    withholds: () => [
      controlsRef.current,
      actionsRef.current,
      barRef.current,
      linkPanelRef.current,
    ],
  })

  /* Drawing ---------------------------------------------------------------- */

  /** A toolbar command. A pointer press gives the text focus; from the keys, focus stays on the control. */
  function command(event: MouseEvent, run: (live: RichTextEditor) => unknown) {
    const live = editorRef.current
    if (live === null) return
    run(live)
    if (event.detail > 0) live.focus()
  }

  const marks = MARKS.filter(([format]) => has(format))
  const markGroup =
    marks.length === 0 && !has('link') ? null : (
      <div key="marks" className={styles.group}>
        {marks.map(([format, icon]) => (
          <Button
            key={format}
            variant="ghost"
            tone="neutral"
            size="sm"
            iconOnly
            icon={icon}
            label={say[format]}
            pressed={active?.[format] ?? false}
            disabled={locked || can?.[format] === false}
            onClick={(event) => command(event, (live) => live.toggle(format))}
          />
        ))}
        {has('link') ? (
          <PopoverPanelMember panel={holdLinkPanel}>
            <Popover
              label={say.linkForm}
              open={linkOpen}
              onOpenChange={openLink}
              trigger={
                <Button
                  variant="ghost"
                  tone="neutral"
                  size="sm"
                  iconOnly
                  icon="link"
                  label={say.link}
                  pressed={(active?.link ?? null) !== null}
                  disabled={locked || can?.link === false}
                />
              }
            >
              <form className={styles.linkForm} noValidate onSubmit={applyLink}>
                <FormField label={say.linkAddress} error={linkError}>
                  <Input
                    value={linkDraft}
                    autoComplete="off"
                    onChange={(next) => {
                      setLinkDraft(next)
                      setLinkError(undefined)
                    }}
                  />
                </FormField>
                <div className={styles.linkActions}>
                  {linkTarget === null ? null : (
                    <Button
                      variant="ghost"
                      tone="neutral"
                      size="sm"
                      label={say.linkRemove}
                      onClick={removeLink}
                    />
                  )}
                  <Button
                    type="submit"
                    variant="solid"
                    tone="accent"
                    size="sm"
                    label={say.linkApply}
                  />
                </div>
              </form>
            </Popover>
          </PopoverPanelMember>
        ) : null}
      </div>
    )

  const level = active === undefined ? 0 : active.codeBlock ? -1 : active.heading
  const headingItems: MenuEntry[] = LEVELS.map((choice) => ({
    kind: 'checkbox',
    label: choice === 0 ? say.paragraph : say.heading(choice),
    checked: level === choice,
    onCheckedChange: () => chooseHeading(choice),
  }))
  const headingGroup = !has('heading') ? null : (
    <div key="heading" className={styles.group}>
      <Menu
        open={headingOpen}
        onOpenChange={(next) => {
          if (next) headingByPointerRef.current = pointerDownRef.current
          setHeadingOpen(next)
        }}
        items={headingItems}
        trigger={
          <Button
            variant="ghost"
            tone="neutral"
            size="sm"
            iconOnly
            icon="heading"
            label={say.textStyle}
            disabled={locked || can?.heading === false}
          />
        }
      />
    </div>
  )

  const blocks = BLOCKS.filter(([format]) => has(format))
  const blockGroup =
    blocks.length === 0 ? null : (
      <div key="blocks" className={styles.group}>
        {blocks.map(([format, icon]) => (
          <Button
            key={format}
            variant="ghost"
            tone="neutral"
            size="sm"
            iconOnly
            icon={icon}
            label={say[format]}
            pressed={active?.[format] ?? false}
            disabled={locked || can?.[format] === false}
            onClick={(event) => command(event, (live) => live.toggle(format))}
          />
        ))}
      </div>
    )

  const historyGroup = (
    <div key="history" className={styles.group}>
      <Button
        variant="ghost"
        tone="neutral"
        size="sm"
        iconOnly
        icon="undo"
        label={say.undo}
        disabled={locked || can?.undo !== true}
        onClick={(event) => command(event, (live) => live.undo())}
      />
      <Button
        variant="ghost"
        tone="neutral"
        size="sm"
        iconOnly
        icon="redo"
        label={say.redo}
        disabled={locked || can?.redo !== true}
        onClick={(event) => command(event, (live) => live.redo())}
      />
    </div>
  )

  const fixed = toolbarPlacement === 'fixed'
  const toolbarDrawn = fixed || toolbar !== undefined
  // The pointer that opens the text style menu, read before the menu's own press handler runs.
  const notePointer = {
    onPointerDownCapture: () => {
      pointerDownRef.current = true
    },
    onPointerUpCapture: () => {
      pointerDownRef.current = false
    },
    onKeyDownCapture: () => {
      pointerDownRef.current = false
    },
  }

  const defaultFooter = footer === undefined && submitLabel !== undefined && onSubmit !== undefined
  const footerDrawn = footer !== undefined || defaultFooter
  const count = countShown ? (
    <p id={countId} className={styles.count} data-state={overLimit ? 'over' : undefined}>
      {overLimit ? say.overLimit(over) : say.count(length, maxLength)}
    </p>
  ) : null

  return (
    <div
      ref={rootRef}
      className={styles.root}
      data-min-rows={String(minRows)}
      data-max-rows={String(maxRows)}
      data-empty={empty ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      data-readonly={!disabled && unwritable ? '' : undefined}
      data-invalid={invalid || overLimit ? '' : undefined}
      {...memberAttr('RichTextInput')}
      {...focusProps}
    >
      <div className={styles.frame}>
        {toolbarDrawn ? (
          <div
            ref={toolbarRef}
            role="toolbar"
            aria-label={say.toolbar}
            aria-controls={surfaceId}
            className={styles.toolbar}
            data-rich-text-input-part="toolbar"
            {...toolbarKeys.props}
            {...notePointer}
          >
            {fixed ? (
              <div ref={controlsRef} className={styles.controls}>
                {interleave([markGroup, headingGroup, blockGroup, historyGroup])}
              </div>
            ) : null}
            {toolbar === undefined ? null : <div className={styles.slot}>{toolbar(handle)}</div>}
          </div>
        ) : null}

        <div className={styles.viewport}>
          {/* The editor's element: React draws its attributes and none of its content. */}
          <div
            ref={attachSurface}
            className={styles.surface}
            data-rich-text-input-part="surface"
            id={surfaceId}
            role="textbox"
            aria-multiline="true"
            aria-label={ariaLabel}
            aria-labelledby={labelledBy}
            aria-describedby={describedByAll}
            aria-required={attributes['aria-required'] === 'true' ? true : undefined}
            aria-invalid={attributes['aria-invalid'] === 'true' ? true : undefined}
            aria-disabled={disabled ? true : undefined}
            aria-readonly={attributes['aria-readonly'] === 'true' ? true : undefined}
            tabIndex={disabled ? undefined : 0}
            aria-autocomplete={suggesting ? 'list' : undefined}
            aria-haspopup={suggesting ? 'listbox' : undefined}
            aria-controls={attributes['aria-controls']}
            aria-activedescendant={attributes['aria-activedescendant']}
            onKeyDown={(event) => {
              // Alt+F10 moves to the controls, as in other editors: the bar while it is drawn.
              if (!event.altKey || event.key !== 'F10') return
              event.preventDefault()
              if (barOpen) barKeys.enter()
              else if (toolbarDrawn) toolbarKeys.enter()
            }}
            onPointerDown={() => {
              pressRef.current = { reported: null }
              if (selectionActions !== undefined || formatsInBar) setSelecting(true)
            }}
            onClick={(event) => {
              const pressed = pressRef.current
              pressRef.current = null
              const target = event.target instanceof Element ? event.target : null
              const annotation = target
                ?.closest('[data-annotation-id]')
                ?.getAttribute('data-annotation-id')
              if (annotation === null || annotation === undefined || !drawn(annotation)) return
              if (editorRef.current?.getState().collapsed === false || disabled) return
              caretAnnotationRef.current = annotation
              if (pressed?.reported !== annotation) onAnnotationSelect?.(annotation)
            }}
            onBlur={(event) => {
              const to = event.relatedTarget
              if (to instanceof Node && barRef.current?.contains(to) === true) setBarFocus(true)
            }}
          />
        </div>

        <SelectionBar
          open={barOpen}
          measure={() => editorRef.current?.selectionRect() ?? null}
          within={() => surfaceRef.current}
          label={say.selectionBar}
          barRef={barRef}
          keys={barKeys}
          onFocusChange={setBarFocus}
          // An application's control in the bar that replaces the selection closes the bar under
          // the person's focus, which goes back to the text.
          onFocusLost={() => editorRef.current?.focus()}
        >
          {/* Drawn only while the bar is: the application's actions are not asked for otherwise. */}
          {() => (
            <div className={styles.controls} {...notePointer}>
              {interleave([
                selectionActions !== undefined && actionsInBar ? (
                  <div key="actions" className={styles.group}>
                    {selectionActions(handle)}
                  </div>
                ) : null,
                ...(formatsInBar ? [markGroup, headingGroup, blockGroup] : []),
              ])}
            </div>
          )}
        </SelectionBar>

        {footerDrawn ? (
          <div className={styles.footer}>
            {count}
            {footer !== undefined ? (
              footer(handle)
            ) : (
              <div ref={actionsRef} className={styles.actions}>
                {cancelLabel !== undefined && onCancel !== undefined ? (
                  <Button
                    variant="ghost"
                    tone="neutral"
                    size="sm"
                    label={cancelLabel}
                    disabled={disabled}
                    onClick={onCancel}
                  />
                ) : null}
                <Button
                  variant="solid"
                  tone="accent"
                  size="sm"
                  label={submitLabel ?? ''}
                  disabled={disabled || empty || overLimit}
                  loading={pending}
                  onClick={submit}
                />
              </div>
            )}
          </div>
        ) : null}
      </div>

      {footerDrawn ? null : count}

      {/* The suggestions, at the token. A press on them keeps focus in the text. */}
      {!open ? null : (
        <div
          ref={panelRef}
          className={styles.suggestions}
          data-rich-text-input-part="suggestions"
          onMouseDown={(event) => event.preventDefault()}
        >
          {shown.length === 0 ? null : (
            <ul id={listId} role="listbox" aria-label={source.label} className={styles.listbox}>
              {shown.map((option, index) => (
                <li
                  key={option.id}
                  id={optionId(option)}
                  role="option"
                  aria-selected={index === activeOption}
                  className={styles.option}
                  data-highlighted={index === activeOption ? '' : undefined}
                  onPointerMove={() => {
                    if (index !== activeOption) setHighlight({ key: listKey, index })
                  }}
                  onClick={() => pick(index)}
                >
                  {option.leading !== undefined ? (
                    <span className={styles.leading} aria-hidden="true">
                      {option.leading}
                    </span>
                  ) : option.icon !== undefined ? (
                    <span className={styles.glyph}>
                      <Icon name={option.icon} size="sm" />
                    </span>
                  ) : null}
                  <span className={styles.text}>
                    <span className={styles.label}>{option.label}</span>
                    {option.description === undefined ? null : (
                      <span className={styles.description}>{option.description}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {loading ? (
            <div className={styles.rows} aria-hidden="true">
              {SKELETON_ROWS.map((row) => (
                <div key={row} className={styles.row}>
                  <Skeleton textStep="sm" />
                </div>
              ))}
            </div>
          ) : null}

          {/* Heard once, through the status region, so the visible rows are hidden from it. */}
          {failed ? (
            <div className={styles.error} aria-hidden="true">
              {source.error}
            </div>
          ) : null}
          {!loading && !failed && shown.length === 0 ? (
            <div className={styles.empty} aria-hidden="true">
              {say.noSuggestions}
            </div>
          ) : null}
        </div>
      )}

      <div role="status" aria-live="polite" className={styles.status}>
        {said.text === '' ? null : <span key={said.at}>{said.text}</span>}
      </div>

      {name === undefined ? null : (
        <input type="hidden" name={name} value={posted} disabled={disabled} />
      )}
    </div>
  )
}

/**
 * FormField names the field by `aria-labelledby`, because a label's `for` reaches no `div`; the
 * member makes a press on that label focus the text (`focusOnLabelPress`).
 */
RichTextInput.controlKind = 'group' as const
