# CursorPagination

Previous and next controls for a cursor-paged list, with an optional position label, or in its
`append` form one "Load more" action. Use it when the list's API returns a "there is more" flag
and a token, but never a count.

It has no substrate: two Buttons, an Inline and a `<nav>`. Pagination needs a `pageCount`, so
without this member a product whose lists are all bounded and cursor-paged could not page any
of them.

CursorPagination is **not Pagination**. Pagination jumps to a numbered page and must know how
many pages exist. This member moves to the adjacent window and knows nothing else. A cursor
list using Pagination would have to invent its `pageCount`, which renders numbered links to
pages nobody counted and a last page that may not be the last. They are two members, not one
with a mode, because a combined component would have to guess which behaviour the screen wants,
and its two modes would share no props.

Its `append` form is **"Load more"**: one action that *appends* the next window below the ones
on screen, where the default form *replaces* the window. Both forms read the same response and
share every prop but the previous direction, so they are one member with a `mode`, by the test
that keeps Pagination apart (two modes that would share no props). The replace form keeps the
list bounded, which is the reason to page by cursor. The append form suits a feed or a log read
from the top, where what was read stays in view ([Load more](#load-more)). Infinite scroll, which
appends without a press, stays out of scope (`pagination.md`).

## Anatomy

```
[root <nav>]
  [Inline wrap]
    [previous — Button ghost/neutral/sm, leading icon]
    [position? — the window, in the app's words]
    [next — Button ghost/neutral/sm, trailing icon]

mode="append":
[root <nav>]
  [Inline wrap]
    [position? — what is on screen, in the app's words]
    [more — Button outline/neutral/sm]   while there is more, or a window is in flight
  [end — role="status", a line under the row: empty until the list runs out, then messages.end]
```

## API

```ts
type CursorPaginationProps = {
  hasPrevious: boolean          // the list handed back a cursor in that direction — controlled;
                                // the append form does not read it
  hasNext: boolean
  onNext: () => void            // append: the next window, which the app adds below
  position?: string             // "26–50" — app prose; never a total the list did not return
  pending?: boolean             // the window asked for has not arrived (see Behavior)
  disabled?: boolean            // the app holds the pager while it does something else to the list
  label?: string                // nav landmark name; default 'Pagination'
  messages?: {                  // the localization seam: previous and next, both or neither
    previous: string            // default 'Previous'
    next: string                // default 'Next'
    more?: string               // the append form's action; default 'Load more'
    end?: string                // the append form's last line; default 'No more to load'
  }
} & (
  | { mode?: 'replace'; onPrevious: () => void }   // the default form, with its previous direction
  | { mode: 'append'; onPrevious?: undefined }     // Load more: no previous direction
)
```

Attributes: root `data-pending?`, `data-disabled?` and `tabindex="-1"` (see A11y), plus
`aria-busy` while pending. The Buttons carry Button's own (`data-state="loading"`, `disabled`).

The props are a union on `mode`, as Card's `href` and `label` are a pair. The replace form
requires `onPrevious`, so a pager written before the append form still type-checks, and the
append form takes none, because it has no previous direction. Vue, Svelte, Solid and Angular
read one interface, where `onPrevious` is an optional event, so there a replace form with
`hasPrevious` and no previous handler warns in development, because the previous button would
do nothing; React warns too, for a caller the types do not reach. `more` and `end` are optional
so a pager written before the append form still type-checks. In the append form, `messages`
without them warns in development, for the both-or-neither rule's reason: one control never
mixes two languages.

**The labels are visible**, unlike Pagination's icon-only arrows. Pagination's arrows sit
beside page numbers that explain them. Here the two controls are the whole member, and two bare
chevrons beside a table are hard to interpret. "Previous" and "Next" are short in most
languages and the row wraps, so the words also fit at narrow widths.

**No `position` arithmetic.** The member does not compute "26–50" from a page size and an
index, because a cursor list has no index and the right wording differs by screen ("Newest
first", "Events before 14:02"). The app writes it, as it writes every other string in the
vocabulary.

## Behavior

- **One window renders nothing.** When `hasPrevious` and `hasNext` are both false and nothing
  is pending, the list is not paginated, and two disabled arrows would be useless chrome
  (Pagination's rule). While `pending`, the pager stays, because the last window's "no next"
  arrives *with* the window.
- **`pending` blocks a second request.** The pressed direction shows busy (Button `loading`:
  it keeps its focus, colours and name, and ignores presses), and the other direction is
  disabled. So a slow fetch cannot be followed by a request for a different window. This
  applies the platform rule that a lost response does not invite a blind repeat. The member
  remembers *which* button was pressed. The app only reports that a request is in flight,
  which is all a query library knows.
- **`disabled` holds the pager.** Every control is disabled and none shows busy. The app sets it
  while it does something else to the list (a bulk action, a save), when a new window would
  change the rows under that work. It is not `pending`, which says the pager's own request is in
  flight: with both set, the pressed direction stays busy and keeps its focus. A held pager is
  still drawn, so the page does not move when the hold ends. One window still renders nothing.
  A hold that disables the button with focus moves focus to the root, and the end of the hold
  gives it back (see A11y).
- **The pager does not own the cursors.** `hasPrevious`/`hasNext` are controlled, and there is
  no `cursor` prop, because a token is transport and transport belongs to the app.

## Load more

`mode="append"` draws one action, `messages.more`, that calls `onNext`. The app adds the window
it fetches below the ones on screen. The form keeps the replace form's rules for one window and
for a window in flight, and adds a memory of its own:

- **The member remembers that it paged.** Once the reader has pressed the action, the form has
  asked for a window, and the list has grown. It never reads `hasPrevious`, so the app passes
  its query library's flags as they are: a forward feed's "has a previous page" is false
  throughout, and it says nothing about how many windows are on screen.
- **One window renders nothing.** With `hasNext` false and nothing pending, a form that has not
  asked for a window draws nothing: a "Load more" with nothing to load, or an end line under a
  list that never grew, is chrome.
- **`pending` blocks a second request.** The action shows busy (Button `loading`: it keeps its
  focus, colours and name, and ignores presses). It is the only direction, so the member needs
  no memory of which was pressed.
- **The list runs out.** When `hasNext` turns false after the form asked for a window, with
  nothing pending, the action leaves and the end line says `messages.end`. The end line is a
  status region from the form's first render, empty until then, because a region that mounts
  with its words announces nothing. A screen reader hears why the action went, and a sighted
  reader sees it. It is a line of its own under the row: beside the position, two muted texts
  would read as one phrase ("120 shown No more to load"). A list the app starts again, under
  a new query, takes a new pager (a `key` from the query), so the memory belongs to the list
  it follows.
- **Focus stays with the browser.** The member does not move focus when the action leaves. The
  browser keeps its sequential focus starting point where the action was, so the next Tab
  continues from there. Moving focus to the end line would announce it twice, once as focus and
  once as status. The same is true while the app holds the pager: an action that left was not
  disabled by the hold.
- **`position` is what is on screen**, in the app's words ("50 shown"), never a total the list
  did not return. It is polite, so each window that arrives is announced once.
- **The rows already shown stay while the next window loads.** In a DataTable the app sets the
  pager's `pending`, not the table's `loading`, which replaces the body with skeletons.

## Recipes (exact tokens)

Root: `<nav>`, `display: inline-flex`, `flex-direction: column`, holding
`<Inline gap={2} align="center" wrap>` and, in the append form, the end line under it.

| Part | Tokens |
| --- | --- |
| root | the shared focus ring (`focusRing`) · `--pm-radius-control`, so the ring has the controls' corners. The root takes focus only under a hold (see A11y) |
| previous | Button `ghost/neutral/sm` `icon="previous"` `label={messages.previous}`; disabled when `hasPrevious` is false |
| next | Button `ghost/neutral/sm` `trailingIcon="next"` `label={messages.next}`. The chevron sits on the side it points to; disabled when `hasNext` is false |
| position | `text.sm` quartet · `--pm-text-muted` · `font-variant-numeric: var(--pm-font-numeric)` (FilterBar's count recipe. Tabular figures, so "26–50" → "51–75" does not shift the arrow beside it) · not interactive |
| pending | the pressed Button `loading`; the other `disabled` |
| disabled | every Button `disabled`, the append form's action too; a Button that is `loading` stays busy and is not disabled |
| more | Button `outline/neutral/sm` `label={messages.more}`, no icon; `loading` while `pending` |
| end | position's type and colour, without tabular figures · a line of its own: the root is a column (`flex-direction: column`), which lays out the replace form's one row as a row, and an empty end line has no height |

`ghost`, for Pagination's reason: the page's single solid button belongs to its primary
action, and a pager must not use it. The append form's action is `outline`, not `ghost`: alone at
the foot of a list, with no arrows or numbers beside it, it needs an edge to read as a control.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| the first window | `hasPrevious={false} hasNext` | previous disabled |
| a middle window | both | — |
| the last window | `hasPrevious hasNext={false}` | next disabled |
| with a position | `position="26–50"` | the text between the arrows |
| pending | `pending` | `data-pending` |
| held by the app | `disabled` | `data-disabled`; both directions disabled |
| localized | `label` + `messages` | — |
| one window | both false | renders nothing |
| append, more to load | `mode="append"` `hasNext` | one Button, "Load more" |
| append, with a position | `position="50 shown"`, `hasNext` | the text before the action |
| append, a window in flight | `pending` | `data-pending`; the action busy |
| append, held by the app | `disabled` | `data-disabled`; the action disabled |
| append, the list ran out | the action pressed, then `hasNext={false}` | the end line says "No more to load" |
| append, one window | `hasNext={false}`, never pressed | renders nothing |

`requiredSelectors`: `:focus-visible`, for the root's ring. Every control is a Button, so its
`:hover`, `:focus-visible`, `[data-state='loading']` and `:disabled` are in Button's stylesheet,
and Button's fixture asserts them (as in Pagination).

## Motion

None beyond Button's own. The spinner on the pressed direction is Button's `loading`. The
window change re-renders content, and the content region owns any transition (Pagination's
rule).

## Icons

`previous`, `next`. Both are decorative, because the visible label names each action. This
member does not mirror them; the icon gateway handles direction. The append form's action has no
icon: "Load more" names it, and a chevron would read as a disclosure.

## A11y

`<nav aria-label>`: a landmark users can jump to. The app names it when a page has more than
one pager. `aria-busy` is on the landmark while a window is loading. `position` is
`aria-live="polite"`. Its text changes once per move, so a screen reader announces the new
position and not intermediate renders. No `aria-current` anywhere, because a list with no page
count has no current page, and claiming one would invent a count. In the append form the end line
is `role="status"`, present and empty until the list runs out, so its words are announced.

**A hold keeps the reader's place.** A hold disables the pager's buttons, and a browser takes
focus from a button as it is disabled: the page has it, and no control does. So when a hold
disables the button that has focus, the pager moves focus to its root. The root carries
`tabindex="-1"`, so a script can focus it and it is never a tab stop. The reader stays in the
pager and hears its name, and the next Tab goes on to what follows the pager. The root draws
the shared focus ring, as any element that takes focus from the keyboard does. It is
Pagination's rule (`pagination.md`).

- A hold that begins while focus is elsewhere moves nothing.
- A direction that is busy is not disabled, so it keeps focus through the hold. When its window
  arrives and the hold is still on, the direction is disabled, and focus moves to the root then.
- **When the hold ends, focus returns to the control it was taken from**, if focus is still on
  the root: previous, next, or the append form's action. A reader left on the root would have
  to move back to the button after every window an app loads under a hold.
- If the reader moved focus elsewhere during the hold, nothing moves when it ends.
- A control that is still disabled (next, when the window that arrived is the last) or is no
  longer drawn (the append form's action, when its list ran out under the hold) takes no focus,
  and focus stays on the root. The nearest enabled control does something else: previous,
  where next has run out, and a reader who presses again would go back. The root is in the
  pager and says its name, and it is never a disabled control.

```contract
role root navigation
attr root data-disabled when held by the app
attr root data-disabled when append — held by the app
attr root tabindex=-1 when held by the app
attr root tabindex=-1 when append — held by the app
announces busy when pending
announces live:polite when with a position
announces live:polite when append — more to load
announces live:polite "No more to load" when append — the list ran out
```

## Agent

An agent reads whether there is a previous and a next window, the position in the app's words
(empty when the app gives none), whether a window is in flight and whether the app holds the
pager. It asks for the next or the previous window, which calls `onNext` or `onPrevious` as a
press on that direction's button does, and the member marks that direction busy until the window
arrives. The windows belong to the list, so the position changes when the app passes the new
window back. A direction a person cannot press is refused: one with no window, either while a
window is in flight, and previous in the append form, which has none and reads `has-previous` as
false. A held pager lists no action. The pager's Buttons are its own parts, so it withholds them:
an agent sees one CursorPagination, named by its landmark label, where a person sees one pager.

```agent
state has-previous boolean
state has-next boolean
state position text
state pending boolean as root data-pending
state disabled boolean as root data-disabled
action previous calls onPrevious when a middle window
action next calls onNext
withholds contents
```
