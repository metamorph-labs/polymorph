import { memberAttr } from '@polymorph/react'

import { HoverCard } from '../overlays/HoverCard'
import styles from '@polymorph/recipes/ai/citation.module.css'
import type { CitationSource } from './sources'

/**
 * An inline numbered link to a source, with a hover preview
 * (`design/components/citation.md`). It is the `[1]` after a sentence,
 * pointing to the page that supports it.
 *
 * Citation is a smaller relative of Link. A Link is a word in the sentence. A
 * Citation is a mark after the sentence, numbered so it can be found in the
 * SourceList below the reply. It is not a footnote, because nothing jumps
 * within the page and the destination is the source itself. It is not a
 * Badge, because a badge is read-only, and a source the reader cannot open is
 * an assertion, not a citation.
 *
 * The preview is HoverCard's and follows its never-load-bearing law: the card
 * holds nothing the link's destination does not. The mark is a real `<a>` to
 * the source, so a touch reader without a preview loses only a quick look,
 * and a keyboard reader gets the card on focus.
 *
 * No `'use client'` directive, because this has no hook or handler of its
 * own. HoverCard has both.
 */

export interface CitationProps {
  /** The mark's one-based number in the reply's SourceList. */
  index: number
  /** The source the mark refers to, whose `href` is the link target. */
  source: CitationSource
}

export function Citation({ index, source }: CitationProps) {
  return (
    <HoverCard
      content={
        <span className={styles.preview}>
          <span className={styles.previewTitle}>{source.title}</span>
          {source.domain === undefined ? null : (
            <span className={styles.previewDomain}>{source.domain}</span>
          )}
          {source.snippet === undefined ? null : (
            <span className={styles.previewSnippet}>{source.snippet}</span>
          )}
        </span>
      }
    >
      {/* The visible text is the number. The accessible name is the number
          and the title together, so a list of citations is not a list of bare
          numbers. It opens in a new tab with the safe `rel`, as Link's
          `external` does, because a source is another site and the reply must
          still be open when the reader returns. */}
      <a
        className={styles.mark}
        href={source.href}
        target="_blank"
        rel="noreferrer"
        aria-label={`${index}. ${source.title}`}
        {...memberAttr('Citation')}
      >
        {index}
      </a>
    </HoverCard>
  )
}
