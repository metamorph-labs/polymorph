// AreaChart (`design/components/area-chart.md`): what a total is made of over
// time, as bands stacked bottom-up in declaration order through Swift Charts'
// `AreaMark`, each a 10% wash of its series edged by its 2-point line, or each
// x normalised to 100% in the `percent` variant. It shares LineChart's plot
// (`PMRangePlot`): the crosshair, the readout of every band at an x, the
// brush and `syncId`, here on a `time` x only.
//
// The engine's rules, ported where Swift Charts decides otherwise
// (`packages/engine/src/charts/area-chart.ts`): the stack is the engine's
// (`stackSegments`), so a gap adds nothing and draws no band, and a negative
// value is removed from the stack rather than run down through the band
// below, while the readout and the twin still show it; the value axis is
// anchored at zero and reaches the running total, or 100% in `percent`, read
// as percents; a baseline means nothing against 100% and is not drawn there;
// in `percent` a value is never shown without its share. A band hidden from
// the legend leaves the stack, and the bands above re-stack on what remains;
// the twin always holds every series.

import Charts
import PolymorphTokens
import SwiftUI

public struct PMAreaChart: PMAreaChartRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.locale) private var environmentLocale
  @State private var hidden: Set<String> = []
  @State private var local: PMChartReading?
  @State private var brush: PMChartBrush?
  @State private var touchRange: ClosedRange<Double>?
  private let props: PMAreaChartProps

  public init(props: PMAreaChartProps) {
    self.init(props: props, reading: nil)
  }

  /// A chart already read at `reading`: the states fixture's way to show the readout.
  init(props: PMAreaChartProps, reading: PMChartReading?) {
    self.props = props
    _local = State(initialValue: reading)
  }

  public var body: some View {
    let model = PMRangeModel(area: props, theme: theme, locale: locale, hidden: hidden)
    let state = PMChartState(empty: props.data.isEmpty, loading: props.loading)
    PMChartFrame(
      member: "AreaChart", label: props.label, size: props.size ?? .md, state: state,
      attributes: ["variant": (props.variant ?? .stacked).rawValue],
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
        PMChartLegend(series: model.painted, shape: .rect, hidden: hidden) { key in
          if hidden.contains(key) { hidden.remove(key) } else { hidden.insert(key) }
        }
      }
    }
  }

  private var locale: Locale { props.locale.map { Locale(identifier: $0) } ?? environmentLocale }

  /// The brush and the sync need a continuum, which this member has on a time x only.
  private func brushable(_ model: PMRangeModel) -> Bool {
    props.onBrushEnd != nil && model.xs.kind == .time
  }

  // MARK: Reading

  private func reading(_ model: PMRangeModel) -> PMChartReading? {
    if let local { return local }
    guard let group = props.syncId, model.xs.kind == .time,
      let value = PMChartSync.shared.value(group), let index = model.xs.nearest(value)
    else { return nil }
    return PMChartReading(index: index)
  }

  private func read(_ reading: PMChartReading?, model: PMRangeModel) {
    local = reading
    if let group = props.syncId, model.xs.kind == .time {
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
      if let brush { commit(brush, model: model) } else { activate(model) }
    case .escape:
      if brush != nil { brush = nil } else { read(nil, model: model) }
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

extension PMRangeModel {
  /// AreaChart's drawing (`areaChartModel`).
  init(area props: PMAreaChartProps, theme: PMTheme, locale: Locale, hidden: Set<String>) {
    let messages = props.messages ?? PMSpecDefault.chartRangeMessages
    let text = PMChartText(locale: locale, messages: messages)
    let painted = PMChartPalette.emphasised(
      PMChartPalette.series(props.series, theme), props.emphasis, theme.chart)
    let visible = painted.filter { !hidden.contains($0.key) }
    let percent = props.variant == .percent
    let all = painted.map(\.key)
    // A negative value cannot stack: it is removed, which means absent.
    let stackable = props.data.map { row in
      row.mapValues { cell in cell.flatMap { ($0.measure ?? 0) < 0 ? nil : $0 } }
    }
    let segments = PMChartStack.segments(
      stackable, visible.map(\.key), percent ? .percent : .stacked)
    // The axis reaches the running total, or 1 in `percent`; with every series
    // hidden it keeps the full stack's total, because the data still exists.
    let stack = visible.isEmpty ? PMChartStack.segments(stackable, all, .stacked) : segments
    let tops: [Double] = percent ? [0, 1] : stack.flatMap { $0.map(\.to) }
    let percentFormat = PMValueFormat(style: .percent)
    let axisFormat = percent ? props.y?.format ?? percentFormat : props.y?.format
    let cell = props.y?.format
    // The twin reads every declared series; a share is of the shown stack, so
    // a hidden series' cells show the value alone.
    let xs = PMChartXValues(
      rows: props.data, x: props.x, kind: props.x.kind(inferredFrom: props.data), text: text)
    let twin = PMChartTwinModel(
      columns: [
        PMChartTwinModel.Column(label: props.x.label ?? PMChartTwinModel.columnName(props.x.key))
      ] + painted.map { PMChartTwinModel.Column(label: $0.label, numeric: true) },
      rows: props.data.enumerated().map { index, row in
        [xs.labels[index]]
          + painted.map { entry in
            guard let value = row.pmMeasure(entry.key) else { return "" }
            let printed = text.number(value, cell)
            guard percent, let at = visible.firstIndex(where: { $0.key == entry.key }) else {
              return printed
            }
            let segment = segments[at][index]
            return "\(printed) · \(text.number(segment.to - segment.from, percentFormat))"
          }
      })
    self.init(
      rows: props.data, x: props.x, kind: xs.kind, fill: .stacked(percent: percent),
      curve: .monotone, markers: false, format: axisFormat, messages: messages, text: text,
      painted: painted, visible: visible, segments: segments,
      domain: PMChartScale.value(tops, zero: true, count: props.y?.ticks ?? 5),
      annotations: (percent ? [] : props.baseline.map { [$0.annotation] } ?? [])
        + (props.annotations ?? []),
      tooltip: props.tooltip, label: props.label, measure: props.y?.label,
      size: props.size ?? .md, theme: theme, cellFormat: cell, twin: twin)
  }
}

// MARK: - States

/// AreaChart's states, from the spec's States table, with the reading shown.
public struct AreaChartStates: PMStates {
  public let member = "AreaChart"

  public init() {}

  private static let weeks = ["W25", "W26", "W27", "W28", "W29", "W30", "W31", "W32"]

  private static let priority = [
    PMChartSeries(key: "urgent", label: "Urgent"), PMChartSeries(key: "high", label: "High"),
    PMChartSeries(key: "normal", label: "Normal"),
  ]

  private static let backlog: [PMChartRow] = weeks.enumerated().map { index, week in
    [
      "week": .text(week), "urgent": .number(Double(12 + (index % 3) * 4)),
      "high": .number(Double(34 + index * 2)),
      "normal": .number(Double(68 - index * 3 + (index % 4) * 6)),
    ]
  }

  private static let channels = [
    PMChartSeries(key: "email", label: "Email"), PMChartSeries(key: "chat", label: "Chat"),
    PMChartSeries(key: "phone", label: "Phone"),
  ]

  /// Two weeks the chat exporter missed: the band drops out and comes back.
  private static let withHole: [PMChartRow] = weeks.enumerated().map { index, week in
    [
      "week": .text(week), "email": .number(Double(210 + index * 8)),
      "chat": index == 3 || index == 4 ? nil : .number(Double(96 + index * 5)),
      "phone": .number(Double(41 + (index % 3) * 6)),
    ]
  }

  private static let eight = ["Email", "Chat", "Phone", "Social", "Portal", "API", "Partner", "Walk-in"]
    .map { PMChartSeries(key: $0.lowercased().filter(\.isLetter), label: $0) }

  private static let eightRows: [PMChartRow] = weeks.enumerated().map { index, week in
    var row: PMChartRow = ["week": .text(week)]
    for (at, entry) in eight.enumerated() {
      row[entry.key] = .number(Double(34 - at * 3 + (index % 4) * 2))
    }
    return row
  }

  private static let days: [PMChartRow] = (0..<30).map { index -> PMChartRow in
    let day = String(format: "2026-07-%02d", index + 1)
    let urgent = Double(8 + (index % 5) * 2)
    let high = Double(22 + (index % 7) * 3)
    let normal = Double(44 - (index % 6) * 4)
    return ["day": .text(day), "urgent": .number(urgent), "high": .number(high), "normal": .number(normal)]
  }

  private static let week = PMChartXAxis(key: "week", label: "Week")

  private static func chart(
    _ data: [PMChartRow], _ label: String, series: [PMChartSeries] = priority,
    x: PMChartXAxis = week, variant: PMAreaChartVariant? = nil, emphasis: String? = nil,
    baseline: PMChartBaseline? = nil, loading: Bool? = nil, tooltip: PMChartTooltip? = nil
  ) -> PMAreaChartProps {
    PMAreaChartProps(
      baseline: baseline, data: data, emphasis: emphasis, label: label, loading: loading,
      series: series, tooltip: tooltip, variant: variant, x: x)
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "backlog composition",
        expect: ["size": "md", "variant": "stacked", "label": "Open backlog by priority"]
      ) { PMAreaChart(props: Self.chart(Self.backlog, "Open backlog by priority")) },
      PMStateEntry("percent", expect: ["variant": "percent"]) {
        PMAreaChart(
          props: Self.chart(
            Self.backlog, "Share of open backlog by priority", variant: .percent))
      },
      PMStateEntry("absent band") {
        PMAreaChart(
          props: Self.chart(Self.withHole, "Ticket volume by channel", series: Self.channels))
      },
      PMStateEntry("emphasis") {
        PMAreaChart(
          props: Self.chart(Self.backlog, "Open backlog, urgent emphasised", emphasis: "urgent"))
      },
      PMStateEntry("max series") {
        PMAreaChart(props: Self.chart(Self.eightRows, "Volume by channel", series: Self.eight))
      },
      PMStateEntry("baseline") {
        PMAreaChart(
          props: Self.chart(
            Self.backlog, "Open backlog against capacity",
            baseline: PMChartBaseline(value: 120, label: "Capacity")))
      },
      PMStateEntry("time scale") {
        PMAreaChart(
          props: Self.chart(
            Self.days, "Open backlog by day",
            x: PMChartXAxis(key: "day", scale: .time, label: "Day")))
      },
      PMStateEntry("empty", expect: ["state": "empty"]) {
        PMAreaChart(props: Self.chart([], "Open backlog", x: PMChartXAxis(key: "week")))
      },
      PMStateEntry("loading", expect: ["state": "loading"]) {
        PMAreaChart(props: Self.chart(Self.backlog, "Open backlog", loading: true))
      },
      PMStateEntry("tooltip off") {
        PMAreaChart(
          props: Self.chart(Self.backlog, "Open backlog, print", tooltip: .off),
          reading: PMChartReading(index: 3))
      },
      PMStateEntry("reading the percent shares", expect: ["variant": "percent"]) {
        PMAreaChart(
          props: Self.chart(Self.backlog, "Share of open backlog by priority", variant: .percent),
          reading: PMChartReading(index: 3))
      },
    ]
  }
}
