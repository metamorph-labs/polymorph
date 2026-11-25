---
'@polymorph/react-ui': patch
'@polymorph/vue-ui': patch
'@polymorph/svelte-ui': patch
'@polymorph/solid-ui': patch
'@polymorph/angular-ui': patch
'@polymorph/elements-ui': patch
'@polymorph/recipes': patch
---

**FormPage takes a leading action.** `leadingAction` is one optional action drawn at the start of
the actions row, apart from `actions`, which stay at its end: the destructive tertiary action
FormPage's spec places leftmost, such as "Delete…". The row wraps as it did, and the actions stay
at the end of whichever line they land on, in either direction. Without it, FormPage renders as
before. A Vue, Svelte, Solid or Angular page passes it as the `leadingAction` slot, and an element
as a child with `slot="leadingAction"`. The SwiftUI and Compose FormPage take it too
(`PMFormPageProps.leadingAction`), at the start of the row they already draw. `danger-last` reads
the slot as a group of its own, so a danger Button there comes before the actions lawfully.
