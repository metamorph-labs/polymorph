---
'@polymorph/engine': patch
'@polymorph/react': patch
'@polymorph/react-ui': patch
'@polymorph/vue': patch
'@polymorph/vue-ui': patch
'@polymorph/svelte': patch
'@polymorph/svelte-ui': patch
'@polymorph/solid': patch
'@polymorph/solid-ui': patch
'@polymorph/angular': patch
'@polymorph/angular-ui': patch
'@polymorph/elements': patch
'@polymorph/elements-ui': patch
---

Text fields leave every key an input method is handling to it. In TagInput, MultiSelect,
InlineEdit, PromptInput, PhoneInput and ColorInput, the Enter that confirms a Japanese or Chinese
candidate, including the one Safari sends after the composition has ended, no longer commits,
toggles, saves or sends half-typed text. An Escape that abandons a composition no longer clears
TagInput's or MultiSelect's text, cancels InlineEdit, or clears the query of the Vue, Svelte,
Solid, Angular and elements Command. The engine exports the check as `composingKey`.

Escape that clears TagInput's uncommitted text, clears a closed MultiSelect's text or cancels an
open InlineEdit no longer closes a Dialog around the field as well; the next Escape closes it.
The engine exports the hold as `holdFieldEscape`.

TagInput's and MultiSelect's arrow keys between the field and the chips follow the writing
direction: in a right-to-left page → moves back into the chips and ← forward to the field. The
engine exports the key as `lineStartKey`.

FileUpload and PromptInput move focus once the app has removed a file or an attachment whose
remove control was pressed: to the next item's remove control, else the previous one's, else the
dropzone or the field. Focus no longer falls to the page. The engine exports the rule as
`focusAfterListRemoval`.

In RichTextInput, Shift+Tab on an item of a top-level list moves focus out of the field and no
longer turns the item into a paragraph, and after an Escape with nothing to close, the next Tab or
Shift+Tab moves focus out from any list item without changing the text.
