import type { ReactNode } from 'react'

import { Inline } from '../layout/Inline'
import { memberAttr } from '@polymorph/react'
import styles from '@polymorph/recipes/structure/hero.module.css'

/**
 * Large title block that opens a page (`design/components/hero.md`).
 *
 * The display tier's page-scale consumer of `display.lg`, the top of the
 * derived type scale, for presentation rather than workflow. The docs site's
 * home page is its reference consumer.
 *
 * **The h1 rule.** Hero renders the page's `<h1>`, so a page composes exactly
 * one of PageHeader (working screens) or Hero (opening pages). Both on one page
 * is the same violation as two PageHeaders, checked across the corpus in
 * `packages/rules/src/repo-laws.test.ts`.
 *
 * No `size`, `tone` or background slot. A hero with less emphasis is a
 * PageHeader, and background art belongs to the page beneath, as in AuthPage.
 */

export type HeroAlign = 'start' | 'center'

export interface HeroProps {
  title: string
  lede?: string
  /** Buttons; the page's primary action goes here when a Hero opens the page. */
  actions?: ReactNode
  align?: HeroAlign
}

export function Hero({ title, lede, actions, align = 'start' }: HeroProps) {
  return (
    <section className={styles.hero} data-align={align} {...memberAttr('Hero')}>
      <h1 className={styles.title}>{title}</h1>

      {lede === undefined ? null : <p className={styles.lede}>{lede}</p>}

      {actions === undefined ? null : (
        // Centred through Inline's `justify` prop, not a descendant selector in
        // this stylesheet, so the decision stays in one place.
        <Inline gap={3} wrap justify={align === 'center' ? 'center' : 'start'}>
          {actions}
        </Inline>
      )}
    </section>
  )
}
