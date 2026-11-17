/**
 * The accessible name and description of a member's control and the text its
 * element shows, as the bridge reports and matches them.
 *
 * This is a small subset of the accessible name computation, enough for the
 * controls the vocabulary renders: the first of `aria-labelledby`,
 * `aria-label`, a `<label>` that wraps the element or names it with `for`,
 * `alt`, a table's caption, the element's own text and `title` that gives a
 * name wins. A dependency that computes the full algorithm would be most of
 * the bridge's size, and every member names its control by one of these.
 */

/** Collapses runs of white space, as a screen reader reads a name. */
const flat = (text: string): string => text.replace(/\s+/g, ' ').trim()

/** Elements whose content is not text the element shows. */
const SKIPPED = new Set(['script', 'style', 'template', 'select', 'textarea'])

/**
 * Elements that run on in a line of text. The text of any other element is
 * read as words of its own, so two tabs in a list read "Open Solved" and not
 * "OpenSolved". The tag decides, not the computed display, because reading a
 * style for every element of every member would cost more than a snapshot
 * should.
 */
const INLINE = new Set(
  'a abbr b bdi bdo cite code data del dfn em i ins kbd mark q s samp small span strong sub sup time u var wbr'.split(
    ' ',
  ),
)

/**
 * The text a node shows: its text nodes and an image's `alt`. A subtree
 * hidden from assistive technology (`aria-hidden="true"`, `hidden`) is left
 * out, and so is the content of the elements in `SKIPPED`: a `<textarea>`'s
 * content is its first value and not what it holds now, and a `<select>`'s is
 * every option it offers. An element outside `INLINE` is set apart from its
 * siblings by a space.
 */
function textOf(node: Node): string {
  if (node.nodeType === 3) return node.textContent ?? ''
  if (node.nodeType !== 1) return ''
  const element = node as Element
  if (element.getAttribute('aria-hidden') === 'true' || element.hasAttribute('hidden')) return ''
  const tag = element.localName
  if (SKIPPED.has(tag)) return ''
  if (tag === 'img') return element.getAttribute('alt') ?? ''
  if (tag === 'br') return ' '
  let text = ''
  for (const child of element.childNodes) {
    const part = textOf(child)
    text += child.nodeType === 1 && !INLINE.has((child as Element).localName) ? ` ${part} ` : part
  }
  return text
}

/** The text an element shows, flattened. */
export function shownText(element: Element | null | undefined): string {
  return element ? flat(textOf(element)) : ''
}

/** The labels that name an element: `element.labels` for a labelable one, else the wrapping `<label>`. */
function labelsOf(element: Element): Element[] {
  const labels = (element as HTMLInputElement).labels
  if (labels && labels.length > 0) return [...labels]
  const found: Element[] = []
  const wrapping = element.parentElement?.closest('label')
  if (wrapping) found.push(wrapping)
  const id = element.id
  if (id !== '') {
    const root = element.getRootNode() as Document | ShadowRoot
    for (const label of root.querySelectorAll?.('label[for]') ?? []) {
      if (label.getAttribute('for') === id && !found.includes(label)) found.push(label)
    }
  }
  return found
}

/** The text of the elements an id-list attribute names, in order, flattened. */
function referencedText(element: Element, attribute: string): string {
  const ids = element.getAttribute(attribute)
  const root = element.getRootNode() as Document | ShadowRoot
  if (ids === null || typeof root.getElementById !== 'function') return ''
  return flat(
    ids
      .split(/\s+/)
      .map((id) => (id === '' ? null : root.getElementById(id)))
      .map((target) => (target ? textOf(target) : ''))
      .join(' '),
  )
}

/**
 * The table a member's element is, or draws as its own: the element itself,
 * its child, or the child of the Table member it holds, as Table's wrapper
 * and DataTable's root hold theirs. A table in what the application passed
 * to a member is deeper, and is not that member's.
 */
function ownTable(element: Element): Element | null {
  if (element.localName === 'table') return element
  return element.querySelector(':scope > table, :scope > [data-member="table"] > table')
}

/**
 * The accessible name of a member's control. A table is named by its caption
 * and never by its cells, which are its data: a name made of every row would
 * grow with the data and name nothing.
 */
export function accessibleName(element: Element | null | undefined): string {
  if (!element) return ''
  const named = referencedText(element, 'aria-labelledby')
  if (named !== '') return named
  const label = flat(element.getAttribute('aria-label') ?? '')
  if (label !== '') return label
  const labelled = flat(labelsOf(element).map(textOf).join(' '))
  if (labelled !== '') return labelled
  const alt = flat(element.getAttribute('alt') ?? '')
  if (alt !== '') return alt
  const table = ownTable(element)
  if (table !== null) {
    const caption = table.querySelector(':scope > caption')
    return caption === null ? '' : flat(textOf(caption))
  }
  const text = shownText(element)
  if (text !== '') return text
  return flat(element.getAttribute('title') ?? '')
}

/**
 * The accessible description of a member's control: the text of the elements
 * its `aria-describedby` names, in order, flattened as a name is. FormField
 * names its hint and its error this way, so an agent that fills a field reads
 * why the field refuses what it holds.
 */
export function accessibleDescription(element: Element | null | undefined): string {
  return element ? referencedText(element, 'aria-describedby') : ''
}
