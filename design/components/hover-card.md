# HoverCard

A *preview* panel that opens on hover or focus, styled like Popover. Use it to show the person
behind an assignee link or the ticket behind a reference without navigating.

The substrate is `@radix-ui/react-hover-card` (stable). The guardrail below applies to it.

It sits between two other members and is neither:

- **Not Tooltip.** Tooltip is a short text hint: a string in the inverse bubble, never rich
  content. A hint that needs an Avatar or a second line of real content is no longer a hint.
  The reverse also holds: a HoverCard whose content is one sentence should be a Tooltip.
- **Not Popover.** Popover's boundary routes by need: a task the user must *finish* → Dialog,
  a command list → Menu, rich content the user must reach and operate → Popover. A
  HoverCard's content is **never load-bearing**: nothing in it may be the only way to read or
  do anything. If the user must click inside it, it is a Popover. If losing it loses
  information, it does not belong in a HoverCard.

## The guardrail (the law this member ships under)

The content is never load-bearing (**the trigger still navigates; touch users lose only a
preview**), and **keyboard focus opens it without hover**. In practice:

- The trigger is a real link or focusable element with its own meaning. The card previews the
  destination and never replaces it.
- On touch there is no hover and the substrate opens nothing, so a tap does what the trigger
  does. Only the preview is lost.
- Keyboard focus on the trigger opens the card after the same delay. Hover is the pointer's
  form of dwell, and focus is the keyboard's.
- **No interactive content inside.** Tab never enters the card (it closes on blur), so anything
  clickable in it would be pointer-only. A nested interactive element triggers a dev warning,
  like Card's `href` rule.

## Anatomy

```
[children — the trigger: one focusable element, a real link or control]
[panel]
  [content — vocabulary content: typically Stack of Avatar/Text/Badge rows]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `children` | one focusable element | required | Tooltip's cell, but here it must have its own destination or action. A HoverCard on an inert span previews nothing the user can reach |
| `content` | `ReactNode` | required | vocabulary content. A typed `{ title; description; meta }` shape is rejected, because person previews, ticket previews and link previews share no common anatomy. The closed vocabulary already constrains it, since an app can only put members here. The never-load-bearing law governs the content, not a slot shape |
| `side` / `align` | Radix | `'bottom'` / `'start'` | Popover's cells, collision-aware |

No `label`. The panel is deliberately not announced (below), and a name would point assistive
technology at a surface it cannot use. No controlled `open` pair, because a preview the app
opens from code should be a Popover. Tooltip takes the same position, and fixtures reach the
open state through Radix `defaultOpen`, as Tooltip's do.

Delays reuse Tooltip's values. Opening waits the Tooltip provider's **open delay**, and closing
waits its **skip delay**, so the pointer can cross the gap into the card without it closing.
The exact values are Tooltip's `TOOLTIP_DELAY_MS` / `TOOLTIP_SKIP_DELAY_MS`; `tooltip.md`
records the intent as ~500/~250ms. One set of timings defines how long a hover must rest and
how long a pointer may be between elements.

Attributes: panel `data-state="open|closed"`, `data-side`.

## Recipe (exact tokens)

Popover's panel row **verbatim** (`popover.md`): bg `--pm-bg-overlay` · border
`1px solid --pm-border-subtle` · radius `--pm-radius-lg` · shadow
`--pm-shadow-overlay` · padding `--pm-space-5` · width content, `max-width:
calc(var(--pm-space-10) * 4)` (384) · `sideOffset: 4` (Popover's offset, for a small surface
with its own content rather than a menu attached to a control). No arrow, as in Tooltip,
because the offset and origin-aware motion already connect the panel to its trigger.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| closed | an assignee Link wrapped | trigger only |
| open | `defaultOpen` (Radix): Avatar + name + "Support · 12 open tickets" as Stack/Text/Badge | `data-state` open, panel content present |
| sides | `side="top"` / `align="end"`, open | `data-side` |
| long content | content wraps at max-width | — |

`requiredSelectors`: `[data-state="open"]`, `[data-side="top"]`,
`[data-side="bottom"]` (side-dependent motion origins). `:focus-visible` is not listed. The
trigger is the caller's own focusable element, whose stylesheet has the shared focus ring
(conventions §4), so listing it here would test Link's stylesheet under HoverCard's name.
Menu's fixture leaves it out for the same reason. The card opening is not a focus style.

## Motion

Popover's verbatim: `scale-fade`, anchored origin from `data-side`, `surface` class; exits at
`-surface-exit` × `exit`. At `none`: instant, and the provider delays still apply, as in
Tooltip, because delay is interaction design, not motion.

## Icons

None of its own. Members in the content bring their own icons.

## A11y

The substrate opens on pointer hover and on keyboard focus, and closes on leave, blur or
Escape. This satisfies the guardrail's focus clause. The card is a preview for sighted users:
it takes no focus, is not announced, and does not open on touch. This is acceptable *only
because* of the never-load-bearing law: a screen reader or touch user misses nothing that is
not already at the trigger's destination. The trigger keeps its own semantics: a Link stays a
link, and `aria-describedby` is **not** wired. This is not Tooltip, and rich content flattened
into a description string would be worse than none. Escape closes the card without moving
focus, and the card *stays* closed. The substrate starts its open timer on every focus and
pointer entry and clears it on blur and leave, but not on dismiss. A dwell that began before
the Escape must not reopen the card. After a dismiss, only a new dwell can open it again.

```contract
focus on-open trigger
key Escape closes when open
focus on-close previous
```

## Agent

A hover card has no fence: an agent reads nothing from it and runs nothing on it. Its content is
a preview that is never load-bearing (the guardrail above): what it shows is at the trigger's
destination, and nothing in it is interactive. The trigger is a link or a control of its own,
which an agent finds by its name and follows or presses. Opening the card changes nothing on the
page, so it gives an agent no action.
