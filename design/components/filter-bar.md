# FilterBar

The filter row of a records screen, as on Relay's list screens. It holds search, filter
controls, a clear control shown only while something is filtered, and the result-count
announcement that ListPage leaves to it.

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `search` | `ReactNode` | — | a SearchInput `sm` by convention |
| `children` | filter controls | — | Select `sm` with `emptyOption` per control (the neutral choice law) |
| `isFiltered` | `boolean` | required | drives the clear affordance |
| `onClear` | `() => void` | required with `isFiltered` | |
| `resultCount` | `{ shown: number; total?: number }` | — | renders "`{shown} of {total} results`" and announces changes. `total` is optional, because a cursor-paged list holds a window and has no total. Then the text is "`{shown} results`", never an invented total |
| `messages` | `{ clear: string; resultCount: (count: { shown: number; total?: number }) => string }` | English | the bar's two strings (the localization seam): the clear control's label and the count. The count is a function, because plural rules and word order belong to the app's catalog. All keys or none |

Attributes: root `data-filtered?`.

## Recipe (exact tokens)

Root: `<Inline gap={3} wrap>` grammar (row-gap = column-gap). Order: search, filters,
clear, count.

| Part | Tokens |
| --- | --- |
| clear | Button `ghost/neutral/sm icon="clear" label="Clear filters"`, rendered only while `isFiltered` |
| count | `text.sm` · `--pm-text-muted` · margin-left auto (right-aligned on the row) |
| root | `container-type: inline-size` · `inline-size: 100%` *(container-first responsiveness: the 100% is required, because a size container's width does not come from its contents)* |
| clusters, narrow container | `flex: 1 0 100%` below a `36rem` **container**, so every cluster takes its own line *(a search field, a filter and a count side by side in a 340px row are too narrow to use; stacked, each is usable)* |

All controls `sm` (conventions: filters never compete with the page's primary).

**This is the vocabulary's toolbar.** Container-first responsiveness (`docs/layout.md`) says
toolbars wrap. There is no "Toolbar" member; this is the row the rule refers to. An `Inline`
with `wrap` uses one gap for both axes. Below the `36rem` container threshold, wrapping no
longer helps and each cluster takes its own line. `36rem` is a rem literal with a comment,
because a breakpoint is geometry, not theme. PageHeader's title/actions row and ListPage's
filter row already wrap and need nothing extra. The narrow rule is written `.bar > * > *` and
reaches through the bar's own `Inline`. A component may depend on its own anatomy, and
`Inline`'s props are deliberately closed, so the rule cannot be passed as a prop.

## States

Entries: unfiltered (no clear), filtered (clear shown), with count, wrapping (narrow
container). `requiredSelectors`: `[data-filtered]`.

## Motion

The clear button appears and disappears with `fade` (`control`). Count text updates are not
animated, because numbers change instantly and only surfaces animate.

## Icons — `clear` (plus composed controls' own). A11y — the count is wrapped in an
`aria-live="polite"` region announcing "`{shown} of {total} results`" after filter
changes settle. ListPage announces nothing itself, so a screen using FilterBar inside ListPage
gets the announcement without extra work. Controls carry their own labels (`aria-label` on
filter selects that have no visible label, per Relay's pattern).

## Agent

An agent reads whether anything is filtered and the result count the bar shows (empty when the
application gives none), and clears the filters, which calls `onClear` as the clear Button
does. The filters belong to the application, so they clear when it passes the cleared state
back. While nothing is filtered there is no clear Button, so a clear fails. The clear Button is
the bar's own part, so it is withheld and the bar's `clear` stands in its place. The search
field and the filter controls are the application's own members: they stay an agent's, listed
within the FilterBar, and an agent fills and chooses in them. The FilterBar has no name of its
own: an agent finds it by the members within it.

```agent
state filtered boolean as root data-filtered
state result-count text
action clear calls onClear when filtered
withholds contents when filtered
```
