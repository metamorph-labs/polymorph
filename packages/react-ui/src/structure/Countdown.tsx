'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import {
  countdownClock,
  countdownLeft,
  countdownMoment,
  countdownSpoken,
  followCountdown,
  memberAttr,
  useDevWarning,
} from '@polymorph/react'
import styles from '@polymorph/recipes/structure/countdown.module.css'

/**
 * Time left until a moment, ticking each second (`design/components/countdown.md`).
 *
 * It writes `4:59`, then `1:02:05` from an hour, in tabular figures, until
 * `0:00`, when it calls `onEnd` once. The time is read from the page's one
 * clock (`followCountdown` in the engine), which every Countdown shares.
 *
 * Not RelativeTime, which writes a moment as words relative to now and never
 * refreshes. A Countdown is digits that change every second and an end the
 * application acts on. It holds no button: the control that waits for the end
 * is the application's, and `onEnd` tells it when.
 */

/**
 * The member's words, localized by passing them (WCAG 3.1.2). `mark` joins
 * the label and the time left in words, for the polite line said at one
 * minute and at ten seconds when `announce` is set. Default: "label: time".
 */
export interface CountdownMessages {
  mark: (label: string, time: string) => string
}

export interface CountdownProps {
  /**
   * The moment it counts to: an ISO-8601 instant, as RelativeTime reads its
   * value. Not a number of seconds, which would start again on every render.
   * A server's "retry after 30" becomes a moment once, where the app receives it.
   */
  until: string
  /** What it counts to, for assistive technology: "Time until you can send a new code". */
  label: string
  /** Called once when the moment is reached, and once after mount when it has already passed. */
  onEnd?: () => void
  /** Says the time left in a polite line at one minute and at ten seconds. Off, nothing is said. */
  announce?: boolean
  /** The locale `Intl` writes the digits and the words in; the page's own when absent. */
  locale?: string
  /** Omit for the generic English defaults; localized hosts pass their own. */
  messages?: CountdownMessages
}

const MESSAGES: CountdownMessages = { mark: (label, time) => `${label}: ${time}` }

/* `false` on a server and while hydrating, `true` once the browser renders. */
const subscribeNothing = () => () => {}
const inBrowser = () => true
const onServer = () => false

export function Countdown({
  until,
  label,
  onEnd,
  announce = false,
  locale,
  messages = MESSAGES,
}: CountdownProps) {
  const moment = countdownMoment(until)
  const hydrated = useSyncExternalStore(subscribeNothing, inBrowser, onServer)
  // The clock's latest reading, and the last line said, each for the moment it belongs to.
  const [reading, setReading] = useState<{ moment: number; left: number } | null>(null)
  const [said, setSaid] = useState<{ moment: number; text: string } | null>(null)

  // Read by the clock's listener, which lives as long as the moment does.
  const latest = useRef({ onEnd, announce, label, locale, messages })
  useEffect(() => {
    latest.current = { onEnd, announce, label, locale, messages }
  })

  // The moment `onEnd` was called for, so a listener that starts again for the same moment
  // (React's development double effect) does not call it twice.
  const ended = useRef<number | null>(null)
  useEffect(() => {
    if (moment === null) return
    return followCountdown(moment, (left, marked) => {
      setReading({ moment, left })
      const now = latest.current
      if (marked && now.announce) {
        setSaid({ moment, text: now.messages.mark(now.label, countdownSpoken(left, now.locale)) })
      }
      if (left === 0 && ended.current !== moment) {
        ended.current = moment
        now.onEnd?.()
      }
    })
  }, [moment])

  useDevWarning(
    moment === null,
    `Countdown could not read "${until}" as a moment — rendering nothing.`,
  )
  // A value that names no moment has nothing to count to, so nothing renders, as in RelativeTime.
  if (moment === null) return null

  // Before the clock is followed, the time left is the render's own: the server's on a server.
  const left = reading?.moment === moment ? reading.left : countdownLeft(moment)

  // A server's time left differs from the browser's a moment later. The markup keeps the
  // server's while React hydrates, and the key then replaces it with the browser's, so the
  // digits are right before the first tick and no mismatch is reported.
  return (
    <span
      key={hydrated ? 'browser' : 'server'}
      className={styles.countdown}
      data-ended={left === 0 ? '' : undefined}
      suppressHydrationWarning
      {...memberAttr('Countdown')}
    >
      {/* The timer is named by `label`. Its live setting is off by role, so no second is
          announced. Assistive technology reads the time in words; the digits are for the eye. */}
      <time role="timer" aria-label={label} dateTime={`PT${left}S`} suppressHydrationWarning>
        <span className={styles.digits} aria-hidden="true" suppressHydrationWarning>
          {countdownClock(left, locale)}
        </span>
        <span className={styles.spoken} suppressHydrationWarning>
          {countdownSpoken(left, locale)}
        </span>
      </time>
      {/* Present from mount, so its first line is announced. */}
      {announce ? (
        <span className={styles.spoken} role="status">
          {said?.moment === moment ? said.text : ''}
        </span>
      ) : null}
    </span>
  )
}
