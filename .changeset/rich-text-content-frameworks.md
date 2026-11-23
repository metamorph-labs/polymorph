---
'@polymorph/engine': minor
'@polymorph/react-ui': patch
'@polymorph/vue': minor
'@polymorph/vue-ui': minor
'@polymorph/svelte': minor
'@polymorph/svelte-ui': minor
'@polymorph/solid': minor
'@polymorph/solid-ui': minor
'@polymorph/angular': minor
'@polymorph/angular-ui': minor
'@polymorph/elements-ui': minor
---

`RichTextContent` in Vue, Svelte, Solid and Angular, and as `<poly-rich-text-content>`, generated
from one description and held to the React member's contract.

- Its `entity` function is each framework's slot that takes an argument: a scoped slot in Vue, a
  snippet in Svelte, a function in Solid, an `ng-template` in Angular and a function property on
  the element. Where it draws nothing for an entity, the member draws the entity's token.
- `@polymorph/engine/rich-text` exports `richTextDrawing`, which reads a document into the blocks
  and inlines each framework's member draws, with the highlights nested and the positions of
  the plain text. It reads no DOM, so it runs on a server. `@polymorph/engine` exports the
  reading of a selection and of a press or key on a highlight (`mapRichTextSelection`,
  `richTextSelectionBox`, `richTextPressedAnnotation`, `richTextKeyedAnnotation`). The React
  member draws from the same functions, and its markup is unchanged.
- Each foundation exports `slotDraws`, which says whether a slot that takes an argument draws
  anything for one.
