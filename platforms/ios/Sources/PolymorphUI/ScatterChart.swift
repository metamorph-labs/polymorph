// ScatterChart (`design/components/scatter-chart.md`): whether two measures
// move together, one mark per observation through Swift Charts' `PointMark`:
// an 8-point dot in the series' paint inside a 2-point ring of the surface, so
// overlapping marks stay legible. In bubble mode a third measure sets each
// mark's area. Both axes are value axes, so both carry hairline gridlines,
// and each draws its zero rule only when zero is in its domain.
//
// The engine's rules, ported where Swift Charts decides otherwise
// (`packages/engine/src/charts/scatter-chart.ts`): x is a measure, so an
// omitted scale is `linear` and a `band` renders linear; y fits the data
// (`auto`) unless `zero` anchors it, both nice'd to the web's ticks; a `null`
// x, y or bubble draws no mark for that row and series, never a zero; the
// bubble's radius grows with the square root of its value (`sqrtRadiusScale`),
// from the marker's 8 points to the 24 of a hit target, so area encodes the
// value; a flat extent puts every bubble at the largest. Scatter is an
// any-neighbour form, so the palette's `chartCap` is its series limit; past
// it the chart still draws what it is given. The legend toggles a series and
// both domains refit; the twin always holds every series.
//
// The reading position: a tap reads the nearest mark (the engine's naive
// scan) and a tap on the mark already read calls `onSelect`. Left and right
// walk the rows within the series, up and down switch series at the same
// row; the read mark's ring thickens and the other series ease to 0.8.

import Charts
import PolymorphTokens
import SwiftUI

public struct PMScatterChart: PMScatterChartRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.locale) private var environmentLocale
  @State private var hidden: Set<String> = []
  @State private var reading: PMChartReading?
  private let props: PMScatterChartProps

  public init(props: PMScatterChartProps) {
    self.init(props: props, reading: nil)
  }

  /// A chart already read at `reading`: the states fixture's way to show the readout.
  init(props: PMScatterChartProps, reading: PMChartReading?) {
    self.props = props
    _reading = State(initialValue: reading)
  }

  public var body: some View {
    let model = ScatterModel(props: props, theme: theme, locale: locale, hidden: hidden)
    let state = PMChartState(empty: props.data.isEmpty, loading: props.loading)
    PMChartFrame(
      member: "ScatterChart", label: props.label, size: props.size ?? .md, state: state,
      attributes: props.bubble == nil ? [:] : ["bubble": "true"],
      empty: model.messages.empty, twin: model.twin, messages: model.messages
    ) {
      if props.data.isEmpty {
        PMChartSkeleton()
      } else if model.xs.kind == .time {
        plot(model, xs: model.xs.dates)
      } else {
        plot(model, xs: model.xs.numbers)
      }
    } legend: {
      if model.painted.count >= 2 {
        PMChartLegend(series: model.painted, shape: .rect, hidden: hidden) { key in
          if hidden.contains(key) { hidden.remove(key) } else { hidden.insert(key) }
          reading = nil
        }
      }
    }
  }

  private var locale: Locale { props.locale.map { Locale(identifier: $0) } ?? environmentLocale }

  private func plot<X: Plottable & Comparable>(_ model: ScatterModel, xs: [X?]) -> some View {
    let xName = props.x.label ?? props.x.key
    let layer = PMChartAnnotationLayer(annotations: props.annotations ?? [], theme: theme)
    return Chart {
      layer.wash()
      ForEach(Array(model.visible.enumerated()), id: \.element.key) { at, entry in
        ForEach(model.rows.indices, id: \.self) { index in
          if let x = xs[index], let y = model.rows[index].pmMeasure(entry.key),
            let diameter = model.diameter(index)
          {
            let active = reading?.index == index && reading?.series == at
            PointMark(x: .value(xName, x), y: .value(entry.label, y))
              .symbol {
                PMChartMarker(paint: entry.paint, diameter: diameter, active: active)
              }
              .opacity(reading == nil || reading?.series == at ? 1 : PMChartMetrics.lift)
          }
        }
      }
      if model.yDomain.holdsZero {
        RuleMark(y: .value(props.label, 0))
          .lineStyle(StrokeStyle(lineWidth: PMChartMetrics.hairline))
          .foregroundStyle(theme.chart.axis.color)
      }
      if model.xs.kind == .linear, let zero = 0.0 as? X, model.xDomain.holdsZero {
        RuleMark(x: .value(xName, zero))
          .lineStyle(StrokeStyle(lineWidth: PMChartMetrics.hairline))
          .foregroundStyle(theme.chart.axis.color)
      }
      layer.ink()
      layer.points { value -> X? in
        switch value {
        case .number(let number): return number as? X
        case .text(let text): return PMChartTime.parse(text) as? X
        }
      }
      if let reading, model.tooltip.visible, model.visible.indices.contains(reading.series),
        model.rows.indices.contains(reading.index), let x = xs[reading.index],
        let y = model.rows[reading.index].pmMeasure(model.visible[reading.series].key)
      {
        PointMark(x: .value(xName, x), y: .value(props.label, y))
          .opacity(0)
          .annotation(
            position: .top, spacing: PMChartMetrics.markerDiameter,
            overflowResolution: .init(x: .fit(to: .chart), y: .fit(to: .chart))
          ) {
            PMChartReadout(
              header: model.xs.labels[reading.index], rows: model.rows(at: reading),
              style: model.tooltip)
          }
      }
    }
    .chartLegend(.hidden)
    .chartYScale(domain: model.yDomain.range)
    .chartYAxis {
      PMChartAxes.both(model.yDomain.ticks, theme.chart.grid, vertical: true) {
        model.text.number($0, props.y?.format)
      }
    }
    .modifier(ScatterXAxis(model: model, grid: theme.chart.grid))
    .chartOverlay { proxy in
      GeometryReader { overlay in
        Rectangle().fill(.clear).contentShape(.rect)
          .gesture(
            SpatialTapGesture().onEnded { tap in
              guard let frame = proxy.plotFrame else { return }
              let origin = overlay[frame].origin
              let at = CGPoint(x: tap.location.x - origin.x, y: tap.location.y - origin.y)
              if let nearest = model.nearest(at, xs: xs, proxy: proxy) { tapped(nearest, model: model) }
            })
      }
    }
    .pmChartPlot(
      label: props.label, spoken: spoken(model), selectable: props.onSelect != nil,
      interactive: true, descriptor: model.descriptor
    ) { key in handle(key, model: model) }
  }

  // MARK: Reading

  private func spoken(_ model: ScatterModel) -> String {
    guard let reading, model.visible.indices.contains(reading.series),
      model.rows.indices.contains(reading.index)
    else { return model.text.spoken(model.summary, selectable: props.onSelect != nil) }
    let rows = model.rows(at: reading)
    let values = rows.map(\.value).joined(separator: ", ")
    return "\(model.xs.labels[reading.index]), \(values): \(model.visible[reading.series].label)"
  }

  private func tapped(_ at: PMChartReading, model: ScatterModel) {
    if reading == at, props.onSelect != nil {
      activate(model)
    } else {
      reading = at
    }
  }

  private func handle(_ key: PMChartKey, model: ScatterModel) {
    switch key {
    case .next, .extendNext: reading = .step(reading, by: 1, count: model.rows.count)
    case .previous, .extendPrevious: reading = .step(reading, by: -1, count: model.rows.count)
    case .down: reading = .walkSeries(reading, by: 1, count: model.visible.count)
    case .up: reading = .walkSeries(reading, by: -1, count: model.visible.count)
    case .activate: activate(model)
    case .escape: reading = nil
    }
  }

  private func activate(_ model: ScatterModel) {
    guard let onSelect = props.onSelect, let reading, model.rows.indices.contains(reading.index),
      model.visible.indices.contains(reading.series)
    else { return }
    onSelect(
      PMChartSeriesSelection(
        index: Double(reading.index), key: model.visible[reading.series].key,
        datum: model.rows[reading.index]))
  }
}

/// The x axis: a value axis with its own gridlines, linear or time.
private struct ScatterXAxis: ViewModifier {
  let model: ScatterModel
  let grid: PMDynamicColor

  func body(content: Content) -> some View {
    switch model.xs.kind {
    case .time:
      let dates = model.xs.dates.compactMap { $0 }
      let low = dates.min() ?? .now
      let high = dates.max() ?? .now
      let count = Int(model.x.ticks ?? 5)
      let granularity =
        model.x.format?.granularity
        ?? PMChartTime.granularity(step: high.timeIntervalSince(low) / Double(count))
      content
        .chartXScale(domain: low...high)
        .chartXAxis {
          AxisMarks(values: .automatic(desiredCount: count)) { value in
            AxisGridLine(stroke: StrokeStyle(lineWidth: PMChartMetrics.hairline))
              .foregroundStyle(grid.color)
            AxisValueLabel(anchor: .top, collisionResolution: .greedy, orientation: .horizontal) {
              if let date = value.as(Date.self) { PMChartTick(model.text.date(date, granularity)) }
            }
          }
        }
    default:
      content
        .chartXScale(domain: model.xDomain.range)
        .chartXAxis {
          PMChartAxes.both(model.xDomain.ticks, grid, vertical: false) {
            model.text.number($0, model.x.format)
          }
        }
    }
  }
}

/// The scatter's drawing (`scatterChartModel`).
@MainActor
private struct ScatterModel {
  let rows: [PMChartRow]
  let x: PMChartXAxis
  let xs: PMChartXValues
  let painted: [PMChartPaint]
  let visible: [PMChartPaint]
  let bubble: PMScatterBubble?
  let xDomain: PMChartDomain
  let yDomain: PMChartDomain
  let yFormat: PMValueFormat?
  let messages: PMChartMessages
  let text: PMChartText
  let tooltip: PMChartTooltipStyle
  let summary: String
  let twin: PMChartTwinModel
  let label: String
  /// The measure the values are in, `y.label`, when the chart names one.
  let measure: String?
  /// The bubble's extent, for the square-root radius.
  let bubbleExtent: (Double, Double)?
  let marker: CGFloat
  let largest: CGFloat

  init(props: PMScatterChartProps, theme: PMTheme, locale: Locale, hidden: Set<String>) {
    let messages = props.messages ?? PMSpecDefault.chartMessages
    let text = PMChartText(locale: locale, messages: messages)
    let painted = PMChartPalette.series(props.series, theme)
    let visible = painted.filter { !hidden.contains($0.key) }
    // A scatter's x is a measure: an omitted scale is linear, a band renders linear.
    let kind: PMChartAxisKind = props.x.scale == .time ? .time : .linear
    let xs = PMChartXValues(rows: props.data, x: props.x, kind: kind, text: text)
    let keys = (visible.isEmpty ? painted : visible).map(\.key)
    let yValues = props.data.flatMap { row in keys.compactMap { row.pmMeasure($0) } }
    let bubbles = props.bubble.map { bubble in props.data.compactMap { $0.pmMeasure(bubble.key) } }
    self.rows = props.data
    self.x = props.x
    self.xs = xs
    self.painted = painted
    self.visible = visible
    self.bubble = props.bubble
    self.xDomain = PMChartScale.value(
      xs.numbers.compactMap { $0 }, zero: false, count: props.x.ticks ?? 5)
    self.yDomain = PMChartScale.value(
      yValues, zero: props.y?.domain == .zero, count: props.y?.ticks ?? 5)
    self.yFormat = props.y?.format
    self.messages = messages
    self.text = text
    self.tooltip = PMChartTooltipStyle(props.tooltip)
    self.summary = messages.summary(
      PMChartSummaryFacts(
        label: props.label, series: painted.map(\.label), points: Double(props.data.count),
        measure: props.y?.label, xMeasure: props.x.label))
    var twin = PMChartTwinModel.series(
      x: props.x, categories: xs.labels, rows: props.data, series: painted,
      format: props.y?.format, text: text)
    if let bubble = props.bubble {
      twin = PMChartTwinModel(
        columns: twin.columns
          + [PMChartTwinModel.Column(label: bubble.label ?? bubble.key, numeric: true)],
        rows: zip(twin.rows, props.data).map { cells, row in
          cells + [row.pmMeasure(bubble.key).map { text.number($0, bubble.format) } ?? ""]
        })
    }
    self.twin = twin
    self.label = props.label
    self.measure = props.y?.label
    self.bubbleExtent = bubbles.flatMap { values in
      values.min().flatMap { low in values.max().map { (low, $0) } }
    }
    self.marker = PMChartMetrics.markerDiameter
    self.largest = PMChartMetrics.hitMinimum
  }

  /// A mark's diameter: the marker's, or in bubble mode the square-root
  /// scale's between the marker and a hit target; `nil` when its bubble value
  /// is a gap, which draws no mark.
  func diameter(_ index: Int) -> CGFloat? {
    guard let bubble else { return marker }
    guard let value = rows[index].pmMeasure(bubble.key) else { return nil }
    guard let (low, high) = bubbleExtent, high > low else { return largest }
    let (minimum, maximum) = (marker / 2, largest / 2)
    // `scaleSqrt`: the radius runs with the square root across the domain.
    let t = (value.squareRoot() - low.squareRoot()) / (high.squareRoot() - low.squareRoot())
    return 2 * (minimum + CGFloat(t) * (maximum - minimum))
  }

  /// The readout's rows at a mark: its y value, then its bubble value.
  func rows(at reading: PMChartReading) -> [PMChartReadoutRow] {
    let entry = visible[reading.series]
    let row = rows[reading.index]
    var found = [
      PMChartReadoutRow(
        key: entry.key, label: entry.label,
        value: row.pmMeasure(entry.key).map { text.number($0, yFormat) } ?? messages.noData,
        paint: entry.paint)
    ]
    if let bubble, let value = row.pmMeasure(bubble.key) {
      found.append(
        PMChartReadoutRow(
          key: "\(entry.key)-bubble", label: bubble.label ?? bubble.key,
          value: text.number(value, bubble.format), paint: entry.paint))
    }
    return found
  }

  /// The mark nearest a point on the plot, by the engine's naive scan, among
  /// the shown series' drawn marks.
  func nearest<X: Plottable>(_ point: CGPoint, xs: [X?], proxy: ChartProxy) -> PMChartReading? {
    var best: (PMChartReading, CGFloat)?
    for (at, entry) in visible.enumerated() {
      for index in rows.indices {
        guard let x = xs[index], let y = rows[index].pmMeasure(entry.key),
          let position = proxy.position(for: (x: x, y: y))
        else { continue }
        let distance = hypot(position.x - point.x, position.y - point.y)
        if distance < (best?.1 ?? .infinity) { best = (PMChartReading(index: index, series: at), distance) }
      }
    }
    return best?.0
  }

  var descriptor: PMChartDescriptor? {
    guard !rows.isEmpty else { return nil }
    let values = xs.domainValues.compactMap { $0 }
    return PMChartDescriptor(
      title: label, summary: summary, xTitle: x.label ?? x.key, bands: nil,
      xRange: (values.min() ?? 0)...max(values.max() ?? 1, values.min() ?? 0),
      xFormat: xs.kind == .linear ? x.format : nil, yTitle: measure ?? label,
      yRange: yDomain.range,
      yFormat: yFormat, locale: text.locale,
      series: painted.map { entry in
        PMChartDescriptor.Series(
          name: entry.label, continuous: false,
          points: rows.indices.compactMap { index in
            guard let x = xs.domainValues[index], let y = rows[index].pmMeasure(entry.key) else {
              return nil
            }
            return (band: nil, x: x, y: y)
          })
      })
  }
}

// MARK: - States

/// ScatterChart's states, from the spec's States table, with the reading shown.
public struct ScatterChartStates: PMStates {
  public let member = "ScatterChart"

  public init() {}

  private static func round(_ value: Double, _ places: Double) -> Double {
    (value * places + 0.5).rounded(.down) / places
  }

  /// One mark per agent: handle minutes against CSAT, negatively correlated.
  private static let agents: [PMChartRow] = (0..<24).map { index -> PMChartRow in
    let minutes = 2 + Double((index * 7) % 12) + Double((index * 13) % 10) / 10
    let wobble = Double((index * 29) % 11 - 5) / 12
    let csat = round(5.1 - minutes * 0.14 + wobble, 100)
    return ["minutes": .number(round(minutes, 10)), "csat": .number(csat)]
  }

  private static let teams: [PMChartRow] = agents.enumerated().map { index, row -> PMChartRow in
    let even = index % 2 == 0
    return [
      "minutes": row.pmCell("minutes"), "triage": even ? row.pmCell("csat") : nil,
      "escalations": even ? nil : row.pmCell("csat"),
    ]
  }

  private static let withLoad: [PMChartRow] = agents.enumerated().map { index, row -> PMChartRow in
    var row = row
    row["tickets"] = .number(Double(20 + (index * 37) % 141))
    return row
  }

  private static let fourKeys = ["triage", "escalations", "billing", "onboarding"]

  private static let fourTeams: [PMChartRow] = agents.enumerated().map { index, row -> PMChartRow in
    var found: PMChartRow = ["minutes": row.pmCell("minutes")]
    for (at, key) in fourKeys.enumerated() {
      found[key] = .some(at == index % 4 ? row.pmCell("csat") : nil)
    }
    return found
  }

  private static let dense: [PMChartRow] = (0..<500).map { index -> PMChartRow in
    let minutes = 1 + Double((index * 17) % 130) / 10
    let wobble = Double((index * 31) % 23 - 11) / 14
    let csat = round(5.2 - minutes * 0.12 + wobble, 100)
    return ["minutes": .number(round(minutes, 10)), "csat": .number(csat)]
  }

  private static let deploys: [PMChartRow] = (0..<18).map { index -> PMChartRow in
    let date = String(format: "2026-07-%02d", 1 + (index * 5) % 28)
    return ["date": .text(date), "minutes": .number(Double((index * 43) % 90 + 4))]
  }

  private static let csat = [PMChartSeries(key: "csat", label: "CSAT")]
  private static let minutes = PMChartXAxis(key: "minutes", label: "Handle minutes")

  public var entries: [PMStateEntry] {
    let agents = PMScatterChartProps(
      data: Self.agents, label: "Handle time against satisfaction", series: Self.csat,
      x: Self.minutes)
    return [
      PMStateEntry(
        "handle time vs CSAT", expect: ["size": "md", "label": "Handle time against satisfaction"]
      ) { PMScatterChart(props: agents) },
      PMStateEntry("two teams") {
        PMScatterChart(
          props: PMScatterChartProps(
            data: Self.teams, label: "Handle time against satisfaction, by team",
            series: [
              PMChartSeries(key: "triage", label: "Triage"),
              PMChartSeries(key: "escalations", label: "Escalations"),
            ], x: Self.minutes))
      },
      PMStateEntry("bubble", expect: ["bubble": "true"]) {
        PMScatterChart(
          props: PMScatterChartProps(
            bubble: PMScatterBubble(key: "tickets", label: "Tickets handled"), data: Self.withLoad,
            label: "Handle time, satisfaction and load", series: Self.csat, x: Self.minutes))
      },
      PMStateEntry("cap warning") {
        PMScatterChart(
          props: PMScatterChartProps(
            data: Self.fourTeams, label: "Four teams — past the cap",
            series: Self.fourKeys.map { PMChartSeries(key: $0, label: $0.capitalized) },
            x: Self.minutes))
      },
      PMStateEntry("dense") {
        PMScatterChart(
          props: PMScatterChartProps(
            data: Self.dense, label: "Every conversation this quarter", series: Self.csat,
            x: Self.minutes))
      },
      PMStateEntry("time x") {
        PMScatterChart(
          props: PMScatterChartProps(
            data: Self.deploys, label: "Deploys against incident minutes",
            series: [PMChartSeries(key: "minutes", label: "Incident minutes")],
            x: PMChartXAxis(key: "date", scale: .time, label: "Deploy date")))
      },
      PMStateEntry("annotations") {
        PMScatterChart(
          props: PMScatterChartProps(
            annotations: [
              .band(PMChartBandAnnotation(from: 4.5, to: 5, label: "CSAT target")),
              .line(PMChartLineAnnotation(value: 4, label: "Floor")),
            ], data: Self.agents,
            label: "Handle time against satisfaction, with the target zone", series: Self.csat,
            x: Self.minutes))
      },
      PMStateEntry("empty", expect: ["state": "empty"]) {
        PMScatterChart(
          props: PMScatterChartProps(
            data: [], label: "Handle time against satisfaction", series: Self.csat,
            x: PMChartXAxis(key: "minutes")))
      },
      PMStateEntry("loading", expect: ["state": "loading"]) {
        PMScatterChart(
          props: PMScatterChartProps(
            data: Self.agents, label: "Handle time against satisfaction", loading: true,
            series: Self.csat, x: PMChartXAxis(key: "minutes")))
      },
      PMStateEntry("tooltip off") {
        PMScatterChart(
          props: PMScatterChartProps(
            data: Self.agents, label: "Handle time against satisfaction, print",
            series: Self.csat, tooltip: .off, x: PMChartXAxis(key: "minutes")),
          reading: PMChartReading(index: 4))
      },
      PMStateEntry("reading a mark") {
        PMScatterChart(props: agents, reading: PMChartReading(index: 4))
      },
    ]
  }
}
