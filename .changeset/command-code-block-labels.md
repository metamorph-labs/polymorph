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

`Command` takes `spoken`, the words its status region says while the commands load and once some
are shown, as a function of `{ loading, count }` (its type is exported as `CommandSpoken`). Every
web framework and `<poly-command>` said "Loading commands…" and "4 commands" in English whatever
the page's language. Pass `spoken` to say both in the app's words and number grammar; left out,
the words are the same as before, and with nothing shown the region still says `emptyMessage`.
`<poly-command>` takes it as a property. Command has no SwiftUI or Compose rendering, so nothing
changes there.

`CodeBlock` takes `copiedLabel`, what a screen reader hears after a copy, as `CopyButton` does.
Every web framework and `<poly-code-block>` said "Copied" in English. Left out, it is "Copied" as
before. The SwiftUI and Compose CodeBlocks take it too, and announce the string catalogue's
"Copied" when it is left out, as before. In Kotlin, `PMCodeBlock` and `PMCodeBlockProps` take
`copiedLabel` second, after `children`, so a call that passed `copyable`, `copyLabel` or `label`
by position names them.

The screen skill's reference names `spoken` and `copiedLabel` among the words a member takes; run
`polymorph agents` again to take it.
