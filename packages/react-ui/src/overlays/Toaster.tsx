'use client'

import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'

import { Button } from '../controls/Button'
import {
  actOnToastNotice,
  dismissToastNotice,
  focusAfterToast,
  Icon,
  memberAttr,
  noteToastEntry,
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
 * The viewport is the one every web framework draws: a labelled region around
 * the list, which F8 focuses; a card per toast with its own timer, held while
 * the reader is on the notifications; Escape, the close button and a swipe to
 * the right dismiss a dismissible card; and a polite and an assertive live
 * region, which announce the newest toast of each politeness. A card is no
 * dismissable layer of the page: Escape reaches it only while focus is in it,
 * so a toast raised while a Dialog is open never takes Escape from the dialog.
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

/** How far a card is dragged to the right, in pixels, before letting go dismisses it. */
const SWIPE_THRESHOLD = 50

/** Danger and warning interrupt; the other tones wait. */
const urgent = (record: ToastRecord) => record.tone === 'danger' || record.tone === 'warning'

function ToastCard({
  record,
  dismissLabel,
  paused,
}: {
  record: ToastRecord
  dismissLabel: string
  paused: boolean
}) {
  const icon = record.tone === 'neutral' ? null : TOAST_TONE_ICON[record.tone]
  const dismissible = record.dismissible !== false
  const card = useRef<HTMLElement | null>(null)

  // Step two of dismissal. When this runs, the card has already rendered its
  // closed state once, so the leaving element keeps `data-state="closed"`
  // through its whole exit, whether it timed out or was dismissed. Focus in the
  // card moves on first, because the card is about to leave the page.
  useEffect(() => {
    if (!record.closing) return
    focusAfterToast(card.current)
    removeToast(record.id)
  }, [record.closing, record.id])

  /*
   * The timer. An update restarts it, so updated content gets a full reading
   * window. While the reader is on the notifications it waits, and it resumes
   * with the time that was left. A pinned toast, or one the reader cannot
   * dismiss, has none.
   */
  const left = useRef(record.durationMs)
  useEffect(() => {
    left.current = record.durationMs
  }, [record.revision, record.durationMs])
  useEffect(() => {
    if (record.closing || paused || !dismissible || !Number.isFinite(record.durationMs)) return
    const started = Date.now()
    const timer = setTimeout(() => toast.dismiss(record.id), Math.max(0, left.current))
    return () => {
      clearTimeout(timer)
      left.current -= Date.now() - started
    }
  }, [record.closing, record.revision, record.durationMs, record.id, paused, dismissible])

  // The swipe: '' at rest, `move` while the finger drags, then `cancel` or `end`.
  const [swipe, setSwipe] = useState<'' | 'move' | 'cancel' | 'end'>('')
  const [offset, setOffset] = useState(0)
  const drag = useRef<{ pointer: number; startX: number } | null>(null)

  // A press on the card, not on one of its buttons, may start a swipe to the right.
  const press = (event: PointerEvent<HTMLElement>) => {
    if (!dismissible || event.button !== 0) return
    if ((event.target as Element).closest('button') !== null) return
    drag.current = { pointer: event.pointerId, startX: event.clientX }
    setOffset(0)
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // A pointer the browser no longer knows has nothing to capture.
    }
  }
  const move = (event: PointerEvent<HTMLElement>) => {
    if (drag.current === null) return
    const delta = Math.max(0, event.clientX - drag.current.startX)
    setOffset(delta)
    if (delta > 0) setSwipe('move')
  }
  // Past the threshold the card leaves from where the finger let go; short of it, it springs back.
  const lift = (event: PointerEvent<HTMLElement>) => {
    if (drag.current === null) return
    const delta = Math.max(0, event.clientX - drag.current.startX)
    drag.current = null
    if (swipe !== 'move') return
    if (delta > SWIPE_THRESHOLD) {
      setOffset(delta)
      setSwipe('end')
      toast.dismiss(record.id)
    } else {
      setOffset(0)
      setSwipe('cancel')
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    if (dismissible) toast.dismiss(record.id)
  }

  return (
    <MotionSurface
      as="li"
      ref={card}
      binding="toast.enter"
      layoutBinding="toast.reflow"
      className={styles.toast}
      // A list item the reader can focus; the viewport's live regions announce it.
      tabIndex={0}
      data-tone={record.tone}
      data-state={record.closing ? 'closed' : 'open'}
      {...(swipe === '' ? {} : { 'data-swipe': swipe })}
      data-swipe-direction="right"
      style={
        {
          '--radix-toast-swipe-move-x': `${offset}px`,
          '--radix-toast-swipe-end-x': `${offset}px`,
        } as CSSProperties
      }
      onKeyDown={onKeyDown}
      onPointerDown={press}
      onPointerMove={move}
      onPointerUp={lift}
      onPointerCancel={lift}
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
        <div className={styles.title} data-toast-title="">
          {record.title}
        </div>
        {record.description === undefined ? null : (
          <div className={styles.description}>{record.description}</div>
        )}
        {record.content === undefined ? null : (
          <div className={styles.content}>{record.content}</div>
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

      {dismissible && (
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

  const region = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLOListElement>(null)

  // F8, from anywhere on the page, moves focus to the list.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'F8') return
      event.preventDefault()
      list.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  /*
   * The timers wait while the reader is on the notifications: while focus is
   * in the region, or the pointer moves over it. They resume when both have
   * left. The listeners are the document's own, because `pointerleave` does not
   * bubble and the region is where the reader leaves from.
   */
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    const element = region.current
    if (element === null) return
    const pause = () => setPaused(true)
    const focusOut = (event: FocusEvent) => {
      if (event.relatedTarget instanceof Node && element.contains(event.relatedTarget)) return
      if (!element.matches(':hover')) setPaused(false)
    }
    const pointerLeave = () => {
      if (!element.contains(document.activeElement)) setPaused(false)
    }
    element.addEventListener('focusin', pause)
    element.addEventListener('focusout', focusOut)
    element.addEventListener('pointermove', pause)
    element.addEventListener('pointerleave', pointerLeave)
    return () => {
      element.removeEventListener('focusin', pause)
      element.removeEventListener('focusout', focusOut)
      element.removeEventListener('pointermove', pause)
      element.removeEventListener('pointerleave', pointerLeave)
    }
  }, [])

  // The newest showing toast of each politeness, in words. The cards are not
  // live regions, because a region that appears with its content is not
  // reliably read.
  const words = (loud: boolean) => {
    const record = records.filter((each) => each.closing !== true && urgent(each) === loud).at(-1)
    return record === undefined
      ? ''
      : [messages.notification, record.title, record.description].filter(Boolean).join(' ')
  }

  // The spec's `agent` fence. A notice is a record of the store, so the viewport reads the
  // store, and an agent answers a notice through the store's own functions, as its card's
  // controls do. The labelled region names the viewport, which is in the document with no
  // notice too. The cards' own Buttons are withheld, and a notice's content is the
  // application's.
  useAgentMember({
    member: 'Toast',
    element: () => region.current,
    state: () => ({ notices: toastNotices(getToasts()), details: toastDetails(getToasts()) }),
    actions: {
      dismiss: { argument: 'id', run: (id) => dismissToastNotice(toast, getToasts(), id) },
      act: { argument: 'id', run: (id) => actOnToastNotice(toast, getToasts(), id) },
    },
    withholds: () => [...(list.current?.querySelectorAll(CARD_CONTROLS) ?? [])],
  })

  return (
    <div ref={region} role="region" aria-label={messages.viewport} tabIndex={-1}>
      <ol
        ref={list}
        tabIndex={-1}
        className={styles.viewport}
        data-toast-part="list"
        onFocus={(event) => noteToastEntry(list.current, event.relatedTarget)}
      >
        <MotionPresence>
          {records.map((record) => (
            <ToastCard
              key={record.id}
              record={record}
              dismissLabel={messages.dismiss}
              paused={paused}
            />
          ))}
        </MotionPresence>
      </ol>
      <VisuallyHidden role="status" aria-live="polite" aria-atomic="true">
        {words(false)}
      </VisuallyHidden>
      <VisuallyHidden role="alert" aria-live="assertive" aria-atomic="true">
        {words(true)}
      </VisuallyHidden>
    </div>
  )
}
