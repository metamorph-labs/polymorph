'use client'

/**
 * What a frame that stays mounted from page to page does when its page
 * changes (AppShell, `design/archetypes/app-shell.md`, Routing). The browser
 * does nothing on a page change that the app's router makes: focus stays on
 * the link that was followed, or falls to the document when that link leaves
 * it, and nothing says that a new page is showing. So the frame moves focus to
 * the new page and says its title.
 *
 * Focus goes to the page's `<h1>`, the first thing a reader reads, or to the
 * content region when the page has none. It stays where it is when it is
 * already inside the page, because the page put it there (a form's first
 * field) or the reader's control is still on the new page. It also stays
 * where the reader moved it while the page loaded: focus moves only when it is
 * still where it was when the page changed, or has fallen to the document. The
 * heading and the region take `tabindex="-1"` for the move and give it back
 * when focus leaves them (`focusFromScript`).
 *
 * The title is the heading's text, or the document's title when the page has
 * no heading. A polite live region says it only when focus does not land on
 * the heading: a screen reader reads a heading that takes focus, and saying
 * the title as well would read it twice. A reader whose focus stays where it
 * was, or moves to the content region, hears the title from the region.
 *
 * The arrival waits for the next frame. The page is drawn by then, and so is
 * every change the frame makes in the same update: a drawer that closes for
 * the new page has given back the focus it held and made the page reachable
 * again. Where focus is in that frame is where it was when the page changed.
 */

/** What the engine holds for each content region: the page it shows, and the page focus is at. */
interface Pages {
  /** The page the frame shows. */
  key: unknown
  /** The page the frame has arrived at. A page that is loading has not arrived yet. */
  arrived: unknown
  /** Whether `from` has been noted for `key`. */
  noted: boolean
  /** Where focus was when the page changed to `key`. */
  from: Element | null
}

const pages = new WeakMap<HTMLElement, Pages>()

/**
 * Follows the page that `content` shows, and arrives at a new one: a frame
 * from now, moves focus to it and says its title in `region`. Call it when the
 * frame mounts and each time `key` or `pending` changes. The key of the first
 * call is the page the browser loaded, which is no arrival. A page that is
 * `pending` arrives once a call says it no longer is, and a key counts as
 * arrived only once its arrival has run, so a page that starts loading in the
 * frame after it changed still arrives. Returns the function that cancels what
 * the call scheduled.
 */
export function arriveAtPage(
  content: HTMLElement | null | undefined,
  region: HTMLElement | null | undefined,
  key: unknown,
  pending: boolean,
): () => void {
  if (content == null || typeof requestAnimationFrame === 'undefined') return () => {}
  const held = pages.get(content)
  if (held === undefined) {
    pages.set(content, { key, arrived: key, noted: true, from: null })
    return () => {}
  }
  if (key !== held.key) {
    held.key = key
    held.noted = false
  }
  if (key === held.arrived) return () => {}
  const frame = requestAnimationFrame(() => {
    if (!held.noted) {
      held.noted = true
      held.from = document.activeElement
    }
    if (pending) return
    held.arrived = key
    arrive(content, region ?? null, held.from)
  })
  return () => cancelAnimationFrame(frame)
}

function arrive(content: HTMLElement, region: HTMLElement | null, from: Element | null): void {
  if (!content.isConnected) return
  const heading = content.querySelector('h1')
  const title = (heading?.textContent ?? '').trim() || document.title.trim()
  const announce = () => {
    if (region !== null && title !== '') say(region, title)
  }

  const focused = document.activeElement
  const inPage = focused !== null && focused !== content && content.contains(focused)
  const lost = focused === null || focused === document.body
  if (inPage || (focused !== from && !lost)) {
    announce()
    return
  }
  if (heading === null) {
    focusFromScript(content)
    announce()
    return
  }
  focusFromScript(heading)
}

/**
 * Moves focus to an element that is not a tab stop, such as a page's heading
 * or its content region. The element takes `tabindex="-1"` for the move and
 * gives it back when focus leaves it, so it never takes focus from a click on
 * it and never joins the tab order. An element that already has a `tabindex`
 * keeps it. AppShell's skip link moves focus into the content region with it.
 */
export function focusFromScript(element: HTMLElement | null | undefined): void {
  if (element == null) return
  if (!element.hasAttribute('tabindex')) {
    element.setAttribute('tabindex', '-1')
    element.addEventListener('blur', () => element.removeAttribute('tabindex'), { once: true })
  }
  element.focus()
}

/**
 * Writes the words into the region. A region that already holds the same
 * words announces nothing when they are written again, so it is emptied first
 * and written in the next frame: two pages may share a title.
 */
function say(region: HTMLElement, words: string): void {
  if (region.textContent !== words) {
    region.textContent = words
    return
  }
  region.textContent = ''
  requestAnimationFrame(() => {
    region.textContent = words
  })
}
