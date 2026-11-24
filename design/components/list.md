# List

A List is a column of items of one kind, such as notifications, search results, accounts or
the records beside a detail pane. Each item has a title, and may have a leading mark, a line of
supporting text, a trailing fact and a trailing control. An item is read, or it navigates, or
it is picked. It is not Table: a table compares the same fields down its columns, and a list
item is read as one thing. It is the form a table's rows take where there is no width for
columns. It is not Menu, whose items are commands behind a trigger, and it is not Timeline,
whose entries are past events in order and are never controls. There is no substrate: a `<ul>`
of rows.

## Anatomy

```
[List — <ul aria-label>]
  [List.Item — <li>]*
    [leading?] [text: [title — <a> | <button> | text] [description?]] [meta?] [trailing?]
```

## API

| Component | Prop | Type | Notes |
| --- | --- | --- | --- |
| `List` | `label` | `string` required | names the list for a reader: "Notifications", not "List". A page often has several lists, and a reader tells them apart by name |
| | `children` | `List.Item`s | |
| `List.Item` | `title` | `string` required | the item's name, and the accessible name of its link or button |
| | `description` | `string` | one supporting line under the title. It wraps and is never clipped |
| | `meta` | `string` | a short trailing fact the application has already formatted: a time, a count, a size |
| | `href` | `string` | the item navigates: the title is an `<a href>` whose target covers the row |
| | `onNavigate` | `(href: string) => void` | with `href` only: the routing seam (`link.md` §Routing). A click the browser would follow in this tab goes to `onNavigate(href)` instead of the browser |
| | `onSelect` | `() => void` | the item is picked. Without `href` the title is a `<button>` whose target covers the row. With `href` it is also called on every click of the link, one that opens a new tab included, so a router uses `onNavigate` there |
| | `current` | `boolean` | the item whose page or detail is open. At most one per list. It has no effect on an item that is only read |
| | `leading` | `ReactNode` | one mark before the text: an `Avatar`, an `Icon` or an `Image`. Not a control, because the row's target covers it |
| | `trailing` | `ReactNode` | one governed member after the text: a `Badge`, a `Button`, a `Menu` or a `Switch`. A control stays above the row's target and takes its own press, and in no state lets one through to the row. A press on a mark that is not a control is a press on the row |

Attributes: an item that navigates or is picked has `data-interactive`, the name Table.Row and
Card use. The current item has `data-current`, and its link or button has `aria-current`:
`page` on a link, `true` on a button. An item that is only read carries neither, with
`current` or without: it has no link or button to carry `aria-current`, and a filled row would
say to the eye what nothing says to a screen reader.

A List picks one item at most. A set of picked rows with actions on the set is DataTable's
selection, and a set of choices in a form is CheckboxGroup.

A list has no groups of its own. A grouped list is several Lists, each under its own
`Heading`, because a group is a list with a name and a List already has one.

An empty list draws nothing. A view with nothing to show is an EmptyState, which the
application renders in the list's place. A list that loads further windows puts a
`CursorPagination` with `mode="append"` under it.

## The interactive item

One element takes the row's press: the title's `<a>` or `<button>`, stretched over the row by
a pseudo-element. The row is not a control of its own, so there is one tab stop and one name
per item, and a trailing control is a second, separate stop.

- **The trailing control stays reachable.** It is drawn above the stretched target. Card's
  stretched link covers its whole surface and has no such part, which is why a card with inner
  controls is refused there and a list item with one is not.
- **A trailing mark that is not a control is part of the row.** The row shows its hover fill
  and its pointer under a `Badge` as under its text, so a trailing box that holds no control
  takes no press of its own (`pointer-events: none`).
- **A trailing box that holds a control takes every press inside it.** The box takes them, and
  not only the control, because a control turns its own pointer events off in some states: a
  `Button` does while it is `loading`. A press on a busy or disabled control then lands on the
  box and does nothing, and never reaches the row's target under it. A mark beside a control
  in the same box is not part of the row either.
- **The leading mark is under the target.** A press on it is a press on the row.
- **Text under the target cannot be drag-selected.** Card accepts the same cost for the same
  pattern.

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| list | a column with no gap. Items are separated by `1px solid --pm-border-subtle`; the first item draws none, because the surface the list sits in is the outer boundary |
| item | row layout, centred · gap `--pm-space-3` · padding `--pm-space-3` `--pm-space-4` · min block-size `--pm-control-height-lg`, so a one-line item is a full target |
| text column | takes the free width · gap `--pm-space-1` · a long word breaks, so an item never widens its container |
| title | `text.sm` quartet · `--pm-text-primary` · no underline on a link |
| description | `text.xs` quartet · `--pm-text-secondary` |
| meta | `text.xs` quartet · `--pm-text-secondary` · one line, never shrinks |
| leading, trailing | never shrink |
| interactive item, hover | bg `--pm-bg-subtle` · `cursor: pointer` |
| current item | bg `--pm-selection-surface` · with hover, `--pm-selection-surface-hover`, which is the same colour in an achromatic system · the text keeps its colours, because the contrast law holds every text role on the selected surface, and a trailing control is drawn on it too. Selection takes precedence over hover, as in Table (`README.md` §11) |
| focus | the shared ring's tokens on the item, drawn inside its edge at every system's offset (`outline-offset: calc(var(--pm-focus-width) * -1)`), because rows share their edges and a ring outside would be cut by the surface around the list |

**On Android**: an item that navigates or is picked is at least the 48dp hit target tall, where
the recipe's least height is `--pm-control-height-lg`. iOS holds it to its 44-point hit target the
same way. On both, the row's press covers the trailing part, as in the platform's own list rows, so
a press on a trailing mark is a press on the row and an enabled control takes its own. A disabled
control takes no press, so a press on one falls to the row, where the web's trailing box keeps it.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| items that are read | 3 items: title, description, meta | no `data-interactive` |
| items that navigate | 3 items with `href`, leading `Avatar`, `meta` | links; `data-interactive` |
| the item of the open page is current | 3 items with `href`, the first `current` | first link `aria-current="page"` |
| items that are picked | 3 items with `onSelect`, the first `current` | buttons; first `aria-current="true"` |
| a trailing control | 3 items with `href` and a trailing `Button` or `Badge` | the control is reachable |
| a long title and description | one item with an unbroken 80-character title | wraps, no sideways scroll |

`requiredSelectors`: `[data-interactive]:hover`, `:focus-visible`, `[data-current]`.

## Motion

Hover and current use the shared colour feedback (`stateFeedback`). The row does not scale on
a press: it is as wide as its container, and a press scale on a surface that size reads as the
page moving. Nothing slides between items.

## Icons

None of its own. A leading `Icon` is the application's choice of role.

## A11y

A `<ul aria-label>` of `<li>`, so a screen reader announces the list by name with its item
count. The title of an interactive item is a real `<a href>` or `<button>`, named by the title text; the
description and the meta follow it in reading order. The current item is marked by
`aria-current` and by a filled row as well as a colour. A trailing control keeps its own name
and its own tab stop.

```contract
role root list
name root from label
attr link aria-current=page when the item of the open page is current
attr button aria-current=true when items that are picked
```

## Agent

An agent reads the items a person can pick and the current one, and picks an item. The
application composes the items as children, so the List holds no list of them: it reads them
from its own `<ul>` in the document, in document order. Each item that navigates or is picked is
a choice whose id is its `href`, or its title when it has none, and whose label is its title.
Two items that would share an id are each a choice, because each is a row a person presses: the
second takes ` (2)` after the id and the third ` (3)`. `current` is the id of the item whose link
or button carries `aria-current`, or `null` when none does.

An item that is only read is not a choice. It has no link or button, so a person cannot pick it,
and a disabled choice would say it is a control that is off, which nothing on the page says. It
is never current, as it carries no `aria-current`. Its title and its text are the List's text,
which `query`'s `text` matches. A List whose items are all read is listed with an empty `items`,
because a handle registers once and the application can add an item that is picked after the
List mounts.

`choose` presses the item's link or button with its own click, so `onSelect` runs, and
`onNavigate` routes a link or the browser follows it and the page the agent acts on is left, as
for a person's press. The current item stays a link or a button, so choosing it is allowed.

A trailing control (a Button, a Menu, a Switch) is the application's member: it registers on its
own and is listed `within` the List. The List withholds nothing.

```agent
state items choices
state current id when items that are picked
action choose id presses title
```
