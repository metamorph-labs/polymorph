# @polymorph/elements-ui

## 1.0.16

### Patch Changes

- e774b49: **The Angular members lay out as the other renderers' do.** Every Angular member renders inside a
  host element (`<pm-card>`) that draws no box, and a recipe selector that reads a parent or a
  sibling matched the host instead of the member inside it. A `Grid` drew each cell one column wide
  whatever `columns` said, a `SettingsRow` after the first drew no rule above it, a
  `TableOfContents` column was half its width, and a nested list in `Markdown` lost its spacing.
  The Angular build now compiles each recipe with forms that also match through a host, and each
  host carries `data-pm-host`, the attribute those forms read. A new law holds every Angular member
  to the box it has with the hosts removed. An Angular screen that uses these members changes its
  layout to the one the specs describe.

  The elements' recipes gain one form of the same transform: siblings that one host holds together
  after a child step (`.item > * + *`) now match through it.
  - @polymorph/elements@1.0.16
  - @polymorph/solid@1.0.16
  - @polymorph/solid-ui@1.0.16

## 1.0.15

### Patch Changes

- 57db696: **An `Alert` with nothing to say draws nothing.** An Alert given no title and no content drew an
  empty tinted panel with its tone's glyph. It now renders nothing: no root, no panel and no glyph,
  in every web framework, as an element, in SwiftUI and in Compose. A screen can therefore draw an
  Alert always and bind its `title` to a message that is empty while there is none, as an
  `ErrorSummary` with no errors already renders nothing.

  - A title counts when it is not absent and not empty. An empty title with content draws the
    content alone, where before it drew an empty title line above it.
  - Content counts in React when `children` is a value React draws: not `undefined`, `null`, a
    boolean or `''`. In Vue, Svelte, Solid, Angular and the elements it counts when the default
    slot has content. In SwiftUI and Compose it counts when `children` is not `nil` or `null`.
  - `action`, `secondaryAction` and `onDismiss` are not content: an Alert with only those renders
    nothing too.
  - `children` is optional: `AlertProps.children` in every web framework, and `PMAlertProps.children`
    in the Swift and Kotlin contracts, which now default to `nil` and `null`. A title with no
    content draws the title alone, with no gap under it.
  - An Alert that draws nothing is not listed for an agent. Once its title or content arrives it is
    drawn with its role on its root from that first render, so it is announced as an Alert mounted
    in response to an event is, and it is listed.

  An Alert with content, and a title that is absent or not empty, draws as before.

- Updated dependencies [57db696]
  - @polymorph/solid-ui@1.0.15
  - @polymorph/elements@1.0.15
  - @polymorph/solid@1.0.15

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

- Updated dependencies [9b60a94]
  - @polymorph/solid@1.0.14
  - @polymorph/elements@1.0.14
  - @polymorph/solid-ui@1.0.14

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

- 56e7665: `@polymorph/elements` and `@polymorph/elements-ui` are new packages: the vocabulary as custom
  elements, for a page written in HTML with no build, a server-rendered template, or a page htmx or
  Turbo swaps. Each member is an element, `poly-` and its kebab name (`<poly-button>`,
  `<poly-tabs-content>`), that renders the generated Solid member into itself in the light DOM. The
  elements are a distribution of the Solid rendering, with its recipes and its behaviour, and add no
  decision of their own. They are published as `@metamorph-labs/polymorph-elements` and
  `@metamorph-labs/polymorph-elements-ui`, and `design/frameworks/elements.json` says which members
  they ship.

  A prop is an attribute in kebab case and a property in camel case: a boolean is present or
  `"false"`, data is a JSON attribute, a date or a time is ISO 8601 text, and a function, a render
  prop or a ref is a property set from script. A node prop is a child with `slot="name"`, and
  `<template slot="name">` gives text or several nodes. A child added to the element after it
  renders joins its slot, and `element.removeChild(child)` takes one out of its slot, wherever the
  member drew it; replacing every child renders the member again. A callback is the event `poly-<name>`
  (`poly-change`, `poly-open-change`), whose `detail` is its first argument; it bubbles, and a
  listener can hand the member a promise with `event.waitUntil`. A controlled prop follows the
  reader: after its change event the element sets its own property, unless a listener calls
  `preventDefault()`. A member that asks whether its event is heard learns it from a listener added
  to its element, or from `listens="name"`.

  An element draws no box: while it renders its member it carries the custom state `poly-host`, and
  `:state(poly-host)` is `display: contents`. A table's section, row and cell and a list's item are replaced in the
  document by the element they render. The elements need Chrome 125, Safari 17.4 or Firefox 126.
  Rendering is client-only, and the elements are not form-associated: each member's own input posts.
  `restore()` puts back the markup a page wrote before a page snapshot (`turbo:before-cache`,
  `htmx:beforeHistorySave`).

  A page with no build links `polymorph.css` and a theme sheet, runs `prepaint.js` first in
  `<head>`, and loads `polymorph.js` as a module script: it defines every tag at once and loads each
  member's code, a chunk of its own, the first time one of its elements renders, so a page with one
  Button loads Button and what it composes. `polymorph-all.js` loads every element in one file. Both
  export `restore`, `toast` and `loadAgentBridge` for the page's own module script, and read
  `<html data-agent>` as they load: without it nothing more is fetched; `on-call` registers the agent
  bridge's tools with the browser's WebMCP API and fetches the bridge on the first call, and
  `eager` fetches it at load (`docs/agents.md`). `polymorph.css` holds the base
  layer, every recipe with the forms that reach through an element, Icon's stylesheet, the host rule,
  and rules for an element that has not rendered: a closed overlay's content stays hidden, and a
  table's and a list's parts lay out as the elements they render. The files are in
  `@polymorph/elements-ui/dist/cdn/`, with a theme sheet per house pairing (`themes/<system>.css`).
  No public URL serves them, so `polymorph init --framework elements` copies them into the app's
  static directory with a theme sheet and an example page (`docs/consuming.md`). The files report an
  attribute an element cannot read, and each member's own warnings, in the console on every page,
  because nothing lints a page written in HTML.

  An app with a build imports one element's module (`@polymorph/elements-ui/controls/Button`) or
  every element (`@polymorph/elements-ui`). Each element's module brings its Solid member compiled
  with its recipe, and the base layer, Icon's stylesheet and the host rules through
  `@polymorph/elements`; Solid, Zag and the Solid foundation are dependencies, one copy each.

  A prop named as a method every element inherits has no property, so the method keeps working on
  the element, and its attribute sets it: Diff's `before` and `after` are attributes, and
  `diff.before(node)` is `ChildNode.before()`. A controlled prop the page never set leaves the member
  uncontrolled. `defineLazy` defines a tag before its member's code is loaded, and
  `@polymorph/elements/loader` holds what a page that defines every tag at once loads first.
  `@polymorph/elements/temporal` holds the codecs that read a date or a time, which the module of
  each member with one gives `define`, so the date library loads only with such a member. On a page
  that loads a member's code when one of its elements first renders, the property of a date or a
  time set before that code has loaded reads `undefined` until it has.

- 73837b5: `MasterDetailPage` is a new page archetype: a list of items of one kind beside the detail of the
  selected one, for an inbox, a notifications page, an audit log or a file browser. It takes
  `title`, `description` and `actions` as PageHeader does, the `list` (a List, Table or Tree with its
  FilterBar and pagination, the selected item marked `current`) named by `listLabel`, the selected
  item's `detail`, an `emptyState` for the detail pane while nothing is selected, and `backLabel`
  and `onBack` for the way back on a phone. It fills AppShell's content region, as ConversationPage
  does, and the list and the detail scroll on their own. At or above a 48rem page the two sit side
  by side in a SplitPane; below it the page draws the list, or the detail under the way back, and
  `onBack` is where the application clears its selection. Focus moves only when the element that
  held it is no longer drawn. A page that draws the selected item under a table can move to it.

  The engine and every foundation export `masterDetailFocus`, `masterDetailHolds` and
  `MASTER_DETAIL_PART`, the focus rule every renderer's MasterDetailPage shares. The SwiftUI and
  Compose contracts gain `PMMasterDetailPageProps` and its rendering protocol, and both platforms
  draw the page: two panes from a 48rem page, and below it the list, or the detail under the way
  back. On iOS the way back is the page's own button and no system gesture. The elements vocabulary
  has it as `<poly-master-detail-page>`.

- 2da1598: `SearchPage` is a new page archetype in every web vocabulary: the page whose subject is a query,
  with the field, the filters under it, and what the query found. It takes `title`,
  `description` and `actions` as PageHeader does, the `search` slot for the field, `searchLabel`
  to name its search landmark, `filters`, `empty` with the required `emptyState`, `pending`, and
  the results as `children`. A page that searches as the reader types passes no `onSubmit`. A page
  that submits passes `onSubmit`, and the landmark is then a real form: Enter in the field calls
  it once and the browser does not navigate.

  The results flow down the page with no panel, one group under each Heading. While `pending` the
  results region is `aria-busy` and keeps the last results; while `empty` it holds the EmptyState
  drawn from `emptyState`. The swap moves no focus and plays no motion. The page's measure is nine
  of `--pm-space-10`, between FormPage's and ListPage's.

  `one-opener` knows SearchPage, so a module that renders one and also composes a PageHeader and a
  Hero is told to keep the archetype's title.

  The elements vocabulary has it as `<poly-search-page>`.

  On iOS and Android `SearchPage` is native, drawn in SwiftUI and Compose: the header, the field
  with its filters under it, and the results, with `loadStatus` and `onRetry` as every native page
  takes them.

- Updated dependencies [d84171d]
- Updated dependencies [508275a]
- Updated dependencies [5334be0]
- Updated dependencies [56e7665]
- Updated dependencies [189ef43]
- Updated dependencies [73837b5]
- Updated dependencies [a4dc653]
- Updated dependencies [2da1598]
- Updated dependencies [56e7665]
- Updated dependencies [cbfeef1]
  - @polymorph/solid@1.0.13
  - @polymorph/solid-ui@1.0.13
  - @polymorph/elements@1.0.13
