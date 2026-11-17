---
'@polymorph/spec': patch
'@polymorph/registry': patch
---

**A screen spec may compose every part the system card lists.** The validator knew a member's
parts only where the registry also lists their props under the member (`Table.Row`,
`SettingsRow.Group`), so it refused nine parts the card names on every web framework:
`Dashboard.Panel`, `AppShell.NavItem`, `AppShell.NavGroup`, `AppShell.UserCard`, `Table.Head`,
`Table.Body`, `Table.Foot`, `Avatar.Group` and `Tour.Target`. `validate`, `emit_screen`,
`render_screen` and `pnpm emit` now accept each of them, with its props checked against the part.

- The card and the validator read one list, `shippedParts` in `@polymorph/registry/frameworks`:
  React's parts are its export's, another framework's are the ones its files declare, and a
  native platform's are the ones its contract declares.
- A part the screen's framework or platform does not carry is a fault that lists the parts the
  member has there. `Table.Head` on `ios` is answered with `Table.Row`, `Table.Header` and
  `Table.Cell`, the parts the Swift contract declares.
- A name that is a member and a part it does not have is answered with the member's parts in
  place of a guess at another member.
- A part only another framework's files declare (`Toast.Viewport` in Vue) has no props on record,
  because the registry reads a part's props from the React member. A spec cannot compose it, and
  the fault says so.
- The Vue, Svelte and Angular emitters read a part's props from the part, so a part's event
  (`onSelect` on `AppShell.NavItem`) is written as an event.
