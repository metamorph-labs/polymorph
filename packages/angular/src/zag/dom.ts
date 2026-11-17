/**
 * How a value reaches an element, as Vue writes a prop it does not know onto
 * an element: as a DOM property where the element has one (`disabled`,
 * `value`, `checked`, `id`), and as an attribute otherwise (`aria-*`,
 * `data-*`, `role`, `for`, `tabindex`). The descriptions are written against
 * those rules, so the Angular members follow them: a `false` `disabled` is a
 * property set to `false`, never the attribute `disabled="false"`, and a
 * `false` `aria-expanded` is the attribute `"false"`.
 */

const SVG = 'http://www.w3.org/2000/svg'

/** Attributes the DOM reads as booleans by their presence alone, though no property reflects them. */
const BOOLEAN_ATTRIBUTES = new Set([
  'itemscope',
  'allowfullscreen',
  'formnovalidate',
  'ismap',
  'nomodule',
  'novalidate',
  'readonly',
])

const includeBoolean = (value: unknown) => !!value || value === ''

/** Whether `key` is written as the element's DOM property rather than an attribute. */
export function isDomProperty(element: Element, key: string, value: unknown): boolean {
  if (element.namespaceURI === SVG) return key === 'innerHTML' || key === 'textContent'
  if (key === 'spellcheck' || key === 'draggable' || key === 'translate' || key === 'autocorrect')
    return false
  if (key === 'form') return false
  if (key === 'list' && element.tagName === 'INPUT') return false
  if (key === 'type' && element.tagName === 'TEXTAREA') return false
  if (key === 'width' || key === 'height') {
    const tag = element.tagName
    if (tag === 'IMG' || tag === 'VIDEO' || tag === 'CANVAS' || tag === 'SOURCE') return false
  }
  if (/^on[a-z]/.test(key) && typeof value === 'string') return false
  return key in element
}

/** Writes one value onto an element as a DOM property, as Vue's `patchDOMProp` does. */
function writeProperty(element: Element, key: string, value: unknown): void {
  const target = element as unknown as Record<string, unknown>
  if (key === 'innerHTML' || key === 'textContent') {
    if (value !== null && value !== undefined) target[key] = value
    return
  }
  const tag = element.tagName
  if (key === 'value' && tag !== 'PROGRESS' && !tag.includes('-')) {
    const field = element as HTMLInputElement
    const old = tag === 'OPTION' ? (element.getAttribute('value') ?? '') : field.value
    const next =
      value === null || value === undefined
        ? field.type === 'checkbox'
          ? 'on'
          : ''
        : String(value)
    if (old !== next) field.value = next
    if (value === null || value === undefined) element.removeAttribute(key)
    return
  }
  let next = value
  let remove = false
  if (value === '' || value === null || value === undefined) {
    const type = typeof target[key]
    if (type === 'boolean') next = includeBoolean(value)
    else if ((value === null || value === undefined) && type === 'string') {
      next = ''
      remove = true
    } else if (type === 'number') {
      next = 0
      remove = true
    }
  }
  try {
    target[key] = next
  } catch {
    // A read-only property (an input's `form`) keeps its value, as Vue leaves it.
  }
  if (remove) element.removeAttribute(key)
}

/** Writes one value onto an element as an attribute, as Vue's `patchAttr` does. */
function writeAttribute(element: Element, key: string, value: unknown): void {
  const isBoolean = BOOLEAN_ATTRIBUTES.has(key)
  if (value === null || value === undefined || (isBoolean && !includeBoolean(value))) {
    element.removeAttribute(key)
  } else {
    element.setAttribute(key, isBoolean ? '' : String(value))
  }
}

/** Writes one value onto an element: a property, or an attribute. */
export function writeValue(element: Element, key: string, value: unknown): void {
  if (isDomProperty(element, key, value)) writeProperty(element, key, value)
  else writeAttribute(element, key, value)
}

/** A style object's properties onto an element, removing the ones `before` set and `next` does not. */
export function writeStyle(
  element: HTMLElement | SVGElement,
  next: Readonly<Record<string, unknown>>,
  before: Readonly<Record<string, unknown>>,
): void {
  const property = (name: string) =>
    name.startsWith('--') ? name : name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
  for (const name of Object.keys(before)) {
    if (!(name in next) || next[name] === null || next[name] === undefined)
      element.style.removeProperty(property(name))
  }
  for (const [name, value] of Object.entries(next)) {
    if (value === null || value === undefined || value === '') {
      element.style.removeProperty(property(name))
      continue
    }
    element.style.setProperty(property(name), String(value))
  }
}
