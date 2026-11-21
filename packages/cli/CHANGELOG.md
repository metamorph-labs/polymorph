# @polymorph/cli

## 1.0.16

### Patch Changes

- Updated dependencies [2f0ddd2]
- Updated dependencies [3ce48d6]
- Updated dependencies [eadf74f]
- Updated dependencies [860e60b]
  - @polymorph/theme@1.0.16
  - @polymorph/rules@1.0.16
  - @polymorph/registry@1.0.16

## 1.0.15

### Patch Changes

- @polymorph/registry@1.0.15
- @polymorph/rules@1.0.15
- @polymorph/theme@1.0.15

## 1.0.14

### Patch Changes

- Updated dependencies [9b60a94]
  - @polymorph/registry@1.0.14
  - @polymorph/rules@1.0.14
  - @polymorph/theme@1.0.14

## 1.0.13

### Patch Changes

- d84171d: An agent on a running page can read and operate the mounted members through an API, instead of
  clicking or reading screenshots. A member's spec declares what an agent may read and do in an
  `## Agent` section, and nothing else grants access. The bridge is opt-in: a page that does not
  import `@polymorph/engine/agent` does not ship it. `docs/agents.md` describes the bridge for an
  application and the section for a member's author.

  **The bridge.**

  `@polymorph/engine/agent` is a new entry point. `createAgentBridge({ confirm, policy, settleMs })`
  returns a bridge with `snapshot()`, `query({ name, text, member })`, `act(steps)`,
  `subscribe(listener)`, `acting` and `dispose()`.

  - An action the spec does not declare is refused, and the error lists the actions that are
    allowed.
  - A secret value is reported as `{ secret: true }`, and so is any value that holds the text of a
    password field.
  - An action of a destructive instance runs only after `confirm` resolves true. Without a
    `confirm`, it is refused.
  - A policy can hide a member or deny an action. It cannot add either.
  - A member is listed only while its element is in the document, so a closed Dialog, Drawer,
    Popover or ConfirmDialog is not listed, and a step on it answers `unknown-member`. A member in
    content marked `hidden` is not listed either, so a closed panel a renderer keeps in the
    document gives an agent what a removed one does. A step that removes its member's element
    still reports what changed.
  - Each member carries `description`, the text of the elements its control names with
    `aria-describedby`, such as a field's hint and error, when there is any. `query`'s `text`
    matches it. A member that holds a secret, or a password field, gives none.
  - A step that succeeds dispatches `polymorph:agentchange`, bubbling, on the element its member
    names after the step, else on the one it named before if that is still in the document, else
    on the document, with `detail: { id, member, action, changed, source: 'agent' }`, and
    `bridge.acting` is true while its action runs, so a handler can tell an agent's change from a
    person's.
  - `agentTools(bridge)` returns the bridge as three tools, `polymorph_snapshot`,
    `polymorph_query` and `polymorph_act`, for an application's own agent.
    `registerWebMCP(bridge)` registers them with the browser's WebMCP API on
    `document.modelContext` or `navigator.modelContext` and returns the function that unregisters
    them. Where the API is absent it does nothing.

  **Registration.**

  `agentMember(handle)`, `agentFill(element, text)` and `agentPress(element)` are new exports of
  `@polymorph/engine` and of every foundation, with the types `AgentHandle`, `AgentAction`,
  `AgentArgumentType` and `AgentArgumentValues`. A member registers a handle while it is mounted.
  `useAgentMember(handle)` in `@polymorph/react` registers a React member on mount, removes it on
  unmount and calls the latest render's closures; `useAgentMember(handle, { unless })` registers
  nothing while `unless` is true. The engine and every foundation also export
  what several renderers share: `menuChoices`, `chooseMenuEntry`, `menubarChoices` and
  `chooseMenubarEntry`; `railDestinations`, `currentRailDestination` and `goToRailDestination`,
  which read an AppShell's destinations from its navigation in the document and press one, with
  the types `RailClasses` and `RailDestination`; `listItems`, `currentListItem` and
  `chooseListItem`, which read a List's items from its list in the document and press one, with
  the type `ListItemChoice`; `jsonTreeBranches`, `jsonTreeExpanded` and `setJsonTreeBranch`, which
  read a JsonTree's branches from its toggles by their JSON Pointer and press one, with the type
  `JsonTreeBranch`; `chartMarks`, `chartPosition`, `readChartPosition` and `chooseChartMark`,
  which read a window of at most `CHART_MARK_CAP` of a chart's marks through its reading, read and
  move the reading's position, and pick a mark as Enter does, with the types `ChartMarkChoice`,
  `ChartMarkReading` and `ChartMarkSource`; a
  Table's sortable headers and its sort
  (`tableSortColumns`, `tableSort`, `pressTableSort`); the notices of the toast store and an answer to
  one (`toastNotices`, `toastDetails`, `dismissToastNotice`, `actOnToastNotice`); and the readers of
  the text an agent sets on a date or duration field (`agentDate`, `agentDateTime`, `agentTime`,
  `agentMonth`, `agentDateRange`, `agentDuration`).

  A handle may give `withholds`, the element or elements whose registered members are not an
  agent's. The bridge lists, matches and runs none of them, the policy cannot list them, and the
  member is listed in their place. A member that holds a secret withholds its own element.

  A custom element of `@polymorph/elements-ui` renders its Solid member, so the member inside it
  registers too, and a page that builds the elements with a bundler creates a bridge as any
  application does. A page with no build loads the bridge with `loadAgentBridge`, which
  `polymorph.js` and `polymorph-all.js` export: it resolves to `@polymorph/engine/agent`, built with
  the elements so it reads the registry they write to, and `polymorph.js` fetches it as a chunk of
  its own on the first call.

  **Registering before the bridge loads.**

  `@polymorph/engine/webmcp` is a new entry point, an addition that changes no existing one, and
  holds none of the bridge. `registerWebMCPOnCall(load, options)` registers the three tools with the
  browser's WebMCP API at once, and on the first call of any of them calls `load`, a dynamic import
  of `@polymorph/engine/agent`, once, and creates the bridge with `options`. A load that fails
  resolves the call to `{ error: { code: 'failed', message } }`, and the next call loads again.
  `applyAgentSetting(value)` and `AGENT_ATTRIBUTE` (`data-agent`) do what a page's agent setting
  says: nothing without one, `on-call` as `registerWebMCPOnCall`, and `eager`, which loads the
  bridge at once; another value warns, and without a WebMCP API neither registers nor loads
  anything. `agentTools` and the new registration read one list of the tools' names, titles,
  descriptions, schemas and hints.

  One registration of the tools stands on a page at a time. While one does, a second
  `registerWebMCP`, a `registerWebMCPOnCall` or a page's setting registers nothing and warns in the
  console, where before the browser refused the second registration's names without a word.

  A page with no build states `<html data-agent="on-call">` or `data-agent="eager"` and writes no
  script: `polymorph.js` and `polymorph-all.js` read it as they load. `polymorph init --framework
elements` names the setting in the app's `AGENTS.md`, and its example page states none.

  **The members.**

  These members register, in every web vocabulary. Their props, markup and defaults are
  unchanged. The system card lists each one's actions and states.

  - Controls: Button, AvatarButton, ProviderButton, RecordButton, SplitButton, Link, Input,
    Textarea, SearchInput, NumberInput, PhoneInput, PasswordInput, OTPInput, TagInput, InlineEdit,
    ColorInput, Select, Combobox, MultiSelect, TreeSelect, Checkbox, CheckboxGroup, RadioGroup,
    ChoiceCard, SegmentedControl, ModeSwitch, Switch, Slider, Rating, Calendar, DatePicker,
    DateRangePicker, MonthInput, TimeInput, DurationInput, FileUpload and ImageEditor. A Button
    reads `pressed` as `aria-pressed` says it, and as `null` on a Button that is not a toggle, and
    `expanded` as `aria-expanded` says it, and as `null` on a Button that discloses nothing.
  - Overlays: Dialog, ConfirmDialog, Drawer, Popover, Lightbox, Tour, Menu, ContextMenu, Menubar,
    Command, Tabs and Toast. Toast registers on its viewport, which reads the notices on screen
    and dismisses one or runs its action through the toast store.
  - Structure: Accordion, Collapsible, Alert, Banner, Pagination, CursorPagination, Table,
    DataTable, Tree, Stepper, Carousel, FilterBar, SectionNav, TableOfContents, Breadcrumbs, List
    and AudioPlayer. A Table reads its own sortable headers, and its `sort` presses a header's
    control once, so its caller decides the order; the Table a DataTable draws registers nothing. A
    List reads the items that navigate or are picked from its list, with the current one, and its
    `choose` presses an item's link or button, so `onSelect`, `onNavigate` or the browser takes it
    as a person's press; an item that is only read is not a choice.
    A Card with `href` registers its stretched link, which an agent presses as a person clicks
    it, and ErrorSummary lists its errors and follows one to its field with `choose`, reading its
    links with List's `listItems`. A JsonTree reads its open branches and the branches a reader can
    see, each by the JSON Pointer of its value, and its `expand` and `collapse` press a branch's
    toggle.
  - Layout: SplitPane reads its divider's position in percent, as `aria-valuenow` reports it, and
    its `set` moves the divider within the bounds its floors give and commits, as a key press does.
  - Charts: AreaChart, BarChart, DonutChart, FunnelChart, Heatmap, Histogram, LineChart,
    RadarChart, ScatterChart and Treemap, while they have `onSelect`. `items` lists the marks the
    keys reach, labelled with what the live region says there, at most `CHART_MARK_CAP` of them:
    the whole positions around the reading position. `position`, which the figure shows as
    `data-position`, and `count` say where the reading is and how many positions the chart has,
    `read` moves the reading as Left and Right do, and `choose` moves it to a listed mark and
    activates it as Enter does, so `onSelect` receives a person's payload. A chart without
    `onSelect` registers nothing, and Sparkline, which takes none, never does.
  - Conversation: PromptInput, ChatThread, ToolCall, ReasoningDisclosure, AttachmentChip,
    ArtifactPane and ApprovalCard. AppShell registers too: an agent collapses and expands its rail,
    opens and closes its drawer below the breakpoint, reads the application's destinations from
    its navigation, with the current one, and goes to one by pressing its NavItem, so `onNavigate`
    or the browser takes it as a person's press.

  What an agent is not given:

  - A password and a one-time code are secret, and no action writes them. PasswordInput's reveal
    toggle is not an agent's.
  - No action confirms for a person. ConfirmDialog declares `cancel` only and withholds its
    confirm Button, its phrase field and the Dialog it draws. ApprovalCard declares no action and
    withholds its Buttons.
  - A Button with `tone="danger"`, and a `danger`-toned entry of a Menu, ContextMenu, Menubar or
    SplitButton, asks a person to confirm.
  - RecordButton lets an agent stop a recording and never start one. FileUpload lets an agent
    remove or retry a file and never add one. AudioPlayer and ImageEditor are read only.
  - CopyButton, Tooltip, HoverCard and FormField give an agent nothing, and each spec says why.
    Plan and ChatMessage are not registered, so they stay server components.
    Citation and SourceList are not registered either: each of their links opens a new tab,
    which an agent's press cannot open, and their words are on the page.
  - The Popover ColorInput draws for its picker registers nothing, and ColorInput withholds its
    panel, so an agent sees one ColorInput.

  A React member that passed `value` or `defaultValue` straight to its substrate now holds the
  value itself and keeps the substrate controlled, controlled when the prop is given, so an
  agent's action and a person's reach the same handler in both forms: Checkbox, Switch,
  RadioGroup, SegmentedControl, ChoiceCard, Select, Slider, Tabs, ReasoningDisclosure and
  ToolCall. A native `form.reset()` now resets a Checkbox row's state attribute too.

  **The tooling.**

  - `@polymorph/registry`: each member carries an `agent` field, the statements of its spec's
    `agent` fence, or `null` for a member agents cannot see. `@polymorph/registry/agent` exports
    the grammar, in which a `number` state reads `null` while the member holds none, as an `id`
    state does, and an action may say `presses <part>`, the part whose element it presses with the
    element's own click. The coverage law fails on a control or an overlay whose spec has no decided
    `## Agent` section, and the staleness law on a fence the code does not match.
  - `@polymorph/shells`: a description takes an `agent` block (`on` or `element`, `state`,
    `actions`, `secret`, `destructive`, `withholds`), which each renderer writes as a mount effect
    that registers the instance. A compound part may give the block instead, which registers under
    its member's name (Toast's viewport). A member that lends its identity reads the element the member it
    lends to hands back, as `borrowed`; the Solid foundation exports `BORROWED` and
    `BorrowedHolder`, and the Angular foundation `BORROWED`, `BorrowedHolder`, `handBack`,
    `borrowedHolder`, `lenderHolder` and `KEEPS_HOLDER`.
  - `@polymorph/conformance`: the runner executes every statement of an agent fence against every
    renderer, with a bridge installed; `agentConformanceLaw` holds a shell's fences, and
    `conformanceLaw` calls it. `WINDOW_SIZES` lists the fixture entries the runner mounts at a
    window size other than the default, through the harness's new `viewport`, so an action that
    exists only below a breakpoint is checked there.
  - `@polymorph/engine/testing` exports `agentRegistrations()`, every registered member's id, name
    and elements, withheld ones included.
  - `pnpm new:member` writes the `## Agent` section with a placeholder the coverage law refuses.

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
  - @polymorph/theme@1.0.13

## 1.0.12

### Patch Changes

- 4186a6b: `polymorph add` links the red rules into the flat config the application has: `eslint.config.mjs`, which `create-next-app` writes, `eslint.config.ts` or `eslint.config.mts`, as well as `eslint.config.js`. Before, it wrote a new `eslint.config.js` beside any other, and ESLint read the new file in place of the application's.

  Three smaller fixes to the same edit. A config whose comment mentions `polymorph.eslint.js` is linked, where it was taken for linked already and the rules were not installed. The import is added after an import written over several lines, where it was added inside it. Where the config already binds the name `polymorph`, as the config in the consumer guide does, the fragment is imported as `polymorphInstall`.

- 61b694c: The MCP server has a new read tool, `render_screen`, which lets an agent see a screen it specified.

  - It takes a web screen spec (the JSON text `validate` accepts) and a `system`, with an optional `palette` and `mode`, and draws the spec in a real browser at a phone width (375px) and a desktop width (1440px). The answer is JSON followed by one PNG for each view.
  - The JSON lists the layout faults measured in the page: `sideways-scroll`, `clipped-text`, `small-target` (a control under the 24px touch-target floor with another control beside it) and `cut-off`. Each names its element and gives the numbers.
  - `data` fills the spec's inputs for a populated screen, and `empty` lays values over it for a second drawing of the empty screen. With neither, each input is sampled from its type and the answer says how every input was filled. Callbacks are always stubs.
  - An unlawful spec is answered with its faults and not drawn. The tool writes nothing.
  - The tool needs a browser. Playwright is an optional dependency of the server, and its Chromium is downloaded once with `pnpm exec playwright install chromium` in the polymorph checkout. Without it, `render_screen` answers with that command and every other tool works as before.

  `polymorph init` writes one more line in the app's `AGENTS.md`, for every framework: it names `render_screen` and the command that downloads its browser.

- Updated dependencies [9f8c97f]
- Updated dependencies [96daa65]
- Updated dependencies [6119b46]
  - @polymorph/rules@1.0.12
  - @polymorph/registry@1.0.12
  - @polymorph/theme@1.0.12

## 1.0.10

### Patch Changes

- @polymorph/rules@1.0.10
- @polymorph/registry@1.0.10
- @polymorph/theme@1.0.10

## 1.0.9

### Patch Changes

- @polymorph/registry@1.0.9
- @polymorph/rules@1.0.9
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

## 1.0.4

### Patch Changes

- Updated dependencies [22f607b]
  - @polymorph/theme@1.0.1
  - @polymorph/rules@1.0.3
  - @polymorph/registry@1.0.4

## 1.0.3

### Patch Changes

- 1b900d8: Application CSS can no longer re-make the theme's decisions, and `polymorph check` runs the red rules with no lint config.

  **Breaking: four Stylelint rules for application CSS.** A stylesheet that passed before can fail here. `token-values-only` does not read custom properties, and the vocabulary's selector rules do not run on application CSS, so an application stylesheet could override the theme without one raw value the rules saw. These rules close that:

  - `polymorph/no-token-declarations`: a `--pm-*` custom property declared in application CSS. Reading a token stays lawful. Set a colour in your palette and every other value in your system ([docs/theming.md](../docs/theming.md)); a local need is a member's `tone` or `variant`, `<DensityScope>` or `<ToneScope>`, or a `patch`.
  - `polymorph/no-app-theme-selectors`: a selector on `data-system`, `data-palette`, `data-mode`, `data-density`, `data-tone` or `data-motion`. Every token already follows the pairing, the mode and the density; a value one theme needs goes in that theme's document.
  - `polymorph/no-app-member-selectors`: a selector on `data-member`, which restyles a member from outside. Use the member's props, a per-member exception in the system file (`overrides.exceptions`), or ask for a variant.
  - `polymorph/no-root-font-size`: a `font-size`, or a `font` shorthand with a size, on `:root` or `html`, which rescales every rem token and the 16px text-entry floor. Type size is the system's; a denser screen takes `<DensityScope value="compact">`.

  Each report names the theme document that owns the decision and the rung of the exception ladder that answers a local need. `@polymorph/rules/stylelint` exports them, with `no-motion-outside-vocabulary`, as `applicationRules`, to spread into the rules for your own stylesheets. **To upgrade**, run `polymorph update` (or `polymorph add`) so `polymorph.stylelint.js` applies them to your stylesheets and lifts them for the vendored directory, where the compiled theme declares every token under pairing selectors. A hand-written config adds `...applicationRules` to its application block. `@polymorph/rules/verify` applies them to application CSS, so the MCP server's `validate` reports them too, and it now holds a vocabulary stylesheet to `no-member-selectors` as this repository's Stylelint config does.

  **`polymorph check [dir]`** runs `verify` over every `.ts`, `.tsx`, `.vue`, `.svelte`, `.html` and `.css` file below a directory as application code, with no ESLint or Stylelint config, and prints each violation by file and rule with the rungs that answer it. It leaves out dot-directories, `node_modules`, `dist`, `build`, `coverage`, `out` and the vendored directory `polymorph.json` records, and reads a `.html` file only in a project that uses the Angular vocabulary. Each file's framework is inferred as the MCP server's `fix_file` infers it, and `--framework` sets it for every file. `--json` prints the report as data. It exits 1 on any violation. Run it from your app's root: `node ../polymorph/packages/cli/bin/polymorph.js check src`.

  The registry's law catalogue lists the four rules with their rungs, so the system card and `validate` name them.

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
  - @polymorph/registry@1.0.3

## 1.0.2

### Patch Changes

- 192c31c: `polymorph update` keeps what the application imports, follows a renamed system, and respects an application that installs its own themes.

  **A vendored member the application imports stays.** A member that came along with another one, and that the members in `polymorph.json` no longer bring, was deleted by `update` even when the application imported it by path. `update` now reads the application's source outside the vendored directory. A member whose source it imports, by a relative path or by an alias that names the vendored directory, is added to the manifest's `components` with a note, so it stays and keeps being updated. Any other vendored file the application imports, and each vendored file a kept one imports, is kept and reported, under `--force` too, until the import is removed.

  **A renamed system moves to its new name.** The registry publishes `theme.renamed`, which maps each system and palette the catalogue shipped under another name to the name it has now: `shadcn` is `plain`, `fluent` is `flint`, `ios` is `pebble` and `macos` is `desktop`. `update` moves an install recorded under an old name to the new one: the manifest names it, its document is written, and the old document is deleted where it is as installed and kept where you edited it. The note names the system your code should use now. `polymorph add theme:shadcn` suggests `theme:plain`.

  **`"appInstallsThemes": true` in `polymorph.json`** tells `add` and `update` that the application installs its themes from a module of its own. They then leave the entry as it is, where each of them used to add the `installThemes()` import and call back.

  **The lint fragments name a token without a vendored system.** An install whose theme sheet holds no pairing, because the application builds its theme at run time or vendors a palette alone, wrote `VALUES = {}`, and a report named only the token family. Its fragments now carry the registry's token values for `plain`, the system `polymorph init` defaults to, and their header says whose values they are.

- Updated dependencies [192c31c]
  - @polymorph/registry@1.0.2

## 1.0.1

### Patch Changes

- 700e130: The CLI names the split packages, writes a new app, and vendors members in every web framework.

  **Breaking.** An install that vendors source declares `@polymorph/engine`, `@polymorph/react` and `@polymorph/rules` in the consumer's `package.json` where it declared `@polymorph/core`. The ESLint and Stylelint fragments it writes import `@polymorph/rules/eslint` and `@polymorph/rules/stylelint`, and the theme module it writes imports `@polymorph/engine/runtime`. In a project that vendored members with an earlier `polymorph add`, install `@polymorph/engine`, `@polymorph/react` and `@polymorph/rules` in place of `@polymorph/core`, and change the imports in the generated lint fragments and theme module to match. `polymorph add` writes `@polymorph/rules` to `devDependencies` and counts a package already in either map as present, and a theme or palette install on its own declares `@polymorph/engine` and `@polymorph/rules`, which the files it generates import.

  **`polymorph add` keeps your file.** A file that is already at an install path and that the manifest has no record of (your own `Button.tsx` under a `--dir` you already use) is kept and reported as `kept yours`, unless it is already exactly what would be written. `--force` still overwrites.

  **`polymorph init <dir>`** creates a new app that installs the packages, run from a checkout: the packages as npm aliases and `@polymorph/rules` as a dev dependency, an `.npmrc` that names `NODE_AUTH_TOKEN`, a catalogue theme (`--system`, default `plain`) compiled by the engine's Vite plugin, the lint configs, an `.mcp.json` for the checkout's MCP server, the system card, an `AGENTS.md`, and a first screen emitted from its spec. It then runs `pnpm install --ignore-workspace` with a token from `NODE_AUTH_TOKEN` or `gh auth token` (`--no-install` skips it), says when it used the GitHub CLI's token, and when the install fails tells a refused token from packages not published at the app's ranges. `--framework` chooses the app's framework:

  - `react` (the default): a Vite React app, `src/App.tsx` and the welcome screen as `src/screens/Welcome.tsx`.
  - `vue`: `vue`, `@polymorph/vue` and `@polymorph/vue-ui`, `@vitejs/plugin-vue`, a `vue-tsc` typecheck, `App.vue` and `Welcome.vue`.
  - `svelte`: `svelte`, `@polymorph/svelte` and `@polymorph/svelte-ui`, `@sveltejs/vite-plugin-svelte`, a `svelte-check` typecheck, the ESLint fragment that reads `.svelte` files with `svelte-eslint-parser`, `App.svelte` and `Welcome.svelte`.
  - `solid`: `solid-js`, `@polymorph/solid` and `@polymorph/solid-ui`, `vite-plugin-solid`, a `tsc` typecheck with Solid's JSX types, the fragment with the Solid settings and fix, `App.tsx` and the welcome screen as Solid TSX.
  - `angular`: Angular 22 (`@angular/core`, `@angular/common`, `@angular/compiler` and `@angular/platform-browser` at `~22.2.2`), `@polymorph/angular` and `@polymorph/angular-ui`, `@analogjs/vite-plugin-angular` compiling ahead of time, TypeScript `~6.0.3`, which Angular's compiler requires, a `tsconfig.json` with `strictTemplates` and an `ngc -p tsconfig.json --noEmit` typecheck, the ESLint fragment that reads inline templates with `@angular-eslint`, an `app-root` container bootstrapped without zone.js, and the welcome screen as `src/screens/welcome.ts`.

  Each framework's app gets that framework's system card and agent notes, and `init` refuses, before writing anything, a welcome screen that names a member absent in the framework.

  **`polymorph add --framework vue|svelte|solid|angular`** vendors that vocabulary's members from the registry's shells: the component, the compound parts its index attaches, the fixture, the members they import and each recipe beside its member. An install adds the framework's ESLint parser as a dev dependency where it needs one. `polymorph.json` records the framework, and `diff`, `update` and a later `add` plan in it. An unknown `--framework` is refused with the list of frameworks. An install in a framework writes that framework's own version ranges, read from its packages' manifests, so a Solid install pins each Zag machine at the exact version the Solid vocabulary is built against. `update` drops a member the framework's map now marks absent, and says the map's reason.

  **`add` and `update` refuse a checkout of polymorph**, another clone or worktree included, and any directory inside one, where they would vendor the vocabulary into its own source and splice the consumer's lint config into the checkout's; `init` refuses the same directories. `add --dry-run` still prints the plan there.

- Updated dependencies [700e130]
  - @polymorph/registry@1.0.1

## 1.0.0

The first versioned release. Earlier history is in git.
