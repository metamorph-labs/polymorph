---
'@polymorph/react-ui': patch
'@polymorph/engine': patch
'@polymorph/native': patch
---

A Select returns to nothing chosen when its application sets `value` to `null`, with or without
`emptyOption`. Without it, the trigger shows the placeholder, in the anchored list and in the
phone's sheet, and the hidden field submits the empty string. A React Select given `null` without
`emptyOption` drew a blank trigger and warned in development; `null` is now how a form clears a
choice, as when it resets after a save. Hold an unchosen Select's value as `string | null`, not
`undefined`: a Select given `undefined` holds the choice itself, and the React member keeps showing
its last pick, so it now warns in development when `value` goes from a value to `undefined`.

`y.label` on BarChart, LineChart, AreaChart and ScatterChart names the measure the values are in,
and a ScatterChart's `x.label` names its other measure. The chart says each once, in its summary
sentence ("Weekday load showing Opened and Resolved, 3 points. Values: Tickets handled."), where
nothing read `y.label` before. A host catalog's `summary` receives them as the optional facts
`measure` and `xMeasure`; a catalog that does not read them keeps its own sentence. The SwiftUI
charts say the measure in their summary too, and name it as the value axis of their audio graph.
