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
/* The fixture's documents                                                    */
/* -------------------------------------------------------------------------- */

const FORMAT = 'polymorph-rich-text/1'

const t = (words: string, ...marks: unknown[]) =>
  marks.length === 0 ? { type: 'text', text: words } : { type: 'text', text: words, marks }

const p = (...content: unknown[]) => ({ type: 'paragraph', content })

const listItem = (...content: unknown[]) => ({ type: 'listItem', content })

const thread = (id: string) => ({ type: 'annotation', id })

/** A document as the app stores it, read through the engine's normal form. */
const richText = (...blocks: unknown[]) =>
  js(`normalizeRichText(${JSON.stringify({ format: FORMAT, blocks })})`)

const PROSE = richText(
  p(
    t('Retries are now '),
    t('exponential', { type: 'bold' }),
    t(', capped at five attempts, and each one '),
    t('doubles', { type: 'italic' }),
    t(' the wait. The '),
    t('three-attempt', { type: 'strike' }),
    t(' cap is gone.'),
  ),
  p(
    t('Every attempt carries the original '),
    t('Idempotency-Key', { type: 'code' }),
    t(' header.'),
    { type: 'break' },
    t('The timings are in '),
    t('the delivery guide', { type: 'link', href: 'https://docs.example.org/webhooks/retries' }),
    t('.'),
  ),
)

const STRUCTURE = richText(
  { type: 'heading', level: 1, content: [t('Webhook retries')] },
  p(t('A failed delivery is retried on a schedule.')),
  { type: 'heading', level: 2, content: [t('What changed')] },
  {
    type: 'list',
    ordered: false,
    items: [
      listItem(p(t('Retries carry the original idempotency key.'))),
      listItem(p(t('The backoff cap moved to five attempts.')), {
        type: 'list',
        ordered: false,
        items: [
          listItem(p(t('The first retry fires after two seconds.'))),
          listItem(p(t('Each later one doubles the wait.'))),
        ],
      }),
    ],
  },
  { type: 'heading', level: 3, content: [t('Rollout')] },
  p(t('Steps 1 and 2 shipped last week.')),
  {
    type: 'list',
    ordered: true,
    start: 3,
    items: [
      listItem(p(t('Turn the schedule on for internal endpoints.'))),
      listItem(p(t('Watch the duplicate rate for a day.'))),
    ],
  },
)

const QUOTE = richText(
  {
    type: 'blockquote',
    content: [
      p(t('Deliveries are retried up to five times.')),
      p(t('Every attempt carries the original key.')),
    ],
  },
  p(t('That is the whole contract, and the tests hold it.')),
)

const CODE = richText(
  p(t('Add the header to every request:')),
  {
    type: 'codeBlock',
    language: 'ts',
    text: "const response = await fetch(url, {\n  method: 'POST',\n  headers: { 'Idempotency-Key': key },\n  body,\n})",
  },
  p(t('The key is honoured for 24 hours.')),
)

const ENTITIES = richText(
  p(
    { type: 'entity', kind: 'user', id: 'u_ada', label: '@Ada Lovelace' },
    t(' can you review the fix for '),
    { type: 'entity', kind: 'issue', id: 'i_142', label: '#142' },
    t(' before Friday?'),
  ),
)

/** Two nodes of types this version does not know, as a later version may write them. */
const LATER = js(
  `${JSON.stringify({
    format: FORMAT,
    blocks: [
      {
        type: 'callout',
        tone: 'warning',
        content: [t('Deliveries pause while the migration runs.')],
      },
      p(
        t('The migration starts on '),
        { type: 'date', value: '2026-12-04', label: 'Friday 4 December' },
        t('.'),
      ),
    ],
  })} as never`,
)

const EMPTY = richText()

const ANNOTATED = richText(
  p(
    t('The retry policy '),
    t('doubles the wait', thread('thread-1')),
    t(' after each failure, '),
    t('up to five times', thread('thread-2')),
    t('.'),
  ),
)

const OVERLAPPING = richText(
  p(
    t('Each retry waits '),
    t('twice ', thread('thread-1')),
    t('as long', { type: 'bold' }, thread('thread-1'), thread('thread-2')),
    t(' as the last one', thread('thread-1')),
    t(', up to five times.'),
  ),
)

const ANNOTATED_ENTITY = richText(
  p(
    t('Ask '),
    {
      type: 'entity',
      kind: 'user',
      id: 'u_ada',
      label: '@Ada Lovelace',
      marks: [thread('thread-3')],
    },
    t(' to review the fix', thread('thread-3')),
    t(' before Friday.'),
  ),
)

const ANNOTATED_HEADING = richText(
  { type: 'heading', level: 1, content: [t('Webhook '), t('retries', thread('thread-4'))] },
  p(t('A failed delivery is retried on a schedule.')),
)

/* -------------------------------------------------------------------------- */
/* The parts                                                                  */
/* -------------------------------------------------------------------------- */

/** A drawn inline's children, through the inline part, which draws itself. */
const inlines = (of: Expr): Node => member('RichTextContentInlines', { inlines: of })

/** Blocks, through the block part, which draws itself for a quote's blocks. */
const blocks = (of: Expr): Node => member('RichTextContentBlocks', { blocks: of })

/** A list's item, through the item part, which is the `li` and draws its blocks. */
const item = (of: Expr): Node => member('RichTextContentItem', { blocks: of })

/** An element that carries where its content is in the plain text, while the member maps selections. */
const positioned = (atom: Expr, children: readonly Node[], code = 'false'): Node =>
  el('span', { spread: [`richTextPositionAttrs(node.at, ${atom}, ${code})`] }, children)

/** A Link, handed the app's router while the app listens for `navigate` (`link.md`). */
const link = (routes: boolean): Node =>
  member(
    'Link',
    { href: 'node.href', external: 'node.external' },
    {
      ...(routes
        ? { on: { navigate: run('(owner.navigate as (href: string) => void)($event)') } }
        : {}),
      slots: { default: [text('node.text')] },
    },
  )

/**
 * The inline part: each drawn inline of a paragraph or a heading
 * (`RichTextDrawnInline`), as the element or member that draws its kind. A
 * wrapper (emphasis, a highlight, a positioned piece, the member's own code)
 * holds inlines of its own, which it draws through itself.
 */
const inlinePart = {
  name: 'Inlines',
  public: false,
  purpose: 'a paragraph’s or a heading’s drawn inlines, each as the element or member of its kind',
  props: { inlines: { type: 'RichTextDrawnInline[]' } },
  template: each(
    'inlines',
    'node',
    'index',
    [
      cond(
        "node.kind === 'text'",
        [text('node.text')],
        "node.kind === 'strong'",
        [el('strong', {}, [inlines('node.children')])],
        "node.kind === 'em'",
        [el('em', {}, [inlines('node.children')])],
        "node.kind === 's'",
        [el('s', {}, [inlines('node.children')])],
        "node.kind === 'mark'",
        [
          // A highlight; with a press, each annotation's first fragment is its tab stop.
          el(
            'mark',
            {
              part: 'highlight',
              class: ['annotation', { name: 'pressable', when: 'owner.pressable' }],
              attrs: {
                'data-annotation-id': 'node.id',
                'data-active': flag('node.active'),
                role: when('node.stop', lit('button')),
                tabindex: when('node.stop', lit('0')),
                'aria-current': when('node.stop && node.active', lit('true')),
              },
            },
            [inlines('node.children')],
          ),
        ],
        "node.kind === 'code'",
        [member('Code', {}, { slots: { default: [text('node.text')] } })],
        "node.kind === 'ownCode'",
        // Code takes a string, so a run with a highlight is Code's element and class, drawn here.
        [el('code', { class: ['code'] }, [inlines('node.children')])],
        "node.kind === 'link' && owner.routes",
        [link(true)],
        "node.kind === 'link'",
        [link(false)],
        "node.kind === 'break'",
        [el('br', { spread: ['richTextPositionAttrs(node.at, true)'] })],
        "node.kind === 'entity' && node.app",
        // The parts read what the member hands them untyped, so the call says what it returns.
        [render('(owner.entityNode as (entity: RichTextEntity) => never)(node.entity)')],
        "node.kind === 'entity'",
        [
          // The element and attributes the editor draws for an entity, so one recipe class
          // looks the same in both.
          el(
            'span',
            {
              class: ['entity'],
              attrs: {
                'data-entity-kind': 'node.entity.kind',
                'data-entity-id': 'node.entity.id',
              },
            },
            [text('node.entity.label')],
          ),
        ],
        "node.kind === 'piece'",
        [positioned('node.atom', [inlines('node.children')])],
      ),
    ],
    'index',
  ),
}

/** The member's own heading at one level, as Heading's element and class, for its highlights and positions. */
const ownHeading = (tag: 'h2' | 'h3' | 'h4'): Node =>
  el(tag, { class: ['heading'], attrs: { 'data-level': 'String(block.level)' } }, [
    inlines('block.inlines'),
  ])

/** CodeBlock, copyable when it holds text, named by its language. */
const codeBlock: Node = member(
  'CodeBlock',
  { copyable: 'block.copyable', label: 'block.language' },
  { slots: { default: [text('block.text')] } },
)

/**
 * One drawn block (`RichTextDrawnBlock`, as `block`), as the member that draws
 * its kind. A list's items are the item part, and a quote's blocks the block
 * part, each of which draws its blocks through this again.
 */
const blockNode: Node = cond(
  "block.kind === 'paragraph'",
  [member('Text', { size: 'owner.size' }, { slots: { default: [inlines('block.inlines')] } })],
  "block.kind === 'heading'",
  [member('Heading', { level: 'block.level' }, { slots: { default: [text('block.text')] } })],
  "block.kind === 'ownHeading' && block.level === 4",
  [ownHeading('h4')],
  "block.kind === 'ownHeading' && block.level === 3",
  [ownHeading('h3')],
  "block.kind === 'ownHeading'",
  [ownHeading('h2')],
  "block.kind === 'list' && block.ordered",
  [
    el('ol', { part: 'list', class: ['list'], attrs: { start: 'block.start' } }, [
      each('block.items', 'entry', 'position', [item('entry')], 'position'),
    ]),
  ],
  "block.kind === 'list'",
  [
    el('ul', { part: 'list', class: ['list'] }, [
      each('block.items', 'entry', 'position', [item('entry')], 'position'),
    ]),
  ],
  "block.kind === 'quote'",
  [el('blockquote', { part: 'quote', class: ['quote'] }, [blocks('block.blocks')])],
  "block.kind === 'codeBlock' && block.at === null",
  [codeBlock],
  "block.kind === 'codeBlock'",
  // A code block whose code is its stored text, while the member maps selections.
  [el('div', { spread: ['richTextPositionAttrs(block.at, true, true)'] }, [codeBlock])],
  "block.kind === 'later' && block.at === null",
  [member('Text', { size: 'owner.size' }, { slots: { default: [text('block.text')] } })],
  "block.kind === 'later'",
  [
    member(
      'Text',
      { size: 'owner.size' },
      {
        slots: {
          default: [
            el('span', { spread: ['richTextPositionAttrs(block.at, true)'] }, [text('block.text')]),
          ],
        },
      },
    ),
  ],
)

/** The block part: a document's drawn blocks, and a quote's. */
const blockPart = {
  name: 'Blocks',
  public: false,
  purpose: 'a document’s drawn blocks, each as the member that draws its kind',
  props: { blocks: { type: 'RichTextDrawnBlock[]' } },
  template: each('blocks', 'block', 'index', [blockNode], 'index'),
}

/**
 * The item part: a list's item, the `li` itself, holding its drawn blocks, so
 * the list's recipe reads the item's blocks as its own children.
 */
const itemPart = {
  name: 'Item',
  public: false,
  purpose: 'a list’s item and its drawn blocks',
  props: { blocks: { type: 'RichTextDrawnBlock[]' } },
  template: el('li', { part: 'item', class: ['item'] }, [
    each('blocks', 'block', 'index', [blockNode], 'index'),
  ]),
}

/* -------------------------------------------------------------------------- */
/* The selection bar                                                          */
/* -------------------------------------------------------------------------- */

/** The bar's handlers: the toolbar's keys and its tab stop, and whether focus is in it. */
const barHandlers: Record<string, Handler> = {
  keydown: run('toolbarKeydown($event.currentTarget as HTMLElement, $event, barStops, leaveBar)'),
  focusin: run(
    '(toolbarFocusIn($event.currentTarget as HTMLElement, $event, barStops), (barFocus = true))',
  ),
  focusout: run(
    '(toolbarFocusOut($event.currentTarget as HTMLElement, $event, barStops), barLeave($event))',
  ),
  mousedown: run('toolbarPress($event.currentTarget as HTMLElement, $event)'),
}

/**
 * RichTextContent (`design/components/rich-text-content.md`): a stored
 * rich-text document drawn through the vocabulary. What each node is drawn as
 * is the engine's (`richTextDrawing`), which the React member draws from too:
 * the member for each block, the emphasis around each run, the highlights
 * nested as the editor nests them and each annotation's tab stop, the Links,
 * the headings and code runs the member draws itself, and the positions in
 * the plain text while the member maps a reader's selection. The parts draw
 * that tree, and draw themselves for what it nests.
 *
 * The app's `entity` draws an entity where it draws anything for it, and the
 * token draws it otherwise (`slotDraws`), as a React render prop that returns
 * `undefined` leaves it to the token. A reader's selection is read with the
 * engine's `mapRichTextSelection`, and the selection bar is RichTextInput's.
 */
export default describeMember({
  member: 'RichTextContent',
  dir: 'structure',
  recipe: 'structure/rich-text-content',
  recipes: { selectionBar: 'controls/selection-bar' },
  types: {
    RichTextContentSize: "NonNullable<RichTextContentProps['size']>",
    RichTextContentSelection: '{ range: RichTextRange; text: string }',
    RichTextContentMessages: '{ selectionBar?: string; selectionBarReady?: string }',
  },
  defaults: { size: lit('md') },
  state: {
    // The reader's selection now, and the last one there was, which the bar keeps while focus is
    // in it and while it leaves.
    selected:
      '{ now: null as { range: RichTextRange; text: string; key: string } | null, last: null as { range: RichTextRange; text: string; key: string } | null }',
    // A pointer selection shows the bar when the press ends, not while it is dragged.
    selecting: 'false',
    // The selection Escape hid the bar for.
    dismissed: 'null as string | null',
    barFocus: 'false',
    // The status region's words, each with a number of its own so the same words are heard again.
    said: "{ text: '', at: 0 }",
    // Whether the bar's first appearance has been said.
    barHeard: 'false',
  },
  derived: {
    // What the member holds outside the framework's reactivity: the page's range of the last
    // selection, which places the bar while the selection is held; where focus was before it
    // entered the bar; and whether the selection goes back on the page once focus has left the bar.
    held: '{ range: null as Range | null, cameFrom: null as HTMLElement | null, restoring: false }',
    say: "({ selectionBar: messages?.selectionBar ?? 'Selection', selectionBarReady: messages?.selectionBarReady ?? 'Controls for the selection are available: Alt+F10' })",
    pressable: 'listening.annotationSelect',
    routes: 'listening.navigate',
    navigate: "(href: string) => emit('navigate', href)",
    entityNode: '(drawn: RichTextEntity) => slotNode(slots.entity, drawn)',
    mapped: '!!slots.selectionActions',
    // The app draws an entity where its `entity` draws anything for it; the token draws the rest.
    appDraws: '(drawn: RichTextEntity) => slotDraws(slots.entity, drawn)',
    drawing:
      'richTextDrawing(value, { headingLevel, annotations, activeAnnotation, pressable, positions: mapped, appDraws })',
    drawn: '(id: string) => annotations === undefined || annotations.includes(id)',
    offering: 'mapped && !drawing.empty',
    // A changed document holds other words at the selection's positions, so the selection and
    // the bar end with it.
    docKey: "offering ? serializeRichText(drawing.value) : ''",
    shown: 'selected.now ?? (barFocus ? selected.last : null)',
    barOpen: 'offering && shown !== null && !selecting && dismissed !== shown.key',
    content: 'selected.now ?? selected.last',
    announce: '(words: string) => { said = { text: words, at: said.at + 1 } }',

    // The selection, mapped to the document's plain text as it changes.
    outside:
      '(node: Node): Element | null => [bar, status].find((part) => part?.contains(node) === true) ?? null',
    updateSelection: `() => {
      const found = root ? mapRichTextSelection(root, outside, drawing.value) : null
      if (found !== null) held.range = found.dom
      // A dismissal holds for one selection: once it collapses, the next one brings the bar back.
      else dismissed = null
      if (found === null) {
        if (selected.now !== null) selected = { now: null, last: selected.last }
        return
      }
      if (selected.now?.key === found.key && selected.now.text === found.text) return
      const mapping = { range: found.range, text: found.text, key: found.key }
      selected = { now: mapping, last: mapping }
    }`,
    followSelection: `(element: HTMLElement) => {
      const page = element.ownerDocument
      const update = () => updateSelection()
      page.addEventListener('selectionchange', update)
      return () => page.removeEventListener('selectionchange', update)
    }`,
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
    // While the bar is drawn, Escape on the page hides it for this selection and Alt+F10 moves
    // focus into it, heard on the window before a dialog's layer hears Escape, and only while
    // focus is in the member or on no element, where the key is the reader's.
    holdKeys: `(element: HTMLElement) => {
      const view = element.ownerDocument.defaultView
      const keys = (event: KeyboardEvent) => {
        const target = event.target
        if (event.isComposing || !(target instanceof Node)) return
        if (bar?.contains(target) === true) return
        const page = element.ownerDocument
        if (target !== page.body && target !== page.documentElement && !element.contains(target)) return
        if (event.key === 'Escape') {
          event.preventDefault()
          if (shown !== null) dismissed = shown.key
        } else if (event.key === 'F10' && event.altKey) {
          event.preventDefault()
          enterToolbar(bar, barStops)
        }
      }
      view?.addEventListener('keydown', keys, true)
      return () => view?.removeEventListener('keydown', keys, true)
    }`,
    // Puts the held selection back on the page when it was lost.
    restoreSelection: `() => {
      const range = held.range
      const selection = root?.ownerDocument.getSelection()
      if (range === null || selection === null || selection === undefined || !selection.isCollapsed) return
      selection.removeAllRanges()
      selection.addRange(range)
    }`,
    // Escape in the bar: the bar leaves for this selection, and the selection is put back if it was
    // lost. Some engines drop a selection while a control has focus, so it is put back again once
    // focus has left the bar.
    leaveBar: `() => {
      if (shown !== null) dismissed = shown.key
      held.restoring = true
      restoreSelection()
    }`,
    // The bar leaves with focus in it: focus goes back where it was before it entered the bar, or
    // to no element.
    giveFocusBack: `() => {
      const to = held.cameFrom
      held.cameFrom = null
      const active = bar?.ownerDocument.activeElement
      if (to !== null && to.isConnected && bar?.contains(to) !== true) to.focus({ preventScroll: true })
      else if (active instanceof HTMLElement && bar?.contains(active) === true) active.blur()
      if (held.restoring) restoreSelection()
      held.restoring = false
    }`,
    barLeave: `(event: FocusEvent) => {
      const to = event.relatedTarget
      if (to instanceof Node && (event.currentTarget as HTMLElement).contains(to)) return
      barFocus = false
      // A leaving bar is inert, and a browser that moves focus off it does so here.
      if (bar?.inert === true) giveFocusBack()
    }`,
    cameFrom: `(event: FocusEvent) => {
      const from = event.relatedTarget
      if (from instanceof HTMLElement && bar?.contains(from) === true) return
      held.cameFrom = from instanceof HTMLElement ? from : null
    }`,
    // The document changed under a selection: the selection collapses, so the page shows none of
    // the words the old positions named.
    documentChanged: `() => {
      selected = { now: null, last: null }
      held.range = null
      const selection = root?.ownerDocument.getSelection()
      if (root === null || root === undefined || selection === null || selection === undefined) return
      if (selection.rangeCount === 0 || selection.isCollapsed) return
      const range = selection.getRangeAt(0)
      if (root.contains(range.startContainer) || root.contains(range.endContainer)) selection.collapseToEnd()
    }`,
    // The box of the selection, or of the held one while focus is in the bar.
    measure: `() => {
      const selection = root?.ownerDocument.getSelection()
      if (root && selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)
        if (!range.collapsed && root.contains(range.commonAncestorContainer)) return richTextSelectionBox(range)
      }
      return held.range === null ? null : richTextSelectionBox(held.range)
    }`,
    placeBar: '() => placeSelectionBar(bar, measure())',
    barStops: 'toolbarStop()',
    holdEscapeIn: `(element: HTMLElement) => {
      const view = element.ownerDocument.defaultView
      return view === null ? () => {} : holdToolbarEscape(view, () => bar)
    }`,

    // A press on a highlight, and Enter and Space on its tab stop.
    pressed: `(event: MouseEvent) => {
      const id = richTextPressedAnnotation(event.currentTarget as Element, event.target, event.detail, bar)
      if (id !== null) emit('annotationSelect', id)
    }`,
    keyed: `(event: KeyboardEvent, phase: 'down' | 'up') => {
      const id = richTextKeyedAnnotation(event, phase)
      if (id !== null) emit('annotationSelect', id)
    }`,
    pressDown: `(event: PointerEvent) => {
      if (!(event.target instanceof Node) || bar?.contains(event.target) !== true) selecting = true
    }`,
  },
  // What the parts read: the prose step, whether highlights take a press, the app's router, and
  // the app's drawing of an entity.
  provide: {
    size: 'size',
    pressable: 'pressable',
    routes: 'routes',
    navigate: 'navigate',
    entityNode: 'entityNode',
  },
  presence: {
    // The bar fades out through its recipe's closed state, and takes no focus and no press then.
    barPresent: { open: 'barOpen', ref: 'bar' },
  },
  effects: [
    {
      watch: 'offering',
      run: 'offering && root ? followSelection(root) : () => {}',
      release: 'ran()',
    },
    {
      watch: 'selecting',
      run: 'selecting && root ? releaseSelecting(root) : () => {}',
      release: 'ran()',
    },
    { watch: 'barOpen', run: 'barOpen && root ? holdKeys(root) : () => {}', release: 'ran()' },
    { watch: 'docKey', mount: false, run: 'documentChanged()' },
    // Where the browser leaves focus on the leaving bar, the member moves it.
    {
      watch: 'barOpen',
      mount: false,
      run: '!barOpen && bar?.contains(bar.ownerDocument.activeElement) === true && giveFocusBack()',
    },
    // The first time a bar appears, the status says so.
    {
      watch: 'barOpen',
      run: 'barOpen && !barHeard && ((barHeard = true), announce(say.selectionBarReady))',
    },
    // The bar's tab stop, written again when its controls change or are disabled.
    {
      watch: 'barPresent',
      run: 'syncToolbarStop(bar, barStops)',
      mutation: ['bar'],
      attributes: ['disabled', 'aria-disabled', 'hidden', 'inert'],
    },
    {
      watch: 'barPresent',
      run: 'barPresent && bar ? holdEscapeIn(bar) : () => {}',
      release: 'ran()',
    },
    // The bar at the selection, as the selection changes, and as the page scrolls and the window
    // resizes under it.
    { watch: '[barOpen, selected]', run: 'barOpen && placeBar()' },
    {
      watch: 'barOpen',
      run: 'barOpen && bar ? followSelectionBar(bar, placeBar) : () => {}',
      release: 'ran()',
    },
  ],
  // The spec's `agent` fence. An agent reads the drawn annotations, each by its id and labelled
  // with its words, and selects one as a person's press does, on its tab stop; one a person cannot
  // press is listed as disabled. Without `annotationSelect` the member registers nothing.
  agent: {
    on: 'root',
    unless: '!listening.annotationSelect',
    state: {
      annotations:
        'richTextAnnotations(drawing.value).filter((annotation) => drawn(annotation.id)).map((annotation) => ({ id: annotation.id, label: annotation.text, ...(drawing.stops.includes(annotation.id) ? {} : { disabled: true }) }))',
      active:
        'richTextAnnotations(drawing.value).some((annotation) => drawn(annotation.id) && annotation.id === activeAnnotation) ? (activeAnnotation ?? null) : null',
    },
    actions: {
      select: {
        argument: 'id',
        run: `(() => {
          const stop = Array.from(root?.querySelectorAll(RICH_TEXT_STOP) ?? []).find((element) => element.getAttribute('data-annotation-id') === value)
          if (stop === undefined) throw new Error('That annotation has no highlight to press.')
          agentPress(stop)
        })()`,
      },
    },
  },
  template: el(
    'div',
    {
      part: 'root',
      ref: 'root',
      class: ['root'],
      attrs: {
        'data-size': 'size',
        'data-empty': flag('drawing.empty'),
        ...identity('RichTextContent'),
      },
      on: {
        click: run('pressed($event)', 'pressable'),
        keydown: run("keyed($event, 'down')", 'pressable'),
        keyup: run("keyed($event, 'up')", 'pressable'),
        pointerdown: run('pressDown($event)', 'offering'),
      },
    },
    [
      cond('!drawing.empty', [blocks('drawing.blocks')]),
      cond('offering && barPresent', [
        // The selection bar, RichTextInput's, at the selected words, with the app's controls.
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
            on: barHandlers,
          },
          [
            el(
              'div',
              { part: 'actions', class: ['actions'], on: { focusin: run('cameFrom($event)') } },
              [
                cond('content !== null', [
                  slot('selectionActions', {
                    props: { range: 'content.range', text: 'content.text' },
                  }),
                ]),
              ],
            ),
          ],
        ),
      ]),
      cond('offering', [
        el(
          'div',
          {
            part: 'status',
            ref: 'status',
            class: ['status'],
            attrs: { role: lit('status'), 'aria-live': lit('polite') },
          },
          [
            cond("said.text !== ''", [
              el('span', { attrs: { key: 'said.at' } }, [text('said.text')]),
            ]),
          ],
        ),
      ]),
    ],
  ),
  parts: [blockPart, itemPart, inlinePart],
  states: [
    {
      name: 'prose — every mark, a hard break and a link',
      props: { value: PROSE },
      expect: { 'data-size': 'md', 'data-empty': null },
    },
    {
      name: 'structure — headings at three levels, a nested list and a list from 3',
      props: { value: STRUCTURE },
    },
    { name: 'a quote', props: { value: QUOTE } },
    { name: 'a code block — CodeBlock, copyable, named by its language', props: { value: CODE } },
    { name: 'entities — the entity token', props: { value: ENTITIES } },
    {
      name: 'entities drawn by the app — a person as a Link, an issue left to the token',
      props: {
        value: ENTITIES,
        entity: renders(
          ['entity: { kind: string; id: string; label: string }'],
          fx('Link', { href: js('`/people/${entity.id}`') }, { default: [js('entity.label')] }),
          "entity.kind === 'user'",
        ),
      },
    },
    {
      name: 'sm — the secondary step, for a note beside its subject',
      props: { value: PROSE, size: 'sm' },
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'a later version — an unknown block and inline, drawn as their text',
      props: { value: LATER },
      expect: { 'data-empty': null },
    },
    {
      name: 'empty — the root and nothing in it',
      props: { value: EMPTY },
      expect: { 'data-empty': '' },
    },
    {
      name: 'annotated — two comment threads, one active',
      props: {
        value: ANNOTATED,
        annotations: ['thread-1', 'thread-2'],
        activeAnnotation: 'thread-2',
        onAnnotationSelect: noop,
      },
    },
    {
      name: 'overlapping annotations — a thread inside another, nested as the editor nests them',
      props: { value: OVERLAPPING, activeAnnotation: 'thread-2', onAnnotationSelect: noop },
    },
    {
      name: 'an annotated entity — a mention inside a thread, ringed with its wash',
      props: { value: ANNOTATED_ENTITY },
    },
    {
      name: 'an annotated heading — a thread on a heading’s words, drawn as Heading draws it',
      props: { value: ANNOTATED_HEADING, onAnnotationSelect: noop },
    },
    {
      // Words are selected once the member is drawn, because the bar is drawn at a selection.
      name: 'the selection bar — a comment at the selected words',
      props: {
        value: ANNOTATED,
        selectionActions: renders(
          [],
          fx('Button', {
            variant: 'ghost',
            tone: 'neutral',
            size: 'sm',
            icon: 'comment',
            label: 'Comment',
            onClick: noop,
          }),
        ),
      },
      selects: { in: '[data-member="rich-text-content"]', text: 'doubles the wait' },
    },
  ],
})
