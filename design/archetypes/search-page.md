# SearchPage (archetype)

The page whose subject is a query: header → the search landmark (the field, then the filters
under it) → what the query found. It draws nothing below the field until it is asked, and its
results are groups of different kinds that flow down the page. It owns the `--pm-page-*`
pattern-scope namespace on its root, like every page archetype.

It is not ListPage. A ListPage's subject is a set of records in one panelled table, and its
filters narrow what is already listed. It is not Command, which is a palette over the page and
is gone when a result is picked. It composes PageHeader and EmptyState. The field, the filters
and the results are the application's members: a SearchInput (or a FormField with an Input and
a submit Button), a FilterBar or `sm` controls, and a Heading over a List with a
CursorPagination under it for each group of results.

## Anatomy

```
[root — the page inside AppShell's content region; it flows]
  [PageHeader — from props]
  [search — the search landmark, named `searchLabel`; a <form> when `onSubmit` is given
     [query   — the `search` slot]
     [filters — the `filters` slot?, an Inline row]]
  [results — `aria-busy` while `pending`:
     children                  — when `empty` is false
     EmptyState (from props)   — when `empty` is true]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `title` / `description` / `actions` | as PageHeader | `title` required | passed through. SearchPage owns the only PageHeader |
| `search` | `ReactNode` | required | the query field: a SearchInput, or a FormField with an Input whose `trailing` is a submit Button |
| `searchLabel` | `string` | required | names the search landmark. A shell often has a search of its own, and two landmarks of one kind are told apart only by their names |
| `onSubmit` | `() => void` | — | the landmark is a real `<form>`, so Enter in the field submits, as FormPage's does. Without it the application searches as the reader types, and the landmark is not a form |
| `filters` | `ReactNode` | — | a FilterBar, or `sm` controls, under the field |
| `empty` | `boolean` | `false` | the query found nothing: the results region holds the EmptyState |
| `emptyState` | `EmptyStateProps` | required | the completeness law, as ListPage's: the page cannot be built without deciding what it says when a query finds nothing |
| `pending` | `boolean` | `false` | a search is running: the results region is `aria-busy`. The page draws no spinner of its own; the submit Button's `loading` shows one |
| `children` | results | — | groups of results, each a `Stack gap={3}` of a Heading, a List and a CursorPagination. Before any query the application passes none, and the region draws nothing |

Attributes on root: `data-empty?`, `data-pending?`. The search landmark carries
`data-search-page-part="search"` and the results region `data-search-page-part="results"`, the
hooks the behaviour contract locates them by.

## Pattern tokens (declared on root)

| Token | Value | (std/compact/comfortable) |
| --- | --- | --- |
| `--pm-page-padding-x` | `var(--pm-space-7)` | 32 / 28 / 36 |
| `--pm-page-padding-y` | `var(--pm-space-6)` | 24 / 20 / 28 |
| `--pm-page-max-width` | `calc(var(--pm-space-10) * 9)` | 864 / 738 / 990 |
| `--pm-content-gutter` | `var(--pm-space-6)` | 24 / 20 / 28 |

**The measure is nine of `--pm-space-10`.** Results are read as lines: a result is a title, a
supporting line under it and a short fact at its end. ListPage's thirteen are for a table's
columns, and a list row that wide puts its fact a long way from the title it belongs to. At nine
the content box is 800px at the standard density. A row of four `sm` Selects takes about half of
it, so a FilterBar's clear control and its count share the Selects' line. The content box stays
wider than FilterBar's `36rem` line at every density (682px at compact), so a FilterBar keeps
its clusters in one row. FormPage's seven are 518px at compact, where a FilterBar stacks every
cluster on a line of its own and the filters take four rows above the first result.

### In a narrow region

The page scope's narrow step is ListPage's, cited whole (`list-page.md`, "In a narrow region"):
below a `40rem` region, both paddings step down one rung, and the root is a container in both
directions. The filter row already wraps, and a FilterBar stacks its own clusters below its
`36rem` container, so a narrow page needs nothing more.

## Recipe (exact tokens)

| Part | Tokens |
| --- | --- |
| root | max-width `--pm-page-max-width` · margin-inline `auto` · padding `--pm-page-padding-y` `--pm-page-padding-x` · column · row-gap `--pm-content-gutter` · `container-type: inline-size` |
| search | column · row-gap `--pm-space-3` · no margin, so the `<form>` lays out as the `<div>` does *(the field and its filters are one block. Their gap is the filter row's own gap, so the block reads as one query, and the page's gutter separates it from what the query found)* |
| query | the field spans the column *(the column stretches it. Its end lines up with the results' end; a narrower field would give the page two right edges, and the measure already keeps it from growing past a line of results)* |
| filters | `<Inline gap={3} wrap>` · controls `sm` by convention, as ListPage's filter row |
| results | column · row-gap `--pm-content-gutter` · not panelled *(a group is a Heading over a List, and the List's ruled rows sit on the page background. Each group brings its own `Stack gap={3}`, so the heading sits closer to its list than to the group above it)* |
| empty results | `<EmptyState …emptyState />` in the results region |

**Why the body is not a panel.** ListPage's body is one table, and a table needs a frame.
A search page's body is several groups of different kinds, each with a heading. A panel around
all of them would be one box holding several named regions, and a panel around each would be a
Card, which is the application's composition and not the page's.

**Hierarchy laws.** One `<h1>` (PageHeader's). The page's one solid Button, if any, is in
`actions`. Filters use `sm` controls and never a solid Button. The submit Button inside the
field is `ghost`/`neutral`, because the field is the page's subject and Enter submits it. The
empty state's way out is a `ghost`/`neutral` secondary, such as "Clear filters".

## States

| Entry | Render | Expect |
| --- | --- | --- |
| before a query | a SearchInput and four `sm` Selects, no results | — |
| results in groups | two groups, each a Heading over a List of results, the first with a CursorPagination | — |
| one list of results | a FilterBar with a `resultCount`, one List | — |
| nothing found | `empty` with a search-flavoured EmptyState and a "Clear filters" secondary | `data-empty` |
| searching | `pending` over the last results, the submit Button `loading` | `data-pending` |
| submitted with a button | `onSubmit`, a FormField with an Input whose `trailing` is a submit Button | — |

`requiredSelectors`: none. Every state comes from a prop.

## Motion

None of its own. The swap between results and the EmptyState is instant, because a page that
searches as the reader types changes its results on every keystroke, and a crossfade on each
change would be motion the reader did not ask for. EmptyState enters by its own
`emptystate.enter`. A page that fades in uses AppShell's page transition, like every other page.

## Icons

None of its own. Slotted members bring theirs (`search` in a SearchInput or on the submit
Button).

## Behaviour and A11y

The page is a plain region inside `<main>` (AppShell owns the landmark). PageHeader's `<h1>` is
its only one. The field and the filters are inside a `search` landmark named `searchLabel`.
With `onSubmit` the landmark is a `<form>` with `noValidate`: Enter in the field calls
`onSubmit` once, the browser does not navigate, and so does a press on a submit Button in it.
The application decides what an empty query means, so the browser draws no validation bubble.
Without `onSubmit` there is no form, and Enter in the field does nothing of the page's.

The results region is not a named region. Each group names itself with its Heading and its
List's `label`, and a region with a name of its own would add a required prop and a second
name for what the landmark and the headings already say. While `pending` the region is
`aria-busy`, and the last results stay in it. The swap between results and the EmptyState
moves no focus, because the reader's place is the field. The page announces nothing of its own:
FilterBar's `resultCount` announces the count, and EmptyState is read where it appears.

```contract
role search search
name search from searchLabel
key Enter activates on field when submitted with a button
click activates on submit when submitted with a button
attr results aria-busy="true" when searching
```

What the grammar cannot state is held by `searchPageLaw` (`packages/conformance/src/search-page.ts`):
that Enter calls `onSubmit` once and the browser stays on the page, that the landmark is a form
exactly when `onSubmit` is given, that focus stays in the field through the swap both ways, that
`pending` marks the results and keeps them, and that no state of the page holds a live region of
its own.

## Platforms

On iOS and Android SearchPage is `native`. Its native contract takes `loadStatus` and `onRetry`
as every page archetype's does, and `loadStatus` owns `empty` and `pending` by name
(`LOAD_STATUS_OWNS` in `packages/native/src/mapping.ts`), as it owns ListPage's `empty` and
AuthPage's `pending`. The field and the filters render in every load state, and the results
region is what the state replaces (`design/native/screen-contract.md`). Neither platform has a
search landmark: the field and the filters are a group named by `searchLabel`. With `onSubmit`
the keyboard's return or search key in the field submits, and so does a `submit` Button in the
group. Neither platform has a busy state for a view, so the results are not marked busy while a
search runs, and the page's identifier carries `status=loading` (iOS lists it in
`PLATFORM_GAPS`).
