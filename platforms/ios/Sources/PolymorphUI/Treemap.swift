// Treemap (`design/components/treemap.md`), adapted: parts of a whole as
// rectangles that tile the plot, each with an area proportional to its value,
// in one level or two, drawn with SwiftUI shapes, because Swift Charts has no
// mark that tiles a box by area (`design/platforms/ios.json`).
//
// The engine's rules (`packages/engine/src/charts/treemap.ts`, ported as
// `PMSquarify` and `PMTreemapTiling` in `PolymorphUI+Charts.swift`): the
// squarified layout, largest first, equal values in the order given; with
// groups, the groups laid out by their sums and each group's items inside its
// rectangle; the surface between tiles, 2 points between the items of a group
// and 4 between groups, never a stroke; 4-point corners; a tile never painted
// under a point across, and its target grown to the least hit area. One level
// is slot 1 throughout, because colour names nothing; with groups each
// top-level item takes a slot in declaration order and its children take its
// colour, and the legend names the groups. A tile shows its label over its
// value on a plate of the surface only where both fit, by the engine's
// estimate, so text never sits on a series colour. An item with no positive
// value takes no area; the twin lists it and the summary counts it. Nothing is
// grouped as "Other". The engine's dev warnings are not printed.
//
// Each tile is an accessibility element of its own, named by its group and
// its label, its value the item's value and share, in reading order, as Swift
// Charts exposes each mark; the web's plot is one image the keys walk. The
// plot's container carries the audio graph. The keyboard has the plot as one
// focus stop: the arrows walk the tiles, Return and Space call `onSelect`,
// Escape clears the reading. A tap reads the tile whose target is under it,
// the later tile's where targets overlap, and a tap on the tile already read
// calls `onSelect`; with `onSelect`, VoiceOver's activation of a tile calls
// it. The read tile keeps full ink and the others ease to 0.8; the readout
// opens over it with the group as its header.

import PolymorphTokens
import SwiftUI

public struct PMTreemap: PMTreemapRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.locale) private var environmentLocale
  @State private var reading: PMChartReading?
  private let props: PMTreemapProps

  public init(props: PMTreemapProps) {
    self.init(props: props, reading: nil)
  }

  /// A chart already read at `reading`: the states fixture's way to show the readout.
  init(props: PMTreemapProps, reading: PMChartReading?) {
    self.props = props
    _reading = State(initialValue: reading)
  }

  public var body: some View {
    let model = TreemapModel(props: props, theme: theme, locale: locale)
    let state = PMChartState(empty: props.items.isEmpty, loading: props.loading)
    PMChartFrame(
      member: "Treemap", label: props.label, size: props.size ?? .md, state: state,
      attributes: [:], empty: model.messages.empty, twin: model.twin, messages: model.messages
    ) {
      if props.items.isEmpty {
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

  // MARK: The plot

  private func plot(_ model: TreemapModel) -> some View {
    GeometryReader { geometry in
      let size = geometry.size
      let tiles = model.tiling.tiles(
        width: size.width, height: size.height, metrics: model.metrics(theme))
      ZStack(alignment: .topLeading) {
        ForEach(tiles, id: \.index) { tile in
          RoundedRectangle(cornerRadius: PMChartMetrics.barEnd)
            .fill(model.paint(tile.index).color)
            .frame(width: tile.paint.width, height: tile.paint.height)
            .padding(.leading, tile.paint.minX)
            .padding(.top, tile.paint.minY)
            .opacity(reading == nil || reading?.index == tile.index ? 1 : PMChartMetrics.lift)
            .accessibilityHidden(true)
        }
        ForEach(tiles.filter { $0.plate != nil }, id: \.index) { tile in
          if let plate = tile.plate { self.plate(plate) }
        }
        ForEach(tiles, id: \.index) { tile in
          element(tile, model: model, count: tiles.count)
        }
        if let reading, model.tooltip.visible, tiles.indices.contains(reading.index) {
          let rect = tiles[reading.index].rect
          let margin = PMRecipe.treemapReadoutMargin
          let point = CGPoint(
            x: rect.midX, y: min(size.height - margin, max(margin, rect.midY)))
          PMChartAnchor(point: point, opensLeading: point.x > size.width / 2) {
            PMChartReadout(
              header: model.tiling.leaves[reading.index].group, rows: [model.row(reading.index)],
              style: model.tooltip)
          }
        }
      }
      .frame(width: size.width, height: size.height, alignment: .topLeading)
      .contentShape(.rect)
      .gesture(
        SpatialTapGesture().onEnded { tap in
          // The targets lie over the paint in reading order, so a small
          // item's target, grown past its tile, wins over its neighbour's.
          if let tile = tiles.last(where: { $0.hit.contains(tap.location) }) {
            tapped(tile.index, model: model)
          }
        })
    }
    .pmChartMarks(
      label: props.label, interactive: !model.tiling.leaves.isEmpty, descriptor: model.descriptor
    ) { key in handle(key, model: model) }
  }

  /// A tile's label plate: the label over the value, on the surface, one
  /// line each, ending in an ellipsis where the estimate fell short.
  private func plate(_ plate: PMTreemapTiling.Plate) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(plate.label)
        .foregroundStyle(theme.colors.textPrimary.color)
      Text(plate.value)
        .foregroundStyle(theme.colors.textSecondary.color)
        .pmTabularFigures(theme.numeric.tabular)
    }
    .lineLimit(1)
    .truncationMode(.tail)
    .pmTextStyle(theme.text.xs)
    .padding(.horizontal, theme.defaultDensity.space.s1)
    .padding(.vertical, PMRecipe.treemapPlatePadding)
    .background(
      theme.colors.bgSurface.color, in: RoundedRectangle(cornerRadius: theme.radius.sm))
    .frame(maxWidth: plate.width, alignment: .leading)
    .fixedSize(horizontal: false, vertical: true)
    .padding(.leading, plate.x)
    .padding(.top, plate.y)
    .accessibilityHidden(true)
  }

  /// A tile as VoiceOver finds it: its target's frame, named by its group and
  /// label, its value the item's value and share, in reading order.
  private func element(_ tile: PMTreemapTiling.Tile, model: TreemapModel, count: Int)
    -> some View
  {
    let leaf = model.tiling.leaves[tile.index]
    let name = leaf.group.map { "\($0), \(leaf.label)" } ?? leaf.label
    return Rectangle()
      .fill(.clear)
      .frame(width: tile.hit.width, height: tile.hit.height)
      .accessibilityElement()
      .accessibilityLabel(Text(name))
      .accessibilityValue(Text(model.tiling.spoken(tile.index)))
      .accessibilitySortPriority(Double(count - tile.index))
      .modifier(TreemapActivation(selectable: props.onSelect != nil) { select(tile.index, model) })
      .padding(.leading, tile.hit.minX)
      .padding(.top, tile.hit.minY)
  }

  // MARK: Reading

  private func tapped(_ index: Int, model: TreemapModel) {
    if reading?.index == index, props.onSelect != nil {
      select(index, model)
    } else {
      reading = PMChartReading(index: index)
    }
  }

  private func handle(_ key: PMChartKey, model: TreemapModel) {
    let count = model.tiling.leaves.count
    switch key {
    case .next, .extendNext, .down: reading = .step(reading, by: 1, count: count)
    case .previous, .extendPrevious, .up: reading = .step(reading, by: -1, count: count)
    case .activate:
      if let reading { select(reading.index, model) }
    case .escape: reading = nil
    }
  }

  private func select(_ index: Int, _ model: TreemapModel) {
    guard let onSelect = props.onSelect, let selection = model.tiling.selection(index) else {
      return
    }
    onSelect(selection)
  }
}

/// A tile's activation, with `onSelect`: VoiceOver's double tap calls it.
private struct TreemapActivation: ViewModifier {
  let selectable: Bool
  let activate: () -> Void

  func body(content: Content) -> some View {
    if selectable {
      content.accessibilityAction { activate() }
    } else {
      content
    }
  }
}

// MARK: - The model

/// What the chart draws, from its props and the theme: the engine's
/// `treemapModel` with its tiles laid out at the measured plot.
@MainActor
private struct TreemapModel {
  let tiling: PMTreemapTiling
  /// The groups with their colours, for the legend and the tiles: the
  /// top-level items when any has children, else none.
  let painted: [PMChartPaint]
  /// The one series' paint, slot 1, which a treemap of one level takes throughout.
  let single: PMDynamicColor
  let messages: PMChartMessages
  let text: PMChartText
  let tooltip: PMChartTooltipStyle
  let summary: String
  let twin: PMChartTwinModel
  let label: String

  init(props: PMTreemapProps, theme: PMTheme, locale: Locale) {
    let messages = props.messages ?? PMSpecDefault.chartMessages
    let text = PMChartText(locale: locale, messages: messages)
    let tiling = PMTreemapTiling(items: props.items, format: props.format, text: text)
    self.tiling = tiling
    self.painted =
      tiling.grouped
      ? PMChartPalette.series(
        props.items.map { PMChartSeries(key: $0.key, label: $0.label) }, theme)
      : []
    self.single = theme.chart.chart1
    self.messages = messages
    self.text = text
    self.tooltip = PMChartTooltipStyle(props.tooltip)
    self.summary = messages.treemapSummary(tiling.facts(label: props.label))
    self.twin = PMChartTwinModel(
      columns: (tiling.grouped ? [PMChartTwinModel.Column(label: messages.groupColumn)] : []) + [
        PMChartTwinModel.Column(label: messages.itemColumn),
        PMChartTwinModel.Column(label: messages.valueColumn, numeric: true),
        PMChartTwinModel.Column(label: messages.shareColumn, numeric: true),
      ],
      rows: tiling.twinRows)
    self.label = props.label
  }

  /// How the plates' words are estimated, as the engine estimates them, and
  /// the plate's padding across, `space-1`.
  func metrics(_ theme: PMTheme) -> PMTreemapTiling.Metrics {
    let size = PMRecipe.chartTextEstimate
    return PMTreemapTiling.Metrics(
      size: size, line: size * PMRecipe.chartLineEstimate, padding: theme.defaultDensity.space.s1)
  }

  /// A tile's paint: its group's colour with groups, else slot 1.
  func paint(_ index: Int) -> PMDynamicColor {
    let top = tiling.leaves[index].top
    return tiling.grouped && painted.indices.contains(top) ? painted[top].paint : single
  }

  /// The readout's row at a tile: the item, then its value and share.
  func row(_ index: Int) -> PMChartReadoutRow {
    let leaf = tiling.leaves[index]
    return PMChartReadoutRow(
      key: leaf.id, label: leaf.label, value: tiling.amount(index), paint: paint(index))
  }

  /// The audio graph: one value per tile, in reading order.
  var descriptor: PMChartDescriptor? {
    let leaves = tiling.leaves
    guard !leaves.isEmpty else { return nil }
    let names = leaves.map { leaf in leaf.group.map { "\($0), \(leaf.label)" } ?? leaf.label }
    return PMChartDescriptor(
      title: label, summary: summary, xTitle: messages.itemColumn, bands: names, xRange: 0...1,
      xFormat: nil, yTitle: messages.valueColumn,
      yRange: 0...max(1, leaves.map(\.value).max() ?? 1), yFormat: tiling.format,
      locale: text.locale,
      series: [
        PMChartDescriptor.Series(
          name: label, continuous: false,
          points: leaves.enumerated().map { (band: names[$0], x: Double($0), y: $1.value) })
      ])
  }
}

// MARK: - States

/// Treemap's states, from the spec's States table, with the reading shown.
public struct TreemapStates: PMStates {
  public let member = "Treemap"

  public init() {}

  /// Relay's storage, in gigabytes, by kind.
  private static let storage = [
    PMTreemapItem(key: "attachments", label: "Attachments", value: 420),
    PMTreemapItem(key: "images", label: "Inline images", value: 260),
    PMTreemapItem(key: "exports", label: "Exports", value: 180),
    PMTreemapItem(key: "audit", label: "Audit log", value: 90),
    PMTreemapItem(key: "avatars", label: "Avatars", value: 50),
  ]

  /// Relay's open tickets by team, and within each team by channel.
  private static let teams = [
    PMTreemapItem(
      key: "support", label: "Support", value: 340,
      children: [
        PMTreemapItem(key: "support-email", label: "Email", value: 180),
        PMTreemapItem(key: "support-chat", label: "Chat", value: 120),
        PMTreemapItem(key: "support-phone", label: "Phone", value: 40),
      ]),
    PMTreemapItem(
      key: "technical", label: "Technical", value: 140,
      children: [
        PMTreemapItem(key: "technical-email", label: "Email", value: 70),
        PMTreemapItem(key: "technical-chat", label: "Chat", value: 50),
        PMTreemapItem(key: "technical-phone", label: "Phone", value: 20),
      ]),
    PMTreemapItem(
      key: "billing", label: "Billing", value: 120,
      children: [
        PMTreemapItem(key: "billing-email", label: "Email", value: 90),
        PMTreemapItem(key: "billing-chat", label: "Chat", value: 30),
      ]),
    PMTreemapItem(key: "partners", label: "Partners", value: 35),
  ]

  /// One workspace that holds nearly everything, and forty that hold almost nothing.
  private static let skewed =
    [PMTreemapItem(key: "main", label: "Main workspace", value: 96_000)]
    + (0..<40).map { index in
      PMTreemapItem(
        key: "sandbox-\(index + 1)", label: "Sandbox \(index + 1)", value: Double(20 + index * 3))
    }

  public var entries: [PMStateEntry] {
    let storage = PMTreemapProps(items: Self.storage, label: "Storage by kind, in gigabytes")
    let teams = PMTreemapProps(items: Self.teams, label: "Open tickets by team and channel")
    return [
      PMStateEntry("storage", expect: ["size": "md", "label": "Storage by kind, in gigabytes"]) {
        PMTreemap(props: storage)
      },
      // Two levels: each team in its own colour, its channels inside it.
      PMStateEntry("two levels") { PMTreemap(props: teams) },
      PMStateEntry("one item") {
        PMTreemap(
          props: PMTreemapProps(
            items: Array(Self.storage.prefix(1)), label: "Storage by kind, in gigabytes"))
      },
      // Nothing takes area; the twin lists every item and the summary says none is drawn.
      PMStateEntry("all zero") {
        PMTreemap(
          props: PMTreemapProps(
            items: [
              PMTreemapItem(key: "email", label: "Email", value: 0),
              PMTreemapItem(key: "chat", label: "Chat", value: 0),
            ], label: "Escalations by channel"))
      },
      PMStateEntry("one huge, many tiny") {
        PMTreemap(
          props: PMTreemapProps(items: Self.skewed, label: "Storage by workspace, in megabytes"))
      },
      PMStateEntry("long labels") {
        PMTreemap(
          props: PMTreemapProps(
            items: [
              PMTreemapItem(
                key: "archive",
                label: "Archived exports from the previous storage provider, kept for audit",
                value: 300),
              PMTreemapItem(key: "current", label: "Current exports", value: 200),
              PMTreemapItem(
                key: "scheduled",
                label: "Scheduled reports waiting for delivery to the finance team", value: 60),
            ], label: "Exports"))
      },
      // A zero and a negative take no area; they stay in the twin and the summary counts them.
      PMStateEntry("absent items") {
        PMTreemap(
          props: PMTreemapProps(
            items: Array(Self.storage.prefix(3)) + [
              PMTreemapItem(key: "trash", label: "Trash", value: 0),
              PMTreemapItem(key: "credit", label: "Storage credit", value: -40),
            ], label: "Storage by kind, in gigabytes"))
      },
      // A third level is summed into the second.
      PMStateEntry("three levels") {
        PMTreemap(
          props: PMTreemapProps(
            items: [
              PMTreemapItem(
                key: "engineering", label: "Engineering", value: 90,
                children: [
                  PMTreemapItem(
                    key: "platform", label: "Platform", value: 60,
                    children: [
                      PMTreemapItem(key: "databases", label: "Databases", value: 35),
                      PMTreemapItem(key: "network", label: "Network", value: 25),
                    ]),
                  PMTreemapItem(key: "apps", label: "Apps", value: 30),
                ]),
              PMTreemapItem(key: "design", label: "Design", value: 40),
            ], label: "Seats by team"))
      },
      PMStateEntry("format") {
        PMTreemap(
          props: PMTreemapProps(
            format: PMValueFormat(style: .currency, currency: "USD", maximumFractionDigits: 0),
            items: [
              PMTreemapItem(key: "compute", label: "Compute", value: 48_200),
              PMTreemapItem(key: "storage", label: "Storage", value: 21_400),
              PMTreemapItem(key: "egress", label: "Egress", value: 9600),
              PMTreemapItem(key: "support", label: "Support", value: 4100),
            ], label: "Spend by line"))
      },
      PMStateEntry("small", expect: ["size": "sm"]) {
        PMTreemap(
          props: PMTreemapProps(
            items: Self.teams, label: "Open tickets by team and channel", size: .sm))
      },
      PMStateEntry("empty", expect: ["state": "empty"]) {
        PMTreemap(props: PMTreemapProps(items: [], label: "Storage by kind, in gigabytes"))
      },
      PMStateEntry("loading", expect: ["state": "loading"]) {
        PMTreemap(
          props: PMTreemapProps(
            items: Self.storage, label: "Storage by kind, in gigabytes", loading: true))
      },
      PMStateEntry("tooltip off") {
        PMTreemap(
          props: PMTreemapProps(
            items: Self.storage, label: "Storage by kind, in gigabytes, print", tooltip: .off),
          reading: PMChartReading(index: 1))
      },
      PMStateEntry("reading a tile") {
        PMTreemap(props: teams, reading: PMChartReading(index: 2))
      },
    ]
  }
}
