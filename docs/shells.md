# Shells

The vocabulary is one set of members, and each framework that ships it renders those members in
its own way. A **shell** is one framework's rendering of the vocabulary. The React vocabulary in
`packages/react-ui` is written by hand. The Vue, Svelte, Solid and Angular shells are generated
from a **description**: each member described once, without a framework, in `packages/shells`.
The SwiftUI and Compose members are written by hand for their platforms ([native.md](native.md)),
and no description renders to them. This page covers the description language, the Vue renderer,
the Vue foundation, how a member is described, and the laws that hold the Vue shell to the React
one, then the Svelte, Solid and Angular renderers and their foundations, which read the same
descriptions, and the elements renderer, which writes each member as a custom element over its
Solid member.

Terms used on this page:

- **Member**, **spec**, **recipe**, **states fixture**: as in [concepts.md](concepts.md).
- **Description**: one member's file in `packages/shells/src/members/`.
- **Shell**: one framework's rendering of the vocabulary. `@polymorph/vue-ui` is the Vue shell,
  `@polymorph/svelte-ui` the Svelte shell, `@polymorph/solid-ui` the Solid shell,
  `@polymorph/angular-ui` the Angular shell and `@polymorph/elements-ui` the elements.
- **Machine**: a Zag state machine (`@zag-js/<name>`) that gives a member its behaviour in a shell
  that is not React.

[frameworks.md](frameworks.md) says how a React prop reads in each framework and how the tools
write each framework's screens. This page is about how the generated members themselves are made.

## Why members are described, not written

A second framework's vocabulary written by hand would be a second set of decisions about anatomy,
attributes and behaviour, and it would drift from the first in small things. A description holds
what is not React about a member: its anatomy (which elements, which recipe classes, which `data-*`
and ARIA attributes on which element), the values it derives from its props, the machine that gives
it behaviour, and its states fixture. A renderer writes the description into one framework's
syntax, and the Vue, Svelte, Solid and Angular renderers read the same descriptions.

What a description does not hold is the member's interface. Its props, events and slots come from
the registry, which reads them from the React member, through `vueBinding`
(`@polymorph/registry/frameworks`), the function the screen emitter uses. So a React prop added,
renamed or retyped reaches every shell at the next `pnpm shells`, and the spec staleness law fails
until it does.

## The description language

`packages/shells/src/dsl.ts` defines it. A description is a `MemberShell`:

| Field | What it holds |
| --- | --- |
| `member`, `dir` | the member's name and its tier directory (the React source's directory) |
| `home` | `vocabulary` (`@polymorph/vue-ui`, the default) or `foundation` (`@polymorph/vue`), where `Icon` ships, as it ships in `@polymorph/react` |
| `recipe`, `recipes` | the member's recipe under `@polymorph/recipes`, bound as `styles`, and any other recipe it uses, by name |
| `types` | the types its props name that the member declares (`TabDescriptor`), and the type aliases the React member exports (`BadgeTone`), an alias of a prop's type written over the props interface (`"NonNullable<BadgeProps['tone']>"`) so it cannot differ from the prop; the member owns each one, and the foundation's (`IconRole`, `LayoutPatch`) need none |
| `uses` | the types its props or `types` name that another description owns, by name: one in that description's `types` (`MenuEntry`, `CitationSource`) or its props interface (`EmptyStateProps`) |
| `generic` | the React member's type parameters (`'Row'`, DataTable's row): the component is generic over them (`<script setup generic="Row">`), and so are its props interface and any type in `types` that writes its parameters first (`'<Row> { cell?: (row: Row) => VNode \| string }'`) |
| `fixtureTypes`, `fixtureGeneric` | types the states fixture declares for its values (`TicketRow`, DataTable's rows), so a fixture's function reads a field without a cast, and the type arguments its entries give `generic`'s parameters, which Vue's `h()` cannot infer and passes to the member (`h(DataTable<TicketRow>, …)`) |
| `defaults` | prop defaults, as expressions |
| `unread` | props the member takes and never reads, each with the reason: the member already does what the prop asks in every case (Accordion's `keepMounted`). The prop stays in the member's props. The Svelte renderer leaves it out of the destructure, and refuses an entry the description reads |
| `state` | values the instance holds (an uncontrolled draft) |
| `machine` | a Zag machine: the machine's props as expressions over the member's scope, and its callbacks mapped to the member's events |
| `derived` | values computed from the scope |
| `effects` | statements run after the document updates: after mount unless `mount` is `false`, and when the `watch` expression changes when it has one (Select returns focus to its trigger when its list closes, never on mount); with `resize` or `mutation`, also when the elements they name change size or content, and with `attributes`, when those attributes change in a `mutation` subtree; with `delay`, a timer instead, and with `listen`, a document listener instead; and with `release`, statements that undo what it did ([Effects that hold something](#effects-that-hold-something)) |
| `agent` | what an agent reads from the member and may do to it, as the `agent` fence in its spec declares: the ref of the element that carries the accessible name, a value per state, a statement per action, the secret states and when the instance is destructive ([The agent block](#the-agent-block)) |
| `presence` | booleans that stay true while an element plays its exit, by a motion binding the description names or chooses (`{ expr }`: Dialog's panel plays `sheet.panel` in its sheet form), with `sheetSide` for a sheet's edge, written or chosen by a prop (`{ expr: 'side' }`, Drawer), and `side` and `align` for an anchored binding's origin, each written (Command's palette grows from its top edge) or chosen by a prop (`{ expr: 'side' }`, Tooltip's bubble grows from the edge it opens on); with `appear`, content open at mount plays its enter (a chip added after its list's first render), and with `reflow`, a spring binding slides the element into a sibling's gap (TagInput's chips); with `key`, a presence per item of a list, the set of keys whose element stays (Accordion's regions play their close keyframes) |
| `listPresence` | lists whose removed items stay at their place while they leave: entries `{ item, key, open, done }`, each rendered by a part whose own presence plays the exit and which calls `done` when it has (TagInput's chips play `taginput.chip`) |
| `departures` | a wait for a motion binding's runtime before a callback (Alert's ✕ collapses the row, then emits `dismiss`) |
| `media` | booleans that follow one of the foundation's named media queries |
| `mode` | the name of a value that follows the document's colour mode through the foundation's `useMode`: its `preference` and its `mode` (ModeSwitch shows the preference) |
| `controlRefs` | an element handed to the caller's `controlRef` |
| `statics` | facts a parent reads from the component (`controlKind`) |
| `provide`, `parts` | compound parts (`Tabs.Content`) and what the member hands them; a part's props are the registry's when it lists them under the member's name (`Group.title` under SettingsRow), and the part's own declaration otherwise |
| `lends` | the member's identity, lent to the members it composes: a member that draws a surface for one (Dialog's panel under ConfirmDialog) reads it as `lent` and writes it as its `data-member` |
| `carries` | node props the props interface also carries as `VNode` fields, for a value of that type another member takes (`EmptyStateProps.action`, for ListPage's `emptyState`); the component still takes them as slots |
| `template` | the anatomy |
| `grid`, `states` | the states fixture, as data |

The anatomy is a tree of nodes:

| Node | Builder | What it renders |
| --- | --- | --- |
| element | `el(tag, options, children)` | an element, or `{ expr }` for a tag chosen by a prop (`as`): recipe classes, attributes, machine prop getters spread on it, event handlers, a ref, and `geometry` for inline style that carries data (Progress's `scaleX`) |
| member | `member(name, props, { on, slots, slotWhen })` | another described member; `slotWhen` passes a slot only while its condition holds, because a member reads a passed slot as filled whatever it renders (SearchInput's hint is Input's `trailing` only while it shows) |
| slot | `slot(name, { props, pass, take, fallback })` | the caller's content; `props` for a scoped slot, whose props are named values (DataTable's `rowDetail` takes `row` and `close`), `pass` for props set on each slotted element (FormField hands its control an id), `take` with `pass` for the first N; a slot that passes props has no slot props and no fallback, and every renderer refuses one that does, or that takes without passing (`checkSlots`) |
| text | `text(expr)`, `words(value)` | interpolated or static text; static text that holds `{{` or starts or ends with whitespace is written as a string literal, which Vue renders as it is |
| if | `cond(when, then, …, otherwise)` | the first branch whose condition holds |
| each | `each(of, as, key, children, index)` | the content once per item |
| portal | `portal(...children)` | content at the end of the document body |
| render | `render(expr)` | a node a caller passed inside a structured prop (`AccordionItem.content`) |

Every value in a description is an **expression**: a string in the subset of JavaScript that every
target framework's templates accept. Its scope is the member's props by their camelCase names, its
`derived`, `state`, `presence`, `listPresence` and `media` values, `api` and `service` (the
machine's connected API and the machine itself), `zag` (the machine's module), `slots`, `uid` (an
id unique to the instance), `listening.<event>` (whether the caller handles an event),
`slotted(slots.<name>)` (what elements the caller put in a slot), `slotText(slots.<name>)` (the
text the caller put in a slot: CodeBlock copies its code, and StreamingText's empty text marks a
pending stream), `slotNode(slots.<name>)` (what the caller put in a slot, as a node another
component draws with `render`: a declared Toast hands its `content` to the toast store, and the
viewport draws it), `slotNode(slots.<name>, arg)` (what a render prop draws for one argument, as
such a node), `slotDraws(slots.<name>, arg)` (whether a render prop draws anything for one argument:
RichTextContent draws its own token for an entity the app's `entity` draws nothing for),
`invoke('<event>', …)` (calls the caller's handlers, as `emit` does, and returns
what they return: ConfirmDialog waits on an `onConfirm` that returns a promise), `lent` (the
identity a composing member lends), `borrowed` (in a member that lends its identity, the holder
the member it lends to fills in: `borrowed.element?.()` is that member's element) and `lender`
(in the member lent to, that holder, or `undefined` outside a lender: Dialog writes
`lender.element = () => panel`), `owner` in a compound part, loop variables, `$event` in a
handler, `afterRender(fn)` (runs `fn` once the framework has written the changes made before the
call to the document: MultiSelect puts a controlled field's text back after its caller's value has
rendered), and the foundation's helpers. A renderer rewrites the scope into its framework's spelling
(`packages/shells/src/expr.ts` parses each expression with TypeScript to do it), so a description
never names a framework. `derived` values that are arrow functions are the description's own
helpers, run in the script, where the document's globals (`navigator`, `getComputedStyle`) are
reachable: CopyButton's write to the clipboard, SplitPane's keys, Table's grid keyboard model.
Vue tracks what a slot reads only while the member renders, so `slotText` is read in the template
where it decides what renders.

### Effects that hold something

An effect with `resize`, `mutation`, `delay`, `listen` or `release` holds something until it is
released: an observer, a timer, a listener, or what its statements did. It makes them each time it
runs (after mount, and when its `watch` changes, because the elements may have been replaced), and
releases them before it runs again and when the member unmounts.

| Field | What runs the effect again |
| --- | --- |
| `resize: [exprs]` | a size change of any of the elements, through one `ResizeObserver`; ArtifactPane, CodeBlock and Table measure whether they overflow, ConversationPage reads its own width |
| `mutation: [exprs]` | an element, or text, added to or removed from any of their subtrees, through one `MutationObserver`; CodeBlock re-measures a longer command in a box of the same size, and Table's grid keeps one tab stop when its rows are replaced |
| `attributes: [names]` | with `mutation`, a change of one of these attributes on an element of the subtrees, through the same observer; Table's grid moves a cell's stop off a control that becomes disabled, and Carousel's viewport stays a tab stop when its machine takes `tabindex` away |
| `delay: expr` | nothing: the effect sets a timer of that many milliseconds and runs when it fires; a timer still pending when the effect runs again or the member unmounts is cleared, so CopyButton's confirmation reverts two seconds after the last successful copy |
| `listen: 'keydown'` | the event on the document: the effect adds a listener instead of running, and runs on each event, with the event as `$event`; Toast's viewport takes focus on F8 from anywhere on the page |
| `release: expr` | nothing new: the statements run before the effect runs again and when the member unmounts, and read what `run` returned as `ran`. FormField removes the toast notice it raised (`toast` returns its id) before it raises a new message and when it unmounts, and Toast's viewport stops following the store (`subscribeToasts` returns the function that stops it), and ChatThread stops following its newest turn (`followEnd` returns the function that stops it) |

An effect that waits observes nothing, one that listens neither observes nor waits, and one that
releases neither observes, waits nor listens. An element expression that is `null` or `undefined` (a ref
whose element is not rendered) is skipped.

### The agent block

A member whose spec has an `## Agent` section registers each mounted instance with the agent
registry, so an agent bridge (`@polymorph/engine/agent`) reads its states and runs its actions.
The `agent` block states the same names as the spec's `agent` fence, over the member's scope:

| Field | What it holds |
| --- | --- |
| `on` | the ref of the element that carries the accessible name, which the bridge reports as the member's name (Checkbox's box) |
| `element` | an expression for that element, when a member this one renders draws it, written over the scope from `on` (PasswordInput's `frame?.querySelector('input')`, the field its Input draws) or from the `borrowed` holder (ConfirmDialog's `borrowed.element?.()`, its Dialog's panel). Without it the element is `on`'s. A member whose template draws no element of its own gives `element` and no `on` |
| `state` | a value expression per declared state (`checked: "api.indeterminate ? 'mixed' : api.checked"`) |
| `actions` | per declared action, a statement (`check: 'api.setChecked(true)'`), or `{ argument, run }` for an action that takes one argument, where `run` reads it as `value` and `argument` is `boolean`, `number`, `text`, `id` or `ids`. An `id` or `ids` action the fence writes with `among <state>` gives `among: '<state>'` beside `argument`, which every renderer hands to `agentMember` as written |
| `secret` | the states whose values never leave the bridge |
| `destructive` | an expression that is true while the instance needs a person to confirm each action (`tone === 'danger'`) |
| `withholds` | the element whose registered members are not an agent's (`withholds contents`): a ref name (ApprovalCard's `card`) or an expression (ConfirmDialog's `borrowed.element?.()`) |
| `unless` | an expression that, when it holds at mount, registers nothing, for a member another one draws in its own place (Dialog's `lender`) |

A compound part may give the block instead of its member, for a member whose control is that
part: Toast renders nothing, and its `Viewport` part gives the block. The part's component
registers under the member's name (`Toast`), and its expressions are written over the part's
scope.

Each renderer writes the block as one more effect, after the description's own: on mount it calls
the foundation's `agentMember` with a handle, and on unmount it calls the function `agentMember`
returned. The handle's state, actions and destructive check are closures, and the renderer
rewrites their free names as it rewrites any expression's (`api.value.checked` in Vue,
`this.api.value.checked` in Angular). Each closure therefore reads the scope when the bridge
calls it, not the value the member had when it mounted. A text field's action writes through the
engine's `agentFill`, and a plain activation through `agentPress`, so the framework's own change
path runs.

`pnpm shells` refuses a block that names no element (neither `on` nor `element`), one whose `on`
names no element ref of the template, or names the
elements a loop renders; a state or action name that is not lower-case words joined by `-`; an
argument type outside the list; and a secret that names no declared state. A state and an action
may share a name (`open`), as the spec's fence lets them, because the handle keeps them in two
objects.

### List presence

A presence (`presence`) keeps one element through its exit. A list whose items leave it needs one
per item, and the motion engine animates one element per presence, so `listPresence` keeps the
leaving item in the list and a part plays its exit. `{ chips: { of: 'values', key: '(tag) => tag'
} }` makes `chips` the list to render: an entry `{ item, key, open, done }` for every item of
`values`, with `open` true, and one for each item removed from it, at the position it held, with
`open` false, until its `done()` runs. The member renders each entry through an internal part
whose `presence` takes the entry's `open` with the motion binding, and whose effect emits `done`
when the presence ends. A removal is read in the update that makes it, so the leaving item's
element is never unmounted and mounted again.

### The states fixture

The states fixture is data. Each entry has the React fixture's entry name, the props and the slot
content, and the attributes the rendered root must carry. `many` renders several instances in a
layout member, where the React entry renders a row of them, or in an element with the member's
recipe classes (`{ element: 'div', class: ['harness'] }`, ScrollArea's sized box). `grid` gives one
entry per cell of the registry's lawful variant × tone grid.

| Value | What it renders |
| --- | --- |
| JSON | the value |
| `js('…')` | JavaScript as it is, such as a formatter; it may read `zag`, the member's machine module, which the fixture then imports (`js("zag.parse('2026-07-15')")`, Calendar's dates), and the foundation's values `FIXTURE_VALUES` lists, which it imports from the foundation: the toast store's `toast` and `TOAST_MAX_VISIBLE` (Toast's launchers), the date and time values the engine re-exports, `Time`, `CalendarDate` and `CalendarDateTime` (`js('new Time(9, 0)')`, TimeInput's and DatePicker's dates), and `normalizeRichText`, which RichTextInput's documents are read through |
| `node(fx('Badge', …))` | another member's node inside a prop value (DescriptionList's detail) |
| `renders(['row: { status: string }'], fx('Badge', …))` | a function that returns another member's node, or several in a list, as a React fixture's fragment holds them (RichTextInput's footer of two Buttons), whose props and text read its parameters through `js` (a DataTable column's `cell`); a third argument is a condition on its parameters, and where it is false the function draws nothing (RichTextContent's `entity` draws a person as a Link and no other entity) |
| `{ element, class }` | an element with recipe classes, as slot content or as a `many` box |
| `js('row.status')` as slot content | text an expression computes |
| `held('open')`, `hold('open')`, `hold('open', true)` | in an entry that `holds` values, a held value, a handler that sets it to its argument, and one that sets it to a value |

An entry renders the member, or with `part` one of its public compound parts on its own, as the
React fixture renders `AppShell.NavItem` without its shell (`part: 'NavItem'`); the entry's props,
slots and the runner's overrides are then the part's. A fixture's composed member may be a part
too, by its component's name (`fx('AppShellNavItem', …)` in AppShell's rail).

An entry that holds state is a component of its own, as the application component around a
controlled member is: `holds: { open: true }` gives its first values, `before` renders content
beside the member (Command's launcher Button, `onClick: hold('open', true)`), or first in `many`'s
layout member (Drawer's two launchers in one Stack), `types: { into, text }` types into a field
once the field is in the document, through the field's `input` event, as a reader types (Command's
query), `presses` presses a control once it is in the document, as a reader presses it
(CursorPagination's append form says its list ran out only after it has asked for a window), and
`selects: { in, text }` selects words once their element is in the document and holds them, as a
reader selects them: the element takes focus, and the first run of the words in one of its text
nodes is selected a moment later, once an editor in it has written its own selection back
(RichTextInput draws its selection bar at the selected words). The Svelte foundation's `Held`,
the Angular foundation's `selectOnce` and the elements' mount do the same as the Vue and Solid
fixtures' own statements.

## The Vue renderer

`pnpm shells` (`packages/shells/bin/shells.js`) writes every generated file, and
`pnpm shells --check` writes nothing and fails on a file that is missing, stale, or generated by no
description. The output is deterministic and formatted with the repository's Prettier
configuration. Every generated file says in its header that it is generated.

| File | What it is |
| --- | --- |
| `packages/vue-ui/src/<dir>/<Member>.vue` | the member: a `<script setup lang="ts">` component |
| `packages/vue-ui/src/<dir>/<Member><Part>.vue` | a compound part (`TabsContent.vue`), attached to its member as `Tabs.Content` |
| `packages/vue-ui/src/<dir>/<file>.states.ts` | the states fixture, named as the React fixture is |
| `packages/vue-ui/src/index.ts` | the vocabulary's entry: every member and its types, and the foundation's types the React vocabulary exports (`FOUNDATION_TYPE_EXPORTS` in `common.ts`) |
| `packages/vue-ui/src/galleries.ts` | every states fixture, for the laws |
| `packages/vue/src/icon/Icon.vue` | `Icon`, which ships in the foundation |
| `packages/vue/src/icon/glyphs.ts` | each icon role's drawing, from `design/icons.json` |
| `packages/vue/src/icon/icon.module.css` | `Icon`'s stylesheet, the React foundation's (`packages/react/src/icon/icon.module.css`) under a generated header |

A generated component:

- declares an interface `<Member>Props` from the registry's props, camelCase (a caller writes
  `aria-label`, and Vue reads `ariaLabel`), with the prop's documentation. A type the registry
  prints in full is written back in the shared names: the role union is `IconRole`, the space
  steps are `SpaceStep`, a React event is the DOM event it wraps. A node prop the description
  `carries` is a `VNode` field of the interface too, so a value of the type can hold it;
- calls `defineProps` with its defaults, over the interface without the fields it carries
  (`defineProps<Omit<EmptyStateProps, 'action' | 'secondaryAction'>>()`), because those are its
  slots. A boolean prop without a default is `undefined` when it is absent, as in React, because
  Vue would otherwise read an absent boolean as `false` and an uncontrolled `checked` would become
  controlled;
- calls `defineEmits` with one event per `onFoo` prop, named `foo`, with the React callback's
  parameters, and `defineSlots` with a slot per node prop and a scoped slot per render prop;
- is declared with `inheritAttrs: false`, so it binds no `class`, `style` or attribute it does not
  declare;
- imports its recipe from `@polymorph/recipes/<dir>/<file>.module.css`, the file the React member
  imports, and the members it composes;
- exports the types its description declares, and imports each type it uses from the component
  that declares it. A compound part imports its member's types where its props name them. Every
  type is declared once, so the vocabulary's index exports each from one component, and
  `pnpm shells` refuses a type two descriptions declare;
- binds its machine with `useMachine` and `connect` from `@zag-js/vue`, its machine props computed
  from its props, so an absent controlled prop leaves the machine uncontrolled;
- declares in its script the scope helpers it reads that need the component itself: `slotText`,
  which reads the slot's text nodes, and `invoke`, which reads the caller's handlers from the
  component's vnode, as `useListening` does;
- writes an effect that holds an observer, a timer, a listener or what it did as a function that
  releases what it held before it runs again, and releases it when the member unmounts;
- writes `slotNode(slots.<name>)` as the foundation's `slotNode`, a node whose render runs the
  slot, so the component that draws the node is where Vue tracks what the slot reads; with an
  argument, the render runs the scoped slot with it. `slotDraws` runs the scoped slot with its
  argument and reads whether what it returns holds an element or text, past comments and empty
  fragments;
- reads its slots in script through the foundation's `useTrackedSlots`, because Vue's slots are
  not reactive: a computed value that reads a slot (ToolCall's `hasBody`) is read again when the
  caller fills or empties a slot.

The renderer emits a template that renders the same DOM contract as the React member: the same
elements, roles, ARIA, `data-*` attributes and `data-member`, and the same recipe classes. Where a
machine's own DOM differs from that contract, the description draws the contract's element and
reads the machine's state instead of spreading its props. Zag's checkbox, switch and radio group
make a visually hidden native input the control; the recipes draw the focus ring on the visible box
and the conformance runner finds the box as a button, so Checkbox, Switch and RadioGroup render a
`<button>` with the role and take the value and its transitions from the machine.

Tabs' indicator is Zag's measured rule, which the machine slides with a CSS transition it writes
inline. The recipe's `slide` class gives that transition the motion tokens' surface duration and
standard curve, so a temperament rescales it, `none` makes it a jump, and reduced motion turns it
off. The React member plays the `tabs.indicator` spring through the motion engine instead. A
shell's slide ends where React's does, but it is a timed curve, so it does not carry its speed into
a second change that interrupts it. Playing the spring would take a construct of its own in the
language and a composable in each foundation, and two animators on one element, the machine's
transition and the engine's.

**A server render and hydration.** Every states fixture entry renders on a server and hydrates in
a browser with no mismatch (`packages/vue-ui/server-render.test.ts`). Two things in the renderer
keep that true. A description's effect runs from `onMounted` or from a `watch` that flushes after
the render, and a server runs neither, so an effect that reads the document does not run there.
And a member that draws nothing (Toast) writes a branch that never renders,
`<template v-if="false" />`: an empty template is a comment in a browser's render and no markup at
all in a server's, and the branch is a comment in both. A portal is
`<Teleport to="body">`. A server render returns a teleport's markup apart from the application's,
and Vue hydrates it from the start of the body, so an application places it there
([consuming.md](consuming.md#a-vue-app)).

## The foundation: `@polymorph/vue`

`packages/vue` is the counterpart of `@polymorph/react`, written by hand except for `Icon.vue` and
`glyphs.ts`. It re-exports `@polymorph/engine` whole, so a member imports one package, and adds
what only exists in Vue:

| Export | What it does |
| --- | --- |
| `Glyph`, `Icon` | the icon gateway: `Glyph` draws a role's glyph from `glyphs.ts`, `Icon` is the member |
| `BrandMark` | a third-party mark from the engine's brand data (`BRAND_DRAWINGS`), in the provider's colours, as the React foundation's `BrandMark` draws it; ProviderButton names it as an element |
| `usePresence`, `useKeyedPresence` (`@polymorph/vue/motion`) | keep exiting content mounted while it plays its exit, through the engine's motion engine or the recipe's CSS animation; the keyed one per item of a list. `usePresence` takes the anchored `side` and `align`, the sheet's edge, `appear` and `reflow` (`PresenceOptions`) |
| `useControlRef` | hands a member's native control to the caller's `controlRef` |
| `useMediaQuery`, `MEDIA_QUERIES` | the vocabulary's named media queries (`phone`, the sheet presentation's threshold), followed from mount. A member being hydrated reads `false` until it mounts, as the server did, and one mounted in the browser reads the query at once, as React reads its server snapshot only while it hydrates |
| `useDirection` | the reading direction of the place an element is in (the nearest `dir` around it, passing over the `dir` a machine writes on its own parts, and read from the element's parent when the element is itself a machine's part), followed from mount and read again when a branch draws the element later, which every generated member hands to its machine. The renderer passes the member's first element ref drawn in the page, outside a portal, a loop and, where it can, a condition; a member with none reads the document's (`dir` on `<body>`, or else on `<html>`). A machine given no direction writes `dir="ltr"` on the member's root, which turns the member left to right inside a right-to-left page |
| `useMode` | the document's colour mode preference and the mode it resolves to, followed from mount: the description's `mode`, and what an application's Menu or command reads ([frameworks.md](frameworks.md#the-colour-mode)). A member being hydrated reads `system` and `light` until it mounts, as the server did |
| `useListening`, `useDeparture`, `slotted`, `definedProps`, `slotNode`, `useTrackedSlots` | what the description's `listening`, `departures`, `slotted`, `pass` and `slotNode` render to, and the slots a script reads, which a computed value reads again when a slot is filled or emptied. `listening` is read again the same way when a listener is added or removed; a listener that changes between a function and `undefined` under one key is read at the member's next update, because Vue does not update a member for its declared events' listeners. `slotNode` draws every slot through one component, so a node made again patches what the last one drew |
| `mergeParts` | several of a machine's prop getters on one element, merged as Vue merges props: classes and styles combine, and handlers for one event both run |
| `afterRender` | runs a function once Vue has written its pending changes to the document (`nextTick`): the description's `afterRender` |
| `toast`, `useToasts`, `getToasts`, `subscribeToasts`, `removeToast` | the imperative toast store, with React's API: one per page, the engine's `createToastStore` typed with Vue's nodes; `useToasts` follows its records for a viewport, in a component from mount, so a server render, which neither mounts nor ends a component's scope, holds no subscription |
| `PageTransition`, `PageTransitions`, `usePageTransitionPending` | the page-transition convention (`design/conventions/page-transitions.md`): `PageTransition` is the element a page frame renders its content in (AuthPage's column), replaying an arrival on a new `transitionKey` and holding still while `pending`; `PageTransitions` is the application's provider and ribbon, whose class a page frame hands over from the recipe |
| `ComponentStates`, `StateEntry` | the states fixture's types |

The framework-free helpers every vocabulary uses are the engine's, and reach a Vue member through
the foundation's re-export: `syncTriggerAnchor` and `anchorProps` (an overlay's trigger anchor, as
the React vocabulary's `TriggerAnchor`: the machine's ARIA moves onto the caller's control, and
focus returns to it), `followHighlight`, `returnFocus` and `roveRadio` (the focus and key handling a
machine leaves to its renderer), `revealInline` (the scroll that brings the current tab inside a
Tabs strip wider than its container, and scrolls nothing else), `watchSections` and
`jumpToSection` (the section of a page a TableOfContents marks, and its links' clicks),
`devWarning` (a development
warning for a law a type cannot express, as React's `useDevWarning`), `agentMember`, `agentFill`
and `agentPress` (the agent registry an agent block registers with, and the two helpers its
actions write through, as React's `useAgentMember` registers), `spacingAttrs` and
`LayoutPatch`, `fitTextarea`, `modalFocusTarget`,
`avatarTone` and `initialsOf`, `paginationWindow`, the tooltip delays, `gateFiles` and
`formatBytes`, `relativeTimePhrase`, Countdown's `countdownMoment`, `countdownLeft`,
`countdownClock`, `countdownSpoken` and `followCountdown` (its time and the page's one clock),
`diffLines` and `diffRuns` (Diff's rows and its collapsed
runs), `clockTime`, `spokenDuration` and `pauseOtherPlayers` (AudioPlayer's times and its one
player at a time), `highlightRuns` (Highlight's marked runs), `promptToken` and `promptPick` (PromptInput's trigger token and the text a pick leaves),
Tour's target and placement (`tourTarget`, `tourTargetRect`, `revealTourTarget`,
`tourPlacement`, `tourViewport`), `COLOR_INPUT_REST`, PhoneInput's model (`readPhone`, `commitPhone`, `phoneDraft`,
`phoneCountryOptions`), the segmented field's model
([The segmented field](#the-segmented-field)), the date and time values a field takes and reports
(`Time`, `CalendarDate`, `CalendarDateTime`, which the engine re-exports from
`@internationalized/date`), and, from the engine's `qr`, `charts`, `markdown`,
`rich-text` and `rich-text-editor` subpaths, which the foundations re-export at their roots, the
QR encoder (`qrSymbol`, `qrPath`), the chart engine ([Charts](#charts)), the Markdown parser with
the decisions its tree renders by, and the rich-text document's reader with its editor. The React members import the same
functions through `@polymorph/react`, so a decision such as Pagination's window or Avatar's tone
is written once. An expression names one, and the renderer imports it from `@polymorph/vue`
(`ENGINE_HELPERS` in `types.ts` lists the engine's for every renderer, and `FOUNDATION_HELPERS` in
`vue.ts` adds the Vue foundation's own). A foundation type an expression names, in an assertion or
a parameter's type (`null as RichTextEditorState | null`, `(event: RichTextEditorEvent) => …`),
is imported from the foundation too (`FOUNDATION_TYPES` in `types.ts`). `icon.module.css` in the foundation is generated from the React
foundation's Icon stylesheet: a foundation cannot import a stylesheet from a package it does not
depend on, and `pnpm shells` writes the copy, so the two cannot differ.

## The sheet presentation

Select and Menu under `presentation: 'auto'`, and Popover under `'sheet'`, draw their list or
panel in the shared bottom sheet below `30rem` (`phone`), as the React members do: the sheet
recipe's scrim, positioner and panel (`@polymorph/recipes/overlays/sheet.module.css`), the panel
playing `sheet.panel` from the bottom edge and the scrim `dialog.scrim`, and the member's own sheet
list or body inside. The machine is the same at every width, so the rows, keys and value do not
change; a press on the scrim is outside the list, so the machine closes it. Menu flattens its
submenus into the sheet, a disabled one to its label alone. Popover's sheet is modal through the
machine's modal mode. Dialog's sheet form plays `sheet.panel`.
`packages/vue-ui/src/overlays/sheet.test.ts` crosses the threshold, as the Svelte and Solid shells'
sheet tests do, because the conformance law runs at a desktop width.

## Charts

The chart members (`docs/charts.md`) are described like any other member, with two things
shared across them: the drawing is the engine's, and the frame is described once.

**The drawing is the engine's.** `@polymorph/engine/charts` holds, for each chart member, a
model, a readout and a selection: `barChartModel(input)` is everything the member shows that
follows from its props, the series the reader has hidden and the measured plot (the frame's
state, the summary sentence, the dev warnings, the twin's rows, the axes' ticks, and every
mark's path, paint and hit target); `barChartReadout(input, model, view)` is what shows at a
reading position (the tooltip, the live region's sentence); `barChartSelection(input, model,
at)` is what `onSelect` reports. The React member renders them and so does the description,
so a bar's geometry, a stack's rules and a readout's words are written once. A description's
`derived` values are `input`, `model`, `view` and `readout`, and its template reads them.

**The interaction is the engine's machines.** The frame's state lives in framework-free
machines a member holds: `createReading` (the one reading position, moved by the pointer and by
the keys, followed through `subscribe`), `createBrush` (the range that `onBrushEnd` commits),
`createSyncMember` (the `syncId` registry), `readChartCap` (the palette's series cap),
`measureBox` (the plot's layout box in whole pixels, which a transform does not change) and
`createWarningLog` (which of the model's warnings are new). React's hooks in
`packages/react-ui/src/charts/frame/` bind the same machines. A description holds them in
`state`, follows them from an effect, and calls them from its handlers. A described member
joins its sync group from an effect whose `release` leaves it, so it leaves when it unmounts,
as React's `useSyncGroup` does, and the registry holds only mounted members. It joins with its
plot element as the anchor: a broadcast skips it while the plot is out of the document (a Vue
chart in a deactivated `<KeepAlive>`), and reaches it again when it returns.

**The frame is described once.** `packages/shells/src/chart-frame.ts` returns the nodes React's
frame components render: `chartFrame` (the figure, the plot region, the summary and the live
region), `chartAxis`, `chartLegend`, `chartScaleLegend`, `chartTooltip`, `chartBrush`,
`chartAnnotationWash`, `chartAnnotationInk` and `chartTwin`. They are builders rather than
compound parts, because a part belongs to one member and would be generated once per chart; a
builder's nodes become part of each chart's template. The frame holds one value of its own, the
twin's open state, which the chart holds. `chartState` declares what every chart holds (the
measured `box`, the `reading` machine and the `position` it reports, the `hidden` series, the
twin's `twinOpen`, the `warningLog`), `chartEffects` the effects every chart runs (the plot
measured on mount and on resize, the reading followed, each new warning of the model logged
once), `capEffect` the effect of a chart whose model reads the series cap (ScatterChart,
RadarChart: the cap read from the plot when the marks appear, as React reads it from the plot
surface the empty state does not render), and `FRAME_RECIPES` the frame's recipes, which sit
under `@polymorph/recipes/charts/frame/`. `CHART_HELPERS` names the engine's
chart functions an expression may call, and each renderer adds them to its foundation helpers;
the chart grammar's types are foundation types (`types.ts`), imported from the foundation as
`IconRole` is. LineChart and AreaChart share the brush and the sync group, so four more builders
hold what both describe: `rangeState` (the brush machine, the range it reports, the sync member,
and whether a received reading is being applied), `rangeDerived` (the brush's span and commit,
the sync's send and receive through the engine's `syncValueAt` and `syncIndexOf`, and the key,
pointer, click and blur handlers), `rangeEffects` (the brush followed, the group joined with the
plot as the anchor and left on unmount, each move of the reading sent) and `rangeSurface` (the
plot's focus stop, wired to those handlers).

## The segmented field

TimeInput, DatePicker, DateRangePicker and MonthInput draw the segmented field that React Aria
draws for the React members (`packages/react-ui/src/controls/date-segments.tsx`). A description
draws it from the engine's segment model (`packages/engine/src/dates/segments.ts`), so every shell
orders, steps and fills its segments the same way: `fieldSegments` gives the segments a locale
shows for a draft, in its order and with its separators, and `stepSegment`, `typeIntoSegment` and
`eraseSegment` are the arrows, typed digits and Backspace. `timeFieldValue`, `dateFieldDraft` and
`dateFieldValue` turn a draft into a `Time`, a `CalendarDate` or a `CalendarDateTime` and back,
keeping the parts the field does not show (a supplied value's seconds), and `dateOutOfBounds` says
whether a value is outside `minValue` and `maxValue` or a day the app refuses, compared by day.
`monthDraft`, `monthFieldValue` and `monthOutOfBounds` do the same for MonthInput's `YYYY-MM`
text. React Aria cannot draw a month without its day, so the React MonthInput draws the engine's
model too.

`packages/shells/src/date-field.ts` holds what the four descriptions share, as `chart-frame.ts`
holds the chart frame: `segmentRow` returns the segments as spinbuttons with the locale's separators
as hidden text, `segmentHandlers` the keyboard and text handlers over a draft the member holds,
`SEGMENT_SHARED` a segment's name and the move between segments, and `DATE_FIELD_HELPERS` names
the engine's functions an expression may call. A segment is editable text (`contenteditable`) so a
phone shows its keyboard, and the handlers write every change, so the recipes draw no caret in it.
The segments a reader moves among are every segment of the member's group, so ArrowRight at the
end of a range's start moves into its end.

A field's locale is its `locale` prop, else `en-US` until the member mounts and the browser's
language after (`LANGUAGE` in `date-field.ts`), as React Aria's default locale is. A server render
has no browser, so its markup is in `en-US`, and a hydrated field's first render matches it.
TimeInput and DatePicker make their draft again once mounted, because a 12-hour draft holds a day
period. Calendar reads its locale the same way, and DatePicker and DateRangePicker hand theirs to
their grid.

A field reports a value through `change` once every segment it shows is filled, and on each digit
that changes it after that, and `null` once a filled segment is erased, as React Aria reports. A
value outside the bounds stays in the field and marks it invalid. DatePicker's and DateRangePicker's
popups are Zag's popover machine, anchored to the field: DatePicker's content is the Calendar
member, and DateRangePicker's grid is an internal part on Zag's date-picker machine, inline, in
range mode. The range picker's Escape is two-stage: with a start anchored, the popover's Escape is
held (its `onEscapeKeyDown`) and the grid cancels the span; the next Escape closes. Three things
differ from React Aria. Anchoring a start with Enter moves focus to the next day, as Zag's machine
does. A span drawn across a refused day is not limited to the available run around its anchor. A
range end's segments are named `Start date` and `End date` in English, which React Aria
localizes.

DurationInput's counts are drawn the same way, as editable spinbuttons that move, take digits and
erase as a date field's segments do, but from the engine's duration arithmetic
(`packages/engine/src/conventions/duration.ts`), because a duration's counts carry where a
clock's wrap. The React member draws them by hand over the same functions, so there is no
substrate between them. `durationKey` decides what each key does, `durationSegments` gives the
counts with their unit words and spoken values, and `commitDuration` turns a draft into the
seconds the member reports when focus leaves the field, on Enter, or at once for an arrow.

## Toast

The React vocabulary has no `<Toast>` to render: `toast()` raises a toast, `ToastHost` wraps the
application and mounts the one viewport (`<Toaster />`), `ToastNotice` declares a toast a
screen's state holds, and the registry's Toast props are `toast()`'s options. Every shell keeps
that API: the foundation's `toast()`, and a viewport mounted once, `Toast.Viewport` (React's
`ToastHost`), which draws every toast the store holds. Like `ToastHost`, it belongs outside the
page transitions and outside any error boundary (`design/components/toast.md`). The `Toast`
member takes `toast()`'s options as props and declares a toast in a template, as React's
`ToastNotice` does: while it is mounted its toast is in the viewport, raised again when its `id`
or `title` changes, updated in place while it is showing when anything else does, and removed
when it unmounts. It emits `dismiss` when its toast leaves by dismissal, timeout or eviction, and
not when it unmounts. Its `content` slot reaches the viewport through `slotNode`.

The two keep one lifetime rule, because it is the store's: a toast whose call sets neither
`retained` nor `durationMs` takes its tone's, so a danger or warning toast stays until it is
dismissed or removed and any other tone leaves after the default duration, unless it has an
action, which pins it until it is dismissed. Both warn in
development when nothing draws their toast. `ToastNotice` warns when no `ToastHost` is mounted;
`Toast` warns when no viewport list (`data-toast-part="list"`) is in the document a turn after it
mounts, which it reads from the document, so no foundation counts its viewports. They differ in
their props, which are each one's own: `Toast`'s `tone` defaults to `neutral`, as `toast()`'s
does, where `ToastNotice`'s defaults to `danger`, and `Toast` takes `toast()`'s `action`,
`durationMs`, `retained` and `id`, where `ToastNotice` takes `eventKey`.

The viewport is a labelled region around the list, which F8 focuses from anywhere on the page; each
card enters and leaves with `toast.enter`, times out unless it is pinned or cannot be dismissed,
waits while the reader is on the notifications or the window is in the background
(`holdToastTimers`), and dismisses from its close button, Escape and a swipe to the right. A card
that has played its exit leaves the store. Focus in a card that leaves by any route moves on by
the engine's rule (`focusAfterToast` as the card starts to leave, `followToastFocus` when it
leaves the page without starting to). Two live regions in the viewport, one polite and one
assertive, say a toast as it is raised or updated (`announceToasts`), each announcement as a new
element keyed by its own key. FormField's
`errorPresentation: 'toast'` raises its message through the store, as React's ToastNotice does: a
retained, pinned danger toast titled with the label, with the message as its description, raised
again for a new message and removed when the field is valid again or unmounts.

## Describing a member

1. Read the member's spec, its React source, its React states fixture and its recipe.
2. Write `packages/shells/src/members/<file>.ts`, where `<file>` is the React fixture's base
   name (`pnpm new:member` writes a stub of it for a new member). Render the React member's DOM contract; take behaviour from a Zag machine where one fits.
   Give the fixture an entry for every React entry, with the same name.
3. Run `pnpm shells`, then each shell's laws for the member. `pnpm shells` builds the registry,
   which refuses a `DECIDE` placeholder and a native member whose shell is not generated, so the
   member's entry in each map is `absent`, with a reason, until this step has run.
4. Set the member to `native`, without a reason, in each framework map:
   `design/frameworks/vue.json`, `svelte.json`, `solid.json` and `angular.json`.

A member whose behaviour the language cannot express is not described. Its entry in each map
stays `absent`, and its reason names what is missing.

## The laws

| Law | File | Holds when |
| --- | --- | --- |
| Freshness | `packages/shells/src/shells.test.ts` | every generated file is what `pnpm shells` writes now, and no generated file is orphaned; the output is the same twice; every type is declared in one component |
| Types | `packages/shells/src/shells.test.ts` | each generated vocabulary's index exports every type name `@polymorph/react-ui` exports, those the React vocabulary re-exports from `@polymorph/react` from its own foundation, or names it in `UNEXPORTED_TYPES` (`common.ts`) with the reason, so a screen the emitter writes for any framework imports the types a React screen imports |
| Completeness | `packages/vue-ui/laws.test.ts`, `packages/vue-ui/src/laws.test.ts` | every entry of the React fixture (named by a string, or by a template once per item of a list of literals the fixture declares, as Icon's role sweeps are) and every lawful grid cell has a Vue entry of the same name; every entry mounts, carries the attributes it promises and passes axe; every member's `data-member` renders |
| Spec staleness | `packages/vue-ui/laws.test.ts` | each component's props, as Vue's compiler declares them, its emits and its slots are the registry's props, function props and node props; a compound part's are the props the registry lists under the member by the part's name, and every part the registry lists is described |
| Conformance | `packages/vue-ui/src/conformance.test.ts`, which calls `conformanceLaw` (`@polymorph/conformance/law`) | every contract statement of every described member holds through the Vue adapter, with the runner, locators and harness the React law uses ([conformance.md](conformance.md)), and a false statement of every kind and key and click effect fails through it |
| The framework map | `packages/vue-ui/laws.test.ts` | a member is `native` in `vue.json` exactly when it has a description |
| Token-only | `packages/vue-ui/laws.test.ts` | a component imports only Vue, Zag, the foundation, its recipes and other components, read from its script as TypeScript; every `class` binding reads a recipe; a bound style holds no colour or length; `no-raw-styles` passes over the rest. The foundation's `Icon.vue` is held to it too, importing only Vue, the gateway, its stylesheet and the engine |
| Packaging | `packages/vue-ui/packaging.test.ts` | every import of the shipped source is declared, and the build compiles each recipe beside its member, keeps a `node` copy that imports no stylesheet, and declares every member |
| Server render | `packages/vue-ui/server-render.test.ts` | every states fixture entry renders with `vue/server-renderer` through Vite and Vue's plugin, in Node with no document, with no error and no warning; and the same sources compiled for the browser hydrate that markup in a document (jsdom) with no mismatch, a teleport's markup placed at the start of the body |
| Foundation packaging | `packages/vue/packaging.test.ts` | the foundation's build writes every export target and the stylesheet, imports in plain Node, keeps the engine and Vue external and the presence composables on `./motion`, mirrors its source, and its declarations pass a strict consumer |
| Behaviour | `packages/vue-ui/src/<tier>/<member>.test.ts` | what the contract grammar cannot state: Dialog's focus trap (the axe law's `aria-hidden-focus` exception rests on it), how Dialog's panel fits a window shorter than its content (`dialogFitLaw` in `@polymorph/conformance/dialog-fit`, which every shell's `dialog.test` calls with a mount of its own, and the React member's test too), the sheet presentation, NumberInput's committed numbers, Select's focus, Accordion's close motion, Tooltip's delays, Tabs' strip wider than its container (`tabsOverflowLaw` in `@polymorph/conformance/tabs-overflow`, which every generated shell's `tabs.test` calls with its adapter), where focus goes when the app holds a Pagination or a CursorPagination whose button has focus, and when that hold ends (`pagerHoldLaw` in `@polymorph/conformance/pager-hold`, which every shell's `pagination.test` and `cursor-pagination.test` call with a mount of their own, and the React members' tests too), Carousel's one position across its buttons, dots and scroll, through a zero-width mount and a controlled change, FormPage's submit, a SearchPage's submit, landmark, busy results and the focus its empty state leaves in the field (`searchPageLaw` in `@polymorph/conformance/search-page`, which every shell's `search-page.test` calls with a mount of its own, and the React member's test too), TagInput's and MultiSelect's commit rules, chip focus and chip motion, Command's and Combobox's listbox names, Calendar's day names and month buttons, ToolCall's body, Table's grid keyboard model and DataTable's selection, SplitPane's measured floors and drag, ChatThread's following, how a LogView follows its newest line and what each line says (`logViewLaw` in `@polymorph/conformance/log-view`, which every shell's `log-view.test` calls with a mount of its own, and the React member's test too), ConversationPage's split or drawer by width, MasterDetailPage's two arrangements and where its focus goes when the detail comes or goes or the page crosses its breakpoint (`masterDetailLaw` in `@polymorph/conformance/master-detail`, which every shell's `master-detail-page.test` calls with a mount of its own, and the React member's test too), AuthPage's page transitions, AvatarButton as a Menu's and a Popover's trigger, a component following the foundation's toast store, Toast's viewport, timers, dismissal and F8, where a swiped toast is drawn while a finger drags it and after the finger lets go (`toastSwipeLaw` in `@polymorph/conformance/toast-swipe`, which every generated shell's `toast.test` calls with a mount of its own), where focus goes when a toast that holds it leaves by any route, which Escapes reach a toast, what the notifications say and when their timers wait (`toastFocusLaw` in `@polymorph/conformance/toast-focus`, which every shell's `toast.test` calls with a mount of its own, and the React member's test too), what a Diff says for each kind of change, its rows and where focus is when a collapsed run opens (`diffLaw` in `@polymorph/conformance/diff`, which every shell's `diff.test` calls with a mount of its own, and the React member's test too), which characters a Highlight marks and that its text is read once (`highlightLaw` in `@polymorph/conformance/highlight`, which every shell's `highlight.test` calls with a mount of its own, and the React member's test too), what an AudioPlayer does with a real recording: its press, its end, one player pausing another, a seek and a failure (`audioPlayerLaw` in `@polymorph/conformance/audio-player`, which every shell's `audio-player.test` calls with a mount of its own, and the React member's test too), which handler a RecordButton's press calls, its focus when the app starts recording and its meter (`recordButtonLaw` in `@polymorph/conformance/record-button`, which every shell's `record-button.test` calls with a mount of its own, and the React member's test too), a declared Toast and FormField's toast notice, Tree's keys, its selection, who holds its open branches and where focus is when a level arrives (`treeLaw` in `@polymorph/conformance/tree`, which every shell's `tree.test` calls with a mount of its own, and the React member's test too), what a ModeSwitch's press does to the document's mode and how it follows a mode another caller sets (`modeSwitchLaw` in `@polymorph/conformance/mode-switch`, which every shell's `mode-switch.test` calls with a mount of its own, and the React member's test too), PromptInput's mentions and commands: where a trigger opens its list, the filter, the keys, the pick and the query the app hears (`promptTriggersLaw` in `@polymorph/conformance/prompt-triggers`, which every shell's `prompt-input.test` calls with a mount of its own, and the React member's test too), what RichTextInput draws and reports around its editor: a format from a key and from its control and the words that announce it, the link form, the text style Menu, a suggestion's pick, the selection bar, the handle its slots receive, a submit, focus entering and leaving the field as a whole, a press on its label, a form's reset, a read-only field's caret and a document of a later format left as it was (`richTextInputLaw` in `@polymorph/conformance/rich-text-input`, which every shell's `rich-text-input.test` calls with its adapter, and the React member's test too), the member each node of a RichTextContent's document is drawn as, the app's entity where it draws one, highlights nested as the editor nests them and the selection bar at selected words (`richTextContentLaw` in `@polymorph/conformance/rich-text-content`, which every shell's `rich-text-content.test` calls with its adapter, and the React member's test too), what a Plan's steps read as, which step its status line names and that the line changes only when the front of the run does (`planLaw` in `@polymorph/conformance/plan`, which every shell's `plan.test` calls with a mount of its own, and the React member's test too), where AppShell draws its navigation on top and its drawer below the breakpoint (`appShellTopLaw` in `@polymorph/conformance/app-shell-top`, which every shell's `app-shell.test` calls with its adapter, and the React member's test too), what a PhoneInput reports after typing, a commit, a country chosen and a paste (`phoneInputLaw` in `@polymorph/conformance/phone-input`, which every shell's `phone-input.test` calls with a mount of its own, and the React member's test too), the seconds a DurationInput reports and when, its carry, its refusal and its bounds (`durationInputLaw` in `@polymorph/conformance/duration-input`, which every shell's `duration-input.test` calls with a mount of its own, and the React member's test too), how many comments each of a CommentThread's lists holds, each comment's name, and where a reply and a reply to a reply are drawn in both writing directions and in a narrow box (`commentThreadLaw` in `@polymorph/conformance/comment-thread`, which every shell's `comment-thread.test` calls with its adapter, and the React member's test too), the tone a Meter picks at each threshold, its clamping and what it says (`meterLaw` in `@polymorph/conformance/meter`, which every shell's `meter.test` calls with a mount of its own, and the React member's test too), Progress's bar and ring (`progressRingLaw` in `@polymorph/conformance/progress-ring`, which every shell's `progress.test` calls with a mount of its own, and the React member's test too), what a Countdown draws as its time passes, when it calls `onEnd` and what it announces (`countdownLaw` in `@polymorph/conformance/countdown`, which every shell's `countdown.test` calls with a mount of its own, and the React member's test too), which picture a Lightbox shows after a key or a press, where focus is at its ends and how its picture fits inside the window (`lightboxLaw` in `@polymorph/conformance/lightbox`, which every shell's `lightbox.test` calls with a mount of its own, and the React member's test too), TreeSelect's choices, its empty choice and a level that arrives while its popup is open, with Tree's law on the tree in the popup (`treeSelectLaw` in `@polymorph/conformance/tree-select`, which every shell's `tree-select.test` calls with a mount of its own, and the React member's test too), a Rating's clear rule, the ends of its row, its arrows in a right-to-left document, its posted value and its marks' drawing (`ratingLaw` in `@polymorph/conformance/rating`, which every shell's `rating.test` calls with a mount of its own, and the React member's test too), InlineEdit's opening, saving and cancelling, a save that waits and the row's height in both forms (`inlineEditLaw` in `@polymorph/conformance/inline-edit`, which every shell's `inline-edit.test` calls with a mount of its own, and the React member's test too), a page title edited in place on PageHeader, DetailPage and Dashboard: one `<h1>` named by the saved title in both forms, the controls outside it, the header's height and the actions' place when the field opens, and the markup of a title given alone (`pageTitleLaw` in `@polymorph/conformance/page-title`, which every shell's `page-header.test` calls with a mount of its own, and the React member's test too), which section a TableOfContents marks as its page scrolls and where a click on one of its links puts focus (`tableOfContentsLaw` in `@polymorph/conformance/table-of-contents`, which every shell's `table-of-contents.test` calls with a mount of its own, and the React member's test too), where a DetailPage's aside with `stickyAside` is drawn as the page scrolls and at the width where the page stacks its columns (`detailPageAsideLaw` in `@polymorph/conformance/detail-page-aside`, which every shell's `detail-page.test` calls with its adapter, and the React member's test too), where a Tour's focus goes, what each step says and reports and where its panel is drawn (`tourLaw` in `@polymorph/conformance/tour`, which every shell's `tour.test` calls with a mount of its own, and the React member's test too), Menubar's keys along its row, the hand-off between its menus, its pointer rule and its phone form (`menubarLaw` in `@polymorph/conformance/menubar`, which every shell's `menubar.test` calls with a mount of its own, and the React member's test too), the lines a BarChart draws over its bars (`barLinesLaw` in `@polymorph/conformance/bar-lines`, which every shell's `bar-chart.test` calls with a mount of its own, and the React member's test too), a FunnelChart's bars, the words beside them, its keys, pointer and direction (`funnelChartLaw` in `@polymorph/conformance/funnel-chart`, which every shell's `funnel-chart.test` calls with a mount of its own, and the React member's test too), a Treemap's tiles, label plates, keys, pointer and direction (`treemapLaw` in `@polymorph/conformance/treemap`, called the same way), the segmented fields' typing, stepping and reporting, what a MonthInput reports and how its segments take keys (`monthInputLaw` in `@polymorph/conformance/month-input`, which every shell's `month-input.test` calls with a mount of its own, and the React member's test too), DatePicker's calendar choice and clear, DateRangePicker's range cells, commit and two-stage Escape, and each chart's marks after measurement, keyboard reading and live region, tooltip, legend toggle, twin and `select`, LineChart's and AreaChart's brush and sync group, which a chart leaves when it unmounts, and ScatterChart's cap, read when its marks appear |

```sh
pnpm shells --check                                       # freshness, without the suite
pnpm exec vitest run packages/shells packages/vue-ui      # the node laws and the browser laws
pnpm exec vitest run --project vue                        # the browser laws only
pnpm exec vitest run --project vue src/conformance.test.ts -t "Select"   # one member's contract
```

## The Vue ledger

`packages/vue-ui/src/conformance/ledger.ts` lists the statements the Vue shell deliberately does
not meet, with the same rules as the React ledger. It holds one entry, the one every shell built on
Zag's machines shares (`ZAG_LEDGER` in `@polymorph/conformance`). Tooltip's
`dismiss both when long content` is met for Escape and not for the runner's press outside: Zag
closes a tooltip when the pointer leaves its trigger or focus leaves it, and keeps no outside-press
listener, so the entry's tooltip, opened by `defaultOpen`, stays open after a press elsewhere.

Toast's `announces live:polite when the viewport`, which the React ledger holds, is met: the
viewport's polite live region is inside it ([Toast](#toast)).

## The Svelte renderer

`packages/shells/src/svelte.ts` writes each description as a Svelte 5 component, with runes and
snippets, from the same descriptions and the same registry props as the Vue renderer.
`pnpm shells` writes every target; `pnpm shells --target svelte` writes, or with `--check`
checks, the Svelte files alone. Each framework is a target in `packages/shells/src/generate.ts`
(`TARGETS`): the trees its files live in and the function that renders them.

What every renderer reads the same way is in `packages/shells/src/common.ts`: the registry's entry
for a described member and its compound parts (`registryMember`, `partShell`), where each component
lives and which component declares each type (`locations`, `typeOwners`), the walks over a
description's anatomy (the expressions it holds, the members it composes, the recipe classes it
names), the states fixture's grid entries and subjects, the checks that refuse an effect or a slot
outlet no renderer writes the same way (`checkHolding`, `checkSlots`), a presence's options
(`presenceEntries`), the types each index re-exports from its foundation, and the string helpers
whose output must not differ between frameworks. The engine's helpers an expression may call are
listed once (`ENGINE_HELPERS` in `types.ts`). A renderer holds only what its framework spells its
own way.

| File | What it is |
| --- | --- |
| `packages/svelte-ui/src/<dir>/<Member>.svelte` | the member |
| `packages/svelte-ui/src/<dir>/<Member><Part>.svelte` | a compound part (`TabsContent.svelte`), attached to its member as `Tabs.Content` |
| `packages/svelte-ui/src/<dir>/<file>.states.svelte` | the states fixture, named as the React fixture is |
| `packages/svelte-ui/src/index.ts` | the vocabulary's entry: every member and its types |
| `packages/svelte-ui/src/galleries.ts` | every states fixture, for the laws |
| `packages/svelte/src/icon/Icon.svelte` | `Icon`, which ships in the foundation |
| `packages/svelte/src/icon/glyphs.ts`, `icon.module.css` | the glyph data and the Icon stylesheet, the same files the Vue foundation gets |

A generated component:

- declares, in its module script (`<script module lang="ts">`), the types its description declares
  and an interface `<Member>Props` with every registry prop by its React name: a value prop with its
  type, an `onFoo` prop as a callback with the web's payload, `children` and each node prop as a
  `Snippet`, and a render prop as a `Snippet` with its argument (`Snippet<[Arg]>`). A callback is
  optional, as an event listener is. A static (`controlKind`) is a module export;
- reads its props with `$props()`, under the description's camelCase names (`'aria-label':
  ariaLabel`), with the description's defaults; a function default for a prop that is not a
  function makes the value (`messages`), as Vue's defaults do. It takes no `class` or `style`: a prop
  it does not declare is ignored;
- holds `state` as `$state` and `derived` as `$derived`, takes `uid` from `$props.id()`, and binds
  its machine with `useMachine` from `@zag-js/svelte`, connected with the foundation's
  `normalizeProps`;
- calls the callback prop where a description emits (`emit('dismiss')` is `onDismiss?.()`), and
  returns what it returns where a description invokes;
- runs each effect through the foundation's `watchEffect`: after mount unless `mount` is `false`,
  and when the value `watch` reads changes, as Vue's `watch` runs it;
- renders `joined.start` and `joined.end` around its markup, an empty text node each while it is
  in a slot a parent reads, and its markup between them only while `joined.shown` holds (what a
  slot holds, below);
- writes its markup with no whitespace between two nodes. Svelte keeps one space for whitespace
  between nodes, where React and Vue drop it, so the renderer puts each line break inside a tag
  (`</span\n  ><b>`) or a block tag (`{/if\n  }`), where it is not text.

**A machine's props in a description's spelling.** A description reads a machine's props in one
spelling: a handler is `on` and the DOM event's name with its first letter capitalised
(`onKeydown`), and `style` is an object, so an expression can read one property of it
(`Object(api.getContentProps().style)['--height']`). The foundation's `normalizeProps` gives that
spelling, and `attributes` turns an object in it into Svelte's attributes (`onkeydown`, the style as
text) where an element spreads it. An element that spreads a machine's props and has handlers of its
own spreads them merged (`mergeParts`), so both run, as Vue merges them.

**What a slot holds.** A Svelte slot is a snippet, which no code can look inside, so a member that
reads a slot (`slotted`), hands it props (`pass`) or takes the first of what it holds (`take`)
renders it inside a `SlotOutlet` with a `SlotScope`, and reads the document it renders. The outlet places an empty text node before the slot's output and one
after it. Every member joins the slot it is rendered in (`joinSlot`), with its `controlKind` and the
props a parent reads, hides that slot from the members it renders itself, and places an empty text
node before and after its own output. Between the outlet's two nodes, the scope reads each member
and each element no member rendered, in document order: FormField reads its control's kind and
hands it its id whether the control is a member or an `<input>`, Avatar.Group counts what it holds
and draws the first `max` after a reorder, and Dialog hands its trigger the `onClick` that opens it.
A member in the slot takes what is passed as its own props, and a passed callback runs after its
own. An element takes a handler as a listener and any other value as an attribute; the outlet sets
them once the element is in the document, keeps them while it is in the slot, and restores the
element's own when it leaves; an element past `take` is hidden. A member inside an element of the
slot belongs to the element, which is what the slot holds, as React's `cloneElement` and Vue's slot
read it. Text is not counted.

A member that reads its slot before the slot renders, or in a state that does not render it, probes
it: the scope mounts the slot outside the document as the member is made, so the first render reads
it (FormField lays out its label by its control's kind; ChatThread chooses its empty state by its
turns). An outlet that opens for the same snippet moves the probe's output into place instead of
rendering the slot again, so each member in it is made once; while no outlet is in the document,
the slot is probed again. `slotText` renders the slot into an element outside the document and reads
its text there (`SlotText`), again whenever it changes. `slotNode(slots.<name>)` is the snippet
itself, which `Render` draws wherever the node goes, and `slotNode(slots.<name>, arg)` the snippet
bound to its argument (`bindSnippet`). `slotDraws(slots.<name>, arg)` mounts the bound snippet into
an element outside the document, reads whether it drew an element or text, and unmounts it; a
server render under Vite renders the snippet to a string of its own and reads the string without
its comments (`packages/svelte/src/conventions/probe.ts`).

A server render runs once, from the top down, so a member's script cannot read what its markup has
not rendered yet. Under Vite (`import.meta.env.SSR`), a probe and `slotText` render the slot first
into a string of their own with `svelte/server`'s `render`
(`packages/svelte/src/conventions/server.ts`), and the members in it join the scope there; a client
build drops that branch. A server render reads no document, so an element in a slot is not counted
and is handed nothing until the client mounts it.
Under another bundler a server render does not probe, and the members that read a slot as they are
made are client-only: FormField and ChatThread, and CodeBlock, Markdown and StreamingText, which
read a slot's text, render on the server as if their slots were empty, and so do the members built
on them. Badge reads its slot's text the same way. RichTextContent draws its token for every
entity there, because `slotDraws` reads its `entity` snippet as drawing nothing. No law covers hydration: a probe mounts while
its member is made, and a mount inside a hydration reads the server's markup as its own, so an
application that renders on the server mounts its root on the client rather than hydrating it.
Many members render a Badge, so the rule is about the application's root and not about a list of
members.

**Nodes inside values.** A node inside a structured prop (`EmptyStateProps.action`) is a `Snippet`,
and `render` draws it through the foundation's `Render`. A function that returns a node in a
description's type is a snippet with those parameters (a DataTable column's `cell` is
`Snippet<[Row]>`), and an expression that calls one (`column.cell(row)`) binds the snippet to its
arguments instead (`bindSnippet(column.cell, row)`), which `Render` draws.

**Where Svelte spells a construct differently.** A portal is the foundation's `Portal`, which mounts
its content as a root of its own at the end of the body, with the contexts of the place it is
written. An element's `key` is a `{#key}` block. A handler on `contextmenu.capture` is
`oncontextmenucapture`, and the renderer refuses any other modifier. A handler that is itself a
function (`(next, event) => …`) is the callback. A ref inside a loop collects its elements through
an attachment (`refList`). A recipe's classes are a `class` array, and an element's geometry is a
`style:` directive, which no colour or length may be written in. A value is not named after a
rune the component writes (a derived `state` beside an element ref held in `$state`), because
Svelte reads `$state` as a store of that value, and the renderer refuses one.

**The states fixture** is a component whose module exports `states`: each entry's `render` is a
snippet that takes the props the conformance runner sets and spreads them over its member. A node a
fixture value holds is a snippet declared beside the entries, and an entry that holds values,
types into a field or presses a control renders inside the foundation's `Held`.

## The Svelte foundation: `@polymorph/svelte`

`packages/svelte` is the counterpart of `@polymorph/vue`, written by hand except for `Icon.svelte`,
`glyphs.ts` and `icon.module.css`. It re-exports `@polymorph/engine` whole, and adds what only
exists in Svelte:

| Export | What it does |
| --- | --- |
| `Glyph`, `Icon`, `BrandMark` | the icon gateway, the member, and a third-party mark, as the Vue foundation's |
| `usePresence`, `useKeyedPresence`, `useListPresence` (`@polymorph/svelte/motion`) | keep exiting content mounted while it plays its exit, through the engine's motion engine or the recipe's CSS animation; per item of a list; and a list whose removed items stay while they leave. Each reads `current` |
| `normalizeProps`, `attributes`, `mergeParts`, `chainHandlers` | a machine's props in the description's spelling, written as Svelte's attributes; several merged on one element; a callback a parent hands to a slotted member |
| `joinSlot`, `SlotScope`, `SlotOutlet`, `SlotText` | what a member reads from its slots and hands them, members and elements alike, in document order; on a server render under Vite, through `svelte/server` |
| `Portal`, `Render`, `bindSnippet` | content at the end of the body; a node inside a value |
| `watchEffect`, `refList`, `useDeparture`, `useControlRef`, `useMediaQuery`, `useDirection` | an effect that runs on mount and on a watched change; the elements a loop renders; a departure before a callback; a member's control handed to the caller's `controlRef` (a function, or an object whose `current` it sets); a named media query; the reading direction of the member's place, which a member hands to its machine |
| `afterRender` | runs a function once Svelte has written its pending changes to the document (`tick`) |
| `syncTriggerAnchor`, `anchorProps`, `followHighlight`, `returnFocus`, `roveRadio`, `devWarning` | the engine's, re-exported as the Vue foundation re-exports them: they read the DOM and no framework |
| `toast`, `useToasts`, `getToasts`, `subscribeToasts`, `removeToast` | the imperative toast store, with React's API, typed with Svelte's snippets |
| `PageTransition`, `PageTransitions`, `usePageTransitionPending` | the page-transition convention |
| `ComponentStates`, `StateEntry`, `Overrides`, `Held` | the states fixture's types, and the holder an entry that holds values renders in |

**Publishing.** A Svelte library ships its components as source, because the consumer's Svelte
compiles them for the browser and for a server render, each its own way. So both packages publish
under the `svelte` export condition, with `types` and `default` beside it, and their build
(`packages/svelte/scripts/package.mjs`) writes `dist/` as that source: every component as it is,
each TypeScript module as JavaScript (a rune module as `*.svelte.js`), every relative import fully
specified, and the declarations from `svelte2tsx`. Each member imports its recipe from
`@polymorph/recipes`, which publishes its CSS Modules as source, so the consumer's bundler compiles
a member's stylesheet beside it. There is no `node` copy: Node cannot load a component, and a
server render compiles the package with the application. The server-render law holds each member's
server markup to its first render in the browser, and [the renderer](#the-svelte-renderer) says
what a server render cannot read in a slot.

## The Svelte laws

The Svelte shell is held to the Vue shell's laws, through its own files.

| Law | File | Holds when |
| --- | --- | --- |
| Freshness | `packages/shells/src/shells.test.ts`, `packages/shells/src/svelte.test.ts` | every generated file of every target is what `pnpm shells` writes now; every Svelte type is declared in one component; the renderer reads props and types and writes each construct as above |
| Completeness | `packages/svelte-ui/laws.test.ts`, `packages/svelte-ui/src/laws.test.ts` | every entry of the React fixture and every lawful grid cell has a Svelte entry of the same name; every entry mounts, carries the attributes it promises and passes axe; every member's `data-member` renders |
| Spec staleness | `packages/svelte-ui/laws.test.ts` | each component's props interface declares exactly the registry's props by their React names, and a compound part's the props the registry lists under the member by the part's name; each prop is of the kind `vueBinding` reads it as (an event a function, a render prop a snippet with its argument, a node prop a `Snippet`); every part the registry lists under a member is described |
| Conformance | `packages/svelte-ui/src/conformance.test.ts`, which calls `conformanceLaw` | every contract statement of every described member holds through the Svelte adapter (`src/conformance/svelte.ts`), with the runner, locators and harness the React law uses, and a false statement of every kind and key and click effect fails through it |
| The framework map | `packages/svelte-ui/laws.test.ts` | a member is `native` in `design/frameworks/svelte.json` exactly when it has a description |
| Token-only | `packages/svelte-ui/laws.test.ts` | a component imports only Svelte, Zag, the foundation, its recipes and other components; writes no `style` attribute or block; takes every class from a recipe; holds no colour or length in its markup or a `style:` directive; and its scripts pass `no-raw-styles`. `Icon.svelte` imports only Svelte, the gateway, its stylesheet, the slot convention and the engine |
| No whitespace between nodes | `packages/svelte-ui/laws.test.ts` | no generated component or fixture has whitespace between two nodes, read with Svelte's own parser |
| Packaging | `packages/svelte-ui/packaging.test.ts` | every import of the shipped source is declared and every recipe it names exists; the build ships every member with its declarations and no test tooling; every relative import names a shipped file; every component compiles for the browser and for a server render |
| Foundation packaging | `packages/svelte/packaging.test.ts` | the foundation's build writes every export target, mirrors its source, names only shipped files, compiles every component and rune module for both, keeps the presences on `./motion` and the engine and Svelte external, and its declarations pass a strict consumer |
| Server render | `packages/svelte-ui/server-render.test.ts` | every states fixture entry, rendered with `svelte/server`'s `render` through Vite and Svelte's plugin, has the text and the `data-*` attributes, element by element, of its first render in a mount (the same sources compiled for the browser, in jsdom): an id `$props.id()` makes is compared by where it first appears, and a `<textarea>`'s value, text in markup and a property in the document, is read past |
| Behaviour | `packages/svelte-ui/src/<tier>/<member>.test.ts`, `packages/svelte-ui/src/conventions/*.test.ts` | the Vue shell's behaviour tests, except ToolCall's, Command's and Combobox's, against the Svelte members; and the foundation's conventions: a presence acts only on a change of its value, and a slot is read as the member is made, in document order, with its elements counted and handed what is passed |

`svelte-check` typechecks both packages, markup included, and fails on a warning
(`scripts/typecheck.mjs`). Some of the compiler's accessibility hints are not reported for the
vocabulary (`packages/svelte-ui/svelte.config.js`, each with its reason): they read the markup,
where a member's role often comes from a machine's props spread onto an element, a scrolling
region's tab stop is written only while it scrolls, a pointer handler's keyboard path is
another element's, and a toolbar's tab stop is one of its controls. The axe law and the conformance law check the rendered document instead. Every
other hint fails the check.

```sh
pnpm shells --target svelte --check                          # freshness of the Svelte files
pnpm exec vitest run packages/shells packages/svelte-ui packages/svelte   # the node laws and the browser laws
pnpm exec vitest run --project svelte                        # the browser laws only
```

## The Svelte ledger

`packages/svelte-ui/src/conformance/ledger.ts` holds `ZAG_LEDGER`'s one entry, as the Vue ledger
does, for the same reason: Tooltip's `dismiss both when long content` is met for Escape and not for
the runner's press outside, because Zag keeps no outside-press listener for a tooltip.

Toast's `announces live:polite when the viewport` is met, as in the Vue shell.

## The Solid renderer

`packages/shells/src/solid.ts` writes each description as a Solid 1.9 component in TSX, from the
same descriptions and the same registry props as the other renderers. `pnpm shells --target solid`
writes, or with `--check` checks, the Solid files alone.

| File | What it is |
| --- | --- |
| `packages/solid-ui/src/<dir>/<Member>.tsx` | the member, its file's default export |
| `packages/solid-ui/src/<dir>/<Member><Part>.tsx` | a compound part (`TabsContent.tsx`), attached to its member as `Tabs.Content` |
| `packages/solid-ui/src/<dir>/<file>.states.tsx` | the states fixture, named as the React fixture is |
| `packages/solid-ui/src/index.ts` | the vocabulary's entry: every member and its types |
| `packages/solid-ui/src/galleries.ts` | every states fixture, for the laws |
| `packages/solid/src/icon/Icon.tsx` | `Icon`, which ships in the foundation |
| `packages/solid/src/icon/glyphs.ts`, `icon.module.css` | the glyph data and the Icon stylesheet, the same files the Vue foundation gets |

A generated component:

- declares the types its description declares and an interface `<Member>Props` with every registry
  prop by its React name: a value prop with its type, an `onFoo` prop as a callback of the same
  name with the React callback's parameters, `children` and each node prop as a `JSX.Element`, and
  a render prop as a function that returns one. A React ref (`controlRef`) is a function the member
  calls with its element, and `null` when the element goes. A static (`controlKind`) is a property
  of the component;
- is a function that runs once. It reads its props through `props.<name>` and never destructures
  them, so every read stays reactive. Its defaults are merged under the props with Solid's
  `mergeProps`, typed without `undefined` (`Defaults`), and a function default for a prop that is
  not a function makes the value (`messages`), as Vue's defaults do. It takes no `class` or `style`:
  a prop it does not declare is ignored;
- spells the description's scope as cells, each read as `.value`: a `derived` value is
  `createDerived`, a memo made on its first read; a `state` value is `createCell`, so a
  description's `copied = true` is written as it is; a named element is `elementRef`, set by its
  `ref` and `null` once its element is disposed; and the machine's connected API is a derived
  value. TypeScript narrows a property it has checked (`viewport.value !== null &&
  viewport.value.scrollTop`), which it cannot do for an accessor called twice. A presence, a media
  query and a list presence are accessors, because no expression narrows a boolean or a list;
- binds its machine with the foundation's `useMachine`, its context an accessor asserted to the
  machine's `Props`, so a literal keeps the machine's type (`placement: 'bottom-end'`) and a
  callback its details. It is a copy of `@zag-js/solid` 1.46.0's, on `@zag-js/core` of the same
  version, with one difference: Zag's Solid adapter applies an event a microtask after it is sent,
  and its Vue and React adapters apply it at once, which the descriptions are written against
  (Carousel moves its machine into the state that reads a scroll, then hands it the scroll). So the
  foundation's `send` applies an event before it returns, the member's and the machine's own alike,
  untracked, as the Vue adapter's does; an event sent before the machine starts waits until it
  starts;
- calls the callback prop where a description emits (`emit('dismiss')` is `props.onDismiss?.()`),
  and returns what it returns where a description invokes;
- runs an effect with `onMount`, or with the foundation's `watchEffect` over a memo of the value
  `watch` reads: on mount unless `mount` is `false`, and in a microtask after that value changes,
  once for the changes one task makes, as Vue runs a `watch` with `flush: 'post'`, and not each time
  a value it was read from changes. The microtask lets content a presence opens render first (Select
  moves focus into its list) and lets the handler that made the change finish (MultiSelect's arrow
  key highlights its row before the effect asks whether a row is highlighted). An effect that holds
  an observer, a timer, a document listener (`listen`) or what its `run` made (`release`) releases
  it before it runs again and with `onCleanup`. A statement that is neither a call nor an assignment
  is marked `void`;
- renders through the foundation's `scope` when it renders other members or the caller's content:
  its body runs in a computation of its own, where it sets the contexts its compound parts and the
  members it composes read (`provide`).

**The anatomy as JSX.** A condition is a conditional expression (`{a ? <A /> : null}`), which
Solid's compiler memoizes on the condition as `<Show>` does, and in which TypeScript narrows what
the condition checked. A component's body and a loop's row run once, so an expression one returns (a
condition at a member's root, interpolated text as a row) is kept in a fragment, which the compiler
turns into a memo it reads again. A loop is the foundation's `Each`, keyed by the description's key,
as Vue's `v-for` keys it: Solid's `<For>` keys an item by its identity, and a member often derives
its list afresh, which would replace a row's element, its focus and its exit. The row reads its item
as a value: a plain object or array is passed as a view that reads the latest item of its key, so a
row updates in place and TypeScript narrows the item as a constant, and the index is an accessor. A
view is not the caller's object, so a row hands its item to a call as `itemOf(item)`, the latest
item of its key itself: a callback or a function prop (`onRowClick(row)`, `getRowId(row)`, a
column's `cell(row)`) gets the object the caller put in the list, as in Vue and React. A JavaScript
built-in or a foundation helper (`String(entry)`) reads the view, and a key function is called with
the item itself. A portal is Solid's `<Portal>`, which renders its content in an element it adds to
the end of the body. A tag chosen by a prop is `<Dynamic>`. A handler is the lowercase DOM name
(`onkeydown`), and a handler written as a function (`(next, event) => …`) is the callback. A
`.capture` modifier is written as Solid's `oncapture:<event>` key (`oncapture:contextmenu`). An
element with a description's `key` renders inside the foundation's `Keyed`, which makes it again
when the key changes, as Vue's `key` replaces it.

**A machine's props on an element.** An element that spreads a machine's prop getters spreads them
through the foundation's `mergeParts`, with the element's own attributes, class, style and handlers
as the last source. Keys are compared without case, except the ones Solid reads in camelCase
(`textContent`, `innerHTML`, `innerText`, `classList`) and a namespaced one (`oncapture:click`),
because Zag's Solid normalizer keeps React's casing (`tabIndex`, `onKeyDown`) where a description
writes the DOM's (`tabindex`, `onKeydown`). A later source wins for every key it holds, even when its
value is `undefined`, so a description takes an attribute away from a machine (`hidden: undefined`
while a panel plays its exit, `tabindex: undefined` on ColorInput's thumbs); Solid's `mergeProps`
would keep the machine's value. Handlers for one event both run, the earlier first, and inside one
source a later name for an event replaces an earlier one
(`{ ...api.getInputProps(), onKeydown: own }` replaces the machine's handler), as it replaces it in
Vue.

**What a slot holds.** A Solid node prop is a getter that creates its elements each time it is
read. A member that reads a slot (`slots.footer`, `slotted`, `slotText`), hands its members props
(`pass`), takes the first of them (`take`) or has a fallback reads it once, through
`resolveSlot`, when the slot is first read, and renders what it read; other slots render the prop.
Every member claims the slot it is created in (`claimSlot`), with its `controlKind` and its own
props, and takes the props the slot hands it over its own, a handler after its own handler, as
React's `cloneElement` sets them; its `scope` hides that slot from the members it renders itself.
FormField reads its control's kind and hands it its id, Avatar.Group counts its Avatars and draws
the first `max`, and Dialog hands its trigger the `onClick` that opens it. `slotText` reads the
slot's strings and text nodes, and `slotNode` is the content the slot read, or `undefined` when the
caller put nothing in it. A render prop is a function prop: `slotNode(slots.<name>, arg)` calls it
with its argument outside the caller's tracking (`drawSlot`), and `slotDraws` reads whether it
returned anything other than `undefined`, `null` or `false`. A slot the anatomy reads only inside one branch resolves there, through
the foundation's `ResolvedSlot`, so its content is made each time the branch opens and disposed as
it closes. Plain elements in a slot count beside its members, and take `pass` as attributes and
listeners with their own attributes; an attribute `pass` stops naming goes back to the element's own
value. A member created in one slot claims that slot alone. So a member that reads its own slot and
hands what it read to another member's slot that passes props hands the same props itself:
Dashboard reads its `titleEdit` to ask whether it is filled, and hands the InlineEdit in it the
`valueHidden` its PageHeader hands.

**Presence.** The foundation's presences are Vue's, over the same motion engine, with one timing:
content that opens renders a microtask after its `open` turns true. The foundation's `useMachine`,
as Zag's Solid adapter does, sets a machine's state and only then runs the new state's effects, in
the same call, so content that rendered at once would mount before its machine's effects ran, and a
modal's focus trap would record the content's own field, which a machine inside it focused, as the
place focus returns to on close.

**The states fixture** exports `states`, whose entries render JSX: each `render` takes the props the
conformance runner sets and spreads them over its member last. A callback the member requires and
the entry does not handle does nothing (`onPageChange={() => {}}`), as a React fixture's does. An
entry that holds values holds them in a `createMutable` store (`held.open`), and one that types into
a field types once the field is in the document.

## The Solid foundation: `@polymorph/solid`

`packages/solid` is the counterpart of `@polymorph/vue`, written by hand except for `Icon.tsx`,
`glyphs.ts` and `icon.module.css`. It re-exports `@polymorph/engine` whole, and adds what only
exists in Solid:

| Export | What it does |
| --- | --- |
| `Glyph`, `Icon`, `BrandMark` | the icon gateway, the member, and a third-party mark, as the Vue foundation's |
| `usePresence`, `useKeyedPresence` (`@polymorph/solid/motion`) | keep exiting content mounted while it plays its exit, through the engine's motion engine or the recipe's CSS animation; the keyed one per item of a list |
| `createCell`, `createDerived`, `createKept`, `elementRef`, `elementList`, `useControlRef`, `Defaults` | the cells a member's scope is spelled as: a held value, a derived value, a prop's value that may hold nodes and is read once, a named element, the elements a loop renders, a control handed to the caller's `controlRef`; the type of the props a member gives defaults |
| `Each`, `itemOf`, `Keyed` | the keyed list; the object a row's view of its item reads; content made again when its key changes, for a description's `key` |
| `useMachine`, `watchEffect` | a Zag machine whose `send` applies an event before it returns (a copy of `@zag-js/solid`'s `useMachine`); an effect that runs on mount and a microtask after a watched change, once per task |
| `afterRender` | runs a function in a microtask, by when Solid, which writes the document as a signal changes, has written the changes made before the call |
| `afresh` | creates content outside a hydration, as new elements: a portal's, which no server renders |
| `claimSlot`, `resolveSlot`, `ResolvedSlot`, `scope`, `provide`, `ownerContext`, `IDENTITY` | what a member reads from its slots and hands them, and a slot resolved in the branch that renders it; the computation a member renders in and the contexts it sets there; the context a member hands its compound parts and the identity it lends |
| `mergeParts`, `classes` | a machine's prop getters and an element's own attributes on one element; a class list from recipe classes |
| `useDeparture`, `useMediaQuery`, `MEDIA_QUERIES`, `useDirection` | a departure before a callback; a named media query; the reading direction of the member's place, which a member hands to its machine |
| `syncTriggerAnchor`, `anchorProps`, `followHighlight`, `returnFocus`, `roveRadio`, `devWarning` | the engine's, re-exported: they read the DOM and no framework. `anchorProps` is wrapped to name the focus handlers `onFocusIn` and `onFocusOut`, as Zag's Solid normalizer writes them |
| `toast`, `useToasts`, `getToasts`, `subscribeToasts`, `removeToast` | the imperative toast store, with React's API, typed with Solid's elements; `useToasts` is an accessor |
| `PageTransition`, `PageTransitions`, `usePageTransitionPending` | the page-transition convention |
| `ComponentStates`, `StateEntry` | the states fixture's types |

**Publishing.** Solid compiles JSX differently for a browser and for a server: the browser's build
creates elements, and the server's writes strings. So both packages ship three forms. `dist/source/`
is the source with its types removed and its JSX kept, under the `solid` condition, which Solid's
Vite plugin reads first: the application's compiler writes it for the browser, a server render or
hydration, and its bundler compiles each recipe the source imports from `@polymorph/recipes`.
`dist/` is the browser's build, under the `browser` and `import` conditions: each member imports its
compiled recipe, which imports its stylesheet, and the vocabulary's entry imports the base layer and
the foundation's stylesheet (`@polymorph/solid/style.css`). `dist/server/` is the server's build,
under the `node` condition: it imports no stylesheet, so plain Node loads it and renders a member to
a string. Neither build is hydratable; an application that hydrates compiles the source.

**A server render and hydration.** Every states fixture entry renders on a server, and a browser
hydrates each one into the document a mount draws (`packages/solid-ui/server-render.test.ts`).
Solid names each element a server renders by a key, counted in the order its components are
created. A browser that hydrates finds each element by the same count, and a development build
throws when one is missing. The foundation's `conventions/hydration.ts` and the renderer keep a
member to that count:

- A slot's content and a prop's value are created the first time the member reads them, and a
  server and a browser do not read in the same order: a server evaluates an element's attributes
  before its children, and a browser inserts the children first. So each takes its place in the
  count where the member declares it (`reserveKeys`, in `resolveSlot` and `createKept`).
- A prop whose type holds a node (DescriptionList's `items`, AppShell's `topbar`, ListPage's
  `emptyState`) is a getter that creates the node on every read. The member reads it once, through
  `createKept`, and every place reads that value. The renderer finds these props by their types,
  through the types a description declares and another member's props. It does not read a
  function's type, because a function creates its nodes when the member calls it.
- A description draws a value that is text or a node through two branches
  (`typeof detail === 'string'`), which Vue and Svelte write apart. The Solid renderer writes the
  value once, because the test would read it again, and a value a function returns (DataTable's
  `cell`) would be created for each read.
- A member that is created and not drawn has no markup on the server: Avatar.Group creates every
  Avatar to count them and draws the first few, and ArtifactPane is given every view's content and
  draws one. Such a member leaves the hydration as it is created (`claimKeys`, in `claimSlot`), and
  so does slot content a server rendered none of, so both are new elements.
- No server renders a portal, so a member's portal creates its content outside the hydration
  (`afresh`).
- In markup a textarea's value is its content. A server render writes `value` as an attribute,
  which a browser does not read, and a hydration sets no property. So on a server the renderer
  writes the value as the textarea's content too.

One limit remains. An element a caller wrote that a member creates and does not draw (a plain
element past Avatar.Group's `max`) asks for a server element that is not there, and Solid's
development build throws. Its production build creates the element anew. A member in that place
is not affected.

## The Solid laws

The Solid shell is held to the Vue shell's laws, through its own files.

| Law | File | Holds when |
| --- | --- | --- |
| Freshness | `packages/shells/src/shells.test.ts`, `packages/shells/src/solid.test.ts` | every generated file of every target is what `pnpm shells` writes now; every Solid type is declared in one component; the renderer reads props and types and writes each construct as above |
| Completeness | `packages/solid-ui/laws.test.ts`, `packages/solid-ui/src/laws.test.ts` | every entry of the React fixture and every lawful grid cell has a Solid entry of the same name, and no two entries share a name; every entry mounts, carries the attributes it promises and passes axe; every member's `data-member` renders |
| Spec staleness | `packages/solid-ui/laws.test.ts` | each component's props interface declares exactly the registry's props by their React names, and a compound part's the props the registry lists under the member by the part's name; each prop is of the kind `vueBinding` reads it as (an event or a render prop a function, a node prop a `JSX.Element`); every part the registry lists under a member is described |
| Conformance | `packages/solid-ui/src/conformance.test.ts`, which calls `conformanceLaw` | every contract statement of every described member holds through the Solid adapter (`src/conformance/solid.ts`), with the runner, locators and harness the React law uses, and a false statement of every kind and key and click effect fails through it |
| The framework map | `packages/solid-ui/laws.test.ts` | a member is `native` in `design/frameworks/solid.json` exactly when it has a description |
| Token-only | `packages/solid-ui/laws.test.ts` | a component imports only Solid, Zag, the foundation, its recipes and other components; every `class`, in an attribute or a merged object, reads a recipe and names no class as a string; a `style` holds no colour or length; and the rest of the file passes `no-raw-styles`. `Icon.tsx` imports only Solid, the gateway, its stylesheet, the foundation's conventions and the engine |
| Packaging | `packages/solid-ui/packaging.test.ts` | every import of the shipped source is declared; the browser's build compiles each recipe beside its member and its entry imports the base layer and the foundation's stylesheet; the server's build is compiled to strings, imports no stylesheet, loads in plain Node and renders a member; the source keeps its JSX, names only shipped files and ships no test tooling; every member has its declarations |
| Server render | `packages/solid-ui/server-render.test.ts` | every states fixture entry renders with `renderToString` through Vite and Solid's plugin, in Node with no document, with no error and no warning; and the same sources compiled for the browser, hydratable, hydrate that markup in a document (jsdom) with no error, into the document a mount of the same entry draws; the entries are the states fixtures and those of `server-render.cases.tsx`, which pass an element a caller wrote where a fixture passes a member |
| Foundation packaging | `packages/solid/packaging.test.ts` | the foundation's two builds write every export target, mirror the source and keep the engine and Solid external; the server's loads in plain Node and renders `Icon`; the source keeps its JSX and is fully specified, each relative specifier naming its emitted file; the presences stay on `./motion`; and its declarations pass a strict consumer |
| Behaviour | `packages/solid-ui/src/<tier>/<member>.test.tsx` | the Vue shell's behaviour tests, except ToolCall's, Command's and Combobox's, against the Solid members; and Tabs' panel, which follows the current tab |
| Foundation | `packages/solid-ui/src/conventions/foundation.test.tsx` | `useMachine` has applied an event when `send` returns, holds one sent before it starts and drops one sent after its member is disposed; `watchEffect` runs once for the changes one task makes; `itemOf` gives a row's item back as the caller's object; `Keyed` makes its content again when its key changes and keeps it otherwise; `mergeParts` reads an attribute in either casing as one and keeps the casing Solid reads; `ResolvedSlot` makes a slot's content each time its branch opens and disposes it as the branch closes; a slot's plain elements count beside its members, take `pass` with their own attributes, and get their own attribute back once `pass` stops naming it |

`tsc` typechecks both packages with Solid's JSX types (`jsxImportSource: "solid-js"`), the fixtures
included, and ESLint reads the generated components as it reads any TSX.

```sh
pnpm shells --target solid --check                         # freshness of the Solid files
pnpm exec vitest run packages/shells packages/solid-ui packages/solid   # the node laws and the browser laws
pnpm exec vitest run --project solid                       # the browser laws only
```

## The Solid ledger

`packages/solid-ui/src/conformance/ledger.ts` holds `ZAG_LEDGER`'s one entry, as the Vue ledger
does, for the same reason: Tooltip's `dismiss both when long content` is met for Escape and not for
the runner's press outside, because Zag keeps no outside-press listener for a tooltip.

Toast's `announces live:polite when the viewport` is met, as in the Vue shell.

## The Angular renderer

`packages/shells/src/angular.ts` writes each description as a standalone Angular 22 component with
an inline template and signal inputs, from the same descriptions and the same registry props as the
other renderers. `pnpm shells --target angular` writes, or with `--check` checks, the Angular files
alone.

| File | What it is |
| --- | --- |
| `packages/angular-ui/src/<dir>/<Member>.ts` | the member, the class `<Member>`, selected as `<pm-member>` (`pm-` and its name in kebab case) |
| `packages/angular-ui/src/<dir>/<Member><Part>.ts` | a compound part (`TabsContent`, `<pm-tabs-content>`), a component of its own |
| `packages/angular-ui/src/<dir>/<file>.states.ts` | the states fixture, named as the React fixture is |
| `packages/angular-ui/src/index.ts` | the vocabulary's entry: every member, every public part, and their types |
| `packages/angular-ui/src/galleries.ts` | every states fixture, for the laws |
| `packages/angular/src/icon/Icon.ts` | `Icon`, which ships in the foundation |
| `packages/angular/src/icon/glyphs.ts`, `icon.module.css` | the glyph data and the Icon stylesheet, the same files the Vue foundation gets |

A generated component:

- declares an interface `<Member>Props` with every input by its React name, and a signal input for
  each value prop and each render prop, of the React name (`aria-label` is the input `aria-label`,
  read by the field `ariaLabel`). A required prop is `input.required`. A default is the input's
  first value and its transform, which reads `undefined` as the default, as a React default
  parameter does;
- declares an output for each `onFoo` prop, the field `onFoo` with the public name `foo`, emitting
  the callback's first argument, the one value an Angular output carries;
- takes `children` as its default content and each node prop as a named slot, content the caller
  marks `slot="footer"` (or `ngProjectAs="[slot=footer]"` on an `ng-container`); a render prop is an
  input that takes an `ng-template`, rendered with its argument as the template's `$implicit` and
  each of the argument's named values as a variable of that name (`let-row="row"`, `bindSlot`); a node
  inside a value (`EmptyStateProps.action`) is a `NodeTemplate`, and a function that returns one (a
  DataTable column's `cell`) is a `NodeTemplate` of its parameters (`NodeTemplate<[Row]>`);
  `slotNode(slots.<name>, arg)` binds a render prop's template to its argument (`bindSlot`), and
  `slotDraws` makes a view of the template with the argument outside the page, reads whether its
  root nodes hold an element or text, and destroys it;
- imports the members and parts it composes; two parts that compose each other (RichTextContent's
  blocks and a list item's blocks) import each other through `forwardRef`, because each module
  imports the other and one class is not yet declared when the other's decorator runs;
- makes its context first (`useMember`), which reads its props as its caller and its slot set them
  (`this.$p.label`), emits its events, and holds its slots;
- holds `state` in cells and `derived` values in `computed` cells, each read as `.value`, makes its
  machine, its presences and every value whose first value reads a prop the first time it is read
  (`setup`), because a component's fields are made before its inputs are set, and binds its machine
  with the foundation's `useMachine`;
- runs each effect after a render (`mountEffect`, and `watchEffect` for one that watches, after each
  render that follows a change of the watched value), and releases what it held with the member;
- is declared with `ViewEncapsulation.None`, takes its classes from its recipe, and has a host that
  draws no box (`display: contents`).

**The anatomy as a template over the class.** Angular's template language has no arrow functions,
assignments or spreads, so the template holds no description expression. Each expression is a
method of the class (`e3(tab)`), its loop variables its parameters, and each handler is one
(`h1($event)`). A method repeats the conditions of the branches around it as early returns, so
TypeScript narrows its values as it narrows them in the template of another framework. A loop's
row methods type their item by the list method's return (`Each<ReturnType<Tabs['e5']>>`). A
condition is `@if`, a loop `@for` tracked by the description's key over the row's own item and
index, a tag a prop chooses an `@switch` with one branch per tag the prop's type names, a portal
the foundation's `pmPortal`, and a node inside a value the foundation's `pmRender`. Angular keeps a
space where whitespace touches text, so the renderer puts each line break inside a tag or between
two elements, never beside text. The template is written as Prettier would not, so it carries a
`prettier-ignore`.

**A machine's props on an element.** An Angular template cannot spread an object onto an element,
so an element that takes a machine's prop getters binds one object, the getters and its own
attributes merged (`mergeParts`), to the foundation's `Spread` directive (`[pmSpread]`), which
writes each entry as Vue writes a spread object: a listener, a DOM property where the element has
one and an attribute otherwise, a style property, a class. Any other element binds its attributes
directly: a presence attribute (`disabled`, `hidden`) is written or removed, never `"false"`, and a
form control's `value` and `checked` are its DOM properties.

**The host element.** An Angular component renders inside an element of its own, which React, Vue,
Svelte and Solid do not have. A member's host draws no box, carries no attribute but its
`display: contents` style and its mark, `data-pm-host` (its caller's static attributes set its
inputs and are removed), and
hears no DOM event of an output's name, so `(click)` on `<pm-button>` runs once, for the member's
output. A compound part whose one element must be a direct child of its parent's (a list's item, a
table's section, row or cell, a description list's term or detail) is that element:
`<li pmTagInputChip>`, `<tr pmTableRow>`. The part's element is its host, and its attributes are
the component's host bindings. Its listener for a DOM event an output is named for (Table.Row's
`click`) is not a host binding, because Angular attaches a host listener after `useMember` keeps the
host from hearing that event: the constructor adds it through the context
(`this.$.listen('click', …)`), which keeps the host's own `addEventListener`. A part's element takes
no machine's prop getters, because a host binding cannot spread an object.

A recipe selector with a child, sibling or structural step (Grid's column span over `.grid > *`,
SettingsRow's rule over `.row + .row`) would match the host and not the member inside it. The
Angular members read the recipes through the reach-through transform the elements use
(`packages/elements-ui/reach-through.ts`) with the Angular host's mark, `:where([data-pm-host])`:
the `angular` test project through `reachThroughPlugin(ANGULAR_HOST)`, and the published build
(`packages/angular/scripts/package.mjs`) through `reachThroughCss`. The host law holds every
member's box to the box it has with the hosts removed.

**What a slot holds.** Each slot a member renders or reads is an `ng-template` of its projection at
the top of the template (`<ng-template pmSlot="footer" [pmSlotOf]="$">`), which an outlet renders
where the anatomy puts it (`[pmSlotOutlet]`), so the member renders its content conditionally. The
member reads the slot through a view of that template it never inserts: whether it holds an element
or text, its text, and its members. React's `cloneElement` hands a slotted element props; here every
member claims the member it is created under, and a member counts in a slot only when the slot's
content holds it, so the members a host renders itself are never in its slots. The props a slot
hands (`pass`) are read over the member's own. An outlet that renders a member's slot inside another
member's slot (ConfirmDialog's trigger, inside Dialog's) forwards the claims, so Dialog's `onClick`
reaches the Button ConfirmDialog's caller wrote. The member names itself to its slot templates and
outlets (`$`), because Angular shows a component's view providers to content written inside a
block (`@if`) as well, which would hand that content the wrong member.

**The states fixture** is one component per member that renders the entry its `entry` input names,
by its position (`@switch`), and hands its `overrides` input to the member the entry renders first
through the foundation's `pmOverrides`: a probe name, or a spy in a handler by its React name, which
the member calls in place of the caller's binding. An entry's held values are signals, and a node
inside a value is an `ng-template` the entry declares.

## The Angular foundation: `@polymorph/angular`

`packages/angular` is the counterpart of `@polymorph/vue`, written by hand except for `Icon.ts`,
`glyphs.ts` and `icon.module.css`. It re-exports `@polymorph/engine` whole, and adds what only
exists in Angular:

| Export | What it does |
| --- | --- |
| `useMachine`, `normalizeProps`, `mergeParts`, `Spread` (`[pmSpread]`) | the Zag adapter: a machine whose context and state are signals and whose props follow the member's inputs; a machine's props in the description's spelling; several merged on one element; the directive that writes them onto an element |
| `useMember`, `MemberContext`, `MEMBER_PROVIDERS`, `setup`, `uniqueId` | a member's context (its host, its props, its events, its slots, `listen` for a DOM event its host does not hear, and `afterRender`, which runs a function after Angular's next render through `afterNextRender` and the member's injector), the providers that let the members created under it claim it, a value made once the inputs are set, an instance id |
| `SlotTemplate` (`pmSlot`), `SlotOutlet` (`pmSlotOutlet`), `Render` (`pmRender`), `Portal` (`pmPortal`), `bindTemplate`, `bindSlot`, `isTemplate`, `NodeTemplate`, `Content` | a slot's template and its outlet; a node inside a value, bare, bound to its arguments or bound to a scoped slot's props; content at the end of the body |
| `cell`, `derived`, `measured`, `elementRef`, `elementList`, `Ref` (`pmRef`), `hostRef`, `useControlRef`, `ControlRef` | the cells a member's scope is spelled as; a named element, or the elements a loop renders; a control handed to the caller's `controlRef` (a function, or an object whose `current` it sets) |
| `ownerOf`, `provideOwner`, `lend`, `lentIdentity`, `KEEPS_IDENTITY`, `handBack`, `borrowedHolder`, `lenderHolder`, `KEEPS_HOLDER` | what a member hands its compound parts; the identity it lends the members it renders, and the holder the member lent to hands an element back through |
| `mountEffect`, `watchEffect`, `watchMeasured`, `useDeparture`, `useMediaQuery`, `useDirection` | the description's effects; a departure before a callback; a named media query; the reading direction of the member's place, which a member hands to its machine |
| `usePresence`, `useKeyedPresence`, `useListPresence` (`@polymorph/angular/motion`) | keep exiting content mounted while it plays its exit, through the engine's motion engine or the recipe's CSS animation; per item of a list; a list whose removed items stay while they leave. `usePresence` takes the anchored `side` and `align`, the sheet's edge, `appear` and `reflow` (`PresenceOptions`), as an object, or as a function when they read the member's inputs |
| `Glyph` (`svg[pmGlyph]`), `Icon`, `BrandMark` (`svg[pmBrandMark]`) | the icon gateway, the member, and a third-party mark, each drawn on its `<svg>` |
| `classes`, `presence`, `fieldValue`, `getters` | a class list from recipe classes; a presence attribute; a control's value; an object of getters |
| `devWarning` | a development warning, read from `ngDevMode`, as Angular's own checks read it |
| `toast`, `useToasts`, `getToasts`, `subscribeToasts`, `removeToast` | the imperative toast store, with React's API, typed with Angular's templates |
| `PageTransition` (`pmPageTransition`), `PageTransitions` (`<pm-page-transitions>`), `usePageTransitionPending` | the page-transition convention |
| `ComponentStates`, `StateEntry`, `Overrides` (`pmOverrides`), `typeInto`, `pressOnce`, `Each`, `Emitted` | the states fixture's types and helpers; the type of a loop's row, and of what an output emits |

**The Zag adapter.** Zag ships no Angular binding, so `src/zag/` is one, written the way
`@zag-js/vue` and `@zag-js/svelte` are. Its machine starts after the member's first render, because
its entry effects read the elements it renders, and an event sent before then is applied when it
starts. Once started, an event is applied when it is sent, and `flush` applies a change at once, as
the React, Svelte and Solid adapters' do, so a machine reads a value it set before its next frame.
`src/zag/zag.test.ts` holds it to three machines (checkbox, dialog, menu) in a browser, and to
the dialog's cleanups when a member is destroyed with it open.

**Publishing.** An Angular library ships the Angular package format's partial declarations, which
the application's Angular CLI links to the Angular it runs. Both packages are built by
`packages/angular/scripts/package.mjs`: `ngc` in partial mode, with declarations, then one flat ES
module per entry point, as the package format ships one (`dist/fesm2022/polymorph-angular-ui.mjs`,
and `polymorph-angular.mjs` and `polymorph-angular-motion.mjs` for the foundation), every package
import external. A build that links only the package format's flat modules, as Analog's Vite plugin
does (a path that holds `fesm20…`), links these, and the Angular CLI links any. The CLI compiles no
stylesheet a module imports, so the build compiles each recipe a member imports, and the recipes it
composes from, into the member's component `styles`, which Angular adds to the page once, when a
member that uses them first renders. The base layer ships as `base.css`. No module imports a
stylesheet, so plain Node loads every one.

**A server render and hydration.** Every states fixture entry renders with
`@angular/platform-server` and hydrates in a browser's application, which keeps the server's
elements (`packages/angular-ui/server-render.test.ts`). A server has no `window`, and the law fails
an entry that reads `window` or asks for a frame while a server renders it. A fixture's helper
that types or presses (`typeInto`, `pressOnce`) asks for its frames inside `afterNextRender`, which
a server does not run.

## The Angular laws

The Angular shell is held to the Vue shell's laws, through its own files.

| Law | File | Holds when |
| --- | --- | --- |
| Freshness | `packages/shells/src/shells.test.ts`, `packages/shells/src/angular.test.ts` | every generated file of every target is what `pnpm shells` writes now; every Angular type is declared in one component; the renderer reads the interface and writes each construct as above |
| Completeness | `packages/angular-ui/laws.test.ts`, `packages/angular-ui/src/laws.test.ts` | every entry of the React fixture and every lawful grid cell has an Angular entry of the same name; every entry mounts, carries the attributes it promises and passes axe; every member's `data-member` renders |
| Spec staleness | `packages/angular-ui/laws.test.ts` | each component's inputs, outputs and slots are the registry's props, event props and node props by the mapping above, and its props interface names its inputs; a compound part's are the props the registry lists under the member by the part's name |
| Conformance | `packages/angular-ui/src/conformance.test.ts` | every contract statement of every described member holds through the Angular adapter (`src/conformance/angular.ts`), with the runner, locators and harness the React law uses, and a false statement of every kind and key and click effect fails through it |
| The framework map | `packages/angular-ui/laws.test.ts` | a member is `native` in `design/frameworks/angular.json` exactly when it has a description |
| Token-only | `packages/angular-ui/laws.test.ts` | a component imports only Angular's core, Zag, the foundation, its recipes and other components; its template writes no `class` or `style` of its own; every class it binds, in its template, its host or a merged object, is read from a recipe and names no class as a string; a style it binds holds no colour or length; and the file passes `no-raw-styles`. `Icon.ts` imports only Angular's core, the gateway, its stylesheet, the foundation's conventions and the engine |
| Hosts | `packages/angular-ui/src/hosts/*.test.ts`, through `src/conformance/hosts.ts` | every entry of every states fixture draws each `[data-member]` element at the size it has in a copy of the mount with each host that draws no box replaced by its children, portals included |
| Packaging | `packages/angular-ui/packaging.test.ts` | the package is one flat module under `fesm2022/`; every member and part ships with its declarations, as a partial declaration, and carries its recipe's rules; no module imports a stylesheet, and the base layer ships; no test tooling ships; every relative import names a shipped file; every package the build imports is declared; the source entry that imports the base layer is declared in `sideEffects`, and the published `sideEffects` names only files that exist |
| Server render | `packages/angular-ui/server-render.test.ts` | every states fixture entry, compiled ahead of time and rendered by `@angular/platform-server` in Node, becomes stable with no error and no warning; and a browser's application (jsdom) hydrates that markup with no error and keeps the server's elements |
| Foundation packaging | `packages/angular/packaging.test.ts` | every export target exists; each entry point is one flat module and every module keeps its declarations; every component is a partial declaration; the Icon's rules are in its component; the engine and Angular stay external and are declared; the presences stay on `./motion` |
| Adapter | `packages/angular/src/zag/zag.test.ts` | a checkbox, a dialog and a menu run through the adapter in a browser: a controlled and an uncontrolled value, focus moved into a modal panel and returned to its trigger, a dialog destroyed while open that shows the page's other elements again, unlocks its scroll and keeps no focus trap, keyboard navigation and a selection |
| Behaviour | `packages/angular-ui/src/<tier>/<member>.test.ts` | Dialog's focus trap, which the axe law's `aria-hidden-focus` exception rests on, and its trigger's focus on close; a `Table.Row`'s click, once per click and only while it is interactive, and a DataTable row's, with the row and never from its checkbox; a controlled MultiSelect's text, put back after the caller's value renders, with the caret where the reader typed; AvatarButton as a Menu's and a Popover's trigger, carrying the overlay's ARIA and taking focus back; Tabs' strip wider than its container, through `tabsOverflowLaw`; and where focus goes when the app holds a pager whose button has focus, and when that hold ends, through `pagerHoldLaw`; and where a swiped toast is drawn while it is dragged and after it is let go, through `toastSwipeLaw`; and what a Diff says, its rows and where focus is when a collapsed run opens, through `diffLaw`; and what a ModeSwitch's press does to the document's mode, through `modeSwitchLaw`; and which characters a Highlight marks, through `highlightLaw`; and where AppShell draws its navigation on top, through `appShellTopLaw`; and what an AudioPlayer does with a real recording, through `audioPlayerLaw`; and what a RecordButton reports and draws, through `recordButtonLaw`; and what a PhoneInput reports, through `phoneInputLaw`; and the seconds a DurationInput reports and when, through `durationInputLaw`; and a CommentThread's lists, names and levels, through `commentThreadLaw`; and the tone a Meter picks at each threshold, its clamping and what it says, through `meterLaw`; and Progress's bar and ring, through `progressRingLaw`; and a Rating's presses, keys, posted value and drawing, through `ratingLaw`; and which section a TableOfContents marks and where a click puts focus, through `tableOfContentsLaw`; and where a DetailPage's aside that stays in view is drawn, through `detailPageAsideLaw`; and Menubar's row, the hand-off between its menus, its pointer rule and its phone form, through `menubarLaw`; and what a FunnelChart and a Treemap draw and say, through `funnelChartLaw` and `treemapLaw`; and a SearchPage's submit, landmark, busy results and focus, through `searchPageLaw` |

`ngc` typechecks both packages, templates included, with the TypeScript 6.0 they install, which
Angular's compiler requires (`scripts/typecheck.mjs`). The browser project compiles the members
ahead of time with the same compiler (`packages/angular-ui/vitest.plugins.ts`).

```sh
pnpm shells --target angular --check                       # freshness of the Angular files
pnpm exec vitest run packages/shells packages/angular-ui packages/angular   # the node laws and the browser laws
pnpm exec vitest run --project angular                     # the browser laws only
```

## The Angular ledger

`packages/angular-ui/src/conformance/ledger.ts` holds `ZAG_LEDGER`'s one entry, as the Vue ledger
does, for the same reason: Tooltip's `dismiss both when long content` is met for Escape and not for
the runner's press outside, because Zag keeps no outside-press listener for a tooltip.

One behaviour has no contract statement for the ledger to hold. ConfirmDialog keeps its panel open
and pending while an `onConfirm` handler's promise runs, in React. An Angular output returns nothing
to the member that emits it, so a caller's `(confirm)` binding cannot hand a promise back, and the
Angular ConfirmDialog closes when it is confirmed. A caller that saves first holds `open` itself.

An output carries one value, so RichTextInput's `(submit)` emits the document and not the handle
React's `onSubmit` takes second. The handle reaches the caller through the `toolbar`,
`selectionActions` and `footer` templates, and a caller that clears the field after a save sets
`value`.

## The elements renderer

`packages/shells/src/elements.ts` writes each member the elements map marks native
(`design/frameworks/elements.json`) as a custom element over its generated Solid member. The
elements are a distribution of the Solid rendering, not a rendering of their own: the renderer
writes definitions and fixtures, and no anatomy. A definition says how the element reads its
attributes into the member's props, which events it dispatches and which slots its children fill;
the Solid member draws everything. So a description reaches the elements through the Solid member
at the next `pnpm shells`, and an elements law that fails names a difference at the boundary
between the page's markup and the member. `pnpm shells --target elements` writes, or with
`--check` checks, the elements files alone.

| File | What it is |
| --- | --- |
| `packages/elements-ui/src/<dir>/<Member>.ts` | the member's definition (`tag`, `member`, `props` with their codecs, `events`, `slots`, `controlled`, `overlays`), its element class `Poly<Member>`, defined over the Solid member (with the temporal codecs, for a member with a date or a time prop), and the element's type in `HTMLElementTagNameMap` |
| `packages/elements-ui/src/<dir>/<Member><Part>.ts` | a public part's definition and element (`TabsContent.ts`, `<poly-tabs-content>`) |
| `packages/elements-ui/src/<dir>/<file>.states.ts` | the states fixture in element form: each entry is the markup a page writes (`html`), the element it is about (`subject`), and what a script sets once the elements are defined (`setup`), named as the React fixture's entries are |
| `packages/elements-ui/src/index.ts` | the vocabulary's entry: importing it defines every element; it exports each element class and every member's prop types, which are the Solid members' |
| `packages/elements-ui/src/galleries.ts` | every states fixture, for the laws |
| `packages/elements-ui/src/definitions.ts` | every definition by tag, in a table that imports no member |
| `packages/elements-ui/src/loaders.ts` | every tag's module, as a function that loads it, for a page that defines every tag at once and loads a member's code when one of its elements first renders |
| `packages/elements/src/icon/Icon.ts` | `<poly-icon>`, which ships in the foundation |
| `packages/elements/src/pending.css` | the rules for an element that has not rendered its member: each overlay slot's content hidden (from the slots the template renders inside a `portal`), and each structural part laid out as the element that replaces it, its member as a table or a block |

A definition module imports its Solid member by the member's own module
(`import Button from '@polymorph/solid-ui/controls/Button'`), which the Solid vocabulary exports for
every tier. The vocabulary's index attaches every compound's parts to its root, so an element
loaded through it would bring every compound member into the chunks of a page that uses one.

What a prop is comes from the registry through `vueBinding`, as for every shell. A value prop is
an attribute and a property, read through the codec its type takes (`@polymorph/elements/codecs`):
`string`, `number`, `boolean`, `json`, a union of literals with the kinds it allows, or a temporal
codec (`time`, `date`, `range`) that reads ISO 8601 text as the engine's value. The temporal codecs
are a module of their own (`@polymorph/elements/temporal`), which the definition module of each
member with a date or a time prop imports and gives `define`, so the date library loads only with
such a member and not with the bridge every element shares. An `onFoo` prop is
the event `poly-foo`, and an event the description reads `listening` for is marked `listened`, so
the element hands the member its callback only while the page listens. A node prop is a slot. A
render prop, a function and a ref are properties with no attribute (the codec `property`). A value
prop `x` with `onXChange`, or `value` with `onChange`, is a controlled pair, and the element sets
`x` after its change event unless a listener cancels the event. A controlled prop the page never
set leaves the member uncontrolled, as an absent prop leaves a React member: InlineEdit closes
itself after a commit only while `editing` is uncontrolled. The property then reads the value the
member last reported. Data whose type holds a function, such as a messages catalogue with plural
functions, is a property only; a catalogue whose formatters are all optional keeps its JSON
attribute. A JSON item that leaves out a callback its type requires (a Menu item's `onSelect`) is
completed with one that dispatches `poly-select` on the element, with `detail` `{ item, index }`
and `value` where the member passes one; the renderer refuses an item callback whose event a member
event also dispatches. A node field of an object prop is a dotted slot (`slot="topbar.leading"`).
A prop named as a method every element inherits (`HTMLElement`'s prototype chain in
`lib.dom.d.ts`: Diff's `before` and `after`) has no property, so the method keeps working, and the
element's type leaves it out; the renderer refuses one that is set from script only, and the
fixture writes its `null` as no attribute. The fixture writes an attribute only where the
element's own codec reads its text back as the fixture's value, and sets every other value in
`setup`.

Members compose members as Solid components, so a member's anatomy holds no element: an element
exists only where the page wrote one. Eight public parts are structural (`Table.Head`, `Body`,
`Foot`, `Row`, `Header`, `Cell`, `List.Item`, `CommentThread.Comment`), from the list Angular's
attribute parts are read from (`STRUCTURAL_TAGS` in `packages/shells/src/common.ts`). Their member
renders the part's root (`<tr>`) in the element's place, because an element between a `<tbody>`
and a `<tr>` drops the row out of `table.rows`, and one between a `<ul>` and an `<li>` fails axe's
list rules.

The recipes reach through a host. A page-written element sits between a recipe's parent and its
child, or between two siblings, and draws no box, so a selector with a child, sibling or
structural step (`.grid > *`, `.row + .row`, `.item:first-child`) would not match through it.
`packages/elements-ui/reach-through.ts` adds to each such selector the forms that also match
through one host (`.grid > :where(:state(poly-host)) > *`), and the form in which one host holds a
run of siblings after a child step (`.item > :where(:state(poly-host)) > * + *`), at the
specificity of the selector it comes from; the added forms match only where a host is, so a
member's own anatomy reads the recipe unchanged. The `elements` test project and every build of the elements apply it as a Vite plugin
(`reachThroughPlugin`); the shared recipes are not changed. It reaches through one host, not two
nested ones; a compound with an `-of-type` pseudo-class gets no added form, because a host's tag
is not its member's; and a `:not()` whose argument has a combinator is left as it is.

## The elements foundation: `@polymorph/elements`

`packages/elements` is written by hand except for `src/icon/Icon.ts`. It holds what every element
shares, and re-exports the engine whole, as every foundation does, with the toast store and the
types the React vocabulary exports beside its members.

| Export | What it does |
| --- | --- |
| `PolyElement`, `define` | the element base class, and the function that turns a definition and a Solid member into a custom element, with the temporal codecs for a member with a date or a time prop; defining a tag already defined returns the element that holds it |
| `defineLazy` | defines a tag before its member's code is loaded, with the function that loads the module that calls `define` for it |
| `inheritedMethod` | whether a name is a method every element inherits, which a prop's property would hide |
| `restore` | disposes every member rendered on its own in a tree and puts back the children the page wrote, so a page snapshot saves the page's markup |
| `fillSlot` | sets the nodes one slot of an element holds, in order, from script, in place of what the page wrote there, before or after the member renders, on any element, a structural part included; the run-time renderer places every child this way |
| `PolymorphEvent` | the event an element dispatches: a `CustomEvent` with `waitUntil(promise)`, whose promises the member's callback returns, settled together, and `args`, every argument the member passed its callback (`detail` is the first) |
| `ERROR_EVENT` | `poly-error`, the event an element dispatches when its member throws |
| `decode`, `encode`, `coerce`, `Unreadable` | an attribute's text as a prop's value and back, and a property's value as the member takes it |
| `tagOf`, `attributeOf`, `propertyOf`, `eventOf`, `slotOf`, `PREFIX` | the names: `poly-` and the kebab name of a member, a part and an event; a prop's attribute and property; a slot's attribute |
| `PolyIcon` | `<poly-icon>` |
| `listen`, `holding`, `create`, `assign` | what a states fixture's `setup` and the tests use: a listener for a member's event, a value an entry holds, an element made with props, and a prop set as a page's script sets it (through its attribute when it has no property) |
| `toast`, `getToasts`, `subscribeToasts`, `removeToast` | the imperative toast store, the Solid foundation's |
| `@polymorph/elements/loader` | `defineAll(definitions, loaders)`, `restore` and `toast`: what a page that defines every tag at once loads first; it defines no element itself |
| `@polymorph/elements/temporal` | `temporal`, the temporal codecs (`time`, `date`, `range`), which import the engine's dates; a member's definition module gives them to `define` |
| `@polymorph/elements/host.css` | the host rule: `:state(poly-host):not([hidden]) { display: contents }` |
| `@polymorph/elements/pending.css` | the rules for an element that has not rendered (generated) |

The index imports the base layer (`@polymorph/recipes/base.css`), `host.css` and `pending.css`,
so every element brings them before its member's recipe.

The base class does what makes a page's markup a member:

- **Host.** The element stays in the page, because its listeners, a swap's target, `closest()`
  and the attributes the server sends again depend on it, and it draws no box. It is marked with
  the custom state `poly-host` and not an attribute, because a morphing swap removes the
  attributes the server did not send. The state is added when the member renders and removed when
  it is disposed, so a defined element whose member's code is still loading matches the rules
  for an element that has not rendered. The rule is a stylesheet rule and not an inline style, so
  `[hidden]` still hides the element. `id`, `title`, `role` and `aria-*` props are read into props
  and taken off the element.
- **Code loaded later.** `defineLazy` defines a tag with its definition and no member. The queue
  loads the member's code of an element and of every element inside it, a `<template>`'s content
  included, before it renders any of them, so the outer element still adopts the inner ones. An
  element added to a slot later, whose code nothing loaded, renders there when its code arrives.
  A load that fails is reported, and its element keeps the page's markup. A date or a time the
  page sets before the code has loaded, by its attribute or by its property as ISO text, is kept
  as text, because the temporal codecs come with the code. It is read when the code is there,
  before the member renders, and its property reads `undefined` until then; text the codec cannot
  read is reported then, as it is when the code is already there.
- **Children.** When the member first renders, the element's children are taken out and grouped
  by `slot`; a `<template slot="x">` gives its content without a wrapper, and whitespace that holds
  a line break is dropped, as JSX drops it. A slot hands the member text as strings, plain nodes
  as they are, and each `poly-*` element in it rendered inside the slot as the slot reads it, so a
  FormField reads a hosted Checkbox's kind and hands a hosted Input its id. The Solid foundation's
  `hostMember` records a host as the member rendered into it, which its `hold` reads.
- **Order.** A connected element only schedules its render. A microtask later the queue renders
  the scheduled elements in document order, so an element renders before the elements inside it,
  whatever order their tags were defined in. While the document is loading the queue waits for
  `DOMContentLoaded`, because a classic script sees an element before its children are parsed.
- **Change.** The element observes its own children: a node added before or after the member's
  rendering joins its slot, and a swap of every child renders the member again. A slot read again
  because what it holds changed keeps the rendering of each `poly-*` element it still holds, so a
  field among them keeps its text and its focus, and a slot that holds one element is read as a
  list of one. An element that leaves a slot is disposed at once after a change the element makes
  itself, and a microtask later when its member stops reading the slot by itself. Two empty comments
  mark the member's rendering inside the element, so a node outside them is the page's. The
  member draws a slot's nodes inside its own elements, so the page takes a child out of its slot
  through the element: `removeChild` takes it, and the nodes a `<template>` gave, out of the slot
  and the document, and the child keeps its `slot` attribute, so adding it again puts it back in
  the same slot. A node the page removes from where the member drew it stays in its slot.
- **Listening.** A member that reads whether its caller handles an event is told so while a
  listener for it was added through the element's `addEventListener`, or while the `listens`
  attribute names it.
- **Errors.** A member that throws as it first renders renders nothing, and the members around
  it render. One that throws as it updates keeps what it had rendered. Either way the element
  dispatches `poly-error` with the error as `detail`, and, unless a listener cancels it, reports
  the error with `reportError`, as an uncaught error is reported.
- **`PolyElement.observe`** reports each element's member as it renders and as it is disposed.

There is no `ElementInternals` form association: each member's own `<input>` or hidden input
posts, and a value set with `setFormValue` would post a second one. Rendering is client-only: no
member is rendered on a server.

## The elements laws

The elements are held to the laws every generated vocabulary keeps, through their own files, and
to one of their own, the parity law.

| Law | File | Holds when |
| --- | --- | --- |
| Freshness | `packages/shells/src/shells.test.ts`, `packages/shells/src/elements.test.ts` | every generated file of every target is what `pnpm shells` writes now; the renderer reads props and writes each codec, event, slot and fixture form as above |
| Types | `packages/shells/src/shells.test.ts` | the vocabulary's entry exports every type `@polymorph/react-ui` exports, as every vocabulary's does |
| Completeness | `packages/elements-ui/laws.test.ts`, `packages/elements-ui/src/laws.test.ts` | every entry of the React fixture and every lawful grid cell has an element entry of the same name; every entry mounts as markup, carries the attributes it promises and passes axe; every member's `data-member` renders |
| Spec staleness | `packages/elements-ui/laws.test.ts` | each definition reads the registry's props, each as the kind `vueBinding` reads it as; a prop the registry lists under a public part is the part's element's |
| The framework map | `packages/elements-ui/laws.test.ts` | a member is `native` in `design/frameworks/elements.json` exactly when it has a description, and every native member and public part has a definition module |
| Imports | `packages/elements-ui/laws.test.ts` | a definition module imports only `@polymorph/elements` and its own Solid member's module (`@polymorph/solid-ui/controls/Button`), so the elements' design values are the Solid members', which the Solid shell's token law holds, and an element loads its member and what that composes |
| Parity | `packages/elements-ui/src/parity/` (`law.ts`, run by `a-c`, `d-l`, `m-r` and `s-z.test.ts`; `detects.test.ts` holds it to a known difference) | every states fixture entry renders the same document as an element and as the Solid member: with each element replaced by its children, the same tags, classes, ids, `for`, roles, `aria-*` and `data-*` attributes and text, instance ids compared by where they first appear, and every `[data-member]` box the same size, read once no finite animation runs and, for an entry that selects words, once they are selected |
| Behaviour | `packages/elements-ui/src/<tier>/<member>.test.ts`, `packages/elements-ui/src/direction.test.ts` | the behaviour laws `@polymorph/conformance` holds every renderer to (Tabs' overflow, a toast's swipe, Diff, the mode switch, Tree, Tour, the charts, SearchPage, MasterDetailPage, the reading direction and the others), through the elements mount or adapter, where a value the law holds is the page's: the page sets it through the element, adds a slot's child to the element and takes one out through it (`removeChild`) |
| The reach-through | `packages/elements-ui/reach-through.test.ts` | each recipe selector with a child, sibling or structural step also matches through one host, at the specificity of the selector it comes from |
| Packaging | `packages/elements/packaging.test.ts`, `packages/elements-ui/packaging.test.ts` | each published entry exists in the build; the foundation's index brings the base layer, Icon's, the host and pending stylesheets, and its loader brings no element; the bundler build compiles only the Solid members and their recipes, and imports only what the manifest declares; the no-build files are the ones `polymorph init` copies, `polymorph.js` defines every tag with a chunk of its own and loads none itself, a Button page loads no other member than Button composes, `polymorph-all.js` imports nothing, both export `restore` and `toast`, and `polymorph.css` holds the base layer, every recipe through the reach-through, Icon's, the host rule and the pending rules |
| The static-page check | `scripts/gate-no-build.mjs` | a page served as plain files loads the no-build files on Chromium, Firefox and WebKit ([verification.md](verification.md#the-static-page-check)) |
| Conformance | `packages/elements-ui/src/conformance.test.ts` | every contract statement of every member the elements ship holds through the elements adapter (`src/conformance/elements.ts`), which mounts an entry's markup, with the runner, locators and harness the React law uses, and a false statement fails through it |
| The bridge | `packages/elements-ui/src/bridge/*.test.ts` | the base class's capture, adoption and ordering, both `define` orders, a classic and a module script, tags defined before their code (`lazy.test.ts`), a date or a time set before and after its code (`temporal.test.ts`), props named as inherited methods (`methods.test.ts`), the attribute codecs, controlled props, listening, `waitUntil`, structural parts, child-list changes, a child taken out through the element and Dialog's focus |

`tsc` typechecks the foundation and the vocabulary, and ESLint reads them as it reads any
TypeScript.

```sh
pnpm shells --target elements --check                      # freshness of the elements files
pnpm exec vitest run --project logic packages/shells packages/elements packages/elements-ui   # the node laws, the builds included
pnpm exec vitest run --project elements                    # the browser laws and the bridge
pnpm gate:no-build                                         # the no-build files on a static page, three engines
```

## The elements ledger

`packages/elements-ui/src/conformance/ledger.ts` is `ZAG_LEDGER`, filtered to the members the
elements ship: the elements render the Solid members, so their divergences are the Solid shell's.
The law fails a ledger entry whose member the elements do not ship, so Tooltip's entry is there
exactly when Tooltip's element is.

The elements keep what Angular's outputs cannot: a member's callback returns what its listeners
hand `event.waitUntil`, so a ConfirmDialog stays pending while the page saves, as in React. An
event's `detail` is the callback's first argument, so RichTextInput's `poly-submit` carries the
document, and the handle reaches the page through the `toolbar`, `selectionActions` and `footer`
functions it sets.
