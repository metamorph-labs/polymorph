# Tabs

Switches between peer views of one thing, showing one at a time. The views are panels of one
page. Links between sibling pages, each with its own address, are a SectionNav
(`section-nav.md`).

Radix `@radix-ui/react-tabs`. There is one variant, underline, on purpose. Boxed and pill
tabs are the same decision re-made with more chrome, and the underline works in every
system (a soft rule under pastel, a sharp rule under terminal).

## Anatomy

```
[root]
  [list — row of triggers over a full-width baseline rule]
    [trigger: [icon?] [label] [count Badge?]]*
    [active indicator — one sliding rule]
  [content panel]*
```

## API

| Component | Prop | Type | Default | Notes |
| --- | --- | --- | --- | --- |
| `Tabs` | `tabs` | `{ value: string; label: string; icon?: IconRole; count?: number; disabled?: boolean }[]` | required | |
| | `value` / `defaultValue` / `onChange(value)` | `string` | first tab | |
| | `children` | one `Tabs.Content value=…` per tab | required | |
| | `keepMounted` | `boolean` | `false` | inactive panels stay mounted and `hidden` (Radix `forceMount`), so a form mid-edit or an embedded player survives a tab switch. The default unmounts, because mounting every panel is too costly for the common case |
| | `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | vertical for settings-style side rails: the list becomes a column, the indicator slides on y/height instead of x/scaleX, and arrow keys follow the axis (Radix's own model) |
| `Tabs.Content` | `value` | `string` | required | the tab this panel belongs to, one of `tabs`' values |
| | `children` | `ReactNode` | required | the panel's content, shown while its tab is active |

Attributes: triggers `data-state="active|inactive"`, `data-disabled?`;
`data-orientation="horizontal|vertical"` on root, list, triggers **and** content. The
substrate sets it on all four (the list gets it through roving-focus slot merging). The
spec records the DOM that renders, not one package's dist. The root also carries `dir`,
the document's reading direction, which the member hands to its substrate, and the
recipe's edge fade reads it.

## Recipe (exact tokens)

| Part | Tokens |
| --- | --- |
| list | row · gap `--pm-space-5` · full-width bottom rule `1px solid --pm-border-subtle`, drawn by the root so it spans the container |
| list, wider than its container | scrolls on the inline axis · edge fade `--pm-space-6` wide at an edge with more tabs beyond it · scroll padding `--pm-space-6` plus the focus room · where the fade is not supported, a thin scrollbar on `--pm-border-strong` |
| list, focus room | padding of `--pm-focus-offset` + `--pm-focus-width` (at least `--pm-space-2`, for the halo) on every side, taken back by negative margins except at the inline end |
| vertical list | column · gap `--pm-space-1` · intrinsic block size · start-edge rule `1px solid --pm-border-subtle` ending with the final trigger |
| trigger | `text.sm` quartet · padding `--pm-space-3` 0 · color `--pm-text-secondary` · gap `--pm-space-2` to icon (`sm`, muted) / count Badge (soft neutral) |
| trigger hover | color `--pm-text-primary` |
| trigger active | color `--pm-text-primary` · count Badge → soft accent |
| indicator | `2px` rule, bg `--pm-accent-bg`, sitting on the list rule under the active trigger |
| trigger disabled | `--pm-text-disabled`, no hover |
| focus | the shared focus ring, conventions §4 (the offset may overlap the rule; this is intended) |
| content | padding-top `--pm-space-5` · no other chrome; the content is composed from the vocabulary |

## Overflow

On the web, a horizontal list wider than its container scrolls inside it, on its inline
axis. The page never scrolls sideways because of it, and the baseline rule still spans
the container. There is no prop: a caller passes the same tabs and the member handles the
width it is given. A list that fits shows no fade and no scrollbar, and its triggers and
rule sit where a list that does not scroll has them.

- **The affordance.** An edge with more tabs beyond it fades out over `--pm-space-6`, and
  an edge with nothing beyond it does not. The fade is a mask on the list, driven by the
  list's own scroll position (a scroll-driven animation), so it needs no surface colour
  and no code. A list with nothing to scroll has no mask. With the fade the scrollbar is
  hidden. A browser without scroll-driven animations shows a thin scrollbar instead.
- **The current tab.** The member scrolls the list, and nothing else, until the current
  tab is inside it: when the list is laid out, when its own box changes size, and when
  the value changes. It never calls `scrollIntoView`, which would also scroll the page.
- **Focus.** The browser scrolls a tab that takes focus into view. The list's scroll
  padding keeps that tab, and the current one, clear of the fade.
- **The focus ring.** A scroll container clips at its padding edge, so the list is
  larger than its triggers by the ring's reach on every side. Negative margins keep the
  triggers where they are without that padding, except at the inline end, where a box
  past the container's edge would let the page scroll.
- **The indicator** is inside the list, so it scrolls with its tab.
- **A right-to-left list** starts at its right edge, and the fades swap sides. The recipe
  reads the direction from the root's `dir`.

The vertical list does none of this: it grows with its tabs, and the page scrolls. The
Compose row scrolls sideways as Android's scrollable tab row does. The SwiftUI row scrolls
sideways in a scroll view as wide as the strip, with its scroll indicator hidden, and brings
the current tab into view when the strip appears and when the value changes. A SwiftUI row
that fits draws no scroll view. Neither native row draws the edge fade: a trigger cut by
the strip's edge shows that the row scrolls.

## States

Entries: two-tab default, three tabs with icon + count, second active
(`defaultValue`), disabled tab, keepMounted (inactive panel in the DOM and `hidden`: out
of the layout and the accessibility tree, but still mounted), vertical, vertical with
the second tab active, which checks the side-rail indicator geometry both at rest and
after moving, and a strip wider than its container, in a box narrower than a phone with
the current tab past the box's end edge.
`requiredSelectors`: `[data-state="active"]`, `:hover`, `:focus-visible`,
`[data-disabled]`, `[data-orientation="vertical"]`.

## Motion

- Indicator slides between triggers: spring `default` on transform (translateX + scaleX,
  measured by the motion engine's `MotionIndicator`). Reduced motion / `none`: the
  indicator jumps (fade projection).
- Content swap: `fade` at `surface` class. No slide, because tabs are peers and have no
  direction.
- The scroll to the current tab follows the motion tokens without owning any, as
  Carousel's travel does. It is smooth only when the value changes, the surface duration
  is above zero and the reader has not asked for reduced motion. The first placement and
  one after a resize are instant, because they are layout. The edge fade follows the
  reader's own scroll and has no duration.

## Icons

Per-tab `icon`, decorative.

## A11y

Radix tabs semantics: `tablist`/`tab`/`tabpanel`, arrow-key roving focus, automatic
activation (Radix default: selection follows focus, which is acceptable because a law
keeps the content swap to a `fade`). Home and End move to the first and last tab. Count Badges
are text and are announced normally. In a strip wider than its container the keys reach
every tab, including one scrolled out of view, and the tab that takes focus is scrolled
into view.

```contract
role list tablist
role tab tab
role tabpanel tabpanel
key ArrowRight moves-focus-next on tab
key ArrowLeft moves-focus-previous on tab
key ArrowRight selects on tab
key Home moves-focus-first on tab
key End moves-focus-last on tab
key ArrowDown moves-focus-next on tab when vertical — the same strip
attr list aria-orientation=vertical when vertical — the same strip
key End moves-focus-last on tab when wider than its container
```

## Agent

An agent reads the current tab and the tabs it can choose, and chooses one by its `value`. A
choice goes through the member's own value, so `onChange` reports it as it reports a person's,
whether or not the caller controls it, and the chosen tab's panel is the one shown. A disabled tab
is refused, as a person cannot open it. The tab list names the strip, by its tabs' labels. The
panels are the application's, so the member withholds nothing: the members in a panel are the
screen's own, and each registers as itself.

```agent
state value id
state tabs choices
action choose id sets value calls onChange
```
