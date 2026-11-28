---
'@polymorph/vue-ui': patch
'@polymorph/svelte-ui': patch
'@polymorph/solid-ui': patch
'@polymorph/angular-ui': patch
'@polymorph/elements-ui': patch
---

`DateRangePicker`'s calendar in Vue, Svelte, Solid, Angular and `<poly-date-range-picker>` says the
month on screen once. Its title, and the calendar's name built from it, read "November 2026 -
November 2026" on screen and to a screen reader; they now read "November 2026", in the field's
locale, as the React member's do. Nothing to change in an app.
