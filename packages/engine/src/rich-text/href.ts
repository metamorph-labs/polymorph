import { cleanHref } from '../markdown/parse'
import type { RichTextHrefOptions } from './types'

/**
 * Which link targets a rich-text document may hold (`richTextHref`).
 *
 * A document is stored by one person and drawn for others, so a link is a
 * place another reader is sent. The rule is an allowlist: the web, mail and
 * telephone schemes, and a path inside the application. Every other scheme is
 * refused, because a scheme this reader does not know may run code in the
 * page (`javascript:`, `vbscript:`) or show content the application did not
 * write (`data:`, `blob:`). A target that starts with `//` or `/\` is refused
 * too: a browser reads both as another host, which is a link off the
 * application that looks like a path.
 *
 * The target is checked as a browser reads it: control characters are removed
 * and the ends trimmed first (`cleanHref`, shared with the Markdown parser),
 * so `java\tscript:` and `\u0001 javascript:` are read as `javascript:` and
 * refused. The cleaned target is what the document keeps.
 */

const ALLOWED_SCHEMES: ReadonlySet<string> = new Set(['http', 'https', 'mailto', 'tel'])

/** A scheme, as RFC 3986 spells one, at the start of the target. */
const SCHEME = /^([a-z][a-z\d+.-]*):/i

/** A path inside the application: `/x` (not `//x` or `/\x`), `#x`, `?x`, `./x`, `../x`. */
const RELATIVE = /^(?:\/(?![/\\])|#|\?|\.\.?\/)/

/** A bare email address, as a person types one into a link form. */
const EMAIL = /^[^\s@/\\:?#]+@[^\s@/\\:?#.]+(?:\.[^\s@/\\:?#.]+)+$/

/**
 * A bare domain with an optional port and path, as a person types one:
 * `example.com`, `www.example.com/x?y`, `bücher.de`. The last label is letters
 * or an encoded international name, so `1.5` and `localhost` are not domains.
 */
const DOMAIN =
  /^(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+(?:\p{L}{2,63}|xn--[a-z\d-]{1,59})\.?(?::\d{1,5})?(?:[/?#]\S*)?$/iu

/**
 * The target a link may point at, cleaned, or `null` when it may not be followed.
 *
 * With `typed`, the target is what a person typed in a link form, so a bare
 * domain becomes `https://…` and a bare email address `mailto:…`. A stored
 * document's target is never rewritten that way: a bare domain in a document
 * is refused.
 */
export function richTextHref(raw: unknown, options: RichTextHrefOptions = {}): string | null {
  if (typeof raw !== 'string') return null
  const href = cleanHref(raw)
  if (href === '') return null
  if (options.typed === true) {
    if (EMAIL.test(href)) return `mailto:${href}`
    if (DOMAIN.test(href)) return `https://${href}`
  }
  const scheme = SCHEME.exec(href)
  if (scheme !== null) return ALLOWED_SCHEMES.has((scheme[1] as string).toLowerCase()) ? href : null
  return RELATIVE.test(href) ? href : null
}
