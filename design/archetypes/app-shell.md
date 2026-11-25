# AppShell (archetype)

`transitionKey` and `pending` opt the main content region into the shared page
fade and foreground navigation ribbon. They do not key or replace the page's
children, and shell navigation stays visible during arrivals. See
[page transitions](../conventions/page-transitions.md) for the application provider.

The application frame: topbar, collapsible sidebar, content region. It owns the
`--pm-shell-*` pattern-scope namespace. Those tokens exist exactly when an AppShell
is mounted, are declared on its root, and may be referenced only by files listed in
`packages/rules/scoped-token-owners.json` (red rule 6).

## Anatomy

```
[root — grid: banner? / sidebar | (topbar / content)]
  [skip link → #content]
  [banner? — a row across the frame]
  [sidebar <nav>]
    [head row: brand slot? + collapse toggle]
    [nav slot — AppShell.NavItem list] [footer slot?]
  [topbar <header>]
    [leading slot (breadcrumbs/search…)] [trailing slot (actions, user…)]
  [content <main id="content">]
    — hosts pages (ListPage etc.)
  [dock? — floating layer over the content cell, pinned to its foot]
```

With `navigation="top"` the parts and their document order are the same. At frame widths the
sidebar `<nav>` is laid at the start of the top row instead of down the frame's start, and the
topbar continues the row (§Navigation on top).

`ToastHost` wraps the shell, and the shell does not hold the toast viewport. The viewport sits
outside `<main>`, because the content region plays the page transitions, and outside any error
boundary, so a boundary's fallback can still raise a notice (`toast.md`). In Vue, Svelte, Solid
and Angular, `Toast.Viewport` takes `ToastHost`'s place, mounted once beside the shell.

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `sidebar` | `ReactNode` | required | nav content (vocabulary) |
| `navigation` | `'rail' \| 'top'` | `'rail'` | where `sidebar` is drawn at frame widths: down the frame's start, or along its top row before the topbar's slots (§Navigation on top). Below the drawer breakpoint both are the same drawer |
| `brand` | `ReactNode` | — | sidebar head slot |
| `sidebarFooter` | `ReactNode` | — | |
| `topbar` | `{ leading?: ReactNode; trailing?: ReactNode }` | — | |
| `banner` | `ReactNode` | — | one `Banner` (`banner.md`): the notice that holds on every page until its cause ends. It takes a row across the whole frame, above the rail and the topbar, and the frame under it shortens by its height |
| `dock` | `ReactNode` | — | a floating layer over the content region's foot, for an always-present control that *is* the product (a prompt, a player, a selection bar). A page with a dock leaves room at its foot. |
| `collapsed` / `defaultCollapsed` / `onCollapsedChange` | `boolean` | `false` | controlled or not |
| `children` | page content | required | |
| `contentLayout` | `'full' \| 'page'` | `'full'` | `'full'` gives the content region to a page archetype, which brings its own measure and insets. `'page'` is for a screen composed directly from controls with no archetype around it. The shell wraps `children` in a bounded, centred reading surface: max-inline-size `calc(var(--pm-space-10) * 16)`, padding `--pm-space-8`, stepping to `--pm-space-6` below a `40rem` region |
| `transitionKey` / `pending` | `string` / `boolean` | — / `false` | the page-transition opt-in described at the top of this spec. The key identifies the displayed page and restarts the arrival fade without keying or remounting `children`. `pending` reports foreground loading to the shared ribbon |
| `messages` | `{ primaryNavigation: string; expandSidebar: string; collapseSidebar: string; closeNavigation: string; openNavigation: string; skipToContent?: string }` | English | the names of the landmark and the navigation controls, desktop and mobile, and the skip link's text *(the localization seam: the skip link is the first thing a keyboard user meets on every page, so a host must be able to translate it)*. The five navigation names go together. `skipToContent` is optional only so an existing host keeps compiling. A localized host passes all six |

Attributes on root: `data-collapsed?`, `data-navigation="top"?`.

Localized hosts supply `messages` with `primaryNavigation`, `expandSidebar`, `collapseSidebar`,
`closeNavigation` and `openNavigation`. These labels cover the desktop and mobile navigation
controls. If omitted, the component's English defaults apply: "Primary", "Expand sidebar",
"Collapse sidebar", "Close navigation", "Open navigation" and "Skip to content".

## Routing

The shell is the frame around the app's router, not a page. The app mounts it once, at its root
route, and the router renders the current route's page as the shell's `children`. A page is a
page archetype (ListPage, DetailPage, FormPage, SettingsPage, Dashboard) with nothing between the
shell and it, because the archetype owns the page's heading, measure and load states. A route
composed directly from controls sets `contentLayout` to `'page'` while it shows. The shell stays
mounted while the route changes, so the rail keeps its collapse and its scroll.

- `transitionKey` is the route's location (its pathname), so each arrival replays the page fade.
- `pending` is the router's own pending state, so a route that loads data shows the ribbon.
- Each NavItem has an `href` and `onNavigate`, and a Breadcrumbs in the topbar takes the same
  `onNavigate` (`link.md` §Routing): a click routes, and a click with a modifier key opens a tab.
- `current` marks the item whose route is showing. The shell does not read the location, because
  which routes an item covers is the app's routing decision.
- A new `transitionKey` closes the small-viewport drawer. The drawer is the rail, and the reader
  has chosen a page from it. On iOS and Android the drawer closes the same way.
- A new `transitionKey` moves focus to the new page and says its title, as §A11y describes. The browser does
  neither when the app's router changes the page, so focus would stay on the link the reader
  followed, or fall to the document when that link leaves it. The first page is not an arrival,
  because the browser loaded it, and a page that is `pending` arrives when it is drawn.

An app whose rail routes through `onSelect` with no `href` keeps working, but its rows cannot be
opened in a new tab. A route renders a page archetype either way.

```tsx
// The root route: the frame, mounted once (TanStack Router).
function Root() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const pending = useRouterState({ select: (state) => state.status === 'pending' })
  const navigate = useNavigate()
  const route = (href: string) => void navigate({ href })

  return (
    <AppShell
      sidebar={
        <AppShell.NavGroup label="Support">
          <AppShell.NavItem
            icon="inbox"
            label="Tickets"
            href="/tickets"
            current={pathname.startsWith('/tickets')}
            onNavigate={route}
          />
          <AppShell.NavItem
            icon="settings"
            label="Settings"
            href="/settings"
            current={pathname === '/settings'}
            onNavigate={route}
          />
        </AppShell.NavGroup>
      }
      transitionKey={pathname}
      pending={pending}
    >
      <Outlet />
    </AppShell>
  )
}

// A route: one page archetype, which owns the heading, the measure and the load states.
function Tickets() {
  const tickets = ticketsRoute.useLoaderData()
  return (
    <ListPage
      title="Tickets"
      empty={tickets.length === 0}
      emptyState={{ title: 'No tickets yet', description: 'New tickets arrive here.' }}
    >
      <TicketTable tickets={tickets} />
    </ListPage>
  )
}
```

[consuming.md](../../docs/consuming.md#routing) has the same shell with React Router.

## Navigation on top

`navigation="top"` draws the navigation the shell already has, `sidebar` with its NavItems and
NavGroups, as a row along the frame's top instead of a rail down its start. It is for a product
with a few first-level destinations that wants the content region to have the whole width.
There is no second way to describe the links: the same parts go in `sidebar` in either layout,
and a frame that does not pass `navigation` is unchanged.

- **The row.** At frame widths the sidebar `<nav>` is the start of the top row: the brand, then
  the items. The topbar fills the rest of the row with its `leading` and `trailing` slots, on
  the same surface and over the same lower edge, so the two read as one bar. The nav's column is
  as wide as its items need, and the topbar keeps at least the width of its own content. A row
  wider than the frame wraps its items onto a further line, as SectionNav does, so every
  destination stays on screen and the frame never scrolls sideways.
- **Below the drawer breakpoint** the row is the same drawer the rail becomes, opened from the
  topbar's `menu` button, with the brand in its head and the items down it. A phone has no room
  for a row of destinations beside the brand and the topbar's slots, and a row that scrolled
  sideways would hide destinations at its end, as Tabs' strip does. The drawer shows them all,
  with the group labels, and is the frame's phone presentation on every platform.
- **Groups** are flattened. A NavGroup's items join the row, its overline is removed as in the
  collapsed rail, and a rule (`border.subtle`, as Separator's vertical one) is drawn before each
  group that does not start the row. The group keeps `role="group"` and its `aria-label`. A group is not a
  Menu behind its label: `menu.md` holds a Menu to commands, and a destination in a Menu cannot
  be opened in a new tab or reached without a second press.
- **Items** are NavItems as in the rail, as wide as their glyph, label and count. Hover steps to
  `bg.subtle`, because the bar is on `bg.surface`, which is the rail's hover fill. The current
  item keeps the selection treatment. Content in `sidebar` that is not a shell part keeps its
  own layout: a Stack of NavItems stays a column, so the items go into `sidebar` directly.
- **`collapsed`**, `defaultCollapsed` and `onCollapsedChange` narrow a rail, and a row has no
  rail to narrow. The collapse toggle is not drawn, `data-collapsed` is not set and no item shows
  a tooltip. The value is kept, so a frame that returns to the rail draws the collapse it holds.
- **`sidebarFooter`** stays the nav's last part. In the row it follows the last item, and in the
  drawer it is the foot. UserCard is the rail's foot and has no place in a row, so a frame with
  the navigation on top puts the account in `topbar.trailing`, as a Menu behind an AvatarButton.
- **Landmarks and keyboard.** There is one navigation landmark, the same `<nav>` named
  `messages.primaryNavigation`, before the topbar in the document as in the rail layout. Tab
  reaches the items, the footer and then the topbar's slots, which is the order the row is drawn
  in. Each item is a tab stop, with no roving tabindex, as in the rail.
- **iOS and Android** draw their own frame whatever `navigation` says: the stack with its drawer
  on a phone, and the split view or the rail beside the content on a tablet. Neither platform has
  a bar of first-level destinations for content an app composes. iPadOS's tab bar at the top is
  a `TabView`, which needs each destination's label and view, and `sidebar` is one opaque view.
  `packages/native/src/undrawn.ts` declares the field.

## Pattern tokens (declared on root — the shell's own decision surface)

| Token | Value | (std/compact/comfortable) |
| --- | --- | --- |
| `--pm-shell-topbar-height` | `calc(var(--pm-space-7) + var(--pm-space-6))` | 56 / 48 / 64 |
| `--pm-shell-sidebar-width` | `calc(var(--pm-space-10) * 2 + var(--pm-space-7))` | 224 / 192 / 256 |
| `--pm-shell-sidebar-width-collapsed` | `calc(var(--pm-space-7) + var(--pm-space-5))` | 48 / 42 / 54 |

The tokens are density-scoped by construction (they are space arithmetic), so a compact
theme gets a tighter frame with no extra declarations. Consumers (this file's CSS and
ListPage's sticky offsets) reference the tokens, never the arithmetic. Changing the topbar
height is a one-line edit to the shell's stylesheet (`pnpm proof` makes exactly that change;
see `docs/verification.md`).

Four more shell tokens are **emitted by the theme**, not declared here:
`--pm-shell-topbar-bg`, `--pm-shell-rail-bg`, `--pm-shell-topbar-border`,
`--pm-shell-rail-border`. Region surfaces are theme data. The derivation puts the topbar on
`bg.surface` and the rail on `bg.subtle`, and gives a flat theme `border.default` edges
where a shadowed theme keeps `border.subtle`. The shell consumes them and never re-derives
them.

## Recipe (exact tokens)

| Part | Tokens |
| --- | --- |
| root | grid: `var(--pm-shell-sidebar-width) 1fr` (collapsed: `-collapsed` width) · height `100dvh` *(not `100vh`: on phones `100vh` includes the collapsed browser chrome, which puts the shell's bottom edge behind the URL bar; see `docs/layout.md`. It uses the fallback pattern: a `100vh` base, with the `100dvh` override inside an `@supports (height: 1dvh)` gate, so engines without `dvh` still get a full-height shell. Two same-property lines side by side would be collapsed by a deduplicating minifier)* · bg `var(--pm-texture-page) var(--pm-bg-app)` *(the substrate carries the theme's texture, `none` where ornament says so)* |
| sidebar | bg `--pm-shell-rail-bg` · border-right `1px solid --pm-shell-rail-border` · padding `--pm-space-4` · row gap `--pm-space-2` *(region surfaces from the shell tokens above)* |
| rail head | min-height `--pm-shell-topbar-height` · align center · gap `--pm-space-2` · holds the brand slot (`flex: 1`) and the collapse toggle · **collapsed:** stacks to a column |
| brand row | inside the head · `flex: 1` · align center · padding-x `--pm-space-3` · **collapsed:** centred, no inset |
| topbar | height `--pm-shell-topbar-height` · bg `--pm-shell-topbar-bg` · border-bottom `1px solid --pm-shell-topbar-border` · shadow `--pm-shadow-raised` · padding-x `--pm-space-6` (shell scope — never `--pm-page-*`, which belongs to page archetypes) · slots split `justify: between` |
| content | `<main>` · `tabindex="-1"`, so the skip link and a page change move focus into it, and no ring when it has that focus (a ring around the whole region adds no information; the page's heading, focused the same way, has none either) · bg `var(--pm-texture-page) var(--pm-bg-app)` · scroll container (`overflow-y: auto`); default attachment keeps the texture still while the page scrolls · `position: relative` *(the region is the containing block of what it scrolls, so an absolutely positioned box in a long page, such as text a member hides from the eye, scrolls with the region and never makes the document scroll under the frame)* · `container-type: size` *(container-first responsiveness, `docs/layout.md`: this is the region the page archetypes measure. It has to be an ancestor of the page, because the nearest ancestor container answers a container query, and a page cannot query its own width. The shell knows how much room is left after the rail. Below the drawer breakpoint, with the rail gone, that is the whole window. See `list-page.md` §In a narrow region. It contains both axes, so a page reads the region's visible height as `100cqb`: DetailPage's aside that stays in view is never taller than it (`detail-page.md`). The region's height is its grid row's, never its content's, so containing its block size changes nothing it draws)* |
| collapse toggle | Button `ghost/neutral/sm iconOnly` `icon="previous"`/`"next"` (by state) `label="Collapse sidebar"/"Expand sidebar"` — **the rail head, beside the brand** *(the foot is where the account lives, and a control that resizes the rail belongs beside the mark it resizes. It renders with or without a brand, because the rail can always be narrowed, so the control is anatomy, not content. Below the drawer breakpoint it is `display: none`, because a rail shown as a sheet has nothing to collapse.)* |
| banner | a grid row of its own (`auto`) above the rail and the topbar, spanning both columns. It is in the grid and not over it, so the rail and the content region keep the whole of what is left and nothing scrolls under it. Without a banner the row has no height. The small-viewport drawer opens over it, as it does over the topbar. In SwiftUI and Compose the row is the frame's first, above the platform's navigation and inside the top safe area |
| dock | shares the content cell (`grid-area: content`) · `align-self: end` · centred · padding `0 --pm-space-6 --pm-space-5` · `z-index --pm-z-raise` · `pointer-events: none`, children `auto` *(It shares the cell instead of taking its own row, so the page keeps its height, the layer floats over it, and a collapsing rail re-centres it automatically. It is not a child of `<main>`, because an absolutely positioned child of a scroll container scrolls with it, and a dock must not scroll away.)* |
| announcer | a `role="status"` region after the content region, visually hidden (`conventions/a11y.module.css`), empty until the first page change |
| skip link | visually hidden until `:focus-visible`; then a `--pm-bg-surface` chip, `text.sm` `--pm-accent-text`, inset `--pm-space-3`, ring per conventions §4 |
| root, navigation on top | from `48rem`: rows `banner` / `sidebar topbar` / `content content`, columns `auto minmax(min-content, 1fr)` |
| sidebar, navigation on top | from `48rem`: a row, centred · padding `--pm-space-2` block, `--pm-space-4` at the start, none at the end · bg `--pm-shell-topbar-bg` · border-bottom `1px solid --pm-shell-topbar-border` · shadow `--pm-shadow-resting` · no end border · `overflow: visible`, so the last item's focus ring is not cut where a system draws the ring outside the edge · the head drops its min-height and the collapse toggle, and takes no room without a brand · the nav slot wraps, and is not a scroll container |

## AppShell.NavItem

Nav items are not ghost Buttons. Button centres its content and takes no alignment prop
**by design** (see `components/button.md`), so a stretched Button cannot be a nav row: the
glyph would shift with the label's length. Under the promotion rule (escape-hatch pressure
on a recurring need ⇒ canonize), the shell owns its item, as ListPage owns its slots.

```
[NavItem root <button> | <a href>]  [icon?]  [label]  [end slot?]
```

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `icon` | `IconRole` | — | strongly conventional, because collapsed rails are unusable without one |
| `label` | `string` | required | the accessible name in every mode |
| `current` | `boolean` | `false` | exactly one current item per rail |
| `href` | `string` | — | the root swap (`link.md`): with an `href` the row *is* an `<a>`, so middle-click, copy-link and the browser's status bar work. A rail of buttons cannot be opened in a new tab |
| `onNavigate` | `(href: string) => void` | — | the routing seam (`link.md` §Routing), on a row with an `href`: a click the browser would follow in this tab goes to `onNavigate(href)` instead of the browser, and a click that opens a tab or a window stays the browser's. An app with its own router gives every row an `href` and this |
| `onSelect` | `() => void` | — | a callback for a rail of buttons, which routes in JavaScript with no `href`. It also fires on every click of a row with an `href`, a click that opens a new tab included, so a router uses `onNavigate` there |
| `end` | `ReactNode` | — | Badge by convention: a count (`count`) or a dot (`dot`, with its words), read with the row's label |

Attributes: `data-current?`. Root is a real `<button>`, or an `<a>` when `href` is given.

**Recipe**: start-aligned by construction (`justify-content: flex-start`), full rail
width, height `--pm-control-height-md`, padding-x `--pm-space-3`, gap `--pm-space-3`,
radius `--pm-radius-md`, label `text.sm` (truncates with ellipsis), icon `md`:

| State | Tokens |
| --- | --- |
| rest | bg transparent · label `--pm-text-secondary` · icon `--pm-text-muted` |
| hover | bg `--pm-bg-surface` · label `--pm-text-primary` · icon `--pm-text-secondary` *(not `bg.subtle`: the rail itself sits on it, so hover steps up to the surface level in both modes)* |
| active | hover colours + press-feedback |
| current | bg `--pm-selection-bg` · label + icon `--pm-selection-text` · `aria-current="page"`; hover on current changes nothing (selection outranks hover, as in Table) *(the current item is a selection, not a stuck hover)* |
| focus | ring per conventions §4; on the current item the ring lies inside the fill with a gap, in `--pm-selection-text` (§4, inside a fill) |

Colour transitions `--pm-motion-duration-control` × `--pm-motion-easing-standard`. No
per-item entrance motion, because rails do not animate their nav.

**Collapsed** (keyed off the shell's `[data-collapsed]`, no NavItem API): the icon centres
in the rail, the label and `end` become visually hidden (not unmounted, so the accessible
name persists), and the hit target stays full-width. A collapsed item shows its label in a
Tooltip to the right. Screen readers already have the accessible name. The tooltip gives
sighted pointer users the word the glyph lacks. It appears only while collapsed, because a
tooltip that repeats a visible label is the standard tooltip misuse.

### AppShell.NavGroup

A rail serving several page archetypes outgrows a flat list, so the group label is shell
anatomy, using the shared section-heading recipe (SettingsRow.Group's overline). Common
sidebar designs agree: a rail is grouped sections, not a flat list.

```
[NavGroup { label: string, children: NavItem[] }]
```

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `label` | `string` | required | the section's name: the overline, and the group's `aria-label` |
| `children` | `ReactNode` | required | NavItems |

*(The prop is `label`, not `title`, because NavItem calls the row's text `label`, and a
group in the same rail using another word would give one component family two words for
one thing.)*

| Part | Tokens |
| --- | --- |
| group | column · gap `--pm-space-2` |
| label | `text.xs` quartet + uppercase · `--pm-text-muted` · padding `--pm-space-4` `--pm-space-3` `--pm-space-1` (the top value is the space between groups. It sits on the label rather than the group so a group with no drawn heading does not reserve it. The first group's top value collapses) |
| children | NavItems, unchanged |

The reference draws its group labels in sentence case. The house draws every section
heading one way, SettingsRow.Group's overline, which Dashboard.Panel also uses. A rail
whose headings differ from the settings screen's would look like a second design system in
the same product. The divergence from the reference is deliberate.

Collapsed: the label is hidden entirely, not visually hidden. A rail of glyphs needs no
invisible headings between them, and a clipped one would announce a section boundary the
eye cannot see. The group keeps `role="group"` + `aria-label={label}` so the structure
remains for assistive tech. It is named rather than headed, because a rail is not a
document outline, and an `<h2>` per section would put five headings above the page's one.
Fixture entries: one grouped rail expanded, the same rail collapsed. `requiredSelectors`
gains nothing (the label has no interactive states).

**Collapsible groups are out of scope** on purpose. The rail already collapses as a whole,
and two independent collapse mechanisms would give "where am I" two answers.

### AppShell.UserCard

Who the user is signed in as, at the bottom of the rail: a mark, two lines and an
affordance, matching the foot of the reference sidebar block.

```
[UserCard root]  [Avatar md]  [name / detail]  [end slot?]
```

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `name` | `string` | required | the first line. Avatar's initials and identity colour derive from it |
| `detail` | `string` | — required | the second line: an email, a role, or the workspace they are signed in to |
| `src` | `string` | — | falls back to initials, then to a glyph (Avatar's own fallback order) |
| `end` | `ReactNode` | — | the affordance at the row's end. A Menu by convention |

**Why canonized rather than composed.** Avatar + two lines + an affordance *can* be
written from existing members, but not well, for three reasons that are geometry rather
than taste:

- **The second line has no suitable style.** `Text`'s tone floor is `secondary` by design
  and its steps stop at `sm`, so a composed name and detail get the same size and nearly
  the same colour. That reads as two names, not a name and an address.
- **Nothing truncates.** In a 224px rail, minus a mark, a gap and the affordance, an email
  has about 120px. The rail's `overflow: hidden` then clips it mid-glyph, which is not an
  ellipsis.
- **It cannot handle the collapse.** Rail content the shell did not compose is clipped, so
  the application has to stop rendering a composed card at 48px. `WhatsNew` has to do
  this. A member does not.

The first two reasons are why it is not a composition. The third is why it belongs to the
shell in particular. It is `AppShell.UserCard` rather than vocabulary for NavItem's reason:
it has no meaning outside the rail, and inside it reads the shell's `[data-collapsed]`.

**It is not interactive.** The reference makes the whole row a dropdown trigger. Here the
affordance is a slot, so the shell stays out of menu logic and the row's text stays
selectable. There are no rest/hover/press cells, and `requiredSelectors` gains nothing.

| Part | Tokens |
| --- | --- |
| root | flex row · gap `--pm-space-3` · align center · padding `--pm-space-2` `--pm-space-3` · radius `--pm-radius-md` · `min-inline-size: 0` (keeps the same left edge as every NavItem above it) |
| avatar | `Avatar` `md` (= `--pm-space-7`, 32) · unlabelled, because the name is beside it in every mode (clipped when narrow but still in the accessibility tree), so a label would repeat the name |
| name | `text.sm` quartet · `--pm-text-primary` · ellipsis, no wrap |
| detail | `text.xs` quartet · `--pm-text-muted` · ellipsis, no wrap (a step down in size *and* tone together, which a composition cannot reach) |
| end | inline-flex · `flex: none` |

Collapsed (no API, keyed off the shell): the row centres on its mark, the two lines are
**clipped** (the name remains for screen readers), and `end` is `display: none`. It is
removed rather than clipped, because a menu trigger one pixel wide is a tab stop whose
focus ring is off-screen. This is the drawer's `visibility: hidden` reasoning, applied one
level down.

Collapsed state: brand and footer rows stay. Slot content other than shell parts must be
composed to handle collapse. The demo product shows this: `WhatsNew` renders nothing at
48px, while the UserCard beside it needs no special handling. The brand is slot content
too. A wordmark is wider than the collapsed rail and the rail cuts it at both ends, so the
application passes a mark while the rail is collapsed, as the demo product and the
collapsed fixture entries do.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| default | all slots stubbed | landmarks present |
| collapsed | `defaultCollapsed` | `data-collapsed`, grid uses collapsed width |
| no topbar slots | omit `topbar` | bar still renders (height/border hold the frame) |
| minimal | sidebar + children only | — |
| with a banner | a warning `Banner` in `banner` | the banner spans the frame; the rail starts under it |
| counts in the topbar | two icon-only Buttons with capped counts side by side in `topbar.trailing` | each count reaches past its button's end edge, over the slot's gap and into the bar's padding (`button.md`) |
| navigation on top | `navigation="top"`, three NavItems in `sidebar`, search and an action in `topbar` | `data-navigation="top"`; the items lead the topbar's row |
| navigation on top, grouped | `navigation="top"`, two NavGroups, the account Menu in `topbar.trailing` | the groups' items in one row with a rule before the second; the overlines gone, the names kept |
| drawer closed | the rail, at a window below the drawer breakpoint | the rail off screen; the topbar's `menu` button |
| drawer open | the grouped rail, `UserCard` and an info `Banner`, at a window below the breakpoint, with the `menu` button pressed | `data-drawer`; the rail over the banner, the topbar and the page |
| nav item rest | `<AppShell.NavItem icon="inbox" label="Inbox" />` | start-aligned |
| nav item current | `current` | `data-current`, `aria-current="page"` |
| nav item with end | `end={<Badge>3</Badge>}` | badge at row end |
| nav item collapsed | inside `defaultCollapsed` shell | label visually hidden, name intact |
| grouped rail | `NavGroup`s in `sidebar`, `UserCard` in `sidebarFooter` | labelled sections; the user at the foot |
| grouped rail collapsed | same, `defaultCollapsed` | group labels gone, user's lines clipped, account menu out of the tab order |
| nav group | `<AppShell.NavGroup label="Platform">` | `role="group"`, named; overline label |
| user card | name + detail + `end` | mark, two lines, affordance |
| user card, long | a name and an address that overrun the rail | both truncate with an ellipsis |

`requiredSelectors`: `[data-collapsed]`, `[data-current]`, `[data-navigation="top"]`, `:hover`,
`:focus-visible` (skip link, toggle, nav items).

## Motion

Sidebar collapse: `collapse` pattern on inline-size (width), `--pm-motion-duration-surface`
× `--pm-motion-easing-standard`, with content reflowing alongside (grid transition). Label
and text fade at `-surface-exit` before the width moves, so text is never squeezed. At
`none`: instant snap. This is the only animated structural change in the shell.

## Icons

`previous`/`next` (toggle), `menu` (the small-viewport drawer: below a `48rem`
viewport the rail leaves the grid and becomes a drawer over the content, and the topbar
gains a `menu` button to open it; a new `transitionKey` closes it, §Routing).

## A11y

Landmarks: `<nav aria-label="Primary">`, `<header>`, `<main id="content">`. Skip link
first in DOM. `<main>` takes `tabindex="-1"`, so the skip link moves focus into the region
and not only the scroll position. Collapse toggle is a real button with a state-dependent label. NavItem
carries `aria-current="page"` when current, and its visually-hidden label keeps the
accessible name in collapsed mode (the collapsed tooltip is for sighted pointer users,
not a second name).

**The drawer.** Below the breakpoint the topbar's `menu` button carries `aria-expanded`, and
`aria-controls` names the rail. Opening the drawer moves focus into the rail. While it is open,
the rail and the scrim are the only parts a reader reaches: the skip link, the banner, the topbar,
the content region and the dock are `inert`, so neither Tab nor a screen reader goes behind the
drawer. Escape closes it, unless a layer opened from the rail (a menu, a dialog) takes the key
first. Closing it returns focus to the `menu` button when focus was in the rail or nowhere. A window
that grows past the breakpoint closes the drawer, because the frame drawn there has no drawer and
an inert page would be unreachable; the `menu` button is drawn exactly where the drawer exists, so
its box says which side of the breakpoint the window is on. There is no scroll lock: the content
region is the frame's only scroll container, and the scrim covers it.

**A new page.** A new `transitionKey` (§Routing) moves focus to the new page's `<h1>`, or to
`<main>` when the page has none. A screen reader reads the heading that takes focus. When focus
does not land on a heading, the polite `role="status"` region says the page's title instead: the
heading's text, or the document's title when there is no heading. Saying the title as well as
focusing the heading would read it twice. Focus stays where it is when it is already inside the
new page, because the page put it there or the reader's control is still on the page. The heading takes `tabindex="-1"` for the move and gives it back when focus leaves it.
The arrival waits a frame, so the page is drawn and a drawer that closed for it has made the page
reachable. The first page is not an arrival (`arriveAtPage` in the engine).

## Agent

An agent reads whether the rail is collapsed and whether the navigation drawer is open below the
drawer breakpoint, and collapses and expands the rail. Both go through the shell's own collapse,
so `onCollapsedChange` reports an agent's change as it reports a person's, whether or not the
caller controls it. The rail has no width to change below the breakpoint, where it is a drawer,
or with the navigation on top, where there is no rail, so both actions refuse there, as the
collapse control is not drawn. The navigation's name (`messages.primaryNavigation`) names the
member.

Below the breakpoint an agent opens and closes the drawer. Each sets the drawer as a press on the
topbar's `menu` button does, so focus moves into the rail when it opens and back to the button
when it closes. Above the breakpoint there is no drawer and the button is not drawn, so both
actions refuse there.

An agent reads the application's destinations and goes to one. The application composes the
NavItems as children, so the shell holds no list of them: it reads them from its navigation in
the document, in document order, the foot's included. Each is a choice whose id is its `href`, or
its label when it has none, and whose label is its label. Two items that would share an id each
take their group's label and ` / ` before it (`Workspace / Settings`), and an id still shared
takes ` (2)` after it. An item the document marks disabled, a disabled control or one with
`aria-disabled="true"`, is a disabled choice. `current` is the id of the item marked
`aria-current`, or `null` when none is. `go` presses the item with its own click, so `onNavigate`
routes it, or the browser follows the link and the page the agent acts on is left, as for a
person's press. It refuses a disabled item.

The navigation is one element in the rail, along the top and in the drawer, so the destinations
read the same in all three. While the drawer is closed its items stay in the document, out of
sight, so an agent reads the same destinations and `go` presses an item without opening the
drawer. The page the item routes to brings a new `transitionKey`, which keeps the drawer closed.

The shell withholds its two controls, the collapse toggle and the drawer's button, so an agent
sees the shell where a person sees its frame. The members in the rail are listed whether the
drawer is open or not. Everything the slots hold (the rail's content, the topbar's slots, the
banner, the dock and the page) is the app's, and its members stay an agent's.

```agent
state collapsed boolean as root data-collapsed
state open boolean as root data-drawer
state destinations choices
state current id
action collapse sets collapsed calls onCollapsedChange
action expand sets collapsed calls onCollapsedChange
action open sets open when drawer closed
action close sets open when drawer open
action go id presses item
withholds contents
```
