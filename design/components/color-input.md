# ColorInput

ColorInput is a colour *field*: a swatch and a hex entry, with a picker popover
for choosing by eye (saturation/brightness plane, hue rail, and an alpha rail
when the value has alpha). Use it for any form value that is a colour.

As with DatePicker and its Calendar popup, **the field works without the
popup.** The hex entry is the primary input, and a keyboard user never has to
open the plane. React Aria's colour hooks supply the behaviour (`useColorArea`,
`useColorSlider`, the colour model), and the vocabulary owns every surface. An
always-open panel with several display modes and no field was considered and
rejected, because it would make every call site handle the commit gesture and
the form wiring.

ColorInput is a *value* control. It is not a palette manager, an eyedropper or a
theme editor. The studio edits themes through seeds and axes, and a product that
lets users paint arbitrary UI has left the decision system on purpose. The wire
format is only lowercase hex, `#rrggbb`, extended to `#rrggbbaa` under `alpha`.
A product that uses HSL converts at its own boundary. Display modes in the
control would be an editorial decision made inside the vocabulary, and every
product would then need a way around it.

## Anatomy

```
[root]
  [swatch — button, opens the picker; checker under the fill when alpha]
  [hex field — Input's grammar, `#` as prefix, digits as value]
  [hidden input — form serialization when `name`]
[popover]
  [plane — saturation × brightness, thumb carries the colour]
  [hue rail]
  [alpha rail?]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `value` / `defaultValue` / `onChange(value)` | `string` hex | `#888888` | lowercase `#rrggbb`, `#rrggbbaa` under `alpha`; `onChange` is continuous while dragging (as Input does, not Slider's commit pair) |
| `alpha` | `boolean` | `false` | the fourth channel: the alpha rail appears, the hex grows to eight digits, the swatch shows its checker |
| `pickerLabel` | `string` | required | names the swatch button and the popover — "Choose accent colour", not "Colour" |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Input's ladder; the swatch is a square at the control height |
| `disabled` / `invalid` | `boolean` | `false` | |
| `id` / `name` | `string` | — | `name` serializes the hex through a hidden input |
| `defaultOpen` | `boolean` | — | opens the picker on mount, for galleries and tests; screens let the reader open it |

Attributes: root `data-size`, `data-disabled?`, `data-invalid?`, `data-alpha?`.
The plane and rail thumbs carry `data-state="dragging"` while held. The
substrate publishes `isDragging`, and the vocabulary spells it the way Slider
does (Slider's attribute, `README-substrates.md` §3.2, from a different
substrate).

The hex entry accepts three- and six-digit forms, with or without a typed `#`,
and commits on blur and on Enter. An unparseable draft reverts to the current
value instead of showing an error, because an empty error state is less useful
than the colour the field already had (Combobox's revert behaviour).

## Recipes (exact tokens)

The plane's gradients and every current-colour fill are **data, not theme**. The
component writes them inline into `--pm-color-input-*` pattern tokens (the
chart-mark approach). The hue plane, the rainbow rail and the alpha fade come
from the colour model itself, and no `--pm-*` role could describe them
accurately. Everything the theme *does* own (edges, radii, rings, the checker)
is a token in the stylesheet.

| Part | Tokens |
| --- | --- |
| root | `display: flex` · gap `--pm-space-2` · align centre |
| swatch | square at the control height for `size` · radius `--pm-radius-sm` · border `1px solid --pm-border-strong` · fill from `--pm-color-input-swatch` · checker `--pm-bg-subtle` / `--pm-bg-surface` under it when `alpha` |
| swatch hover | border `--pm-accent-bg` |
| hex field | Input's grammar verbatim: the member renders an Input with `#` in its prefix slot |
| popover panel | Popover's, verbatim. The member composes the Popover member and adds only its column: gap `--pm-space-3`, width `--pm-space-10 × 3` |
| plane | inline-size `100%` · aspect 1 · radius `--pm-radius-md` · border `1px solid --pm-border-subtle` · bg from `--pm-color-input-plane` |
| rails | block-size `--pm-space-4` · radius `--pm-radius-pill` · border `1px solid --pm-border-subtle` · hue bg from `--pm-color-input-hue-rail`; alpha bg from `--pm-color-input-alpha-rail` over the checker |
| thumbs | `--pm-space-5` square · radius `--pm-radius-pill` · border `2px solid --pm-bg-surface` · shadow `--pm-shadow-control` · fill from the current colour, so the thumb acts as the swatch at the point of choice |
| thumb dragging | shadow `--pm-glow-hover`, marking the thumb as held (Slider's rule). Flat and ornament-`none` derive the glow away, and the border alone shows it |
| focus | the shared focus ring (conventions §4). The swatch takes it as a button. Each thumb takes it through the composite-field selector, because the channel inputs are what receive focus |
| disabled | swatch fill replaced by `--pm-bg-subtle` · border `--pm-border-subtle` · cursor not-allowed · field disabled as Input |
| invalid | field invalid as Input · swatch border `--pm-danger-border` |

## States

| Entry | Render | Expect |
| --- | --- | --- |
| rest | `defaultValue="#8864f0"` | — |
| open | `defaultOpen` | — |
| alpha | `alpha defaultValue="#8864f0cc" defaultOpen` | `data-alpha` |
| sizes | sm / md / lg | — |
| invalid | `invalid` | `data-invalid` |
| disabled | `disabled` | `data-disabled` |
| controlled | `value="#0089ea"` | — |

`requiredSelectors`: `:hover`, `:focus-visible`, `[data-state="dragging"]`,
`[data-invalid]`, `[data-disabled]`, `[data-alpha]`.

## Motion

The popover enters and exits on Popover's own tokens; this member adds nothing.
Nothing about the *value* is ever transitioned. Thumb positions, the plane's
hue, the swatch's fill and the rails' fades all follow the pointer directly
(Slider's no-lag rule, applied to three surfaces). The thumbs' held glow uses
the state-feedback timing.

## Icons

None. The swatch is its own glyph: it shows the value.

## A11y

The swatch is a real button named by `pickerLabel`. The popover is the Popover
member itself, composed, so its dialog name, its focus contract and its Escape
are all inherited, not restated. The plane uses React Aria's two-channel model:
two visually hidden range inputs (saturation, brightness) behind one tab stop.
Arrows move x, PageUp/PageDown move y by a page, and the unfocused channel is
`aria-hidden`, so a form listing counts one "2d slider". Each rail is one hidden
range input, named with the substrate's own channel names. The hex field is a
labelled Input wired through FormField like every other field, and the four ARIA
hooks pass through to it.

The popover stays anchored at every width. Popover's sheet lane is opt-in, and
this member does not opt in.

RTL: the picker mirrors, as a horizontal Slider does. The plane's saturation and
each rail run from the inline start, the right, and the pointer, the keys and
the thumbs follow. The hex field is unchanged, because a hex value reads left
to right in every language. On the web the substrate mirrors its own pointer and
keyboard maths and returns mirrored thumb positions inline, so nothing here
mirrors them again; a native renderer mirrors the plane and the rails itself.

```contract
role trigger button
name trigger from pickerLabel
key Enter opens
focus on-open panel
key ArrowRight increments on plane when open
key ArrowLeft decrements on plane when open
key Escape closes when open
focus on-close trigger
```

## Agent

A person sees one colour field, so ColorInput registers its hex field and withholds the Input it
draws. An agent reads the value, as the lowercase hex the member reports, and whether the field
is disabled or invalid, and it sets a colour. The picker is a Popover that ColorInput draws as
its own part, so that Popover registers nothing and ColorInput is listed in its place, open or
closed. The picker's panel portals out of the field, so ColorInput withholds it as a second
region beside its root, and nothing the open panel draws is listed.

`set` commits a hex as the hex field's commit does: three, six or eight digits, with or without
`#`. Eight digits carry the alpha channel, which a field without `alpha` drops. `onChange`
reports the hex whether or not the caller controls the value. `set` refuses text that is not a
hex colour, which the field reverts, and the step fails. An agent sets the colour by its hex and
not with the picker, because the hex is the whole value and the picker chooses it by eye. A
disabled field lists no action.

```agent
state value text
state disabled boolean as root data-disabled
state invalid boolean as root data-invalid
action set text sets value calls onChange
withholds contents
```
