# @polymorph/mcp

## 1.0.18

### Patch Changes

- 2186c5c: **Every entry point starts the same server.** `serverFlags` reads the server's command line
  (`[--project <path>] [--read-only]`, an unknown flag refused) and `serveStdio` starts the server
  over stdio; the checkout's `polymorph-mcp` and the published tools' bins both use them.
  `render_screen` reads a page built ahead of time when its context names one (`screenPage`), and
  its advice for a missing browser is the entry point's (`browserSetup`, `checkoutBrowserSetup` for a
  checkout). `browserAdvice` takes that setup where it took the checkout's path.
- f5c3a2b: The server registers its tools from one table (`TOOLS`), and `toolCaller(context)` calls the same
  table by name in the same process: it checks the arguments with the tool's own schema and returns
  `{ value, images, isError }`, the answer the server would have sent before encoding it. A context
  with no project has no write tool, as a `--read-only` server has none. `serveStdio(context)` runs
  the server over stdio and resolves once the client has closed stdin and every request has its
  answer; `polymorph-mcp` and `polymorph mcp` both start the server with it.
- fc1e0ca: **`render_screen` reports two more layout faults.**

  - `no-gap`: a member that touches another member with nothing between them, in a box that lays its
    children out in flow, as a field placed directly above a Table in a Card does, or a member whose
    own border lies against the inside of a box's border with no inset. A member that paints nothing,
    such as a Table or an Image's frame, a member's own parts, members in a flex or grid container,
    and a bar that runs edge to edge are not reported.
  - `unseen-focus`: a control that, given keyboard focus, draws no mark, draws only an outline under
    2px, or draws an outline under 3:1 against what it is drawn on or cut by a box that cannot scroll
    to it. A mark on the box around the control, such as a field's frame, counts.

  The page gives each control keyboard focus after the picture is taken, so the pictures are
  unchanged, and puts focus and scroll positions back afterwards.

- 49eed56: A search of several words finds members. `search_components`, `polymorph search` and the
  workbench's Components page read `date picker` or `date-picker` as the name `DatePicker`, then as
  a phrase, then word by word: a member is found when one of the words is in its name or when every
  word is in its name or its purpose, and one that answers some of the words ranks below one that answers all
  of them. Before, a query of several words matched only where a purpose or a
  prop's doc held the phrase exactly, so `date picker` found nothing.
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

- Updated dependencies [5a4e457]
- Updated dependencies [f5c3a2b]
- Updated dependencies [b40ece2]
- Updated dependencies [786c025]
- Updated dependencies [5b73195]
- Updated dependencies [2186c5c]
- Updated dependencies [41606c8]
- Updated dependencies [2186c5c]
- Updated dependencies [49eed56]
- Updated dependencies [2186c5c]
- Updated dependencies [ddbd1d4]
- Updated dependencies [f5661ea]
  - @polymorph/cli@1.0.18
  - @polymorph/theme@1.0.18
  - @polymorph/registry@1.0.18
  - @polymorph/spec@1.0.18
  - @polymorph/rules@1.0.18

## 1.0.17

### Patch Changes

- 33749e6: **`render_screen` draws a spec as a product draws a model's screen at run time.** The screen page
  draws with `@polymorph/react/screen` and the run-time core (`@polymorph/screen`), so the picture is
  the one a product that draws the same spec shows. A FormField's control now gets the field's id and
  label in the picture, as it does in JSX, so a Switch inside a FormField is named by the field's
  label.

  How each callback input was filled is reported in the core's words. One that returns nothing is
  `an action; answers nothing` (`an action; answers a promise` when its type returns one). One that
  returns a value says what its type answers: `answers the key of its first argument`.

- Updated dependencies [b33e18c]
- Updated dependencies [a749193]
- Updated dependencies [430b1b0]
- Updated dependencies [a749193]
  - @polymorph/rules@1.0.17
  - @polymorph/registry@1.0.17
  - @polymorph/spec@1.0.17
  - @polymorph/cli@1.0.17
  - @polymorph/theme@1.0.17

## 1.0.16

### Patch Changes

- 3f28043: **`validate`, `emit_screen` and `render_screen` take a spec as an object.** `spec` was JSON text
  only, so an agent wrote the document inside a JSON string, escaped a second time, and a slip in
  that escaping failed the call with `the spec is not JSON` before anything about the screen was
  checked. `spec` is now the document itself or its JSON text, and both are read alike.
- Updated dependencies [2f0ddd2]
- Updated dependencies [3ce48d6]
- Updated dependencies [eadf74f]
- Updated dependencies [860e60b]
  - @polymorph/theme@1.0.16
  - @polymorph/rules@1.0.16
  - @polymorph/spec@1.0.16
  - @polymorph/registry@1.0.16
  - @polymorph/cli@1.0.16

## 1.0.15

### Patch Changes

- @polymorph/spec@1.0.15
- @polymorph/cli@1.0.15
- @polymorph/registry@1.0.15
- @polymorph/rules@1.0.15
- @polymorph/theme@1.0.15

## 1.0.14

### Patch Changes

- Updated dependencies [9b60a94]
  - @polymorph/registry@1.0.14
  - @polymorph/rules@1.0.14
  - @polymorph/cli@1.0.14
  - @polymorph/spec@1.0.14
  - @polymorph/theme@1.0.14

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
  - @polymorph/cli@1.0.13
  - @polymorph/rules@1.0.13
  - @polymorph/spec@1.0.13
  - @polymorph/theme@1.0.13

## 1.0.12

### Patch Changes

- 61b694c: The MCP server has a new read tool, `render_screen`, which lets an agent see a screen it specified.

  - It takes a web screen spec (the JSON text `validate` accepts) and a `system`, with an optional `palette` and `mode`, and draws the spec in a real browser at a phone width (375px) and a desktop width (1440px). The answer is JSON followed by one PNG for each view.
  - The JSON lists the layout faults measured in the page: `sideways-scroll`, `clipped-text`, `small-target` (a control under the 24px touch-target floor with another control beside it) and `cut-off`. Each names its element and gives the numbers.
  - `data` fills the spec's inputs for a populated screen, and `empty` lays values over it for a second drawing of the empty screen. With neither, each input is sampled from its type and the answer says how every input was filled. Callbacks are always stubs.
  - An unlawful spec is answered with its faults and not drawn. The tool writes nothing.
  - The tool needs a browser. Playwright is an optional dependency of the server, and its Chromium is downloaded once with `pnpm exec playwright install chromium` in the polymorph checkout. Without it, `render_screen` answers with that command and every other tool works as before.

  `polymorph init` writes one more line in the app's `AGENTS.md`, for every framework: it names `render_screen` and the command that downloads its browser.

- Updated dependencies [4186a6b]
- Updated dependencies [9f8c97f]
- Updated dependencies [96daa65]
- Updated dependencies [61b694c]
- Updated dependencies [6119b46]
  - @polymorph/cli@1.0.12
  - @polymorph/rules@1.0.12
  - @polymorph/spec@1.0.12
  - @polymorph/registry@1.0.12
  - @polymorph/theme@1.0.12

## 1.0.10

### Patch Changes

- @polymorph/rules@1.0.10
- @polymorph/spec@1.0.10
- @polymorph/cli@1.0.10
- @polymorph/registry@1.0.10
- @polymorph/theme@1.0.10

## 1.0.9

### Patch Changes

- @polymorph/cli@1.0.9
- @polymorph/registry@1.0.9
- @polymorph/rules@1.0.9
- @polymorph/spec@1.0.9
- @polymorph/theme@1.0.9

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
  - @polymorph/theme@1.0.8
  - @polymorph/registry@1.0.8
  - @polymorph/cli@1.0.8
  - @polymorph/spec@1.0.8

## 1.0.4

### Patch Changes

- Updated dependencies [22f607b]
  - @polymorph/theme@1.0.1
  - @polymorph/rules@1.0.3
  - @polymorph/cli@1.0.4
  - @polymorph/registry@1.0.4
  - @polymorph/spec@1.0.4

## 1.0.3

### Patch Changes

- 1b900d8: A palette can state its brand's exact accent and focus colours, a system can choose how a focused field and an unfilled Button look, and a palette can name the palette a reader who asks for more contrast gets. Each was a stylesheet an application wrote by hand; each is now a field in the system or palette document, held by the laws that hold a derived value.

  **Pins.** A palette document takes `pins`: exact colours per mode for `accent.bg`, `accent.bgHover`, `accent.bgActive`, `accent.contrast`, `border.focus` and `border.focusSolid`. Each is an opaque `#rrggbb`; `border.focus` may also be `rgb(r g b / a)`. The stylesheet carries a pin as stated, an unpinned `accent.contrast` is chosen against a pinned fill, and the contrast law never moves a pin. Admission refuses a pin that fails its floor, with the measured value and the pin named: a label under Lc 60 on a pinned fill, or a pinned focus colour that does not stand out. Move an application's `--pm-accent-*` and `--pm-border-focus*` declarations into the palette's `pins` and delete them.

  **A focus floor.** `border.focus` (composited) and `border.focusSolid` must now separate from every text-bearing background by ΔL 0.08 (`FOCUS_MIN_DELTA_L`), in every pairing. Every house pairing already does. A guest palette whose derived focus colours fall short is repaired like any other role; a pinned one is refused.

  **Two system choices.** `overrides.focus.field: "border"` draws a focused field's focus inside its edge, at the system's focus width, in `border.focusSolid`, over the field's seat shadow, instead of the ring around it; an invalid field keeps the ring. `overrides.hover.unfilled: "none"` gives `outline` and `ghost` Buttons no wash under the pointer; the press and a toggle's on state keep theirs. Both are emitted as flags (`--pm-focus-field`, `--pm-hover-unfilled`) that `@polymorph/recipes`' focus convention and Button recipe read, so every web framework's members follow them with no member change. Delete application CSS that replaced field focus rings or removed outline and ghost hover backgrounds, and set the choice in the system file. The SwiftUI and Compose members do not read either choice, because no native theme has a field for them.

  **More contrast.** A palette document takes `moreContrast`, the name of another palette. Admitted with it (`admitTheme({ system, palette, moreContrast })`, or by listing both palettes in `polymorphTheme`), the pairing's stylesheet carries the partner's colours under `@media (prefers-contrast: more), (forced-colors: active)`, so the switch follows the reader's setting before first paint with no script. `polymorphTheme` fails the build when a palette names a partner that is not in `palettes`, and `admitTheme` refuses a palette that names a partner it is not given, with a `schema` fault. `polymorph theme validate|emit` reads the partner from a third path or from the file named for it beside the palette; a vendored install installs the partner with the palette, and the registry's palette entry names it; the MCP's `save_theme` reads it from the `palettes` directory it saves into, so save the partner first. An app that emits its own catalogue passes `moreContrastOf(system, palette, palettes)` to `emitThemeCSS`. A second system and a hand-mapped palette for high contrast can be replaced by one partner palette. The partner reaches the web only: the token document a native app reads names no partner, and no SwiftUI or Compose member reads the platform's contrast setting. An iOS app that wants it loads a second token document, admitted with the partner palette, and installs it while `colorSchemeContrast` is `.increased` (`docs/native.md`).

  **The base type size stays 16px.** A system document's `overrides.type.base` is refused with its reason: the 16px base is the text-entry floor that stops iOS zooming the page on focus. A steeper `type.ratio` gives smaller `sm` and `xs` steps.

  **Admission reports a hairline in ΔL.** A failing border, underline or focus pairing now reads `reached ΔL 0.031, floor is 0.04` rather than an Lc measured against a floor of 0.

- Updated dependencies [1b900d8]
- Updated dependencies [1b900d8]
- Updated dependencies [1b900d8]
  - @polymorph/rules@1.0.2
  - @polymorph/cli@1.0.3
  - @polymorph/registry@1.0.3
  - @polymorph/spec@1.0.3

## 1.0.2

### Patch Changes

- Updated dependencies [192c31c]
  - @polymorph/cli@1.0.2
  - @polymorph/registry@1.0.2
  - @polymorph/spec@1.0.2

## 1.0.1

### Patch Changes

- 700e130: The MCP server names the split packages, answers for every framework and platform, and gains tools that write.

  **Breaking.** `search_components` filters on `origin: 'installed'` where it took `'core'`, and its hits report the new value. `get_install_plan` and `install` name `@polymorph/engine`, `@polymorph/react`, `@polymorph/react-ui` and `@polymorph/rules`. For `emit_screen`, an expression in a binding comes back under `faults`, where it came back under `violations`. A client that auto-approved every polymorph tool because all of them read should review that setting: the server has tools that write (below).

  **Frameworks and platforms.** Every tool that takes `framework` accepts `react`, `vue`, `svelte`, `solid` and `angular`, and every tool that takes `platform` accepts `web`, `ios` and `android`. `get_system_card` renders the card for either. `search_components` leaves out what is absent there. `validate` lints Vue and Svelte single-file components, Solid TSX, and an Angular component module (its inline template included) or template, and checks a screen spec on its platform and against the framework's vocabulary. `fix` and `fix_file` take `framework` too, and `fix_file` reads `.vue`, `.svelte` and Angular `.html` files as well as TypeScript, JavaScript and CSS. Without `framework`, `validate`, `fix`, `fix_file` and `emit_screen` read TSX, and `validate` and `emit_screen` a web spec, as Solid's in a project whose package depends on `@polymorph/solid-ui` and not `@polymorph/react-ui`, and as React's otherwise; a React project reads as before. `get_theme_axes` takes `tokenValues: true` to include each system's token values.

  **Tools that write**, each landing what a read tool answered, in a **project**: the directory the server is started in, or `--project <path>`, a directory with a `package.json`. `--read-only` keeps the read tools and no write tool, and a flag the server does not know stops it with a usage line.

  - `emit_screen { spec, path }` compiles a screen spec, checked as `validate` checks one, to the file its path names: React or Solid TSX, a Vue or Svelte component, an Angular component module, or for a native spec SwiftUI or Compose. An unlawful spec writes nothing, and it replaces a file only when that file is itself an emitted screen.
  - `install { items, dir? }` runs `polymorph add`: it applies the plan `get_install_plan` returns, and keeps any file it did not put there or that the project has edited since. It refuses a project that is a checkout of polymorph or a directory inside one.
  - `save_theme { system, palette, dir?, overwrite? }` admits the pair through the theme engine and writes `<dir>/systems/<name>.json` and `<dir>/palettes/<name>.json`. An unlawful pair writes nothing.
  - `fix_file { path }` rewrites a file in the project with every red-rule violation that has exactly one lawful rewrite fixed, and reports the violations that are left. `fix { code }`, a tool that reads, returns the same rewrite of submitted code and writes nothing.

  `@polymorph/mcp` exports `emitScreen`, `install`, `saveTheme`, `fix`, `fixFile`, `READ_TOOL_NAMES` and `WRITE_TOOL_NAMES`.

- Updated dependencies [700e130]
- Updated dependencies [700e130]
- Updated dependencies [700e130]
- Updated dependencies [700e130]
  - @polymorph/cli@1.0.1
  - @polymorph/registry@1.0.1
  - @polymorph/rules@1.0.1
  - @polymorph/spec@1.0.1

## 1.0.0

The first versioned release. Earlier history is in git.
