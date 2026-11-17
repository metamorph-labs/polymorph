# Motion

How polymorph animates, and why application code never does. Motion is one of the eight design axes
of a system ([theming.md](theming.md)). This page covers the rest of the model: where the numbers
live, how they are derived, the laws they must meet, and the engine that runs them.

## Motion binds to states, not screens

Every member of the vocabulary already owns its state machine: hover, press, open, checked, loading,
selected. A micro-interaction is a transition between two of those named states. It is therefore
defined **once, inside the member**, and every screen that composes the member gets it. Screens and
screen specs cannot express motion at all.

For the same reason, the component, not a design file, is the motion spec. Design tools describe
keyframes between static frames and cannot represent springs, velocity or interruption.

The principle behind the values: state feedback everywhere but barely noticeable, at most one
prominent transition per view, and nothing decorative.

## Values → patterns → bindings

Motion is split into layers the same way colour is.

**Values**: the numbers, in `design/motion/motion.json`:

| Value | Setting |
| --- | --- |
| Duration classes (enter) | `control` 140ms (glyphs, tooltips, hover and press tints, field errors) · `surface` 220ms (dropdowns, toasts, cards, sidebar) · `overlay` 260ms (dialogs, sheets) |
| Exit ratio | 0.65 × the enter duration |
| Easings | `enter` `cubic-bezier(0.16, 1, 0.3, 1)` decelerates · `exit` `cubic-bezier(0.7, 0, 0.84, 0)` accelerates · `standard` `cubic-bezier(0.4, 0, 0.2, 1)` for changes with no direction of travel |
| Springs | `default` (presence, reflow) · `snappy` (thumbs, pops) · `gentle` (large surfaces), per temperament |
| Distances | `sm` 4px · `md` 8px · `lg` 16px |
| Scale-from | `control` 0.90 · `surface` 0.94 · `overlay` 0.96 |
| Press scale, ambient periods | press scale per temperament; shimmer 1600ms, spin 900ms |

**Patterns**: a small set of named transitions, each limited in what it may animate:

| Pattern | Movement | Kind |
| --- | --- | --- |
| `fade` | opacity 0 → 1 | interactive |
| `scale-fade` | opacity, plus scale from the class's scale-from | interactive |
| `slide-fade` | opacity, plus travel of a named distance from an edge | interactive |
| `spring-pop` | scale 0.5 → 1 on the `snappy` spring, opacity eased; exits as a plain fade | interactive |
| `sheet` | translate the panel's own full width or height; opacity stays 1 | interactive |
| `press-feedback` | `scale(var(--pm-motion-press-scale))` while pressed | interactive |
| `collapse` | size 0 ↔ natural, content fading in the first or last half | container |
| `shimmer` | a 200%-wide sheen travelling across its host, looping | ambient |
| `spin` | rotation, looping | ambient |

**Bindings**: the roles. `motion.json → bindings` maps each member moment to a pattern and a
duration class, plus an origin, edge, distance or spring where needed. For example:

| Binding | Pattern |
| --- | --- |
| `dialog.panel` | `scale-fade`, `overlay`, from the trigger |
| `select.content`, `menu.content`, `popover.panel` | `scale-fade`, `surface`, from the edge facing the trigger |
| `toast.enter` / `toast.exit` | `slide-fade`, `surface`, `lg` from the bottom / `collapse` on exit |
| `checkbox.indicator`, `radio.indicator` | `spring-pop` |
| `switch.thumb`, `tabs.indicator` | a spring on transform |
| `drawer.panel`, `sheet.panel` | `sheet`, `overlay` |
| `skeleton.sheen`, `spinner.glyph` | `shimmer`, `spin` |

A member names its binding and gets concrete numbers. It never names a duration or a spring. A new
member whose moment fits an existing pattern at an existing class adds only a binding. A new pattern
changes `motion.json` and the engine together, because every binding must resolve. Chart members
bind `chart.frame` and `chart.marks`. See [charts.md](charts.md).

## Temperament

`motionTemperament` is a system axis with four values. It scales the whole catalogue at once:

| | `none` | `subtle` | `standard` | `expressive` |
| --- | --- | --- | --- | --- |
| duration scale | 0 | 0.8 | 1 | 1.35 |
| distance and scale-depth scale | 0 | 0.75 | 1 | 1.25 |
| press scale | 1 (none) | 0.99 | 0.97 | 0.95 |
| springs (damping ratio ζ) | not used | ≈ 1.0, no overshoot | ≈ 0.85 | ≈ 0.70, visible spring |
| ambient loops | off | slower | as set | faster |
| `overshoot` easing | = `standard` | = `standard` | = `standard` | a real overshoot |

**`none` is a lawful value.** It zeroes every duration and stagger token, bypasses the engine
entirely, reduces press feedback to colour alone and stops ambient loops. Because a system may run
with no motion, motion must never carry meaning. Every state has to be legible at `none`.

A system sets its temperament in its file. At runtime, `setMotionTemperament(t)` writes
`data-motion` on `<html>`. Any element with `data-motion` rescales its subtree. The theme emitter
writes a block per temperament for both cases.

## Derivation, not authorship

Almost no number is chosen per member:

- **Duration from size.** The duration comes from the element's size class: small controls
  ~100–150ms, large surfaces ~200–300ms. A bigger surface takes longer so that the eye can follow
  it.
- **Exits from entrances.** An exit is 0.65 × its enter, on the accelerating curve, because the user
  has already decided and the surface should get out of the way. Enters decelerate into place.
- **Distance and depth from temperament.** Travel defaults by class (`control` → `sm`, `surface` →
  `md`, `overlay` → `lg`) × the distance scale. scale-fade's starting scale becomes 1 − (1 − s) ×
  distance scale. `sheet` is the one exception. Its travel is the panel's own size, which is
  geometry, so temperament never scales it.
- **Everything from temperament**, as above. Ambient loop periods scale inversely, so a calmer
  temperament shimmers more slowly.
- **Stagger** is bounded. Each item waits `--pm-motion-stagger-step` (24ms at `standard`), and the
  total is clamped to `--pm-motion-stagger-max` (200ms at `standard`). A long list therefore arrives
  within that limit instead of taking a second. Lists cascade only on entry, and reduced motion
  removes the cascade.

The resolved durations, as emitted:

| | `subtle` | `standard` | `expressive` |
| --- | --- | --- | --- |
| `control` enter / exit | 112 / 73ms | 140 / 91ms | 189 / 123ms |
| `surface` enter / exit | 176 / 114ms | 220 / 143ms | 297 / 193ms |
| `overlay` enter / exit | 208 / 135ms | 260 / 169ms | 351 / 228ms |

## Reduced motion, by projection

`prefers-reduced-motion: reduce` projects every pattern onto a calmer one, **regardless of
temperament**. Because motion is named, not written inline, the projection is one table instead of
work in each component:

| Pattern | Under reduced motion |
| --- | --- |
| `fade` | itself |
| `scale-fade`, `slide-fade`, `spring-pop` | `fade` — opacity only, no transform |
| `sheet` | a fade in place, no travel |
| `collapse` | instant size change; content still fades |
| `shimmer`, `spin` | off (static) |
| `press-feedback` | no transform; colour feedback only |

Durations are kept, because an opacity change is vestibular-safe. Only `none` zeroes time. The
ambient-loop stop and the press projection are written once, in
`packages/recipes/src/conventions/motion.module.css`, which also stops ambient loops under
`[data-motion='none']`. No member special-cases either.

## The quality laws

1. **Interruptible and reversible.** Reversing an enter mid-flight continues from the current value
   with the exit curve. Nothing restarts from an endpoint. Springs are velocity-continuous, and CSS
   transitions behave this way natively.
2. **Compositor-only.** Interactive transitions animate `transform` and `opacity` and nothing else.
   `collapse` is the one pattern that animates size, and only on non-interactive containers, with
   overflow hidden while it moves.
3. **Never blocks input.** A surface stays clickable while it enters and while it leaves.
4. **Origin-aware overlays.** An anchored surface grows from the edge facing its trigger (from the
   positioning layer's side and align). A dialog grows from its trigger's centre projected into the
   panel, and otherwise from the panel's centre. A toast arrives from its edge. A sheet arrives from
   the edge it is pinned to, mirrored in right-to-left layouts.
5. **Reduced-motion projection is mandatory**, for every pattern and every moving CSS animation.
6. **Every state is legible with motion off.** Each `data-state` is styled at its resting value, so
   at `none` nothing is shown mid-transition.

## Where the values live

- `design/motion/motion.json`: the machine-readable values, patterns and bindings. The engine
  imports it directly (`packages/engine/src/motion/values.ts`).
- `design/motion/motion.md`: the same numbers with their reasoning, the pattern definitions and the
  notes behind each binding.
- `design/components/<member>.md`: a member's spec has a `## Motion` section stating which pattern,
  class and tokens each of its transitions uses.
- `packages/theme/src/derive.ts`: `deriveMotion` turns the temperament into tokens.

The split between tokens and engine-only data is deliberate. Anything CSS consumes is a token, so a
CSS transition and the engine rescale identically. The tokens, per temperament:

| Token | |
| --- | --- |
| `--pm-motion-duration-{control,surface,overlay}` and `…-exit` | durations |
| `--pm-motion-easing-{enter,exit,standard,overshoot}` | curves |
| `--pm-motion-spring-{default,snappy,gentle}-{stiffness,damping,mass}` | springs, read by the engine |
| `--pm-motion-press-scale` | press feedback |
| `--pm-motion-ambient-{shimmer,spin}` | loop periods (`0s` at `none`) |
| `--pm-motion-stagger-{step,max}` | stagger |

Distances, scale-froms, origins, projections and bindings are never tokens, because CSS never reads
them and the number of tokens is kept within a budget.

## The engine

Motion runs in two halves, both inside the vocabulary.

**CSS** handles the cheap, constant half: state feedback, press feedback, ambient loops and simple
enters keyed off `data-state`. Shared rules live in
`packages/recipes/src/conventions/motion.module.css` (`.stateFeedback`, `.pressable`, `.spin`,
`.shimmer`, `.fadeIn`) and the rest in each member's recipe. Every value is a `--pm-motion-*` token,
so `[data-motion]` rescales them and `none` stops them, with no rule naming a temperament.

**The motion engine** handles what CSS cannot do: exit choreography, keeping a leaving element
mounted until it has left, and velocity-continuous springs. It runs on the browser's own animation
engine, the Web Animations API, and depends on no animation library. It has two parts.
`@polymorph/engine/motion` (`packages/engine/src/motion/`) resolves bindings and runs animations,
with no framework in it. Each web framework's foundation has a `motion` subpath that re-exports
the bindings, values and environment and adds that framework's presence, so a member imports one
module: `@polymorph/react/motion` (`packages/react/src/motion/`, the React presence components),
and `@polymorph/vue/motion`, `@polymorph/svelte/motion`, `@polymorph/solid/motion` and
`@polymorph/angular/motion` (`packages/<framework>/src/motion/`, the `usePresence` and
`useKeyedPresence` functions, plus `useListPresence` in Svelte and Angular). The engine's animator
functions stay out of those surfaces: a member names a binding and never sees a duration.

- **Channels.** `animate.ts` animates each channel on its own CSS property (`opacity`, `translate`,
  `scale`), so each channel can keep its own timing. All three are composited.
- **Springs.** A spring is simulated and sampled into a `linear()` easing, so it runs on the
  compositor like any other curve.
- **Interruption.** Every animation starts from the value on screen, not from its keyframe, so a
  reversal mid-flight continues from where the element is. A spring interrupted mid-flight passes
  its velocity to the next one.
- **Presence.** `presence.tsx`, in the React part, keeps leaving children mounted until every
  surface inside them has finished its exit, and animates a `layoutBinding` reflow by FLIP on
  `transform`. `indicator.tsx` moves an always-present marker between measured positions on a
  spring. Each other web foundation's `src/motion/presence` module does the same job for its
  framework.

`@polymorph/react/motion` exports:

| Export | Does |
| --- | --- |
| `MotionSurface`, `MotionPresence` | presence: mount, exit coordination, origin, reduced-motion projection |
| `MotionIndicator` | an always-present marker that springs between positions (the tab underline) |
| `resolveBinding` | a binding name plus the environment in, concrete keyframes and transitions out (from `@polymorph/engine/motion`) |
| `readMotionEnvironment` | reads the `--pm-motion-*` tokens that apply to an element, plus reduced motion and writing direction; produces no motion when no theme is installed, and where there is no document (from `@polymorph/engine/motion`) |
| `stillMotionEnvironment` | the environment with no motion and every field filled. A presence component renders with it on a server and for the hydration of that markup, so the two write the same attributes, and reads the real one after it mounts (from `@polymorph/engine/motion`) |

`@polymorph/engine/motion` and each foundation's `motion` entry are subpaths, not part of their
package's root, because only member internals use them.
`animate.ts` is the only file that turns patterns into browser animation calls. The engine can
therefore be replaced by editing `packages/engine/src/motion/`, and a motion library could enter
only there.

**SwiftUI and Compose** read the same values from the token package. Each pairing's theme
carries all four temperaments (`motion` on `PMTheme` in `PolymorphTokens` and in
`dev.polymorph.tokens`), and `defaultMotion` is the one the system's axes select. The members
animate with their platform's own animation APIs, from those durations, easings and springs.

## What application code may and may not do

Application code **may** compose members, whose motion comes with them. It may choose the
temperament, in the system file or at runtime with `setMotionTemperament` or a `data-motion`
attribute on a subtree. It may rely on the operating system's reduced-motion setting being honoured
everywhere.

Application code **may not** express motion. Two red rules ([rules.md](rules.md)) enforce this, and
`polymorph add` installs both in consumers:

- **`polymorph/no-external-motion`** (ESLint) forbids importing or re-exporting a motion library:
  `motion`, `framer-motion`, `react-spring`, `gsap`, `animejs`, `popmotion`,
  `react-transition-group`, `auto-animate` and their scoped forms. In this repository the same rule
  keeps all of them out of the engine and the React packages except `packages/engine/src/motion/`,
  which imports none.
- **`polymorph/no-motion-outside-vocabulary`** (Stylelint) forbids `transition*`, `animation*` and
  `@keyframes` in application CSS.

`polymorph/no-raw-styles` also forbids `style` props, so motion cannot be added inline either.
Rung 1 answers these rules when a member already animates what the code does, and the report names
the member: `Dialog`, `Drawer`, `Popover` and `Toast` for an entrance and exit, `Collapsible` and
`Accordion` for a section opening and closing, `Button` for press feedback, `Spinner` for a loading
spin, and `Switch`, `Slider` and `Tabs` for a spring on a thumb or indicator. A stylesheet that
animates a member's state is told the member and the motion it already has. Otherwise no rung
before a [Bespoke zone](rules.md#rung-4-bespoke-zones) (rung 4) answers them. A genuine one-off
animation is declared as a zone (the ESLint rule exempts a file that declares one). Motion that
recurs belongs in a member.

## How the laws are tested

| Test | Holds |
| --- | --- |
| `packages/engine/src/motion/values.test.ts` | every pattern has a kind and a reduced-motion projection; temperaments are distinct and monotone; springs hit their damping targets and never fall below ζ 0.6; duration classes are ordered and inside their perceptual band; exits are quicker |
| `packages/engine/src/motion/patterns.test.ts` | every binding resolves; interactive bindings touch only `transform` and `opacity` at every temperament; size animation only in `collapse`; temperament scaling; `none` bypasses the engine; exits at 0.65; projections; origins; the sheet's geometry |
| `packages/react/src/motion/presence.test.tsx` | exit coordination; a reversal continues from the current value; motion never blocks input; a temperament switch rescales a mounted surface |
| `packages/engine/src/motion/conformance.test.ts` | the emitted `--pm-motion-*` tokens equal `motion.json` |
| `packages/theme/src/derive.test.ts`, `packages/theme/src/laws.test.ts` | motion tokens per temperament; coherence: `none` derives no motion, overshoot only at `expressive` |
| `packages/react-ui/src/conventions/motion-css.test.ts` | the CSS half: state feedback moves nothing that reflows, every value is a token, `none` stops it, ambient loops die under reduced motion |
| `packages/react-ui/src/conventions/reduced-motion.test.ts` | every recipe in `packages/recipes/src` that moves an element projects under reduced motion |
| `packages/rules/src/rules/no-external-motion.test.ts`, `packages/rules/src/fixtures.test.ts`, `packages/rules/src/repo-laws.test.ts` | the two red rules, and that Stylelint actually applies the CSS one to `apps/` |
| `pnpm proof` | at `none`, an opened dialog in Relay (the workbench's demo product) is at full opacity, untransformed, with nothing on the page still transitioning |

To see the catalogue in action, run `pnpm dev:docs` and open the Motion page. It plays every pattern
live, with a temperament select beside it. [verification.md](verification.md) covers the test
projects and `pnpm proof`.
