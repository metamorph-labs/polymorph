# Slider

A control for picking a number from a numeric range by dragging or stepping a thumb. With
`range` it picks a low and a high value.

`@radix-ui/react-slider` supplies the behaviour (`README-substrates.md` §3.2). The
vocabulary owns every surface **and one attribute Radix does not emit**: Radix Slider has
no `data-state`, so the vocabulary emits `data-state="dragging"` from the interaction it
wraps.

One thumb by default; `range` gives two. The installed substrate already drives two
thumbs. The prop exists so that the change of value shape to `[number, number]` is
explicit.

## Anatomy

```
[root]
  [label row?] — [FormField owns the label] [value readout?]
  [control row] — [track [range fill] [thumb]]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `value` / `defaultValue` / `onChange(value)` | `number` | — | with `range`: `[number, number]`, low first |
| `onCommit(value)` | `(value: number) => void` | — | fires on release or blur; the callback for expensive side effects, so apps never debounce `onChange` by hand. Receives the pair under `range` |
| `range` | `boolean` | `false` | two thumbs, one track; `value`/`defaultValue`/`onChange`/`onCommit` take `[number, number]` and the thumbs cannot cross (substrate) |
| `min` / `max` / `step` | `number` | `0` / `100` / `1` | Radix passthrough |
| `showValue` | `boolean` | `false` | current value at the row's end: `text.sm` · `--pm-text-secondary` · `font-variant-numeric: var(--pm-font-numeric)` (figures keep their width while dragging, in the theme's own font) |
| `formatValue` | `(value: number) => string` | `String` | formats both the readout and `aria-valuetext` |
| `disabled` / `invalid` | `boolean` | `false` | |

Attributes: root `data-disabled?`, `data-invalid?`, `data-orientation="horizontal"`
(vertical is not offered); thumb `data-state="dragging"`, **emitted by the vocabulary**
from the pointer/keyboard interaction it wraps. A dragged thumb is a visible state and
Radix has no attribute for it. Horizontal only; Radix flips the direction in RTL.

## Recipes (exact tokens)

The track uses Progress's recipe (same height, pill shape and gradient logic), so a
slider looks like a progress bar with a handle.

| Part | Tokens |
| --- | --- |
| track | height `--pm-space-2` · bg `--pm-bg-subtle` · radius `--pm-radius-pill` · full width |
| range fill | bg `--pm-accent-gradient` (themes without a partner hue render the pinned solid, gradient systems run between their two hues; the same as Progress's fill) · radius pill · under `range` it spans from thumb to thumb (Radix draws this; the recipe does not change, because the fill does not depend on where it starts) |
| thumb | size `--pm-space-5` square · bg `--pm-bg-surface` · border `1px solid --pm-border-strong` · radius `--pm-radius-pill` · shadow `var(--pm-shadow-control), var(--pm-shadow-inset-top)` (the lit-object shadow; flat themes derive both as `none`) |
| thumb hover | border `--pm-accent-bg` |
| thumb dragging | scale 1.12 (see Motion) · border `--pm-accent-bg` · shadow `var(--pm-glow-hover)` (the glow marks the drag as live. Themes with ornament `none` derive no glow and keep the lit shadow list, and flat sets that list to `none` too, so terminal's dragging thumb shows only scale and border. This is intended) |
| thumb focus | ring around the thumb with a `--pm-space-1` gap, in `--pm-border-focus-solid` (conventions §4, the around placement); it marks the thumb, not the track |
| disabled | track bg `--pm-bg-subtle` · fill `--pm-border-default` (neutral, not tinted) · thumb border `--pm-border-subtle`, no shadow · cursor not-allowed |
| invalid | thumb border `--pm-danger-border` · fill unchanged (the *thumb* shows the error; a red fill would read as a danger level) |

## FormField integration

Slider behaves like an input: it renders inside FormField, takes `aria-labelledby` from
the field label and `aria-describedby` from the description or error, and receives
`invalid` from FormField context as Input does. The `showValue` readout is `aria-hidden`,
because the thumb's `aria-valuetext` is the single accessible value.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| rest | `defaultValue={40}` | — |
| zero / full | `0` / `100` | — |
| stepped | `step={10}` | — |
| with readout | `showValue` | — |
| formatted | `formatValue={(v) => v + '%'}` | — |
| range | `range defaultValue={[20, 60]}` | two thumbs, fill between them |
| invalid | `invalid` | `data-invalid` |
| disabled | `disabled` | `data-disabled` |

`requiredSelectors`: `:hover`, `:focus-visible`, `[data-state="dragging"]`,
`[data-invalid]`, `[data-disabled]`.

## Motion

`slider.thumb` binding: on grab, scale 1 → **1.12** on spring `snappy` (engine-side; CSS
fallback `--pm-motion-duration-control` × `--pm-motion-easing-standard`); on release it
springs back. The fill and thumb position are **never** transitioned while dragging,
because they must follow the pointer exactly, and a lagging thumb is the worst slider
defect. Keyboard steps move instantly for the same reason. Readout digits do not animate
(`tabular-nums` holds the width). At `none`: scale stays 1, and the border and glow
colours alone show dragging. Reduced motion: same as `none` for the scale; colours remain.

## Icons

None. The track and thumb need no glyph.

## A11y

Radix defaults (`role="slider"`, arrows/Home/End/PageUp/PageDown, RTL-aware).
Additions: `aria-valuetext` from `formatValue`; FormField wiring above; the thumb
is the single tab stop (track clicks move the value and focus the thumb). Under `range`,
the two thumbs are two tab stops. Each has its own `aria-valuetext` from the same
`formatValue`, and each is clamped by the other (substrate). The readout, when shown,
prints both values joined by an en dash.

```contract
role thumb slider
key ArrowRight increments on thumb when rest
key ArrowLeft decrements on thumb when rest
key PageUp increments on thumb when rest
key PageDown decrements on thumb when rest
key Home decrements on thumb when rest
key End increments on thumb when rest
attr thumb aria-valuetext when formatted
key Tab moves-focus-next on thumb when range — two thumbs
```

## Agent

An agent reads the value and whether the slider is disabled or invalid, and sets the value. A
single slider's `value` is its number. Under `range`, `value` is the low end and `high` the high
end, because a state holds one number; a single slider reads `high` as `null`. `set` moves the
first thumb and `set-high` the second, as a thumb moves: the number snaps to `step` and stays
within `min` and `max`, and under `range` each end stops at the other. Each calls `onChange` and
then `onCommit`, whether or not the caller controls the value, because an agent's set is a whole
gesture, as a key press is. A single slider has no high end, so it refuses `set-high` and the
step fails. A disabled slider lists no action.

```agent
state value number as thumb aria-valuenow
state high number when range — two thumbs
state disabled boolean as root data-disabled
state invalid boolean as thumb aria-invalid
action set number sets value calls onChange
action set-high number sets high calls onChange when range — two thumbs
```
