'use client'

import * as ToastPrimitive from '@radix-ui/react-toast'
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'

import { Button } from '../controls/Button'
import {
  actOnToastNotice,
  dismissToastNotice,
  Icon,
  memberAttr,
  toastDetails,
  toastNotices,
  useAgentMember,
} from '@polymorph/react'
import { MotionPresence, MotionSurface } from '@polymorph/react/motion'
import styles from '@polymorph/recipes/overlays/toast.module.css'
import {
  getToasts,
  removeToast,
  subscribeToasts,
  TOAST_DEFAULT_DURATION_MS,
  TOAST_TONE_ICON,
  toast,
  type ToastRecord,
} from './toast-store'

/**
 * Notifications that report the outcome of an action
 * (`design/components/toast.md`). `toast()` raises one from anywhere and
 * `ToastNotice` declares one a screen's state owns. This file is their viewport:
 * ToastHost mounts it once at the application root and the module-level store
 * drives it, so `toast()` reaches it from anywhere.
 *
 * The motion engine handles the stacking:
 *
 *  - each toast enters on a spring, sliding up from the nearest viewport edge;
 *  - when one leaves, the others slide into its gap instead of jumping, because
 *    every toast animates its own position with the `toast.reflow` spring
 *    (`layoutBinding`);
 *  - swipe moves the card with the finger through the CSS `translate`
 *    property. The engine animates `translate` too, for the enter and the exit,
 *    and leaves its last value inline, so the recipe marks the finger's offset
 *    important: a card under a finger is where the finger is.
 *
 * The registry binds `toast.exit` to `collapse`, but here the gap closes by
 * projection instead: the leaving toast fades and slides on its own exit while
 * the others spring into place. The choreography is the same, and the engine
 * animates only transform and opacity, as law 2 requires ("only transform and
 * opacity on interactive transitions", `docs/motion.md`). A height animation
 * would break that rule.
 */

/**
 * Danger and warning interrupt; the other tones wait. Radix renders the
 * announcement in a live region, and this sets its politeness. The visible card
 * is the same either way, because many tinted cards look like an alarm panel.
 */
function politeness(tone: ToastRecord['tone']): 'foreground' | 'background' {
  return tone === 'danger' || tone === 'warning' ? 'foreground' : 'background'
}

function ToastCard({ record, dismissLabel }: { record: ToastRecord; dismissLabel: string }) {
  const icon = record.tone === 'neutral' ? null : TOAST_TONE_ICON[record.tone]

  // Step two of dismissal. When this runs, the card has already rendered its
  // closed state once, so the leaving element keeps `data-state="closed"`
  // through its whole exit, whether it timed out or was dismissed.
  useEffect(() => {
    if (record.closing) removeToast(record.id)
  }, [record.closing, record.id])

  /*
   * An update restarts the timer. Radix restarts only when `duration` changes,
   * so new content with the same duration would keep the old countdown, and an
   * updated toast needs a full reading window. The revision's parity changes
   * the number by a millisecond so the effect runs again. A reader cannot
   * notice it, and `Infinity` is unchanged, because a pinned toast never times
   * out, updated or not.
   */
  const duration = Number.isFinite(record.durationMs)
    ? record.durationMs + (record.revision % 2)
    : record.durationMs

  return (
    <ToastPrimitive.Root
      asChild
      forceMount
      open={!record.closing}
      type={politeness(record.tone)}
      duration={duration}
      onOpenChange={(open) => {
        if (!open && record.dismissible !== false) toast.dismiss(record.id)
      }}
      onEscapeKeyDown={(event) => {
        if (record.dismissible === false) event.preventDefault()
      }}
      onSwipeEnd={(event) => {
        if (record.dismissible === false) event.preventDefault()
      }}
      onSwipeStart={(event) => {
        if (record.dismissible === false) event.preventDefault()
      }}
      onSwipeMove={(event) => {
        if (record.dismissible === false) event.preventDefault()
      }}
    >
      <MotionSurface
        as="li"
        binding="toast.enter"
        layoutBinding="toast.reflow"
        className={styles.toast}
        data-tone={record.tone}
        // The card, not the viewport, carries the identity attribute
        // (`data-member`), because `Toast` is the member the gallery names and
        // the card is its surface.
        {...memberAttr('Toast')}
      >
        {/* While a promise is pending, the loading glyph fills the tone-icon
            slot. It is decorative; the title says what is pending. */}
        {record.loading ? (
          <span className={`${styles.tone} ${styles.wait}`} aria-hidden="true">
            <Icon name="loading" />
          </span>
        ) : icon === null ? null : (
          <span className={styles.tone}>
            <Icon name={icon} />
          </span>
        )}

        <div className={styles.text}>
          <ToastPrimitive.Title className={styles.title} data-toast-title="">
            {record.title}
          </ToastPrimitive.Title>
          {record.description === undefined ? null : (
            <ToastPrimitive.Description className={styles.description}>
              {record.description}
            </ToastPrimitive.Description>
          )}
          {record.content === undefined ? null : (
            <ToastPrimitive.Description asChild>
              <div className={styles.content}>{record.content}</div>
            </ToastPrimitive.Description>
          )}
        </div>

        {record.action === undefined ? null : (
          <div className={styles.action}>
            <Button
              variant="ghost"
              tone={record.tone === 'danger' ? 'danger' : 'accent'}
              size="sm"
              label={record.action.label}
              onClick={() => {
                record.action?.onClick()
                toast.dismiss(record.id)
              }}
            />
          </div>
        )}

        {record.dismissible !== false && (
          <div className={styles.close}>
            <Button
              variant="ghost"
              tone="neutral"
              size="sm"
              iconOnly
              icon="close"
              label={dismissLabel}
              onClick={() => toast.dismiss(record.id)}
            />
          </div>
        )}
      </MotionSurface>
    </ToastPrimitive.Root>
  )
}

/**
 * How many viewports are mounted. A ToastNotice outside ToastHost reads it in
 * development, because a toast with no viewport is drawn nowhere.
 */
let viewports = 0

export function viewportMounted(): boolean {
  return viewports > 0
}

export interface ToasterMessages {
  dismiss: string
  notification: string
  viewport: string
}

/**
 * A card's own controls, its action and its close Button: each is a `div` that
 * follows the card's text. A notice's content sits in the text, and is the
 * application's.
 */
const CARD_CONTROLS = '[data-member="toast"] > div ~ div'

export function Toaster({
  messages = { dismiss: 'Dismiss', notification: 'Notification', viewport: 'Notifications (F8)' },
}: { messages?: ToasterMessages } = {}) {
  const records = useSyncExternalStore(subscribeToasts, getToasts, getToasts)
  // Counted before any passive effect of the same commit runs, so a notice's
  // check sees a viewport mounted beside it.
  useLayoutEffect(() => {
    viewports += 1
    return () => {
      viewports -= 1
    }
  }, [])

  // The spec's `agent` fence. A notice is a record of the store, so the viewport reads the
  // store, and an agent answers a notice through the store's own functions, as its card's
  // controls do. The labelled region names the viewport, which is in the document with no
  // notice too. The cards' own Buttons are withheld, and a notice's content is the
  // application's.
  const list = useRef<HTMLOListElement>(null)
  useAgentMember({
    member: 'Toast',
    element: () => list.current?.closest('[role="region"]') ?? list.current,
    state: () => ({ notices: toastNotices(getToasts()), details: toastDetails(getToasts()) }),
    actions: {
      dismiss: { argument: 'id', run: (id) => dismissToastNotice(toast, getToasts(), id) },
      act: { argument: 'id', run: (id) => actOnToastNotice(toast, getToasts(), id) },
    },
    withholds: () => [...(list.current?.querySelectorAll(CARD_CONTROLS) ?? [])],
  })

  return (
    <ToastPrimitive.Provider
      label={messages.notification}
      swipeDirection="right"
      duration={TOAST_DEFAULT_DURATION_MS}
    >
      {/* Radix portals each toast into the viewport, so these Roots stay here
          in the tree while their `li`s render in the `ol`. That lets presence
          coordinate their exits from one place. */}
      <MotionPresence>
        {records.map((record) => (
          <ToastCard key={record.id} record={record} dismissLabel={messages.dismiss} />
        ))}
      </MotionPresence>

      {/* Radix wraps the list in the labelled region; `data-toast-part` marks
          the list, which is as close to the region as a prop can reach. */}
      <ToastPrimitive.Viewport
        ref={list}
        label={messages.viewport}
        className={styles.viewport}
        data-toast-part="list"
      />
    </ToastPrimitive.Provider>
  )
}
