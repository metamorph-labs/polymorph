# @polymorph/registry

## 1.0.17

### Patch Changes

- a749193: **The registry lists the data types the members' props take, and builds what the run-time core
  reads.** The system card does not change.

  - `registry.json` has `dataTypes`: every named data type a member's props take (an option, a
    column, a stat, a menu entry), its parts' and the exception primitives' included, read through
    the TypeScript checker and sorted by name. Each has its type parameters and its fields, typed as
    a prop's type is printed, or the named types it is a union of. `Registry` gains `dataTypes` as a
    required field, so a `Registry` a test builds by hand needs it.
  - `pnpm registry` also writes `packages/screen/src/vocabulary.gen.ts`, the vocabulary table
    `@polymorph/screen` checks and draws a screen with. It is gitignored, as `registry/` is.
  - `@polymorph/registry/screen-table` (the table's compact form, and its expansion) and
    `@polymorph/registry/runtime-card` (the members section of the run-time card a host puts in a
    model's prompt) are new subpaths. Neither imports the registry's builder or a Node built-in.
  - `controlledProps(props)` in `@polymorph/registry/frameworks` reads a member's controlled props
    (`value` with `onChange`, `open` with `onOpenChange`). The elements' generator and the run-time
    walk read them by this one rule.

- Updated dependencies [b33e18c]
  - @polymorph/rules@1.0.17
  - @polymorph/theme@1.0.17

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

- Updated dependencies [2f0ddd2]
- Updated dependencies [3ce48d6]
  - @polymorph/theme@1.0.16
  - @polymorph/rules@1.0.16

## 1.0.15

### Patch Changes

- @polymorph/rules@1.0.15
- @polymorph/theme@1.0.15

## 1.0.14

### Patch Changes

- 9b60a94: **`ScatterChart` reports nothing where it draws no point.** A row whose x, y or bubble value is
  `null` draws no point for that series. The arrow keys still reach that position, and the live
  region still says it, but Enter, Space and a click there no longer call `onSelect`. Before, they
  called it with `{ index, key, datum }` for a point the plot did not draw. An agent does not list
  such a position among the chart's `items`, and its `choose` refuses one. The engine's
  `scatterChartSelection` returns `null` there, as `heatmapSelection` does at an absent cell.

  **`BarChart` reports nothing at a walked bar that is not drawn.** With the reading walked to one
  series (Up and Down) at a band where that series' value is `null`, Enter, Space or a click called
  `onSelect` for a bar the plot does not draw. `barChartSelection` returns `null` there. A whole-band
  reading reports the band as before.

  **An agent action names the list it chooses among.** The agent fence's grammar has an optional
  clause, `action <name> <id|ids> among <state> …`, which names the `choices` state whose choices
  the argument names. A handle's action may carry it (`{ argument: 'id', among: 'series', run }`),
  and so may a description's `agent` block, which every renderer hands to `agentMember` as written.
  With `among`, the bridge checks the value, and whether a choice is marked destructive, against
  that state's choices only, and refuses an id of another list with `invalid-value`. The snapshot
  lists it beside the argument (`{ name: 'toggle', argument: 'id', among: 'series' }`). Without it
  nothing changes, and no existing fence, handle or description changes meaning.

  - `pnpm registry` fails on `among` on an action that takes no id, on `among` naming a state that
    is not one of the fence's `choices` states, and on an `id` or `ids` action with no `among` in a
    fence that declares more than one `choices` state.
  - The staleness law holds the React member's and the description's `among` to the fence's.
  - The agent conformance law draws an action's probe from the state it chooses among, checks that
    the snapshot lists the same `among`, and checks that an id of another `choices` state is
    refused and changes nothing.

  **An agent hides and shows a chart's series with its legend.** `AreaChart`, `BarChart`,
  `LineChart`, `RadarChart` and `ScatterChart` draw a legend whose keys hide and show a series. An
  agent now reads them as two states and runs one action, in every web framework:

  - `series` lists the legend's keys in the legend's order, each `{ id, label }`: the id is the
    series' `key`, and the label is what its key says. `hidden` lists the ids of the series now
    hidden. A chart with one series draws no legend, so both are empty there.
  - `toggle` takes the id of one of `series` (`among series`) and presses its key with the key's own
    click, as a person does, so the chart refits its domains as it does for a person.
  - `choose` takes the id of one of `items` (`among items`), so a series' id is refused there, and
    a mark's id is refused by `toggle`.
  - Such a chart is listed for an agent while a person has something to operate in it: `onSelect`,
    or a legend. A chart with a legend and no `onSelect` is listed now, with `items` empty and
    `choose` refused, where before it registered nothing. `DonutChart` and `Treemap` draw a legend
    that only labels, so nothing changes for them.

  The engine exports `chartSeries`, `chartHiddenSeries` and `toggleChartSeries`, which read a
  chart's legend keys from its element and press one, for every renderer, and the types
  `ChartSeriesChoice` and `ChartLegendSeries`; each web framework's foundation re-exports them.

  **An agent brushes a range on a `LineChart` or an `AreaChart`.** A chart with `onBrushEnd` on an
  x it brushes (`time` or `linear` for `LineChart`, `time` for `AreaChart`) has a brush, and an agent
  now reads and uses it through the machine a person's keys drive:

  - `range-start` and `range-end` are the range a person sees drawn, in rows, the unit `position`
    uses: the row the range was begun on and the row it ends on, or `null` while there is none.
  - `brush` takes the row the range ends on, presses Shift and the arrow toward it once per row,
    as a person does, and commits with Enter, so `onBrushEnd` receives what a person's committed
    range reports. The range starts where a person's would: at the start of a range a person has
    begun, else at the reading position, which `read` sets, else at an end of the chart.
  - A chart without a brush lists both states as `null`, and `brush` throws, saying why. A number
    that is not a row, and a range of one row, are refused too.
  - A chart with a brush is listed for an agent with no `onSelect` and no legend.

  The engine exports `chartRange` and `brushChartRange`, and the types `ChartRange` and
  `ChartRangeSource`; each web framework's foundation re-exports them. `LineChart` and `AreaChart`
  have a states fixture entry `brushable`.
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

- Updated dependencies [73837b5]
- Updated dependencies [56e7665]
- Updated dependencies [2da1598]
  - @polymorph/rules@1.0.13
  - @polymorph/theme@1.0.13

## 1.0.12

### Patch Changes

- Updated dependencies [9f8c97f]
- Updated dependencies [96daa65]
- Updated dependencies [6119b46]
  - @polymorph/rules@1.0.12
  - @polymorph/theme@1.0.12

## 1.0.10

### Patch Changes

- @polymorph/rules@1.0.10
- @polymorph/theme@1.0.10

## 1.0.9

### Patch Changes

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

## 1.0.4

### Patch Changes

- Updated dependencies [22f607b]
  - @polymorph/theme@1.0.1
  - @polymorph/rules@1.0.3

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

- 1b900d8: A toast tells its owner when it leaves, its tone sets how long it stays, a success notice leaves on its own, and the registry publishes Toast as each framework ships it.

  **`onDismiss` on a toast.** `toast()` takes `onDismiss`, called once when the toast leaves for a reason other than its owner's: the reader dismissed it, its time ran out, `toast.dismiss` closed it, or newer toasts evicted it. Removing a toast and updating it in place do not call it. Every framework's `toast()` takes it, because every foundation's store is the engine's. A declared Toast in Vue, Svelte, Solid and Angular emits `dismiss` (`@dismiss`, `onDismiss`, `(dismiss)`), and `PMToast` on iOS and Android calls `onDismiss` when its card leaves by its close button, a swipe, the escape gesture or its time.

  **A toast takes its lifetime from its tone.** The store every web framework shares gives a toast whose call sets neither `retained` nor `durationMs` its tone's lifetime. A `danger` or `warning` toast is retained and pinned: it stays until it is dismissed or removed, and newer toasts do not evict it. A `success`, `info` or `neutral` toast leaves after `TOAST_DEFAULT_DURATION_MS` and may be evicted, as every toast did before. So `toast.danger(…)`, `toast.warning(…)` and `toast.promise`'s error face now stay until the reader dismisses them; a call that wants the old five seconds passes `durationMs: TOAST_DEFAULT_DURATION_MS`. A call that sets either option keeps what it sets. `ToastNotice` and a declared `Toast` in Vue, Svelte, Solid and Angular follow the same rule, so a `danger` or `warning` notice stays until it is resolved or dismissed, as every notice did before, and a `success`, `info` or `neutral` notice now leaves on its own. A screen that kept a success notice on screen with a button whose only job was to dismiss it can delete the button. `ToastNotice` also takes `onDismiss`, so a screen can clear the state that renders a notice once the notice has left; unmounting a notice does not call it. A notice that must stay whatever its tone takes `dismissible={false}`. `PMToast` on iOS and Android takes the same lifetime from its tone when its props set neither `retained` nor `durationMs`: a native danger or warning toast now stays until it is dismissed, and one that should leave passes `durationMs: 5000`.

  **A notice with nowhere to show warns in development.** A `ToastNotice` rendered while no `ToastHost` or `Toaster` is mounted logs a warning naming it, because nothing draws its toast. A declared `Toast` in Vue, Svelte, Solid and Angular logs the same warning when no `Toast.Viewport` is in the document once it has mounted. The usual cause is an error boundary whose fallback renders outside the viewport: mount `ToastHost`, or `Toast.Viewport`, outside the boundary.

  **The registry and the system card publish Toast's real API and every compound part.** Each component carries `parts`, every compound part its export carries with the part's props (`AppShell.NavItem`, `AppShell.NavGroup`, `AppShell.UserCard`, `Dashboard.Panel`, `Avatar.Group`, `Table.Head`, `Table.Body` and `Table.Foot` among them, which the card left out), and `exports`, the member's other callable exports (Toast's `toast`, `ToastHost`, `ToastNotice` and `ToastViewportTarget`; Tooltip's `TooltipProvider`; FormField's `ToastFormField`). The React card lists Toast as `toast()` with its options and shorthands beside the components a screen mounts, rather than as a `<Toast>` with props; another framework's card lists the parts its shell ships, `Toast.Viewport` included. Toast's purpose reads "Notifications that report the outcome of an action" in place of "The toast viewport". A card rendered for `ios` or `android` lists a member's props and the parts its native contract carries, and none of React's exports: SwiftUI's and Compose's Toast is a member whose props are the options.

  **The spec-staleness law reads every compound part.** `@polymorph/rules/spec-api` compares each part a member's export carries with its spec, reading the parts with `compoundParts`, the function the registry's `parts` come from, in place of the hand list `COMPOUND_PARTS`, which is removed. A part's props table goes in `## API` under a `Component` column, or under a heading with the part's name (`## AppShell.NavItem`).

- Updated dependencies [1b900d8]
- Updated dependencies [1b900d8]
  - @polymorph/rules@1.0.2

## 1.0.2

### Patch Changes

- 192c31c: `polymorph update` keeps what the application imports, follows a renamed system, and respects an application that installs its own themes.

  **A vendored member the application imports stays.** A member that came along with another one, and that the members in `polymorph.json` no longer bring, was deleted by `update` even when the application imported it by path. `update` now reads the application's source outside the vendored directory. A member whose source it imports, by a relative path or by an alias that names the vendored directory, is added to the manifest's `components` with a note, so it stays and keeps being updated. Any other vendored file the application imports, and each vendored file a kept one imports, is kept and reported, under `--force` too, until the import is removed.

  **A renamed system moves to its new name.** The registry publishes `theme.renamed`, which maps each system and palette the catalogue shipped under another name to the name it has now: `shadcn` is `plain`, `fluent` is `flint`, `ios` is `pebble` and `macos` is `desktop`. `update` moves an install recorded under an old name to the new one: the manifest names it, its document is written, and the old document is deleted where it is as installed and kept where you edited it. The note names the system your code should use now. `polymorph add theme:shadcn` suggests `theme:plain`.

  **`"appInstallsThemes": true` in `polymorph.json`** tells `add` and `update` that the application installs its themes from a module of its own. They then leave the entry as it is, where each of them used to add the `installThemes()` import and call back.

  **The lint fragments name a token without a vendored system.** An install whose theme sheet holds no pairing, because the application builds its theme at run time or vendors a palette alone, wrote `VALUES = {}`, and a report named only the token family. Its fragments now carry the registry's token values for `plain`, the system `polymorph init` defaults to, and their header says whose values they are.

## 1.0.1

### Patch Changes

- 700e130: The registry describes every framework and platform the vocabulary renders in, and names the split packages.

  **Breaking.** A component's `origin` is `installed` or `vendored`: `installed` replaces `core` in `registry.json` and in its JSON Schema. Replace `'core'` with `'installed'` wherever you read or filter on `origin`. `version` is read from `@polymorph/react`, the package every vendored React member imports, and the package ranges name `@polymorph/engine`, `@polymorph/react`, `@polymorph/react-ui` and `@polymorph/rules` where they named `@polymorph/core`, `@polymorph/ui` and `@polymorph/lint`.

  **Platforms.** Every member and ladder primitive has a `platforms` entry for `web`, `ios` and `android`, read from `design/platforms/*.json`: `native`, `adapted` (with `as`, how it renders) or `absent` (with a `reason` and a `substitute`). The build refuses a map that fails the platform law. `renderSystemCard(registry, { platform })` renders the vocabulary as it exists on one platform: absent members left out, adapted ones saying how they render.

  **Frameworks.** `frameworks` is `react`, `vue`, `svelte`, `solid` and `angular`, and every member and primitive has a `frameworks` entry for each, read from `design/frameworks/*.json` (React has no file: every member is native there). A member native in a generated framework publishes `frameworks.<name>.shell`, what an install of it copies there, `vendor.frameworks` names each framework's tree, and `vendor.frameworks.<framework>.packages` ranges that framework's foundation, its vocabulary and the packages its members import, read from that framework's own manifests. `packages` ranges React's packages, the engine, the rules and the fonts. `renderSystemCard(registry, { framework })` writes the card for that framework: its install paragraph, how a prop reads there, and only the members it ships. Exports: `FRAMEWORKS`, `MAPPED_FRAMEWORKS`, `FRAMEWORK_NAMES`, `FRAMEWORK_EXTENSIONS`, `FRAMEWORK_VOCABULARY`, `FRAMEWORK_FOUNDATION` and `frameworkOfPath`, and `@polymorph/registry/frameworks` for a browser.

  **More.** Each member carries its parsed behaviour contract (`behaviour`), and `@polymorph/registry/behaviour` exports the grammar. `vendor.recipes` says where an install copies a member's recipe. The system card has a section on frameworks and platforms: which web frameworks render the vocabulary, which native toolkits, and how an agent picks one. The registry exports `PUBLISHED_NAMES` and `PUBLISHED_REGISTRY`, the registry names `scripts/publish-packages.mjs` and `polymorph init` both read.

- Updated dependencies [700e130]
  - @polymorph/rules@1.0.1

## 1.0.0

The first versioned release. Earlier history is in git.
