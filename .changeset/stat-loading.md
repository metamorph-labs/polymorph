---
'@polymorph/react-ui': patch
'@polymorph/vue-ui': patch
'@polymorph/svelte-ui': patch
'@polymorph/solid-ui': patch
'@polymorph/angular-ui': patch
'@polymorph/elements-ui': patch
'@polymorph/recipes': patch
'@polymorph/native': patch
'@polymorph/tools': patch
---

`Stat` takes `loading`, for a number that has not arrived. The label row stays as it is, and the
value and each part the stat is passed that states the number (the trend chip, the spark, the
delta or the description, the footer) draw a Skeleton of that part's size, so the card keeps its
height when the number arrives. `value` stays required: pass `''` on the first load, or the last
value on a reload, and it is not drawn. Pass the parts the loaded card will have, so their
placeholders hold its height; a part that is not passed draws nothing. While loading, the stat's
root carries `aria-busy="true"` and `data-loading`, the value's Skeleton is named by the new
`loadingLabel` ("Loading" by default), and no value, delta, sentiment, chip label or sparkline
name is drawn or read. `<poly-stat>` takes the `loading` and `loading-label` attributes, a
Dashboard's `stats` entries pass both through in every framework, and the SwiftUI and Compose
Stats draw the same state from `loading` and `loadingLabel`. The screen skill's reference says
what a dashboard passes while its numbers load; run `polymorph agents` again to take it.
