// FunnelChart (`design/components/funnel-chart.md`): the count that survives
// each stage of an ordered process, as one horizontal bar per stage through
// Swift Charts' `BarMark`, top to bottom, every bar in slot 1, because a funnel
// is one series. Each bar starts at the end of the label column, its length is
// its value against the largest stage, and its data end is rounded. Past each
// bar are its value and its share of the first stage; between two bars, the
// share of the stage above that reached the stage below ("62% continued"). No
// axes and no gridlines: every stage prints its own value.
//
// The engine's rules, ported (`packages/engine/src/charts/funnel-chart.ts`, as
// `PMFunnel` in `PolymorphUI+Charts.swift`): the stages are drawn as given, so a
// stage that rises is drawn at its own length and nothing is reordered; a stage
// of zero or a negative one draws no bar and keeps its row; there is no share
// after a first stage of zero and no step after a stage of zero. What fits, by
// the engine's estimate of the words, as on the web: whole labels drop at an even stride when the rows are shorter than a line, a
// stage's value goes with its label, the values leave a plot too narrow for
// them beside the shortest run a bar keeps, and the step rates are drawn only
// when every row has room for a line and the thinnest bar. Whatever the plot
// leaves out, the readout, the spoken reading and the twin say. The engine's
// dev warnings (a rising stage, a negative one) are not printed.
//
// The reading position: a tap reads the stage whose row it falls in, and a tap
// on the stage already read calls `onSelect`. Arrow keys and VoiceOver's swipes
// walk the stages first to last; Return, Space and VoiceOver's double tap call
// `onSelect`; Escape clears it. The read stage keeps full ink, the other bars
// ease to 0.8, and the readout opens beside the read bar's end with the step
// into the stage as its header.

import Charts
import PolymorphTokens
import SwiftUI

public struct PMFunnelChart: PMFunnelChartRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.locale) private var environmentLocale
  @State private var reading: PMChartReading?
  private let props: PMFunnelChartProps

  public init(props: PMFunnelChartProps) {
    self.init(props: props, reading: nil)
  }

  /// A chart already read at `reading`: the states fixture's way to show the readout.
  init(props: PMFunnelChartProps, reading: PMChartReading?) {
    self.props = props
    _reading = State(initialValue: reading)
  }

  public var body: some View {
    let model = FunnelModel(props: props, theme: theme, locale: locale)
    let state = PMChartState(empty: props.stages.isEmpty, loading: props.loading)
    PMChartFrame(
      member: "FunnelChart", label: props.label, size: props.size ?? .md, state: state,
      attributes: [:], empty: model.messages.empty, twin: model.twin, messages: model.messages
    ) {
      if props.stages.isEmpty {
        PMChartSkeleton()
      } else {
        plot(model)
      }
    } legend: {
      EmptyView()
    }
  }

  private var locale: Locale { props.locale.map { Locale(identifier: $0) } ?? environmentLocale }

  // MARK: The plot

  private func plot(_ model: FunnelModel) -> some View {
    GeometryReader { geometry in
      let height = geometry.size.height
      // The label column is as wide as its longest label, at most two fifths
      // of the plot, and the bars' region takes the rest; within it, what fits
      // is decided by the engine's estimate of the words, as on the web.
      HStack(alignment: .top, spacing: PMRecipe.funnelTextGap) {
        if let rows = layout(model, region: geometry.size.width, height: height) {
          FunnelLabelColumn(limit: geometry.size.width * PMRecipe.funnelLabelShare) {
            labels(rows)
          }
          .layoutPriority(1)
        }
        GeometryReader { region in
          if let layout = layout(model, region: region.size.width, height: height) {
            ZStack(alignment: .topLeading) {
              bars(model, layout)
              words(model, layout)
              if let reading, model.tooltip.visible, props.stages.indices.contains(reading.index) {
                let point = CGPoint(
                  x: min(layout.width, layout.end(reading.index)), y: layout.positions[reading.index])
                PMChartAnchor(point: point, opensLeading: point.x > layout.width / 2) {
                  PMChartReadout(
                    header: model.figures.step(reading.index), rows: [model.row(reading.index)],
                    style: model.tooltip)
                }
              }
            }
            .frame(width: layout.width, height: layout.height, alignment: .topLeading)
          }
        }
      }
      .frame(height: height, alignment: .top)
      .contentShape(.rect)
      .gesture(
        SpatialTapGesture().onEnded { tap in
          if let rows = layout(model, region: geometry.size.width, height: height),
            let index = rows.stage(at: tap.location.y)
          {
            tapped(index, model: model)
          }
        })
    }
    .accessibilityHidden(false)
    .pmChartPlot(
      label: props.label, spoken: spoken(model), selectable: props.onSelect != nil,
      interactive: true, descriptor: model.descriptor
    ) { key in handle(key, model: model) }
  }

  /// The bars' region `region` wide, its words estimated as the engine does.
  private func layout(_ model: FunnelModel, region: CGFloat, height: CGFloat) -> PMFunnel.Layout? {
    let size = PMRecipe.chartTextEstimate
    return model.figures.layout(
      region: region, height: height, size: size, line: size * PMRecipe.chartLineEstimate,
      cap: theme.defaultDensity.space.s6)
  }

  /// The label column: each kept stage's label centred on its row, one line,
  /// ending in an ellipsis where the column is narrower than the label.
  private func labels(_ layout: PMFunnel.Layout) -> some View {
    ZStack(alignment: .topLeading) {
      ForEach(layout.kept, id: \.self) { index in
        let top = layout.row * CGFloat(index)
        Text(props.stages[index].label)
          .foregroundStyle(theme.colors.textSecondary.color)
          .lineLimit(1)
          .truncationMode(.tail)
          .frame(height: layout.row, alignment: .leading)
          .padding(.top, top)
      }
    }
    .pmTextStyle(theme.text.xs)
    .accessibilityHidden(true)
  }

  /// The bars, from the region's leading edge: a value scale whose largest
  /// stage reaches the run the layout leaves before the longest value, and one
  /// row per stage, the first at the top.
  private func bars(_ model: FunnelModel, _ layout: PMFunnel.Layout) -> some View {
    let rows = Double(props.stages.count)
    let largest = model.figures.largest
    let valueName = model.messages.valueColumn
    let stageName = model.messages.stageColumn
    let corners = UnevenRoundedRectangle(
      bottomTrailingRadius: PMChartMetrics.barEnd, topTrailingRadius: PMChartMetrics.barEnd)
    return Chart {
      ForEach(Array(props.stages.enumerated()), id: \.offset) { index, stage in
        if layout.lengths[index] > 0 {
          BarMark(
            xStart: .value(valueName, 0), xEnd: .value(valueName, stage.value),
            y: .value(stageName, rows - Double(index) - 0.5), height: .fixed(layout.thickness)
          )
          .foregroundStyle(model.paint.color)
          .clipShape(corners)
          .opacity(reading == nil || reading?.index == index ? 1 : PMChartMetrics.lift)
        }
      }
    }
    .chartLegend(.hidden)
    .chartXAxis(.hidden)
    .chartYAxis(.hidden)
    .chartXScale(
      domain: 0...(largest > 0 ? largest : 1),
      range: .plotDimension(startPadding: 0, endPadding: max(0, layout.width - layout.run))
    )
    .chartYScale(domain: 0...rows)
    .frame(width: layout.width, height: layout.height)
  }

  /// The words in the bars' region: each kept stage's value past its bar's
  /// end, centred on its row, and each step on the boundary between the two
  /// rows it joins, at the bars' start. The plot's value says the same, so
  /// they are hidden from VoiceOver.
  private func words(_ model: FunnelModel, _ layout: PMFunnel.Layout) -> some View {
    let step = theme.text.xs
    let line = step.lineBox
    let values = layout.valuesShown ? layout.kept : []
    let steps = layout.stepsShown ? Array(props.stages.indices.dropFirst()) : []
    return ZStack(alignment: .topLeading) {
      ForEach(values, id: \.self) { index in
        Text(model.figures.amount(index))
          .foregroundStyle(theme.colors.textPrimary.color)
          .pmTabularFigures(theme.numeric.tabular)
          .lineLimit(1)
          .fixedSize()
          .frame(height: layout.row)
          .padding(.leading, layout.end(index) + PMRecipe.funnelTextGap)
          .padding(.top, layout.row * CGFloat(index))
      }
      ForEach(steps, id: \.self) { index in
        if let text = model.figures.step(index) {
          let top = layout.row * CGFloat(index) - line / 2
          Text(text)
            .foregroundStyle(theme.colors.textMuted.color)
            .pmTabularFigures(theme.numeric.tabular)
            .lineLimit(1)
            .fixedSize()
            .frame(height: line)
            .padding(.top, top)
        }
      }
    }
    .pmTextStyle(step)
    .accessibilityHidden(true)
  }

  // MARK: Reading

  private func spoken(_ model: FunnelModel) -> String {
    guard let reading, props.stages.indices.contains(reading.index) else {
      return model.text.spoken(model.summary, selectable: props.onSelect != nil)
    }
    return model.figures.announcement(reading.index)
  }

  private func tapped(_ index: Int, model: FunnelModel) {
    if reading?.index == index, props.onSelect != nil {
      activate(model)
    } else {
      reading = PMChartReading(index: index)
    }
  }

  private func handle(_ key: PMChartKey, model: FunnelModel) {
    let count = props.stages.count
    switch key {
    case .next, .extendNext, .down: reading = .step(reading, by: 1, count: count)
    case .previous, .extendPrevious, .up: reading = .step(reading, by: -1, count: count)
    case .activate: activate(model)
    case .escape: reading = nil
    }
  }

  private func activate(_ model: FunnelModel) {
    guard let onSelect = props.onSelect, let reading,
      let selection = model.figures.selection(reading.index)
    else { return }
    onSelect(selection)
  }
}

/// The label column: as wide as its longest label, at most `limit`, so a
/// short label leaves the bars the room and a long one ends in an ellipsis.
private struct FunnelLabelColumn: Layout {
  let limit: CGFloat

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    guard let labels = subviews.first else { return .zero }
    let ideal = labels.sizeThatFits(ProposedViewSize(width: nil, height: proposal.height))
    let width = min(ideal.width, limit, proposal.width ?? .infinity)
    let size = labels.sizeThatFits(ProposedViewSize(width: width, height: proposal.height))
    return CGSize(width: width, height: size.height)
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    subviews.first?.place(
      at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(bounds.size))
  }
}

// MARK: - The model

/// What the chart draws, from its props and the theme: the engine's
/// `funnelChartModel` with its geometry left to the measured plot.
@MainActor
private struct FunnelModel {
  let figures: PMFunnel
  let messages: PMChartMessages
  let text: PMChartText
  let tooltip: PMChartTooltipStyle
  let summary: String
  let twin: PMChartTwinModel
  let label: String
  /// The one series' paint, slot 1: every bar shares it.
  let paint: PMDynamicColor

  init(props: PMFunnelChartProps, theme: PMTheme, locale: Locale) {
    let messages = props.messages ?? PMSpecDefault.chartMessages
    let text = PMChartText(locale: locale, messages: messages)
    let figures = PMFunnel(stages: props.stages, format: props.format, text: text)
    self.figures = figures
    self.messages = messages
    self.text = text
    self.tooltip = PMChartTooltipStyle(props.tooltip)
    self.summary = messages.funnelSummary(
      PMFunnelSummaryFacts(label: props.label, stages: Double(props.stages.count)))
    self.twin = PMChartTwinModel(
      columns: [
        PMChartTwinModel.Column(label: messages.stageColumn),
        PMChartTwinModel.Column(label: messages.valueColumn, numeric: true),
        PMChartTwinModel.Column(label: messages.shareColumn, numeric: true),
        PMChartTwinModel.Column(label: messages.continuedColumn, numeric: true),
      ],
      rows: figures.twinRows)
    self.label = props.label
    self.paint = theme.chart.chart1
  }

  /// The readout's row at a stage: its label, then its value and share.
  func row(_ index: Int) -> PMChartReadoutRow {
    let stage = figures.stages[index]
    return PMChartReadoutRow(
      key: stage.key, label: stage.label, value: figures.amount(index), paint: paint)
  }

  var descriptor: PMChartDescriptor? {
    let stages = figures.stages
    guard !stages.isEmpty else { return nil }
    return PMChartDescriptor(
      title: label, summary: summary, xTitle: messages.stageColumn, bands: stages.map(\.label),
      xRange: 0...1, xFormat: nil, yTitle: messages.valueColumn,
      yRange: 0...max(1, figures.largest), yFormat: figures.format, locale: text.locale,
      series: [
        PMChartDescriptor.Series(
          name: label, continuous: false,
          points: stages.enumerated().compactMap { index, stage in
            PMFunnel.counts(stage.value)
              ? (band: stage.label, x: Double(index), y: stage.value) : nil
          })
      ])
  }
}

// MARK: - States

/// FunnelChart's states, from the spec's States table, with the reading shown.
public struct FunnelChartStates: PMStates {
  public let member = "FunnelChart"

  public init() {}

  /// Relay's tickets this month, from opened to rated.
  private static let lifecycle = [
    PMFunnelStage(key: "opened", label: "Opened", value: 1240),
    PMFunnelStage(key: "assigned", label: "Assigned", value: 1180),
    PMFunnelStage(key: "replied", label: "First reply", value: 1020),
    PMFunnelStage(key: "resolved", label: "Resolved", value: 860),
    PMFunnelStage(key: "rated", label: "Rated", value: 312),
  ]

  /// The help centre's self-serve path, twelve steps long.
  private static let twelve: [PMFunnelStage] = [
    "Searched", "Opened an article", "Read to the end", "Opened a second article",
    "Used the contact form", "Picked a topic", "Wrote a message", "Attached a file", "Sent",
    "Got an answer", "Marked solved", "Rated the answer",
  ].enumerated().map { index, label in
    // JavaScript's `Math.round`, half up, which the web's fixture is built with.
    let value = (9600 * pow(0.82, Double(index)) + 0.5).rounded(.down)
    return PMFunnelStage(key: "step-\(index + 1)", label: label, value: value)
  }

  public var entries: [PMStateEntry] {
    let lifecycle = PMFunnelChartProps(label: "Tickets from opened to rated", stages: Self.lifecycle)
    return [
      PMStateEntry("lifecycle", expect: ["size": "md", "label": "Tickets from opened to rated"]) {
        PMFunnelChart(props: lifecycle)
      },
      PMStateEntry("two stages") {
        PMFunnelChart(
          props: PMFunnelChartProps(
            label: "Tickets opened and assigned", stages: Array(Self.lifecycle.prefix(2))))
      },
      PMStateEntry("one stage") {
        PMFunnelChart(
          props: PMFunnelChartProps(label: "Tickets opened", stages: Array(Self.lifecycle.prefix(1))))
      },
      // No share and no step can be stated against a first stage of zero.
      PMStateEntry("first stage zero") {
        PMFunnelChart(
          props: PMFunnelChartProps(
            label: "Agents invited this week",
            stages: [
              PMFunnelStage(key: "invited", label: "Invited", value: 0),
              PMFunnelStage(key: "joined", label: "Joined", value: 0),
              PMFunnelStage(key: "active", label: "Active", value: 0),
            ]))
      },
      PMStateEntry("zero in the middle") {
        PMFunnelChart(
          props: PMFunnelChartProps(
            label: "Escalations this week",
            stages: [
              PMFunnelStage(key: "escalated", label: "Escalated", value: 46),
              PMFunnelStage(key: "engineering", label: "Sent to engineering", value: 0),
              PMFunnelStage(key: "fixed", label: "Fixed", value: 0),
            ]))
      },
      PMStateEntry("equal stages") {
        PMFunnelChart(
          props: PMFunnelChartProps(
            label: "Urgent tickets",
            stages: [
              PMFunnelStage(key: "opened", label: "Opened", value: 320),
              PMFunnelStage(key: "assigned", label: "Assigned", value: 320),
              PMFunnelStage(key: "replied", label: "First reply", value: 290),
            ]))
      },
      // Drawn as given: the member never clamps or reorders.
      PMStateEntry("rising stage") {
        PMFunnelChart(
          props: PMFunnelChartProps(
            label: "Workspaces from trial to paid",
            stages: [
              PMFunnelStage(key: "trial", label: "Started a trial", value: 400),
              PMFunnelStage(key: "invited", label: "Invited a teammate", value: 520),
              PMFunnelStage(key: "paid", label: "Paid", value: 180),
            ]))
      },
      PMStateEntry("long labels") {
        PMFunnelChart(
          props: PMFunnelChartProps(
            label: "Identity verification",
            stages: [
              PMFunnelStage(
                key: "verify",
                label: "Started the identity verification with a passport or a national card",
                value: 2048),
              PMFunnelStage(
                key: "upload", label: "Uploaded both sides of the card and a recent photograph",
                value: 1630),
              PMFunnelStage(key: "approved", label: "Approved", value: 1410),
            ]))
      },
      PMStateEntry("twelve stages") {
        PMFunnelChart(props: PMFunnelChartProps(label: "Self-serve help path", stages: Self.twelve))
      },
      PMStateEntry("format") {
        PMFunnelChart(
          props: PMFunnelChartProps(
            format: PMValueFormat(style: .currency, currency: "USD", maximumFractionDigits: 0),
            label: "Seat revenue by stage",
            stages: [
              PMFunnelStage(key: "pipeline", label: "Pipeline", value: 1_840_000),
              PMFunnelStage(key: "qualified", label: "Qualified", value: 920_000),
              PMFunnelStage(key: "proposal", label: "Proposal", value: 410_000),
              PMFunnelStage(key: "won", label: "Won", value: 126_000),
            ]))
      },
      PMStateEntry("small", expect: ["size": "sm"]) {
        PMFunnelChart(
          props: PMFunnelChartProps(
            label: "Tickets from opened to rated", size: .sm, stages: Self.lifecycle))
      },
      PMStateEntry("empty", expect: ["state": "empty"]) {
        PMFunnelChart(props: PMFunnelChartProps(label: "Tickets from opened to rated", stages: []))
      },
      PMStateEntry("loading", expect: ["state": "loading"]) {
        PMFunnelChart(
          props: PMFunnelChartProps(
            label: "Tickets from opened to rated", loading: true, stages: Self.lifecycle))
      },
      PMStateEntry("tooltip off") {
        PMFunnelChart(
          props: PMFunnelChartProps(
            label: "Tickets from opened to rated, print", stages: Self.lifecycle, tooltip: .off),
          reading: PMChartReading(index: 1))
      },
      PMStateEntry("reading a stage") {
        PMFunnelChart(props: lifecycle, reading: PMChartReading(index: 1))
      },
    ]
  }
}
