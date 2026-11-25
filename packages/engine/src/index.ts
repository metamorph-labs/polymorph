/**
 * `@polymorph/engine`: the part of the system a consumer installs, on any web
 * framework.
 *
 * The engine contains the code that makes decisions. Components contain the code
 * that renders, and the consumer owns them. The engine is the theme engine and
 * its tokens, the framework-free conventions every component is written against,
 * the icon roles, the motion engine and the build-time theme compiler. It is
 * versioned, upgraded by semver, and never edited by a consumer. It contains no
 * framework. The React parts (`Icon`, `BrandMark`, the motion presence
 * components, the hooks and the conventions typed with React's element types)
 * are in `@polymorph/react`, which re-exports this package whole, so a React
 * member imports one package.
 *
 * Framework-free is not DOM-free. The theme runtime (re-exported here, and on its
 * own as `@polymorph/engine/runtime`), the test helpers (`@polymorph/engine/testing`)
 * and the motion engine's environment reader and animator touch the document by
 * design. They touch it only when called, so every entry still imports in plain
 * Node.
 *
 * Three things are intentionally not in this file.
 *
 * **The helpers one member family needs** are subpaths: the QR encoder
 * (`@polymorph/engine/qr`), the chart marks' paths over `d3-shape`
 * (`@polymorph/engine/charts`), the Markdown parser
 * (`@polymorph/engine/markdown`), the rich-text document
 * (`@polymorph/engine/rich-text`) and the rich-text editor over ProseMirror
 * (`@polymorph/engine/rich-text-editor`). An application that imports the root
 * for its theme does not load them. Each foundation re-exports them, so a member
 * reaches them where it reaches the rest of the engine.
 *
 * **The motion engine** is a subpath (`@polymorph/engine/motion`), not a root
 * export. Its containment law (`docs/motion.md`) makes it visible to component
 * internals only. Exporting `resolveBinding` here would give it to application
 * code, which the law forbids, because motion choreography belongs to component
 * state and not to screens.
 *
 * **The shared CSS conventions** (the focus ring, the state-feedback
 * transitions, the visually-hidden helper) are not here either. A CSS Modules
 * `composes … from` cannot resolve a bare package specifier (postcss reports
 * "the returned path from the fileResolve option must be absolute"), so those
 * files cannot live in the engine. They also should not: a focus ring is a
 * system-tuned visual choice, and visual choices belong to the consumer. They
 * ship in `@polymorph/recipes` (`src/conventions/`), beside the recipes that
 * compose them.
 */

/* The whole theme package. A consumer that installs the engine gets the theme
   engine, the axes, the seeds, the roles, the contrast law and the runtime, all
   in one version. */
export * from '@polymorph/theme'

/* The agent registry: each mounted member's handle, which the bridge
   (`@polymorph/engine/agent`) reads, and the two DOM helpers a member's
   actions write through. The bridge itself is a subpath. */
export { agentFill, agentMember, agentPress } from './conventions/agent'
export {
  chooseMenuEntry,
  chooseMenubarEntry,
  menuChoices,
  menubarChoices,
} from './conventions/menu-choices'
export type { MenuChoice, MenuChoiceEntry, MenubarChoiceMenu } from './conventions/menu-choices'
export {
  currentRailDestination,
  goToRailDestination,
  railDestinations,
} from './conventions/rail-destinations'
export type { RailClasses, RailDestination } from './conventions/rail-destinations'
export { chooseListItem, currentListItem, listItems } from './conventions/list-items'
export type { ListItemChoice } from './conventions/list-items'
export {
  jsonTreeBranches,
  jsonTreeExpanded,
  setJsonTreeBranch,
} from './conventions/json-tree-branches'
export type { JsonTreeBranch } from './conventions/json-tree-branches'
export { pressTableSort, tableSort, tableSortColumns } from './conventions/table-sort'
export type { TableSortColumn, TableSortDirection, TableSortState } from './conventions/table-sort'
export {
  CHART_MARK_CAP,
  chartMarks,
  chartPosition,
  chooseChartMark,
  readChartPosition,
} from './conventions/chart-marks'
export type { ChartMarkChoice, ChartMarkReading, ChartMarkSource } from './conventions/chart-marks'
export { chartHiddenSeries, chartSeries, toggleChartSeries } from './conventions/chart-legend'
export type { ChartLegendSeries, ChartSeriesChoice } from './conventions/chart-legend'
export { brushChartRange, chartRange } from './conventions/chart-range'
export type { ChartRange, ChartRangeSource } from './conventions/chart-range'
export type {
  AgentAction,
  AgentArgumentType,
  AgentArgumentValues,
  AgentHandle,
} from './conventions/agent'

export { dataAttrs, dataFlag, memberAttr } from './conventions/attrs'
export type { StateAttributeInput, StateAttributes, StateName } from './conventions/attrs'

export { fitTextarea } from './conventions/autosize'

export { composingKey } from './conventions/composition'
export { holdFieldEscape } from './conventions/field-escape'
export { lineStartKey } from './conventions/line-keys'
export { focusAfterListRemoval } from './conventions/removal-focus'
export type { PressedRemoval } from './conventions/removal-focus'

export { formatBytes, gateFiles } from './conventions/files'
export type { FileGate, FileRejection, FileRejectionReason } from './conventions/files'

export { promptPick, promptToken } from './conventions/prompt-token'
export type { PromptToken, PromptTokenTrigger } from './conventions/prompt-token'
export { clockTime, pauseOtherPlayers, spokenDuration } from './conventions/audio'

export { avatarTone, initialsOf } from './conventions/avatar'
export type { AvatarTone } from './conventions/avatar'

export { COLOR_INPUT_REST } from './conventions/color-input'

export {
  calendarDateOf,
  dateFieldDraft,
  dateFieldValue,
  dateOutOfBounds,
  eraseSegment,
  fieldSegments,
  monthDraft,
  monthFieldValue,
  monthOutOfBounds,
  segmentValueText,
  stepSegment,
  timeDraft,
  timeFieldValue,
  timeOfDraft,
  typeIntoSegment,
} from './dates/segments'
// The values an agent sets on a date member, read from their ISO 8601 text.
export { agentDate, agentDateRange, agentDateTime, agentMonth, agentTime } from './dates/agent'
export type {
  DateBounds,
  DateFieldDraft,
  DateFieldOptions,
  DateFieldPart,
  DateFieldSegment,
  DateFieldValue,
  DateSegmentType,
  TimeOfDay,
} from './dates/segments'

/*
 * The date and time values every framework's date fields take and report,
 * from the substrate the React members use, so a Vue, Svelte or Solid
 * application constructs them from its own foundation (`new Time(9, 0)`).
 */
export { CalendarDate, CalendarDateTime, Time } from '@internationalized/date'

export { controlKindOf } from './conventions/kind'
export type { ControlComponent, ControlKind } from './conventions/kind'

export { modalFocusTarget } from './conventions/modal-focus'
export type { InitialFocus, ModalPart } from './conventions/modal-focus'
/* Where focus goes when the control an overlay returns to, or the region that holds focus,
   has left the page. */
export {
  focusAfterRemoval,
  focusPlace,
  focusReturnTarget,
  nearestFocusable,
  returnFocusTo,
} from './conventions/focus-after-removal'
export type { FocusPlace } from './conventions/focus-after-removal'

/* The focus and key handling a Zag machine leaves to its renderer, the trigger
   anchor of an overlay whose trigger is a governed control, and the development
   warning, for the foundations of frameworks that are not React. They read the
   document and no framework. */
export { devWarning } from './conventions/dev'

export { followHighlight, returnFocus, roveRadio } from './conventions/roving'

export { revealInline } from './conventions/reveal'

/* A toolbar's roving tab stop and keys, and the places of a bar at the selected
   text and of a list at a token, which every framework's RichTextInput draws by. */
export {
  enterToolbar,
  holdToolbarEscape,
  syncToolbarStop,
  toolbarFocusIn,
  toolbarFocusOut,
  toolbarKeydown,
  toolbarLosesFocus,
  toolbarPress,
  toolbarStop,
  watchToolbarStop,
} from './conventions/toolbar'
export type { ToolbarStop } from './conventions/toolbar'
export {
  followSelectionBar,
  placeSelectionBar,
  placeTokenList,
  visibleBox,
  visibleViewport,
} from './conventions/selection-bar'
export type { ViewportBox } from './conventions/selection-bar'
/* A press on the label FormField names a group by, which focuses the group's text; focus
   entering and leaving a field of several parts; and a form's reset reaching it. */
export { focusOnLabelPress } from './conventions/label-press'
export { followFieldFocus, followFormReset, inField } from './conventions/field-focus'
export type { FieldFocusHooks } from './conventions/field-focus'
/* A reader's selection in a RichTextContent and a press or a key on one of its highlights, which
   every framework's RichTextContent reads by. */
export {
  mapRichTextSelection,
  RICH_TEXT_STOP,
  richTextKeyedAnnotation,
  richTextPressedAnnotation,
  richTextSelectionBox,
} from './conventions/rich-text-selection'
export type { RichTextSelectionFound } from './conventions/rich-text-selection'

/* A scroll region held at its end while content arrives, which every
   framework's ChatThread and LogView follow by. */
export { FOLLOW_SLACK_PX, followEnd, jumpToEnd } from './conventions/follow'
export type { FollowState } from './conventions/follow'
/* DurationInput's arithmetic: what every framework's DurationInput draws and what its keys do. */
export {
  agentDuration,
  commitDuration,
  durationDraft,
  durationKey,
  durationSegments,
  typeIntoDuration,
} from './conventions/duration'
export type {
  DurationDraft,
  DurationFieldOptions,
  DurationKey,
  DurationKeyResult,
  DurationMessages,
  DurationSegment,
  DurationUnit,
} from './conventions/duration'
/* The section of a page the reader is in, which every framework's
   TableOfContents marks by. */
export { jumpToSection, SECTION_LINE, watchSections } from './conventions/sections'
/* Where focus goes when a MasterDetailPage changes what it draws, in every framework. */
export {
  MASTER_DETAIL_PART,
  masterDetailFocus,
  masterDetailHolds,
} from './conventions/master-detail'
export {
  menubarEdge,
  menubarEntries,
  menubarHandOff,
  menubarNeighbour,
  menubarOpens,
  menubarStep,
  menubarStop,
  roveMenubar,
} from './conventions/menubar'
export type {
  MenubarEnd,
  MenubarKeyEvent,
  MenubarMenuEntries,
  MenubarPlace,
  MenubarTitle,
} from './conventions/menubar'

export { readDirection, watchDirection } from './conventions/direction'
export type { ReadingDirection } from './conventions/direction'

/* The theme as data, for another library's component that takes its colours,
   radii, type and spacing through a JavaScript API (`docs/rules.md`, rung 4). */
export {
  formatColor,
  parseColor,
  readThemeValues,
  themeVersion,
  UNTHEMED_VALUES,
  watchTheme,
} from './conventions/theme-values'
export type {
  ColorChannels,
  ThemeTextStyle,
  ThemeValues,
  ThemeValuesSource,
} from './conventions/theme-values'

export { anchorFocusReturns, anchorProps, syncTriggerAnchor } from './conventions/trigger-anchor'
export type { FocusHandlerNames } from './conventions/trigger-anchor'

export { arriveAtPage, focusFromScript } from './conventions/page-arrival'

export { DIFF_LINES_LIMIT, diffLines, diffRuns } from './conventions/diff'
export type { DiffRow, DiffRowKind, DiffRun } from './conventions/diff'

export { highlightRuns } from './conventions/highlight'
export type { HighlightMatch, HighlightRun } from './conventions/highlight'

export { PAGINATION_ELLIPSIS, paginationWindow } from './conventions/pagination'
export type { PaginationEntry } from './conventions/pagination'

export {
  commitPhone,
  isPhoneValue,
  PHONE_MAX_DIGITS,
  phoneCallingCode,
  phoneCountries,
  phoneCountryOptions,
  phoneDefaultCountry,
  phoneDraft,
  phoneNational,
  phoneValue,
  readPhone,
  splitPhone,
} from './conventions/phone'
export type {
  PhoneCommit,
  PhoneCountryListing,
  PhoneCountryOption,
  PhoneParts,
  PhonePreference,
} from './conventions/phone'

export {
  RATING_DEFAULT_MAX,
  ratingMax,
  ratingModel,
  ratingPress,
  ratingStep,
  roveRating,
} from './conventions/rating'
export type {
  RatingFill,
  RatingKeyEvent,
  RatingMark,
  RatingModel,
  RatingOptions,
  RatingWords,
} from './conventions/rating'

export { relativeTimePhrase } from './conventions/relative-time'
export type { RelativeTimeOptions } from './conventions/relative-time'

export {
  countdownClock,
  countdownLeft,
  countdownMoment,
  countdownSpoken,
} from './conventions/countdown'
export { followCountdown } from './conventions/countdown-clock'
export type { CountdownListener } from './conventions/countdown-clock'

export { CONTROL_SIZES } from './conventions/size'
export type { ControlSize } from './conventions/size'

export { gallerySlug, idPart } from './conventions/slug'

export { spacingAttrs } from './conventions/spacing'
export type { LayoutPatch, SpacingProps } from './conventions/spacing'

export { TOOLTIP_DELAY_MS, TOOLTIP_SKIP_DELAY_MS } from './conventions/tooltip'
export {
  closeTooltipOnScroll,
  holdTooltipFromPointer,
  keyboardHolds,
  trackFocusOrigin,
} from './conventions/tooltip-hold'

export {
  revealTourTarget,
  TOUR_TARGET_ATTRIBUTE,
  tourPlacement,
  tourTarget,
  tourTargetRect,
  tourViewport,
} from './conventions/tour'
export type { TourPlacement, TourRect, TourSide, TourSize } from './conventions/tour'

export { lawfulCells } from './conventions/variants'
export type { LawfulVariants, ToneOf, VariantGrid, VariantOf } from './conventions/variants'

export { BRAND_DRAWINGS, BRAND_MARKS, isBrandName } from './icon/brands'
export type { BrandDrawing, BrandName } from './icon/brands'

export { ICON_ROLE_META, ICON_ROLES, ICON_SET, isIconRole } from './icon/roles'
export type { IconGroup, IconRole, IconRoleMeta } from './icon/roles'

export {
  createToastStore,
  TOAST_DEFAULT_DURATION_MS,
  TOAST_MAX_VISIBLE,
  TOAST_TONE_ICON,
} from './toast/store'
export type {
  ToastAction,
  ToastFunction,
  ToastStore,
  ToastStoreOptions,
  ToastStorePhase,
  ToastStorePromiseSpec,
  ToastStoreRecord,
  ToastTone,
} from './toast/store'
export { actOnToastNotice, dismissToastNotice, toastDetails, toastNotices } from './toast/agent'
export type { ToastNoticeChoice, ToastNoticeDetail } from './toast/agent'
/* Where focus goes when a toast that holds it leaves, when a viewport's timers wait, and what
   its live regions say. */
export { focusAfterToast, followToastFocus } from './toast/focus'
export { holdToastTimers, toastClock, toastTimeLeft } from './toast/hold'
export type { ToastClock } from './toast/hold'
export { announceToasts, TOAST_QUIET } from './toast/announce'
export type { ToastAnnouncements, ToastSaying } from './toast/announce'
