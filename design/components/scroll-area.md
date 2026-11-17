# ScrollArea

Draws a token-styled scrollbar on a region that is already allowed to scroll, such as Table's
ports, CodeBlock, overlay bodies and panels. It is built on `@radix-ui/react-scroll-area`.

**It does not override the one-scrolling-region rule; it only styles the regions that rule
allows.** The thumb comes from the neutral ramp, and the scrollbar **never hides that more
content exists**.

What it is not: **not a way to create a scroll region.** The vocabulary's scroll map is fixed.
The shell's content is *the* page scroller, an overlay body is its panel's one scroll region,
Table and CodeBlock scroll sideways inside themselves, and DetailPage's aside deliberately scrolls
with the page, because readers lose their place with two independent scroll regions on one
screen. Wrapping content in ScrollArea does not allow a new region; it styles one that the scroll
map already allows. A screen that uses ScrollArea to create a second page scroller fails review
against the scroll map, not against this spec.

## Anatomy

```
[root]
  [viewport — the scroll container; the child's one wrapper]
    [children]
  [scrollbar (per axis) [thumb]]   (presentation)
  [corner?]                        (orientation "both" only)
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `children` | `ReactNode` | required | the region's content. The consumer sets the region's *size* (a Table port's width, a panel's height); ScrollArea fills the box it is given |
| `orientation` | `'vertical' \| 'horizontal' \| 'both'` | `'vertical'` | which axes may pan; `'both'` draws two rails and the corner |
| `type` | `'hover' \| 'always'` | `'always'` | Radix semantics; the default is decided below |
| `label` | `string` | required | names the region for keyboard users once it overflows (CodeBlock's rule, applied to this member). Required, not defaulted, because a generic region has no meaningful default name (`code-block.md`'s reasoning: the content shows which region it is, but cannot say which language to announce it in) |

Attributes: scrollbars `data-orientation="vertical|horizontal"`,
`data-state="visible|hidden"` (Radix).

## The default: `always`

The guardrail (never hide that more content exists) decides this default. Under `hover`, an
overflowing region shows no thumb until a pointer arrives. Someone glancing at it, a touch user
and a keyboard user paging through all see a region that looks complete when it is not. That
hides that more content exists, which is the overlay-scrollbar habit this member is meant to
prevent. Command applies the same rule from the other side when it hides the loading list's
scrollbar (`command.module.css`: a placeholder with a scrollbar would misstate how much content
is coming). The scrollbar's presence is a *statement about the content*, and it must be true in
both directions. So:

- **`always`** (default): the rail is drawn whenever the region overflows, and the viewport
  **reserves the rail's thickness** on that edge (`--pm-space-3` padding on the scrollbar's edge
  while the bar is drawn), so the last line scrolls clear of the thumb instead of under it. This
  is the same reservation CodeBlock makes, and it follows the container-first rule that content
  scrolls and is never covered (`docs/layout.md`).
- **`hover`**: the rail overlays the content and appears only under the pointer, with the
  substrate's own hide delay. It is for the one case where the surrounding UI already shows that
  the region scrolls, and a permanent rail would repeat that. It *cannot* reserve space (a
  gutter that appears on hover shifts the layout), so its bar covers a thin strip of content
  while shown. This is the second reason it is not the default.
- **Either type, no overflow: no bar.** A scrollbar on a region with no more content is the same
  false statement in reverse. ScrollArea uses the substrate's own overflow detection for this.

## Recipe (exact tokens)

| Part | Tokens |
| --- | --- |
| viewport | the scroll container; inherits everything. ScrollArea adds no surface, border or padding of its own beyond the `always` gutter above (the styled region keeps its own recipe) |
| rail | inline-size `--pm-space-3` (8) on the scrolling axis's end edge (logical, so it flips under RTL) · bg transparent · padding `--pm-space-1` (2) all sides, so the thumb sits inset |
| thumb | bg `--pm-border-strong`, following Timeline's neutral dot: the ramp's strongest step as a small neutral fill, verified legible in both modes, because the guardrail makes visibility *at rest* the priority · radius `--pm-radius-pill` · length = the substrate's ratio, with a minimum of `--pm-space-6` (24) so a very long document still has a usable handle (drawing only; the substrate does the scroll maths) |
| thumb hover / drag | no colour change, deliberately. The thumb is an indicator first and a handle second. Its rest state is already the neutral ramp's strongest step (because of the guardrail), and the only step above `--pm-border-strong` is text colour, which chrome must never use. The drag itself is the feedback |
| track press | pages the viewport toward the press (substrate behaviour); the track stays transparent, because it is the region's edge, not a control |
| corner | transparent (`'both'` only) |

## States

| Entry | Render | Expect |
| --- | --- | --- |
| vertical | a long Stack of settings rows in a `16rem`-tall harness box, `label="Notification settings"` | vertical rail, thumb present |
| horizontal | `orientation="horizontal"`, wide content in a narrow box | horizontal rail |
| both | `orientation="both"`, wide and tall | two rails + corner |
| fits | short content, no overflow | **no** rail drawn |
| hover type | `type="hover"`, overflowing | rail present, `data-state="hidden"` at rest |

`requiredSelectors`: `[data-orientation="vertical"]`,
`[data-orientation="horizontal"]`, `[data-state="visible"]`,
`[data-state="hidden"]` (the hover type's two states; visibility comes from the pointer, so the
selector carries it per conventions §10).

## Motion

`hover` type only: the rail enters with `fade` at
`--pm-motion-duration-control` × `--pm-motion-easing-enter` and exits at
`--pm-motion-duration-control-exit` × `--pm-motion-easing-exit`. This is conventions §7's
enter/exit pairing and the smallest entrance in the system, as for Input's clear button. The
thumb's movement is the user's own scrolling and is **never** transitioned. Slider's law (a thumb
must never lag) applies to a thumb that *reports* position as strictly as to one that sets it.
At `none` / reduced motion: rails appear instantly; thumb movement is never animated.

## Icons

None. A scrollbar is geometry.

## A11y

The viewport is a real overflow element, so wheel, keys, touch pan and screen reader virtual
cursors all work natively. While it overflows it becomes a tab stop: `tabindex="0"` +
`role="region"` + `aria-label` from `label`. This is CodeBlock's rule, unchanged: a scrollable
region that the keyboard cannot reach is content a keyboard user cannot read. The tab stop is
removed when the content fits, so a region that does not scroll is not a stop. Rail, thumb and
corner are `aria-hidden`: the platform conveys scroll state through the region's own scrolling,
and the drawn thumb only depicts it. The thumb is smaller than conventions §2's target floor,
which is lawful under WCAG 2.5.8's equivalent exception: every scroll the thumb performs is also
available on the region itself (wheel, arrows, PageUp/PageDown, touch pan), so the thumb is a
redundant handle, never the only way.
