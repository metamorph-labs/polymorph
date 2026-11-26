# Dashboard (archetype)

The overview screen: a stat row and two weighted content regions. It is deliberately not a
widget canvas. Regions are named and fixed. A product that needs free-form layout needs a
canvas builder (a non-goal; see `docs/concepts.md`), not an archetype.

## Anatomy & API

```
[root — inside AppShell content]
  [PageHeader]
  [stats region — Grid of Stat-in-Cards]
  [body grid: [primary region (2fr)] [secondary region (1fr)]]
```

| Prop | Type | Notes |
| --- | --- | --- |
| `title` / `description` / `actions` | as PageHeader | the actions law applies (at most one solid, and usually none, because dashboards are for observing) |
| `titleEdit` | `ReactNode` | PageHeader's: an InlineEdit of the title, for an overview of one thing the reader names, such as an environment. Passed to the PageHeader only when given |
| `stats` | `StatProps[]` (2–4) | each rendered in a Card. More than 4 is a table in tile form. A stat whose number has not arrived takes Stat's `loading` (`stat.md`), so the row keeps its cards, their labels and their height while the numbers load |
| `primary` | `ReactNode` required | the main Cards/Table column |
| `secondary` | `ReactNode` | the narrow column; omit ⇒ primary spans full |

| Component | Prop | Type | Notes |
| --- | --- | --- | --- |
| `Dashboard.Panel` | `title` | `string` | the region's name, drawn as an `h2` with the section-heading recipe (§Recipe); omit ⇒ no heading |
| | `children` | `ReactNode` required | the region's content: a Table, a list, a chart |

## Pattern tokens (declared on root)

| Token | Value | (std/compact/comfortable) |
| --- | --- | --- |
| `--pm-page-padding-x` | `var(--pm-space-7)` | 32 / 28 / 36 |
| `--pm-page-padding-y` | `var(--pm-space-6)` | 24 / 20 / 28 |
| `--pm-page-max-width` | `calc(var(--pm-space-10) * 13)` | 1248 / 1066 / 1430 (ListPage's width, so the two overview archetypes match) |
| `--pm-content-gutter` | `var(--pm-space-6)` | between all regions and within both grids |

Container-first responsiveness (`docs/layout.md`): the root declares
`container-type: inline-size` and steps `--pm-page-padding-x` / `-y` one space token down
below a `40rem` region. The rule and its reasoning are stated once in `list-page.md` §In a
narrow region. Both grids on the page then measure the page's content box, which is exactly
the width they occupy, because the inset is subtracted before the query is answered.

## Recipe

| Part | Tokens |
| --- | --- |
| stats region | `repeat(N, minmax(0, 1fr))` for `N = stats.length`, gap `--pm-content-gutter`; each Stat inside a Card (Card's padding; Stat's internal gaps). This is archetype-internal CSS rather than the `Grid` primitive, on purpose: this row's gutter is the page's own token, and `Grid`'s `gap` takes a space step, so using `Grid` would replace the page's adjustable rhythm with a fixed number |
| stats region, narrow page | follows **Grid's rule**, with the same ladder and literals: `ceil(N/2)` from `28rem` to `44rem` (2→1, 3→2, 4→2), one column below `28rem` *(the same decision as `grid.md`'s. It is written out here because the mechanism cannot be shared, but the rule can. The page answers the query, and its content box is exactly this row's width)* |
| body grid | `2fr 1fr` columns (archetype-internal CSS, because the Grid primitive's no-spans law sends weighted layouts here, as `grid.md` states) · gap `--pm-content-gutter` · `minmax(0, …)` on both tracks so tables scroll inside their panels |
| body grid, narrow page | single column below a `44rem` page *(two columns follow Grid's rule for N=2, weighted or not. A 2fr/1fr split on a phone is a narrow column beside a narrower one, and the secondary region turns into a margin. Stacked, it stays present and second)* |

**Dashboard.Panel**: the archetype's own part, so naming a region is anatomy rather
than an ad hoc composition:

```
[Dashboard.Panel { title?: string, children }]
```

Recipe: Card verbatim, with `title` as Card's `title`: an overline heading using **the**
section-heading recipe (SettingsRow.Group's: `text.xs` quartet + uppercase ·
`--pm-text-secondary`) with margin-bottom `--pm-space-4`, rendered as `h2`. A Panel
holding a Table keeps Card padding and lets the table run edge-to-edge of the content
box (`table.md`'s bare-table rule applies inside the padding, not against it).

## States

Entries: 3 stats + primary table Panel + secondary Panels; 4 stats; no secondary;
Panel without title; a title edited in place (`titleEdit`); the numbers loading (each stat's
`loading`, and the chart's in its Panel). `requiredSelectors`: —.

The native renderings take `titleEdit` and draw nothing for it (`packages/native/src/undrawn.ts`),
for PageHeader's reason (`page-header.md`).

## Motion — composed only. Icons — composed only. A11y — Panels' titles are `h2`s;
the stat row comes before the panels in DOM order, matching the visual scan.

Each Stat whose `loading` is set is busy, as `stat.md` states, so a page loading its numbers
says so in every card.

```contract
announces busy when the numbers loading
```
