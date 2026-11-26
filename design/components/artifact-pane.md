# ArtifactPane

ArtifactPane shows a turn's output that is too big for the thread (a file, a page,
a table, a preview) in a pane beside it, with a name, a kind, the app's controls
and a switch between the views the app offers. It has no substrate: a section,
SegmentedControl for the switch, and Button for the controls.

ArtifactPane is a Card for one artifact: a bounded surface that fills the box it
is given, with a header that the thread's turns do not have. It is *not* a Dialog.
Nothing is modal, and the thread beside it stays live, which is the purpose of a
pane. It is *not* Tabs. The switch is a SegmentedControl because the views are
*readings* of one thing (code, preview), not peer sections, and a pane with one
reading has no switch. The content belongs to the app (a CodeBlock, a Markdown, a
Table, an image). The pane draws the frame and scrolls the body. ConversationPage
decides where the pane sits: beside the thread when there is width, or in a Drawer
below it.

**The body is the pane's only scroll region.** It is allowed for the same reason
as ChatThread's: an artifact can outgrow any box, and the page cannot scroll it
without scrolling the thread away. The body is a tab stop exactly while it
overflows (CodeBlock's rule), and it is named as a group inside the pane's own
landmark.

## Anatomy

```
[pane <section aria-labelledby>]
  [header]
    [mark — Icon by kind | Spinner while streaming]
    [heading: [title <h2>] [meta?]]
    [views? — SegmentedControl sm]      — two or more readings
    [actions? — the app's Buttons]
    [close? — Button ghost "close"]
  [body — the scroll region; a tab stop and a named group while overflowing]
    [content — the shown reading, or children]
```

## API

```ts
interface ArtifactPaneProps {
  title: string // the artifact's name — the pane's accessible name and its heading
  kind?: 'code' | 'document' | 'data' | 'preview' // decides the mark; absent, the tier's own artifact glyph
  meta?: string // one line under the title, already formatted — "TypeScript · 142 lines"
  streaming?: boolean // still being written: the mark becomes a spinner, the pane reports aria-busy
  actions?: ReactNode // the header's controls — copy, download, open; ghost/neutral/sm Buttons
  onClose?: () => void // supplied ⇒ the close control draws; the app owns the pane's presence
  closeLabel?: string // the close control's name; default Close, localized hosts pass their catalog's
  views?: ArtifactView[] // { id, label, content }[] — two or more draw the switch; one draws without it; none means children
  viewsLabel?: string // the switch's accessible name; default View
  view?: string // controlled trio, Tabs' shape
  defaultView?: string
  onViewChange?: (id: string) => void
  children?: ReactNode // the body when views is absent or empty
}
```

Attributes: `data-kind` (absent when no kind); `data-state="streaming"` with
`aria-busy` while the artifact is being written; the body carries `data-view` with
the shown reading's id.

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| pane | Card's surface exactly: bg `--pm-bg-surface` · border `1px solid --pm-border-subtle` · radius `--pm-radius-surface` · shadow `--pm-shadow-resting, --pm-shadow-inset-top` · column · `block-size: 100%` · `overflow: hidden` |
| header | wrapping row · gap `--pm-space-2` `--pm-space-3` · padding `--pm-space-3` `--pm-space-4` · `border-block-end 1px solid --pm-border-subtle` · the heading grows from a basis of `calc(--pm-space-10 * 2)`, so in a narrow pane the controls wrap under the title instead of the title being truncated beside them |
| mark | `sm` glyph by kind (`terminal`, `document`, `table`, `browser`; `artifact` with no kind) · `--pm-text-muted`; while streaming `Spinner size="sm"` named `"{title}: still being written"` |
| title | `<h2>` · `text.md` at `--pm-text-xl-weight` in `--pm-text-xl-family` (Heading level 4's cell, because it is a section title beside a thread, not a page title) · `--pm-text-primary` · ellipsis |
| meta | `text.xs` · `--pm-text-muted` |
| views | `SegmentedControl size="sm" label={viewsLabel}` |
| actions, close | `ghost/neutral/sm` Buttons · gap `--pm-space-1` |
| body | `flex: 1` · `overflow: auto` · `overscroll-behavior: contain` · the shared focus ring |
| content | padding `--pm-space-4` |
| glass | at `depth: glass`, the surface material (`--pm-material-surface`, blur and saturate), as in HoverCard and Popover |

## States

| Entry | Render | Expect |
| --- | --- | --- |
| code | `kind="code"`, a CodeBlock, actions, close | — |
| two readings | `views` preview/source, a Markdown and a CodeBlock | the switch |
| streaming | `streaming` | the spinner, `aria-busy` |
| a long artifact | four copies of the code in a 24rem harness | the body scrolls |
| no kind | nothing but a title | the `artifact` glyph |

Every entry renders inside the spec's harness, a box of fixed height, because a
pane with no box draws a header over an empty body. For the same reason the root
attributes are asserted in the browser test, not in the fixture.

`requiredSelectors`: `:focus-visible` (the body's tab stop). The switch's and the
controls' states belong to SegmentedControl and Button.

## Motion

Switching readings is a re-render. The switch's spring is SegmentedControl's own
`tabs.indicator`-style motion, and the body just shows the chosen reading. The
spinner is Spinner's loop. Nothing else moves, because animating the pane when its
content changes would animate the thing the reader is reading.

## Icons

`terminal` / `document` / `table` / `browser` by kind, `artifact` without one
(decorative, because the title names the pane); `loading` through Spinner; `close`
(labelled by `closeLabel`). The actions bring their own labelled icons.

## A11y

A `<section>` named by its `<h2>` title is the pane's one landmark. The body is a
tab stop exactly while it overflows. It is named by the same title as a `group`,
not as a second `region`, because a reader cannot tell apart two landmarks with
the same name (CodeBlock's rule, with the landmark already above it). The switch
is SegmentedControl's radio group, named by `viewsLabel`. Streaming is announced
by the Spinner's status, which includes the title, and the pane is `aria-busy`.
Close is a real Button with the app's label. When the app removes the pane while focus is in
it, after its close control for one, focus moves to the first focusable element after where the
pane was, else the last one before it, else the page's `main`, by Alert's rule
(`focusAfterRemoval`), and not to the body.

## Agent

An agent reads the reading shown (`view`, the shown view's id, or `null` while the pane shows
`children`), the readings offered (`views`, by id and label) and whether the artifact is still
being written. It chooses a reading by its id through the pane's own view, so `onViewChange`
reports it as it reports a person's, whether or not the caller controls the view. It closes the
pane through `onClose`, as the close control does, and the app decides whether the pane stays
mounted. A pane with no `onClose` has no close control, so it refuses `close` and the step fails.
The `title` names the member.

The pane withholds its own parts: the view switch and the close Button are not members an agent
lists, finds or runs, so an agent chooses a reading and closes the pane on the pane itself. The
header's `actions` and the body are the app's, and the members in them stay an agent's, listed
within the pane.

```agent
state view id
state views choices
state streaming boolean as root data-state=streaming
action choose id sets view calls onViewChange when two readings
action close calls onClose
withholds contents
```
