/**
 * The rich-text document: the portable JSON an application stores and every
 * renderer and the editor read (`docs/rich-text.md`).
 *
 * The shapes below are what this version writes. A reader accepts more: a node
 * or a mark whose `type` it does not know is kept where it is and drawn as the
 * readable text found in it, so a document written by a later version still
 * reads. The types name no editor: a document is data, and the editor that
 * produced it can be replaced without changing a stored byte.
 */

/** The format this version reads and writes. The number changes only when an older reader would misread the document. */
export const RICH_TEXT_FORMAT = 'polymorph-rich-text/1'

/** How deep blocks may nest. A reader flattens what is deeper, so a hostile document cannot exhaust a renderer's stack. */
export const RICH_TEXT_MAX_DEPTH = 8

export interface RichTextDocument {
  format: typeof RICH_TEXT_FORMAT
  blocks: RichTextBlock[]
}

export type RichTextBlock =
  RichTextParagraph | RichTextHeading | RichTextList | RichTextBlockquote | RichTextCodeBlock

export interface RichTextParagraph {
  type: 'paragraph'
  content: RichTextInline[]
}

export interface RichTextHeading {
  type: 'heading'
  /** The level inside the document: 1 is its shallowest heading. A renderer decides the page level. */
  level: 1 | 2 | 3
  content: RichTextInline[]
}

export interface RichTextList {
  type: 'list'
  /** A numbered list when true, a bulleted list when false. */
  ordered: boolean
  /** The first item's number in a numbered list. Omitted when 1. */
  start?: number
  items: RichTextListItem[]
}

export interface RichTextListItem {
  type: 'listItem'
  /** The item's blocks. The first is a paragraph. A nested list is a later block. */
  content: RichTextBlock[]
}

export interface RichTextBlockquote {
  type: 'blockquote'
  content: RichTextBlock[]
}

export interface RichTextCodeBlock {
  type: 'codeBlock'
  /** The language's name as the writer gave it (`ts`, `python`). Omitted when none. */
  language?: string
  text: string
}

export type RichTextInline = RichTextText | RichTextBreak | RichTextEntity

export interface RichTextText {
  type: 'text'
  text: string
  /** Omitted when the text has none. */
  marks?: RichTextMark[]
}

/** A line break inside a block, which the writer asked for. */
export interface RichTextBreak {
  type: 'break'
}

/**
 * A reference to something the application owns: a person, a team, an issue, a
 * file. The document holds what identifies it and the words it reads as, and
 * nothing about where it lives.
 */
export interface RichTextEntity {
  type: 'entity'
  /** The application's name for the kind of thing: `user`, `issue`. */
  kind: string
  /** The application's identifier for the thing. */
  id: string
  /** The words drawn and read, with any leading character they carry: `@Ada Lovelace`. */
  label: string
  /** The annotations the entity is inside. An entity keeps no other mark. Omitted when it has none. */
  marks?: RichTextMark[]
}

export type RichTextMark =
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'strike' }
  | { type: 'code' }
  | { type: 'link'; href: string }
  | RichTextAnnotationMark

/**
 * An anchor for something the application keeps about these words: a comment
 * thread, a review note, a suggestion. The mark holds the application's
 * identifier and nothing else, and it moves with its text through every edit.
 * Several annotations may cover the same text. It is not a format: a field
 * always holds it, and `restrictRichText` keeps it.
 */
export interface RichTextAnnotationMark {
  type: 'annotation'
  /** The application's identifier for what is anchored here. */
  id: string
}

/**
 * A stretch of a document, in code points of its plain text with no separator
 * between blocks: `richTextPlainText(doc, { blockSeparator: '' })`, the units
 * `richTextLength` counts. `end` is exclusive. A caret is a range whose ends
 * are equal.
 */
export interface RichTextRange {
  start: number
  end: number
}

/** One annotation as `richTextAnnotations` lists it. */
export interface RichTextAnnotation {
  id: string
  /** The plain text the annotation covers, an entity as its label. */
  text: string
  /** From its first character to its last. An annotation in several pieces is one entry that spans them. */
  range: RichTextRange
}

/** What a field may be told to allow. Entities and hard breaks are not formats: a field always holds them. */
export type RichTextFormat =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'code'
  | 'link'
  | 'heading'
  | 'bulletList'
  | 'orderedList'
  | 'blockquote'
  | 'codeBlock'

/** Every format, in the order a toolbar draws them. */
export const RICH_TEXT_FORMATS: readonly RichTextFormat[] = [
  'bold',
  'italic',
  'strike',
  'code',
  'link',
  'heading',
  'bulletList',
  'orderedList',
  'blockquote',
  'codeBlock',
]

export type RichTextFaultCode =
  /** The input is not an object with a `format` and a `blocks` array. The result is the empty document. */
  | 'unreadable'
  /** The document's format is later than this reader's. It is read as far as it can be. */
  | 'newer-format'
  /** A node of a type this reader does not know. It is kept and drawn as its readable text. */
  | 'unknown-node'
  /** A mark of a type this reader does not know. It is kept and draws nothing. */
  | 'unknown-mark'
  /** A known node with a missing or mistyped field. It is repaired where the repair is certain, and dropped otherwise. */
  | 'malformed'
  /** A link whose target may not be followed. The mark is removed and its text kept. */
  | 'unsafe-link'
  /** Blocks nested deeper than `RICH_TEXT_MAX_DEPTH`. They are flattened to paragraphs of their text. */
  | 'too-deep'

export interface RichTextFault {
  code: RichTextFaultCode
  /** Where in the input: keys and indexes from the document's root. */
  path: (string | number)[]
  message: string
}

export interface RichTextParseResult {
  /** The document in normal form. Always usable, whatever the input was. */
  value: RichTextDocument
  /** What the reader repaired, removed or did not know. Empty for a document this version wrote. */
  faults: RichTextFault[]
}

export interface RichTextPlainTextOptions {
  /** What separates two blocks. Default: one line break. */
  blockSeparator?: string
  /** Writes `- ` or the item's number before each list item, for a preview a person reads. Default false. */
  listMarkers?: boolean
}

export interface RichTextHrefOptions {
  /**
   * The target is what a person typed, so a bare domain becomes `https://…`
   * and a bare email address `mailto:…`. A stored document's target is never
   * rewritten.
   */
  typed?: boolean
}
