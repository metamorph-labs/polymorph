# @polymorph/angular-ui

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
  - @polymorph/angular@1.0.15
  - @polymorph/engine@1.0.15

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
  - @polymorph/engine@1.0.14
  - @polymorph/angular@1.0.14

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

- 508275a: No chart draws an x-axis label past its own box. A label is centred on its tick, and the labels
  on a tick at either end of the plot were drawn half outside the chart: the last value label of a
  horizontal or diverging `BarChart`, the last x label of `LineChart`, `AreaChart`, `ScatterChart`
  and `Histogram`, and in a right-to-left document the first. A band label wider than the room
  beside its band did the same on `BarChart` and `Heatmap`. Such a label is now anchored at its end
  of the plot: its start sits on a tick at the plot's start and its end on a tick at the plot's
  end. Ticks, gridlines and marks do not move. The label beside an anchored one gives way when the
  two would come nearer than the gap that keeps two labels from reading as one. On an axis that
  drops whole labels to keep them apart (a band axis, `Histogram`'s edges) its tick is dropped with
  it. On a value or a time axis the tick and its gridline stay, and the tick draws no label.

  The engine's `AxisTick` has an optional `align` (`'start' | 'end'`), which the chart frame of
  every web framework renders as `data-align` on the tick, and the chart axis recipe anchors the
  label from it.

  Band labels thinned to fit no longer put the last label one band after the label before it, where
  the two touched or overlapped. The last label takes the place of the one before it instead.

- 5334be0: `DetailPage` takes `stickyAside`, which keeps the aside in view while the main column scrolls. A
  TableOfContents beside a long page goes in the aside with it. From a `44rem` page, where the aside
  is beside the main column, it stays the page's top inset below the top of the box that scrolls,
  is never taller than that box, and scrolls inside itself when it is longer. Below `44rem` the
  aside is under the main column and scrolls with the page, as before. A DetailPage without the prop
  is unchanged.

  AppShell's content region declares `container-type: size` in place of `inline-size`, so a page
  reads its visible height as `100cqb`. Its height comes from the frame's grid, so nothing it draws
  moves.
  SwiftUI and Compose take `stickyAside` and draw nothing for it: their aside scrolls with the page.

- 189ef43: `Heading` takes `id`, the heading element's id. A link to `#id` and a `TableOfContents` item with
  that `id` go to the heading, so an app names a section without an element of its own around it:
  `<Heading id="install">Install</Heading>` in place of `<div id="install"><Heading>Install</Heading>…</div>`.
  A TableOfContents moves focus to the heading, which a screen reader announces by its name and
  level. A Heading takes no `scroll-margin`, because nothing the vocabulary draws covers the top of
  the page's box. SwiftUI and Compose take the prop and draw nothing for it. A Heading without `id`
  is unchanged.
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

- a4dc653: `PageHeader`, `DetailPage` and `Dashboard` take `titleEdit`, an `InlineEdit` the app writes, so a
  reader renames the page's subject in its title instead of in a Dialog. The page draws it beside
  the `<h1>` and hands it `valueHidden`. The app gives it the page's `title` as its `value`,
  `size="lg"`, its `label` and handlers and, for a save that waits for a server, `editing`,
  `pending` and `error`:

  ```tsx
  <DetailPage
    title={application.name}
    titleEdit={
      <InlineEdit
        label="Application name"
        value={application.name}
        size="lg"
        editing={renaming}
        onEditingChange={setRenaming}
        pending={saving}
        error={renameError}
        onCommit={rename}
      />
    }
    …
  />
  ```

  The page keeps one `<h1>` named by the saved title: beside the edit control while reading, and
  visually hidden while the field is open in its place. The header keeps its height and the actions
  their place when the field opens. A Vue, Svelte, Solid or Angular page takes the InlineEdit in its
  `titleEdit` slot. `InlineEdit` takes `valueHidden`: another element draws the value, and the value
  element stays hidden so it still describes the edit control. SwiftUI and Compose take `titleEdit`
  and draw nothing for it, because InlineEdit has no SwiftUI or Compose rendering. A page without
  `titleEdit` and an InlineEdit without `valueHidden` are unchanged.

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
- Updated dependencies [73837b5]
- Updated dependencies [709d7b3]
  - @polymorph/engine@1.0.13
  - @polymorph/angular@1.0.13

## 1.0.12

### Patch Changes

- 358158d: `AppShell` takes `navigation`, `'rail'` by default or `'top'`. With `'top'` the frame draws the
  navigation it already has, `sidebar` with its NavItems and NavGroups, as a row along its top at
  frame widths: the brand, then the items, and the topbar continues the row with its `leading` and
  `trailing` slots on the same surface. The content region takes the whole width. Below the drawer
  breakpoint the row is the same drawer the rail becomes. The root carries `data-navigation="top"`.

  The same parts go in `sidebar` in either layout. Put them in `sidebar` directly: the shell lays
  out its own parts in the row, and a Stack around them keeps its column. A NavGroup's items join
  the row, its overline is removed, and a rule divides it from the group before it. It keeps
  `role="group"` and its name. A row wider than the frame wraps onto a further line, so every
  destination stays on screen.

  A row has no rail to narrow, so `collapsed` is not drawn there: there is no collapse toggle, no
  `data-collapsed` and no tooltip. The value is kept for a return to the rail. `sidebarFooter`
  follows the last item in the row and is the drawer's foot. An account belongs in
  `topbar.trailing`, as a Menu behind an AvatarButton.

  There is still one navigation landmark, the same `<nav>` named by `messages.primaryNavigation`,
  before the topbar in the document. SwiftUI and Compose take the prop and draw their own frame
  whatever it says. A frame without `navigation` is unchanged.

- 69c3d82: `AudioPlayer` is a new member in every web vocabulary: it plays one recording, such as a voice
  message in a conversation or a recorded call in a ticket. It takes `src`, the recording's URL,
  and `label`, which names the player as a group ("Voice message from Ada"). It is a play Button,
  a Slider that moves through the recording, and the elapsed and total time, over a native
  `<audio>` element without `controls`. It replaces `<audio controls>`, which the browser draws
  and no theme reaches.

  `duration` is the length in seconds, shown before the file gives its own. A file's finite length
  replaces it, and a file that gives none, as a recording `MediaRecorder` wrote, keeps it.
  `locale` writes the clock's numerals and the spoken lengths through `Intl`. `messages` holds the
  five strings the player says (`play`, `pause`, `scrubber`, `position`, `failed`), with English
  defaults. `onPlay` reports that the recording started, and `onEnded` that it played to its end.

  The Button's name says what a press does: "Play", then "Pause". The scrubber's spoken value is
  the elapsed and total length in words, "5 seconds of 18 seconds", and it moves in whole seconds.
  The time is hidden from assistive technology and is not a live region. When one player starts,
  every other AudioPlayer on the page pauses. A file that cannot be loaded replaces the scrubber
  with the words `messages.failed`, and a press on the Button asks for the file again. An empty
  `src` is that state from the first render.

  It has no volume, playback speed, download, waveform or transcript.

  The SwiftUI and Compose renderings are not written yet. `AudioPlayer` is in both platforms'
  pending lists, and both contracts are generated, with `AudioPlayerMessages` given its shape.

- bda0b87: `Banner` is a new member in every web vocabulary: the notice that belongs to the application
  frame and stays until its cause ends, such as an outage, a trial that is running out, a member of
  staff acting inside a customer's account, or a page showing a stale snapshot. It is not Alert,
  which is a callout inside one page's content, and it is not Toast, which reports an event and
  leaves.

  `Banner` takes `tone` (`neutral`, `info`, `warning` or `danger`; `neutral` is the default and
  states a fact about the session), the message as its children, `action` (one small Button or one
  Link, the way out of the condition), and `onDismiss` with `dismissLabel` for a reminder the
  reader may hide. Only `danger` has `role="alert"`. The other tones have `role="status"`, because a
  warning Banner is on screen for days and should not interrupt on every load. On a narrow frame
  the action moves under the message, and the tone icon and the dismiss button stay beside its
  first line.

  `AppShell` takes a new optional `banner` slot for it. The banner has a row of its own across the
  whole frame, above the rail and the topbar, so the rail and the content region shorten by its
  height and nothing scrolls under it. An AppShell without a banner is unchanged.

  The SwiftUI and Compose renderings of `Banner` are not written yet. `Banner` is in both
  platforms' pending lists, and both contracts are generated. The SwiftUI and Compose `AppShell`
  draw the `banner` slot: the view the app passes is a row of its own across the frame, above the
  navigation and the content, inside the top safe area. Until `Banner` has a native rendering, a
  native app composes its notice from the members that have one.

- 28aeda0: `BarChart` takes `lines`: series drawn as lines over the bars, on the bars' value axis and in
  their unit, such as a moving average of the bars' own measure that the app computes. Each line
  is LineChart's 2px stroke through the categories' centres, with a ringed point at every value,
  drawn over the bars and the annotation ink. A `null` breaks the line.

  The lines take the slots after the bars' and count toward the eight. They join the legend with a
  line key, the tooltip, the live region, the Up/Down walk after the bar series, `onSelect`, the
  table twin and the summary, all in the chart's `y.format`. `mode` stacks the bars only, and a
  line reads against the stack's total. A horizontal chart draws no lines and warns.

  A chart has one value axis. A second measure in another unit, such as a rate beside counts, is a
  second chart over the same rows (`docs/charts.md`). A constant target is still `baseline`.

  A chart without `lines` draws exactly what it drew before. The engine exports `barLinePoints`,
  the line's points over the band axis, and the `BarLine` and `BarLinePoint` types. The SwiftUI
  `PMBarChart` draws the lines with Swift Charts. Android has no chart rendering, as before.

- aec76ec: `Button` takes `expanded` and `aria-controls`, for a button that shows and hides a region.
  `expanded` sets `aria-expanded`, and `aria-controls` names the region while it is shown. The
  button draws no state of its own for it: the caller passes the icon that shows the state. It is
  not `pressed`, which says the button itself is on. The SwiftUI and Compose members take
  `expanded` too and announce the button as expanded or collapsed.

  A button without `expanded` is unchanged and renders neither attribute.

- 9153bdd: `Code` breaks a string with no break in it. A URI or a key set in a `Code` chip used to widen
  the column that held it, and on a phone the page. The chip now wraps where it would overflow. A
  chip that fits is unchanged.
- 96a3846: `CommentThread` is a new member in every web vocabulary: the comments people leave on a record,
  such as a ticket, an artifact or a document, with their replies. `CommentThread` takes `label`,
  the list's name, and `messages`, the words it writes itself (`edited`, `replies`).
  `CommentThread.Comment` takes `author`, `avatar` (an Avatar), `time` (a RelativeTime or the
  app's text), `edited`, `meta` (Badges such as "Internal note" or "Resolved"), `actions` (the
  app's Buttons or a Menu) and `replies` (more comments). Its children are the body: Text,
  Markdown or the app's own nodes with mentions, and a row of AttachmentChips.

  The thread is an `<ol>` named by its label, and each comment is a list item holding an
  `<article>` named by its author and its time. A comment's replies are a second list inside its
  item, drawn indented under it. A comment nested deeper is drawn at the second level, so a long
  exchange never narrows the column, and its markup still nests. Nothing in the thread is a live
  region: a comment that arrives is the app's to announce. The composer is the app's: a Textarea
  with a Button, or a PromptInput, after the thread.

  It replaces comments built from Text, Badge and Buttons in a Stack, a Card or a DataTable row. It
  is not ChatThread, which is a conversation with a model that scrolls inside itself and follows
  the newest turn.

  The SwiftUI and Compose renderings are not written yet. `CommentThread` is in both platforms'
  pending lists, and both contracts are generated.

- b209e98: `Countdown` is a new member in every web vocabulary: the time left until a moment, ticking each
  second, for a code that expires, a session that ends, or a retry or a resend that unlocks. It
  writes `4:59`, then `1:02:05` from an hour, in tabular figures and the locale's numerals, until
  `0:00`, and calls `onEnd` once when the moment is reached, or once after mount when the moment
  has already passed. It is not RelativeTime, which writes a moment as words and never refreshes.

  `Countdown` takes `until` (an ISO-8601 instant, not a number of seconds), `label` (what it counts
  to, the timer's accessible name), `onEnd`, `announce`, `locale` and `messages`. The timer is
  `role="timer"` and says the time in words, so a screen reader does not hear every second. With
  `announce`, a polite line says the time left at one minute and at ten seconds. The member holds
  no button: the control that waits for the end is the application's, enabled from `onEnd`.

  Every Countdown on a page shares one clock with one timer, which wakes on the second of each
  countdown's time left, waits only for an end while the document is hidden, and reads the time
  again when the document is shown. The engine exports what the members use: `countdownMoment`,
  `countdownLeft`, `countdownClock`, `countdownSpoken` and `followCountdown`.

  The SwiftUI and Compose renderings of `Countdown` are not written yet. `Countdown` is in both
  platforms' pending lists, and both contracts are generated.

- e584e0a: `CursorPagination` takes `disabled`, the app's hold on the pager while it does something else to
  the list, such as a bulk action or a save. Every control is disabled and none shows busy, the
  root carries `data-disabled`, and the pager is still drawn, so the page does not move when the
  hold ends. It is not `pending`, which says the pager's own request is in flight: with both set,
  the pressed direction stays busy and keeps its focus. The append form's "Load more" is held the
  same way. The SwiftUI and Compose members take the prop too.

  A hold keeps the reader's place. A browser takes focus from a button as it is disabled: the page
  has it, and no control does. So when a hold disables the button that has focus, the pager moves
  focus to its root, the `<nav>`. The root carries `tabindex="-1"`, which makes it no tab stop, and
  draws the shared focus ring. The next Tab goes on to what follows the pager. A hold that begins
  while focus is elsewhere moves nothing. A direction that is busy is not disabled, so it keeps focus
  until its window arrives.

  When the hold ends and focus is still on the root, focus returns to the control it was taken
  from: previous, next, or the append form's action. A control that is still disabled, or is no
  longer drawn, takes no focus, and focus stays on the root. If the reader moved focus during the
  hold, nothing moves.

  A pager without `disabled` is unchanged, but for the `tabindex="-1"` on its root.

- aec76ec: `DataTable` takes `rowDetail`, which lets a row show more under itself. Passing it adds an
  expansion column after the selection column. Each row gets a disclosure button, and an open
  row draws what `rowDetail` returns for it in a full-width row below. Any number of rows can be
  open. The table holds the open rows itself, starting with the rows `defaultExpanded` names, or
  the app holds them with `expanded`, a set of row ids. `onExpandedChange` is called with the next
  set in both cases.

  `rowDetail` is called with one object, `{ row, close }`. `row` is the caller's own row. `close`
  closes that row's detail and returns focus to the row's disclosure when focus was inside the
  detail, so a detail's Save or Done calls it. In Vue `rowDetail` is a scoped slot
  (`#rowDetail="{ row, close }"`), in Svelte a snippet that takes the object, in Solid a function
  prop, and in Angular an input that takes an `ng-template`
  (`<ng-template #detail let-row="row" let-close="close">`).

  `isRowExpandable` says whether a row has a detail. A row it refuses has an empty cell in the
  expansion column and never draws a detail.

  `getRowName` returns a row's own name, "Invoice 12". `messages` gains an optional
  `detailsLabel`, which names each row's disclosure from it, "Details for Invoice 12", and names
  the expansion column's header. A localized app that passes `rowDetail` passes it as well.
  `getRowLabel` keeps its meaning, the whole name of the row's checkbox, and the disclosure does
  not read it.

  In a narrow container the table pans, and the detail stays as wide as the part of the table
  a reader sees.

  The grid's arrow keys reach a detail. ArrowDown from a cell of an open row moves to the
  row's detail cell, and ArrowDown again to the next row, in the column the reader was in.
  ArrowUp is the reverse. ArrowLeft, ArrowRight, Home and End do nothing in a detail cell. What
  a detail holds stays in the page's tab order, so Tab from the detail cell goes into it. The
  expansion column's header draws nothing and is never the grid's first tab stop. In a table
  without selection the first stop is the first data column's header.

  The detail adds content and hides no column. Choosing which columns to show stays with the
  app, which filters the `columns` it passes.

  A table without `rowDetail` is unchanged.

  The SwiftUI and Compose members draw the detail too, in the list and in the table. Each row's
  disclosure is an icon-only Button after the row's Checkbox, with the platform's expanded or
  collapsed state, named by `detailsLabel` from `getRowName`. An open row's detail is a row of its
  own under it. `expanded`, `defaultExpanded`, `onExpandedChange` and `isRowExpandable` behave as
  on the web. The expansion column has no header on either platform. `close` closes the row. In
  Compose it moves keyboard focus that is inside the detail to the disclosure, and in SwiftUI it
  leaves focus to the system.

  On both platforms `getRowName` also names the row itself, so VoiceOver and TalkBack announce
  "Invoice 12" for a row that opens and the row's Checkbox stays "Select Invoice 12". A table
  without `getRowName` names its rows as before: by `getRowLabel` when the app passes it, else by
  each column's header and value.

  `@polymorph/angular` gains `bindSlot`, which binds a scoped slot's template to the slot's
  props and gives the template each prop as a variable of that name. A generated Angular member
  calls it for a slot outlet that has `props`.

- a35c79a: `Diff` is a new member in every web vocabulary: a changed value or text, shown as old and new.
  It takes `before` and `after`, both strings. A side that is missing, `null` or empty did not
  exist, so only an `after` is an addition and only a `before` is a removal. Equal sides are no
  change.

  `display="inline"`, the default, is a short value inside a sentence, an Alert or a table cell.
  The old value is a `<del>`, struck through, and the new one an `<ins>`, with an arrow between
  them. A value that is only new has a `+` before it. Visually hidden words say the change, so it reads "from Draft to Active", "added Ada
  Okonkwo" or "removed Ada Okonkwo". It takes the font, size and colour of the text around it and
  wraps as that text does.

  `display="lines"` compares two texts line by line, in a region that `label` names. Each row has
  a marker (`+`, `−` or none), hidden words and the line in the mono face. Long lines wrap. Runs of
  unchanged lines away from a change collapse to one row, a Button that says how many lines it
  holds and shows them when pressed. `context` is the number of unchanged lines kept beside each
  change (3 by default; `Infinity` keeps every line). A list of ids is compared with one id on
  each line.

  `messages` holds the hidden words and the collapsed row's text, with English defaults.

  It replaces `old → new` written into a string, where a screen reader reads an arrow and colour is
  the only mark. It is not CodeBlock or JsonTree, which each show one value. It has no side-by-side
  form, no highlighting inside a line, no syntax colours and no editing.

  The SwiftUI and Compose renderings are not written yet. `Diff` is in both platforms' pending
  lists, and both contracts are generated.

- e708348: `DurationInput` is a new member in every web vocabulary: a field for a length of time, such as
  a session lifetime, a retention period or a timeout. It holds whole seconds and shows them as
  counts of days, hours, minutes or seconds, each a spinbutton with its unit's word beside it,
  so a reader sees "7 days" where a number field labelled "(seconds)" shows 604800.

  `value`, `defaultValue` and `onChange` are whole seconds, and `null` is the empty field.
  `onChange` reports committed values, as NumberInput's does: an arrow key commits at once, and
  typed digits commit when focus leaves the field or on Enter. `min` (0 by default) and `max`
  hold every commit, and the arrows stop at them. `units` chooses the counts, days, hours and
  minutes by default. The largest count shown has no ceiling, so 36 hours is lawful when hours
  are the largest. An arrow carries into the next count: one minute more than 59 minutes is an
  hour. A typed count stays under the next unit: 90 cannot be typed into the minutes while hours
  show. A value the counts cannot write exactly is drawn rounded to the smallest unit and kept
  as it was until the reader changes it. `name` posts whole seconds as a decimal string. The
  unit words, the digits and each count's name come from `Intl` in `locale`, and the one word
  the member writes itself, what an empty count says, is `messages.empty`. The label, the
  description and the error are FormField's.

  It is not TimeInput, which holds a time of day, and it has no presets: a screen that offers a
  few fixed lengths uses `Select` or `RadioGroup`.

  The arithmetic is new in the engine, and so in every foundation, which re-exports it:
  `durationKey` (what a key does in a count), `durationSegments` (the counts a draft draws),
  `durationDraft` (seconds as counts), `typeIntoDuration` and `commitDuration`, with the types
  `DurationUnit`, `DurationDraft`, `DurationFieldOptions`, `DurationSegment`, `DurationKey`,
  `DurationKeyResult` and `DurationMessages`.

  The SwiftUI and Compose renderings are not written yet. `DurationInput` is in both platforms'
  pending lists, and both contracts are generated.

- f69f55e: `followEnd(region, content, report)` and `jumpToEnd(region)` are new exports of the engine, and
  of every foundation, which re-exports the engine. `ChatThread` follows its newest turn with them
  in every web vocabulary, and `LogView` follows its newest line with them.

  `followEnd` keeps a scroll container at its end while the element inside it grows, for as long
  as the reader is at the end: within `FOLLOW_SLACK_PX` (24) of it. A reader who scrolls away is
  left where they scrolled. `report` receives `{ detached, overflowing }` once at the start and
  again each time either changes, and `overflowing` counts both axes. It returns the function that
  stops following. Without a container, without content or without `ResizeObserver` it does
  nothing. `jumpToEnd` moves the container to its end and follows again from that call, which is
  what a "Jump to latest" control does.

  `ChatThread`'s jump control now follows from the press, so a turn that grows in the frame
  before the browser reports the jump's scroll is followed too. A thread that is wider than its
  box is a tab stop, as a taller one already was.

- 766b5fd: `FunnelChart` is a new chart member in every web vocabulary: the count that survives each stage
  of an ordered process, such as a signup, a checkout or a ticket from opened to resolved. It
  takes `label` and `stages`, where a `FunnelStage` is `{ key, label, value }`, and the tier's
  `format`, `size`, `locale`, `tooltip`, `onSelect`, `loading` and `messages`.

  Each stage is one horizontal bar from the inline start, its length its value against the
  largest stage, with its label in a column before it and its value and share of the first stage
  after it. Between two bars it writes the share of the stage above that reached the stage below:
  "62% continued". Stages are drawn as given. A stage larger than the one before it dev-warns and
  is not clamped or reordered. A first stage of zero has no shares, and a stage of zero has no
  step after it. The tooltip, the live region and the table twin (stage, value, share,
  continued) state every number the plot has no room for. It is one series, so it has one colour
  and no legend.

  `funnelChartModel`, `funnelChartReadout` and `funnelChartSelection` are new exports of
  `@polymorph/engine/charts`, and of every foundation, which re-exports it, with the types
  `FunnelStage`, `FunnelChartInput`, `FunnelChartModel`, `FunnelPlot`, `FunnelBar` and
  `FunnelText`.

  `ChartMessages` has four new keys, with English defaults in `DEFAULT_CHART_MESSAGES`:
  `funnelSummary`, `stageColumn`, `continuedColumn` and `continued`. A host that spreads the
  defaults is unaffected. A host that writes its own whole catalog adds the four keys, because the
  catalog takes all keys or none.

  On iOS, `PMChartMessages` takes the same four, and `PMSpecDefault.chartMessages` gives their
  English. `FunnelChart` is native on iOS and its SwiftUI rendering is not written yet: it is in
  the pending list, and its contract is generated. Android marks it absent, with `Table`, as it
  does every chart member.

- 982e684: `Highlight` is a new member: the parts of a text that match a search, marked. It is phrasing
  content, so it sits inside a Text, a table cell or a description's detail and takes the font
  around it. The app passes `text` and either `query`, one term or several, matched as written and
  never as a pattern, with case folded by `locale`, or `ranges`, the `[start, end]` offsets its
  search engine returned, which take the query's place. Marks that overlap or touch are one mark,
  and a range is cut at the text's end. An app that printed its search engine's highlight data as
  JSON, because nothing drew it, passes it here.

  A mark is a `<mark>` in `warning.text` on `warning.subtle`, a pair the contrast law measures in
  every pairing, at the emphasis weight, so it is marked by more than colour. A screen reader reads
  the text once, as it is, and hears no mark.

  `highlightRuns(text, { query, ranges, locale })` is a new export of the engine, and of every
  foundation, which re-exports the engine. It returns the text as runs, `{ text, marked }`, which
  every framework's Highlight draws.

  The SwiftUI and Compose renderings are pending.

- 54a113e: `InlineEdit` is a new member in every web vocabulary: a short value, such as a project's,
  team's or device's name, shown as text with an edit control beside it, which becomes a field
  where it stands. It takes `value`, the saved value, `label`, which names the field and the edit
  control ("Edit Project name"), and `onCommit`, called with the field's text as it was typed when
  the reader saves a changed value.

  The edit control opens the field with all of its text selected and focus in it. Enter and the
  save control save, Escape and the cancel control cancel, and either way focus returns to the
  edit control. An unchanged text reports nothing. Leaving the field neither saves nor cancels.
  `required` refuses a blank text, `maxLength` limits it, `placeholder` stands in for an empty
  value, and `size` sets the control height and the text step of both forms, which keep the same
  height.

  An uncontrolled field closes as soon as it saves. An app whose save waits for a server holds
  the field with `editing` and `onEditingChange` (and `defaultEditing` for an uncontrolled first
  state), sets `pending` while the save is in flight, which makes the field read-only and the save
  control busy, and closes the field when the save succeeds. When the save fails, the app passes
  `error`, which is drawn under the field as FormField draws an error, tied to the field and
  announced, and focus moves to the field. The three strings the member says for itself are in
  `messages` (`edit`, `save`, `cancel`), with English defaults.

  It is not a form, a rich text editor or a table's edit mode: a change that needs a second field
  or a confirmation stays in a Dialog.

  The SwiftUI and Compose renderings are not written yet. `InlineEdit` is in both platforms'
  pending lists, and both contracts are generated.

- c68a872: `Lightbox` is a new member in every web vocabulary: a picture opened large over the page, fitted
  inside the window with nothing cropped, with previous and next when there are several.

  It takes `images`, each a `src` and an `alt`, and `label`, the dialog's accessible name. It opens
  from a `trigger`, as Dialog does, or from `open` and `defaultOpen`. `index`, `defaultIndex` and
  `onIndexChange` hold the picture shown. `messages` holds the close, previous and next names and
  the position line ("2 of 5"), with English defaults.

  It is Dialog's machinery with a panel of its own: Dialog's scrim, focus trap, focus return,
  Escape, scroll lock and presence motion. The panel fills the window and draws no card, so a tall
  or wide picture is drawn whole, where a picture inside a Dialog is held to the card's width and
  scrolls in its body. Each picture is an Image, with Image's loading and failed states. The
  controls sit on backings, so they keep their contrast over any picture.

  ArrowLeft and ArrowRight move one picture, by the page's direction. Previous and next are
  disabled at the ends, and focus moves to the other one when the one that has it is disabled.
  The position line is a polite status. A press beside the picture closes the lightbox. There is
  no zoom, no swipe and no caption: the reader zooms with the browser, and a picture's words are
  its `alt`.

  The SwiftUI and Compose renderings are not written yet. `Lightbox` is in both platforms' pending
  lists, and both contracts are generated.

- 7e3d878: `List` is a new member in every web vocabulary: a column of items of one kind, such as
  notifications, search results or the records beside a detail pane. `List` takes `label`, the
  list's name. `List.Item` takes `title`, `description`, `meta` (a short trailing fact the app has
  formatted), `leading` (an Avatar, an Icon or an Image) and `trailing` (a Badge, a Button, a Menu
  or a Switch).

  An item is read, or it navigates, or it is picked. With `href` the title is a real `<a href>`
  and `onNavigate` is the routing seam Link takes. With `onSelect` and no `href` the title is a
  `<button>`. In both, the title's target covers the row, so an item is one tab stop with one name,
  and a trailing control stays reachable above it. A trailing mark that is not a control, such
  as a Badge, leaves its press to the row. A trailing box that holds a control takes every press
  inside it, so a press on a Button that is loading or disabled never follows the row. `current` marks the item whose page or detail is open,
  with `aria-current` and the selected surface, on which its text keeps its colours. It has no effect on an item that is only read,
  which has no link or button to carry `aria-current`.

  It replaces rows built from a `Stack`, an `Inline` and `Text`, where the fields were often joined
  into one string. It is not Table: a table compares the same fields down its columns, and a List
  is the form those rows take where there is no width for columns. A grouped list is several Lists,
  each under its own `Heading`.

  The SwiftUI and Compose renderings are not written yet. `List` is in both platforms' pending
  lists, and both contracts are generated.

- b097e69: `LogView` is a new member in every web vocabulary: lines of output that arrive over time, such
  as a build's output, an agent's console or an audit stream, with the view held at the newest
  line while the reader is there. It takes `label`, the log's name, and `lines`, oldest first,
  where a `LogLine` is `{ id, text, level?, time?, source? }`. `level` is `'info'`, `'warning'` or
  `'error'`. `time` is text the application has formatted, as Timeline's is. `source` names what
  wrote the line, such as a service or a build step.

  It follows as ChatThread does, by the engine's `followEnd`: while the reader is at the end, a new
  line keeps the end in view, and when they scroll up it stays where they put it and shows a
  "Jump to latest" control. `streaming` draws a caret after the last line and sets `aria-busy`.
  `wrap` is on by default, so a long line wraps; `wrap={false}` keeps each line on one row and
  scrolls the log sideways. The words it says for itself are in `messages` (`jumpToLatest`,
  `info`, `warning`, `error`), with English defaults.

  A level is drawn as an icon in a marker cell and read as a hidden word, so colour is never the
  only mark. The log is a `log` region that announces nothing on its own (`aria-live="off"`),
  because a fast stream would flood a screen reader: the application announces what a stream
  came to. It is a tab stop while it overflows, and it fills the box its container gives it.

  The application owns the window: it passes the lines it wants shown and trims the old ones.
  LogView draws every line it is passed, up to 5,000 without a visible stall. It does not
  virtualise, parse ANSI colour codes, search or filter.

  It replaces output pasted into a `CodeBlock`, which does not follow and marks no line, and log
  lines drawn by hand. The SwiftUI and Compose renderings are not written yet. `LogView` is in
  both platforms' pending lists, and both contracts are generated.

- 53ed1e2: Every type a member's props are written with is exported from the package root, so an
  application can name the type of a value it builds before it passes it: an item of `items`, a
  tone, an orientation.

  `@polymorph/react-ui` now exports `BannerTone`, `CarouselSlide`, `CheckboxGroupOption`,
  `CheckboxGroupOrientation`, `ChoiceCardOption`, `CursorPaginationMessages`,
  `DescriptionListItem`, `DescriptionListOrientation`, `ErrorSummaryError`, `FirstDayOfWeek`,
  `HoverCardAlign`, `HoverCardSide`, `MenuLabelEntry`, `MenuPresentation`, `MenuSeparatorEntry`,
  `MultiSelectOption`, `OTPLength`, `ProviderButtonProvider`, `QRCodeErrorCorrection`,
  `QRCodeSize`, `ScrollAreaOrientation`, `ScrollAreaType`, `SectionNavItem`,
  `SegmentedControlOption`, `SegmentedControlSize`, `SplitButtonAppearance`, `SplitButtonGrid`
  and `SplitPaneOrientation`. Each was already exported by its member's module, which an
  application cannot import.

  The Vue, Svelte, Solid and Angular vocabularies export the ones they did not have, under the
  same names: `BannerTone`, `CheckboxGroupOrientation`, `DescriptionListOrientation`,
  `FirstDayOfWeek`, `HoverCardAlign`, `HoverCardSide`, `MenuPresentation`, `OTPLength`,
  `ProviderButtonProvider`, `QRCodeErrorCorrection`, `QRCodeSize`, `ScrollAreaOrientation`,
  `ScrollAreaType`, `SegmentedControlSize`, `SplitButtonAppearance`, `SplitButtonGrid` and
  `SplitPaneOrientation`.

  Nothing is renamed or removed.

- 2ffb66b: `Menubar` is a new member in every web vocabulary: an application's command menus in one row, as
  a desktop application's File, Edit and View. It is for an editor, a canvas or a document tool
  whose commands are too many for one Menu. It is not navigation: a title never links.

  `Menubar` takes `label`, which names the bar, `menus`, each a `MenubarMenu` with a `label`, Menu's
  `entries` and an optional `disabled`, and `defaultOpen`, the title whose menu is open on mount.
  Each menu is Menu's panel with Menu's entries, and each entry reports through its own handler, as
  in Menu. The bar is one tab stop. ArrowRight and ArrowLeft move along the row in the reading
  direction and stop at the ends, Home and End go to the first and the last title, and a letter
  goes to the title that starts with it. ArrowDown, Enter and Space open a menu on its first entry
  and ArrowUp on its last. In an open menu, ArrowRight and ArrowLeft open the neighbour's menu.
  While a menu is open, the title a mouse moves onto opens its own. A long row scrolls inside its
  box. Below `30rem` the bar is one Menu behind one overflow Button named by `label`, each menu a
  group under its title. The member is absent on iOS and Android, where the substitute is Menu.

  The engine exports the model every framework's Menubar runs: `menubarStep`, `menubarStop`,
  `menubarOpens`, `menubarHandOff`, `menubarEntries`, `roveMenubar`, `menubarNeighbour` and
  `menubarEdge`, with their types. Each foundation re-exports them.

  In the Vue, Svelte, Solid and Angular vocabularies, a Menu's, a ContextMenu's and a SplitButton's
  submenu row now takes focus when the keys highlight it, as every other row does, and closing the
  submenu returns focus to its row when focus is still in the submenu, as Radix's submenu does.

- 1dad4be: `Meter` is a new member in every web vocabulary: a measured value in a known range, such as
  storage used of a quota, money spent of a budget or seats taken of a plan. It has
  `role="meter"`, named by `label`, with `min` (0) and `max` (100).

  `warning` and `danger` are thresholds in the range's units. From each one up, the fill takes
  that band's colour, so a screen passes the rule as numbers and does not compare at each site:
  `<Progress tone={ratio > 0.85 ? 'danger' : 'accent'} />` becomes
  `<Meter value={used} max={limit} danger={limit * 0.85} />`. A value outside the range is drawn
  at the end it passed, and keeps the band of the value it was given.

  `valueText` is the value in the application's words ("42 GB of 50 GB"). It is shown under the
  bar and is the meter's `aria-valuetext`. In a band, a `warning` or `error` glyph sits before
  it, named by `messages` ("High", "Critical" in English), so the band is never colour alone.

  The bar is Progress's. Use Progress for a task moving towards done, and Meter for a value that
  can go down as well as up. Meter draws no ring, and there is no gauge: no consumer draws one
  yet.

  The SwiftUI and Compose renderings are not written yet. `Meter` is in both platforms' pending
  lists, and both contracts are generated.

- 773b373: `ModeSwitch` is a new member in every web vocabulary: the choice of light, dark or the system's
  mode. It is a SegmentedControl preset with three segments, Light, Dark and System, in that order,
  each with its mode glyph. It takes `label`, the group's accessible name, and optionally `value`,
  `onChange`, `messages` (`{ light, dark, system }`), `size` (`sm` or `md`) and `disabled`.

  Without `value`, it shows the document's preference and applies a press with the runtime's
  `setMode`, then calls `onChange`. It follows a mode set anywhere else: another ModeSwitch, a Menu
  entry or a command. While `system` is chosen and the operating system's mode changes, System
  stays checked and the page follows. With `value`, it shows `value` and only calls `onChange`, so
  an application that saves the choice on its server applies it with `setMode`, and passes the old
  value back if the save fails.

  A server render shows System, because a server stores no preference. In React, Vue and Solid the
  render that hydrates the server's markup shows the same, so nothing mismatches, and the switch
  shows the stored choice once it has hydrated. The page's colours are right from the first paint,
  because the pre-paint script applies the stored mode.

  The member has no stylesheet of its own. It wears SegmentedControl's recipe, and its track
  carries `data-member="mode-switch"`. A SegmentedControl elsewhere is unchanged.

- 846f5bf: `MonthInput` is a new member in every web vocabulary: a month and a year with no day, such as a
  card's expiry or a billing month, entered in two segments with no popup. It is DatePicker's
  segmented entry with the month and the year segments only, in the locale's order (`7/2026` in
  `en-US`, `2026/7` in `ja-JP`).

  Its value is a `YYYY-MM` string, the form `<input type="month">` reports, with a four-digit
  year. `onChange` reports it once both segments are filled, on each digit that changes it after
  that, and `null` once a filled segment is erased. `min` and `max` are `YYYY-MM` too: a month
  outside them marks the field invalid and stays in it. `name` submits the `YYYY-MM` text. It
  takes `locale`, `size`, `disabled`, `readOnly`, `invalid` and `id` as TimeInput does, and
  `messages` holds the one word it says that `Intl` cannot, what an empty segment says (`Empty`).
  A filled month says its number and its name as its value (`7 – July`).

  It replaces two number Inputs for a month and a year, which have two names, no order and no wrap
  at the twelfth month. It is not DatePicker at another granularity: DatePicker's value is a day.
  It has no month grid, no year-only form and no range.

  The SwiftUI and Compose renderings are not written yet. `MonthInput` is in both platforms'
  pending lists, and both contracts are generated.

- 617eb16: `Pagination` takes `disabled`, the app's hold on the pager while it does something else to the
  list, such as a bulk action or a save. It is `CursorPagination`'s `disabled`, so a `DataTable`
  held during that work holds whichever pager its `pagination` slot has. Every control is disabled,
  the current page too, the root carries `data-disabled`, and no page is asked for. The current
  page keeps `aria-current`, and the pager is still drawn, so the page does not move when the hold
  ends. The SwiftUI and Compose members take the prop too.

  A hold keeps the reader's place. A browser takes focus from a button as it is disabled: the page
  has it, and no control does. So when a hold disables the button that has focus, the pager moves
  focus to its root, the `<nav>`. The root carries `tabindex="-1"`, which makes it no tab stop, and
  draws the shared focus ring. The next Tab goes on to what follows the pager. A hold that begins
  while focus is elsewhere moves nothing.

  When the hold ends and focus is still on the root, focus returns to the control it was taken
  from: previous, next, or the page of that number. So when an app holds the pager while each
  page loads, a keyboard reader does not have to move back to the button after every page. A
  control that is no longer drawn, or is still disabled, takes no focus, and focus stays on the
  root. If the reader moved focus during the hold, nothing moves.

  In Vue, Svelte, Solid and Angular a page's button is the same element when it becomes the
  current page, as it is in React. A page the reader presses keeps focus there. Before, those four
  drew the current page as a new button, and the pressed one, which had focus, left the document.

  A pager without `disabled` is otherwise unchanged, but for the `tabindex="-1"` on its root.

- b9e5208: `PhoneInput` is a new member in every web vocabulary: a phone number, entered as a country and
  a national number and reported as one E.164 string (`+442079460958`). It takes `value`,
  `defaultValue` and `onChange`, `defaultCountry` (ISO 3166-1 alpha-2), `countries` to restrict
  and order the list, `locale` for the country names, and Input's `size`, `disabled`,
  `readOnly`, `invalid`, `name` and `id`. FormField names, describes and marks it, as it does
  TimeInput. The words it writes itself are in `messages` (`country`, `showCountries`,
  `countriesShown`, `noCountry`), with English defaults.

  `onChange` reports commits, never drafts, as NumberInput does: the reader leaving the number or
  pressing Enter in it, choosing a country, or pasting a number written with its calling code. It
  reports the empty string while the national number has no digits. The national field keeps
  digits within the E.164 limit of fifteen, and one leading trunk zero is dropped in a region
  that dials one, so "020 7946 0958" in the United Kingdom is `+442079460958`. A pasted
  `+44 20 7946 0958` sets the country and the number. A calling code that several regions share
  keeps the field's country when it has the code, else takes the first of `countries` with it,
  else the code's main region. `name` serializes the E.164 value, and the number carries
  `autocomplete="tel-national"`.

  The country is a Combobox of every region's calling code and name, in `locale`, from
  `Intl.DisplayNames`; no flag is drawn. PhoneInput checks the form of a number only: whether it
  exists, and its length in its country, are the application's to check.

  `@polymorph/engine` exports the model every framework's PhoneInput calls: `phoneCallingCode`,
  `phoneCountries`, `phoneCountryOptions`, `phoneDefaultCountry`, `phoneDraft`, `phoneNational`,
  `phoneValue`, `splitPhone`, `readPhone`, `commitPhone`, `isPhoneValue` and
  `PHONE_MAX_DIGITS`. An application can call `splitPhone` and `phoneValue` to read and build an
  E.164 string the way the member does.

  The SwiftUI and Compose renderings are not written yet. `PhoneInput` is in both platforms'
  pending lists, and both contracts are generated.

- ee6e63c: `Plan` is a new member in every web vocabulary: the steps of one agent run, each with its
  status, read at a glance while the run goes on. It takes `label`, the list's name, and `steps`,
  where a `PlanStep` is `{ id, title, description?, status }` and the status is `pending`,
  `running`, `done`, `error` or `skipped`. The app passes the whole list again on every change.

  Each step draws a glyph for its status, ToolCall's glyph where the two share a status, beside
  its title and an optional description. A pending or skipped step is drawn in quieter text
  roles. A long title wraps, and the list never widens its container. An empty list renders
  nothing.

  The status is never the glyph alone. Each step reads as its title and its status words, which
  come from `messages.status` with English defaults. The first running step is the current step
  (`aria-current="step"`) and every running step is `aria-busy`. One polite status line names
  the step at the front of the run: the first running step, else the first failed one, else the
  last one done or skipped. It changes once for each step the run reaches, and a description the
  app updates while a step runs is not announced.

  It is not Stepper, which is the reader's own flow, not Timeline, whose events are over, and
  not ToolCall, which is one invocation. It has no nested steps, nothing to press and nothing to
  open.

  The SwiftUI and Compose renderings are not written yet. `Plan` is in both platforms' pending
  lists, and both contracts are generated.

- cb335db: `Progress` takes `shape="ring"`, which draws the same value as a ring at Spinner's sizes
  (`size`: `sm`, `md` or `lg`, the icon box). It is for the place a Spinner sits, such as a file
  row, a chip or a line of text, once the task knows how far it has got. The ring is named and
  valued as the bar is, renders no text, starts at the top and fills clockwise in either reading
  direction. Its arc is the solid accent, or the danger solid. A ring with no value is a Spinner,
  so `value` stays required.

  A Progress that passes no `shape` renders as before, with one change: in a right-to-left
  document the bar now fills from the right, as SwiftUI's and Compose's already did.

  The ring is drawn in SwiftUI and Compose too.

- 3dc5f0f: `PromptInput` takes `triggers`, in every web vocabulary: characters that open a list of the app's
  suggestions, such as `@` for people and `/` for commands. A composer without `triggers` is
  unchanged.

  ```tsx
  <PromptInput
    label="Message"
    onSubmit={send}
    triggers={[
      {
        char: '@',
        label: 'People',
        options: people,
        onSelect: (person) => mention(person.id),
      },
      { char: '/', label: 'Commands', at: 'start', options: commands },
    ]}
  />
  ```

  A trigger is `{ char, label, options, at?, filter?, loading?, onQueryChange?, onSelect? }`, and
  an option `{ id, label, description?, icon?, insert? }`. The list opens while the caret is in a
  token: the character at the start of the prompt or after whitespace (`at: 'word'`, the default),
  or only as the prompt's first character (`at: 'start'`), followed by the query, which holds no
  whitespace. The member filters the options by the query as Combobox does; `filter: false` shows
  the app's own results, which it loads from `onQueryChange` while `loading` is set.

  The prompt stays plain text. Enter, Tab or a press picks the active option: the typed token is
  replaced by the option's `insert`, or by the character and the label (`@Ada Lovelace`), and a
  space, and the trigger's `onSelect` is called with the option. `insert: ''` removes the token and
  writes nothing, for a command the app runs at once. The composer reports picks only: an app that
  sends mentions checks, when the prompt is sent, which picked options' text is still in it.

  While the list is open, ArrowUp and ArrowDown move the active option. Enter does nothing while the
  trigger is `loading` with no option shown, and sends the prompt when nothing matches, as with the
  list closed. Escape closes the list and keeps the text; inside a Dialog the dialog stays open until
  the next Escape. Focus stays in the field, which carries
  `aria-autocomplete="list"`, `aria-haspopup="listbox"`, and, while the list is open,
  `aria-controls` and `aria-activedescendant`. A polite live region says how many options there
  are. `PromptInputMessages` gains three optional strings: `suggestions(count)`,
  `loadingSuggestions` and `noSuggestions`. The list opens above the composer, or below it when the
  viewport has more room below, at the composer's width at every width. It is drawn in the
  composer's root, so the composer's container must not clip it. The types are `PromptTrigger` and
  `PromptTriggerOption`.

  A composer focused on mount by `autoFocus` now has its caret at the end of its prompt in React,
  as it already had in the other vocabularies.

  `promptToken(text, caret, triggers)` and `promptPick(text, token, caret, insertion)` are new
  exports of the engine, and of every foundation, which re-exports the engine: the token the caret
  is in, and the text and caret a pick leaves. The types are `PromptToken` and
  `PromptTokenTrigger`.

  The SwiftUI and Compose contracts carry `triggers`, `PMPromptTrigger` and
  `PMPromptTriggerOption`, and neither rendering draws a list: an `@` or a `/` stays text in the
  prompt on iOS and Android.

- 9f8c97f: `Rating` is a new member in every web vocabulary: a score out of a few marks, five stars by
  default, that a reader sets ("Rate this answer") or reads ("Average rating: 4.3 out of 5").

  Set, it is a radio group with one radio per mark, named for the value it sets ("3 stars").
  `value`, `defaultValue` and `onChange` are a whole number from 1 to `max`, and `null` for no
  rating. A press on the chosen mark clears it, unless the rating is required (`aria-required`,
  which FormField sets). The arrows move and choose, following the document's direction, Home
  and End choose the first and the last mark, and the arrows stop at the ends. `name` posts the
  value. Shown (`readOnly`), it is one image named by a sentence, and it draws any value to one
  decimal place, with the mark the fraction lands in part filled. `max` is 2 to 10, `size` is the
  marks' icon size, and `messages` with `locale` writes the marks' names and the sentence. Filled
  and empty marks differ in shape, a solid star against an outline.

  It is not RadioGroup, whose options are labelled rows, and not Meter, which measures against a
  limit. Thumbs up and down under a reply are two pressed Buttons.

  Its model is new in the engine, and so in every foundation, which re-exports it: `ratingModel`
  (the marks, their fills and names, and the shown sentence), `ratingPress` (the clear rule),
  `ratingStep` and `roveRating` (the keys), `ratingMax` and `RATING_DEFAULT_MAX`, with the types
  `RatingModel`, `RatingMark`, `RatingFill`, `RatingOptions`, `RatingWords` and
  `RatingKeyEvent`.

  The SwiftUI and Compose renderings are not written yet. `Rating` is in both platforms' pending
  lists, and both contracts are generated.

- 2f47e9e: `RecordButton` is a new member in every web vocabulary: a Button preset that starts and stops a
  recording the application makes, such as voice input in `PromptInput`'s `trailing` slot. It
  takes `label`, the Button's name while not recording ("Record a voice message"), and
  `stopLabel`, its name while recording ("Stop recording").

  The application owns the microphone. It calls `getUserMedia` and `MediaRecorder` itself and
  passes `recording`, `elapsed` (the seconds recorded) and `level` (the input level from 0 to 1).
  A press calls `onStart` while not recording and `onStop` while recording, and changes nothing
  until the application passes `recording`. `locale` writes the time's numerals, `disabled` and
  `size` (`sm` or `md`) are Button's.

  At rest it is a ghost Button with the new `record` glyph, a microphone. While recording it is an
  outline Button with the `stop` glyph, and before it a meter: a red dot with a halo sized by the
  level, and the time as m:ss. The Button's name changes with the state and it carries no
  `aria-pressed`. The time is text a reader can reach and is not a live region. Under reduced
  motion the halo does not grow, and the level is its opacity.

  The SwiftUI and Compose renderings are not written yet. `RecordButton` is in both platforms'
  pending lists, and both contracts are generated.

- f0d907c: `SectionNav` is a new member in every web vocabulary: the row of links between the sibling pages
  of one section, with the page the reader is on marked. It takes `label` (the landmark's name),
  `items` (`{ label, href }`), `current` (the `href` of the current item) and `onNavigate`, the
  routing seam Link and Breadcrumbs take. Each item is a real `<a href>`; the current one carries
  `aria-current="page"` and the selection treatment the AppShell rail gives its current item. The
  row wraps on a narrow screen.

  `current` is compared with each `href` as the page it names: a trailing slash, a query and a
  hash on either side do not stop the match, and neither does an origin on `current`, so a router's
  location or `location.href` can be passed as it is. An item written with an origin matches only a
  `current` with the same one. An item whose `href` is exactly `current` comes first, and at most
  one item is current.

  It replaces a `<nav>` of `Link`s in an `Inline`, where each app drew the current item its own
  way and most left out `aria-current`. It is not Tabs: a tab shows a panel of the same page and
  has no address.

  The SwiftUI and Compose renderings are not written yet. `SectionNav` is in both platforms'
  pending lists, and both contracts are generated.

- 0936316: `TableOfContents` is a new member in every web vocabulary: the list of links to the sections of
  one long page ("On this page"), with the section the reader is in marked. It takes `label` (the
  landmark's name, drawn above the list), `items` (`{ id, label, level? }`, where `id` is the id of
  the section's element in the document and `level: 2` draws a subsection one step in, in a list
  inside its section's item) and `onCurrentChange`, called with the current section's id or
  `null`. Each item is a real `<a href="#id">`; the current one carries `aria-current="location"`
  and the selection treatment SectionNav gives its current item.

  The current section is the last one whose top has reached a line a quarter of the way down the
  page that scrolls around the sections, or the last section when the page is scrolled to its end.
  A click marks its item at once, holds the mark while the browser scrolls to the section, and
  moves focus to the section, which takes `tabindex="-1"` only while it has focus. An item whose
  section is not in the document is drawn and never marked. The member does not scroll and does
  not stay in view on its own: the page's CSS owns `scroll-behavior`, and the app places the list.

  It is not SectionNav, whose items are pages the router marks.

  `watchSections(owner, ids, report)` and `jumpToSection(owner, id, event)` are new exports of the
  engine, and of every foundation, which re-exports the engine, with `SECTION_LINE` (0.25), the
  line's place as a fraction of the page's height. Every framework's TableOfContents follows the
  page with them.

  The SwiftUI and Compose renderings are not written yet. `TableOfContents` is in both platforms'
  pending lists, and both contracts are generated, with the item's shape.

- f870095: `Text` takes `lines`, the most lines a paragraph draws: `1` for a name, an address or an id in a
  row, or more for a description. The last line ends with an ellipsis, and a word longer than the
  line breaks, so a long id is cut at the last line and never widens what holds it. Only the drawing
  is cut: a screen reader, a search in the page and a copy get the whole text. The spec's rule is
  that a Text with `lines` holds text whose whole a sighted reader can reach another way, such as the
  page the row opens; the member opens no tooltip. An app that wrote ellipsis CSS, or cut a string
  with `slice(0, n) + '…'`, passes `lines` instead. SwiftUI draws it as the text's line limit;
  Compose's Text cannot set a limit on the text an app passes, so an app there sets `maxLines` on
  its own `Text`.

  A Text without `lines` is unchanged.

- 6119b46: Another library's component has a declared boundary. `ThirdParty` is a rung-4 primitive beside
  `Bespoke`, in every web vocabulary (`<pm-third-party>` in an Angular template): it wraps a map, a
  rich-text editor, a data grid or any component the vocabulary does not draw, and takes the
  package's name as `library` and a `reason`. It draws nothing.

  The red rules read it. A boundary hosts its library only in a file that imports a binding from the
  package it names: a default, a name or a namespace, from that specifier or a path inside it, an
  `import()` of one, or `import L = require('…')`. A side-effect import, a type import and a
  stylesheet import bring no binding. `no-raw-styles` reports a boundary that hosts nothing, on its
  own tag: one with no `library` written out, one whose `library` is not spelled as a package, one
  whose `library` is a polymorph package or a framework's own runtime (`react`, `vue`, `svelte`,
  `solid-js`, `@angular/core` and the other packages each framework ships as its runtime), and one
  whose package the file imports no binding from.

  Inside a boundary that hosts, a plain element and the library's own component take `style` and a
  class, and a raw length is allowed. The file may import that library's stylesheet, which
  `no-app-css` banned with no rung to answer it. It may import a package `no-external-dataviz` or
  `no-external-motion` bans when `library` is that package's name as the rule lists it. Another
  package of the same npm scope is not lifted. Everything else stays red: a raw control, an inline
  `<svg>`, and a class or a `style` on a member or on a part of one (`<Table.Row>`). A colour stays
  red in every syntax. In a `style` the boundary lifts, a property that takes a colour takes a
  custom property read (`var(--pm-…)`), a keyword that names no colour, or a value computed where
  it is written, and a named colour or `color-mix()` is reported. The `style` is read through a
  cast, a conditional, a spread of an object, Vue's array of styles and CSS text with values
  computed inside it, and one whose property names are not written out (`style={styles}`) is
  reported, because its colours cannot be read. A disable comment inside the boundary is still
  undeclared.

  `pnpm inventory` lists each boundary at rung 4 with its library, and `hostedLibraries` in
  `@polymorph/rules/inventory` returns the libraries an application hosts. `Exception` gains an
  optional `library`. A boundary that writes no `library` out is listed with no rung, with the kind
  `NAMELESS_BOUNDARY` exports, and `pnpm inventory` exits 1 on it. In a Vue template the inventory
  reads a tag by the name Vue resolves it to, as lint does, so `<third-party>`, `<bespoke>` and
  `<density-scope>` are listed and a disable inside a `<bespoke>` zone is accounted for.

  Reports change in these cases. A stylesheet imported from a package names the boundary that hosts
  it where the file imports a binding from that package, and says why no boundary lifts it where
  the file does not. A chart library no chart member replaces names the boundary. A file that hosts
  a library is told to read a colour from `useThemeValues()`. No lawful code becomes a violation,
  and nothing is renamed or removed.

- 5fd437e: `ToolCall` with no input, no output and no message has a disabled trigger in Solid and Angular,
  as it has in React, Vue and Svelte. Both members compared the `output` slot with `undefined`,
  which is always different from the boolean those foundations hold for a slot, so an empty call
  got an enabled disclosure that opened an empty body.
- bb10138: `Tooltip`'s bubble passes the positioner's measured room to the recipe, which caps the bubble's width at it. A bubble opened to the left or right of a trigger with too little room on both sides narrows and wraps its text, as the React member's does. Before, it crossed the window's edge.
- b2a20ff: Tooltip's bubble sits `--pm-space-2` from its trigger in every web renderer, as its spec says.
  In React it touched the trigger: the recipe set the offset as `translate`, which the motion
  engine writes inline on the bubble. In Vue, Svelte, Solid and Angular the gap was the
  positioner's default of eight pixels at every density. The recipe now sets the offset as a
  margin on the bubble's edge that faces the trigger, inside the box the positioner places, and
  the generated members pass the positioner a gutter of zero.
- 00bce31: `Tour` is a new member in every web vocabulary: a short walk through the parts of a page, one
  step at a time, that a reader goes through once and can leave at any step. It takes `steps`,
  where a `TourStep` is `{ id, target?, title, body, side? }`. A step names the part it points at
  by the `name` of a `Tour.Target`, which the application puts around that part and which adds no
  box (`display: contents`). A step with no `target`, or whose target is not drawn when it opens,
  is drawn centred.

  The application opens the tour (`open`, `defaultOpen`) and records that it was seen: the member
  stores nothing, and `onEnd(reason)` says why the reader ended it, `finished` from the last
  step's Done or `dismissed` from Escape or the close control. The step is `step`, `defaultStep`
  and `onStepChange`. The words it writes itself are in `messages` (`next`, `previous`, `done`,
  `close`, `position`), with English defaults.

  Each step's panel is a modal dialog, named by the step's title and described by its body and
  its position ("Step 2 of 3"). Focus moves to the panel when each step opens and returns to where
  it was when the tour ends. The rest of the page is hidden from assistive technology and takes no
  presses, and the target is cut out of the scrim. The page keeps its scroll: the target is
  scrolled into view when its step opens, and the panel and the cut-out follow it.

  The engine, and every foundation, which re-exports it, has five new exports for it:
  `tourTarget(name)` finds a step's target, `tourTargetRect(element)` measures the boxes inside
  it, `revealTourTarget(element)` scrolls it into view, `tourViewport()` is the window's size, and
  `tourPlacement(target, box, viewport, side)` places a panel beside a rectangle and inside the
  window. The types are `TourPlacement`, `TourRect`, `TourSide` and `TourSize`, and the attribute
  a target carries is `TOUR_TARGET_ATTRIBUTE`.

- fadf225: `TreeSelect` is a new member in every web vocabulary: a field that picks one node of a hierarchy,
  such as the unit a unit moves under, the folder a file goes into or the category an item belongs
  to. It is Select's trigger with the Tree member in its popup. It replaces a flat Select whose
  option labels carry each node's depth or path.

  It takes Tree's data unchanged: `items`, `expanded`, `defaultExpanded`, `onExpandedChange`,
  `loading`, `hasMore` and `onLoadMore`, and a required `label` that names the tree in the popup, as
  Tree's does. The value is one node's id: `value`, `defaultValue` and `onChange(id | null)`.
  `emptyOption` draws a first top-level item, such as "Top level", that reports `null`, as Select's
  empty choice does. `valueLabel` is what the trigger shows while the chosen node's level is not
  loaded. `placeholder`, `size`, `invalid`, `disabled`, `name`, `id`, `defaultOpen`, `presentation`
  and the ARIA props are Select's, and `messages` is Tree's.

  Opening the popup opens the branches above the chosen node and puts focus on it. Enter, Space or
  a press on a node's row chooses it, closes the popup and returns focus to the trigger. ArrowRight
  and the chevron open a branch without choosing it. Below `30rem` the popup is the shared bottom
  sheet. It has no search: an application with a searchable flat list uses Combobox.

  The SwiftUI and Compose renderings are not written yet. `TreeSelect` is in both platforms'
  pending lists, and both contracts are generated.

- 40e1bf4: `Tree` is a new member in every web vocabulary: a hierarchy of items of one kind, such as
  organization units, folders or categories, which a reader opens level by level and picks one
  item from. It takes `label`, the tree's name, and `items`, where a `TreeItem` is
  `{ id, label, description?, children?, hasChildren?, loading?, hasMore?, disabled? }`.

  The open branches are `expanded`, `defaultExpanded` and `onExpandedChange`, with DataTable's
  types: the tree holds the set unless `expanded` is passed. The selection is `value`,
  `defaultValue` and `onChange`, and `value={null}` selects nothing. A press on a chevron opens
  or closes a branch and selects nothing. A press on the rest of a row selects it and opens
  nothing. Selection does not follow focus.

  The application loads a level. A branch with `hasChildren` and no `children` opens onto
  nothing: `onExpandedChange` reports it, and the application sets `loading` on the item and
  then passes its `children`. `hasMore` on an item, or on the tree for the top level, draws a
  last row that asks for more, and `onLoadMore` is called with the branch's id, or with `null`
  for the top level. `loading` on the tree says the top level is loading. The two strings the
  tree says for itself are in `messages` (`loading`, `loadMore`), with English defaults.

  It is `role="tree"` with one tab stop. ArrowDown and ArrowUp move through the rows that are
  drawn, ArrowRight opens a branch and then moves into it, ArrowLeft closes one or moves to the
  branch above, Home and End go to the first and last row, and Enter and Space select. ArrowLeft
  and ArrowRight swap where the page reads right to left. A disabled item takes no focus and no
  press, and a disabled branch is drawn closed. When a level arrives, focus stays where it was.
  When the reader asked for more of a level, focus moves to the first new row.

  It replaces a hierarchy drawn one level at a time from Buttons, with a control to go back,
  which had no tree roles and no arrow keys. It is not JsonTree, which shows one JSON value and
  selects nothing. It has no multiple selection, no drag and drop, no rename in place, no
  actions on a row and no type-ahead, and it draws every row it is given.

  The SwiftUI and Compose renderings are not written yet. `Tree` is in both platforms' pending
  lists, and both contracts are generated.

- 59658db: `Treemap` is a new chart member in every web vocabulary: parts of a whole as rectangles that
  tile the plot, each with an area proportional to its value, such as storage by kind or tickets
  by team and channel. It takes `label` and `items`, where a `TreemapItem` is
  `{ key, label, value, children? }`, and the tier's `format`, `size`, `locale`, `tooltip`,
  `onSelect`, `loading` and `messages`.

  The layout is squarified, largest first from the inline start, and the same items and size
  always give the same tiles. An item with `children` is a group, drawn as the sum of its
  children; two levels are drawn, and deeper items are summed into the second with a dev
  warning. With groups, each group takes a chart slot and its items its colour, with a legend of
  the groups and a wider gap between them; with one level every tile is one colour. An item with
  no positive value takes no area: the twin lists it and the summary counts it. A tile shows its
  label and value on a plate of the surface colour, and only where both fit; the tooltip, the
  live region and the twin name every item.

  `squarify`, `treemapModel`, `treemapReadout` and `treemapSelection` are new exports of
  `@polymorph/engine/charts`, and of every foundation, which re-exports it, with the types
  `TreemapItem`, `TreemapInput`, `TreemapModel`, `TreemapPlot`, `TreemapTile`, `TreemapPlate`,
  `TreemapLeaf` and `TreemapRect`.

  `ChartMessages` has three new keys, with English defaults in `DEFAULT_CHART_MESSAGES`:
  `treemapSummary`, `groupColumn` and `itemColumn`. A host that spreads the defaults is
  unaffected. A host that writes its own whole catalog adds the three keys.

  On iOS, `PMChartMessages` takes the same three, and `PMSpecDefault.chartMessages` gives their
  English. `Treemap` is adapted on iOS, drawn with SwiftUI shapes because Swift Charts has no mark
  that tiles a box by area; its rendering is not written yet, so it is in the pending list, and
  its contract is generated. Android marks it absent, with `Table`, as it does every chart member.

- d9059ea: `Badge` takes `count`, `max` and `dot`. `count` draws a number in the text's place, as `99+` past
  `max` (99 by default), and draws nothing at zero. `dot` draws a round mark with no text, for
  "something is new", and keeps `children` as the words a screen reader hears; a dot with no
  `children` is hidden from assistive technology. `children` is now optional, because a count has no
  text of its own.

  `Button` takes `count: { value, label }`, for the unread items behind a bell. Above zero, a count
  Badge sits on the corner of an icon-only button, or after the label of any other, and `count.label`
  is the button's accessible name, in the app's words ("Notifications, 3 unread"). At zero neither
  shows. An app that capped a Badge at "99+" by hand beside an icon-only Button, and repeated the
  count in the button's `label`, passes `count` instead. The SwiftUI and Compose members draw both.

  A Badge or a Button without the new props is unchanged.

- Updated dependencies [6d714a7]
- Updated dependencies [28aeda0]
- Updated dependencies [f918ed3]
- Updated dependencies [b209e98]
- Updated dependencies [aec76ec]
- Updated dependencies [51e8566]
- Updated dependencies [e708348]
- Updated dependencies [f69f55e]
- Updated dependencies [766b5fd]
- Updated dependencies [982e684]
- Updated dependencies [2ffb66b]
- Updated dependencies [d9713d4]
- Updated dependencies [49ab024]
- Updated dependencies [b9e5208]
- Updated dependencies [3dc5f0f]
- Updated dependencies [9f8c97f]
- Updated dependencies [9f8c97f]
- Updated dependencies [96daa65]
- Updated dependencies [3b0b47f]
- Updated dependencies [0936316]
- Updated dependencies [b88e331]
- Updated dependencies [00bce31]
- Updated dependencies [59658db]
- Updated dependencies [4902f58]
  - @polymorph/engine@1.0.12
  - @polymorph/angular@1.0.12

## 1.0.10

### Patch Changes

- 7019d6f: Focus returns where it should in Safari and Firefox on the Vue, Svelte, Solid and Angular members, as it already did on the React ones.

  - A Dialog returns focus to the control whose press opened it. Before, it returned focus to where focus was before the press, which is nowhere in Safari, where a press leaves a button unfocused.
  - A ContextMenu opened by a press on a focused button returns focus to that button in Safari. Before, focus was lost when the menu closed, because Safari takes focus off a button on `mousedown`.
  - A Popover, Menu, DatePicker or DateRangePicker that closes within a frame of opening keeps focus on its trigger. Before, the focus the overlay gives its panel could arrive after the close and be lost with the panel.

- cb0d0a3: Members follow a right-to-left document. With `dir="rtl"` on `<html>` or `<body>`, every member built on Radix or Zag now takes that direction: its root says `dir="rtl"`, and the arrow keys, a Slider's track, a submenu's side and a Tabs strip turn with the page. Before, those members wrote `dir="ltr"` on their root and ran left to right inside a right-to-left page. A member already on the page follows a change to the attribute. There is no new prop, and a left-to-right page renders as it did.

  Each foundation exports `useDirection`, which returns the document's direction and keeps it current, and `@polymorph/engine` exports `readDirection` and `watchDirection` beneath it.

  The page-transition indicator's right-to-left rule now reads `dir` instead of `:dir()`, which the published build's minifier had rewritten as a list of languages.

- Updated dependencies [7019d6f]
- Updated dependencies [cb0d0a3]
  - @polymorph/engine@1.0.10
  - @polymorph/angular@1.0.10

## 1.0.9

### Patch Changes

- @polymorph/angular@1.0.9
- @polymorph/engine@1.0.9

## 1.0.8

### Patch Changes

- 2bccb19: `AvatarButton` is a new member: a Button preset whose face is an Avatar. Use it wherever a
  person's or a workspace's mark is pressed to do something, most often as the `trigger` of an
  account `Menu` or `Popover`. It takes Avatar's `name` and `src`, a required `label` that names
  the action ("Account menu", not the person's name), and Button's `size`, `disabled`, `loading`,
  `pressed`, `current` and `onClick`. It keeps Button's ghost/neutral states, focus ring and
  minimum target, with a round box around the face, and an overlay's `aria-haspopup` and
  `aria-expanded` land on it as they do on a Button.

  It replaces the workaround of stacking an invisible `Button` over an `Avatar` inside a `Bespoke`
  zone. Replace that zone with `<AvatarButton name={…} src={…} label="Account menu" />` and delete
  the zone's declared exception. `Button` still takes no children, and `Avatar` is still not
  interactive.

  It ships in every renderer: the React, Vue, Svelte, Solid and Angular vocabularies from this
  release of each package and of `@polymorph/recipes`, and SwiftUI (`PMAvatarButton`) and Compose
  (`PMAvatarButton`) at this release's tag.

- 2bccb19: `Image` is a new member: a read-only picture, such as a photograph, a brand mark, artwork or a
  preview of a file. It replaces a bare `<img>` in application code, and the application CSS that
  sized it.

  ```tsx
  <Image src={logo} alt="Relay" width={90} height={32} loading="eager" />
  <Image src={artwork} alt="" crossOrigin="anonymous" referrerPolicy="no-referrer" />
  <Image src={preview} alt={description} width={widthPx} height={heightPx} />
  ```

  - `alt` is required. A non-empty `alt` names the picture, and an empty one declares it decorative
    and hides it from assistive technology.
  - `width` and `height` are the picture's size in pixels, as numbers. They hold its box before it
    loads, and the picture is never wider than its container, so `max-width: 100%` and
    `height: auto` go. `aspectRatio` holds a frame of a ratio instead, for a source whose size is
    unknown, and `fit` (`contain`, the default, or `cover`) says how the picture sits in a frame of
    another ratio. No prop takes a CSS length.
  - While the picture loads, the box shows the placeholder Skeleton draws. When it cannot load, the
    box shows a fallback of the member's own in place of the browser's broken-image glyph, and a
    meaningful picture keeps its `alt` as the fallback's name.
  - `loading` is `lazy` by default; pass `eager` for a picture in the first view. `crossOrigin` and
    `referrerPolicy` reach the element unchanged.

  It is not `Avatar`, which is a round identity mark with initials, not `ImageEditor`, which crops,
  and not `Icon`, which draws an icon role. It has no caption, zoom or gallery.

  In a module that imports the member, `Image` is the member, and the DOM's constructor of the same
  name is `window.Image`.

  Every web framework's vocabulary ships it, drawn by the new recipe
  `@polymorph/recipes/structure/image.module.css`. The SwiftUI member (`PMImage`) loads through
  `AsyncImage`, and the Compose member through the app's `LocalPMImageLoader`, as Avatar does; both
  ship at the release tag. On both, `loading`, `crossOrigin` and `referrerPolicy` are not honoured,
  and the placeholder is still. On Android a URL that fails stays in the loading state, because a
  Compose painter reports no failure.

- 820c836: Every package now carries the release's version, and the release tag is `v` and that version.
  Until this release each package kept its own number, so one release installed the engine at one
  version, the foundations at another and the tag named a third. From this release on, pin every
  `@polymorph/*` package you install at the same version, and check the native packages out at the
  tag of that version.

  This package's version jumps to the release's number. The jump carries no change of its own: the
  versions it skips were never published.

- e1c80b3: A horizontal `Tabs` list wider than its container now scrolls inside it instead of running past it. There is no new prop, and a list that fits looks as it did.

  - An edge with more tabs beyond it fades out, and an edge with nothing beyond it does not. A browser without scroll-driven animations shows a thin scrollbar instead.
  - The current tab is scrolled inside the list when the list is laid out, when its box changes size and when the value changes. Only the list scrolls, never the page. The move for a new value is smooth unless the motion temperament is `none` or the reader asked for reduced motion.
  - A tab that takes keyboard focus is scrolled into view, clear of the fade, and its focus ring is not clipped.
  - The indicator stays under its tab while the list is scrolled. In React it now also follows a `value` the caller changes without a press.

  Remove any workaround that sets `overflow` on the tablist, such as a `Bespoke` zone around the member. The baseline rule is now drawn by the root, not by the list's border, so a stylesheet that restyled that border no longer reaches it.

  `@polymorph/engine` exports `revealInline`, which every framework's `Tabs` calls, and each foundation re-exports it. A vendored `Tabs` gets the scrolling, the fade and the focus room from the recipe alone, and the scroll to the current tab after `polymorph update`.

- Updated dependencies [820c836]
- Updated dependencies [e1c80b3]
  - @polymorph/engine@1.0.8
  - @polymorph/angular@1.0.8

## 1.0.3

### Patch Changes

- Updated dependencies [22f607b]
  - @polymorph/engine@1.0.6
  - @polymorph/angular@1.0.3

## 1.0.2

### Patch Changes

- 1b900d8: Alert takes a second action, Card takes a title, and ConfirmDialog takes a typed confirmation. Every new prop is optional, so existing screens render as before.

  **Alert's `secondaryAction`** is a second `ghost` `sm` Button after `action`, for a review the reader answers in place: `action={<Button variant="soft" tone="accent" size="sm" label="Apply" />}` with `secondaryAction={<Button variant="ghost" tone="neutral" size="sm" label="Discard" />}`. The two sit in one row that wraps, and Tab reaches both before the dismiss button. Replace a hand-built "apply or discard" block beside an Alert with the two props. Two actions are the most an Alert takes; content that needs more is a Card.

  **Card's `title` and `headingLevel`** draw the card's heading before its content, in the section-heading recipe Dashboard.Panel uses, as an `<h2>` by default or an `<h3>` or `<h4>`. A titled Card with `as="section"` or `as="article"` is named by its title. Replace a `Dashboard.Panel` used outside a Dashboard with `<Card title="…">`, and remove any heading you put inside the card to name it.

  **ConfirmDialog's `confirmWith`** is the phrase a person types before the confirm enables, such as the name of the project being deleted. The dialog draws the field with its label (`confirmWithLabel`, default `Type {phrase} to confirm`) and its error (`confirmWithError`, default `The text does not match`). It compares the text with the spaces around it removed and letter case ignored, starts focus in the field, and empties the field each time it opens. Localized apps pass both strings. Replace a typed-phrase confirmation built inline with `confirmWith`. ConfirmDialog still has no body slot: content beyond the phrase belongs in a Dialog.

  **`@polymorph/recipes`**: Alert's `action` class is a wrapping row with a gap, which holds one action or two, and Card's recipe has a `title` class. `Dashboard.Panel` draws its title as Card's `title`, so `archetypes/dashboard.module.css` no longer has a `panelTitle` class; a vendored Dashboard takes the new `Dashboard.tsx` with the recipe.

  **In Vue, Svelte, Solid and Angular**, `secondaryAction` takes content as `action` does, and the other props are the same props.

  **On iOS and Android**, `PMAlertProps.secondaryAction`, `PMCardProps.title` and `headingLevel` (`PMCardHeadingLevel`), and `PMConfirmDialogProps.confirmWith`, `confirmWithLabel` and `confirmWithError` are new, with their defaults in `PMStrings` (`confirmWithLabel(phrase:)` and `confirmWithError`). On iOS a ConfirmDialog with `confirmWith` is a content-high sheet that holds the field, because the confirmation action sheet holds none. On iOS a text field inside a FormField keeps focus when its error appears or goes while the person types.

- 1b900d8: Input takes `exact`, for text that must be typed letter for letter, and ConfirmDialog's phrase field sets it.

  **`exact` on Input** means the text is typed exactly: nothing corrects it, capitalises it or checks its spelling. The inner `<input>` takes `autocorrect="off"`, `autocapitalize="off"` and `spellcheck="false"`, so a phone browser's keyboard leaves a phrase such as `acme-billing` as the person types it. Set it on a field whose text must match what the person meant to type, such as a slug or a name they repeat back; a field without it behaves as before. Vue, Svelte, Solid and Angular take the same prop.

  **ConfirmDialog's typed confirmation** sets `exact` on its phrase field in every web framework. A phone browser no longer corrects the phrase while the person types it, which left the confirm disabled with "The text does not match" under a phrase they typed correctly.

  **On iOS and Android**, `PMInputProps` gains `exact`. A SwiftUI Input with it is neither capitalised nor corrected, and a Compose Input asks the keyboard for no correction, as each platform already treats an email or URL field. ConfirmDialog's phrase field sets it.

- 1b900d8: CursorPagination has a "Load more" form, and RelativeTime writes the moment itself as well as the distance from now.

  **`CursorPagination mode="append"` is "Load more".** It draws one `outline` Button, "Load more", that calls `onNext`; the app adds the window it fetches below the ones on screen. While `pending` the Button is busy and ignores presses. When `hasNext` turns false after a press, the list has run out: the Button leaves and an end line says "No more to load" through a status region, so a screen reader hears it. The form remembers that it asked for a window and does not read `hasPrevious`, so pass your query library's flags as they are. A list with no next window that the reader has not paged renders nothing, as one window does in the default form. `position` is what is on screen in your words ("50 shown"). In a DataTable, set the pager's `pending` while the next rows load, not the table's `loading`, which replaces the rows with skeletons. A hand-built "Load more" can be replaced with `<CursorPagination mode="append" hasPrevious={false} hasNext={hasNextPage} pending={isFetchingNextPage} onNext={fetchNextPage} />`; a list started again under a new query takes a new pager (`key={query}`).

  In React the props are a union on `mode`: the default form still requires `onPrevious`, so every pager written before stays valid, and the append form takes none, because it has no previous direction. In Vue, Svelte, Solid and Angular `onPrevious` is an optional event, and the default form warns in development when `hasPrevious` has no `onPrevious`.

  `CursorPaginationMessages` takes two optional words, `more` and `end`; an app that localizes the pager passes them, and the append form warns in development when `messages` leaves them out. Every web framework's CursorPagination takes `mode`, and so do `PMCursorPagination` on iOS and Android.

  The Svelte foundation's `Held` takes `presses`, and the Angular foundation exports `pressOnce`: a states fixture entry presses a control once it is in the document, as the append form's "the list ran out" entry presses "Load more". An app has no use for either.

  `@polymorph/recipes`' `structure/cursor-pagination.module.css` lays `.pagination` out as a column (`display: inline-flex; flex-direction: column`), so the append form's end line takes a line of its own under the row; the default form's one row looks as it did. It adds `.end`, the end line, in the position's type and colour. A vendored CursorPagination takes both with the recipe.

  **`RelativeTime mode="absolute"` and `mode="both"`.** `absolute` writes the moment with `Intl.DateTimeFormat` in the member's `locale`: the medium date and the short time ("Aug 4, 2026, 2:05 PM"), or with `format="long"` the long date. An instant is written in the time zone of whatever renders the member: the reader's in a browser, the server's under server rendering or in a React server component. An app that renders on a server and must show the reader's zone renders the absolute forms in the browser, from a client component once it has mounted. A calendar date (`2026-08-04`) is the date alone, the same day everywhere. `both` writes the moment and the distance joined by `messages.both`, by default the moment, then the distance in parentheses ("Aug 4, 2026, 2:05 PM (2h ago)"); a localized app passes `messages={{ both: (moment, distance) => … }}` from its catalog, so its locale orders and punctuates the two. The default stays `relative`. Replace a hand-formatted timestamp in JSX with the member, which also writes the moment in `dateTime`.

  **`relativeTimePhrase` takes `mode` and `messages`.** `relativeTimePhrase(value, { locale, numeric, format, mode, messages })` from `@polymorph/engine`, which every foundation re-exports, returns the text RelativeTime renders for those props, or `null` for a value that is not a moment. Use it where a member takes app-formatted text, such as Timeline's `time`, so the words match RelativeTime's ([design/components/relative-time.md](../design/components/relative-time.md)).

  **On iOS and Android**, `PMRelativeTimeProps` gains `messages`, the same `both`. **On Android**, `PMRelativeTimeWords` gains `absolute(moment, long, locale)`, which an app implements to write the moment with the platform's formatter in the reader's zone. Without it the member writes Material 3's medium date and an instant's 24-hour time in UTC, said as UTC, because the member module reaches no time zone. The words are `PMStrings.relativeUtc`, a default only Android's `PMStrings` declares, so iOS's string catalog does not carry it; an app translates it through `LocalPMStrings`.

- 1b900d8: Link, `AppShell.NavItem`, Breadcrumbs and a linked Card take an optional `onNavigate(href)`, the seam for an app's own router (`design/components/link.md` §Routing).

  **To route without reloading the page**, pass your router's navigate function as `onNavigate` to every Link, NavItem, Breadcrumbs and Card with an `href`. A click that would navigate the current tab calls `onNavigate(href)` with the `href` you wrote. The member has already stopped the browser's navigation, so the handler only routes: `(href) => void navigate({ href })` with TanStack Router, `(href) => void navigate(href)` with React Router. A click with Meta, Control, Shift or Alt held, a click with another button, and a click on an `external` Link stay the browser's, so a reader can still open a link in a new tab. Breadcrumbs also routes a crumb chosen from its overflow menu, and a Card routes the click on its stretched link. Without `onNavigate`, every link behaves as before. `docs/consuming.md` has the TanStack Router and React Router forms, and `design/archetypes/app-shell.md` has the root route that renders AppShell once, with a page archetype for each route.

  **Link is now a client module.** Link and the routing helper it shares with NavItem, Breadcrumbs and Card are marked `'use client'`, because the seam is a click handler. Under React Server Components, a server component that renders a Link ships Link's code to the browser, where it shipped none before.

  **NavItem's `onSelect` is unchanged.** It still fires on every click of a row, including a click that opens a new tab. An app that routes through `onSelect` on rows with an `href` moves that call to `onNavigate`, which leaves those clicks to the browser.

  **AppShell closes its small-viewport drawer when `transitionKey` changes**, as the iOS and Android shells already do. Under a client-side router the shell stays mounted, so the drawer stayed open over the page the reader had chosen from it.

  **In Vue, Svelte, Solid and Angular** the prop is the framework's event, each with the `href`: `@navigate` in Vue, `onNavigate` in Svelte and Solid, and `(navigate)` in Angular.

  **On iOS and Android**, `PMLinkProps` and `PMBreadcrumbsProps` gain `onNavigate`. When it is set, a press on a Link that is not `external`, or on a crumb with an `href`, calls it in place of the environment's `openURL` or `LocalUriHandler`. `PMCardProps` gains `onNavigate` too, and a press on a linked native Card calls it in the same place.

- 1b900d8: A toast tells its owner when it leaves, its tone sets how long it stays, a success notice leaves on its own, and the registry publishes Toast as each framework ships it.

  **`onDismiss` on a toast.** `toast()` takes `onDismiss`, called once when the toast leaves for a reason other than its owner's: the reader dismissed it, its time ran out, `toast.dismiss` closed it, or newer toasts evicted it. Removing a toast and updating it in place do not call it. Every framework's `toast()` takes it, because every foundation's store is the engine's. A declared Toast in Vue, Svelte, Solid and Angular emits `dismiss` (`@dismiss`, `onDismiss`, `(dismiss)`), and `PMToast` on iOS and Android calls `onDismiss` when its card leaves by its close button, a swipe, the escape gesture or its time.

  **A toast takes its lifetime from its tone.** The store every web framework shares gives a toast whose call sets neither `retained` nor `durationMs` its tone's lifetime. A `danger` or `warning` toast is retained and pinned: it stays until it is dismissed or removed, and newer toasts do not evict it. A `success`, `info` or `neutral` toast leaves after `TOAST_DEFAULT_DURATION_MS` and may be evicted, as every toast did before. So `toast.danger(…)`, `toast.warning(…)` and `toast.promise`'s error face now stay until the reader dismisses them; a call that wants the old five seconds passes `durationMs: TOAST_DEFAULT_DURATION_MS`. A call that sets either option keeps what it sets. `ToastNotice` and a declared `Toast` in Vue, Svelte, Solid and Angular follow the same rule, so a `danger` or `warning` notice stays until it is resolved or dismissed, as every notice did before, and a `success`, `info` or `neutral` notice now leaves on its own. A screen that kept a success notice on screen with a button whose only job was to dismiss it can delete the button. `ToastNotice` also takes `onDismiss`, so a screen can clear the state that renders a notice once the notice has left; unmounting a notice does not call it. A notice that must stay whatever its tone takes `dismissible={false}`. `PMToast` on iOS and Android takes the same lifetime from its tone when its props set neither `retained` nor `durationMs`: a native danger or warning toast now stays until it is dismissed, and one that should leave passes `durationMs: 5000`.

  **A notice with nowhere to show warns in development.** A `ToastNotice` rendered while no `ToastHost` or `Toaster` is mounted logs a warning naming it, because nothing draws its toast. A declared `Toast` in Vue, Svelte, Solid and Angular logs the same warning when no `Toast.Viewport` is in the document once it has mounted. The usual cause is an error boundary whose fallback renders outside the viewport: mount `ToastHost`, or `Toast.Viewport`, outside the boundary.

  **The registry and the system card publish Toast's real API and every compound part.** Each component carries `parts`, every compound part its export carries with the part's props (`AppShell.NavItem`, `AppShell.NavGroup`, `AppShell.UserCard`, `Dashboard.Panel`, `Avatar.Group`, `Table.Head`, `Table.Body` and `Table.Foot` among them, which the card left out), and `exports`, the member's other callable exports (Toast's `toast`, `ToastHost`, `ToastNotice` and `ToastViewportTarget`; Tooltip's `TooltipProvider`; FormField's `ToastFormField`). The React card lists Toast as `toast()` with its options and shorthands beside the components a screen mounts, rather than as a `<Toast>` with props; another framework's card lists the parts its shell ships, `Toast.Viewport` included. Toast's purpose reads "Notifications that report the outcome of an action" in place of "The toast viewport". A card rendered for `ios` or `android` lists a member's props and the parts its native contract carries, and none of React's exports: SwiftUI's and Compose's Toast is a member whose props are the options.

  **The spec-staleness law reads every compound part.** `@polymorph/rules/spec-api` compares each part a member's export carries with its spec, reading the parts with `compoundParts`, the function the registry's `parts` come from, in place of the hand list `COMPOUND_PARTS`, which is removed. A part's props table goes in `## API` under a `Component` column, or under a heading with the part's name (`## AppShell.NavItem`).

- Updated dependencies [1b900d8]
- Updated dependencies [1b900d8]
- Updated dependencies [1b900d8]
  - @polymorph/engine@1.0.5
  - @polymorph/angular@1.0.2

## 1.0.1

### Patch Changes

- 700e130: Two new packages ship the vocabulary for Angular 22: `@polymorph/angular`, the foundation (the engine re-exported, a Zag adapter driven by signals with the `Spread` directive that writes a machine's props onto an element, the member context with its `listen` and `afterRender`, the slot directives, the icon gateway, `Icon`, the presence and control-ref primitives, the toast store and the page-transition convention), and `@polymorph/angular-ui`, the members, published as `@metamorph-labs/polymorph-angular` and `@metamorph-labs/polymorph-angular-ui`. Each member is a standalone component generated from its framework-neutral description: its value props are signal inputs of the React prop's name (`aria-label` included), each `onFoo` prop is the output `foo`, `children` is its default content and each node prop a named slot (`slot="footer"`), each render prop takes an `ng-template`, and it renders the same DOM with the same recipes from `@polymorph/recipes`. A member's host element (`<pm-button>`) draws no box and carries no attribute but its `display: contents` style; a compound part that is a list's item or a table's section, row or cell is that element (`<tr pmTableRow>`). `design/frameworks/angular.json` says which members the Angular vocabulary ships: every member but ImageEditor, whose entry says why.

  Install them under their workspace names as npm aliases, beside `@angular/core@^22` (`docs/consuming.md`). Both ship partially compiled code, one flat module per entry point as the Angular package format does (`dist/fesm2022/`), which the application's Angular CLI, or Analog's Vite plugin, links to the Angular it runs. Each member's recipe is compiled into its component's styles, which Angular adds to the page when the member first renders; the base layer ships as `@polymorph/angular-ui/base.css`, which the application lists among its global styles.

  Every type alias `@polymorph/react-ui` exports (`BadgeTone`, `TooltipSide`, `ControlSize`, `IconRole` and the rest) is exported by the vocabulary's entry under the same name, and the foundation's types with it, so a screen the emitter writes for this framework compiles against the vocabulary alone; the few React types the vocabulary cannot carry are listed with their reasons as `UNEXPORTED_TYPES` in `packages/shells/src/common.ts`.

- Updated dependencies [700e130]
- Updated dependencies [700e130]
  - @polymorph/angular@1.0.1
  - @polymorph/engine@1.0.4
