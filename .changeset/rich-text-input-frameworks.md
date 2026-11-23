---
'@polymorph/engine': minor
'@polymorph/react-ui': patch
'@polymorph/vue-ui': minor
'@polymorph/svelte': minor
'@polymorph/svelte-ui': minor
'@polymorph/solid-ui': minor
'@polymorph/angular': minor
'@polymorph/angular-ui': minor
'@polymorph/elements': minor
'@polymorph/elements-ui': minor
---

`RichTextInput` in Vue, Svelte, Solid and Angular, and as `<poly-rich-text-input>`, generated from
one description and held to the React member's contract.

- Its `toolbar`, `selectionActions` and `footer` functions are each framework's slot that takes
  an argument: a scoped slot in Vue, a snippet in Svelte, a function in Solid, an `ng-template` in
  Angular and a function property on the element. The argument is the field's handle.
- An Angular output and an element's event carry one value, so `submit` there carries the
  document and not the handle; the slots receive the handle.
- `@polymorph/engine` exports the keyboard of a toolbar with one tab stop (`toolbarKeydown`,
  `syncToolbarStop` and the functions beside them) and the places of a bar at the selected text
  and of a list at a token (`placeSelectionBar`, `followSelectionBar`, `placeTokenList`), which
  every framework's member calls. The React member calls the same functions.
- `@polymorph/engine` also exports what makes a field of several parts behave as one control:
  `followFieldFocus` (focus entering and leaving the field as a whole), `followFormReset` and
  `focusOnLabelPress`.
- A states fixture entry can select words once they are drawn: the Svelte foundation's `Held`
  takes `selects`, and the Angular foundation exports `selectOnce`.
