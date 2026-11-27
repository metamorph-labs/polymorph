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

`TagInput` takes `countLabel`, the count sentence in the field's description, as a
`TagInputCountLabel`: a function of the number of tags (`count`), `max`, and `atMax`, which the
member resolves. Every web framework and `<poly-tag-input>` said "2 added" and "Maximum of 3
added" in English whatever the page's language. Pass `countLabel` to say the count in the app's
words, plural and word order; left out, the sentence is the same as before. `<poly-tag-input>`
takes it as a property. The SwiftUI and Compose TagInputs take it too, as a closure of
`PMTagInputCountFacts`, and say the string catalogue's sentence when it is left out, as before.
TagInput's purpose on the cards is now "Free-text tags". The screen skill's reference names
`countLabel` among the words a member takes; run `polymorph agents` again to take it.
