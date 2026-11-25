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
  announceToasts,
  composingKey,
  dismissToastNotice,
  focusAfterToast,
  followToastFocus,
  holdToastTimers,
  Icon,
  memberAttr,
  TOAST_QUIET,
  toastDetails,
  toastNotices,
  useAgentMember,
  type ToastAnnouncements,
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
 * the reader is on the notifications or the window is in the background
 * (`holdToastTimers`); Escape, the close button and a swipe to the right
 * dismiss a dismissible card; and a polite and an assertive live region, which
 * say a toast as it is raised or updated (`announceToasts`). A card is no
 * dismissable layer of the page: Escape reaches it only while focus is in it,
 * so a toast raised while a Dialog is open never takes Escape from the dialog,
 * and an Escape that a control in the card's content has already handled, or
 * that an input method is handling, is not the card's.
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

  /*
   * A card leaves when its toast starts to close, and also when its toast
   * leaves the store without closing: its owner removed it, or a newer toast
   * evicted it. `MotionPresence` then keeps the card for its exit with the
   * props it last rendered, so the card reads the store itself. A leaving card
   * is `data-state="closed"` for its whole exit, which stops it taking clicks
   * and tells `focusAfterToast` it is not staying.
   */
  const held = useSyncExternalStore(
    subscribeToasts,
    () => getToasts().some((each) => each.id === record.id),
    () => true,
  )
  const leaving = record.closing === true || !held

  // Focus in a leaving card moves on before the card plays its exit, in the
  // commit that marks it closed.
  useLayoutEffect(() => {
    if (leaving) focusAfterToast(card.current)
  }, [leaving])

  // Step two of dismissal. When this runs, the card has already rendered its
  // closed state once, so the leaving element keeps `data-state="closed"`
  // through its whole exit, whether it timed out or was dismissed.
  useEffect(() => {
    if (record.closing) removeToast(record.id)
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
    if (leaving || paused || !dismissible || !Number.isFinite(record.durationMs)) return
    const started = Date.now()
    const timer = setTimeout(() => toast.dismiss(record.id), Math.max(0, left.current))
    return () => {
      clearTimeout(timer)
      left.current -= Date.now() - started
    }
  }, [leaving, record.revision, record.durationMs, record.id, paused, dismissible])

  // The swipe: '' at rest, `move` while the finger drags, then `cancel` or `end`.
  // The drag itself is a ref, so the release reads the move that came before it
  // even when no render has happened between them.
  const [swipe, setSwipe] = useState<'' | 'move' | 'cancel' | 'end'>('')
  const [offset, setOffset] = useState(0)
  const drag = useRef<{ pointer: number; startX: number; moved: boolean } | null>(null)

  // A press on the card, not on one of its buttons, may start a swipe to the right.
  const press = (event: PointerEvent<HTMLElement>) => {
    if (!dismissible || event.button !== 0) return
    if ((event.target as Element).closest('button') !== null) return
    drag.current = { pointer: event.pointerId, startX: event.clientX, moved: false }
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
    if (delta > 0) {
      drag.current.moved = true
      setSwipe('move')
    }
  }
  // Past the threshold the card leaves from where the finger let go; short of it, it springs back.
  const lift = (event: PointerEvent<HTMLElement>) => {
    if (drag.current === null) return
    const delta = Math.max(0, event.clientX - drag.current.startX)
    const moved = drag.current.moved
    drag.current = null
    if (!moved) return
    if (delta > SWIPE_THRESHOLD) {
      setOffset(delta)
      setSwipe('end')
      toast.dismiss(record.id)
    } else {
      setOffset(0)
      setSwipe('cancel')
    }
  }

  // React passes a key from a portal to the card that renders it, so an Escape
  // a Select or Menu in the content took to close itself arrives here with its
  // default prevented.
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || event.defaultPrevented || composingKey(event.nativeEvent)) return
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
      data-state={leaving ? 'closed' : 'open'}
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
          <div className={styles.content} data-toast-content="">
            {record.content}
          </div>
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

  // The timers wait while the reader is on the notifications, by focus or by
  // the pointer, and while the window is in the background.
  const [paused, setPaused] = useState(false)
  useEffect(() => holdToastTimers(region.current, setPaused), [])

  // Focus in a card that leaves the page by any route moves on, and the list
  // records where focus came from as it enters.
  useEffect(() => followToastFocus(list.current), [])

  // What the live regions say: a toast as it is raised, and again when an
  // update changes its words. It is read after the change is drawn, because a
  // notice's content is read from its card. The cards are not live regions,
  // because a region that appears with its content is not reliably read.
  const announced = useRef<ToastAnnouncements>(TOAST_QUIET)
  const [said, setSaid] = useState<ToastAnnouncements>(TOAST_QUIET)
  useEffect(() => {
    const next = announceToasts(announced.current, records, list.current, messages.notification)
    if (next === announced.current) return
    announced.current = next
    setSaid(next)
  }, [records, messages.notification])

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
      <ol ref={list} tabIndex={-1} className={styles.viewport} data-toast-part="list">
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
      {/* Each announcement is a new element, so the same words said twice are
          said twice. */}
      <VisuallyHidden role="status" aria-live="polite" aria-atomic="true">
        <span key={said.polite.key}>{said.polite.words}</span>
      </VisuallyHidden>
      <VisuallyHidden role="alert" aria-live="assertive" aria-atomic="true">
        <span key={said.assertive.key}>{said.assertive.words}</span>
      </VisuallyHidden>
    </div>
  )
}
