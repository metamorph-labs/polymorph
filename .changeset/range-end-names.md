---
'@polymorph/native': patch
---

On iOS, each of `DateRangePicker`'s two dates is named by the field's label and then its half's
word, `messages.start` or `messages.end`, as the web names each half. VoiceOver reads "Stay, Start
date" and "Stay, End date" where it read "Stay" for both. Left out, the words are the string
catalogue's `PMStrings.dateRangePickerStart` and `PMStrings.dateRangePickerEnd`, "Start date" and
"End date", which an app translates in its own string catalog. An app that already passes
`messages` with `start` and `end` needs nothing more. On Android the range field is one button
whose value is both dates, so it names neither half.

On Android, `MultiSelect`'s open list says how many options it shows through its polite live
region, as the web's list does: `messages.options` when the app passes it, otherwise
`PMStrings.multiSelectOptions` ("{count} options", "1 option" for one), which an app translates
through `LocalPMStrings`. While the list loads, and while nothing matches, it says what it said
before.
