// RadarChart (`design/components/radar-chart.md`), adapted: the shape of a
// profile over three to six axes that share one unit, drawn with SwiftUI
// shapes, because Swift Charts has no radial scale (`design/platforms/ios.json`).
// Each series is a polygon of straight spoke-to-spoke segments in a 2-point
// stroke over a 10% wash, its vertices 8-point markers in a surface ring,
// always shown, because a vertex is a reading position.
//
// The engine's rules (`packages/engine/src/charts/radar-chart.ts`, `polar.ts`):
// the axes run clockwise from 12 o'clock in the given order, row `i` bound to
// axis `i`; one shared zero-based radial scale across every series and axis,
// nice'd with about four ticks, the outermost ring at its maximum, refitting
// to the shown series; the rings are polygons through the spokes, never
// circles, because the scale exists only on the spokes, and carry no figures
// (the maximum is in the summary and the twin); a `null` is a gap: the
// polygon breaks at that vertex instead of dipping to zero, and closes only
// when every vertex is present. The axis names sit outside the spokes' ends in
// `text.xs`; on a phone they would leave the frame, so the ring's radius gives
// them a line of room. It is an any-neighbour form, so the palette's
// `chartCap` is its series limit; past it the chart still draws what it is
// given. The twin is the axes × series grid, which shows the values without
// the polygon's distortion.
//
// The reading position: a tap reads the nearest vertex and a tap on the vertex
// already read calls `onSelect`. Left and right walk the axes, up and down
// switch series at the same axis; the read vertex's ring thickens, the other
// polygons ease to 0.8, and the readout opens outward from the vertex.

import PolymorphTokens
import SwiftUI

public struct PMRadarChart: PMRadarChartRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.locale) private var environmentLocale
  @State private var hidden: Set<String> = []
  @State private var reading: PMChartReading?
  private let props: PMRadarChartProps

  public init(props: PMRadarChartProps) {
    self.init(props: props, reading: nil)
  }

  /// A chart already read at `reading` (`index` the axis, `series` the polygon):
  /// the states fixture's way to show the readout.
  init(props: PMRadarChartProps, reading: PMChartReading?) {
    self.props = props
    _reading = State(initialValue: reading)
  }

  public var body: some View {
    let model = RadarModel(props: props, theme: theme, locale: locale, hidden: hidden)
    let state = PMChartState(empty: props.data.isEmpty || props.axes.isEmpty, loading: props.loading)
    PMChartFrame(
      member: "RadarChart", label: props.label, size: props.size ?? .md, state: state,
      attributes: [:], empty: model.messages.empty, twin: model.twin, messages: model.messages
    ) {
      if props.data.isEmpty || props.axes.isEmpty {
        PMChartSkeleton()
      } else {
        plot(model)
      }
    } legend: {
      if model.painted.count >= 2 {
        PMChartLegend(series: model.painted, shape: .line, hidden: hidden) { key in
          if hidden.contains(key) { hidden.remove(key) } else { hidden.insert(key) }
          reading = nil
        }
      }
    }
  }

  private var locale: Locale { props.locale.map { Locale(identifier: $0) } ?? environmentLocale }

  private func plot(_ model: RadarModel) -> some View {
    GeometryReader { geometry in
      let space = theme.defaultDensity.space
      let center = CGPoint(x: geometry.size.width / 2, y: geometry.size.height / 2)
      // A line of room past each spoke for its axis name.
      let room = theme.text.xs.lineBox + space.s2
      let radius = max(0, min(geometry.size.width, geometry.size.height) / 2 - room)
      let at = model.geometry(center: center, radius: radius)
      let stroke = StrokeStyle(
        lineWidth: PMChartMetrics.stroke, lineCap: .round, lineJoin: .round)
      ZStack {
        // The spokes and the rings: hairlines in `chart.grid`.
        Path { path in
          for angle in at.angles {
            path.move(to: center)
            path.addLine(to: PMPolar.point(angle, radius, around: center))
          }
        }
        .stroke(theme.chart.grid.color, lineWidth: PMChartMetrics.hairline)
        ForEach(at.rings, id: \.self) { ring in
          PMPolar.ring(model.axes.count, ring, around: center)
            .stroke(theme.chart.grid.color, lineWidth: PMChartMetrics.hairline)
        }
        ForEach(Array(model.visible.enumerated()), id: \.element.key) { series, entry in
          let points = at.points[series]
          let profile = PMPolar.profile(points)
          Group {
            if points.allSatisfy({ $0 != nil }) {
              profile.fill(entry.paint.color.opacity(PMChartMetrics.wash))
            }
            profile.stroke(entry.paint.color, style: stroke)
            ForEach(points.indices, id: \.self) { index in
              if let point = points[index] {
                PMChartMarker(
                  paint: entry.paint,
                  active: reading?.index == index && reading?.series == series
                )
                .position(point)
              }
            }
          }
          .opacity(reading == nil || reading?.series == series ? 1 : PMChartMetrics.lift)
        }
        ForEach(Array(model.axes.enumerated()), id: \.offset) { index, axis in
          let angle = at.angles[index]
          let end = PMPolar.point(angle, radius + space.s2, around: center)
          // Anchored away from the centre: beside a sideways spoke, above or
          // below a vertical one.
          Color.clear
            .frame(width: 0, height: 0)
            .overlay(alignment: Self.anchor(angle)) {
              Text(axis.label)
                .pmTextStyle(theme.text.xs)
                .foregroundStyle(theme.colors.textMuted.color)
                .lineLimit(1)
                .fixedSize()
            }
            .position(end)
        }
        if let reading, model.tooltip.visible, model.visible.indices.contains(reading.series),
          model.axes.indices.contains(reading.index),
          let point = at.points[reading.series][reading.index]
        {
          let angle = at.angles[reading.index]
          let out = PMPolar.point(
            angle, hypot(point.x - center.x, point.y - center.y) + space.s3, around: center)
          PMChartAnchor(point: out, opensLeading: out.x < center.x) {
            PMChartReadout(
              header: model.axes[reading.index].label, rows: [model.row(reading)],
              style: model.tooltip)
          }
        }
      }
      .contentShape(.rect)
      .gesture(
        SpatialTapGesture().onEnded { tap in
          if let nearest = at.nearest(tap.location) { tapped(nearest, model: model) }
        })
    }
    .accessibilityHidden(false)
    .pmChartPlot(
      label: props.label, spoken: spoken(model), selectable: props.onSelect != nil,
      interactive: true, descriptor: model.descriptor
    ) { key in handle(key, model: model) }
  }

  /// Which way an axis name runs from its spoke's end.
  private static func anchor(_ angle: Double) -> Alignment {
    let sideways = abs(sin(angle)) > 0.35
    let up = cos(angle) > 0.35
    let down = cos(angle) < -0.35
    switch (sideways, sin(angle) > 0, up, down) {
    case (true, true, true, _): return .bottomLeading
    case (true, true, _, true): return .topLeading
    case (true, true, _, _): return .leading
    case (true, false, true, _): return .bottomTrailing
    case (true, false, _, true): return .topTrailing
    case (true, false, _, _): return .trailing
    case (false, _, true, _): return .bottom
    default: return .top
    }
  }

  // MARK: Reading

  private func spoken(_ model: RadarModel) -> String {
    guard let reading, model.visible.indices.contains(reading.series),
      model.axes.indices.contains(reading.index)
    else { return model.text.spoken(model.summary, selectable: props.onSelect != nil) }
    let row = model.row(reading)
    return "\(model.axes[reading.index].label): \(row.label), \(row.value)"
  }

  private func tapped(_ at: PMChartReading, model: RadarModel) {
    if reading == at, props.onSelect != nil {
      activate(model)
    } else {
      reading = at
    }
  }

  private func handle(_ key: PMChartKey, model: RadarModel) {
    switch key {
    case .next, .extendNext: reading = .step(reading, by: 1, count: model.axes.count)
    case .previous, .extendPrevious: reading = .step(reading, by: -1, count: model.axes.count)
    case .down: reading = .walkSeries(reading, by: 1, count: model.visible.count)
    case .up: reading = .walkSeries(reading, by: -1, count: model.visible.count)
    case .activate: activate(model)
    case .escape: reading = nil
    }
  }

  private func activate(_ model: RadarModel) {
    guard let onSelect = props.onSelect, let reading, model.axes.indices.contains(reading.index),
      model.visible.indices.contains(reading.series),
      let value = model.value(axis: reading.index, series: model.visible[reading.series].key)
    else { return }
    onSelect(
      PMRadarSelection(
        axis: model.axes[reading.index].key, key: model.visible[reading.series].key, value: value))
  }
}

/// The radar's drawing (`radarChartModel`).
@MainActor
private struct RadarModel {
  /// The polar layout at a measured size: the spokes' bearings, the rings'
  /// radii and each series' vertices, a gap `nil`.
  struct Layout {
    let angles: [Double]
    let rings: [CGFloat]
    let points: [[CGPoint?]]

    /// The vertex nearest a point, by the engine's naive scan.
    func nearest(_ point: CGPoint) -> PMChartReading? {
      var best: (PMChartReading, CGFloat)?
      for (series, vertices) in points.enumerated() {
        for (index, vertex) in vertices.enumerated() {
          guard let vertex else { continue }
          let distance = hypot(vertex.x - point.x, vertex.y - point.y)
          if distance < (best?.1 ?? .infinity) {
            best = (PMChartReading(index: index, series: series), distance)
          }
        }
      }
      return best?.0
    }
  }

  let axes: [PMRadarAxis]
  let rows: [PMChartRow]
  let painted: [PMChartPaint]
  let visible: [PMChartPaint]
  let domain: PMChartDomain
  let format: PMValueFormat?
  let messages: PMChartMessages
  let text: PMChartText
  let tooltip: PMChartTooltipStyle
  let summary: String
  let twin: PMChartTwinModel
  let label: String

  init(props: PMRadarChartProps, theme: PMTheme, locale: Locale, hidden: Set<String>) {
    let messages = props.messages ?? PMSpecDefault.chartMessages
    let text = PMChartText(locale: locale, messages: messages)
    let painted = PMChartPalette.series(props.series, theme)
    let visible = painted.filter { !hidden.contains($0.key) }
    // The one shared scale refits to the shown series; with every series
    // hidden it keeps the full data's maximum.
    let keys = (visible.isEmpty ? painted : visible).map(\.key)
    let top = props.axes.indices.flatMap { index in
      props.data.indices.contains(index) ? keys.compactMap { props.data[index].pmMeasure($0) } : []
    }.max() ?? 0
    let domain = PMChartScale.value([0, top > 0 ? top : 1], zero: true, count: 4)
    self.axes = props.axes
    self.rows = props.data
    self.painted = painted
    self.visible = visible
    self.domain = domain
    self.format = props.format
    self.messages = messages
    self.text = text
    self.tooltip = PMChartTooltipStyle(props.tooltip)
    self.summary = messages.radarSummary(
      PMRadarSummaryFacts(
        label: props.label, axes: Double(props.axes.count), series: Double(painted.count),
        max: props.data.isEmpty ? "" : text.number(domain.upper, props.format)))
    self.twin = PMChartTwinModel(
      columns: [PMChartTwinModel.Column(label: "")]
        + painted.map { PMChartTwinModel.Column(label: $0.label, numeric: true) },
      rows: props.axes.enumerated().map { index, axis in
        [axis.label]
          + painted.map { entry in
            (props.data.indices.contains(index) ? props.data[index].pmMeasure(entry.key) : nil)
              .map { text.number($0, props.format) } ?? ""
          }
      })
    self.label = props.label
  }

  /// The value row `axis` holds for a series, or `nil` for a gap.
  func value(axis index: Int, series key: String) -> Double? {
    rows.indices.contains(index) ? rows[index].pmMeasure(key) : nil
  }

  func geometry(center: CGPoint, radius: CGFloat) -> Layout {
    let angles = axes.indices.map { PMPolar.angle($0, of: axes.count) }
    let span = max(domain.upper, .leastNonzeroMagnitude)
    let at: (Double) -> CGFloat = { CGFloat($0 / span) * radius }
    return Layout(
      angles: angles,
      rings: domain.ticks.filter { $0 > 0 }.map(at),
      points: visible.map { entry in
        axes.indices.map { index in
          value(axis: index, series: entry.key).map {
            PMPolar.point(angles[index], at($0), around: center)
          }
        }
      })
  }

  func row(_ reading: PMChartReading) -> PMChartReadoutRow {
    let entry = visible[reading.series]
    return PMChartReadoutRow(
      key: entry.key, label: entry.label,
      value: value(axis: reading.index, series: entry.key).map { text.number($0, format) }
        ?? messages.noData,
      paint: entry.paint)
  }

  var descriptor: PMChartDescriptor? {
    guard !rows.isEmpty, !axes.isEmpty else { return nil }
    return PMChartDescriptor(
      title: label, summary: summary, xTitle: label, bands: axes.map(\.label), xRange: 0...1,
      xFormat: nil, yTitle: label, yRange: domain.range, yFormat: format, locale: text.locale,
      series: painted.map { entry in
        PMChartDescriptor.Series(
          name: entry.label, continuous: false,
          points: axes.enumerated().compactMap { index, axis in
            value(axis: index, series: entry.key).map { (band: axis.label, x: Double(index), y: $0) }
          })
      })
  }
}

// MARK: - States

/// RadarChart's states, from the spec's States table, with the reading shown.
public struct RadarChartStates: PMStates {
  public let member = "RadarChart"

  public init() {}

  private static let skills = [
    PMRadarAxis(key: "firstResponse", label: "First response"),
    PMRadarAxis(key: "resolution", label: "Resolution"), PMRadarAxis(key: "csat", label: "CSAT"),
    PMRadarAxis(key: "escalation", label: "Escalation judgment"),
    PMRadarAxis(key: "coverage", label: "Coverage"),
  ]

  private static let coaching: [PMChartRow] = [
    ["agent": 4.5, "team": 3.8], ["agent": 3.2, "team": 3.6], ["agent": 4.8, "team": 4.1],
    ["agent": 2.9, "team": 3.4], ["agent": 3.9, "team": 3.7],
  ]

  private static let teams: [PMChartRow] = [
    ["triage": 4.2, "escalations": 3.5, "billing": 3.9],
    ["triage": 3.8, "escalations": 4.3, "billing": 3.2],
    ["triage": 4.5, "escalations": 3.9, "billing": 4.0],
    ["triage": 3.1, "escalations": 4.6, "billing": 3.6],
    ["triage": 3.7, "escalations": 3.3, "billing": 4.4],
  ]

  private static let ratios: [PMChartRow] = [
    ["weekdays": 0.92, "weekends": 0.54], ["weekdays": 0.81, "weekends": 0.4],
    ["weekdays": 0.88, "weekends": 0.61], ["weekdays": 0.74, "weekends": 0.35],
    ["weekdays": 0.9, "weekends": 0.5],
  ]

  private static let pair = [
    PMChartSeries(key: "agent", label: "Priya R."), PMChartSeries(key: "team", label: "Team median"),
  ]

  public var entries: [PMStateEntry] {
    let coaching = PMRadarChartProps(
      axes: Self.skills, data: Self.coaching, label: "Coaching profile against the team",
      series: Self.pair)
    var gapped = Self.coaching
    gapped[2]["agent"] = .some(nil)
    return [
      PMStateEntry(
        "skills matrix", expect: ["size": "md", "label": "Coaching profile against the team"]
      ) { PMRadarChart(props: coaching) },
      PMStateEntry("three series") {
        PMRadarChart(
          props: PMRadarChartProps(
            axes: Self.skills, data: Self.teams, label: "Three teams on the rubric",
            series: [
              PMChartSeries(key: "triage", label: "Triage"),
              PMChartSeries(key: "escalations", label: "Escalations"),
              PMChartSeries(key: "billing", label: "Billing"),
            ]))
      },
      PMStateEntry("six axes") {
        PMRadarChart(
          props: PMRadarChartProps(
            axes: Self.skills + [PMRadarAxis(key: "tooling", label: "Tooling fluency")],
            data: Self.coaching + [["agent": 4.1, "team": 3.9]],
            label: "The full rubric — the readable limit", series: Self.pair))
      },
      PMStateEntry("gap") {
        PMRadarChart(
          props: PMRadarChartProps(
            axes: Self.skills, data: gapped, label: "Coaching profile with an unmeasured axis",
            series: Self.pair))
      },
      PMStateEntry("format") {
        PMRadarChart(
          props: PMRadarChartProps(
            axes: ["Mon", "Wed", "Fri", "Sat", "Sun"].map {
              PMRadarAxis(key: $0.lowercased(), label: $0)
            },
            data: Self.ratios, format: PMValueFormat(style: .percent), label: "Coverage by day",
            series: [
              PMChartSeries(key: "weekdays", label: "Day shift"),
              PMChartSeries(key: "weekends", label: "Night shift"),
            ]))
      },
      PMStateEntry("single series") {
        PMRadarChart(
          props: PMRadarChartProps(
            axes: Self.skills, data: Self.coaching, label: "The team profile",
            series: [PMChartSeries(key: "team", label: "Team median")]))
      },
      PMStateEntry("empty", expect: ["state": "empty"]) {
        PMRadarChart(
          props: PMRadarChartProps(
            axes: Self.skills, data: [], label: "Coaching profile against the team",
            series: Self.pair))
      },
      PMStateEntry("loading", expect: ["state": "loading"]) {
        PMRadarChart(
          props: PMRadarChartProps(
            axes: Self.skills, data: Self.coaching, label: "Coaching profile against the team",
            loading: true, series: Self.pair))
      },
      PMStateEntry("tooltip off") {
        PMRadarChart(
          props: PMRadarChartProps(
            axes: Self.skills, data: Self.coaching, label: "Coaching profile, print",
            series: Self.pair, tooltip: .off),
          reading: PMChartReading(index: 2))
      },
      PMStateEntry("reading a vertex") {
        PMRadarChart(props: coaching, reading: PMChartReading(index: 2))
      },
    ]
  }
}
