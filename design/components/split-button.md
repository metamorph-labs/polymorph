# SplitButton

A button for one command with variants: pressing it runs the default action, and a
chevron opens a menu of related variants. Use it when the command has a clear default.

It is composed from installed pieces, with no new dependency. The primary half uses
Button's recipe. The menu half uses the installed dropdown substrate with Menu's panel
and entry grammar.

What it is not: **not two Buttons side by side.** It is one control group with one
variant, one tone, one size and one disabled state, and the halves always match. **Not a
Menu with a bigger trigger.** The primary is a real default the reader can press without
opening anything. If there is no real default, put the commands in a Menu behind an
`overflow` Button. **Not a place for opposites.** The entries are variants of the
label's own verb ("Resolve and notify", not "Delete"). A command that contradicts the
primary belongs in a different control.

## Anatomy

```
[group]
  [primary <button>] — [icon?] [label]   (Button's anatomy)
  [divider — 1px, the seam]
  [chevron <button>] — Icon "expand"     (Button iconOnly, its own name)
[content panel — Menu's, anchored to the group's end]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `label` | `string` | required | the primary's visible text — Button's cell, ellipsis on overflow |
| `onClick` | `(e) => void` | — | the primary's handler; disconnected while `loading` (Button's double-submit rule) |
| `icon` | `IconRole` | — | leading on the primary (Button's cell) |
| `entries` | `MenuEntry[]` | required | `menu.md`'s entry grammar, by citation. Every entry kind is supported, and danger entries get Menu's quiet danger styling |
| `menuLabel` | `string` | required | the chevron half's accessible name ("More resolve options"). It is `iconOnly`, and an unnamed second button would be an unexplained tab stop. Required, with no built-in default text (PasswordInput's `toggleLabel` law) |
| `variant` | `'solid' \| 'soft' \| 'outline'` | `'solid'` | **ghost refused** — see the grid |
| `tone` | `'accent' \| 'neutral'` | `'accent'` | `neutral` lawful only with `outline`, Button's own law; **danger refused** — see the grid |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | conventions §2; the chevron half is square at the control height (Button's `iconOnly` cell) |
| `disabled` | `boolean` | `false` | the whole group; the halves always match |
| `loading` | `boolean` | `false` | **on the primary only**: the spinner sits in its icon slot per §5 and the layout holds. The chevron becomes inert too, because a command in flight is the state of the whole group, and firing a variant mid-flight is the double-submit bug that Button prevents by disconnecting handlers |
| `presentation` | `'auto' \| 'popover'` | `'auto'` | applies to the menu half, as in Menu (`menu.md`; conventions §12): `'auto'` shows the panel as a sheet below `30rem`, `'popover'` keeps it a popover. The control group itself never becomes a sheet, because the halves are Buttons and Buttons have no phone form |

`entries` is `menu.md`'s `MenuEntry`, cited here for the handlers a chosen entry runs:

```ts
type MenuEntry =
  | { kind?: 'item'; label: string; icon?: IconRole; kbd?: string;
      tone?: 'neutral' | 'danger'; disabled?: boolean; onSelect: () => void }
  | { kind: 'checkbox'; label: string; checked: boolean;
      onCheckedChange: (checked: boolean) => void; disabled?: boolean }
  | { kind: 'separator' }
  | { kind: 'label'; label: string }
  | { kind: 'submenu'; label: string; icon?: IconRole; disabled?: boolean;
      items: MenuLeafEntry[] }
```

Attributes: group `data-variant`, `data-tone`, `data-size`, `data-disabled?`;
primary `data-state="loading"?`; chevron `data-state="open|closed"` (it describes the
anchored panel, so it sits on the panel's trigger); panel `data-presentation="sheet"`
while drawn as a sheet (Menu's contract, conventions §12).

## Lawful variant × tone grid

|  | `neutral` | `accent` |
| --- | --- | --- |
| `solid` | ✗ (Button's law) | ✓ |
| `soft` | ✗ (Button's law) | ✓ |
| `outline` | ✓ | ✓ |

Unlawful combinations are a type error (Button's overload technique). This member also
refuses two options of its own:

- **`ghost` refused.** A split needs a visible seam, and ghost has no fill and no border,
  so the divider would be a floating line between two invisible boxes. Tertiary actions
  have no default worth splitting; a ghost trigger with commands is a Menu.
- **`danger` refused.** A destructive primary with similar commands one hairline away is
  easy to hit by mistake. Destructive actions should be slowed down by ConfirmDialog, not
  sped up by a chevron. A destructive *variant* belongs inside the menu as a
  `tone: 'danger'` entry, styled quietly as Menu does and confirmed per the hierarchy law.

## The seam

- **One radius pair, outer corners only.** The group uses `--pm-radius-md` (control
  class, §3) on its outside corners. The inner corners of both halves are `0`, because
  rounded inner corners would make it look like two buttons.
- **The divider uses a colour the halves already use.** It is 1px, full height, with no
  new tokens. For the filled variants it is the variant's `active` fill step (`solid`:
  `--pm-accent-bg-active`; `soft`: `--pm-accent-subtle-active`). The deepest step of the
  ladder looks like a seam *in* the fill rather than a line *on* it. For `outline` it is
  the variant's border colour (`accent`: `--pm-accent-bg`; `neutral`:
  `--pm-border-default`), so the group's border continues through the middle. Outline
  halves share one continuous border box and the divider is its middle stroke, so no
  double-thickness seam can form (Select's reasoning about fused borders, applied inside
  one control).
- The divider is visual only: both halves keep §2's minimum hit size, and the seam takes
  no pixels from either.

## Recipes (exact tokens)

Each half uses **Button's recipe unchanged** for the group's `variant` × `tone` at the
group's `size`: the rest, hover, active, disabled and loading cells in full, including
solid's gradient and seat and the wash ladders. The halves hover and press
**independently**. Only the half under the pointer responds, and the seam and the other
half stay unchanged. The group offers two actions, so the styling must show which one a
press triggers. Focus: two tab stops, each with the shared focus ring (conventions §4).
The ring lies inside each half's edge. The focused half still sits above the other (`z-index`), so a ring a system draws outside the edge is not covered at the seam.
The chevron's glyph: Icon `expand` at §2's size for the control, `currentColor` from its
half's recipe.

Panel: **Menu's full recipe, by citation** (Select's content panel via Menu, with Menu's
min-width and item grammar). It is anchored `bottom` / `align="end"` on the group with
`sideOffset: 2` (the anchored-surface constant), so the panel hangs from the control's end
edge, under the chevron that opened it. Below `30rem` under `presentation="auto"`, Menu's
sheet cell applies in full (`menu.md`; conventions §12): the panel becomes a sheet and the
anchoring rows stop applying. Entries and semantics do not change.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| solid accent | `label="Resolve"`, entries Resolve and notify / Resolve as duplicate, `menuLabel="More resolve options"` | `data-variant="solid"`, `data-tone="accent"`, chevron named |
| soft / outline accent | each | `data-variant` |
| outline neutral | `variant="outline" tone="neutral"` | the one lawful neutral |
| with icon | `icon="confirm"` | leading icon on the primary |
| sizes | sm / lg | `data-size`; chevron square |
| open | `defaultOpen` (Radix) | chevron `data-state="open"`; Menu's panel with the entries |
| danger entry | one `tone: 'danger'` entry, open | `data-tone="danger"` on the item (Menu's quarantine) |
| loading | `loading` | primary `data-state="loading"`, `aria-busy`; chevron inert; width held |
| disabled | `disabled` | `data-disabled`; both halves disabled |

`requiredSelectors`: `:hover`, `:active`, `:focus-visible`,
`[data-state="loading"]`, `[data-state="open"]`, `[data-disabled]`.

## Motion

Each half: Button's motion unchanged (press `spring-pop`, colour transitions on §7's
shared list, spinner `spin`). Panel: Menu's `scale-fade` at `surface` with the
`menu.items` cascade, unchanged. At `none` / reduced motion: per the patterns.

## Icons

`expand` (the chevron half's glyph, decorative; `menuLabel` names the button),
`loading` (spinner), any role via `icon`. All `currentColor` per Button.

## A11y

Two native buttons and two tab stops in one visual control. The primary announces as
`label`, and the chevron as `menuLabel`, with the menu's `aria-haspopup`/
`aria-expanded` wiring from the substrate. The two are adjacent in the tab order with the
primary first, so the default comes before its variants. Once open, the menu semantics
are Radix's (typeahead, arrows, Escape, focus return to the chevron). Loading:
`aria-busy` on the primary, the name is kept and the handler is disconnected. The inert
chevron is really `disabled`, not a silent no-op. Destructive entries go through
ConfirmDialog (Menu's law comes with its entry grammar).

```contract
role primary button
name primary from label
name trigger from menuLabel
attr trigger aria-haspopup=menu when solid accent
key Tab moves-focus-next on primary
key Enter opens
focus on-open panel
key ArrowDown moves-focus-next on item when open
key Escape closes when open
focus on-close trigger
announces busy when loading
```

## Agent

The bridge lists one SplitButton where a person sees one control, named by its primary half. An
agent reads whether the group is disabled, whether its command is running, whether the menu is
open and the variants it can choose. It presses the primary, chooses a variant by its id, and
opens and closes the menu. A press is the primary's own click, so it runs `onClick`, and a loading
group ignores it as it ignores a person's. A choice runs the entry's own handler, as Menu's does:
a command's `onSelect`, or a checkbox entry's `onCheckedChange` with the opposite of `checked`. It
needs no open menu, and a command chosen while the menu is open closes it. An entry's id is
Menu's: its label, with a submenu's label and ` / ` before it. While the command runs the chevron
is disabled, so a choice and an open are refused, as a person cannot reach the variants then. A
disabled entry is refused. A `danger`-toned entry is marked destructive, so choosing it waits for
a person to confirm; the group's own `tone` admits no `danger`.

```agent
state disabled boolean as root data-disabled
state loading boolean as primary aria-busy
state open boolean as panel present
state entries choices
action press calls onClick
action choose id calls onSelect
action open sets open
action close sets open
destructive option when tone=danger
```
