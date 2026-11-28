import type { PlatformEntry, Registry, RegistryProp } from '@polymorph/registry'
import { CHART_SLOTS, MODE_PREFERENCES } from '@polymorph/theme'

import {
  branches,
  isKeyword,
  parseType,
  TypeSyntaxError,
  type TsMember,
  type TsParam,
  type TsType,
} from './typescript-type'

/**
 * The part of the native contracts every platform shares: which members a
 * platform renders, the tables that say how a web type maps (`SHAPES`,
 * `UNIONS`, `LITERAL_ALIASES`, the content and DOM-event types), and the
 * resolver that maps each member's props through them.
 *
 * The resolver decides what a prop becomes once: a field of some type, an enum
 * of its literals, a lawful grid, a shape, a union, an opaque type, or an
 * unsupported prop with its reason. It hands each declaration back as a model,
 * and a `Dialect` spells each type in the target language. `contracts.ts`
 * renders the models as Swift and `kotlin.ts` as Kotlin, so the two contracts
 * cannot disagree about which props are expressible or what a type is.
 */

/* -------------------------------------------------------------------------- */
/* Members                                                                    */
/* -------------------------------------------------------------------------- */

/** A platform the contracts are written for: a key of each member's `platforms`. */
export type NativePlatform = 'ios' | 'android'

export interface NativeMember {
  name: string
  /** The member's tier, or `exceptions` for a primitive of the exception ladder. */
  tier: string
  entry: PlatformEntry
  purpose: string
  spec: string | null
  props: RegistryProp[]
  grid: Record<string, string[]> | null
}

export const byCodePoint = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** Every member and ladder primitive with its entry for `platform`, sorted by name. */
export function platformMembers(registry: Registry, platform: NativePlatform): NativeMember[] {
  const components = registry.components.map((component) => ({
    name: component.name,
    tier: component.tier,
    entry: component.platforms[platform],
    purpose: component.purpose,
    spec: component.spec,
    props: component.props,
    grid: component.grid,
  }))
  const primitives = registry.exceptions.primitives.map((primitive) => ({
    name: primitive.name,
    tier: 'exceptions',
    entry: primitive.platforms[platform],
    purpose: primitive.purpose,
    spec: null,
    props: primitive.props,
    grid: null,
  }))
  return [...components, ...primitives].sort((a, b) => byCodePoint(a.name, b.name))
}

/** The members `platform` renders, natively or adapted: the ones with a contract there. */
export function renderedMembers(registry: Registry, platform: NativePlatform): NativeMember[] {
  return platformMembers(registry, platform).filter((member) => member.entry.status !== 'absent')
}

/* -------------------------------------------------------------------------- */
/* The tables                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The shared control size scale (`ControlSize` in `@polymorph/engine`). The
 * registry prints an alias of literals expanded, so the scale is recognised by
 * its values and every member's `size` shares one type, `PMControlSize`.
 */
export const CONTROL_SIZES = ['sm', 'md', 'lg']

/**
 * The page archetypes take their load state as one prop the web does not have:
 * `loadStatus`, the four states of `design/native/screen-contract.md`, which
 * each native archetype draws itself. `AppShell` is the frame around an app's
 * router, never a screen, so it has none.
 */
export const LOAD_STATUS_TIER = 'archetypes'
export const FRAMES = new Set(['AppShell'])

/**
 * The web state props `loadStatus` owns on a page archetype: `ListPage`'s
 * `empty` (the `empty` state) and `AuthPage`'s `pending` (the `loading`
 * state). The contract leaves them out where it adds `loadStatus`.
 */
export const LOAD_STATUS_OWNS = new Set(['empty', 'pending'])

/** Printed names that are a renderable child: `PMContent` on every platform. */
export const CONTENT_TYPES = new Set([
  'ReactNode',
  'ReactElement',
  'ReactPortal',
  'JSX.Element',
  'React.ReactNode',
  'React.ReactElement',
])

/**
 * The DOM's event types. A function parameter of one of these is left out of
 * the closure: a native member has no DOM event to pass. `React.MouseEvent`
 * reads as `MouseEvent`.
 */
export const DOM_EVENTS = new Set([
  'Event',
  'MouseEvent',
  'KeyboardEvent',
  'ChangeEvent',
  'FormEvent',
  'FocusEvent',
  'PointerEvent',
])

/** A DOM event type, or a union of them (`undefined` aside). */
export function isDomEvent(type: TsType): boolean {
  const solid = branches(type).filter((part) => !isKeyword(part, 'undefined'))
  return (
    solid.length > 0 &&
    solid.every(
      (part) => part.kind === 'reference' && DOM_EVENTS.has(part.name.replace(/^React\./, '')),
    )
  )
}

/**
 * A result that settles to nothing: `void`, `Promise<void>`, or a union of
 * them (`ConfirmDialog`'s `onConfirm` returns `void | Promise<void>`).
 */
export function settles(type: TsType): boolean {
  const solid = branches(type).filter((part) => !isKeyword(part, 'undefined'))
  return (
    solid.length > 0 &&
    solid.every(
      (part) =>
        isKeyword(part, 'void') ||
        (part.kind === 'reference' &&
          part.name === 'Promise' &&
          part.args.length === 1 &&
          isKeyword(part.args[0] as TsType, 'void')),
    )
  )
}

/** Generic names with a type of the same meaning on every platform, of one type argument. */
const GENERIC_EQUIVALENTS: Record<string, string> = { ReadonlySet: 'Set', Set: 'Set' }

/** One field of a shape: the web's field, as the web declares it. */
export interface ShapeField {
  name: string
  /** The TypeScript type, spelled as the web's declaration spells it. */
  type: string
  optional?: boolean
  doc?: string
  /** Set on a field the web's declaration does not have: why the native shape needs it. */
  native?: string
  /**
   * The type as the web's declaration spells it, where that spelling is one
   * the reader does not parse (`Exclude<…>`); `type` is the same type written
   * out, which the contract maps.
   */
  web?: string
}

/** A named object type's shape: its type parameters and its fields, in the web's order. */
export interface Shape {
  parameters?: readonly string[]
  fields: readonly ShapeField[]
  /**
   * Set on a shape the web leaves unnamed, an object type it writes inline
   * (`ApprovalCard`'s `messages`): why the native contract names it. Such a
   * shape is recognised by its fields wherever the registry prints that
   * object, as an unnamed union is by its branches.
   */
  native?: string
  /**
   * The field that says which branch of a union the object is (`kind` on
   * Menu's entries). The shape leaves it out, because the union's enum case
   * says it; a shape with no other field is a case without a value.
   */
  discriminant?: string
  /**
   * Set on a shape of a class from a package outside the vocabulary
   * (`@internationalized/date`'s `CalendarDate`): its module, and why each of
   * the class's fields the shape leaves out is left out. `contracts.test.ts`
   * holds the shape to the class's declaration in that package.
   */
  library?: { module: string; omits: Readonly<Record<string, string>> }
}

/**
 * Names the native contract writes as another type's shape, with why. The web's
 * `CalendarDateTime` is a `CalendarDate` with a time of day; DatePicker takes
 * one or the other by its `granularity`, and a native value is typed once, so
 * a `CalendarDateTime` is a `PMCalendarDate` whose `hour` and `minute` are set.
 */
export const SHAPE_ALIASES: Readonly<Record<string, string>> = {
  CalendarDateTime: 'CalendarDate',
}

const spaceStep = (name: string): ShapeField => ({ name, type: 'SpaceStep', optional: true })

/**
 * The named object types the native members read, with their shapes. Each is
 * the web's interface of the same name; `contracts.test.ts` compares every
 * field's name, optionality and type with the web's source.
 */
export const SHAPES: Readonly<Record<string, Shape>> = {
  AccordionItem: {
    fields: [
      { name: 'value', type: 'string' },
      { name: 'label', type: 'string' },
      { name: 'content', type: 'ReactNode' },
      { name: 'disabled', type: 'boolean', optional: true },
    ],
  },
  AppShellTopbar: {
    fields: [
      { name: 'leading', type: 'ReactNode', optional: true },
      { name: 'trailing', type: 'ReactNode', optional: true },
    ],
  },
  ApprovalCardMessages: {
    native:
      'The web types ApprovalCard’s `messages` inline; a native contract names the record so a ' +
      'host can pass its own.',
    fields: [
      { name: 'approved', type: 'string' },
      { name: 'denied', type: 'string' },
    ],
  },
  ArtifactView: {
    fields: [
      { name: 'id', type: 'string' },
      { name: 'label', type: 'string' },
      { name: 'content', type: 'ReactNode' },
    ],
  },
  AudioPlayerMessages: {
    fields: [
      {
        name: 'play',
        type: 'string',
        doc: 'The play control’s name while the recording is not playing.',
      },
      { name: 'pause', type: 'string', doc: 'The play control’s name while the recording plays.' },
      { name: 'scrubber', type: 'string', doc: 'The scrubber’s name.' },
      {
        name: 'position',
        type: '(elapsed: string, total: string) => string',
        doc: 'The scrubber’s spoken value, from the elapsed and the total length in words.',
      },
      {
        name: 'failed',
        type: 'string',
        doc: 'Said in place of the scrubber when the file cannot be loaded.',
      },
    ],
  },
  BreadcrumbItem: {
    fields: [
      { name: 'label', type: 'string' },
      { name: 'href', type: 'string', optional: true },
      {
        name: 'onSelect',
        type: '() => void',
        optional: true,
        doc: 'For a crumb with no `href` that routes in code; a router takes a crumb with an `href` through `onNavigate`.',
      },
    ],
  },
  ButtonCount: {
    fields: [
      {
        name: 'value',
        type: 'number',
        doc: 'The number; past 99 it draws as “99+”, and zero or less draws nothing.',
      },
      {
        name: 'label',
        type: 'string',
        doc: 'The accessible name while `value` is above zero, in the app’s words.',
      },
    ],
  },
  CalendarDate: {
    library: {
      module: '@internationalized/date',
      omits: {
        calendar:
          'A native date is in the Gregorian calendar, the one the platform pickers edit; the ' +
          'locale still names its months and orders its fields.',
        era: 'The Gregorian era follows from the year.',
      },
    },
    fields: [
      { name: 'year', type: 'number' },
      { name: 'month', type: 'number', doc: '1 to 12.' },
      { name: 'day', type: 'number', doc: '1 to the month’s length.' },
      {
        name: 'hour',
        type: 'number',
        optional: true,
        native:
          'The hour, 0 to 23, of a date with a time: the web’s `CalendarDateTime`, which ' +
          'DatePicker takes at `hour` and `minute` granularity (`SHAPE_ALIASES`). Absent on a ' +
          'date alone.',
      },
      {
        name: 'minute',
        type: 'number',
        optional: true,
        native: 'The minute, 0 to 59, of a date with a time, as `hour` is.',
      },
    ],
  },
  CalendarMessages: {
    fields: [
      { name: 'previousMonth', type: 'string' },
      { name: 'nextMonth', type: 'string' },
    ],
  },
  CardPatch: {
    fields: [
      spaceStep('p'),
      spaceStep('px'),
      spaceStep('py'),
      { name: 'radius', type: 'RadiusStep', optional: true },
    ],
  },
  CarouselRoleDescriptions: {
    native:
      'The web types Carousel’s `roleDescriptions` inline; a native contract names the pair so a ' +
      'host can pass its own.',
    fields: [
      { name: 'carousel', type: 'string' },
      { name: 'slide', type: 'string' },
    ],
  },
  CarouselSlide: {
    fields: [
      { name: 'id', type: 'string' },
      {
        name: 'label',
        type: 'string',
        doc: 'Names the slide and its dot, such as “Dashboard” rather than “Slide 2”.',
      },
      { name: 'content', type: 'ReactNode' },
    ],
  },
  ChartBandAnnotation: {
    native:
      'The web types each branch of `ChartAnnotation` inline; a native contract names each ' +
      'branch to make it a case of the union.',
    discriminant: 'kind',
    fields: [
      { name: 'from', type: 'number' },
      { name: 'to', type: 'number' },
      { name: 'label', type: 'string', optional: true },
    ],
  },
  ChartBaseline: {
    fields: [
      { name: 'value', type: 'number' },
      { name: 'label', type: 'string', optional: true },
    ],
  },
  ChartLineAnnotation: {
    native:
      'The web types each branch of `ChartAnnotation` inline; a native contract names each ' +
      'branch to make it a case of the union.',
    discriminant: 'kind',
    fields: [
      { name: 'value', type: 'number' },
      { name: 'label', type: 'string', optional: true },
    ],
  },
  ChartMessages: {
    fields: [
      {
        name: 'summary',
        type: '(chart: { label: string; series: readonly string[]; points: number; measure?: string; xMeasure?: string }) => string',
        // The web breaks the inline object over lines, one field to a line.
        web: '(chart: { label: string series: readonly string[] points: number measure?: string xMeasure?: string }) => string',
        doc:
          'The summary sentence of a series chart and of Histogram, whose `series` is empty. ' +
          '`measure` is the `y.label` the values are in, and `xMeasure` a ScatterChart’s ' +
          '`x.label`; each is absent while the chart names none.',
      },
      { name: 'donutSummary', type: '(chart: { label: string; segments: number }) => string' },
      {
        name: 'heatmapSummary',
        type: '(chart: { label: string; grid?: { rows: number; columns: number } }) => string',
        doc: '`grid` is absent when there is no data.',
      },
      {
        name: 'radarSummary',
        type: '(chart: { label: string; axes: number; series: number; max: string }) => string',
        doc: '`max` is the shared scale’s top, already formatted.',
      },
      { name: 'funnelSummary', type: '(chart: { label: string; stages: number }) => string' },
      {
        name: 'treemapSummary',
        type: '(map: { label: string; items: number; groups: number; absent: number }) => string',
        doc: '`groups` is 0 for one level; `absent` counts the items with no positive value.',
      },
      {
        name: 'activationHint',
        type: 'string',
        doc: 'Appended to the summary when, and only when, the member has an `onSelect`.',
      },
      { name: 'empty', type: 'string', doc: 'The sentence on an empty plot.' },
      { name: 'noData', type: 'string', doc: 'Said for a gap, which a blank would read as zero.' },
      { name: 'showTable', type: '(label: string) => string' },
      { name: 'hideTable', type: '(label: string) => string' },
      { name: 'tableLabel', type: '(label: string) => string' },
      { name: 'segmentColumn', type: 'string' },
      { name: 'valueColumn', type: 'string' },
      { name: 'shareColumn', type: 'string' },
      { name: 'rangeColumn', type: 'string' },
      { name: 'countColumn', type: 'string' },
      { name: 'stageColumn', type: 'string' },
      { name: 'continuedColumn', type: 'string' },
      {
        name: 'continued',
        type: '(rate: string) => string',
        doc: 'The step between two funnel stages, given the rate formatted: `62% continued`.',
      },
      { name: 'groupColumn', type: 'string' },
      { name: 'itemColumn', type: 'string' },
      {
        name: 'quarter',
        type: '(quarter: number) => string',
        doc: 'The quarter label on a date axis, given the quarter 1–4: `Q3` in English.',
      },
    ],
  },
  ChartPointAnnotation: {
    native:
      'The web types each branch of `ChartAnnotation` inline; a native contract names each ' +
      'branch to make it a case of the union.',
    discriminant: 'kind',
    fields: [
      { name: 'x', type: 'string | number' },
      { name: 'y', type: 'number' },
      { name: 'label', type: 'string' },
    ],
  },
  ChartRowSelection: {
    native:
      'LineChart and AreaChart type the `onSelect` payload inline; a native closure takes it as ' +
      'a named value.',
    fields: [
      { name: 'index', type: 'number' },
      { name: 'datum', type: 'Readonly<Record<string, string | number | null>>' },
    ],
  },
  ChartSeries: {
    fields: [
      { name: 'key', type: 'string', doc: 'The field name in each row.' },
      {
        name: 'label',
        type: 'string',
        doc: 'The legend and readout name, never derived from the key.',
      },
      {
        name: 'slot',
        type: 'ChartSlot',
        optional: true,
        doc: 'The categorical slot 1–8; declaration order by default.',
      },
      {
        name: 'tone',
        type: 'SeriesTone',
        optional: true,
        doc: 'A status tone, the alternative to `slot`; it wins when both are set.',
      },
      {
        name: 'icon',
        type: 'IconRole',
        optional: true,
        doc: 'Drawn beside the legend key, never in place of it.',
      },
    ],
  },
  ChartSeriesSelection: {
    native:
      'BarChart and ScatterChart type the `onSelect` payload inline; a native closure takes it ' +
      'as a named value.',
    fields: [
      { name: 'index', type: 'number' },
      { name: 'key', type: 'string' },
      { name: 'datum', type: 'Readonly<Record<string, string | number | null>>' },
    ],
  },
  ChartSummaryFacts: {
    native:
      '`ChartMessages.summary` takes the facts as an inline object; a native closure takes them ' +
      'as a named value.',
    fields: [
      { name: 'label', type: 'string' },
      { name: 'series', type: 'readonly string[]' },
      { name: 'points', type: 'number' },
      { name: 'measure', type: 'string', optional: true },
      { name: 'xMeasure', type: 'string', optional: true },
    ],
  },
  ChartTooltipConfig: {
    fields: [
      { name: 'indicator', type: 'TooltipIndicator', optional: true },
      { name: 'hideLabel', type: 'boolean', optional: true },
    ],
  },
  ChartXAxis: {
    fields: [
      { name: 'key', type: 'string' },
      { name: 'scale', type: 'ChartScaleKind', optional: true, doc: '`band` by default.' },
      { name: 'label', type: 'string', optional: true },
      { name: 'format', type: 'ValueFormat', optional: true },
      {
        name: 'ticks',
        type: 'number',
        optional: true,
        doc: 'A target tick count on a continuous scale.',
      },
    ],
  },
  ChartYAxis: {
    fields: [
      { name: 'label', type: 'string', optional: true },
      { name: 'format', type: 'ValueFormat', optional: true },
      { name: 'ticks', type: 'number', optional: true, doc: 'A target tick count, about 4–5.' },
      {
        name: 'domain',
        type: "'auto' | 'zero'",
        optional: true,
        doc: '`auto` fits the data; a bar is always anchored at zero.',
      },
    ],
  },
  ChatThreadMessages: {
    fields: [
      {
        name: 'jumpToLatest',
        type: 'string',
        doc: 'The label of the button that scrolls to the newest turn.',
      },
    ],
  },
  CheckboxGroupOption: {
    fields: [
      { name: 'value', type: 'string' },
      { name: 'label', type: 'string' },
      { name: 'description', type: 'string', optional: true },
      { name: 'disabled', type: 'boolean', optional: true },
    ],
  },
  ChoiceCardOption: {
    fields: [
      { name: 'value', type: 'string' },
      { name: 'label', type: 'string' },
      { name: 'description', type: 'string', optional: true },
      { name: 'icon', type: 'IconRole', optional: true },
      { name: 'disabled', type: 'boolean', optional: true },
    ],
  },
  CitationSource: {
    fields: [
      { name: 'title', type: 'string', doc: 'The page’s own title, or the app’s name for it.' },
      { name: 'href', type: 'string' },
      {
        name: 'domain',
        type: 'string',
        optional: true,
        doc: 'The host, already shortened by the app, such as `example.org`.',
      },
      {
        name: 'snippet',
        type: 'string',
        optional: true,
        doc: 'The passage that answered, as the preview’s body.',
      },
    ],
  },
  ColorInputMessages: {
    fields: [
      {
        name: 'plane',
        type: 'string',
        optional: true,
        doc: 'The web’s saturation and brightness plane’s name. Default: `saturation and brightness`.',
      },
      {
        name: 'planeValue',
        type: '(saturation: number, brightness: number) => string',
        optional: true,
        doc: 'The plane’s value text. Default: `saturation {saturation}, brightness {brightness}`.',
      },
      {
        name: 'hue',
        type: 'string',
        optional: true,
        doc: 'The web’s hue rail’s name. Default: `hue`.',
      },
      {
        name: 'alpha',
        type: 'string',
        optional: true,
        doc: 'The web’s alpha rail’s name. Default: `alpha`.',
      },
      {
        name: 'railValue',
        type: '(name: string, value: number) => string',
        optional: true,
        doc: 'A rail’s value text, given its name and its value. Default: `{name} {value}`.',
      },
    ],
  },
  ComboboxMessages: {
    fields: [
      {
        name: 'showOptions',
        type: 'string',
        optional: true,
        doc: 'The chevron’s accessible name. Default: `Show options`.',
      },
      {
        name: 'clear',
        type: 'string',
        optional: true,
        doc: 'The clear button’s accessible name. Default: `Clear`.',
      },
      {
        name: 'loadingOptions',
        type: 'string',
        optional: true,
        doc: 'The async status while the list loads. Default: `Loading options…`.',
      },
      {
        name: 'options',
        type: '(count: number) => string',
        optional: true,
        doc: 'The async status naming the result count. Default: `{count} options`, `1 option` for one.',
      },
      {
        name: 'list',
        type: 'string',
        optional: true,
        doc: 'The list’s accessible name on the web. Default: `Suggestions`.',
      },
    ],
  },
  ComboboxOption: {
    fields: [
      { name: 'value', type: 'string' },
      { name: 'label', type: 'string' },
      { name: 'description', type: 'string', optional: true },
      { name: 'disabled', type: 'boolean', optional: true },
    ],
  },
  CommentThreadMessages: {
    fields: [
      { name: 'edited', type: 'string', doc: 'Shown after the time of an edited comment.' },
      { name: 'replies', type: 'string', doc: 'The name of a comment’s list of replies.' },
    ],
  },
  CountdownMessages: {
    fields: [
      {
        name: 'mark',
        type: '(label: string, time: string) => string',
        doc: 'Joins the label and the time left in words, for the line said at one minute and at ten seconds.',
      },
    ],
  },
  CursorPaginationMessages: {
    fields: [
      { name: 'previous', type: 'string' },
      { name: 'next', type: 'string' },
      {
        name: 'more',
        type: 'string',
        optional: true,
        doc: 'The append form’s action. Default: `Load more`.',
      },
      {
        name: 'end',
        type: 'string',
        optional: true,
        doc: 'What the append form says once the list has no more. Default: `No more to load`.',
      },
    ],
  },
  DataTableColumn: {
    parameters: ['Row'],
    fields: [
      { name: 'key', type: 'string' },
      { name: 'header', type: 'string' },
      {
        name: 'value',
        type: '(row: Row) => string',
        native:
          'The cell as text: what a row shows where the column has no `cell`, and what ' +
          'assistive technology reads. The web derives it from `row[key]`; a native row type ' +
          'has no field to look up by name.',
      },
      {
        name: 'cell',
        type: '(row: Row) => ReactNode',
        optional: true,
        doc: 'The cell as a view; `value` as text when absent.',
      },
      { name: 'sortable', type: 'boolean', optional: true },
      { name: 'numeric', type: 'boolean', optional: true },
    ],
  },
  DataTableMessages: {
    fields: [
      {
        name: 'selected',
        type: '(count: number) => string',
        doc: 'The bulk bar’s count, a function because plural rules belong to the catalog.',
      },
      { name: 'selectAll', type: 'string' },
      {
        name: 'selectRow',
        type: 'string',
        doc: 'The per-row checkbox’s name when `getRowLabel` is not supplied.',
      },
      {
        name: 'detailsLabel',
        type: '(rowName: string | undefined) => string',
        optional: true,
        doc:
          'Names a row’s disclosure, from what `getRowName` returns for the row, and names ' +
          'the expansion column, called with no name.',
      },
    ],
  },
  DataTableRowDetail: {
    parameters: ['Row'],
    fields: [
      { name: 'row', type: 'Row' },
      {
        name: 'close',
        type: '() => void',
        doc:
          'Closes this row’s detail. When focus is inside the detail it moves to the row’s ' +
          'disclosure first. It does nothing for a row that is not open.',
      },
    ],
  },
  DataTableSort: {
    fields: [
      { name: 'key', type: 'string' },
      { name: 'direction', type: 'SortDirection' },
    ],
  },
  DatePickerMessages: {
    fields: [
      { name: 'previousMonth', type: 'string' },
      { name: 'nextMonth', type: 'string' },
      { name: 'showCalendar', type: 'string' },
      { name: 'clear', type: 'string' },
      { name: 'chooseDate', type: 'string', doc: 'The popup’s accessible name.' },
      {
        name: 'empty',
        type: 'string',
        optional: true,
        doc: 'What an unfilled segment says as its value on the web. Default: `Empty`.',
      },
    ],
  },
  DateRange: {
    fields: [
      { name: 'start', type: 'CalendarDate' },
      { name: 'end', type: 'CalendarDate' },
    ],
  },
  DateRangePickerMessages: {
    fields: [
      { name: 'previousMonth', type: 'string' },
      { name: 'nextMonth', type: 'string' },
      { name: 'showCalendar', type: 'string' },
      { name: 'clear', type: 'string' },
      { name: 'chooseRange', type: 'string', doc: 'The popup’s accessible name.' },
      {
        name: 'empty',
        type: 'string',
        optional: true,
        doc: 'What an unfilled segment says as its value on the web. Default: `Empty`.',
      },
      {
        name: 'start',
        type: 'string',
        optional: true,
        doc: 'The start’s name, said after the field’s: with each of its segments on the web, and with its date on iOS. Default: `Start date`.',
      },
      {
        name: 'end',
        type: 'string',
        optional: true,
        doc: 'The end’s name, said after the field’s: with each of its segments on the web, and with its date on iOS. Default: `End date`.',
      },
    ],
  },
  DiffMessages: {
    fields: [
      { name: 'from', type: 'string', doc: 'Read before the old value of a change.' },
      { name: 'to', type: 'string', doc: 'Read between the old value and the new one.' },
      { name: 'added', type: 'string', doc: 'Read before an added value or line.' },
      { name: 'removed', type: 'string', doc: 'Read before a removed value or line.' },
      {
        name: 'unchanged',
        type: '(count: number) => string',
        doc: 'The text of a collapsed run of unchanged lines, which says how many it holds.',
      },
    ],
  },
  DescriptionListItem: {
    fields: [
      { name: 'term', type: 'string', doc: 'A label is always text, so this is a string.' },
      { name: 'detail', type: 'ReactNode' },
    ],
  },
  DonutCenter: {
    fields: [
      { name: 'value', type: 'string', doc: 'Pre-formatted by the app.' },
      { name: 'label', type: 'string', optional: true },
    ],
  },
  DonutSegment: {
    fields: [
      { name: 'key', type: 'string' },
      { name: 'label', type: 'string' },
      { name: 'value', type: 'number' },
      {
        name: 'slot',
        type: 'ChartSlot',
        optional: true,
        doc: 'Declaration order by default, so the colour follows the entity.',
      },
    ],
  },
  DonutSelection: {
    native:
      'DonutChart and Treemap type the `onSelect` payload inline; a native closure takes it as ' +
      'a named value.',
    fields: [
      { name: 'key', type: 'string' },
      { name: 'label', type: 'string' },
      { name: 'value', type: 'number' },
      { name: 'share', type: 'number' },
    ],
  },
  DonutSummaryFacts: {
    native:
      '`ChartMessages.donutSummary` takes the facts as an inline object; a native closure takes ' +
      'them as a named value.',
    fields: [
      { name: 'label', type: 'string' },
      { name: 'segments', type: 'number' },
    ],
  },
  DurationInputMessages: {
    fields: [{ name: 'empty', type: 'string', doc: 'What an empty count says as its value.' }],
  },
  ErrorSummaryError: {
    fields: [
      {
        name: 'label',
        type: 'string',
        doc: 'The message, worded exactly as the field’s own error.',
      },
      { name: 'fieldId', type: 'string', doc: 'The id of the control the error belongs to.' },
    ],
  },
  FileRejection: {
    fields: [
      { name: 'file', type: 'File' },
      { name: 'reason', type: 'FileRejectionReason' },
    ],
  },
  FileUploadItem: {
    fields: [
      { name: 'id', type: 'string' },
      { name: 'name', type: 'string' },
      {
        name: 'size',
        type: 'number',
        optional: true,
        doc: 'Bytes. Rendered as the row’s meta line when the app knows it.',
      },
      { name: 'status', type: 'FileUploadStatus' },
      { name: 'progress', type: 'number', optional: true, doc: '0–100, for `uploading`.' },
      {
        name: 'message',
        type: 'string',
        optional: true,
        doc: 'The app’s text for a failure. The vocabulary never writes one.',
      },
    ],
  },
  FileUploadMessages: {
    native:
      'The web types FileUpload’s `messages` inline; a native contract names the record so a ' +
      'host can pass its own.',
    fields: [
      { name: 'retry', type: 'string' },
      { name: 'remove', type: '(name: string) => string' },
      { name: 'progress', type: '(name: string) => string' },
      { name: 'announcement', type: '(file: FileUploadItem) => string' },
      { name: 'formatSize', type: '(bytes: number) => string' },
    ],
  },
  FilterBarMessages: {
    fields: [
      { name: 'clear', type: 'string' },
      { name: 'resultCount', type: '(count: FilterResultCount) => string' },
    ],
  },
  FilterResultCount: {
    fields: [
      { name: 'shown', type: 'number' },
      {
        name: 'total',
        type: 'number',
        optional: true,
        doc: 'Omitted when unknown: a cursor-paged list holds one window.',
      },
    ],
  },
  FunnelSelection: {
    native:
      'FunnelChart types the `onSelect` payload inline; a native closure takes it as a named ' +
      'value.',
    fields: [
      { name: 'index', type: 'number' },
      { name: 'key', type: 'string' },
      { name: 'label', type: 'string' },
      { name: 'value', type: 'number' },
    ],
  },
  FunnelStage: {
    fields: [
      { name: 'key', type: 'string' },
      { name: 'label', type: 'string' },
      { name: 'value', type: 'number', doc: 'A count; stages are expected not to rise.' },
    ],
  },
  FunnelSummaryFacts: {
    native:
      '`ChartMessages.funnelSummary` takes the facts as an inline object; a native closure takes ' +
      'them as a named value.',
    fields: [
      { name: 'label', type: 'string' },
      { name: 'stages', type: 'number' },
    ],
  },
  HeatmapGrid: {
    native:
      'The grid’s shape in `ChartMessages.heatmapSummary`’s facts, which the web types inline.',
    fields: [
      { name: 'rows', type: 'number' },
      { name: 'columns', type: 'number' },
    ],
  },
  HeatmapSelection: {
    native:
      'Heatmap types the `onSelect` payload inline; a native closure takes it as a named value.',
    fields: [
      { name: 'x', type: 'string | number' },
      { name: 'y', type: 'string | number' },
      { name: 'value', type: 'number' },
    ],
  },
  HeatmapSummaryFacts: {
    native:
      '`ChartMessages.heatmapSummary` takes the facts as an inline object; a native closure ' +
      'takes them as a named value.',
    fields: [
      { name: 'label', type: 'string' },
      { name: 'grid', type: '{ rows: number; columns: number }', optional: true },
    ],
  },
  HeatmapValue: {
    fields: [
      { name: 'key', type: 'string' },
      { name: 'format', type: 'ValueFormat', optional: true },
    ],
  },
  HeatmapYAxis: {
    fields: [
      { name: 'key', type: 'string' },
      { name: 'label', type: 'string', optional: true },
    ],
  },
  HistogramBin: {
    native: 'A bin in Histogram’s `onSelect` payload, which the web types inline.',
    fields: [
      { name: 'from', type: 'number' },
      { name: 'to', type: 'number' },
      { name: 'count', type: 'number' },
    ],
  },
  HistogramSelection: {
    native:
      'Histogram types the `onSelect` payload inline; a native closure takes it as a named ' +
      'value.',
    fields: [{ name: 'bin', type: '{ from: number; to: number; count: number }' }],
  },
  HistogramXAxis: {
    fields: [
      { name: 'label', type: 'string', optional: true },
      { name: 'format', type: 'ValueFormat', optional: true },
    ],
  },
  ImageEditorMessages: {
    fields: [
      { name: 'title', type: 'string', optional: true, doc: 'The empty state’s title.' },
      { name: 'hint', type: 'string', optional: true, doc: 'The empty state’s hint.' },
      { name: 'browse', type: 'string', optional: true, doc: 'The choose control.' },
      { name: 'rotate', type: 'string', optional: true, doc: 'The rotate control’s name.' },
      { name: 'flip', type: 'string', optional: true, doc: 'The mirror control’s name.' },
      { name: 'reset', type: 'string', optional: true, doc: 'The reset control’s name.' },
      { name: 'zoom', type: 'string', optional: true, doc: 'The zoom slider’s name.' },
      { name: 'cancel', type: 'string', optional: true },
      { name: 'confirm', type: 'string', optional: true },
      { name: 'alt', type: 'string', optional: true, doc: 'The stage image’s name.' },
      { name: 'stage', type: 'string', optional: true, doc: 'The stage’s name.' },
      {
        name: 'loadError',
        type: 'string',
        optional: true,
        doc: 'Announced when the chosen bytes are not an image.',
      },
    ],
  },
  InlineEditMessages: {
    fields: [
      {
        name: 'edit',
        type: '(label: string) => string',
        doc: 'The edit control’s accessible name, made from the field’s label.',
      },
      { name: 'save', type: 'string', doc: 'The save control’s accessible name.' },
      { name: 'cancel', type: 'string', doc: 'The cancel control’s accessible name.' },
    ],
  },
  LayoutPatch: { fields: [spaceStep('gap'), spaceStep('p'), spaceStep('px'), spaceStep('py')] },
  LogLine: {
    fields: [
      { name: 'id', type: 'string', doc: 'Unique in the log and the same on every render.' },
      { name: 'text', type: 'string', doc: 'The line as it was written; whitespace is content.' },
      {
        name: 'level',
        type: "'info' | 'warning' | 'error'",
        optional: true,
        doc: 'Drawn as a marker and read as a word; none is ordinary output.',
      },
      {
        name: 'time',
        type: 'string',
        optional: true,
        doc: 'Already formatted by the application; LogView shows the time but does not format it.',
      },
      {
        name: 'source',
        type: 'string',
        optional: true,
        doc: 'What wrote the line: a service, a process or a build step.',
      },
    ],
  },
  LogViewMessages: {
    fields: [
      {
        name: 'jumpToLatest',
        type: 'string',
        doc: 'The label of the button that returns the reader to the newest line.',
      },
      { name: 'info', type: 'string', doc: 'Read before an info line.' },
      { name: 'warning', type: 'string', doc: 'Read before a warning line.' },
      { name: 'error', type: 'string', doc: 'Read before an error line.' },
    ],
  },
  LightboxImage: {
    fields: [
      {
        name: 'src',
        type: 'string',
        doc: 'The picture’s URL; an empty string is Image’s failed state.',
      },
      { name: 'alt', type: 'string', doc: 'The picture’s accessible name, as Image’s `alt`.' },
    ],
  },
  LightboxMessages: {
    fields: [
      { name: 'close', type: 'string' },
      { name: 'previous', type: 'string' },
      { name: 'next', type: 'string' },
      {
        name: 'position',
        type: '(position: number, count: number) => string',
        doc: 'The position line, “2 of 5”; `position` counts from 1.',
      },
    ],
  },
  MenuCheckboxEntry: {
    discriminant: 'kind',
    fields: [
      { name: 'label', type: 'string' },
      { name: 'checked', type: 'boolean' },
      { name: 'onCheckedChange', type: '(checked: boolean) => void' },
      { name: 'disabled', type: 'boolean', optional: true },
    ],
  },
  MenuItemEntry: {
    discriminant: 'kind',
    fields: [
      { name: 'label', type: 'string' },
      { name: 'icon', type: 'IconRole', optional: true },
      {
        name: 'kbd',
        type: 'string',
        optional: true,
        doc: 'A displayed shortcut hint, never a binding; the app wires global shortcuts.',
      },
      { name: 'tone', type: "'neutral' | 'danger'", optional: true },
      { name: 'disabled', type: 'boolean', optional: true },
      { name: 'onSelect', type: '() => void' },
    ],
  },
  MenuLabelEntry: {
    discriminant: 'kind',
    fields: [{ name: 'label', type: 'string' }],
  },
  MenuSeparatorEntry: { discriminant: 'kind', fields: [] },
  MenuSubmenuEntry: {
    discriminant: 'kind',
    fields: [
      { name: 'label', type: 'string' },
      { name: 'icon', type: 'IconRole', optional: true },
      { name: 'disabled', type: 'boolean', optional: true },
      { name: 'items', type: 'MenuLeafEntry[]' },
    ],
  },
  MeterMessages: {
    fields: [
      { name: 'warning', type: 'string', doc: 'The status glyph’s name in the warning band.' },
      { name: 'danger', type: 'string', doc: 'The status glyph’s name in the danger band.' },
    ],
  },
  ModeSwitchMessages: {
    fields: [
      { name: 'light', type: 'string', doc: 'The segment that pins the light mode.' },
      { name: 'dark', type: 'string', doc: 'The segment that pins the dark mode.' },
      { name: 'system', type: 'string', doc: 'The segment that follows the system’s mode.' },
    ],
  },
  MonthInputMessages: {
    fields: [{ name: 'empty', type: 'string', doc: 'What an unfilled segment says as its value.' }],
  },
  MultiSelectMessages: {
    fields: [
      {
        name: 'add',
        type: '(text: string) => string',
        optional: true,
        doc: 'The mint row’s label (`allowCustom`). Default: `Add "{text}"`.',
      },
      {
        name: 'added',
        type: '(value: string, count: number) => string',
        optional: true,
        doc: 'Announced when a custom value is added. Default: `{value} added, {count} selected`.',
      },
      {
        name: 'removed',
        type: '(label: string, count: number) => string',
        optional: true,
        doc:
          'Announced on removal from a chip or the list. Default: ' +
          '`{label} removed, {count} selected`.',
      },
      {
        name: 'refused',
        type: '(text: string) => string',
        optional: true,
        doc: 'Announced on Enter for text that `validate` rejected. Default: `Cannot add "{text}"`.',
      },
      {
        name: 'alreadySelected',
        type: '(value: string) => string',
        optional: true,
        doc:
          'Announced on Enter for a value that is already selected. Default: ' +
          '`"{value}" is already selected`.',
      },
      {
        name: 'selected',
        type: '(count: number, max: number | undefined) => string',
        optional: true,
        doc: 'The count description, which states the maximum once it is reached.',
      },
      {
        name: 'showOptions',
        type: 'string',
        optional: true,
        doc: 'The chevron’s accessible name. Default: `Show options`.',
      },
      {
        name: 'remove',
        type: '(label: string) => string',
        optional: true,
        doc: 'A chip remove button’s accessible name. Default: `Remove {label}`.',
      },
      {
        name: 'loadingOptions',
        type: 'string',
        optional: true,
        doc: 'The async status while the list loads. Default: `Loading options…`.',
      },
      {
        name: 'options',
        type: '(count: number) => string',
        optional: true,
        doc: 'The async status naming the result count. Default: `{count} options`, `1 option` for one.',
      },
    ],
  },
  MultiSelectOption: {
    fields: [
      { name: 'value', type: 'string' },
      { name: 'label', type: 'string' },
      { name: 'description', type: 'string', optional: true },
      { name: 'disabled', type: 'boolean', optional: true },
    ],
  },
  NumberFormat: {
    fields: [
      {
        name: 'currency',
        type: 'string',
        optional: true,
        doc: 'ISO 4217; required when style is `currency`.',
      },
      { name: 'maximumFractionDigits', type: 'number', optional: true },
      {
        name: 'style',
        type: "'decimal' | 'percent' | 'currency'",
        web: "Exclude<ValueFormat['style'], 'date' | 'compact'>",
        optional: true,
        doc: '`percent` takes ratios (0–1), and the field shows them multiplied by 100.',
      },
    ],
  },
  NumberInputMessages: {
    fields: [
      {
        name: 'increment',
        type: 'string',
        optional: true,
        doc: 'The step-up button’s name. Default: the strings catalogue’s `numberInputIncrement`.',
      },
      {
        name: 'decrement',
        type: 'string',
        optional: true,
        doc: 'The step-down button’s name. Default: the strings catalogue’s `numberInputDecrement`.',
      },
    ],
  },
  PaginationMessages: {
    fields: [
      { name: 'previous', type: 'string' },
      { name: 'next', type: 'string' },
      {
        name: 'page',
        type: '(page: number) => string',
        doc: 'A numbered button’s accessible name; the visible text stays the digit.',
      },
    ],
  },
  PlanMessages: {
    fields: [
      {
        name: 'status',
        type: 'Record<PlanStatus, string>',
        doc: 'The words for each status, read after a step’s title.',
      },
    ],
  },
  PlanStep: {
    fields: [
      {
        name: 'id',
        type: 'string',
        doc: 'Unique in the plan. The step keeps its row while its status changes.',
      },
      { name: 'title', type: 'string', doc: 'What the step does, in the product’s words.' },
      {
        name: 'description',
        type: 'string',
        optional: true,
        doc: 'One line under the title: what the step found, or why it failed.',
      },
      { name: 'status', type: 'PlanStatus' },
    ],
  },
  PhoneInputMessages: {
    fields: [
      {
        name: 'country',
        type: 'string',
        optional: true,
        doc: 'The country control’s name. Default: `Country calling code`.',
      },
      {
        name: 'showCountries',
        type: 'string',
        optional: true,
        doc: 'The country list button’s name. Default: `Show countries`.',
      },
      {
        name: 'countriesShown',
        type: '(count: number) => string',
        optional: true,
        doc: 'Announced while the list is open. Default: `{count} countries`, `1 country` for one.',
      },
      {
        name: 'noCountry',
        type: 'string',
        optional: true,
        doc: 'The list’s one row when nothing matches the typed text. Default: `No matching country`.',
      },
    ],
  },
  PromptAttachment: {
    fields: [
      { name: 'id', type: 'string' },
      { name: 'name', type: 'string' },
      { name: 'size', type: 'number', optional: true },
      { name: 'status', type: 'AttachmentStatus', optional: true },
      {
        name: 'message',
        type: 'string',
        optional: true,
        doc: 'The app’s text for a failure, which the composer never writes itself.',
      },
    ],
  },
  PromptInputMessages: {
    fields: [
      { name: 'send', type: 'string' },
      { name: 'stop', type: 'string' },
      { name: 'attach', type: 'string' },
      { name: 'remove', type: '(name: string) => string' },
      {
        name: 'uploading',
        type: '(name: string) => string',
        doc: 'The status announced while a chip’s file uploads.',
      },
      {
        name: 'suggestions',
        type: '(count: number) => string',
        optional: true,
        doc: 'The status announced while the suggestion list is open. Default: `{count} suggestions`, `1 suggestion` for one.',
      },
      {
        name: 'loadingSuggestions',
        type: 'string',
        optional: true,
        doc: 'The status while a trigger’s options load. Default: `Loading suggestions…`.',
      },
      {
        name: 'noSuggestions',
        type: 'string',
        optional: true,
        doc: 'The list’s one row, and the status, when no option matches. Default: `No results`.',
      },
    ],
  },
  PromptTrigger: {
    fields: [
      { name: 'char', type: 'string', doc: 'The one character that opens the list: `@`, `/`.' },
      { name: 'label', type: 'string', doc: 'The list’s accessible name: `People`, `Commands`.' },
      { name: 'options', type: 'PromptTriggerOption[]' },
      {
        name: 'at',
        type: "'word' | 'start'",
        optional: true,
        doc: 'Where the character opens the list: at the start of any word, or only as the prompt’s first character.',
      },
      {
        name: 'filter',
        type: "'contains' | 'startsWith' | false",
        optional: true,
        doc: 'Combobox’s filter. `false` means the app filters, and its options are shown as given.',
      },
      {
        name: 'loading',
        type: 'boolean',
        optional: true,
        doc: 'The app is loading options: skeleton rows under the options.',
      },
      {
        name: 'onQueryChange',
        type: '(query: string) => void',
        optional: true,
        doc: 'Called with the typed query when the list opens and each time the query changes.',
      },
      {
        name: 'onSelect',
        type: '(option: PromptTriggerOption) => void',
        optional: true,
        doc: 'Called with the option a pick wrote, after the text has changed.',
      },
    ],
  },
  PromptTriggerOption: {
    fields: [
      { name: 'id', type: 'string', doc: 'The app’s id, handed back in the pick.' },
      { name: 'label', type: 'string' },
      {
        name: 'description',
        type: 'string',
        optional: true,
        doc: 'A second line under the label.',
      },
      { name: 'icon', type: 'IconRole', optional: true },
      {
        name: 'insert',
        type: 'string',
        optional: true,
        doc: 'The text a pick writes in place of the typed token. Default: the trigger’s character and the label. An empty string writes nothing and removes the token, for a pick the app acts on itself.',
      },
    ],
  },
  RadarAxis: {
    fields: [
      { name: 'key', type: 'string' },
      { name: 'label', type: 'string', doc: 'Never derived from the key.' },
    ],
  },
  RadarSelection: {
    native:
      'RadarChart types the `onSelect` payload inline; a native closure takes it as a named ' +
      'value.',
    fields: [
      { name: 'axis', type: 'string' },
      { name: 'key', type: 'string' },
      { name: 'value', type: 'number' },
    ],
  },
  RadarSummaryFacts: {
    native:
      '`ChartMessages.radarSummary` takes the facts as an inline object; a native closure takes ' +
      'them as a named value.',
    fields: [
      { name: 'label', type: 'string' },
      { name: 'axes', type: 'number' },
      { name: 'series', type: 'number' },
      { name: 'max', type: 'string' },
    ],
  },
  RadioOption: {
    fields: [
      { name: 'value', type: 'string' },
      { name: 'label', type: 'string' },
      { name: 'disabled', type: 'boolean', optional: true },
    ],
  },
  RatingMessages: {
    fields: [
      {
        name: 'mark',
        type: '(value: number, numeral: string) => string',
        doc: 'A mark’s name, from the value it sets and that value written in the locale’s digits.',
      },
      {
        name: 'shown',
        type: '(label: string, value: string, max: string) => string',
        doc: 'A shown rating’s name, one sentence, with its numbers already written.',
      },
    ],
  },
  RelativeTimeMessages: {
    fields: [
      {
        name: 'both',
        type: '(moment: string, distance: string) => string',
        doc: 'Joins the moment and the distance in `mode: both`, so a locale orders and punctuates them.',
      },
    ],
  },
  RichTextContentMessages: {
    fields: [
      {
        name: 'selectionBar',
        type: 'string',
        optional: true,
        doc: 'The selection bar’s name. Default: `Selection`.',
      },
      {
        name: 'selectionBarReady',
        type: 'string',
        optional: true,
        doc: 'Said once, when the selection bar first appears.',
      },
    ],
  },
  RichTextContentSelection: {
    fields: [
      {
        name: 'range',
        type: 'RichTextRange',
        doc: 'The selection in the document’s plain text, which `annotateRichText` takes.',
      },
      { name: 'text', type: 'string', doc: 'The selected text, an entity as its label.' },
    ],
  },
  // A case of the document's inlines, whose `type` is always `'entity'`, so the
  // shape leaves the discriminant out as Menu's entries leave out `kind`.
  RichTextEntity: {
    discriminant: 'type',
    fields: [
      {
        name: 'kind',
        type: 'string',
        doc: 'The app’s name for the kind of thing: `user`, `issue`.',
      },
      { name: 'id', type: 'string', doc: 'The app’s identifier for the thing.' },
      {
        name: 'label',
        type: 'string',
        doc: 'The words drawn and read, with any leading character: `@Ada Lovelace`.',
      },
      {
        name: 'marks',
        type: 'RichTextMark[]',
        optional: true,
        doc:
          'The annotations the entity is inside, each `{ type: "annotation", id }`, and marks ' +
          'of a later version. Absent when it has none.',
      },
    ],
  },
  RichTextRange: {
    fields: [
      {
        name: 'start',
        type: 'number',
        doc: 'The first code point, of the plain text with nothing between blocks.',
      },
      {
        name: 'end',
        type: 'number',
        doc: 'The code point after the last; equal to `start` for a caret.',
      },
    ],
  },
  ScatterBubble: {
    fields: [
      { name: 'key', type: 'string' },
      {
        name: 'label',
        type: 'string',
        optional: true,
        doc: 'The readout and twin column name, never derived from the key.',
      },
      { name: 'format', type: 'ValueFormat', optional: true },
    ],
  },
  SectionNavItem: {
    fields: [
      { name: 'label', type: 'string' },
      { name: 'href', type: 'string' },
    ],
  },
  SegmentedControlOption: {
    fields: [
      { name: 'value', type: 'string' },
      { name: 'label', type: 'string' },
      { name: 'icon', type: 'IconRole', optional: true },
      { name: 'disabled', type: 'boolean', optional: true },
    ],
  },
  SelectOption: {
    fields: [
      { name: 'value', type: 'string' },
      { name: 'label', type: 'string' },
      {
        name: 'description',
        type: 'string',
        optional: true,
        doc: 'A second line under the label, as in Combobox.',
      },
      { name: 'disabled', type: 'boolean', optional: true },
    ],
  },
  SelectOptionGroup: {
    fields: [
      { name: 'label', type: 'string' },
      { name: 'options', type: 'SelectOption[]' },
    ],
  },
  StatDelta: {
    fields: [
      { name: 'value', type: 'string' },
      { name: 'direction', type: 'DeltaDirection' },
      {
        name: 'positive',
        type: 'boolean',
        optional: true,
        doc: 'Defaults to true when `direction` is up. Direction and sentiment are separate.',
      },
    ],
  },
  StatDeltaFacts: {
    native:
      'The web’s `StatDeltaLabel` takes the delta as an inline object; a native closure takes it ' +
      'as a named value.',
    fields: [
      { name: 'value', type: 'string' },
      { name: 'direction', type: 'DeltaDirection' },
      { name: 'positive', type: 'boolean', doc: 'The sentiment, resolved from the direction.' },
    ],
  },
  StatFooter: {
    fields: [
      { name: 'primary', type: 'string' },
      { name: 'secondary', type: 'string' },
    ],
  },
  StatTrend: {
    fields: [
      { name: 'direction', type: 'DeltaDirection' },
      { name: 'label', type: 'string', doc: 'Pre-formatted, like `value`.' },
    ],
  },
  Step: {
    fields: [
      { name: 'label', type: 'string' },
      { name: 'description', type: 'string', optional: true },
      {
        name: 'error',
        type: 'boolean',
        optional: true,
        doc: 'A step whose data failed: its state is `error`, while the walk still follows `activeIndex`.',
      },
    ],
  },
  StepperSpokenStep: {
    native:
      'The web’s `StepperSpoken` takes the step as an inline object; a native closure takes it ' +
      'as a named value.',
    fields: [
      { name: 'position', type: 'number', doc: '1-based.' },
      { name: 'count', type: 'number' },
      { name: 'state', type: 'StepperSpokenState' },
    ],
  },
  TabDescriptor: {
    fields: [
      { name: 'value', type: 'string' },
      { name: 'label', type: 'string' },
      { name: 'icon', type: 'IconRole', optional: true },
      { name: 'count', type: 'number', optional: true },
      { name: 'disabled', type: 'boolean', optional: true },
    ],
  },
  TableOfContentsItem: {
    fields: [
      {
        name: 'id',
        type: 'string',
        doc: 'The id of the section’s element in the document: its heading, or the element around it.',
      },
      { name: 'label', type: 'string' },
      {
        name: 'level',
        type: '1 | 2',
        optional: true,
        doc: '2 for a subsection of the item before it, drawn one step in. Default 1.',
      },
    ],
  },
  TagInputCountFacts: {
    native:
      'The web’s `TagInputCountLabel` takes the count as an inline object; a native closure ' +
      'takes it as a named value.',
    fields: [
      { name: 'count', type: 'number', doc: 'How many tags the field holds.' },
      { name: 'max', type: 'number', optional: true },
      {
        name: 'atMax',
        type: 'boolean',
        doc: 'The field holds `max` tags, resolved by the member.',
      },
    ],
  },
  Time: {
    library: { module: '@internationalized/date', omits: {} },
    fields: [
      { name: 'hour', type: 'number', doc: '0 to 23.' },
      { name: 'minute', type: 'number' },
      { name: 'second', type: 'number' },
      { name: 'millisecond', type: 'number' },
    ],
  },
  TimeInputMessages: {
    fields: [
      {
        name: 'empty',
        type: 'string',
        doc: 'What an unfilled segment says as its value on the web.',
      },
    ],
  },
  TimelineEvent: {
    fields: [
      { name: 'title', type: 'string' },
      {
        name: 'time',
        type: 'string',
        doc: 'Already formatted by the application; Timeline shows the time but does not format it.',
      },
      { name: 'detail', type: 'string', optional: true },
      {
        name: 'icon',
        type: 'IconRole',
        optional: true,
        doc: 'The mark’s icon; a plain dot when absent.',
      },
      { name: 'tone', type: 'TimelineTone', optional: true },
    ],
  },
  ToastAction: {
    fields: [
      { name: 'label', type: 'string' },
      { name: 'onClick', type: '() => void' },
    ],
  },
  ToolCallMessages: {
    fields: [
      { name: 'input', type: 'string', doc: 'The heading over the call’s arguments.' },
      { name: 'output', type: 'string', doc: 'The heading over what came back.' },
      {
        name: 'status',
        type: 'Record<ToolCallStatus, string>',
        doc: 'The text for each status, as announced to the reader.',
      },
    ],
  },
  TourMessages: {
    fields: [
      { name: 'next', type: 'string' },
      { name: 'previous', type: 'string' },
      {
        name: 'done',
        type: 'string',
        doc: 'The last step’s forward control, which ends the tour.',
      },
      { name: 'close', type: 'string', doc: 'The close control’s accessible name.' },
      {
        name: 'position',
        type: '(position: number, count: number) => string',
        doc: 'The position line, counting from 1: “Step 2 of 5”.',
      },
    ],
  },
  TourStep: {
    fields: [
      { name: 'id', type: 'string', doc: 'The step’s key, unique in the tour.' },
      {
        name: 'target',
        type: 'string',
        optional: true,
        doc: 'The name of the target the step points at; without one, the step is drawn centred.',
      },
      { name: 'title', type: 'string' },
      { name: 'body', type: 'string', doc: 'A sentence or two about the target, as text.' },
      {
        name: 'side',
        type: "'top' | 'right' | 'bottom' | 'left'",
        optional: true,
        doc: 'The side of the target the panel opens on, when it fits there.',
      },
    ],
  },
  TreeItem: {
    fields: [
      {
        name: 'id',
        type: 'string',
        doc: 'Unique in the tree. `onChange`, `onExpandedChange` and `onLoadMore` report it.',
      },
      { name: 'label', type: 'string' },
      {
        name: 'description',
        type: 'string',
        optional: true,
        doc: 'One supporting line under the label.',
      },
      {
        name: 'children',
        type: 'TreeItem[]',
        optional: true,
        doc: 'The items under it. An item with one or more is a branch.',
      },
      {
        name: 'hasChildren',
        type: 'boolean',
        optional: true,
        doc: 'A branch whose items the app loads when it is first opened.',
      },
      {
        name: 'loading',
        type: 'boolean',
        optional: true,
        doc: 'The branch’s level is loading.',
      },
      {
        name: 'hasMore',
        type: 'boolean',
        optional: true,
        doc: 'The branch has more items than `children` holds.',
      },
      {
        name: 'disabled',
        type: 'boolean',
        optional: true,
        doc: 'The item takes no key and no press, and a branch stays closed.',
      },
    ],
  },
  TreeMessages: {
    fields: [
      { name: 'loading', type: 'string', doc: 'What a level says while it loads.' },
      { name: 'loadMore', type: 'string', doc: 'The row that asks for more of a level.' },
    ],
  },
  TreemapItem: {
    fields: [
      { name: 'key', type: 'string' },
      { name: 'label', type: 'string' },
      {
        name: 'value',
        type: 'number',
        doc: 'An item with children takes its children’s sum, and this value is not drawn.',
      },
      {
        name: 'children',
        type: 'readonly TreemapItem[]',
        optional: true,
        doc: 'Two levels are drawn; deeper items are summed into the item at the second.',
      },
    ],
  },
  TreemapSummaryFacts: {
    native:
      '`ChartMessages.treemapSummary` takes the facts as an inline object; a native closure ' +
      'takes them as a named value.',
    fields: [
      { name: 'label', type: 'string' },
      { name: 'items', type: 'number' },
      { name: 'groups', type: 'number' },
      { name: 'absent', type: 'number' },
    ],
  },
  ValueFormat: {
    fields: [
      {
        name: 'style',
        type: "'decimal' | 'compact' | 'percent' | 'currency' | 'date'",
        optional: true,
        doc: '`decimal` by default. `percent` takes ratios; `date` formats ISO values.',
      },
      { name: 'currency', type: 'string', optional: true, doc: 'ISO 4217, for `currency`.' },
      { name: 'maximumFractionDigits', type: 'number', optional: true },
      {
        name: 'granularity',
        type: 'DateGranularity',
        optional: true,
        doc: 'The date granularity, for `date` only.',
      },
    ],
  },
}

/**
 * Function types the web names, which the registry prints by name: each maps
 * as its definition, spelled as the web's alias spells it. `contracts.test.ts`
 * holds each to the web's alias.
 */
export const FUNCTION_ALIASES: Readonly<Record<string, string>> = {
  StepperSpoken: '(step: { position: number; count: number; state: StepperSpokenState }) => string',
  StatDeltaLabel:
    '(delta: { value: string; direction: DeltaDirection; positive: boolean }) => string',
  TagInputCountLabel: '(tags: { count: number; max?: number; atMax: boolean }) => string',
  TagInputRemovedLabel: '(tag: string, count: number) => string',
}

/**
 * Named types a native contract carries as JSON, the dialect's type for the
 * web's `unknown` (`PMJSONValue`), each with why. Such a type is the JSON an
 * app stored, read by a tolerant reader, so a typed native tree would drop
 * what the reader keeps. `contracts.test.ts` holds each to a type the web
 * exports.
 */
export const JSON_TYPES: Readonly<Record<string, string>> = {
  RichTextDocument:
    'A rich-text document crosses as the JSON a server stored, as the web member takes any ' +
    'JSON: its readers keep the nodes of a later version, which a typed tree would have no case ' +
    'for.',
  RichTextMark:
    'A mark is part of the stored document, as a node is: its readers keep the marks of a later ' +
    'version, so an entity’s marks cross as the JSON they were stored as, and an app reads an ' +
    'annotation’s `id` from it.',
}

/** One branch of a union: its case's name, and its type as the web writes it. */
export interface UnionCase {
  name: string
  type: string
  doc?: string
}

/** A union of unlike types: one enum case per branch, in the web's order. */
export interface Union {
  cases: readonly UnionCase[]
  /**
   * Set on a union the web leaves unnamed: why the native contract names it.
   * Without it, the key is an alias the web exports.
   */
  native?: string
}

/**
 * The unions of unlike types the native members read, each as an enum. A union
 * the web names (`CheckedState`) is recognised by that name and by its
 * branches, because the registry prints a type alias expanded where a prop
 * uses it whole and by name inside a closure. A union the web leaves unnamed is
 * recognised by its branches. `contracts.test.ts` holds each named one to the
 * web's alias.
 */
export const UNIONS: Readonly<Record<string, Union>> = {
  ChartAnnotation: {
    cases: [
      {
        name: 'line',
        type: "{ kind: 'line'; value: number; label?: string }",
        doc: 'A reference line at a value of the member’s own domain.',
      },
      {
        name: 'band',
        type: "{ kind: 'band'; from: number; to: number; label?: string }",
        doc: 'A range of the member’s own domain, washed.',
      },
      {
        name: 'point',
        type: "{ kind: 'point'; x: string | number; y: number; label: string }",
        doc: 'A place on both axes; `x` is a category, an ISO date or a number, as the x axis is.',
      },
    ],
  },
  ChartBrushRange: {
    native:
      'The brush reports numbers on a `linear` x and ISO strings on a `time` x; the web types ' +
      'the range `[number, number] | [string, string]`. A native contract names the choice to ' +
      'switch on it.',
    cases: [
      { name: 'linear', type: '[number, number]' },
      { name: 'time', type: '[string, string]', doc: 'ISO-8601 strings.' },
    ],
  },
  ChartTooltip: {
    native:
      'A chart’s `tooltip` is a configuration or `false`, which removes the visual layer; the ' +
      'web types it `false | ChartTooltipConfig`. A native contract names the choice to switch ' +
      'on it.',
    cases: [
      {
        name: 'off',
        type: 'false',
        doc: 'No visual readout; the spoken readout and the twin remain.',
      },
      { name: 'config', type: 'ChartTooltipConfig' },
    ],
  },
  ChartValue: {
    native:
      'A chart row’s cell is a category, an ISO date or a measure; the web types it ' +
      '`string | number`, a gap `null`, and tells them apart at run time. A native contract ' +
      'names the choice to switch on it.',
    cases: [
      { name: 'text', type: 'string', doc: 'A category, or an ISO-8601 date on a `time` axis.' },
      { name: 'number', type: 'number' },
    ],
  },
  ChoiceValue: {
    native:
      'Accordion’s and ChoiceCard’s value is one string in their `single` mode and a list in ' +
      '`multiple`; the web types it `string | string[]` and tells the two apart by the mode. A ' +
      'native contract names the choice to switch on it.',
    cases: [
      { name: 'single', type: 'string' },
      { name: 'multiple', type: 'string[]' },
    ],
  },
  CheckedState: {
    cases: [
      { name: 'unchecked', type: 'false' },
      { name: 'checked', type: 'true' },
      { name: 'indeterminate', type: "'indeterminate'" },
    ],
  },
  ComboboxFilter: {
    cases: [
      { name: 'contains', type: "'contains'" },
      { name: 'startsWith', type: "'startsWith'" },
      {
        name: 'off',
        type: 'false',
        doc: 'The app filters, as an async list does, and the field shows the options as given.',
      },
    ],
  },
  MenuEntry: {
    cases: [
      { name: 'item', type: 'MenuItemEntry' },
      { name: 'checkbox', type: 'MenuCheckboxEntry' },
      { name: 'separator', type: 'MenuSeparatorEntry' },
      { name: 'label', type: 'MenuLabelEntry' },
      {
        name: 'submenu',
        type: 'MenuSubmenuEntry',
        doc: 'One nested level: a submenu holds leaf entries only.',
      },
    ],
  },
  MenuLeafEntry: {
    cases: [
      { name: 'item', type: 'MenuItemEntry' },
      { name: 'checkbox', type: 'MenuCheckboxEntry' },
      { name: 'separator', type: 'MenuSeparatorEntry' },
      { name: 'label', type: 'MenuLabelEntry' },
    ],
  },
  SelectOptionEntry: {
    native:
      'The web types `options` as `(SelectOption | SelectOptionGroup)[]` and tells an option from ' +
      'a group by its fields; a native contract names the choice to switch on it.',
    cases: [
      { name: 'option', type: 'SelectOption' },
      {
        name: 'group',
        type: 'SelectOptionGroup',
        doc: 'Options under a label, Menu’s label recipe.',
      },
    ],
  },
  SliderValue: {
    native:
      'Slider’s value is one number, or a `[low, high]` pair with `range`; the web types it ' +
      '`number | [number, number]` and tells the two apart by `range`. A native contract names ' +
      'the choice to switch on it.',
    cases: [
      { name: 'single', type: 'number' },
      { name: 'range', type: '[number, number]' },
    ],
  },
}

/**
 * Literal unions the web names, which a shape's field uses by name. Each is one
 * enum, `PM<Name>`, however many fields use it. The space and radius steps are
 * the registry's scales; `contracts.test.ts` holds the two directions to the
 * web's declarations.
 */
export const LITERAL_ALIASES: Readonly<
  Record<string, (registry: Registry) => readonly (string | number)[]>
> = {
  AttachmentStatus: () => ['uploading', 'done', 'error'],
  ChartScaleKind: () => ['band', 'time', 'linear'],
  ChartSlot: () => CHART_SLOTS,
  DateGranularity: () => ['day', 'week', 'month', 'quarter', 'year'],
  DeltaDirection: () => ['up', 'down'],
  DurationUnit: () => ['days', 'hours', 'minutes', 'seconds'],
  FileRejectionReason: () => ['type', 'size', 'count'],
  FileUploadStatus: () => ['uploading', 'done', 'error'],
  FirstDayOfWeek: () => [0, 1, 2, 3, 4, 5, 6],
  // The theme runtime's three preferences, which ModeSwitch's value and its change hold.
  ModePreference: () => MODE_PREFERENCES,
  PlanStatus: () => ['pending', 'running', 'done', 'error', 'skipped'],
  RadiusStep: (registry) => registry.theme.scales['radius'] ?? [],
  SeriesTone: () => ['success', 'danger', 'warning', 'info'],
  SortDirection: () => ['asc', 'desc'],
  SpaceStep: (registry) => (registry.theme.scales['space'] ?? []).map(Number),
  StepperSpokenState: () => ['completed', 'active', 'upcoming', 'error'],
  TimelineTone: () => ['neutral', 'accent', 'info', 'success', 'warning', 'danger'],
  ToolCallStatus: () => ['pending', 'running', 'done', 'error', 'denied', 'approval'],
  TooltipIndicator: () => ['dot', 'line'],
  TourEnd: () => ['finished', 'dismissed'],
}

/**
 * Literal unions in `LITERAL_ALIASES` recognised by name alone, never by their
 * values, because another union has the same values: `TimelineTone` holds
 * Badge's tones, and Badge's `tone` stays Badge's own enum; `FileUploadStatus`
 * holds `AttachmentStatus`'s; `SeriesTone` holds Alert's tones. The chart
 * grammar's unions are named by the shapes that use them and nowhere else.
 */
export const NAMED_ONLY: ReadonlySet<string> = new Set([
  'ChartScaleKind',
  'ChartSlot',
  'DateGranularity',
  'FileUploadStatus',
  'SeriesTone',
  'TimelineTone',
  'TooltipIndicator',
])

/** Icon role → the platform glyph that draws it: a field of each role in `design/icons.json`. */
export type IconSymbols = Readonly<Record<string, string>>

/* -------------------------------------------------------------------------- */
/* Names                                                                      */
/* -------------------------------------------------------------------------- */

export const capitalise = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`

/** `aria-label` → `ariaLabel`, `sort-asc` → `sortAsc`, `image/png` → `imagePng`, `L` → `l`. */
export function camel(text: string): string {
  const words = text.split(/[^A-Za-z0-9]+/).filter(Boolean)
  const joined = words.map((word, index) => (index === 0 ? word : capitalise(word))).join('')
  return `${joined.charAt(0).toLowerCase()}${joined.slice(1)}`
}

export const pascal = (text: string) => capitalise(camel(text))

/** `name`, or an error naming `what` gave it, when it is no identifier in `language`. */
export function assertIdentifier(name: string, what: string, language: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(
      `native contracts: ${what} gives "${name}", which is not a ${language} identifier`,
    )
  }
  return name
}

/**
 * The case a literal becomes, camel-cased. A name that would start with a
 * digit takes the prop's name in front, as a token does its group's in the
 * token packages: `textStep` `"2xl"` is `textStep2xl`, `gap` `6` is `gap6`.
 * Kotlin writes the same name PascalCased. A name that is still no identifier
 * is an error in the `language` the contracts are written in.
 */
export function caseName(literal: string | number, prop: string, language: string): string {
  const base = camel(String(literal))
  const name = /^\d/.test(base) || base === '' ? `${camel(prop)}${base}` : base
  return assertIdentifier(name, `the literal ${JSON.stringify(literal)} of ${prop}`, language)
}

/** A doc comment's text in lines of at most `width` columns. */
export function wrap(text: string, width: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line !== '' && line.length + 1 + word.length > width) {
        lines.push(line)
        line = word
      } else {
        line = line === '' ? word : `${line} ${word}`
      }
    }
    lines.push(line)
  }
  return lines
}

/* -------------------------------------------------------------------------- */
/* The dialect                                                                */
/* -------------------------------------------------------------------------- */

/** A prop's type in the target language. */
export interface Mapped {
  text: string
  /** A bare function type, which needs parentheses to be made optional. */
  isFunction: boolean
  /**
   * A renderable child, `PMContent`, optional or not: a function returning one
   * is a slot that draws from its arguments, where the dialect has one.
   */
  isContent?: boolean
}

/** How a target language spells each kind of type the resolver produces. */
export interface Dialect {
  /** The language's name, for a reason: `Swift`, `Kotlin`. */
  language: string
  /** The platform's name, for a doc comment: `iOS`, `Android`. */
  platformName: string
  string: string
  number: string
  boolean: string
  /** A closure's result that is nothing. */
  void: string
  list(element: string): string
  set(element: string): string
  /** A map from `key` to `value`: the web's `Record<K, V>`. */
  record(key: string, value: string): string
  /**
   * The type that holds any JSON value, for the web's `unknown`; without one,
   * `unknown` is unsupported.
   */
  unknown?: string
  /** A tuple of two or more elements; throws `Unsupported` for an arity the language has no type for. */
  tuple(elements: readonly string[]): string
  function(params: readonly string[], returns: Mapped): string
  /** The type made optional: absent, or `nil`/`null`. */
  optional(mapped: Mapped): string
  /** Printed names with a type of the same meaning in the language. */
  equivalents: Readonly<Record<string, string>>
}

/** A type the mapping cannot express: the prop becomes an unsupported field. */
export class Unsupported extends Error {}

export function optionalIf(dialect: Dialect, condition: boolean, mapped: Mapped): Mapped {
  if (!condition) return mapped
  return {
    text: dialect.optional(mapped),
    isFunction: false,
    ...(mapped.isContent ? { isContent: true } : {}),
  }
}

/* -------------------------------------------------------------------------- */
/* Models                                                                     */
/* -------------------------------------------------------------------------- */

/** One field of a props struct or a shape. `name` is camel-cased and not yet escaped. */
export interface FieldModel {
  name: string
  type: string
  isFunction: boolean
  optional: boolean
  doc?: string
}

export interface EnumCaseModel {
  /** Camel-cased, not yet escaped. */
  name: string
  raw: string | number
}

/** An enum of literals: a literal-union prop, a named literal union, a grid's halves. */
export interface EnumModel {
  kind: 'enum'
  name: string
  raw: 'string' | 'int'
  cases: EnumCaseModel[]
  summary: string
}

export interface AppearanceCell {
  /** `solidAccent`. */
  name: string
  /** The variant's and the tone's case names. */
  variant: string
  tone: string
  /** `solid/accent`. */
  raw: string
}

/** A member's lawful variant × tone grid, as one enum of its cells, and the two halves. */
export interface AppearanceModel {
  kind: 'appearance'
  name: string
  member: string
  cells: AppearanceCell[]
  variant: EnumModel
  tone: EnumModel
}

export type Declaration = EnumModel | AppearanceModel

/** A struct of fields: a member's props or a compound part's. */
export interface StructModel {
  name: string
  summary: string
  fields: FieldModel[]
  parameters: readonly string[]
}

export interface MemberModel {
  member: NativeMember
  /** The member's enums: the grid's first, then each literal-union prop's in prop order. */
  declarations: Declaration[]
  props: StructModel
  /** Each compound part's props, in the order the parts first appear. */
  parts: StructModel[]
  /** The rendering's type: `PM<Member>Rendering`. */
  rendering: string
}

export interface ShapeModel {
  kind: 'shape'
  /** The web's name. */
  web: string
  struct: StructModel
  declarations: EnumModel[]
}

export interface UnionCaseModel {
  name: string
  doc?: string
  /** The case's value type; absent for a literal branch, which carries none. */
  type?: string
}

export interface UnionModel {
  kind: 'union'
  web: string
  name: string
  summary: string
  cases: UnionCaseModel[]
  /** Every branch is a literal, so the enum carries no values. */
  plain: boolean
}

export type NamedModel = ShapeModel | UnionModel | EnumModel

export interface UnsupportedModel {
  member: string
  /** The prop as the registry names it: `onClick`, `Header.onSort`. */
  prop: string
  typescript: string
  reason: string
  /** The opaque type the field is declared as. */
  type: string
}

/** A named type the contracts hold opaque, and the props that use it. */
export interface OpaqueModel {
  type: string
  typescript: string
  /** `Member.prop`, `Member.Part.prop`. */
  usedBy: string[]
}

/* -------------------------------------------------------------------------- */
/* The resolver                                                               */
/* -------------------------------------------------------------------------- */

/** One generation pass: the declarations shared across members, gathered as members are mapped. */
export class Pass {
  readonly roles: Set<string>
  readonly memberNames: Set<string>
  /** Opaque type name → the web type it stands for and the props that use it. */
  readonly opaque = new Map<string, { typescript: string; usedBy: string[] }>()
  readonly unsupported: UnsupportedModel[] = []
  /** Every type name a member declares, with what declared it, for the collision check. */
  readonly declared = new Map<string, string>()
  /** The shapes, unions and named literal unions the contracts use, each declared once. */
  readonly shapes = new Set<string>()
  readonly unions = new Set<string>()
  readonly aliases = new Set<string>()
  /** The type parameters in scope while a member's props or a shape's fields are mapped. */
  scope: ReadonlySet<string> = new Set()

  constructor(
    readonly registry: Registry,
    readonly platform: NativePlatform,
    readonly dialect: Dialect,
    /** The `PM…` types the hand-written sources declare, which no generated type may take. */
    readonly reserved: ReadonlySet<string> = new Set(),
  ) {
    this.roles = new Set(registry.icons.roles.map((role) => role.name))
    this.memberNames = new Set(renderedMembers(registry, platform).map((member) => member.name))
  }

  declare(name: string, by: string): string {
    assertIdentifier(name, by, this.dialect.language)
    const previous = this.declared.get(name)
    if (previous !== undefined || this.reserved.has(name)) {
      throw new Error(
        `native contracts: ${by} declares ${name}, which ${previous ?? 'a hand-written source'} already declares`,
      )
    }
    this.declared.set(name, by)
    return name
  }

  /** The union in `UNIONS` whose branches are `solid`, by name, or `undefined`. */
  union(solid: readonly TsType[]): string | undefined {
    const printed = new Set(solid.map(printType))
    for (const [name, union] of Object.entries(UNIONS)) {
      const cases = union.cases.map((entry) => printType(parseType(entry.type)))
      if (cases.length === printed.size && cases.every((entry) => printed.has(entry))) {
        this.unions.add(name)
        return `PM${name}`
      }
    }
    return undefined
  }

  /**
   * The literal union in `LITERAL_ALIASES` whose values are `values`, by name,
   * or `undefined`: the registry prints a named scale expanded, so `Stack`'s
   * `gap` and `Grid`'s `gap` both read `0 | 1 | … | 10`, which is `SpaceStep`.
   */
  alias(values: readonly (string | number)[]): string | undefined {
    const key = (value: string | number) => `${typeof value}:${value}`
    const wanted = new Set(values.map(key))
    for (const [name, of] of Object.entries(LITERAL_ALIASES)) {
      if (NAMED_ONLY.has(name)) continue
      const known = of(this.registry).map(key)
      if (known.length === wanted.size && known.every((value) => wanted.has(value))) {
        this.aliases.add(name)
        return `PM${name}`
      }
    }
    return undefined
  }

  /** A type reference inside a prop: an argument, an element, a parameter or a return. */
  nested(type: TsType, usedBy: string, position: 'value' | 'return' = 'value'): Mapped {
    const dialect = this.dialect
    // A result the web may hand back as a promise: the member calls the closure
    // and does not wait, because the app owns every task (the screen contract).
    if (position === 'return' && settles(type)) return { text: dialect.void, isFunction: false }
    if (type.kind === 'union') {
      const parts = branches(type)
      const solid = parts.filter(
        (part) => !isKeyword(part, 'undefined') && !isKeyword(part, 'null'),
      )
      const union = this.union(solid)
      if (union !== undefined) {
        return optionalIf(dialect, parts.length > solid.length, { text: union, isFunction: false })
      }
      if (
        solid.length === 2 &&
        solid.every((part) => part.kind === 'literal' && typeof part.value === 'boolean')
      ) {
        return optionalIf(dialect, parts.length > solid.length, {
          text: dialect.boolean,
          isFunction: false,
        })
      }
      if (solid.length === 1) {
        return optionalIf(dialect, true, this.nested(solid[0] as TsType, usedBy, position))
      }
      // A literal union a closure holds is a named one, or it has no type a closure can name.
      if (
        solid.every(
          (part) =>
            part.kind === 'literal' &&
            (typeof part.value === 'string' || typeof part.value === 'number'),
        )
      ) {
        const alias = this.alias(solid.map((part) => (part as { value: string | number }).value))
        if (alias !== undefined) {
          return optionalIf(dialect, parts.length > solid.length, {
            text: alias,
            isFunction: false,
          })
        }
      }
      const alike = this.alike(solid, usedBy, position)
      if (alike !== undefined) return optionalIf(dialect, parts.length > solid.length, alike)
      throw new Unsupported(
        `needs one type where it holds \`${printType(type)}\`, a union inside a closure, an array or a tuple`,
      )
    }
    switch (type.kind) {
      case 'keyword':
        if (type.name === 'string') return { text: dialect.string, isFunction: false }
        if (type.name === 'number') return { text: dialect.number, isFunction: false }
        if (type.name === 'boolean') return { text: dialect.boolean, isFunction: false }
        if (type.name === 'void' && position === 'return')
          return { text: dialect.void, isFunction: false }
        if (type.name === 'unknown' && dialect.unknown !== undefined)
          return { text: dialect.unknown, isFunction: false }
        throw new Unsupported(`\`${type.name}\`, which has no ${dialect.language} type`)
      case 'literal':
        throw new Unsupported('a literal type inside a closure, an array or a tuple')
      case 'reference': {
        const definition = FUNCTION_ALIASES[type.name]
        if (definition !== undefined && type.args.length === 0) {
          return this.nested(parseType(definition), usedBy, position)
        }
        const text = this.reference(type.name, type.args, usedBy)
        return { text, isFunction: false, ...(text === 'PMContent' ? { isContent: true } : {}) }
      }
      case 'array':
        return { text: dialect.list(this.nested(type.element, usedBy).text), isFunction: false }
      case 'tuple':
        if (type.elements.length < 2) throw new Unsupported('a tuple of fewer than two elements')
        return {
          text: dialect.tuple(type.elements.map((element) => this.nested(element, usedBy).text)),
          isFunction: false,
        }
      case 'function': {
        const params = type.params
          .filter((param) => !isDomEvent(param.type))
          .map((param) => {
            if (param.rest) throw new Unsupported('a rest parameter')
            return optionalIf(dialect, param.optional, this.nested(param.type, usedBy)).text
          })
        const returns = this.nested(type.returns, usedBy, 'return')
        return { text: dialect.function(params, returns), isFunction: true }
      }
      case 'object': {
        const named = this.inlineShape(type.members)
        if (named !== undefined) return { text: named, isFunction: false }
        throw new Unsupported('an inline object type')
      }
    }
  }

  /**
   * One type for branches a native contract holds as one, or `undefined`.
   * Branches that are the same type once `SHAPE_ALIASES` names each by its
   * shape (`CalendarDate | CalendarDateTime`) are that type. Functions alike but
   * for parameters whose branches form a union in `UNIONS` are one function of
   * that union: the `(value: string) => void` and `(value: string[]) => void` a
   * member's `type` or `mode` prop chooses between take a `PMChoiceValue`.
   */
  alike(
    solid: readonly TsType[],
    usedBy: string,
    position: 'value' | 'return' = 'value',
  ): Mapped | undefined {
    const first = solid[0]
    if (first === undefined) return undefined
    if (solid.every((part) => canonical(part) === canonical(first))) {
      return this.nested(first, usedBy, position)
    }
    const functions = solid.filter(
      (part): part is Extract<TsType, { kind: 'function' }> => part.kind === 'function',
    )
    const head = functions[0]
    if (head === undefined || functions.length !== solid.length) return undefined
    const lists = functions.map((fn) => fn.params.filter((param) => !isDomEvent(param.type)))
    const arity = (lists[0] as TsParam[]).length
    if (lists.some((list) => list.length !== arity || list.some((param) => param.rest))) {
      return undefined
    }
    if (functions.some((fn) => canonical(fn.returns) !== canonical(head.returns))) return undefined
    const params: string[] = []
    for (let index = 0; index < arity; index += 1) {
      const at = lists.map((list) => list[index] as TsParam)
      const optional = at.some((param) => param.optional)
      const type = (at[0] as TsParam).type
      if (at.every((param) => canonical(param.type) === canonical(type))) {
        params.push(optionalIf(this.dialect, optional, this.nested(type, usedBy)).text)
        continue
      }
      const parts = at.flatMap((param) => branches(param.type))
      const bare = parts.filter((part) => !isKeyword(part, 'undefined') && !isKeyword(part, 'null'))
      const union = this.union(bare)
      if (union === undefined) return undefined
      const mapped = { text: union, isFunction: false }
      params.push(optionalIf(this.dialect, optional || parts.length > bare.length, mapped).text)
    }
    const returns = this.nested(head.returns, usedBy, 'return')
    return { text: this.dialect.function(params, returns), isFunction: true }
  }

  /**
   * The shape in `SHAPES` the web leaves unnamed whose fields are `members`,
   * each with the same name, optionality and type, by name, or `undefined`.
   */
  inlineShape(members: readonly TsMember[]): string | undefined {
    const solid = (type: TsType) =>
      JSON.stringify(branches(type).filter((part) => !isKeyword(part, 'undefined')))
    for (const [name, shape] of Object.entries(SHAPES)) {
      if (shape.native === undefined) continue
      // A union's branch carries its discriminant as a literal (`kind: 'line'`),
      // which the union's case says, so the shape leaves it out.
      let own = members
      if (shape.discriminant !== undefined) {
        const tag = members.find((member) => member.name === shape.discriminant)
        if (tag === undefined || tag.type.kind !== 'literal') continue
        own = members.filter((member) => member !== tag)
      }
      if (shape.fields.length !== own.length) continue
      const matches = shape.fields.every((field, index) => {
        const member = own[index] as TsMember
        return (
          member.name === field.name &&
          member.optional === (field.optional ?? false) &&
          solid(member.type) === solid(parseType(field.type))
        )
      })
      if (matches) {
        this.shapes.add(name)
        return `PM${name}`
      }
    }
    return undefined
  }

  reference(name: string, args: TsType[], usedBy: string): string {
    if (CONTENT_TYPES.has(name)) return 'PMContent'
    if (this.scope.has(name) && args.length === 0) return name
    const alias = SHAPE_ALIASES[name]
    if (alias !== undefined && args.length === 0) return this.reference(alias, args, usedBy)
    // The registry prints a prop's roles expanded, which `stringEnum` reads by
    // its values; a shape's field names the type.
    if (name === 'IconRole' && args.length === 0) return 'PMIconRole'
    // `Readonly<T>` says the web will not mutate the value; a native value
    // passed in is not mutated either, so it is `T` (a chart row is
    // `Readonly<Record<…>>`).
    if (name === 'Readonly' && args.length === 1) return this.nested(args[0] as TsType, usedBy).text
    if (name === 'Record' && args.length === 2) {
      const [key, value] = args as [TsType, TsType]
      return this.dialect.record(this.nested(key, usedBy).text, this.nested(value, usedBy).text)
    }
    if (UNIONS[name] !== undefined && UNIONS[name].native === undefined && args.length === 0) {
      this.unions.add(name)
      return `PM${name}`
    }
    const shape = SHAPES[name]
    if (shape !== undefined) {
      const arity = shape.parameters?.length ?? 0
      if (args.length !== arity) {
        throw new Unsupported(
          `\`${name}\` with ${args.length} type arguments; its shape takes ${arity}`,
        )
      }
      this.shapes.add(name)
      const mapped = args.map((arg) => this.nested(arg, usedBy).text)
      return arity === 0 ? `PM${name}` : `PM${name}<${mapped.join(', ')}>`
    }
    if (LITERAL_ALIASES[name] !== undefined && args.length === 0) {
      this.aliases.add(name)
      return `PM${name}`
    }
    const generic = GENERIC_EQUIVALENTS[name]
    if (generic !== undefined && args.length === 1) {
      return this.dialect.set(this.nested(args[0] as TsType, usedBy).text)
    }
    if (args.length > 0) throw new Unsupported(`the generic type \`${name}<…>\``)
    const equivalent = this.dialect.equivalents[name]
    if (equivalent !== undefined) return equivalent
    if (JSON_TYPES[name] !== undefined && this.dialect.unknown !== undefined) {
      return this.dialect.unknown
    }
    const props = /^(.+)Props$/.exec(name)?.[1]
    if (props !== undefined && this.memberNames.has(props)) return `PM${props}Props`
    const opaque = assertIdentifier(
      `PM${name.replace(/\./g, '')}`,
      `the type ${name}`,
      this.dialect.language,
    )
    const known = this.opaque.get(opaque)
    if (known) {
      if (!known.usedBy.includes(usedBy)) known.usedBy.push(usedBy)
    } else {
      this.opaque.set(opaque, { typescript: name, usedBy: [usedBy] })
    }
    return opaque
  }
}

/**
 * A type as text in full, with each name in `SHAPE_ALIASES` written as its
 * shape's and a union's branches in one order: two types are one native type
 * when their texts are equal.
 */
export function canonical(type: TsType): string {
  switch (type.kind) {
    case 'keyword':
      return type.name
    case 'literal':
      return JSON.stringify(type.value)
    case 'reference': {
      const name = SHAPE_ALIASES[type.name] ?? type.name
      return type.args.length === 0 ? name : `${name}<${type.args.map(canonical).join(', ')}>`
    }
    case 'array':
      return `(${canonical(type.element)})[]`
    case 'tuple':
      return `[${type.elements.map(canonical).join(', ')}]`
    case 'union':
      return [...new Set(type.types.map(canonical))].sort(byCodePoint).join(' | ')
    case 'function':
      return `(${type.params
        .map(
          (param) =>
            `${param.rest ? '...' : ''}${param.optional ? '?' : ''}${canonical(param.type)}`,
        )
        .join(', ')}) => ${canonical(type.returns)}`
    case 'object':
      return `{ ${type.members
        .map((member) => `${member.name}${member.optional ? '?' : ''}: ${canonical(member.type)}`)
        .join('; ')} }`
  }
}

/**
 * A type back as text, for a reason and for matching a union's branches: names,
 * keywords, literals and tuples in full, other structure elided. A tuple is in
 * full so that `[number, number] | [string, string]` has two branches to match.
 */
export function printType(type: TsType): string {
  switch (type.kind) {
    case 'keyword':
      return type.name
    case 'literal':
      return JSON.stringify(type.value)
    case 'reference':
      return type.args.length === 0 ? type.name : `${type.name}<…>`
    case 'array':
      return `${type.element.kind === 'union' ? `(${printType(type.element)})` : printType(type.element)}[]`
    case 'tuple':
      return `[${type.elements.map(printType).join(', ')}]`
    case 'union':
      return type.types.map(printType).join(' | ')
    default:
      return '…'
  }
}

interface Reference {
  name: string
  /** It stands as a type argument: `Row` in `DataTableColumn<Row>`. */
  argument: boolean
  /** It takes type arguments itself. */
  generic: boolean
}

/** Every reference in a type. */
function references(type: TsType, argument = false): Reference[] {
  switch (type.kind) {
    case 'reference':
      return [
        { name: type.name, argument, generic: type.args.length > 0 },
        ...type.args.flatMap((arg) => references(arg, true)),
      ]
    case 'array':
      return references(type.element, argument)
    case 'tuple':
      return type.elements.flatMap((element) => references(element, argument))
    case 'union':
      return type.types.flatMap((part) => references(part, argument))
    case 'function':
      return [
        ...type.params.flatMap((param) => references(param.type, argument)),
        ...references(type.returns, argument),
      ]
    case 'object':
      return type.members.flatMap((member) => references(member.type, argument))
    default:
      return []
  }
}

/**
 * A member's type parameters, as far as the printed types show them: a name one
 * prop passes as a type argument (`DataTableColumn<Row>`) and another uses on
 * its own (`Row[]`). The registry prints the parameter, not what an app binds
 * it to, so a contract cannot say `Row` until the props are generic.
 */
function typeParameters(member: NativeMember): Set<string> {
  const found = member.props.flatMap((prop) => {
    try {
      return references(parseType(prop.type))
    } catch {
      return []
    }
  })
  const asArgument = new Set(found.filter((ref) => ref.argument).map((ref) => ref.name))
  return new Set(
    found
      .filter(
        (ref) =>
          !ref.argument && !ref.generic && asArgument.has(ref.name) && !CONTENT_TYPES.has(ref.name),
      )
      .map((ref) => ref.name),
  )
}

/** A member's contract, resolved: its declarations, its props and its parts' props. */
export function resolveMember(pass: Pass, member: NativeMember): MemberModel {
  const dialect = pass.dialect
  const declarations: Declaration[] = []
  const parts = new Map<string, FieldModel[]>()
  const fieldsOf = (part: string) => {
    const list = parts.get(part) ?? []
    parts.set(part, list)
    return list
  }
  fieldsOf('')

  const hasLoadStatus = member.tier === LOAD_STATUS_TIER && !FRAMES.has(member.name)
  if (hasLoadStatus) {
    if (member.props.some((prop) => prop.name === 'loadStatus')) {
      throw new Error(
        `native contracts: ${member.name} has a prop named loadStatus, which the contract adds`,
      )
    }
    fieldsOf('').push({
      name: 'loadStatus',
      type: 'PMLoadStatus',
      isFunction: false,
      optional: false,
      doc:
        'Added by the native contract, not from the spec: what the page draws in its body while ' +
        'the data loads, when there is none, and when loading failed ' +
        '(`design/native/screen-contract.md`, "The four load states").',
    })
    if (member.props.some((prop) => prop.name === 'onRetry')) {
      throw new Error(
        `native contracts: ${member.name} has a prop named onRetry, which the contract adds`,
      )
    }
    const retry: Mapped = {
      text: dialect.function([], { text: dialect.void, isFunction: false }),
      isFunction: true,
    }
    fieldsOf('').push({
      name: 'onRetry',
      type: dialect.optional(retry),
      isFunction: false,
      optional: true,
      doc:
        'Added by the native contract, not from the spec: loading again after it failed. Set, ' +
        'the failed state’s Alert offers it as its action; absent, the Alert has none.',
    })
  }

  const parameters = typeParameters(member)
  const variant = member.props.find((prop) => prop.name === 'variant')
  const tone = member.props.find((prop) => prop.name === 'tone')
  const appearance = member.grid !== null && variant !== undefined && tone !== undefined

  for (const prop of member.props) {
    const dot = prop.name.lastIndexOf('.')
    const part = dot === -1 ? '' : prop.name.slice(0, dot)
    const propName = dot === -1 ? prop.name : prop.name.slice(dot + 1)
    const owner = `${member.name}${part === '' ? '' : `.${part}`}`
    const typeStem = `PM${member.name}${part.replace(/\./g, '')}${pascal(propName)}`
    const fields = fieldsOf(part)

    if (hasLoadStatus && part === '' && LOAD_STATUS_OWNS.has(prop.name)) continue

    if (appearance && part === '' && (prop.name === 'variant' || prop.name === 'tone')) {
      if (!fields.some((field) => field.name === 'appearance')) {
        fields.push({
          name: 'appearance',
          type: dialect.optional({ text: `PM${member.name}Appearance`, isFunction: false }),
          isFunction: false,
          optional: true,
          doc:
            '`variant` and `tone` on the web, as one lawful cell of the grid, as `LawfulVariants` ' +
            'types them: a pair the grid excludes cannot be written.',
        })
      }
      continue
    }

    const field = (type: Mapped, optional: boolean): FieldModel => ({
      name: assertIdentifier(camel(propName), `${owner}.${propName}`, dialect.language),
      type: type.text,
      isFunction: type.isFunction,
      optional,
      ...(prop.doc === undefined ? {} : { doc: prop.doc }),
    })

    try {
      // The root props are generic over the member's type parameters; a part's
      // props are not, so a part that uses one cannot say it.
      const parameter = references(parseType(prop.type)).find((ref) => parameters.has(ref.name))
      if (parameter !== undefined && part !== '') {
        throw new Unsupported(
          `needs a generic ${parameter.name === 'Row' ? 'row type' : 'type parameter'}: ` +
            `\`${parameter.name}\` is ${member.name}’s type parameter, and a part's props are not generic`,
        )
      }
      pass.scope = part === '' ? parameters : new Set()
      const mapped = mapProp(pass, prop, propName, typeStem, `${owner}.${propName}`)
      declarations.push(...mapped.declarations)
      fields.push(field(mapped.mapped, mapped.omittable))
    } catch (error) {
      if (!(error instanceof Unsupported) && !(error instanceof TypeSyntaxError)) throw error
      const type = pass.declare(
        `PMUnsupported${member.name}${part.replace(/\./g, '')}${pascal(propName)}`,
        `${owner}.${propName}`,
      )
      pass.unsupported.push({
        member: member.name,
        prop: prop.name,
        typescript: prop.type,
        reason:
          error instanceof TypeSyntaxError
            ? `a syntax the reader does not parse (${error.message})`
            : error.message,
        type,
      })
      fields.push(
        field(optionalIf(dialect, prop.optional, { text: type, isFunction: false }), prop.optional),
      )
    } finally {
      pass.scope = new Set()
    }
  }

  if (appearance) declarations.unshift(resolveAppearance(pass, member, variant, tone))

  const rendering =
    member.entry.status === 'adapted'
      ? ` On ${dialect.platformName} it is adapted: ${member.entry.as ?? ''}.`
      : ''
  const specNote = member.spec === null ? '' : ` (\`${member.spec}\`)`
  const propsName = pass.declare(`PM${member.name}Props`, member.name)
  const generic = [...parameters].sort(byCodePoint)
  const genericNote =
    generic.length === 0
      ? ''
      : ` Generic over ${generic.map((name) => `\`${name}\``).join(', ')}, the web's type ` +
        `${generic.length === 1 ? 'parameter' : 'parameters'}.`
  const props: StructModel = {
    name: propsName,
    summary: `${member.name}'s props${specNote}: ${member.purpose.replace(/\.$/, '')}.${rendering}${genericNote}`,
    fields: parts.get('') ?? [],
    parameters: generic,
  }
  const partModels: StructModel[] = []
  for (const [part, fields] of parts) {
    if (part === '') continue
    partModels.push({
      name: pass.declare(
        `PM${member.name}${part.replace(/\./g, '')}Props`,
        `${member.name}.${part}`,
      ),
      summary: `The props of ${member.name}'s \`${part}\` part.`,
      fields,
      parameters: [],
    })
  }
  const renderingName = pass.declare(`PM${member.name}Rendering`, member.name)
  return { member, declarations, props, parts: partModels, rendering: renderingName }
}

function mapProp(
  pass: Pass,
  prop: RegistryProp,
  propName: string,
  typeStem: string,
  usedBy: string,
): { mapped: Mapped; omittable: boolean; declarations: EnumModel[] } {
  const dialect = pass.dialect
  const parsed = parseType(prop.type)
  const all = branches(parsed)
  const nullable = all.some((part) => isKeyword(part, 'null'))
  const undefinedBranch = all.some((part) => isKeyword(part, 'undefined'))
  const solid = all.filter((part) => !isKeyword(part, 'undefined') && !isKeyword(part, 'null'))
  const declarations: EnumModel[] = []

  let base: Mapped
  const literals = solid.every((part) => part.kind === 'literal')
  const union = solid.length > 1 ? pass.union(solid) : undefined
  if (solid.length === 0) {
    throw new Unsupported('only `undefined` or `null`')
  } else if (union !== undefined) {
    base = { text: union, isFunction: false }
  } else if (
    literals &&
    solid.every((part) => part.kind === 'literal' && typeof part.value === 'string')
  ) {
    const values = solid.map((part) => String((part as { value: string }).value))
    base = {
      text: stringEnum(pass, values, typeStem, propName, usedBy, declarations),
      isFunction: false,
    }
  } else if (
    literals &&
    solid.every((part) => part.kind === 'literal' && typeof part.value === 'number')
  ) {
    const values = solid.map((part) => (part as { value: number }).value)
    if (!values.every(Number.isInteger))
      throw new Unsupported('a union of non-integer number literals')
    const alias = pass.alias(values)
    if (alias !== undefined) {
      base = { text: alias, isFunction: false }
    } else {
      const name = pass.declare(typeStem, usedBy)
      declarations.push({
        kind: 'enum',
        name,
        raw: 'int',
        cases: values.map((value) => ({
          name: caseName(value, propName, pass.dialect.language),
          raw: value,
        })),
        summary: `\`${usedBy}\`: one of ${values.join(', ')}.`,
      })
      base = { text: name, isFunction: false }
    }
  } else if (
    literals &&
    solid.every(
      (part) =>
        part.kind === 'literal' &&
        (typeof part.value === 'string' ||
          (typeof part.value === 'number' && Number.isInteger(part.value))),
    )
  ) {
    // Strings and integers together (`Skeleton`'s `width`: a space step or
    // "full"): a string enum whose raw values are the literals as written.
    const values = solid.map((part) => String((part as { value: string | number }).value))
    base = {
      text: stringEnum(pass, values, typeStem, propName, usedBy, declarations),
      isFunction: false,
    }
  } else if (
    literals &&
    solid.every((part) => part.kind === 'literal' && typeof part.value === 'boolean')
  ) {
    if (solid.length !== 2)
      throw new Unsupported(`a single boolean literal, which \`${dialect.boolean}\` would widen`)
    base = { text: dialect.boolean, isFunction: false }
  } else if (solid.length === 1) {
    base = pass.nested(solid[0] as TsType, usedBy)
  } else {
    const alike = pass.alike(solid, usedBy)
    if (alike === undefined) {
      throw new Unsupported(
        `a union of unlike types, which no single ${dialect.language} type holds`,
      )
    }
    base = alike
  }

  // `null` is a value the prop takes (a cleared Select); omission is another.
  // Each is one level of optionality, so a prop that is both has two.
  // A required prop whose type admits `undefined` may still be left out, so
  // it is defaulted like an optional one.
  const omittable = prop.optional || undefinedBranch
  const mapped = optionalIf(dialect, omittable, optionalIf(dialect, nullable, base))
  return { mapped, omittable, declarations }
}

function stringEnum(
  pass: Pass,
  values: string[],
  typeStem: string,
  propName: string,
  usedBy: string,
  declarations: EnumModel[],
): string {
  const set = new Set(values)
  const same = (list: Iterable<string>) => {
    const other = new Set(list)
    return other.size === set.size && [...other].every((value) => set.has(value))
  }
  if (same(CONTROL_SIZES)) return 'PMControlSize'
  if (same(pass.roles)) return 'PMIconRole'
  const alias = pass.alias(values)
  if (alias !== undefined) return alias
  const name = pass.declare(typeStem, usedBy)
  declarations.push({
    kind: 'enum',
    name,
    raw: 'string',
    cases: values.map((value) => ({
      name: caseName(value, propName, pass.dialect.language),
      raw: value,
    })),
    summary: `\`${usedBy}\`.`,
  })
  return name
}

function resolveAppearance(
  pass: Pass,
  member: NativeMember,
  variant: RegistryProp,
  tone: RegistryProp,
): AppearanceModel {
  const grid = member.grid as Record<string, string[]>
  const literalsOf = (prop: RegistryProp) =>
    branches(parseType(prop.type))
      .filter((part) => part.kind === 'literal' && typeof part.value === 'string')
      .map((part) => String((part as { value: string }).value))
  const variants = literalsOf(variant)
  const tones = literalsOf(tone)
  const variantName = pass.declare(`PM${member.name}Variant`, `${member.name}.variant`)
  const toneName = pass.declare(`PM${member.name}Tone`, `${member.name}.tone`)
  const name = pass.declare(`PM${member.name}Appearance`, `${member.name}'s grid`)

  const cells = Object.entries(grid).flatMap(([cellVariant, cellTones]) =>
    cellTones.map((cellTone) => {
      if (!variants.includes(cellVariant) || !tones.includes(cellTone)) {
        throw new Error(
          `native contracts: ${member.name}'s grid names ${cellVariant}/${cellTone}, which its props do not admit`,
        )
      }
      return {
        name: `${caseName(cellVariant, 'variant', pass.dialect.language)}${pascal(cellTone)}`,
        variant: caseName(cellVariant, 'variant', pass.dialect.language),
        tone: caseName(cellTone, 'tone', pass.dialect.language),
        raw: `${cellVariant}/${cellTone}`,
      }
    }),
  )

  return {
    kind: 'appearance',
    name,
    member: member.name,
    cells,
    variant: {
      kind: 'enum',
      name: variantName,
      raw: 'string',
      cases: variants.map((value) => ({
        name: caseName(value, 'variant', pass.dialect.language),
        raw: value,
      })),
      summary: `\`${member.name}.variant\`. Paired with a tone only through \`${name}\`.`,
    },
    tone: {
      kind: 'enum',
      name: toneName,
      raw: 'string',
      cases: tones.map((value) => ({
        name: caseName(value, 'tone', pass.dialect.language),
        raw: value,
      })),
      summary: `\`${member.name}.tone\`. Paired with a variant only through \`${name}\`.`,
    },
  }
}

/**
 * A shape's struct: its fields mapped as props are, in the web's order, with
 * an enum for each literal union among them.
 */
function resolveShape(pass: Pass, name: string): ShapeModel {
  const shape = SHAPES[name] as Shape
  const typeName = pass.declare(`PM${name}`, `the shape of ${name}`)
  const parameters = shape.parameters ?? []
  const declarations: EnumModel[] = []
  const fields: FieldModel[] = []
  pass.scope = new Set(parameters)
  try {
    for (const field of shape.fields) {
      const usedBy = `${name}.${field.name}`
      const prop: RegistryProp = {
        name: field.name,
        type: field.type,
        optional: field.optional ?? false,
      }
      let mapped: ReturnType<typeof mapProp>
      try {
        mapped = mapProp(pass, prop, field.name, `PM${name}${pascal(field.name)}`, usedBy)
      } catch (error) {
        if (!(error instanceof Unsupported) && !(error instanceof TypeSyntaxError)) throw error
        throw new Error(`native contracts: the shape of ${usedBy} does not map: ${error.message}`)
      }
      declarations.push(...mapped.declarations)
      const note = [field.doc, field.native].filter((part) => part !== undefined).join(' ')
      fields.push({
        name: assertIdentifier(camel(field.name), usedBy, pass.dialect.language),
        type: mapped.mapped.text,
        isFunction: mapped.mapped.isFunction,
        optional: mapped.omittable,
        ...(note === '' ? {} : { doc: note }),
      })
    }
  } finally {
    pass.scope = new Set()
  }
  return {
    kind: 'shape',
    web: name,
    declarations,
    struct: {
      name: typeName,
      summary:
        shape.library !== undefined
          ? `\`${shape.library.module}\`'s \`${name}\`, field for field but those it omits ` +
            '(`SHAPES` in `packages/native/src/mapping.ts`).'
          : shape.native === undefined
            ? `The web's \`${name}\`, field for field (\`SHAPES\` in \`packages/native/src/mapping.ts\`).`
            : `An object type the web writes inline, field for field (\`SHAPES\` in ` +
              `\`packages/native/src/mapping.ts\`). ${shape.native}`,
      fields,
      parameters,
    },
  }
}

/**
 * A union's enum: a case without a value for a literal branch, a case with the
 * branch's value for any other.
 */
function resolveUnion(pass: Pass, name: string): UnionModel {
  const union = UNIONS[name] as Union
  const typeName = pass.declare(`PM${name}`, `the union ${name}`)
  const branchesText = union.cases.map((entry) => `\`${entry.type}\``).join(', ')
  const summary =
    union.native === undefined
      ? `The web's \`${name}\`: ${branchesText}, one case each (\`UNIONS\` in ` +
        '`packages/native/src/mapping.ts`).'
      : `${branchesText}, one case each (\`UNIONS\` in \`packages/native/src/mapping.ts\`). ` +
        union.native
  const cases: UnionCaseModel[] = []
  let plain = true
  for (const entry of union.cases) {
    const type = parseType(entry.type)
    const doc = entry.doc === undefined ? {} : { doc: entry.doc }
    // A literal, or a shape with no field but the union's discriminant
    // (`MenuSeparatorEntry`), carries no value.
    const fieldless = type.kind === 'reference' && SHAPES[type.name]?.fields.length === 0
    if (type.kind === 'literal' || fieldless) {
      cases.push({
        name: assertIdentifier(entry.name, `${name}.${entry.name}`, pass.dialect.language),
        ...doc,
      })
      continue
    }
    plain = false
    let mapped: Mapped
    try {
      mapped = pass.nested(type, `${name}.${entry.name}`)
    } catch (error) {
      if (!(error instanceof Unsupported)) throw error
      throw new Error(
        `native contracts: the union ${name}'s ${entry.name} does not map: ${error.message}`,
      )
    }
    cases.push({ name: entry.name, ...doc, type: mapped.text })
  }
  return { kind: 'union', web: name, name: typeName, summary, cases, plain }
}

/** A named literal union's enum: `PMSpaceStep`, `PMSortDirection`. */
function resolveAlias(pass: Pass, name: string): EnumModel {
  const values = (LITERAL_ALIASES[name] as (registry: Registry) => readonly (string | number)[])(
    pass.registry,
  )
  if (values.length === 0) throw new Error(`native contracts: ${name} has no values`)
  const typeName = pass.declare(`PM${name}`, `the literal union ${name}`)
  const numeric = values.every((value) => typeof value === 'number' && Number.isInteger(value))
  // A space step is `s4` here, as `space.s4` is in the token packages, and a
  // chart slot `slot3`, as the web's `slot: 3` reads.
  const prefix = name === 'SpaceStep' ? 's' : name === 'ChartSlot' ? 'slot' : name
  return {
    kind: 'enum',
    name: typeName,
    raw: numeric ? 'int' : 'string',
    cases: values.map((value) => ({
      name: caseName(value, prefix, pass.dialect.language),
      raw: value,
    })),
    summary: `The web's \`${name}\`: ${values.map((value) => JSON.stringify(value)).join(', ')}.`,
  }
}

/** Everything a platform's contracts declare, resolved from the registry. */
export interface Resolution {
  members: MemberModel[]
  /** The shapes, unions and named literal unions the members use, sorted by web name. */
  named: NamedModel[]
  unsupported: UnsupportedModel[]
  /** Every opaque type, sorted by name. */
  opaque: OpaqueModel[]
}

/**
 * Every native or adapted member's contract on `platform`, and the named types
 * they use. `render` is called with each member's model as soon as it is
 * resolved, so a renderer's own refusal (a duplicate case) surfaces in member
 * order. The opaque types must not take a name another declaration holds.
 */
export function resolveContracts(
  registry: Registry,
  platform: NativePlatform,
  dialect: Dialect,
  reserved: readonly string[] = [],
  render: (model: MemberModel) => void = () => {},
): Resolution {
  const pass = new Pass(registry, platform, dialect, new Set(reserved))
  const members = renderedMembers(registry, platform).map((member) => {
    const model = resolveMember(pass, member)
    render(model)
    return model
  })

  // A shape's fields and a union's cases may use further shapes and unions, so
  // they are mapped until none is new.
  const named = new Map<string, NamedModel>()
  const unmapped = (used: Set<string>) =>
    [...used].filter((name) => !named.has(name)).sort(byCodePoint)
  for (;;) {
    const shapes = unmapped(pass.shapes)
    const unions = unmapped(pass.unions)
    if (shapes.length === 0 && unions.length === 0) break
    for (const name of shapes) named.set(name, resolveShape(pass, name))
    for (const name of unions) named.set(name, resolveUnion(pass, name))
  }
  for (const name of pass.aliases) named.set(name, resolveAlias(pass, name))

  const opaque = [...pass.opaque.entries()].sort(([a], [b]) => byCodePoint(a, b))
  for (const [name] of opaque) {
    if (pass.declared.has(name) || pass.reserved.has(name)) {
      throw new Error(
        `native contracts: the opaque type ${name} collides with ${pass.declared.get(name) ?? 'a hand-written source'}`,
      )
    }
  }

  return {
    members,
    named: [...named.keys()].sort(byCodePoint).map((name) => named.get(name) as NamedModel),
    unsupported: pass.unsupported,
    opaque: opaque.map(([type, { typescript, usedBy }]) => ({ type, typescript, usedBy })),
  }
}
