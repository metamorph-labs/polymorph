'use client'

/**
 * Which section of a page the reader is in, for a list of links to the page's
 * sections that marks the one in view. Every framework's TableOfContents
 * follows the page with it, so the mark moves by one rule in each.
 *
 * A section is the element of the document whose id an item names: a heading,
 * or the element that holds a heading and what follows it. The page is the
 * nearest ancestor of the first section found that scrolls (`overflow-y` of
 * `auto`, `scroll` or `overlay`), or the document when no ancestor below
 * `<body>` scrolls. In an AppShell that is the content region.
 *
 * The current section is the last one, in the order of the ids, whose top edge
 * is at or above a line across the page's visible box, `SECTION_LINE` of its
 * height below its top. Several sections can be in view, and the reader is in
 * the one that has reached the line. When no section has reached it (the top
 * of a page whose first section starts lower), none is current. When the page
 * is scrolled to its end, the last section the document holds is current: the
 * sections at the end of a page can be too short for their tops to reach the
 * line, and a reader who scrolled to the end is reading the last of them. A
 * section that is not in the document, or has no box (`display: none`), is
 * never current.
 *
 * Two observations decide it again. A scroll of the page decides it on each
 * scroll event, which the browser sends at most once a frame. An
 * `IntersectionObserver` reports a section that crosses the line without a
 * scroll, because content above it grew or went. The observer's box reaches
 * the page's whole height above the line, so a section that moves from below
 * the line to far above it in one step is reported too.
 *
 * A section that is not in the document is waited for. While an id names no
 * element, a `MutationObserver` on the document looks for it each time nodes
 * are added or an `id` changes, and the section is decided again when it
 * appears. Neither a scroll nor the intersection observer reports that: a list
 * can be drawn before the page's sections are, and until one section is found
 * there is no page to observe.
 *
 * `jumpToSection` handles a click on a link. It marks the link's section at
 * once and moves focus to it. The mark is held while the browser scrolls to the
 * section, because that scroll passes the sections between, and a short section
 * never reaches the line. The hold ends when the reader acts on the page (a
 * wheel, a touch that moves, a key, a pointer press) or when the address's
 * fragment changes to one that names no section of the list. A fragment that
 * names one marks it and holds it, which is what the browser's Back and
 * Forward buttons and another in-page link do.
 */

/**
 * Where the line is, as a fraction of the page's visible height below its top.
 *
 * It is a number and not a token, because it is a reading position and not a
 * design measure, and no theme tunes it. A quarter is below the place the
 * browser puts a section it scrolls to (the top, less any `scroll-margin`), so
 * a section reached by a link has reached the line.
 */
export const SECTION_LINE = 0.25

/** What `jumpToSection` reaches from the element a watch belongs to. */
interface Watch {
  /**
   * Marks `id` and holds it. The browser's fragment change for the same click
   * arrives a task later, when the reader may already have scrolled, so that
   * one change is not read as a new fragment.
   */
  jumped(id: string): void
}

/** The watch attached to each owner, so `jumpToSection` reaches it from the owner alone. */
const watches = new WeakMap<Element, Watch>()

/** The reader acting on the page, which ends a hold. */
const READER_INPUT = ['wheel', 'touchmove', 'keydown', 'pointerdown'] as const

/** The nearest ancestor that scrolls, or `null` when the document does. */
function scrollerOf(element: Element): Element | null {
  const body = element.ownerDocument.body
  for (let at = element.parentElement; at !== null && at !== body; at = at.parentElement) {
    const overflow = getComputedStyle(at).overflowY
    if (overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay') return at
  }
  return null
}

/** The id a fragment names (`#über-uns` or `#%C3%BCber-uns`), or `null` for none. */
function fragmentOf(hash: string): string | null {
  if (hash.length <= 1) return null
  const raw = hash.slice(1)
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

/**
 * Follows which of the sections `ids` names the reader is in. `owner` is the
 * element the list is drawn in, which `jumpToSection` names. `report` receives
 * the current section's id, or `null` for none, once at once and again each
 * time it changes. The returned function removes the observer and the
 * listeners.
 *
 * Without an owner or without `IntersectionObserver` (a server render) it does
 * nothing and reports nothing. A section that is not in the document yet is
 * looked for again on each decision and when the document changes, so one that
 * mounts later is followed.
 */
export function watchSections(
  owner: Element | null | undefined,
  ids: readonly string[],
  report: (id: string | null) => void,
): () => void {
  if (!owner || typeof IntersectionObserver === 'undefined') return () => {}
  const page = owner.ownerDocument
  const view = page.defaultView
  if (view === null) return () => {}

  /** `undefined` until the first report. */
  let current: string | null | undefined
  let held = false
  /** The fragment a click is navigating to, whose change is the click's own. */
  let jumpedTo: string | null = null
  /** The page: `undefined` until a section is found, `null` for the document. */
  let region: Element | null | undefined
  let observer: IntersectionObserver | undefined
  const observed = new Set<Element>()
  /** The ids that named no element at the last look, and the observer that waits for them. */
  let missing: string[] = []
  let waiting: MutationObserver | undefined

  const decided = (next: string | null) => {
    if (next === current) return
    current = next
    report(next)
  }

  /** The element each id names now. A section that was replaced or that appeared is observed. */
  const sections = (): (Element | null)[] => {
    const found: (Element | null)[] = ids.map((id) => page.getElementById(id))
    const first = found.find((section) => section !== null)
    if (region === undefined && first !== undefined && first !== null) {
      region = scrollerOf(first)
      const scroller = region ?? page.scrollingElement ?? page.documentElement
      const above = Math.ceil(Math.max(scroller.scrollHeight, scroller.clientHeight))
      observer = new IntersectionObserver(decide, {
        root: region ?? page,
        rootMargin: `${above}px 0px ${-(1 - SECTION_LINE) * 100}% 0px`,
      })
    }
    const present = new Set(found.filter((section): section is Element => section !== null))
    for (const section of observed) {
      if (present.has(section)) continue
      observer?.unobserve(section)
      observed.delete(section)
    }
    for (const section of present) {
      if (observed.has(section)) continue
      observer?.observe(section)
      observed.add(section)
    }
    missing = ids.filter((_, at) => found[at] === null)
    if (missing.length === 0) {
      waiting?.disconnect()
      waiting = undefined
    } else if (waiting === undefined && typeof MutationObserver !== 'undefined') {
      // The callback only looks the missing ids up, which measures nothing, so a page that
      // changes often pays no layout for a section that never mounts.
      waiting = new MutationObserver(() => {
        if (missing.some((id) => page.getElementById(id) !== null)) decide()
      })
      waiting.observe(page, { childList: true, subtree: true, attributeFilter: ['id'] })
    }
    return found
  }

  /** The top and the height of the page's visible box, in the viewport's coordinates. */
  const visible = (): { top: number; height: number } => {
    if (region === null || region === undefined) {
      return { top: 0, height: page.documentElement.clientHeight }
    }
    return {
      top: region.getBoundingClientRect().top + region.clientTop,
      height: region.clientHeight,
    }
  }

  /** The page scrolls, and is at its end. */
  const atEnd = (): boolean => {
    const scroller = region ?? page.scrollingElement ?? page.documentElement
    const range = scroller.scrollHeight - scroller.clientHeight
    return range >= 1 && range - scroller.scrollTop < 1
  }

  function decide() {
    const found = sections()
    if (held) return
    if (region === undefined) {
      decided(null)
      return
    }
    const box = visible()
    const line = atEnd() ? Infinity : box.top + box.height * SECTION_LINE
    let next: string | null = null
    found.forEach((section, at) => {
      if (section === null || section.getClientRects().length === 0) return
      if (section.getBoundingClientRect().top <= line) next = ids[at] ?? null
    })
    decided(next)
  }

  const hold = (id: string) => {
    held = true
    decided(id)
  }

  const letGo = () => {
    held = false
  }

  const onScroll = (event: Event) => {
    if (region === undefined || event.target === (region ?? page)) decide()
  }

  const onFragment = () => {
    const named = fragmentOf(view.location.hash)
    const own = named !== null && named === jumpedTo
    jumpedTo = null
    if (own) return
    if (named !== null && ids.includes(named) && page.getElementById(named) !== null) {
      hold(named)
      return
    }
    letGo()
    decide()
  }

  // Capture, because a scroll event does not bubble, and the page may be any element.
  page.addEventListener('scroll', onScroll, { capture: true, passive: true })
  for (const type of READER_INPUT) {
    page.addEventListener(type, letGo, { capture: true, passive: true })
  }
  view.addEventListener('hashchange', onFragment)
  const watch: Watch = {
    jumped(id) {
      jumpedTo = fragmentOf(view.location.hash) === id ? null : id
      hold(id)
    },
  }
  watches.set(owner, watch)
  decide()

  return () => {
    observer?.disconnect()
    observed.clear()
    waiting?.disconnect()
    waiting = undefined
    page.removeEventListener('scroll', onScroll, { capture: true })
    for (const type of READER_INPUT) page.removeEventListener(type, letGo, { capture: true })
    view.removeEventListener('hashchange', onFragment)
    if (watches.get(owner) === watch) watches.delete(owner)
  }
}

/**
 * The click on a link to the section `id`, in the list `owner` holds. A click
 * that would navigate this tab marks the section at once, holds the mark, and
 * moves focus to the section, which the browser then scrolls to as it follows
 * the link. Any other click (a modifier key, another button, one a handler
 * already took) stays the browser's, and so does a click on a link whose
 * section is not in the document.
 *
 * Focus moves because a fragment link alone scrolls without moving it (WCAG
 * 2.4.3). A section that cannot take focus is given `tabindex="-1"` for as long
 * as it has focus, so it is never a tab stop, and the attribute goes when
 * focus leaves it. Moving focus does not scroll, so the scroll is the
 * browser's, with the page's `scroll-behavior` and `scroll-margin`.
 */
export function jumpToSection(
  owner: Element | null | undefined,
  id: string,
  event: MouseEvent,
): void {
  if (!owner) return
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return
  }
  const section = owner.ownerDocument.getElementById(id)
  if (!(section instanceof HTMLElement)) return
  watches.get(owner)?.jumped(id)
  if (section.tabIndex < 0 && !section.hasAttribute('tabindex')) {
    section.setAttribute('tabindex', '-1')
    section.addEventListener('blur', () => section.removeAttribute('tabindex'), { once: true })
  }
  section.focus({ preventScroll: true })
}
