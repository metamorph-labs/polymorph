---
'@polymorph/rules': patch
'@polymorph/engine': patch
'@polymorph/recipes': patch
'@polymorph/screen': patch
'@polymorph/spec': patch
'@polymorph/registry': patch
'@polymorph/cli': patch
'@polymorph/mcp': patch
---

**Three usage rules for Button, and a destructive Button never takes focus first.**

- `@polymorph/rules` gains three red rules, in `stageTwoRules` and so in `allRules`, which
  `polymorph add` applies. An app that upgrades may see new reports from them:
  - `polymorph/one-main-button`: a second main Button (`solid`/`accent`, the defaults) in one
    Dialog, Drawer, Popover, Card or `Dashboard.Panel`.
  - `polymorph/danger-last`: within one group of Buttons placed together, a danger Button
    before another Button.
  - `polymorph/trailing-icon`: a `trailingIcon` that is not a direction or a disclosure. The fix
    moves the role to `icon` when the Button has none.

  The groups report them as warnings, so a build that passed still passes. Spread the new
  `usageRulesAsErrors` after the groups to make them errors. The rules read TSX, Vue, Svelte,
  Solid and Angular. `@polymorph/rules/usage` holds what they count.
- A warning stays a warning past ESLint. `verify`'s `Diagnostic` gains an optional `severity`
  (`error` or `warning`), which `verify` always writes from the linter's result, with
  `isWarning`, `errorsOf` and `warningsOf` beside it. `polymorph check` marks a warning, counts it
  apart and exits 1 on errors only. The MCP server's `validate`, `fix` and `fix_file` return
  warnings in `warnings`, apart from `violations`, and `ok` reads the violations alone.
  `emitCheckedScreen` returns `warnings` beside `violations`, and `emit_screen`, `pnpm emit` and
  the screen scripts write a screen whose code has only warnings. Every existing rule is an
  error, so nothing else changes.
- `danger-last` reads the Buttons one element holds side by side, up to a `Separator`, as one
  group. A destructive action in a group of its own, apart from the group that holds the main
  Button, may come first.
- `design/icons.json` marks the roles a trailing icon may take `trailing`: `collapse`, `down`,
  `expand`, `forward`, `next` and `open-external`. The registry publishes it as `icons.trailing`.
- The validation of a screen spec (`@polymorph/spec/validate`, and `checkScreen` in
  `@polymorph/screen`) reports the same three as faults.
- `@polymorph/engine`: `modalFocusTarget` never puts focus on a destructive Button when a
  Dialog or a Drawer opens, in any framework. A footer whose rightmost action is destructive
  starts on its leftmost safe action. A footer whose every action is destructive starts in the
  body, else on close. A Dialog with a `tone="danger"` primary used to start on it.
- `@polymorph/recipes`: a disabled control fades its glyph with its label where it did not:
  Accordion's chevron at rest, a checked and disabled entry's check in Menu, ContextMenu,
  Menubar, SplitButton, Select, Combobox and MultiSelect, a disabled submenu row's chevron, and
  the text of ImageEditor's and FileUpload's drop zones. A danger row's icon in Menu,
  ContextMenu, Menubar and SplitButton takes the row's danger colour, as its spec says.
