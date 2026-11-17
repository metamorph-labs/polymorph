// Histogram (`design/components/histogram.md`): how one sample is spread. It
// takes the raw observations, bins them, and draws the bins as contiguous bars
// over a linear x through Swift Charts' `RectangleMark`, in slot 1, the one paint a
// sample with no series has; no legend, because the panel title names the sample.
//
// The engine's rules, ported because Swift Charts does not bin
// (`packages/engine/src/charts/histogram.ts`, `binSample`): d3's bins, Sturges'
// count (⌈log₂ n⌉ + 1) or the `bins` target, thresholds on clean steps over the
// nice'd extent, every bin half-open but the last, which is closed so the
// maximum lands in it; a non-finite observation is dropped. The count axis is
// always anchored at zero. The bins touch, with no band padding and no
// thickness cap: a 2-point surface gap split across each shared edge is the only
// separator, and the data end is rounded. The ticks sit at bin edges, which
// Swift Charts thins where they would collide. A bin is labelled "a–b", both
// edges in `x.format`, in the readout, the spoken reading and the twin.
//
// The reading position: a tap reads the bin under it and a tap on the bin
// already read calls `onSelect`; arrow keys and VoiceOver's swipes walk the bins.

import Charts
import PolymorphTokens
import SwiftUI

public struct PMHistogram: PMHistogramRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.locale) private var environmentLocale
  @State private var reading: PMChartReading?
  private let props: PMHistogramProps

  public init(props: PMHistogramProps) {
    self.init(props: props, reading: nil)
  }

  /// A chart already read at `reading`: the states fixture's way to show the readout.
  init(props: PMHistogramProps, reading: PMChartReading?) {
    self.props = props
    _reading = State(initialValue: reading)
  }

  public var body: some View {
    let model = HistogramModel(props: props, theme: theme, locale: locale)
    let state = PMChartState(empty: model.bins.isEmpty, loading: props.loading)
    PMChartFrame(
      member: "Histogram", label: props.label, size: props.size ?? .md, state: state,
      attributes: [:], empty: model.messages.empty, twin: model.twin, messages: model.messages
    ) {
      if model.bins.isEmpty {
        PMChartSkeleton()
      } else {
        plot(model)
      }
    } legend: {
      EmptyView()
    }
  }

  private var locale: Locale { props.locale.map { Locale(identifier: $0) } ?? environmentLocale }

  private func plot(_ model: HistogramModel) -> some View {
    let name = props.x?.label ?? model.messages.rangeColumn
    let count = props.y?.label ?? model.messages.countColumn
    let paint = theme.chart.chart1
    let edge = PMChartMetrics.gap / 2
    let last = model.bins.indices.last ?? 0
    return Chart {
      ForEach(Array(model.bins.enumerated()), id: \.offset) { index, bin in
        if bin.count > 0 {
          RectangleMark(
            xStart: .value(name, bin.from), xEnd: .value(name, bin.to),
            yStart: .value(count, 0), yEnd: .value(count, Double(bin.count))
          )
          .foregroundStyle(paint.color)
          .clipShape(
            UnevenRoundedRectangle(
              topLeadingRadius: PMChartMetrics.barEnd, topTrailingRadius: PMChartMetrics.barEnd)
          )
          // The gap is split across each shared edge; the sample's outer edges are not inset.
          .offset(
            xStart: index > 0 ? edge : 0, xEnd: index < last ? -edge : 0)
          .opacity(reading == nil || reading?.index == index ? 1 : PMChartMetrics.lift)
        }
      }
      RuleMark(y: .value(count, 0))
        .lineStyle(StrokeStyle(lineWidth: PMChartMetrics.hairline))
        .foregroundStyle(theme.chart.axis.color)
      if let reading, model.bins.indices.contains(reading.index), model.tooltip.visible {
        let bin = model.bins[reading.index]
        RuleMark(x: .value(name, (bin.from + bin.to) / 2))
          .foregroundStyle(.clear)
          .annotation(
            position: .top, spacing: 0,
            overflowResolution: .init(x: .fit(to: .chart), y: .fit(to: .chart))
          ) {
            PMChartReadout(
              header: model.ranges[reading.index], rows: [model.row(at: reading.index)],
              style: model.tooltip)
          }
      }
    }
    .chartLegend(.hidden)
    .chartYScale(domain: model.domain.range)
    .chartXScale(domain: model.edges[0]...(model.edges.last ?? model.edges[0]))
    .chartYAxis {
      PMChartAxes.value(model.domain, theme.chart.grid) { model.text.number($0, props.y?.format) }
    }
    .chartXAxis {
      PMChartAxes.continuous(model.edges) { model.text.number($0, props.x?.format) }
    }
    .chartOverlay { proxy in
      GeometryReader { overlay in
        Rectangle().fill(.clear).contentShape(.rect)
          .gesture(
            SpatialTapGesture().onEnded { tap in
              guard let frame = proxy.plotFrame,
                let at = proxy.value(atX: tap.location.x - overlay[frame].origin.x, as: Double.self),
                let index = model.bins.lastIndex(where: { $0.from <= at }) ?? model.bins.indices.first
              else { return }
              tapped(index, model: model)
            })
      }
    }
    .pmChartPlot(
      label: props.label, spoken: spoken(model), selectable: props.onSelect != nil,
      interactive: true, descriptor: model.descriptor
    ) { key in handle(key, model: model) }
  }

  // MARK: Reading

  private func spoken(_ model: HistogramModel) -> String {
    guard let reading, model.bins.indices.contains(reading.index) else {
      return model.text.spoken(model.summary, selectable: props.onSelect != nil)
    }
    return "\(model.ranges[reading.index]): \(model.row(at: reading.index).value)"
  }

  private func tapped(_ index: Int, model: HistogramModel) {
    if reading?.index == index, props.onSelect != nil {
      activate(model)
    } else {
      reading = PMChartReading(index: index)
    }
  }

  private func handle(_ key: PMChartKey, model: HistogramModel) {
    switch key {
    case .next, .extendNext, .up: reading = .step(reading, by: 1, count: model.bins.count)
    case .previous, .extendPrevious, .down: reading = .step(reading, by: -1, count: model.bins.count)
    case .activate: activate(model)
    case .escape: reading = nil
    }
  }

  private func activate(_ model: HistogramModel) {
    guard let onSelect = props.onSelect, let reading, model.bins.indices.contains(reading.index)
    else { return }
    let bin = model.bins[reading.index]
    onSelect(
      PMHistogramSelection(
        bin: PMHistogramBin(from: bin.from, to: bin.to, count: Double(bin.count))))
  }
}

/// The histogram's drawing (`histogramModel`).
@MainActor
private struct HistogramModel {
  let bins: [(from: Double, to: Double, count: Int)]
  /// The bins' edges, one more than the bins: the x axis's ticks.
  let edges: [Double]
  /// Each bin as "a–b", both edges in `x.format`.
  let ranges: [String]
  let domain: PMChartDomain
  let messages: PMChartMessages
  let text: PMChartText
  let tooltip: PMChartTooltipStyle
  let summary: String
  let twin: PMChartTwinModel
  let countLabel: String
  let yFormat: PMValueFormat?
  let label: String
  let rangeLabel: String
  let paint: PMDynamicColor

  init(props: PMHistogramProps, theme: PMTheme, locale: Locale) {
    let messages = props.messages ?? PMSpecDefault.chartMessages
    let text = PMChartText(locale: locale, messages: messages)
    let bins = PMChartScale.bins(props.data, target: props.bins)
    let ranges = bins.map {
      "\(text.number($0.from, props.x?.format))–\(text.number($0.to, props.x?.format))"
    }
    let countLabel = props.y?.label ?? messages.countColumn
    let rangeLabel = props.x?.label ?? messages.rangeColumn
    self.bins = bins
    self.edges = bins.isEmpty ? [0] : [bins[0].from] + bins.map(\.to)
    self.ranges = ranges
    self.domain = PMChartScale.value(
      bins.map { Double($0.count) }, zero: true, count: props.y?.ticks ?? 5)
    self.messages = messages
    self.text = text
    self.tooltip = PMChartTooltipStyle(props.tooltip)
    // A sample has observations but no series, so the summary names none.
    self.summary = messages.summary(
      PMChartSummaryFacts(label: props.label, series: [], points: Double(props.data.count)))
    self.twin = PMChartTwinModel(
      columns: [
        PMChartTwinModel.Column(label: rangeLabel),
        PMChartTwinModel.Column(label: countLabel, numeric: true),
      ],
      rows: zip(ranges, bins).map { [$0, text.number(Double($1.count), props.y?.format)] })
    self.countLabel = countLabel
    self.yFormat = props.y?.format
    self.label = props.label
    self.rangeLabel = rangeLabel
    self.paint = theme.chart.chart1
  }

  func row(at index: Int) -> PMChartReadoutRow {
    PMChartReadoutRow(
      key: "count", label: countLabel, value: text.number(Double(bins[index].count), yFormat),
      paint: paint)
  }

  var descriptor: PMChartDescriptor? {
    guard !bins.isEmpty else { return nil }
    return PMChartDescriptor(
      title: label, summary: summary, xTitle: rangeLabel, bands: ranges, xRange: 0...1,
      xFormat: nil, yTitle: countLabel, yRange: domain.range, yFormat: yFormat,
      locale: text.locale,
      series: [
        PMChartDescriptor.Series(
          name: countLabel, continuous: false,
          points: bins.enumerated().map { (band: ranges[$0], x: Double($0), y: Double($1.count)) })
      ])
  }
}

// MARK: - States

/// Histogram's states, from the spec's States table, with the reading shown.
public struct HistogramStates: PMStates {
  public let member = "Histogram"

  public init() {}

  /// JavaScript's `Math.round`, half up, which the web's sample is built with.
  private static func round(_ value: Double) -> Double { (value + 0.5).rounded(.down) }

  /// One week's first responses: 200 under ten minutes, a shoulder of 40 to 45.
  private static let firstResponse: [Double] = {
    let bulk: [Double] = (0..<200).map { index -> Double in
      let tenths: Double = Double((index * 7919) % 1000) / 10
      return round(tenths) / 10
    }
    let shoulder: [Double] = (0..<40).map { index -> Double in
      let tenths: Double = Double((index * 104_729) % 3500) / 10
      return 10 + round(tenths) / 10
    }
    return bulk + shoulder
  }()

  /// Resolution hours: most under four, a tail thinning toward 72.
  private static let resolutionHours: [Double] = {
    let bulk: [Double] = (0..<150).map { index -> Double in
      let tenths: Double = Double((index * 31) % 400) / 10
      return round(tenths) / 10
    }
    let tail: [Double] = (0..<30).map { index -> Double in
      let share: Double = Double(index) / 30
      return 4 + round(share * share * 680) / 10
    }
    return bulk + tail
  }()

  private static let few: [Double] = [
    2.1, 3.4, 3.8, 4.2, 5.0, 5.5, 6.1, 6.8, 7.2, 8.0, 9.4, 11.2, 12.8, 14.5,
  ]

  private static let orderValues: [Double] = (0..<120).map {
    Double(($0 * 53) % 140 + ($0 * 17) % 23)
  }

  private static let minutes = PMHistogramXAxis(label: "Minutes to first response")

  public var entries: [PMStateEntry] {
    let week = PMHistogramProps(
      data: Self.firstResponse, label: "First response time, this week", x: Self.minutes)
    return [
      PMStateEntry(
        "first-response minutes", expect: ["size": "md", "label": "First response time, this week"]
      ) { PMHistogram(props: week) },
      PMStateEntry("skewed") {
        PMHistogram(
          props: PMHistogramProps(
            data: Self.resolutionHours, label: "Resolution time, this month",
            x: PMHistogramXAxis(label: "Hours to resolution")))
      },
      PMStateEntry("few points") {
        PMHistogram(
          props: PMHistogramProps(
            data: Self.few, label: "First responses, new queue",
            x: PMHistogramXAxis(label: "Minutes")))
      },
      PMStateEntry("bins override") {
        PMHistogram(
          props: PMHistogramProps(
            bins: 20, data: Self.firstResponse, label: "First response time, the finer read",
            x: Self.minutes))
      },
      PMStateEntry("format") {
        PMHistogram(
          props: PMHistogramProps(
            data: Self.orderValues, label: "Order values",
            x: PMHistogramXAxis(
              label: "Order value", format: PMValueFormat(style: .currency, currency: "USD"))))
      },
      PMStateEntry("empty", expect: ["state": "empty"]) {
        PMHistogram(props: PMHistogramProps(data: [], label: "First response time, this week"))
      },
      PMStateEntry("loading", expect: ["state": "loading"]) {
        PMHistogram(
          props: PMHistogramProps(
            data: Self.firstResponse, label: "First response time, this week", loading: true))
      },
      PMStateEntry("tooltip off") {
        PMHistogram(
          props: PMHistogramProps(
            data: Self.firstResponse, label: "First response time, print", tooltip: .off),
          reading: PMChartReading(index: 2))
      },
      PMStateEntry("reading a bin") {
        PMHistogram(props: week, reading: PMChartReading(index: 2))
      },
    ]
  }
}
