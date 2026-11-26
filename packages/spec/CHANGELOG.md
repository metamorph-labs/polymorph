# @polymorph/spec

## 1.0.18

### Patch Changes

- 2186c5c: `emitCommand` is `pnpm emit` as a function: the arguments, the registry and the tree that holds the
  native member packages in, an exit code out. The checkout's `bin/emit.js` and the published tools'
  emitter both run it, so the two refuse and write alike.
- ddbd1d4: **Three usage rules for Button, and a destructive Button never takes focus first.**

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

- Updated dependencies [2186c5c]
- Updated dependencies [49eed56]
- Updated dependencies [ddbd1d4]
  - @polymorph/registry@1.0.18
  - @polymorph/rules@1.0.18

## 1.0.17

### Patch Changes

- 430b1b0: `isActionType` reads a type written inside many pairs of parentheses in time linear in its length.
  It removed one pair at a time before, so 20,000 nested pairs took seconds. Its answer for every type
  is unchanged: a test holds it to the earlier reading for every type the registry prints and every
  input type in `design/screens/`, and for random text of brackets and arrows.

  `stubFor` in `@polymorph/screen`, which says what a callback answers, now peels each `Promise<…>`
  around a return type once and answers by what is inside: `() => Promise<boolean | null>` answers a
  promise of nothing, where it answered a promise of `false` before. The words a tool prints for such
  a callback input (`render_screen`'s fills) change with it. No member's prop has such a type.

- a749193: **`validateSpec` takes any vocabulary that holds what it reads.** Its first parameter is typed
  `SpecVocabulary`: the members, the exception primitives and the icon roles, with the fields the
  validator reads of each (`SpecMember`, `SpecPrimitive`, `SpecProp`, `SpecPlatformEntry`,
  `SpecFrameworkEntry`). The registry is one. The run-time core's vocabulary table is another, so
  `checkScreen` in `@polymorph/screen` gives a page the registry's faults with no registry in it. A
  caller that passes a `Registry` changes nothing.

  `isActionType`, the rule that reads a type as a callback, is also exported from a new subpath,
  `@polymorph/spec/action-type`, which loads no validator. `@polymorph/spec/validate` still exports
  it.

- Updated dependencies [b33e18c]
- Updated dependencies [a749193]
  - @polymorph/rules@1.0.17
  - @polymorph/registry@1.0.17

## 1.0.16

### Patch Changes

- eadf74f: **A screen spec's shape faults say what was written.**

  - A key the format does not have is reported with the fields the object does have:
    `` `optional` is not in the schema — the fields here are `name`, `type` and `doc` ``. The fault
    was `not in the schema`, with the key only in its path.
  - A fault inside a nested value is reported where it is. An element with a misspelt field, or a
    binding with a second key, was reported at the outermost child as `expected a string, got a
object`.
  - A plain object where a value goes is reported once, with the three forms an object may take and
    how a plain one is written (`{ "$object": { … } }`).
  - A prop written as a field of its element, beside `props`, is told that it is a prop of that
    member and that it goes inside `props`.
  - A `types` entry written as a default or a namespace import (`default as React`) is told that a
    type is imported by its own name and written bare in the input's type.
  - The schema's descriptions say that every binding names a declared input, a function a member
    requires included, that `types` has no default or namespace import, and that an element has no
    field for a note.

- 860e60b: **A screen spec may compose every part the system card lists.** The validator knew a member's
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

- Updated dependencies [3ce48d6]
- Updated dependencies [eadf74f]
- Updated dependencies [860e60b]
  - @polymorph/rules@1.0.16
  - @polymorph/registry@1.0.16

## 1.0.15

### Patch Changes

- @polymorph/registry@1.0.15
- @polymorph/rules@1.0.15

## 1.0.14

### Patch Changes

- Updated dependencies [9b60a94]
  - @polymorph/registry@1.0.14
  - @polymorph/rules@1.0.14

## 1.0.13

### Patch Changes

- 56e7665: The tools know the elements. The registry lists `elements` among the `frameworks`, publishes each
  member's entry in `design/frameworks/elements.json` with a shell that copies nothing, and names in
  `vendor.frameworks.elements.noBuild` the files a page with no build loads and the command that
  builds them. `get_system_card` with `framework: "elements"` returns the elements card, which says
  how a prop reads as an element. A `.html` file is an elements page in a project that uses the
  elements and not Angular, read from `polymorph.json` where there is no `package.json`.

  `polymorph init <dir> --framework elements` writes a page with no build: the files the page loads
  copied into `public/polymorph/` (`--dir` names the static directory), `theme.css` compiled there,
  an example page, the card, the MCP config and `polymorph.json`. A checkout that has not built the
  files is told to run `pnpm build:packages`. `polymorph add <member>` installs nothing in an elements
  install and says why; `add theme:<system>` writes the theme sheet again with the system added, and
  `update` copies the files again where the build changed them and keeps a file you edited.
  `polymorph check` leaves an elements page unread and says so, because the red rules do not read
  HTML. `pnpm emit`, the emitter and the MCP tool `emit_screen` refuse the elements with the reason:
  HTML has no way to bind a screen's callbacks and node renderers. Every read tool takes
  `framework: "elements"`, and the MCP tools that write accept a project with a `polymorph.json` and
  no `package.json`.

- Updated dependencies [d84171d]
- Updated dependencies [73837b5]
- Updated dependencies [56e7665]
- Updated dependencies [2da1598]
- Updated dependencies [56e7665]
  - @polymorph/registry@1.0.13
  - @polymorph/rules@1.0.13

## 1.0.12

### Patch Changes

- Updated dependencies [9f8c97f]
- Updated dependencies [96daa65]
- Updated dependencies [6119b46]
  - @polymorph/rules@1.0.12
  - @polymorph/registry@1.0.12

## 1.0.10

### Patch Changes

- @polymorph/rules@1.0.10
- @polymorph/registry@1.0.10

## 1.0.9

### Patch Changes

- @polymorph/registry@1.0.9
- @polymorph/rules@1.0.9

## 1.0.8

### Patch Changes

- 820c836: Every package now carries the release's version, and the release tag is `v` and that version.
  Until this release each package kept its own number, so one release installed the engine at one
  version, the foundations at another and the tag named a third. From this release on, pin every
  `@polymorph/*` package you install at the same version, and check the native packages out at the
  tag of that version.

  This package's version jumps to the release's number. The jump carries no change of its own: the
  versions it skips were never published.

- Updated dependencies [820c836]
  - @polymorph/rules@1.0.8
  - @polymorph/registry@1.0.8

## 1.0.4

### Patch Changes

- @polymorph/rules@1.0.3
- @polymorph/registry@1.0.4

## 1.0.3

### Patch Changes

- Updated dependencies [1b900d8]
- Updated dependencies [1b900d8]
- Updated dependencies [1b900d8]
  - @polymorph/rules@1.0.2
  - @polymorph/registry@1.0.3

## 1.0.2

### Patch Changes

- Updated dependencies [192c31c]
  - @polymorph/registry@1.0.2

## 1.0.1

### Patch Changes

- 700e130: Screen specs emit for every web framework, for SwiftUI and for Compose, and their code fields are each held to what they claim to be.

  **Breaking.**

  - An emitted React screen imports its members from `@polymorph/react-ui`, which is the value of `IMPORT_SOURCE`, where it imported `@polymorph/ui`.
  - `validateSpec` rejects four things it used to accept. **A binding that is an expression**: `{ "$": "items.map(…)" }`, `{ "$": "onSave()" }` and `{ "$": "items[0]" }` are faults; a binding is a declared input or a dotted path of names into one (`draft.subject`), and the rule is also a `pattern` in the published JSON Schema. **A `component` with more than two segments**: the name is matched whole. **An input `type` that is not one TypeScript type**: it is parsed by the TypeScript parser and must be a single type made only of type syntax; the browser-safe `@polymorph/spec/validate` subpath takes this check as an optional `judges` argument. **A `types` entry that is not an importable name**, a module key that holds a quote, backslash or space, and a structured object (`$object`) among children. Compute a value in the container and hand it in as an input. Every spec in `design/screens/` is unaffected.

  **Every web framework.** `emitScreen(spec, { framework, registry })` writes a Vue single-file component (`framework: 'vue'`), a Svelte component (`'svelte'`: a node-typed prop is a snippet, a callback a prop), Solid TSX that reads its inputs from `props` (`'solid'`), or an Angular standalone component module (`'angular'`: selector `app-<name>`, an inline template, every input a signal input, a node-typed prop projected through `ngProjectAs="[slot=…]"`). Validation checks every member against that framework's vocabulary first, and `MissingRegistryError` names the framework that needs the registry. `pnpm emit` chooses the framework from the output's extension (`.vue`, `.svelte`, `.ts`) or `--framework`. Exports: `SVELTE_IMPORT_SOURCE`, `SOLID_IMPORT_SOURCE`, `ANGULAR_IMPORT_SOURCE`, `angularScreenSelector`.

  **Native screens.** A spec's `platform` field names where the screen runs. A spec whose `platform` is `ios` or `android` is never emitted as web code: it emits SwiftUI (`.swift`) or Jetpack Compose (`.kt`), held to the native screen contract (`design/native/screen-contract.md`): a model, a record of actions and a stateless view, against the platform's member package. Validation refuses a member absent on the spec's platform, and, for a native spec, everything the screen contract forbids, each at its path.

  **Emission is checked and exact.** `pnpm emit` lints the emitted screen and writes nothing if a red rule refuses it, and a native screen is held to the contract's law. The emitter prints text so it cannot mean something else: `*/` in `purpose`, a `doc` or an exception's `because` does not end its comment; a string with a line break or a character reference is written as an expression; a text child keeps its spacing. A declared exception on the root element, a list of plain values in a prop, and a string containing a line break each emit a file that parses. Exports: `EMITTED_MARKER` (the words an emitted file's header carries), `emitCheckedScreen`, `BINDING_PATH` and the `SpecJudges` type. The package depends on `typescript`.

- Updated dependencies [700e130]
- Updated dependencies [700e130]
  - @polymorph/registry@1.0.1
  - @polymorph/rules@1.0.1

## 1.0.0

The first versioned release. Earlier history is in git.
