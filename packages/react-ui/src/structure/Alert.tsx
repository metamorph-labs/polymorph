'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { Button } from '../controls/Button'
import { Icon, type IconRole, memberAttr, useAgentMember } from '@polymorph/react'
import { readMotionEnvironment, resolveBinding } from '@polymorph/react/motion'
import styles from '@polymorph/recipes/structure/alert.module.css'

/**
 * Inline status callout (`design/components/alert.md`).
 *
 * An Alert stays in the page, beside what it is about: validation summaries,
 * quota warnings, a notice about one section's data, and a review the reader
 * answers in place with two actions, apply or discard. A notice about the whole
 * application, such as degraded service, is a Banner in the AppShell's frame. A transient event is a Toast, and content with a title bar
 * or more than two actions is a Card. So Alert has no variants and no sizes.
 *
 * An Alert given no title and no content renders nothing, so a screen can draw
 * it always and bind its title to a message that is empty while there is none.
 * An action or a dismiss handler without words is still nothing.
 *
 * Per the spec, **the Alert plays the departure and the application owns the
 * unmount**. `onDismiss` fires when the collapse has finished, so a caller can
 * just drop the Alert from state. At `none` it fires immediately, because the
 * binding's durations are zero. Under reduced motion the size change is instant
 * but the content still fades, so it fires when the fade ends.
 */

/** The tone→icon-role map, in one place, so `warning` cannot map to two glyphs. */
const TONE_ICON = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'error',
} as const satisfies Record<AlertTone, IconRole>

/**
 * Politeness by tone, per the spec: warnings and errors interrupt, info and
 * success do not. The role is present from the first render, so an Alert mounted
 * in response to an event is announced correctly.
 */
const TONE_ROLE = {
  info: 'status',
  success: 'status',
  warning: 'alert',
  danger: 'alert',
} as const satisfies Record<AlertTone, 'status' | 'alert'>

/** A `children` value React draws nothing for, which counts as no content. */
const isNothing = (children: ReactNode) =>
  children === undefined || children === null || typeof children === 'boolean' || children === ''

export type AlertTone = 'info' | 'success' | 'warning' | 'danger'

export interface AlertProps {
  tone?: AlertTone
  /** The first line. An empty title counts as no title. */
  title?: string
  /** The body copy. With no title and no content the Alert renders nothing. */
  children?: ReactNode
  /** The first action: one `ghost`/`soft` `sm` Button, such as Apply. */
  action?: ReactNode
  /**
   * The second action: one `ghost` `sm` Button after `action`, such as Discard.
   * Two is the most an Alert takes; content that needs more is a Card.
   */
  secondaryAction?: ReactNode
  /** Renders the ✕, and is called after the row has closed so the app can unmount it. */
  onDismiss?: () => void
  /** The ✕'s accessible name, default `Dismiss`; localized hosts pass their own. */
  dismissLabel?: string
  /** `false` hides the tone glyph, for dense stacks where the wash already shows the tone. */
  icon?: false
}

export function Alert({
  tone = 'info',
  title,
  children,
  action,
  secondaryAction,
  onDismiss,
  dismissLabel = 'Dismiss',
  icon,
}: AlertProps) {
  const [closing, setClosing] = useState(false)
  const titled = title !== undefined && title !== ''
  const said = !isNothing(children)
  // With no title and no content the Alert draws nothing, and an agent does not list it.
  const empty = !titled && !said
  const root = useRef<HTMLDivElement | null>(null)
  const close = useRef<HTMLDivElement | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Ends an agent's dismiss: once `onDismiss` has run, or once the Alert has unmounted first.
  const settle = useRef<(() => void) | undefined>(undefined)

  // If the application removes the Alert before the row has closed, for example on
  // a filter or route change, `onDismiss` must not fire afterwards.
  useEffect(
    () => () => {
      clearTimeout(timer.current)
      settle.current?.()
    },
    [],
  )

  const dismiss = useCallback(() => {
    if (!onDismiss) return
    setClosing(true)

    /*
     * The binding sets the duration. `collapse` in exit mode fades the content
     * over the first half and closes the row over the second. Both are zero at
     * `none`. Under reduced motion only the size is instant, so the wait is the
     * longer of the two.
     *
     * Read from the Alert's node at press time rather than subscribed, so a
     * `[data-motion]` scope above it applies and an undismissed Alert costs
     * nothing.
     */
    const departure = resolveBinding(
      'alert.dismiss',
      readMotionEnvironment(root.current ?? document.documentElement),
    )
    const runtime =
      departure.kind === 'collapse'
        ? Math.max(departure.sizeDurationMs, departure.contentFadeMs)
        : 0

    const done = () => {
      onDismiss()
      settle.current?.()
    }
    clearTimeout(timer.current)
    if (runtime === 0) {
      done()
      return
    }
    timer.current = setTimeout(done, runtime)
  }, [onDismiss])

  // The spec's `agent` fence. The ✕ is the Alert's own part, so it is withheld and `dismiss`
  // stands in its place; the step ends once the departure has played and `onDismiss` has run.
  // The application's actions are its own and stay an agent's. An Alert that draws
  // nothing registers nothing, and registers once a title or content arrives.
  useAgentMember(
    {
      member: 'Alert',
      element: () => root.current,
      state: () => ({ tone, title: title ?? '', dismissible: onDismiss !== undefined }),
      actions: {
        dismiss: () => {
          if (onDismiss === undefined) throw new Error('This alert has no dismiss control.')
          return new Promise<void>((resolve) => {
            settle.current = () => {
              settle.current = undefined
              resolve()
            }
            dismiss()
          })
        },
      },
      withholds: () => close.current,
    },
    { unless: empty },
  )

  // After every hook, so the hooks run in the same order whether or not it draws.
  if (empty) return null

  return (
    <div
      ref={root}
      className={styles.alert}
      role={TONE_ROLE[tone]}
      data-tone={tone}
      // Rest is the absence of the attribute, per the attribute contract.
      data-state={closing ? 'closed' : undefined}
      {...memberAttr('Alert')}
    >
      {/* The wash is on the panel and the collapse on the root, because a box
          animating its own height would animate its padding too. */}
      <div className={styles.panel}>
        {icon === false ? null : (
          <span className={styles.glyph}>
            {/* Decorative. The politeness role already announces the kind of
                message, so a named glyph would repeat it. */}
            <Icon name={TONE_ICON[tone]} />
          </span>
        )}

        <div className={styles.body}>
          {titled ? <p className={styles.title}>{title}</p> : null}
          {/* Left out with no content, so a title alone has no gap under it. */}
          {said ? <div className={styles.text}>{children}</div> : null}
          {action === undefined && secondaryAction === undefined ? null : (
            // The document order is the focus order: the answers, then the ✕.
            <div className={styles.action}>
              {action}
              {secondaryAction}
            </div>
          )}
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
              onClick={dismiss}
            />
          </div>
        )}
      </div>
    </div>
  )
}
