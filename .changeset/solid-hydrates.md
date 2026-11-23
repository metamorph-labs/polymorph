---
'@polymorph/solid': patch
'@polymorph/solid-ui': patch
'@polymorph/vue-ui': patch
'@polymorph/svelte-ui': patch
'@polymorph/angular-ui': patch
---

A Solid application that renders on a server hydrates every member. Before, a development build
threw on entries of these members (Avatar.Group, DescriptionList, CommentThread, DataTable,
ArtifactPane, AppShell, ListPage, Dashboard, MasterDetailPage, SearchPage and ConversationPage).
A slot's content and a prop's value that holds nodes now take their place in the hydration where
the member declares them, a prop that holds nodes is read once, a member the server did not draw
is created as new elements, and a portal's content is created outside the hydration. The
foundation exports what the members use for it: `createKept` and `afresh`.

A hydrated Solid `Textarea` and `PromptInput` hold their value. The server wrote it as an
attribute, which a browser does not read, and now writes it as the textarea's content too.

`MasterDetailPage` draws the detail on a server when one is given, in Vue, Svelte, Solid and
Angular. Its `selected` state started `false` and an effect set it, so a server drew the pane for
nothing selected.

The Solid server-render law now compares each hydrated document with a mount of the same entry
([docs/consuming.md](../docs/consuming.md#a-solid-app)).
