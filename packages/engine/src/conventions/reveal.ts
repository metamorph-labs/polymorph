'use client'

/**
 * Scrolls a list along its inline axis until one of its items is inside it,
 * and scrolls nothing else. Every framework's Tabs calls it, so the current
 * tab is brought into a strip that scrolls the same way in each.
 *
 * It writes the list's own scroll position and never calls `scrollIntoView`,
 * which scrolls every ancestor too and would bring the page to a strip below
 * the fold. It does nothing when the list has nothing to scroll, so a caller
 * need not ask first.
 *
 * The item is kept clear of the list's `scroll-padding`, as the browser keeps
 * an element it scrolls to on focus, so one value in the recipe places both.
 * When the item is wider than the room between the paddings, its inline-start
 * edge is the one shown.
 *
 * The positions are `offsetLeft` and `scrollLeft`, which share one physical
 * axis in both writing directions, so direction decides only the scroll range
 * and the edge a too-wide item keeps. The list must be the item's offset
 * parent, which a positioned list is. Offsets ignore transforms, so a list
 * inside a surface that is still scaling in is measured at its real size.
 *
 * The move is smooth only when the caller allows it, the reader has not asked
 * for reduced motion and the surface duration token is above zero, which it is
 * not at the `none` temperament or without a theme. A caller passes `instant`
 * for a placement that is layout and not travel: the first one, and one after
 * a resize.
 */
export function revealInline(
  list: Element | null | undefined,
  item: Element | null | undefined,
  instant = false,
): void {
  if (!(list instanceof HTMLElement) || !(item instanceof HTMLElement)) return
  const room = list.scrollWidth - list.clientWidth
  if (room <= 0) return

  const styles = getComputedStyle(list)
  const rtl = styles.direction === 'rtl'
  // `auto` parses to NaN, which is no padding.
  const left = item.offsetLeft - (Number.parseFloat(styles.scrollPaddingLeft) || 0)
  const right =
    item.offsetLeft + item.offsetWidth + (Number.parseFloat(styles.scrollPaddingRight) || 0)

  const from = list.scrollLeft
  const fits = (at: number) => (right > at + list.clientWidth ? right - list.clientWidth : at)
  const starts = (at: number) => (left < at ? left : at)
  // The edge applied last wins when both cannot fit: the inline-start one.
  const wanted = rtl ? fits(starts(from)) : starts(fits(from))
  // A right-to-left list scrolls from 0 down to the negative of its room.
  const to = Math.min(Math.max(wanted, rtl ? -room : 0), rtl ? 0 : room)
  if (Math.abs(to - from) < 1) return

  const smooth =
    !instant &&
    !matchMedia('(prefers-reduced-motion: reduce)').matches &&
    Number.parseFloat(styles.getPropertyValue('--pm-motion-duration-surface')) > 0
  list.scrollTo({ left: to, behavior: smooth ? 'smooth' : 'instant' })
}
