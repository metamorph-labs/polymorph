# ImageEditor

Frames an image inside a fixed crop by panning, zooming and rotating, and returns the result as
a file. Use it for profile pictures, cover images and logo marks, where an app needs one part
of an image at a set shape.

Three guarantees set it apart from a typical crop widget: pointer and keyboard are equal inputs
(never mouse-only), a zoom floor stops the crop from extending past the image, and the export
is at source resolution, never viewport pixels.

It is **not FileUpload**, which handles a queue of files being uploaded. Here one image is
being *shaped*, and the empty state's dropzone only reuses FileUpload's recipe as an entry
point. It is **not Bespoke**: no free-form annotation and no filters, only framing, with four
controls by default and six with every option enabled.

## Anatomy

```
[root]
  [empty?] — dropzone: Icon "upload" · title · hint · browse Button (outline) · hidden <input type=file> · paste target
  [stage?] — the crop viewport (aspect-ratio box)
    [img] — the image, transformed (translate · rotate · scale)
    [mask?] — the circle or rounded window when `mask` says so (paint only)
    [grid?] — rule-of-thirds hairlines while panning, when `grid` (paint only)
  [tools?] — rotate Button (icon-only, `rotate`) · flip Button? (`flip`) · reset Button? (`undo`) · zoom Slider
  [actions?] — cancel Button (ghost) · confirm Button (solid)
```

Empty and stage are exclusive; tools and actions render only with the stage.

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `src` | `string` | — | the image to edit. When omitted, the editor shows its empty state: click, drop or paste. External URLs load with `crossOrigin="anonymous"` so the export canvas is not tainted. A host that refuses CORS also blocks the export, and only the host can change that |
| `aspectRatio` | `number` | `1` | the crop's width over its height |
| `mask` | `'none' \| 'circle' \| 'rounded'` | `'none'` | a preview-only window over the crop. `circle` matches the avatar, `rounded` matches the card (`--pm-radius-lg` corners). The exported rectangle is unchanged, because whatever displays the image applies the mask; it is not baked into the file |
| `flip` | `boolean` | `false` | shows the mirror control. One press flips the image about its own vertical axis, combined with any turns. It is a command, so it animates like rotate; the export is mirrored the same way |
| `reset` | `boolean` | `false` | shows a control that returns to the floor (cover, centred, unturned, unmirrored), using the `undo` role. It is a command, so it animates |
| `grid` | `boolean` | `false` | rule-of-thirds hairlines over the stage **while panning only**. They are information for framing, not ornament, so an `ornament: none` system still shows them. Paint only, `aria-hidden` |
| `maxZoom` | `number` | `4` | the maximum zoom as a multiple of cover, clamped to 2–8, so high-resolution sources can zoom further. The floor is never a prop |
| `exportSize` | `number` | `512` | the exported rectangle's longest edge, px. Export re-projects from the *natural* image, so a 4000px source framed in a 320px viewport still exports sharp |
| `exportType` | `'image/png' \| 'image/jpeg' \| 'image/webp'` | `'image/png'` | |
| `onConfirm` | `(image: Blob) => void \| Promise<void>` | required | the framed result. While a returned promise is pending, the confirm Button shows its loading state and the surface ignores input |
| `onCancel` | `() => void` | — | when omitted, no cancel button renders, because an inline editor has nothing to go back to |
| `disabled` | `boolean` | `false` | |
| `messages` | `ImageEditorMessages` | English | every string the member uses, localized by passing them (WCAG 3.1.2): `title`, `hint`, `browse`, `rotate`, `zoom`, `cancel`, `confirm`, `alt`, `stage` (the keyboard surface's accessible name), and `loadError` |
| `id` | `string` | — | native passthrough |

Attributes: root `data-empty?`, `data-dragover?`, `data-disabled?`,
`data-busy?`, `data-mask="circle|rounded"?`; stage `data-panning?`; image
`data-animate?` (present only while a rotate, flip or reset animates; see
Motion) and `data-mirrored?`.

## Geometry (the law of the frame)

- **Zoom floor is cover.** Scale is a multiple of the cover scale (the smallest scale at which
  the image covers the crop) and runs `1×` to `4×`. The crop never extends past the image, so
  the export never has blank corners.
- **Pan is clamped** to the same rule, re-clamped after every zoom and
  rotate: edges never enter the crop.
- **Rotation is quarter turns** (90° per press, clockwise). Free angles would break the cover
  floor at the corners, and quarter turns keep every clamp exact.
  At odd turns the image's effective width and height swap, and cover, pan
  bounds and export all follow.
- **The mirror is image-local.** `flip` negates the image's own x-axis before
  the turn, so a mirrored, turned frame looks the same on stage and in the
  export. Cover and the clamps are unaffected, because a mirror changes no lengths.
- **Export re-projects the crop from the natural image** onto a canvas whose
  longest edge is `exportSize`, never from the screen pixels. The math lives in
  `image-editor.geometry.ts`, pure and unit-tested.

## Interaction

- **Pointer**: drag the stage to pan. Pointer events use capture, so mouse, touch and pen
  behave the same; `touch-action: none` on the stage.
- **Wheel**: zoom, centred on the viewport, clamped to the floor. The listener is non-passive
  because it must prevent page scroll.
- **Keyboard**: the stage is focusable (`tabIndex=0`), named by `messages.stage`, and handles
  arrows (pan by one space step; with Shift, four) and `+`/`-` (zoom by one slider step). The
  Slider and Buttons have their own keyboard behaviour.
- **Paste**: accepted only while focus is inside the editor, because capturing paste across
  the whole document would be a bug.
- **The hands law** (Slider's): dragging, wheeling and sliding follow the user's hand and are
  never animated. The rotate, flip and reset presses are commands, not gestures, and *are*
  animated (below).

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| empty dropzone | FileUpload's dropzone grammar: dashed `--pm-border-default` border · `--pm-radius-lg` · padding `--pm-space-7` · column, centered, gap `--pm-space-3` · Icon `upload` `lg` `--pm-text-muted` · title `text.sm` `--pm-text-primary` · hint `text.xs` `--pm-text-muted` |
| empty dragover | border `--pm-accent-bg` · bg `--pm-accent-subtle` (FileUpload's cell) |
| stage | inline-size 100% · `aspect-ratio` from the prop · bg `--pm-bg-subtle` · `--pm-radius-md` · overflow hidden · `cursor: grab`, `grabbing` while panning |
| image | positioned by one transform; `will-change: transform` only while panning |
| mask | an absolutely positioned overlay that fills the stage. The surround uses `--pm-bg-scrim`, the system's own dimmer, and the window is clear: a `radial-gradient` circle, or a rounded rectangle with `--pm-radius-lg` corners; paint only, `aria-hidden` |
| tools row | flex · gap `--pm-space-4` · align center · rotate Button `variant="ghost"` icon-only `rotate` · flip/reset Buttons the same grammar when offered · zoom Slider flexed to fill, `showValue` in percent of cover |
| grid | two vertical and two horizontal hairlines at the third lines, `1px` of `--pm-border-default` at 60%, visible only under `[data-panning]`; `aria-hidden` |
| actions row | flex · gap `--pm-space-3` · end-aligned · cancel `variant="ghost"` · confirm `variant="solid"` |

## Motion

Pan, wheel zoom and slider zoom follow the user's hand and never transition. The command
presses (rotate, flip, reset) set `data-animate` on the image for one control duration:
`transform var(--pm-motion-duration-control) var(--pm-motion-easing-standard)`. Any hand
gesture during the transition removes it, so a drag never competes with a tween. Reduced
motion removes the transition (`transition: none`), and the new framing applies immediately.

## A11y

The stage is a labelled, focusable surface whose keyboard controls match the pointer's
(WCAG 2.1.1: never mouse-only). Zoom is a real Slider, announced in percent of cover. The
rotate button is icon-only and named by `messages.rotate`. The mask and the stage image are
decorative to a screen reader (`alt` names the image; the frame is visual). The confirm's busy
state uses the Button's own loading state. Every string goes through `messages`, because
announced text a product cannot translate is announced in the wrong language.

Loading a file moves focus to the editing stage after the browser decodes it. If a given image
cannot be decoded, the editor returns to the chooser, focuses it, and announces
`messages.loadError`. It never leaves the user on a silent, disabled editor.

```contract
attr stage tabindex=0 when loaded
attr stage aria-label when loaded
role zoom slider when loaded
key ArrowRight increments on zoom when loaded
```

## States

| Entry | Render | Expect |
| --- | --- | --- |
| empty | no `src` | `data-empty`; dropzone with title, hint, browse |
| empty dragover | *(spec only: a fixture cannot synthesize a drag, as in FileUpload. The selector is asserted through `requiredSelectors`)* | `data-dragover` |
| loaded | `src` | stage, tools, actions |
| circle mask | `mask="circle"` | `data-mask="circle"`; overlay present |
| rounded mask | `mask="rounded"` | `data-mask="rounded"` |
| every control offered | `flip reset grid` | four buttons in the tools row |
| wide crop | `aspectRatio={16 / 9}` | stage aspect follows |
| no cancel | `onCancel` omitted | one action button |
| disabled | `disabled` | `data-disabled`; controls disabled |
| two shapes side by side | a two-column grid | the stage tracks its column |

`requiredSelectors`: `[data-dragover]`, `[data-panning]`, `[data-disabled]`,
`[data-busy]`, `[data-animate]`: the attributes the stylesheet selects on. `data-empty` and
`data-mask` are structural flags that the markup uses instead, and they are part of the
attribute set without a recipe.

## Icons

`upload` (empty dropzone, decorative), `rotate` (the quarter-turn press; its own role, sharing
`refresh`'s glyph through the role-to-glyph mapping in `design/icons.json`, so the two meanings
can get different glyphs later without call-site edits), `flip` (the mirror, when offered; its
own glyph), `undo` (reset to the floor, when offered; the existing verb role, reused
unchanged).

## Agent

An agent reads whether the editor holds an image, whether the framed image is being handed to
the application, and whether the editor is disabled. It runs nothing. A person frames the image
with a pointer or the keys on the stage, judging the result by eye, and confirms what they
framed, so the export is the person's; and an image comes from a person's disk, a drop or a
paste, which an agent cannot make. The browse, rotate, flip, reset, cancel and confirm Buttons
and the zoom Slider are the editor's own parts, so the editor withholds them and the bridge lists
the ImageEditor in their place. The stage names it once an image is loaded.

```agent
state empty boolean as root data-empty
state busy boolean as root data-busy
state disabled boolean as root data-disabled
withholds contents
```
