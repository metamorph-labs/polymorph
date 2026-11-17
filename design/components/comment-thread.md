# CommentThread

A CommentThread shows the comments people leave on a record, such as a ticket, an artifact or a
document, with their replies. It is a list of comments read from top to bottom. Each comment has
an author, a time, a body, and may have a mark, labels, an edited mark, the app's actions and its
replies. Replies are one level deep. There is no substrate: an `<ol>` of comments, each an
`<article>` in a list item.

It is not ChatThread. A ChatThread is a log of two speakers, the reader and the model: it scrolls
inside itself, follows the newest turn and announces each turn that joins it (`chat-thread.md`).
A comment thread has many authors, sits in the page, is read from the top, follows nothing and
announces nothing. It is not ChatMessage either. ChatMessage's `role` chooses between the
reader's bubble at the end edge and the model's prose at the start edge (`chat-message.md`), so
a third person has no register there, and a turn has no replies. It is not List, whose item is
read as one title and one line, and is followed or picked (`list.md`): a comment's body is
paragraphs the app composes, and its actions are several controls. It is not Timeline, whose
entries are lines about past events and are never controls (`timeline.md`): a comment is the
thing itself, and it takes actions.

## Anatomy

```
[CommentThread — <ol aria-label>]
  [CommentThread.Comment — <li>]*
    [entry — <article aria-labelledby="author time">]
      [mark? — the avatar slot, in a fixed column]
      [body]
        [head: [author] [time?] [edited?] [meta?]]
        [content — children]
        [actions?]
    [replies? — <ol aria-label={messages.replies}>]
      [CommentThread.Comment — <li>]*
```

## API

| Component | Prop | Type | Notes |
| --- | --- | --- | --- |
| `CommentThread` | `label` | `string` required | names the list for a reader: "Comments", not "Thread". The list's item count is the number of comments at its top level |
| | `messages` | `CommentThreadMessages` | the words the member writes itself, for every comment in the thread; English by default |
| | `children` | `CommentThread.Comment`s | in the order they are read. The member never sorts them |
| `CommentThread.Comment` | `author` | `string` required | the author's name, drawn first in the head. With the time it is the article's accessible name |
| | `avatar` | `ReactNode` | an `Avatar` with the author's `name`, drawn in a column one md Avatar wide. It is decorative beside the visible name (Avatar's own rule) |
| | `time` | `ReactNode` | when it was written: a `RelativeTime`, or text the app has formatted. The member formats no time |
| | `edited` | `boolean` | the comment was changed after it was posted. The head shows `messages.edited` after the time |
| | `meta` | `ReactNode` | labels after the head's words: `Badge`s such as "Internal note" or "Resolved" |
| | `actions` | `ReactNode` | the app's controls for this comment, in a wrapping row under the body: `ghost` `neutral` `sm` Buttons, or a `Menu` |
| | `replies` | `ReactNode` | the replies, as `CommentThread.Comment`s, drawn indented under the comment |
| | `children` | `ReactNode` | the body: `Text`, `Markdown`, or the app's own nodes with its mentions and links, and a row of `AttachmentChip`s. The member never parses the body |

```ts
interface CommentThreadMessages {
  edited: string // after the time of an edited comment; default "Edited"
  replies: string // the name of a comment's list of replies; default "Replies"
}
```

Attributes: none. A comment has no state the stylesheet keys on.

**The body is the app's.** Mentions, links, code and formatting are nodes the app passes in
`children`. Attachments are a row of `AttachmentChip`s in an `Inline` with `wrap`, after the
words, as in a ChatMessage. A comment that was removed is a comment whose body is the app's text
for it ("Comment removed"). Editing in place is the app's: while it edits, it passes a `Textarea`
and its Buttons as the comment's children.

**Status is a label.** "Internal note", "Resolved" and "Customer visible" are Badges in `meta`.
The member draws no tone of its own for them. One product needs each of them, so each stays the
app's choice of Badge, and the comment around it is drawn the same.

**The composer is the app's.** Replying is a `Textarea` in a `FormField` with a `Button`, or a
`PromptInput`, placed after the thread. The member owns no action and no composer. A thread that
loads further windows puts a `CursorPagination` with `mode="append"` under it. A thread with no
comments draws nothing, and the app renders an `EmptyState` in its place.

**Two levels.** A reply is a comment in its parent's `replies`. A reply to a reply belongs in the
root comment's `replies`, after the reply it answers, with the person it answers named in its
body. A comment nested deeper is still drawn at the second level, with no further indentation,
so a long exchange never narrows the column at phone width. Its markup still nests, so a screen
reader reads which comment it answers.

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| thread | column · gap `--pm-space-5` · no list markers · no padding |
| comment | column · `min-inline-size: 0` |
| entry | row · gap `--pm-space-3` · aligned to the top |
| mark | `--pm-space-7` wide (an md Avatar) · its content centred in it |
| body | column · gap `--pm-space-2` · takes the free width · `min-inline-size: 0` |
| head | wrapping row · column gap `--pm-space-2` · row gap `--pm-space-1` · aligned at the baseline |
| author | `text.sm` at `--pm-text-xl-weight` (Text's `strong` cell) · `--pm-text-primary` · a long name breaks |
| time, edited | `text.xs` quartet · `--pm-text-muted` |
| meta | wrapping row · gap `--pm-space-1` · centred on the head's line |
| content | column · gap `--pm-space-2` · `overflow-wrap: anywhere`, so an unbroken word or address wraps and never widens the container |
| actions | wrapping row · gap `--pm-space-1` · always shown |
| replies | column · gap `--pm-space-4` · `--pm-space-4` above · indented `calc(--pm-space-7 + --pm-space-3)`, so a reply's mark starts where its parent's body starts · a rule of `1px` `--pm-border-subtle` down the middle of the parent's mark column |
| deeper replies | no indentation and no rule: drawn at the second level |

The actions are always shown. A comment's actions differ from one comment to the next (only its
author edits it), so they are information, and a row shown only on hover hides that. The rule
beside the replies ties them to their parent where there is no Avatar to align them with.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| a thread with replies | two comments, the first with two replies, Avatars, a time and actions | `aria-label="Comments"` |
| an internal note | `meta` holds a warning Badge, "Internal note" | — |
| an edited comment | `edited` | the head shows "Edited" |
| a resolved thread | `meta` holds a success Badge, "Resolved", and the comment has a reply | — |
| attachments and a mention | the body is a Text with a Link to the person and a row of two AttachmentChips | — |
| a reply to a reply — drawn at the second level | a reply whose `replies` hold one comment | the third comment starts where the second does |
| long unbroken text at phone width | an unbroken address in a body and an unbroken name, in a box narrower than a phone | wraps, no sideways scroll |
| followed by a composer | the thread, then a FormField with a Textarea, then a Button | the composer is the app's |

`requiredSelectors`: none. Nothing here is hovered, focused or pressed: the controls are the
app's members, which carry their own states.

## Motion

None. A comment arrives with the page that fetched it, or after the reader's own submit, where
the composer's cleared field is the feedback. Timeline's rule applies: there is no entrance to
animate, and nothing in a comment changes state.

## Icons

None of its own. The app's actions bring their own labelled icons.

## A11y

The thread is an `<ol>` named by `label`, so a screen reader announces it by name with the number
of comments at its top level. The role is written on the list because a browser drops a list's
semantics when its markers are removed. Each comment is a list item that holds an `<article>`,
named by its author and its time through `aria-labelledby`, so a reader moving by article hears
who wrote it and when. The Avatar is decorative beside the visible name. The edited mark, the
labels, the body and the actions follow in reading order.

A comment's replies are a second `<ol>` inside its list item, named by `messages.replies`. A
reply is therefore reached as a reply through structure: a screen reader announces the nested
list and its count. The member writes no wording of its own for the level.

Nothing is a live region. A thread is read, not followed, and comments that arrive with a page
or a window are not news. A comment that arrives while the reader is on the page is the app's to
announce: a `Toast` after the reader's own submit, or the app's own status.

```contract
role root list
name root from label
role replies list when a thread with replies
```
