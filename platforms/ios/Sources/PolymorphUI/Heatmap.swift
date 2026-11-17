// Heatmap (`design/components/heatmap.md`): where values concentrate, as a
// grid of cells on two band axes through Swift Charts' `RectangleMark`, each
// cell coloured by its value's step. The 2-point surface gaps form the grid,
// so there are no gridlines; a scale legend replaces the series legend.
//
// The engine's rules, ported because Swift Charts interpolates colour where
// the system quantises (`packages/engine/src/charts/grid.ts`, `scales.ts`):
// values quantise to the seven emitted sequential steps in equal-width bins
// over the extent (`binOf`), because a colour between two steps is one no law
// has measured; signed data turns diverging by itself, over a symmetric range
// `[-A, +A]`, three bins a side around the mid, which means exactly zero
// (`signedBinOf`). The columns and rows are the bands in first-seen order; a
// combination the data lacks and a `null` value both show the surface and
// read as "no data", never as a zero. Neither axis name is drawn: `y.label`
// heads the twin's first column. The twin is the same grid, a row per y and a
// column per x.
//
// The reading position: a tap reads the cell under it and a tap on the cell
// already read calls `onSelect` (an absent cell reports nothing). Left and
// right walk x, up and down walk y; VoiceOver's swipes walk the cells in
// reading order. The read cell takes a 2-point ring of the surface inside a
// 1-point outline in `chart.axis`.

import Charts
import PolymorphTokens
import SwiftUI

public struct PMHeatmap: PMHeatmapRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.locale) private var environmentLocale
  @State private var reading: PMChartReading?
  private let props: PMHeatmapProps

  public init(props: PMHeatmapProps) {
    self.init(props: props, reading: nil)
  }

  /// A chart already read at `reading` (`index` the column, `series` the row):
  /// the states fixture's way to show the readout.
  init(props: PMHeatmapProps, reading: PMChartReading?) {
    self.props = props
    _reading = State(initialValue: reading)
  }

  public var body: some View {
    let model = HeatmapModel(props: props, theme: theme, locale: locale)
    let state = PMChartState(empty: props.data.isEmpty, loading: props.loading)
    PMChartFrame(
      member: "Heatmap", label: props.label, size: props.size ?? .md, state: state,
      attributes: model.signed ? ["scale": "diverging"] : ["scale": "sequential"],
      empty: model.messages.empty, twin: model.twin, messages: model.messages
    ) {
      if props.data.isEmpty {
        PMChartSkeleton()
      } else {
        plot(model)
      }
    } legend: {
      if !props.data.isEmpty {
        HeatmapScale(model: model)
      }
    }
  }

  private var locale: Locale { props.locale.map { Locale(identifier: $0) } ?? environmentLocale }

  private func plot(_ model: HeatmapModel) -> some View {
    let xName = props.x.label ?? props.x.key
    let yName = props.y.label ?? props.y.key
    let half = PMChartMetrics.gap / 2
    return Chart {
      ForEach(model.cells, id: \.id) { cell in
        if let paint = cell.paint {
          let active = reading?.index == cell.column && reading?.series == cell.row
          if active {
            // The read cell: a 1-point outline in `chart.axis` around a
            // 2-point ring of the surface.
            RectangleMark(
              x: .value(xName, model.columns[cell.column]), y: .value(yName, model.rows[cell.row]),
              width: .ratio(1), height: .ratio(1)
            )
            .foregroundStyle(theme.chart.axis.color)
            .cornerRadius(PMChartMetrics.barEnd)
            RectangleMark(
              x: .value(xName, model.columns[cell.column]), y: .value(yName, model.rows[cell.row]),
              width: .ratio(1), height: .ratio(1)
            )
            .foregroundStyle(theme.colors.bgSurface.color)
            .cornerRadius(PMChartMetrics.barEnd)
            .offset(
              xStart: PMChartMetrics.hairline, xEnd: -PMChartMetrics.hairline,
              yStart: PMChartMetrics.hairline, yEnd: -PMChartMetrics.hairline)
          }
          RectangleMark(
            x: .value(xName, model.columns[cell.column]), y: .value(yName, model.rows[cell.row]),
            width: .ratio(1), height: .ratio(1)
          )
          .foregroundStyle(paint.color)
          .cornerRadius(PMChartMetrics.barEnd)
          .offset(
            xStart: active ? PMChartMetrics.ringActive : half,
            xEnd: active ? -PMChartMetrics.ringActive : -half,
            yStart: active ? PMChartMetrics.ringActive : half,
            yEnd: active ? -PMChartMetrics.ringActive : -half)
        }
      }
      if let reading, let cell = model.cell(column: reading.index, row: reading.series),
        model.tooltip.visible
      {
        RectangleMark(
          x: .value(xName, model.columns[cell.column]), y: .value(yName, model.rows[cell.row]),
          width: .ratio(1), height: .ratio(1)
        )
        .foregroundStyle(.clear)
        .annotation(
          position: .top, spacing: 0,
          overflowResolution: .init(x: .fit(to: .chart), y: .fit(to: .chart))
        ) {
          PMChartReadout(
            header: model.columnLabels[cell.column], rows: [model.row(cell)], style: model.tooltip)
        }
      }
    }
    .chartLegend(.hidden)
    .chartXScale(domain: model.columns)
    .chartYScale(domain: model.rows)
    .chartXAxis {
      PMChartAxes.band(model.columns) { column in
        model.columns.firstIndex(of: column).map { model.columnLabels[$0] } ?? column
      }
    }
    .chartYAxis {
      PMChartAxes.band(model.rows, vertical: false, gutter: true) { $0 }
    }
    .chartOverlay { proxy in
      GeometryReader { overlay in
        Rectangle().fill(.clear).contentShape(.rect)
          .gesture(
            SpatialTapGesture().onEnded { tap in
              guard let frame = proxy.plotFrame else { return }
              let origin = overlay[frame].origin
              guard
                let column = proxy.value(atX: tap.location.x - origin.x, as: String.self),
                let row = proxy.value(atY: tap.location.y - origin.y, as: String.self),
                let x = model.columns.firstIndex(of: column), let y = model.rows.firstIndex(of: row)
              else { return }
              tapped(PMChartReading(index: x, series: y), model: model)
            })
      }
    }
    .pmChartPlot(
      label: props.label, spoken: spoken(model), selectable: props.onSelect != nil,
      interactive: true, descriptor: model.descriptor
    ) { key in handle(key, model: model) }
  }

  // MARK: Reading

  private func spoken(_ model: HeatmapModel) -> String {
    guard let reading, let cell = model.cell(column: reading.index, row: reading.series) else {
      return model.text.spoken(model.summary, selectable: props.onSelect != nil)
    }
    return "\(model.columnLabels[cell.column]), \(model.rows[cell.row]): \(model.row(cell).value)"
  }

  private func tapped(_ at: PMChartReading, model: HeatmapModel) {
    if reading == at, props.onSelect != nil {
      activate(model)
    } else {
      reading = at
    }
  }

  private func handle(_ key: PMChartKey, model: HeatmapModel) {
    let columns = model.columns.count
    let rows = model.rows.count
    guard columns > 0, rows > 0 else { return }
    let at = reading ?? PMChartReading(index: -1, series: 0)
    switch key {
    case .next, .extendNext:
      // In reading order: along the row, then onto the next row.
      if at.index + 1 < columns {
        reading = PMChartReading(index: at.index + 1, series: at.series)
      } else if at.series + 1 < rows {
        reading = PMChartReading(index: 0, series: at.series + 1)
      } else {
        reading = PMChartReading(index: columns - 1, series: rows - 1)
      }
    case .previous, .extendPrevious:
      if reading == nil {
        reading = PMChartReading(index: columns - 1, series: rows - 1)
      } else if at.index > 0 {
        reading = PMChartReading(index: at.index - 1, series: at.series)
      } else if at.series > 0 {
        reading = PMChartReading(index: columns - 1, series: at.series - 1)
      }
    case .down:
      reading = PMChartReading(index: max(0, at.index), series: min(rows - 1, at.series + (reading == nil ? 0 : 1)))
    case .up:
      reading = PMChartReading(index: max(0, at.index), series: max(0, at.series - 1))
    case .activate: activate(model)
    case .escape: reading = nil
    }
  }

  private func activate(_ model: HeatmapModel) {
    guard let onSelect = props.onSelect, let reading,
      let cell = model.cell(column: reading.index, row: reading.series), let value = cell.value
    else { return }
    onSelect(
      PMHeatmapSelection(
        x: .text(model.columns[cell.column]), y: .text(model.rows[cell.row]), value: value))
  }
}

/// The scale legend (`chart-scale-legend.module.css`): the seven sequential
/// swatches between the extent's bounds, or, for signed data, the two arms
/// and the mid in one band with min, zero and max beneath.
private struct HeatmapScale: View {
  @Environment(\.pmTheme) private var theme
  let model: HeatmapModel

  var body: some View {
    let space = theme.defaultDensity.space
    let swatches = HStack(spacing: PMChartMetrics.gap) {
      ForEach(model.scaleSteps.indices, id: \.self) { index in
        RoundedRectangle(cornerRadius: theme.radius.sm)
          .fill(model.scaleSteps[index].color)
          .frame(width: space.s4, height: space.s3)
      }
    }
    Group {
      if model.signed {
        VStack(alignment: .leading, spacing: space.s1) {
          swatches
          HStack(spacing: space.s2) {
            PMChartTick(model.bounds[0])
            Spacer(minLength: 0)
            PMChartTick(model.bounds[1])
            Spacer(minLength: 0)
            PMChartTick(model.bounds[2])
          }
        }
        .fixedSize()
      } else {
        HStack(spacing: space.s2) {
          PMChartTick(model.bounds[0])
          swatches
          PMChartTick(model.bounds[1])
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityHidden(true)
  }
}

/// The heatmap's drawing (`heatmapModel`, `gridGeometry`).
@MainActor
private struct HeatmapModel {
  struct Cell {
    let column: Int
    let row: Int
    let value: Double?
    /// The step or arm's colour; `nil` for an absent cell, which shows the surface.
    let paint: PMDynamicColor?

    var id: Int { row * 10_000 + column }
  }

  let columns: [String]
  let columnLabels: [String]
  let rows: [String]
  let cells: [Cell]
  let signed: Bool
  let scaleSteps: [PMDynamicColor]
  /// min and max, or min, zero and max when signed.
  let bounds: [String]
  let messages: PMChartMessages
  let text: PMChartText
  let tooltip: PMChartTooltipStyle
  let summary: String
  let twin: PMChartTwinModel
  let label: String
  let valueFormat: PMValueFormat?
  let other: PMDynamicColor

  init(props: PMHeatmapProps, theme: PMTheme, locale: Locale) {
    let messages = props.messages ?? PMSpecDefault.chartGridMessages
    let text = PMChartText(locale: locale, messages: messages)
    let data = props.data
    let columns = PMChartBands.of(data, props.x.key)
    let rows = PMChartBands.of(data, props.y.key)
    var values: [String: Double?] = [:]
    for row in data {
      let key = "\(row.pmCell(props.x.key)?.written ?? "")\u{0}\(row.pmCell(props.y.key)?.written ?? "")"
      values[key] = row.pmMeasure(props.value.key)
    }
    let measures = data.compactMap { $0.pmMeasure(props.value.key) }
    let low = measures.min() ?? 0
    let high = measures.max() ?? 1
    let signed = low < 0
    let amplitude = max(abs(low), abs(high))
    let chart = theme.chart
    var cells: [Cell] = []
    for (y, rowName) in rows.enumerated() {
      for (x, columnName) in columns.enumerated() {
        let value = values["\(columnName)\u{0}\(rowName)"] ?? nil
        let paint = value.map { value in
          signed
            ? PMChartPalette.diverging(PMChartScale.signedBin(value, amplitude: amplitude), chart)
            : PMChartPalette.sequential(PMChartScale.bin(value, low, high, count: 7) + 1, chart)
        }
        cells.append(Cell(column: x, row: y, value: value, paint: paint))
      }
    }
    let format = props.value.format
    self.columns = columns
    self.columnLabels = columns.map { text.value(.text($0), props.x.format) }
    self.rows = rows
    self.cells = cells
    self.signed = signed
    self.scaleSteps =
      signed
      ? (-3...3).map { PMChartPalette.diverging($0, chart) }
      : (1...7).map { PMChartPalette.sequential($0, chart) }
    self.bounds =
      signed
      ? [text.number(-amplitude, format), text.number(0, format), text.number(amplitude, format)]
      : [text.number(low, format), text.number(high, format)]
    self.messages = messages
    self.text = text
    self.tooltip = PMChartTooltipStyle(props.tooltip)
    self.summary = messages.heatmapSummary(
      PMHeatmapSummaryFacts(
        label: props.label,
        grid: data.isEmpty
          ? nil : PMHeatmapGrid(rows: Double(rows.count), columns: Double(columns.count))))
    let labels = self.columnLabels
    self.twin = PMChartTwinModel(
      columns: [PMChartTwinModel.Column(label: props.y.label ?? "")]
        + labels.map { PMChartTwinModel.Column(label: $0, numeric: true) },
      rows: rows.enumerated().map { y, rowName in
        [rowName]
          + columns.indices.map { x in
            cells[y * columns.count + x].value.map { text.number($0, format) } ?? ""
          }
      })
    self.label = props.label
    self.valueFormat = format
    self.other = chart.other
  }

  func cell(column: Int, row: Int) -> Cell? {
    guard columns.indices.contains(column), rows.indices.contains(row) else { return nil }
    return cells[row * columns.count + column]
  }

  /// The readout's row for a cell: its row's name and its value, or "no data".
  func row(_ cell: Cell) -> PMChartReadoutRow {
    PMChartReadoutRow(
      key: "\(cell.id)", label: rows[cell.row],
      value: cell.value.map { text.number($0, valueFormat) } ?? messages.noData,
      paint: cell.paint ?? other)
  }

  var descriptor: PMChartDescriptor? {
    guard !cells.isEmpty else { return nil }
    let values = cells.compactMap(\.value)
    return PMChartDescriptor(
      title: label, summary: summary, xTitle: label, bands: columnLabels, xRange: 0...1,
      xFormat: nil, yTitle: label,
      yRange: (values.min() ?? 0)...max(values.max() ?? 1, values.min() ?? 0),
      yFormat: valueFormat, locale: text.locale,
      series: rows.enumerated().map { y, name in
        PMChartDescriptor.Series(
          name: name, continuous: false,
          points: columns.indices.compactMap { x in
            cells[y * columns.count + x].value.map { (band: columnLabels[x], x: Double(x), y: $0) }
          })
      })
  }
}

// MARK: - States

/// Heatmap's states, from the spec's States table, with the reading shown.
public struct HeatmapStates: PMStates {
  public let member = "Heatmap"

  public init() {}

  private static let days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  private static let bands = ["00–04", "04–08", "08–12", "12–16", "16–20", "20–24"]

  /// Relay's support week: quiet overnight, a Tue–Thu surge at midday.
  private static let volume: [String: [Double]] = [
    "Mon": [1, 6, 34, 38, 21, 4], "Tue": [2, 8, 51, 58, 26, 5], "Wed": [1, 7, 49, 55, 24, 6],
    "Thu": [2, 9, 46, 52, 23, 4], "Fri": [1, 5, 31, 29, 17, 3], "Sat": [0, 2, 9, 11, 7, 2],
    "Sun": [0, 1, 6, 8, 5, 1],
  ]

  private static let week: [PMChartRow] = days.flatMap { day in
    bands.enumerated().map { index, band -> PMChartRow in
      ["band": .text(band), "day": .text(day), "tickets": .number(volume[day]?[index] ?? 0)]
    }
  }

  private static let atScale: [PMChartRow] = week.map { row in
    var row = row
    row["tickets"] = .number((row.pmMeasure("tickets") ?? 0) * 214)
    return row
  }

  /// A new product's first fortnight: most cells absent, which must look like surface.
  private static let sparse: [PMChartRow] = week.map { row in
    let live: Set<String> = ["Wed 08–12", "Wed 12–16", "Thu 12–16", "Fri 08–12"]
    let at = "\(row.pmCell("day")?.written ?? "") \(row.pmCell("band")?.written ?? "")"
    var row = row
    if !live.contains(at) { row["tickets"] = .some(nil) }
    return row
  }

  private static let channels = ["Email", "Chat", "Phone", "Social"]

  private static let fortnight: [PMChartRow] = channels.enumerated().flatMap { row, channel in
    (0..<14).map { index -> PMChartRow in
      let weekend = index % 7 == 5 || index % 7 == 6
      let base = [64.0, 38, 21, 9][row]
      let scale = 1 + Double((index * 7) % 5) / 12
      let tickets = (base * (weekend ? 0.3 : 1) * scale + 0.5).rounded(.down)
      let date = String(format: "2026-07-%02d", index + 1)
      return ["date": .text(date), "channel": .text(channel), "tickets": .number(tickets)]
    }
  }

  private static let shifts = ["Morning", "Midday", "Evening", "Night"]
  private static let deltas: [(String, [Double])] = [
    ("Mon", [-6, -2, 1, 2]), ("Tue", [-4, 3, 5, 1]), ("Wed", [-1, 8, 0, -2]),
    ("Thu", [2, 6, 4, -3]), ("Fri", [-5, -3, 2, 3]),
  ]

  private static let staffing: [PMChartRow] = deltas.flatMap { day, values in
    shifts.enumerated().map { index, shift -> PMChartRow in
      ["shift": .text(shift), "day": .text(day), "delta": .number(values[index])]
    }
  }

  private static func grid(
    _ data: [PMChartRow], _ label: String, x: PMChartXAxis = PMChartXAxis(key: "band", label: "Hour"),
    y: PMHeatmapYAxis = PMHeatmapYAxis(key: "day", label: "Day"),
    value: PMHeatmapValue = PMHeatmapValue(key: "tickets"), loading: Bool? = nil,
    tooltip: PMChartTooltip? = nil
  ) -> PMHeatmapProps {
    PMHeatmapProps(
      data: data, label: label, loading: loading, tooltip: tooltip, value: value, x: x, y: y)
  }

  public var entries: [PMStateEntry] {
    let week = Self.grid(Self.week, "Ticket volume by weekday and hour")
    return [
      PMStateEntry(
        "the support week",
        expect: ["size": "md", "scale": "sequential", "label": "Ticket volume by weekday and hour"]
      ) { PMHeatmap(props: week) },
      PMStateEntry("compact format") {
        PMHeatmap(
          props: Self.grid(
            Self.atScale, "Session volume by weekday and hour",
            value: PMHeatmapValue(key: "tickets", format: PMValueFormat(style: .compact))))
      },
      PMStateEntry("sparse") {
        PMHeatmap(props: Self.grid(Self.sparse, "Ticket volume in the first fortnight"))
      },
      PMStateEntry("time-labeled x") {
        PMHeatmap(
          props: Self.grid(
            Self.fortnight, "Ticket volume by channel and date",
            x: PMChartXAxis(
              key: "date", label: "Date", format: PMValueFormat(style: .date, granularity: .day)),
            y: PMHeatmapYAxis(key: "channel", label: "Channel")))
      },
      PMStateEntry("empty", expect: ["state": "empty"]) {
        PMHeatmap(props: Self.grid([], "Ticket volume by weekday and hour"))
      },
      PMStateEntry("loading", expect: ["state": "loading"]) {
        PMHeatmap(props: Self.grid(Self.week, "Ticket volume by weekday and hour", loading: true))
      },
      PMStateEntry("tooltip off") {
        PMHeatmap(
          props: Self.grid(Self.week, "Ticket volume by weekday and hour, print", tooltip: .off),
          reading: PMChartReading(index: 3, series: 1))
      },
      PMStateEntry("diverging", expect: ["scale": "diverging"]) {
        PMHeatmap(
          props: Self.grid(
            Self.staffing, "Staffing delta vs plan by weekday and shift",
            x: PMChartXAxis(key: "shift", label: "Shift"), value: PMHeatmapValue(key: "delta")))
      },
      PMStateEntry("reading a cell") {
        PMHeatmap(props: week, reading: PMChartReading(index: 3, series: 1))
      },
    ]
  }
}
