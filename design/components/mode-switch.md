# ModeSwitch

A SegmentedControl preset for choosing the page's colour mode: Light, Dark or System. It makes
the decisions every application that offers the choice would otherwise make again: the three
choices, their order and glyphs, and how a choice reaches the theme runtime. It has no surface
of its own. The track is SegmentedControl's, and it carries this member's identity.

How it differs from its nearest neighbours:

- **Not a light and dark toggle.** Every application that offers a mode choice offers `system`
  too, because a reader who set the operating system's mode expects the page to follow it. A
  two-state Switch or Button cannot say "follow the system", and it reads the applied mode, so
  it shows the wrong state while `system` is chosen.
- **Not a theme picker.** A system or a palette is a name from the application's catalogue
  (`catalogue` in `virtual:polymorph/theme`), chosen in a Select or a Menu. The mode is one of
  three fixed values and belongs to every pairing.
- **Not for a nested scope.** It reads and sets the document's mode (`data-mode` on `<html>`,
  through `@polymorph/engine/runtime`). A preview pane that wears its own `data-mode` holds its
  choice in the application and passes `value`.

The same choice in an account Menu or the command palette is not a ModeSwitch. Those are Menu
and Command entries that read `useMode` and call `setMode` (see
[In a Menu or the command palette](#in-a-menu-or-the-command-palette)).

## Anatomy

```
[track — SegmentedControl's radio group, data-member="mode-switch"]
  [segment] — [chip (checked only)] [glyph mode-light]  [Light]
  [segment] — [chip (checked only)] [glyph mode-dark]   [Dark]
  [segment] — [chip (checked only)] [glyph mode-system] [System]
```

The order is fixed: the two modes a reader pins, then the choice that defers to the operating
system. It is the order of the runtime's `MODE_PREFERENCES`.

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `label` | `string` | required | the group's accessible name ("Appearance"), required because outside a form no FormField names it |
| `value` | `'light' \| 'dark' \| 'system'` | none | the choice shown, while the application holds it. With it, a press calls `onChange` and sets no mode. Without it, the member shows the document's preference and sets the mode |
| `onChange` | `(value: 'light' \| 'dark' \| 'system') => void` | none | the reader's choice. Uncontrolled, it is called after the mode is set |
| `messages` | `ModeSwitchMessages` | English | the three segments' words, `{ light, dark, system }`: "Light", "Dark", "System". Pass every key, so one ModeSwitch never mixes two languages |
| `size` | `'sm' \| 'md'` | `'md'` | SegmentedControl's sizes. It sits in a toolbar, a menu's header or a settings row, beside `sm` and `md` controls |
| `disabled` | `boolean` | `false` | the whole group, while the application saves the last choice |

There is no `defaultValue`. Uncontrolled, the value is the document's preference, which the
runtime holds and stores. A default the member held would be a second answer to "which mode does
this page wear", and the two would disagree after the first `setMode` from anywhere else. On a
first visit nothing is stored, and the preference is the worn system's `defaultMode`, which
hydration applies: Dark is checked on a page whose system opens dark, and System on one whose
system follows the device. On a page that never calls `hydrateTheme`, such as a page with no
build, it is `system`.

There are no per-option props. The three choices are the runtime's three preferences, and a
choice the runtime cannot apply has no segment.

Attributes: SegmentedControl's. Root `data-size`, `data-disabled?`, `data-member="mode-switch"`;
segments `data-state="checked|unchecked"`, `data-disabled?`.

## Behaviour

**Uncontrolled.** The member shows the document's preference (`useMode().preference`). A press
calls `setMode(choice)`, which applies `data-mode` on `<html>` and stores the choice under
`pm-mode`, then calls `onChange(choice)`.

**Controlled.** The member shows `value`. A press calls `onChange(choice)` and nothing else. The
application applies the choice with `setMode` when it decides to: at once, or after its server
has saved it. When the save fails, it passes the old `value` back and calls `setMode` with it.

**A change made elsewhere.**

| Change | Uncontrolled | Controlled |
| --- | --- | --- |
| `setMode` from another ModeSwitch, a Menu entry or a command | the new preference is checked | `value` stays checked; the application decides whether to pass the new one |
| the operating system's mode changes while `system` is applied | System stays checked; the page's colours follow | as uncontrolled when `value` is `system` |
| another tab stores another choice | nothing changes: the document still wears its own, and the next load wears the stored one | nothing changes |

The member follows only what the runtime applies to this document. An attribute another script
writes on `<html>` by hand is not a choice the runtime made, and the member does not read it.

**A server render and hydration.** A server stores no preference, so it renders System checked
(`SERVER_MODE`), whatever the system's default. React, Vue and Solid render the same while they
hydrate the server's markup, so there is no mismatch, and then check the document's preference.
The page's colours are right from the first paint, because the pre-paint script applies the
stored mode, or the system's default, before any script runs. For a reader with a stored choice
other than System, and on a first visit to a page whose system opens light or dark, the checked
segment moves once, after hydration.

## In a Menu or the command palette

The account Menu and the command palette offer the same choice without a ModeSwitch. Each entry
reads the preference from the foundation's `useMode` and calls `setMode`, which every foundation
re-exports from the runtime. An entry that chooses follows a change made by a ModeSwitch, and a
ModeSwitch follows a change made by an entry.

A Menu marks the current choice with checkbox entries. A press on the checked entry unchecks
nothing, because a mode is always chosen:

```tsx
const { preference } = useMode()
const words = { light: 'Light', dark: 'Dark', system: 'System' }

<Menu
  trigger={<Button iconOnly icon="overflow" variant="ghost" label="Account" />}
  items={[
    {
      kind: 'submenu',
      label: 'Appearance',
      icon: 'settings',
      items: MODE_PREFERENCES.map((choice) => ({
        kind: 'checkbox' as const,
        label: words[choice],
        checked: preference === choice,
        onCheckedChange: (checked: boolean) => {
          if (checked) setMode(choice)
        },
      })),
    },
  ]}
/>
```

The command palette lists the choices the page does not wear:

```tsx
const { preference } = useMode()
const commands = { light: 'Use light mode', dark: 'Use dark mode', system: 'Use the system’s mode' }

const items = MODE_PREFERENCES.filter((choice) => choice !== preference).map((choice) => ({
  id: `mode-${choice}`,
  label: commands[choice],
  icon: `mode-${choice}` as const,
  group: 'Appearance',
  keywords: ['theme', 'dark', 'light'],
  onSelect: () => setMode(choice),
}))
```

An application that saves the choice on its server calls its save in `onCheckedChange` or
`onSelect`, and calls `setMode` with the old choice if the save fails, as it does for a
controlled ModeSwitch.

## Recipe (exact tokens)

SegmentedControl's recipe, verbatim (`segmented-control.md`): the track, the segments, the
checked chip and seat, hover, disabled and the focus ring. The member adds no stylesheet and no
token. The segments divide the track equally, so the widest word sets the segment width in
every language.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| uncontrolled — the document’s preference | `label="Appearance"`, no `value` | radiogroup root; the checked segment is the document's preference |
| controlled — the application holds the choice | `value` held by the entry and changed by `onChange` | radiogroup root; a press checks the new segment through the entry |
| sm | `size="sm"` | `data-size="sm"` |
| disabled — while the application saves the last choice | `disabled` | `data-disabled` |
| localized | `messages` in French, `label="Apparence"` | the segments read Clair, Sombre, Système |

`requiredSelectors`: SegmentedControl's, `:hover`, `:focus-visible`, `[data-state="checked"]`,
`[data-disabled]`, which its recipe styles.

## Motion

SegmentedControl's: selection snaps, and the hover text change transitions on the shared
state-feedback list. The member does not animate the page's change of mode. Every colour token
changes in the same frame, as it does for a `setMode` from anywhere else.

## Icons

`mode-light`, `mode-dark` and `mode-system`, leading, decorative. Each segment's word names it,
and the glyph adds nothing a screen reader needs.

## Platforms

On the web it is native in every framework. On iOS it is absent: the Human Interface Guidelines
ask an app not to offer its own appearance setting, and Settings owns it. On Android it is native:
Android's dark theme guidance has an app offer Light, Dark and System default, and the Compose
foundation draws the mode the app provides (`ProvidePMTheme`'s `dark`). No member can change what
is provided above it, so without `value` the member shows the provided mode, System while the app
provides none, and a choice calls `onChange`, which the app applies.

## A11y

SegmentedControl's radiogroup semantics: the root is `role="radiogroup"` named by `label`, with
one tab stop, and the arrow keys move focus and the choice. The choice applies at once, as with
Switch. Each segment's word is its accessible name, and `aria-checked` carries the state. The
member announces nothing: the page's change of colour is what the reader asked for, and the
checked segment says it.

```contract
role root radiogroup
name root from label
key ArrowRight moves-focus-next on segment when controlled
key ArrowLeft moves-focus-previous on segment when controlled
key ArrowRight selects on segment when controlled
```

## Agent

The bridge lists one ModeSwitch where a person sees one control. The SegmentedControl that draws
its track is this member's own part, and is not a member an agent lists, finds or runs. An agent
reads the choice shown, the three choices and whether the switch is disabled, and chooses one by
its id: `light`, `dark` or `system`. A choice takes the path a person's press takes. Uncontrolled,
it applies the mode with the runtime's `setMode`, which stores it for the next visit, and calls
`onChange`. Controlled, it calls `onChange` and applies nothing, and the choice shown changes when
the application passes a new `value`.

```agent
state value id
state options choices
state disabled boolean as root data-disabled
action choose id calls onChange when sm
withholds contents
```
