import { agentPress } from './agent'

/**
 * What an agent goes to in an application's navigation, and how it goes
 * there, for every renderer's AppShell (`design/archetypes/app-shell.md`,
 * Agent). The application composes the rail's items as children, so the shell
 * holds no list of them: these read the items from the rail in the document.
 * The rail is the same element in the rail layout, along the top and in the
 * drawer below the breakpoint, so the destinations read the same in all three.
 */

/**
 * The classes the shell's recipe gives each item of its rail and the item's
 * label, as the member reads them from its CSS module, where a class may be
 * missing. With no item class there are no items, and with no label class an
 * item's label is its text.
 */
export interface RailClasses {
  /** The class on each item's root, an `<a>` or a `<button>`. */
  readonly item: string | undefined
  /** The class on the element inside an item that holds its label. */
  readonly label: string | undefined
}

/** One destination an agent can go to, as a `choices` state lists it. */
export interface RailDestination {
  readonly id: string
  readonly label: string
  readonly disabled?: true
}

interface Found {
  readonly destination: RailDestination
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

/** Every item of the rail, in document order, with the id each is gone to by. */
function found(rail: Element | null | undefined, classes: RailClasses): Found[] {
  if (!rail || !classes.item) return []
  const labelled = classes.label ? selectorOf(classes.label) : undefined
  // `Array.from`, not a spread: the packages that build the engine's source type it without the
  // DOM's iterables.
  const items = Array.from(
    rail.querySelectorAll<HTMLElement>(selectorOf(classes.item)),
    (element) => {
      const label = words(
        ((labelled === undefined ? null : element.querySelector(labelled)) ?? element).textContent,
      )
      const group = element.closest('[role="group"]')
      return {
        element,
        label,
        // The `href` as the item writes it, not as the browser resolves it.
        base: element.getAttribute('href') ?? label,
        group:
          group !== null && rail.contains(group) ? words(group.getAttribute('aria-label')) : '',
        disabled: element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true',
        current: (element.getAttribute('aria-current') ?? 'false') !== 'false',
      }
    },
  )
  const taken = new Map<string, number>()
  return items.map((item) => {
    const shared = items.some((other) => other !== item && other.base === item.base)
    const path = shared && item.group !== '' ? `${item.group} / ${item.base}` : item.base
    const seen = (taken.get(path) ?? 0) + 1
    taken.set(path, seen)
    return {
      element: item.element,
      current: item.current,
      destination: {
        id: seen === 1 ? path : `${path} (${seen})`,
        label: item.label,
        ...(item.disabled ? { disabled: true as const } : {}),
      },
    }
  })
}

/**
 * The destinations an agent can go to: each item of the rail, in document
 * order. An item's id is its `href` where it has one, else its label, so an
 * id names the same item in every renderer and still names it when items are
 * added around it. Two items that would share an id each take their group's
 * label before it, joined by ` / ` (`Workspace / Settings`), and an id still
 * shared takes ` (2)`, ` (3)` after it. An item that is a disabled control, or
 * that says `aria-disabled="true"`, is disabled.
 */
export function railDestinations(
  rail: Element | null | undefined,
  classes: RailClasses,
): RailDestination[] {
  return found(rail, classes).map(({ destination }) => destination)
}

/** The id of the item the rail marks current with `aria-current`, or `null` when none is. */
export function currentRailDestination(
  rail: Element | null | undefined,
  classes: RailClasses,
): string | null {
  return found(rail, classes).find((item) => item.current)?.destination.id ?? null
}

/**
 * Goes to the destination an id names by pressing its item with the item's
 * own `click()`, so the application's router or the browser takes it as it
 * takes a person's press. Throws for an id that names no item, and for a
 * disabled item.
 */
export function goToRailDestination(
  rail: Element | null | undefined,
  classes: RailClasses,
  id: string,
): void {
  const match = found(rail, classes).find((item) => item.destination.id === id)
  if (match === undefined) throw new Error(`No destination in the rail has the id "${id}".`)
  if (match.destination.disabled === true) throw new Error(`The destination "${id}" is disabled.`)
  agentPress(match.element)
}
