# Breadcrumbs

Breadcrumbs show the reader's location in a hierarchical product. There is no
substrate: an `<ol>` with links, a chevron separator, and a Menu for the collapsed
middle.

## Anatomy

```
[nav aria-label="Breadcrumb"]
  [ol]
    [li: crumb (Link grammar)] [separator: Icon "next"]
    [li: overflow (iconOnly ghost "overflow" → Menu of hidden crumbs)]?
    …
    [li: current page — text, not a link, aria-current="page"]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `items` | `{ label: string; href?: string; onSelect?: () => void }[]` | required | last item is the current page; its `href`/`onSelect` are ignored |
| `onNavigate` | `(href: string) => void` | — | the routing seam (`link.md` §Routing) for every crumb with an `href`: a click the browser would follow in this tab, and a crumb chosen from the overflow Menu, go to `onNavigate(href)` instead of the browser |
| `maxItems` | `number` | `4` | beyond it: first crumb + overflow + last two. `Infinity` disables collapsing |
| `label` | `string` | `'Breadcrumb'` | the `<nav>` landmark's name (the localization seam), like Pagination's `label`. Localized apps pass their catalog value |
| `overflowLabel` | `string` | `'Show path'` | the overflow control's accessible name (the localization seam) |

Attributes: the current item has `aria-current="page"`. Collapsing is layout policy,
not state, so it has no `data-*` attribute.

A crumb with an `href` is an `<a>` and follows Link's routing rule: a click with a modifier
key or another button stays the browser's. A crumb in the overflow Menu is a command, not a
link, so choosing it always goes to `onNavigate`, and without `onNavigate` the member opens its
`href` as a link would. An item's own `onSelect` runs as it does without `onNavigate`: beside a
click on a crumb, and in place of the navigation when the crumb is chosen from the Menu.

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| row | `text.sm` quartet · gap `--pm-space-2` · single line, no wrap (the trail shortens by collapsing, never by wrapping, because a trail on two lines reads as two locations) |
| row, short of room | a row wider than its container narrows its crumbs, each to an ellipsis: it stays one line and does not cross the container, which on a phone would pan the page. Collapsing counts crumbs and knows nothing of width, so four crumbs that fit a desktop header can be wider than a phone. The crumbs between the first and the current page narrow first, as it is the middle the overflow takes, each down to `--pm-space-6`. The first crumb and the current page narrow only when every crumb between them is at that floor. The separators and the overflow trigger keep their width |
| crumb | Link's recipe verbatim (`link.md`): `--pm-text-secondary`, hover `--pm-text-primary` + underline, the shared focus ring (conventions §4) |
| crumb label | max-width `calc(var(--pm-space-10) * 2)` · ellipsis (a 40-char document title is for the current page to show in full, not the trail) |
| separator | Icon `next` `sm` · `--pm-text-muted` · decorative |
| overflow trigger | Button `ghost/neutral/sm iconOnly icon="overflow" label="Show path"`; opens Menu of the hidden crumbs in order |
| current | `--pm-text-primary` · no underline · no hover (it is a location, not an action) |

## States

| Entry | Render | Expect |
| --- | --- | --- |
| two levels | 2 items | last `aria-current="page"` |
| four levels | 4 items | no overflow yet |
| collapsed | 6 items | overflow trigger present; first + last two visible |
| overflow open | `defaultOpen` on the menu | menu items = hidden crumbs |
| long labels | one 60-char crumb | ellipsis |

`requiredSelectors`: `:hover`, `:focus-visible`, `[aria-current="page"]`.

## Motion

No motion of its own. The overflow Menu brings Menu's motion (`menu.content` + the
`menu.items` cascade). Crumbs are navigation, and navigation does not animate (the
AppShell rail's rule).

## Icons

`next` (separator, decorative; in RTL the map's directional pairing flips it to
`back`'s glyph), `overflow` (labelled trigger).

## A11y

`<nav aria-label="Breadcrumb"><ol>` per WAI-APG; separators are `aria-hidden`; the
overflow Menu announces as "Show path". The current page is text with
`aria-current="page"`, never a link to itself.

## Agent

An agent reads the path's crumbs, in order, and follows one by its label, as a person does: a
crumb on the trail is pressed, so the browser goes to its `href` or `onNavigate` routes it, and a
crumb the overflow hides runs as its entry in the overflow Menu does. Each crumb is a choice
whose id and label are its `label`. The current page, the last crumb, is a disabled choice,
because it is never a link to itself, and so is a crumb with no destination, which is text. Two
crumbs with one label are one choice, the first. The overflow Button and its Menu are the trail's
own parts, so the trail withholds them: an agent follows a hidden crumb with `choose`, without
opening the Menu.

```agent
state items choices
action choose id calls onNavigate
withholds contents when collapsed
```
