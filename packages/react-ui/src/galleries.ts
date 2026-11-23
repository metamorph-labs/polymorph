import { states as barChart } from './charts/bar-chart.states'
import { states as funnelChart } from './charts/funnel-chart.states'
import { states as histogram } from './charts/histogram.states'
import { states as lineChart } from './charts/line-chart.states'
import { states as radarChart } from './charts/radar-chart.states'
import { states as scatterChart } from './charts/scatter-chart.states'
import { states as sparkline } from './charts/sparkline.states'
import { states as areaChart } from './charts/area-chart.states'
import { states as heatmap } from './charts/heatmap.states'
import { states as donutChart } from './charts/donut-chart.states'
import { states as treemap } from './charts/treemap.states'
import { states as avatarButton } from './controls/avatar-button.states'
import { states as button } from './controls/button.states'
import { states as calendar } from './controls/calendar.states'
import { states as checkbox } from './controls/checkbox.states'
import { states as checkboxGroup } from './controls/checkbox-group.states'
import { states as choiceCard } from './controls/choice-card.states'
import { states as colorInput } from './controls/color-input.states'
import { states as combobox } from './controls/combobox.states'
import { states as copyButton } from './controls/copy-button.states'
import { states as datePicker } from './controls/date-picker.states'
import { states as dateRangePicker } from './controls/date-range-picker.states'
import { states as durationInput } from './controls/duration-input.states'
import { states as fileUpload } from './controls/file-upload.states'
import { states as formField } from './controls/form-field.states'
import { states as imageEditor } from './controls/image-editor.states'
import { states as inlineEdit } from './controls/inline-edit.states'
import { states as input } from './controls/input.states'
import { states as link } from './controls/link.states'
import { states as modeSwitch } from './controls/mode-switch.states'
import { states as monthInput } from './controls/month-input.states'
import { states as multiSelect } from './controls/multi-select.states'
import { states as numberInput } from './controls/number-input.states'
import { states as oTPInput } from './controls/otp-input.states'
import { states as passwordInput } from './controls/password-input.states'
import { states as phoneInput } from './controls/phone-input.states'
import { states as providerButton } from './controls/provider-button.states'
import { states as radio } from './controls/radio.states'
import { states as recordButton } from './controls/record-button.states'
import { states as rating } from './controls/rating.states'
import { states as richTextInput } from './controls/rich-text-input.states'
import { states as searchInput } from './controls/search-input.states'
import { states as segmentedControl } from './controls/segmented-control.states'
import { states as select } from './controls/select.states'
import { states as slider } from './controls/slider.states'
import { states as splitButton } from './controls/split-button.states'
import { states as approvalCard } from './ai/approval-card.states'
import { states as artifactPane } from './ai/artifact-pane.states'
import { states as attachmentChip } from './ai/attachment-chip.states'
import { states as chatMessage } from './ai/chat-message.states'
import { states as chatThread } from './ai/chat-thread.states'
import { states as citation } from './ai/citation.states'
import { states as markdown } from './ai/markdown.states'
import { states as plan } from './ai/plan.states'
import { states as promptInput } from './ai/prompt-input.states'
import { states as reasoningDisclosure } from './ai/reasoning-disclosure.states'
import { states as sourceList } from './ai/source-list.states'
import { states as streamingText } from './ai/streaming-text.states'
import { states as toolCall } from './ai/tool-call.states'
import { states as switchStates } from './controls/switch.states'
import { states as tagInput } from './controls/tag-input.states'
import { states as textarea } from './controls/textarea.states'
import { states as timeInput } from './controls/time-input.states'
import { states as treeSelect } from './controls/tree-select.states'
import { type ComponentStates } from '@polymorph/react'
import { states as icon } from './conventions/icon.states'
import { states as grid } from './layout/grid.states'
import { states as inline } from './layout/inline.states'
import { states as splitPane } from './layout/split-pane.states'
import { states as stack } from './layout/stack.states'
import { states as appShell } from './archetypes/app-shell.states'
import { states as authPage } from './archetypes/auth-page.states'
import { states as conversationPage } from './archetypes/conversation-page.states'
import { states as dashboard } from './archetypes/dashboard.states'
import { states as detailPage } from './archetypes/detail-page.states'
import { states as formPage } from './archetypes/form-page.states'
import { states as listPage } from './archetypes/list-page.states'
import { states as masterDetailPage } from './archetypes/master-detail-page.states'
import { states as searchPage } from './archetypes/search-page.states'
import { states as settingsPage } from './archetypes/settings-page.states'
import { states as command } from './overlays/command.states'
import { states as confirmDialog } from './overlays/confirm-dialog.states'
import { states as contextMenu } from './overlays/context-menu.states'
import { states as dialog } from './overlays/dialog.states'
import { states as drawer } from './overlays/drawer.states'
import { states as hoverCard } from './overlays/hover-card.states'
import { states as lightbox } from './overlays/lightbox.states'
import { states as menu } from './overlays/menu.states'
import { states as menubar } from './overlays/menubar.states'
import { states as popover } from './overlays/popover.states'
import { states as tabs } from './overlays/tabs.states'
import { states as toastStates } from './overlays/toast.states'
import { states as tooltip } from './overlays/tooltip.states'
import { states as tour } from './overlays/tour.states'
import { states as accordion } from './structure/accordion.states'
import { states as alert } from './structure/alert.states'
import { states as audioPlayer } from './structure/audio-player.states'
import { states as avatar } from './structure/avatar.states'
import { states as badge } from './structure/badge.states'
import { states as banner } from './structure/banner.states'
import { states as breadcrumbs } from './structure/breadcrumbs.states'
import { states as card } from './structure/card.states'
import { states as carousel } from './structure/carousel.states'
import { states as code } from './structure/code.states'
import { states as codeBlock } from './structure/code-block.states'
import { states as collapsible } from './structure/collapsible.states'
import { states as commentThread } from './structure/comment-thread.states'
import { states as countdown } from './structure/countdown.states'
import { states as cursorPagination } from './structure/cursor-pagination.states'
import { states as dataTable } from './structure/data-table.states'
import { states as descriptionList } from './structure/description-list.states'
import { states as diff } from './structure/diff.states'
import { states as emptyState } from './structure/empty-state.states'
import { states as errorSummary } from './structure/error-summary.states'
import { states as filterBar } from './structure/filter-bar.states'
import { states as heading } from './structure/heading.states'
import { states as hero } from './structure/hero.states'
import { states as highlight } from './structure/highlight.states'
import { states as image } from './structure/image.states'
import { states as jsonTree } from './structure/json-tree.states'
import { states as kbd } from './structure/kbd.states'
import { states as list } from './structure/list.states'
import { states as logView } from './structure/log-view.states'
import { states as meter } from './structure/meter.states'
import { states as pageHeader } from './structure/page-header.states'
import { states as pagination } from './structure/pagination.states'
import { states as progress } from './structure/progress.states'
import { states as qRCode } from './structure/qr-code.states'
import { states as relativeTime } from './structure/relative-time.states'
import { states as richTextContent } from './structure/rich-text-content.states'
import { states as scrollArea } from './structure/scroll-area.states'
import { states as sectionNav } from './structure/section-nav.states'
import { states as separator } from './structure/separator.states'
import { states as settingsRow } from './structure/settings-row.states'
import { states as stat } from './structure/stat.states'
import { states as stepper } from './structure/stepper.states'
import { states as tableOfContents } from './structure/table-of-contents.states'
import { states as timeline } from './structure/timeline.states'
import { states as skeleton } from './structure/skeleton.states'
import { states as spinner } from './structure/spinner.states'
import { states as table } from './structure/table.states'
import { states as text } from './structure/text.states'
import { states as tree } from './structure/tree.states'

/**
 * Every states fixture in the package, in gallery order.
 *
 * A separate entry point (`@polymorph/react-ui/galleries`) rather than part of the
 * package root, so a real application never bundles the fixtures. It has two
 * consumers: the workbench gallery harness and the completeness law
 * (`laws.test.tsx`), which needs the same list to know what to check.
 */
export const GALLERIES: readonly ComponentStates[] = [
  icon,
  stack,
  inline,
  grid,
  // the workbench layout, beside the layout primitives it divides space between
  splitPane,
  heading,
  text,
  code,
  codeBlock,
  // a stored rich-text document drawn through the vocabulary, after the code block it draws
  richTextContent,
  // the structure of one value, beside the code blocks it would otherwise be pasted into
  jsonTree,
  // two values compared, beside the blocks that each show one
  diff,
  // the parts of a text that match, beside the diff that marks what changed
  highlight,
  // lines that arrive over time, beside the blocks that show one finished text
  logView,
  // a string encoded for a camera, beside the blocks that show strings to a person
  qRCode,
  // the styling for regions that are allowed to scroll, beside CodeBlock,
  // whose scroll region's space reservation and label rule it cites
  scrollArea,
  // inline text, not a widget, so it sits with the text tier it inherits from
  relativeTime,
  // the time left until a moment, ticking; inline text beside the timestamp
  countdown,
  button,
  // a Button preset, as SearchInput is an Input preset
  copyButton,
  // another Button preset, for a recording the application makes
  recordButton,
  // another Button preset, for a sign-in provider's own mark
  providerButton,
  // another Button preset, whose face is an Avatar
  avatarButton,
  // one command with variants: Button's two halves, with Menu behind the chevron
  splitButton,
  input,
  // the parsed-number field, beside the string field it differs from
  numberInput,
  select,
  combobox,
  // multi-value selection from a closed list: Combobox's filter, TagInput's chips
  multiSelect,
  // Select's field with Tree in its popup: one node of a hierarchy
  treeSelect,
  searchInput,
  // an Input preset for secrets, beside the preset for search
  passwordInput,
  // one-time codes, which are not secrets, beside the field for secrets
  oTPInput,
  textarea,
  // Textarea's counterpart for text that carries formatting
  richTextInput,
  tagInput,
  fileUpload,
  checkbox,
  radio,
  // RadioGroup's counterpart for multiple choices
  checkboxGroup,
  // single selection in toolbar form: Radio's behaviour as a toolbar control
  // that always holds a value
  segmentedControl,
  // its preset for the page's colour mode
  modeSwitch,
  // radio/checkbox semantics on a card, for choices that need more explanation
  choiceCard,
  switchStates,
  slider,
  // a score out of a few marks: a radio group's choice drawn as a row of stars
  rating,
  datePicker,
  calendar,
  // the range picker, after the calendar grid its popup extends with range cells
  dateRangePicker,
  // a month and a year in DatePicker's segments, with no popup
  monthInput,
  // DatePicker's segments on their own, the last of the date/time family
  timeInput,
  durationInput,
  // the colour field, beside the other value fields with a popup assist
  colorInput,
  // a country and a national number reported as one value, beside the other compound fields
  phoneInput,
  formField,
  // a value shown as text that opens a field in place, beside the wrapper whose error it shares
  inlineEdit,
  imageEditor,
  link,
  dialog,
  confirmDialog,
  drawer,
  lightbox,
  command,
  popover,
  // Popover's surface, one step at a time, pointing at the parts of a page
  tour,
  menu,
  // Menu's command list on right-click or long-press
  contextMenu,
  // Menu's command lists, one per title, along an application's row
  menubar,
  tabs,
  tooltip,
  // the preview between Tooltip and Popover, beside the hint it differs from
  hoverCard,
  toastStates,
  alert,
  // Alert's danger tone with links to the fields in error
  errorSummary,
  // the notice of the frame, beside the callout of a page
  banner,
  card,
  accordion,
  // the lone disclosure, beside the disclosure list
  collapsible,
  badge,
  avatar,
  // a picture as content, beside the identity mark it is not
  image,
  // a recording played in place, beside the picture shown in place
  audioPlayer,
  separator,
  kbd,
  spinner,
  progress,
  // a measured value against a limit, beside Progress's task
  meter,
  stepper,
  // a sequence of past events, next to Stepper's sequence in progress
  timeline,
  // Timeline's counterpart for facts instead of events
  descriptionList,
  skeleton,
  // one item read as a whole, where a table compares fields down its columns
  list,
  // List's counterpart for items that hold items
  tree,
  // comments on a record and their replies: a body each, where a list item has a title
  commentThread,
  table,
  dataTable,
  filterBar,
  pagination,
  // the pager for a list that has a next and no count
  cursorPagination,
  stat,
  settingsRow,
  breadcrumbs,
  sectionNav,
  tableOfContents,
  pageHeader,
  // the display tier: PageHeader's alternative; a page uses one of the two
  hero,
  // the display tier's sequence: slides the reader moves through, never auto-rotated
  carousel,
  emptyState,
  /*
   * The charts.
   *
   * The reading order is content → data → pages, so chart members go here:
   * after the structure tier they read from and before the archetypes that
   * contain them. `pnpm new:member <Name> --tier charts` appends to the end of
   * this array, so a new chart must be moved up into this block by hand. That
   * one edit keeps the reading order correct.
   */
  barChart,
  lineChart,
  sparkline,
  areaChart,
  heatmap,
  donutChart,
  scatterChart,
  histogram,
  radarChart,
  funnelChart,
  treemap,
  /*
   * The conversation tier, after the charts it may contain and before the pages
   * that contain it. Reading order: streaming text, its rendering, the
   * composer, the message and the thread, then what a message carries (the
   * plan, tools, the permission request, sources), and the side pane.
   */
  streamingText,
  markdown,
  attachmentChip,
  promptInput,
  chatMessage,
  chatThread,
  plan,
  toolCall,
  approvalCard,
  citation,
  sourceList,
  reasoningDisclosure,
  artifactPane,
  appShell,
  listPage,
  detailPage,
  formPage,
  settingsPage,
  dashboard,
  authPage,
  masterDetailPage,
  searchPage,
  conversationPage,
]

export { FixtureBox } from './conventions/FixtureBox'
export type { FixtureBoxProps } from './conventions/FixtureBox'
