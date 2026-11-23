/**
 * The shell description: one member, described once, without a framework in it.
 *
 * A member's React source is one rendering of its spec. A second framework's
 * vocabulary written by hand would be a second rendering that drifts from the
 * first. So each member is described here once, as data: its anatomy (a tree
 * of elements, slots and other members), the values it derives from its props,
 * the state machine that gives it behaviour, and its states fixture. A
 * generator renders the description into each framework's shell (`vue.ts`
 * writes Vue single-file components). The props, events and slots are not
 * described: they come from the registry, which reads them from the React
 * vocabulary, so every framework's member takes the same props.
 *
 * Expressions (`Expr`) are strings in the subset of JavaScript that every
 * target framework's templates accept: identifiers, member access, calls,
 * operators, literals, arrow functions and template strings. Their scope is
 *
 *  - every prop, by its camelCase name (`ariaLabel` for `aria-label`);
 *  - every `derived` value and every `state` value, by its name;
 *  - `api`, the machine's connected API, when the member binds a machine, and
 *    `zag`, the machine's module (`zag.collection(…)`);
 *  - `slots.<name>`, true when the caller filled the slot;
 *  - `uid`, an id unique to the instance (for `aria-*` references between parts);
 *  - `listening.<event>`, true when the caller handles the member's event;
 *  - `slotted(slots.<name>)`, what the caller put in a slot: its `count`, the
 *    first element's `kind` (its component's `controlKind`) and `props`;
 *  - `slotText(slots.<name>)`, the text the caller put in a slot (CodeBlock
 *    copies its code, and StreamingText's empty text marks a pending stream);
 *  - `slotNode(slots.<name>)`, what the caller put in a slot as a node another
 *    component draws with `render` (a declared Toast hands its `content` to
 *    the toast store, and the viewport draws it);
 *  - `lent`, the identity a composing member lends (`MemberShell.lends`);
 *  - `borrowed`, in a member that lends its identity, the holder the member
 *    it lends to fills in (`borrowed.element?.()` is that member's element),
 *    and `lender`, that holder in the member lent to, or `undefined` outside
 *    one (Dialog writes `lender.element = () => panel`);
 *  - `invoke('<event>', …args)`, which calls the caller's handlers for an
 *    event, as `emit` does, and returns what they return (ConfirmDialog waits
 *    on an `onConfirm` that returns a promise);
 *  - the foundation's helpers (`fitTextarea`), which include the engine's
 *    framework-free conventions (`spacingAttrs`, `paginationWindow`);
 *  - loop variables, and `$event` inside a handler.
 *
 * A generator rewrites the scope into its framework's spelling (`props.label`
 * in a Vue script, `label` in its template), so an expression never names a
 * framework.
 *
 * The description is small on purpose. A member whose behaviour needs more
 * than this vocabulary is not described: its framework map entry stays
 * `absent`, with the reason naming what the description would need.
 */

import { gallerySlug } from '@polymorph/engine'

/** A JavaScript expression over the member's scope. */
export type Expr = string

/** A recipe class name, from the member's recipe (`styles.<name>`) or a named extra recipe. */
export type ClassName = string | { name: string; when: Expr }

/** What runs when an event fires. */
export type Handler =
  /** Emits the member's event with these arguments (`$event` is the DOM event), unless `when` is false. */
  | { emit: string; args?: readonly Expr[]; when?: Expr }
  /** Runs a statement: a machine call (`api.toggleChecked()`), or an assignment to a `state` value. */
  | { run: Expr; when?: Expr }

/** An element of the anatomy. */
export interface ElementNode {
  kind: 'element'
  /** A tag name, or `{ expr }` for a tag chosen by a prop (`as`). */
  tag: string | { expr: Expr }
  /** The anatomy's name for the part, written as a comment beside the element. */
  part?: string
  /** Classes from the recipe, in order. */
  class?: readonly ClassName[]
  /**
   * Attribute objects spread onto the element, in order, before `attrs`: a
   * machine's prop getters, or a convention's attributes (`spacingAttrs`).
   */
  spread?: readonly Expr[]
  /** Attributes, by their DOM name. `undefined` and `null` leave an attribute out. */
  attrs?: Readonly<Record<string, Expr>>
  on?: Readonly<Record<string, Handler>>
  /**
   * Inline style carrying data, never a decision: a ratio or a position the
   * member computes from a prop (Progress's fill `scaleX`), which no token can
   * hold. Values are expressions; the token-only law refuses a literal colour
   * or length in one.
   */
  geometry?: Readonly<Record<string, Expr>>
  /** Names the element: a `refs` entry, or the presence it animates. */
  ref?: string
  children?: readonly Node[]
}

/** Another member, composed. */
export interface MemberNode {
  kind: 'member'
  name: string
  props?: Readonly<Record<string, Expr>>
  on?: Readonly<Record<string, Handler>>
  /** Slot name to its content. */
  slots?: Readonly<Record<string, readonly Node[]>>
  /**
   * Slots passed only while a condition holds, by slot name. A member reads a
   * passed slot as filled even when its content renders nothing, so a slot
   * whose content is conditional is passed under the same condition (Input
   * draws its trailing box whenever `trailing` is passed; EmptyState draws its
   * actions row whenever an action slot is).
   */
  slotWhen?: Readonly<Record<string, Expr>>
}

/** A slot outlet: the caller's content for `name`, or `fallback` when the caller gave none. */
export interface SlotNode {
  kind: 'slot'
  /** `default` for children, else the node prop's name. */
  name: string
  /**
   * A scoped slot's props: the render prop's one argument, an object of named
   * values (DataTable's `rowDetail` takes `{ row, close }`). A value is handed
   * on as it is, so a loop's item is the object the caller put in the list.
   */
  props?: Readonly<Record<string, Expr>>
  /**
   * Props set on each element the caller put in the slot, over its own, as
   * React's `cloneElement` does (FormField hands its control an id and its
   * descriptions). An `undefined` value leaves the element's own. In these
   * expressions `child` is the element's own props (`child.label ?? child.name`).
   */
  pass?: Readonly<Record<string, Expr>>
  /**
   * With `pass`: render only the first this many elements (Avatar.Group's
   * `max`). A slot that passes props takes no scoped `props` and no
   * `fallback`, and only one that passes props takes `take` (`checkSlots`).
   */
  take?: Expr
  fallback?: readonly Node[]
}

export interface TextNode {
  kind: 'text'
  /** Static text. */
  value?: string
  /** Interpolated text. */
  expr?: Expr
}

/** Conditional content: the first branch whose condition holds, else `otherwise`. */
export interface IfNode {
  kind: 'if'
  branches: readonly { when: Expr; then: readonly Node[] }[]
  otherwise?: readonly Node[]
}

/** The content once per item of a list. */
export interface EachNode {
  kind: 'each'
  of: Expr
  as: string
  index?: string
  key: Expr
  children: readonly Node[]
}

/** Content rendered at the end of the document body, as overlays are. */
export interface PortalNode {
  kind: 'portal'
  children: readonly Node[]
}

/** A VNode a caller passed inside a structured prop (`secondaryAction`), rendered as it is. */
export interface RenderNode {
  kind: 'render'
  value: Expr
}

export type Node =
  ElementNode | MemberNode | SlotNode | TextNode | IfNode | EachNode | PortalNode | RenderNode

/**
 * A Zag machine (`@zag-js/<of>`), and how the member's props drive it.
 *
 * `context` maps the machine's props to expressions over the member's scope; an
 * `undefined` value leaves the machine its own default, so an absent controlled
 * prop leaves the machine uncontrolled. `events` maps the machine's callbacks
 * (`onCheckedChange`) to the member's emitted events; `details` is the
 * callback's argument. The machine's connected API is `api`, and an element
 * spreads one of its prop getters through `spread`.
 */
export interface MachineBinding {
  of: string
  context: Readonly<Record<string, Expr>>
  events?: Readonly<Record<string, { emit: string; payload: Expr } | { run: Expr }>>
}

/** The edge a sheet's panel is pinned to. */
export type SheetSide = 'start' | 'end' | 'bottom'

/**
 * Exit and enter motion for content that comes and goes. `present` is true
 * while `open` holds and for as long as the element named `ref` takes to play
 * its exit, so a closing panel animates out before it unmounts. `binding` is a
 * motion binding from `design/motion/motion.json`, played by the motion
 * engine; without one, the recipe's own CSS animation plays the exit.
 */
export interface Presence {
  open: Expr
  ref: string
  /**
   * The binding's name, or `{ expr }` for one the member's state chooses
   * (Dialog's panel plays `sheet.panel` in its sheet form). Omitted when the
   * recipe animates the element itself, keyed on its `data-state`.
   */
  binding?: string | { expr: Expr }
  /**
   * For a `sheet` binding: the edge the panel is pinned to, or `{ expr }` for
   * an edge a prop chooses (Drawer's `side`), read each time the panel enters
   * or leaves. The sheet presentation's is `bottom`.
   */
  sheetSide?: SheetSide | { expr: Expr }
  /**
   * For an anchored binding: the side of the panel's anchor it opens on and its
   * alignment there, as the React member hands them to its surface, so the
   * panel grows from the edge it opens from (Command's palette opens below its
   * anchor, centred, and grows from its top edge). Each is written, or `{ expr
   * }` for one a prop chooses (Tooltip's `side` and `align`), read each time the
   * panel enters or leaves.
   */
  side?: 'top' | 'right' | 'bottom' | 'left' | { expr: Expr }
  align?: 'start' | 'center' | 'end' | { expr: Expr }
  /**
   * Whether the element plays its enter although it is open when it mounts,
   * read once, when it mounts. Content open at mount does not animate in
   * unless this holds: a chip added after its list's first render does
   * (TagInput's chips), as a `MotionPresence` child that joins later does.
   */
  appear?: Expr
  /**
   * A spring binding that slides the element from its old place to its new
   * one when an element beside it is added or removed (TagInput's chips close
   * a removed chip's gap with `taginput.reflow`), as the React member's
   * `layoutBinding` does.
   */
  reflow?: string
  /**
   * A presence per item of a list. `open` is then the keys of the items that
   * are open, `ref` names the elements a loop renders, and `key` reads an
   * element's key from it (`element`). The value is the set of keys present
   * (`regionPresent.has(item.value)`): a key joins when its item opens and
   * leaves when its element's recipe has played the exit. Only a recipe's own
   * animation plays it, so a keyed presence takes no `binding`.
   */
  key?: Expr
}

/**
 * A list whose removed items stay in the document while they play their exit
 * (TagInput's chips). Its value, under its name, is the list to render, in
 * order: an entry `{ item, key, open, done }` for every item of `of`, with
 * `open` true, and one for each item removed from `of`, at the position it
 * held, with `open` false, until its `done()` is called. An item that comes
 * back before it has gone is current again.
 *
 * The motion engine animates one element per presence, so each entry is
 * rendered by a part whose own presence takes the entry's `open` and plays
 * the exit, and which calls `done` when the exit has played.
 */
export interface ListPresence {
  of: Expr
  /** An item's key, as a function of the item (`(tag) => tag`). */
  key: Expr
}

/**
 * Statements run after the document has updated: once after mount unless
 * `mount` is `false`, and again whenever `watch` changes when it is set. An
 * effect needs at least one of the two. For a measurement the template cannot
 * express (Textarea's autosize reads `scrollHeight`), and for what a machine
 * leaves to its renderer (focus returning to a trigger when a list closes,
 * which must not run on mount).
 *
 * An effect with `resize`, `mutation`, `delay`, `listen` or `release` holds
 * something until it is released: an observer, a timer, a document listener
 * or what `run` did, made each time the effect runs, released before it runs
 * again and when the member unmounts.
 */
export interface Effect {
  run: Expr
  watch?: Expr
  mount?: boolean
  /**
   * Elements whose size changes run the effect again, through one
   * `ResizeObserver`: expressions over the scope, usually refs (`block`,
   * `body?.firstElementChild`); `null` and `undefined` are skipped. The
   * elements are read each time the effect runs, because a watched change may
   * have replaced them (ChatThread's list appears with its first turn).
   */
  resize?: readonly Expr[]
  /**
   * Elements whose descendants are added, removed or rewritten run the effect
   * again, through one `MutationObserver` over each subtree (children and
   * text), read as `resize` reads its elements: Table's grid keeps one tab stop
   * when its rows are replaced, and CodeBlock re-measures a longer command in a
   * box of the same size, which no size change reports.
   */
  mutation?: readonly Expr[]
  /**
   * Attributes whose change on any element of a `mutation` subtree also runs
   * the effect again, through the same observer: Table's grid moves its tab
   * stop off a cell's control that becomes disabled, and Carousel's viewport
   * stays a tab stop when its machine takes `tabindex` away. An effect that
   * writes an attribute it observes runs again on its own write, so it writes
   * only a value that differs.
   */
  attributes?: readonly string[]
  /**
   * Milliseconds to wait before running: the effect sets a timer instead of
   * running, and a timer still pending when it is set again or when the member
   * unmounts is cleared (CopyButton's confirmation reverts after its feedback
   * time, and a second copy restarts the wait). An effect that waits observes
   * nothing.
   */
  delay?: Expr
  /**
   * An event on the document to listen for (`'keydown'`): the effect adds a
   * listener instead of running, and runs on each event, with the event as
   * `$event` (Toast's F8 moves focus to its viewport). The listener is removed
   * before the effect adds it again and when the member unmounts. An effect
   * that listens neither observes nor waits.
   */
  listen?: string
  /**
   * Statements that undo what `run` did, run before the effect runs again and
   * when the member unmounts, which read what `run` returned as `ran`:
   * FormField removes the toast notice it raised (`toast` returns its id)
   * when the field unmounts and before it raises a new message, and Toast's
   * viewport stops following the store (`subscribeToasts` returns the
   * function that stops it). An effect that releases neither observes, waits
   * nor listens.
   */
  release?: Expr
}

/** The type of the one argument an agent action takes, as the engine's `AgentArgumentType` lists them. */
export type AgentArgument = 'boolean' | 'number' | 'text' | 'id' | 'ids'

/** An agent action that takes an argument, as a description's `agent` block writes it. */
export interface AgentBlockAction {
  argument: AgentArgument
  /** For an `id` or `ids` argument: the `choices` state of the block whose choices it names. */
  among?: string
  run: Expr
}

/**
 * What an agent reads from the member and what it may do to it: the states
 * and actions of the `agent` fence in the member's spec, over the member's
 * scope. Each renderer writes it as a mount effect that registers the
 * instance with the foundation's `agentMember` and removes it on unmount. Its
 * values are closures, so the bridge reads the state on screen and an action
 * calls the machine as it is now.
 */
export interface AgentBlock {
  /**
   * The ref of the element that carries the accessible name. A member whose
   * template draws no element of its own (ConfirmDialog renders a Dialog)
   * gives `element` instead.
   */
  on?: string
  /**
   * The element that carries the accessible name, when a member this one
   * renders draws it (PasswordInput's field is its Input's), written over the
   * member's scope from `on`: `frame?.querySelector('input')`. Without it the
   * element is `on`'s.
   */
  element?: Expr
  /** A value expression per declared state, over the member's scope. */
  state: Readonly<Record<string, Expr>>
  /**
   * Per declared action: a statement, or `{ argument, among?, run }` where `run` reads the
   * argument as `value`. `among` names the `choices` state an `id` or `ids` argument names a
   * choice of, as the fence's `among <state>` does.
   */
  actions: Readonly<Record<string, Expr | AgentBlockAction>>
  /** The states whose values never leave the bridge. */
  secret?: readonly string[]
  /** True when the instance needs a person to confirm each action. */
  destructive?: Expr
  /**
   * The element whose registered members are not an agent's
   * (`withholds contents`): a ref name, or an expression over the member's
   * scope (`borrowed.element?.()`). An expression may give a list of elements,
   * each a region (PromptInput's attachment row and its own Buttons).
   */
  withholds?: Expr
  /**
   * Registers nothing when this holds at mount. A member that another one
   * draws in its own place writes it, so the bridge lists the member that
   * stands for it and not both (Dialog's `lender`, set inside a ConfirmDialog).
   */
  unless?: Expr
  /**
   * The member the handle registers as, when it is not the component's own
   * name. `partShell` writes it for a part's block, so Toast's viewport
   * registers as `Toast`; a description does not write it.
   */
  member?: string
}

/**
 * A value a fixture passes: JSON; JavaScript written out as it is (a
 * formatter), which may read `zag`, the member's machine module, to construct
 * a value the machine takes (`zag.parse('2026-07-15')`, a calendar date), and
 * the foundation's values `FIXTURE_VALUES` lists (`new Time(9, 0)`); a node of another member (`{ node }`, DescriptionList's Badge detail); a
 * function that returns one or several (`{ params, renders }`, a DataTable
 * column's `cell`, whose props and text may read the parameters through
 * `js`); or, in
 * an entry that holds state, a held value (`{ held }`) or a handler that sets
 * one (`{ hold }`, to its first argument or to `to`).
 */
export type FixtureValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly FixtureValue[]
  | { readonly [key: string]: FixtureValue }
  | { js: string }
  | { node: FixtureChild }
  | { params: readonly string[]; renders: FixtureChild | readonly FixtureChild[]; when?: string }
  | { held: string }
  | { hold: string; to?: FixtureValue }

/**
 * The foundation's values a fixture's JavaScript (`js`) may name, which the
 * fixture imports from its framework's foundation: the toast store's `toast`
 * and its cap, which Toast's launchers call and name, the date and time values the engine
 * re-exports from `@internationalized/date`, which TimeInput's and
 * DatePicker's entries are made with (`new Time(9, 0)`), and the rich-text
 * document's normal form, which RichTextInput's documents are read through.
 */
export const FIXTURE_VALUES: readonly string[] = [
  'toast',
  'TOAST_MAX_VISIBLE',
  'Time',
  'CalendarDate',
  'CalendarDateTime',
  'normalizeRichText',
]

/** Slot content in a fixture: text, text an expression computes (`js`), a member or an element. */
export type FixtureChild =
  | string
  | { js: string }
  | {
      member: string
      props?: Readonly<Record<string, FixtureValue>>
      slots?: Readonly<Record<string, readonly FixtureChild[]>>
    }
  | {
      element: string
      attrs?: Readonly<Record<string, string>>
      /**
       * Classes from the member's recipe (or `<recipe>.<name>` from one of its
       * `recipes`): a box the entry needs to show its state, which the recipe
       * draws for the fixture (ScrollArea's sized harness, without which no
       * region overflows).
       */
      class?: readonly string[]
      children?: readonly FixtureChild[]
    }

export interface FixtureInstance {
  props?: Readonly<Record<string, FixtureValue>>
  slots?: Readonly<Record<string, readonly FixtureChild[]>>
}

/**
 * One states fixture entry, named as the React fixture names it, so a
 * contract's `when <state>` finds the same entry in every shell.
 */
export interface StateEntry extends FixtureInstance {
  name: string
  /** Attributes the rendered root must carry; `null` asserts absence. */
  expect?: Readonly<Record<string, string | null>>
  /**
   * Several instances side by side, inside a layout member, where the React
   * entry renders a row or a stack of them. Overrides reach the first.
   */
  many?: {
    /**
     * A layout member, or an element with the member's recipe classes (`{
     * element: 'div', class: ['harness'] }`, ScrollArea's sized box) for an
     * entry whose one instance needs a box of a given size.
     */
    within:
      | { member: string; props?: Readonly<Record<string, FixtureValue>> }
      | { element: string; class?: readonly string[] }
    each: readonly FixtureInstance[]
    /** Other content after the instances, in the same layout member. */
    also?: readonly FixtureChild[]
  }
  /** The entry renders nothing at all, by design (one page is not a paginated list). */
  rendersNothing?: boolean
  /**
   * A compound part the entry renders instead of the member, by the part's
   * name (`NavItem` for `AppShell.NavItem`): `props` and `slots` are the
   * part's, and the runner's overrides reach it. For a part on its own, as the
   * React fixture renders one without its member around it.
   */
  part?: string
  /**
   * Values the entry holds, by name, with their first values, as the
   * application component around a controlled member holds them: a prop reads
   * one with `{ held: name }`, and a handler sets one with `{ hold: name }`
   * (Command's `open` belongs to its launcher, so the palette opens, closes and
   * dismisses).
   */
  holds?: Readonly<Record<string, FixtureValue>>
  /**
   * Content rendered before the member, beside it (the launcher's Button), or
   * first in `many`'s layout member (Drawer's two launchers in one Stack).
   */
  before?: readonly FixtureChild[]
  /**
   * Text typed into a field once the field is in the document, as a reader
   * types it, for a state a prop cannot set (Command's query): the field's
   * selector, searched in the document because an overlay portals, and the text.
   */
  types?: { into: string; text: string }
  /**
   * A control pressed once it is in the document, as a reader presses it, for
   * a state only a press reaches (CursorPagination's append form says the list
   * ran out once it has asked for a window): the control's selector, searched
   * in the document, as `types` searches. A control that is not drawn is not
   * pressed.
   */
  presses?: string
  /**
   * Words selected once their element is in the document and holds them, as a
   * reader selects them, for a state only a selection reaches (the selection
   * bar RichTextInput draws at the selected words): the element's selector,
   * searched in the document as `types` searches, and the words, the first
   * run of them in one of its text nodes. A focusable element takes focus
   * first, as a press on it gives it, and the words are selected a moment
   * later, once an editor in it has written its own selection back.
   */
  selects?: { in: string; text: string }
}

/**
 * A compound part: a component of its own that belongs to a member and reads
 * the member's state (`Tabs.Content` reads which tab is current). Its props
 * are the registry's when it lists them under the member, by the part's name
 * (`Group.title` under SettingsRow is the `Group` part's `title`), and are
 * declared here otherwise (`Tabs.Content`, whose props the React member types
 * inline). A part declares no props the registry lists. A public part is
 * attached to its member (`Tabs.Content`); an internal one is only rendered by
 * its member (a Menu's submenu). In a part's expressions, `owner` holds what
 * the member `provide`s.
 */
export interface PartShell {
  name: string
  public: boolean
  purpose: string
  props?: Readonly<Record<string, { type: string; optional?: boolean; doc?: string }>>
  defaults?: Readonly<Record<string, Expr>>
  state?: Readonly<Record<string, Expr>>
  machine?: MachineBinding
  derived?: Readonly<Record<string, Expr>>
  effects?: readonly Effect[]
  presence?: Readonly<Record<string, Presence>>
  /**
   * What an agent reads and does with the member, registered by this part
   * under the member's name, for a member whose control is a part it draws
   * and not its own template: Toast renders nothing, and its viewport, the
   * `Viewport` part, reads the notices. A description gives its `agent` block
   * here or on the member, not both.
   */
  agent?: AgentBlock
  template: Node | readonly Node[]
}

/** A member's description. */
export interface MemberShell {
  /** The member's name, as the registry names it. */
  member: string
  /** Its directory: the tier directory its React source and its recipe sit in. */
  dir: string
  /**
   * Which package ships it: the vocabulary (`@polymorph/vue-ui`, the default) or
   * the foundation (`@polymorph/vue`), as `Icon` ships in `@polymorph/react`.
   */
  home?: 'vocabulary' | 'foundation'
  /** The states fixture's file name, without `.states.ts`, when it is not the member's kebab name. */
  fixture?: string
  /** The states fixture's directory in the vocabulary, when it is not `dir`. */
  fixtureDir?: string
  /** Its recipe, `<dir>/<file>` under `@polymorph/recipes`, bound as `styles`; `null` for none. */
  recipe: string | null
  /** Other recipes, by the name the class list uses for them (`{ focus: 'conventions/focus' }`). */
  recipes?: Readonly<Record<string, string>>
  /**
   * Types the props name that the member declares (`CheckedState`,
   * `TabDescriptor`), and the type aliases the React member exports
   * (`BadgeTone`), as TypeScript: an alias of a prop's type is written over the
   * props interface (`"NonNullable<BadgeProps['tone']>"`), so it cannot differ
   * from the prop. The member owns each one: its component exports it and the
   * vocabulary's index exports it from there. The foundation's (`IconRole`,
   * `LayoutPatch`) need no entry. A generic type writes its parameters first
   * (`'<Row> { header: string; cell?: (row: Row) => VNode | string }'`).
   */
  types?: Readonly<Record<string, string>>
  /**
   * The React member's type parameters, as a `generic` attribute writes them
   * (`'Row'`, DataTable's row): the component is generic over them, and so is
   * its props interface (`DataTableProps<Row>`).
   */
  generic?: string
  /**
   * Types the states fixture declares for its values, by name, as TypeScript
   * (`{ TicketRow: '{ id: string; status: string }' }`, DataTable's rows), so
   * a fixture's function reads a field without a cast. Each fixture file
   * declares them before its entries.
   */
  fixtureTypes?: Readonly<Record<string, string>>
  /**
   * The type arguments the fixture's entries give `generic`'s parameters
   * (`'TicketRow'`), one of `fixtureTypes`. A render function that cannot
   * infer a generic component's parameters from its props (Vue's `h()`)
   * passes them to the member (`h(DataTable<TicketRow>, …)`); a template or
   * JSX infers them.
   */
  fixtureGeneric?: string
  /**
   * Types the props or `types` name that another description owns, by name:
   * one it declares in `types` (`MenuEntry`, `CitationSource`), or its props
   * interface (`EmptyStateProps`). The component imports each from its owner's
   * component, so the vocabulary declares every type once.
   */
  uses?: readonly string[]
  /** Prop defaults, as expressions. A boolean prop without one is `undefined` when absent. */
  defaults?: Readonly<Record<string, Expr>>
  /**
   * Props the member takes and never reads, each with the reason: the member already does what
   * the prop asks, in every case. The prop stays in the member's props, so a screen passes it to
   * every framework's member unchanged. The Svelte renderer binds each prop to a local, and a
   * local nothing reads fails the typecheck, so it leaves these unbound. It refuses an entry that
   * is not a prop, and one the description reads.
   */
  unread?: Readonly<Record<string, string>>
  /** Values held by the instance, by name, with their initial expressions. */
  state?: Readonly<Record<string, Expr>>
  machine?: MachineBinding
  /** Values computed from the scope, in order: a later one may read an earlier one. */
  derived?: Readonly<Record<string, Expr>>
  /** Element refs a member hands to the caller's `controlRef`, by ref name: `{ field: 'controlRef' }`. */
  controlRefs?: Readonly<Record<string, string>>
  /**
   * Named booleans that follow one of the foundation's media queries, by its
   * name (`phone`, the sheet presentation's breakpoint). The thresholds live in
   * the foundation, so no description writes a length.
   */
  media?: Readonly<Record<string, 'phone'>>
  /**
   * The name of a value that follows the document's colour mode, through the
   * foundation's `useMode`: `<name>.preference` is `light`, `dark` or
   * `system`, and `<name>.mode` the mode applied. It changes after each
   * `setMode`, from any caller. A server render reads `system` and `light`.
   */
  mode?: string
  /**
   * Departures a member plays before it hands control back: `start(then)` sets
   * `active`, waits for the motion binding's runtime on the element named
   * `ref`, then runs `then` (Alert's ✕ collapses the row, then emits `dismiss`).
   */
  departures?: Readonly<Record<string, { binding: string; ref: string }>>
  /** Named presences: `derived`-like booleans that hold through an exit. */
  presence?: Readonly<Record<string, Presence>>
  /** Named lists whose removed items stay while they leave (`ListPresence`). */
  listPresence?: Readonly<Record<string, ListPresence>>
  /** Statements run after the document has updated (`Effect`). */
  effects?: readonly Effect[]
  /** What an agent reads and does with the member (`AgentBlock`), as its spec's `agent` fence declares. */
  agent?: AgentBlock
  /** Static facts a parent reads from the member's component (`controlKind`). */
  statics?: Readonly<Record<string, Expr>>
  /** What the member's parts read, as `owner.<name>`: its machine, its state. */
  provide?: Readonly<Record<string, Expr>>
  /**
   * Gives the members it composes its own identity: a member that draws a
   * surface for a composing member (Dialog's panel under ConfirmDialog) reads it
   * as `lent` and writes it as its `data-member` (`lent ?? 'dialog'`), so the
   * surface carries the composing member's name, which has no surface of its own.
   */
  lends?: boolean
  /**
   * Node props its props interface also carries as `VNode` fields, by name, for
   * a value of that type another member takes (ListPage's `emptyState` is an
   * `EmptyStateProps`, and its actions are nodes). The component takes them as
   * slots and declares its props without them.
   */
  carries?: readonly string[]
  /** Its compound parts. */
  parts?: readonly PartShell[]
  /** The anatomy. A member renders one root node, or several (a trigger and its portal). */
  template: Node | readonly Node[]
  /** Entries generated from the registry's lawful variant × tone grid: one per cell. */
  grid?: FixtureInstance
  states: readonly StateEntry[]
}

/* -------------------------------------------------------------------------- */
/* Builders                                                                   */
/* -------------------------------------------------------------------------- */

/** `'value'`: a string literal, as an expression. */
export const lit = (value: string): Expr => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

/** `''` when the condition holds, else `undefined`: a present-or-absent `data-*` flag. */
export const flag = (condition: Expr): Expr => `(${condition}) ? '' : undefined`

/** The condition's value, or `undefined` when it is falsy: an attribute present only when set. */
export const when = (condition: Expr, value: Expr): Expr => `(${condition}) ? ${value} : undefined`

export function el(
  tag: string | { expr: Expr },
  options: Omit<ElementNode, 'kind' | 'tag' | 'children'> = {},
  children: readonly Node[] = [],
): ElementNode {
  return { kind: 'element', tag, ...options, children }
}

export function member(
  name: string,
  props: Readonly<Record<string, Expr>> = {},
  options: Omit<MemberNode, 'kind' | 'name' | 'props'> = {},
): MemberNode {
  return { kind: 'member', name, props, ...options }
}

export function slot(name = 'default', options: Omit<SlotNode, 'kind' | 'name'> = {}): SlotNode {
  return { kind: 'slot', name, ...options }
}

export const text = (expr: Expr): TextNode => ({ kind: 'text', expr })

export const words = (value: string): TextNode => ({ kind: 'text', value })

/** `cond('a', [x], 'b', [y], [z])`: x when a, else y when b, else z. */
export function cond(...args: (Expr | readonly Node[])[]): IfNode {
  const branches: { when: Expr; then: readonly Node[] }[] = []
  let at = 0
  while (at + 1 < args.length) {
    branches.push({ when: args[at] as Expr, then: args[at + 1] as readonly Node[] })
    at += 2
  }
  const otherwise = at < args.length ? (args[at] as readonly Node[]) : undefined
  return { kind: 'if', branches, ...(otherwise ? { otherwise } : {}) }
}

export function each(
  of: Expr,
  as: string,
  key: Expr,
  children: readonly Node[],
  index?: string,
): EachNode {
  return { kind: 'each', of, as, key, children, ...(index ? { index } : {}) }
}

export const portal = (...children: Node[]): PortalNode => ({ kind: 'portal', children })

export const render = (value: Expr): RenderNode => ({ kind: 'render', value })

export const emit = (name: string, options: { args?: Expr[]; when?: Expr } = {}): Handler => ({
  emit: name,
  ...options,
})

export const run = (statement: Expr, when?: Expr): Handler =>
  when === undefined ? { run: statement } : { run: statement, when }

/** JavaScript a fixture passes as it is. */
export const js = (source: string): { js: string } => ({ js: source })

/** A node of another member, passed inside a fixture's prop value. */
export const node = (child: FixtureChild): { node: FixtureChild } => ({ node: child })

/**
 * A function a fixture passes that returns a member's node, its parameters
 * written as TypeScript (`renders(['row: { status: string }'], fx('Badge', …))`),
 * or several nodes, as a React fixture's function returns a fragment
 * (RichTextInput's footer of two Buttons). With `when`, JavaScript over the
 * parameters, it returns them only when that holds and nothing otherwise, as
 * a React render prop returns `undefined` (RichTextContent's `entity` draws a
 * person and leaves an issue to the token).
 */
export const renders = (
  params: readonly string[],
  child: FixtureChild | readonly FixtureChild[],
  when?: string,
): {
  params: readonly string[]
  renders: FixtureChild | readonly FixtureChild[]
  when?: string
} => ({
  params,
  renders: child,
  ...(when === undefined ? {} : { when }),
})

/** A value the fixture entry holds (`StateEntry.holds`), read as a prop. */
export const held = (name: string): { held: string } => ({ held: name })

/** A handler that sets a held value: to its first argument, or to `to`. */
export const hold = (name: string, ...to: [FixtureValue?]): { hold: string; to?: FixtureValue } =>
  to.length === 0 ? { hold: name } : { hold: name, to: to[0] }

/** A fixture's composed member. */
export const fx = (
  name: string,
  props: Readonly<Record<string, FixtureValue>> = {},
  slots?: Readonly<Record<string, readonly FixtureChild[]>>,
): FixtureChild => ({ member: name, props, ...(slots ? { slots } : {}) })

/** Declares a member's description, typed. */
export const describeMember = (shell: MemberShell): MemberShell => shell

/** `data-member`, the member's identity on the element that carries it, as `memberAttr` writes it. */
export const identity = (name: string): Record<string, Expr> => ({
  'data-member': lit(gallerySlug(name)),
})

/**
 * The spacing attributes Stack, Inline and Grid share, with any patch applied
 * last: the engine's `spacingAttrs`, which the React members spread too. An
 * element takes it in `spread`.
 */
export const spacing: Expr = 'spacingAttrs({ gap, p, px, py, patch })'
