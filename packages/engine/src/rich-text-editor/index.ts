/**
 * `@polymorph/engine/rich-text-editor`: the editor a rich-text field mounts
 * (`design/components/rich-text-input.md`).
 *
 * A subpath of its own, because it is the only entry that loads the editing
 * library: a page that shows documents and edits none does not ship it.
 */
export { createRichTextEditor } from './editor'
export type {
  RichTextEditor,
  RichTextEditorClasses,
  RichTextEditorEntityKind,
  RichTextEditorEvent,
  RichTextEditorOptions,
  RichTextEditorState,
  RichTextEditorUpdate,
  RichTextRect,
  RichTextSuggestion,
  RichTextSuggestionKey,
} from './types'
