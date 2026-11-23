---
'@polymorph/react-ui': patch
'@polymorph/vue-ui': patch
'@polymorph/svelte-ui': patch
'@polymorph/solid-ui': patch
'@polymorph/angular-ui': patch
'@polymorph/elements-ui': patch
'@polymorph/native': patch
---

Accordion and Collapsible take `keepMounted`, an optional prop with the name Tabs uses. In React a
closed region's content then stays in the document, `hidden`, so a page's server markup carries it
and state inside the region survives a close: an FAQ's answers are in the HTML a crawler reads
without running a script. The region is hidden once its close animation ends. Without the prop
React leaves closed content out, as before. The Vue, Svelte, Solid, Angular and elements members
already keep a closed region's content in the document, `hidden`, so they accept the prop and it
changes nothing there. The SwiftUI and Compose contracts gain the field, and neither rendering
draws it: SwiftUI lays a closed region's content out at no height in every case, and Compose
leaves it out.
