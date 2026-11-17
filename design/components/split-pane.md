# SplitPane

Two panes side by side or stacked, with a divider the reader can drag or move by keyboard
to change their sizes. It is used for workbench layouts, such as a navigator beside a
canvas or a request above a response.

It has no substrate. It is a grid, a separator and the WAI window-splitter keyboard
behaviour, which is small enough to own directly (as Timeline does). A resize component
that ships only the *handle* leaves clamping, keyboard handling and state to every call
site. SplitPane owns all of it so no screen re-implements it.

SplitPane shows both panes at once with an adjustable boundary between them. Drawer is
one panel that opens and closes, and Grid lays out peers in equal tracks that the reader
cannot resize. Both panes are always present. There is no collapse gesture, no zero
position and no way to dismiss a side, because a pane the reader can hide is a Drawer,
which the vocabulary already has. For the same reason Enter (the WAI pattern's optional
collapse toggle) is not wired.

The unit is a **ratio**, never pixels. A pixel split assumes a viewport size, but the
same layout opens on a phone and on a large display. A proportion holds across every
resize, density and container. Pixels are used only for the minimum sizes: "the navigator
is unusable below 240px" is a fact about content, not layout, and CSS `minmax()` enforces
it even when the ratio prop asks for less.

The split divides the box its container gives it, and it is as wide and as tall as that
container. A stacked split therefore needs a height from its container. A container with
no height gives the split only its content's, and the ratio divides that: each pane is
drawn at its share of the taller pane's content and the rest is cut. The split's height
cannot follow its panes' content instead, because the ratio would then set the height the
divider's position is measured against, and the divider would not stay under the pointer.

## Anatomy

```
[root — grid, 3 tracks]
  [start pane]
  [divider — role="separator", focusable, aria-controls → start pane]
  [end pane]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `start` / `end` | `ReactNode` | required | the two panes, in reading order; each scrolls itself (the grid's `min-size: 0` allows this) |
| `label` | `string` | required | names the separator, for example "Resize navigator", not "Divider" |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | the axis the panes sit on: `horizontal` is side by side (as in Stepper). The separator's `aria-orientation` describes the *divider line's* axis, so ARIA uses the opposite word |
| `ratio` / `defaultRatio` / `onRatioChange(ratio)` | `number` 0–1 | `0.5` | the start pane's share; controlled the same way as Slider |
| `onCommit(ratio)` | `(ratio: number) => void` | — | fires on release and after each keyboard step; use it to persist the layout (as Slider does) |
| `startMin` / `endMin` | `number` px | `0` | content minimums; enforced by `minmax()` whatever the ratio, and the keyboard clamp uses the same numbers |

Attributes: root `data-orientation`; divider `data-state="dragging"` while held. The
vocabulary emits it from the pointer interaction it owns, as Slider does
(`README-substrates.md` §3.2). At rest the attribute is absent.

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| root | `display: grid` · tracks `minmax(--pm-split-start-min, --pm-split-start) auto minmax(--pm-split-end-min, --pm-split-end)`. The `--pm-split-*` pattern tokens are data-driven (as chart-tip's are): the component writes the ratio as `fr` pairs and the minimums as px, and the stylesheet declares the rest defaults |
| pane | `min-inline-size: 0` / `min-block-size: 0` on the split axis · `overflow: hidden`. A pane that cannot shrink would block the divider; scrolling inside is up to the pane's content |
| divider | thickness `--pm-space-2` · `background: transparent` · cursor `col-resize` / `row-resize` by orientation |
| divider line | centred 1px pseudo, full length · `--pm-border-default` |
| divider hover | line `--pm-border-strong` |
| divider dragging / focus | line `--pm-accent-bg`, widened to 2px to show the divider is active |
| hit area | a centred pseudo `--pm-control-height-sm` thick, full length. This reuses the control-height law's minimum, which is the 24px WCAG 2.5.8 floor, instead of restating it |
| focus | the shared focus ring (conventions §4), on the divider |

## States

| Entry | Render | Expect |
| --- | --- | --- |
| even | two panes, defaults | — |
| apportioned | `defaultRatio={0.3}` | — |
| floors | `startMin={160} endMin={160}` | — |
| stacked | `orientation="vertical"`, in a harness box with a fixed height | — |
| controlled | `ratio={0.66}` | — |

The separator's values (`aria-valuenow` tracking the ratio, the measured
`aria-valuemin`/`-max`, and the inverted orientation) are on the divider, not the root.
The fixture harness cannot check them there, so the browser test does. The stacked
entry's root is its harness box, so the browser test also asserts the split's
`data-orientation="vertical"`.

`requiredSelectors`: `:hover`, `:focus-visible`, `[data-state="dragging"]`,
`[data-orientation="vertical"]`.

## Motion

None on the split itself. The ratio follows the reader's pointer, and a transitioned
track would lag behind it, like a lagging Slider thumb. Keyboard steps apply instantly
for the same reason. The divider's colour states transition through `stateFeedback`, and
nothing else moves.

## Icons

None. The whole divider line is the handle, so a grip glyph would be redundant ornament.

## A11y

The WAI window-splitter pattern: a focusable `role="separator"`, `aria-valuenow` as the
start pane's share in percent, and `aria-controls` naming the start pane.
`aria-valuemin`/`-max` report the *measured* clamp (the px minimums relative to the
container's real size, kept current by a ResizeObserver) instead of a fixed 0/100.
`aria-orientation` follows ARIA's divider-line convention: `vertical` for side-by-side
panes, `horizontal` for stacked. That is the opposite word from the `orientation` prop,
and the test pins the inversion so nobody "fixes" it.

Arrow keys move the divider along the split axis by 2 (of 100): Left/Right for
side-by-side, Up/Down for stacked. The cross-axis arrows do nothing, on purpose. Home/End
go to the ends of the clamp. Every keyboard step fires both `onChange` and `onCommit`,
because a step counts as a release. The panes are ordinary content in reading order:
start, divider, end, as drawn.

```contract
role divider separator
attr divider tabindex=0 when even
attr divider aria-valuenow=50 when even
attr divider aria-controls when even
attr divider aria-orientation=vertical when even
attr divider aria-orientation=horizontal when stacked
key ArrowRight increments on divider when even
key ArrowLeft decrements on divider when even
key ArrowUp nothing on divider when even
key ArrowDown increments on divider when stacked
key Home decrements on divider when even
key End increments on divider when even
```

## Agent

An agent reads where the divider is and moves it. `position` is the start pane's share in
percent, as the separator reports it in `aria-valuenow`: a whole number, within the bounds that
`aria-valuemin` and `aria-valuemax` report. `set` takes a share in percent and moves the divider
there as a drag does, so the share stays within the bounds the floors give, and the step's
`changed` says where the divider stopped. It calls `onRatioChange` with the ratio, and then
`onCommit`, whether or not the caller controls the ratio, because an agent's set is a whole
gesture, as a key press is. A controlled SplitPane stays where its caller holds it. There is no
collapse for an agent, as there is none for a person.

```agent
state position number as divider aria-valuenow
action set number sets position calls onRatioChange
```
