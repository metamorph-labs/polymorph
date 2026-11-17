import { agentPress } from './agent'

/**
 * What an agent picks in a List, and how it picks one, for every renderer's
 * List (`design/components/list.md`, Agent). The application composes the
 * items as children, so the List holds no list of them: these read the items
 * from the List's `<ul>` in the document. ErrorSummary reads its errors' links
 * from its `<ul>` with the same functions (`error-summary.md`, Agent), so the
 * two read a link and its id the same way.
 *
 * Each takes the class the List's recipe gives the link or the button that
 * takes an item's press, as the member reads it from its CSS module, where a
 * class may be missing. An item that is only read has no such element, so it
 * is not an item an agent picks. With no class there are no items.
 */

/** One item an agent can pick, as a `choices` state lists it. */
export interface ListItemChoice {
  readonly id: string
  readonly label: string
}

interface Found {
  readonly choice: ListItemChoice
  readonly element: HTMLElement
  readonly current: boolean
}

/** A selector for every class a class attribute's value holds: `a b` is `.a.b`. */
const selectorOf = (classes: string): string =>
  classes
    .split(/\s+/)
    .filter((name) => name !== '')
    .map((name) => `.${CSS.escape(name)}`)
    .join('')

const words = (text: string | null | undefined): string => (text ?? '').replace(/\s+/g, ' ').trim()

/** Each item's link or button, in document order, with the id it is picked by. */
function found(list: Element | null | undefined, target: string | undefined): Found[] {
  if (!list || !target || selectorOf(target) === '') return []
  // `Array.from`, not a spread: the packages that build the engine's source type it without the
  // DOM's iterables. An item of a List drawn inside this one belongs to that List.
  const items = Array.from(list.querySelectorAll<HTMLElement>(selectorOf(target))).filter(
    (element) => element.closest('ul') === list,
  )
  const taken = new Set<string>()
  return items.map((element) => {
    const label = words(element.textContent)
    // The `href` as the item writes it, not as the browser resolves it.
    const base = element.getAttribute('href') ?? label
    let id = base
    for (let seen = 2; taken.has(id); seen += 1) id = `${base} (${seen})`
    taken.add(id)
    return {
      element,
      current: (element.getAttribute('aria-current') ?? 'false') !== 'false',
      choice: { id, label },
    }
  })
}

/**
 * The items an agent can pick: each item of the list that navigates or is
 * picked, in document order. An item's id is its `href` where it has one, else
 * its title, so an id names the same item in every renderer and still names it
 * when items are added around it. A second item that would share an id takes
 * ` (2)` after it, a third ` (3)`, so every row a person can press is a choice.
 */
export function listItems(
  list: Element | null | undefined,
  target: string | undefined,
): ListItemChoice[] {
  return found(list, target).map(({ choice }) => choice)
}

/** The id of the item whose link or button carries `aria-current`, or `null` when none does. */
export function currentListItem(
  list: Element | null | undefined,
  target: string | undefined,
): string | null {
  return found(list, target).find((item) => item.current)?.choice.id ?? null
}

/**
 * Picks the item an id names by pressing its link or button with the
 * element's own `click()`, so `onSelect` runs, and the application's router or
 * the browser takes a link, as they take a person's press. Throws for an id
 * that names no item.
 */
export function chooseListItem(
  list: Element | null | undefined,
  target: string | undefined,
  id: string,
): void {
  const match = found(list, target).find((item) => item.choice.id === id)
  if (match === undefined) throw new Error(`No item in the list has the id "${id}".`)
  agentPress(match.element)
}
