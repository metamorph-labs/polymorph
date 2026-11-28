---
'@polymorph/engine': patch
'@polymorph/react': patch
'@polymorph/vue': patch
'@polymorph/svelte': patch
'@polymorph/solid': patch
'@polymorph/angular': patch
'@polymorph/elements': patch
'@polymorph/react-ui': patch
'@polymorph/vue-ui': patch
'@polymorph/svelte-ui': patch
'@polymorph/solid-ui': patch
'@polymorph/angular-ui': patch
'@polymorph/elements-ui': patch
---

`MultiSelect`'s open list has the field's own name on every web framework and as
`<poly-multi-select>`. Inside a `FormField`, and under any `<label for>` that names the field, the
list had no accessible name, because it took its name only from the `aria-label` or
`aria-labelledby` the host passed. It now takes the field's `aria-labelledby`, else its
`aria-label`, else the labels that name the field, which it refers to by id. A label with no id is
given one the first time the list opens, and FormField's required mark is left out of the name, as it is
left out of the field's. A host that passes both `aria-label` and `aria-labelledby` now hears the
React list named by `aria-labelledby` alone, as the field is named and as the generated members
already named it. Nothing to change in an app.

`@polymorph/engine` exports `fieldLabelIds`, the ids of the labels that name a field, which every
framework's member calls; each foundation re-exports it.
