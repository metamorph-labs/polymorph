---
'@polymorph/react-ui': patch
'@polymorph/vue-ui': patch
'@polymorph/svelte-ui': patch
'@polymorph/solid-ui': patch
'@polymorph/angular-ui': patch
'@polymorph/elements-ui': patch
'@polymorph/screen': patch
'@polymorph/native': patch
'@polymorph/tools': patch
---

`ArtifactPane` takes `streamingLabel`, what its spinner says while the artifact is being written,
which every web renderer said in English whatever the page's language. Left out, it is
"{title}: still being written", as before, on every web renderer and on SwiftUI and Compose, which
say the string catalogue's sentence. `ArtifactPane`'s purpose on the cards is "A side pane for one
artifact a turn produced".
