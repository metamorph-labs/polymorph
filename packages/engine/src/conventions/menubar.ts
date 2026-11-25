import { readDirection, type ReadingDirection } from './direction'

/**
 * Menubar's keyboard model (`design/components/menubar.md`): which title a key
 * moves focus to along the bar, which keys open a title's menu and at which
 * end of it, and which neighbour a key in an open menu hands the bar over to.
 * Every framework's Menubar runs it, so each one moves, opens and hands over
 * the same way. The menus themselves are each framework's menu substrate.
 *
 * The bar follows the ARIA Authoring Practices' menubar pattern. It is one tab
 * stop. The arrows that point along the row follow the reading direction, and
 * a move stops at either end, as a Menu's list does. A disabled title is passed
 * over, as a Menu passes over a disabled command.
 */

/** One title of the bar, as the model reads it. */
export interface MenubarTitle {
  readonly label: string
  readonly disabled?: boolean | undefined
}

/** The end of a menu that a key opens it at: its first entry or its last. */
export type MenubarEnd = 'first' | 'last'

/** Where focus is in an open menu when a key that points along the row is pressed. */
export type MenubarPlace = 'entry' | 'submenu-row' | 'submenu'

const enabled = (title: MenubarTitle | undefined): boolean =>
  title !== undefined && title.disabled !== true

/** The next enabled title from `from` in the direction of `by`, or `undefined` past the end. */
function neighbour(titles: readonly MenubarTitle[], from: number, by: 1 | -1): number | undefined {
  for (let at = from + by; at >= 0 && at < titles.length; at += by) {
    if (enabled(titles[at])) return at
  }
  return undefined
}

/** The first or the last enabled title, or `undefined` when every title is disabled. */
function edge(titles: readonly MenubarTitle[], end: MenubarEnd): number | undefined {
  return end === 'first' ? neighbour(titles, -1, 1) : neighbour(titles, titles.length, -1)
}

/**
 * The title that holds the bar's one tab stop: the title focus was last on,
 * while it is in the bar and enabled, and the first enabled title otherwise.
 * It is `null` when every title is disabled.
 */
export function menubarStop(titles: readonly MenubarTitle[], last: string | null): string | null {
  const held = titles.find((title) => title.label === last)
  if (enabled(held)) return (held as MenubarTitle).label
  const first = edge(titles, 'first')
  return first === undefined ? null : (titles[first] as MenubarTitle).label
}

/** Whether a key is one printable character, which moves to a title that starts with it. */
function printable(key: string): boolean {
  return [...key].length === 1 && key.trim() !== ''
}

/** The step a key takes along the row: 1 to the next title, -1 to the previous one. */
function along(key: string, direction: ReadingDirection): 1 | -1 | undefined {
  const forward = direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight'
  const backward = direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft'
  if (key === forward) return 1
  if (key === backward) return -1
  return undefined
}

/**
 * The title a key moves focus to from the title at `from`, or `undefined` for
 * a key the bar does not take.
 *
 * ArrowRight and ArrowLeft move to the next and the previous enabled title. In
 * a right-to-left document the row starts at the right, so the arrow that
 * points left moves to the next title. A move stops at either end and stays
 * on the title it started from. Home and End move to the first and the last
 * enabled title. A printable character moves to the next enabled title whose
 * label starts with it, wrapping past the last title, and is not taken when no
 * label does.
 */
export function menubarStep(
  key: string,
  from: number,
  titles: readonly MenubarTitle[],
  direction: ReadingDirection,
): number | undefined {
  if (key === 'Home') return edge(titles, 'first')
  if (key === 'End') return edge(titles, 'last')
  const by = along(key, direction)
  if (by !== undefined) return neighbour(titles, from, by) ?? from
  if (!printable(key)) return undefined
  const typed = key.toLowerCase()
  for (let step = 1; step <= titles.length; step += 1) {
    const at = (from + step) % titles.length
    const title = titles[at]
    if (enabled(title) && (title as MenubarTitle).label.trim().toLowerCase().startsWith(typed))
      return at
  }
  return undefined
}

/**
 * The end of its menu a key on a title opens it at, or `undefined` for a key
 * that opens nothing. ArrowDown, Enter and Space open it with focus on its
 * first entry, and ArrowUp with focus on its last.
 */
export function menubarOpens(key: string): MenubarEnd | undefined {
  if (key === 'ArrowDown' || key === 'Enter' || key === ' ') return 'first'
  if (key === 'ArrowUp') return 'last'
  return undefined
}

/**
 * The title whose menu a key in the open menu of the title at `from` hands
 * the bar over to, or `undefined` when the key stays in the menu.
 *
 * ArrowRight and ArrowLeft, in the reading direction, close the menu and open
 * the next or the previous enabled title's. Two keys stay in the menu: the key
 * that points forward on a row that opens a submenu enters that submenu, and
 * the key that points back inside a submenu closes the submenu. At either end
 * of the row the menu stays open.
 */
export function menubarHandOff(
  key: string,
  from: number,
  titles: readonly MenubarTitle[],
  direction: ReadingDirection,
  place: MenubarPlace,
): number | undefined {
  const by = along(key, direction)
  if (by === undefined) return undefined
  if (by === 1 && place === 'submenu-row') return undefined
  if (by === -1 && place === 'submenu') return undefined
  return neighbour(titles, from, by)
}

/** A menu of the bar, as the phone form reads it: its title and its entries. */
export interface MenubarMenuEntries<Entry> {
  readonly label: string
  readonly disabled?: boolean | undefined
  readonly entries: readonly Entry[]
}

/**
 * The entries of the one Menu the bar becomes at a phone's width: each menu as
 * a group, its title as the group's label and its entries under it, with a
 * separator between two groups. A disabled menu is its label alone, as a Menu
 * draws a disabled submenu in its sheet, because listing its commands as
 * disabled would say more than the bar does.
 */
export function menubarEntries<Entry>(
  menus: readonly MenubarMenuEntries<Entry>[],
): (Entry | { kind: 'label'; label: string } | { kind: 'separator' })[] {
  return menus.flatMap((menu, at) => [
    ...(at === 0 ? [] : [{ kind: 'separator' as const }]),
    { kind: 'label' as const, label: menu.label },
    ...(menu.disabled === true ? [] : menu.entries),
  ])
}

/* The document: what each renderer's titles and panels call --------------- */

/** The parts of a keyboard event the bar reads, which a DOM event and React's both have. */
export interface MenubarKeyEvent {
  readonly key: string
  readonly metaKey: boolean
  readonly ctrlKey: boolean
  readonly altKey: boolean
  readonly target: EventTarget | null
  readonly currentTarget: EventTarget | null
  preventDefault(): void
}

/** The hook every renderer writes on each title, which the model finds the titles by. */
const TITLE = '[data-menubar-part="title"]'

/** A bar's titles, in document order, as the model reads them. */
function titlesOf(bar: Element): { elements: HTMLElement[]; titles: MenubarTitle[] } {
  const elements = Array.from(bar.querySelectorAll<HTMLElement>(TITLE))
  const titles = elements.map((element) => ({
    label: element.textContent ?? '',
    disabled: element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true',
  }))
  return { elements, titles }
}

const modified = (event: MenubarKeyEvent): boolean => event.metaKey || event.ctrlKey || event.altKey

/**
 * A key on a title: focus moves to the title `menubarStep` names. It returns
 * whether the bar took the key. A key with a modifier is left to the browser,
 * and so is every key that opens a menu, which the title's substrate handles.
 */
export function roveMenubar(event: MenubarKeyEvent): boolean {
  if (modified(event)) return false
  const title = event.currentTarget
  if (!(title instanceof HTMLElement)) return false
  const bar = title.closest('[role="menubar"]')
  if (bar === null) return false
  const { elements, titles } = titlesOf(bar)
  const from = elements.indexOf(title)
  if (from === -1) return false
  const to = menubarStep(event.key, from, titles, readDirection(bar))
  if (to === undefined) return false
  event.preventDefault()
  elements[to]?.focus()
  return true
}

/**
 * A key in an open menu: the place in the bar of the title whose menu the bar
 * hands over to, or `undefined` when the key stays in the menu. The open
 * menu's title is the one whose `aria-expanded` is `true`. The key's place is
 * read from the focused element: a row that carries `aria-haspopup` opens a
 * submenu, and an element whose nearest menu is not the open menu's panel is
 * inside one. The panel is the element the listener is on, unless `panel`
 * names it: a renderer whose submenu is not inside its panel listens on the
 * submenu too.
 */
export function menubarNeighbour(
  event: MenubarKeyEvent,
  bar: Element | null | undefined,
  panel: Element | null = null,
): number | undefined {
  if (!bar || modified(event)) return undefined
  const list = panel ?? event.currentTarget
  const focused = event.target
  if (!(list instanceof Element) || !(focused instanceof Element)) return undefined
  const { elements, titles } = titlesOf(bar)
  const from = elements.findIndex((title) => title.getAttribute('aria-expanded') === 'true')
  if (from === -1) return undefined
  const place: MenubarPlace =
    focused.closest('[role="menu"]') !== list && focused !== list
      ? 'submenu'
      : focused.getAttribute('aria-haspopup') === 'menu'
        ? 'submenu-row'
        : 'entry'
  return menubarHandOff(event.key, from, titles, readDirection(bar), place)
}

/**
 * The first or the last enabled row of an open menu's own list, not a
 * submenu's, which a renderer focuses when a key opens the menu at that end.
 */
export function menubarEdge(
  panel: Element | null | undefined,
  end: MenubarEnd,
): HTMLElement | undefined {
  if (!panel) return undefined
  const rows = Array.from(panel.querySelectorAll<HTMLElement>('[role^="menuitem"]')).filter(
    (row) =>
      row.closest('[role="menu"]') === panel &&
      row.getAttribute('aria-disabled') !== 'true' &&
      !row.hasAttribute('data-disabled'),
  )
  return end === 'first' ? rows[0] : rows[rows.length - 1]
}
