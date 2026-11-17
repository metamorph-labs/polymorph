# ChatThread

ChatThread shows every turn of a conversation in a scroll region that follows
the newest turn while a reply arrives, and lets the reader stop and resume
following. It has no substrate: a scroll container, a column, and one Button.

ChatThread is the only member of the `ai` tier that owns a scroll region. This
is allowed for the reason the scroll map (`scroll-area.md`) gives Table and
CodeBlock theirs: a conversation outgrows any box and must be read from the
bottom while it grows. The page cannot be the scroller, because a composer
pinned under the page scroller scrolls away. So the thread scrolls inside itself
and the composer stays in place (ConversationPage's anatomy). It fills the box
it is given (ScrollArea's contract), and the archetype provides the box.

**The reader controls follow.** The thread follows the newest turn only while
the reader is already at the bottom. As soon as they scroll up to re-read, it
stops moving and offers one control, jump to latest, to return. A thread that
pulled the reader down on every token could not be read.

**The app supplies the empty state** (Timeline's rule). `empty` is drawn when
there are no turns, as the app's EmptyState or Hero. This member never writes
its own empty text.

## Anatomy

```
[root]
  [viewport <div role="log" aria-label> — the scroll region; a tab stop while overflowing]
    [list — the column of turns (children)]   — or [empty — the app's slot]
  [jump? — Button outline/neutral/sm icon "down"]   — while detached
```

## API

```ts
interface ChatThreadProps {
  children?: ReactNode // the turns — ChatMessages, in order
  label: string // the log's accessible name — "Conversation", in the app's language
  empty?: ReactNode // drawn in place of the turns while there are none — an EmptyState or a Hero
  streaming?: boolean // a reply is arriving: the log reports aria-busy
  messages?: ChatThreadMessages // { jumpToLatest } — generic English default; localized hosts pass their catalog's
}
```

Attributes: root `data-state="detached"` while the reader has scrolled out of
the follow (the only state in the tier that the reader creates; absent at rest),
and `data-streaming` while a reply arrives. The viewport also carries
`aria-busy` then.

## Behaviour

- **Follow.** Two observations, no scheduler. A scroll event says whether the
  reader is at the bottom (within one space step of slack, 24px, used as a
  tolerance and not a measure). A resize of the column says a turn grew or
  arrived. If the reader is at the bottom and more content arrives, the viewport
  moves to the new bottom. If the reader has scrolled up, nothing moves until
  the jump control is pressed. One kind of scroll event is never treated as the
  reader's: the browser reports the thread's own programmatic scroll a frame
  late, and a turn can grow in that frame. So a scroll that arrives against a
  different height than the last decision used is read as the content moving,
  and the thread keeps following instead of letting go. The rule is the
  engine's `followEnd`, which every framework's ChatThread and LogView call,
  so a thread and a log follow by the same thresholds.
- **The jump control** shows only while detached, because a reader at the bottom
  has nowhere to jump. It returns the viewport to the bottom and resumes
  following from the press (`jumpToEnd`). Its label is `messages.jumpToLatest`, "Jump to latest" by
  default. It is always in the tree and shown by the stylesheet from the
  root's `data-state`, so the reader's state is one the recipe keys on.
  `display: none` keeps it out of the tab order while hidden.
- **Announcing.** The viewport is a `log` with `aria-relevant="additions"`. A
  turn is announced once when it joins, and a turn that grows token by token is
  not re-read on every token. This is why StreamingText and Markdown announce
  nothing themselves.
- **Reachable.** The region is a tab stop exactly while it overflows
  (CodeBlock's rule), because a keyboard reader cannot read a pannable region
  that a keyboard cannot reach.

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| root | column · `block-size: 100%` · `min-block-size: 0` · `position: relative` |
| viewport | `flex: 1` · `min-block-size: 0` · `overflow-y: auto` · `overscroll-behavior: contain` (the page is not the scroller and must not receive the gesture) · the shared focus ring |
| list | column · gap `--pm-space-6` · `max-inline-size: calc(--pm-space-10 * 8)` (768 at standard density, a reading measure that rescales with density) · centred · padding `--pm-space-5` |
| turn arrival | `chat.message`: `slide-fade` `sm` (`translateY(--pm-space-2)` → 0, opacity 0 → 1) over `control` × `enter`, enter only, keyed on the turn's `[data-member="chat-message"]`, the public name every member carries, because this sheet may not reach into ChatMessage's classes |
| empty | grid, centred · `min-block-size: 100%` · padding `--pm-space-5` |
| jump | absolute · `inset-block-end --pm-space-4` · centred across the inline axis · `z-index --pm-z-raise` · `Button outline/neutral sm icon="down" label={messages.jumpToLatest}` · `display: none` at rest, `flex` under `[data-state="detached"]`. Always in the tree, shown by the reader's own state, and out of the tab order and the accessibility tree while hidden |

## States

| Entry | Render | Expect |
| --- | --- | --- |
| a conversation | four turns, both registers | no `data-state`, no `data-streaming` |
| streaming | a user turn and a streaming reply | `data-streaming` |
| in a box | eight turns in a 16rem harness | the thread scrolls inside itself |
| empty | `empty={<EmptyState …/>}` | the app's slot |

`requiredSelectors`: `:focus-visible` (the region's tab stop),
`[data-state="detached"]` (the reader's own state, created by scrolling, which
no prop can set; the stylesheet keys the jump control on it).

## Motion

`chat.message` on each turn's arrival: `slide-fade` `sm` from the bottom edge at
the `control` class, enter only. A turn arrives from the composer's edge and
never leaves, because a message leaving a thread would mean the thread rewriting
history. Reduced motion projects to `fade` on the same duration; at `none` the
duration token is zero. The follow itself is never animated. The viewport jumps,
because a smooth scroll under arriving text makes the reader chase the line.

## Icons

`down` on the jump control (labelled by `messages.jumpToLatest`).

## A11y

A `log` named by `label`, with `aria-relevant="additions"`, `aria-busy` while a
reply arrives, and a tab stop while it overflows. The turns are ChatMessage's
`<article>`s and carry their own names. The jump control is a real Button with
the app's label, present only while it does something. Follow never works
against the reader: a scroll up takes effect immediately, and the thread does
not move again until asked.

```contract
role viewport log
name viewport from label when a conversation
attr viewport aria-relevant=additions when a conversation
announces live:polite when a conversation
announces busy when streaming
attr viewport tabindex=0 when in a box
```

## Agent

An agent reads whether a reply is arriving. The log's `label` names the member. A turn is a
ChatMessage, which gives an agent nothing of its own, so an agent reads the turns as the
page's text, and each member a turn holds is listed within the thread. The thread withholds
its jump control: it moves the person's reading position back to the newest turn, which an
agent has no need of, because an agent reads every turn without scrolling. The jump control is
in the tree while it is hidden, so without the withholding an agent would find a Button the
person cannot see.

```agent
state streaming boolean as viewport aria-busy
withholds contents
```
