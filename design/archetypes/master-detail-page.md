# MasterDetailPage (archetype)

The page for a list of items of one kind beside the detail of the selected one: a support
inbox, a notifications page, an audit log, a file browser. It fills the shell's content
region, as ConversationPage does. Like every page archetype, it owns the `--pm-page-*`
pattern-scope namespace on its root.

The archetype exists because a detail drawn under a long list is off screen when its row is
picked, and application code has no lawful way to draw two panes that scroll on their own.
It is not DetailPage, which is one entity reached from another page and has a way back to it.
It is not ConversationPage, whose aside is a product of the thread. The header is
PageHeader's (and so is the page's `<h1>`), the split is SplitPane's, the detail pane's empty
form is EmptyState's, and the way back is a Button. The list and the detail are the
application's.

## Anatomy & API

```
[root — the page inside AppShell's content region; fills it]
  [PageHeader — title, description, actions]
  [body:
     at or above 48rem: SplitPane(start = list pane, end = detail pane), label = listLabel
     below 48rem:       the list pane alone while `detail` is absent,
                        the detail pane alone while `detail` is given
  ]

list pane   = a region named `listLabel` holding `list`; it scrolls itself
detail pane = [back — a Button, in the one-pane arrangement only] over `detail`, which scrolls;
              with no `detail`, in the split, EmptyState from `emptyState`
```

```ts
interface MasterDetailPageProps {
  title: string // as PageHeader: MasterDetailPage owns the only PageHeader and the <h1>
  description?: string
  actions?: ReactNode // vocabulary controls; one primary at most
  list: ReactNode // a List (or a Table or a Tree) with its FilterBar and pagination; the app marks the selected item `current`
  listLabel: string // names the list pane's region and the split's separator
  detail?: ReactNode // the selected item's detail; absent means nothing is selected
  emptyState: EmptyStateProps // the detail pane while nothing is selected, in the split
  backLabel: string // the way back to the list in the one-pane arrangement
  onBack: () => void // called by the way back; the application clears its selection in it
}
```

`emptyState` is required, as ListPage's is: the page cannot be built without deciding what
the detail pane says before anything is picked. `backLabel` and `onBack` are required because
the page cannot know its width when it is written, and on a phone the way back is the only
way to the list.

There is no `detailLabel`. The list pane is a landmark, a region named `listLabel`, because a
reader jumps to it to pick another item. The detail pane is a plain box: the detail opens with
its own heading, which names it in the page's outline, and a second landmark with a second
required name would add a stop that says the same thing.

Attributes on root: `data-layout="split|single"`, naming the arrangement, and in the single
arrangement `data-pane="list|detail"`, naming the pane it draws.

## Pattern tokens (declared on root)

| Token | Value | (std/compact/comfortable) |
| --- | --- | --- |
| `--pm-page-padding-x` | `var(--pm-space-7)` | 32 / 28 / 36 |
| `--pm-page-padding-y` | `var(--pm-space-6)` | 24 / 20 / 28 |
| `--pm-page-max-width` | `calc(var(--pm-space-10) * 15)` | 1440 / 1230 / 1650 |
| `--pm-content-gutter` | `var(--pm-space-5)` | 16 / 14 / 18 |

ConversationPage's values, for its reasons: two reading columns side by side need the width,
and the header sits over a region that already spans the page's whole height.

### In a narrow region

The page scope's narrow step is ListPage's, cited whole (`list-page.md`): below a `40rem`
region, both paddings step down one rung.

**The two arrangements** switch at `48rem` of the page's own width, container-first
(`docs/layout.md`). The page measures itself because React needs to know which arrangement to
*render*, and a container query cannot tell it. The breakpoint is ConversationPage's, so the two
pages that split agree on where a split stops fitting.

At or above it the list and the detail are SplitPane's two panes. The list takes `0.32` of the
width, with a floor of 240px, where a row keeps its title beside a mark and a time. The detail
has a floor of 420px, where a heading keeps its actions beside it (pixels are appropriate for
floors, `split-pane.md`). At the breakpoint, at the standard density, the page's content box
is 704px and the separator 8px, so both floors hold with 36px to spare. The ratio and the floors come from the product
whose workspace draws this split by hand.

Below it the page draws one pane. While nothing is selected it draws the list. While a detail
is given it draws the detail under a way back (`Button ghost/neutral/sm icon="back"`, as
DetailPage's), and the application clears its selection in `onBack`. The list stays in the
document, `hidden`, while the detail is drawn alone, so its scroll position and any state it
keeps itself survive the way back. A narrow page loses the split, never the content.

## Recipe (exact tokens)

| Part | Tokens |
| --- | --- |
| root | column · `row-gap --pm-content-gutter` · `block-size: 100%` · `min-block-size: 0` · `max-inline-size --pm-page-max-width` · centred · padding from the scope · `container-type: inline-size` |
| body | `flex: 1` · `min-block-size: 0`. The split or the one pane fills it |
| list pane | `block-size: 100%` · `overflow-y: auto` · `overscroll-behavior: contain`. No surface of its own *(see below)* |
| list pane, focused from a script | the shared ring (`--pm-focus-width` · `--pm-border-focus-solid`), drawn inside the pane's edge by its width at every system's offset, because SplitPane's pane clips what is drawn outside it |
| detail pane | column · `block-size: 100%`; in the split, `padding-inline-start --pm-content-gutter` off the seam |
| back | `Button ghost/neutral/sm icon="back"` · `padding-block-end --pm-space-3`; it stays in view while the detail scrolls under it |
| detail | `flex: 1` · `overflow-y: auto` · `overscroll-behavior: contain` |
| room in the panes | the list pane and the detail clip what they hold, so each has `--pm-space-2` of padding that negative margins take back where the page owns the space past it: every side with one pane (inside the page's padding and the back row's), and in the split the list pane's side at the seam (where SplitPane's pane has the same room) and the detail's start side (inside its gutter). A field or Button there draws its whole seat shadow, a control's focus mark (a 2px line a `--pm-space-1` gap outside it) fits, and nothing moves. The split's outer sides are its panes' edges, which have none (`split-pane.md`) |
| empty | EmptyState centred in the detail pane, as ListPage centres its empty state in the table's place |

**The panes draw no surface.** SplitPane's separator already divides them. A panel's edge
beside the separator would draw two lines where one is the boundary, and a panel around the
list slot would put the list's FilterBar on its edge. The list's rows run to the seam, because
their fill marks the current item against it. The detail is the application's composition, a
Card or a heading over a DescriptionList, and a pane with a surface would nest the Card in it.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| an item selected | a List of six tickets, the second `current`, beside its detail, and a header action | the split |
| nothing selected | the same list beside the EmptyState | the split |
| a long list | thirty tickets; the list pane scrolls and the detail stays | the split |
| narrow, an item selected | the detail alone under the way back | the single arrangement |
| narrow, nothing selected | the list alone | the single arrangement |

Every entry renders inside the spec's harness, a box of fixed height, because the page fills a
region. The narrow entries render in a second harness of a phone's width, so the completeness
law renders the one-pane arrangement. The root attributes are asserted in the browser test,
where the width that decides them can be set. `requiredSelectors`: none, because the divider's
states belong to SplitPane and the items' to List.

## Motion

None of its own. The split never animates (SplitPane's law), and the one-pane arrangement
replaces one pane with the other at once, because a slide would play on every pick and every
way back. A page that fades in uses AppShell's page transition, like every other page.

## Icons

`back` on the way back, labelled by `backLabel`.

## Behaviour

- In the split, picking an item moves no focus: the detail appears beside the list, and the
  reader's place in the list stays.
- In the one-pane arrangement, when `detail` arrives the list is replaced by the detail, and
  focus moves to the way back, because the element that held it is no longer drawn. When
  `detail` goes, after `onBack`, the list returns and focus moves to the list pane's current
  item if one is marked (`aria-current`), else to the first focusable element in the list pane,
  else to the pane itself.
- In the split, a detail that goes while focus is in it moves focus to the list the same way.
- A page that mounts with `detail` already given moves no focus.
- A resize that crosses the breakpoint never leaves focus on an element that is no longer
  drawn. Focus that was in a pane that is drawn again moves to the way back when the detail is
  drawn alone, and to the list otherwise.
- The page announces nothing of its own. The detail's heading and the way back are what a
  screen reader meets after a pick.

One rule covers every case: the page moves focus only when the element that held it is no
longer drawn, and the last element to take focus was in the page's body. A reader who moved
focus to the header's actions, or out of the page, keeps it there. The rule is the engine's
`masterDetailFocus`, which every web renderer calls after it draws a change. The contract
grammar cannot state a width, so the shared law `masterDetailLaw`
(`@polymorph/conformance/master-detail`) runs these cases in a host of fixed width for each
arrangement, in every web renderer.

## A11y

PageHeader's `<h1>` is the page's only one. The list pane is a region named `listLabel`, and
the split's separator has the same name, because it resizes that pane. The list pane takes
focus from a script (`tabindex="-1"`) and is never a tab stop. The way back is a real Button
before the detail in the document, so it is the first thing in the pane. The hidden list is
out of the accessibility tree while the detail is drawn alone.

```contract
role list region
name list from listLabel
name divider from listLabel when an item selected
role back button when narrow, an item selected
name back from backLabel when narrow, an item selected
click activates on back when narrow, an item selected
```

## Platforms

Both native contracts take `loadStatus` and `onRetry`: Skeleton rows in the list pane while
loading, and an Alert in place of the list when loading failed
(`design/native/screen-contract.md`).

On both platforms the page measures itself and switches at 48rem, as on the web: SplitPane's
split at or above it, and one pane below it, with the way back as a Button. iOS does not use the
platform's split view, because a `NavigationSplitView` inside AppShell's navigation stack does
not push its detail on an iPhone. On iOS, when the detail replaces the list, VoiceOver moves to
the way back. On Android, while the detail is drawn alone, the system's Back calls `onBack`, as
the way back does, and focus moves by the rule above, except that a returning list takes focus
at its first focusable element, because Compose cannot ask a list which item is current.
