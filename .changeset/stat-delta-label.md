---
'@polymorph/react-ui': patch
'@polymorph/vue-ui': patch
'@polymorph/svelte-ui': patch
'@polymorph/solid-ui': patch
'@polymorph/angular-ui': patch
'@polymorph/elements-ui': patch
'@polymorph/native': patch
'@polymorph/tools': patch
---

`Stat` takes `deltaLabel`, the sentence a screen reader hears for its delta, as a function of the
delta's `value`, its `direction` and its resolved `positive` (its type is exported as
`StatDeltaLabel`). Every web framework and `<poly-stat>`
said "up 12% — positive" in English whatever the page's language. Pass `deltaLabel` to say it in
the app's words and word order; left out, the sentence is the same as before. A
Dashboard's `stats` entries pass it through in every framework, and `<poly-stat>` takes it as a
property. The SwiftUI and Compose Stats take it too, as a closure of `PMStatDeltaFacts`, and say
the string catalogue's sentence when it is left out, as before. Stat's states fixture gains the
spark entries its spec lists (a spark trending down beside a down-positive delta, a spark with the
trend chip, a spark alone), and its native fixtures gain the up-negative delta. The screen skill's
reference names `deltaLabel` among the words a member takes; run `polymorph agents` again to take
it.
