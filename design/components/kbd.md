# Kbd

Shows a keyboard key, for shortcut hints in Menus, SearchInput and help text. It is display
only. Binding the shortcut is the app's job.

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `children` | `string` | required | one key per Kbd (`⌘` `K` is two Kbds); join a sequence with `+` or spaces as plain text between them |

## Recipe (exact tokens)

`<kbd>`: font `--pm-font-mono` at `text.xs` size/tracking · color
`--pm-text-secondary` · bg `--pm-bg-subtle` · border `1px solid --pm-border-default` ·
`border-bottom-width: 2px` (the thicker bottom edge makes the key look raised. 2px is a lawful
hairline, and the cue works in every geometry, including sharp) · radius
`--pm-radius-sm` · padding `0 --pm-space-2` · min-width `--pm-icon-size-md` centered.

## States

Entries: single key, modifier pair (`⌘` + `K`), inside a Menu item hint.
`requiredSelectors`: —.

## Motion — none. Icons — none. A11y — native `<kbd>` semantics; sequences read
naturally because the separators are plain text, not styled elements.
