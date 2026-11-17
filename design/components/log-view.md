# LogView

LogView shows lines of output that arrive over time, such as a build's output, an agent's
console or an audit stream, and holds the view at the newest line while the reader is there.
It follows as ChatThread does, on CodeBlock's code surface. It has no substrate: a scroll
container, a list, and one Button.

It is not CodeBlock, which shows one finished text to read and copy, and does not follow or
mark a line. It is not Table, which compares the fields of structured records down its
columns: a frame with a shard, a sequence and a document is a row of a Table, and a line of
text is a line of a LogView. It is not ChatThread, which follows a conversation's turns.

LogView owns a scroll region for ChatThread's reason (`chat-thread.md`): output outgrows any
box and is read from the end while it grows. It fills the box it is given (ScrollArea's
contract), and the application provides the box: a panel, a pane or a page region. In a
container with no block size of its own, it grows with its lines and the page scrolls.

**The reader controls follow.** The log follows the newest line only while the reader is at
the end. When they scroll up, it stops where they put it and offers one control, jump to
latest, to return. The rule and its thresholds are ChatThread's: both call the engine's
`followEnd`.

**The application owns the window.** It passes the lines it wants shown, oldest first, and
trims the old ones when it wants fewer. LogView draws every line it is passed. It does not
virtualise, parse ANSI colour codes, search, filter or pause a stream: a filter is the
application's choice of lines, and pausing a stream is the application stopping it. It is
meant for a window of up to 5,000 lines, which it renders and follows without a visible
stall. An application that keeps more trims to that window, because every line is in the
document.

## Anatomy

```
[root]
  [viewport <div role="log" aria-label aria-live="off"> — the scroll region; a tab stop while overflowing]
    [lines <ol role="list">]
      [line <li data-level?>]*   [marker: level icon | empty] [spoken level word?] [time?] [text: [source?] [message]]
      [end <li aria-hidden>?]    the caret, while streaming
  [jump [backing [Button outline/neutral/sm icon "down"]]]   — while detached
```

## API

```ts
interface LogLine {
  id: string                                  // unique in the log and the same on every render: the line's key
  text: string                                // the line as it was written; whitespace is content
  level?: 'info' | 'warning' | 'error'        // drawn as a marker and read as a word; none is ordinary output
  time?: string                               // already formatted by the app (Timeline's rule)
  source?: string                             // what wrote the line: a service, a process, a build step
}

interface LogViewProps {
  label: string                               // the log's accessible name: "Build output", not "Log"
  lines: LogLine[]                            // the lines to show, oldest first; the app trims the old ones
  streaming?: boolean                         // more lines are coming: a caret after the last line, and aria-busy
  wrap?: boolean                              // a long line wraps (default); false scrolls the log sideways
  messages?: {                                // the localization seam: every key, or none
    jumpToLatest: string                      // the control that returns to the newest line; default "Jump to latest"
    info: string                              // read before an info line; default "info"
    warning: string                           // read before a warning line; default "warning"
    error: string                             // read before an error line; default "error"
  }
}
```

Attributes: root `data-state="detached"` while the reader has scrolled away from the end (the
reader's own state; absent at rest), `data-streaming` while more lines are coming, and
`data-wrap` while long lines wrap. A line carries `data-level` when it has a level, and an
ordinary line carries none, which is the rest state. The viewport carries `aria-busy` while
streaming.

**`time` is text the application formatted**, as Timeline's and ChatMessage's are, and not an
ISO string the member formats. RelativeTime's spec makes that rule: a member that displays a
time without deciding its format takes it formatted. A log's time is the application's
decision in a way a date is not. It may be a clock time with milliseconds, an offset from the
start of a build (`+012s`) or a UTC stamp, and an offset is not a moment `Intl` can format.
RelativeTime's words never refresh, and "2s ago" on a stream is out of date before it is
read. A member that formatted the times would also run `Intl` once for every line on every
render.

**`source` is a field of its own**, because a live tail that several services write to
interleaves their lines, and the reader must tell them apart. A live tail draws it apart from
the message and filters by it. Written into `text` instead, it would not be read as metadata
or drawn as one. It is drawn at the start of the text, muted, and not in a column of its own:
a column sized to the longest source would need every line to measure it, and a line that
arrives would lay out every line again.

**`wrap` is on by default.** CodeBlock scrolls sideways because a command must not break and
its block is short. Diff wraps because a diff is read down its rows, and a row that scrolled
sideways would hide the change at its end. A log is read down its rows too, and the end of a
line is often its outcome ("502 timeout after 5000ms"). A log that scrolls on two axes also
moves its times and markers out of view as the reader pans. `wrap={false}` is for output
whose columns line up, such as a process table.

**A level is never colour alone.** A line with a level carries the level's icon in its marker
cell and a hidden word before its text, so a screen reader hears "error" where the eye sees
the mark. `info` is the quiet level: a muted icon and no wash. `warning` and `error` wash the
marker cell. A line without a level is ordinary output and carries no mark and no word.

## Behaviour

- **Follow.** ChatThread's rule, by the engine's `followEnd`. A scroll event says whether the
  reader is at the end (within 24px). A resize of the list says a line arrived. While the
  reader is at the end, the viewport moves to the new end. When they scroll up, nothing moves
  until they press the jump control or scroll back to the end. Scrolling sideways does not
  stop the follow.
- **The jump control** shows only while detached. It returns the viewport to the end and
  follows again from the press (`jumpToEnd`). Its label is `messages.jumpToLatest`. It is
  always in the tree and shown by the stylesheet from the root's `data-state`. `display: none`
  keeps it out of the tab order while hidden.
- **Reachable.** The region is a tab stop exactly while it overflows on either axis
  (CodeBlock's rule). With focus on it, the arrow keys, Page Up, Page Down, Home and End
  scroll it, as they scroll any focused scroll container. End returns to the end, and the
  follow resumes there.
- **A line that arrives lays out only itself.** Each line is its own grid, keyed by its `id`,
  and a line already in the document is kept as it is, so a line added to five thousand lays
  out one line.

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| root | column · `block-size: 100%` · `min-block-size: 0` · `position: relative` |
| viewport | `flex: 1` · `min-block-size: 0` · `overflow: auto` · no `overscroll-behavior`, unlike ChatThread, because a log sits in a page that may scroll and `contain` stops the wheel over a log with nothing to scroll · CodeBlock's surface: `--pm-font-mono` · `--pm-text-sm-size` and line height · `--pm-text-primary` · bg `--pm-bg-subtle` · border `1px solid --pm-border-subtle` · radius `--pm-radius-md` · the shared focus ring |
| lines | padding-block `--pm-space-2` · at least the viewport's width; as wide as the longest line when unwrapped |
| line | a grid: the marker's column `--pm-space-6`, the time's `auto`, the text's `minmax(0, 1fr)` |
| marker | one line tall at least, so a line with no level is still a row · as tall as the whole line when it wraps, so the wash marks all of it · the icon centred in the first row · not selectable |
| marker, info | the `info` icon, `sm` · `--pm-text-muted`, no wash |
| marker, warning | the `warning` icon, `sm` · `--pm-warning-text` on `--pm-warning-subtle` |
| marker, error | the `error` icon, `sm` · `--pm-danger-text` on `--pm-danger-subtle` |
| time | padding-inline-start `--pm-space-3` · `--pm-text-muted` |
| text | padding-inline `--pm-space-3` · `white-space: pre`; wrapped, `pre-wrap` and `overflow-wrap: anywhere`, so the log never widens its container |
| source | `--pm-text-muted`, before the text, one space from it |
| end | one line tall · the caret at the text's start: `2px` × `--pm-text-sm-size`, `--pm-accent-bg`, radius `1px`, StreamingText's caret |
| jump | ChatThread's: absolute · `inset-block-end --pm-space-4` · centred · `z-index --pm-z-raise` · `Button outline/neutral sm icon="down" label={messages.jumpToLatest}` · `display: none` at rest, `flex` under `[data-state="detached"]` |
| backing | under the jump Button: bg `--pm-bg-raised` · radius `--pm-radius-control` · `--pm-shadow-raised`, because an outline Button is transparent and the control floats over lines of text |

The contrast law holds `{tone}.text` on `{tone}.subtle`, which is the marker's icon on its
cell, and `text.primary` and `text.muted` on `bg.subtle`, which is the line, its time and its
source. It holds no text on a status wash, so the wash stops at the marker cell, as Diff's
does, and an error line's text stays `text.primary`.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| build output | plain lines, a warning and two errors | `data-wrap`, no `data-state`, no `data-streaming` |
| service logs | a time, a level and a source on every line | — |
| streaming | the first four lines of the build, `streaming` | `data-streaming`, the caret |
| waiting | `streaming` with no lines | `data-streaming`, the caret alone |
| in a box | forty lines in a 288px harness | the log scrolls inside itself, at its end |
| unwrapped | long lines, `wrap={false}`, in a box | the log scrolls sideways |
| narrow | the same lines in a 288px column | the lines wrap; nothing scrolls sideways |

`requiredSelectors`: `:focus-visible` (the region's tab stop), `[data-state="detached"]` (the
reader's own state, which no prop can set; the stylesheet keys the jump control on it).

## Motion

None. A line appears at once, because lines can arrive faster than any transition ends, and
the follow is never animated, because a smooth scroll under arriving lines makes the reader
chase them. The caret does not blink (StreamingText's rule).

## Icons

`info`, `warning` and `error` in a line's marker cell, decorative, because the hidden word
says the level. `down` on the jump control, labelled by `messages.jumpToLatest`.

## A11y

A `log` named by `label`, holding one `<ol role="list">`: a line is one statement, and a list
reads it in one stop and says how many lines there are (Diff's reason). A line reads as its
level's word, its time, its source and its text, in that order.

**The log announces nothing on its own** (`aria-live="off"`), which is where it differs from
ChatThread. A thread adds a turn every few seconds, and each is worth hearing once. A build
can write hundreds of lines a second, and a polite live region queues every one: the reader
hears the queue for minutes, and every other announcement on the page waits behind it,
including the application's own "Build failed". `aria-busy` cannot prevent that, because not
every screen reader holds a live region's changes while it is set. So the reader reads the
log at their own pace, and the application announces what a stream came to, through a Toast,
a Banner or its own status. The log keeps the `log` role, so it is found and named as one, and
`aria-busy` while streaming says it is not finished.

The region is a tab stop while it overflows. The caret is hidden from assistive technology,
and so are the markers, because the words say the level. The jump control is a real Button
with the app's label, present only while it does something.

A native renderer has no `log` role and no live region to turn off: the log is a container
named by `label` that announces nothing, and each line is one element read as the web's
line is. It is no tab stop, because VoiceOver and TalkBack scroll it with their own gestures
and a hardware keyboard with the system's. SwiftUI marks it as updating while `streaming`;
Compose has no busy state.

```contract
role viewport log when build output
name viewport from label when build output
attr viewport aria-live=off when build output
announces busy when streaming
attr viewport tabindex=0 when in a box
```
