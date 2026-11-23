import {
  cond,
  describeMember,
  each,
  el,
  flag,
  fx,
  identity,
  js,
  lit,
  member,
  node,
  render,
  renders,
  run,
  slot,
  text,
  when,
  type Expr,
  type Handler,
  type Node,
} from '../dsl'

const noop = js('() => {}')

/* -------------------------------------------------------------------------- */
/* The fixture's documents and sources                                        */
/* -------------------------------------------------------------------------- */

const FORMAT = 'polymorph-rich-text/1'

const textRun = (words: string, ...marks: unknown[]) =>
  marks.length === 0 ? { type: 'text', text: words } : { type: 'text', text: words, marks }

const paragraph = (...content: unknown[]) => ({ type: 'paragraph', content })

/** A document as the app stores it, read through the engine's normal form. */
const richText = (...blocks: unknown[]) =>
  js(`normalizeRichText(${JSON.stringify({ format: FORMAT, blocks })})`)

const CONTENT = richText(
  paragraph(
    textRun('The retry policy '),
    textRun('doubles', { type: 'bold' }),
    textRun(' the wait after each failure, as '),
    textRun('the runbook', { type: 'link', href: 'https://example.com/runbook' }),
    textRun(' says. '),
    { type: 'entity', kind: 'user', id: 'ada', label: '@Ada Lovelace' },
    textRun(' can you check '),
    textRun('maxAttempts', { type: 'code' }),
    textRun('?'),
  ),
  {
    type: 'list',
    ordered: false,
    items: [
      { type: 'listItem', content: [paragraph(textRun('One retry after a second'))] },
      { type: 'listItem', content: [paragraph(textRun('Then two, then four'))] },
    ],
  },
)

const DESCRIPTION = richText(
  { type: 'heading', level: 1, content: [textRun('Webhook retries')] },
  paragraph(textRun('A failed delivery is retried with a growing wait. The limit is a setting.')),
  { type: 'codeBlock', language: 'ts', text: 'const wait = base * 2 ** attempt' },
  { type: 'blockquote', content: [paragraph(textRun('Never retry a 4xx response.'))] },
)

const ANNOTATED = richText(
  paragraph(
    textRun('The retry policy '),
    textRun('doubles the wait', { type: 'annotation', id: 'thread-1' }),
    textRun(' after each failure, '),
    textRun('up to five times', { type: 'annotation', id: 'thread-2' }),
    textRun('.'),
  ),
)

/** Fifty-one code points, over a limit of forty. */
const LONG = richText(paragraph(textRun('A comment that runs past the limit the app has set.')))

const PEOPLE = {
  kind: 'user',
  trigger: '@',
  label: 'People',
  options: [
    {
      id: 'ada',
      label: 'Ada Lovelace',
      description: 'Engineering',
      leading: node(fx('Avatar', { name: 'Ada Lovelace', size: 'sm' })),
    },
    { id: 'grace', label: 'Grace Hopper', description: 'Compilers' },
    { id: 'alan', label: 'Alan Turing', description: 'Research' },
  ],
}

/** People the app looks up for each query, while the first answer is on its way. */
const LOOKUP = {
  kind: 'user',
  trigger: '@',
  label: 'People',
  options: [],
  filter: false,
  loading: true,
}

const small = { variant: 'ghost', tone: 'neutral', size: 'sm' }

/* -------------------------------------------------------------------------- */
/* The member's words and the editor's classes                                */
/* -------------------------------------------------------------------------- */

/** Every label and announcement in English, which the app's `messages` replace key by key. */
const DEFAULT_MESSAGES = `{
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
  heading: (level: 1 | 2 | 3) => \`Heading \${level}\`,
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
  formatOn: (format: string) => \`\${format} on\`,
  formatOff: (format: string) => \`\${format} off\`,
  linkAdded: 'Link added',
  linkRemoved: 'Link removed',
  inserted: (label: string) => \`\${label} inserted\`,
  undone: 'Undone',
  redone: 'Redone',
  count: (length: number, maxLength: number) => \`\${length} / \${maxLength}\`,
  overLimit: (over: number) => \`\${over} \${over === 1 ? 'character' : 'characters'} over the limit\`,
  withinLimit: 'Within the limit',
  submitEmpty: 'There is nothing to submit yet.',
  submitOverLimit: (over: number) => \`Remove \${over} \${over === 1 ? 'character' : 'characters'} to submit.\`,
  submitPending: 'Still saving.',
  suggestions: (count: number) => \`\${count} suggestions\`,
  loadingSuggestions: 'Loading suggestions…',
  noSuggestions: 'No results',
}`

/**
 * The recipe's classes for what the editor draws. Bold, italic and strike are
 * the bare `strong`, `em` and `s` Text's recipe styles inside a paragraph, and
 * the code inside a code block takes no class, as CodeBlock's does.
 */
const CLASSES = `{
  paragraph: styles.paragraph ?? '',
  heading: [styles.heading1 ?? '', styles.heading2 ?? '', styles.heading3 ?? ''] as const,
  bulletList: styles.list ?? '',
  orderedList: styles.list ?? '',
  listItem: styles.item ?? '',
  blockquote: styles.quote ?? '',
  codeBlock: styles.codeBlock ?? '',
  codeBlockText: '',
  bold: '',
  italic: '',
  strike: '',
  code: styles.code ?? '',
  link: styles.link ?? '',
  entity: styles.entity ?? '',
  annotation: styles.annotation ?? '',
  unknown: styles.unknown ?? '',
}`

/** The handle's fields, the props of the scoped slots that receive it. */
const HANDLE_FIELDS = [
  'focus',
  'clear',
  'insertText',
  'insertEntity',
  'annotate',
  'removeAnnotation',
  'value',
  'empty',
  'length',
  'overLimit',
  'disabled',
  'selection',
] as const

const HANDLE: Record<string, Expr> = Object.fromEntries(
  HANDLE_FIELDS.map((field) => [field, `handle.${field}`]),
)

/* -------------------------------------------------------------------------- */
/* The controls                                                               */
/* -------------------------------------------------------------------------- */

/** A toolbar control: a small ghost icon-only Button, named by `messages`. */
const control = (props: Record<string, Expr>, on?: Record<string, Handler>): Node =>
  member(
    'Button',
    { variant: lit('ghost'), tone: lit('neutral'), size: lit('sm'), iconOnly: 'true', ...props },
    on === undefined ? {} : { on },
  )

/**
 * Whether the text style Menu is opened by the pointer, read in the capture
 * phase before the Menu's own handlers: its machine opens on the trigger's
 * click, which the pointer gives a `detail` and the keys do not, or on a key.
 */
const NOTE_POINTER: Record<string, Handler> = {
  'click.capture': run('(byPointer = $event.detail > 0)'),
  'keydown.capture': run('(byPointer = false)'),
}

/** The marks and the link: a Button per allowed mark, and the link form's Popover. */
const markGroup: Node = el('div', { class: ['group'] }, [
  each('marks', 'mark', 'mark.format', [
    control(
      {
        icon: 'mark.icon',
        label: 'say[mark.format]',
        pressed: 'active?.[mark.format] ?? false',
        disabled: 'locked || can?.[mark.format] === false',
      },
      { click: run('command($event, (live) => live.toggle(mark.format))') },
    ),
  ]),
  cond("has('link')", [
    member(
      'Popover',
      { label: 'say.linkForm', open: 'linkOpen' },
      {
        on: { openChange: run('openLink($event)') },
        slots: {
          trigger: [
            control({
              icon: lit('link'),
              label: 'say.link',
              pressed: '(active?.link ?? null) !== null',
              disabled: 'locked || can?.link === false',
            }),
          ],
          default: [
            // The form is the field's own: a form around the field does not hear its submit.
            el(
              'form',
              {
                part: 'link form',
                ref: 'linkForm',
                class: ['linkForm'],
                attrs: { novalidate: 'true' },
                on: { submit: run('applyLink($event)') },
              },
              [
                member(
                  'FormField',
                  { label: 'say.linkAddress', error: 'linkError' },
                  {
                    slots: {
                      default: [
                        member(
                          'Input',
                          { value: 'linkDraft', autoComplete: lit('off') },
                          {
                            on: { change: run('((linkDraft = $event), (linkError = undefined))') },
                          },
                        ),
                      ],
                    },
                  },
                ),
                el('div', { class: ['linkActions'] }, [
                  cond('linkTarget !== null', [
                    member(
                      'Button',
                      {
                        variant: lit('ghost'),
                        tone: lit('neutral'),
                        size: lit('sm'),
                        label: 'say.linkRemove',
                      },
                      { on: { click: run('removeLink()') } },
                    ),
                  ]),
                  member('Button', {
                    type: lit('submit'),
                    variant: lit('solid'),
                    tone: lit('accent'),
                    size: lit('sm'),
                    label: 'say.linkApply',
                  }),
                ]),
              ],
            ),
          ],
        },
      },
    ),
  ]),
])

/** The text style Menu: Paragraph and Heading 1 to 3, the current one checked. */
const headingGroup: Node = el('div', { class: ['group'] }, [
  member(
    'Menu',
    { open: 'headingOpen', items: 'headingItems' },
    {
      on: { openChange: run('openHeading($event)') },
      slots: {
        trigger: [
          control({
            icon: lit('heading'),
            label: 'say.textStyle',
            disabled: 'locked || can?.heading === false',
          }),
        ],
      },
    },
  ),
])

/** The block formats: a Button per allowed one. */
const blockGroup: Node = el('div', { class: ['group'] }, [
  each('blocks', 'block', 'block.format', [
    control(
      {
        icon: 'block.icon',
        label: 'say[block.format]',
        pressed: 'active?.[block.format] ?? false',
        disabled: 'locked || can?.[block.format] === false',
      },
      { click: run('command($event, (live) => live.toggle(block.format))') },
    ),
  ]),
])

const historyGroup: Node = el('div', { class: ['group'] }, [
  control(
    { icon: lit('undo'), label: 'say.undo', disabled: 'locked || can?.undo !== true' },
    { click: run('command($event, (live) => live.undo())') },
  ),
  control(
    { icon: lit('redo'), label: 'say.redo', disabled: 'locked || can?.redo !== true' },
    { click: run('command($event, (live) => live.redo())') },
  ),
])

/**
 * Groups divided by a vertical Separator: each group drawn while its
 * condition holds (always, for `null`), with a Separator before it when a
 * group before it is drawn.
 */
function interleave(groups: readonly (readonly [Expr | null, Node])[]): Node[] {
  return groups.flatMap(([drawn, group], at) => {
    const before = groups.slice(0, at).map(([earlier]) => `(${earlier ?? 'true'})`)
    const content: Node[] = [
      ...(before.length === 0
        ? []
        : [cond(before.join(' || '), [member('Separator', { orientation: lit('vertical') })])]),
      group,
    ]
    return drawn === null ? content : [cond(drawn, content)]
  })
}

const MARKS_DRAWN = "marks.length > 0 || has('link')"
const HEADING_DRAWN = "has('heading')"
const BLOCKS_DRAWN = 'blocks.length > 0'

/** The count: `{length} / {maxLength}`, or how many over in words. */
const count: Node = cond('maxLength !== undefined', [
  el(
    'p',
    {
      part: 'count',
      class: ['count'],
      attrs: { id: 'countId', 'data-state': when('overLimit', lit('over')) },
    },
    [text('overLimit ? say.overLimit(over) : say.count(length, maxLength)')],
  ),
])

/** The selection bar's and the toolbar's handlers: one tab stop, the keys, and the press that keeps the selection. */
const toolbarHandlers = (
  stops: string,
  own: Record<string, Handler> = {},
): Record<string, Handler> => ({
  keydown: run(`toolbarKeydown($event.currentTarget as HTMLElement, $event, ${stops}, focusText)`),
  focusin: run(`toolbarFocusIn($event.currentTarget as HTMLElement, $event, ${stops})`),
  focusout: run(`toolbarFocusOut($event.currentTarget as HTMLElement, $event, ${stops})`),
  mousedown: run('toolbarPress($event.currentTarget as HTMLElement, $event)'),
  ...own,
})

/**
 * RichTextInput (`design/components/rich-text-input.md`): a field that holds a
 * rich-text document. The editor is the engine's
 * (`@polymorph/engine/rich-text-editor`), mounted on the surface this member
 * renders in an effect and destroyed with it, so a server renders the frame,
 * the toolbar and an empty surface. The editor owns the caret, the keys, the
 * history and the paste inside the surface; the member owns everything a
 * person reads: the toolbar, the link form, the text style Menu, the
 * suggestion list, the selection bar, the count, the footer and every
 * announcement.
 *
 * The editor's callbacks are closures over the member's scope, which each
 * framework reads when the editor calls them, so the editor is made once. The
 * toolbars' keys and the places of the selection bar and of the suggestion
 * list are the engine's (`toolbarKeydown`, `placeSelectionBar`,
 * `placeTokenList`), which the React member calls too.
 */
export default describeMember({
  member: 'RichTextInput',
  dir: 'controls',
  recipe: 'controls/rich-text-input',
  recipes: { selectionBar: 'controls/selection-bar' },
  types: {
    RichTextInputMinRows: "NonNullable<RichTextInputProps['minRows']>",
    RichTextInputMaxRows: "NonNullable<RichTextInputProps['maxRows']>",
    RichTextToolbarPlacement: "NonNullable<RichTextInputProps['toolbarPlacement']>",
    RichTextEntityOption:
      '{ id: string; label: string; description?: string; icon?: IconRole; leading?: VNode; entityLabel?: string }',
    RichTextEntitySource:
      "{ kind: string; trigger: string; label: string; options: RichTextEntityOption[]; filter?: 'contains' | 'startsWith' | false; loading?: boolean; error?: string; onQueryChange?: (query: string) => void }",
    RichTextInputSelection: '{ empty: boolean; text: string; range: RichTextRange }',
    RichTextInputEditor:
      '{ focus(): void; clear(): void; insertText(text: string): void; insertEntity(entity: { kind: string; id: string; label: string }): void; annotate(id: string): boolean; removeAnnotation(id: string): boolean; readonly value: RichTextDocument; readonly empty: boolean; readonly length: number; readonly overLimit: boolean; readonly disabled: boolean; readonly selection: RichTextInputSelection }',
    RichTextInputMessages:
      '{ toolbar?: string; selectionBar?: string; selectionBarReady?: string; bold?: string; italic?: string; strike?: string; code?: string; link?: string; textStyle?: string; paragraph?: string; heading?: (level: 1 | 2 | 3) => string; bulletList?: string; orderedList?: string; blockquote?: string; codeBlock?: string; undo?: string; redo?: string; linkForm?: string; linkAddress?: string; linkApply?: string; linkRemove?: string; linkInvalid?: string; formatOn?: (format: string) => string; formatOff?: (format: string) => string; linkAdded?: string; linkRemoved?: string; inserted?: (label: string) => string; undone?: string; redone?: string; count?: (length: number, maxLength: number) => string; overLimit?: (over: number) => string; withinLimit?: string; submitEmpty?: string; submitOverLimit?: (over: number) => string; submitPending?: string; suggestions?: (count: number) => string; loadingSuggestions?: string; noSuggestions?: string }',
  },
  defaults: {
    entities: '() => []',
    minRows: '3',
    maxRows: '12',
    invalid: 'false',
    disabled: 'false',
    readOnly: 'false',
    autoFocus: 'false',
    pending: 'false',
    toolbarPlacement: lit('fixed'),
  },
  state: {
    // The document while the caller does not control it.
    own: 'defaultValue ?? emptyRichText()',
    // What the editor last published; null until it is mounted.
    editorState: 'null as RichTextEditorState | null',
    // The status region's words, each with a number of its own so the same words are heard again.
    said: "{ text: '', at: 0 }",
    // The active option, by its index in the list for one token and one query.
    highlight: "{ key: '', index: 0 }",
    // The query the app last heard, by token and query.
    reported: 'null as string | null',
    // The drawn annotation the caret was last reported in, and while a press is down, the one the
    // caret entered during it, so the press does not report it twice.
    caretAnnotation: 'null as string | null',
    press: 'null as { entered: string | null } | null',
    linkOpen: 'false',
    linkDraft: "''",
    linkError: 'undefined as string | undefined',
    // The target of the link the selection was in when the form opened.
    linkTarget: 'null as string | null',
    headingOpen: 'false',
    // Whether the text style Menu was opened with the pointer, which returns focus to the text.
    headingByPointer: 'false',
    byPointer: 'false',
    // Whether the text or the bar has focus, from their own focus events. A move between the two
    // sets the side focus arrives on before the side it leaves, so the bar stays drawn through it
    // in a framework that writes the document as each value changes.
    textFocused: 'false',
    barFocus: 'false',
    // A pointer selection shows the bar when the press ends, not while it is dragged.
    selecting: 'false',
    // The selection Escape hid the bar for.
    barDismissed: 'null as string | null',
    // Whether the bar's first appearance since the text took focus has been said.
    barHeard: 'false',
  },
  derived: {
    // The mounted editor, held outside the framework's reactivity: the field reads it when a
    // control or a callback runs, and the editor's state re-renders the field. Beside it, the
    // handle the app's slots were last given (`handle`).
    held: '{ editor: null as RichTextEditor | null, handle: null as RichTextInputEditor | null }',
    say: `({ ...${DEFAULT_MESSAGES}, ...(messages === undefined ? {} : Object.fromEntries(Object.entries(messages).filter(([, words]) => words !== undefined))) }) as Required<RichTextInputMessages>`,

    // The document, its length and the limit.
    doc: 'value ?? own',
    empty: 'isRichTextEmpty(doc)',
    length: 'richTextLength(doc)',
    over: 'maxLength === undefined ? 0 : Math.max(0, length - maxLength)',
    overLimit: 'over > 0',
    unwritable: 'readOnly || pending',
    // Disabled, read-only or pending: nothing edits the text.
    locked: 'disabled || unwritable',
    editable: '!locked',
    // The formats in the toolbar's order.
    allowed:
      'RICH_TEXT_FORMATS.filter((format) => (formats ?? RICH_TEXT_FORMATS).includes(format))',
    has: '(format: RichTextFormat) => allowed.includes(format)',
    kinds: 'entities.map((entry) => ({ kind: entry.kind, trigger: entry.trigger }))',
    marks:
      "([['bold', 'bold'], ['italic', 'italic'], ['strike', 'strikethrough'], ['code', 'code']] as const).filter(([format]) => has(format)).map(([format, icon]) => ({ format, icon }))",
    blocks:
      "([['bulletList', 'list-bulleted'], ['orderedList', 'list-numbered'], ['blockquote', 'quote'], ['codeBlock', 'code-block']] as const).filter(([format]) => has(format)).map(([format, icon]) => ({ format, icon }))",

    surfaceId: 'id ?? `${uid}-surface`',
    listId: '`${uid}-suggestions`',
    countId: '`${uid}-count`',
    active: 'editorState?.active',
    can: 'editorState?.can',
    selection:
      "({ empty: editorState?.collapsed ?? true, text: editorState?.selectedText ?? '', range: editorState?.range ?? { start: 0, end: 0 } })",
    focusText: '() => held.editor?.focus()',

    // Announcements.
    announce: '(words: string) => { said = { text: words, at: said.at + 1 } }',
    formatName:
      "(format: Exclude<RichTextFormat, 'link'>): string => format === 'heading' ? say.textStyle : say[format]",
    heard: `(event: RichTextEditorEvent) => {
      if (event.type === 'format') announce((event.active ? say.formatOn : say.formatOff)(formatName(event.format)))
      else if (event.type === 'heading') announce(event.level === 0 ? say.paragraph : say.heading(event.level))
      else if (event.type === 'link') announce(event.active ? say.linkAdded : say.linkRemoved)
      else if (event.type === 'entity') announce(say.inserted(event.entity.label))
      else if (event.type === 'undo') announce(say.undone)
      else announce(say.redone)
    }`,
    // The document the person or a command changed: the field's own copy, the app's handler and
    // the limit, said once as the text crosses it each way.
    changed: `(next: RichTextDocument) => {
      if (maxLength !== undefined) {
        const was = richTextLength(doc) > maxLength
        const nextOver = Math.max(0, richTextLength(next) - maxLength)
        if (!was && nextOver > 0) announce(say.overLimit(nextOver))
        else if (was && nextOver === 0) announce(say.withinLimit)
      }
      own = next
      emit('change', next)
    }`,
    // Replaces the document as one change, as an agent's fill does.
    replace:
      '(editor: RichTextEditor, next: RichTextDocument) => { editor.setValue(next); changed(editor.getValue()) }',

    // The suggestion list. Combobox's filter: the locale's collation at base sensitivity.
    collator: "new Intl.Collator(undefined, { usage: 'search', sensitivity: 'base' })",
    suggestion: 'editable ? (editorState?.suggestion ?? null) : null',
    source:
      '((token) => token === null ? undefined : entities.find((entry) => entry.kind === token.kind))(suggestion)',
    open: 'suggestion !== null && source !== undefined',
    query: "suggestion?.query ?? ''",
    needle: "query.normalize('NFC')",
    matches:
      "(label: string) => ((candidate: string) => needle === '' || (source?.filter === 'startsWith' ? collator.compare(candidate.slice(0, needle.length), needle) === 0 : Array.from({ length: Math.max(0, candidate.length - needle.length + 1) }, (_, at) => candidate.slice(at, at + needle.length)).some((part) => collator.compare(part, needle) === 0)))(label.normalize('NFC'))",
    loading: 'open && source?.loading === true',
    failed: "open && !loading && source?.error !== undefined && source.error !== ''",
    // `false` means the app has filtered, so its options are shown as given.
    shown:
      '!open || failed || source === undefined ? [] : source.filter === false ? source.options : source.options.filter((option) => matches(option.label))',
    // One token and one query: the active option starts at the first again.
    listKey: "open && suggestion !== null ? `${suggestion.key}:${query}` : ''",
    activeOption:
      'shown.length === 0 ? -1 : highlight.key === listKey ? Math.min(highlight.index, shown.length - 1) : 0',
    listStatus:
      "!open ? null : loading ? say.loadingSuggestions : failed ? (source?.error ?? '') : shown.length === 0 ? say.noSuggestions : say.suggestions(shown.length)",
    pick: `(index: number) => {
      const option = shown[index]
      const editor = held.editor
      const from = source
      if (option === undefined || from === undefined || editor === null) return
      reported = null
      editor.insertEntity({ kind: from.kind, id: option.id, label: option.entityLabel ?? from.trigger + option.label })
    }`,
    // The keys the open list takes; returns whether it took the key. Enter picks the active
    // option; while the options load it does nothing, because they are about to arrive, and when
    // nothing matches it is the editor's own Enter.
    suggestionKey: `(key: RichTextSuggestionKey): boolean => {
      if (!open) return false
      if (key === 'ArrowDown' || key === 'ArrowUp') {
        if (shown.length === 0) return false
        highlight = { key: listKey, index: key === 'ArrowDown' ? Math.min(activeOption + 1, shown.length - 1) : Math.max(activeOption - 1, 0) }
        return true
      }
      if (key === 'Enter') {
        if (activeOption === -1) return loading
        pick(activeOption)
        return true
      }
      if (key === 'Tab') {
        if (activeOption === -1) return false
        pick(activeOption)
        return true
      }
      held.editor?.dismissSuggestion()
      return true
    }`,

    // Annotations.
    drawn: '(annotation: string) => annotations === undefined || annotations.includes(annotation)',

    // The editor's state: the field redraws, the app hears the query when the list opens and at
    // each change while it is open, and the caret entering a drawn annotation is reported.
    stated: `(next: RichTextEditorState) => {
      editorState = next
      const token = next.suggestion
      const nextSource = token === null ? undefined : entities.find((entry) => entry.kind === token.kind)
      const key = token === null || nextSource === undefined ? null : token.key + ':' + token.query
      if (key !== reported) {
        reported = key
        if (token !== null && key !== null) nextSource?.onQueryChange?.(token.query)
      }
      const at = next.collapsed ? (next.annotations.find((annotation) => drawn(annotation)) ?? null) : null
      if (at !== null && at !== caretAnnotation) {
        if (press !== null) press = { entered: at }
        emit('annotationSelect', at)
      }
      caretAnnotation = at
    }`,

    // The field, handed to the app's toolbar, selection actions and footer, and to `submit`. Its
    // values are the field as it was drawn; its methods act on the field as it is now. It is the
    // same object while its values are the same, so a framework that draws a slot again when its
    // argument changes (Solid's render functions, and the elements' over them) keeps the app's
    // controls, and the focus in one, when only the text's focus moves.
    handle: `((next: RichTextInputEditor): RichTextInputEditor => {
      const last = held.handle
      if (
        last !== null &&
        last.value === next.value &&
        last.empty === next.empty &&
        last.length === next.length &&
        last.overLimit === next.overLimit &&
        last.disabled === next.disabled &&
        last.selection.empty === next.selection.empty &&
        last.selection.text === next.selection.text &&
        last.selection.range.start === next.selection.range.start &&
        last.selection.range.end === next.selection.range.end
      )
        return last
      held.handle = next
      return next
    })({
      focus: () => held.editor?.focus(),
      clear: () => held.editor?.clear(),
      insertText: (words: string) => held.editor?.insertText(words),
      insertEntity: (entity: { kind: string; id: string; label: string }) => held.editor?.insertEntity(entity),
      annotate: (annotation: string) => held.editor?.annotate(annotation) ?? false,
      removeAnnotation: (annotation: string) => held.editor?.removeAnnotation(annotation) ?? false,
      value: doc,
      empty,
      length,
      overLimit,
      disabled: locked,
      selection,
    })`,
    // Mod+Enter and the submit control: refused, with the reason said, while the field cannot be
    // submitted.
    submit: `() => {
      if (!listening.submit || disabled) return
      if (pending) return announce(say.submitPending)
      if (empty) return announce(say.submitEmpty)
      if (overLimit) return announce(say.submitOverLimit(over))
      emit('submit', held.editor?.getValue() ?? doc, handle)
    }`,

    // The link form.
    openLink: `(next: boolean) => {
      if (next) {
        const target = held.editor?.getState().active.link ?? null
        linkDraft = target ?? ''
        linkError = undefined
        linkTarget = target
      }
      linkOpen = next
    }`,
    applyLink: `(event: Event) => {
      event.preventDefault()
      event.stopPropagation()
      const raw = linkDraft.trim()
      const editor = held.editor
      if (raw === '' || richTextHref(raw, { typed: true }) === null || editor === null || !editor.setLink(raw)) {
        linkError = say.linkInvalid
        return
      }
      linkOpen = false
    }`,
    removeLink: '() => { held.editor?.setLink(null); linkOpen = false }',
    // The form opens from its control, which the selection bar draws only for a selection.
    requestLink: `() => {
      const editor = held.editor
      const anchored = toolbarPlacement === 'fixed' || barOpen
      if (editor === null || !editable || !editor.getState().can.link || !anchored) return
      openLink(true)
    }`,

    // The text style Menu.
    level: 'active === undefined ? 0 : active.codeBlock ? -1 : active.heading',
    headingItems:
      "([0, 1, 2, 3] as const).map((choice) => ({ kind: 'checkbox' as const, label: choice === 0 ? say.paragraph : say.heading(choice), checked: level === choice, onCheckedChange: () => chooseHeading(choice) }))",
    openHeading:
      '(next: boolean) => { if (next) headingByPointer = byPointer; headingOpen = next }',
    chooseHeading:
      '(choice: 0 | 1 | 2 | 3) => { held.editor?.setHeading(choice); headingOpen = false }',
    // Focus back to the text once a popup has closed and the machine has given focus to its
    // trigger, which it does a frame later: two frames, then the text.
    afterPopup: `(then: () => void) => {
      const view = root?.ownerDocument.defaultView
      view?.requestAnimationFrame(() => view.requestAnimationFrame(then))
    }`,
    // The link form returns focus to the text with the selection as it was, unless the person
    // moved focus somewhere else.
    linkClosed: `() => {
      const popover = linkForm?.closest('[data-member="popover"]') ?? null
      afterPopup(() => {
        const owner = root?.ownerDocument
        const at = owner?.activeElement ?? null
        if (at === null || at === owner?.body || root?.contains(at) === true || popover?.contains(at) === true) held.editor?.focus()
      })
    }`,
    // The Menu opened with the pointer returns focus to the text; from the keys, to its control.
    headingClosed: '() => { if (headingByPointer) afterPopup(() => held.editor?.focus()) }',

    // The selection bar.
    formatsInBar: "toolbarPlacement === 'selection' && editable && allowed.length > 0",
    actionsInBar: '!!slots.selectionActions && !disabled',
    rangeKey: '`${selection.range.start}:${selection.range.end}`',
    barPopup: 'formatsInBar && (linkOpen || headingOpen)',
    barOpen:
      '(formatsInBar || actionsInBar) && editorState !== null && !editorState.collapsed && (textFocused || barFocus || barPopup) && !selecting && barDismissed !== rangeKey',
    // Escape on the text: the list first, then the bar. Returns whether either took it.
    escape: `(): boolean => {
      if (open) {
        held.editor?.dismissSuggestion()
        return true
      }
      if (barOpen) {
        barDismissed = rangeKey
        return true
      }
      return false
    }`,
    // The first Escape on the text is the list's, then the bar's. A dialog's layer hears Escape on
    // the document in the capture phase, before the text does, and closes unless the key's
    // default is prevented, so while either is open the field prevents it on the window, which the
    // key reaches first, and acts on it there. Returns what stops holding.
    holdSurfaceEscape: `(element: HTMLElement) => {
      const view = element.ownerDocument.defaultView
      const hold = (event: KeyboardEvent) => {
        if (event.key !== 'Escape' || event.isComposing || event.target !== element) return
        if (escape()) event.preventDefault()
      }
      view?.addEventListener('keydown', hold, true)
      return () => view?.removeEventListener('keydown', hold, true)
    }`,
    // Escape in a toolbar is the toolbar's (`holdToolbarEscape`), read from the element now drawn.
    holdEscapeIn: `(element: HTMLElement, now: () => HTMLElement | null | undefined) => {
      const view = element.ownerDocument.defaultView
      return view === null ? () => {} : holdToolbarEscape(view, now)
    }`,
    // A pointer selection shows the bar when the press ends.
    releaseSelecting: `(element: HTMLElement) => {
      const view = element.ownerDocument.defaultView
      const release = () => { selecting = false }
      view?.addEventListener('pointerup', release, true)
      view?.addEventListener('pointercancel', release, true)
      return () => {
        view?.removeEventListener('pointerup', release, true)
        view?.removeEventListener('pointercancel', release, true)
      }
    }`,
    holding: 'open || barOpen',
    // Each toolbar's tab stop, one object per toolbar for the field's life.
    toolbarStops: 'toolbarStop()',
    barStops: 'toolbarStop()',
    placeBar: '() => placeSelectionBar(bar, held.editor?.selectionRect())',

    // The surface's attributes, which the field draws and the editor keeps.
    describedByAll:
      "[ariaDescribedby, maxLength === undefined ? undefined : countId].filter((part) => part !== undefined).join(' ') || undefined",
    suggesting: 'entities.length > 0',
    attributes: `({
      id: surfaceId,
      role: 'textbox',
      'aria-multiline': 'true',
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledby,
      'aria-describedby': describedByAll,
      'aria-required': ariaRequired === true ? 'true' : undefined,
      'aria-invalid': invalid || overLimit ? 'true' : undefined,
      'aria-disabled': disabled ? 'true' : undefined,
      'aria-readonly': !disabled && unwritable ? 'true' : undefined,
      tabindex: disabled ? undefined : '0',
      'aria-autocomplete': suggesting ? 'list' : undefined,
      'aria-haspopup': suggesting ? 'listbox' : undefined,
      'aria-controls': open && shown.length > 0 ? listId : undefined,
      'aria-activedescendant': open && shown.length > 0 && activeOption !== -1 ? \`\${uid}-suggestion-\${activeOption}\` : undefined,
    }) as Record<string, string | undefined>`,
    // What changes without a new editor, as one key: the schema's formats and kinds, editing, the
    // attributes, the placeholder and the annotations.
    options:
      'JSON.stringify([allowed, kinds, editable, attributes, placeholder ?? null, annotations ?? null, activeAnnotation ?? null, listening.submit, listening.files])',
    editorUpdate: `() => ({
      formats: allowed,
      entities: kinds,
      editable,
      attributes,
      placeholder,
      annotations,
      activeAnnotation,
      onSubmit: listening.submit ? () => submit() : undefined,
      onFiles: listening.files ? (files: File[]) => emit('files', files) : undefined,
    })`,
    // The editor, mounted on the surface once and destroyed with it. Its callbacks read the
    // field's scope when the editor calls them, so it never needs a new one.
    mountEditor: `(element: HTMLElement) => {
      const editor = createRichTextEditor({
        element,
        value: doc,
        formats: allowed,
        entities: kinds,
        classes: ${CLASSES},
        editable,
        attributes,
        placeholder,
        annotations,
        activeAnnotation,
        onChange: (next) => changed(next),
        onState: (next) => stated(next),
        onEvent: (event) => heard(event),
        onSubmit: listening.submit ? () => submit() : undefined,
        onLinkRequest: () => requestLink(),
        onSuggestionKey: (key) => suggestionKey(key),
        onFiles: listening.files ? (files) => emit('files', files) : undefined,
        onFocus: () => { barHeard = false; emit('focus') },
        onBlur: () => emit('blur'),
      })
      held.editor = editor
      // The editor publishes its state after a change, and not at mount.
      stated(editor.getState())
      if (autoFocus) editor.focus('end')
      return () => {
        editor.destroy()
        held.editor = null
      }
    }`,

    // A toolbar command. A pointer press gives the text focus; from the keys, focus stays on the
    // control.
    command: `(event: MouseEvent, act: (live: RichTextEditor) => unknown) => {
      const live = held.editor
      if (live === null) return
      act(live)
      if (event.detail > 0) live.focus()
    }`,

    // The surface's own keys: Mod+Enter on text that takes no editing (the editor takes no key
    // then, so a pending field says why it does not submit), and Alt+F10 to the controls, the bar
    // while it is drawn.
    surfaceKey: `(event: KeyboardEvent) => {
      if (unwritable && event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.isComposing) {
        event.preventDefault()
        submit()
        return
      }
      if (!event.altKey || event.key !== 'F10') return
      event.preventDefault()
      if (barOpen) enterToolbar(bar, barStops)
      else if (toolbarDrawn) enterToolbar(toolbarRow, toolbarStops)
    }`,
    surfacePress: `() => {
      press = { entered: null }
      if (slots.selectionActions || formatsInBar) selecting = true
    }`,
    // A press on a drawn annotation reports it, once per press.
    surfaceClick: `(event: MouseEvent) => {
      const pressed = press
      press = null
      const target = event.target instanceof Element ? event.target : null
      const annotation = target?.closest('[data-annotation-id]')?.getAttribute('data-annotation-id')
      if (annotation === null || annotation === undefined || !drawn(annotation)) return
      if (held.editor?.getState().collapsed === false || disabled) return
      caretAnnotation = annotation
      if (pressed?.entered !== annotation) emit('annotationSelect', annotation)
    }`,
    surfaceLeave: `(event: FocusEvent) => {
      const to = event.relatedTarget
      if (to instanceof Node && bar?.contains(to) === true) barFocus = true
      textFocused = false
    }`,
    barLeave: `(event: FocusEvent) => {
      const to = event.relatedTarget
      if (to instanceof Node && surface?.contains(to) === true) textFocused = true
      if (!(to instanceof Node) || !(event.currentTarget as HTMLElement).contains(to)) barFocus = false
    }`,

    // What is drawn.
    fixed: "toolbarPlacement === 'fixed'",
    toolbarDrawn: 'fixed || !!slots.toolbar',
    defaultFooter: '!slots.footer && submitLabel !== undefined && listening.submit',
    footerDrawn: '!!slots.footer || defaultFooter',
  },
  controlRefs: { surface: 'controlRef' },
  presence: {
    // The bar fades out through its recipe's closed state, and takes no focus and no press then.
    barPresent: { open: 'barOpen', ref: 'bar' },
  },
  effects: [
    { run: 'surface ? mountEditor(surface) : () => {}', release: 'ran()' },
    // The options that change without a new editor.
    { watch: 'options', mount: false, run: 'held.editor?.update(editorUpdate())' },
    // A controlled value is the document. The editor compares it with its own and replaces only a
    // document that differs, with no change event and no undo step.
    {
      watch: '[value, own]',
      mount: false,
      run: 'value === undefined || held.editor?.setValue(value)',
    },
    // The list's status, said each time it changes while the list is open.
    { watch: 'listStatus', run: 'listStatus === null || announce(listStatus)' },
    // The list at its token, each time the token or the list's height may have changed.
    {
      watch: '[suggestion, shown.length, loading, failed]',
      run: 'placeTokenList(panel, root, suggestion?.rect)',
    },
    {
      watch: 'holding',
      run: 'holding && surface ? holdSurfaceEscape(surface) : () => {}',
      release: 'ran()',
    },
    {
      watch: 'selecting',
      run: 'selecting && root ? releaseSelecting(root) : () => {}',
      release: 'ran()',
    },
    // Each toolbar's tab stop, written again when its controls change or are disabled.
    {
      watch: 'toolbarDrawn',
      run: 'syncToolbarStop(toolbarRow, toolbarStops)',
      mutation: ['toolbarRow'],
      attributes: ['disabled', 'aria-disabled', 'hidden', 'inert'],
    },
    {
      watch: 'toolbarDrawn',
      run: 'toolbarDrawn && toolbarRow ? holdEscapeIn(toolbarRow, () => toolbarRow) : () => {}',
      release: 'ran()',
    },
    {
      watch: 'barPresent',
      run: 'syncToolbarStop(bar, barStops)',
      mutation: ['bar'],
      attributes: ['disabled', 'aria-disabled', 'hidden', 'inert'],
    },
    {
      watch: 'barPresent',
      run: 'barPresent && bar ? holdEscapeIn(bar, () => bar) : () => {}',
      release: 'ran()',
    },
    // The bar at the selection, as the selection changes, and as the page scrolls and the window
    // resizes under it.
    { watch: '[barOpen, editorState]', run: 'barOpen && placeBar()' },
    {
      watch: 'barOpen',
      run: 'barOpen && bar ? followSelectionBar(bar, placeBar) : () => {}',
      release: 'ran()',
    },
    // The first time a bar appears after the text took focus, the status says so.
    {
      watch: 'barOpen',
      run: 'barOpen && !barHeard && ((barHeard = true), announce(say.selectionBarReady))',
    },
    { watch: 'linkOpen', mount: false, run: 'linkOpen || linkClosed()' },
    { watch: 'headingOpen', mount: false, run: 'headingOpen || headingClosed()' },
  ],
  statics: { controlKind: lit('group') },
  // The spec's `agent` fence. An agent reads the text and fills, clears and submits it, as a
  // person's keys do: through the editor, so `change` is emitted in either form. The field's own
  // controls (the toolbar's, the selection bar, the link form's Popover and the default footer)
  // are withheld; the app's toolbar slot and its footer are the app's, and stay an agent's.
  agent: {
    on: 'surface',
    state: {
      value: 'richTextPlainText(doc)',
      disabled: 'disabled',
      invalid: 'invalid || overLimit',
      readonly: 'unwritable',
      empty: 'empty',
    },
    actions: {
      fill: {
        argument: 'text',
        run: `(() => {
          if (unwritable) throw new Error('The field is read-only.')
          const editor = held.editor
          if (editor === null) throw new Error('The field is not ready.')
          replace(editor, richTextFromText(value))
        })()`,
      },
      clear: `(() => {
        if (unwritable) throw new Error('The field is read-only.')
        const editor = held.editor
        if (editor === null) throw new Error('The field is not ready.')
        editor.clear()
      })()`,
      submit: `(() => {
        if (!listening.submit) throw new Error('The field has no submit.')
        if (pending) throw new Error('The app is saving; wait for it to finish.')
        if (empty) throw new Error('The field is empty, and an empty field is not submitted.')
        if (overLimit) throw new Error(\`The text is \${over} characters over the limit.\`)
        emit('submit', held.editor?.getValue() ?? doc, handle)
      })()`,
    },
    withholds: '[controls, actions, bar, linkForm?.closest(\'[data-member="popover"]\') ?? null]',
  },
  template: el(
    'div',
    {
      part: 'root',
      ref: 'root',
      class: ['root'],
      attrs: {
        'data-min-rows': 'String(minRows)',
        'data-max-rows': 'String(maxRows)',
        'data-empty': flag('empty'),
        'data-disabled': flag('disabled'),
        'data-readonly': flag('!disabled && unwritable'),
        'data-invalid': flag('invalid || overLimit'),
        ...identity('RichTextInput'),
      },
    },
    [
      el('div', { part: 'frame', class: ['frame'] }, [
        cond('toolbarDrawn', [
          el(
            'div',
            {
              part: 'toolbar',
              ref: 'toolbarRow',
              class: ['toolbar'],
              attrs: {
                role: lit('toolbar'),
                'aria-label': 'say.toolbar',
                'aria-controls': 'surfaceId',
                'data-rich-text-input-part': lit('toolbar'),
              },
              on: toolbarHandlers('toolbarStops', NOTE_POINTER),
            },
            [
              cond('fixed', [
                el(
                  'div',
                  { part: 'controls', ref: 'controls', class: ['controls'] },
                  interleave([
                    [MARKS_DRAWN, markGroup],
                    [HEADING_DRAWN, headingGroup],
                    [BLOCKS_DRAWN, blockGroup],
                    [null, historyGroup],
                  ]),
                ),
              ]),
              cond('slots.toolbar', [
                el('div', { part: 'slot', class: ['slot'] }, [slot('toolbar', { props: HANDLE })]),
              ]),
            ],
          ),
        ]),
        el('div', { part: 'viewport', class: ['viewport'] }, [
          // The editor's element: the field draws its attributes and none of its content.
          el('div', {
            part: 'surface',
            ref: 'surface',
            class: ['surface'],
            attrs: {
              'data-rich-text-input-part': lit('surface'),
              id: 'surfaceId',
              role: lit('textbox'),
              'aria-multiline': lit('true'),
              'aria-label': 'ariaLabel',
              'aria-labelledby': 'ariaLabelledby',
              'aria-describedby': 'describedByAll',
              // The same values the editor keeps (`attributes`), typed as each attribute is.
              'aria-required': when('ariaRequired === true', lit('true')),
              'aria-invalid': when('invalid || overLimit', lit('true')),
              'aria-disabled': when('disabled', lit('true')),
              'aria-readonly': when('!disabled && unwritable', lit('true')),
              tabindex: when('!disabled', lit('0')),
              'aria-autocomplete': when('suggesting', lit('list')),
              'aria-haspopup': when('suggesting', lit('listbox')),
              'aria-controls': "attributes['aria-controls']",
              'aria-activedescendant': "attributes['aria-activedescendant']",
            },
            on: {
              keydown: run('surfaceKey($event)'),
              pointerdown: run('surfacePress()'),
              click: run('surfaceClick($event)'),
              focusin: run('(textFocused = true)'),
              focusout: run('surfaceLeave($event)'),
            },
          }),
        ]),
        // The selection bar, at the selected text: the app's actions, then the format controls.
        cond('barPresent', [
          el(
            'div',
            {
              part: 'selection bar',
              ref: 'bar',
              class: ['selectionBar.bar'],
              attrs: {
                role: lit('toolbar'),
                'aria-label': 'say.selectionBar',
                'data-state': when('!barOpen', lit('closed')),
                inert: when('!barOpen', 'true'),
              },
              on: toolbarHandlers('barStops', {
                focusin: run(
                  '(toolbarFocusIn($event.currentTarget as HTMLElement, $event, barStops), (barFocus = true))',
                ),
                focusout: run(
                  '(toolbarFocusOut($event.currentTarget as HTMLElement, $event, barStops), barLeave($event))',
                ),
              }),
            },
            [
              el(
                'div',
                { class: ['controls'], on: NOTE_POINTER },
                interleave([
                  [
                    'actionsInBar',
                    el('div', { class: ['group'] }, [slot('selectionActions', { props: HANDLE })]),
                  ],
                  [`formatsInBar && (${MARKS_DRAWN})`, markGroup],
                  [`formatsInBar && ${HEADING_DRAWN}`, headingGroup],
                  [`formatsInBar && ${BLOCKS_DRAWN}`, blockGroup],
                ]),
              ),
            ],
          ),
        ]),
        cond('footerDrawn', [
          el('div', { part: 'footer', class: ['footer'] }, [
            count,
            cond(
              'slots.footer',
              [slot('footer', { props: HANDLE })],
              [
                el('div', { part: 'actions', ref: 'actions', class: ['actions'] }, [
                  cond('cancelLabel !== undefined && listening.cancel', [
                    member(
                      'Button',
                      {
                        variant: lit('ghost'),
                        tone: lit('neutral'),
                        size: lit('sm'),
                        label: 'cancelLabel',
                        disabled: 'disabled',
                      },
                      { on: { click: run("emit('cancel')") } },
                    ),
                  ]),
                  member(
                    'Button',
                    {
                      variant: lit('solid'),
                      tone: lit('accent'),
                      size: lit('sm'),
                      label: "submitLabel ?? ''",
                      disabled: 'disabled || empty || overLimit',
                      loading: 'pending',
                    },
                    { on: { click: run('submit()') } },
                  ),
                ]),
              ],
            ),
          ]),
        ]),
      ]),
      cond('!footerDrawn', [count]),
      // The suggestions, at the token. A press on them keeps focus in the text.
      cond('open && source !== undefined', [
        el(
          'div',
          {
            part: 'suggestions',
            ref: 'panel',
            class: ['suggestions'],
            attrs: { 'data-rich-text-input-part': lit('suggestions') },
            on: { mousedown: run('$event.preventDefault()') },
          },
          [
            cond('shown.length > 0', [
              el(
                'ul',
                {
                  part: 'list',
                  class: ['listbox'],
                  attrs: { id: 'listId', role: lit('listbox'), 'aria-label': 'source?.label' },
                },
                [
                  each(
                    'shown',
                    'option',
                    'option.id',
                    [
                      el(
                        'li',
                        {
                          part: 'option',
                          class: ['option'],
                          attrs: {
                            id: '`${uid}-suggestion-${index}`',
                            role: lit('option'),
                            'aria-selected': "index === activeOption ? 'true' : 'false'",
                            'data-highlighted': flag('index === activeOption'),
                          },
                          on: {
                            pointermove: run(
                              '(highlight = { key: listKey, index })',
                              'index !== activeOption',
                            ),
                            click: run('pick(index)'),
                          },
                        },
                        [
                          cond(
                            'option.leading !== undefined',
                            [
                              el(
                                'span',
                                { class: ['leading'], attrs: { 'aria-hidden': lit('true') } },
                                [render('option.leading')],
                              ),
                            ],
                            'option.icon !== undefined',
                            [
                              el('span', { class: ['glyph'] }, [
                                member('Icon', { name: 'option.icon', size: lit('sm') }),
                              ]),
                            ],
                          ),
                          el('span', { class: ['text'] }, [
                            el('span', { class: ['label'] }, [text('option.label')]),
                            cond('option.description !== undefined', [
                              el('span', { class: ['description'] }, [text('option.description')]),
                            ]),
                          ]),
                        ],
                      ),
                    ],
                    'index',
                  ),
                ],
              ),
            ]),
            // Combobox's loading rows; the error and empty rows are heard once, through the status.
            cond('loading', [
              el('div', { class: ['rows'], attrs: { 'aria-hidden': lit('true') } }, [
                each('[0, 1, 2]', 'row', 'row', [
                  el('div', { class: ['row'] }, [member('Skeleton', { textStep: lit('sm') })]),
                ]),
              ]),
            ]),
            cond('failed', [
              el('div', { class: ['error'], attrs: { 'aria-hidden': lit('true') } }, [
                text('source?.error'),
              ]),
            ]),
            cond('!loading && !failed && shown.length === 0', [
              el('div', { class: ['empty'], attrs: { 'aria-hidden': lit('true') } }, [
                text('say.noSuggestions'),
              ]),
            ]),
          ],
        ),
      ]),
      el(
        'div',
        {
          part: 'status',
          class: ['status'],
          attrs: { role: lit('status'), 'aria-live': lit('polite') },
        },
        [
          cond("said.text !== ''", [
            el('span', { attrs: { key: 'said.at' } }, [text('said.text')]),
          ]),
        ],
      ),
      cond('name !== undefined', [
        el('input', {
          attrs: {
            type: lit('hidden'),
            name: 'name',
            value: 'serializeRichText(doc)',
            disabled: 'disabled',
          },
        }),
      ]),
    ],
  ),
  states: [
    {
      name: 'empty — a placeholder, every format',
      props: { 'aria-label': 'Comment', placeholder: 'Write a comment…' },
      expect: { 'data-empty': '', 'data-min-rows': '3', 'data-max-rows': '12' },
    },
    {
      name: 'with content — marks, a link, a list and a mention',
      props: { 'aria-label': 'Comment', defaultValue: CONTENT, entities: [PEOPLE] },
      expect: { 'data-empty': null },
    },
    {
      name: 'a comment composer — marks only, mentions, attach and the default footer',
      props: {
        'aria-label': 'Comment',
        placeholder: 'Write a comment…',
        formats: ['bold', 'italic', 'strike', 'code', 'link'],
        entities: [PEOPLE],
        minRows: 1,
        maxRows: 6,
        toolbar: renders(
          ['editor: { disabled: boolean }'],
          fx('Button', {
            ...small,
            iconOnly: true,
            icon: 'attach',
            label: 'Attach a file',
            disabled: js('editor.disabled'),
            onClick: noop,
          }),
        ),
        submitLabel: 'Comment',
        onSubmit: noop,
        cancelLabel: 'Cancel',
        onCancel: noop,
      },
      expect: { 'data-min-rows': '1', 'data-max-rows': '6' },
    },
    {
      name: 'a description editor — six rows, every format, a count',
      props: {
        'aria-label': 'Description',
        defaultValue: DESCRIPTION,
        minRows: 6,
        maxRows: 24,
        maxLength: 2000,
      },
      expect: { 'data-min-rows': '6', 'data-max-rows': '24', 'data-invalid': null },
    },
    {
      // Focused on mount, because the list opens while the caret is in a token.
      name: 'suggesting — the people an @ lists under the token',
      props: {
        'aria-label': 'Comment',
        defaultValue: richText(paragraph(textRun('Thanks @'))),
        autoFocus: true,
        entities: [PEOPLE],
      },
    },
    {
      name: 'suggestions loading — the app looks people up for the query',
      props: {
        'aria-label': 'Comment',
        defaultValue: richText(paragraph(textRun('Ask @gr'))),
        autoFocus: true,
        entities: [LOOKUP],
      },
    },
    {
      name: 'the app’s footer — its own controls under the field',
      props: {
        'aria-label': 'Description',
        defaultValue: DESCRIPTION,
        maxLength: 2000,
        footer: renders(
          ['editor: { empty: boolean; overLimit: boolean }'],
          [
            fx('Button', { ...small, label: 'Save draft', onClick: noop }),
            fx('Button', {
              variant: 'solid',
              tone: 'accent',
              size: 'sm',
              label: 'Publish',
              disabled: js('editor.empty || editor.overLimit'),
              onClick: noop,
            }),
          ],
        ),
      },
    },
    {
      name: 'over the limit — the count in danger, the field invalid',
      props: {
        'aria-label': 'Comment',
        defaultValue: LONG,
        maxLength: 40,
        formats: ['bold', 'italic', 'link'],
      },
      expect: { 'data-invalid': '' },
    },
    {
      name: 'invalid — inside a FormField with an error',
      many: {
        within: {
          member: 'FormField',
          props: { label: 'Description', error: 'Describe what changed.', required: true },
        },
        each: [{ props: { formats: ['bold', 'italic', 'link', 'bulletList'] } }],
      },
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled',
      props: { 'aria-label': 'Comment', disabled: true, defaultValue: CONTENT },
      expect: { 'data-disabled': '', 'data-readonly': null },
    },
    {
      name: 'read-only — selectable, not editable',
      props: { 'aria-label': 'Comment', readOnly: true, defaultValue: CONTENT },
      expect: { 'data-readonly': '' },
    },
    {
      name: 'pending — the app is saving the comment',
      props: {
        'aria-label': 'Comment',
        pending: true,
        defaultValue: CONTENT,
        submitLabel: 'Comment',
        onSubmit: noop,
      },
      expect: { 'data-readonly': '' },
    },
    {
      name: 'annotated — two comment threads, one active',
      props: {
        'aria-label': 'Description',
        defaultValue: ANNOTATED,
        annotations: ['thread-1', 'thread-2'],
        activeAnnotation: 'thread-2',
        onAnnotationSelect: noop,
      },
    },
    {
      // Words selected on mount, because the bar is drawn at a selection.
      name: 'the selection bar — the format controls and a comment at the selected words',
      props: {
        'aria-label': 'Description',
        defaultValue: DESCRIPTION,
        toolbarPlacement: 'selection',
        selectionActions: renders(
          [],
          fx('Button', { ...small, icon: 'comment', label: 'Comment', onClick: noop }),
        ),
      },
      // Focused, with the words selected, once the editor holds them, as the React fixture's
      // `controlRef` selects them.
      selects: { in: '[data-rich-text-input-part="surface"]', text: 'growing wait' },
    },
  ],
})
