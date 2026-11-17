// DonutChart (`design/components/donut-chart.md`): roughly how a whole
// splits, as a ring of at most six segments through Swift Charts'
// `SectorMark`, drawn clockwise from 12 o'clock in the given order, with the
// app's pre-formatted total in the hole. Never a solid pie: the ring is
// `space-6` thick, the bar's cap bent round, with a 2-point surface gap at each
// radial edge and the data ends' 4-point rounding. No labels on the segments:
// the legend, the readout and the twin carry the names and numbers.
//
// The engine's rules, ported where Swift Charts decides otherwise
// (`packages/engine/src/charts/donut-chart.ts`): a segment's colour follows its
// slot (declaration order, an explicit slot reserving its seat); the shares
// divide by the total of the positive values; a zero draws no arc and a
// negative value draws none either, while both stay in the legend and the
// twin; the readout and the twin show each segment's share beside its value,
// because an angle is the hardest quantity to read.
//
// The reading position: a tap reads the segment under it and a tap on the
// segment already read calls `onSelect`; arrow keys and VoiceOver's swipes walk
// the segments clockwise. The readout opens just outside the ring on the read
// segment's bearing, never in the hole, which shows the total; the other
// segments ease to 0.8.

import Charts
import PolymorphTokens
import SwiftUI

public struct PMDonutChart: PMDonutChartRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.locale) private var environmentLocale
  @State private var reading: PMChartReading?
  private let props: PMDonutChartProps

  public init(props: PMDonutChartProps) {
    self.init(props: props, reading: nil)
  }

  /// A chart already read at `reading`: the states fixture's way to show the readout.
  init(props: PMDonutChartProps, reading: PMChartReading?) {
    self.props = props
    _reading = State(initialValue: reading)
  }

  public var body: some View {
    let model = DonutModel(props: props, theme: theme, locale: locale)
    let state = PMChartState(empty: props.segments.isEmpty, loading: props.loading)
    PMChartFrame(
      member: "DonutChart", label: props.label, size: props.size ?? .md, state: state,
      attributes: [:], empty: model.messages.empty, twin: model.twin, messages: model.messages
    ) {
      if props.segments.isEmpty {
        PMChartSkeleton()
      } else {
        plot(model)
      }
    } legend: {
      if model.painted.count >= 2 {
        PMChartLegend(series: model.painted, shape: .rect)
      }
    }
  }

  private var locale: Locale { props.locale.map { Locale(identifier: $0) } ?? environmentLocale }

  private func plot(_ model: DonutModel) -> some View {
    let space = theme.defaultDensity.space
    return Chart {
      ForEach(Array(props.segments.enumerated()), id: \.offset) { index, segment in
        if model.share(index) > 0 {
          SectorMark(
            angle: .value(segment.label, segment.value), innerRadius: .inset(space.s6),
            angularInset: PMChartMetrics.gap / 2
          )
          .cornerRadius(PMChartMetrics.barEnd)
          .foregroundStyle(model.painted[index].paint.color)
          .opacity(reading == nil || reading?.index == index ? 1 : PMChartMetrics.lift)
        }
      }
    }
    .chartLegend(.hidden)
    .chartBackground { proxy in
      GeometryReader { geometry in
        if let frame = proxy.plotFrame, let center = props.center {
          let rect = geometry[frame]
          // The hole: the ring's inner diameter, less a step of air.
          let hole = min(rect.width, rect.height) - space.s6 - space.s6 - space.s4
          VStack(spacing: space.s1) {
            Text(center.value)
              .pmTextStyle(theme.text.text2xl)
              .foregroundStyle(theme.colors.textPrimary.color)
              .pmTabularFigures(theme.numeric.tabular)
            if let label = center.label {
              Text(label)
                .pmTextStyle(theme.text.xs)
                .foregroundStyle(theme.colors.textMuted.color)
            }
          }
          .multilineTextAlignment(.center)
          .frame(maxWidth: max(0, hole))
          .position(x: rect.midX, y: rect.midY)
          .accessibilityHidden(true)
        }
      }
    }
    .chartOverlay { proxy in
      GeometryReader { geometry in
        if let frame = proxy.plotFrame {
          let rect = geometry[frame]
          ZStack {
            Rectangle().fill(.clear).contentShape(.rect)
              .gesture(
                SpatialTapGesture().onEnded { tap in
                  if let index = model.segment(at: tap.location, in: rect) {
                    tapped(index, model: model)
                  }
                })
            if let reading, model.tooltip.visible, props.segments.indices.contains(reading.index) {
              let at = model.readoutPosition(reading.index, in: rect, gap: space.s3)
              // Opened from a point outside the ring, away from it.
              PMChartAnchor(point: at, opensLeading: at.x < rect.midX) {
                PMChartReadout(header: nil, rows: [model.row(reading.index)], style: model.tooltip)
              }
            }
          }
        }
      }
    }
    .pmChartPlot(
      label: props.label, spoken: spoken(model), selectable: props.onSelect != nil,
      interactive: true, descriptor: model.descriptor
    ) { key in handle(key, model: model) }
  }

  // MARK: Reading

  private func spoken(_ model: DonutModel) -> String {
    guard let reading, props.segments.indices.contains(reading.index) else {
      return model.text.spoken(model.summary, selectable: props.onSelect != nil)
    }
    let row = model.row(reading.index)
    return "\(row.label): \(model.value(reading.index)), \(model.shareText(reading.index))"
  }

  private func tapped(_ index: Int, model: DonutModel) {
    if reading?.index == index, props.onSelect != nil {
      activate(model)
    } else {
      reading = PMChartReading(index: index)
    }
  }

  private func handle(_ key: PMChartKey, model: DonutModel) {
    let count = props.segments.count
    switch key {
    case .next, .extendNext, .down: reading = .step(reading, by: 1, count: count)
    case .previous, .extendPrevious, .up: reading = .step(reading, by: -1, count: count)
    case .activate: activate(model)
    case .escape: reading = nil
    }
  }

  private func activate(_ model: DonutModel) {
    guard let onSelect = props.onSelect, let reading, props.segments.indices.contains(reading.index)
    else { return }
    let segment = props.segments[reading.index]
    onSelect(
      PMDonutSelection(
        key: segment.key, label: segment.label, value: segment.value,
        share: model.share(reading.index)))
  }
}

/// The donut's drawing (`donutChartModel`).
@MainActor
private struct DonutModel {
  let segments: [PMDonutSegment]
  let painted: [PMChartPaint]
  /// The total of the positive finite values, which every share divides by.
  let total: Double
  let format: PMValueFormat?
  let messages: PMChartMessages
  let text: PMChartText
  let tooltip: PMChartTooltipStyle
  let summary: String
  let twin: PMChartTwinModel
  let label: String

  init(props: PMDonutChartProps, theme: PMTheme, locale: Locale) {
    let messages = props.messages ?? PMSpecDefault.chartMessages
    let text = PMChartText(locale: locale, messages: messages)
    let total = props.segments.map(\.value).filter { $0.isFinite && $0 > 0 }.reduce(0, +)
    let share: (Double) -> Double = { value in
      value.isFinite && value > 0 && total > 0 ? value / total : 0
    }
    let percent = PMValueFormat(style: .percent)
    self.segments = props.segments
    self.painted = PMChartPalette.series(
      props.segments.map { PMChartSeries(key: $0.key, label: $0.label, slot: $0.slot) }, theme)
    self.total = total
    self.format = props.format
    self.messages = messages
    self.text = text
    self.tooltip = PMChartTooltipStyle(props.tooltip)
    self.summary = messages.donutSummary(
      PMDonutSummaryFacts(label: props.label, segments: Double(props.segments.count)))
    self.twin = PMChartTwinModel(
      columns: [
        PMChartTwinModel.Column(label: messages.segmentColumn),
        PMChartTwinModel.Column(label: messages.valueColumn, numeric: true),
        PMChartTwinModel.Column(label: messages.shareColumn, numeric: true),
      ],
      rows: props.segments.map { segment in
        [segment.label, text.number(segment.value, props.format), text.number(share(segment.value), percent)]
      })
    self.label = props.label
  }

  func share(_ index: Int) -> Double {
    let value = segments[index].value
    return value.isFinite && value > 0 && total > 0 ? value / total : 0
  }

  func value(_ index: Int) -> String {
    segments[index].value.isFinite ? text.number(segments[index].value, format) : "—"
  }

  func shareText(_ index: Int) -> String {
    text.number(share(index), PMValueFormat(style: .percent))
  }

  func row(_ index: Int) -> PMChartReadoutRow {
    PMChartReadoutRow(
      key: segments[index].key, label: segments[index].label,
      value: "\(value(index)) · \(shareText(index))", paint: painted[index].paint)
  }

  /// A segment's bearing at its middle, in radians clockwise from 12 o'clock.
  func bearing(_ index: Int) -> Double {
    let before = segments.indices.prefix(index).map(share).reduce(0, +)
    return (before + share(index) / 2) * Double.pi * 2
  }

  /// The segment a point falls in, by its bearing from the ring's centre.
  func segment(at point: CGPoint, in rect: CGRect) -> Int? {
    let dx = Double(point.x - rect.midX)
    let dy = Double(point.y - rect.midY)
    var angle = atan2(dx, -dy)
    if angle < 0 { angle += Double.pi * 2 }
    var start = 0.0
    for index in segments.indices {
      let end = start + share(index) * Double.pi * 2
      if share(index) > 0, angle >= start, angle < end { return index }
      start = end
    }
    return nil
  }

  /// Where the readout opens from: `gap` outside the ring on the segment's
  /// bearing, kept within the plot's height, where a segment at twelve o'clock
  /// would put it over whatever sits above the chart.
  func readoutPosition(_ index: Int, in rect: CGRect, gap: CGFloat) -> CGPoint {
    let radius = min(rect.width, rect.height) / 2
    let at = PMPolar.point(bearing(index), radius + gap, around: CGPoint(x: rect.midX, y: rect.midY))
    return CGPoint(x: at.x, y: min(rect.maxY - gap, max(rect.minY + gap, at.y)))
  }

  var descriptor: PMChartDescriptor? {
    guard !segments.isEmpty else { return nil }
    return PMChartDescriptor(
      title: label, summary: summary, xTitle: messages.segmentColumn,
      bands: segments.map(\.label), xRange: 0...1, xFormat: nil, yTitle: messages.valueColumn,
      yRange: 0...max(1, segments.map(\.value).max() ?? 1), yFormat: format, locale: text.locale,
      series: [
        PMChartDescriptor.Series(
          name: label, continuous: false,
          points: segments.enumerated().map { (band: $1.label, x: Double($0), y: $1.value) })
      ])
  }
}

// MARK: - States

/// DonutChart's states, from the spec's States table, with the reading shown.
public struct DonutChartStates: PMStates {
  public let member = "DonutChart"

  public init() {}

  private static let channels = [
    PMDonutSegment(key: "email", label: "Email", value: 214),
    PMDonutSegment(key: "chat", label: "Chat", value: 96),
    PMDonutSegment(key: "phone", label: "Phone", value: 41),
    PMDonutSegment(key: "social", label: "Social", value: 18),
  ]

  private static let teams = [
    PMDonutSegment(key: "frontline", label: "Frontline", value: 128),
    PMDonutSegment(key: "billing", label: "Billing", value: 74),
    PMDonutSegment(key: "technical", label: "Technical", value: 61),
    PMDonutSegment(key: "escalations", label: "Escalations", value: 39),
    PMDonutSegment(key: "partners", label: "Partners", value: 22),
    PMDonutSegment(key: "onboarding", label: "Onboarding", value: 14),
  ]

  public var entries: [PMStateEntry] {
    let open = PMDonutChartProps(
      center: PMDonutCenter(value: "369", label: "Open tickets"), label: "Open tickets by channel",
      segments: Self.channels)
    return [
      PMStateEntry("channels", expect: ["size": "md", "label": "Open tickets by channel"]) {
        PMDonutChart(props: open)
      },
      PMStateEntry("six segments") {
        PMDonutChart(
          props: PMDonutChartProps(
            center: PMDonutCenter(value: "338", label: "Open tickets"), label: "Open tickets by team",
            segments: Self.teams))
      },
      PMStateEntry("two segments") {
        PMDonutChart(
          props: PMDonutChartProps(
            center: PMDonutCenter(value: "1,181", label: "This month"), label: "Resolved against open",
            segments: [
              PMDonutSegment(key: "resolved", label: "Resolved", value: 812),
              PMDonutSegment(key: "open", label: "Open", value: 369),
            ]))
      },
      PMStateEntry("dominant share") {
        PMDonutChart(
          props: PMDonutChartProps(
            center: PMDonutCenter(value: "88%", label: "Self-serve"), label: "Resolution path",
            segments: [
              PMDonutSegment(key: "self", label: "Self-serve", value: 880),
              PMDonutSegment(key: "assisted", label: "Assisted", value: 120),
            ]))
      },
      PMStateEntry("zero segment") {
        PMDonutChart(
          props: PMDonutChartProps(
            center: PMDonutCenter(value: "351", label: "Open tickets"),
            label: "Open tickets by channel, with an unused channel",
            segments: Array(Self.channels.prefix(3))
              + [PMDonutSegment(key: "social", label: "Social", value: 0)]))
      },
      PMStateEntry("no center") {
        PMDonutChart(props: PMDonutChartProps(label: "Open tickets by channel", segments: Self.channels))
      },
      PMStateEntry("format") {
        PMDonutChart(
          props: PMDonutChartProps(
            center: PMDonutCenter(value: "$79,200", label: "Monthly revenue"),
            format: PMValueFormat(style: .currency, currency: "USD", maximumFractionDigits: 0),
            label: "Revenue by line",
            segments: [
              PMDonutSegment(key: "plan", label: "Subscriptions", value: 48_200),
              PMDonutSegment(key: "seats", label: "Seats", value: 21_400),
              PMDonutSegment(key: "support", label: "Support", value: 9600),
            ]))
      },
      PMStateEntry("empty", expect: ["state": "empty"]) {
        PMDonutChart(props: PMDonutChartProps(label: "Open tickets by channel", segments: []))
      },
      PMStateEntry("loading", expect: ["state": "loading"]) {
        PMDonutChart(
          props: PMDonutChartProps(
            label: "Open tickets by channel", loading: true, segments: Self.channels))
      },
      PMStateEntry("tooltip off") {
        PMDonutChart(
          props: PMDonutChartProps(
            label: "Open tickets by channel, print", segments: Self.channels, tooltip: .off),
          reading: PMChartReading(index: 1))
      },
      PMStateEntry("reading a segment") {
        PMDonutChart(props: open, reading: PMChartReading(index: 1))
      },
    ]
  }
}
