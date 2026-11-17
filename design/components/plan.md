# Plan

The steps of one agent run, each with its status: what the agent intends to do and how far
it has got. The app passes the whole list on every change, so the list changes while the
run goes on, and a reader takes in where the run is at a glance. It has no substrate: an
ordered list, one glyph per step and one hidden status line.

Plan is not Stepper. A Stepper is the reader's own flow, such as a checkout, which the reader
walks and may step back through. Plan is the agent's work, which the reader watches and does
not drive. It is not Timeline. A Timeline holds dated events that are over, and none of its
entries changes. A Plan's steps change status while the reader looks. It is not ToolCall. A
ToolCall is one invocation, opened to see its input and output. A Plan step is a line of
intent, and one step may make several tool calls or none. It is not List, whose items a
reader follows or picks, and it is not Progress, which measures one task as a number.

**Flat and read-only.** A step has no steps inside it, nothing to press and nothing to open.
An agent that nests its work passes the steps a reader needs in reading order. The detail of
one step belongs to the ToolCalls in the turn, and a reader who wants to stop the run uses
the composer's stop control. An approval is ApprovalCard's and ToolCall's business. A step
that waits on one stays `running`, and the card that asks sits in the turn.

**The app owns the run.** Plan draws the statuses it is handed. It never infers one, never
times a step and never reorders the list.

## Anatomy

```
[root]
  [list — <ol role="list" aria-label>]
    [step <li>]*   (the first running step is the current one)
      [mark — the status glyph]   (aria-hidden)
      [copy: [title] [status words, visually hidden] [description?]]
  [status line — role="status", visually hidden]
```

## API

```ts
interface PlanProps {
  label: string // names the list for a reader — "Plan for this run", not "Plan"
  steps: PlanStep[] // in reading order; Plan never sorts them. Empty renders nothing
  messages?: PlanMessages // the words for each status — generic English defaults
}

type PlanStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped'

interface PlanStep {
  id: string // unique in the plan; the step keeps its row while its status changes
  title: string // what the step does, in the product's words
  description?: string // one line under the title: what the step found, or why it failed
  status: PlanStatus
}

interface PlanMessages {
  status: Record<PlanStatus, string> // Pending, Running, Done, Failed, Skipped
}
```

**The statuses.** `pending`, `running`, `done` and `error` are ToolCall's words for the same
states, with the same glyphs and the same spoken words. `skipped` is Plan's own: a step the
run passed over, because a condition made it unnecessary, the reader denied what it needed,
or an earlier step failed. ToolCall has no such status, because a call that never ran is not
shown. ToolCall's `denied` and `approval` are not Plan statuses. A denied action is an error
or a skip for the step that needed it, and a step waiting on an approval is still running.

**Localization.** Every word the member writes itself is in `messages.status`, and an app
passes all five or none, so one Plan never mixes two languages. The English defaults are
"Pending", "Running", "Done", "Failed" and "Skipped". `label`, each title and each
description are the app's.

Attributes: each step carries `data-status`, for every status, because `pending` is a real
status and not a rest state (ToolCall's rule). The first running step carries
`aria-current="step"`, and every running step `aria-busy="true"`.

## Recipes (exact tokens)

Plan draws no surface of its own. It sits inside a turn, a Card or a pane, and takes that
surface. A box around it inside a reply would be a second box around the reply's ToolCalls.

| Part | Tokens |
| --- | --- |
| root | column · `min-inline-size: 0` |
| list | column · gap `--pm-space-3` · no marker, margin or padding |
| step | row · gap `--pm-space-2` · top-aligned · `min-inline-size: 0` |
| mark | one `text.sm` line tall (`calc(--pm-text-sm-line-height × --pm-text-sm-size)`), so the glyph stays beside the title's first line however far the title wraps · Icon `sm` |
| mark, by status | pending `time` `--pm-text-muted` · running `loading` `--pm-accent-text` on the spin loop · done `success` `--pm-success-text` · error `error` `--pm-danger-text` · skipped `remove` `--pm-text-muted` · the glyph enters by `toolcall.status` (`fade`, control) |
| copy | column · `flex: 1` · `min-inline-size: 0` · `overflow-wrap: anywhere`, so a long title or path wraps and the list never widens its container |
| title | `text.sm` quartet · `--pm-text-primary` · `--pm-text-secondary` when pending or skipped |
| description | `text.xs` quartet · top gap `2px` · `--pm-text-secondary` · `--pm-text-muted` when pending or skipped |
| status words, status line | the visually hidden convention (`conventions/a11y`) |

A pending step and a skipped step are quieter than the others by their text roles alone:
the title steps down to `text.secondary` and the description to `text.muted`, both roles the
contrast law holds on every background. Nothing is struck through, because a struck title is
harder to read and the status words already say the step was skipped. An error keeps the
title's colour. The glyph shows the flag and the words say it, as Stepper and Timeline do.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| running | two steps done, one running, two pending, with descriptions | the running step `aria-current="step"`, `aria-busy="true"` |
| every status | one step of each status | the five glyphs |
| failed | one step done, one failed with its reason, the rest skipped | the status line names the failed step |
| pending | nothing started | an empty status line |
| done | every step done | the status line names the last step |
| empty | `steps={[]}` | renders nothing |

`requiredSelectors`: every `[data-status="…"]`, so each of the five statuses is proved to
have a recipe and not only a type.

## Motion

The status glyph fades in when a step's status changes: `toolcall.status` by reference
(`fade` over the control duration, opacity only). Running turns the `loading` glyph on the
spin loop, `button.spinner`'s binding by composition. Nothing else moves. A step that joins
the list arrives with the render that brought it, and the text does not animate.
Reduced motion stops the spin globally and keeps the fade, which moves nothing.

## Icons

`time`, `loading`, `success`, `error` and `remove` by status, all decorative: the status
words beside each title say the status, and the mark column is hidden from assistive
technology. `remove` draws a skipped step as a dash. A Spinner is not used for `running`,
because a Spinner is a status region of its own, and one region per running step would
announce over the status line.

## A11y

An ordered list named by `label`. The role is written out, because a list without markers
loses its role in WebKit. Each step reads as its title, its status words and its
description, in that order ("Write the migration, Running"). The words come from
`messages.status` and sit visually hidden after the title, so colour and glyph are never the
only mark of a status. The first running step is the current step (`aria-current="step"`),
and every running step is `aria-busy`, as a running ToolCall is. When several steps run at
once, only the first is current, because a list has one current item.

**What is announced.** One polite status line, visually hidden, names the step at the front
of the run with its status words: the first running step; with none running, the first
failed step; with neither, the last step that is done or skipped. With every step pending
the line is empty. The line changes when the front step changes or its status does, which is
once for each step the run reaches, and once more when the run ends or fails. It holds no
description, so a description the app updates while a step runs is never announced. A
reader therefore hears "Write the migration, Running", then "Run the tests, Running", then
"Run the tests, Failed", and not every change the app makes.

This follows the tier's rule that announcing is the thread's, and adds only what the thread
cannot say. The thread's log announces the turn that holds a Plan once, when the turn is
added (`aria-relevant="additions"`). A status that changes inside a turn already added is
not an addition, and a run's progress is exactly that change. Inside a turn that is still
streaming, ChatMessage's `aria-busy` asks assistive technology to hold the line back until
the turn ends, so the line does not talk over a reply. Outside a thread, such as in an
ArtifactPane, the line is the only way a reader who is not on the list hears the run move.
The line mounts with its words, so a Plan that arrives says nothing until its run moves.

```contract
role list list
name list from label
attr current aria-current=step when running
announces busy when running
announces live:polite "Running" when running
announces live:polite "Failed" when failed
```

## Agent

An agent gets nothing from a Plan. Its steps and their statuses are words on the page, which
an agent reads there, and a person operates nothing in it. Registering would also make this
member a client component in a React Server Components application, which an application that
uses no agent bridge would pay for.
