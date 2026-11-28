---
'@polymorph/react-ui': patch
'@polymorph/vue-ui': patch
'@polymorph/svelte-ui': patch
'@polymorph/solid-ui': patch
'@polymorph/angular-ui': patch
'@polymorph/elements-ui': patch
'@polymorph/screen': patch
'@polymorph/native': patch
'@polymorph/tools': patch
---

The date and time fields and `ArtifactPane` take the words they said to a screen reader in English
whatever the page's language. Each is optional; left out, every member says what it said before.

- `DatePicker`'s and `DateRangePicker`'s `messages` take `empty`, what an unfilled segment says as
  its value, and `DateRangePicker`'s also take `start` and `end`, the names of its two halves.
  `TimeInput` takes `messages` (`TimeInputMessages`, exported, `{ empty }`), as `MonthInput` does.
  On React the defaults stay React Aria's words ("Empty", "Start Date", "End Date"), which React
  Aria says in the page's locale; in Vue, Svelte, Solid, Angular and the elements they are
  "Empty", "Start date" and "End date". A host that already passes `messages` to the pickers needs
  nothing more for the words it passes; add `empty`, `start` and `end` to its catalogue to say
  those in its language too.
- `ArtifactPane` takes `streamingLabel`, what its spinner says while the artifact is being
  written, "{title}: still being written" by default, on every web renderer and on SwiftUI and
  Compose, which say the string catalogue's sentence when it is left out, as before.

The SwiftUI and Compose contracts carry the new `messages` fields and `TimeInput`'s `messages`.
The native date and time fields say no value while empty, so they do not draw `empty`, and the
SwiftUI range field names each of its two dates with `start` or `end`. `ArtifactPane`'s purpose
on the cards is "A side pane for one artifact a turn produced", and `DateRangePicker`'s "A date
range *field*: two segmented dates and a calendar popup".
