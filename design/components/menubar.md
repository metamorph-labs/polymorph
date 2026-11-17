# Menubar

An application's commands as a row of titles, each of which opens a menu of commands, as a
desktop application's File, Edit and View do. It is for an editor, a canvas or a document tool
whose commands are too many for one Menu and fall into a few named groups.

It is **not navigation**. A title never links and never moves to another page: moving between
pages is links in a `nav`, which AppShell's rail and its top navigation, SectionNav and Tabs
draw. It is **not a toolbar**: a few frequent commands are Buttons in a row, and a page's own
commands are its PageHeader's actions with an overflow Menu. Most screens have no Menubar. A
screen with fewer than three titles has a Menu behind one Button instead.

Each menu is **Menu's**: the same `MenuEntry` grammar, drawn by the same rows with Menu's
recipe. The React member puts each title on `@radix-ui/react-dropdown-menu`, Menu's substrate,
and the other web renderers put the whole bar on one Zag menu machine with a trigger per title.
The bar's keys, its one tab stop and the hand-off between neighbouring menus are the engine's
menubar model (`packages/engine/src/conventions/menubar.ts`), which every renderer runs.

## Anatomy

```
[bar — role="menubar", named by `label`]
  [title — role="menuitem", aria-haspopup="menu"]*
[panel — Menu's panel, under the open title, named by it]
  [item | checkbox | separator | group-label | submenu]*   (Menu's grammar)
```

Below the sheet presentation's threshold:

```
[root]
  [Menu — one Button iconOnly icon="overflow", named by `label`]
    [group-label: a title] [its entries]* [separator] …
```

## API

```ts
interface MenubarMenu {
  label: string          // the title, which also names its menu; each title of a bar is its own
  entries: MenuEntry[]   // menu.md's grammar, unchanged: each entry reports through its own handler
  disabled?: boolean     // the keys pass over it and nothing opens it
}

interface MenubarProps {
  label: string          // names the bar: "Document", not "Menu bar"
  menus: MenubarMenu[]   // the titles, in reading order
  defaultOpen?: string   // the title whose menu is open on mount, for galleries and tests
}
```

`entries` is Menu's `MenuEntry[]` (`menu.md`): commands with an icon, a `kbd` hint and a
danger tone, checkbox entries that toggle without closing, separators, group labels and one
level of submenu. A command reports through its own `onSelect` and a checkbox through its own
`onCheckedChange`, as in Menu, so the bar has no handler of its own. A `kbd` hint is a display,
never a binding: the application binds its shortcuts.

```ts
// The handlers of menu.md's `MenuEntry`, unchanged.
type EntryHandlers = {
  onSelect: () => void // a command
  onCheckedChange: (checked: boolean) => void // a checkbox entry, with the state it moves to
}
```

The bar writes no word of its own. At a phone's width its one Button is named by `label`.

Attributes: the bar carries `data-member="menubar"`, and so does each open panel. A title
carries `data-menubar-part="title"` and a panel `data-menubar-part="panel"`, which the
keyboard model and the conformance law read. A title whose menu is open has
`data-state="open"`. A disabled title is a disabled button. Rows carry Menu's attributes. The
rest state is a row of enabled titles with no menu open.

## Recipe (exact tokens)

| Part | Tokens |
| --- | --- |
| bar | flex row · gap `--pm-space-1` · `min-inline-size: 0` · scrolls inline inside its own box when it is longer than the box · padding the focus ring's reach, taken back by negative margins (not at the inline end) · thin scrollbar, thumb `--pm-border-strong` |
| title | height `--pm-control-height-sm` · padding-x `--pm-space-3` · radius `--pm-radius-sm` · `text.sm` · text `--pm-text-primary` · no wrap · the focus convention's ring |
| title hover | bg `--pm-bg-subtle`, the ghost Button's wash, and none where the system gives quiet controls no hover wash |
| title open | bg `--pm-accent-subtle` · text `--pm-accent-text`: Menu's highlighted row |
| title disabled | text `--pm-text-disabled` · `cursor: not-allowed` |
| panel and rows | Menu's recipe: each class composes Menu's class of the same name (`menu.md`) |

The panel opens under its title, aligned to the title's start edge, at Menu's anchored-surface
offset of 2px. Collision handling keeps it on screen.

## Width

**A long row.** The bar never wraps and never widens the page. A bar longer than its container
scrolls inside its own box, and the browser brings a focused title into view.

**A phone.** Below the sheet presentation's threshold (`30rem`, where Menu becomes a sheet) the
row does not fit, so the bar becomes **one Menu behind one Button**: `iconOnly`, the `overflow`
glyph, named by `label`. Its entries are the menus as groups: each title is a group label with
its entries under it, and a separator stands between two groups. A disabled menu is its label
alone, as Menu's sheet draws a disabled submenu. Menu draws that list as its sheet at this
width, and flattens a menu's own submenus into it as it does any submenu. No title is lost, no
command is added, and nothing scrolls sideways.

**In an AppShell.** A Menubar sits in the topbar's `leading` slot, where an editor's commands
belong. The slot wraps and does not widen the frame, and the bar scrolls inside it when the
topbar is short of room.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| resting — the titles, and no menu open | File, Edit, View, Help | a row of four titles; File holds the tab stop |
| one menu open — its panel under its title, at its start edge | `defaultOpen="File"`: commands with icons and hints, a submenu, separators and a danger command | File's title is open, and Menu's panel is under it |
| checkbox entries — toggles that leave the menu open | `defaultOpen="View"`: a group label, checked, unchecked and disabled checkbox entries, two commands | the checks drawn in Menu's check column |
| a disabled title — passed over by the keys | Insert disabled between Edit and View | Insert is drawn disabled |
| a long row in a narrow box — the row scrolls inside it | ten titles in a box narrower than them | the row scrolls in its box; the page does not |

The phone form and the right-to-left row are what every entry becomes at a phone's width and in
a right-to-left document. No prop reaches either, so neither is an entry of its own: the
member's tests and the shared law render them.

`requiredSelectors`: `[data-state="open"]`, `:hover`, `:focus-visible`, `:disabled`,
`[data-highlighted]`, `[data-state="checked"]`.

## Motion

The panel is Menu's: `scale-fade` from its anchored origin, the **surface** class, and the
`menu.items` cascade, from Menu's recipe through `composes`. A hand-off closes one panel and
opens the next. A title's wash changes on the control state-feedback timing. At `none` and
under reduced motion, Menu's projections apply.

## Icons

The phone form's Button shows `overflow`, the action group's glyph for a list of commands
behind a control, and not `menu`, which AppShell's topbar uses for its navigation drawer.
Entries take icons as Menu's do, decorative.

## A11y

The bar is `role="menubar"`, named by `label`. Each title is a `menuitem` with
`aria-haspopup="menu"` and `aria-expanded`, and each open menu is a `menu` named by its title.
Rows are Menu's: `menuitem`, and `menuitemcheckbox` with `aria-checked` for a checkbox entry.

```contract
role root menubar when resting
name root from label when resting
role title menuitem
attr title aria-haspopup=menu when resting
attr title aria-expanded=false when resting
role panel menu when one menu open
```

## Keyboard

The menubar pattern of the ARIA Authoring Practices. The model is
`packages/engine/src/conventions/menubar.ts`, and every renderer runs it.

- The bar is one tab stop. It is the first enabled title until focus has been in the bar, and
  after that the title focus was last on.
- ArrowRight and ArrowLeft move to the next and the previous enabled title. In a right-to-left
  document the row starts at the right, so ArrowLeft moves to the next title. A move stops at
  either end, as a Menu's list does. Home and End move to the first and the last enabled title.
- A printable character moves to the next enabled title that starts with it, wrapping past the
  last, as Menu's typeahead moves through its rows.
- ArrowDown, Enter and Space open the title's menu with focus on its first enabled entry, and
  ArrowUp opens it with focus on its last.
- In an open menu, ArrowRight and ArrowLeft, in the reading direction, close it and open the
  next or the previous enabled title's menu, with focus on its first entry. At either end of the
  row the menu stays open. On a row that opens a submenu, the forward arrow enters the submenu
  instead. Inside a submenu the backward arrow closes the submenu, and the forward arrow hands
  the bar on to the next menu.
- Escape closes the menu and returns focus to its title. Choosing a command runs it once,
  closes the menu and returns focus to the title. A checkbox entry toggles and leaves the menu
  open, as in Menu. A press outside closes the menu.
- A disabled title is passed over by every key, is never the tab stop, and opens nothing, as a
  Menu passes over a disabled command.

The pointer: a press on a title opens or closes its menu. While one menu is open, the title a
mouse moves onto opens its own, as on a desktop. A touch has no hover, so a tap on another title
opens it as a press does, and the rule changes nothing there.

```contract
key ArrowRight moves-focus-next on title when resting
key ArrowLeft moves-focus-previous on title when resting
key Home moves-focus-first on title when resting
key End moves-focus-last on title when resting
key ArrowDown opens on title
key Enter opens on title
key Space opens on title
key ArrowUp opens on title
focus on-open panel
focus on-close trigger
key Escape closes when one menu open
dismiss both when one menu open
key ArrowDown moves-focus-next on item when one menu open
key Enter activates on item when one menu open
```

What the grammar cannot state is held by `menubarLaw` (`packages/conformance/src/menubar.ts`),
which every web renderer's Menubar test calls: passing over a disabled title, stopping at the
ends, the right-to-left row, typeahead, opening at the last entry, the hand-off and its submenu
exceptions, focus on the title after a command runs, the pointer rule and the phone form.

## Agent

An agent reads whether a menu of the bar is open and the entries it can choose, chooses one by
its id and closes the open menu. A choice runs the entry's own handler, as a person's does: a
command's `onSelect`, or a checkbox entry's `onCheckedChange` with the opposite of `checked`. An
agent chooses without opening the entry's menu; a command chosen while a menu is open closes it,
as a person's choice does. The bar names the menubar by `label`.

The entries are every menu's, in reading order, with Menu's ids (`menu.md`, Agent) under the
title: an entry's id is its title and its own label joined by ` / ` (`File / Save`), and a
submenu's entry's has the submenu's label between (`File / Open recent / Quarterly plan`). A
disabled entry, every entry of a disabled submenu and every entry of a disabled title is refused.
A `danger`-toned entry is marked destructive, so choosing it waits for a person to confirm.

At a phone's width the bar is one Menu behind one Button, which register as members of their own
beside the Menubar.

```agent
state open boolean as panel present
state entries choices
action choose id calls onSelect
action close sets open
destructive option when tone=danger
```
