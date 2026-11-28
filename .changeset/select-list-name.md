---
'@polymorph/react-ui': patch
'@polymorph/vue-ui': patch
'@polymorph/svelte-ui': patch
'@polymorph/solid-ui': patch
'@polymorph/angular-ui': patch
'@polymorph/elements-ui': patch
---

`Select`'s open list has the field's own name on every web framework and as `<poly-select>`. The
list had no accessible name: React's anchored list is Radix's, which names it from nothing, and the
generated list referred to a label element that no member draws, so even an `aria-label` on the
Select did not reach it. Only React's sheet, below `30rem`, took `aria-label` or
`aria-labelledby`, and nothing under a `<label for>` or inside a `FormField`. The list now takes
the field's `aria-labelledby`, else its `aria-label`, else the labels that name the trigger, which
it refers to by id, in the anchored panel and in the sheet. A label with no id is given one the
first time the list opens, and FormField's required mark is left out of the name, as it is left out
of the trigger's. Nothing to change in an app.
