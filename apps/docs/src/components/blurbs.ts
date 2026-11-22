/**
 * The site's own words for each component, the line under its name on the
 * Components index. They are written for a visitor building a product, so they
 * are copy, kept beside the pages that show them. The spec's `purpose` stays the
 * registry's fact for tools, and these lines do not replace it. Keys are the
 * registry's names, in the index's order. `blurbs.test.ts` keeps one line for
 * every component in the registry.
 */
export const BLURBS: Readonly<Record<string, string>> = {
  // Controls
  Button: 'The button people press to make something happen.',
  CopyButton: 'Copies a value to the clipboard in one press and shows that it worked.',
  RecordButton:
    'One press starts a recording and the next stops it, for voice notes and voice input.',
  ProviderButton: 'A sign-in button that carries a provider’s own logo, such as Google’s.',
  AvatarButton:
    'Puts a person’s picture or initials on a button, usually to open their account menu.',
  SplitButton:
    'Runs the usual action in one press, with a small menu beside it for close variations.',
  Input: 'A box for typing a single line of text, such as a name or an email address.',
  NumberInput: 'Holds an exact number, shows it neatly formatted and steps it up or down.',
  Select: 'A drop-down for picking one option from a fixed list.',
  Combobox: 'Type to narrow a long list, then pick the one you want, such as a country.',
  MultiSelect:
    'Pick several options from a fixed list, typing to filter it, each choice shown as a chip.',
  TreeSelect: 'Choose one item from a nested list, like the folder a file goes into.',
  SearchInput: 'The search box, with a search icon, a clear button and room for a shortcut hint.',
  PasswordInput: 'Hides a password as people type it, with a button to reveal it and check.',
  OTPInput: 'Separate boxes for entering a one-time code, such as the six digits sent at sign-in.',
  Textarea: 'Room to write several lines, which can grow as the text gets longer.',
  TagInput:
    'Type several free-form values, like email addresses to invite, and each becomes a chip.',
  FileUpload: 'Drop files in or browse for them, and see how each upload is going in a list.',
  Checkbox: 'A tick box for a yes or no choice, with an in-between state for mixed groups.',
  RadioGroup: 'Pick exactly one of a handful of options, with every option in view.',
  CheckboxGroup: 'Several tick boxes under one question, where people may tick any, all or none.',
  SegmentedControl:
    'A row of joined buttons for switching between a few settings, like day, week or month.',
  ModeSwitch: 'Lets people choose light mode, dark mode or whatever their device is set to.',
  ChoiceCard: 'Options shown as cards, with room to describe each one, such as pricing plans.',
  Switch: 'A switch for settings that take effect straight away.',
  Slider: 'Drag a handle along a track to set a number, or two handles to set a range.',
  Rating: 'Stars for giving a score, or for showing an average such as 4.3 out of 5.',
  DatePicker: 'Lets people pick a date by typing it or from a calendar.',
  Calendar: 'A month laid out as a grid, where people pick a single day.',
  DateRangePicker: 'Choose a start and an end date, by typing them or picking from one calendar.',
  MonthInput: 'Just a month and a year, with no day, such as a card’s expiry date.',
  TimeInput: 'Type a time of day, such as 09:00 for when a shop opens.',
  DurationInput:
    'Enter a length of time as days, hours or minutes, like a 30-day retention period.',
  ColorInput: 'Pick a colour by typing its hex code or choosing it by eye from a colour picker.',
  PhoneInput: 'Takes a phone number, with a country picker that fills in the calling code.',
  FormField:
    'Puts a label, help text and an error message around a field and links them for screen readers.',
  InlineEdit:
    'Turns a name into a field where it stands, so people can rename it without leaving the page.',
  ImageEditor: 'Pan, zoom and rotate a picture to fit a fixed frame, such as a profile photo.',
  Link: 'Text that takes people to another page, or a link styled to sit among buttons.',

  // Overlays
  Dialog: 'A window that opens over the page for a short task, keeping the rest out of reach.',
  ConfirmDialog:
    'Asks people to confirm before something happens, and can make them type a word first.',
  Drawer: 'Slides a panel in from the edge of the screen for details, filters or quick edits.',
  Lightbox:
    'Opens a picture large over the page so people can see all of it, with next and previous.',
  Command: 'A pop-up search that finds any action in your product, usually opened with a shortcut.',
  Popover: 'A small panel that opens beside a button for richer content, like filter settings.',
  Tour: 'Walks people through the parts of a page, pointing at one at a time.',
  Menu: 'A list of actions that opens from a button, such as the actions for one row.',
  ContextMenu:
    'Right-click or long-press for a menu of quick actions, opened right where people pressed.',
  Menubar: 'Menus in a row, like File, Edit and View, for tools with many commands.',
  Tabs: 'Switch between related views of the same thing without leaving the page.',
  Tooltip: 'A short hint that appears when people hover over or focus on something.',
  HoverCard: 'Previews what is behind a link on hover, like a person’s details behind their name.',
  Toast: 'A brief message in the corner that says how an action went, then goes away.',

  // Structure
  Heading: 'Titles for the sections of a page, at three levels below the page title.',
  Text: 'Ordinary paragraphs of reading text, styled to match the rest of the page.',
  Code: 'Short code inside a sentence, like a file name or a command flag.',
  CodeBlock: 'A block of code, like an install command, with an optional button to copy it.',
  JsonTree: 'Explore a JSON value by opening and closing its levels, with values coloured by type.',
  Diff: 'Shows what changed between two versions, as old and new, inline or line by line.',
  Highlight: 'Marks the words that match a search inside a result, such as its title.',
  LogView:
    'Live output, like a build log, that stays on the newest line unless people scroll back.',
  QRCode: 'Turns a link or a code into a QR code that a phone camera can scan.',
  ScrollArea: 'A slim scrollbar in your theme’s style, for a box that already scrolls.',
  RelativeTime:
    'Writes a time the way people say it, such as two hours ago, or as the exact moment.',
  Countdown: 'Counts down each second to a moment, like when a code expires.',
  Alert: 'A notice in the page beside what it is about, such as a warning about a quota.',
  ErrorSummary: 'Lists every problem when a form is sent with mistakes, each linking to its field.',
  Banner: 'An app-wide notice across the top that stays until its cause is over, like an outage.',
  Card: 'A bordered box that keeps related content together, with an optional title.',
  Accordion: 'Sections with headings that people open and close, one or several at a time.',
  Collapsible: 'Show or hide a single section, like advanced options under a form.',
  Badge: 'A small label for a status or category, a count, or a dot that means something new.',
  Avatar: 'A round picture or initials that show who a person or workspace is.',
  Image: 'A picture that keeps its space while it loads and shows a fallback if it fails.',
  AudioPlayer: 'Plays one recording, such as a voice message, with a bar to move through it.',
  Separator: 'A thin line between pieces of content, for when spacing alone is not enough.',
  Kbd: 'Draws a key as it looks on a keyboard, for showing shortcuts in help and menus.',
  Spinner: 'Tells people something is loading when nobody knows how long it will take.',
  Progress: 'A bar that shows how much of a task is done, or a small ring where space is tight.',
  Meter:
    'Shows how much of a limit is used, like storage, and changes colour past a level you set.',
  Stepper: 'Marks where people are in a sequence of steps, such as checkout or onboarding.',
  Timeline: 'Past events in order, like a ticket’s history or an audit trail.',
  DescriptionList: 'Pairs of labels and values that describe one thing, like a ticket’s details.',
  Skeleton: 'Placeholder shapes that hold the layout steady while the real content loads.',
  List: 'A column of similar items, like notifications or accounts, to read, open or pick.',
  Tree: 'Folders and other nested lists that people open level by level to pick one item.',
  CommentThread: 'The comments people leave on a record, each with its author, time and replies.',
  Table: 'A readable table of records, for scanning rows and comparing columns.',
  DataTable:
    'Everything a data table needs: sorting, row selection, bulk actions, paging and empty states.',
  FilterBar: 'The row of search and filters above a list, with a clear button and a result count.',
  Pagination: 'Numbered page buttons for moving through a long list one page at a time.',
  CursorPagination:
    'Previous and next buttons, or one load more button, for lists with no page count.',
  Stat: 'A key number with its label and whether it is going up or down.',
  SettingsRow:
    'One setting in a list: its name and description on the left, its control on the right.',
  Breadcrumbs: 'A trail of links from the home page down to the page people are on.',
  SectionNav:
    'Links between the pages of one section of your product, with the current one marked.',
  TableOfContents: 'The list of a long page’s sections, marking the one people are reading now.',
  PageHeader: 'The top of a working page: its title, a short description and its main actions.',
  Hero: 'Opens a landing page with a large title, a short introduction and its main actions.',
  Carousel:
    'Slides people move through one at a time by swiping or pressing next, never on a timer.',
  EmptyState:
    'The message people see when a view has nothing to show, from a first visit to no results.',

  // Layout
  Stack: 'Stacks things in a column with even spacing, so you never write layout CSS.',
  Inline: 'Lines things up in a row with even spacing, such as buttons or details.',
  Grid: 'Lays content out in equal columns, such as form fields in pairs or a row of stats.',
  SplitPane:
    'Two panels side by side or stacked, with a divider people can drag or move by keyboard.',

  // Charts
  BarChart: 'Compares amounts across categories as bars, grouped or stacked, upright or sideways.',
  LineChart: 'Lines that show how one or more values change over time.',
  Sparkline: 'A tiny trend line beside a number that shows which way it has been heading.',
  AreaChart: 'Stacked bands that show what a total is made of and how that mix changes over time.',
  Heatmap: 'A grid of coloured cells that shows at a glance where values are highest.',
  DonutChart:
    'A ring that shows roughly how a whole splits into a few parts, with the total inside.',
  ScatterChart: 'Plots points by two measures to show whether they move together.',
  Histogram: 'Groups a set of raw values into ranges to show how they are spread out.',
  RadarChart: 'Draws the profile of up to three items across three to six measures on one scale.',
  FunnelChart:
    'Shows how many people or items make it through each stage, and where they drop off.',
  Treemap: 'Rectangles sized by value that show what takes up the most of a whole.',

  // AI
  StreamingText: 'Words of a reply as they arrive, with a caret where the next one will appear.',
  Markdown:
    'Turns Markdown, such as a model’s reply, into headings, lists, code and tables in your theme.',
  AttachmentChip: 'Files attached to a message, each a chip people can remove until it is sent.',
  PromptInput: 'The box where people write to a model, attach files, and send or stop the reply.',
  ChatMessage:
    'One turn in a chat: the person’s message in a bubble, the model’s as full-width text.',
  ChatThread:
    'The scrolling conversation that keeps up with each new reply unless people scroll back.',
  Plan: 'The steps an agent plans to take, each marked as waiting, running, done or failed.',
  ToolCall: 'One tool the model used, in a row people can open to see what went in and came out.',
  ApprovalCard: 'Asks people in the chat to allow or deny something an agent wants to do.',
  Citation: 'A small numbered link after a sentence that points to its source, with a preview.',
  SourceList: 'The numbered sources under a reply, matching the numbers in its text.',
  ReasoningDisclosure:
    'Keeps the model’s reasoning folded away, for people who want to read how it got there.',
  ArtifactPane:
    'A pane beside the chat for something the model made, such as a file, page or table.',

  // Pages
  AppShell:
    'The frame around your whole app: a top bar, a sidebar that folds away and the content.',
  ListPage:
    'The page for browsing records: a header, filters, a table, and a message when it is empty.',
  DetailPage:
    'A page about one thing, like a customer, with a way back, sections and a side column.',
  FormPage:
    'Create or edit something on one page: fields grouped in cards, then one row of actions.',
  SettingsPage: 'Settings laid out as grouped rows of options in one easy-to-read column.',
  Dashboard: 'An overview page with a row of key numbers and two areas below for the details.',
  AuthPage: 'Sign-in, sign-up and setup steps, on a page of their own before people enter the app.',
  MasterDetailPage: 'A list on one side and the chosen item’s details on the other, like an inbox.',
  SearchPage: 'A page for searching: the search box and filters on top, grouped results below.',
  ConversationPage:
    'A chat page: the conversation above the message box, and what the model makes beside it.',

  // Icons
  Icon: 'Draws an icon by what it means, such as search or close, from one consistent set.',
}
