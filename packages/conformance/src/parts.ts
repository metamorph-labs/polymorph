import type { WindowSize } from './run'

/**
 * Where each part a contract names is, per member (`docs/conformance.md`).
 *
 * A contract says `panel`, `trigger` or `option`, the names the spec's anatomy
 * uses. The runner finds them with these selectors. They read what a shell
 * renders by contract rather than by substrate: element names, ARIA roles and
 * attributes, `data-member`, the `data-*` attributes the recipe keys on, and
 * the hooks a member renders for its parts (Dialog's `data-dialog-part`, a date
 * field's `data-segment`). So another framework's shell is located by the same
 * table. A selector that starts with `:scope` searches only the element the
 * entry rendered into; any other searches the document, because overlays
 * portal out of it.
 *
 * `root` needs no entry: it is the element carrying the member's
 * `data-member`. `trigger` is the control that opens a popup, and `panel` is
 * the popup; `focus` and `dismiss` statements, and `opens` and `closes` keys,
 * read those two. A part that a `role` statement names is not located by a
 * role, and a part that an `attr` statement names is not located by that
 * attribute, because either would make the statement true by construction
 * (`conformance.test.tsx` enforces both). Such a part is located by a hook its
 * member renders for it (`data-carousel-part="dot"`). An `input` selector
 * skips `type="hidden"`, which carries a form value and is not a control.
 */
export const PARTS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  /* overlays ----------------------------------------------------------------- */
  Dialog: {
    trigger: ':scope button',
    panel: '[data-member="dialog"]',
    body: '[data-member="dialog"] [data-dialog-part="body"]',
    // The footer's last Button, found as ConfirmDialog's confirm is: an Angular Button is a
    // `<button>` inside its `pm-button` host, and a Button a page writes in the footer is one
    // inside its `poly-button` element, so the host's place in the footer is read there.
    primary:
      '[data-member="dialog"] [data-dialog-part="footer"] > button:last-child, [data-member="dialog"] [data-dialog-part="footer"] > pm-button:last-child > button, [data-member="dialog"] [data-dialog-part="footer"] > poly-button:last-child > button',
    // The footer's first Button, the dismiss a panel starts on when its primary is destructive.
    dismiss:
      '[data-member="dialog"] [data-dialog-part="footer"] > button:first-child, [data-member="dialog"] [data-dialog-part="footer"] > pm-button:first-child > button, [data-member="dialog"] [data-dialog-part="footer"] > poly-button:first-child > button',
    close: '[data-member="dialog"] [data-dialog-part="close"] button',
  },
  ConfirmDialog: {
    trigger: ':scope button',
    panel: '[data-member="confirm-dialog"]',
    // The footer's first and last Button. An Angular Button is a `<button>` inside its
    // `pm-button` host, where every `<button>` is a first and a last child, so the host's
    // place in the footer is read there.
    cancel:
      '[data-member="confirm-dialog"] [data-dialog-part="footer"] > button:first-child, [data-member="confirm-dialog"] [data-dialog-part="footer"] > pm-button:first-child > button',
    confirm:
      '[data-member="confirm-dialog"] [data-dialog-part="footer"] > button:last-child, [data-member="confirm-dialog"] [data-dialog-part="footer"] > pm-button:last-child > button',
    field: '[data-member="confirm-dialog"] [data-dialog-part="body"] input',
  },
  Drawer: {
    trigger: ':scope button',
    panel: '[data-member="drawer"]',
  },
  Lightbox: {
    trigger: ':scope button',
    panel: '[data-member="lightbox"]',
    close: '[data-member="lightbox"] [data-dialog-part="close"] button',
  },
  Command: {
    trigger: ':scope button',
    panel: '[data-member="command"]',
    input: '[data-member="command"] input:not([type="hidden"])',
    list: '[data-member="command"] ul',
  },
  Popover: {
    trigger: ':scope button',
    panel: '[data-member="popover"]',
  },
  Tour: {
    panel: '[data-member="tour"]',
    // The actions row's first and last Button; an Angular Button is a `<button>` inside its
    // `pm-button` host, so the host's place in the row is read there.
    previous:
      '[data-member="tour"] [data-tour-part="actions"] > button:first-child, [data-member="tour"] [data-tour-part="actions"] > pm-button:first-child > button',
    next: '[data-member="tour"] [data-tour-part="actions"] > button:last-child, [data-member="tour"] [data-tour-part="actions"] > pm-button:last-child > button',
    close: '[data-member="tour"] [data-tour-part="close"] button',
  },
  Menu: {
    trigger: ':scope button',
    panel: '[data-member="menu"]',
    item: '[data-member="menu"] [role^="menuitem"]',
    checkbox: '[data-member="menu"] [data-menu-part="checkbox"]',
  },
  ContextMenu: {
    panel: '[data-member="menu"]',
    item: '[data-member="menu"] [role^="menuitem"]',
    // The member's own panel, which no entry opens: `panel` is the paired Menu's, open beside it.
    content: '[data-member="context-menu"][role="menu"]',
  },
  Menubar: {
    // Every title is a trigger: a statement opens the first enabled one, and focus returns there.
    trigger: ':scope [data-menubar-part="title"]',
    title: ':scope [data-menubar-part="title"]',
    panel: '[data-menubar-part="panel"]',
    item: '[data-menubar-part="panel"] [role^="menuitem"]',
  },
  Tabs: {
    list: '[data-member="tabs"] [data-tabs-part="list"]',
    tab: '[data-member="tabs"] [data-tabs-part="tab"]',
    tabpanel: '[data-member="tabs"] [data-tabs-part="tabpanel"][data-state="active"]',
  },
  Tooltip: {
    trigger: ':scope button',
    panel: '[data-member="tooltip"]',
    bubble: '[data-member="tooltip"]',
  },
  HoverCard: {
    trigger: ':scope a',
    panel: '[data-member="hover-card"]',
  },
  Toast: {
    // Radix renders the labelled region around the list and passes no prop to
    // it, so the region is the element that holds the list.
    viewport: ':scope :has(> [data-toast-part="list"])',
  },

  /* controls ----------------------------------------------------------------- */
  Button: {},
  CopyButton: {},
  ProviderButton: {},
  AvatarButton: {},
  SplitButton: {
    primary: ':scope [data-member="split-button"] > button:first-child',
    trigger: ':scope [data-member="split-button"] > button:last-child',
    panel: '[data-member="split-button"][role="menu"]',
    item: '[data-member="split-button"][role="menu"] [role^="menuitem"]',
  },
  Input: {
    field: ':scope [data-member="input"] input:not([type="hidden"])',
    clear: ':scope [data-member="input"] button',
  },
  NumberInput: {
    field: ':scope [data-member="number-input"] input:not([type="hidden"])',
    stepper: ':scope [data-member="number-input"] button',
  },
  Select: {
    trigger: ':scope [data-member="select"]',
    panel: '[data-member="select"]:not(button)',
    option: '[data-member="select"]:not(button) [data-state]',
  },
  Combobox: {
    trigger: ':scope [data-member="combobox"] input:not([type="hidden"])',
    panel: '[data-member="combobox"]:not(:has(input))',
  },
  // The panel is the element with the member's `data-member` that is not the trigger, and the
  // tree is the Tree member in it.
  TreeSelect: {
    trigger: ':scope [data-member="tree-select"]',
    panel: '[data-member="tree-select"]:not(button)',
    tree: '[data-member="tree-select"]:not(button) [data-member="tree"]',
    item: '[data-member="tree-select"]:not(button) [data-tree-item]',
    row: '[data-member="tree-select"]:not(button) [data-tree-part="row"]',
    selected: '[data-member="tree-select"]:not(button) [data-selected]',
  },
  MultiSelect: {
    trigger: ':scope [data-member="multi-select"] input:not([type="hidden"])',
    panel: '[data-member="multi-select"]:not(:has(input))',
    list: '[data-member="multi-select"]:not(:has(input)) ul',
  },
  SearchInput: {
    field: ':scope [data-member="search-input"] input:not([type="hidden"])',
  },
  PasswordInput: {
    toggle: ':scope [data-member="password-input"] button',
    // The field a secret state's probe is typed into.
    field: ':scope [data-member="password-input"] input:not([type="hidden"])',
  },
  OTPInput: {
    field: ':scope [data-member="otp-input"] input:not([type="hidden"])',
  },
  Textarea: {
    field: ':scope textarea',
  },
  RichTextInput: {
    surface: ':scope [data-member="rich-text-input"] [data-rich-text-input-part="surface"]',
    // The suggestion list opens from the text, which keeps focus.
    trigger: ':scope [data-member="rich-text-input"] [data-rich-text-input-part="surface"]',
    panel: ':scope [data-member="rich-text-input"] [data-rich-text-input-part="suggestions"]',
    list: ':scope [data-member="rich-text-input"] [data-rich-text-input-part="suggestions"] ul',
    toolbar: ':scope [data-member="rich-text-input"] [data-rich-text-input-part="toolbar"]',
    // A control of the toolbar: a Button, or the trigger a Menu or a Popover draws as one.
    control: ':scope [data-member="rich-text-input"] [data-rich-text-input-part="toolbar"] button',
  },
  RichTextContent: {
    // A highlight's first fragment, which is its tab stop in the annotated entry; found by its
    // element and id, not by the role and tab index the contract states.
    highlight: ':scope [data-member="rich-text-content"] mark[data-annotation-id]',
    current: ':scope [data-member="rich-text-content"] mark[data-annotation-id][data-active]',
  },
  TagInput: {
    field: ':scope [data-member="tag-input"] input:not([type="hidden"])',
  },
  FileUpload: {
    dropzone: ':scope [data-member="file-upload"] > button',
  },
  Checkbox: {
    box: ':scope button',
  },
  RadioGroup: {
    radio: ':scope [data-member="radio-group"] button',
  },
  CheckboxGroup: {
    box: ':scope [data-member="checkbox-group"] button',
  },
  SegmentedControl: {
    segment: ':scope [data-member="segmented-control"] > button',
  },
  ModeSwitch: {
    segment: ':scope [data-member="mode-switch"] > button',
  },
  Rating: {
    mark: ':scope [data-member="rating"] > button',
  },
  ChoiceCard: {
    card: ':scope [data-member="choice-card"] button',
  },
  Switch: {
    control: ':scope button',
  },
  Slider: {
    thumb: ':scope [data-member="slider"] [tabindex="0"]',
  },
  DatePicker: {
    field: ':scope [data-member="date-picker"]',
    segment: ':scope [data-member="date-picker"] [data-segment]',
    trigger: ':scope [data-member="date-picker"] [aria-haspopup]',
    panel: '[data-member="date-picker"][role="dialog"]',
    day: '[data-member="date-picker"][role="dialog"] [data-calendar-part="day"]',
  },
  Calendar: {
    grid: ':scope [data-member="calendar"] table',
    day: ':scope [data-member="calendar"] [data-calendar-part="day"]',
  },
  DateRangePicker: {
    field: ':scope [data-member="date-range-picker"]',
    segment: ':scope [data-member="date-range-picker"] [data-segment]',
    trigger: ':scope [data-member="date-range-picker"] [aria-haspopup]',
    panel: '[data-member="date-range-picker"][role="dialog"]',
    day: '[data-member="date-range-picker"][role="dialog"] [data-calendar-part="day"]',
  },
  TimeInput: {
    field: ':scope [data-member="time-input"]',
    segment: ':scope [data-member="time-input"] [data-segment]',
  },
  DurationInput: {
    field: ':scope [data-member="duration-input"]',
    segment: ':scope [data-member="duration-input"] [data-segment]',
  },
  MonthInput: {
    field: ':scope [data-member="month-input"]',
    segment: ':scope [data-member="month-input"] [data-segment]',
  },
  ColorInput: {
    trigger: ':scope [data-member="color-input"] [aria-haspopup]',
    panel: '[data-member="popover"]',
    plane: '[data-member="popover"] input[type="range"]',
  },
  PhoneInput: {
    // The country is the list's trigger, so the runner reads it under both names.
    country:
      ':scope [data-member="phone-input"] [data-member="combobox"] input:not([type="hidden"])',
    trigger:
      ':scope [data-member="phone-input"] [data-member="combobox"] input:not([type="hidden"])',
    number: ':scope [data-member="phone-input"] input[type="tel"]',
    panel: '[data-member="combobox"]:not(:has(input))',
  },
  FormField: {
    control: ':scope [data-member="form-field"] input:not([type="hidden"])',
  },
  InlineEdit: {
    // The edit control is the Button that is a child of the root, which only the reading form
    // has. An Angular Button is a `<button>` inside its `pm-button` host.
    trigger:
      ':scope [data-member="inline-edit"] > [data-member="button"], :scope [data-member="inline-edit"] > pm-button > [data-member="button"]',
    panel: ':scope [data-member="inline-edit"] [data-inline-edit-part="panel"]',
    field: ':scope [data-member="inline-edit"] input:not([type="hidden"])',
  },
  ImageEditor: {
    stage: ':scope [data-member="image-editor"] [data-image-editor-part="stage"]',
    zoom: ':scope [data-member="image-editor"] [data-member="slider"] [tabindex="0"]',
  },
  Link: {},

  /* structure, ai, layout ------------------------------------------------------ */
  Alert: {
    dismiss: ':scope [data-member="alert"] [data-member="button"][data-icon-only]',
  },
  Banner: {
    dismiss: ':scope [data-member="banner"] [data-member="button"][data-icon-only]',
  },
  Collapsible: {
    trigger: ':scope [data-member="collapsible"] > button',
  },
  ErrorSummary: {
    list: ':scope [data-member="error-summary"] ul',
    entry: ':scope [data-member="error-summary"] a',
  },
  JsonTree: {
    toggle: ':scope [data-member="json-tree"] button',
  },
  Diff: {
    toggle: ':scope [data-member="diff"] button',
  },
  Highlight: {
    mark: ':scope [data-member="highlight"] mark',
  },
  Spinner: {},
  Meter: {
    track: ':scope [data-member="meter"] > :first-child',
  },
  Countdown: {
    timer: ':scope [data-member="countdown"] > time',
  },
  Image: {
    image: ':scope [data-member="image"] img',
    fallback: ':scope [data-member="image"] [data-image-part="fallback"]',
  },
  ChatThread: {
    viewport: ':scope [data-member="chat-thread"] [data-chat-thread-part="viewport"]',
  },
  LogView: {
    viewport: ':scope [data-member="log-view"] [data-log-view-part="viewport"]',
  },
  Accordion: {
    trigger: ':scope [data-member="accordion"] [data-accordion-part="trigger"]',
    region: ':scope [data-member="accordion"] [data-accordion-part="region"][data-state="open"]',
  },
  Carousel: {
    slide: ':scope [data-member="carousel"] > :first-child > *',
    viewport: ':scope [data-member="carousel"] > :first-child',
    dot: ':scope [data-member="carousel"] [data-carousel-part="dot"]',
    // The second clause reads through a member's host element, which an Angular member renders in.
    next: ':scope [data-member="carousel"] > :last-child > button:last-child, :scope [data-member="carousel"] > :last-child > :last-child > button',
  },
  Table: {
    row: ':scope [data-member="table"] tbody tr',
    // A sortable header's own sort button, found by the header's `data-sortable`.
    sort: ':scope [data-member="table"] th[data-sortable] > button',
  },
  DataTable: {
    table: ':scope [data-member="data-table"] table',
    row: ':scope [data-member="data-table"] tbody tr',
    cell: ':scope [data-member="data-table"] th, :scope [data-member="data-table"] td',
    rowcheck: ':scope [data-member="data-table"] tbody [data-member="checkbox"]',
    sort: ':scope [data-member="data-table"] th[data-sortable] button',
    // A row's disclosure is the one Button a grid row holds. A detail row may hold Buttons of
    // its own, so the search stays out of it.
    expander:
      ':scope [data-member="data-table"] tbody tr:not([data-detail]) [data-member="button"]',
  },
  Pagination: {
    // Pages are Buttons, which take no part hook, or links with a Button's
    // attributes when the pages have addresses. The current page is the one
    // soft Button (`pagination.md`), and the others are the ghost controls that
    // carry a number rather than an icon.
    current: ':scope [data-member="pagination"] [data-variant="soft"]',
    page: ':scope [data-member="pagination"] [data-variant="ghost"]:not([data-icon-only])',
  },
  CursorPagination: {
    // The directions are Buttons, or links with a Button's attributes when the
    // windows have addresses (`cursor-pagination.md`). Previous is the first
    // ghost control of the replace form, and the append form's action is its
    // one outline control.
    previous: ':scope [data-member="cursor-pagination"] [data-variant="ghost"]',
    more: ':scope [data-member="cursor-pagination"] [data-variant="outline"]',
  },
  Stepper: {
    current: ':scope [data-member="stepper"] > [data-state="active"]',
    done: ':scope [data-member="stepper"] > [data-interactive] button',
  },
  SectionNav: {
    item: ':scope [data-member="section-nav"] a',
  },
  TableOfContents: {
    link: ':scope [data-member="table-of-contents"] a',
  },
  List: {
    link: ':scope [data-member="list"] a',
    button: ':scope [data-member="list"] button',
    // The link or the button that takes an item's press. A trailing control is a member of its
    // own, which carries `data-member`.
    title:
      ':scope [data-member="list"] li a:not([data-member]), :scope [data-member="list"] li button:not([data-member])',
  },
  CommentThread: {
    replies: ':scope [data-member="comment-thread"] li ol',
  },
  PromptInput: {
    field: ':scope [data-member="prompt-input"] textarea',
    // The list opens from the field, which keeps focus.
    trigger: ':scope [data-member="prompt-input"] textarea',
    panel: ':scope [data-member="prompt-input"] [data-prompt-part="suggestions"]',
    list: ':scope [data-member="prompt-input"] [data-prompt-part="suggestions"] ul',
  },
  ReasoningDisclosure: {
    trigger: ':scope [data-member="reasoning-disclosure"] > button',
  },
  ToolCall: {
    trigger: ':scope [data-member="tool-call"] > button',
  },
  Tree: {
    item: ':scope [data-member="tree"] [data-tree-item]',
    row: ':scope [data-member="tree"] [data-tree-part="row"]',
    group: ':scope [data-member="tree"] ul',
    selected: ':scope [data-member="tree"] [data-selected]',
    more: ':scope [data-member="tree"] [data-tree-part="more"]',
  },
  SplitPane: {
    divider: ':scope [data-member="split-pane"] [data-split-pane-part="divider"]',
  },
  AppShell: {
    // A NavItem: a link or a button in the shell's navigation that is no member's. The shell's
    // own toggle and the controls an app puts in the rail are members, which carry `data-member`.
    item: ':scope [data-member="app-shell"] > nav a:not([data-member]), :scope [data-member="app-shell"] > nav button:not([data-member])',
  },
  Plan: {
    list: ':scope [data-member="plan"] > ol',
    // The current step is the first running one, located by its status and not by `aria-current`.
    current: ':scope [data-member="plan"] li[data-status="running"]',
  },
  RecordButton: {
    button: ':scope [data-member="record-button"] button',
  },
  AudioPlayer: {
    toggle: ':scope [data-member="audio-player"] button',
    scrubber: ':scope [data-member="audio-player"] [data-member="slider"] [tabindex="0"]',
  },

  /* charts --------------------------------------------------------------------- */
  // A legend key: a button of the list that is the figure's own child. The twin's toggle is a
  // Button in a `div` of the figure, so the list's place keeps it out.
  AreaChart: { key: ':scope [data-member="area-chart"] > ul button' },
  BarChart: { key: ':scope [data-member="bar-chart"] > ul button' },
  LineChart: { key: ':scope [data-member="line-chart"] > ul button' },
  RadarChart: { key: ':scope [data-member="radar-chart"] > ul button' },
  ScatterChart: { key: ':scope [data-member="scatter-chart"] > ul button' },

  /* archetypes ----------------------------------------------------------------- */
  MasterDetailPage: {
    list: ':scope [data-member="master-detail-page"] [data-master-detail-page-part="list"]',
    divider: ':scope [data-member="master-detail-page"] [data-split-pane-part="divider"]',
    back: ':scope [data-member="master-detail-page"] [data-master-detail-page-part="back"] button',
  },
  // The landmark and the results are found by the page's own hooks, because the contract
  // states the landmark's role and the results' `aria-busy`. The field and the submit Button
  // are the application's members in the landmark.
  SearchPage: {
    search: ':scope [data-search-page-part="search"]',
    field: ':scope [data-search-page-part="search"] input:not([type="hidden"])',
    submit: ':scope [data-search-page-part="search"] button[type="submit"]',
    results: ':scope [data-search-page-part="results"]',
  },
}

/**
 * Props that give a member entries whose own handlers hold spies, per member,
 * for an agent action that calls the handler of the entry it chooses rather
 * than a prop of the member (`action choose id calls onSelect`). The runner
 * mounts an entry with these props over the fixture's, so the call it checks
 * is one it can see. Each list holds two commands, a disabled one, which the
 * runner offers to show it is refused, and a `danger`-toned one, which the
 * member marks destructive.
 */
export const CHOICE_PROBES: Readonly<
  Record<
    string,
    (
      spy: (handler: string) => (...args: never[]) => void,
    ) => Readonly<Record<string, readonly unknown[]>>
  >
> = {
  Menu: (spy) => ({
    items: [
      { label: 'First probe', onSelect: spy('onSelect') },
      { label: 'Second probe', onSelect: spy('onSelect') },
      { label: 'Unavailable probe', disabled: true, onSelect: spy('onSelect') },
      { label: 'Destructive probe', tone: 'danger', onSelect: spy('onSelect') },
    ],
  }),
  ContextMenu: (spy) => ({
    entries: [
      { label: 'First probe', onSelect: spy('onSelect') },
      { label: 'Second probe', onSelect: spy('onSelect') },
      { label: 'Unavailable probe', disabled: true, onSelect: spy('onSelect') },
      { label: 'Destructive probe', tone: 'danger', onSelect: spy('onSelect') },
    ],
  }),
  // A command has no tone, so none is marked destructive.
  Command: (spy) => ({
    items: [
      { id: 'first-probe', label: 'First probe', onSelect: spy('onSelect') },
      { id: 'second-probe', label: 'Second probe', onSelect: spy('onSelect') },
      {
        id: 'unavailable-probe',
        label: 'Unavailable probe',
        disabled: true,
        onSelect: spy('onSelect'),
      },
    ],
  }),
  // One title over Menu's four probes.
  Menubar: (spy) => ({
    menus: [
      {
        label: 'Probe',
        entries: [
          { label: 'First probe', onSelect: spy('onSelect') },
          { label: 'Second probe', onSelect: spy('onSelect') },
          { label: 'Unavailable probe', disabled: true, onSelect: spy('onSelect') },
          { label: 'Destructive probe', tone: 'danger', onSelect: spy('onSelect') },
        ],
      },
    ],
  }),
  SplitButton: (spy) => ({
    entries: [
      { label: 'First probe', onSelect: spy('onSelect') },
      { label: 'Second probe', onSelect: spy('onSelect') },
      { label: 'Unavailable probe', disabled: true, onSelect: spy('onSelect') },
      { label: 'Destructive probe', tone: 'danger', onSelect: spy('onSelect') },
    ],
  }),
}

/**
 * The text or number an agent action that takes one is given, per member,
 * where the runner's fixed text or the current number plus one is not a value
 * the member reads. Each takes the current value of the state the action sets
 * and returns another value the member accepts, in the form that state reads
 * it, so the runner can check the state against the probe. The law fails on a
 * probe kept for a member whose fence has no action that takes text or a
 * number.
 */
export const VALUE_PROBES: Readonly<Record<string, (current: unknown) => string | number>> = {
  // A weekday in July 2026, inside the days every bounded entry allows.
  Calendar: (current) => (current === '2026-07-16' ? '2026-07-17' : '2026-07-16'),
  // The same days, with the current value's time of day at a time granularity.
  DatePicker: (current) => {
    const [day, time] = String(current).split('T')
    const next = day === '2026-07-16' ? '2026-07-17' : '2026-07-16'
    return time === undefined ? next : `${next}T${time}`
  },
  // A range inside the report window's June, one day wider than the current one.
  DateRangePicker: (current) =>
    current === '2026-06-02/2026-06-16' ? '2026-06-03/2026-06-17' : '2026-06-02/2026-06-16',
  // A card's expiry month, after every bounded entry's first month.
  MonthInput: (current) => (current === '2029-09' ? '2029-10' : '2029-09'),
  // A whole hour, which a field of either granularity enters.
  TimeInput: (current) => (current === '10:00:00' ? '11:00:00' : '10:00:00'),
  // One day more, a whole count of every unit a field can show.
  DurationInput: (current) => (typeof current === 'number' ? current : 0) + 86_400,
  // An E.164 number, which the paste rule reads: London's or San Francisco's, both in the
  // ranges kept for fiction.
  PhoneInput: (current) => (current === '+442079460958' ? '+14155550132' : '+442079460958'),
  // A lowercase hex, with eight digits for a field whose value carries the alpha channel.
  ColorInput: (current) =>
    typeof current === 'string' && current.length === 9
      ? current === '#0089eaff'
        ? '#8864f0cc'
        : '#0089eaff'
      : current === '#0089ea'
        ? '#8864f0'
        : '#0089ea',
}

/**
 * The fixture entries mounted at a window size other than the default, per
 * member, by entry name, with that size. An agent action that exists only
 * below a breakpoint is pinned with `when` to such an entry. The agent runner
 * sets the size before it mounts the entry and gives the window its own size
 * back afterwards, when the statement fails too. The law fails on a row that
 * names no member or no entry of its fixture, and on an entry no statement of
 * the member's agent fence names with `when`.
 */
export const WINDOW_SIZES: Readonly<Record<string, Readonly<Record<string, WindowSize>>>> = {
  // Below the drawer breakpoint (48rem), at the width AppShell's law for its navigation on top
  // draws the drawer at (`app-shell-top.ts`).
  AppShell: {
    'drawer closed — below the breakpoint, the rail behind the topbar’s menu button': {
      width: 600,
      height: 800,
    },
    'drawer open — below the breakpoint, the rail over the page and the banner': {
      width: 600,
      height: 800,
    },
  },
}

/**
 * The handler props a member calls when a key or a click takes effect, per
 * member. The runner mounts a spy in each for `activates` and `nothing`:
 * `nothing` fails when one is called, so a guard that lets the handler run
 * cannot pass on an unchanged screen, and `activates` on a native button holds
 * when one is called, because the browser clicks a native button on Enter
 * whatever its handler does. A member whose `nothing` statement guards a
 * handler, or whose activation is a handler with nothing to see, is listed: a
 * DataTable row's click shows nothing but `onRowClick` running.
 */
export const HANDLERS: Readonly<Record<string, readonly string[]>> = {
  Button: ['onClick'],
  ProviderButton: ['onClick'],
  AvatarButton: ['onClick'],
  Input: ['onChange'],
  OTPInput: ['onChange', 'onComplete'],
  CheckboxGroup: ['onChange'],
  ChoiceCard: ['onChange'],
  Alert: ['onDismiss'],
  Banner: ['onDismiss'],
  Carousel: ['onIndexChange'],
  // Previous and Next report the step, and Close and Done the end.
  Tour: ['onStepChange', 'onEnd'],
  DataTable: ['onSortChange', 'onSelectionChange', 'onRowClick', 'onExpandedChange'],
  Pagination: ['onPageChange'],
  // A press on a direction, or on a link to its window, asks for that window.
  CursorPagination: ['onPrevious', 'onNext'],
  Stepper: ['onStepSelect'],
  // An item is a link. With the router's handler mounted, Enter reaches it and the page stays put.
  SectionNav: ['onNavigate'],
  // A link to a section of the page: Enter reaches it, and it marks its section.
  TableOfContents: ['onCurrentChange'],
  PromptInput: ['onSubmit'],
  // Enter while the suggestions load neither picks nor submits.
  RichTextInput: ['onSubmit'],
  // Enter, Space and a press on a highlight's tab stop report the annotation, and change nothing on
  // screen until the application answers.
  RichTextContent: ['onAnnotationSelect'],
  // A press on a row selects, and one on the row that asks for more shows nothing until the
  // application answers.
  Tree: ['onChange', 'onExpandedChange', 'onLoadMore'],
  // A press on a node's row chooses it and closes the popup, which takes the row away.
  TreeSelect: ['onChange'],
  SplitPane: ['onRatioChange', 'onCommit'],
  // A press on the Button starts the recording, which the media element reports as `play`.
  AudioPlayer: ['onPlay'],
  // A press calls one of the two, by whether the application is recording.
  RecordButton: ['onStart', 'onStop'],
  // Enter on a mark guards the change a press would report.
  Rating: ['onChange'],
  // Enter and Escape while a save is in flight neither save again nor close the field.
  InlineEdit: ['onCommit', 'onEditingChange'],
  // A press on the way back hands the page back to the application, which clears its selection.
  MasterDetailPage: ['onBack'],
  // Enter in the field and a press on the submit Button submit the page's form.
  SearchPage: ['onSubmit'],
}
