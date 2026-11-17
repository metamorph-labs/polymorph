import {
  cond,
  describeMember,
  each,
  el,
  flag,
  identity,
  js,
  lit,
  member,
  run,
  text,
  when,
  type Expr,
  type FixtureValue,
  type Node,
  type PartShell,
} from '../dsl'

/*
 * The tree keyboard model: the tree view pattern of the ARIA Authoring
 * Practices (`design/components/tree.md`, Keyboard), as the React member's
 * `tree-keyboard.ts` writes it. The tree has one tab stop, and the arrow keys,
 * Home and End move it between the rows that are drawn. A row is an item or a
 * "load more" row. A closed branch draws no rows under it, so every row in the
 * document is one a reader sees.
 *
 * It is written here, in the description's scope, rather than as an engine
 * helper, because it reads and writes the DOM: the rows, the focused element
 * and `tabindex`. The stop is set on the DOM and never rendered, so a held
 * arrow key renders no row again. What a row is comes from the document too:
 * `aria-expanded` says a branch and whether it is open, `aria-disabled` says an
 * item takes no key and no press, `data-tree-item` holds the item's id, and
 * `data-tree-part` names a row's parts. So a handler needs no item passed to
 * it, and the handlers sit on the root.
 */

/** A row: an item, or the row that asks for more of a level. */
const ROW = '[role="treeitem"]'

/** A row the keys reach. A disabled item takes no focus, and the keys pass over it. */
const ENABLED = `${ROW}:not([aria-disabled="true"])`

const MORE = '[data-tree-part="more"]'

/** The root element, which the helpers read through its ref. */
const TREE = 'const tree = root as HTMLElement | null'

/** A level the reader asked for more of, by its branch's id, and the items it held then. */
const ASKED = '{ parent: string | null; count: number }'

/** What every level of one tree draws with, handed down to each node. */
const SHARED = { open: 'open', selected: 'selected', messages: 'messages' }

/**
 * The rows of one level: its items, then one row that says the level is
 * loading or asks for more of it. While a level that has more is loading, the
 * row that asks is the busy row, so the row a reader pressed keeps its focus.
 */
const levelRows = (items: Expr, level: Expr, loading: Expr, hasMore: Expr): Node[] => [
  each(items, 'child', 'child.id', [member('TreeNode', { item: 'child', level, ...SHARED })]),
  cond(
    hasMore,
    [
      el(
        'li',
        {
          part: 'more',
          class: ['item'],
          attrs: {
            role: lit('treeitem'),
            'aria-labelledby': '`${uid}-more`',
            // Never selected, and it says so: ARIA's role model, as Svelte's compiler reads
            // it, asks every treeitem to state its selection.
            'aria-selected': lit('false'),
            'aria-busy': when(loading, 'true'),
            'data-tree-part': lit('more'),
          },
        },
        [
          el(
            'div',
            {
              class: ['row'],
              attrs: { 'data-tree-part': lit('row'), 'data-busy': flag(loading) },
              geometry: { '--pm-tree-level': level },
            },
            [
              el('span', { class: ['slot'] }, [
                cond(loading, [member('Spinner', { size: lit('sm'), label: 'messages.loading' })]),
              ]),
              el('span', { class: ['text'] }, [
                el('span', { class: ['more'], attrs: { id: '`${uid}-more`' } }, [
                  text(`(${loading}) ? messages.loading : messages.loadMore`),
                ]),
              ]),
            ],
          ),
        ],
      ),
    ],
    loading,
    [
      // Not an item: it takes no focus and no key. The Spinner is the status a screen reader
      // hears, so the same words beside it are hidden from it.
      el('li', { part: 'busy', class: ['item'], attrs: { role: lit('none') } }, [
        el(
          'div',
          {
            class: ['row'],
            attrs: { 'data-busy': lit('') },
            geometry: { '--pm-tree-level': level },
          },
          [
            el('span', { class: ['slot'] }, [
              member('Spinner', { size: lit('sm'), label: 'messages.loading' }),
            ]),
            el('span', { class: ['text'] }, [
              el('span', { class: ['status'], attrs: { 'aria-hidden': lit('true') } }, [
                text('messages.loading'),
              ]),
            ]),
          ],
        ),
      ]),
    ],
  ),
]

/**
 * Tree.Node: one item, drawing the rows under it one level deeper when it is
 * an open branch. The root holds the open branches and the selection and hands
 * them down, so a node holds nothing.
 */
const node: PartShell = {
  name: 'Node',
  public: false,
  purpose: 'one item of the tree: its row and, when it is an open branch, the rows under it',
  props: {
    item: { type: 'TreeItem' },
    level: { type: 'number', doc: 'The level it sits at: 0 at the top.' },
    open: { type: 'ReadonlySet<string>', doc: 'The open branches by id.' },
    selected: { type: 'string | null', doc: "The selected item's id." },
    messages: { type: 'TreeMessages' },
  },
  derived: {
    under: 'item.children ?? []',
    branch: 'under.length > 0 || item.hasChildren === true',
    disabled: 'item.disabled === true',
    // A disabled branch is drawn closed: ARIA applies `aria-disabled` to the focusable
    // descendants of an element, and an open branch holds its rows.
    expanded: 'branch && !disabled && open.has(item.id)',
    loading: 'item.loading === true',
    hasMore: 'item.hasMore === true',
    chosen: '!disabled && selected === item.id',
  },
  template: el(
    'li',
    {
      class: ['item'],
      attrs: {
        role: lit('treeitem'),
        // The ids are the node's own, not the item's: an `aria-labelledby` value is a list of
        // ids split at spaces, and an item's id may hold one.
        'aria-labelledby': '`${uid}-label`',
        'aria-describedby': 'item.description === undefined ? undefined : `${uid}-description`',
        'aria-expanded': 'branch ? expanded : undefined',
        // A disabled item cannot be selected, so it says nothing about selection.
        'aria-selected': 'disabled ? undefined : chosen',
        'aria-disabled': when('disabled', 'true'),
        'aria-busy': when('expanded && loading', 'true'),
        'data-tree-item': 'item.id',
        'data-selected': flag('chosen'),
        'data-disabled': flag('disabled'),
      },
    },
    [
      el(
        'div',
        {
          part: 'row',
          class: ['row'],
          attrs: { 'data-tree-part': lit('row') },
          geometry: { '--pm-tree-level': 'level' },
        },
        [
          cond(
            'branch',
            [
              el(
                'span',
                {
                  part: 'toggle',
                  class: ['toggle'],
                  attrs: { 'data-tree-part': lit('toggle'), 'aria-hidden': lit('true') },
                },
                [
                  el('span', { class: ['chevron'] }, [
                    member('Icon', { name: lit('next'), size: lit('sm') }),
                  ]),
                ],
              ),
            ],
            // A leaf keeps the chevron's width, so its label aligns with a branch's.
            [el('span', { class: ['slot'] })],
          ),
          el('span', { class: ['text'] }, [
            el('span', { part: 'label', class: ['label'], attrs: { id: '`${uid}-label`' } }, [
              text('item.label'),
            ]),
            cond('item.description !== undefined', [
              el(
                'span',
                {
                  part: 'description',
                  class: ['description'],
                  attrs: { id: '`${uid}-description`' },
                },
                [text('item.description')],
              ),
            ]),
          ]),
        ],
      ),
      cond('expanded && (under.length > 0 || loading || hasMore)', [
        el(
          'ul',
          { part: 'group', class: ['group'], attrs: { role: lit('group') } },
          levelRows('under', 'level + 1', 'loading', 'hasMore'),
        ),
      ]),
    ],
  ),
}

/* -------------------------------------------------------------------------- */
/* The states fixture                                                          */
/* -------------------------------------------------------------------------- */

type Item = { readonly [key: string]: FixtureValue }

const ENGINEERING: Item[] = [
  { id: 'platform', label: 'Platform', hasChildren: true },
  { id: 'applications', label: 'Applications' },
  { id: 'data', label: 'Data' },
]

/** Three top-level units: a loaded branch, a branch the app has not loaded, and a leaf. */
const units = (engineering: Item = {}, design: Item = {}): Item[] => [
  { id: 'engineering', label: 'Engineering', children: ENGINEERING, ...engineering },
  { id: 'design', label: 'Design', hasChildren: true, ...design },
  { id: 'sales', label: 'Sales', description: 'Three regions' },
]

const DEEP: Item[] = [
  {
    id: 'company',
    label: 'Northwind',
    children: [
      {
        id: 'engineering',
        label: 'Engineering',
        children: [
          {
            id: 'platform',
            label: 'Platform',
            children: [
              { id: 'runtime', label: 'Runtime' },
              { id: 'storage', label: 'Storage' },
            ],
          },
          { id: 'applications', label: 'Applications' },
        ],
      },
      { id: 'sales', label: 'Sales' },
    ],
  },
]

const LONG: Item[] = [
  {
    id: 'programme',
    label: 'Customer support operations for Europe, the Middle East and Africa',
    children: [
      {
        id: 'archive',
        label: 'ticket-export-eu-west-1-production-customer-support-archive',
        description: 'Holds the exports of the last twelve months, one unit for each region',
      },
    ],
  },
]

const LABEL = 'Organization units'

const opened = (...ids: string[]) => js(`new Set(${JSON.stringify(ids)})`)

/**
 * Tree (`design/components/tree.md`): a hierarchy a reader opens level by
 * level and picks one item from. The application loads a level when it is
 * first opened and more of a long level when the reader asks.
 *
 * Opening and selecting are separate acts: a press on the chevron opens or
 * closes a branch, and a press on the rest of the row selects it. The member
 * holds the open branches unless the caller passes `expanded`, as DataTable
 * holds its open rows, and holds the selection unless the caller passes
 * `value`.
 */
export default describeMember({
  member: 'Tree',
  dir: 'structure',
  recipe: 'structure/tree',
  types: {
    TreeItem: `{
      /** Unique in the tree. \`change\`, \`expandedChange\` and \`loadMore\` report it. */
      id: string
      label: string
      /** One supporting line under the label. */
      description?: string
      /** The items under it. An item with one or more is a branch. */
      children?: TreeItem[]
      /**
       * A branch whose items the app loads when it is first opened. With no \`children\` the
       * branch opens onto nothing until the app passes them.
       */
      hasChildren?: boolean
      /** The branch's level is loading. An open branch draws one busy row under itself. */
      loading?: boolean
      /** The branch has more items than \`children\` holds: a last row asks for them. */
      hasMore?: boolean
      /** The item takes no key and no press, the arrow keys pass over it, and a branch stays closed. */
      disabled?: boolean
    }`,
    // The strings the tree says for itself, localized by passing both or neither, so one tree
    // never mixes two languages.
    TreeMessages: `{
      /** What a level says while it loads. */
      loading: string
      /** The row that asks for more of a level. */
      loadMore: string
    }`,
  },
  defaults: {
    loading: 'false',
    hasMore: 'false',
    messages: "() => ({ loading: 'Loading', loadMore: 'Load more' })",
  },
  state: {
    // The open branches while the caller passes no `expanded`: the branches `defaultExpanded`
    // names at first, else every branch closed.
    ownExpanded: 'defaultExpanded ?? new Set<string>()',
    // The selection while the caller passes no `value`.
    ownValue: '(defaultValue ?? null) as string | null',
    // Whether focus has placed the stop. Until then it is the selected item, else the first row.
    placed: 'false',
    // Whether focus is in the tree, or was when the row that had it left the document.
    held: 'false',
    asked: `null as ${ASKED} | null`,
    // The model is moving focus itself, so the move is not the reader's.
    moving: 'false',
  },
  derived: {
    open: 'expanded ?? ownExpanded',
    selected: 'value === undefined ? ownValue : value',
    // The items a reader can see, in the order they are drawn: each item, then the items of the
    // branch under it while that branch is open. A disabled branch is drawn closed.
    shownItems:
      '(() => { const seen: TreeItem[] = []; const walk = (level: readonly TreeItem[]): void => { for (const item of level) { seen.push(item); if (item.disabled !== true && open.has(item.id)) walk(item.children ?? []) } }; walk(items); return seen })()',
    // Refuses an id that names no branch a reader can see: a leaf neither opens nor closes.
    branchOf:
      '(id: string): void => { const item = shownItems.find((candidate) => candidate.id === id); if ((item?.children?.length ?? 0) === 0 && item?.hasChildren !== true) throw new Error(`"${item?.label ?? id}" is not a branch, so it does not open or close.`) }',
    // The rows the keys move among, in the order they are drawn.
    rowsOf: `(tree: HTMLElement): HTMLElement[] => Array.from(tree.querySelectorAll<HTMLElement>('${ENABLED}'))`,
    // The id of the branch a row sits under, or `null` at the top level.
    parentOf: `(row: Element): string | null => row.parentElement?.closest('${ROW}')?.getAttribute('data-tree-item') ?? null`,
    // The list that holds a level's rows: the tree for the top level, else the branch's group.
    levelOf: `(tree: HTMLElement, parent: string | null): Element | null => parent === null ? tree : (Array.from(tree.querySelectorAll('${ROW}')).find((row) => row.getAttribute('data-tree-item') === parent)?.querySelector(':scope > [role="group"]') ?? null)`,
    // A level's items, without the row that asks for more.
    itemsIn: `(list: Element): HTMLElement[] => Array.from(list.children).filter((child): child is HTMLElement => child instanceof HTMLElement && child.matches('${ROW}') && !child.matches('${MORE}'))`,
    // Where the stop is: where focus placed it, while that row is drawn. Else the selected
    // item, else the first row, as the pattern asks of a tree that has not had focus.
    stopOf: `(tree: HTMLElement): HTMLElement | null => { const rows = rowsOf(tree); const now = placed ? rows.find((row) => row.getAttribute('tabindex') === '0') : undefined; return now ?? rows.find((row) => row.getAttribute('aria-selected') === 'true') ?? rows[0] ?? null }`,
    // Exactly one `tabindex="0"` in the tree. Every other row takes focus from a press or a
    // key and is no tab stop, and a disabled item takes none. The attribute is compared
    // before it is written, so a row already in place is left alone.
    rove: `(tree: HTMLElement, stop: HTMLElement | null) => { for (const row of Array.from(tree.querySelectorAll<HTMLElement>('${ROW}'))) { if (row !== stop && row.getAttribute('aria-disabled') === 'true') { row.removeAttribute('tabindex'); continue } const wanted = row === stop ? '0' : '-1'; if (row.getAttribute('tabindex') !== wanted) row.setAttribute('tabindex', wanted) } }`,
    // Runs when the rows change. It keeps one tab stop. It also keeps focus in the tree when
    // the row that had it leaves the document, where a browser would hand focus to the page:
    // focus goes to the first new row when the reader asked for more of a level and the rows
    // have arrived, and to the stop otherwise. A reader who moved after asking is left alone,
    // because that move forgot the request.
    settle: `() => { ${TREE}; if (tree === null) return; const lost = held && !tree.contains(document.activeElement); const request = asked; let to: HTMLElement | null = null; if (request !== null) { const list = levelOf(tree, request.parent); const found = list === null ? [] : itemsIn(list); if (list === null) asked = null; else if (found.length > request.count) { if (held) to = found.slice(request.count).find((row) => row.matches('${ENABLED}')) ?? stopOf(tree); asked = null } } if (to === null && lost) to = stopOf(tree); if (to === null) { rove(tree, stopOf(tree)); return } rove(tree, to); moving = true; to.focus(); moving = false }`,
    // Asks for more of the level a "load more" row closes, unless the level is loading.
    ask: `(row: HTMLElement) => { const list = row.parentElement; if (list === null || row.getAttribute('aria-busy') === 'true') return; const parent = parentOf(row); asked = { parent, count: itemsIn(list).length }; emit('loadMore', parent) }`,
    // The member's own set follows every toggle, so it is current if the caller stops
    // passing `expanded`. The caller hears the next set in both cases.
    toggle:
      "(id: string) => { const next = new Set(open); if (next.has(id)) next.delete(id); else next.add(id); ownExpanded = next; emit('expandedChange', next) }",
    // A reader picks an item and cannot clear the pick, so selecting the selected item again
    // reports nothing.
    choose: "(id: string) => { if (id === selected) return; ownValue = id; emit('change', id) }",
    // Focus says where the stop is, so a press and a key end in the same state.
    focusIn: `(event: FocusEvent) => { ${TREE}; const row = event.target instanceof Element ? event.target.closest<HTMLElement>('${ROW}') : null; if (tree === null || row === null) return; held = true; placed = true; const request = asked; if (!moving && !(request !== null && row.matches('${MORE}') && parentOf(row) === request.parent)) asked = null; rove(tree, row) }`,
    // A browser may report a blur for a row as it leaves the document. That row is gone a
    // moment later, and the tree still holds focus for it. A row that is still drawn lost
    // focus to something else.
    focusOut: `(event: FocusEvent) => { ${TREE}; const row = event.target; queueMicrotask(() => { if (tree === null || !(row instanceof Element) || !row.isConnected) return; if (!tree.contains(document.activeElement)) held = false }) }`,
    // The arrows are physical, so which one points into a branch follows the writing
    // direction. The tree takes its keys even at an edge, so a held ArrowDown on the last row
    // stays there instead of scrolling the page. A key with Alt, Control or Meta is the
    // browser's or the application's.
    keyDown: `(event: KeyboardEvent) => { ${TREE}; const here = event.target instanceof Element ? event.target.closest<HTMLElement>('${ROW}') : null; if (tree === null || here === null || event.altKey || event.ctrlKey || event.metaKey) return; const rows = rowsOf(tree); const at = rows.indexOf(here); const rtl = getComputedStyle(tree).direction === 'rtl'; const inward = rtl ? 'ArrowLeft' : 'ArrowRight'; const outward = rtl ? 'ArrowRight' : 'ArrowLeft'; const id = here.matches('${ENABLED}') ? here.getAttribute('data-tree-item') : null; const state = here.getAttribute('aria-expanded'); let to: HTMLElement | null | undefined = null; switch (event.key) { case 'ArrowDown': to = rows[at + 1]; break; case 'ArrowUp': to = at > 0 ? rows[at - 1] : null; break; case 'Home': to = rows[0]; break; case 'End': to = rows[rows.length - 1]; break; case inward: if (id !== null && state === 'false') toggle(id); else if (state === 'true') to = here.querySelector<HTMLElement>(':scope > [role="group"] > ${ENABLED}'); break; case outward: if (id !== null && state === 'true') toggle(id); else to = here.parentElement?.closest<HTMLElement>('${ENABLED}'); break; case 'Enter': case ' ': if (here.matches('${MORE}')) ask(here); else if (id !== null) choose(id); break; default: return } event.preventDefault(); if (to === null || to === undefined) return; rove(tree, to); to.focus() }`,
    // A press on the chevron opens or closes and selects nothing. A press on the rest of a
    // row selects and opens nothing.
    press: `(event: MouseEvent) => { const target = event.target instanceof Element ? event.target : null; const row = target?.closest('[data-tree-part="row"]')?.parentElement ?? null; if (target === null || row === null || !row.matches('${ENABLED}')) return; const id = row.getAttribute('data-tree-item'); if (row.matches('${MORE}')) ask(row); else if (id === null) return; else if (target.closest('[data-tree-part="toggle"]') !== null) toggle(id); else choose(id) }`,
  },
  // The spec's `agent` fence. The choices are the items a reader can see, so an agent opens a
  // branch before it selects what the branch holds, as a person does. An action goes through the
  // member's own `choose` and `toggle`, as a press does.
  agent: {
    on: 'root',
    state: {
      value: 'selected ?? null',
      expanded: '[...open]',
      items:
        'shownItems.map((item) => ({ id: item.id, label: item.label, ...(item.disabled === true ? { disabled: true } : {}) }))',
      loading: 'loading',
    },
    actions: {
      choose: { argument: 'id', run: 'choose(value)' },
      expand: { argument: 'id', run: '(branchOf(value), open.has(value) || toggle(value))' },
      collapse: { argument: 'id', run: '(branchOf(value), open.has(value) && toggle(value))' },
    },
  },
  effects: [
    // After mount, when rows are added or removed, and when an item is selected or disabled,
    // which moves the stop.
    { run: 'settle()', mutation: ['root'], attributes: ['aria-selected', 'aria-disabled'] },
  ],
  template: el(
    'ul',
    {
      ref: 'root',
      class: ['root'],
      attrs: {
        role: lit('tree'),
        'aria-label': 'label',
        'aria-busy': when('loading', 'true'),
        ...identity('Tree'),
      },
      on: {
        focusin: run('focusIn($event)'),
        focusout: run('focusOut($event)'),
        keydown: run('keyDown($event)'),
        click: run('press($event)'),
      },
    },
    levelRows('items', '0', 'loading', 'hasMore'),
  ),
  parts: [node],
  states: [
    {
      name: 'a small tree — one branch open',
      props: { label: LABEL, items: units(), defaultExpanded: opened('engineering') },
      expect: { 'aria-label': LABEL },
    },
    { name: 'nothing open', props: { label: LABEL, items: units() } },
    {
      name: 'a selected item',
      props: {
        label: LABEL,
        items: units(),
        defaultExpanded: opened('engineering'),
        defaultValue: 'applications',
      },
    },
    {
      name: 'a branch that is loading',
      props: {
        label: LABEL,
        items: units({}, { loading: true }),
        defaultExpanded: opened('design'),
      },
    },
    {
      name: 'a level with more to load',
      props: {
        label: LABEL,
        items: units({ hasMore: true }),
        defaultExpanded: opened('engineering'),
        hasMore: true,
      },
    },
    {
      name: 'more of a level loading — the row that asks is busy',
      props: {
        label: LABEL,
        items: units({ hasMore: true, loading: true }),
        defaultExpanded: opened('engineering'),
      },
    },
    {
      name: 'a disabled item',
      props: {
        label: LABEL,
        items: units({}, { disabled: true }),
        defaultExpanded: opened('engineering'),
      },
    },
    {
      name: 'a deep tree — four levels',
      props: {
        label: LABEL,
        items: DEEP,
        defaultExpanded: opened('company', 'engineering', 'platform'),
      },
    },
    {
      name: 'long labels at a narrow width',
      many: {
        within: { element: 'div', class: ['harness'] },
        each: [{ props: { label: LABEL, items: LONG, defaultExpanded: opened('programme') } }],
      },
    },
  ],
})
