# ReasoningDisclosure

A collapsible section that holds a model's reasoning behind one trigger, labelled for example
"Thinking…" while it reasons and "Thought for 12 seconds" after. `@radix-ui/react-collapsible`
provides the behaviour (Collapsible's substrate, a direct dependency of `@polymorph/react-ui`).

ReasoningDisclosure is a Collapsible with a status. Collapsible reveals content that already
exists ("Advanced options"). This member reveals content that is *being produced*. It has a
streaming state, a leading mark that shows what kind of content it holds, and a quieter style for
the content, because the reasoning is the working and the reply is the answer. It is *not* an
Accordion (it is one disclosure, not an outline) and *not* a ToolCall (nothing ran; the model
only reasoned).

The text is the app's. `label` is whatever the app says the model is doing, in the app's language
and on the app's timing. The member never invents a duration or a verb; Timeline's rule for time
applies to thinking time too.

## Anatomy

```
[root — Radix Collapsible]
  [trigger <button>: [mark: Icon reasoning | loading] [label] [chevron: Icon down]]
  [content]
    [inner — the start-edge rule; children]
```

## API

```ts
interface ReasoningDisclosureProps {
  label: string // the trigger's text — "Thinking…", "Thought for 12 seconds" — the app's words
  streaming?: boolean // still reasoning: the mark spins, the root reports aria-busy
  defaultOpen?: boolean // closed by default — the working is under the answer for whoever wants it
  open?: boolean // controlled pair, Radix contract
  onOpenChange?: (open: boolean) => void
  children: ReactNode // the reasoning — a Markdown size="sm" or a StreamingText size="sm"
}
```

Attributes (Radix): root/trigger/content `data-state="open|closed"`. Own:
`data-streaming` while reasoning, with `aria-busy="true"` on the root.

## Recipes (exact tokens)

Collapsible's trigger, unchanged, with a mark before the label.

| Part | Tokens |
| --- | --- |
| trigger | Collapsible's: inline row · `min-block-size --pm-control-height-sm` · gap `--pm-space-2` · `text.sm` quartet · `--pm-text-secondary` · transparent · no horizontal padding |
| mark | Icon `reasoning` `sm` · `--pm-text-muted`; while streaming Icon `loading` on the `spin` loop (`button.spinner`'s binding, composed from the motion module) |
| chevron | Icon `down` `sm` · `--pm-text-muted` · rotates 180° when open |
| trigger hover | label `--pm-accent-text`, chevron `--pm-text-secondary`; Collapsible's colour-only hover |
| focus | the shared focus ring (conventions §4) |
| inner | `margin-block-start --pm-space-3` (inside the animated region) · `margin-inline-start --pm-space-2` · `padding-inline-start --pm-space-4` · `border-inline-start 2px solid --pm-border-strong`; Markdown's quote rule, so quoting and thinking share one quieter style |

## States

| Entry | Render | Expect |
| --- | --- | --- |
| closed | `label="Thought for 12 seconds"` | `data-state="closed"`, no `data-streaming` |
| open | `defaultOpen` | `data-state="open"` |
| thinking | `streaming defaultOpen`, a StreamingText inside | `data-streaming`, `aria-busy="true"` |
| controlled | `open` + `onOpenChange` | state follows the prop |

`requiredSelectors`: `:hover`, `:focus-visible`, `[data-state="open"]`,
`[data-state="closed"]`. This is Collapsible's list, for the same reasons.

## Motion

`collapsible.content` by reference (`collapse`, persistent, `surface` class, with the Radix
measured height as input), and the chevron rotates over `control` × `standard`. The mark's spin
is `button.spinner`'s loop through composition, with its temperament scaling and its
reduced-motion stop. At `none`: instant open and close, static mark. Reduced motion: `collapse`'s
projection (instant size change; the content still fades).

## Icons

`reasoning` (the mark, decorative; `label` says what this is), `loading` while streaming
(decorative; `aria-busy` conveys it), `down` (the system's one disclosure chevron, decorative;
`aria-expanded` announces the state).

## A11y

Radix collapsible semantics: a real `<button aria-expanded aria-controls>`, with no heading
around it (Collapsible's argument: a disclosure inside a reply is not an outline entry), and
nothing focusable inside a closed region. The root has `aria-busy` while the model is still
thinking, so a user who opens the disclosure knows the reasoning is not finished. The reasoning
inside is the app's Markdown or StreamingText and carries its own semantics.

## Agent

An agent reads whether the reasoning is shown and whether the model is still reasoning, and
expands and collapses it. Both go through the member's own open state, so `onOpenChange` reports
an agent's change as it reports a person's, whether or not the caller controls it. The trigger's
name is the app's label ("Thought for 12 seconds"), which names the member. The reasoning inside
is the app's content, and any member in it is listed within this one.

```agent
state expanded boolean as trigger aria-expanded
state streaming boolean as root data-streaming
action expand sets expanded calls onOpenChange
action collapse sets expanded calls onOpenChange
```
