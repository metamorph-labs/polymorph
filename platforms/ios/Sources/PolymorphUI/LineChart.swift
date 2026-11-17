// LineChart (`design/components/line-chart.md`): change over time, one 2-point
// stroke per series through Swift Charts' `LineMark`, monotone or a step that
// holds until the next measurement, with the `area` variant's wash under each
// line, markers for a second channel besides colour, and selective end labels.
//
// The engine's rules, ported where Swift Charts decides otherwise
// (`packages/engine/src/charts/line-chart.ts`): the x scale is inferred as
// `time` when every value is an ISO date; a date-only value is a calendar
// date, never shifted by a timezone; a gap breaks the line, never drops it to
// zero, so each series is drawn as its runs between gaps; the y domain fits
// the data (`auto`) unless `zero` anchors it, nice'd to the web's ticks; the
// zero rule is drawn only when zero is in view; the wash closes to the
// domain's floor; end labels show each series' last value and are all
// dropped when two would collide. The legend toggles a series and the domain
// refits; the twin always holds every series.
//
// The reading position (`docs/charts.md`): a crosshair at the nearest x, whose
// readout lists every shown series. A tap reads the nearest row and a tap on
// the row already read calls `onSelect`; arrow keys and VoiceOver's swipes walk
// the rows. The brush, on a `time` or `linear` x with `onBrushEnd`, is Swift
// Charts' range selection (two fingers on iOS, a drag on macOS) or Shift with
// the arrows; it reports the rows it spans when the gesture ends or Return
// commits, and never filters the chart. Escape cancels a brush, then clears
// the reading. `syncId` shares the reading with sibling charts through the
// shared registry, as the x-domain value.

import Charts
import PolymorphTokens
import SwiftUI

public struct PMLineChart: PMLineChartRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.locale) private var environmentLocale
  @State private var hidden: Set<String> = []
  @State private var local: PMChartReading?
  @State private var brush: PMChartBrush?
  @State private var touchRange: ClosedRange<Double>?
  private let props: PMLineChartProps

  public init(props: PMLineChartProps) {
    self.init(props: props, reading: nil)
  }

  /// A chart already read at `reading`: the states fixture's way to show the readout.
  init(props: PMLineChartProps, reading: PMChartReading?) {
    self.props = props
    _local = State(initialValue: reading)
  }

  public var body: some View {
    let model = PMRangeModel(
      line: props, theme: theme, locale: locale, hidden: hidden)
    let state = PMChartState(empty: props.data.isEmpty, loading: props.loading)
    PMChartFrame(
      member: "LineChart", label: props.label, size: props.size ?? .md, state: state,
      attributes: ["variant": (props.variant ?? .line).rawValue],
      empty: model.messages.empty, twin: model.twin, messages: model.messages
    ) {
      if props.data.isEmpty {
        PMChartSkeleton()
      } else {
        PMRangePlot(
          model: model, reading: reading(model), brush: brush, touchRange: $touchRange,
          label: props.label, selectable: props.onSelect != nil, brushable: brushable(model),
          handle: { handle($0, model: model) }, tapped: { tapped($0, model: model) },
          committed: { commit($0, model: model) })
      }
    } legend: {
      if model.painted.count >= 2 {
        PMChartLegend(series: model.painted, shape: .line, hidden: hidden) { key in
          if hidden.contains(key) { hidden.remove(key) } else { hidden.insert(key) }
        }
      }
    }
  }

  private var locale: Locale { props.locale.map { Locale(identifier: $0) } ?? environmentLocale }

  private func brushable(_ model: PMRangeModel) -> Bool {
    props.onBrushEnd != nil && model.xs.kind != .band
  }

  // MARK: Reading

  /// The reading here, or the group's when another chart in it is read.
  private func reading(_ model: PMRangeModel) -> PMChartReading? {
    if let local { return local }
    guard let group = props.syncId, model.xs.kind != .band,
      let value = PMChartSync.shared.value(group), let index = model.xs.nearest(value)
    else { return nil }
    return PMChartReading(index: index)
  }

  private func read(_ reading: PMChartReading?, model: PMRangeModel) {
    local = reading
    if let group = props.syncId, model.xs.kind != .band {
      PMChartSync.shared.publish(group, reading.flatMap { model.xs.domainValues[$0.index] })
    }
  }

  private func tapped(_ index: Int, model: PMRangeModel) {
    if local?.index == index, props.onSelect != nil {
      activate(model)
    } else {
      read(PMChartReading(index: index), model: model)
    }
  }

  private func handle(_ key: PMChartKey, model: PMRangeModel) {
    let count = model.rows.count
    switch key {
    case .next, .up: read(.step(local, by: 1, count: count), model: model)
    case .previous, .down: read(.step(local, by: -1, count: count), model: model)
    case .extendNext, .extendPrevious:
      guard brushable(model) else {
        read(.step(local, by: key == .extendNext ? 1 : -1, count: count), model: model)
        return
      }
      let from = brush?.anchor ?? local?.index ?? 0
      let edge = min(count - 1, max(0, (brush?.edge ?? from) + (key == .extendNext ? 1 : -1)))
      brush = PMChartBrush(anchor: from, edge: edge)
      read(PMChartReading(index: edge), model: model)
    case .activate:
      if let brush {
        commit(brush, model: model)
      } else {
        activate(model)
      }
    case .escape:
      // Two stages: the first cancels a brush, the second clears the reading.
      if brush != nil {
        brush = nil
      } else {
        read(nil, model: model)
      }
    }
  }

  private func commit(_ span: PMChartBrush, model: PMRangeModel) {
    brush = nil
    guard let onBrushEnd = props.onBrushEnd,
      let range = model.xs.range(span.anchor, span.edge, rows: model.rows, key: props.x.key)
    else { return }
    onBrushEnd(range)
  }

  private func activate(_ model: PMRangeModel) {
    guard let onSelect = props.onSelect, let index = local?.index,
      model.rows.indices.contains(index)
    else { return }
    onSelect(PMChartRowSelection(index: Double(index), datum: model.rows[index]))
  }
}

// MARK: - The plot LineChart and AreaChart share

/// What LineChart and AreaChart draw: the rows over a band, time or linear x,
/// the series as strokes and washes, the readout at a crosshair.
@MainActor
struct PMRangeModel {
  enum Fill {
    /// LineChart: each series' stroke, washed down to the floor in the area variant.
    case lines(wash: Bool)
    /// AreaChart: the series stacked, as volumes or as shares.
    case stacked(percent: Bool)
  }

  let rows: [PMChartRow]
  let x: PMChartXAxis
  let xs: PMChartXValues
  let fill: Fill
  let curve: InterpolationMethod
  let markers: Bool
  /// The value axis's format: AreaChart's `percent` reads its ratios as percents.
  let format: PMValueFormat?
  /// A value's own format, in the readout and the twin.
  let cellFormat: PMValueFormat?
  let messages: PMChartMessages
  let text: PMChartText
  let painted: [PMChartPaint]
  let visible: [PMChartPaint]
  /// AreaChart's stack, per shown series, per row; empty for LineChart.
  let segments: [[PMChartSegment]]
  let domain: PMChartDomain
  let annotations: [PMChartAnnotation]
  let tooltip: PMChartTooltipStyle
  let summary: String
  let twin: PMChartTwinModel
  let label: String
  let theme: PMTheme
  let height: CGFloat

  init(line props: PMLineChartProps, theme: PMTheme, locale: Locale, hidden: Set<String>) {
    let messages = props.messages ?? PMSpecDefault.chartRangeMessages
    let text = PMChartText(locale: locale, messages: messages)
    let painted = PMChartPalette.emphasised(
      PMChartPalette.series(props.series, theme), props.emphasis, theme.chart)
    let visible = painted.filter { !hidden.contains($0.key) }
    let values = props.data.flatMap { row in
      (visible.isEmpty ? painted : visible).compactMap { row.pmMeasure($0.key) }
    }
    self.init(
      rows: props.data, x: props.x, kind: props.x.kind(inferredFrom: props.data),
      fill: .lines(wash: props.variant == .area),
      curve: props.curve == .step ? .stepEnd : .monotone, markers: props.markers ?? false,
      format: props.y?.format, messages: messages, text: text, painted: painted, visible: visible,
      segments: [],
      domain: PMChartScale.value(
        values, zero: props.y?.domain == .zero, count: props.y?.ticks ?? 5),
      annotations: (props.baseline.map { [$0.annotation] } ?? []) + (props.annotations ?? []),
      tooltip: props.tooltip, label: props.label, size: props.size ?? .md, theme: theme,
      cellFormat: props.y?.format)
  }

  init(
    rows: [PMChartRow], x: PMChartXAxis, kind: PMChartAxisKind, fill: Fill,
    curve: InterpolationMethod, markers: Bool, format: PMValueFormat?, messages: PMChartMessages,
    text: PMChartText, painted: [PMChartPaint], visible: [PMChartPaint],
    segments: [[PMChartSegment]], domain: PMChartDomain, annotations: [PMChartAnnotation],
    tooltip: PMChartTooltip?, label: String, size: PMControlSize, theme: PMTheme,
    cellFormat: PMValueFormat?, twin: PMChartTwinModel? = nil
  ) {
    let xs = PMChartXValues(rows: rows, x: x, kind: kind, text: text)
    self.rows = rows
    self.x = x
    self.xs = xs
    self.fill = fill
    self.curve = curve
    self.markers = markers
    self.format = format
    self.cellFormat = cellFormat
    self.messages = messages
    self.text = text
    self.painted = painted
    self.visible = visible
    self.segments = segments
    self.domain = domain
    self.annotations = annotations
    self.tooltip = PMChartTooltipStyle(tooltip)
    self.summary = messages.summary(
      PMChartSummaryFacts(label: label, series: painted.map(\.label), points: Double(rows.count)))
    self.twin =
      twin
      ?? .series(
        x: x, categories: xs.labels, rows: rows, series: painted, format: format, text: text)
    self.label = label
    self.theme = theme
    // The plot's height without the x axis's line, which the frame's height includes.
    self.height =
      PMChartMetrics.height(size, theme.defaultDensity.space) - theme.text.xs.lineBox
      - theme.defaultDensity.space.s1
  }

  var stacked: Bool {
    if case .stacked = fill { return true }
    return false
  }

  /// Whether a wash is drawn under each stroke: AreaChart's bands, LineChart's `area` variant.
  var washed: Bool {
    if case .lines(wash: false) = fill { return false }
    return true
  }

  /// The value a series draws at a row: its own, or its stack's top.
  func top(_ series: Int, _ row: Int) -> Double? {
    guard stacked else { return rows[row].pmMeasure(visible[series].key) }
    let segment = segments[series][row]
    return segment.present ? segment.to : nil
  }

  /// The readout's rows at a row: every shown series, a gap said as `noData`.
  func rows(at index: Int) -> [PMChartReadoutRow] {
    visible.enumerated().map { at, entry in
      let value = rows[index].pmMeasure(entry.key)
      var printed = value.map { text.number($0, cellFormat) } ?? messages.noData
      if case .stacked(percent: true) = fill, let value,
        segments[at].indices.contains(index)
      {
        // In `percent` a value is never shown without its share.
        let share = segments[at][index].to - segments[at][index].from
        printed =
          "\(text.number(value, cellFormat)) · \(text.number(share, PMValueFormat(style: .percent)))"
      }
      return PMChartReadoutRow(
        key: entry.key, label: entry.label, value: printed, paint: entry.paint)
    }
  }

  /// The selective end labels (`endLabelsFor`): each shown series' last value
  /// at the plot's end, all dropped when two would sit closer than a line.
  var endLabels: [(series: Int, value: Double, text: String)] {
    guard !stacked, let last = rows.indices.last else { return [] }
    let labels = visible.indices.compactMap { at -> (series: Int, value: Double, text: String)? in
      rows[last].pmMeasure(visible[at].key).map { (at, $0, text.number($0, format)) }
    }
    let span = max(domain.upper - domain.lower, .leastNonzeroMagnitude)
    let positions = labels.map { $0.value / span * height }.sorted()
    let line = theme.text.xs.lineBox
    for (a, b) in zip(positions, positions.dropFirst()) where b - a < line { return [] }
    return labels
  }

  /// Each series' runs between gaps: a gap breaks the line, never drops it to zero.
  func runs(_ series: Int) -> [[Int]] {
    var runs: [[Int]] = [[]]
    for row in rows.indices {
      if top(series, row) != nil, xs.domainValues[row] != nil {
        runs[runs.count - 1].append(row)
      } else if !runs[runs.count - 1].isEmpty {
        runs.append([])
      }
    }
    return runs.filter { !$0.isEmpty }
  }

  var descriptor: PMChartDescriptor? {
    guard !rows.isEmpty else { return nil }
    let continuous = xs.kind != .band
    let values = xs.domainValues.compactMap { $0 }
    return PMChartDescriptor(
      title: label, summary: summary, xTitle: x.label ?? x.key,
      bands: continuous ? nil : xs.labels,
      xRange: (values.min() ?? 0)...max(values.max() ?? 1, values.min() ?? 0),
      xFormat: xs.kind == .linear ? x.format : nil,
      yTitle: painted.count == 1 ? painted[0].label : label, yRange: domain.range,
      yFormat: format, locale: text.locale,
      series: painted.map { entry in
        PMChartDescriptor.Series(
          name: entry.label, continuous: true,
          points: rows.indices.compactMap { index in
            guard let y = rows[index].pmMeasure(entry.key) else { return nil }
            return (
              band: continuous ? nil : xs.labels[index], x: xs.domainValues[index] ?? 0, y: y
            )
          })
      })
  }
}

/// The plot of a LineChart or an AreaChart, over the x its rows hold.
struct PMRangePlot: View {
  @Environment(\.pmTheme) private var theme
  let model: PMRangeModel
  let reading: PMChartReading?
  let brush: PMChartBrush?
  @Binding var touchRange: ClosedRange<Double>?
  let label: String
  let selectable: Bool
  let brushable: Bool
  let handle: (PMChartKey) -> Void
  let tapped: (Int) -> Void
  let committed: (PMChartBrush) -> Void

  var body: some View {
    Group {
      switch model.xs.kind {
      case .band: chart(model.xs.bands.map { Optional($0) })
      case .time: chart(model.xs.dates)
      case .linear: chart(model.xs.numbers)
      }
    }
    .pmChartPlot(
      label: label, spoken: spoken, selectable: selectable, interactive: true,
      descriptor: model.descriptor, handle: handle)
  }

  private var spoken: String {
    guard let reading, model.rows.indices.contains(reading.index) else {
      return model.text.spoken(model.summary, selectable: selectable)
    }
    return PMChartSpoken.reading(model.xs.labels[reading.index], model.rows(at: reading.index))
  }

  private var xName: String { model.x.label ?? model.x.key }

  private func chart<X: Plottable & Comparable>(_ xs: [X?]) -> some View {
    let layer = PMChartAnnotationLayer(annotations: model.annotations, theme: theme)
    let stroke = StrokeStyle(
      lineWidth: PMChartMetrics.stroke, lineCap: .round, lineJoin: .round)
    return Chart {
      layer.wash()
      if let span = brushSpan(xs) {
        RectangleMark(xStart: .value(xName, span.lowerBound), xEnd: .value(xName, span.upperBound))
          .foregroundStyle(theme.colors.selectionSurface.color)
        RuleMark(x: .value(xName, span.lowerBound))
          .lineStyle(StrokeStyle(lineWidth: PMChartMetrics.hairline))
          .foregroundStyle(theme.colors.selectionBorder.color)
        RuleMark(x: .value(xName, span.upperBound))
          .lineStyle(StrokeStyle(lineWidth: PMChartMetrics.hairline))
          .foregroundStyle(theme.colors.selectionBorder.color)
      }
      ForEach(Array(model.visible.enumerated()), id: \.element.key) { at, entry in
        ForEach(Array(model.runs(at).enumerated()), id: \.offset) { run, indices in
          ForEach(indices, id: \.self) { index in
            if let x = xs[index], let y = model.top(at, index) {
              if model.washed {
                washMark(x: x, y: y, series: at, row: index, run: run, entry: entry)
              }
              LineMark(
                x: .value(xName, x), y: .value(entry.label, y),
                series: .value(entry.label, "\(entry.key)-\(run)")
              )
              .foregroundStyle(entry.paint.color)
              .lineStyle(stroke)
              .interpolationMethod(model.curve)
            }
          }
        }
        if model.markers {
          ForEach(model.rows.indices, id: \.self) { index in
            if let x = xs[index], let y = model.top(at, index) {
              PointMark(x: .value(xName, x), y: .value(entry.label, y))
                .symbol {
                  PMChartMarker(paint: entry.paint, active: reading?.index == index)
                }
            }
          }
        }
      }
      if model.domain.holdsZero {
        RuleMark(y: .value(label, 0))
          .lineStyle(StrokeStyle(lineWidth: PMChartMetrics.hairline))
          .foregroundStyle(theme.chart.axis.color)
      }
      layer.ink()
      layer.points { value -> X? in self.x(of: value, like: xs) }
      ForEach(model.endLabels, id: \.series) { end in
        if let index = model.rows.indices.last, let x = xs[index] {
          PointMark(x: .value(xName, x), y: .value(label, end.value))
            .opacity(0)
            .annotation(
              position: .top, alignment: .trailing, spacing: PMChartMetrics.marker,
              overflowResolution: .init(x: .fit(to: .plot), y: .fit(to: .plot))
            ) { PMChartTick(end.text) }
        }
      }
      if let reading, model.rows.indices.contains(reading.index), let x = xs[reading.index] {
        RuleMark(x: .value(xName, x))
          .lineStyle(StrokeStyle(lineWidth: PMChartMetrics.hairline))
          .foregroundStyle(theme.chart.axis.color)
          .annotation(
            position: .top, spacing: 0,
            overflowResolution: .init(x: .fit(to: .chart), y: .fit(to: .chart))
          ) {
            if model.tooltip.visible {
              PMChartReadout(
                header: model.xs.labels[reading.index], rows: model.rows(at: reading.index),
                style: model.tooltip)
            }
          }
      }
    }
    .chartLegend(.hidden)
    .chartYScale(domain: model.domain.range)
    .chartYAxis {
      PMChartAxes.value(model.domain, theme.chart.grid) { model.text.number($0, model.format) }
    }
    .modifier(PMRangeXAxis(model: model, xs: xs))
    .modifier(PMRangeBrushSelection(xs: xs, kind: model.xs.kind, on: brushable, range: $touchRange))
    .onChange(of: touchRange) { previous, now in
      // The gesture ended: commit the rows nearest its two ends.
      guard now == nil, let previous, let low = model.xs.nearest(previous.lowerBound),
        let high = model.xs.nearest(previous.upperBound), low != high
      else { return }
      committed(PMChartBrush(anchor: low, edge: high))
    }
    .chartOverlay { proxy in
      GeometryReader { overlay in
        Rectangle().fill(.clear).contentShape(.rect)
          .gesture(
            SpatialTapGesture().onEnded { tap in
              guard let frame = proxy.plotFrame else { return }
              let at = tap.location.x - overlay[frame].origin.x
              let nearest = xs.indices
                .compactMap { index in
                  xs[index].flatMap { proxy.position(forX: $0) }.map { (index, abs($0 - at)) }
                }
                .min { $0.1 < $1.1 }
              if let nearest { tapped(nearest.0) }
            })
      }
    }
  }

  @ChartContentBuilder
  private func washMark<X: Plottable>(
    x: X, y: Double, series: Int, row: Int, run: Int, entry: PMChartPaint
  ) -> some ChartContent {
    if model.stacked {
      let segment = model.segments[series][row]
      AreaMark(
        x: .value(xName, x), yStart: .value(entry.label, segment.from),
        yEnd: .value(entry.label, segment.to), series: .value(entry.label, "\(entry.key)-\(run)")
      )
      .foregroundStyle(entry.paint.color.opacity(PMChartMetrics.wash))
      .interpolationMethod(model.curve)
      // Touching bands are parted by a surface gap at the lower edge, never a stroke.
      .offset(yStart: series > 0 ? -PMChartMetrics.gap : 0)
    } else {
      // LineChart's `area` wash, closed to the domain's floor.
      AreaMark(
        x: .value(xName, x), yStart: .value(entry.label, model.domain.lower),
        yEnd: .value(entry.label, y), series: .value(entry.label, "\(entry.key)-\(run)")
      )
      .foregroundStyle(entry.paint.color.opacity(PMChartMetrics.wash))
      .interpolationMethod(model.curve)
    }
  }

  /// The brush's span on the x axis: Shift and the arrows', or the gesture's.
  private func brushSpan<X: Plottable & Comparable>(_ xs: [X?]) -> ClosedRange<X>? {
    if let brush, let a = xs[brush.anchor], let b = xs[brush.edge] {
      return min(a, b)...max(a, b)
    }
    guard let touchRange, let low = model.xs.nearest(touchRange.lowerBound),
      let high = model.xs.nearest(touchRange.upperBound), let a = xs[low], let b = xs[high]
    else { return nil }
    return min(a, b)...max(a, b)
  }

  /// An annotation's x mapped through this axis.
  private func x<X>(of value: PMChartValue, like xs: [X?]) -> X? {
    switch (model.xs.kind, value) {
    case (.band, .text(let band)): return band as? X
    case (.band, .number): return value.written as? X
    case (.time, .text(let text)): return PMChartTime.parse(text) as? X
    case (.linear, .number(let number)): return number as? X
    default: return nil
    }
  }
}

/// The x axis by its scale: the bands' labels, dates at their granularity, or
/// the linear scale's ticks, never with gridlines, because x is not the value axis.
private struct PMRangeXAxis<X: Plottable>: ViewModifier {
  let model: PMRangeModel
  let xs: [X?]

  func body(content: Content) -> some View {
    let text = model.text
    let format = model.x.format
    switch model.xs.kind {
    case .band:
      content.chartXAxis {
        PMChartAxes.band(model.xs.bands) { band in
          model.xs.bands.firstIndex(of: band).map { model.xs.labels[$0] } ?? band
        }
      }
    case .time:
      let dates = model.xs.dates.compactMap { $0 }
      let span = (dates.max() ?? .now).timeIntervalSince(dates.min() ?? .now)
      let count = Int(model.x.ticks ?? 5)
      let granularity = format?.granularity ?? PMChartTime.granularity(step: span / Double(count))
      content
        .chartXScale(domain: (dates.min() ?? .now)...(dates.max() ?? .now))
        .chartXAxis { PMChartAxes.time(count) { text.date($0, granularity) } }
    case .linear:
      let numbers = model.xs.numbers.compactMap { $0 }
      let domain = PMChartScale.value(numbers, zero: false, count: model.x.ticks ?? 5)
      content
        .chartXScale(domain: domain.range)
        .chartXAxis { PMChartAxes.continuous(domain.ticks) { text.number($0, format) } }
    }
  }
}

/// Swift Charts' range selection, which the brush is, on a continuous x with
/// `onBrushEnd`; the range is kept as x-domain values (seconds on a time axis).
private struct PMRangeBrushSelection<X: Plottable>: ViewModifier {
  let xs: [X?]
  let kind: PMChartAxisKind
  let on: Bool
  @Binding var range: ClosedRange<Double>?

  func body(content: Content) -> some View {
    switch (on, kind) {
    case (true, .time):
      content.chartXSelection(
        range: Binding(
          get: {
            range.map {
              Date(timeIntervalSince1970: $0.lowerBound)...Date(timeIntervalSince1970: $0.upperBound)
            }
          },
          set: { dates in
            range = dates.map {
              $0.lowerBound.timeIntervalSince1970...$0.upperBound.timeIntervalSince1970
            }
          }))
    case (true, .linear):
      content.chartXSelection(range: $range)
    default:
      content
    }
  }
}

// MARK: - States

/// LineChart's states, from the spec's States table, with the reading shown.
public struct LineChartStates: PMStates {
  public let member = "LineChart"

  public init() {}

  /// Thirty days of calendar dates, with no timezone to shift them.
  static let days: [PMChartRow] = (0..<30).map { index in
    let opened = [28, 34, 31, 45, 39, 22, 18][index % 7]
    let resolved = [25, 30, 33, 41, 37, 20, 16][index % 7]
    return [
      "day": .text(String(format: "2026-07-%02d", index + 1)),
      "opened": .number(Double(opened + index % 5)),
      "resolved": .number(Double(resolved + index % 4)),
    ]
  }

  static let pair = [
    PMChartSeries(key: "opened", label: "Opened"), PMChartSeries(key: "resolved", label: "Resolved"),
  ]

  private static let backlog: [PMChartRow] = days.enumerated().map { index, row in
    ["day": row.pmCell("day"), "backlog": .number(Double(120 + index * 3 - (index % 6) * 8))]
  }

  private static let withGap: [PMChartRow] = days.enumerated().map { index, row in
    var row = row
    if (12...16).contains(index) { row["resolved"] = .some(nil) }
    return row
  }

  private static let months: [PMChartRow] = [
    ["month": "2026-03-01", "tickets": 1840], ["month": "2026-04-01", "tickets": 2110],
    ["month": "2026-05-01", "tickets": 1975], ["month": "2026-06-01", "tickets": 2260],
    ["month": "2026-07-01", "tickets": 2405], ["month": "2026-08-01", "tickets": 2190],
  ]

  private static let teams = ["Frontline", "Billing", "Technical", "Escalations"].map {
    PMChartSeries(key: $0, label: $0)
  }

  private static let weeks = ["W27", "W28", "W29", "W30", "W31", "W32"]

  private static let teamRows: [PMChartRow] = weeks.enumerated().map { index, week in
    [
      "week": .text(week), "Frontline": .number(Double(46 - index * 2)),
      "Billing": .number(Double(62 - index)), "Technical": .number(Double(88 - index * 3)),
      "Escalations": .number(Double(140 - index * 9)),
    ]
  }

  private static let response: [PMChartRow] = weeks.enumerated().map { index, week in
    ["week": .text(week), "minutes": .number(Double(38 - index * 2))]
  }

  private static let eight = ["Email", "Chat", "Phone", "Social", "Portal", "API", "Partner", "Walk-in"]
    .map { PMChartSeries(key: $0.lowercased().filter(\.isLetter), label: $0) }

  private static let eightRows: [PMChartRow] = ["W29", "W30", "W31", "W32"].enumerated().map {
    index, week in
    var row: PMChartRow = ["week": .text(week)]
    for (at, entry) in eight.enumerated() { row[entry.key] = .number(Double(40 - at * 4 + index * 2)) }
    return row
  }

  private static let refunds: [PMChartRow] = ["W29", "W30", "W31", "W32"].enumerated().map {
    index, week in ["week": .text(week), "refunds": .number(Double(1240 + index * 310))]
  }

  private static let day = PMChartXAxis(key: "day", scale: .time, label: "Day")
  private static let week = PMChartXAxis(key: "week", label: "Week")

  public var entries: [PMStateEntry] {
    let relay = PMLineChartProps(
      data: Self.days, label: "Tickets opened and resolved by day", series: Self.pair, x: Self.day)
    return [
      PMStateEntry(
        "the Relay pair",
        expect: ["size": "md", "variant": "line", "label": "Tickets opened and resolved by day"]
      ) { PMLineChart(props: relay) },
      PMStateEntry("single series area", expect: ["variant": "area"]) {
        PMLineChart(
          props: PMLineChartProps(
            data: Self.backlog, label: "Open backlog by day",
            series: [PMChartSeries(key: "backlog", label: "Open backlog")], variant: .area,
            x: Self.day))
      },
      PMStateEntry("markers") {
        PMLineChart(
          props: PMLineChartProps(
            data: Array(Self.days.prefix(10)), label: "Opened and resolved, with points",
            markers: true, series: Self.pair, x: Self.day))
      },
      PMStateEntry("gap") {
        PMLineChart(
          props: PMLineChartProps(
            data: Self.withGap, label: "Opened and resolved, with a reporting gap",
            series: Self.pair, x: Self.day))
      },
      PMStateEntry("band-of-dates") {
        PMLineChart(
          props: PMLineChartProps(
            data: Self.months, label: "Tickets by month",
            series: [PMChartSeries(key: "tickets", label: "Tickets")],
            x: PMChartXAxis(
              key: "month", label: "Month",
              format: PMValueFormat(style: .date, granularity: .month))))
      },
      PMStateEntry("emphasis") {
        PMLineChart(
          props: PMLineChartProps(
            data: Self.teamRows, emphasis: "Escalations", label: "Resolution time by team",
            series: Self.teams, x: Self.week))
      },
      PMStateEntry("baseline") {
        PMLineChart(
          props: PMLineChartProps(
            baseline: PMChartBaseline(value: 30, label: "SLA"), data: Self.response,
            label: "First response against the SLA",
            series: [PMChartSeries(key: "minutes", label: "First response")], x: Self.week))
      },
      PMStateEntry("max series") {
        PMLineChart(
          props: PMLineChartProps(
            data: Self.eightRows, label: "Volume by channel", series: Self.eight, x: Self.week))
      },
      PMStateEntry("status-toned") {
        PMLineChart(
          props: PMLineChartProps(
            data: Self.teamRows, label: "Frontline volume and error rate",
            series: [
              PMChartSeries(key: "Frontline", label: "Frontline"),
              PMChartSeries(key: "Escalations", label: "Error rate", tone: .danger),
            ], x: Self.week))
      },
      PMStateEntry("y currency") {
        PMLineChart(
          props: PMLineChartProps(
            data: Self.refunds, label: "Weekly refunds",
            series: [PMChartSeries(key: "refunds", label: "Refunds")], x: Self.week,
            y: PMChartYAxis(
              format: PMValueFormat(style: .currency, currency: "USD", maximumFractionDigits: 0))))
      },
      PMStateEntry("empty", expect: ["state": "empty"]) {
        PMLineChart(
          props: PMLineChartProps(
            data: [], label: "Tickets by day", series: Self.pair, x: PMChartXAxis(key: "day", scale: .time)))
      },
      PMStateEntry("loading", expect: ["state": "loading"]) {
        PMLineChart(
          props: PMLineChartProps(
            data: Self.days, label: "Tickets by day", loading: true, series: Self.pair,
            x: PMChartXAxis(key: "day", scale: .time)))
      },
      PMStateEntry("tooltip off") {
        PMLineChart(
          props: PMLineChartProps(
            data: Self.days, label: "Tickets by day, print", series: Self.pair, tooltip: .off,
            x: PMChartXAxis(key: "day", scale: .time)),
          reading: PMChartReading(index: 9))
      },
      PMStateEntry("reading a day") {
        PMLineChart(props: relay, reading: PMChartReading(index: 9))
      },
      PMStateEntry("step curve with markers") {
        PMLineChart(
          props: PMLineChartProps(
            curve: .step, data: Self.response, label: "First response by week", markers: true,
            series: [PMChartSeries(key: "minutes", label: "First response")], x: Self.week,
            y: PMChartYAxis(domain: .zero)))
      },
    ]
  }
}
