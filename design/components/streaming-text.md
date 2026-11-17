# StreamingText

Plain text that is still arriving, such as a model's reply before it finishes. It shows
the words received so far and a caret where the next one will appear.

It has no substrate: a paragraph, a caret, and Skeleton's bar for the moment before the
first word.

StreamingText is Text for a paragraph that has not ended yet. It is *not* Markdown: it
keeps whitespace and draws no structure, so it suits a reply the app knows is prose (a
one-line answer, a status sentence, a transcript line). If the text can contain a
heading or a code fence, use Markdown. It is *not* Skeleton: a skeleton stands for
content whose shape is known but which has not arrived. StreamingText shows content
arriving in pieces, and uses Skeleton's bar only while *nothing* has arrived.

The app owns the network (FileUpload's rule). The member draws the string it is given and
reports `streaming` as the app sets it. It never fetches, buffers or throttles.

## Anatomy

```
[root <div>]
  [text <p> — the words so far, whitespace kept]
    [caret <span>? — while streaming, aria-hidden]
  — or, while streaming with nothing landed —
  [Skeleton text — one line of the step]
```

## API

```ts
interface StreamingTextProps {
  children: string // what has arrived so far, verbatim — whitespace and line breaks are content
  streaming?: boolean // more is coming: the caret shows and the root reports aria-busy
  size?: 'sm' | 'md' // Text's two steps, default md
}
```

Attributes: `data-size`; `data-state="streaming"` while arriving (absent at rest, when the
paragraph is finished and renders like Text); `data-pending` while streaming with an
empty string; `aria-busy="true"` while streaming.

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| text | Text's recipe by step: `text.sm` / `text.md` quartet · `--pm-text-primary` · `white-space: pre-wrap` · `overflow-wrap: anywhere` (an unbroken token must not widen the thread) |
| caret | `2px` wide (a stroke, a structural literal) · `block-size` the step's `--pm-text-*-size` (one character tall) · `margin-inline-start --pm-space-1` · bg `--pm-accent-bg` · radius `1px` · `vertical-align: text-bottom` |
| pending | `Skeleton shape="text" textStep={size} width={9}`: the step's exact line box, so the first word replaces it without a layout jump |

## States

| Entry | Render | Expect |
| --- | --- | --- |
| arriving | `streaming`, a half sentence | `data-state="streaming"`, `aria-busy="true"`, no `data-pending` |
| pending | `streaming`, `''` | `data-state="streaming"`, `data-pending` |
| complete | a finished sentence | no `data-state`, no `aria-busy` |
| sm | `size="sm" streaming` | `data-size="sm"` |
| line breaks | text with `\n` | the break is kept |

`requiredSelectors`: none. Every state is a prop, and a paragraph has no hover, focus or
press.

## Motion

**The caret does not blink.** A blink would be an ambient loop with no pattern behind it.
In `design/motion/motion.md` every binding names a pattern, and the two ambient patterns
are `shimmer` and `spin`. A steady caret shows that text is still arriving as well as a
blinking one, without being the only thing on the page that moves while the reader
reads. The pending bar gets Skeleton's `shimmer` by composition: `streaming.pending` is
the binding and Skeleton draws the sheen. Its temperament scaling and reduced-motion stop
are therefore Skeleton's. Nothing else moves; the arriving text is the only motion.

## Icons

None.

## A11y

A `<p>`, with `aria-busy="true"` on the root while streaming so assistive
technology knows the paragraph is not finished. The caret is `aria-hidden` and contains
no character, so a screen reader never reads it. The pending Skeleton is decorative (no
`label`), because the root's `aria-busy` already explains the bar.

Announcing the reply is **not** this member's job, on purpose. A live region on a
paragraph that grows token by token would read each token as it arrived, and the reply
would be announced twice. ChatThread wraps every turn in one `log` region and announces a
message when it is added, which is the right moment to announce it.
