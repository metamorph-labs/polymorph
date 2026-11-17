# Pagination

Numbered page controls for a paged list. "Load more" is a different pattern: it is
`CursorPagination`'s `append` form (`cursor-pagination.md`), because it needs a "there is more"
flag and never a page count. Infinite scroll, which appends without a press, is out of scope.

A list that pages by **cursor**, with only next and previous and no page count, uses
`CursorPagination` (`cursor-pagination.md`), not an invented `pageCount`.

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `page` | `number` (1-based) | required | controlled |
| `pageCount` | `number` | required | |
| `onPageChange` | `(page: number) => void` | required | |
| `siblingCount` | `1 \| 2` | `1` | numbers shown each side of current |
| `disabled` | `boolean` | `false` | the app holds the pager while it does something else to the list (see Behavior) |
| `label` | `string` | `'Pagination'` | nav landmark name |
| `messages` | `{ previous: string; next: string; page: (page: number) => string }` | English | every accessible name the pager uses (the localization seam): the two arrows and a numbered button's name (`Page 3`; the visible text stays the digit, and the name contains it, WCAG 2.5.3). All keys or none. Localized applications pass their catalog's values; omitting it keeps the generic English defaults |

Attributes: root `data-disabled?` and `tabindex="-1"` (see A11y). The Buttons carry Button's
own (`disabled`, `aria-current`).

Window math (exact): always show 1 and `pageCount`; show `page ± siblingCount`;
collapse gaps ≥ 2 into an ellipsis. `pageCount ≤ 1` renders nothing.

## Behavior

- **`disabled` holds the pager.** Every control is disabled, the current page too, and no page
  is asked for. The app sets it while it does something else to the list (a bulk action, a
  save), when a new page would change the rows under that work. It is CursorPagination's
  `disabled` (`cursor-pagination.md`), so a DataTable held during that work holds whichever
  pager its `pagination` slot has. The current page keeps `aria-current`, so the pager still
  says where the list is. A held pager is still drawn, so the page does not move when the hold
  ends. One page still renders nothing. A hold that disables the button with focus moves focus
  to the root, and the end of the hold gives it back (see A11y).

## Recipe (exact tokens)

Root: `<nav>` with `<Inline gap={1} wrap>` *(the row wraps because its length depends on
the data. Eleven pages is eleven controls, so in a narrow container the row continues on a second
line instead of overflowing. The row gap is the declared `gap`. There is no breakpoint, because a
row that fits never wraps)*.

| Part | Tokens |
| --- | --- |
| root | the shared focus ring (`focusRing`) · `--pm-radius-control`, so the ring has the controls' corners. The root takes focus only under a hold (see A11y) |
| prev / next | Button `ghost/neutral/sm iconOnly` `icon="previous"/"next"` `label="Previous page"/"Next page"`; disabled at the ends |
| number | Button `ghost/neutral/sm` min-width `--pm-control-height-sm` (roughly square digit buttons), `label="Page N"` with visible digit |
| current | Button `soft/accent/sm` + `aria-current="page"` (soft, not solid, because the page's one solid button is reserved for the page's primary action) |
| ellipsis | `text.sm` · `--pm-text-muted` · width `--pm-control-height-sm` centered · not interactive |
| disabled | every Button `disabled`, the current page too, so no control looks pressable; the current page stays `soft` and keeps `aria-current` |

## States

| Entry | Render | Expect |
| --- | --- | --- |
| five pages, at the first | `page={1} pageCount={5}` | previous disabled |
| five pages, in the middle | `page={3} pageCount={5}` | — |
| five pages, at the last | `page={5} pageCount={5}` | next disabled |
| twelve pages, in the middle | `page={6} pageCount={12}` | an ellipsis on each side |
| twelve pages, with wider shoulders | `siblingCount={2}` | two numbers each side of the current page |
| two pages | `page={1} pageCount={2}` | no ellipsis |
| held by the app | `disabled` | `data-disabled`; every Button disabled |
| one page | `pageCount={1}` | renders nothing |

`requiredSelectors`: `:focus-visible`, for the root's ring. The Buttons' `[aria-current="page"]`,
`:hover` and `:focus-visible` are in Button's stylesheet, and Button's fixture asserts them.

## Motion

None beyond Button's own. A page change re-renders content, and the content region owns any
transition.

## Icons

`previous`, `next`.

## A11y

`<nav aria-label>`: a landmark users can jump to. The buttons carry full names. The current
page is `aria-current="page"`.

**A hold keeps the reader's place.** A hold disables the pager's buttons, and a browser takes
focus from a button as it is disabled: the page has it, and no control does. So when a hold
disables the button that has focus, the pager moves focus to its root. The root carries
`tabindex="-1"`, so a script can focus it and it is never a tab stop. The reader stays in the
pager and hears its name, and the next Tab goes on to what follows the pager. The root draws
the shared focus ring, as any element that takes focus from the keyboard does.

- A hold that begins while focus is elsewhere moves nothing.
- **When the hold ends, focus returns to the control it was taken from**, if focus is still on
  the root. Pagination has no `pending`, so an app holds it with `disabled` while each page
  loads. A reader left on the root would have to move back to the button after every page.
- The pager remembers the control by what it does: previous, next, or a page's number. A
  renderer may draw a page's button again as a new element when the window of pages changes,
  and its number still names it.
- If the reader moved focus elsewhere during the hold, nothing moves when it ends.
- A control that is no longer drawn (a page number outside the new window) or is still
  disabled (next, on what is now the last page) takes no focus, and focus stays on the root.
  The nearest enabled control does something else, and a reader who presses again would do
  that instead. The root is in the pager and says its name, and it is never a disabled control.
- A page's button is the same element when it becomes the current page, in every web renderer.
  So a page the reader presses keeps focus, and a hold that begins with the new page disables
  the element that has focus.

```contract
role root navigation
attr current aria-current=page when five pages, in the middle
key Enter activates on page when five pages, in the middle
attr root data-disabled when held by the app
attr current aria-current=page when held by the app
attr root tabindex=-1 when held by the app
```

## Agent

An agent reads the current page, the page count and whether the app holds the pager, and asks
for a page by its number, which calls `onPageChange` as a press on that page's button does. The
current page belongs to the list, so the page changes when the app passes the new `page` back. A
number outside 1 to the page count fails, and asking for the current page changes nothing, as the
current page's button asks for nothing. A held pager lists no action. The pager's Buttons are its
own parts, so it withholds them: an agent sees one Pagination, named by its landmark label, where
a person sees one pager.

```agent
state page number as current text
state page-count number
state disabled boolean as root data-disabled
action set number calls onPageChange when five pages, in the middle
withholds contents
```
