'use client'

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

import {
  MASTER_DETAIL_PART,
  masterDetailFocus,
  masterDetailHolds,
  memberAttr,
} from '@polymorph/react'

import { Button } from '../controls/Button'
import { SplitPane } from '../layout/SplitPane'
import { EmptyState, type EmptyStateProps } from '../structure/EmptyState'
import { PageHeader } from '../structure/PageHeader'
import styles from '@polymorph/recipes/archetypes/master-detail-page.module.css'

/**
 * A list beside the selected item's detail
 * (`design/archetypes/master-detail-page.md`). The list holds items of one
 * kind. The page fills the shell's content region, as ConversationPage does.
 *
 * The archetype exists because a detail drawn under a long list is off screen
 * when its row is picked, and application code cannot draw two panes that
 * scroll on their own. It is not DetailPage, which is one entity reached from
 * another page, and not ConversationPage, whose aside is a product of the
 * thread. The header comes from PageHeader (as does the page's `<h1>`), the
 * split from SplitPane, and the detail pane's empty form from EmptyState. The
 * list and the detail are the application's.
 *
 * The page's own width decides the arrangement, not the window's
 * (container-first, `docs/layout.md`). At or above `48rem` the list and the
 * detail sit side by side. Below it the page draws one pane: the list while
 * nothing is selected, and the detail under the way back while something is.
 * The list stays in the document while the detail is drawn alone, hidden, so
 * its scroll position and any state it keeps itself survive the way back.
 *
 * Focus moves only when the element that held it is no longer drawn
 * (`masterDetailFocus`, the engine's rule every framework's member shares).
 */

export interface MasterDetailPageProps {
  title: string
  description?: string
  /** Vocabulary controls with at most one primary. */
  actions?: ReactNode
  /**
   * The list pane: a List (or a Table or a Tree) with its FilterBar and its
   * pagination. The application marks the selected item `current`.
   */
  list: ReactNode
  /** Names the list pane's region and the split's separator. */
  listLabel: string
  /** The selected item's detail. Absent means that nothing is selected. */
  detail?: ReactNode
  /** The detail pane while nothing is selected, in the split. Required so the page always decides it. */
  emptyState: EmptyStateProps
  /** The way back to the list while the detail is drawn alone. */
  backLabel: string
  /** Called by the way back. The application clears its selection here. */
  onBack: () => void
}

/**
 * The page's breakpoint in rem. It is a rem literal because a breakpoint is
 * geometry, not theme (`docs/layout.md`). Below it the page draws one pane.
 * The page measures itself, because React needs to know which arrangement to
 * render, and a container query cannot report that.
 */
const ONE_PANE_BELOW_REM = 48

/** The list's share of the split, as SplitPane's `defaultRatio`. */
const LIST_RATIO = 0.32

/**
 * The minimum widths of the two panes in px, set by their content
 * (`split-pane.md`): a list row keeps its title beside a mark and a time at
 * 240px, and a detail keeps its heading beside its actions at 420px. At the
 * breakpoint the page's content box holds both.
 */
const LIST_MIN_PX = 240
const DETAIL_MIN_PX = 420

const part = (name: 'list' | 'detail' | 'back') => ({ [MASTER_DETAIL_PART]: name })

export function MasterDetailPage({
  title,
  description,
  actions,
  list,
  listLabel,
  detail,
  emptyState,
  backLabel,
  onBack,
}: MasterDetailPageProps) {
  const root = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const [narrow, setNarrow] = useState(false)
  const selected = detail !== undefined && detail !== null && typeof detail !== 'boolean'

  // A layout effect, so the first paint already has the right arrangement.
  // Measuring after paint would draw the split for one frame on a phone and
  // then switch.
  useLayoutEffect(() => {
    const node = root.current
    if (node === null || typeof ResizeObserver === 'undefined') return
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    const measure = () => setNarrow(node.getBoundingClientRect().width < ONE_PANE_BELOW_REM * rem)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  // Whether the last element to take focus was inside the body. It is read
  // after a change, when the element that held focus may already be gone.
  const held = useRef(false)
  useEffect(() => {
    const record = (event: FocusEvent) => {
      held.current = masterDetailHolds(body.current, event)
    }
    document.addEventListener('focusin', record)
    return () => document.removeEventListener('focusin', record)
  }, [])

  // What the page draws. A change after mount may leave focus on an element
  // that is gone, and the rule moves it. A page that mounts with a detail
  // moves nothing, and neither does a second run of the same arrangement.
  const drawn = narrow ? (selected ? 'detail' : 'list') : selected ? 'split-detail' : 'split'
  const before = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (before.current !== null && before.current !== drawn) {
      masterDetailFocus(body.current, held.current)
    }
    before.current = drawn
  }, [drawn])

  const listPane = (hidden: boolean) => (
    <section
      className={styles.list}
      aria-label={listLabel}
      // Focusable from a script, the last place focus returns to.
      tabIndex={-1}
      hidden={hidden}
      {...part('list')}
    >
      {list}
    </section>
  )

  return (
    <div
      ref={root}
      className={styles.page}
      data-layout={narrow ? 'single' : 'split'}
      data-pane={narrow ? (selected ? 'detail' : 'list') : undefined}
      {...memberAttr('MasterDetailPage')}
    >
      <PageHeader title={title} description={description} actions={actions} />

      <div ref={body} className={styles.body}>
        {narrow ? (
          <>
            {listPane(selected)}
            {selected ? (
              <div className={styles.detail} {...part('detail')}>
                <div className={styles.back} {...part('back')}>
                  <Button
                    variant="ghost"
                    tone="neutral"
                    size="sm"
                    icon="back"
                    label={backLabel}
                    onClick={onBack}
                  />
                </div>
                <div className={styles.scroll}>{detail}</div>
              </div>
            ) : null}
          </>
        ) : (
          <SplitPane
            label={listLabel}
            start={listPane(false)}
            end={
              <div className={styles.detail} {...part('detail')}>
                {selected ? (
                  <div className={styles.scroll}>{detail}</div>
                ) : (
                  <div className={styles.empty}>
                    <EmptyState {...emptyState} />
                  </div>
                )}
              </div>
            }
            defaultRatio={LIST_RATIO}
            startMin={LIST_MIN_PX}
            endMin={DETAIL_MIN_PX}
          />
        )}
      </div>
    </div>
  )
}
