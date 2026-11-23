/**
 * `@polymorph/engine/rich-text`: the rich-text document
 * (`docs/rich-text.md`): its types, its tolerant reader, its normal form, its
 * projections to plain text, the ranges and annotations that anchor an
 * application's comments to its words, and what a reader member draws for a
 * document (`richTextDrawing`), which every framework's RichTextContent draws
 * from.
 *
 * A subpath with no dependency and no DOM, so a server reads, checks and
 * indexes a document with the code the members use. The editor is another
 * entry (`@polymorph/engine/rich-text-editor`), so a page that only shows
 * documents does not load it.
 *
 * Every function that reads a document takes what `parseRichText` takes: any
 * JSON value, or a JSON string. None throws.
 */
export { RICH_TEXT_FORMAT, RICH_TEXT_FORMATS, RICH_TEXT_MAX_DEPTH } from './types'
export type {
  RichTextAnnotation,
  RichTextAnnotationMark,
  RichTextBlock,
  RichTextBlockquote,
  RichTextBreak,
  RichTextCodeBlock,
  RichTextDocument,
  RichTextEntity,
  RichTextFault,
  RichTextFaultCode,
  RichTextFormat,
  RichTextHeading,
  RichTextHrefOptions,
  RichTextInline,
  RichTextList,
  RichTextListItem,
  RichTextMark,
  RichTextParagraph,
  RichTextParseResult,
  RichTextPlainTextOptions,
  RichTextRange,
  RichTextText,
} from './types'

export { annotateRichText, removeRichTextAnnotation, richTextAnnotations } from './annotations'
export {
  RICH_TEXT_ATOM,
  RICH_TEXT_CODE,
  RICH_TEXT_END,
  RICH_TEXT_START,
  richTextDrawing,
  richTextPositionAttrs,
} from './drawing'
export type {
  RichTextDrawing,
  RichTextDrawingOptions,
  RichTextDrawnBlock,
  RichTextDrawnInline,
  RichTextPosition,
} from './drawing'
export { richTextHref } from './href'
export { migrateRichText } from './migrate'
export { isRichTextBlockKnown, isRichTextInlineKnown, isRichTextMarkKnown } from './nodes'
export {
  emptyRichText,
  normalizeRichText,
  parseRichText,
  richTextEquals,
  serializeRichText,
} from './read'
export { richTextFindText, richTextRangeText } from './ranges'
export { restrictRichText } from './restrict'
export {
  isRichTextEmpty,
  richTextEntities,
  richTextExcerpt,
  richTextFromText,
  richTextLength,
  richTextNodeText,
  richTextPlainText,
} from './text'
