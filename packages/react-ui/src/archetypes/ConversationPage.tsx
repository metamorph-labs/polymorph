'use client'

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

import { memberAttr } from '@polymorph/react'

import { Button } from '../controls/Button'
import { SplitPane } from '../layout/SplitPane'
import { Drawer } from '../overlays/Drawer'
import { PageHeader } from '../structure/PageHeader'
import styles from '@polymorph/recipes/archetypes/conversation-page.module.css'

/**
 * The conversation screen, with a thread above a composer
 * (`design/archetypes/conversation-page.md`). It fills the shell's content
 * region. The artifact pane sits beside the thread at wide widths and in a
 * Drawer at narrow ones.
 *
 * The archetype exists because the thread's scroll region needs a box, and
 * application code cannot draw one. A ChatThread is `block-size: 100%` of its
 * container, and a composer pinned under the page scroller scrolls away. Only
 * a page that owns the geometry can lawfully give the thread the space above
 * the composer while the composer stays in place. That is the one decision
 * this file makes. The header comes from PageHeader (as does the page's
 * `<h1>`), the split from SplitPane, and the drawer from Drawer.
 *
 * The page's own width decides where the aside goes, not the window's
 * (container-first, `docs/layout.md`). Above `48rem` it sits beside the
 * thread, where two columns can each hold a reading measure. Below it, it sits
 * in a Drawer opened from a header control, because two columns would be too
 * narrow. The content is never dropped. A narrow page changes the
 * arrangement, not the artifact.
 *
 * It owns the `--pm-page-*` scope on its root, like every page archetype.
 */

/**
 * `aside` and `asideLabel` are paired at the type level (Card's `href`/`label`
 * precedent). An aside without a name cannot be expressed, because the split's
 * separator and the drawer's title both need one and neither has a lawful
 * default.
 */
export type ConversationPageProps = {
  title: string
  description?: string
  /** Vocabulary controls with at most one primary, joined by the aside's toggle below the breakpoint. */
  actions?: ReactNode
  /** A ChatThread. */
  thread: ReactNode
  /** A PromptInput. */
  composer: ReactNode
} & (
  | { aside?: undefined; asideLabel?: undefined }
  | {
      /** An ArtifactPane, beside the thread at wide widths and in a Drawer below the breakpoint. */
      aside: ReactNode
      /** The aside's name, used for the separator, the drawer's title and the toggle's label. */
      asideLabel: string
    }
)

/**
 * The page's breakpoint in rem. It is a rem literal because a breakpoint is
 * geometry, not theme (`docs/layout.md`). Below it the page is one column. The
 * page measures itself, because React needs to know which arrangement to
 * render, and a container query cannot report that.
 */
const ONE_COLUMN_BELOW_REM = 48

/** The minimum widths of the two panes in px, set by their content (`split-pane.md`). */
const THREAD_MIN_PX = 320
const ASIDE_MIN_PX = 280

export function ConversationPage({
  title,
  description,
  actions,
  thread,
  composer,
  aside,
  asideLabel,
}: ConversationPageProps) {
  const root = useRef<HTMLDivElement>(null)
  const [narrow, setNarrow] = useState(false)
  const [asideOpen, setAsideOpen] = useState(false)

  // A layout effect, so the first paint already has the right arrangement.
  // Measuring after paint would show the split for one frame on a phone and
  // then switch. The reader would see the jump, and the phone screenshot lane
  // would capture it.
  useLayoutEffect(() => {
    const node = root.current
    if (node === null || typeof ResizeObserver === 'undefined') return
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    const measure = () => {
      const next = node.getBoundingClientRect().width < ONE_COLUMN_BELOW_REM * rem
      setNarrow(next)
      // The drawer's open state belongs to the narrow arrangement. Widening
      // unmounts the drawer without closing it, and narrowing again must not
      // show it open when nobody pressed anything.
      if (!next) setAsideOpen(false)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const conversation = (
    <div className={styles.conversation}>
      <div className={styles.thread}>{thread}</div>
      <div className={styles.composer}>{composer}</div>
    </div>
  )

  const withAside = aside !== undefined

  return (
    <div
      ref={root}
      className={styles.page}
      data-aside={withAside ? (narrow ? 'drawer' : 'split') : undefined}
      {...memberAttr('ConversationPage')}
    >
      <PageHeader
        title={title}
        description={description}
        actions={
          withAside && narrow ? (
            <>
              {actions}
              {/* The aside's toggle below the breakpoint. It is outline, never
                  solid, because the page's solid button is the app's own action. */}
              <Button
                variant="outline"
                tone="neutral"
                size="sm"
                icon="artifact"
                label={asideLabel}
                onClick={() => setAsideOpen(true)}
              />
            </>
          ) : (
            actions
          )
        }
      />

      <div className={styles.body}>
        {withAside && !narrow ? (
          <SplitPane
            label={asideLabel}
            start={conversation}
            end={<div className={styles.aside}>{aside}</div>}
            defaultRatio={0.58}
            startMin={THREAD_MIN_PX}
            endMin={ASIDE_MIN_PX}
          />
        ) : (
          conversation
        )}
      </div>

      {withAside && narrow ? (
        <Drawer
          side="end"
          size="lg"
          title={asideLabel}
          open={asideOpen}
          onOpenChange={setAsideOpen}
        >
          <div className={styles.drawerAside}>{aside}</div>
        </Drawer>
      ) : null}
    </div>
  )
}
