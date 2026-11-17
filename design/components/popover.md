# Popover

A non-modal panel anchored to a trigger, for rich content such as a filter's settings, a small
form or a details preview. Use Tooltip for a text-only hint, Menu for a list of commands, and
Dialog when the user must *finish* something.

It is built on Radix `@radix-ui/react-popover`.

## Anatomy

```
[trigger — governed control]
[panel]
  [children — vocabulary content, typically Stack of FormFields + an action row]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `trigger` | `ReactNode` | required | |
| `label` | `string` | required | accessible name for the panel (`aria-label`) |
| `side` / `align` | Radix | `'bottom'` / `'start'` | collision-aware |
| `open` / `defaultOpen` / `onOpenChange` | Radix | — | |
| `children` | vocabulary content | required | |
| `presentation` | `'auto' \| 'sheet'` | `'auto'` | `'auto'` stays **anchored at every width** (see below). `'sheet'` is an app opt-in: unchanged above `30rem`, conventions §12's bottom sheet below it |

Attributes: panel `data-state`, `data-side`; panel `data-presentation="sheet"`
while drawn as a sheet (conventions §12).

## The presentation cell, argued

**Popover is non-modal, and a sheet would silently make it modal.** The page stays usable around
an open popover, and interacting elsewhere dismisses it. A bottom sheet with a scrim makes the
surface modal: the scrim blocks the page, and dismissing becomes a deliberate action instead of a
side effect. A default that changed a member's behaviour by viewport width would mislead users on
phones only. So `'auto'` never becomes a sheet. Below `30rem` the anchored panel stays, with
collision handling, exactly as above the breakpoint.

**`'sheet'` is the app's opt-in for form-like popovers**, such as a filter's settings or a small
form, where thumb reach and the virtual keyboard matter more than staying non-modal. Below
`30rem` in sheet mode the surface **is modal**: §12's scrim, focus containment, and dismissal by
Escape or scrim press. This is a real change of behaviour. The prop exists so that the app makes
the choice once, where the content is known; the vocabulary never makes it for the app. Above
`30rem`, `'sheet'` changes nothing.

## Recipe (exact tokens)

| Part | Tokens |
| --- | --- |
| panel | bg `--pm-bg-overlay` · border `1px solid --pm-border-subtle` · radius `--pm-radius-lg` · shadow `--pm-shadow-overlay` · padding `--pm-space-5` · width: content, `max-width: calc(var(--pm-space-10) * 4)` (384) |
| offset | `sideOffset: 4`. A popover sits a little further from its trigger, because it is a small surface with its own content, not a menu growing out of the control (2 is the menu/select constant) |

No arrow (as Tooltip), because the offset and origin-aware motion already connect the panel to
its trigger.

## States

Entries: closed, open with a FormField + Button inside, side `top`/`end` variants.
`requiredSelectors`: `[data-state="open"]`, `:focus-visible`.

## Motion

`scale-fade`, anchored origin, `surface` class; exits at `-surface-exit` × `exit`.
At `none`: instant.

## Icons — none of its own. A11y — Radix popover: focus moves into the panel on open,
returns on close; Escape and outside-click dismiss. `label` is required because assistive tech
cannot identify a panel of controls that has no name. Never nest overlays deeper than Popover →
ConfirmDialog.

```contract
role panel dialog when open
name panel from label when open
key Enter opens
focus on-open panel
focus on-close trigger
dismiss both
```

## Agent

An agent reads whether the popover is open and closes it. A close goes through the member's own
open state, so `onOpenChange` reports it as it reports a person's, whether or not the caller
controls it. An agent does not open a popover: a closed popover has no panel, so it has no name
an agent could find it by, and its trigger is a control of its own, usually a Button, which an
agent presses to open it. The open popover is named by `label`. Its content is the application's,
so the members in it are listed `within` the popover. A Popover that another member draws as its
own part registers nothing, because that member is listed in its place: ColorInput's picker.

```agent
state open boolean as panel present when open
action close sets open calls onOpenChange when open
```
