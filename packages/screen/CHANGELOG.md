# @polymorph/screen

## 1.0.18

### Patch Changes

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

## 1.0.17

### Patch Changes

- 14d4d55: The run-time card (`runtimeCard`) says two things a measured run showed a model needs. A member
  that takes the four ARIA props lists them as `aria-*`, and the card says each is written under its
  own name and that no member has a prop named `aria`: a model that read `aria` in a member's line
  wrote a prop of that name, holding an object. The output contract says a control's name is used
  once in a screen, because two forms on one screen each named a field `email` and `values` holds
  one value for a name.
- 628200f: `@polymorph/screen` is a new package: what a host needs to draw a screen a model writes, at run
  time, with no build. The screen is a `polymorph-screen/1` document, the format `pnpm emit` reads.
  The package has no framework, no DOM and no dependencies:

  - `VOCABULARY` (`@polymorph/screen/vocabulary`): the members, their props, parts and lawful cells,
    generated from the release's registry.
  - `checkScreen(document, { framework, members })` (`@polymorph/screen/check`): the spec
    validator's faults, in a page or in Node, with no registry, and the faults the walk adds for
    the document: a member the host does not allow, an address that is not relative or `http:`,
    `https:`, `mailto:` or `tel:` (as text, or a flat list of text), a control's name two controls
    share or every object has, an input type or a key over its length limit, a callback input bound where no
    callback receives it, an element in a structured object's field that takes no node, and a
    document nested too deep to read. `ThirdParty` is allowed only where the host names it in
    `members`.
  - `parsePartial(text)` (`@polymorph/screen/partial`): the document a model's streamed answer holds
    so far, prose and a fenced `json` block included.
  - `createScreen(options)` (`@polymorph/screen/walk`): what a renderer draws from a document, the
    host's data and the vocabulary, with actions, controls that follow the reader, named values and
    faults. A callback input is handed by the prop or field it is bound to: where that prop's type
    returns nothing, it is an action the host is told of (`{ name, args, values, changed }`); where
    it returns a value, nothing is passed if it may be left out and a stub answers by that type if it
    is required, and the host is never told; anywhere else, the binding is a fault and nothing is
    passed. An element whose required data prop was never written, or was refused, is not drawn,
    with a fault that names the prop; a slot whose element is a fault leaves its page drawn, while a member that reads one element it
    requires (a FormField's child, a SettingsRow's `control`) is not drawn without it. A
    function in the host's data is never handed to a member as itself. `values` holds what each named control holds, on screen or not, its default or its empty value included, and `changed` names the ones the person chose. An element in a structured
    object is drawn only where the field's data type takes a node, and none at any depth below a
    field that takes data only. Each node's `key` holds a named
    control's name, so a renderer draws a renamed control afresh.
  - A document nests at most `MAX_DEPTH` (128) objects and lists, a declared input type is at most
    `MAX_TYPE_LENGTH` (500) characters, a key a document writes is at most `MAX_KEY_LENGTH` (100)
    characters, and a value reduced to JSON holds at most `MAX_JSON_VALUES` (100,000) values.
    `hostile.test.ts` feeds the core documents and host data written to break it (deep nesting, long
    strings, thousands of children, an unclosed fence, cyclic and shared data, input types and keys
    over their limits): none makes it throw, and for each kind it times, the larger of two sizes
    costs less than twenty times the smaller (eight times the size, for most kinds).
  - `runtimeCard({ framework, members })` (`@polymorph/screen/card`): the text a host puts in the
    model's system prompt: the members it allows, each with its props' types, the data types those
    props take with their fields, and the output contract.

- e7f8f9c: The run-time core holds a pager's `previousHref` and `nextHref` and an image's `srcSet` to the
  rule for an address, as it holds `href`, `src` and `avatar`. Each address in a `srcSet` is checked.
  `addressListFault` is exported beside `addressFault`.
