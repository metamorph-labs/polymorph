# ListPage (archetype)

The records screen: header → filters → table → (empty). Slots enforce the hierarchy, so a
ListPage cannot be assembled in the wrong order. It owns the `--pm-page-*` pattern-scope
namespace (rule 6, the same containment as `--pm-shell-*`). A list whose selected item is read
beside it is a MasterDetailPage (`master-detail-page.md`), not a ListPage with the detail drawn
under the table.

## Anatomy

```
[root — the page inside AppShell's content region]
  [PageHeader — from props]
  [summary slot? — a Grid of Stats in Cards]
  [filters slot? — an Inline row]
  [body:
     Table (children)          — when `empty` is false
     EmptyState (from props)   — when `empty` is true
  ]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `title` / `description` / `actions` | as PageHeader | `title` required | passed through. ListPage owns the only PageHeader |
| `summary` | `ReactNode` | — | the band above the filters (the section cards of a common dashboard composition): the page's headline numbers, shown before any row. A `Grid` of Stats in Cards, by convention |
| `filters` | `ReactNode` | — | sm-size controls by convention (Input `search`, Selects) |
| `empty` | `boolean` | `false` | switches body to the empty state |
| `emptyState` | `EmptyStateProps` | required | the completeness law: the page cannot be built without deciding its empty state |
| `children` | Table composition | required | |

Attributes on root: `data-empty?`.

## Pattern tokens (declared on root)

| Token | Value | (std/compact/comfortable) |
| --- | --- | --- |
| `--pm-page-padding-x` | `var(--pm-space-7)` | 32 / 28 / 36 |
| `--pm-page-padding-y` | `var(--pm-space-6)` | 24 / 20 / 28 |
| `--pm-page-max-width` | `calc(var(--pm-space-10) * 13)` | 1248 / 1066 / 1430 |
| `--pm-content-gutter` | `var(--pm-space-6)` | 24 / 20 / 28 |

`--pm-content-gutter` is the vertical rhythm between page regions (header→filters→
table). The other page archetypes re-declare the same namespace with their own values.
The namespace is per pattern instance, which is why containment matters.

### In a narrow region

How a page adapts to a narrow region, using container-first responsiveness
(`docs/layout.md`). This is the canonical statement, and every page archetype refers to it.

| Token | Below a `40rem` region | |
| --- | --- | --- |
| `--pm-page-padding-x` | `var(--pm-space-6)` | one space step down |
| `--pm-page-padding-y` | `var(--pm-space-5)` | one space step down |

The step is one step down the scale, not a new number. The scale is the vocabulary at
every width, and a second set of fixed values would make responsive spacing impossible to
adjust in one place. `40rem` is a rem literal with a comment in the stylesheet, because a
breakpoint is geometry, not theme (`docs/layout.md`). The narrow value is re-declared on
the page's **own root**, in the page's own sheet, so red rule 6 holds at every width and a
change still has one place to go.

**The page is a container in two directions.** Outward it is the subject of a *query*,
answered by the region that holds the page: AppShell's content area, which declares
`container-type: inline-size` for this. A container query is answered by the nearest
*ancestor* container, and no element can read its own width. Inward, the page root
declares `container-type: inline-size` itself, so it is the container everything on the
page measures against. Its **content box** is exactly the room those regions have, because
the inset is subtracted before the query is answered. That is the width a filter row, a
stat grid or a table actually gets. A Table on a padded page is not as wide as the window,
and a layout that assumes it is will be wrong by exactly the padding.

As a result, a page in a **narrow region on a wide monitor** steps down exactly as a page
on a phone does. Members adapt to their container, not the window (`docs/layout.md`).

## Recipe (exact tokens)

| Part | Tokens |
| --- | --- |
| root | max-width `--pm-page-max-width` · margin-inline `auto` · padding `--pm-page-padding-y` `--pm-page-padding-x` · column · row-gap `--pm-content-gutter` · `container-type: inline-size` *(see "In a narrow region")* |
| summary row | rendered bare, with no wrapper of its own, because the page's `row-gap` already sets the rhythm, and a slot that added its own would be deciding the page's spacing from inside. `Grid columns={4} gap={6}` by convention, which follows Grid's ceiling ladder (4 → `ceil(4/2)`=2 → 1) against the page's own content box |
| filters row | `<Inline gap={3} wrap>` · controls `sm` by convention. It already wraps, so a narrow region needs nothing more |
| body | the body region is a panel in **Card's surface recipe exactly** (`--pm-bg-surface` · `1px solid --pm-border-subtle` · `--pm-radius-lg` · `var(--pm-shadow-raised), var(--pm-shadow-inset-top)` *(follows the top light of the `surface` row in `card.md`'s recipe; "exactly" is the requirement)* · `overflow: clip`). A bare table with no panel is rejected: Dashboard panels its tables, so the two archetypes would disagree, and a bare table looks unfinished under every system. The theme decides what a panel looks like: elevated seats it, flat rules it. The empty state renders inside the same panel (a table filtered to nothing is still the table's region, empty) |
| empty body | `<EmptyState …emptyState />` centred in the table's place |

**Why `summary` is a slot and not the top of `children`.** There are two reasons, and the
first is a law. The body region is a panel in Card's own surface recipe, and cards do not
nest (`card.md`), so four stat cards inside it would be boxes inside a box. Second, the
band must outlive the body swap, because a filter that matches nothing does not change how
many records exist. In `children`, the page's own numbers would disappear exactly when a
reader is asking why the list is empty.

**Hierarchy laws.** One `<h1>` (PageHeader's). One solid Button per page (in `actions`).
Filters use `sm` controls and never contain a solid Button. The empty state's action is
`soft`, because the page's primary stays the primary even when the list is empty.
Dangerous bulk actions belong to DataTable's bulk bar, under its own restrictions
(`data-table.md`: `soft/danger`, routed through ConfirmDialog).

## States

| Entry | Render | Expect |
| --- | --- | --- |
| full | header + filters + 5-row table | — |
| no filters | omit slot | gutter collapses correctly |
| with a summary | `summary` = a 4-up stat Grid | band sits between header and filters, and **outlives the body swap** |
| empty | `empty` + emptyState | `data-empty`, EmptyState rendered, table absent |
| filtered-dry | `empty` + search-flavored emptyState | secondary "Clear filters" present |
| dense data | `<DensityScope value="compact">` around body (a contextual density scope) | rung-2 exception renders |

`requiredSelectors`: `[data-empty]`.

## Motion

Body swap (table ⇄ empty): `fade` at `--pm-motion-duration-surface`. No layout animation,
because the heights differ. At `none`: instant.

## Icons

None of its own (slotted content brings theirs).

## A11y

The page is a plain region inside `<main>` (AppShell owns the landmark). Filter controls
associate labels via FormField or `aria-label` (search inputs). The empty ⇄ table swap moves
no focus, because the user's context is the page, not the body.
