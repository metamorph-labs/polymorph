---
'@polymorph/engine': patch
'@polymorph/theme': patch
---

**A palette can pin the colour the accent gradient runs to.** `pins` takes `accent.gradientTo`,
an opaque `#rrggbb` per mode, beside the fill pins. `accent.gradient` then runs from `accent.bg`,
pinned or derived, to the pinned colour, instead of to step 10 of the partner ramp. The stylesheet
writes it in `--pm-accent-gradient` and as `--pm-accent-gradient-to`, and the token document and
the SwiftUI, Compose and Flutter themes carry it in the gradient's stops. `bg.wash` does not
change.

The contrast law measures the pinned stop as it measures a derived one: `accent.contrast` must
reach Lc 60 at both stops. Admission refuses a stop under the floor with the measured value, the
stop and the pin named: `… reached Lc 31.9 at its 'to' stop, floor is 60. The 'to' stop is
accent.gradientTo, which the palette pins in light mode.` A palette that pins a light
`accent.bg`, such as a cream, and was refused at the `'to'` stop of its partner hue can keep
`gradientHue` and pin a second stop the label reads on.

The pin gives `accent.gradient` two stops in a palette with no `gradientHue`, or with
`chromaBudget: none`, too. A gradient has one shape in both modes, so such a palette pins
`accent.gradientTo` in both modes or in neither; the palette schema refuses it in one mode only.
In a palette with `gradientHue`, a mode that pins no stop keeps the derived one.

`GRADIENT_PINS`, `GRADIENT_STOP_PINS`, `gradientStopPin` and the `GradientPin` type are exported
beside `PIN_ROLES`, which still lists only colour roles. A palette that pins nothing resolves and
emits exactly as before.
