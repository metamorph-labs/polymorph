---
'@polymorph/react-ui': patch
'@polymorph/vue-ui': patch
'@polymorph/svelte-ui': patch
'@polymorph/solid-ui': patch
'@polymorph/angular-ui': patch
'@polymorph/elements-ui': patch
'@polymorph/native': patch
---

Three accessible names and one sentence change in Vue, Svelte, Solid, Angular and the elements,
where each was English whatever the page's language. `Command` names its list by its `label`
("Command palette" unless you pass one), where it said "Suggestions". `PhoneInput` names its list
of countries by `messages.country` ("Country calling code" unless you pass one), where it said
"Suggestions". `ColorInput`'s colour plane no longer carries the role description "2d slider", so
it is heard as a slider, with both channels in its value text. A localized app that already passes
`label` and `messages.country` needs nothing more; React keeps React Aria's words for all three,
which React Aria says in the page's locale. On every web renderer, React included, `Command`'s
default count says "1 command" for one result, where it said "1 commands"; `spoken` still replaces
it.

`Combobox`'s `messages` takes `list`, the open list's accessible name, on every web renderer. Left
out, the name is "Suggestions", as before, followed by the field's label where `aria-labelledby`
names the field; on React the default stays React Aria's word in the page's locale, followed by
the chevron's name where no reference names the field, as before. The SwiftUI
and Compose contracts carry the field, and their lists, which have no name of their own, do not
draw it. `Combobox`'s purpose on the cards is "Filtered single choice".
