---
'@polymorph/engine': minor
'@polymorph/recipes': minor
'@polymorph/react': minor
'@polymorph/react-ui': minor
---

Rich text. Two members and a document format, described in `docs/rich-text.md`.

- `@polymorph/engine/rich-text` is the document: plain JSON with the format
  `polymorph-rich-text/1`, a reader that accepts any value and never throws, a normal form, plain
  text, a length in code points, the entities a document names, and annotations. It has no
  dependency and no DOM, so a server reads and checks a document with the code the members use.
- `RichTextInput` (`controls`) is the field: a toolbar or a bar at the selection, keys, links,
  lists, quotes and code blocks, entities a person inserts by a trigger such as `@` from options
  the application supplies, a soft character limit, and slots for the application's controls and
  footer. It uploads, fetches and stores nothing.
- `RichTextContent` (`structure`) draws a document read-only through the vocabulary's members. It
  writes no HTML from the document.
- An `annotation` mark anchors something the application keeps about a stretch of text, such as a
  comment thread. Both members draw the highlight and report a press on it, and both offer the
  application's controls at the selected text.
- `@polymorph/engine/rich-text-editor` is the editor `RichTextInput` is built on. The engine now
  depends on ProseMirror's packages, which only that entry imports: a page with no field loads
  none of it.

Markdown's link check removes control characters before it trims, so a target that hid
`javascript:` behind a leading control character and a space is no longer followed.
