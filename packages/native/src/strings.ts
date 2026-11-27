/**
 * The defaults a spec names for text a native member speaks when the prop that
 * carries it is absent: a dialog's "Close", a page's "Try again", DataTable's
 * messages. They are written here once, and `pnpm native:contracts` writes
 * them into both platforms' contracts. On Android, `Strings.kt` declares
 * `PMStrings`, the record an app replaces through `LocalPMStrings` with its
 * translations. On iOS, `Strings.swift` declares `PMStrings`, whose every
 * default is looked up through `String(localized:comment:)` in the app's main
 * bundle, so an app translates them in its own string catalog.
 *
 * Each entry cites the spec that names it, and `strings.test.ts` holds the spec
 * to it (`specNames`): the whole English text appears in that spec, its parts
 * in order and a value in each parameter, and a default without parameters
 * appears as text the spec names, not as a word it uses in passing. A spec
 * that changes its default fails until this list follows.
 *
 * A default only one platform's members speak names that platform
 * (`platforms`), and only that platform's contracts declare it, so the other
 * platform's string catalog does not carry it unused.
 */

import type { NativePlatform } from './mapping'

/** One parameter of a default that is a function of a value: DataTable's `selected` count. */
export interface SpecDefaultParameter {
  name: string
  type: 'string' | 'number'
}

/** One default a spec names. */
export interface SpecDefault {
  /** The property's name in the generated record. */
  name: string
  /** The spec that names it, relative to the repository's root. */
  spec: string
  /** What the default is for: the prop it stands in for, or what a member says with it. */
  doc: string
  /**
   * The English text. A default that is a function of values writes each
   * parameter as `{name}`, and names them in `parameters`.
   */
  english: string
  /** The parameters, in order, of a default that is a function. */
  parameters?: readonly SpecDefaultParameter[]
  /** What the text is, for a translator. */
  comment: string
  /** The platforms whose members speak it, when not both. */
  platforms?: readonly NativePlatform[]
}

/** A default that is a record of the contracts, such as DataTable's `messages`: its fields' defaults. */
export interface SpecDefaultRecord {
  /** The property's name in the generated record. */
  name: string
  /** The contract type the record is: `DataTableMessages` is `PMDataTableMessages`. */
  type: string
  spec: string
  doc: string
  /** The record's fields, in the contract's order. */
  fields: readonly SpecDefault[]
}

export type SpecDefaultEntry = SpecDefault | SpecDefaultRecord

export const isRecord = (entry: SpecDefaultEntry): entry is SpecDefaultRecord => 'fields' in entry

/** Whether `platform`'s members speak the default, so its contracts declare it. */
export const spokenOn = (entry: SpecDefaultEntry, platform: NativePlatform): boolean =>
  isRecord(entry) || (entry.platforms?.includes(platform) ?? true)

/** Every default a native member speaks, in the order the generated record declares them. */
export const SPEC_DEFAULTS: readonly SpecDefaultEntry[] = [
  {
    name: 'clear',
    spec: 'design/components/input.md',
    doc: "Input's `clearLabel`: the clear button's name.",
    english: 'Clear',
    comment: "The accessible name of a text field's clear button.",
  },
  {
    name: 'search',
    spec: 'design/components/search-input.md',
    doc: "SearchInput's `placeholder`: what an empty search field shows.",
    english: 'Search…',
    comment: 'The placeholder of an empty search field.',
  },
  {
    name: 'close',
    spec: 'design/components/dialog.md',
    doc: "Dialog's `closeLabel`: the close button's name.",
    english: 'Close',
    comment: "The accessible name of a dialog's close button.",
  },
  {
    name: 'dismiss',
    spec: 'design/components/toast.md',
    doc: "The name of Toast's close button, and its dismiss action.",
    english: 'Dismiss',
    comment: "The accessible name of a notification's close button.",
  },
  {
    name: 'loading',
    spec: 'design/components/spinner.md',
    doc: "Spinner's `label`, and what a loading Button reports as its state.",
    english: 'Loading',
    comment: 'Announced while something loads.',
  },
  {
    name: 'invalid',
    spec: 'design/components/input.md',
    doc: "What an invalid field's control reports without a FormField's message: the web's `aria-invalid`.",
    english: 'Invalid',
    comment: 'Said of a form field whose value is not accepted.',
  },
  {
    name: 'retry',
    spec: 'design/native/screen-contract.md',
    doc: "A page's failed-state action, when the page has `onRetry`.",
    english: 'Try again',
    comment: 'Loads a page again after loading failed.',
  },
  {
    name: 'openNavigation',
    spec: 'design/archetypes/app-shell.md',
    doc: "AppShell's `messages.openNavigation`: the menu button's name.",
    english: 'Open navigation',
    comment: "The button that shows the app's navigation.",
  },
  {
    name: 'closeNavigation',
    spec: 'design/archetypes/app-shell.md',
    doc: "AppShell's `messages.closeNavigation`: the drawer's close.",
    english: 'Close navigation',
    comment: "The button that hides the app's navigation.",
  },
  {
    name: 'primaryNavigation',
    spec: 'design/archetypes/app-shell.md',
    doc: "AppShell's `messages.primaryNavigation`: the sidebar's name.",
    english: 'Primary',
    comment: "The name of the app's main navigation.",
  },
  {
    name: 'expandSidebar',
    spec: 'design/archetypes/app-shell.md',
    doc: "AppShell's `messages.expandSidebar`: the collapsed rail's toggle.",
    english: 'Expand sidebar',
    comment: "Widens the app's collapsed navigation rail.",
  },
  {
    name: 'collapseSidebar',
    spec: 'design/archetypes/app-shell.md',
    doc: "AppShell's `messages.collapseSidebar`: the rail's toggle.",
    english: 'Collapse sidebar',
    comment: "Narrows the app's navigation rail to its icons.",
  },
  {
    name: 'dataTable',
    type: 'DataTableMessages',
    spec: 'design/components/data-table.md',
    doc: "DataTable's `messages`.",
    fields: [
      {
        name: 'selected',
        spec: 'design/components/data-table.md',
        doc: "The bulk bar's count.",
        english: '{count} selected',
        parameters: [{ name: 'count', type: 'number' }],
        comment: 'How many rows are selected.',
      },
      {
        name: 'selectAll',
        spec: 'design/components/data-table.md',
        doc: "The header's selection checkbox.",
        english: 'Select all',
        comment: "The header's selection checkbox.",
      },
      {
        name: 'selectRow',
        spec: 'design/components/data-table.md',
        doc: "A row's selection checkbox, without `getRowLabel`.",
        english: 'Select row',
        comment: "A row's selection checkbox.",
      },
    ],
  },
  {
    name: 'details',
    spec: 'design/components/data-table.md',
    doc: "DataTable's `messages.detailsLabel` for a row without a name: its disclosure's name.",
    english: 'Details',
    comment: 'The button that shows and hides what a table row holds under itself.',
  },
  {
    name: 'detailsFor',
    spec: 'design/components/data-table.md',
    doc: "DataTable's `messages.detailsLabel` for a row `getRowName` names: its disclosure's name.",
    english: 'Details for {rowName}',
    parameters: [{ name: 'rowName', type: 'string' }],
    comment: 'The button that shows and hides what the named table row holds under itself.',
  },
  {
    name: 'ascending',
    spec: 'design/components/table.md',
    doc: "A column sorted ascending, its header's state: the web's `aria-sort`.",
    english: 'ascending',
    comment: 'A column is sorted ascending.',
  },
  {
    name: 'descending',
    spec: 'design/components/table.md',
    doc: "A column sorted descending, its header's state: the web's `aria-sort`.",
    english: 'descending',
    comment: 'A column is sorted descending.',
  },
  {
    name: 'up',
    spec: 'design/components/stat.md',
    doc: "A Stat delta's direction when the number went up.",
    english: 'up',
    comment: "A stat's change: the number went up.",
  },
  {
    name: 'down',
    spec: 'design/components/stat.md',
    doc: "A Stat delta's direction when the number went down.",
    english: 'down',
    comment: "A stat's change: the number went down.",
  },
  {
    name: 'positive',
    spec: 'design/components/stat.md',
    doc: "A Stat delta's sentiment when the change is good news.",
    english: 'positive',
    comment: "A stat's change is good news.",
  },
  {
    name: 'negative',
    spec: 'design/components/stat.md',
    doc: "A Stat delta's sentiment when the change is bad news.",
    english: 'negative',
    comment: "A stat's change is bad news.",
  },
  {
    name: 'delta',
    spec: 'design/components/stat.md',
    doc: 'Stat\'s `deltaLabel`: the delta\'s spoken text, which the arrow and the colour show: "up 12% — positive".',
    english: '{direction} {value} — {sentiment}',
    parameters: [
      { name: 'direction', type: 'string' },
      { name: 'value', type: 'string' },
      { name: 'sentiment', type: 'string' },
    ],
    comment: "A stat's change: its direction, its value and whether it is good news.",
  },
  {
    name: 'codeBlock',
    spec: 'design/components/code-block.md',
    doc: "CodeBlock's `label`: the name of a block whose code scrolls sideways.",
    english: 'Code block',
    comment: 'The name of a scrolling region that shows code.',
  },
  {
    name: 'copy',
    spec: 'design/components/code-block.md',
    doc: "CodeBlock's `copyLabel`: the copy control's name.",
    english: 'Copy',
    comment: 'The accessible name of a button that copies text.',
  },
  {
    name: 'copied',
    spec: 'design/components/code-block.md',
    doc: "CodeBlock's `copiedLabel`: what its copy control announces once the code is on the clipboard.",
    english: 'Copied',
    comment: 'Announced after text was copied to the clipboard.',
  },
  {
    name: 'breadcrumb',
    spec: 'design/components/breadcrumbs.md',
    doc: "Breadcrumbs' `label`: the trail's name.",
    english: 'Breadcrumb',
    comment: 'The name of the trail of links to the pages above this one.',
  },
  {
    name: 'showPath',
    spec: 'design/components/breadcrumbs.md',
    doc: "Breadcrumbs' `overflowLabel`: the name of the control that lists the hidden crumbs.",
    english: 'Show path',
    comment: 'Shows the pages a shortened trail of links leaves out.',
  },
  {
    name: 'pagination',
    spec: 'design/components/pagination.md',
    doc: "Pagination's and CursorPagination's `label`: the pager's name.",
    english: 'Pagination',
    comment: "The name of a list's page controls.",
  },
  {
    name: 'paginationMessages',
    type: 'PaginationMessages',
    spec: 'design/components/pagination.md',
    doc: "Pagination's `messages`.",
    fields: [
      {
        name: 'previous',
        spec: 'design/components/pagination.md',
        doc: 'The previous-page arrow.',
        english: 'Previous page',
        comment: "The pager's previous button.",
      },
      {
        name: 'next',
        spec: 'design/components/pagination.md',
        doc: 'The next-page arrow.',
        english: 'Next page',
        comment: "The pager's next button.",
      },
      {
        name: 'page',
        spec: 'design/components/pagination.md',
        doc: "A numbered button's name; its visible text is the digit.",
        english: 'Page {page}',
        parameters: [{ name: 'page', type: 'number' }],
        comment: "A numbered page button's accessible name.",
      },
    ],
  },
  {
    name: 'cursorPaginationMessages',
    type: 'CursorPaginationMessages',
    spec: 'design/components/cursor-pagination.md',
    doc: "CursorPagination's `messages`.",
    fields: [
      {
        name: 'previous',
        spec: 'design/components/cursor-pagination.md',
        doc: 'The previous-window button.',
        english: 'Previous',
        comment: 'Shows the earlier window of a list.',
      },
      {
        name: 'next',
        spec: 'design/components/cursor-pagination.md',
        doc: 'The next-window button.',
        english: 'Next',
        comment: 'Shows the later window of a list.',
      },
      {
        name: 'more',
        spec: 'design/components/cursor-pagination.md',
        doc: "The append form's action.",
        english: 'Load more',
        comment: 'Adds the next part of a list below the part shown.',
      },
      {
        name: 'end',
        spec: 'design/components/cursor-pagination.md',
        doc: 'What the append form says once the list has no more.',
        english: 'No more to load',
        comment: 'Says that a list has shown everything it holds.',
      },
    ],
  },
  {
    name: 'stepperSpoken',
    spec: 'design/components/stepper.md',
    doc: 'Stepper\'s `spoken`: the clause read after each step\'s label, "step 2 of 4, current".',
    english: 'step {position} of {count}, {state}',
    parameters: [
      { name: 'position', type: 'number' },
      { name: 'count', type: 'number' },
      { name: 'state', type: 'string' },
    ],
    comment: "A step's place in a flow and its state: its position, the count and a state word.",
  },
  {
    name: 'stepCompleted',
    spec: 'design/components/stepper.md',
    doc: "Stepper's state word for a step before the active one.",
    english: 'completed',
    comment: 'Said of a step of a flow that is done.',
  },
  {
    name: 'stepCurrent',
    spec: 'design/components/stepper.md',
    doc: "Stepper's state word for the active step.",
    english: 'current',
    comment: 'Said of the step of a flow the person is on.',
  },
  {
    name: 'stepUpcoming',
    spec: 'design/components/stepper.md',
    doc: "Stepper's state word for a step after the active one.",
    english: 'not started',
    comment: 'Said of a step of a flow still to come.',
  },
  {
    name: 'stepError',
    spec: 'design/components/stepper.md',
    doc: "Stepper's state word for a step whose data failed.",
    english: 'error',
    comment: 'Said of a step of a flow whose data failed.',
  },
  {
    name: 'expanded',
    spec: 'design/components/json-tree.md',
    doc: "What a disclosure's toggle reports while open, the web's `aria-expanded`: JsonTree's branches, ToolCall, ReasoningDisclosure.",
    english: 'expanded',
    comment: 'Said of a section that is open.',
  },
  {
    name: 'collapsed',
    spec: 'design/components/json-tree.md',
    doc: "What a disclosure's toggle reports while closed.",
    english: 'collapsed',
    comment: 'Said of a section that is closed.',
  },
  {
    name: 'jsonKey',
    spec: 'design/components/json-tree.md',
    doc: "JsonTree's summary of an object with one key.",
    english: '{count} key',
    parameters: [{ name: 'count', type: 'number' }],
    comment: 'How many keys a JSON object has, when it has one.',
  },
  {
    name: 'jsonKeys',
    spec: 'design/components/json-tree.md',
    doc: 'JsonTree\'s summary of an object with any other number of keys: "3 keys".',
    english: '{count} keys',
    parameters: [{ name: 'count', type: 'number' }],
    comment: 'How many keys a JSON object has.',
  },
  {
    name: 'jsonItem',
    spec: 'design/components/json-tree.md',
    doc: "JsonTree's summary of an array with one item.",
    english: '{count} item',
    parameters: [{ name: 'count', type: 'number' }],
    comment: 'How many items a JSON array has, when it has one.',
  },
  {
    name: 'jsonItems',
    spec: 'design/components/json-tree.md',
    doc: 'JsonTree\'s summary of an array with any other number of items: "12 items".',
    english: '{count} items',
    parameters: [{ name: 'count', type: 'number' }],
    comment: 'How many items a JSON array has.',
  },
  {
    name: 'treeMessages',
    type: 'TreeMessages',
    spec: 'design/components/tree.md',
    doc: "Tree's `messages`, which TreeSelect passes to the tree in its popup.",
    fields: [
      {
        name: 'loading',
        spec: 'design/components/tree.md',
        doc: 'What a level says while it loads.',
        english: 'Loading',
        comment: 'Said by a level of a tree while its items load.',
      },
      {
        name: 'loadMore',
        spec: 'design/components/tree.md',
        doc: 'The row that asks for more of a level.',
        english: 'Load more',
        comment: 'Asks for the next items of a level of a tree.',
      },
    ],
  },
  {
    name: 'clearFilters',
    spec: 'design/components/filter-bar.md',
    doc: "FilterBar's `messages.clear`: the clear button's label.",
    english: 'Clear filters',
    comment: 'Removes every filter from a list.',
  },
  {
    name: 'results',
    spec: 'design/components/filter-bar.md',
    doc: "FilterBar's `messages.resultCount` for a count without a total.",
    english: '{shown} results',
    parameters: [{ name: 'shown', type: 'number' }],
    comment: 'How many rows a list shows.',
  },
  {
    name: 'resultsOf',
    spec: 'design/components/filter-bar.md',
    doc: "FilterBar's `messages.resultCount` for a count with a total.",
    english: '{shown} of {total} results',
    parameters: [
      { name: 'shown', type: 'number' },
      { name: 'total', type: 'number' },
    ],
    comment: 'How many rows a list shows, of how many there are.',
  },
  {
    name: 'carouselRoleDescriptions',
    type: 'CarouselRoleDescriptions',
    spec: 'design/components/carousel.md',
    doc: "Carousel's `roleDescriptions`: what a screen reader calls the carousel and each slide.",
    fields: [
      {
        name: 'carousel',
        spec: 'design/components/carousel.md',
        doc: 'What the carousel is called.',
        english: 'carousel',
        comment: 'The kind of thing a set of slides shown one at a time is.',
      },
      {
        name: 'slide',
        spec: 'design/components/carousel.md',
        doc: 'What each slide is called.',
        english: 'slide',
        comment: 'The kind of thing one view of a carousel is.',
      },
    ],
  },
  {
    name: 'lightboxMessages',
    type: 'LightboxMessages',
    spec: 'design/components/lightbox.md',
    doc: "Lightbox's `messages`.",
    fields: [
      {
        name: 'close',
        spec: 'design/components/lightbox.md',
        doc: "The close Button's name.",
        english: 'Close',
        comment: 'The accessible name of the button that closes a picture shown over the screen.',
      },
      {
        name: 'previous',
        spec: 'design/components/lightbox.md',
        doc: "The previous Button's name.",
        english: 'Previous picture',
        comment: 'The accessible name of the button that shows the picture before this one.',
      },
      {
        name: 'next',
        spec: 'design/components/lightbox.md',
        doc: "The next Button's name.",
        english: 'Next picture',
        comment: 'The accessible name of the button that shows the picture after this one.',
      },
      {
        name: 'position',
        spec: 'design/components/lightbox.md',
        doc: 'The position line, "2 of 5", counting from 1.',
        english: '{position} of {count}',
        parameters: [
          { name: 'position', type: 'number' },
          { name: 'count', type: 'number' },
        ],
        comment: "Which picture of a set is shown: the picture's place, then how many there are.",
      },
    ],
  },
  {
    name: 'audioPlayerMessages',
    type: 'AudioPlayerMessages',
    spec: 'design/components/audio-player.md',
    doc: "AudioPlayer's `messages`.",
    fields: [
      {
        name: 'play',
        spec: 'design/components/audio-player.md',
        doc: "The Button's name while the recording is not playing.",
        english: 'Play',
        comment: 'The accessible name of the button that starts playing a recording.',
      },
      {
        name: 'pause',
        spec: 'design/components/audio-player.md',
        doc: "The Button's name while the recording plays.",
        english: 'Pause',
        comment: 'The accessible name of the button that pauses a recording that plays.',
      },
      {
        name: 'scrubber',
        spec: 'design/components/audio-player.md',
        doc: "The scrubber's name.",
        english: 'Playback position',
        comment: 'The accessible name of the slider that moves through a recording.',
      },
      {
        name: 'position',
        spec: 'design/components/audio-player.md',
        doc: "The scrubber's spoken value, from the elapsed and the total length in words.",
        english: '{elapsed} of {total}',
        parameters: [
          { name: 'elapsed', type: 'string' },
          { name: 'total', type: 'string' },
        ],
        comment:
          'Where playback is in a recording: the time played, then the whole length, in words.',
      },
      {
        name: 'failed',
        spec: 'design/components/audio-player.md',
        doc: 'Said in place of the scrubber when the file cannot be loaded.',
        english: 'The recording could not be loaded',
        comment: 'Says that a recording cannot be played because its file did not load.',
      },
    ],
  },
  {
    name: 'attachmentRemove',
    spec: 'design/components/attachment-chip.md',
    doc: "AttachmentChip's `removeLabel`: the remove control's name.",
    english: 'Remove {name}',
    parameters: [{ name: 'name', type: 'string' }],
    comment: "Removes a file from a prompt: the file's name.",
  },
  {
    name: 'attachmentUploading',
    spec: 'design/components/attachment-chip.md',
    doc: "AttachmentChip's `uploadingLabel`: what is said while the file uploads.",
    english: '{name}: uploading',
    parameters: [{ name: 'name', type: 'string' }],
    comment: "A file is still uploading: the file's name.",
  },
  {
    name: 'promptInputMessages',
    type: 'PromptInputMessages',
    spec: 'design/components/prompt-input.md',
    doc: "PromptInput's `messages`.",
    fields: [
      {
        name: 'send',
        spec: 'design/components/prompt-input.md',
        doc: 'The send control.',
        english: 'Send',
        comment: 'Sends the prompt.',
      },
      {
        name: 'stop',
        spec: 'design/components/prompt-input.md',
        doc: 'The stop control, while a reply arrives.',
        english: 'Stop',
        comment: 'Stops the reply that is arriving.',
      },
      {
        name: 'attach',
        spec: 'design/components/prompt-input.md',
        doc: 'The attach control.',
        english: 'Attach',
        comment: 'Attaches files to the prompt.',
      },
      {
        name: 'remove',
        spec: 'design/components/attachment-chip.md',
        doc: "A chip's remove control.",
        english: 'Remove {name}',
        parameters: [{ name: 'name', type: 'string' }],
        comment: "Removes a file from the prompt: the file's name.",
      },
      {
        name: 'uploading',
        spec: 'design/components/attachment-chip.md',
        doc: 'What a chip says while its file uploads.',
        english: '{name}: uploading',
        parameters: [{ name: 'name', type: 'string' }],
        comment: "A file is still uploading: the file's name.",
      },
      {
        name: 'suggestions',
        spec: 'design/components/prompt-input.md',
        doc: 'Announced with the number of suggestions the list shows.',
        english: '{count} suggestions',
        parameters: [{ name: 'count', type: 'number' }],
        comment: 'How many suggestions a list under a typed @ or / shows.',
      },
      {
        name: 'loadingSuggestions',
        spec: 'design/components/prompt-input.md',
        doc: 'Announced while the suggestions load.',
        english: 'Loading suggestions…',
        comment: 'Announced while a list of suggestions loads.',
      },
      {
        name: 'noSuggestions',
        spec: 'design/components/prompt-input.md',
        doc: 'The one row, and the announcement, when no suggestion matches.',
        english: 'No results',
        comment: 'A list of suggestions has none to show.',
      },
    ],
  },
  {
    name: 'chatThreadMessages',
    type: 'ChatThreadMessages',
    spec: 'design/components/chat-thread.md',
    doc: "ChatThread's `messages`.",
    fields: [
      {
        name: 'jumpToLatest',
        spec: 'design/components/chat-thread.md',
        doc: 'The jump control, while the reader has scrolled away from the newest turn.',
        english: 'Jump to latest',
        comment: 'Scrolls a conversation back to its newest message.',
      },
    ],
  },
  {
    name: 'logViewMessages',
    type: 'LogViewMessages',
    spec: 'design/components/log-view.md',
    doc: "LogView's `messages`.",
    fields: [
      {
        name: 'jumpToLatest',
        spec: 'design/components/log-view.md',
        doc: 'The jump control, while the reader has scrolled away from the newest line.',
        english: 'Jump to latest',
        comment: 'Scrolls a log back to its newest line.',
      },
      {
        name: 'info',
        spec: 'design/components/log-view.md',
        doc: 'Read before a line whose level is `info`.',
        english: 'info',
        comment: 'Read before a log line that is information.',
      },
      {
        name: 'warning',
        spec: 'design/components/log-view.md',
        doc: 'Read before a line whose level is `warning`.',
        english: 'warning',
        comment: 'Read before a log line that is a warning.',
      },
      {
        name: 'error',
        spec: 'design/components/log-view.md',
        doc: 'Read before a line whose level is `error`.',
        english: 'error',
        comment: 'Read before a log line that is an error.',
      },
    ],
  },
  {
    name: 'diffMessages',
    type: 'DiffMessages',
    spec: 'design/components/diff.md',
    doc: "Diff's `messages`.",
    fields: [
      {
        name: 'from',
        spec: 'design/components/diff.md',
        doc: 'Read before the old value of a value that changed.',
        english: 'from',
        comment: 'Read before the old value of a change: "from Draft to Active".',
      },
      {
        name: 'to',
        spec: 'design/components/diff.md',
        doc: 'Read between the old value and the new one.',
        english: 'to',
        comment: 'Read between the old and the new value of a change: "from Draft to Active".',
      },
      {
        name: 'added',
        spec: 'design/components/diff.md',
        doc: 'Read before a value, or a line, that only the new side has.',
        english: 'added',
        comment: 'Read before a value or a line that was added.',
      },
      {
        name: 'removed',
        spec: 'design/components/diff.md',
        doc: 'Read before a value, or a line, that only the old side has.',
        english: 'removed',
        comment: 'Read before a value or a line that was removed.',
      },
      {
        name: 'unchanged',
        spec: 'design/components/diff.md',
        doc: "A collapsed run's Button: how many unchanged lines it holds.",
        english: '{count} unchanged lines',
        parameters: [{ name: 'count', type: 'number' }],
        comment: 'Shows or hides a run of lines that did not change; the count is at least two.',
      },
    ],
  },
  {
    name: 'toolInput',
    spec: 'design/components/tool-call.md',
    doc: "ToolCall's `messages.input`: the input's heading.",
    english: 'Input',
    comment: 'The heading over the arguments a tool was given.',
  },
  {
    name: 'toolOutput',
    spec: 'design/components/tool-call.md',
    doc: "ToolCall's `messages.output`: the output's heading.",
    english: 'Output',
    comment: 'The heading over what a tool gave back.',
  },
  {
    name: 'toolPending',
    spec: 'design/components/tool-call.md',
    doc: "ToolCall's words for `pending`, read with the tool's name.",
    english: 'pending',
    comment: 'A tool call that has not started.',
  },
  {
    name: 'toolRunning',
    spec: 'design/components/tool-call.md',
    doc: "ToolCall's words for `running`.",
    english: 'running',
    comment: 'A tool call in progress.',
  },
  {
    name: 'toolDone',
    spec: 'design/components/tool-call.md',
    doc: "ToolCall's words for `done`.",
    english: 'done',
    comment: 'A tool call that finished.',
  },
  {
    name: 'toolFailed',
    spec: 'design/components/tool-call.md',
    doc: "ToolCall's words for `error`.",
    english: 'failed',
    comment: 'A tool call that failed.',
  },
  {
    name: 'toolDenied',
    spec: 'design/components/tool-call.md',
    doc: "ToolCall's words for `denied`.",
    english: 'denied',
    comment: 'A tool call the person refused.',
  },
  {
    name: 'toolAwaitingApproval',
    spec: 'design/components/tool-call.md',
    doc: "ToolCall's words for `approval`.",
    english: 'awaiting approval',
    comment: 'A tool call waiting for the person to allow it.',
  },
  {
    name: 'planPending',
    spec: 'design/components/plan.md',
    doc: "Plan's `messages.status.pending`, read after a step's title.",
    english: 'Pending',
    comment: 'A step of an agent run that has not started.',
  },
  {
    name: 'planRunning',
    spec: 'design/components/plan.md',
    doc: "Plan's `messages.status.running`.",
    english: 'Running',
    comment: 'A step of an agent run in progress.',
  },
  {
    name: 'planDone',
    spec: 'design/components/plan.md',
    doc: "Plan's `messages.status.done`.",
    english: 'Done',
    comment: 'A step of an agent run that finished.',
  },
  {
    name: 'planFailed',
    spec: 'design/components/plan.md',
    doc: "Plan's `messages.status.error`.",
    english: 'Failed',
    comment: 'A step of an agent run that failed.',
  },
  {
    name: 'planSkipped',
    spec: 'design/components/plan.md',
    doc: "Plan's `messages.status.skipped`.",
    english: 'Skipped',
    comment: 'A step of an agent run that was passed over.',
  },
  {
    name: 'commentThreadMessages',
    type: 'CommentThreadMessages',
    spec: 'design/components/comment-thread.md',
    doc: "CommentThread's `messages`: the words the thread writes for every comment in it.",
    fields: [
      {
        name: 'edited',
        spec: 'design/components/comment-thread.md',
        doc: 'Shown after the time of an edited comment.',
        english: 'Edited',
        comment: 'Marks a comment that was changed after it was posted.',
      },
      {
        name: 'replies',
        spec: 'design/components/comment-thread.md',
        doc: "The name of a comment's list of replies.",
        english: 'Replies',
        comment: 'The name of the list of replies under a comment.',
      },
    ],
  },
  {
    name: 'tourMessages',
    type: 'TourMessages',
    spec: 'design/components/tour.md',
    doc: "Tour's `messages`: every word a step's panel writes itself.",
    fields: [
      {
        name: 'next',
        spec: 'design/components/tour.md',
        doc: 'The control that moves to the next step.',
        english: 'Next',
        comment: 'Moves a guided tour to its next step.',
      },
      {
        name: 'previous',
        spec: 'design/components/tour.md',
        doc: 'The control that moves to the step before.',
        english: 'Previous',
        comment: 'Moves a guided tour back to the step before.',
      },
      {
        name: 'done',
        spec: 'design/components/tour.md',
        doc: "The last step's forward control, which ends the tour.",
        english: 'Done',
        comment: 'Ends a guided tour from its last step.',
      },
      {
        name: 'close',
        spec: 'design/components/tour.md',
        doc: "The close control's name.",
        english: 'Close',
        comment: 'The accessible name of the button that leaves a guided tour.',
      },
      {
        name: 'position',
        spec: 'design/components/tour.md',
        doc: 'The position line, counting from 1.',
        english: 'Step {position} of {count}',
        parameters: [
          { name: 'position', type: 'number' },
          { name: 'count', type: 'number' },
        ],
        comment: 'Where a guided tour is: the step shown, counting from 1, and how many there are.',
      },
    ],
  },
  {
    name: 'approve',
    spec: 'design/components/approval-card.md',
    doc: "ApprovalCard's `approveLabel`.",
    english: 'Allow',
    comment: 'Lets an agent take the action it asked about.',
  },
  {
    name: 'deny',
    spec: 'design/components/approval-card.md',
    doc: "ApprovalCard's `denyLabel`.",
    english: 'Deny',
    comment: 'Refuses the action an agent asked about.',
  },
  {
    name: 'approvalCardMessages',
    type: 'ApprovalCardMessages',
    spec: 'design/components/approval-card.md',
    doc: "ApprovalCard's `messages`: the decided face's words.",
    fields: [
      {
        name: 'approved',
        spec: 'design/components/approval-card.md',
        doc: 'The outcome once the action was allowed.',
        english: 'Allowed',
        comment: 'An action the person allowed.',
      },
      {
        name: 'denied',
        spec: 'design/components/approval-card.md',
        doc: 'The outcome once the action was refused.',
        english: 'Denied',
        comment: 'An action the person refused.',
      },
    ],
  },
  {
    name: 'artifactViews',
    spec: 'design/components/artifact-pane.md',
    doc: "ArtifactPane's `viewsLabel`: the switch's name.",
    english: 'View',
    comment: 'The name of the control that switches between readings of an artifact.',
  },
  {
    name: 'artifactStreaming',
    spec: 'design/components/artifact-pane.md',
    doc: 'What ArtifactPane\'s mark says while the artifact is being written: "{title}: still being written".',
    english: '{title}: still being written',
    parameters: [{ name: 'title', type: 'string' }],
    comment: "An artifact is still being written: the artifact's name.",
  },
  {
    name: 'relativeNow',
    spec: 'design/components/relative-time.md',
    doc: "RelativeTime's phrase for a moment less than a minute away.",
    english: 'now',
    comment: 'A moment that is happening now.',
  },
  {
    name: 'relativeToday',
    spec: 'design/components/relative-time.md',
    doc: "RelativeTime's phrase for a calendar date that is today, Intl's own word for no distance.",
    english: 'today',
    comment: 'The day it is.',
  },
  {
    name: 'relativeYesterday',
    spec: 'design/components/relative-time.md',
    doc: "RelativeTime's phrase for the day before, under `numeric: auto`.",
    english: 'yesterday',
    comment: 'The day before today.',
  },
  {
    name: 'relativeAgo',
    spec: 'design/components/relative-time.md',
    doc: 'RelativeTime\'s phrase for a past moment: the span, then "ago".',
    english: '{time} ago',
    parameters: [{ name: 'time', type: 'string' }],
    comment: 'A span of time before now.',
  },
  {
    name: 'relativeIn',
    spec: 'design/components/relative-time.md',
    doc: "RelativeTime's phrase for a future moment.",
    english: 'in {time}',
    parameters: [{ name: 'time', type: 'string' }],
    comment: 'A span of time after now.',
  },
  {
    name: 'relativeMinutesNarrow',
    spec: 'design/components/relative-time.md',
    doc: 'RelativeTime\'s narrow span of minutes: "5m".',
    english: '{count}m',
    parameters: [{ name: 'count', type: 'number' }],
    comment: 'A number of minutes, abbreviated.',
  },
  {
    name: 'relativeHoursNarrow',
    spec: 'design/components/relative-time.md',
    doc: 'RelativeTime\'s narrow span of hours: "5h".',
    english: '{count}h',
    parameters: [{ name: 'count', type: 'number' }],
    comment: 'A number of hours, abbreviated.',
  },
  {
    name: 'relativeDaysNarrow',
    spec: 'design/components/relative-time.md',
    doc: 'RelativeTime\'s narrow span of days: "5d".',
    english: '{count}d',
    parameters: [{ name: 'count', type: 'number' }],
    comment: 'A number of days, abbreviated.',
  },
  {
    name: 'relativeWeeksNarrow',
    spec: 'design/components/relative-time.md',
    doc: 'RelativeTime\'s narrow span of weeks: "5w".',
    english: '{count}w',
    parameters: [{ name: 'count', type: 'number' }],
    comment: 'A number of weeks, abbreviated.',
  },
  {
    name: 'relativeMonthsNarrow',
    spec: 'design/components/relative-time.md',
    doc: 'RelativeTime\'s narrow span of months: "5mo".',
    english: '{count}mo',
    parameters: [{ name: 'count', type: 'number' }],
    comment: 'A number of months, abbreviated.',
  },
  {
    name: 'relativeYearsNarrow',
    spec: 'design/components/relative-time.md',
    doc: 'RelativeTime\'s narrow span of years: "5y".',
    english: '{count}y',
    parameters: [{ name: 'count', type: 'number' }],
    comment: 'A number of years, abbreviated.',
  },
  {
    name: 'relativeMinute',
    spec: 'design/components/relative-time.md',
    doc: "RelativeTime's long span of one minute.",
    english: '{count} minute',
    parameters: [{ name: 'count', type: 'number' }],
    comment: 'One minute.',
  },
  {
    name: 'relativeMinutes',
    spec: 'design/components/relative-time.md',
    doc: "RelativeTime's long span of any other number of minutes.",
    english: '{count} minutes',
    parameters: [{ name: 'count', type: 'number' }],
    comment: 'A number of minutes.',
  },
  {
    name: 'relativeHour',
    spec: 'design/components/relative-time.md',
    doc: "RelativeTime's long span of one hour.",
    english: '{count} hour',
    parameters: [{ name: 'count', type: 'number' }],
    comment: 'One hour.',
  },
  {
    name: 'relativeHours',
    spec: 'design/components/relative-time.md',
    doc: "RelativeTime's long span of any other number of hours.",
    english: '{count} hours',
    parameters: [{ name: 'count', type: 'number' }],
    comment: 'A number of hours.',
  },
  {
    name: 'relativeDay',
    spec: 'design/components/relative-time.md',
    doc: "RelativeTime's long span of one day.",
    english: '{count} day',
    parameters: [{ name: 'count', type: 'number' }],
    comment: 'One day.',
  },
  {
    name: 'relativeDays',
    spec: 'design/components/relative-time.md',
    doc: "RelativeTime's long span of any other number of days.",
    english: '{count} days',
    parameters: [{ name: 'count', type: 'number' }],
    comment: 'A number of days.',
  },
  {
    name: 'relativeWeek',
    spec: 'design/components/relative-time.md',
    doc: "RelativeTime's long span of one week.",
    english: '{count} week',
    parameters: [{ name: 'count', type: 'number' }],
    comment: 'One week.',
  },
  {
    name: 'relativeWeeks',
    spec: 'design/components/relative-time.md',
    doc: "RelativeTime's long span of any other number of weeks.",
    english: '{count} weeks',
    parameters: [{ name: 'count', type: 'number' }],
    comment: 'A number of weeks.',
  },
  {
    name: 'relativeMonth',
    spec: 'design/components/relative-time.md',
    doc: "RelativeTime's long span of one month.",
    english: '{count} month',
    parameters: [{ name: 'count', type: 'number' }],
    comment: 'One month.',
  },
  {
    name: 'relativeMonths',
    spec: 'design/components/relative-time.md',
    doc: "RelativeTime's long span of any other number of months.",
    english: '{count} months',
    parameters: [{ name: 'count', type: 'number' }],
    comment: 'A number of months.',
  },
  {
    name: 'relativeYear',
    spec: 'design/components/relative-time.md',
    doc: "RelativeTime's long span of one year.",
    english: '{count} year',
    parameters: [{ name: 'count', type: 'number' }],
    comment: 'One year.',
  },
  {
    name: 'relativeYears',
    spec: 'design/components/relative-time.md',
    doc: "RelativeTime's long span of any other number of years.",
    english: '{count} years',
    parameters: [{ name: 'count', type: 'number' }],
    comment: 'A number of years.',
  },
  {
    name: 'relativeUtc',
    spec: 'design/components/relative-time.md',
    doc: "RelativeTime's absolute form on Android when the app provides no words: a date and a 24-hour time in UTC, said as UTC.",
    english: '{moment} UTC',
    parameters: [{ name: 'moment', type: 'string' }],
    comment: 'A date and time in Coordinated Universal Time.',
    // The SwiftUI member reads the reader's zone, so it never says UTC.
    platforms: ['android'],
  },
  {
    name: 'numberInputIncrement',
    spec: 'design/components/number-input.md',
    doc: "The name of NumberInput's step-up button.",
    english: 'Increase',
    comment: 'The button that steps a number up.',
  },
  {
    name: 'numberInputDecrement',
    spec: 'design/components/number-input.md',
    doc: "The name of NumberInput's step-down button.",
    english: 'Decrease',
    comment: 'The button that steps a number down.',
  },
  {
    name: 'tagInputRemove',
    spec: 'design/components/tag-input.md',
    doc: "TagInput's `removeLabel`: a chip's remove button.",
    english: 'Remove {tag}',
    parameters: [{ name: 'tag', type: 'string' }],
    comment: 'The button that removes one tag from a field.',
  },
  {
    name: 'tagInputAdded',
    spec: 'design/components/tag-input.md',
    doc: "TagInput's `countLabel`: the count, part of the field's description.",
    english: '{count} added',
    parameters: [{ name: 'count', type: 'number' }],
    comment: 'How many tags a field holds.',
  },
  {
    name: 'tagInputMaximum',
    spec: 'design/components/tag-input.md',
    doc: "TagInput's `countLabel`: the count once the field holds `max` tags.",
    english: 'Maximum of {max} added',
    parameters: [{ name: 'max', type: 'number' }],
    comment: 'A tag field holds as many tags as it can.',
  },
  {
    name: 'tagInputRemoved',
    spec: 'design/components/tag-input.md',
    doc: 'What TagInput announces when a tag is removed.',
    english: '{tag} removed, {count} remain',
    parameters: [
      { name: 'tag', type: 'string' },
      { name: 'count', type: 'number' },
    ],
    comment: 'Announced when a tag is removed: the tag and how many are left.',
  },
  {
    name: 'calendarMessages',
    type: 'CalendarMessages',
    spec: 'design/components/calendar.md',
    doc: "Calendar's `messages`: the month buttons' names.",
    fields: [
      {
        name: 'previousMonth',
        spec: 'design/components/calendar.md',
        doc: 'The button that shows the month before.',
        english: 'Previous month',
        comment: 'The button that shows the month before.',
      },
      {
        name: 'nextMonth',
        spec: 'design/components/calendar.md',
        doc: 'The button that shows the month after.',
        english: 'Next month',
        comment: 'The button that shows the month after.',
      },
    ],
  },
  {
    name: 'datePickerShowCalendar',
    spec: 'design/components/date-picker.md',
    doc: "DatePicker's and DateRangePicker's `messages.showCalendar`: the calendar button's name.",
    english: 'Show calendar',
    comment: "The button that opens a date field's calendar.",
  },
  {
    name: 'datePickerChooseDate',
    spec: 'design/components/date-picker.md',
    doc: "DatePicker's `messages.chooseDate`: the name of the calendar it opens.",
    english: 'Choose a date',
    comment: 'The name of the calendar a date field opens.',
  },
  {
    name: 'dateRangePickerChooseRange',
    spec: 'design/components/date-range-picker.md',
    doc: "DateRangePicker's `messages.chooseRange`: the name of the calendar it opens.",
    english: 'Choose a date range',
    comment: 'The name of the calendar a date range field opens.',
  },
  {
    name: 'monthInputMessages',
    type: 'MonthInputMessages',
    spec: 'design/components/month-input.md',
    doc: "MonthInput's `messages`.",
    fields: [
      {
        name: 'empty',
        spec: 'design/components/month-input.md',
        doc: 'What an empty month field says as its value.',
        english: 'Empty',
        comment: 'The value of a month field that holds no month yet.',
      },
    ],
  },
  {
    name: 'durationInputMessages',
    type: 'DurationInputMessages',
    spec: 'design/components/duration-input.md',
    doc: "DurationInput's `messages`.",
    fields: [
      {
        name: 'empty',
        spec: 'design/components/duration-input.md',
        doc: 'What an empty count of a duration field says as its value.',
        english: 'Empty',
        comment: 'The value of a count of a length of time that holds no number yet.',
      },
    ],
  },
  ...(
    [
      ['Day', 'day', 'One day'],
      ['Days', 'days', 'A number of days'],
      ['Hour', 'hour', 'One hour'],
      ['Hours', 'hours', 'A number of hours'],
      ['Minute', 'minute', 'One minute'],
      ['Minutes', 'minutes', 'A number of minutes'],
      ['Second', 'second', 'One second'],
      ['Seconds', 'seconds', 'A number of seconds'],
    ] as const
  ).map(([name, word, meaning]): SpecDefault => ({
    name: `duration${name}`,
    spec: 'design/components/duration-input.md',
    doc: `DurationInput's count said with its unit on Android when the app provides no words: "{count} ${word}".`,
    english: `{count} ${word}`,
    parameters: [{ name: 'count', type: 'number' }],
    comment: `${meaning}, said as a length of time.`,
    // The SwiftUI member takes its words from Foundation's duration formatter.
    platforms: ['android'],
  })),
  ...(
    [
      ['DayShort', 'day', 'One day'],
      ['DaysShort', 'days', 'A number of days'],
      ['HoursShort', 'hr', 'A number of hours'],
      ['MinutesShort', 'min', 'A number of minutes'],
      ['SecondsShort', 'sec', 'A number of seconds'],
    ] as const
  ).map(([name, word, meaning]): SpecDefault => ({
    name: `duration${name}`,
    spec: 'design/components/duration-input.md',
    doc: `DurationInput's count with its unit's short word on Android when the app provides no words: "{count} ${word}".`,
    english: `{count} ${word}`,
    parameters: [{ name: 'count', type: 'number' }],
    comment: `${meaning}, abbreviated beside the number in a field.`,
    platforms: ['android'],
  })),
  {
    name: 'phoneInputCountry',
    spec: 'design/components/phone-input.md',
    doc: "PhoneInput's `messages.country`: the country control's name, before the field's label.",
    english: 'Country calling code',
    comment: "The name of the control that chooses a phone number's country.",
  },
  {
    name: 'phoneInputShowCountries',
    spec: 'design/components/phone-input.md',
    doc: "PhoneInput's `messages.showCountries`: the country list button's name.",
    english: 'Show countries',
    comment: 'The button that opens a list of countries.',
  },
  {
    name: 'phoneInputCountriesShown',
    spec: 'design/components/phone-input.md',
    doc: "PhoneInput's `messages.countriesShown`: announced with the number of countries the list shows.",
    english: '{count} countries',
    parameters: [{ name: 'count', type: 'number' }],
    comment: 'How many countries a list shows.',
  },
  {
    name: 'phoneInputNoCountry',
    spec: 'design/components/phone-input.md',
    doc: "PhoneInput's `messages.noCountry`: the list's one row when nothing matches the typed text.",
    english: 'No matching country',
    comment: 'Nothing in the list of countries matches what was typed.',
  },
  {
    name: 'comboboxMessages',
    type: 'ComboboxMessages',
    spec: 'design/components/combobox.md',
    doc: "Combobox's `messages`.",
    fields: [
      {
        name: 'showOptions',
        spec: 'design/components/combobox.md',
        doc: "The chevron's name.",
        english: 'Show options',
        comment: 'The button that opens a list of options.',
      },
      {
        name: 'clear',
        spec: 'design/components/input.md',
        doc: "The clear button's name.",
        english: 'Clear',
        comment: "The accessible name of a text field's clear button.",
      },
      {
        name: 'loadingOptions',
        spec: 'design/components/combobox.md',
        doc: 'Announced while the list loads.',
        english: 'Loading options…',
        comment: 'Announced while a list of options loads.',
      },
      {
        name: 'options',
        spec: 'design/components/combobox.md',
        doc: 'Announced with the number of options the list shows.',
        english: '{count} options',
        parameters: [{ name: 'count', type: 'number' }],
        comment: 'How many options a list shows.',
      },
    ],
  },
  {
    name: 'comboboxEmptyMessage',
    spec: 'design/components/combobox.md',
    doc: "Combobox's `emptyMessage`: the one line an empty list shows.",
    english: 'No results',
    comment: 'A list of options has none to show.',
  },
  {
    name: 'cancel',
    spec: 'design/components/confirm-dialog.md',
    doc: "ConfirmDialog's `cancelLabel`: the action that closes it without confirming.",
    english: 'Cancel',
    comment: 'The action that closes a confirmation without doing what it asks.',
  },
  {
    name: 'confirmWithLabel',
    spec: 'design/components/confirm-dialog.md',
    doc: "ConfirmDialog's `confirmWithLabel`: the label of the field the phrase is typed into.",
    english: 'Type {phrase} to confirm',
    parameters: [{ name: 'phrase', type: 'string' }],
    comment: 'The label of a field a person types a phrase into before a destructive action.',
  },
  {
    name: 'confirmWithError',
    spec: 'design/components/confirm-dialog.md',
    doc: "ConfirmDialog's `confirmWithError`: the field's error while the text cannot become the phrase.",
    english: 'The text does not match',
    comment: 'The text typed into a confirmation field is not the phrase it asks for.',
  },
  {
    name: 'fileUploadTitle',
    spec: 'design/components/file-upload.md',
    doc: "FileUpload's `title`: the dropzone's line, which names the button.",
    english: 'Drop files or click to browse',
    comment: 'The area a person presses, or drops files on, to choose files.',
  },
  {
    name: 'fileUploadRetry',
    spec: 'design/components/file-upload.md',
    doc: "FileUpload's `messages.retry`: the retry button's name on a failed row.",
    english: 'Retry',
    comment: 'The button that uploads a file that failed again.',
  },
  {
    name: 'fileUploadRemove',
    spec: 'design/components/file-upload.md',
    doc: "FileUpload's `messages.remove`: a row's remove button's name.",
    english: 'Remove {name}',
    parameters: [{ name: 'name', type: 'string' }],
    comment: 'The button that removes a file from the list, by its name.',
  },
  {
    name: 'fileUploadProgress',
    spec: 'design/components/file-upload.md',
    doc: "FileUpload's `messages.progress`: an uploading row's progress bar's name.",
    english: '{name} upload progress',
    parameters: [{ name: 'name', type: 'string' }],
    comment: 'How far a file has uploaded, by its name.',
  },
  {
    name: 'fileUploadDone',
    spec: 'design/components/file-upload.md',
    doc: 'Announced when a file finishes uploading.',
    english: '{name} uploaded',
    parameters: [{ name: 'name', type: 'string' }],
    comment: 'A file has finished uploading.',
  },
  {
    name: 'fileUploadFailed',
    spec: 'design/components/file-upload.md',
    doc: 'Announced when a file fails to upload and its row carries no message.',
    english: '{name} failed',
    parameters: [{ name: 'name', type: 'string' }],
    comment: 'A file has failed to upload.',
  },
  {
    name: 'fileUploadFailedWith',
    spec: 'design/components/file-upload.md',
    doc: "Announced when a file fails to upload, with its row's message.",
    english: '{name} failed: {message}',
    parameters: [
      { name: 'name', type: 'string' },
      { name: 'message', type: 'string' },
    ],
    comment: 'A file has failed to upload, and why.',
  },
  {
    name: 'multiSelectAdd',
    spec: 'design/components/multi-select.md',
    doc: "MultiSelect's `messages.add`: the row that offers typed text as a new value.",
    english: 'Add "{text}"',
    parameters: [{ name: 'text', type: 'string' }],
    comment: 'The row that adds what was typed as a new value.',
  },
  {
    name: 'multiSelectAdded',
    spec: 'design/components/multi-select.md',
    doc: "MultiSelect's `messages.added`: announced when a value is added.",
    english: '{value} added, {count} selected',
    parameters: [
      { name: 'value', type: 'string' },
      { name: 'count', type: 'number' },
    ],
    comment: 'A value was chosen, and how many are chosen now.',
  },
  {
    name: 'multiSelectRemoved',
    spec: 'design/components/multi-select.md',
    doc: "MultiSelect's `messages.removed`: announced when a value is removed.",
    english: '{label} removed, {count} selected',
    parameters: [
      { name: 'label', type: 'string' },
      { name: 'count', type: 'number' },
    ],
    comment: 'A value was removed, and how many are chosen now.',
  },
  {
    name: 'multiSelectSelected',
    spec: 'design/components/multi-select.md',
    doc: "MultiSelect's `messages.selected` below its maximum: the field's count.",
    english: '{count} selected',
    parameters: [{ name: 'count', type: 'number' }],
    comment: 'How many values are chosen.',
  },
  {
    name: 'multiSelectMaximum',
    spec: 'design/components/multi-select.md',
    doc: "MultiSelect's `messages.selected` at its maximum: the field's count.",
    english: 'Maximum of {max} selected',
    parameters: [{ name: 'max', type: 'number' }],
    comment: 'The field holds as many values as it can.',
  },
  {
    name: 'multiSelectShowOptions',
    spec: 'design/components/multi-select.md',
    doc: "MultiSelect's `messages.showOptions`: the chevron's name.",
    english: 'Show options',
    comment: 'The button that opens a list of options.',
  },
  {
    name: 'multiSelectRemove',
    spec: 'design/components/multi-select.md',
    doc: "MultiSelect's `messages.remove`: a chip's remove button's name.",
    english: 'Remove {label}',
    parameters: [{ name: 'label', type: 'string' }],
    comment: 'The button that removes a chosen value, by its label.',
  },
  {
    name: 'multiSelectLoading',
    spec: 'design/components/multi-select.md',
    doc: "MultiSelect's `messages.loadingOptions`: announced while the list loads.",
    english: 'Loading options',
    comment: 'Announced while a list of options loads.',
  },
  {
    name: 'multiSelectEmpty',
    spec: 'design/components/multi-select.md',
    doc: "MultiSelect's `emptyMessage`: the row a list with no matches shows.",
    english: 'No results',
    comment: 'Nothing in the list matches what was typed.',
  },
  {
    name: 'multiSelectRefused',
    spec: 'design/components/multi-select.md',
    doc: "MultiSelect's `messages.refused`: announced when `validate` refuses the typed text.",
    english: 'Cannot add "{text}"',
    parameters: [{ name: 'text', type: 'string' }],
    comment: 'Typed text cannot be added as a value.',
  },
  {
    name: 'multiSelectAlreadySelected',
    spec: 'design/components/multi-select.md',
    doc: "MultiSelect's `messages.alreadySelected`: announced when the typed text is a chosen value.",
    english: '"{value}" is already selected',
    parameters: [{ name: 'value', type: 'string' }],
    comment: 'Typed text names a value that is chosen already.',
  },
  {
    name: 'multiSelectOptions',
    spec: 'design/components/multi-select.md',
    doc: "MultiSelect's `messages.options`: announced with the number of options the list shows.",
    english: '{count} options',
    parameters: [{ name: 'count', type: 'number' }],
    comment: 'How many options a list shows.',
  },
  {
    name: 'meterMessages',
    type: 'MeterMessages',
    spec: 'design/components/meter.md',
    doc: "Meter's `messages`: the status glyph's names.",
    fields: [
      {
        name: 'warning',
        spec: 'design/components/meter.md',
        doc: 'The status glyph’s name in the warning band.',
        english: 'High',
        comment: 'Names the mark beside a meter whose value is past its warning threshold.',
      },
      {
        name: 'danger',
        spec: 'design/components/meter.md',
        doc: 'The status glyph’s name in the danger band.',
        english: 'Critical',
        comment: 'Names the mark beside a meter whose value is past its danger threshold.',
      },
    ],
  },
  {
    name: 'ratingStar',
    spec: 'design/components/rating.md',
    doc: "Rating's `messages.mark` for the first mark: its name, from its numeral.",
    english: '{numeral} star',
    parameters: [{ name: 'numeral', type: 'string' }],
    comment: 'The name of the first mark of a star rating, which sets a score of one.',
  },
  {
    name: 'ratingStars',
    spec: 'design/components/rating.md',
    doc: "Rating's `messages.mark` for any other mark: its name, from its numeral.",
    english: '{numeral} stars',
    parameters: [{ name: 'numeral', type: 'string' }],
    comment: 'The name of a mark of a star rating, which sets a score of more than one.',
  },
  {
    name: 'ratingShown',
    spec: 'design/components/rating.md',
    doc: "Rating's `messages.shown`: a shown rating's name, one sentence.",
    english: '{label}: {value} out of {max}',
    parameters: [
      { name: 'label', type: 'string' },
      { name: 'value', type: 'string' },
      { name: 'max', type: 'string' },
    ],
    comment: 'A score shown as stars: what is rated, the score, and the most it can be.',
  },
  {
    name: 'countdownMark',
    spec: 'design/components/countdown.md',
    doc: "Countdown's `messages.mark`: the line said at one minute and at ten seconds left.",
    english: '{label}: {time}',
    parameters: [
      { name: 'label', type: 'string' },
      { name: 'time', type: 'string' },
    ],
    comment: 'What a countdown counts to, then the time left in words.',
  },
  {
    name: 'countdownSecond',
    spec: 'design/components/countdown.md',
    doc: "Countdown's spoken time left: one second.",
    english: '{count} second',
    parameters: [{ name: 'count', type: 'number' }],
    comment: 'One second.',
    platforms: ['android'],
  },
  {
    name: 'countdownSeconds',
    spec: 'design/components/countdown.md',
    doc: "Countdown's spoken time left: any other number of seconds.",
    english: '{count} seconds',
    parameters: [{ name: 'count', type: 'number' }],
    comment: 'A number of seconds.',
    platforms: ['android'],
  },
  {
    name: 'inlineEditMessages',
    type: 'InlineEditMessages',
    spec: 'design/components/inline-edit.md',
    doc: "InlineEdit's `messages`: the names of its three controls.",
    fields: [
      {
        name: 'edit',
        spec: 'design/components/inline-edit.md',
        doc: 'The edit control’s name, made from the field’s label.',
        english: 'Edit {label}',
        parameters: [{ name: 'label', type: 'string' }],
        comment: 'The button that opens a value for editing in place, by the value’s name.',
      },
      {
        name: 'save',
        spec: 'design/components/inline-edit.md',
        doc: 'The save control’s name.',
        english: 'Save',
        comment: 'The button that saves a value edited in place.',
      },
      {
        name: 'cancel',
        spec: 'design/components/inline-edit.md',
        doc: 'The cancel control’s name.',
        english: 'Cancel',
        comment: 'The button that closes a value edited in place without saving it.',
      },
    ],
  },
  {
    name: 'modeLight',
    spec: 'design/components/mode-switch.md',
    doc: "ModeSwitch's `messages.light`: the segment that pins the light mode.",
    english: 'Light',
    comment: 'Chooses the light colour mode.',
    platforms: ['android'],
  },
  {
    name: 'modeDark',
    spec: 'design/components/mode-switch.md',
    doc: "ModeSwitch's `messages.dark`: the segment that pins the dark mode.",
    english: 'Dark',
    comment: 'Chooses the dark colour mode.',
    platforms: ['android'],
  },
  {
    name: 'modeSystem',
    spec: 'design/components/mode-switch.md',
    doc: "ModeSwitch's `messages.system`: the segment that follows the system's mode.",
    english: 'System',
    comment: 'Chooses to follow the colour mode the system sets.',
    platforms: ['android'],
  },
]

/** A default's text as a pattern: each space any run of white space, because a spec's lines are wrapped. */
const escape = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ +/g, String.raw`\s+`)

/**
 * The text a spec must hold for a default with parameters: its literal parts
 * in order, each `{parameter}` at least one character within a line. A spec
 * that rewords any part of a default, or reorders it, no longer matches.
 */
export function specPattern(english: string): RegExp {
  return new RegExp(
    english
      .split(/\{\w+\}/)
      .map(escape)
      .join('.+?'),
  )
}

/**
 * Whether `spec` names `english` as a default. A default with parameters is
 * held to `specPattern`. A default without them is a word or a phrase, which
 * a spec uses in other senses too (a dialog's "Close" is also its close
 * button), so the spec must name it as text: quoted (`"Close"`, `'Close'`,
 * `` `Close` ``), after the word "default" or "defaults" on its line (`default
 * Allow`, `defaults Allowed / Denied`), as one of a template's alternatives
 * (`{completed|current|not started}`), or as the whole cell of a table's
 * Default column.
 */
export function specNames(english: string, spec: string): boolean {
  if (/\{\w+\}/.test(english)) return specPattern(english).test(spec)
  const text = escape(english)
  const quoted = new RegExp(String.raw`["'\`“‘]${text}["'\`”’]`)
  const afterDefault = new RegExp(
    String.raw`\b[Dd]efaults?:?[ \t]+(?:[^\n|]*?[ \t]/[ \t]+)?${text}(?![\w-])`,
  )
  const alternative = new RegExp(String.raw`\{(?:[^}|\n]*\|)*${text}(?:\|[^}|\n]*)*\}`)
  return (
    quoted.test(spec) ||
    afterDefault.test(spec) ||
    alternative.test(spec) ||
    inDefaultColumn(english, spec)
  )
}

/** Whether a cell of a table's Default column is `english`, bare or quoted. */
function inDefaultColumn(english: string, spec: string): boolean {
  const cells = (line: string) =>
    line
      .trim()
      .replace(/^\||\|$/g, '')
      .split(/(?<!\\)\|/)
      .map((cell) => cell.trim())
  let column = -1
  for (const line of spec.split('\n')) {
    if (!line.trim().startsWith('|')) {
      column = -1
      continue
    }
    const row = cells(line)
    if (column === -1) {
      column = row.findIndex((cell) => /^default$/i.test(cell))
      continue
    }
    if (row[column]?.replace(/^["'`“‘]|["'`”’]$/g, '') === english) return true
  }
  return false
}
