// BarChart (`design/components/bar-chart.md`): magnitudes compared, grouped,
// stacked or diverging (the Likert form), vertical or horizontal, through
// Swift Charts' `BarMark`.
//
// The engine's rules, ported where Swift Charts decides otherwise
// (`packages/engine/src/charts/bar-chart.ts`): the value axis is always
// anchored at zero and nice'd to the web's ticks; a stack with values on both
// sides of zero draws grouped; the diverging stack puts each sign outward from
// zero and paints each series by its arm; one signed series takes arm 3 by
// sign; a gap draws no bar. A bar is at most `space-6` thick and its group
// fills at most the band's 80%, a stacked segment gives its baseline end a
// 2-point surface gap to the one below, and only the data end of the outermost
// segment is rounded. The legend toggles a series and the domain refits; the
// twin always holds every series.
//
// `lines` draws further series as lines over vertical bars, through Swift
// Charts' `LineMark` at each band's centre, on the bars' one value axis, with
// a ringed `PointMark` at every value; a gap breaks the line. The lines take
// the slots after the bars', and join the legend with a line key, the readout,
// the walk after the bar series, `onSelect` and the twin. A horizontal chart
// draws no lines, as the engine's model does.
//
// The reading position (`docs/charts.md`): a tap reads the band under it, as
// a pointer's hover does on the web, and a tap on the band already read calls
// `onSelect`. Arrow keys and VoiceOver's swipes walk the bands, up and down
// walk the series in a band, Return, Space and VoiceOver's double tap call
// `onSelect`, Escape clears it. The readout sits over the band.

import Charts
import PolymorphTokens
import SwiftUI

public struct PMBarChart: PMBarChartRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.locale) private var environmentLocale
  @State private var hidden: Set<String>
  @State private var reading: PMChartReading?
  private let props: PMBarChartProps

  public init(props: PMBarChartProps) {
    self.init(props: props, reading: nil)
  }

  /// A chart already read at `reading`, with `hidden` toggled off: the states
  /// fixture's way to show the readout and a hidden key.
  init(props: PMBarChartProps, reading: PMChartReading?, hidden: Set<String> = []) {
    self.props = props
    _reading = State(initialValue: reading)
    _hidden = State(initialValue: hidden)
  }

  public var body: some View {
    let model = BarModel(props: props, theme: theme, locale: locale, hidden: hidden)
    let state = PMChartState(empty: props.data.isEmpty, loading: props.loading)
    PMChartFrame(
      member: "BarChart", label: props.label, size: props.size ?? .md, state: state,
      attributes: [
        "orientation": (props.orientation ?? .vertical).rawValue, "mode": model.drawn,
      ],
      empty: model.messages.empty, twin: model.twin, messages: model.messages
    ) {
      if props.data.isEmpty {
        PMChartSkeleton()
      } else {
        plot(model)
      }
    } legend: {
      if model.painted.count >= 2 {
        PMChartLegend(
          series: model.painted, shape: .rect, lineKeys: model.lineKeys, hidden: hidden
        ) { key in
          if hidden.contains(key) { hidden.remove(key) } else { hidden.insert(key) }
          reading = nil
        }
      }
    }
  }

  private var locale: Locale { props.locale.map { Locale(identifier: $0) } ?? environmentLocale }

  // MARK: The plot

  private func plot(_ model: BarModel) -> some View {
    let vertical = model.vertical
    let annotations = PMChartAnnotationLayer(
      annotations: model.annotations, theme: theme, horizontalValues: !vertical)
    return GeometryReader { geometry in
      let slot = model.slot(length: vertical ? geometry.size.width : geometry.size.height, theme: theme)
      Chart {
        annotations.wash()
        ForEach(Array(model.rows.enumerated()), id: \.offset) { index, _ in
          ForEach(Array(model.bars.enumerated()), id: \.element.key) { at, entry in
            if let bar = model.bar(row: index, series: at) {
              mark(bar, model: model, slot: slot)
                .opacity(reading == nil || reading?.index == index ? 1 : PMChartMetrics.lift)
            }
          }
        }
        zeroRule(vertical: vertical)
        annotations.ink()
        lines(model)
        if let reading, model.tooltip.visible, model.categories.indices.contains(reading.index) {
          readout(model, at: reading)
        }
      }
      .chartLegend(.hidden)
      .modifier(BarAxes(model: model, theme: theme))
      .chartOverlay { proxy in
        GeometryReader { overlay in
          Rectangle().fill(.clear).contentShape(.rect)
            .gesture(
              SpatialTapGesture().onEnded { tap in
                guard let frame = proxy.plotFrame else { return }
                let origin = overlay[frame].origin
                let band =
                  vertical
                  ? proxy.value(atX: tap.location.x - origin.x, as: String.self)
                  : proxy.value(atY: tap.location.y - origin.y, as: String.self)
                guard let band, let index = model.bands.firstIndex(of: band) else { return }
                tapped(index, model: model)
              })
        }
      }
    }
    .pmChartPlot(
      label: props.label, spoken: spoken(model), selectable: props.onSelect != nil,
      interactive: !model.rows.isEmpty, descriptor: model.descriptor
    ) { key in handle(key, model: model) }
  }

  @ChartContentBuilder
  private func mark(_ bar: BarModel.Bar, model: BarModel, slot: CGFloat) -> some ChartContent {
    let xName = props.x.label ?? props.x.key
    let yName = bar.series.label
    let corners = BarModel.dataEnd(
      vertical: model.vertical, positive: bar.positive, rounded: bar.outermost)
    let gap = bar.inner ? PMChartMetrics.gap : 0
    if model.vertical {
      BarMark(
        x: .value(xName, bar.band), yStart: .value(yName, bar.from), yEnd: .value(yName, bar.to),
        width: .fixed(slot)
      )
      .foregroundStyle(bar.paint.color)
      .clipShape(corners)
      .offset(yStart: bar.positive ? -gap : 0, yEnd: bar.positive ? 0 : gap)
      .position(
        by: .value(xName, model.layered ? "" : bar.series.key), axis: .horizontal,
        span: .fixed(model.groupSpan(slot)))
    } else {
      BarMark(
        xStart: .value(yName, bar.from), xEnd: .value(yName, bar.to), y: .value(xName, bar.band),
        height: .fixed(slot)
      )
      .foregroundStyle(bar.paint.color)
      .clipShape(corners)
      .offset(xStart: bar.positive ? gap : 0, xEnd: bar.positive ? 0 : -gap)
      .position(
        by: .value(xName, model.layered ? "" : bar.series.key), axis: .vertical,
        span: .fixed(model.groupSpan(slot)))
    }
  }

  /// The lines, over the bars and the annotation ink: LineChart's stroke
  /// through each band's centre, broken at every gap, with a ringed point at
  /// every value. A point is active at the band read, unless the walk is on
  /// another series.
  @ChartContentBuilder
  private func lines(_ model: BarModel) -> some ChartContent {
    let xName = props.x.label ?? props.x.key
    let stroke = StrokeStyle(lineWidth: PMChartMetrics.stroke, lineCap: .round, lineJoin: .round)
    ForEach(Array(model.lines.enumerated()), id: \.element.key) { at, entry in
      ForEach(Array(model.runs(entry.key).enumerated()), id: \.offset) { run, indices in
        ForEach(indices, id: \.self) { index in
          if let value = model.rows[index].pmMeasure(entry.key) {
            LineMark(
              x: .value(xName, model.bands[index]), y: .value(entry.label, value),
              series: .value(entry.label, "\(entry.key)-\(run)")
            )
            .foregroundStyle(entry.paint.color)
            .lineStyle(stroke)
            .interpolationMethod(.monotone)
          }
        }
      }
      ForEach(model.rows.indices, id: \.self) { index in
        if let value = model.rows[index].pmMeasure(entry.key) {
          PointMark(x: .value(xName, model.bands[index]), y: .value(entry.label, value))
            .symbol {
              PMChartMarker(
                paint: entry.paint,
                active: reading.map {
                  $0.index == index && (!$0.onSeries || $0.series == model.bars.count + at)
                } ?? false)
            }
        }
      }
    }
  }

  /// The zero rule, the only axis stroke, over the bars so each reads as
  /// sitting on it.
  @ChartContentBuilder
  private func zeroRule(vertical: Bool) -> some ChartContent {
    let name = props.label
    if vertical {
      RuleMark(y: .value(name, 0))
        .lineStyle(StrokeStyle(lineWidth: PMChartMetrics.hairline))
        .foregroundStyle(theme.chart.axis.color)
    } else {
      RuleMark(x: .value(name, 0))
        .lineStyle(StrokeStyle(lineWidth: PMChartMetrics.hairline))
        .foregroundStyle(theme.chart.axis.color)
    }
  }

  @ChartContentBuilder
  private func readout(_ model: BarModel, at reading: PMChartReading) -> some ChartContent {
    let band = model.bands[reading.index]
    let name = props.x.label ?? props.x.key
    let view = PMChartReadout(
      header: model.categories[reading.index], rows: model.rows(at: reading.index),
      style: model.tooltip)
    if model.vertical {
      RuleMark(x: .value(name, band))
        .foregroundStyle(.clear)
        .annotation(
          position: .top, spacing: 0,
          overflowResolution: .init(x: .fit(to: .chart), y: .fit(to: .chart))
        ) { view }
    } else {
      RuleMark(y: .value(name, band))
        .foregroundStyle(.clear)
        .annotation(
          position: .trailing, alignment: .center, spacing: 0,
          overflowResolution: .init(x: .fit(to: .chart), y: .fit(to: .chart))
        ) { view }
    }
  }

  // MARK: Reading

  private func spoken(_ model: BarModel) -> String {
    guard let reading, model.categories.indices.contains(reading.index) else {
      return model.text.spoken(model.summary, selectable: props.onSelect != nil)
    }
    let header = model.categories[reading.index]
    let rows = model.rows(at: reading.index)
    if reading.onSeries, rows.indices.contains(reading.series) {
      return PMChartSpoken.mark(header, rows[reading.series])
    }
    return PMChartSpoken.reading(header, rows)
  }

  private func tapped(_ index: Int, model: BarModel) {
    if reading?.index == index, props.onSelect != nil {
      activate(model)
    } else {
      reading = PMChartReading(index: index)
    }
  }

  private func handle(_ key: PMChartKey, model: BarModel) {
    switch key {
    case .next, .extendNext: reading = .step(reading, by: 1, count: model.rows.count)
    case .previous, .extendPrevious: reading = .step(reading, by: -1, count: model.rows.count)
    case .down: reading = .walkSeries(reading, by: 1, count: model.visible.count)
    case .up: reading = .walkSeries(reading, by: -1, count: model.visible.count)
    case .activate: activate(model)
    case .escape: reading = nil
    }
  }

  private func activate(_ model: BarModel) {
    guard let onSelect = props.onSelect, let reading, model.rows.indices.contains(reading.index),
      model.visible.indices.contains(reading.series)
    else { return }
    onSelect(
      PMChartSeriesSelection(
        index: Double(reading.index), key: model.visible[reading.series].key,
        datum: model.rows[reading.index]))
  }
}

/// The axes: the bands on one side, the value axis with its gridlines on the
/// other, as the orientation puts them.
private struct BarAxes: ViewModifier {
  let model: BarModel
  let theme: PMTheme

  func body(content: Content) -> some View {
    let value = PMChartAxes.value(model.domain, theme.chart.grid, vertical: model.vertical) {
      model.text.number($0, model.format)
    }
    let band = PMChartAxes.band(model.bands, vertical: model.vertical) {
      model.label(forBand: $0)
    }
    if model.vertical {
      content
        .chartYScale(domain: model.domain.range)
        .chartYAxis { value }
        .chartXAxis { band }
    } else {
      content
        .chartXScale(domain: model.domain.range)
        .chartXAxis { value }
        .chartYAxis { band }
    }
  }
}

// MARK: - The model

/// What the chart draws, from its props, the hidden series and the theme: the
/// engine's `barChartModel` with the measured geometry left to Swift Charts.
@MainActor
private struct BarModel {
  struct Bar {
    let band: String
    let series: PMChartPaint
    let from: Double
    let to: Double
    let positive: Bool
    let paint: PMDynamicColor
    /// The outermost segment of its side, which alone rounds its data end.
    let outermost: Bool
    /// A segment above another on its side, which gives its baseline end a gap.
    let inner: Bool
  }

  let rows: [PMChartRow]
  let x: PMChartXAxis
  let format: PMValueFormat?
  let messages: PMChartMessages
  let text: PMChartText
  /// Every declared series, the bars then the lines: the legend, the twin and the summary.
  let painted: [PMChartPaint]
  /// The shown series, the bars then the lines: the readout and the walk.
  let visible: [PMChartPaint]
  /// The shown bar series, which the marks and the stacks read.
  let bars: [PMChartPaint]
  /// The shown line series.
  let lines: [PMChartPaint]
  /// The keys of the series drawn as lines, whose legend keys are lines.
  let lineKeys: Set<String>
  let vertical: Bool
  let diverging: Bool
  let layered: Bool
  let signed: Bool
  let segments: [[PMChartSegment]]
  let domain: PMChartDomain
  let bands: [String]
  let categories: [String]
  let annotations: [PMChartAnnotation]
  let tooltip: PMChartTooltipStyle
  let summary: String
  let twin: PMChartTwinModel
  let label: String
  /// The measure the values are in, `y.label`, when the chart names one.
  let measure: String?
  let theme: PMTheme

  init(props: PMBarChartProps, theme: PMTheme, locale: Locale, hidden: Set<String>) {
    let messages = props.messages ?? PMSpecDefault.chartMessages
    let text = PMChartText(locale: locale, messages: messages)
    let rows = props.data
    let mode = props.mode ?? .grouped
    let vertical = (props.orientation ?? .vertical) == .vertical
    // A line joins the categories along x, so a horizontal chart draws none.
    let drawnLines = vertical ? props.lines ?? [] : []
    // One resolution, so the lines take the slots after the bars'.
    let all = PMChartPalette.series(props.series + drawnLines, theme)
    let resolved = Array(all.prefix(props.series.count))
    let lineSeries = Array(all.dropFirst(props.series.count))

    // Likert: each side's series take the arms outward from zero, assigned
    // over the declared series, so hiding one never shifts another's arm.
    var armed = resolved
    if mode == .diverging && resolved.count >= 2 {
      let arms = PMChartPalette.arms(rows, resolved.map(\.key))
      armed = zip(resolved, arms).map { entry, arm in
        var entry = entry
        if let arm, entry.tone == nil { entry.paint = PMChartPalette.diverging(arm, theme.chart) }
        return entry
      }
    }
    let paintedBars = PMChartPalette.emphasised(armed, props.emphasis, theme.chart)
    let paintedLines = PMChartPalette.emphasised(lineSeries, props.emphasis, theme.chart)
    let painted = paintedBars + paintedLines
    let bars = paintedBars.filter { !hidden.contains($0.key) }
    let lines = paintedLines.filter { !hidden.contains($0.key) }
    let visible = bars + lines
    let keys = bars.map(\.key)

    let mixed = mode == .stacked && PMChartStack.mixedSigns(rows, keys)
    let stacked = mode == .stacked && !mixed && bars.count > 1
    let diverging = mode == .diverging
    let layered = stacked || (diverging && !bars.isEmpty)
    let segments = layered ? PMChartStack.segments(rows, keys, diverging ? .diverging : .stacked) : []

    // A stack's axis covers its running totals, and the one axis reaches the
    // lines too; with every series hidden the axis keeps the full data's
    // domain rather than invent one.
    let lineValues = rows.flatMap { row in lines.compactMap { row.pmMeasure($0.key) } }
    let values: [Double] =
      layered
      ? segments.flatMap { $0.flatMap { [$0.from, $0.to] } } + lineValues
      : rows.flatMap { row in (visible.isEmpty ? painted : visible).compactMap { row.pmMeasure($0.key) } }

    self.rows = rows
    self.x = props.x
    self.format = props.y?.format
    self.messages = messages
    self.text = text
    self.painted = painted
    self.visible = visible
    self.bars = bars
    self.lines = lines
    self.lineKeys = Set(paintedLines.map(\.key))
    self.vertical = vertical
    self.diverging = diverging
    self.layered = layered
    self.signed =
      paintedBars.count == 1 && rows.contains { ($0.pmMeasure(paintedBars[0].key) ?? 0) < 0 }
    self.segments = segments
    self.domain = PMChartScale.value(values, zero: true, count: props.y?.ticks ?? 5)
    self.bands = rows.map { $0.pmCell(props.x.key)?.written ?? "" }
    self.categories = rows.map { text.value($0.pmCell(props.x.key), props.x.format) }
    self.annotations = (props.baseline.map { [$0.annotation] } ?? []) + (props.annotations ?? [])
    self.tooltip = PMChartTooltipStyle(props.tooltip)
    self.summary = messages.summary(
      PMChartSummaryFacts(
        label: props.label, series: painted.map(\.label), points: Double(rows.count),
        measure: props.y?.label))
    self.twin = .series(
      x: props.x, categories: categories, rows: rows, series: painted, format: props.y?.format,
      text: text)
    self.label = props.label
    self.measure = props.y?.label
    self.theme = theme
  }

  /// `grouped`, `stacked` or `diverging`: what is drawn, which a mixed-sign
  /// stack turns to `grouped`.
  var drawn: String { layered ? (diverging ? "diverging" : "stacked") : "grouped" }

  func label(forBand band: String) -> String {
    bands.firstIndex(of: band).map { categories[$0] } ?? band
  }

  /// One bar's bounds and paint, or `nil` for a gap.
  func bar(row index: Int, series at: Int) -> Bar? {
    let entry = bars[at]
    let row = rows[index]
    let band = bands[index]
    if layered {
      guard let segment = segments[at].indices.contains(index) ? segments[at][index] : nil,
        segment.present
      else { return nil }
      let positive = diverging ? segment.from + segment.to > 0 : segment.to >= segment.from
      let sameSide: (Int) -> Bool = { other in
        guard let value = row.pmMeasure(bars[other].key), value != 0 else { return false }
        return (value > 0) == positive
      }
      let outermost =
        diverging ? !(at + 1..<bars.count).contains(where: sameSide) : at == bars.count - 1
      let inner = diverging ? (0..<at).contains(where: sameSide) : at > 0
      return Bar(
        band: band, series: entry, from: segment.from, to: segment.to, positive: positive,
        paint: entry.paint, outermost: outermost, inner: inner)
    }
    guard let value = row.pmMeasure(entry.key) else { return nil }
    let positive = value >= 0
    let paint = signed ? PMChartPalette.diverging(positive ? 3 : -3, theme.chart) : entry.paint
    return Bar(
      band: band, series: entry, from: 0, to: value, positive: positive, paint: paint,
      outermost: true, inner: false)
  }

  /// A bar's thickness for a band axis `length` long: the group fills at most
  /// 80% of its band, its bars 2 points apart, each at most `space-6`.
  func slot(length: CGFloat, theme: PMTheme) -> CGFloat {
    let count = CGFloat(max(1, rows.count))
    let band = length * PMChartMetrics.bandFill / count
    let marks = CGFloat(layered ? 1 : max(1, bars.count))
    return min(
      theme.defaultDensity.space.s6,
      max(PMChartMetrics.hairline, (band - PMChartMetrics.gap * (marks - 1)) / marks))
  }

  /// The span a band's group takes: its bars and their gaps.
  func groupSpan(_ slot: CGFloat) -> CGFloat {
    let marks = CGFloat(layered ? 1 : max(1, bars.count))
    return marks * (slot + PMChartMetrics.gap)
  }

  /// The data end's corners: rounded on the outermost segment, square at the baseline.
  static func dataEnd(vertical: Bool, positive: Bool, rounded: Bool) -> UnevenRoundedRectangle {
    let r = rounded ? PMChartMetrics.barEnd : 0
    switch (vertical, positive) {
    case (true, true):
      return UnevenRoundedRectangle(topLeadingRadius: r, topTrailingRadius: r)
    case (true, false):
      return UnevenRoundedRectangle(bottomLeadingRadius: r, bottomTrailingRadius: r)
    case (false, true):
      return UnevenRoundedRectangle(bottomTrailingRadius: r, topTrailingRadius: r)
    case (false, false):
      return UnevenRoundedRectangle(topLeadingRadius: r, bottomLeadingRadius: r)
    }
  }

  /// A line's runs of rows between gaps: a gap breaks the line, never drops it to zero.
  func runs(_ key: String) -> [[Int]] {
    var runs: [[Int]] = [[]]
    for index in rows.indices {
      if rows[index].pmMeasure(key) != nil {
        runs[runs.count - 1].append(index)
      } else if !runs[runs.count - 1].isEmpty {
        runs.append([])
      }
    }
    return runs.filter { !$0.isEmpty }
  }

  /// The readout's rows at a band: every shown series, a gap said as `noData`.
  func rows(at index: Int) -> [PMChartReadoutRow] {
    visible.map { entry in
      let value = rows[index].pmMeasure(entry.key)
      return PMChartReadoutRow(
        key: entry.key, label: entry.label,
        value: value.map { text.number($0, format) } ?? messages.noData, paint: entry.paint)
    }
  }

  var descriptor: PMChartDescriptor? {
    guard !rows.isEmpty else { return nil }
    return PMChartDescriptor(
      title: label, summary: summary, xTitle: x.label ?? x.key, bands: categories,
      xRange: 0...Double(max(1, rows.count - 1)), xFormat: nil,
      yTitle: measure ?? (painted.count == 1 ? painted[0].label : label), yRange: domain.range,
      yFormat: format, locale: text.locale,
      series: painted.map { entry in
        PMChartDescriptor.Series(
          name: entry.label, continuous: false,
          points: rows.enumerated().compactMap { index, row in
            row.pmMeasure(entry.key).map { (band: categories[index], x: Double(index), y: $0) }
          })
      })
  }
}

// MARK: - States

/// BarChart's states, from the spec's States table, with the reading shown
/// and a series toggled off.
public struct BarChartStates: PMStates {
  public let member = "BarChart"

  public init() {}

  private static let byChannel: [PMChartRow] = [
    ["channel": "Email", "tickets": 214], ["channel": "Chat", "tickets": 96],
    ["channel": "Phone", "tickets": 41], ["channel": "Social", "tickets": 18],
  ]

  private static let byWeekday: [PMChartRow] = [
    ["day": "Mon", "opened": 32, "resolved": 28], ["day": "Tue", "opened": 41, "resolved": 39],
    ["day": "Wed", "opened": 37, "resolved": 40], ["day": "Thu", "opened": 29, "resolved": 31],
    ["day": "Fri", "opened": 22, "resolved": 25],
  ]

  private static let byPriority: [PMChartRow] = [
    ["day": "Mon", "urgent": 4, "high": 11, "normal": 17],
    ["day": "Tue", "urgent": 6, "high": 14, "normal": 21],
    ["day": "Wed", "urgent": 3, "high": 12, "normal": 22],
    ["day": "Thu", "urgent": 5, "high": 9, "normal": 15],
    ["day": "Fri", "urgent": 2, "high": 8, "normal": 12],
  ]

  private static let byAgent: [PMChartRow] = [
    ["agent": "Priya Raghunathan-Iyer", "tickets": 88], ["agent": "Tomás Oyelaran", "tickets": 74],
    ["agent": "Wei Zhang", "tickets": 61], ["agent": "Amara Okonkwo-Bell", "tickets": 52],
    ["agent": "Sam Ferreira", "tickets": 39],
  ]

  private static let backlogDelta: [PMChartRow] = [
    ["week": "W31", "delta": 12], ["week": "W32", "delta": -8], ["week": "W33", "delta": 3],
    ["week": "W34", "delta": -15],
  ]

  private static let pair = [
    PMChartSeries(key: "opened", label: "Opened"), PMChartSeries(key: "resolved", label: "Resolved"),
  ]

  private static let four =
    pair + [
      PMChartSeries(key: "reopened", label: "Reopened"),
      PMChartSeries(key: "escalated", label: "Escalated"),
    ]

  private static var fourRows: [PMChartRow] {
    zip(byWeekday, zip([4, 6, 3, 5, 2], [2, 3, 1, 4, 1])).map { row, extra in
      var row = row
      row["reopened"] = .number(Double(extra.0))
      row["escalated"] = .number(Double(extra.1))
      return row
    }
  }

  private static let eight = ["Email", "Chat", "Phone", "Social", "Portal", "API", "Partner", "Walk-in"]
    .map { PMChartSeries(key: $0.lowercased().filter(\.isLetter), label: $0) }

  private static var eightRows: [PMChartRow] {
    var row: PMChartRow = ["day": "Mon"]
    for (index, entry) in eight.enumerated() { row[entry.key] = .number(Double(40 - index * 4)) }
    return [row]
  }

  private static let thousands: [PMChartRow] = [
    ["month": "May", "tickets": 18_400], ["month": "Jun", "tickets": 21_900],
    ["month": "Jul", "tickets": 24_100], ["month": "Aug", "tickets": 22_700],
  ]

  private static let likert: [PMChartRow] = [
    ["question": "Response speed", "strongDisagree": -9, "disagree": -16, "agree": 31, "strongAgree": 14],
    ["question": "Ease of contact", "strongDisagree": -4, "disagree": -11, "agree": 38, "strongAgree": 17],
    ["question": "Issue resolved", "strongDisagree": -12, "disagree": -19, "agree": 26, "strongAgree": 13],
  ]

  private static let tickets = [PMChartSeries(key: "tickets", label: "Tickets")]
  private static let day = PMChartXAxis(key: "day", label: "Day")

  /// Tickets opened by week, with the app's trailing four-week average.
  private static let byWeek: [PMChartRow] = zip(
    [182, 205, 197, 231, 214, 188, 243, 226, 251, 238],
    [182, 194, 195, 204, 212, 208, 219, 218, 227, 240]
  ).enumerated().map { index, pair in
    [
      "week": .text("W\(40 + index)"), "opened": .number(Double(pair.0)),
      "average": .number(Double(pair.1)),
    ]
  }

  private static let average = [PMChartSeries(key: "average", label: "Four-week average")]
  private static let week = PMChartXAxis(key: "week", label: "Week")

  public var entries: [PMStateEntry] {
    let weekday = PMBarChartProps(
      data: Self.byWeekday, label: "Opened and resolved by weekday", series: Self.pair, x: Self.day)
    var entries = [
      PMStateEntry(
        "single series", expect: ["size": "md", "mode": "grouped", "label": "Tickets by channel"]
      ) {
        PMBarChart(
          props: PMBarChartProps(
            data: Self.byChannel, label: "Tickets by channel", series: Self.tickets,
            x: PMChartXAxis(key: "channel", label: "Channel")))
      },
      PMStateEntry("grouped", expect: ["mode": "grouped"]) { PMBarChart(props: weekday) },
      PMStateEntry("stacked", expect: ["mode": "stacked"]) {
        PMBarChart(
          props: PMBarChartProps(
            data: Self.byPriority, label: "Tickets by priority and weekday", mode: .stacked,
            series: [
              PMChartSeries(key: "urgent", label: "Urgent"),
              PMChartSeries(key: "high", label: "High"),
              PMChartSeries(key: "normal", label: "Normal"),
            ], x: Self.day))
      },
      PMStateEntry("horizontal", expect: ["orientation": "horizontal"]) {
        PMBarChart(
          props: PMBarChartProps(
            data: Self.byAgent, label: "Tickets by agent", orientation: .horizontal,
            series: Self.tickets, x: PMChartXAxis(key: "agent", label: "Agent")))
      },
      PMStateEntry("signed single") {
        PMBarChart(
          props: PMBarChartProps(
            data: Self.backlogDelta, label: "Backlog change by week",
            series: [PMChartSeries(key: "delta", label: "Backlog change")],
            x: PMChartXAxis(key: "week", label: "Week")))
      },
      PMStateEntry("status-toned") {
        PMBarChart(
          props: PMBarChartProps(
            data: Self.byWeekday.map { row in
              ["day": row.pmCell("day"), "breaches": .number((row.pmMeasure("opened") ?? 0) / 8)]
            },
            label: "SLA breaches by weekday",
            series: [PMChartSeries(key: "breaches", label: "SLA breaches", tone: .danger)],
            x: Self.day))
      },
      PMStateEntry("baseline") {
        PMBarChart(
          props: PMBarChartProps(
            baseline: PMChartBaseline(value: 40, label: "Target"), data: Self.byWeekday,
            label: "Opened and resolved against target", series: Self.pair, x: Self.day))
      },
      PMStateEntry("emphasis") {
        PMBarChart(
          props: PMBarChartProps(
            data: Self.fourRows, emphasis: "resolved", label: "Ticket flow, resolved emphasised",
            series: Self.four, x: Self.day))
      },
      PMStateEntry("max series") {
        PMBarChart(
          props: PMBarChartProps(
            data: Self.eightRows, label: "Every channel, one day", series: Self.eight, x: Self.day))
      },
      PMStateEntry("y format") {
        PMBarChart(
          props: PMBarChartProps(
            data: Self.thousands, label: "Tickets by month", series: Self.tickets,
            x: PMChartXAxis(key: "month", label: "Month"),
            y: PMChartYAxis(format: PMValueFormat(style: .compact))))
      },
      PMStateEntry("empty", expect: ["state": "empty"]) {
        PMBarChart(
          props: PMBarChartProps(
            data: [], label: "Tickets by channel", series: Self.tickets,
            x: PMChartXAxis(key: "channel")))
      },
      PMStateEntry("loading", expect: ["state": "loading"]) {
        PMBarChart(
          props: PMBarChartProps(
            data: Self.byWeekday, label: "Opened and resolved by weekday", loading: true,
            series: Self.pair, x: PMChartXAxis(key: "day")))
      },
      PMStateEntry("loading, first render", expect: ["state": "loading"]) {
        PMBarChart(
          props: PMBarChartProps(
            data: [], label: "Opened and resolved by weekday", loading: true, series: Self.pair,
            x: PMChartXAxis(key: "day")))
      },
      PMStateEntry("tooltip off") {
        PMBarChart(
          props: PMBarChartProps(
            data: Self.byWeekday, label: "Opened and resolved, print", series: Self.pair,
            tooltip: .off, x: PMChartXAxis(key: "day")),
          reading: PMChartReading(index: 1))
      },
      PMStateEntry(
        "diverging (Likert)", expect: ["mode": "diverging", "orientation": "horizontal"]
      ) {
        PMBarChart(
          props: PMBarChartProps(
            data: Self.likert, label: "Survey agreement by question", mode: .diverging,
            orientation: .horizontal,
            series: [
              PMChartSeries(key: "disagree", label: "Disagree"),
              PMChartSeries(key: "strongDisagree", label: "Strongly disagree"),
              PMChartSeries(key: "agree", label: "Agree"),
              PMChartSeries(key: "strongAgree", label: "Strongly agree"),
            ], x: PMChartXAxis(key: "question", label: "Question")))
      },
    ]
    entries += [
      PMStateEntry("line") {
        PMBarChart(
          props: PMBarChartProps(
            data: Self.byWeek, label: "Tickets opened by week, with the four-week average",
            lines: Self.average, series: [PMChartSeries(key: "opened", label: "Opened")],
            x: Self.week))
      },
      PMStateEntry("stacked with line", expect: ["mode": "stacked"]) {
        PMBarChart(
          props: PMBarChartProps(
            data: zip(Self.byPriority, [36, 38, 38, 34, 28]).map { row, capacity in
              var row = row
              row["capacity"] = .number(Double(capacity))
              return row
            },
            label: "Tickets by priority, against capacity",
            lines: [PMChartSeries(key: "capacity", label: "Capacity")], mode: .stacked,
            series: [
              PMChartSeries(key: "urgent", label: "Urgent"),
              PMChartSeries(key: "high", label: "High"),
              PMChartSeries(key: "normal", label: "Normal"),
            ], x: Self.day))
      },
      PMStateEntry("line with a gap") {
        PMBarChart(
          props: PMBarChartProps(
            data: Self.byWeek.map { row in
              var row = row
              if row.pmCell("week")?.written == "W45" { row["average"] = .some(nil) }
              return row
            },
            label: "Tickets opened by week, one average missing", lines: Self.average,
            series: [PMChartSeries(key: "opened", label: "Opened")], x: Self.week),
          reading: PMChartReading(index: 2, series: 1, onSeries: true))
      },
    ]
    entries += [
      PMStateEntry("reading a band", expect: ["mode": "grouped"]) {
        PMBarChart(props: weekday, reading: PMChartReading(index: 1))
      },
      PMStateEntry("a series hidden", expect: ["mode": "grouped"]) {
        PMBarChart(props: weekday, reading: nil, hidden: ["resolved"])
      },
    ]
    return entries
  }
}
