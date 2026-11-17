# SectionNav

A SectionNav is the row of links between the sibling pages of one section of a product, with
the page the reader is on marked. It is not Tabs: a tab shows a panel of the same page and has
no address, and a SectionNav item is a link to a page, which the browser opens in a new tab,
copies and goes back from. It is not Breadcrumbs, which lists the page's ancestors, and it is
not the AppShell rail, which is the product's first level. There is no substrate: a `<nav>`
around a list of links.

## Anatomy

```
[nav aria-label]
  [ul]
    [li] [a: item — aria-current="page" on the current one]
           [label]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `label` | `string` | required | the `<nav>` landmark's name. It has no default, because a page with an AppShell rail or Breadcrumbs already has a navigation landmark, and a reader tells them apart by name |
| `items` | `{ label: string; href: string }[]` | required | one link per sibling page, in the order drawn |
| `current` | `string` | — | the `href` of the item whose page the reader is on. The app decides it, because which paths belong to an item is the router's knowledge. Without it, or with an `href` that matches no item, no item is current |
| `onNavigate` | `(href: string) => void` | — | the routing seam (`link.md` §Routing) for every item: a click the browser would follow in this tab goes to `onNavigate(href)` instead of the browser |

Attributes: the current item has `aria-current="page"`. The member has no `data-*` state of
its own.

The current item stays a link. `current` may name the item for a page below that item's own
(`/users/42` under Users), and the link is the way back to it.

**Matching.** `current` is compared with each item's `href` as the page each names: the path,
without an origin, a query, a hash or a trailing slash. A router's location often carries one of
them where the item's `href` does not, and an exact comparison would then mark no item and
report nothing. So `/identity/users/`, `/identity/users?page=2` and
`https://app.example.com/identity/users` (`location.href`) all mark the item whose `href` is
`/identity/users`.

- An item whose `href` is exactly `current` comes first. Items that differ only by a query
  (`/reports?range=week`, `/reports?range=month`) can therefore each be current.
- An `href` that is only a hash or a query (`#users`) is compared as written, because there the
  hash or the query is the whole address.
- `current` is the address of the page being shown, so its origin is the document's. An item
  written without an origin is on that origin and matches on its path. An item written with an
  origin matches only a `current` written with the same one, so a link to another site with the
  same path is never marked. The member does not read `location`, which a server render has
  none of, so it cannot compare an item's origin with a `current` that has none.
- No path below an item's own is matched. `/identity/users/42` marks nothing: the app passes
  the item's `href` for it.
- At most one item is current, the first that matches. Two items may share an `href`; both are
  drawn, and the first is marked.

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| list | gap `--pm-space-1` · wraps onto further lines, so every item is on screen at any width |
| item | block-size `--pm-control-height-sm` · padding-inline `--pm-space-3` · `text.sm` quartet · `--pm-text-secondary` · radius `--pm-radius-md` · no underline · the shared focus ring (conventions §4) |
| item, hover | `--pm-text-primary` on `--pm-bg-subtle`, not on the current item |
| item, current | `--pm-selection-text` on `--pm-selection-bg`: the selection treatment the AppShell rail gives its current item (`README.md` §11), so a current location looks the same at both levels |
| label | one line, clipped with an ellipsis when it is wider than the row |

**On Android**: each item reserves the 48dp hit target in the layout and its pill stays
`--pm-control-height-sm` tall, so once the row wraps, each line is at least 48dp tall and the
touch areas on neighbouring lines do not overlap. iOS reserves its 44-point hit target the same
way.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| the first page is current | 4 items, `current` the first | first item `aria-current="page"` |
| a later page is current | 4 items, `current` the third | third item `aria-current="page"` |
| no page is current | 4 items, no `current` | no `aria-current` |
| many pages | 9 items | the row wraps |
| a long label | one 70-character label | ellipsis, no sideways scroll |

`requiredSelectors`: `:hover`, `:focus-visible`, `[aria-current="page"]`.

## Motion

Hover and press use the shared colour feedback (`stateFeedback`, `pressable`). The current
mark does not slide between items: the items are pages, and navigation does not animate (the
AppShell rail's rule).

## Icons

None.

## A11y

`<nav aria-label>` around a `<ul>`, so a screen reader announces the landmark by name and the
number of pages. Each item is a real `<a href>`. The current item carries `aria-current="page"`
and is marked by a filled shape as well as a colour.

```contract
role root navigation
name root from label
attr item aria-current=page when the first page is current
key Enter activates on item
```

## Agent

An agent reads the current page and the pages the section links to, and follows a link as a
press on it does: the browser goes to the page, or `onNavigate` is called with its `href` when
the application routes. Each page is a choice whose id is its `href` and whose label is its
label, and the current page's id is its `href`, or `null` when no item is current. The current
page stays a link, so following it is allowed. Two items that share an `href` go to one page,
so the second is not a choice of its own.

```agent
state current id
state items choices
action choose id calls onNavigate
```
