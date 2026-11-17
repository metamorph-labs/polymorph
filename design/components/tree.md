# Tree

A Tree shows a hierarchy of items of one kind, such as organization units, folders or
categories. A reader opens it level by level and picks one item. The application loads a level
when it is first opened, and loads more of a long level when the reader asks.

It is not JsonTree, which shows one JSON value and selects nothing. It is not List or
SectionNav, which are flat: a hierarchy drawn as one level at a time, with a control to go
down and a control to go back, hides where an item sits. It is not Menu, whose items are
commands behind a trigger. There is no substrate: nested lists, the tree roles and a keyboard
model small enough to own.

A Tree picks one item, and the controls that act on it sit beside the tree. So a Tree has no
multiple selection and no checkboxes, no drag and drop and no move, no rename in place, and no
actions or other trailing content on a row. It has no type-ahead, and it draws every row it is
given: a level is as long as the application loads it, so the application bounds a level with
`hasMore`, and nothing is windowed.

## Anatomy

```
[root — <ul role="tree">, labelled]
  [item — <li role="treeitem">]*
    [row: [toggle — the chevron, on a branch] [label] [description?]]
    [group — <ul role="group">]   (an open branch)
      [item]*
      [busy — a Spinner and `messages.loading`]   (the level is loading)
      [more — <li role="treeitem">, `messages.loadMore`]   (the level has more)
  [busy] | [more]   (the top level, as a group's)
```

## API

```ts
interface TreeItem {
  id: string              // unique in the tree; the handlers report it
  label: string
  description?: string    // one supporting line under the label
  children?: TreeItem[]   // the items under it; an item with one or more is a branch
  hasChildren?: boolean   // a branch whose items the app loads when it is first opened
  loading?: boolean       // the branch's level is loading
  hasMore?: boolean       // the branch has more items than `children` holds
  disabled?: boolean      // takes no key and no press; the arrow keys pass over it
}

interface TreeProps {
  label: string                                            // names the tree: "Organization units", not "Tree"
  items: TreeItem[]                                        // the top level
  expanded?: ReadonlySet<string>                           // the open branches by id; controlled when given
  defaultExpanded?: ReadonlySet<string>                    // the branches open at first, while the tree holds the set
  onExpandedChange?: (next: ReadonlySet<string>) => void   // called with the next set, controlled or not
  value?: string | null                                    // the selected item's id; controlled when given, `null` selects nothing
  defaultValue?: string                                    // the item selected at first, while the tree holds the selection
  onChange?: (id: string) => void                          // called with the id of the item a reader selects
  loading?: boolean                                        // the top level is loading
  hasMore?: boolean                                        // the top level has more items than `items` holds
  onLoadMore?: (parentId: string | null) => void           // a reader asks for more: a branch's id, or `null` for the top level
  messages?: {                                             // the localization seam: both keys, or none
    loading: string                                        // what a level says while it loads; default "Loading"
    loadMore: string                                       // the row that asks for more of a level; default "Load more"
  }
}
```

Attributes: a selected item has `data-selected` and a disabled one `data-disabled`. A row
that is busy has `data-busy`. An item carries its id in `data-tree-item`, and a row, a
chevron and a row that asks for more are named by `data-tree-part` (`row`, `toggle`, `more`),
which the keyboard model and the conformance law read. The rest state is an enabled,
unselected item with none of the three flags.

**A branch.** An item with one or more `children`, or with `hasChildren`, is a branch. Any
other item is a leaf. `hasChildren` with no `children` is a branch the application has not
loaded. Opening it calls `onExpandedChange`, and the application sets `loading` on the item
and then passes its `children`. An application that learns the branch is empty clears
`hasChildren`, and the item is a leaf.

**Expansion.** The tree holds the set of open branches when `expanded` is absent. It starts
with the branches `defaultExpanded` names, or with every branch closed. With `expanded` the
application holds it. `onExpandedChange` is called with the next set in both cases. These are
DataTable's three props, with DataTable's types, and for its reason: an open branch changes
nothing but what the tree shows. The tree's own set follows every change, whoever holds the
set, so an application that stops passing `expanded` finds the branches as the last change
left them, in every renderer. The set keeps the id of a branch that is not in `items`, so a
branch that comes back with its level is still open.

**Selection.** One item is selected, or none. `value`, `defaultValue` and `onChange` are the
props a Select has. Selection does not follow focus: Enter, Space or a press selects, and the
arrow keys only move. A tree whose selection followed focus would load the selected item's
detail on every arrow press. A reader cannot clear the selection, so selecting the selected
item again calls nothing. An application clears it with `value={null}`.

**Opening and selecting are separate acts.** A press on the chevron opens or closes the
branch and selects nothing. A press on the rest of the row selects the item and opens
nothing. The two stay apart because a reader who picks a unit to rename it does not want its
level loaded, and a reader who looks inside a unit has not picked it.

**Loading.** `loading` on an open branch draws one busy row under its items, a Spinner and
`messages.loading`, and sets `aria-busy` on the branch. `loading` on the tree does the same
for the top level. A closed branch draws nothing for it.

**More of a level.** `hasMore` on a branch draws a last row under its items that asks for
more. `hasMore` on the tree draws one after the top level. Activating the row calls
`onLoadMore` with the branch's id, or with `null` for the top level, and the application
appends to `children` or `items`. While a level that has more is `loading`, the row that asks
is the busy row: it keeps its place and its focus, says `messages.loading`, and asks for
nothing. A separate busy row would take the place of the row the reader pressed.

**Disabled.** A disabled item takes no focus, no key and no press. It cannot be selected or
opened, and it carries no `aria-selected`. The arrow keys pass over it, as they pass over a
disabled tab or menu item (`README.md`, Disabled, loading, invalid). A disabled branch is
drawn closed, whatever the open set holds. ARIA applies `aria-disabled` to an element's
focusable descendants, and the rows under an open branch are its descendants, so an open
disabled branch would have a screen reader call every row under it disabled.

**Localization.** The tree has two strings of its own, the busy row's and the row that asks
for more. They are in `messages`, as DataTable's are, and a host that passes nothing gets
generic English defaults. `label` and every item's `label` and `description` are the
application's.

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| root | a column with no gap · `text.sm` quartet · `--pm-text-primary` · no list styling |
| item | draws nothing: it holds its row and, when open, its group |
| row | row layout, centred · min block-size `--pm-control-height-sm`, so a one-line row is a full target · padding-inline-start `--pm-space-5` for each level above it, padding-inline-end `--pm-space-3` · radius `--pm-radius-sm` · `cursor: pointer` · a row spans the tree's width at every level, so a fill is one band and only the content is indented |
| toggle | as wide as `--pm-control-height-sm` and as tall as the row, so the chevron is a full target of its own · chevron Icon `sm` in `--pm-text-muted`, rotated 90° on an open branch, turning on `--pm-motion-duration-control` × `--pm-motion-easing-standard` · mirrored on a closed branch where the page reads right to left |
| leaf | the toggle's width, empty, so a leaf's label aligns with a branch's |
| text column | takes the free width · padding-block `--pm-space-2` · a long word breaks, so a label never widens the tree |
| label | `--pm-text-primary` |
| description | `text.xs` quartet · `--pm-text-secondary` |
| busy row | the Spinner `sm` in the toggle's place · `messages.loading` in the `text.xs` quartet, `--pm-text-secondary` · `cursor: default` |
| more row | `messages.loadMore` in `--pm-accent-text`, the colour of a link · while its level loads, `messages.loading` in `--pm-text-secondary` beside a Spinner, because the row is no action then |
| row, hover | bg `--pm-bg-subtle` |
| selected row | bg `--pm-selection-surface` · with hover, `--pm-selection-surface-hover`, which is the same colour in an achromatic system · the text keeps its colours, because a row holds a label and a description, and the contrast law holds every text role on the selected surface. Selection takes precedence over hover (`README.md`, Selection treatment) |
| disabled row | label, description and chevron `--pm-text-disabled` · `cursor: not-allowed` · no hover fill |
| focus | the shared ring's tokens on the row of the focused item, drawn inside its edge (`outline-offset: calc(var(--pm-focus-width) * -1)`), because rows share their edges and an open branch's item also holds the rows under it |

**On Android**: a row that takes a press is at least the 48dp hit target tall, where the recipe's
least height is `--pm-control-height-sm`, and the toggle column is 48dp wide, so the chevron's touch
area is a target of its own beside the row's. iOS holds a row to its 44-point hit target the same
way and keeps the toggle column's width, with the chevron's hit region reaching past its edges.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| a small tree | three top-level items, the first a branch that is open onto three items | `aria-label="Organization units"` |
| nothing open | the same items, every branch closed | — |
| a selected item | the open branch's second item selected | the item has `aria-selected="true"` |
| a branch that is loading | an open branch with `hasChildren` and `loading` | the branch has `aria-busy="true"` |
| a level with more to load | `hasMore` on an open branch and on the tree | two rows that ask for more |
| more of a level loading | an open branch with `hasMore` and `loading` | the row that asks is busy |
| a disabled item | the second top-level item disabled | no `aria-selected` on it |
| a deep tree | four levels, every branch open | — |
| long labels at a narrow width | a long label, and an unbroken name with a description under it | wraps, no sideways scroll |

`requiredSelectors`: `:hover`, `:focus-visible`, `[aria-expanded="true"]`.

## Motion

The chevron turns on the control tokens, and a row's fill uses the shared colour feedback
(`stateFeedback`). A level appears and leaves without animation: a level that grows moves
every row under it, and a level of a hundred rows cannot animate in smoothly. A row does not
scale on a press, because it is as wide as its container. At `none` the chevron is still too,
because the tokens resolve to zero.

## Icons

`next`, decorative, on every branch's toggle. `aria-expanded` on the item says what the
chevron shows. `loading`, through Spinner, on a busy row.

## A11y

The root is `role="tree"`, named by `label`. Each item is a `role="treeitem"`, named by its
label through `aria-labelledby` and described by its description through `aria-describedby`.
The name is not computed from the item's content, because an open branch's item holds the
rows under it and would be named with all of them. A branch carries `aria-expanded`, and a
leaf does not. An item that can be selected carries `aria-selected`, `true` on the selected
one. A disabled item carries `aria-disabled`. The rows under an open branch are in a nested
`role="group"`, so a screen reader counts a level and its depth from the document, and the
DOM is the same in every web renderer.

A branch whose level is loading carries `aria-busy`, and the busy row holds a Spinner, a
`role="status"` that says `messages.loading` once. The words beside it are hidden from a
screen reader, because the status has already said them. The busy row is not an item and
takes no focus. The row that asks for more is an item, so the arrow keys reach it, and it is
named by its words. It is never selected and carries `aria-selected="false"`. Svelte's
compiler reads ARIA's role model as asking every `treeitem` to state its selection, and the
DOM is the same in every renderer. A disabled item follows the tree view pattern, in which an
item that cannot be selected says nothing about selection.

A native renderer has no `aria-expanded`, so a branch says its state in words, "expanded" or
"collapsed", as JsonTree's toggles do.

```contract
role root tree
name root from label
role item treeitem
role group group when a small tree
attr item aria-expanded=true when a small tree
attr item aria-expanded=false when nothing open
attr selected aria-selected=true when a selected item
attr more aria-busy=true when more of a level loading
announces busy when a branch that is loading
announces live:polite "Loading" when a branch that is loading
click activates on row when a small tree
click activates on more when a level with more to load
```

## Keyboard

The tree view pattern of the ARIA Authoring Practices. The model is
`packages/react-ui/src/structure/tree-keyboard.ts`, and the description the other web
renderers are generated from holds the same one.

- The tree is one tab stop. Until focus has been in the tree the stop is the selected item,
  or the first row when nothing is selected. After that it is the row focus was last on. The
  stop is set on the document and never rendered, so a held arrow key renders no row again.
- ArrowDown and ArrowUp move to the next and the previous row that is drawn, across levels.
  They stop at the last and the first row. Home and End move to the first and the last row.
- ArrowRight opens a closed branch. On an open branch it moves to the first row under it. On
  a leaf it does nothing.
- ArrowLeft closes an open branch. On a closed branch or a leaf it moves to the branch the
  row sits under. At the top level it does nothing.
- Where the page reads right to left, ArrowLeft and ArrowRight change places, because the
  arrows are physical and a branch opens toward the end of the line.
- Enter and Space select the item. On the row that asks for more they ask for more.
- The tree takes its keys even where they do nothing, so a held ArrowDown on the last row
  does not scroll the page. A key pressed with Alt, Control or Meta is left to the browser
  and the application.
- A disabled item is passed over by every key.

Focus stays in the tree when the row that has it leaves the document, where a browser would
hand focus to the page. When a reader asks for more of a level and the rows arrive, focus
moves to the first new row, whether the row that asked is replaced or stays to ask again: the
reader goes on down the level from where it grew. A reader who moved focus after asking is
left where they are. When the level under a focused branch arrives, focus stays on the
branch. When the focused row leaves for any other reason, such as an application closing the
branch above it, focus moves to the selected item, or to the first row when nothing is
selected.

```contract
attr item tabindex=0 when nothing open
key ArrowDown moves-focus-next on item when a small tree
key ArrowUp moves-focus-previous on item when a small tree
key Home moves-focus-first on item when a small tree
key End moves-focus-last on item when a small tree
key ArrowRight opens on item when nothing open
key ArrowLeft closes on item when a small tree
key Enter selects on item when a small tree
key Space selects on item when a small tree
key Enter activates on more when a level with more to load
key Space activates on more when a level with more to load
```

## Agent

An agent reads the selected item's id (`null` while nothing is selected), the open branches by
id, the items a reader can see and whether the top level is loading. It selects an item by its
id, which calls `onChange` as a press on the item's row does, and selecting the selected item
again reports nothing. It opens and closes a branch by its id, which calls `onExpandedChange`
as a press on the branch's chevron does; opening a branch that is open, or closing one that is
closed, changes nothing, and a leaf refuses both. Opening and selecting stay separate acts, as
they are for a person.

The items are the rows a reader can see, in the order they are drawn: each item of the top
level, and the items of every open branch under it. An item inside a closed branch is not a
choice, so an agent opens the branch first, as a person does. A disabled item is a disabled
choice and is refused, and a disabled branch is drawn closed, so its items are not choices. An
item's id is its `id`. The row that asks for more of a level is not offered: a reader asks for
more with it, and an agent has no action for it.

```agent
state value id
state expanded ids
state items choices
state loading boolean as root aria-busy
action choose id sets value calls onChange when a disabled item
action expand id calls onExpandedChange when nothing open
action collapse id calls onExpandedChange
```
