// Sparkline (`design/components/sparkline.md`): which way a value has been
// moving, a small line beside the number a Stat or a table cell shows. Not a
// small LineChart: no frame, axes, legend, readout or twin, and no numbers of
// its own. Swift Charts draws a 2-point line in `chart.other`, monotone, and a
// 6-point dot in `accent.bg` on the current value, with both axes hidden.
//
// The engine's rules (`packages/engine/src/charts/sparkline.ts`): fewer than
// two finite values draw nothing, because a trend needs two; a value that is
// not finite is a gap, left out of the scale, and the line breaks over it; a
// flat series is scaled by one and draws level along the bottom; the line is
// inset by the dot's radius so the dot and the stroke stay inside the box. The
// box sits on the icon and control scales: `sm` is the large icon's height,
// `md` the small control's, each four times as wide.
//
// It is one element named by `label`, which should state the reading
// ("First response, trending down"), because there is no twin; it does not
// move, because a label row should not when nothing has changed.

import Charts
import PolymorphTokens
import SwiftUI

public struct PMSparkline: PMSparklineRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMSparklineProps

  public init(props: PMSparklineProps) {
    self.props = props
  }

  public var body: some View {
    let size = props.size ?? .sm
    let height = size == .md ? theme.defaultDensity.controlHeight.sm : theme.icon.size[.lg]
    // Four times as wide as it is tall (`sparkline.md`).
    let width = height * 4
    let finite = props.data.filter(\.isFinite)
    if finite.count >= 2 {
      line(finite: finite)
        .frame(width: width, height: height)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(props.label))
        .accessibilityAddTraits(.isImage)
        .pmMember("Sparkline", ["size": size.rawValue])
    }
  }

  private func line(finite: [Double]) -> some View {
    let low = finite.min() ?? 0
    let high = finite.max() ?? 0
    // A flat series has no span: it is scaled by one and draws along the bottom.
    let top = high > low ? high : low + 1
    let last = props.data.indices.last.flatMap { props.data[$0].isFinite ? $0 : nil }
    let inset = PMChartMetrics.endDot + PMChartMetrics.stroke / 2
    let dot = PMChartMetrics.endDot * 2
    return Chart {
      ForEach(Array(runs.enumerated()), id: \.offset) { run, indices in
        ForEach(indices, id: \.self) { index in
          LineMark(
            x: .value(props.label, Double(index)), y: .value(props.label, props.data[index]),
            series: .value(props.label, run)
          )
          .foregroundStyle(theme.chart.other.color)
          .lineStyle(
            StrokeStyle(lineWidth: PMChartMetrics.stroke, lineCap: .round, lineJoin: .round))
          .interpolationMethod(.monotone)
        }
      }
      if let last {
        PointMark(x: .value(props.label, Double(last)), y: .value(props.label, props.data[last]))
          .symbol {
            Circle()
              .fill(theme.colors.accentBg.color)
              .frame(width: dot, height: dot)
          }
      }
    }
    .chartXAxis(.hidden)
    .chartYAxis(.hidden)
    .chartLegend(.hidden)
    .chartXScale(
      domain: 0...Double(max(1, props.data.count - 1)), range: .plotDimension(padding: inset))
    .chartYScale(domain: low...top, range: .plotDimension(padding: inset))
  }

  /// The runs between gaps: a value that is not finite breaks the line.
  private var runs: [[Int]] {
    var runs: [[Int]] = [[]]
    for (index, value) in props.data.enumerated() {
      if value.isFinite {
        runs[runs.count - 1].append(index)
      } else if !runs[runs.count - 1].isEmpty {
        runs.append([])
      }
    }
    return runs.filter { !$0.isEmpty }
  }
}

/// Sparkline's states, from the spec's States table. The empty and the single
/// point states draw nothing, by rule.
public struct SparklineStates: PMStates {
  public let member = "Sparkline"

  public init() {}

  private static let downGood: [Double] = [42, 40, 41, 38, 35, 36, 33, 31, 32, 29, 27, 26]
  private static let up: [Double] = [180, 195, 190, 210, 220, 216, 240, 251, 248, 262, 270, 284]
  private static let flat: [Double] = [92, 91, 93, 92, 92, 94, 93, 92, 93, 93, 92, 93]

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "down-good", expect: ["size": "sm", "label": "First response, trending down"]
      ) {
        PMSparkline(props: PMSparklineProps(data: Self.downGood, label: "First response, trending down"))
      },
      PMStateEntry("up", expect: ["label": "Weekly tickets, trending up"]) {
        PMSparkline(props: PMSparklineProps(data: Self.up, label: "Weekly tickets, trending up"))
      },
      PMStateEntry("flat with noise") {
        PMSparkline(props: PMSparklineProps(data: Self.flat, label: "CSAT, holding steady"))
      },
      PMStateEntry("two points") {
        PMSparkline(props: PMSparklineProps(data: [12, 19], label: "Escalations, up"))
      },
      PMStateEntry("md", expect: ["size": "md"]) {
        PMSparkline(
          props: PMSparklineProps(data: Self.up, label: "Weekly tickets, trending up", size: .md))
      },
      PMStateEntry("a gap") {
        PMSparkline(
          props: PMSparklineProps(
            data: [42, 40, .nan, 38, 35, 36], label: "First response, with a missing week"))
      },
      PMStateEntry("empty", expect: ["hidden": "true", "renders": "nothing"]) {
        PMSparkline(props: PMSparklineProps(data: [], label: "No trend yet"))
      },
      PMStateEntry("single point", expect: ["hidden": "true", "renders": "nothing"]) {
        PMSparkline(props: PMSparklineProps(data: [7], label: "No trend yet"))
      },
    ]
  }
}
