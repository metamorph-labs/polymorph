'use client'

import { useRef, type ReactNode } from 'react'

import { Button } from '../controls/Button'
import { Icon, type IconRole, memberAttr, useAgentMember } from '@polymorph/react'
import styles from '@polymorph/recipes/structure/banner.module.css'

/**
 * The notice that belongs to the application frame and stays until its cause
 * ends (`design/components/banner.md`).
 *
 * An outage, a trial running out, a member of staff inside a customer's
 * account: the same on every page, so it is drawn once, edge to edge, above
 * the page. An Alert is about one page's content, and a Toast reports an event
 * and leaves. From the spec:
 *
 *  - **One action at most.** It is the way out of the condition.
 *  - **Dismissible only where hiding it is safe.** The app passes `onDismiss`
 *    for a reminder, and never for a condition that is still true.
 *  - **No motion.** The frame does not animate.
 */

export type BannerTone = 'neutral' | 'info' | 'warning' | 'danger'

/** The tone→icon-role map. A neutral Banner states a fact and draws no glyph. */
const TONE_ICON = {
  info: 'info',
  warning: 'warning',
  danger: 'error',
} as const satisfies Record<Exclude<BannerTone, 'neutral'>, IconRole>

/**
 * Politeness by tone. Only danger interrupts: a warning Banner is on screen
 * for days, and an assertive announcement on every load teaches a reader to
 * ignore it.
 */
const TONE_ROLE = {
  neutral: 'status',
  info: 'status',
  warning: 'status',
  danger: 'alert',
} as const satisfies Record<BannerTone, 'status' | 'alert'>

export interface BannerProps {
  tone?: BannerTone
  /** The message, in a sentence or two. */
  children: ReactNode
  /** One `ghost` or `soft` `sm` Button, or one Link: the way out of the condition. */
  action?: ReactNode
  /** Renders the ✕. The app removes the Banner; it passes this only where hiding it is safe. */
  onDismiss?: () => void
  /** The ✕'s accessible name, default `Dismiss`; localized hosts pass their own. */
  dismissLabel?: string
}

export function Banner({
  tone = 'neutral',
  children,
  action,
  onDismiss,
  dismissLabel = 'Dismiss',
}: BannerProps) {
  // The spec's `agent` fence. The ✕ is the Banner's own part, so it is withheld and `dismiss`
  // stands in its place. The application's action is its own and stays an agent's.
  const root = useRef<HTMLDivElement>(null)
  const close = useRef<HTMLDivElement>(null)
  useAgentMember({
    member: 'Banner',
    element: () => root.current,
    state: () => ({ tone, dismissible: onDismiss !== undefined }),
    actions: {
      dismiss: () => {
        if (onDismiss === undefined) throw new Error('This banner has no dismiss control.')
        onDismiss()
      },
    },
    withholds: () => close.current,
  })

  return (
    <div
      ref={root}
      className={styles.banner}
      role={TONE_ROLE[tone]}
      data-tone={tone}
      {...memberAttr('Banner')}
    >
      {tone === 'neutral' ? null : (
        <span className={styles.glyph}>
          {/* Decorative. The role already announces the kind of message. */}
          <Icon name={TONE_ICON[tone]} />
        </span>
      )}

      {/* The message and the action wrap as a pair, so the glyph and the ✕ stay on the first line. */}
      <div className={styles.content}>
        <div className={styles.text}>{children}</div>
        {/* The document order is the focus order: the way out, then the ✕. */}
        {action === undefined ? null : <div className={styles.action}>{action}</div>}
      </div>

      {onDismiss === undefined ? null : (
        <div ref={close} className={styles.close}>
          <Button
            variant="ghost"
            tone="neutral"
            size="sm"
            iconOnly
            icon="close"
            label={dismissLabel}
            onClick={onDismiss}
          />
        </div>
      )}
    </div>
  )
}
