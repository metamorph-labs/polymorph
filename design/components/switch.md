# Switch

An on/off control for a setting that takes effect as soon as it is toggled. A choice that
waits for a form submit uses Checkbox.

Radix `@radix-ui/react-switch`. One size.

## Anatomy

```
[root <label> row]
  [track (Radix root)]
    [thumb]
  [label text?]
```

The row is the hit target (min-height `--pm-control-height-sm`).

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `label` | `string` | — | visible inline label; `aria-label` required if omitted (settings rows label it externally; SettingsRow wires `aria-labelledby`) |
| `checked` / `defaultChecked` / `onCheckedChange(boolean)` | — | — | Radix contract |
| `disabled` | `boolean` | `false` | |
| `name`, `value`, `id` | native passthrough | — | |

Attributes on track: `data-state="on|off"` (mapped from Radix `checked|unchecked`),
`data-disabled?`, `data-required?` (mirrored from injected `aria-required`).

**Required marker**: the same recipe and reasoning as `checkbox.md`. The label appends
`content: " *" / ""` in `--pm-danger-text` when `data-required` is set.

## Dimensions (token-derived, density-stable)

- Thumb: `--pm-icon-size-md` (16) circle — radius `--pm-radius-pill`.
- Track: height `calc(var(--pm-icon-size-md) + var(--pm-space-2))` (20);
  width `calc(var(--pm-icon-size-md) * 2 + var(--pm-space-2))` (36);
  radius `--pm-radius-pill`; thumb inset `calc(var(--pm-space-2) / 2)` (2).
- Thumb travel: `calc(100% - var(--pm-icon-size-md) - var(--pm-space-2))`, so the thumb
  ends with the same inset on both sides. Gap track→label `--pm-space-3`; label `text.sm`
  `--pm-text-primary`.

The pill shape applies **in every geometry, including sharp**, because a rectangular
switch looks like a button. `radius.pill` is a lawful constant (9999), not derived from
the geometry. Terminal's switch is its only rounded object. This is intended: the shape
identifies the control.

## Recipe (exact tokens)

Track transitions `background-color, border-color`; thumb transitions `transform` (see
Motion).

| State | Tokens |
| --- | --- |
| off rest | track bg `--pm-bg-subtle` · track border `1px solid --pm-border-strong` · thumb bg `--pm-bg-surface` · thumb border `1px solid --pm-border-default` · thumb shadow `--pm-shadow-raised` |
| off hover | track border `--pm-border-strong` · track bg `--pm-bg-surface` |
| on rest | track bg `--pm-accent-bg` · track border `--pm-accent-bg` · thumb bg `--pm-accent-contrast` · thumb border transparent |
| on hover | track bg `--pm-accent-bg-hover` |
| disabled off | track bg `--pm-bg-subtle` · border `--pm-border-subtle` · thumb bg `--pm-bg-subtle` · thumb border `--pm-border-subtle` |
| disabled on | track bg `--pm-border-subtle` · thumb bg `--pm-bg-surface` |
| disabled label | `--pm-text-disabled` |
| focus | ring **around the track** with a `--pm-space-1` gap, in `--pm-border-focus-solid`, on or off (conventions §4, the around placement) |

## States

| Entry | Render | Expect |
| --- | --- | --- |
| off | `<Switch label="…" />` | `data-state="off"` |
| on | `defaultChecked` | `data-state="on"` |
| required | via FormField `required` | `data-required`, marker visible |
| disabled off / on | `disabled` (± `defaultChecked`) | `data-disabled` |
| unlabeled | `aria-label="…"` | `aria-label` present |

`requiredSelectors`: `:hover`, `:focus-visible`, `[data-state="on"]`,
`[data-disabled]`, `[data-required]`.

## Motion

Thumb position: spring `snappy` (the motion patterns' engine,
`packages/engine/src/motion/patterns.ts`). The spring keeps its velocity and can be
interrupted mid-flight, so toggling rapidly never makes the thumb jump. Track colour over
`--pm-motion-duration-control` × `--pm-motion-easing-standard`. At `none`: the thumb
jumps and the colour snaps.

## Icons

None. There are no glyphs in the track; the thumb position and the label carry the
state.

## A11y

Radix switch semantics (`role="switch"`, `aria-checked`, Space/Enter). A real `<label>`
associates the row. The state must be readable without colour: the thumb position
(left/right) is the main signal, and colour is secondary.

```contract
role control switch
name control from label when off
key Space selects on control when off
key Enter selects on control when off
```

## Agent

An agent reads whether the switch is on and whether it is disabled, and turns it on or off. A
change goes through the member's own value, so `onCheckedChange` reports an agent's change as it
reports a person's, whether or not the caller controls `checked`, and the setting takes effect at
once, as a person's toggle does.

```agent
state checked boolean as control aria-checked
state disabled boolean
action check sets checked calls onCheckedChange
action uncheck sets checked calls onCheckedChange
```
