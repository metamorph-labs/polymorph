# AvatarButton

A Button preset whose face is an Avatar: the image, the initials or the glyph of a person or a
workspace, on a control that takes a press. Its main use is the trigger of an account menu.

It relates to Button as CopyButton and ProviderButton do. It has no substrate. Without it, a
screen could put a face on a pressable control only by stacking an invisible Button over an
Avatar inside a Bespoke zone: `Button` takes an `IconRole` and has no slot, and `Avatar` takes no
press.

AvatarButton is **not an Avatar**. An Avatar identifies and does nothing: it takes no focus and no
press, and beside a visible name it is hidden from assistive technology. An AvatarButton is a
command, so it is named by what it does (`label`), never by whose face it shows. It is **not
`Button iconOnly`**, which shows an icon role: a meaning the theme draws in `currentColor`. A
face is a picture of someone, with fills of its own, so it comes from `Avatar` and no icon role
stands for it. It is **not a menu**. It opens nothing by itself: an account menu is a `Menu`
whose `trigger` is an AvatarButton, and a `Popover` takes one the same way.

## Anatomy

```
[root <button> — Button ghost/neutral, by reference, round]
  [face — Avatar at the button's size, decorative]
  [spinner — while loading, in the hidden face's place]
```

## API

```ts
interface AvatarButtonProps {
  name: string               // Avatar's `name`: the initials, and the `user` glyph when it is empty. Never the accessible name
  src?: string               // Avatar's `src`: the image; a URL that fails leaves the initials
  label: string              // the action's accessible name — "Account menu", not the person's name
  size?: 'sm' | 'md' | 'lg'  // the face's size, Avatar's own; default 'md'
  disabled?: boolean
  loading?: boolean          // the action has started and has not answered
  pressed?: boolean          // Button's toggle: `aria-pressed`, and `data-state="on|off"`
  current?: boolean          // Button's `aria-current="page"`
  onClick?: (event) => void  // detached while `loading`
}
```

Attributes: Button's (`data-variant="ghost"`, `data-tone="neutral"`, `data-size`,
`data-state="loading|on|off"?`, `data-disabled?`). The face carries Avatar's own (`data-size`,
`data-fallback?`, `data-tone?`).

**`label` names the action, and is required.** A face says who, and a button says what. A screen
reader that heard "Ada Lovelace, button" would not know that a press opens the account menu. The
face is hidden from assistive technology for the same reason an Avatar beside a visible name is:
the name is not the control's meaning.

**No `variant`, no `tone`.** The cell is fixed at `ghost`/`neutral`. A face has its own fills, so
a filled or bordered cell around it would be a second colour decision beside the identity tone.
The ghost cell draws nothing at rest and washes the gutter around the face under the pointer and
the press.

**No `type`, no icon.** It is always `type="button"`: a face is never a form's submit. It takes
no `icon`, because the face is its whole content.

## Sizes

`size` is the face's: the Avatar inside is drawn at the same `size`, so an AvatarButton beside an
Avatar of that size shows the same mark. The box is the face with a `--pm-space-1` gutter on
every side, and is never smaller than the size's control height.

| Size | Face | Box | Floor |
| --- | --- | --- | --- |
| `sm` | `--pm-space-6` (24) | 32 | `--pm-control-height-sm` (32) |
| `md` | `--pm-space-7` (32) | 36 | `--pm-control-height-md` (36) |
| `lg` | `--pm-space-8` (48) | 52 | `--pm-control-height-lg` (40) |

At `sm` and `md` at standard density the box is Button's icon-only square, so an AvatarButton
lines up with the controls beside it. Where the face with its gutter is taller than the size's
control height, the box follows the face: `lg` at every density, and `md` at compact density.
This is the one place the member leaves the conventions' size system
(`design/components/README.md`): its height is its content's, above the floor. The hit area
meets the conventions' minimum target at every size and density.

**On iOS and Android** the box is drawn the same, and its touch area is the theme's hit target
around it, as Button's is. A press runs `onClick` and then opens the overlay the button is the
trigger of.

## Recipes (exact tokens)

Button `ghost`/`neutral` **by reference**, as CopyButton and ProviderButton do. The element sets
Button's attributes and `composes` its recipe, so rest, hover, press, the toggle's on state,
loading, disabled, the press feedback and the conventions' shared focus ring all apply without
being restated.

| Part | Tokens |
| --- | --- |
| root | `composes: button` · radius `--pm-radius-pill` (a face is round at every geometry, as Avatar is, so its wash and its focus ring are round too) · the gutter is `--pm-space-1` on every side, of which Button's hairline border is the outer `1px` · minimum inline and block size `--pm-control-height-{size}` · never shrinks |
| face | `Avatar` at the button's `size`, with every token Avatar's recipe names · decorative |
| hover / active / on | Button's ghost/neutral cells: `--pm-bg-subtle` behind the face, which shows in the gutter. Under a system that sets `overrides.hover.unfilled: none` the hover wash is absent, as on every ghost Button; the press and the on state still wash |
| loading | Button's `button.spinner` binding (`spin`), centred in the box, in `--pm-text-secondary`; the face is hidden and keeps its room, so the box does not change size |
| disabled | Button's cell; the **face** gets `filter: grayscale(1)` · `opacity: 0.5`. A face has its own fills, so left unchanged it would be the only coloured part of a disabled control. It is desaturated as a whole, as ProviderButton's mark is, never repainted |

## States

| Entry | Render | Expect |
| --- | --- | --- |
| initials | `name="Ada Lovelace" label="Account menu"` | `ghost`/`neutral`/`md`, `aria-label`, no `data-state` |
| an image | `src` | the image over the initials |
| no name | `name=""` | the `user` glyph |
| small / large | `size` | `data-size` |
| three sizes | `sm`, `md`, `lg` in an `Inline` | — |
| loading | `loading` | `data-state="loading"`, `aria-busy` |
| disabled | `disabled` | `data-disabled`, `disabled` |
| pressed on / pressed off | `pressed` | `data-state="on"` or `"off"`, `aria-pressed` |
| current | `current` | `aria-current="page"` |

`requiredSelectors`: `:hover`, `:active`, `:focus-visible`, `[data-disabled]`,
`[data-state="loading"]`, `[data-state="on"]`. These are Button's, reached through `composes`.
They are listed because a member that lost one would look like a Button but behave like a div.

## Motion

Button's bindings, unchanged: `stateFeedback` on colour, `button.press`, `button.spinner` while
loading. The face's image fades in as Avatar's does (`avatar.image`). Nothing of its own.

## Icons

`loading` (Button's spinner, in the face's place). The `user` glyph of a face with no name is
Avatar's.

## A11y

A real `<button>`; the accessible name is `label` and nothing else. The face is `aria-hidden`:
initials are a picture of a name, and the name is not what the control does. `loading` sets
`aria-busy`, keeps the name and the focus, and ignores presses. `pressed` makes it a toggle that
reports `aria-pressed`, and `current` sets `aria-current="page"`, both as Button does. Disabled
uses the native attribute. As the `trigger` of a Menu or a Popover it carries the overlay's
`aria-haspopup`, `aria-expanded` and `aria-controls`, and focus returns to it when the overlay
closes, as with a Button.

The face draws no text, so `label` shows as a name tip on hover and keyboard focus, as on an
icon-only Button (`button.md`, Name tip), and the tip is `aria-hidden`. A disabled AvatarButton
shows none.

```contract
role root button
name root from label
key Enter activates on root
key Space activates on root
announces busy when loading
name root from label when loading
key Enter nothing on root when loading
attr root aria-pressed=true when pressed on
attr root aria-pressed=false when pressed off
attr root aria-current=page when current
```

## Agent

An agent reads whether the button is disabled and whether its action is loading, and presses it.
A press is the button's own click, so a disabled or loading button does nothing, as it does for a
person. As the trigger of a Menu or a Popover, a press opens the overlay, and the overlay's member
is listed beside the button on the same control. The face is not read: the button is named by
what it does, and the person's name the face draws is not part of that.

```agent
state disabled boolean as root data-disabled
state loading boolean as root aria-busy
action press calls onClick
```
