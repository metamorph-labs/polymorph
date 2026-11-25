import type { ToastStoreRecord } from './store'

/**
 * What a viewport's two live regions say (`design/components/toast.md`, A11y), for every
 * framework's viewport.
 *
 * A region says a toast when it is raised, also when it is raised again under the same id, and
 * when an update in place changes its title, description, tone or action, and at no other time:
 * a toast that leaves, or an update that changes none of those (a notice whose owner renders
 * again), says nothing. Danger and warning
 * toasts are said in the assertive region and the other tones in the polite one. The words are
 * the catalog's notification word, the title, the description, the text of the content (a
 * notice's retry Button says its label), and the action's label, so a reader who hears the toast
 * learns that it holds something to do.
 *
 * Each announcement has a key of its own, and a viewport draws the words as a new element for a
 * new key. A screen reader says a node that is added to a live region, so two toasts that say
 * the same words in a row are each said. Once none of the toasts a region said is showing, the
 * region is emptied, which a screen reader does not say.
 *
 * The viewport keeps the value this returns, starts from `TOAST_QUIET`, and calls
 * `announceToasts` after each change of the store has been drawn, because the content's text is
 * read from the card in the page. A toast whose card is not drawn yet, such as one raised before
 * the viewport mounted, is left for a later call.
 */

/** What one region says. */
export interface ToastSaying {
  /** Changes with each announcement; the viewport keys the element that holds the words by it. */
  readonly key: number
  readonly words: string
  /** The toasts the words announce. */
  readonly ids: readonly string[]
}

export interface ToastAnnouncements {
  readonly polite: ToastSaying
  readonly assertive: ToastSaying
  /** What each showing toast was last said for: its raise, tone, title, description and action. */
  readonly heard: Readonly<Record<string, string>>
}

/** What the regions say before any toast is shown: nothing. */
export const TOAST_QUIET: ToastAnnouncements = Object.freeze({
  polite: Object.freeze({ key: 0, words: '', ids: [] }),
  assertive: Object.freeze({ key: 0, words: '', ids: [] }),
  heard: Object.freeze({}),
})

const CARD = '[data-member="toast"]'

/** Danger and warning interrupt; the other tones wait. */
const urgent = (record: ToastStoreRecord<unknown>): boolean =>
  record.tone === 'danger' || record.tone === 'warning'

/**
 * What makes a toast's announcement new: a new raise, or new words. The content is not part of
 * it, so a notice whose screen draws its content again says nothing.
 */
const said = (record: ToastStoreRecord<unknown>): string =>
  [
    record.raised,
    record.tone,
    record.title,
    record.description ?? '',
    record.action?.label ?? '',
  ].join('\u001f')

/** The text a screen reader reads in an element: its text, without hidden subtrees. */
function spoken(node: Node): string {
  if (node.nodeType === 3) return node.textContent ?? ''
  if (!(node instanceof Element)) return ''
  if (node.getAttribute('aria-hidden') === 'true' || node.hasAttribute('hidden')) return ''
  if (node.matches('script, style, template')) return ''
  return Array.from(node.childNodes, spoken).join(' ')
}

/**
 * The text of a toast's content, read from its card: the showing cards are the showing
 * records, in order, and the card's title confirms it is this toast's.
 */
function contentOf(record: ToastStoreRecord<unknown>, card: Element | undefined): string {
  if (card === undefined || record.content === undefined) return ''
  const title = card.querySelector('[data-toast-title]')?.textContent?.trim()
  if (title !== record.title.trim()) return ''
  const content = card.querySelector('[data-toast-content]')
  return content === null ? '' : spoken(content)
}

function sentence(
  record: ToastStoreRecord<unknown>,
  card: Element | undefined,
  notification: string,
): string {
  return [
    notification,
    record.title,
    record.description,
    contentOf(record, card),
    record.action?.label,
  ]
    .filter((part): part is string => part !== undefined && part.trim() !== '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** A region's next value: new words under a new key, emptied once none of its toasts shows. */
function next(
  now: ToastSaying,
  fresh: readonly { record: ToastStoreRecord<unknown>; words: string }[],
  heard: Readonly<Record<string, string>>,
): ToastSaying {
  if (fresh.length > 0) {
    return {
      key: now.key + 1,
      words: fresh.map((each) => each.words).join(' '),
      ids: fresh.map((each) => each.record.id),
    }
  }
  if (now.words !== '' && !now.ids.some((id) => id in heard)) {
    return { key: now.key, words: '', ids: [] }
  }
  return now
}

/**
 * What the regions say after a change of the store: `previous` itself when nothing changed, so
 * a framework that keeps it as state draws nothing again.
 */
export function announceToasts(
  previous: ToastAnnouncements,
  records: readonly ToastStoreRecord<unknown>[],
  list: Element | null | undefined,
  notification: string,
): ToastAnnouncements {
  const showing = records.filter((record) => record.closing !== true)
  const cards = list
    ? Array.from(list.querySelectorAll(CARD)).filter(
        (card) => card.getAttribute('data-state') !== 'closed',
      )
    : []
  const heard: Record<string, string> = {}
  const polite: { record: ToastStoreRecord<unknown>; words: string }[] = []
  const assertive: { record: ToastStoreRecord<unknown>; words: string }[] = []
  showing.forEach((record, index) => {
    // A toast whose card is not drawn yet is said on a later call, once its content can be read.
    if (list && cards[index] === undefined) return
    heard[record.id] = said(record)
    if (previous.heard[record.id] === heard[record.id]) return
    const words = sentence(record, cards[index], notification)
    ;(urgent(record) ? assertive : polite).push({ record, words })
  })
  const politeNext = next(previous.polite, polite, heard)
  const assertiveNext = next(previous.assertive, assertive, heard)
  const unchanged =
    politeNext === previous.polite &&
    assertiveNext === previous.assertive &&
    Object.keys(heard).length === Object.keys(previous.heard).length
  return unchanged ? previous : { polite: politeNext, assertive: assertiveNext, heard }
}
