---
'@polymorph/react-ui': patch
'@polymorph/vue-ui': patch
'@polymorph/svelte-ui': patch
'@polymorph/solid-ui': patch
'@polymorph/angular-ui': patch
'@polymorph/elements-ui': patch
'@polymorph/native': patch
---

Four default sentences now say the singular for one, on every web renderer and in the SwiftUI
and Compose strings: `Combobox`'s and `MultiSelect`'s count says "1 option" where it said
"1 options", `PhoneInput`'s says "1 country" where it said "1 countries", `PromptInput`'s
suggestion count says "1 suggestion" where it said "1 suggestions", and `TagInput`'s removal says
"{tag} removed, 1 remains" where it said "1 remain". A test that reads these sentences for one
item expects the new words. An app that passes `messages.options`, `messages.countriesShown`,
`messages.suggestions` or `removedLabel` hears its own words, as before. On Android, an app's
`PMStrings` that replaces `comboboxMessages`, `multiSelectOptions`, `phoneInputCountriesShown`,
`promptInputMessages` or `tagInputRemoved` is still called for every count, one included; on iOS
each entry keeps its key in the app's string catalog, where a translation can vary by plural.

In Vue, Svelte, Solid, Angular and the elements, two things a screen-reader user heard in English
are gone. `NumberInput`'s field no longer carries the role description "numberfield", so it is
heard as a text field. On Apple platforms `Combobox` and `MultiSelect` still speak the highlighted
option as the arrows move it, by its label alone: their machine no longer says ", selected" in
English after a chosen option, so VoiceOver no longer says which highlighted option is chosen,
which the option carries as `aria-selected`. React keeps React Aria's role description and its
combobox's sentence, in the page's locale; React's `MultiSelect` makes no such announcement.

`NumberInput` and `ColorInput` take `messages`, on every web renderer and in the SwiftUI and
Compose contracts, so a localized app names what their machines named in fixed English in the
generated members. `NumberInput`'s `messages.increment` and `messages.decrement` name the
steppers; left out, they are "increment value" and "decrease value" in the generated members, as
before, and React Aria's "Increase" and "Decrease" on React. The SwiftUI and Compose steppers take
them too, over the string catalogue's "Increase" and "Decrease". `ColorInput`'s `messages` names
and values the picker's plane (`plane`, `planeValue`) and rails (`hue`, `alpha`, `railValue`);
left out, the generated members say what they said before ("saturation and brightness",
"hue 120"), and React keeps React Aria's words. The native colour pickers do not draw them.
