# ToolCall

One tool call in a model's reply, shown as a row the reader can open: what the model
asked a tool to do, whether it has finished, and what came back.

`@radix-ui/react-collapsible` supplies the disclosure (Collapsible's substrate).

ToolCall is like a Timeline event that is still in progress: it has a status that
changes, and the reader may want to look inside. It is *not* an Alert: it is a record of
work, not a message to the reader. It is *not* ApprovalCard, which asks before the work
happens. ToolCall shows the work. When the work is waiting on an answer, the status is
`approval` and the card that asks sits beside it.

**The app supplies the words and the vocabulary supplies the shapes.** `input` renders as
JsonTree when it is a value and as CodeBlock when it is a string; `output` is whatever the
app composes. The status is spoken in the app's language through `messages` and shown
with a matching glyph. The glyph is never used alone, because a reader who cannot see the
spinner must still hear "running".

## Anatomy

```
[card — Radix Collapsible root]
  [trigger <button>: [mark — Icon icon] [name — mono] [summary?] [trailing: [duration?] [status glyph] [status words, visually hidden] [chevron?]]]
  [content?]
    [inner: [section: heading "Input" + JsonTree | CodeBlock]? [section: heading "Output" + output]? [message?]]
```

## API

```ts
interface ToolCallProps {
  name: string // the tool's name as the model called it — read_file, search_web
  summary?: string // one line: the file read, the query run
  status: 'pending' | 'running' | 'done' | 'error' | 'denied' | 'approval'
  input?: unknown // the arguments — a value draws as JsonTree, a string as CodeBlock
  output?: ReactNode // what came back — a CodeBlock, a JsonTree, a Markdown
  message?: string // the app's words for a failure or a refusal
  icon?: IconRole // the tool's mark; tool by default, terminal / network / document when the app knows
  duration?: string // already formatted — "1.2s"
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  messages?: ToolCallMessages // { input, output, status: Record<status, string> } — generic English defaults
}
```

Attributes: `data-status` (set for every status, as in FileUpload, because `pending` is a
real state and not rest); `aria-busy="true"` while running; Radix
`data-state="open|closed"` on root, trigger and content. A call with no input, output or
message has no content, and its trigger is disabled. It is a plain row, not a button
that opens nothing.

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| card | column · bg `--pm-bg-subtle` (it sits inside a reply, so it is not a lit Card; a reply full of lit cards becomes a stack of boxes) · border `1px solid --pm-border-subtle` · radius `--pm-radius-control` (the row is a button) |
| trigger | full-width row · gap `--pm-space-2` · `min-block-size --pm-control-height-sm` · padding `--pm-space-1` `--pm-space-3` · `text.sm` quartet · `--pm-text-secondary` · transparent · the shared focus ring · `stateFeedback` |
| trigger hover (enabled) | `--pm-text-primary` on `--pm-bg-surface` |
| mark | `sm` glyph · `--pm-text-muted` |
| name | `--pm-font-mono` · `--pm-text-primary` |
| summary | `flex: 1` · ellipsis |
| duration | `text.xs` · `--pm-text-muted` · `font-variant-numeric: var(--pm-font-numeric)` |
| status glyph | `sm` · by status: pending `time` `--pm-text-muted` · running `loading` `--pm-accent-text` on the spin loop · done `success` `--pm-success-text` · error `error` `--pm-danger-text` · denied `denied` `--pm-text-muted` · approval `help` `--pm-warning-text` · enters by `toolcall.status` (`fade`, control) |
| error | card border `--pm-danger-border` · message `--pm-danger-text` |
| chevron | Icon `down` `sm` · `--pm-text-muted` · rotates 180° when open |
| inner | column · gap `--pm-space-3` · padding `--pm-space-2` `--pm-space-3` `--pm-space-3` · `border-block-start 1px solid --pm-border-subtle` |
| section heading | the overline style: `text.xs` · uppercase · `--pm-text-muted` |
| message | `text.sm` · `--pm-text-secondary` |

## States

| Entry | Render | Expect |
| --- | --- | --- |
| running | `status="running"` | `data-status="running"`, `aria-busy="true"` |
| done | closed, with a duration | `data-status="done"`, `data-state="closed"` |
| done, open | `defaultOpen`, a value input and a CodeBlock output | `data-state="open"` |
| a string input | `input="pnpm test"` | CodeBlock |
| pending | `status="pending"` | `data-status="pending"` |
| awaiting approval | `status="approval"` | `data-status="approval"` |
| failed | `status="error" message` | `data-status="error"` |
| denied | `status="denied"` | `data-status="denied"` |
| nothing inside | no input, no output | a row, not a button |

`requiredSelectors`: `:hover`, `:focus-visible`, `[data-state="open"]`,
`[data-state="closed"]`, and every `[data-status="…"]`, so all six statuses are proved
to have a recipe and not only a type.

## Motion

`collapsible.content` by reference for the body; the chevron turns over `control` ×
`standard`; `toolcall.status` (`fade` at the control duration) on the status glyph's
swap, as CodeBlock does for `copy`→`confirm`; `button.spinner`'s loop on `running` by
composition. Reduced motion: the collapse is instant, the chevron does not turn, the fade
keeps its duration, and the spin stops globally.

## Icons

`tool` by default and any role via `icon` (decorative; the name carries the meaning);
`time` / `loading` / `success` / `error` / `denied` / `help` by status (decorative; the
hidden status words are announced); `down` (decorative; `aria-expanded` announces the
state).

## A11y

The trigger is a real `<button aria-expanded aria-controls>`. Its name is the tool's name
and the status words together ("read_file, Running"), because the status words are
inside it, visually hidden. The words are the status's own name, except "awaiting approval" for
`approval` and "failed" for `error`, each capitalised after the tool's name as above. `aria-busy` while running. A call with nothing to open has a
disabled trigger, so keyboard focus never lands on a button that does nothing. The input
tree and the output keep their own members' semantics (JsonTree's disclosure list,
CodeBlock's region). The error message is the app's text in reading order, and the colour
matches it.

## Agent

An agent reads the call's status, one of the six words of `status`, and whether its details are
shown, and expands and collapses them. Both go through the member's own open state, so
`onOpenChange` reports an agent's change as it reports a person's, whether or not the caller
controls it. A call with nothing inside refuses `expand`, as its trigger is disabled then. The
trigger's name, the tool's name with the status words, names the member. A string input draws a
CodeBlock without a copy control, which registers nothing. A value input draws a JsonTree, which
is listed as a member of its own, named by its label (`messages.input`), so an agent opens and
closes the branches of a call's input as a person does; ToolCall does not withhold it. Every
call's input tree has the same name, and the snapshot lists members in document order, so each
is listed after its own call. The output is the app's content, and each member in it is listed as the app's:
a copyable CodeBlock the app passes as the output draws a copy Button, which an agent finds by its
name. The member's element is its trigger, so neither the input's JsonTree nor the members in the
output are listed `within` it. A ToolCall inside an ApprovalCard is not an agent's: the card
withholds what it holds.

```agent
state status text as root data-status
state expanded boolean as trigger aria-expanded
action expand sets expanded calls onOpenChange
action collapse sets expanded calls onOpenChange
```
