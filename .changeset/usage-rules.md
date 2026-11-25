---
'@polymorph/rules': patch
'@polymorph/engine': patch
'@polymorph/recipes': patch
'@polymorph/screen': patch
'@polymorph/spec': patch
'@polymorph/registry': patch
---

**Three usage rules for Button, and a destructive Button never takes focus first.**

- `@polymorph/rules` gains three red rules, in `stageTwoRules` and so in `allRules`, which
  `polymorph add` applies. An app that upgrades may see new reports from them:
  - `polymorph/one-main-button`: a second main Button (`solid`/`accent`, the defaults) in one
    Dialog, Drawer, Popover, Card or `Dashboard.Panel`.
  - `polymorph/danger-last`: a Button with `tone="danger"` before another Button in its row.
  - `polymorph/trailing-icon`: a `trailingIcon` that is not a direction or a disclosure. The fix
    moves the role to `icon` when the Button has none.

  The groups report them as warnings, so a build that passed still passes. Spread the new
  `usageRulesAsErrors` after the groups to make them errors. `polymorph check`, the MCP server's
  `validate` and the screen emitter's check list a warning as they list an error. The rules read
  TSX, Vue, Svelte, Solid and Angular. `@polymorph/rules/usage` holds what they count.
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
