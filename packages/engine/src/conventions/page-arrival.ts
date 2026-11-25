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
 * field) or the reader's control is still on the new page. The heading takes
 * `tabindex="-1"` for the move and gives it back when focus leaves it.
 *
 * The title is the heading's text, or the document's title when the page has
 * no heading. A polite live region says it, because a reader whose focus does
 * not move hears nothing else.
 *
 * The arrival waits for the next frame. The page is drawn by then, and so is
 * every change the frame makes in the same update: a drawer that closes for
 * the new page has given back the focus it held and made the page reachable
 * again.
 */

/**
 * Moves focus to the new page in `content` and says its title in `region`, a
 * frame from now. Returns the function that cancels it.
 */
export function arriveAtPage(
  content: HTMLElement | null | undefined,
  region: HTMLElement | null | undefined,
): () => void {
  if (content == null || typeof requestAnimationFrame === 'undefined') return () => {}
  const frame = requestAnimationFrame(() => arrive(content, region ?? null))
  return () => cancelAnimationFrame(frame)
}

function arrive(content: HTMLElement, region: HTMLElement | null): void {
  if (!content.isConnected) return
  const heading = content.querySelector('h1')
  const title = (heading?.textContent ?? '').trim() || document.title.trim()
  if (region !== null && title !== '') say(region, title)

  const focused = document.activeElement
  if (focused !== null && focused !== content && content.contains(focused)) return
  if (heading === null) {
    content.focus()
    return
  }
  if (!heading.hasAttribute('tabindex')) {
    heading.setAttribute('tabindex', '-1')
    heading.addEventListener('blur', () => heading.removeAttribute('tabindex'), { once: true })
  }
  heading.focus()
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
