# SegmentedControl

A joined row of segments for picking one of a few values, applied immediately. It always
holds a value and is used in toolbars, page headers and filter rows.

Behaviour comes from Radix `@radix-ui/react-radio-group`. It is a separate member rather
than a Radio `segmented` variant because it is a different form factor.

How it differs from its two nearest neighbours:

- **Not Tabs.** Tabs show peer views of one thing, one at a time, and `tabs.md` rejects
  boxed and pill variants as "the same decision re-made with more chrome". A
  SegmentedControl is not a pill tab. It never shows or hides a panel. It *sets a value*,
  such as a period, a scope or a mode. If a choice changes which content region is
  visible, use Tabs.
- **Not RadioGroup.** The semantics are the same (one of a few options, all visible), but
  the use differs. RadioGroup is a form list: a question with its answers, wired through
  FormField, submitted later, and allowed to render with no choice made. SegmentedControl
  is a toolbar control: it acts immediately and is never empty. Radio's limit applies here
  too: more than about 5 options, or long labels, belong in a Select.

## Anatomy

```
[root — the track (Radix radio group): one joined row]
  [segment (Radix item)]* — [chip surface (checked only)] [icon?] [label]
```

Segments divide the track equally (`grid-auto-columns: 1fr`; the widest label sets the
segment width). It is one control with N positions, not N separate buttons side by side.

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `options` | `{ value: string; label: string; icon?: IconRole; disabled?: boolean }[]` | required | items render from data, because free-form children invite ad hoc layout (Radio's law) |
| `value` / `defaultValue` / `onChange(value)` | `string` | first option | always holds a value: uncontrolled with no `defaultValue` selects the first option, as Tabs does. The empty pre-choice state belongs to RadioGroup |
| `size` | `'sm' \| 'md'` | `'md'` | control heights per conventions §2. No `lg`: the control sits inline in toolbars, page headers and filter rows beside `sm`/`md` controls. A form-scale single choice is a RadioGroup in a FormField, not this at 44px |
| `label` | `string` | required | the group's accessible name (`aria-label` on the root), required because outside a form there is no FormField to name it |
| `disabled` | `boolean` | `false` | group-level; per-option `disabled` in `options` |

No `name`: the control acts immediately and does not submit with a form. A single choice
that submits is a RadioGroup.

Attributes: root `data-size`, `data-disabled?`; segments
`data-state="checked|unchecked"`, `data-disabled?`. Horizontal only. A vertical stack of
options is a RadioGroup.

## Recipe (exact tokens)

| Part | Tokens |
| --- | --- |
| track | height `--pm-control-height-sm\|md` (§2) · bg `--pm-bg-subtle` · radius `--pm-radius-md` (control class, §3) |
| segment | full-height cell, transparent · `text.xs\|sm` quartet per §2 · color `--pm-text-secondary` · padding-x per §2 · icon per §2's size and gap columns, decorative · `cursor: pointer` |
| segment hover (unchecked) | color `--pm-text-primary` (as Tabs' trigger hover). §11's ghost wash would be invisible on the track's `--pm-bg-subtle`, and §11 only requires that hover never preview the selected treatment |
| **segment checked** | chip surface bg `--pm-bg-surface` · shadow `--pm-shadow-control` · text `--pm-text-primary` · the chip is inset `calc(var(--pm-space-2) / 2)` (2, the same as Switch's thumb inset) on every side · chip radius `--pm-radius-sm` (the nested radius step, §3's Checkbox-box slot) |
| segment checked hover | nothing changes (§11: the segment is already selected) |
| segment disabled | text `--pm-text-disabled` · no hover · `cursor: not-allowed` |
| checked + disabled | chip keeps `--pm-bg-surface` so the position stays legible (as Switch does when disabled and on), shadow `none`, text `--pm-text-disabled` |
| focus | the shared focus ring on the focused **segment** (§4) |

**The selected segment uses no accent by default, because of §11.** The selection
recipe's second channel is structural. This anatomy has no room for a `confirm` glyph
beside a short label, so the structural channel is the raised chip: the surface colour
plus the `--pm-shadow-control` seat on a subtle track, as on iOS. The chip marks the
selection on its own. Hover changes only the text colour, so it cannot be mistaken for
selection, and the accent wash and border pair is not needed. Under `depth: flat` the seat
resolves to `none`, and the chip is a one-step surface lift plus the text step. Every flat
control makes the same trade with its shadows, and the chip's position still marks the
segment.

**Hit target:** the inset is visual only. The chip is drawn *inside* the segment, not
carved out of it by track padding, so each segment's hit area is the full track height and
§2's minimum holds at every density.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| three options | Open / Pending / Closed (Relay's queue scope), no value props | first segment `data-state="checked"`; never empty |
| with icons | Light / Dark / System (`mode-light`/`mode-dark`/`mode-system`), `defaultValue="dark"` | icons leading, second checked |
| disabled option | Closed disabled | `data-disabled` on the segment |
| disabled | `disabled` | `data-disabled` on the root and every segment |
| sm | `size="sm"` | `data-size="sm"` |
| controlled | `value` + `onChange` | value follows the prop |

`requiredSelectors`: `:hover`, `:focus-visible`, `[data-state="checked"]`,
`[data-disabled]`.

## Motion

Selection **snaps**: no sliding thumb and no fade. A `chart.frame`-class fade on the chip
is rejected because a value change is not playful (`progress.md`: value changes ease and
never spring, because data should not look playful), and a travelling thumb draws
attention to the control itself. Tabs' indicator slides because tabs are navigation; this
control sets data. The hover text change transitions on §7's shared state-feedback list. The
`data-state` change is excluded from that list, so chip, seat and text change in the same
frame. At `none`: no change, because selection already snaps.

## Icons

Per-option `icon`, leading, decorative, §2's sizes and gaps. Relay uses
`mode-light`/`mode-dark`/`mode-system` for its appearance picker.

## A11y

Radix radiogroup semantics: root `role="radiogroup"` named by `label`, and one tab stop.
Arrow keys move focus *and* selection (roving focus). This is acceptable here because the
control always holds a value and a snapping selection is cheap (see Motion). The label
text is each segment's accessible name. The chip and icon are decorative, and
`aria-checked` carries the state. The value applies immediately, as with Switch; nothing
waits for a submit.

```contract
role root radiogroup
name root from label
key ArrowRight moves-focus-next on segment
key ArrowLeft moves-focus-previous on segment
key ArrowRight selects on segment
```

## Agent

An agent reads the chosen value, the options and whether the control is disabled, and chooses an
option by its id. An option's id is its `value`. The control always holds a value, so the value
is never `null` and no action clears it. A choice goes through the member's own value, so
`onChange` reports it as it reports a person's, whether or not the caller controls the value,
and it applies at once. A disabled option is refused, and a disabled control lists no action.

```agent
state value id
state options choices
state disabled boolean as root data-disabled
action choose id sets value calls onChange when disabled option
```
