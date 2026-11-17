# ApprovalCard

ApprovalCard asks the person to allow an action that an agent wants to take. It
has no substrate: a labelled section, a glyph, and two Buttons.

ApprovalCard asks ConfirmDialog's question without a modal. A dialog blocks the
whole page for one answer. An approval sits *in the thread*, next to the turn that
asked, and the reader can keep reading, scroll back, or answer another one first.
It is *not* an Alert: an alert informs, and this asks, with two buttons. It is
*not* a ToolCall: a ToolCall shows what ran, and this shows what wants to run. It
often contains a ToolCall.

**One card with two faces.** Undecided, it shows the question and the two actions.
Once `decision` is set, the actions are removed and the outcome is drawn in their
place, so the thread keeps a record of what was allowed instead of two inactive
buttons. `pending` names the decision in flight, so the button the reader pressed
is the one that shows it.

**The app makes the decision permanent.** The card asks through `onApprove` and
`onDeny` and draws `decision` as given. It never stores an answer itself, because
an approval the app did not receive is not an approval.

## Anatomy

```
[card <section aria-labelledby>]
  [head: [glyph — warning | error] [copy: [title] [description?]]]
  [details? — children]
  [actions — Button solid (approve) · Button outline/neutral (deny)]   — undecided
  [outcome — Icon confirm | denied + the words]                        — decided
```

## API

```ts
interface ApprovalCardProps {
  title: string // what wants to happen, as a question a reader can answer
  description?: string
  tone?: 'warning' | 'danger' // warning asks; danger asks about something that cannot be undone. Default warning
  children?: ReactNode // the details — a ToolCall, a CodeBlock, a DescriptionList
  onApprove: () => void
  onDeny: () => void
  decision?: 'approved' | 'denied' // the decided face: the actions go, the outcome stays
  pending?: 'approved' | 'denied' // the decision being sent — that button shows it, the other waits
  approveLabel?: string // the approve control's text; default Allow
  denyLabel?: string // the deny control's text; default Deny
  messages?: { approved: string; denied: string } // the decided face's words; defaults Allowed / Denied
}
```

Attributes: `data-tone`; `data-decision="approved|denied"` once decided (absent at
rest); `data-state="loading"` with `aria-busy` while `pending`.

## Recipes (exact tokens)

It uses Alert's wash, because it belongs to Alert's family.

| Part | Tokens |
| --- | --- |
| card | column · gap `--pm-space-4` · padding `--pm-space-4` · `1px solid` border · radius `--pm-radius-lg` · `stateFeedback` |
| card, warning | bg `--pm-warning-subtle` · border `--pm-warning-border` · glyph `warning` in `--pm-warning-text` |
| card, danger | bg `--pm-danger-subtle` · border `--pm-danger-border` · glyph `error` in `--pm-danger-text` |
| glyph | `md` · top-aligned to the title's line box (as in Alert) |
| title | `text.sm` quartet · `--pm-text-primary`; hierarchy comes from colour, never from an added weight |
| description | `text.sm` · `--pm-text-secondary` · `--pm-space-1` below the title |
| details | the children on their own surfaces, inside the wash |
| actions | wrapping row · gap `--pm-space-3` · approve `Button solid/accent sm` (`solid/danger` at danger tone), the card's only solid · deny `Button outline/neutral sm`, because declining is never dangerous |
| pending | the named button `loading`, the other `disabled` |
| decided | bg `--pm-bg-surface` · border `--pm-border-subtle` · glyph `--pm-text-muted`, because the question is answered and the card is now a record · outcome `text.sm` `--pm-text-secondary` with Icon `confirm` in `--pm-success-text` (approved) or `denied` in `--pm-text-muted` (denied), gap `--pm-space-2` |

## States

| Entry | Render | Expect |
| --- | --- | --- |
| asking | title, description, a CodeBlock, two answers | `data-tone="warning"`, no `data-decision`, no `data-state` |
| danger | `tone="danger"`, custom labels | `data-tone="danger"` |
| pending | `pending="approved"` | `data-state="loading"`, `aria-busy="true"` |
| allowed | `decision="approved"` | `data-decision="approved"` |
| denied | `decision="denied"` | `data-decision="denied"` |
| title only | no description, no children | — |

`requiredSelectors`: `[data-tone="warning"]`, `[data-tone="danger"]`,
`[data-decision="approved"]`, `[data-decision="denied"]`. These are the cells the
stylesheet keys beyond the base. The buttons' hover, focus and press belong to
Button.

## Motion

The wash changes on decision through `stateFeedback` (`background-color`,
`border-color`). Nothing else moves. There is no entrance: the card arrives with
the turn that asked, and ChatMessage's arrival is the only motion. The buttons'
`loading` spin is Button's own.

## Icons

`warning` / `error` by tone (decorative, because the title asks the question);
`confirm` / `denied` on the decided face (decorative, because the outcome text
states it).

## A11y

A `<section>` named by its title (`aria-labelledby`), so a screen reader lands on
the question. Both answers are real Buttons with the app's labels, and the approve
control is the only solid one. While `pending`, the card is `aria-busy`, and the
pressed button reports busy through Button's own `aria-busy`. Once decided, the
buttons are removed, not disabled, and the outcome is a sentence in reading order,
so the record is announced as well as shown. Tone is never the only signal: the
title's words state the stakes, and `danger` only adds colour.

## Agent

An agent reads what is asked (`title`), the decision once the app records it (`approved` or
`denied`, the empty string while undecided) and the decision being sent (the same words, the
empty string when none is). It runs no action. A person approves what an agent asks to do, so
the card withholds everything it holds: its Buttons, and the details inside it, are not members
an agent lists, finds or runs.

```agent
state title text
state decision text as root data-decision
state pending text
withholds contents
```
