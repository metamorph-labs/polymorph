# @polymorph/react

## 1.0.15

### Patch Changes

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

- Updated dependencies [d84171d]
- Updated dependencies [508275a]
- Updated dependencies [73837b5]
- Updated dependencies [709d7b3]
  - @polymorph/engine@1.0.13

## 1.0.12

### Patch Changes

- 6d714a7: `clockTime(seconds, locale?)`, `spokenDuration(seconds, locale?)` and
  `pauseOtherPlayers(audio)` are new exports of the engine, and of every foundation, which
  re-exports the engine.

  `clockTime` writes a length as a media clock: `65` is `1:05`, and from an hour on the hours come
  first, `3725` is `1:02:05`. The digits are the locale's numerals. `spokenDuration` writes the
  same length in the locale's words, from `Intl`'s unit names joined as a list: `65` is
  `1 minute, 5 seconds` in English. Both drop the fraction of a second, and both read a value that
  is not a finite length above zero as zero.

  `pauseOtherPlayers` pauses every other AudioPlayer's recording in the document, in whatever
  framework it is drawn. Media the application plays itself is left alone. AudioPlayer calls it
  when it starts, so one recording plays at a time.

- 51e8566: `diffLines(before, after)` and `diffRuns(rows, context)` are new exports of the engine, and of
  every foundation, which re-exports the engine.

  `diffLines` compares two texts line by line and returns one row for each line:
  `{ kind: 'same' | 'added' | 'removed', text, beforeLine?, afterLine? }`. A missing, `null` or
  empty text has no lines. `\r\n` ends a line as `\n` does, and a final line ending adds no empty
  line. The rows are a longest common subsequence of the lines, so the same texts always give the
  same rows. Within one change, the removed lines come before the added ones. The comparison
  between the lines the two texts start and end with is bounded: past `DIFF_LINES_LIMIT`
  (1,000,000) old lines × new lines, every old line there is removed and every new line added.

  `diffRuns` groups those rows for a reader. It keeps `context` unchanged lines beside each change
  (3 by default) and returns the rest as collapsed runs, each `{ key, collapsed, rows }`. A run
  collapses only when it hides two lines or more. `Infinity` collapses nothing.

  `Diff` draws both. An application that needs the rows for something else, such as a count of
  changed lines, calls them directly. The types are `DiffRow`, `DiffRowKind` and `DiffRun`.

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

- d9713d4: `monthDraft(value)`, `monthFieldValue(draft)`, `monthOutOfBounds(value, { min, max })` and
  `segmentValueText(segment, locale, empty)` are new exports of the engine, and of every
  foundation, which re-exports the engine. The first three read and write a month field's
  `YYYY-MM` text over the segmented field's draft, and compare it with its bounds. The last is what
  a segment says as its value: its text, a month's number and name (`7 – July`), or the caller's
  word for an empty segment.
- 49ab024: The React packages render on a server and run in Next.js's App Router, built by Turbopack or by webpack. `docs/consuming.md` has a section for a Next.js application, and `pnpm gate:next` builds one from the published builds as the last step of `pnpm gate`.

  - **Each module is built once.** `@polymorph/react-ui` no longer ships a second copy of its modules without their stylesheet imports under `dist/node/`, and its `exports` have no `node` condition. A built module imports its stylesheet through the package's `imports` map (`#stylesheet/controls/button.css`), which hands a bundler the stylesheet and Node an empty module. Before, Next.js resolved a client component by the `node` condition while it built its server and carried that copy to the browser. A page whose members only server components imported then shipped no member CSS, and a page could hold two copies of a member and of its context. Vitest, jsdom and a plain server render load the package as they did, with no configuration.
  - **An entry point has no side effect.** Each member's stylesheet module imports the base layer, and `Icon` imports its own stylesheet, so no entry point imports one and a bundler that follows a name to its module loads nothing else. No application needs to import `@polymorph/react/style.css`. The entry stays, and an application that imports it loads the same file once.
  - **Every state of every member renders on a server.** The presence components behind the overlays read the theme from the document during render, and `MultiSelect` read its list's elements. The presence components now render without motion on a server and for the hydration of that markup, and read the theme once mounted, and `MultiSelect` reads its list in an effect. `@polymorph/engine/motion` exports `stillMotionEnvironment`, the environment they render with, and `readMotionEnvironment` returns it where there is no document.
  - **A server component reads a compound member's parts.** `Tabs.Content`, `Table.Row` and Table's other parts, `Avatar.Group`, `SettingsRow.Group` and AppShell's parts were `undefined` in a server component, because the member attached them in a client module. Each of these members is now two modules: the member, which a server component can read, and its parts (`overlays/tabs-parts.tsx`), which carry `'use client'`. A vendored install receives the parts modules on `polymorph update`.
  - **A member reads an element a server component passed it.** A FormField's control, a Dialog's `trigger` and a SettingsRow's `control` arrive in a client member as a reference React may still be loading. Reading one threw in Next.js's development server, and could in production while a client module loaded. `@polymorph/react` exports `useSupplied`, which returns the element once it has loaded. A member of your own that reads or clones an element it is passed calls it first.

  A Next.js application that builds with webpack lists the vocabulary in `experimental.optimizePackageImports`. Without it the pages render correctly and each loads the whole vocabulary.

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

- 9f8c97f: `rating` is a new icon role: one mark of a score. It draws lucide's `star`, and on Apple and
  Android platforms the `star` symbol. It shares the glyph with `favorite`, as `close` and
  `clear` share theirs: marking a thing to keep is not scoring it, and either can change glyph
  without the other. `IconRole` includes it and every foundation's `Icon` draws it. The icon
  rule no longer rewrites an import of the star glyph, because two roles draw it: it reports the
  import and names both. Rating draws it.
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

- 96daa65: `record` is a new icon role: start a recording of the reader's voice. It draws lucide's `mic`,
  and on Apple and Android platforms the `mic` symbol. `IconRole` includes it, every foundation's
  `Icon` draws it, and the icon rule's fix names it for an import of the microphone glyph.
  RecordButton draws it at rest.
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

- b88e331: The theme is readable as data. `readThemeValues(element?)` in `@polymorph/engine` returns what
  an element resolves a pairing's tokens to, as the values a JavaScript API takes: a colour role
  as `#rrggbb` (or `rgba()` when translucent) and as channels, a space step, a radius and a control
  height in pixels, a type step, a font slot, a duration in milliseconds, the colour mode the
  element is drawn in and the document's reading direction. A reading is a snapshot: it keeps each
  value, the mode and the direction as it first read them. An element that is not in the document
  reads as the document root.

  `watchTheme(listener)` calls back when the system, palette, mode, density, motion temperament,
  contrast preference or direction changes, when an element enters or leaves an inverse tone, and
  when a pairing's sheet is installed, installed again or removed. A tone or a mode that a member
  writes for its own variant does not call back. `themeVersion()` grows with each call back and
  when `watchTheme` takes its first listener, so a store that keeps a reading knows when to take
  another. `UNTHEMED_VALUES` is the reading a server render gets: every colour the empty string and
  every number 0.

  Each foundation wraps these as `useThemeValues`: a hook in React, a `ShallowRef` in Vue, a
  `current` getter in Svelte, an accessor in Solid and a signal in Angular. It is for another
  library's component that cannot be styled through CSS, such as a map, a canvas grid or a code
  editor, inside a `<ThirdParty>` boundary (`docs/rules.md`). A value is read where the framework
  renders or in an effect. In React, Vue and Solid the render that hydrates a server's markup gets
  the server's empty values, and the component gets the document's once it has hydrated. React's
  hook takes a ref, reads the ref's element after each commit of the component, and renders the
  component again when the element is another one. Svelte's `current` is a new reading each time it
  is read outside an effect. Outside a component, Vue's follows the theme in an effect scope and
  Solid's under a root.

  `@polymorph/engine/runtime` also exports `cssVarName` and `MORE_CONTRAST_QUERY`. Nothing is
  renamed or removed.

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

- 4902f58: The colour mode is readable and followable. `readMode()` in `@polymorph/engine/runtime` (and the
  engine's root) returns `{ preference, mode }`: the preference, `light`, `dark` or `system`, and
  the mode it resolves to. It returns the same object until one of the two changes.
  `watchMode(listener)` calls back after each `setMode`, from any caller, and each time the
  operating system's mode changes while `system` is applied. `SERVER_MODE` is the reading a server
  render gets, `system` and `light`, because a server stores no preference.

  Each foundation wraps these as `useMode`: a hook in React, a `ShallowRef` in Vue, a `current`
  getter in Svelte, an accessor in Solid and a signal in Angular. An application's Menu or command
  palette reads the preference from it to mark the current choice, and sets the mode with
  `setMode`, which every foundation already re-exports. In React, Vue and Solid the render that
  hydrates a server's markup gets `SERVER_MODE`, and the component reads the document once it has
  hydrated.

  `getModePreference()` now returns the preference the last `setMode` applied to the document, and
  the stored one before any call. It used to read storage each time, so it answered `system` where
  storage refuses writes, and another tab's choice where one had stored it, while the document wore
  something else. `teardownTheme()` also forgets the applied preference. Nothing is renamed or
  removed.

- Updated dependencies [6d714a7]
- Updated dependencies [28aeda0]
- Updated dependencies [f918ed3]
- Updated dependencies [b209e98]
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

## 1.0.10

### Patch Changes

- cb0d0a3: Members follow a right-to-left document. With `dir="rtl"` on `<html>` or `<body>`, every member built on Radix or Zag now takes that direction: its root says `dir="rtl"`, and the arrow keys, a Slider's track, a submenu's side and a Tabs strip turn with the page. Before, those members wrote `dir="ltr"` on their root and ran left to right inside a right-to-left page. A member already on the page follows a change to the attribute. There is no new prop, and a left-to-right page renders as it did.

  Each foundation exports `useDirection`, which returns the document's direction and keeps it current, and `@polymorph/engine` exports `readDirection` and `watchDirection` beneath it.

  The page-transition indicator's right-to-left rule now reads `dir` instead of `:dir()`, which the published build's minifier had rewritten as a list of languages.

- Updated dependencies [7019d6f]
- Updated dependencies [cb0d0a3]
  - @polymorph/engine@1.0.10

## 1.0.9

### Patch Changes

- @polymorph/engine@1.0.9

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
- Updated dependencies [e1c80b3]
  - @polymorph/engine@1.0.8

## 1.0.3

### Patch Changes

- Updated dependencies [22f607b]
  - @polymorph/engine@1.0.6

## 1.0.2

### Patch Changes

- Updated dependencies [1b900d8]
- Updated dependencies [1b900d8]
- Updated dependencies [1b900d8]
  - @polymorph/engine@1.0.5

## 1.0.1

### Patch Changes

- 700e130: The React half of `@polymorph/core` is `@polymorph/react`, published as `@metamorph-labs/polymorph-react`. It re-exports `@polymorph/engine` whole, its `qr`, `charts` and `markdown` subpaths included, and adds what needs React: `Icon`, `BrandMark`, `MotionPresence`, `MotionSurface` and `MotionIndicator` (under `./motion`), `useControlRef`, `useDevWarning`, `assertGoverned` and the `ComponentStates` type. It also adds `useDevWarnings`, which logs the warnings an engine model reports (a chart's `warnings`), once each while it stays.

  To upgrade, install `@polymorph/react` and `@polymorph/engine` in place of `@polymorph/core`, then replace `@polymorph/core` with `@polymorph/react` in imports, `@polymorph/core/motion` with `@polymorph/react/motion`, and `@polymorph/core/style.css` with `@polymorph/react/style.css`. Vendored members need the same edit.

- Updated dependencies [700e130]
  - @polymorph/engine@1.0.4
