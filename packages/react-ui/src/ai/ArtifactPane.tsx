'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

import {
  focusAfterRemoval,
  Icon,
  type IconRole,
  memberAttr,
  useAgentMember,
} from '@polymorph/react'

import { Button } from '../controls/Button'
import { SegmentedControl } from '../controls/SegmentedControl'
import { Spinner } from '../structure/Spinner'
import styles from '@polymorph/recipes/ai/artifact-pane.module.css'

/**
 * A side pane that shows one artifact a turn produced
 * (`design/components/artifact-pane.md`). The artifact is too large for the
 * thread: a file, a page, a table or a preview. The pane shows its name, its
 * kind, the app's controls, and a switch between the views the app offers.
 *
 * ArtifactPane is a Card for one artifact: a bounded surface that fills its
 * box, with a header that thread turns do not have. It is not a Dialog. Nothing
 * is modal, because the thread beside it must stay usable. It is not Tabs. The
 * view switch is a SegmentedControl, because the views are readings of one
 * thing (code, preview) and not peer sections. A pane with one view has no
 * switch. The content is the app's (a CodeBlock, a Markdown, a Table, an
 * image). The pane draws the frame and scrolls the body.
 *
 * The body is the pane's only scroll region. It is allowed for the same reason
 * as ChatThread's: an artifact can outgrow any box, and the page cannot scroll
 * it without scrolling the thread out of view. The body is a tab stop only
 * while it overflows (CodeBlock's rule).
 */

export type ArtifactKind = 'code' | 'document' | 'data' | 'preview'

export interface ArtifactView {
  id: string
  label: string
  content: ReactNode
}

export interface ArtifactPaneProps {
  /** The artifact's name, used as the pane's heading and accessible name. */
  title: string
  /** The artifact's kind, which picks the mark (the tier's `artifact` glyph when absent). */
  kind?: ArtifactKind
  /** One preformatted line under the title, such as "TypeScript · 142 lines". */
  meta?: string
  /** Whether the artifact is still being written, which shows a spinner and sets `aria-busy`. */
  streaming?: boolean
  /** The header's controls (copy, download, open), as `ghost/neutral/sm` Buttons. */
  actions?: ReactNode
  /** Shows the close button when supplied, and the app decides whether the pane stays mounted. */
  onClose?: () => void
  /** The close button's accessible name (generic default `Close`), which localized hosts replace. */
  closeLabel?: string
  /**
   * The artifact's views (code, preview). Two or more draw a switch, and a single view is drawn
   * with no switch. When `views` is absent or empty, `children` is the body.
   */
  views?: ArtifactView[]
  /** The switch's accessible name (generic default `View`). */
  viewsLabel?: string
  view?: string
  defaultView?: string
  onViewChange?: (id: string) => void
  /** The body when `views` is absent or empty. A non-empty `views` replaces it. */
  children?: ReactNode
}

/** The mark for each kind: the icon role for that kind of object. */
const KIND_ICON: Record<ArtifactKind, IconRole> = {
  code: 'terminal',
  document: 'document',
  data: 'table',
  preview: 'browser',
}

export function ArtifactPane({
  title,
  kind,
  meta,
  streaming = false,
  actions,
  onClose,
  closeLabel = 'Close',
  views,
  viewsLabel = 'View',
  view,
  defaultView,
  onViewChange,
  children,
}: ArtifactPaneProps) {
  const titleId = useId()
  const body = useRef<HTMLDivElement>(null)
  const [overflowing, setOverflowing] = useState(false)

  // A mirror of the current view, not its owner. SegmentedControl owns the
  // switch, but the body must know which view to draw even when the pane is
  // uncontrolled. This is Tabs' pattern.
  const [mirror, setMirror] = useState(defaultView ?? views?.[0]?.id)
  const current = view ?? mirror
  const switching = views !== undefined && views.length > 1
  const shown =
    views === undefined ? undefined : (views.find((entry) => entry.id === current) ?? views[0])

  function choose(next: string) {
    setMirror(next)
    onViewChange?.(next)
  }

  // An agent reads the reading shown and the readings offered, chooses one through the pane's own
  // view and closes the pane as its close control does. The switch and the close Button are the
  // pane's own parts, so they are withheld, each by its wrapper: the header also holds the app's
  // `actions`, which stay an agent's.
  const paneRef = useRef<HTMLElement>(null)
  const switchRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLDivElement>(null)
  // Focus in the pane as the application removes it, the close control's after
  // `onClose`, moves to the focusable element nearest where it was, not to the
  // body. A layout effect's cleanup runs while the pane is still in the
  // document.
  useLayoutEffect(() => focusAfterRemoval(paneRef.current), [])
  useAgentMember({
    member: 'ArtifactPane',
    element: () => paneRef.current,
    state: () => ({
      view: shown?.id ?? null,
      views: (views ?? []).map((entry) => ({ id: entry.id, label: entry.label })),
      streaming,
    }),
    actions: {
      choose: {
        argument: 'id',
        run: (id) => {
          if (id !== shown?.id) choose(id)
        },
      },
      close: () => {
        if (onClose === undefined) throw new Error('The pane has no close control.')
        onClose()
      },
    },
    withholds: () => [switchRef.current, closeRef.current],
  })

  /**
   * CodeBlock's rule: the body is a tab stop only while it can scroll. It is
   * re-measured when the body or its content resizes, because a streaming
   * artifact grows inside a box of fixed size.
   */
  useEffect(() => {
    const node = body.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const measure = () => setOverflowing(node.scrollHeight > node.clientHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    if (node.firstElementChild) observer.observe(node.firstElementChild)
    return () => observer.disconnect()
  }, [children, shown])

  return (
    <section
      ref={paneRef}
      className={styles.pane}
      aria-labelledby={titleId}
      data-kind={kind}
      data-state={streaming ? 'streaming' : undefined}
      aria-busy={streaming ? true : undefined}
      {...memberAttr('ArtifactPane')}
    >
      <header className={styles.header}>
        <span className={styles.mark}>
          {streaming ? (
            // The spinner's accessible name is the pane's status text.
            <Spinner size="sm" label={`${title}: still being written`} />
          ) : (
            <Icon name={kind === undefined ? 'artifact' : KIND_ICON[kind]} size="sm" />
          )}
        </span>

        <div className={styles.heading}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {meta === undefined ? null : <p className={styles.meta}>{meta}</p>}
        </div>

        {switching ? (
          <div ref={switchRef} className={styles.views}>
            <SegmentedControl
              size="sm"
              label={viewsLabel}
              options={views.map((entry) => ({ value: entry.id, label: entry.label }))}
              value={current}
              onChange={choose}
            />
          </div>
        ) : null}

        {actions === undefined ? null : <div className={styles.actions}>{actions}</div>}

        {onClose === undefined ? null : (
          <div ref={closeRef} className={styles.close}>
            <Button
              variant="ghost"
              tone="neutral"
              size="sm"
              iconOnly
              icon="close"
              label={closeLabel}
              onClick={onClose}
            />
          </div>
        )}
      </header>

      {/* The only scroll region. Once it overflows it becomes a tab stop
          named by the pane's title (CodeBlock's rule). Its role is `group`,
          not a second region, because the pane is already the landmark and
          two landmarks with one name cannot be told apart. */}
      <div
        ref={body}
        className={styles.body}
        data-view={shown?.id}
        tabIndex={overflowing ? 0 : undefined}
        role={overflowing ? 'group' : undefined}
        aria-labelledby={overflowing ? titleId : undefined}
      >
        <div className={styles.content}>{shown === undefined ? children : shown.content}</div>
      </div>
    </section>
  )
}
