# TreeSelect

A TreeSelect is a field that picks one node of a hierarchy: the unit a unit moves under, the
folder a file goes into, the category an item belongs to. It is Select's field with a Tree in its
popup. The trigger is Select's, and the popup holds the Tree member with its data, its loading and
its keyboard model unchanged, so an application that browses a hierarchy with Tree picks from it
with TreeSelect by passing the same items.

It is not Select, whose options are one flat list: a flat list of a hierarchy writes each option's
depth or path into its label and still shows only one level's names in the trigger. It is not
Tree, which is a pane the reader browses beside the controls that act on its item. It is not
Combobox, which filters a list it holds by typed text. There is no substrate of its own: Radix
Popover places the popup, holds focus in it and dismisses it, and Tree is the content.

A TreeSelect has no search. Its levels are usually loaded one parent at a time, so a search is a
call to the application's server, and the member cannot filter nodes it does not hold. An
application whose choices fit one searchable list uses Combobox. It picks one node, so it has no
checkboxes and no multiple selection, and it has no clear button, as Select has none: the empty
choice is the way back to no node. It has no columns. A cascader shows the same choice as one
column per level: the same value, the same items and the same loading, in a layout whose columns
do not fit a phone. It is not a second member and not a display of this one.

## Anatomy

```
[trigger — <button role="combobox">]: [value | placeholder] [chevron: Icon "expand"]
[hidden input]   (with `name`)
[panel — the popup, or the sheet below 30rem]
  [tree — the Tree member]
    [empty choice — the first top-level item]   (with `emptyOption`)
    [item]*
```

## API

```ts
interface TreeSelectProps {
  label: string                                            // names the tree in the popup: "Organization units"; the field's own label is FormField's
  items: TreeItem[]                                        // Tree's items: the top level, each branch holding the level under it
  expanded?: ReadonlySet<string>                           // the open branches by id, as Tree's; controlled when given
  defaultExpanded?: ReadonlySet<string>                    // the branches open at first, while the member holds the set
  onExpandedChange?: (next: ReadonlySet<string>) => void   // called with the next set, controlled or not
  loading?: boolean                                        // the top level is loading, as Tree's
  hasMore?: boolean                                        // the top level has more items than `items` holds, as Tree's
  onLoadMore?: (parentId: string | null) => void           // a reader asks for more of a level, as Tree's
  value?: string | null                                    // the chosen node's id; controlled when given; `null` is no node, or the empty choice
  defaultValue?: string                                    // the node chosen at first, while the member holds the choice
  onChange?: (id: string | null) => void                   // called with the id a reader chooses; `null` for the empty choice
  valueLabel?: string                                      // what the trigger shows while the chosen node's level is not in `items`
  emptyOption?: string                                     // labels a selectable empty choice, the first top-level item; choosing it reports `null`
  placeholder?: string                                     // shown in `--pm-text-muted` while no node is chosen; not with `emptyOption`
  size?: 'sm' | 'md' | 'lg'                                // the trigger's size, as Select's; default `md`
  invalid?: boolean
  disabled?: boolean
  name?: string                                            // a hidden field that submits the chosen id, or the empty string
  id?: string                                              // the trigger's id, which FormField sets
  defaultOpen?: boolean                                    // opens on mount, for galleries and tests
  presentation?: 'auto' | 'popover'                        // `auto` shows the popup as a sheet below 30rem, as Select's; default `auto`
  messages?: TreeMessages                                  // Tree's strings, passed to the Tree in the popup
}
```

`TreeItem` and `TreeMessages` are Tree's (`tree.md`). The trigger also takes `aria-label`,
`aria-labelledby`, `aria-describedby` and `aria-required`, which FormField sets, as Select's does.
The member writes no word of its own: the trigger shows the application's labels, and the tree's
two strings are Tree's `messages`.

Attributes: the trigger has `data-size`, `data-state="open|closed"`, `data-invalid` and
`data-disabled`, and `data-placeholder` while no node is chosen and no empty choice is offered,
as Select's has. The panel has `data-size`, and `data-presentation="sheet"` while it is the sheet.
The rows are Tree's. The rest state is a closed, enabled trigger.

**The data is Tree's.** `items`, `expanded`, `defaultExpanded`, `onExpandedChange`, `loading`,
`hasMore` and `onLoadMore` mean what they mean on Tree, and the member passes them to the Tree in
its popup. A branch with `hasChildren` is one the application loads when it is first opened, and
a level is as long as the application loads it. The member holds the open branches while the
popup is closed, so a reader who opens the popup again finds the branches as they left them.

**The value.** One node is chosen, or none. `value`, `defaultValue` and `onChange` are Select's
props, with a node's id. `null` is no node, and with `emptyOption` it is the empty choice.

**The empty choice.** A move target often includes the top of the hierarchy: "Top level",
"Organization root". `emptyOption` draws it as the first top-level item, labelled with the
string, as Select's empty choice is the first option. Choosing it reports `null`, so an
application does not invent an id for the root. With the empty choice chosen, the trigger shows
its label as a value, without `data-placeholder`. Its item's id is made for the instance, so no
application id can collide with it, and the hidden field submits the empty string for it.

**What the trigger shows.** The chosen node's label, as Select's trigger shows the chosen
option's label. The popup draws where the node sits, and it opens with the branches above the
node open. A path in a one-line trigger is cut at its end, which is the part that names the node.
When the chosen node is not in `items`, because its level has not been loaded, the trigger shows
`valueLabel`, which the application passes from what it knows of the node. A node in `items` is
shown by its own label, whatever `valueLabel` says.

**Choosing.** Enter, Space or a press on a node's row chooses it, closes the popup and reports
its id, and focus returns to the trigger. Choosing the chosen node again closes the popup and
reports nothing, as in Select. Opening a branch chooses nothing: ArrowRight and a press on the
chevron open it, and the popup stays open. A press on a branch's row chooses the branch, because
Tree keeps opening and selecting apart, and a move target is a branch as often as a leaf. A node
that cannot be chosen, such as the unit being moved and every unit under it, is `disabled`: the
keys pass over it, and a disabled branch is drawn closed, so the units under it are not drawn.

**Phone width.** Under `presentation="auto"` the popup is the shared bottom sheet below `30rem`,
as Select's list is: full width, with safe-area padding, the `sheet` motion binding,
`data-presentation="sheet"` on the panel, and the same Tree inside it. A press on the scrim and
Escape dismiss it, and a choice closes it.

## Recipes (exact tokens)

**Trigger**: Select's trigger recipe (`select.md`) in every state and size, copied, because the
completeness law reads each member's own stylesheet. `tree-select.test.tsx` checks that the two
triggers compute the same values. The value is one line, cut with an ellipsis.

| Part | Tokens |
| --- | --- |
| panel | bg `--pm-bg-overlay` · border `1px solid --pm-border-subtle` · radius `--pm-radius-surface` · shadow `--pm-shadow-transient` · padding `--pm-inset-list` · at least the trigger's width, at most four `--pm-space-10` or the trigger's width when that is wider, and never wider than the room the popper measures · as tall as the room below the trigger, scrolling inside |
| tree | Tree's recipe (`tree.md`), unchanged. The rows do not follow the trigger's size, because Tree has one size |
| sheet | the shared sheet's panel; the tree inside it has the panel's `--pm-inset-list` inset, the sheet's safe-area padding under it, and scrolls under the sheet's height cap |

## States

| Entry | Render | Expect |
| --- | --- | --- |
| empty, with a placeholder | closed, no value | `data-placeholder` |
| a value | closed, a top-level node chosen | no `data-placeholder` |
| a value deep in the hierarchy | closed, a third-level node chosen | — |
| open on a value deep in the hierarchy | `defaultOpen`, a third-level node chosen | the branches above it open, the node selected |
| open, a level loading | `defaultOpen`, an open branch with `hasChildren` and `loading` | a busy branch |
| open, a level with more to load | `defaultOpen`, `hasMore` on a branch and on the top level | two rows that ask for more |
| open, disabled nodes | `defaultOpen`, a disabled branch and a disabled leaf | — |
| a value whose level is not loaded | a value not in `items`, with `valueLabel` | the trigger shows `valueLabel` |
| the empty choice, chosen | `emptyOption`, value `null` | no `data-placeholder` |
| open on the empty choice | `emptyOption`, `defaultOpen` | the empty choice first and selected |
| sizes | sm, md and lg | `data-size` |
| invalid | `invalid` | `data-invalid` |
| disabled | `disabled` | `data-disabled` |
| long labels at a narrow width | a long label chosen, in a box narrower than a phone | the value cut, no sideways scroll |
| the move-target form | a FormField with a TreeSelect, beside a Button | — |

Right to left is every entry: the direction law (`packages/conformance/src/direction.ts`)
renders each one in a right-to-left document, and `treeSelectLaw` runs Tree's case for the
arrow keys that change places there.

`requiredSelectors`: `:hover`, `:focus-visible`, `[data-state="open"]`, `[data-invalid]`,
`[data-disabled]`.

## Motion

The panel is Select's: `scale-fade`, origin-aware from the trigger, entering on
`--pm-motion-duration-surface` × `--pm-motion-easing-enter` and leaving on
`--pm-motion-duration-surface-exit` × `--pm-motion-easing-exit`. The chevron turns 180° while
open, on `--pm-motion-duration-control` × `--pm-motion-easing-standard`. The sheet plays the
`sheet` binding. The tree's own motion is Tree's. At `none`, the panel mounts and unmounts at
once and the chevron is still.

## Icons

`expand`, decorative, on the trigger. The tree's are Tree's: `next` on each branch's toggle and
`loading` through Spinner.

## A11y

The trigger is a `<button>` with `role="combobox"`, as Select's is, so a screen reader reads the
label it shows as the field's value. It carries `aria-haspopup="tree"`, `aria-expanded`, and
`aria-controls` naming the panel while it is open. FormField names it through `id` and its
`<label for>`, and wires `aria-describedby`, `aria-invalid` and `aria-required`. The panel has no
role of its own, because the tree it holds is the popup the trigger announces. The tree is
Tree's: a `role="tree"` named by `label`, with its items, groups, busy rows and rows that ask for
more.

The keys on the trigger are Select's: Enter, Space, ArrowDown and ArrowUp open the popup.
Opening puts focus on the chosen node, after opening the branches above it, or on the first row
when no node is chosen or the chosen node is not drawn. Opening the branches reports the next
set through `onExpandedChange`. Inside the popup the keys are Tree's: the arrow keys, Home and
End move, ArrowRight and ArrowLeft open and close branches, and Enter and Space choose. Escape
and a press outside close the popup without choosing, and focus returns to the trigger. The
popup is modal while it is open, as Select's list is: focus stays in the tree, so Tab does
nothing, the rest of the page is hidden from assistive software, and a press outside closes the
popup and reaches nothing under it.

**On iOS and Android**: when the panel opens, VoiceOver and TalkBack start where the platform's
sheet or popover puts them, as in every presentation there, and not on the chosen node. The panel
still opens the branches above the chosen node and scrolls its row into view.

```contract
role trigger combobox
attr trigger aria-haspopup=tree when empty
attr trigger aria-expanded=false when empty
attr trigger aria-expanded=true when open on a value
role tree tree when open on a value
name tree from label when open on a value
key Enter opens
key ArrowDown opens when a value deep
focus on-open selected when a value deep
key ArrowDown moves-focus-next on item when open on a value
key ArrowUp moves-focus-previous on item when open on a value
key Home moves-focus-first on item when open on a value
key End moves-focus-last on item when open on a value
key Enter commits on item when open on a value
key Space commits on item when open on a value
click activates on row when open on a value
key Escape closes when open on a value
focus on-close trigger
dismiss both when open on a value
attr trigger aria-invalid=true when invalid
```

`treeSelectLaw` (`packages/conformance/src/tree-select.ts`) holds what the contract cannot state,
in every web shell: focus on the chosen node after the branches above it open, Tree's keys inside
the popup, choosing a node and the chosen node again, opening a branch without choosing it, the
empty choice, the hidden field, and a level the application loads while the popup is open.

## Agent

An agent reads the chosen node, the nodes it can choose, whether the popup is open and whether
the field is disabled or invalid. It chooses a node by its id without opening the popup, and the
member reports the choice through `onChange` as it reports a person's, controlled or not; a
choice made while the popup is open closes it, as a person's does. The nodes are every node the
application has passed, at every level, in the order the tree draws them, each labelled by its
own label. A node in a level the application has not loaded is not one of them, because the
member holds only what the application passed. A disabled node is refused, and so is every node
under a disabled branch, which the tree draws closed. The empty choice's id is the empty string,
which `onChange` reports as `null`, and the value reads `null` only while nothing is chosen and
no empty choice is offered. It opens and closes the popup. It does not open or close a branch:
a branch is opened to see the level under it, and an agent reads every level the application
holds without opening one. The Tree in the popup is the picker's own part, so the picker
withholds the popup and the bridge lists the TreeSelect in the Tree's place. An agent then has
one path to a choice, `choose`, as a person has one field.

```agent
state value id
state options choices
state open boolean as panel present
state disabled boolean as trigger data-disabled
state invalid boolean as trigger aria-invalid
action choose id sets value calls onChange when open, disabled nodes
action open sets open
action close sets open
withholds contents
```
