# ConversationPage (archetype)

The conversation screen: the thread above the composer, filling the shell's
content region, with the artifact pane beside it when there is room and behind a
Drawer when there is not. Like every page archetype, it owns the `--pm-page-*`
pattern-scope namespace on its root.

The archetype exists because the thread's scroll region needs a box, and
application code has no lawful way to draw one. A ChatThread is
`block-size: 100%` of whatever holds it, and a composer pinned under the page
scroller scrolls away. Only a page that owns the geometry can make the thread
fill the room above the composer while the composer stays put. That is the one
decision here. The header is PageHeader's (and so is the page's `<h1>`), the
split is SplitPane's, and the drawer is Drawer's.

## Anatomy & API

```
[root — the page inside AppShell's content region; fills it]
  [PageHeader — from props; the aside's toggle joins `actions` below the breakpoint]
  [body:
     SplitPane(start = conversation, end = aside)   — with an aside, above 48rem
     conversation                                   — otherwise
  ]
  [Drawer side="end" size="lg" title={asideLabel} — the aside, below 48rem]

conversation = [thread — a ChatThread, takes the room] over [composer — a PromptInput]
```

```ts
interface ConversationPageProps {
  title: string // as PageHeader — ConversationPage owns the only PageHeader
  description?: string
  actions?: ReactNode // vocabulary controls; one primary at most
  thread: ReactNode // a ChatThread
  composer: ReactNode // a PromptInput
  aside?: ReactNode // an ArtifactPane — beside the thread at width, behind a Drawer below it
  asideLabel?: string // the aside's name: the separator's, the drawer's title, the toggle's label. Required with aside, paired at the type level
}
```

Attributes on root: `data-aside="split|drawer"` while an aside is given, naming
which arrangement it is in, and absent without one.

## Pattern tokens (declared on root)

| Token | Value | (std/compact/comfortable) |
| --- | --- | --- |
| `--pm-page-padding-x` | `var(--pm-space-7)` | 32 / 28 / 36 |
| `--pm-page-padding-y` | `var(--pm-space-6)` | 24 / 20 / 28 |
| `--pm-page-max-width` | `calc(var(--pm-space-10) * 15)` | 1440 / 1230 / 1650 |
| `--pm-content-gutter` | `var(--pm-space-5)` | 16 / 14 / 18 |

Wider than ListPage's `13` because two reading columns side by side need the
room. The gutter is tighter because the header sits over a region that already
spans the page's whole height.

### In a narrow region

The page scope's narrow step is ListPage's, cited whole (`list-page.md`): below
a `40rem` region, both paddings step down one rung.

**The aside's two arrangements** switch at `48rem` of the page's own width,
container-first (`docs/layout.md`). The page measures itself because React
needs to know which arrangement to *render*, and a container query cannot tell
it. Above the breakpoint, the aside is SplitPane's end pane, with content
floors of 320px for the thread and 280px for the pane (pixels are appropriate
for floors, `split-pane.md`). Below it, the body is one column and the aside is
behind a Drawer (`side="end"`, `size="lg"`) opened from an outline Button in
the header named `asideLabel`. A narrow page loses the split, never the
content.

## Recipe (exact tokens)

| Part | Tokens |
| --- | --- |
| root | column · `row-gap --pm-content-gutter` · `block-size: 100%` · `min-block-size: 0` · `max-inline-size --pm-page-max-width` · centred · padding from the scope · `container-type: inline-size` |
| body | `flex: 1` · `min-block-size: 0`. The split or the column fills it |
| conversation | grid `minmax(0, 1fr) auto` · `row-gap --pm-space-4` · `block-size: 100%` |
| composer | `max-inline-size: calc(--pm-space-10 * 8)` (ChatThread's column measure) · centred |
| aside, split | fills the end pane · `padding-inline-start --pm-space-2` off the seam |
| aside, drawer | fills the drawer's body |
| the toggle | `Button outline/neutral sm icon="artifact" label={asideLabel}`, never the page's solid |

## States

| Entry | Render | Expect |
| --- | --- | --- |
| a conversation | four turns, a composer, a header action | — |
| with an aside | an ArtifactPane, `asideLabel="Artifact"` | split or drawer by width |
| empty | an empty ChatThread with an EmptyState | — |

Every entry renders inside the spec's harness, a box of fixed height, because
the page fills a region. The root attributes are asserted in the browser test,
where the width that decides them can be set. `requiredSelectors`: none, because
the divider's and the drawer's states belong to SplitPane and Drawer.

## Motion

None of its own. Turns arrive by ChatThread's `chat.message`, the drawer enters
by Drawer's `sheet`, and the split never animates (SplitPane's law). A page that
fades in uses AppShell's page transition, like every other page.

## Icons

`artifact` on the aside's toggle (labelled by `asideLabel`).

## A11y

PageHeader's `<h1>` is the page's only one. Everything below it belongs to the
members: the thread's `log`, the composer's named field, the pane's `region` and
`<h2>`. The split's separator is named `asideLabel`, and so is the drawer, which
is Drawer's modal dialog with Drawer's focus policy. The toggle is a real Button
with the same name, present only in the arrangement that needs it.
