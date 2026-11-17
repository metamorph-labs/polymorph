/**
 * Highlight's runs (`design/components/highlight.md`): a text cut into the
 * parts that match and the parts that do not, as data. Every framework's
 * Highlight renders these runs, so what a query matches and how ranges are
 * read are decided and tested once.
 */

/** One stretch of the text: marked when it matches, plain when it does not. */
export interface HighlightRun {
  text: string
  marked: boolean
}

/** What to mark: literal terms, or the ranges a search engine returned. */
export interface HighlightMatch {
  /**
   * One term or several, each matched as written, never as a pattern, with
   * case folded by `locale`. Each term is trimmed, and an empty one marks
   * nothing.
   */
  query?: string | readonly string[]
  /**
   * `[start, end]` offsets into the text, end exclusive, counted as JavaScript
   * counts a string (UTF-16 code units). With `ranges`, `query` is not used.
   */
  ranges?: readonly (readonly [number, number])[]
  /** The locale that folds case: `tr` folds `I` to `ı`. Omitted, the runtime's. */
  locale?: string
}

const isHigh = (code: number) => code >= 0xd800 && code <= 0xdbff
const isLow = (code: number) => code >= 0xdc00 && code <= 0xdfff

/**
 * One code point's folded case in a locale: its upper case, lowered. The round
 * trip folds the forms lower case alone keeps apart, such as Greek's final
 * sigma `ς` and `σ`, or `ß` and `ss`. A locale the runtime cannot read folds as
 * the root locale does.
 */
function fold(point: string, locale: string | undefined): string {
  try {
    return point.toLocaleUpperCase(locale).toLocaleLowerCase(locale)
  } catch {
    return point.toUpperCase().toLowerCase()
  }
}

/**
 * The text folded one code point at a time, with each folded code unit's
 * source: the start and the end of the code point it came from. Folding can
 * change a string's length (`ß` folds to `ss`), so a match in the folded text
 * is read back through these, and a mark covers whole characters of the text.
 */
function folded(
  text: string,
  locale: string | undefined,
): { text: string; start: number[]; end: number[] } {
  let out = ''
  const start: number[] = []
  const end: number[] = []
  for (let index = 0; index < text.length;) {
    const width = isHigh(text.charCodeAt(index)) && isLow(text.charCodeAt(index + 1)) ? 2 : 1
    const point = fold(text.slice(index, index + width), locale)
    for (let unit = 0; unit < point.length; unit += 1) {
      start.push(index)
      end.push(index + width)
    }
    out += point
    index += width
  }
  return { text: out, start, end }
}

/** Where each term occurs in the text, as ranges of the text. */
function rangesOfQuery(
  text: string,
  query: string | readonly string[],
  locale: string | undefined,
): [number, number][] {
  // Each term is folded as the text is, one code point at a time, so both sides
  // fold the same way whatever their neighbours.
  const terms = (typeof query === 'string' ? [query] : query)
    .map((term) => folded(term.trim(), locale).text)
    .filter((term) => term !== '')
  if (terms.length === 0) return []
  const haystack = folded(text, locale)
  const found: [number, number][] = []
  for (const term of terms) {
    let at = haystack.text.indexOf(term)
    while (at !== -1) {
      found.push([haystack.start[at] as number, haystack.end[at + term.length - 1] as number])
      at = haystack.text.indexOf(term, at + term.length)
    }
  }
  return found
}

/**
 * The ranges an engine returned, made safe to draw: ends that are not whole
 * read as the whole number below them, a range is cut at the text's ends, an
 * empty or reversed range is dropped, and an end inside a surrogate pair moves
 * out to the whole code point, so a mark never splits a character in two.
 */
function rangesGiven(
  text: string,
  ranges: readonly (readonly [number, number])[],
): [number, number][] {
  const found: [number, number][] = []
  for (const range of ranges) {
    const [from, to] = range
    if (typeof from !== 'number' || typeof to !== 'number') continue
    if (Number.isNaN(from) || Number.isNaN(to)) continue
    let start = Math.max(0, Math.floor(from))
    let end = Math.min(text.length, Math.floor(to))
    if (end <= start) continue
    if (start > 0 && isLow(text.charCodeAt(start)) && isHigh(text.charCodeAt(start - 1))) start -= 1
    if (end < text.length && isLow(text.charCodeAt(end)) && isHigh(text.charCodeAt(end - 1)))
      end += 1
    found.push([start, end])
  }
  return found
}

/** Sorted, with ranges that overlap or touch joined into one. */
function merged(ranges: [number, number][]): [number, number][] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const out: [number, number][] = []
  for (const range of sorted) {
    const last = out[out.length - 1]
    if (last !== undefined && range[0] <= last[1]) last[1] = Math.max(last[1], range[1])
    else out.push([range[0], range[1]])
  }
  return out
}

/**
 * The text as runs, in reading order, marked where it matches. With `ranges`,
 * the marks are the ranges; without them, every occurrence of each term of
 * `query`. Marks that overlap or touch are one mark. An empty text has no runs,
 * and a text with no match is one plain run.
 */
export function highlightRuns(text: string, match: HighlightMatch = {}): HighlightRun[] {
  if (text === '') return []
  const marks = merged(
    match.ranges !== undefined
      ? rangesGiven(text, match.ranges)
      : match.query !== undefined
        ? rangesOfQuery(text, match.query, match.locale)
        : [],
  )
  const runs: HighlightRun[] = []
  let at = 0
  for (const [start, end] of marks) {
    if (start > at) runs.push({ text: text.slice(at, start), marked: false })
    runs.push({ text: text.slice(start, end), marked: true })
    at = end
  }
  if (at < text.length) runs.push({ text: text.slice(at), marked: false })
  return runs
}
