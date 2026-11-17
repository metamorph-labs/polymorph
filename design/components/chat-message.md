# ChatMessage

ChatMessage is one turn of a conversation: who said it, when, what they said,
and what happened to it. It has no substrate: an `<article>`, an Avatar or the
model's mark, and the turn's content.

**Two registers, chosen by `role` and never by the caller.** The reader's turn
is a bubble at the end edge: short, theirs, and clearly something they sent. The
model's turn is full-width prose with a mark at the start edge. It is the
content of the page, not a speech balloon, and a Markdown reply with a heading
and a table does not belong inside a rounded bubble. A system notice is neither:
a centred line in the muted step, where the thread reports on itself.

**The body is composition.** Markdown, StreamingText, a ToolCall, an
ApprovalCard, a row of AttachmentChips, a SourceList: whatever a turn holds goes
in `children`, in reading order, and the message only draws the frame. `actions`
is the hover row (copy, regenerate, rate). It shows on hover and on focus,
always shows on touch, and is never the only way to do anything: a reader who
cannot hover reaches the same Buttons in the tab order.

ChatMessage is *not* Card: a Card is a surface for any content, and a turn's
surface depends on its speaker. It is *not* a Timeline event: an event is a line
about something that happened, and a turn is the thing itself.

## Anatomy

```
[message <article aria-label={author}>]
  [mark — Avatar | the model mark (Icon "model" in a lit circle)]   — not for system
  [body]
    [meta: [author] [time?]]                                        — not for system
    [content — children]
    [notice? — Icon warning|error + statusMessage]                  — stopped / error
    [actions? — the hover row]
```

## API

```ts
interface ChatMessageProps {
  role: 'user' | 'assistant' | 'system' // who is speaking — decides the register
  author: string // the speaker's name: the article's accessible name and the meta row's first word
  avatar?: string // a picture of the speaker; absent, the reader's initials or the model's mark
  time?: string // already formatted by the app (Timeline's rule for time)
  status?: 'streaming' | 'complete' | 'stopped' | 'error' // complete is the rest state
  statusMessage?: string // the app's words for stopped or error
  actions?: ReactNode // the hover row — ghost/neutral/sm iconOnly Buttons
  children: ReactNode // the turn's content, in reading order
}
```

Attributes: `data-role`; `data-status="streaming|stopped|error"` (absent when
complete); `aria-busy="true"` while streaming.

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| message | row · gap `--pm-space-3` · aligned to the top |
| mark, model | `--pm-space-7` square · radius `--pm-radius-pill` · Icon `model` `sm` in `--pm-accent-text` on `--pm-accent-subtle` · border `1px solid --pm-accent-bg`. It is the size of an md Avatar, so both speakers' marks align on one axis |
| mark, pictured or reader | `Avatar size="md" name={author} src={avatar}` |
| body | column · gap `--pm-space-2` · `min-inline-size: 0` |
| author | `text.sm` at `--pm-text-xl-weight` (Text's `strong` cell) · `--pm-text-primary` |
| time | `text.xs` · `--pm-text-muted` · beside the author at the baseline |
| content | column · gap `--pm-space-3` |
| notice | `text.xs` · `--pm-text-secondary` · glyph `warning` in `--pm-warning-text` (stopped) or `error` in `--pm-danger-text` (error) · gap `--pm-space-2` |
| actions | wrapping row · gap `--pm-space-1` · `opacity: 0` at rest, `1` on `:hover` and `:focus-within`, always `1` under `(hover: none)` · fades over `control` × `standard` |
| reader's turn | the row reversed: mark at the end edge, body aligned to the end · content `max-inline-size: calc(--pm-space-10 * 6)` (576 at standard density, about three quarters of ChatThread's measure; a narrower column is just filled) · padding `--pm-space-3` `--pm-space-4` · bg `--pm-bg-subtle` · border `1px solid --pm-border-subtle` · radius `--pm-radius-surface` with `border-end-end-radius --pm-radius-control`; this one asymmetric corner shows which side spoke |
| system notice | centred · content `text.xs` · `--pm-text-muted` · no mark, no meta |

## States

| Entry | Render | Expect |
| --- | --- | --- |
| the reader | `role="user"`, a sentence | `data-role="user"`, no `data-status` |
| the reader, with files | a sentence and two AttachmentChips | — |
| the model | `role="assistant"`, Markdown, `actions` | `data-role="assistant"`, `aria-label` |
| the model, streaming | `status="streaming"`, StreamingText | `data-status="streaming"`, `aria-busy` |
| stopped | `status="stopped" statusMessage` | `data-status="stopped"` |
| error | `status="error" statusMessage` | `data-status="error"` |
| a pictured speaker | `avatar` | an Avatar in the mark |
| a system notice | `role="system"` | `data-role="system"` |

`requiredSelectors`: `:hover`, `:focus-within`, `[data-status="error"]`. These
are the states that reveal the actions row, and the one status the stylesheet
keys beyond the base.

## Motion

The actions row fades over the control duration. It changes opacity only, so
reduced motion has nothing to remove, and the buttons never move. The turn's
arrival in a thread is `chat.message`: `slide-fade` `sm` from the bottom edge,
`control` class, enter only. **ChatThread** runs it, not this member, because a
message knows nothing about the list it joined.

## Icons

`model` (the assistant's mark, decorative because the article is named),
`warning` / `error` (the notice, decorative because the text explains), `user`
through Avatar's fallback. The actions bring their own labelled icons: `copy`,
`refresh`, `helpful`, `unhelpful`.

## A11y

An `<article>` named by `author`, so a reader moving by article hears who is
speaking. `aria-busy` while the turn streams. The model's mark is `aria-hidden`.
The Avatar is decorative beside the visible author (Avatar's own rule). The
notice is text in reading order with a matching glyph. The actions are real
Buttons in the tab order at every opacity. The row uses `opacity`, never
`display` or `visibility`, so a row faded for a pointer stays available to a
keyboard, and it shows as soon as focus enters it.

## Agent

An agent gets nothing from a ChatMessage itself. Its words are on the page, its actions are
Buttons an agent presses as it presses any other, and ChatThread reports whether a reply is
still arriving. Registering would also make this member a client component in a React Server
Components application, which an application that uses no agent bridge would pay for.
