/**
 * What an agent chooses among in a menu, and how a choice runs, for every
 * renderer's Menu, ContextMenu and Menubar (`design/components/menu.md`,
 * `context-menu.md` and `menubar.md`, Agent). The entries are the shape the
 * three take: commands, checkbox entries, separators, labels and submenus one
 * level deep, and a Menubar's titles above them.
 */

/** A menu entry, as the members that draw a menu take it. */
export interface MenuChoiceEntry {
  readonly kind?: string
  readonly label?: string
  readonly disabled?: boolean
  readonly tone?: string
  readonly checked?: boolean
  readonly onSelect?: () => void
  readonly onCheckedChange?: (checked: boolean) => void
  readonly items?: readonly MenuChoiceEntry[]
}

/** One entry an agent can choose, as a `choices` state lists it. */
export interface MenuChoice {
  readonly id: string
  readonly label: string
  readonly disabled?: true
  readonly destructive?: true
}

interface Found {
  readonly choice: MenuChoice
  readonly entry: MenuChoiceEntry
}

/** Every entry that runs something, a submenu's among them, with the id each is chosen by. */
function found(entries: readonly MenuChoiceEntry[]): Found[] {
  const out: Found[] = []
  const taken = new Map<string, number>()
  const add = (entry: MenuChoiceEntry, path: string, disabled: boolean) => {
    const seen = (taken.get(path) ?? 0) + 1
    taken.set(path, seen)
    const id = seen === 1 ? path : `${path} (${seen})`
    out.push({
      entry,
      choice: {
        id,
        label: entry.label ?? '',
        ...(disabled || entry.disabled === true ? { disabled: true as const } : {}),
        ...(entry.tone === 'danger' ? { destructive: true as const } : {}),
      },
    })
  }
  // A submenu's entries take its label before their own, and its disabled state. Menu's grammar
  // has one level of submenu; a Menubar's title is one more (`menubarChoices`).
  const walk = (list: readonly MenuChoiceEntry[], prefix: string, disabled: boolean) => {
    for (const entry of list) {
      if (entry.kind === 'separator' || entry.kind === 'label') continue
      const path = `${prefix}${entry.label ?? ''}`
      if (entry.kind === 'submenu') {
        walk(entry.items ?? [], `${path} / `, disabled || entry.disabled === true)
        continue
      }
      add(entry, path, disabled)
    }
  }
  walk(entries, '', false)
  return out
}

/**
 * The entries an agent can choose: each command and each checkbox entry, a
 * submenu's among them, in order. An entry's id is its label, and a
 * submenu's entry's is the submenu's label and its own joined by ` / `, so an
 * id names the same entry in every renderer and still names it when entries
 * are added around it. A repeated id takes ` (2)`, ` (3)` after it. A disabled
 * submenu's entries are disabled, and a `danger`-toned entry is destructive.
 */
export function menuChoices(entries: readonly MenuChoiceEntry[]): MenuChoice[] {
  return found(entries).map(({ choice }) => choice)
}

/**
 * Runs the entry an id names, as a person's choice does: a command's
 * `onSelect`, or a checkbox entry's `onCheckedChange` with the opposite of
 * `checked`. Returns whether the entry was a command, which closes the menu
 * that chose it. Throws for an id that names no entry.
 */
export function chooseMenuEntry(entries: readonly MenuChoiceEntry[], id: string): boolean {
  const match = found(entries).find(({ choice }) => choice.id === id)
  if (match === undefined) throw new Error(`No menu entry has the id "${id}".`)
  const { entry } = match
  if (entry.kind === 'checkbox') {
    entry.onCheckedChange?.(entry.checked !== true)
    return false
  }
  entry.onSelect?.()
  return true
}

/** A Menubar's menu, as `menubar.md` gives it: a title over Menu's entries. */
export interface MenubarChoiceMenu {
  readonly label: string
  readonly entries: readonly MenuChoiceEntry[]
  readonly disabled?: boolean
}

/** A Menubar's menus as submenus of one menu, so each entry's id begins with its title. */
const titled = (menus: readonly MenubarChoiceMenu[]): MenuChoiceEntry[] =>
  menus.map((menu) => ({
    kind: 'submenu',
    label: menu.label,
    items: menu.entries,
    ...(menu.disabled === true ? { disabled: true } : {}),
  }))

/**
 * The entries an agent can choose in a Menubar: every menu's, as
 * `menuChoices` reads a submenu's, so an entry's id is its title and its own
 * label joined by ` / ` (`File / Save`), and a submenu's entry's has the
 * submenu's label between (`File / Open recent / Quarterly plan`). Every
 * entry of a disabled menu is disabled.
 */
export function menubarChoices(menus: readonly MenubarChoiceMenu[]): MenuChoice[] {
  return menuChoices(titled(menus))
}

/** Runs the Menubar entry an id names, as `chooseMenuEntry` runs a Menu's. */
export function chooseMenubarEntry(menus: readonly MenubarChoiceMenu[], id: string): boolean {
  return chooseMenuEntry(titled(menus), id)
}
