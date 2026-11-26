---
'@polymorph/engine': patch
'@polymorph/react-ui': patch
'@polymorph/vue-ui': patch
'@polymorph/svelte-ui': patch
'@polymorph/solid-ui': patch
'@polymorph/angular-ui': patch
'@polymorph/elements-ui': patch
---

A toast raised under the id of a toast that is still leaving is drawn as a card of its own. The
two records shared one list key, so Svelte did not draw the new toast, Vue and Angular kept the
leaving card on the page, and React and Solid drew the new toast in the leaving card. Each record
of the toast store now has a `key`, which every viewport keys its cards by: the id, or the id
with its raise while a leaving card holds the id. An application that draws the store's records
itself keys them by `key`.
