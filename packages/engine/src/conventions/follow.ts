'use client'

/**
 * Holds a scroll region at its end while content arrives, for as long as the
 * reader is at the end. ChatThread follows its newest turn with it and LogView
 * its newest line, in every framework, so both follow by one rule.
 *
 * Following uses two observations and no scheduler. A scroll event says
 * whether the reader is at the end. A resize of the region or of its content
 * says that content grew or arrived. When the reader is at the end and more
 * content arrives, the region moves to the new end. When the reader scrolls
 * away, the region stays where they put it, and nothing moves until the caller
 * calls `jumpToEnd`.
 *
 * Some scroll events do not come from the reader. The browser reports a
 * programmatic scroll one frame late, and content can grow in that frame. The
 * event then measures a reader who was at the end as far from it. The scroll
 * height recorded at the last decision tells the two apart: a scroll that
 * arrives with a different height is the content moving, so the region follows
 * again instead of letting go.
 *
 * The move is never animated. A smooth scroll under arriving content makes the
 * reader chase the line.
 */

/**
 * The distance from the end, in pixels, that still counts as the end.
 *
 * It is a number and not a token, because it is a tolerance and not a design
 * measure. It absorbs sub-pixel scroll positions and the last line's descent,
 * and no theme tunes it. It is one space step at standard density, the gap
 * below a thread's last turn, so a reader anywhere inside that gap is reading
 * the end.
 */
export const FOLLOW_SLACK_PX = 24

/** What a region that follows its end reports after each decision. */
export interface FollowState {
  /** The reader has scrolled away from the end, so the region no longer follows. */
  detached: boolean
  /**
   * The content is larger than the region on either axis, so the region
   * scrolls and must be a tab stop.
   */
  overflowing: boolean
}

/** The follow attached to each region, so `jumpToEnd` reaches it from the region alone. */
const following = new WeakMap<HTMLElement, () => void>()

/**
 * Follows the end of `port`, a scroll container, while `content`, the element
 * inside it that grows, changes size. `report` receives the state once at once
 * and again each time it changes. The returned function removes the listener
 * and the observer.
 *
 * Without a region, without content or without `ResizeObserver` (a server
 * render), it does nothing and reports nothing. A region with no content yet
 * has nothing to follow, so the caller attaches it again once the content
 * mounts.
 */
export function followEnd(
  port: HTMLElement | null | undefined,
  content: Element | null | undefined,
  report: (state: FollowState) => void,
): () => void {
  if (!port || !content || typeof ResizeObserver === 'undefined') return () => {}

  let atEnd = true
  let decidedAt = 0
  let reported: FollowState | null = null

  const measure = () => {
    const distance = port.scrollHeight - port.scrollTop - port.clientHeight
    atEnd = distance <= FOLLOW_SLACK_PX
    decidedAt = port.scrollHeight
    const state: FollowState = {
      detached: !atEnd,
      overflowing: port.scrollHeight > port.clientHeight || port.scrollWidth > port.clientWidth,
    }
    if (
      reported === null ||
      reported.detached !== state.detached ||
      reported.overflowing !== state.overflowing
    ) {
      reported = state
      report(state)
    }
  }

  const follow = () => {
    if (atEnd) port.scrollTop = port.scrollHeight
    measure()
  }

  const onScroll = () => {
    if (port.scrollHeight === decidedAt) measure()
    else follow()
  }

  port.addEventListener('scroll', onScroll, { passive: true })
  const observer = new ResizeObserver(follow)
  observer.observe(content)
  observer.observe(port)
  following.set(port, () => {
    atEnd = true
    follow()
  })
  follow()

  return () => {
    port.removeEventListener('scroll', onScroll)
    observer.disconnect()
    following.delete(port)
  }
}

/**
 * Moves `port` to its end and makes it follow again, as the control that
 * returns a reader to the newest content does. The region follows from this
 * call, so content that arrives before the browser reports the scroll is
 * followed too. A region that `followEnd` is not attached to still moves to its
 * end.
 */
export function jumpToEnd(port: HTMLElement | null | undefined): void {
  if (!port) return
  const follow = following.get(port)
  if (follow) follow()
  else port.scrollTop = port.scrollHeight
}
