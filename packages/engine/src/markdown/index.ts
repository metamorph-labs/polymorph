/**
 * `@polymorph/engine/markdown`: the tolerant Markdown parser
 * (`design/components/markdown.md`), and the decisions every framework's
 * Markdown renders its tree by: a heading's level, and where a streaming
 * reply's caret goes.
 *
 * A subpath, not a root export, because only Markdown needs it: an application
 * that imports the root for its theme or conventions does not load it. The
 * foundations re-export it, so a member reaches it through its framework's
 * foundation.
 */
export {
  inlineText,
  markdownEndsInProse,
  markdownHeadingLevel,
  markdownShallowestHeading,
  parseInlines,
  parseMarkdown,
  safeHref,
} from './parse'
export type {
  MarkdownBlock,
  MarkdownInline,
  MarkdownParseOptions,
  MarkdownTableAlign,
} from './parse'
