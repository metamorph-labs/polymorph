# ContextMenu

Menu's command list, opened by right-click or touch long-press and anchored at the press point.
Use it as a faster route to commands that are also on a visible control.

The substrate is `@radix-ui/react-context-menu`. It is a separate package but not a new
decision: it wraps the same `@radix-ui/react-menu` core as Menu's
`@radix-ui/react-dropdown-menu`, so the panel, items and keyboard handling are Menu's.

It is **not a Menu replacement**. It offers the same commands faster, and the rule below
requires them to exist elsewhere too. It is **not navigation** (use NavItem or Link) and **not
the place a command lives**. Destructive items go through ConfirmDialog, as in Menu.

## Anatomy

```
[surface — the wrapped child: one element, the area that owns the commands]
[content panel — at the press point]
  [item | separator | group-label | checkbox]*   (Menu's grammar)
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `entries` | `MenuEntry[]` | required | **`menu.md`'s grammar, reused verbatim**. The union keeps its name (Menu's spec calls them entries) and includes every arm menu.md defines: item, checkbox, separator, label and the one-level submenu. Only Menu changes the grammar; this member never extends it |
| `children` | `ReactNode` | required | the surface: **one element**, which may be non-interactive, because the trigger is the *area*, not a control. The member merges into the child instead of wrapping it, because a wrapper element around a `Table.Row` would break the table |
| `onOpenChange` | `(open: boolean) => void` | — | notification, for apps that pause row hover states or refresh entries on open |
| `presentation` | `'auto' \| 'popover'` | `'auto'` | Menu's cell verbatim (`menu.md`; conventions §12): `'auto'` uses a sheet below `30rem`, `'popover'` keeps the press-point popper at every width. Same closed union, with no always-`'sheet'` value |

There is no controlled `open`. A context menu's state is *open at a point*, and the point exists
only in the gesture, so an `open` prop would have no position to open at. Radix's root also
offers only `onOpenChange`. To open a command list from state, use Menu.

An entry reports a choice through its own handler, as Menu's does, and the member adds none:

```ts
// The handlers of menu.md's `MenuEntry`, unchanged.
type EntryHandlers = {
  onSelect: () => void // a command
  onCheckedChange: (checked: boolean) => void // a checkbox entry, with the state it moves to
}
```

Attributes: content `data-state`, `data-side` (Radix). Items have exactly Menu's:
`data-highlighted?`, `data-disabled?`, `data-tone`, and
`data-state="checked|unchecked"` on checkbox entries. Content has
`data-presentation="sheet"` while drawn as a sheet, as conventions §12 requires.

## Never the only path (the rule this member ships under)

**Every command reachable here must also be on a visible control.** A context menu is
invisible until opened. Nothing on screen indicates it, touch reaches it only by long-press,
and a keyboard cannot open it on a non-interactive surface. So it is only a shortcut to
commands that exist elsewhere. The standard pairing, for screens to copy: a Table row wraps in
ContextMenu **and** keeps its trailing overflow Menu (Button `iconOnly icon="overflow"`). Both
receive the *same* `entries` value, declared once. The States table renders this pairing, so
the pattern is a fixture. A command that only a right-click can reach is a defect.

## Recipe (exact tokens)

Panel and items: **Menu's whole recipe** (`menu.md`, which reuses Select's content panel with
Menu's `min-width` and item grammar). The one difference is positioning. The panel anchors to
the **press point**, not a trigger, and Radix's collision handling keeps it on screen. There is
no `sideOffset`. The 2px anchored-surface constant keeps a panel border from merging with a
trigger border, and a pointer has no border.

**The sheet, below `30rem`**: Menu's sheet cell applies in full (`menu.md`; conventions §12).
The panel becomes the sheet. The press point no longer affects position, because a sheet has
no anchor, but the gesture still opens it: long-press is already the touch gesture. Semantics
follow Menu's cell on the react-aria path. Selection dismisses. The never-the-only-path rule
above applies at every width.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| closed | a Card surface wrapped, full entry mix given (plain/icon/kbd/danger/disabled + separator + label + checkbox) | surface renders without a wrapper; nothing else visible |
| **the pairing** | a Relay ticket row (`Table.Row`) wrapped, with its trailing overflow Menu rendered open (Menu's own `defaultOpen`), both fed one `entries` value — Assign to me / Snooze / separator / Archive | the same commands reachable from both; the row still renders as a row, and the open Menu shows them |

**No public prop** renders the open panel, because there is no `open` prop. Under the
fixture-derivation rule (conventions §10), a state the props cannot produce goes to
`requiredSelectors`, and the browser test reaches it with a real press. Menu's own fixture
covers the item states (highlight, danger, disabled, checked), so this member does not render
them again.

`requiredSelectors`: `[data-state="open"]`, `[data-highlighted]`,
`[data-tone="danger"]`, `[data-disabled]`, `[data-state="checked"]`.

No `:focus-visible` on a trigger, because there is no trigger control. The surface keeps its
own focus behaviour, and inside the open panel the highlight is Menu's.

## Motion

Menu's bindings verbatim: content `scale-fade`, anchored origin (from the press point via
`data-side`), **surface** class. Items use the `menu.items` cascade with the same ladder and
clamps as Menu and Command. At `none` or under reduced motion, the patterns' projections apply.

## Icons

Per-entry `icon`, decorative, as in Menu. The member has no glyph of its own, because the
surface is the trigger and shows none.

## A11y

Once open, Radix menu semantics apply: typeahead, arrows, Escape, and focus return to where it
was. Opening: right-click (the native `contextmenu` event), or long-press on touch with the
substrate's own timing, not a vocabulary value. Where the surface is focusable (an interactive
Table row), the platform's menu key or Shift+F10 fires the same event and the panel opens at
the element. Where it is not, the paired visible control **is** the keyboard path, so the rule
above is an accessibility requirement. Checkbox entries are `menuitemcheckbox` +
`aria-checked` and toggle without dismissing, as in Menu. `kbd` hints are display-only.
Irreversible destructive entries go through ConfirmDialog (hierarchy law; the entry itself
never destroys).

```contract
role panel menu when the pairing
key ArrowDown moves-focus-next on item when the pairing
key Escape closes when the pairing
dismiss both when the pairing
```

## Agent

An agent reads whether the menu is open and the entries it can choose, and chooses one by its id,
as it does in a Menu. A choice runs the entry's own handler, as a person's does: a command's
`onSelect`, or a checkbox entry's `onCheckedChange` with the opposite of `checked`. An agent
chooses without opening the menu, because the menu opens only at the point of a press; a command
chosen while the menu is open closes it, as a person's choice does. The surface, the area that
owns the commands, names the menu by its text.

The entries and their ids are Menu's (`menu.md`, Agent): every command and checkbox entry, a
submenu's among them, in order, each by its label, a submenu's entry by the submenu's label and
its own joined by ` / `. A disabled entry, and every entry of a disabled submenu, is refused. A
`danger`-toned entry is marked destructive, so choosing it waits for a person to confirm.

```agent
state open boolean as content present
state entries choices
action choose id calls onSelect
destructive option when tone=danger
```
