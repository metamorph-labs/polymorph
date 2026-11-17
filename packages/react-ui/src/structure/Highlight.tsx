import { highlightRuns, memberAttr } from '@polymorph/react'
import styles from '@polymorph/recipes/structure/highlight.module.css'

/**
 * The parts of a text that match, marked (`design/components/highlight.md`).
 *
 * A search result's title with the words the reader typed in it, or a row
 * whose text the search engine matched. It is phrasing content, so it sits
 * inside a Text, a title or a cell and takes the font and the size around it.
 *
 * It is not Diff, which marks what changed between two values, and not Text's
 * `strong`, which is emphasis the writer chose. A Highlight marks what the
 * reader's search found, and finds nothing itself: the app passes the query or
 * the ranges its search engine returned. The engine's `highlightRuns` cuts the
 * text into runs, so every framework's Highlight marks the same characters.
 */

export interface HighlightProps {
  /** The text, drawn whole. */
  text: string
  /**
   * One term or several, each marked wherever it occurs, as written and never
   * as a pattern, with case folded by `locale`. Each term is trimmed, and an
   * empty one marks nothing.
   */
  query?: string | string[]
  /**
   * `[start, end]` offsets into `text`, end exclusive, in JavaScript's string
   * offsets (UTF-16 code units), for an app whose search engine says where its
   * matches are. With `ranges`, `query` is not used. Ranges that overlap or
   * touch are one mark, and a range is cut at the text's end.
   */
  ranges?: [number, number][]
  /** The locale that folds case for `query`, the page's; omitted, the runtime's. */
  locale?: string
}

export function Highlight({ text, query, ranges, locale }: HighlightProps) {
  const runs = highlightRuns(text, { query, ranges, locale })
  if (runs.length === 0) return null
  return (
    <span className={styles.highlight} {...memberAttr('Highlight')}>
      {runs.map((run, index) =>
        run.marked ? (
          // `role="presentation"` keeps the mark from being announced at each match: the text
          // is read once, as it is, and the reader already knows what they searched for.
          <mark key={index} className={styles.mark} role="presentation">
            {run.text}
          </mark>
        ) : (
          run.text
        ),
      )}
    </span>
  )
}
