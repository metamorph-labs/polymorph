/**
 * `@polymorph/react-ui`, the closed vocabulary.
 *
 * It exports the infrastructure every component tier depends on (the attribute
 * and prop conventions, the icon gateway, the focus convention, and the layout
 * primitives that let application code compose a screen without its own CSS),
 * and the tiers built on it: controls, overlays, structure, charts, and the
 * archetypes that combine them into screens. Beside them is the exception
 * ladder (`Bespoke`, `ThirdParty`, `DensityScope`, `ToneScope`), the declared
 * exceptions that allow everything else to stay closed.
 *
 * The base layer is imported for its side effect. Binding the page to the
 * theme and removing the user agent's off-scale margins is not opt-in, because
 * otherwise `Stack`'s gap would not be the only source of vertical spacing.
 *
 * The `motion` engine is not re-exported from this package at any path.
 * Choreography belongs to component state, so the engine stays replaceable.
 * `polymorph/no-external-motion` allows the import only inside
 * `packages/engine/src/motion/**` and enforces that.
 */

import '@polymorph/recipes/base.css'

export { PageTransitions, usePageTransitionPending } from './conventions/PageTransitions'

export { dataAttrs, dataFlag } from '@polymorph/react'
export type { StateAttributeInput, StateAttributes, StateName } from '@polymorph/react'
export { assertGoverned } from '@polymorph/react'
export type { GovernedCheck, Governed, NativeProps, StyleEscapeHatch } from '@polymorph/react'
export { gallerySlug } from '@polymorph/react'
export type { ComponentStates, StateEntry } from '@polymorph/react'
export { lawfulCells } from '@polymorph/react'
export type { LawfulVariants, ToneOf, VariantOf } from '@polymorph/react'

export { AvatarButton } from './controls/AvatarButton'
export type { AvatarButtonProps } from './controls/AvatarButton'
export { Button, BUTTON_GRID } from './controls/Button'
export type { ButtonAppearance, ButtonCount, ButtonGrid, ButtonProps } from './controls/Button'
export { Calendar } from './controls/Calendar'
export type { CalendarMessages, CalendarProps, FirstDayOfWeek } from './controls/Calendar'
export { Checkbox } from './controls/Checkbox'
export type { CheckboxProps, CheckedState } from './controls/Checkbox'
export { CheckboxGroup } from './controls/CheckboxGroup'
export type {
  CheckboxGroupOption,
  CheckboxGroupOrientation,
  CheckboxGroupProps,
} from './controls/CheckboxGroup'
export { ChoiceCard } from './controls/ChoiceCard'
export type { ChoiceCardOption, ChoiceCardProps } from './controls/ChoiceCard'
export { ColorInput } from './controls/ColorInput'
export type { ColorInputProps } from './controls/ColorInput'
export { Combobox } from './controls/Combobox'
export type {
  ComboboxFilter,
  ComboboxMessages,
  ComboboxOption,
  ComboboxProps,
} from './controls/Combobox'
export { CopyButton } from './controls/CopyButton'
export type { CopyButtonProps } from './controls/CopyButton'
export { DatePicker } from './controls/DatePicker'
export type {
  DateOnlyPickerProps,
  DatePickerMessages,
  DatePickerProps,
  DateTimePickerProps,
} from './controls/DatePicker'
export { DateRangePicker } from './controls/DateRangePicker'
export type {
  DateRange,
  DateRangePickerMessages,
  DateRangePickerProps,
} from './controls/DateRangePicker'
export { DurationInput } from './controls/DurationInput'
export type { DurationInputMessages, DurationInputProps } from './controls/DurationInput'
export { FileUpload, formatBytes } from './controls/FileUpload'
export { ImageEditor } from './controls/ImageEditor'
export type { ImageEditorMessages, ImageEditorProps } from './controls/ImageEditor'
export type {
  FileRejection,
  FileRejectionReason,
  FileUploadItem,
  FileUploadProps,
  FileUploadStatus,
} from './controls/FileUpload'
export { FormField } from './controls/FormField'
export type { FormFieldControlProps, FormFieldProps } from './controls/FormField'
export { InlineEdit } from './controls/InlineEdit'
export type { InlineEditMessages, InlineEditProps } from './controls/InlineEdit'
export { Input } from './controls/Input'
export type { InputProps, InputType } from './controls/Input'
export { ModeSwitch } from './controls/ModeSwitch'
export type { ModeSwitchMessages, ModeSwitchProps } from './controls/ModeSwitch'
export { MonthInput } from './controls/MonthInput'
export type { MonthInputMessages, MonthInputProps } from './controls/MonthInput'
export { MultiSelect } from './controls/MultiSelect'
export type {
  MultiSelectMessages,
  MultiSelectOption,
  MultiSelectProps,
} from './controls/MultiSelect'
export { NumberInput } from './controls/NumberInput'
export type { NumberFormat, NumberInputProps } from './controls/NumberInput'
export { OTPInput } from './controls/OTPInput'
export type { OTPInputProps, OTPLength } from './controls/OTPInput'
export { PasswordInput } from './controls/PasswordInput'
export type { PasswordInputProps } from './controls/PasswordInput'
export { PhoneInput } from './controls/PhoneInput'
export type { PhoneInputMessages, PhoneInputProps } from './controls/PhoneInput'
export { ProviderButton } from './controls/ProviderButton'
export type { ProviderButtonProps, ProviderButtonProvider } from './controls/ProviderButton'
export { RadioGroup } from './controls/Radio'
export type { RadioGroupProps, RadioOption, RadioOrientation } from './controls/Radio'
export { RecordButton } from './controls/RecordButton'
export type { RecordButtonProps } from './controls/RecordButton'
export { Rating } from './controls/Rating'
export type { RatingMessages, RatingProps, RatingSize } from './controls/Rating'
export { RichTextInput } from './controls/RichTextInput'
export type {
  RichTextEntityOption,
  RichTextEntitySource,
  RichTextInputEditor,
  RichTextInputMaxRows,
  RichTextInputMessages,
  RichTextInputMinRows,
  RichTextInputProps,
  RichTextInputSelection,
  RichTextToolbarPlacement,
} from './controls/RichTextInput'
export { SearchInput } from './controls/SearchInput'
export type { SearchInputProps } from './controls/SearchInput'
export { SegmentedControl } from './controls/SegmentedControl'
export type {
  SegmentedControlOption,
  SegmentedControlProps,
  SegmentedControlSize,
} from './controls/SegmentedControl'
export { Select } from './controls/Select'
export type { SelectOption, SelectOptionGroup, SelectProps } from './controls/Select'
export { Slider } from './controls/Slider'
export type { RangeSliderProps, SingleSliderProps, SliderProps } from './controls/Slider'
export { SplitButton } from './controls/SplitButton'
export type {
  SplitButtonAppearance,
  SplitButtonGrid,
  SplitButtonProps,
} from './controls/SplitButton'
export { Switch } from './controls/Switch'
export type { SwitchProps } from './controls/Switch'
export { TagInput } from './controls/TagInput'
export type { TagInputCountLabel, TagInputProps } from './controls/TagInput'
export { Textarea } from './controls/Textarea'
export type { TextareaProps, TextareaResize } from './controls/Textarea'
export { CONTROL_SIZES } from '@polymorph/react'
export type { ControlKind, ControlSize } from '@polymorph/react'

export { Link } from './controls/Link'
export { TimeInput } from './controls/TimeInput'
export type { TimeInputProps } from './controls/TimeInput'
export type { LinkButtonGrid, LinkProps, LinkVariant } from './controls/Link'

export { Icon } from '@polymorph/react'
export type { IconProps, IconSize } from '@polymorph/react'
export { ICON_ROLE_META, ICON_ROLES, ICON_SET, isIconRole } from '@polymorph/react'
export type { IconGroup, IconRole, IconRoleMeta } from '@polymorph/react'
export { BRAND_MARKS, BrandMark, isBrandName } from '@polymorph/react'
export type { BrandMarkProps, BrandName } from '@polymorph/react'

export { Bespoke } from './exceptions/Bespoke'
export type { BespokeProps } from './exceptions/Bespoke'
export { DensityScope, ToneScope } from './exceptions/Scopes'
export type { ScopeElement, Tone } from './exceptions/Scopes'
export { ThirdParty } from './exceptions/ThirdParty'
export type { ThirdPartyProps } from './exceptions/ThirdParty'

export { AppShell } from './archetypes/AppShell'
export type {
  AppShellProps,
  AppShellTopbar,
  NavGroupProps,
  NavItemProps,
  UserCardProps,
} from './archetypes/AppShell'
export { AuthPage } from './archetypes/AuthPage'
export type { AuthPageProps } from './archetypes/AuthPage'
export { ConversationPage } from './archetypes/ConversationPage'
export type { ConversationPageProps } from './archetypes/ConversationPage'
export { Dashboard } from './archetypes/Dashboard'
export type { DashboardPanelProps, DashboardProps } from './archetypes/Dashboard'
export { DetailPage } from './archetypes/DetailPage'
export type { DetailPageProps } from './archetypes/DetailPage'
export { FormPage } from './archetypes/FormPage'
export type { FormPageProps } from './archetypes/FormPage'
export { ListPage } from './archetypes/ListPage'
export type { ListPageProps } from './archetypes/ListPage'
export { MasterDetailPage } from './archetypes/MasterDetailPage'
export type { MasterDetailPageProps } from './archetypes/MasterDetailPage'
export { SearchPage } from './archetypes/SearchPage'
export type { SearchPageProps } from './archetypes/SearchPage'
export { SettingsPage } from './archetypes/SettingsPage'
export type { SettingsPageProps } from './archetypes/SettingsPage'

export { Command } from './overlays/Command'
export type { CommandItem, CommandProps } from './overlays/Command'
export { ConfirmDialog } from './overlays/ConfirmDialog'
export type { ConfirmDialogProps, ConfirmTone } from './overlays/ConfirmDialog'
export { ContextMenu } from './overlays/ContextMenu'
export type { ContextMenuProps } from './overlays/ContextMenu'
export { Dialog } from './overlays/Dialog'
export type { DialogProps, InitialFocus } from './overlays/Dialog'
export { Drawer } from './overlays/Drawer'
export type { DrawerProps, DrawerSide } from './overlays/Drawer'
export { HoverCard } from './overlays/HoverCard'
export type { HoverCardAlign, HoverCardProps, HoverCardSide } from './overlays/HoverCard'
export { Lightbox } from './overlays/Lightbox'
export type { LightboxImage, LightboxMessages, LightboxProps } from './overlays/Lightbox'
export { Menu } from './overlays/Menu'
export type {
  MenuAlign,
  MenuCheckboxEntry,
  MenuEntry,
  MenuItemEntry,
  MenuLabelEntry,
  MenuLeafEntry,
  MenuPresentation,
  MenuProps,
  MenuSeparatorEntry,
  MenuSubmenuEntry,
} from './overlays/Menu'
export { Menubar } from './overlays/Menubar'
export type { MenubarMenu, MenubarProps } from './overlays/Menubar'
export { Popover } from './overlays/Popover'
export type { PopoverAlign, PopoverProps, PopoverSide } from './overlays/Popover'
export { Tabs } from './overlays/Tabs'
export type { TabDescriptor, TabsContentProps, TabsOrientation, TabsProps } from './overlays/Tabs'
export { Toaster } from './overlays/Toaster'
export type { ToasterMessages } from './overlays/Toaster'
export { ToastHost, ToastNotice, ToastViewportTarget } from './overlays/ToastNotice'
export { Tour } from './overlays/Tour'
export type { TourEnd, TourMessages, TourProps, TourStep, TourTargetProps } from './overlays/Tour'
export { ToastFormField } from './controls/FormField'
export { TreeSelect } from './controls/TreeSelect'
export type { TreeSelectProps } from './controls/TreeSelect'
export {
  toast,
  TOAST_DEFAULT_DURATION_MS,
  TOAST_MAX_VISIBLE,
  TOAST_TONE_ICON,
} from './overlays/toast-store'
export type {
  ToastAction,
  ToastOptions,
  ToastPhase,
  ToastPromiseSpec,
  ToastRecord,
  ToastTone,
} from './overlays/toast-store'
export {
  Tooltip,
  TooltipProvider,
  TOOLTIP_DELAY_MS,
  TOOLTIP_SKIP_DELAY_MS,
} from './overlays/Tooltip'
export type { TooltipAlign, TooltipProps, TooltipSide } from './overlays/Tooltip'

export { Accordion } from './structure/Accordion'
export type { AccordionHeadingLevel, AccordionItem, AccordionProps } from './structure/Accordion'
export { Alert } from './structure/Alert'
export type { AlertProps, AlertTone } from './structure/Alert'
export { AudioPlayer } from './structure/AudioPlayer'
export type { AudioPlayerMessages, AudioPlayerProps } from './structure/AudioPlayer'
export { Avatar, avatarTone, initialsOf } from './structure/Avatar'
export type { AvatarGroupProps, AvatarProps, AvatarSize, AvatarTone } from './structure/Avatar'
export { Badge, BADGE_TONES, BADGE_VARIANTS } from './structure/Badge'
export type { BadgeProps, BadgeTone, BadgeVariant } from './structure/Badge'
export { Banner } from './structure/Banner'
export type { BannerProps, BannerTone } from './structure/Banner'
export { Breadcrumbs } from './structure/Breadcrumbs'
export type { BreadcrumbItem, BreadcrumbsProps } from './structure/Breadcrumbs'
export { Card } from './structure/Card'
export type { CardElement, CardHeadingLevel, CardPatch, CardProps } from './structure/Card'
export { Carousel } from './structure/Carousel'
export type { CarouselProps, CarouselSlide } from './structure/Carousel'
export { Code } from './structure/Code'
export type { CodeProps } from './structure/Code'
export { CodeBlock } from './structure/CodeBlock'
export type { CodeBlockProps } from './structure/CodeBlock'
export { Collapsible } from './structure/Collapsible'
export type { CollapsibleProps } from './structure/Collapsible'
export { CommentThread } from './structure/CommentThread'
export type {
  CommentThreadCommentProps,
  CommentThreadMessages,
  CommentThreadProps,
} from './structure/CommentThread'
export { Countdown } from './structure/Countdown'
export type { CountdownMessages, CountdownProps } from './structure/Countdown'
export { CursorPagination } from './structure/CursorPagination'
export type { CursorPaginationMessages, CursorPaginationProps } from './structure/CursorPagination'
export { DataTable } from './structure/DataTable'
export type {
  DataTableColumn,
  DataTableMessages,
  DataTableProps,
  DataTableRowDetail,
  DataTableSort,
} from './structure/DataTable'
export { DescriptionList } from './structure/DescriptionList'
export type {
  DescriptionListItem,
  DescriptionListOrientation,
  DescriptionListProps,
} from './structure/DescriptionList'
export { Diff } from './structure/Diff'
export type { DiffMessages, DiffProps } from './structure/Diff'
export { EmptyState } from './structure/EmptyState'
export type { EmptyStateProps } from './structure/EmptyState'
export { ErrorSummary } from './structure/ErrorSummary'
export type { ErrorSummaryError, ErrorSummaryProps } from './structure/ErrorSummary'
export { FilterBar } from './structure/FilterBar'
export type { FilterBarMessages, FilterBarProps, FilterResultCount } from './structure/FilterBar'
export { Heading } from './structure/Heading'
export type { HeadingLevel, HeadingProps } from './structure/Heading'
export { Hero } from './structure/Hero'
export type { HeroAlign, HeroProps } from './structure/Hero'
export { Highlight } from './structure/Highlight'
export type { HighlightProps } from './structure/Highlight'
export { Image } from './structure/Image'
export type { ImageProps } from './structure/Image'
export { JsonTree } from './structure/JsonTree'
export type { JsonTreeProps } from './structure/JsonTree'
export { Kbd } from './structure/Kbd'
export type { KbdProps } from './structure/Kbd'
export { List } from './structure/List'
export type { ListItemProps, ListProps } from './structure/List'
export { LogView } from './structure/LogView'
export type { LogLine, LogViewMessages, LogViewProps } from './structure/LogView'
export { Meter } from './structure/Meter'
export type { MeterMessages, MeterProps } from './structure/Meter'
export { PageHeader } from './structure/PageHeader'
export type { PageHeaderProps } from './structure/PageHeader'
export { Pagination, paginationWindow } from './structure/Pagination'
export type { PaginationMessages, PaginationProps, SiblingCount } from './structure/Pagination'
export { Progress } from './structure/Progress'
export type { ProgressProps, ProgressShape, ProgressTone } from './structure/Progress'
export { QRCode } from './structure/QRCode'
export type { QRCodeErrorCorrection, QRCodeProps, QRCodeSize } from './structure/QRCode'
export { RelativeTime } from './structure/RelativeTime'
export type { RelativeTimeMessages, RelativeTimeProps } from './structure/RelativeTime'
export { RichTextContent } from './structure/RichTextContent'
export type {
  RichTextContentMessages,
  RichTextContentProps,
  RichTextContentSelection,
  RichTextContentSize,
} from './structure/RichTextContent'
export { ScrollArea } from './structure/ScrollArea'
export type { ScrollAreaOrientation, ScrollAreaProps, ScrollAreaType } from './structure/ScrollArea'
export { SectionNav } from './structure/SectionNav'
export type { SectionNavItem, SectionNavProps } from './structure/SectionNav'
export { SettingsRow } from './structure/SettingsRow'
export type { SettingsGroupProps, SettingsRowProps } from './structure/SettingsRow'
export { Separator } from './structure/Separator'
export type { SeparatorOrientation, SeparatorProps } from './structure/Separator'
export { Skeleton } from './structure/Skeleton'
export type { SkeletonProps, SkeletonShape } from './structure/Skeleton'
export { Spinner } from './structure/Spinner'
export type { SpinnerProps } from './structure/Spinner'
export { Stat } from './structure/Stat'
export type {
  DeltaDirection,
  StatDelta,
  StatDeltaLabel,
  StatFooter,
  StatProps,
  StatTrend,
} from './structure/Stat'
export { Stepper } from './structure/Stepper'
export type {
  Step,
  StepperOrientation,
  StepperProps,
  StepperSpoken,
  StepperSpokenState,
} from './structure/Stepper'
export { TableOfContents } from './structure/TableOfContents'
export type { TableOfContentsItem, TableOfContentsProps } from './structure/TableOfContents'
export { Timeline } from './structure/Timeline'
export type { TimelineEvent, TimelineProps, TimelineTone } from './structure/Timeline'
export { Table } from './structure/Table'
export type { CellProps, HeaderProps, RowProps, SortDirection, TableProps } from './structure/Table'
export { Text } from './structure/Text'
export type { TextProps, TextSize, TextTone } from './structure/Text'
export { Tree } from './structure/Tree'
export type { TreeItem, TreeMessages, TreeProps } from './structure/Tree'

/**
 * The charts tier: its members, then its grammar.
 *
 * **The grammar is types only.** It is the tier's whole app-facing vocabulary
 * (`docs/charts.md`): a screen writes `series`, `x`, `y` and a `slot`, and
 * everything else (the frame, the axes, the legend, the tooltip, the scale
 * logic) is anatomy it cannot reach.
 *
 * The members are exported in one block because `pnpm new:member` inserts
 * within a tier's block. A tier with no block would get its next member
 * appended to the end of the file instead of in reading order. The reading
 * order is content → data → pages, so the charts block follows structure.
 */
export { BarChart } from './charts/BarChart'
export type { BarChartProps } from './charts/BarChart'
export { FunnelChart } from './charts/FunnelChart'
export type { FunnelChartProps, FunnelStage } from './charts/FunnelChart'
export { Histogram } from './charts/Histogram'
export type { HistogramProps, HistogramXAxis } from './charts/Histogram'
export { LineChart } from './charts/LineChart'
export type { LineChartProps } from './charts/LineChart'
export { RadarChart } from './charts/RadarChart'
export type { RadarAxis, RadarChartProps } from './charts/RadarChart'
export { ScatterChart } from './charts/ScatterChart'
export type { ScatterBubble, ScatterChartProps } from './charts/ScatterChart'
export { Sparkline } from './charts/Sparkline'
export type { SparklineProps } from './charts/Sparkline'
export { AreaChart } from './charts/AreaChart'
export type { AreaChartProps } from './charts/AreaChart'
export { Heatmap } from './charts/Heatmap'
export type { HeatmapProps, HeatmapValue, HeatmapYAxis } from './charts/Heatmap'
export { DonutChart } from './charts/DonutChart'
export { Treemap } from './charts/Treemap'
export type { TreemapItem, TreemapProps } from './charts/Treemap'
export type { DonutCenter, DonutChartProps, DonutSegment } from './charts/DonutChart'
export type {
  CartesianChartProps,
  ChartAnnotation,
  ChartBaseline,
  ChartDatum,
  ChartMessages,
  ChartScaleKind,
  ChartSeries,
  ChartSize,
  ChartSlot,
  ChartState,
  ChartTooltipConfig,
  ChartXAxis,
  ChartYAxis,
  DateGranularity,
  SeriesTone,
  TooltipIndicator,
  ValueFormat,
} from '@polymorph/react'
export { CHART_SIZES, DATE_GRANULARITIES } from '@polymorph/react'
// The tier's English text, exported so a host can reword one sentence without
// rewriting the other fifteen: `{ ...DEFAULT_CHART_MESSAGES, empty: '…' }`.
export { DEFAULT_CHART_MESSAGES } from '@polymorph/react'

export { Grid } from './layout/Grid'
export type { GridAlign, GridColumns, GridElement, GridProps } from './layout/Grid'
export { Inline } from './layout/Inline'
export type { InlineAlign, InlineElement, InlineJustify, InlineProps } from './layout/Inline'
export { SplitPane } from './layout/SplitPane'
export type { SplitPaneOrientation, SplitPaneProps } from './layout/SplitPane'
export { Stack } from './layout/Stack'
export type { StackAlign, StackElement, StackJustify, StackProps } from './layout/Stack'
export type { LayoutPatch, SpacingProps } from '@polymorph/react'

export { ApprovalCard } from './ai/ApprovalCard'
export type { ApprovalCardProps, ApprovalDecision, ApprovalTone } from './ai/ApprovalCard'
export { ArtifactPane } from './ai/ArtifactPane'
export type { ArtifactKind, ArtifactPaneProps, ArtifactView } from './ai/ArtifactPane'
export { AttachmentChip } from './ai/AttachmentChip'
export type { AttachmentChipProps, AttachmentStatus } from './ai/AttachmentChip'
export { ChatMessage } from './ai/ChatMessage'
export type { ChatMessageProps, ChatMessageStatus, ChatRole } from './ai/ChatMessage'
export { ChatThread } from './ai/ChatThread'
export type { ChatThreadMessages, ChatThreadProps } from './ai/ChatThread'
export { Citation } from './ai/Citation'
export type { CitationProps } from './ai/Citation'
export type { CitationSource } from './ai/sources'
export { Markdown } from './ai/Markdown'
export type { MarkdownProps, MarkdownSize } from './ai/Markdown'
export { Plan } from './ai/Plan'
export type { PlanMessages, PlanProps, PlanStatus, PlanStep } from './ai/Plan'
export { PromptInput } from './ai/PromptInput'
export type {
  PromptAttachment,
  PromptInputMaxRows,
  PromptInputMessages,
  PromptInputProps,
  PromptTrigger,
  PromptTriggerOption,
} from './ai/PromptInput'
export { ReasoningDisclosure } from './ai/ReasoningDisclosure'
export type { ReasoningDisclosureProps } from './ai/ReasoningDisclosure'
export { SourceList } from './ai/SourceList'
export type { SourceListProps } from './ai/SourceList'
export { StreamingText } from './ai/StreamingText'
export { ToolCall } from './ai/ToolCall'
export type { ToolCallMessages, ToolCallProps, ToolCallStatus } from './ai/ToolCall'
export type { StreamingTextProps, StreamingTextSize } from './ai/StreamingText'
