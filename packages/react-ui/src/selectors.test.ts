import { describe, expect, it } from 'vitest'

import a11yCss from '@polymorph/recipes/conventions/a11y.module.css?raw'
import focusCss from '@polymorph/recipes/conventions/focus.module.css?raw'
import { gallerySlug } from '@polymorph/react'
import { GALLERIES } from './galleries'
import iconCss from '@polymorph/react/icon.module.css?raw'
import layoutCss from '@polymorph/recipes/layout/layout.module.css?raw'
import splitPaneCss from '@polymorph/recipes/layout/split-pane.module.css?raw'
import motionCss from '@polymorph/recipes/conventions/motion.module.css?raw'
import buttonCss from '@polymorph/recipes/controls/button.module.css?raw'
import checkboxCss from '@polymorph/recipes/controls/checkbox.module.css?raw'
import fileUploadCss from '@polymorph/recipes/controls/file-upload.module.css?raw'
import imageEditorCss from '@polymorph/recipes/controls/image-editor.module.css?raw'
import formFieldCss from '@polymorph/recipes/controls/form-field.module.css?raw'
import inputCss from '@polymorph/recipes/controls/input.module.css?raw'
import radioCss from '@polymorph/recipes/controls/radio-group.module.css?raw'
import searchInputCss from '@polymorph/recipes/controls/search-input.module.css?raw'
import calendarCss from '@polymorph/recipes/controls/calendar.module.css?raw'
import comboboxCss from '@polymorph/recipes/controls/combobox.module.css?raw'
import datePickerCss from '@polymorph/recipes/controls/date-picker.module.css?raw'
import selectCss from '@polymorph/recipes/controls/select.module.css?raw'
import sliderCss from '@polymorph/recipes/controls/slider.module.css?raw'
import switchCss from '@polymorph/recipes/controls/switch.module.css?raw'
import tagInputCss from '@polymorph/recipes/controls/tag-input.module.css?raw'
import textareaCss from '@polymorph/recipes/controls/textarea.module.css?raw'
import linkCss from '@polymorph/recipes/controls/link.module.css?raw'
import copyButtonCss from '@polymorph/recipes/controls/copy-button.module.css?raw'
import passwordInputCss from '@polymorph/recipes/controls/password-input.module.css?raw'
import checkboxGroupCss from '@polymorph/recipes/controls/checkbox-group.module.css?raw'
import segmentedControlCss from '@polymorph/recipes/controls/segmented-control.module.css?raw'
import choiceCardCss from '@polymorph/recipes/controls/choice-card.module.css?raw'
import timeInputCss from '@polymorph/recipes/controls/time-input.module.css?raw'
import numberInputCss from '@polymorph/recipes/controls/number-input.module.css?raw'
import dateRangePickerCss from '@polymorph/recipes/controls/date-range-picker.module.css?raw'
import multiSelectCss from '@polymorph/recipes/controls/multi-select.module.css?raw'
import splitButtonCss from '@polymorph/recipes/controls/split-button.module.css?raw'
import oTPInputCss from '@polymorph/recipes/controls/otp-input.module.css?raw'
import colorInputCss from '@polymorph/recipes/controls/color-input.module.css?raw'
import providerButtonCss from '@polymorph/recipes/controls/provider-button.module.css?raw'
import avatarButtonCss from '@polymorph/recipes/controls/avatar-button.module.css?raw'
import recordButtonCss from '@polymorph/recipes/controls/record-button.module.css?raw'
import phoneInputCss from '@polymorph/recipes/controls/phone-input.module.css?raw'
import durationInputCss from '@polymorph/recipes/controls/duration-input.module.css?raw'
import monthInputCss from '@polymorph/recipes/controls/month-input.module.css?raw'
import treeSelectCss from '@polymorph/recipes/controls/tree-select.module.css?raw'
import ratingCss from '@polymorph/recipes/controls/rating.module.css?raw'
import inlineEditCss from '@polymorph/recipes/controls/inline-edit.module.css?raw'
import commandCss from '@polymorph/recipes/overlays/command.module.css?raw'
import dialogCss from '@polymorph/recipes/overlays/dialog.module.css?raw'
import sheetCss from '@polymorph/recipes/overlays/sheet.module.css?raw'
import drawerCss from '@polymorph/recipes/overlays/drawer.module.css?raw'
import menuCss from '@polymorph/recipes/overlays/menu.module.css?raw'
import popoverCss from '@polymorph/recipes/overlays/popover.module.css?raw'
import tabsCss from '@polymorph/recipes/overlays/tabs.module.css?raw'
import toastCss from '@polymorph/recipes/overlays/toast.module.css?raw'
import tooltipCss from '@polymorph/recipes/overlays/tooltip.module.css?raw'
import contextMenuCss from '@polymorph/recipes/overlays/context-menu.module.css?raw'
import hoverCardCss from '@polymorph/recipes/overlays/hover-card.module.css?raw'
import lightboxCss from '@polymorph/recipes/overlays/lightbox.module.css?raw'
import tourCss from '@polymorph/recipes/overlays/tour.module.css?raw'
import menubarCss from '@polymorph/recipes/overlays/menubar.module.css?raw'
import appShellCss from '@polymorph/recipes/archetypes/app-shell.module.css?raw'
import authPageCss from '@polymorph/recipes/archetypes/auth-page.module.css?raw'
import dashboardCss from '@polymorph/recipes/archetypes/dashboard.module.css?raw'
import detailPageCss from '@polymorph/recipes/archetypes/detail-page.module.css?raw'
import formPageCss from '@polymorph/recipes/archetypes/form-page.module.css?raw'
import listPageCss from '@polymorph/recipes/archetypes/list-page.module.css?raw'
import settingsPageCss from '@polymorph/recipes/archetypes/settings-page.module.css?raw'
import conversationPageCss from '@polymorph/recipes/archetypes/conversation-page.module.css?raw'
import masterDetailPageCss from '@polymorph/recipes/archetypes/master-detail-page.module.css?raw'
import searchPageCss from '@polymorph/recipes/archetypes/search-page.module.css?raw'
import accordionCss from '@polymorph/recipes/structure/accordion.module.css?raw'
import alertCss from '@polymorph/recipes/structure/alert.module.css?raw'
import avatarCss from '@polymorph/recipes/structure/avatar.module.css?raw'
import badgeCss from '@polymorph/recipes/structure/badge.module.css?raw'
import breadcrumbsCss from '@polymorph/recipes/structure/breadcrumbs.module.css?raw'
import cardCss from '@polymorph/recipes/structure/card.module.css?raw'
import codeCss from '@polymorph/recipes/structure/code.module.css?raw'
import codeBlockCss from '@polymorph/recipes/structure/code-block.module.css?raw'
import dataTableCss from '@polymorph/recipes/structure/data-table.module.css?raw'
import emptyStateCss from '@polymorph/recipes/structure/empty-state.module.css?raw'
import filterBarCss from '@polymorph/recipes/structure/filter-bar.module.css?raw'
import headingCss from '@polymorph/recipes/structure/heading.module.css?raw'
import heroCss from '@polymorph/recipes/structure/hero.module.css?raw'
import chartFrameCss from '@polymorph/recipes/charts/frame/chart-frame.module.css?raw'
import chartLegendCss from '@polymorph/recipes/charts/frame/chart-legend.module.css?raw'
import barChartCss from '@polymorph/recipes/charts/bar-chart.module.css?raw'
import lineChartCss from '@polymorph/recipes/charts/line-chart.module.css?raw'
import sparklineCss from '@polymorph/recipes/charts/sparkline.module.css?raw'
import areaChartCss from '@polymorph/recipes/charts/area-chart.module.css?raw'
import heatmapCss from '@polymorph/recipes/charts/heatmap.module.css?raw'
import donutChartCss from '@polymorph/recipes/charts/donut-chart.module.css?raw'
import scatterChartCss from '@polymorph/recipes/charts/scatter-chart.module.css?raw'
import histogramCss from '@polymorph/recipes/charts/histogram.module.css?raw'
import radarChartCss from '@polymorph/recipes/charts/radar-chart.module.css?raw'
import funnelChartCss from '@polymorph/recipes/charts/funnel-chart.module.css?raw'
import treemapCss from '@polymorph/recipes/charts/treemap.module.css?raw'
import kbdCss from '@polymorph/recipes/structure/kbd.module.css?raw'
import pageHeaderCss from '@polymorph/recipes/structure/page-header.module.css?raw'
import paginationCss from '@polymorph/recipes/structure/pagination.module.css?raw'
import progressCss from '@polymorph/recipes/structure/progress.module.css?raw'
import separatorCss from '@polymorph/recipes/structure/separator.module.css?raw'
import settingsRowCss from '@polymorph/recipes/structure/settings-row.module.css?raw'
import statCss from '@polymorph/recipes/structure/stat.module.css?raw'
import stepperCss from '@polymorph/recipes/structure/stepper.module.css?raw'
import timelineCss from '@polymorph/recipes/structure/timeline.module.css?raw'
import skeletonCss from '@polymorph/recipes/structure/skeleton.module.css?raw'
import spinnerCss from '@polymorph/recipes/structure/spinner.module.css?raw'
import tableCss from '@polymorph/recipes/structure/table.module.css?raw'
import textCss from '@polymorph/recipes/structure/text.module.css?raw'
import descriptionListCss from '@polymorph/recipes/structure/description-list.module.css?raw'
import relativeTimeCss from '@polymorph/recipes/structure/relative-time.module.css?raw'
import collapsibleCss from '@polymorph/recipes/structure/collapsible.module.css?raw'
import errorSummaryCss from '@polymorph/recipes/structure/error-summary.module.css?raw'
import scrollAreaCss from '@polymorph/recipes/structure/scroll-area.module.css?raw'
import jsonTreeCss from '@polymorph/recipes/structure/json-tree.module.css?raw'
import carouselCss from '@polymorph/recipes/structure/carousel.module.css?raw'
import cursorPaginationCss from '@polymorph/recipes/structure/cursor-pagination.module.css?raw'
import qRCodeCss from '@polymorph/recipes/structure/qr-code.module.css?raw'
import imageCss from '@polymorph/recipes/structure/image.module.css?raw'
import sectionNavCss from '@polymorph/recipes/structure/section-nav.module.css?raw'
import listCss from '@polymorph/recipes/structure/list.module.css?raw'
import bannerCss from '@polymorph/recipes/structure/banner.module.css?raw'
import diffCss from '@polymorph/recipes/structure/diff.module.css?raw'
import treeCss from '@polymorph/recipes/structure/tree.module.css?raw'
import highlightCss from '@polymorph/recipes/structure/highlight.module.css?raw'
import logViewCss from '@polymorph/recipes/structure/log-view.module.css?raw'
import audioPlayerCss from '@polymorph/recipes/structure/audio-player.module.css?raw'
import commentThreadCss from '@polymorph/recipes/structure/comment-thread.module.css?raw'
import meterCss from '@polymorph/recipes/structure/meter.module.css?raw'
import countdownCss from '@polymorph/recipes/structure/countdown.module.css?raw'
import tableOfContentsCss from '@polymorph/recipes/structure/table-of-contents.module.css?raw'
import streamingTextCss from '@polymorph/recipes/ai/streaming-text.module.css?raw'
import markdownCss from '@polymorph/recipes/ai/markdown.module.css?raw'
import attachmentChipCss from '@polymorph/recipes/ai/attachment-chip.module.css?raw'
import promptInputCss from '@polymorph/recipes/ai/prompt-input.module.css?raw'
import chatMessageCss from '@polymorph/recipes/ai/chat-message.module.css?raw'
import chatThreadCss from '@polymorph/recipes/ai/chat-thread.module.css?raw'
import toolCallCss from '@polymorph/recipes/ai/tool-call.module.css?raw'
import approvalCardCss from '@polymorph/recipes/ai/approval-card.module.css?raw'
import citationCss from '@polymorph/recipes/ai/citation.module.css?raw'
import sourceListCss from '@polymorph/recipes/ai/source-list.module.css?raw'
import reasoningDisclosureCss from '@polymorph/recipes/ai/reasoning-disclosure.module.css?raw'
import artifactPaneCss from '@polymorph/recipes/ai/artifact-pane.module.css?raw'
import planCss from '@polymorph/recipes/ai/plan.module.css?raw'

/**
 * The `requiredSelectors` law: each states fixture's `requiredSelectors`,
 * checked against source.
 *
 * No prop reaches hover, focus and active, so a fixture cannot render them. The
 * only way to know a component styles them is to read what it ships. The law
 * covers the whole vocabulary: every member in `GALLERIES` is mapped to its
 * stylesheet below, and a member with no mapping fails.
 *
 * The closure follows `composes`, because a component that composes the focus
 * convention has `:focus-visible`. Requiring it to restate the rule would
 * defeat the convention, which is one focus ring defined once in
 * `conventions/focus.module.css`.
 */

/** Basenames are unique across the package, which is what makes this lookup safe. */
const SOURCES: Record<string, string> = {
  'a11y.module.css': a11yCss,
  'focus.module.css': focusCss,
  'motion.module.css': motionCss,
  'button.module.css': buttonCss,
  'input.module.css': inputCss,
  'select.module.css': selectCss,
  'combobox.module.css': comboboxCss,
  'date-picker.module.css': datePickerCss,
  'calendar.module.css': calendarCss,
  'slider.module.css': sliderCss,
  'search-input.module.css': searchInputCss,
  'checkbox.module.css': checkboxCss,
  'switch.module.css': switchCss,
  'radio-group.module.css': radioCss,
  'tag-input.module.css': tagInputCss,
  'file-upload.module.css': fileUploadCss,
  'image-editor.module.css': imageEditorCss,
  'textarea.module.css': textareaCss,
  'form-field.module.css': formFieldCss,
  'link.module.css': linkCss,
  'dialog.module.css': dialogCss,
  'sheet.module.css': sheetCss,
  'command.module.css': commandCss,
  'drawer.module.css': drawerCss,
  'menu.module.css': menuCss,
  'popover.module.css': popoverCss,
  'tabs.module.css': tabsCss,
  'tooltip.module.css': tooltipCss,
  'toast.module.css': toastCss,
  'layout.module.css': layoutCss,
  'accordion.module.css': accordionCss,
  'alert.module.css': alertCss,
  'breadcrumbs.module.css': breadcrumbsCss,
  'card.module.css': cardCss,
  'data-table.module.css': dataTableCss,
  'filter-bar.module.css': filterBarCss,
  'pagination.module.css': paginationCss,
  'badge.module.css': badgeCss,
  'avatar.module.css': avatarCss,
  'separator.module.css': separatorCss,
  'settings-row.module.css': settingsRowCss,
  'stat.module.css': statCss,
  'stepper.module.css': stepperCss,
  'timeline.module.css': timelineCss,
  'kbd.module.css': kbdCss,
  'spinner.module.css': spinnerCss,
  'progress.module.css': progressCss,
  'skeleton.module.css': skeletonCss,
  'table.module.css': tableCss,
  'heading.module.css': headingCss,
  'text.module.css': textCss,
  'code.module.css': codeCss,
  'code-block.module.css': codeBlockCss,
  'page-header.module.css': pageHeaderCss,
  'hero.module.css': heroCss,
  'empty-state.module.css': emptyStateCss,
  // Shared anatomy: every chart member reaches the frame's stylesheet through
  // `composes`, so the states it owns (`empty`, `loading`) are checked once
  // rather than restated by six members. The legend's stylesheet is here for
  // the same reason: the isolated series' hidden key (`[aria-pressed='false']`)
  // is specified once (`docs/charts.md`) and styled once, and members with a
  // legend compose its base class, so the recipe counts as theirs.
  'chart-frame.module.css': chartFrameCss,
  'chart-legend.module.css': chartLegendCss,
  'bar-chart.module.css': barChartCss,
  'line-chart.module.css': lineChartCss,
  'sparkline.module.css': sparklineCss,
  'area-chart.module.css': areaChartCss,
  'heatmap.module.css': heatmapCss,
  'donut-chart.module.css': donutChartCss,
  'app-shell.module.css': appShellCss,
  'list-page.module.css': listPageCss,
  'settings-page.module.css': settingsPageCss,
  'form-page.module.css': formPageCss,
  'detail-page.module.css': detailPageCss,
  'auth-page.module.css': authPageCss,
  'dashboard.module.css': dashboardCss,
  'icon.module.css': iconCss,
  'copy-button.module.css': copyButtonCss,
  'password-input.module.css': passwordInputCss,
  'checkbox-group.module.css': checkboxGroupCss,
  'description-list.module.css': descriptionListCss,
  'relative-time.module.css': relativeTimeCss,
  'collapsible.module.css': collapsibleCss,
  'error-summary.module.css': errorSummaryCss,
  'segmented-control.module.css': segmentedControlCss,
  'choice-card.module.css': choiceCardCss,
  'scatter-chart.module.css': scatterChartCss,
  'histogram.module.css': histogramCss,
  'radar-chart.module.css': radarChartCss,
  'time-input.module.css': timeInputCss,
  'number-input.module.css': numberInputCss,
  'date-range-picker.module.css': dateRangePickerCss,
  'multi-select.module.css': multiSelectCss,
  'context-menu.module.css': contextMenuCss,
  'hover-card.module.css': hoverCardCss,
  'scroll-area.module.css': scrollAreaCss,
  'split-button.module.css': splitButtonCss,
  'otp-input.module.css': oTPInputCss,
  'split-pane.module.css': splitPaneCss,
  'color-input.module.css': colorInputCss,
  'json-tree.module.css': jsonTreeCss,
  'carousel.module.css': carouselCss,
  'cursor-pagination.module.css': cursorPaginationCss,
  'qr-code.module.css': qRCodeCss,
  'provider-button.module.css': providerButtonCss,
  'streaming-text.module.css': streamingTextCss,
  'markdown.module.css': markdownCss,
  'attachment-chip.module.css': attachmentChipCss,
  'prompt-input.module.css': promptInputCss,
  'chat-message.module.css': chatMessageCss,
  'chat-thread.module.css': chatThreadCss,
  'tool-call.module.css': toolCallCss,
  'approval-card.module.css': approvalCardCss,
  'citation.module.css': citationCss,
  'source-list.module.css': sourceListCss,
  'reasoning-disclosure.module.css': reasoningDisclosureCss,
  'artifact-pane.module.css': artifactPaneCss,
  'conversation-page.module.css': conversationPageCss,
  'avatar-button.module.css': avatarButtonCss,
  'image.module.css': imageCss,
  'section-nav.module.css': sectionNavCss,
  'list.module.css': listCss,
  'banner.module.css': bannerCss,
  'diff.module.css': diffCss,
  'tree.module.css': treeCss,
  'highlight.module.css': highlightCss,
  'plan.module.css': planCss,
  'log-view.module.css': logViewCss,
  'audio-player.module.css': audioPlayerCss,
  'record-button.module.css': recordButtonCss,
  'phone-input.module.css': phoneInputCss,
  'duration-input.module.css': durationInputCss,
  'comment-thread.module.css': commentThreadCss,
  'meter.module.css': meterCss,
  'countdown.module.css': countdownCss,
  'month-input.module.css': monthInputCss,
  'lightbox.module.css': lightboxCss,
  'tree-select.module.css': treeSelectCss,
  'rating.module.css': ratingCss,
  'inline-edit.module.css': inlineEditCss,
  'table-of-contents.module.css': tableOfContentsCss,
  'tour.module.css': tourCss,
  'menubar.module.css': menubarCss,
  'funnel-chart.module.css': funnelChartCss,
  'treemap.module.css': treemapCss,
  'master-detail-page.module.css': masterDetailPageCss,
  'search-page.module.css': searchPageCss,
}

/**
 * Component -> its stylesheet. Usually the slug, but not always: the three
 * layout primitives share one stylesheet by design.
 *
 * Written out rather than derived, so that adding a component without a
 * stylesheet is a failure in the test below rather than a silent skip.
 */
const STYLESHEET: Record<string, string> = {
  Icon: 'icon.module.css',
  Stack: 'layout.module.css',
  Inline: 'layout.module.css',
  Grid: 'layout.module.css',
  Heading: 'heading.module.css',
  Text: 'text.module.css',
  Code: 'code.module.css',
  CodeBlock: 'code-block.module.css',
  Button: 'button.module.css',
  Input: 'input.module.css',
  Select: 'select.module.css',
  Combobox: 'combobox.module.css',
  DatePicker: 'date-picker.module.css',
  Calendar: 'calendar.module.css',
  Slider: 'slider.module.css',
  SearchInput: 'search-input.module.css',
  Checkbox: 'checkbox.module.css',
  Switch: 'switch.module.css',
  RadioGroup: 'radio-group.module.css',
  TagInput: 'tag-input.module.css',
  FileUpload: 'file-upload.module.css',
  ImageEditor: 'image-editor.module.css',
  Textarea: 'textarea.module.css',
  FormField: 'form-field.module.css',
  Link: 'link.module.css',
  Dialog: 'dialog.module.css',
  Command: 'command.module.css',
  ConfirmDialog: 'dialog.module.css',
  Drawer: 'drawer.module.css',
  Menu: 'menu.module.css',
  Popover: 'popover.module.css',
  Tabs: 'tabs.module.css',
  Tooltip: 'tooltip.module.css',
  Toast: 'toast.module.css',
  Alert: 'alert.module.css',
  Accordion: 'accordion.module.css',
  Breadcrumbs: 'breadcrumbs.module.css',
  Card: 'card.module.css',
  DataTable: 'data-table.module.css',
  FilterBar: 'filter-bar.module.css',
  Pagination: 'pagination.module.css',
  Badge: 'badge.module.css',
  Avatar: 'avatar.module.css',
  Separator: 'separator.module.css',
  SettingsRow: 'settings-row.module.css',
  Stat: 'stat.module.css',
  Stepper: 'stepper.module.css',
  Timeline: 'timeline.module.css',
  Kbd: 'kbd.module.css',
  Spinner: 'spinner.module.css',
  Progress: 'progress.module.css',
  Skeleton: 'skeleton.module.css',
  Table: 'table.module.css',
  PageHeader: 'page-header.module.css',
  Hero: 'hero.module.css',
  EmptyState: 'empty-state.module.css',
  BarChart: 'bar-chart.module.css',
  LineChart: 'line-chart.module.css',
  Sparkline: 'sparkline.module.css',
  AreaChart: 'area-chart.module.css',
  Heatmap: 'heatmap.module.css',
  DonutChart: 'donut-chart.module.css',
  AppShell: 'app-shell.module.css',
  ListPage: 'list-page.module.css',
  SettingsPage: 'settings-page.module.css',
  FormPage: 'form-page.module.css',
  DetailPage: 'detail-page.module.css',
  AuthPage: 'auth-page.module.css',
  Dashboard: 'dashboard.module.css',
  CopyButton: 'copy-button.module.css',
  PasswordInput: 'password-input.module.css',
  CheckboxGroup: 'checkbox-group.module.css',
  DescriptionList: 'description-list.module.css',
  RelativeTime: 'relative-time.module.css',
  Collapsible: 'collapsible.module.css',
  ErrorSummary: 'error-summary.module.css',
  SegmentedControl: 'segmented-control.module.css',
  ChoiceCard: 'choice-card.module.css',
  ScatterChart: 'scatter-chart.module.css',
  Histogram: 'histogram.module.css',
  RadarChart: 'radar-chart.module.css',
  TimeInput: 'time-input.module.css',
  NumberInput: 'number-input.module.css',
  DateRangePicker: 'date-range-picker.module.css',
  MultiSelect: 'multi-select.module.css',
  ContextMenu: 'context-menu.module.css',
  HoverCard: 'hover-card.module.css',
  ScrollArea: 'scroll-area.module.css',
  SplitButton: 'split-button.module.css',
  OTPInput: 'otp-input.module.css',
  SplitPane: 'split-pane.module.css',
  ColorInput: 'color-input.module.css',
  JsonTree: 'json-tree.module.css',
  Carousel: 'carousel.module.css',
  CursorPagination: 'cursor-pagination.module.css',
  QRCode: 'qr-code.module.css',
  ProviderButton: 'provider-button.module.css',
  StreamingText: 'streaming-text.module.css',
  Markdown: 'markdown.module.css',
  AttachmentChip: 'attachment-chip.module.css',
  PromptInput: 'prompt-input.module.css',
  ChatMessage: 'chat-message.module.css',
  ChatThread: 'chat-thread.module.css',
  ToolCall: 'tool-call.module.css',
  ApprovalCard: 'approval-card.module.css',
  Citation: 'citation.module.css',
  SourceList: 'source-list.module.css',
  ReasoningDisclosure: 'reasoning-disclosure.module.css',
  ArtifactPane: 'artifact-pane.module.css',
  ConversationPage: 'conversation-page.module.css',
  AvatarButton: 'avatar-button.module.css',
  Image: 'image.module.css',
  SectionNav: 'section-nav.module.css',
  List: 'list.module.css',
  Banner: 'banner.module.css',
  Diff: 'diff.module.css',
  Tree: 'tree.module.css',
  ModeSwitch: 'segmented-control.module.css',
  Highlight: 'highlight.module.css',
  Plan: 'plan.module.css',
  LogView: 'log-view.module.css',
  AudioPlayer: 'audio-player.module.css',
  RecordButton: 'record-button.module.css',
  PhoneInput: 'phone-input.module.css',
  DurationInput: 'duration-input.module.css',
  CommentThread: 'comment-thread.module.css',
  Meter: 'meter.module.css',
  Countdown: 'countdown.module.css',
  MonthInput: 'month-input.module.css',
  Lightbox: 'lightbox.module.css',
  TreeSelect: 'tree-select.module.css',
  Rating: 'rating.module.css',
  InlineEdit: 'inline-edit.module.css',
  TableOfContents: 'table-of-contents.module.css',
  Tour: 'tour.module.css',
  Menubar: 'menubar.module.css',
  FunnelChart: 'funnel-chart.module.css',
  Treemap: 'treemap.module.css',
  MasterDetailPage: 'master-detail-page.module.css',
  SearchPage: 'search-page.module.css',
}

const COMPOSES = /composes:\s*[\w\s]+?\s+from\s+['"]([^'"]+)['"]/g

/** A stylesheet plus everything it composes from, transitively. */
function sourceClosure(file: string, seen = new Set<string>()): string {
  if (seen.has(file)) return ''
  seen.add(file)

  const source = SOURCES[file]
  expect(source, `no source registered for ${file}`).toBeDefined()

  let closure = source ?? ''
  for (const [, specifier] of closure.matchAll(COMPOSES)) {
    closure += sourceClosure((specifier as string).split('/').pop() as string, seen)
  }
  return closure
}

/**
 * An attribute selector's quoting does not change its meaning, and the two
 * sides differ by convention: the specs write `[data-state="open"]` and
 * Prettier writes the stylesheets with single quotes. So both are normalised
 * before comparing; anything stricter would test formatting.
 */
const canonical = (text: string) => text.replace(/['"]/g, '"')

describe('every component in the vocabulary is subject to the check', () => {
  it('maps every gallery to a stylesheet, so no component is skipped by omission', () => {
    const unmapped = GALLERIES.map((states) => states.component).filter(
      (component) => STYLESHEET[component] === undefined,
    )
    expect(unmapped, 'a component shipped without a stylesheet to check').toEqual([])
  })

  it('maps only to stylesheets that exist', () => {
    for (const [component, sheet] of Object.entries(STYLESHEET)) {
      expect(SOURCES[sheet], `${component} -> ${sheet}`).toBeDefined()
    }
  })

  it('agrees with the route slug wherever a component has its own sheet', () => {
    // The three layout primitives share one stylesheet; everything else is
    // named after its route, and a mismatch means an incomplete rename.
    // ConfirmDialog is a Dialog with a preset footer and adds no CSS of its own. ModeSwitch is a
    // SegmentedControl with preset segments, and adds none either.
    const shared = new Set(['Stack', 'Inline', 'Grid', 'ConfirmDialog', 'ModeSwitch'])
    for (const states of GALLERIES) {
      if (shared.has(states.component)) continue
      expect(STYLESHEET[states.component], states.component).toBe(
        `${gallerySlug(states.component)}.module.css`,
      )
    }
  })
})

describe('every required selector is styled somewhere the component composes', () => {
  for (const states of GALLERIES) {
    const component = states.component

    it(`${component} declares a fixture`, () => {
      // An empty `requiredSelectors` is deliberate, not an omission. A static
      // surface (Card, Badge, PageHeader, EmptyState) has no state a prop cannot
      // reach, so there is nothing to check in source.
      expect(states.requiredSelectors, `${component} declares no list at all`).toBeInstanceOf(Array)
    })

    it(`${component} styles every one of them`, () => {
      const css = canonical(sourceClosure(STYLESHEET[component] as string))
      for (const selector of states.requiredSelectors) {
        expect(css, `${component} never styles \`${selector}\``).toContain(canonical(selector))
      }
    })
  }
})

describe('the check detects faults', () => {
  it('does not find a selector nothing styles', () => {
    expect(sourceClosure('button.module.css')).not.toContain('[data-state="nonsense"]')
  })

  it('reaches through composes rather than requiring a restatement', () => {
    // `:focus-visible` is defined in the focus convention's module, which is
    // the purpose of the convention.
    expect(buttonCss).not.toContain(':focus-visible')
    expect(sourceClosure('button.module.css')).toContain(':focus-visible')
  })
})
