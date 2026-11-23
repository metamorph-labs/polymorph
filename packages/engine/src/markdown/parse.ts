/**
 * A small, tolerant markdown parser for `Markdown` (`design/components/markdown.md`).
 * It has no framework in it, so every framework's Markdown renders the same
 * tree from the same source.
 *
 * Two facts shape it. First, the source is a model's reply that is usually
 * still arriving. The parser never throws and treats an unfinished construct
 * as the text received so far: an open fence is a code block of what has
 * arrived, and an unmatched `**` is two asterisks. The finished shape appears
 * once the closing characters arrive. Second, the member renders the output
 * through the vocabulary, so the tree names kinds (a heading, a list, a code
 * block) and never an element or a style. Raw HTML is text. A tag in the
 * source renders as its literal characters, which is what makes model output
 * safe to render.
 *
 * The grammar is the CommonMark core that models write: headings, paragraphs,
 * fenced code, block quotes, lists (nested by indentation), pipe tables,
 * thematic breaks, and the inline set (code spans, emphasis, strikethrough,
 * links, images, autolinks, hard breaks). It adds one construct for this tier:
 * `[n]` is a citation mark when the member has `n` sources. Setext headings
 * are recognised for `===` only. A line of `---` is always a rule, because
 * that is what models mean by it.
 */

export type MarkdownInline =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'strong'; children: MarkdownInline[] }
  | { kind: 'em'; children: MarkdownInline[] }
  | { kind: 'strike'; children: MarkdownInline[] }
  | { kind: 'link'; href: string; children: MarkdownInline[] }
  | { kind: 'image'; alt: string; src: string }
  | { kind: 'break' }
  | { kind: 'citation'; index: number }

export type MarkdownTableAlign = 'start' | 'center' | 'end' | null

export type MarkdownBlock =
  | { kind: 'paragraph'; children: MarkdownInline[] }
  | { kind: 'heading'; depth: 1 | 2 | 3 | 4 | 5 | 6; children: MarkdownInline[] }
  | { kind: 'code'; lang: string; text: string; closed: boolean }
  | { kind: 'quote'; children: MarkdownBlock[] }
  | { kind: 'list'; ordered: boolean; start: number; items: MarkdownBlock[][] }
  | {
      kind: 'table'
      align: MarkdownTableAlign[]
      header: MarkdownInline[][]
      rows: MarkdownInline[][][]
    }
  | { kind: 'rule' }

export interface MarkdownParseOptions {
  /** The number of sources the member holds, where `[n]` is a citation only when `1 ≤ n ≤ citations`. */
  citations?: number
}

/* -------------------------------------------------------------------------- */
/* Blocks                                                                      */
/* -------------------------------------------------------------------------- */

const FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*([^`\s]*)[^`]*$/
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*#*[ \t]*$/
const RULE = /^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/
const SETEXT_H1 = /^ {0,3}=+[ \t]*$/
const QUOTE = /^ {0,3}>[ ]?(.*)$/
const LIST_ITEM = /^( {0,3})([-*+]|\d{1,9}[.)])([ \t]+|$)(.*)$/
const TABLE_DELIMITER = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/
const BLANK = /^[ \t]*$/

export function parseMarkdown(source: string, options: MarkdownParseOptions = {}): MarkdownBlock[] {
  return parseBlocks(source.replace(/\r\n?/g, '\n').split('\n'), options)
}

function parseBlocks(lines: string[], options: MarkdownParseOptions): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = []
  let paragraph: string[] = []

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    blocks.push({ kind: 'paragraph', children: parseInlines(paragraph.join('\n'), options) })
    paragraph = []
  }

  let at = 0
  while (at < lines.length) {
    const line = lines[at] as string

    if (BLANK.test(line)) {
      flushParagraph()
      at += 1
      continue
    }

    const fence = FENCE.exec(line)
    if (fence) {
      flushParagraph()
      const marker = fence[1] as string
      const lang = fence[2] ?? ''
      const body: string[] = []
      let closed = false
      at += 1
      while (at < lines.length) {
        const candidate = lines[at] as string
        const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(candidate)
        if (
          close &&
          (close[1] as string)[0] === marker[0] &&
          (close[1] as string).length >= marker.length
        ) {
          closed = true
          at += 1
          break
        }
        body.push(candidate)
        at += 1
      }
      blocks.push({ kind: 'code', lang, text: body.join('\n'), closed })
      continue
    }

    // Setext `===` turns the paragraph above it into a heading. No other setext form is recognised.
    if (paragraph.length > 0 && SETEXT_H1.test(line)) {
      const text = paragraph.join('\n')
      paragraph = []
      blocks.push({ kind: 'heading', depth: 1, children: parseInlines(text, options) })
      at += 1
      continue
    }

    if (RULE.test(line)) {
      flushParagraph()
      blocks.push({ kind: 'rule' })
      at += 1
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      flushParagraph()
      const depth = (heading[1] as string).length as 1 | 2 | 3 | 4 | 5 | 6
      blocks.push({ kind: 'heading', depth, children: parseInlines(heading[2] ?? '', options) })
      at += 1
      continue
    }

    if (QUOTE.test(line)) {
      flushParagraph()
      const inner: string[] = []
      while (at < lines.length) {
        const quoted = QUOTE.exec(lines[at] as string)
        if (!quoted) break
        inner.push(quoted[1] ?? '')
        at += 1
      }
      blocks.push({ kind: 'quote', children: parseBlocks(inner, options) })
      continue
    }

    const item = LIST_ITEM.exec(line)
    if (item && !(paragraph.length > 0 && /^\d/.test(item[2] as string) && item[2] !== '1.')) {
      flushParagraph()
      const result = readList(lines, at, options)
      blocks.push(result.list)
      at = result.next
      continue
    }

    if (
      line.includes('|') &&
      at + 1 < lines.length &&
      TABLE_DELIMITER.test(lines[at + 1] as string)
    ) {
      const header = splitRow(line)
      const align = splitRow(lines[at + 1] as string).map(alignOf)
      if (header.length === align.length) {
        flushParagraph()
        const rows: MarkdownInline[][][] = []
        at += 2
        while (
          at < lines.length &&
          (lines[at] as string).includes('|') &&
          !BLANK.test(lines[at] as string)
        ) {
          const cells = splitRow(lines[at] as string)
          // A short row is padded and a long one trimmed. A table still being
          // written has an incomplete last row, and it must still render as a
          // table.
          const fitted = Array.from({ length: header.length }, (_, column) => cells[column] ?? '')
          rows.push(fitted.map((cell) => parseInlines(cell, options)))
          at += 1
        }
        blocks.push({
          kind: 'table',
          align,
          header: header.map((cell) => parseInlines(cell, options)),
          rows,
        })
        continue
      }
    }

    paragraph.push(line)
    at += 1
  }

  flushParagraph()
  return blocks
}

/** `| a | b |` → `['a', 'b']`. Escaped pipes stay in their cell. */
function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  const cells: string[] = []
  let current = ''
  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index] as string
    if (character === '\\' && trimmed[index + 1] === '|') {
      current += '|'
      index += 1
    } else if (character === '|') {
      cells.push(current.trim())
      current = ''
    } else {
      current += character
    }
  }
  cells.push(current.trim())
  return cells
}

function alignOf(cell: string): MarkdownTableAlign {
  const left = cell.startsWith(':')
  const right = cell.endsWith(':')
  if (left && right) return 'center'
  if (right) return 'end'
  if (left) return 'start'
  return null
}

/**
 * One list: every following item with the same marker kind and indent.
 *
 * An item continues through every following line indented at least to its
 * content column. Blank lines are included while indented content follows
 * them. This lets an item hold a nested list, a code fence or a second
 * paragraph. Each item is parsed recursively as blocks.
 */
function readList(
  lines: string[],
  start: number,
  options: MarkdownParseOptions,
): { list: MarkdownBlock; next: number } {
  const first = LIST_ITEM.exec(lines[start] as string) as RegExpExecArray
  const ordered = /^\d/.test(first[2] as string)
  const startNumber = ordered ? Number.parseInt(first[2] as string, 10) : 1
  const indent = (first[1] as string).length
  const items: MarkdownBlock[][] = []

  let at = start
  while (at < lines.length) {
    const match = LIST_ITEM.exec(lines[at] as string)
    if (!match || (match[1] as string).length !== indent) break
    if (/^\d/.test(match[2] as string) !== ordered) break

    const marker = match[2] as string
    const gap = (match[3] as string).length
    const contentColumn = indent + marker.length + Math.max(1, Math.min(gap, 4))
    const body: string[] = [match[4] ?? '']
    at += 1

    while (at < lines.length) {
      const candidate = lines[at] as string
      if (BLANK.test(candidate)) {
        // A blank line belongs to the item only if indented content follows it.
        const following = lines[at + 1]
        if (following !== undefined && leadingSpaces(following) >= contentColumn) {
          body.push('')
          at += 1
          continue
        }
        break
      }
      if (leadingSpaces(candidate) >= contentColumn) {
        body.push(candidate.slice(contentColumn))
        at += 1
        continue
      }
      // A lazy continuation: a non-blank, unindented line that is not a new
      // item of any kind joins the paragraph it follows.
      if (!LIST_ITEM.test(candidate) && body.length > 0 && body[body.length - 1] !== '') {
        body.push(candidate.trimStart())
        at += 1
        continue
      }
      break
    }

    items.push(parseBlocks(body, options))

    // Blank lines between items belong to the list and do not end it.
    while (at < lines.length && BLANK.test(lines[at] as string)) {
      const following = lines[at + 1]
      if (following === undefined || !LIST_ITEM.test(following)) break
      at += 1
    }
  }

  return { list: { kind: 'list', ordered, start: startNumber, items }, next: at }
}

function leadingSpaces(line: string): number {
  let count = 0
  while (line[count] === ' ') count += 1
  return count
}

/* -------------------------------------------------------------------------- */
/* Inlines                                                                     */
/* -------------------------------------------------------------------------- */

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

const BARE_URL = /^https?:\/\/[^\s<>()]+(?:\([^\s<>()]*\)[^\s<>()]*)*/

/**
 * A link target as a browser reads its scheme: every control character
 * removed, then the ends trimmed. The rich-text document's links are checked
 * on the same text (`../rich-text/href.ts`).
 *
 * Control characters are removed one at a time, because a browser still reads
 * `javascript:` with a tab inside it as `javascript:`. The trim comes after the
 * removal, because a browser also drops a leading space that a control
 * character hid from the trim: `\u0001 javascript:` is `javascript:` to it. A
 * filter is used instead of a regex over the control range, because lint
 * rejects that regex.
 */
export function cleanHref(raw: string): string {
  return Array.from(raw)
    .filter((character) => {
      const code = character.charCodeAt(0)
      return code > 0x1f && code !== 0x7f
    })
    .join('')
    .trim()
}

/** Returns the target if a link may point at it, or `null`. A rejected link renders as text. */
export function safeHref(raw: string): string | null {
  const href = cleanHref(raw)
  if (href === '') return null
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(href)
  if (scheme === null) return href
  const name = (scheme[1] as string).toLowerCase()
  return name === 'http' || name === 'https' || name === 'mailto' ? href : null
}

export function parseInlines(text: string, options: MarkdownParseOptions = {}): MarkdownInline[] {
  const citations = options.citations ?? 0
  const nodes: MarkdownInline[] = []
  let buffer = ''

  const flush = () => {
    if (buffer === '') return
    nodes.push({ kind: 'text', text: buffer })
    buffer = ''
  }

  let at = 0
  while (at < text.length) {
    const character = text[at] as string

    // Escapes: the next character is literal, whatever it is.
    if (character === '\\' && at + 1 < text.length) {
      const next = text[at + 1] as string
      if (next === '\n') {
        flush()
        nodes.push({ kind: 'break' })
        at += 2
        continue
      }
      if (/[\\`*_{}[\]()#+\-.!~<>|]/.test(next)) {
        buffer += next
        at += 2
        continue
      }
    }

    // A line break inside a paragraph: hard after two spaces, soft otherwise.
    if (character === '\n') {
      if (buffer.endsWith('  ')) {
        buffer = buffer.replace(/ +$/, '')
        flush()
        nodes.push({ kind: 'break' })
      } else {
        buffer += ' '
      }
      at += 1
      continue
    }

    if (character === '`') {
      let run = 0
      while (text[at + run] === '`') run += 1
      const opener = '`'.repeat(run)
      const close = text.indexOf(opener, at + run)
      if (close !== -1 && text[close + run] !== '`') {
        flush()
        nodes.push({
          kind: 'code',
          text: text
            .slice(at + run, close)
            .replace(/\n/g, ' ')
            .trim(),
        })
        at = close + run
        continue
      }
      buffer += opener
      at += run
      continue
    }

    if (character === '!' && text[at + 1] === '[') {
      const image = readBracketed(text, at + 1)
      if (image) {
        const src = safeHref(image.target)
        flush()
        if (src !== null) nodes.push({ kind: 'image', alt: image.label, src })
        else buffer += text.slice(at, image.end)
        at = image.end
        continue
      }
    }

    if (character === '[') {
      const cite = /^\[(\d{1,3})\]/.exec(text.slice(at))
      if (cite && text[at + (cite[0] as string).length] !== '(') {
        const index = Number.parseInt(cite[1] as string, 10)
        if (index >= 1 && index <= citations) {
          flush()
          nodes.push({ kind: 'citation', index })
          at += (cite[0] as string).length
          continue
        }
      }
      const link = readBracketed(text, at)
      if (link) {
        const href = safeHref(link.target)
        flush()
        if (href !== null) {
          nodes.push({ kind: 'link', href, children: parseInlines(link.label, options) })
        } else {
          nodes.push(...parseInlines(link.label, options))
        }
        at = link.end
        continue
      }
    }

    if (character === '<') {
      const auto = /^<(https?:\/\/[^\s<>]+|mailto:[^\s<>]+)>/.exec(text.slice(at))
      if (auto) {
        const href = safeHref(auto[1] as string)
        flush()
        if (href !== null)
          nodes.push({ kind: 'link', href, children: [{ kind: 'text', text: auto[1] as string }] })
        else buffer += auto[1]
        at += (auto[0] as string).length
        continue
      }
    }

    if (character === '&') {
      const entity = /^&(#\d{1,6}|#x[0-9a-f]{1,5}|[a-z]+);/i.exec(text.slice(at))
      if (entity) {
        const name = entity[1] as string
        const decoded = name.startsWith('#x')
          ? String.fromCodePoint(Number.parseInt(name.slice(2), 16))
          : name.startsWith('#')
            ? String.fromCodePoint(Number.parseInt(name.slice(1), 10))
            : ENTITIES[name.toLowerCase()]
        if (decoded !== undefined) {
          buffer += decoded
          at += (entity[0] as string).length
          continue
        }
      }
    }

    if (character === 'h' && (at === 0 || /[\s(]/.test(text[at - 1] as string))) {
      const url = BARE_URL.exec(text.slice(at))
      if (url) {
        let raw = url[0] as string
        // Trailing prose punctuation belongs to the sentence, not the address.
        const trailing = /[.,;:!?'"]+$/.exec(raw)
        if (trailing) raw = raw.slice(0, -(trailing[0] as string).length)
        const href = safeHref(raw)
        if (href !== null) {
          flush()
          nodes.push({ kind: 'link', href, children: [{ kind: 'text', text: raw }] })
          at += raw.length
          continue
        }
      }
    }

    const emphasis = readEmphasis(text, at)
    if (emphasis) {
      flush()
      nodes.push({
        kind: emphasis.kind,
        children: parseInlines(text.slice(at + emphasis.marker.length, emphasis.close), options),
      })
      at = emphasis.close + emphasis.marker.length
      continue
    }

    buffer += character
    at += 1
  }

  flush()
  return mergeText(nodes)
}

/**
 * `[label](target "title")`, with balanced brackets so a nested image or a
 * bracketed word inside the label does not end it early. Returns `null` when
 * the construct is unfinished. That is common while streaming, and the
 * characters render as text until the closing paren arrives.
 */
function readBracketed(
  text: string,
  open: number,
): { label: string; target: string; end: number } | null {
  let depth = 0
  let close = -1
  for (let index = open; index < text.length; index += 1) {
    const character = text[index]
    if (character === '\\') {
      index += 1
      continue
    }
    if (character === '[') depth += 1
    else if (character === ']') {
      depth -= 1
      if (depth === 0) {
        close = index
        break
      }
    }
  }
  if (close === -1 || text[close + 1] !== '(') return null

  let parenDepth = 0
  for (let index = close + 1; index < text.length; index += 1) {
    const character = text[index]
    if (character === '\\') {
      index += 1
      continue
    }
    if (character === '(') parenDepth += 1
    else if (character === ')') {
      parenDepth -= 1
      if (parenDepth === 0) {
        const inside = text.slice(close + 2, index).trim()
        // An optional quoted title after the target is parsed and dropped. The
        // vocabulary has no tooltip for it, and text that only hover can
        // reveal does not count as content.
        const target = inside.replace(/\s+("[^"]*"|'[^']*')$/, '').trim()
        return { label: text.slice(open + 1, close), target, end: index + 1 }
      }
    }
  }
  return null
}

const EMPHASIS_MARKERS: { marker: string; kind: 'strong' | 'em' | 'strike' }[] = [
  { marker: '**', kind: 'strong' },
  { marker: '__', kind: 'strong' },
  { marker: '~~', kind: 'strike' },
  { marker: '*', kind: 'em' },
  { marker: '_', kind: 'em' },
]

/**
 * The emphasis a delimiter run opens, if it closes anywhere after it.
 *
 * It uses the usual flanking rule. An opener is not followed by whitespace, a
 * closer is not preceded by it, and the underscore forms cannot open or close
 * inside a word, so `snake_case_name` is three words and not emphasis. An
 * unclosed run returns `null` and renders as text, which is the streaming case.
 */
function readEmphasis(
  text: string,
  at: number,
): { marker: string; kind: 'strong' | 'em' | 'strike'; close: number } | null {
  for (const { marker, kind } of EMPHASIS_MARKERS) {
    if (!text.startsWith(marker, at)) continue
    const after = text[at + marker.length]
    if (after === undefined || /\s/.test(after) || after === marker[0]) continue
    if (marker[0] === '_' && at > 0 && /\w/.test(text[at - 1] as string)) continue

    let search = at + marker.length
    while (search < text.length) {
      const close = text.indexOf(marker, search)
      if (close === -1) break
      const before = text[close - 1] as string
      const following = text[close + marker.length]
      const flanks = !/\s/.test(before)
      const wordBound = marker[0] !== '_' || following === undefined || !/\w/.test(following)
      // The same character continuing the run makes a longer delimiter, not
      // this one's close. `***` is matched from its longest opener down.
      if (flanks && wordBound && following !== marker[0]) return { marker, kind, close }
      search = close + marker.length
    }
  }
  return null
}

function mergeText(nodes: MarkdownInline[]): MarkdownInline[] {
  const merged: MarkdownInline[] = []
  for (const node of nodes) {
    const last = merged[merged.length - 1]
    if (node.kind === 'text' && last?.kind === 'text') last.text += node.text
    else merged.push(node)
  }
  return merged
}

/** The plain text of an inline run, for an accessible name or a caption. */
export function inlineText(nodes: MarkdownInline[]): string {
  return nodes
    .map((node) => {
      switch (node.kind) {
        case 'text':
        case 'code':
          return node.text
        case 'image':
          return node.alt
        case 'break':
          return ' '
        case 'citation':
          return `[${node.index}]`
        default:
          return inlineText(node.children)
      }
    })
    .join('')
}

/* -------------------------------------------------------------------------- */
/* Rendering decisions                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The shallowest heading depth in a reply, which renders as level 2;
 * `Infinity` when the reply has no heading.
 */
export function markdownShallowestHeading(blocks: readonly MarkdownBlock[]): number {
  let shallowest = Number.POSITIVE_INFINITY
  for (const block of blocks) {
    if (block.kind === 'heading') shallowest = Math.min(shallowest, block.depth)
    else if (block.kind === 'quote')
      shallowest = Math.min(shallowest, markdownShallowestHeading(block.children))
    else if (block.kind === 'list') {
      for (const item of block.items)
        shallowest = Math.min(shallowest, markdownShallowestHeading(item))
    }
  }
  return shallowest
}

/**
 * The level a heading renders at. Levels are relative: the shallowest heading
 * in the reply is level 2, and deeper ones step down from it to a minimum of
 * 4. Models use `##` as the top heading more often than `#`, and mapping
 * depths directly would put that heading at level 3 under the page's h1 and
 * skip a level in the outline. A reply is never the page, so no heading is
 * level 1.
 */
export function markdownHeadingLevel(depth: number, shallowest: number): 2 | 3 | 4 {
  const level = 2 + depth - shallowest
  return level >= 4 ? 4 : level === 3 ? 3 : 2
}

/**
 * Whether a streaming reply's caret already sits inside a paragraph, in its
 * last block: then it is drawn there, and not again after the blocks.
 */
export function markdownEndsInProse(blocks: readonly MarkdownBlock[]): boolean {
  const last = blocks[blocks.length - 1]
  if (last === undefined) return false
  if (last.kind === 'paragraph') return true
  if (last.kind === 'quote') return markdownEndsInProse(last.children)
  if (last.kind === 'list') return markdownEndsInProse(last.items[last.items.length - 1] ?? [])
  return false
}
