# Menu

A list of commands opened from a trigger, used for overflow and row actions, usually behind the
`overflow` button. Navigation between pages belongs to NavItem or Link; a Menu holds *commands*.

It is built on Radix `@radix-ui/react-dropdown-menu`. It allows one level of submenu: a submenu
arm holds leaf entries only, never another submenu.

## Anatomy

```
[trigger — a governed control, usually Button iconOnly icon="overflow"]
[content panel]
  [item | separator | group-label]*
  item: [icon?] [label] [kbd hint?]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `trigger` | `ReactNode` | required | governed control |
| `items` | `MenuEntry[]` | required | data-driven, like Select/Radio |
| `align` | `'start' \| 'end'` | `'start'` | Radix align; side fixed `bottom` (collision flips) |
| `open` / `onOpenChange` | `boolean` / `(open: boolean) => void` | — | controlled pair; uncontrolled is the default. Control it to keep the menu open across several checkbox toggles, or to close it when the app applies a change |
| `presentation` | `'auto' \| 'popover'` | `'auto'` | `'auto'` becomes a sheet below `30rem` (the section below; conventions §12); `'popover'` keeps the popper at every width, for the rare pointer-first embed that needs precision. There is no always-`'sheet'` value, because a bottom sheet on a wide pointer surface is the wrong form, and the closed union rules it out (`docs/layout.md`) |

```ts
type MenuEntry =
  | { kind?: 'item'; label: string; icon?: IconRole; kbd?: string;
      tone?: 'neutral' | 'danger'; disabled?: boolean; onSelect: () => void }
  | { kind: 'checkbox'; label: string; checked: boolean;
      onCheckedChange: (checked: boolean) => void; disabled?: boolean } // Radix CheckboxItem
  | { kind: 'separator' }
  | { kind: 'label'; label: string }
  | { kind: 'submenu'; label: string; icon?: IconRole; disabled?: boolean;
      items: MenuLeafEntry[] } // one level only — a submenu holds leaves, never another submenu
```

A checkbox entry toggles without closing the menu (the default dismiss on select is prevented).
Users adjust a filter list several ticks at a time, and a menu that closed on each tick would have
to be reopened n times. Escape and outside-press still close it.

Attributes: content `data-state`, `data-side`; items `data-highlighted?`,
`data-disabled?`, `data-tone`; checkbox entries `data-state="checked|unchecked"`
(Radix); content `data-presentation="sheet"` while drawn as a sheet (the resolved state, as
conventions §12 defines).

## Recipe (exact tokens)

Panel: exactly Select's content panel recipe (`select.md`): bg `--pm-bg-overlay`,
border `1px solid --pm-border-subtle`, radius `--pm-radius-lg`, shadow
`--pm-shadow-overlay`, padding `--pm-space-2`. It adds `min-width:
calc(var(--pm-space-10) * 2)` (192) and `position="popper" sideOffset={2}` (the
anchored-surface constant, same as Select).

| Part | Tokens |
| --- | --- |
| item | height `--pm-control-height-sm` · padding-x `--pm-space-3` · radius `--pm-radius-sm` · `text.sm` · text `--pm-text-primary` · icon `sm` at `--pm-text-muted` · icon–label gap `--pm-space-3` |
| item highlighted | bg `--pm-accent-subtle` · text `--pm-accent-text` · icon inherits |
| item `tone="danger"` | text `--pm-danger-text` · icon inherits · highlighted: bg `--pm-danger-subtle`, text `--pm-danger-text` (kept quiet: a destructive command stays low-key in the menu, and the ConfirmDialog carries the emphasis) |
| item disabled | text `--pm-text-disabled` · no highlight |
| checkbox entry | the item recipe, plus Select's check column unchanged (`select.md`): width `--pm-icon-size-sm` + gap `--pm-space-2`, Icon `confirm` `--pm-accent-text` when checked, empty when not. The check uses the leading slot, so a checkbox entry takes no `icon` |
| kbd hint | `<Kbd>` right-aligned (margin-left auto), only rendered when `kbd` given |
| separator | 1px `--pm-border-subtle` rule · margin-block `--pm-space-2` |
| group label | `text.xs` uppercase quartet · `--pm-text-muted` · padding `--pm-space-2` `--pm-space-3` |

## The sheet, below `30rem`

Under `presentation="auto"` the panel becomes the sheet from conventions §12: attached to the
bottom and full-width (the `min-width` and `sideOffset` rules stop applying, because a sheet has
no anchor), with §12's cap, safe-area padding and motion, and `data-presentation="sheet"` on the
content. The trigger, the `items` grammar and every item recipe above are unchanged. The rows
apply inside the sheet as they are, which is the reason for having one shared sheet.

**The lane:** Radix dropdown-menu ties its menu semantics to its popper, so in sheet mode the
semantics come from react-aria instead (§12; the `README-substrates.md` §4 boundary: react-aria
for in-panel semantics, Radix for positioning). A menu in a sheet is still a menu, with
`role="menu"`, roving focus, typeahead, Escape and focus return. The sheet does not ship without
them. Selection still dismisses (§12's dismissal list; for menus, that is selection itself).
Checkbox entries keep their stay-open rule, because ticking several boxes is exactly the task the
sheet's thumb reach suits. Panel motion is §12's `sheet` binding. The `menu.items` cascade is
content motion and is the same in both forms.

**Submenu arms flatten in the sheet**: a submenu is a named group of commands, and the sheet can
already express that. The arm renders as its `label` followed by its items inline, the same
label and group form as above. Inline items need no extra navigation, so drill-in (a second
surface inside the sheet, with a back control) is not offered. A cascading popover opening from
a sheet is not allowed, because it brings back every problem the sheet exists to fix (§12's
argument).
A **disabled** submenu arm flattens to its label alone. The label renders with the group-label
recipe and the items are left out. In the popper the arm is announced as one disabled group.
Rendering n disabled commands in the sheet would announce something the popper does not. Adapting
the form must not add information, just as it must not hide it.

## States

Entries: closed, open (`defaultOpen` on Radix root) with plain/icon/kbd/danger/
disabled items + separator + label, align end, checkbox entries checked and
unchecked. `requiredSelectors`: `[data-state="open"]`,
`[data-highlighted]`, `[data-tone="danger"]`, `[data-disabled]`,
`[data-state="checked"]`, `:focus-visible` (trigger).

## Motion

Content: `scale-fade`, anchored origin, **surface** class (as Select, because a menu is
a transient anchored surface). At `none`: instant.

Items: the `menu.items` cascade. `fade` + 2px drift at `control` × `enter`, per-item delay
`index × --pm-motion-stagger-step` clamped to `--pm-motion-stagger-max`, with the index capped at
twelve. Enter only. Temperament scales it through the tokens (`none` ⇒ zero delay and no
cascade). Reduced motion projects it to presence only. Full definition:
`design/motion/motion.md` §9.

## Icons

Per item `icon`; decorative (labels carry meaning). Trigger's own icon per its
component.

## A11y

Radix menu semantics (typeahead, arrows, Escape, focus return): opening from the keyboard moves
focus into the menu, Enter runs the focused command, and a press outside closes it. Checkbox
entries are `menuitemcheckbox` + `aria-checked` (CheckboxItem), so the state is announced and the
check glyph stays decorative. `kbd` hints are display only. Menu never binds global shortcuts;
that is app wiring, outside the vocabulary. Irreversible destructive items must go through
ConfirmDialog (hierarchy law). The Menu item itself never destroys anything.

```contract
role panel menu when open
attr trigger aria-haspopup=menu when closed
key Enter opens
focus on-open panel
key ArrowDown moves-focus-next on item when open
key ArrowUp moves-focus-previous on item when open
key Enter activates on item when commands only
key Escape closes when open
focus on-close trigger
dismiss both
role checkbox menuitemcheckbox when checkbox entries
attr checkbox aria-checked=true when checkbox entries
key Enter activates on checkbox when checkbox entries
```

## Agent

An agent reads whether the menu is open and the entries it can choose, chooses one by its id,
and opens and closes the menu. A choice runs the entry's own handler, as a person's does: a
command's `onSelect`, or a checkbox entry's `onCheckedChange` with the opposite of `checked`. An
agent chooses without opening the menu; a command chosen while the menu is open closes it, as a
person's choice does. Opening and closing go through the member's own open state, so
`onOpenChange` reports them whether or not the caller controls it.

The entries are every command and checkbox entry, a submenu's among them, in order. An entry's id
is its label, and a submenu's entry's is the submenu's label and its own joined by ` / `
(`Move to / Billing`); a repeated id takes ` (2)` after it. A disabled entry, and every entry of a
disabled submenu, is refused. A `danger`-toned entry is marked destructive, so choosing it waits
for a person to confirm, as the hierarchy law asks of a destructive command.

```agent
state open boolean as panel present
state entries choices
action choose id calls onSelect
action open sets open calls onOpenChange
action close sets open calls onOpenChange
destructive option when tone=danger
```
