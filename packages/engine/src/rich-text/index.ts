/**
 * `@polymorph/engine/rich-text`: the rich-text document
 * (`docs/rich-text.md`): its types, its tolerant reader, its normal form and
 * its projections to plain text.
 *
 * A subpath with no dependency and no DOM, so a server reads, checks and
 * indexes a document with the code the members use. The editor is another
 * entry (`@polymorph/engine/rich-text-editor`), so a page that only shows
 * documents does not load it.
 */
export { RICH_TEXT_FORMAT, RICH_TEXT_FORMATS, RICH_TEXT_MAX_DEPTH } from './types'
export type {
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
  RichTextText,
} from './types'
