import { Icon, memberAttr } from '@polymorph/react'

import styles from '@polymorph/recipes/ai/source-list.module.css'
import type { CitationSource } from './sources'

/**
 * The numbered list of sources a reply cites
 * (`design/components/source-list.md`). It sits beneath an answer, and every
 * `[n]` in the answer points into it.
 *
 * SourceList uses Timeline's shape for pages instead of events. It is an
 * ordered list the app has already sequenced, rendered in the given order and
 * never sorted, with one row per source and a number shared with the Citation
 * marks. It is not a bibliography, because there is no citation style or
 * format to choose. The title, the host and the passage are the app's data.
 * It is not a list of Cards. A source is one line, and eight boxes under a
 * paragraph would outweigh the paragraph.
 *
 * An empty list renders nothing (Timeline's rule). A heading over an empty
 * list would announce sources that do not exist.
 *
 * No `'use client'` directive, because a list of links needs no browser code.
 */

export interface SourceListProps {
  /** The sources in the order the reply numbers them, rendered as given and never sorted. */
  sources: CitationSource[]
  /** The list's accessible name, such as "Sources" in the app's language. */
  label: string
}

export function SourceList({ sources, label }: SourceListProps) {
  if (sources.length === 0) return null

  return (
    <section className={styles.root} aria-label={label} {...memberAttr('SourceList')}>
      {/* The visible heading is decorative. `label` already names the region,
          and a named glyph would repeat it. */}
      <span className={styles.heading} aria-hidden="true">
        <Icon name="cite" size="sm" />
        {label}
      </span>

      <ol className={styles.list}>
        {sources.map((source, position) => (
          // Position is the key, because citations point at the number and a
          // source list is passed whole and never reordered in place.
          <li key={position} className={styles.item}>
            {/* Hidden from assistive technology, because an ordered list
                already announces its numbers and the visible digit would
                repeat it. */}
            <span className={styles.index} aria-hidden="true">
              {position + 1}
            </span>
            <span className={styles.body}>
              {/* A plain `<a>` instead of Link, because Link's external style
                  is `nowrap`. That suits a word in a sentence but not a
                  sentence-length title, which must wrap on a phone or it
                  widens the thread. Link's external behaviour is kept in full:
                  a new tab, the safe `rel`, and the glyph after the text. */}
              <a className={styles.title} href={source.href} target="_blank" rel="noreferrer">
                {source.title}
                <span className={styles.glyph}>
                  <Icon name="open-external" size="sm" />
                </span>
              </a>
              {source.domain === undefined ? null : (
                <span className={styles.domain}>{source.domain}</span>
              )}
              {source.snippet === undefined ? null : (
                <span className={styles.snippet}>{source.snippet}</span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
