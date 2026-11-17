# Motion design values

**Machine-readable mirror:** [`motion.json`](./motion.json). The motion engine
(`packages/engine/src/motion/values.ts`) reads that file. This document holds the same numbers
with their reasoning. If the two disagree, the JSON is wrong: fix it to match this doc's
tables, not the reverse. The model behind the numbers (states not screens, values →
patterns → roles, temperament, reduced-motion projection) is explained in
[`docs/motion.md`](../../docs/motion.md).

The stance: motion binds to **states** and is **derived** rather than authored (exits from
enters, durations from size class, everything from temperament). It has a **budget**:
subtle state feedback everywhere, one hero transition per view, nothing decorative. Every
number below is exact.

## 1. Duration ladder

The enter durations are `TUNED-IN` constants in `packages/theme/src/derive.ts`; the
temperament's duration scale (§3) multiplies them.

| Class | Enter | Exit (×0.65) | Elements |
| --- | --- | --- | --- |
| `control` | **140ms** | 91ms | glyphs, chevrons, tooltips, hover/press tints, field errors |
| `surface` | **220ms** | 143ms | select content, toasts, cards, empty-state swaps, sidebar |
| `overlay` | **260ms** | 169ms | dialog panel + scrim, drawer and sheet panels, the command palette |

Rationale: perceptual research and industry practice put small-element feedback at
100–150ms. Below ~100ms it reads as instant, and above ~200ms as lag. Large surfaces need
200–300ms to be tracked without appearing to jump.

**Exit ratio 0.65.** Exits are quicker because the user has already decided, and the surface
must get out of the way. `derive.test.ts` also asserts this structurally.

**Class assignment:** `select.content` is **`surface`** (220ms), not `overlay`. A
dropdown is a transient anchored surface, not a modal commitment, and 260ms after a click
reads as lag. The `overlay` class belongs to modal panels.

## 2. Easing curves

| Role | Curve | Character |
| --- | --- | --- |
| `enter` | `cubic-bezier(0.16, 1, 0.3, 1)` | strong deceleration: arrives fast, lands softly |
| `exit` | `cubic-bezier(0.7, 0, 0.84, 0)` | acceleration: commits and leaves |
| `standard` | `cubic-bezier(0.4, 0, 0.2, 1)` | symmetric: colour/border/size changes with no direction of travel |

Law: enters decelerate, exits accelerate, bidirectional property changes use
`standard`. No component picks a bezier; it picks a role.

## 3. Temperament table (the one table)

| | `none` | `subtle` | `standard` | `expressive` |
| --- | --- | --- | --- | --- |
| duration scale | 0 | 0.8 | 1 | 1.35 |
| distance scale (travel + scale-depth) | 0 | 0.75 | 1 | 1.25 |
| press scale (transform at `:active`) | 1 (off) | 0.99 | 0.97 | 0.95 |
| spring set (§4) | bypassed | over-damped ζ≈1.0 | ζ≈0.85 | bouncy ζ≈0.70 |
| ambient period (§6) | off | ÷0.8 (1.25× slower) | ×1 | ÷1.35 (≈0.74× — livelier) |

- Duration scaling happens **at the token layer** (the theme's emission), so CSS
  transitions rescale identically to the engine. `none` zeroes every duration token.
  `subtle`'s 0.8 is a floor, not a preference: see §11.
- Distance scaling happens in the motion engine from `motion.json`. CSS state feedback
  has no travel, so it needs no distance token.
- Ambient periods scale *inversely*: a calmer temperament shimmers slower, not faster.
  `none` disables ambient loops entirely.

## 4. Springs — per temperament

Damping ratio ζ = damping ∕ 2√(stiffness·mass). Design targets: `subtle` settles with
zero overshoot (ζ ≈ 1.0), `standard` keeps a slight overshoot (ζ ≈ 0.85), and
`expressive` visibly springs (ζ ≈ 0.70) and runs stiffer so the bounce is quick rather
than floppy. The values are supplied to `derive.ts`.

| Temperament | `default` (presence, reflow) | `snappy` (thumbs, pops) | `gentle` (large surfaces) |
| --- | --- | --- | --- |
| `subtle` | 300 / 35 / 1 (ζ 1.01) | 400 / 38 / 0.9 (ζ 1.00) | 200 / 30 / 1.1 (ζ 1.01) |
| `standard` | 300 / 30 / 1 (ζ 0.87) | 400 / 32 / 0.9 (ζ 0.84) | 200 / 26 / 1.1 (ζ 0.88) |
| `expressive` | 340 / 26 / 1 (ζ 0.71) | 480 / 28 / 0.9 (ζ 0.67) | 220 / 22 / 1.1 (ζ 0.71) |
| `none` | standard's values, **unused by law**: the engine is bypassed entirely at `none` | | |

(stiffness / damping / mass.)

## 5. Press feedback (the `press-feedback` micro-pattern)

- **Down:** `transform: scale(var(--pm-motion-press-scale))` over `control × 0.5`
  (70ms std) with `standard` easing. The token is per-temperament (§3) and emitted
  (§8).
- **Release:** spring `snappy` back to 1 (engine); pure-CSS consumers fall back to
  `control` × `enter`.
- At `none` the token is `1`: no transform, and colour states alone carry feedback.
- Transform-only and compositor-only. It never blocks input (§10).

## 6. Pattern definitions (all numeric)

Shared rule: enter uses the binding's class duration × `enter`; exit uses the class
exit duration × `exit`. `distanceScale` multiplies every travel and scale-depth.

| Pattern | From → To | Numbers |
| --- | --- | --- |
| **fade** | opacity 0 → 1 | nothing else. The projection target for every pattern below |
| **scale-fade** | opacity 0 → 1, scale *s* → 1 | *s* by class: control **0.90**, surface **0.94**, overlay **0.96**; temperament: *s′* = 1 − (1 − *s*)·distanceScale. Origin: anchored surfaces grow from the trigger-facing edge (Radix side/align → transform-origin); dialogs from the trigger's projected origin (fallback center) |
| **slide-fade** | opacity 0 → 1, translate *d* → 0 | *d* named: sm **4px**, md **8px**, lg **16px** (default by class: control→sm, surface→md, overlay→lg) × distanceScale, from the bound edge/side |
| **collapse** | size 0 ↔ natural | `persistent` mode (stays mounted — sidebar): size over `surface` × `standard`, labels fade out over the first 50% before size moves, fade in over the last 50% on expand. `exit` mode (unmount — toast): content opacity → 0 over first 50% of `surfaceExit`, then size → 0 over the rest, × `exit` easing. Overflow hidden while animating |
| **spring-pop** | opacity 0 → 1, scale 0.5 → 1 | scale on spring `snappy`; opacity over `control × 0.5` × `standard`. Exit is plain `fade` at `controlExit`, because a pop never plays in reverse |
| **shimmer** (ambient) | gradient overlay translateX −100% → 100% | 200%-wide layer, linear, infinite; period **1600ms** ÷ durationScale |
| **spin** (ambient) | rotate 0 → 360° | linear, infinite; period **900ms** ÷ durationScale; the `loading` glyph is a ¾ arc so the static frame still reads as loading |
| **sheet** *(Drawer's edge entrance)* | translate ±100% → 0, opacity **1 throughout** | full off-canvas travel on the bound edge (`translateX(±100%)` / `translateY(100%)`); `overlay` class durations/easings. **Distance is structural, so temperament's distanceScale does not apply**: 100% is geometry, not travel budget. This is the only such pattern, and it is stated so the engine never scales a sheet into the page. A sheet slides in. It does not fade in |

## 7. Reduced-motion projections (mandatory, per pattern)

`prefers-reduced-motion: reduce` projects **regardless of temperament**. Durations are
kept, because an opacity change is vestibular-safe. Only `none` zeroes time.

| Pattern | Projection |
| --- | --- |
| fade | itself |
| scale-fade · slide-fade · spring-pop | fade (opacity only, no transform) |
| collapse | instant size change; content still fades |
| shimmer · spin | off (static) |
| press-feedback | no transform; colour states only |
| sheet | fade in place, no travel. A sheet held off-screen by transform cannot appear from nowhere at opacity 0. The AppShell drawer projects the same way |

Ambient animations stop **once, globally**: a single `prefers-reduced-motion` /
`[data-motion="none"]` rule (`packages/recipes/src/conventions/motion.module.css`) pauses them,
and no component special-cases it (conventions §7).

## 8. Token emission

What `@polymorph/theme` emits from these values:

- Durations, easings and the exit ratio, per §1–§3.
- `motion.spring.*`, varying by temperament (§4 values).
- `--pm-motion-press-scale` (§5; CSS press feedback needs it) and
  `--pm-motion-ambient-shimmer` / `--pm-motion-ambient-spin` (§6 periods, for CSS ambient
  loops; `0s` at `none`, alongside the global stop rule).
- `--pm-motion-stagger-step` / `--pm-motion-stagger-max`: the stagger's bounded shape
  (§9's `menu.items`).

Everything else in `motion.json` (distances, scale-froms, origins, projections,
bindings) is engine-side data and deliberately **not** tokens: CSS never reads them, and
the token count is a budget.

## 9. Component bindings

`motion.json → bindings` is the registry-ready list. Each binding names its pattern,
class and, where relevant, distance, edge, origin or spring. Each member spec names the
bindings it uses, so a member can be implemented from this table without rereading its
spec's motion section.

- **Controls and structure:** dialog scrim/panel, select content (+chevron rotate),
  tooltip bubble, toast enter/exit/reflow, checkbox and radio indicators, switch thumb,
  button press/spinner, input clear, form-field error, skeleton sheen, sidebar
  collapse, list-page body swap, empty-state enter, table sort icon, menu content,
  popover panel, tabs indicator/content, progress fill, avatar image, data-table bulk
  bar, filter-bar clear and the standalone spinner.
- **The heavier members** (definitions in each spec):
  `accordion.content` / `collapsible.content` = `collapse` persistent, `surface` (the
  sidebar's precedent, the Radix measured height as input) · `drawer.panel` /
  `sheet.panel` = **`sheet`**, `overlay` (scrim reuses `dialog.scrim`) · `slider.thumb`
  = grab-grow to **1.12** on spring `snappy`, release back (press-feedback inverted;
  value travel is never animated) · `combobox.popup` / `datepicker.popup` =
  `select.content` verbatim · `command.panel` = `scale-fade`, `overlay`, origin
  top-center; `command.items` = the `menu.items` cascade re-run per committed query ·
  `calendar.month` = outgoing `fade` at `controlExit`, incoming `slide-fade` `sm` from
  the travel direction, `surface` · `stepper.indicator` = `spring-pop` on completion;
  connector fill over `surface` × `standard` · `taginput.chip` = enter `scale-fade`
  `control`, exit `fade` + layout-spring reflow (toast-stack precedent) ·
  `fileupload.row` = enter `slide-fade` `sm` top, exit `fade` + reflow ·
  `alert.dismiss` = `collapse` exit, `surface` · `scrollarea.rail` = `fade`, `control`.
- **The conversation tier** (`docs/conversation.md`): `chat.message` = `slide-fade`
  `sm` from the bottom edge, `control`, enter only, because a turn comes from the
  composer's edge and is never withdrawn · `streaming.pending` = `shimmer`, the
  skeleton's sheen on the placeholder bar where text has not arrived yet ·
  `toolcall.status` = `fade`, `control`, the status glyph's swap (CodeBlock's
  `copy`→`confirm` precedent). ReasoningDisclosure uses `collapsible.content`,
  Citation's preview uses `popover.panel` through HoverCard, and ArtifactPane's
  view swap uses `tabs.content`. All three are by reference, so none is listed in the
  JSON. The streaming caret does not blink. A blink would be an ambient loop with no
  pattern behind it, and a steady mark signals "still arriving" just as well.
- **`menu.items`, the CSS-side stagger:** items enter under the panel's own
  `scale-fade` as `fade` + 2px drift at `control` × `enter`, each delayed
  `index × --pm-motion-stagger-step` clamped to `--pm-motion-stagger-max` (index ladder
  capped at twelve; later items share the ceiling). Enter only: lists do not cascade
  out. Temperament sets the character through the tokens alone (expressive 32ms/item,
  subtle a 17ms sweep, `none` zero). Reduced motion projects the cascade to presence,
  because a delay is motion even when the thing being delayed is not.
- **The chart tier** (`docs/charts.md`): `chart.frame` = `fade`, `surface`, easing
  `enter`, on mount · `chart.marks` = transform **+** opacity, `surface`, easing
  `enter`, staggered by the same `--pm-motion-stagger-step/max`. The entrance is
  transform-from-baseline: bars `scaleY` from the zero line, following the `Progress`
  inline-transform precedent (geometry is data, not a decision), and opacity carries
  strokes and washes. **No draw-on choreography**: `stroke-dashoffset` would need a new
  pattern kind for a flourish the restraint law already rules out, and data display
  should not be playful. Value changes re-render. A refetch dims through
  `data-state="loading"` at the `surface` duration. All of it is CSS-side, with no
  `MotionSurface` and no JS springs, so `none` and reduced motion snap through the
  duration tokens, which are already zero there.

**The derivation claim:** every member animates with an existing pattern at an existing
class. The catalogue meets this with exactly one pattern added for structural reasons
(`sheet`, §6) and no new physics anywhere else.

**No binding without support.** A binding enters `motion.json` together with the engine
support that performs it, never before, so the JSON never names motion that nothing
implements (`packages/engine/src/motion/values.test.ts`). Members that use another member's
binding **by reference** (HoverCard using Popover's) are deliberately absent from
`motion.json`, because the registry records bindings, not the members that reuse them.

## 10. Interruption laws

1. Reversing any enter mid-flight continues from the current value with the exit
   curve and never restarts from the endpoint. The engine starts every animation from
   the value on screen, an interrupted spring passes its velocity to the next, and CSS
   transitions do this natively.
2. Interactive transitions animate only `transform` and `opacity`. Collapse animates
   size on *non-interactive* containers only, and must keep the animated box
   non-scrollable while it moves. The engine runs on the browser's Web Animations API: a
   pattern's channels animate the individual `translate` and `scale` properties, which
   composite exactly as `transform` does, and a layout reflow animates `transform` itself.
3. Motion never blocks input: no `pointer-events: none` longer than an exit
   (≤169ms), and never on enter.
4. Every `data-state` is styled at its resting value, so with every duration killed
   (`none`) each state remains fully legible (`docs/verification.md`).

## 11. The legibility floor

Motion tuned below perception gives no feedback. Two consequences, both values:

1. **`subtle`'s duration scale is 0.8, not lower.** A 98ms colour-only hover on a faint
   wash goes unseen. At 112ms the control class clears the threshold where a state change
   is *seen* rather than inferred. `none` stays 0 (the engine is bypassed), and
   `standard`/`expressive` already sit above the floor, so only the quiet end needs one.
2. **Legibility is reviewable.** The docs site's Motion page
   (`apps/docs/src/pages/MotionPage.tsx`) demonstrates every pattern in §4–§9 live and
   re-triggerable, with the temperament select beside it. Reviewers cannot judge motion
   quality unless something plays it, which is also why the token gallery exists for
   colour.

Hover *deltas* clear the floor too: the wash ladder's steps 3–5 sit 0.025 apart in
light, so a hover that moves one step is visible on every surface the contrast sweep
checks.
