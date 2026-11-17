import { agentPress } from './agent'

/**
 * What an agent opens and closes in a JsonTree, and how, for every renderer's
 * JsonTree (`design/components/json-tree.md`, Agent). Each branch holds whether
 * it is open, so the tree holds no list of them: these read the branches from
 * the tree's `<ul>` in the document, by their toggles.
 *
 * Each takes the classes the JsonTree's recipe gives a branch's toggle and the
 * key inside it, as the member reads them from its CSS module, where a class
 * may be missing. With no toggle class there are no branches.
 */

/** One branch an agent can open or close, as a `choices` state lists it. */
export interface JsonTreeBranch {
  readonly id: string
  readonly label: string
}

interface Found {
  readonly branch: JsonTreeBranch
  readonly toggle: HTMLElement
  readonly open: boolean
}

/** A selector for every class a class attribute's value holds: `a b` is `.a.b`. */
const selectorOf = (classes: string): string =>
  classes
    .split(/\s+/)
    .filter((name) => name !== '')
    .map((name) => `.${CSS.escape(name)}`)
    .join('')

const words = (text: string | null | undefined): string => (text ?? '').replace(/\s+/g, ' ').trim()

/**
 * The key an element holds: its own text, without the text of the colon
 * element inside it. A key is the data's, so it is read whole, spaces and all.
 */
const keyText = (key: Element): string =>
  Array.from(key.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? '')
    .join('')

/** A key as a JSON Pointer writes it (RFC 6901): `~` is `~0` and `/` is `~1`. */
const escaped = (key: string): string => key.replace(/~/g, '~0').replace(/\//g, '~1')

/**
 * The JSON Pointer of the value a toggle opens: the keys of its row and of
 * every row it sits in, from the tree's root down. The root value has no key,
 * so its pointer is the empty string.
 */
function pointerOf(tree: Element, toggle: HTMLElement, toggles: string, key: string): string {
  const keys: string[] = []
  let row = toggle.closest('li')
  while (row !== null && tree.contains(row)) {
    const own = Array.from(row.children).find((child) => child.matches(toggles))
    const held = own === undefined || key === '' ? null : own.querySelector(key)
    if (held !== null) keys.unshift(keyText(held))
    row = row.parentElement?.closest('li') ?? null
  }
  return keys.map((name) => `/${escaped(name)}`).join('')
}

/** Each toggle of the tree, in document order, with the pointer it is opened by. */
function found(
  tree: Element | null | undefined,
  toggle: string | undefined,
  key: string | undefined,
): Found[] {
  if (!tree || !toggle || selectorOf(toggle) === '') return []
  const toggles = selectorOf(toggle)
  const keys = key ? selectorOf(key) : ''
  // `Array.from`, not a spread: the packages that build the engine's source type it without the
  // DOM's iterables.
  return Array.from(tree.querySelectorAll<HTMLElement>(toggles), (element) => ({
    toggle: element,
    open: element.getAttribute('aria-expanded') === 'true',
    branch: { id: pointerOf(tree, element, toggles, keys), label: words(element.textContent) },
  }))
}

/**
 * The branches an agent can open or close: each toggle a reader can see, in
 * document order. A branch's id is the JSON Pointer of its value in the data
 * (`/assignee`, `/labels/0`, and the empty string for the root), so an id names
 * the same branch in every renderer, and still names it while other branches
 * open and close. Its label is its toggle's text: the key and the summary.
 */
export function jsonTreeBranches(
  tree: Element | null | undefined,
  toggle: string | undefined,
  key: string | undefined,
): JsonTreeBranch[] {
  return found(tree, toggle, key).map(({ branch }) => branch)
}

/** The ids of the branches whose toggle says they are open, in document order. */
export function jsonTreeExpanded(
  tree: Element | null | undefined,
  toggle: string | undefined,
  key: string | undefined,
): string[] {
  return found(tree, toggle, key)
    .filter(({ open }) => open)
    .map(({ branch }) => branch.id)
}

/**
 * Opens or closes the branch an id names by pressing its toggle with the
 * element's own `click()`, as a person's press does. A branch that is already
 * as asked is left alone. Throws for an id that names no branch.
 */
export function setJsonTreeBranch(
  tree: Element | null | undefined,
  toggle: string | undefined,
  key: string | undefined,
  id: string,
  open: boolean,
): void {
  const match = found(tree, toggle, key).find(({ branch }) => branch.id === id)
  if (match === undefined) throw new Error(`No branch of the tree has the id "${id}".`)
  if (match.open !== open) agentPress(match.toggle)
}
