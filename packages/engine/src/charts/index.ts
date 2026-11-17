/**
 * `@polymorph/engine/charts`: the chart engine (`docs/charts.md`), which every
 * framework's chart members draw with.
 *
 * It holds the chart grammar's types, the formatting, the scales over
 * `d3-scale` and `d3-array`, the series' identity and stacking, the cartesian,
 * grid and polar geometry, the mark paths over `d3-shape`, the readout's text,
 * the annotation layer's placement, Sparkline's drawing, and the state machines
 * behind the frame's interaction: the measured box, the reading position, the
 * brush, the sync registry, the series cap and the log of the model's
 * warnings. The models and the geometry are functions of data, a measured box
 * and an input, and the machines hold the frame's interaction state between
 * inputs; a member renders the result and owns no decision of its own.
 *
 * A subpath, not a root export, because it brings the d3 packages: an
 * application that imports the root for its theme or conventions does not load
 * them. The foundations re-export it, so a member reaches it through its
 * framework's foundation. Only this repository's own functions leave it, never
 * d3's (`no-external-dataviz`).
 */
export type {
  AxisTick,
  ChartReadout,
  ChartTooltipDrawing,
  ChartTooltipRow,
  ChartTwinColumn,
} from './anatomy'

export {
  annotationLayers,
  centredBox,
  collidingLabels,
  endAlignedBox,
  mapAnnotations,
} from './annotations'
export type {
  AnnotationInk,
  AnnotationLabel,
  AnnotationLayers,
  AnnotationMarkPx,
  AnnotationRulePx,
  AnnotationSpanPx,
  AnnotationWash,
  LabelBox,
  MapAnnotationsInput,
  MappedAnnotations,
} from './annotations'

export { areaChartModel, areaChartReadout, areaChartSelection } from './area-chart'
export type { AreaBand, AreaChartInput, AreaChartModel, AreaPlot, AreaVariant } from './area-chart'

export { barChartModel, barChartReadout, barChartSelection, barLinePoints } from './bar-chart'
export type {
  BarBand,
  BarChartInput,
  BarChartModel,
  BarLine,
  BarLinePoint,
  BarMark,
  BarMode,
  BarOrientation,
  BarPlot,
} from './bar-chart'

export { createBrush } from './brush'
export type { BrushMachine, BrushOptions, BrushReading, BrushState } from './brush'

export { readChartCap } from './cap'

export {
  cartesianGeometry,
  categoriesOf,
  endLabelsFor,
  ESTIMATED_AXIS_TEXT_PX,
  MARKER_RADIUS,
  summaryFor,
} from './cartesian'
export type { CartesianGeometry, CartesianInput, EndLabel } from './cartesian'

export { donutChartModel, donutChartReadout, donutChartSelection } from './donut-chart'
export type {
  DonutArc,
  DonutCenter,
  DonutCenterDrawing,
  DonutChartInput,
  DonutChartModel,
  DonutPlot,
  DonutSegment,
} from './donut-chart'

export { brushDrawing, scaleLegendSteps } from './frame'

export { funnelChartModel, funnelChartReadout, funnelChartSelection } from './funnel-chart'
export type {
  FunnelBar,
  FunnelChartInput,
  FunnelChartModel,
  FunnelPlot,
  FunnelStage,
  FunnelText,
} from './funnel-chart'
export type { BrushDrawing, ScaleStep } from './frame'

export { formatValue, granularityFor, isIsoDate, parseIso } from './format'
export type { NotationMessages } from './format'

export {
  BAR_END_RADIUS,
  barPath,
  crisp,
  estimateTextWidth,
  HIT_TARGET_MIN,
  hitBox,
  labelCapacity,
  nearest2D,
  nearestIndex,
  rulePath,
} from './geometry'
export type { BarEnd, PlanePoint } from './geometry'

export { CELL_GAP_PX, cellAt, gridGeometry, gridTwinRows } from './grid'
export type { GridCell, GridGeometry, GridInput } from './grid'

export { heatmapModel, heatmapReadout, heatmapSelection } from './heatmap'
export type {
  HeatmapCell,
  HeatmapHit,
  HeatmapInput,
  HeatmapModel,
  HeatmapPlot,
  HeatmapScale,
  HeatmapValue,
  HeatmapYAxis,
} from './heatmap'

export { histogramModel, histogramReadout, histogramSelection } from './histogram'
export type {
  HistogramBar,
  HistogramInput,
  HistogramModel,
  HistogramPlot,
  HistogramXAxis,
} from './histogram'

export {
  brushSpan,
  brushValues,
  lineChartModel,
  lineChartReadout,
  lineChartSelection,
  syncIndexOf,
  syncValueAt,
} from './line-chart'
export type {
  BrushSpan,
  CrosshairReadout,
  LineChartInput,
  LineChartModel,
  LineCurve,
  LineEndLabel,
  LineMarker,
  LinePlot,
  LineStroke,
  LineVariant,
  RangeModel,
} from './line-chart'

export { measureBox, observeBox, sameBox, UNMEASURED } from './measured-box'
export type { MeasuredBox } from './measured-box'

export {
  DEFAULT_CHART_MESSAGES,
  DEFAULT_GRID_MESSAGES,
  DEFAULT_RANGE_MESSAGES,
  spokenSummary,
} from './messages'

export { areaPath, linePath, ringArcs } from './paths'
export type { ArcSegment, MaybePoint, PathCurve, PathPoint, RingArc, RingOptions } from './paths'

export { polarAngle, polarAngles, polarPoint, profilePath, radialScale, ringPath } from './polar'

export { radarChartModel, radarChartReadout, radarChartSelection } from './radar-chart'
export type {
  RadarAxis,
  RadarChartInput,
  RadarChartModel,
  RadarLabel,
  RadarPlot,
  RadarProfile,
  RadarVertex,
} from './radar-chart'

export { createReading, readingRest, readingView } from './reading'
export type {
  ReadingListener,
  ReadingMachine,
  ReadingOptions,
  ReadingPosition,
  ReadingView,
} from './reading'

export {
  announcement,
  categoryLabels,
  readingRows,
  seriesAnnouncement,
  twinColumns,
  twinRows,
} from './readout'

export {
  bandDomain,
  bandXScale,
  binOf,
  binSample,
  continuousScale,
  DEFAULT_VALUE_TICKS,
  inferScale,
  seriesValues,
  signedAmplitude,
  signedBinOf,
  sqrtRadiusScale,
  thinLabels,
  timeDomain,
  valueDomain,
  valueExtent,
} from './scales'
export type { BandScale, ContinuousScale, SampleBin, XScale } from './scales'

export { scatterChartModel, scatterChartReadout, scatterChartSelection } from './scatter-chart'
export type {
  ScatterBubble,
  ScatterChartInput,
  ScatterChartModel,
  ScatterDot,
  ScatterGroup,
  ScatterPlot,
} from './scatter-chart'

export {
  divergingArms,
  emphasised,
  emphasisWarning,
  hasMixedSigns,
  legendFor,
  OTHER_PAINT,
  resolveSeries,
  stackSegments,
  toggleSeries,
  valueAt,
} from './series'
export type {
  DivergingArm,
  ResolvedSeries,
  SeriesResolution,
  StackMode,
  StackSegment,
} from './series'

export { sparklineGeometry } from './sparkline'
export type { SparklineGeometry } from './sparkline'

export { createSyncMember, syncGroupSize } from './sync'
export type { SyncMember } from './sync'

export { squarify, treemapModel, treemapReadout, treemapSelection } from './treemap'
export type {
  TreemapInput,
  TreemapItem,
  TreemapLeaf,
  TreemapModel,
  TreemapPlate,
  TreemapPlot,
  TreemapRect,
  TreemapTile,
} from './treemap'

export { createWarningLog } from './warnings'
export type { WarningLog } from './warnings'

/*
 * The grammar. `ChartSlot` and `CHART_SLOT_COUNT` are the theme's, exported
 * from the engine's root, so they are not exported twice.
 */
export { CHART_SIZES, chartState, DATE_GRANULARITIES } from './types'
export type {
  CartesianChartProps,
  ChartAnnotation,
  ChartBaseline,
  ChartDatum,
  ChartMessages,
  ChartScaleKind,
  ChartSeries,
  ChartSize,
  ChartState,
  ChartTooltipConfig,
  ChartXAxis,
  ChartYAxis,
  DateGranularity,
  SeriesTone,
  TooltipIndicator,
  ValueFormat,
} from './types'
