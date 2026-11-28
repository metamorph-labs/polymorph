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
