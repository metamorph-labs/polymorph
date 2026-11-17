// SplitPane (`design/components/split-pane.md`), adapted: side by side on iPad,
// one pane at a time on iPhone.
//
// - **The split** (a regular width class, and macOS): the start pane, the
//   divider and the end pane on the orientation's axis, the panes sharing the
//   length the divider leaves by `ratio`, never by points. The floors
//   (`startMin`, `endMin`, in points) hold whatever the ratio says, as the
//   web's `minmax()` does, and the divider's moves clamp to the same floors.
//   The divider is a `space.2` seam with a one-point line down its centre in
//   `border.default`, `border.strong` under a pointer, and `accent.bg` two
//   points wide while it is dragged or focused. Its hit area reaches the
//   theme's `hitTarget` across the seam without moving the panes. Dragging
//   it follows the finger; arrow keys on the split axis move it by 2 of 100,
//   Page Up and Page Down by 10, Home and End to the floors, and each key
//   step commits, as a release does. To assistive technology it is one
//   adjustable element, its frame the hit area, named by `label`, its value
//   the start pane's share in percent; each adjustment is a step, and
//   commits.
// - **The pager** (a compact width class): the two panes side by side in a
//   horizontal paging scroll view, each as wide as the view, with two dots
//   under them marking which one shows. A phone has no room for two reading
//   columns, and a pane is never hidden, so the reader swipes between them.
//   VoiceOver reaches both panes' content in order and pages to it. The
//   ratio, the floors and `label` have no meaning here, so nothing reports a
//   ratio and the dots are decorative.
//
// Nothing animates the split: the ratio follows the reader's finger, and a
// transitioned pane would lag behind it. Only the divider's colours change at
// the control duration.

import PolymorphTokens
import SwiftUI

public struct PMSplitPane: PMSplitPaneRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmSplitPaneLayout) private var forced
  @Environment(\.pmPageScrolls) private var scrolls
  @Environment(\.layoutDirection) private var direction
  #if os(iOS)
    @Environment(\.horizontalSizeClass) private var sizeClass
  #endif
  @State private var mirror: Double
  @State private var length: CGFloat = 0
  @State private var dragStart: Double?
  @State private var latest: Double?
  @State private var hovering = false
  @State private var page: Int? = 0
  @FocusState private var focused: Bool
  private let props: PMSplitPaneProps

  public init(props: PMSplitPaneProps) {
    self.props = props
    _mirror = State(initialValue: Self.unit(props.defaultRatio ?? PMSpecDefault.splitPaneRatio))
  }

  /// The split on a regular width class, the pager on a compact one.
  private var layout: PMSplitPaneLayout {
    if let forced { return forced }
    #if os(iOS)
      return sizeClass == .compact ? .pager : .split
    #else
      return .split
    #endif
  }

  public var body: some View {
    switch layout {
    case .split: split
    case .pager: pager
    }
  }

  // MARK: The split

  private var horizontal: Bool { (props.orientation ?? .horizontal) == .horizontal }

  /// The divider's seam, which the panes share the rest of the length around.
  private var seam: CGFloat { theme.defaultDensity.space.s2 }

  private var startMin: CGFloat { CGFloat(props.startMin ?? 0) }
  private var endMin: CGFloat { CGFloat(props.endMin ?? 0) }

  /// The floors as shares of the measured length: the clamp every move keeps
  /// to, and the whole range before the first measurement or when the box is
  /// too small for both floors.
  private var bounds: ClosedRange<Double> {
    let usable = length - seam
    guard usable > 0, startMin + endMin < usable else { return 0...1 }
    return Self.unit(Double(startMin / usable))...Self.unit(Double(1 - endMin / usable))
  }

  /// The ratio as drawn and reported: the app's when controlled, the member's
  /// own otherwise, held to the floors.
  private var effective: Double {
    let ratio = Self.unit(props.ratio ?? mirror)
    return min(bounds.upperBound, max(bounds.lowerBound, ratio))
  }

  private var split: some View {
    let orientation = props.orientation ?? .horizontal
    var attributes = [
      "orientation": orientation.rawValue, "layout": PMSplitPaneLayout.split.rawValue,
      "ratio": String(Int((effective * 100).rounded())),
    ]
    if dragStart != nil { attributes["state"] = "dragging" }

    return PMSplitTracks(
      axis: horizontal ? .horizontal : .vertical, ratio: CGFloat(effective), startMin: startMin,
      endMin: endMin, seam: seam
    ) {
      props.start.clipped()
      props.end.clipped()
      divider
    }
    .onGeometryChange(for: CGFloat.self) { proxy in
      horizontal ? proxy.size.width : proxy.size.height
    } action: {
      length = $0
    }
    // A controlled ratio the app changes is where the next move starts from.
    .onChange(of: props.ratio) { _, _ in latest = nil }
    .accessibilityElement(children: .contain)
    .pmMember("SplitPane", attributes)
  }

  private var divider: some View {
    let colors = theme.colors
    let motion = theme.defaultMotion
    let active = dragStart != nil || focused
    let line = active ? colors.accentBg : hovering ? colors.borderStrong : colors.borderDefault
    let weight = active ? PMRule.thickness * 2 : PMRule.thickness
    let target = theme.defaultDensity.hitTarget

    return Rectangle()
      .fill(line.color)
      .frame(width: horizontal ? weight : nil, height: horizontal ? nil : weight)
      .frame(
        maxWidth: horizontal ? seam : .infinity, maxHeight: horizontal ? .infinity : seam
      )
      .animation(
        motion.easing.standard.animation(duration: motion.duration.control),
        value: [active, hovering]
      )
      // The seam is drawn; the hit area over it is the element.
      .accessibilityHidden(true)
      .overlay {
        // The hit area: the theme's hit target across the seam, centred on it,
        // over the panes' edges. It is the adjustable element, so VoiceOver's
        // frame is as large as a finger's.
        Color.clear
          .frame(width: horizontal ? target : nil, height: horizontal ? nil : target)
          .contentShape(.rect)
          .gesture(drag)
          .onHover { hovering = $0 }
          .accessibilityElement(children: .ignore)
          .accessibilityLabel(Text(props.label))
          .accessibilityValue(Text(effective, format: .percent.precision(.fractionLength(0))))
          .accessibilityAdjustableAction { adjustment in
            switch adjustment {
            case .increment: move(effective + PMRecipe.splitPaneStep)
            case .decrement: move(effective - PMRecipe.splitPaneStep)
            @unknown default: return
            }
            commit()
          }
      }
      .pmFocusRing(focused, cornerRadius: theme.radius.sm)
      .focusable()
      .focused($focused)
      .onKeyPress(keys: Self.keys, phases: .down) { press in
        step(press.key) ? .handled : .ignored
      }
  }

  /// The drag: the divider's centre follows the finger, from the ratio it
  /// started at, over the length the seam leaves. Right to left, a side-by-side
  /// split is mirrored, so a move to the right shrinks the start pane.
  private var drag: some Gesture {
    DragGesture(minimumDistance: 0, coordinateSpace: .global)
      .onChanged { value in
        let start = dragStart ?? effective
        if dragStart == nil { dragStart = start }
        let usable = length - seam
        guard usable > 0 else { return }
        let along = horizontal ? value.translation.width : value.translation.height
        let signed = horizontal && direction == .rightToLeft ? -along : along
        move(start + Double(signed / usable))
      }
      .onEnded { _ in
        dragStart = nil
        commit()
      }
  }

  /// The keys the divider answers: the split axis's arrows, Page Up and Page
  /// Down, Home and End. The cross axis's arrows do nothing, so a reader moving
  /// past does not move the layout.
  private static let keys: Set<KeyEquivalent> = [
    .leftArrow, .rightArrow, .upArrow, .downArrow, .pageUp, .pageDown, .home, .end,
  ]

  /// One keyboard step; `false` for a key the orientation does not use.
  private func step(_ key: KeyEquivalent) -> Bool {
    let rtl = horizontal && direction == .rightToLeft
    let grow: KeyEquivalent = horizontal ? (rtl ? .leftArrow : .rightArrow) : .downArrow
    let shrink: KeyEquivalent = horizontal ? (rtl ? .rightArrow : .leftArrow) : .upArrow
    let next: Double
    switch key {
    case grow: next = effective + PMRecipe.splitPaneStep
    case shrink: next = effective - PMRecipe.splitPaneStep
    case .pageUp: next = effective + PMRecipe.splitPanePageStep
    case .pageDown: next = effective - PMRecipe.splitPanePageStep
    case .home: next = bounds.lowerBound
    case .end: next = bounds.upperBound
    default: return false
    }
    move(next)
    commit()
    return true
  }

  /// Moves the divider to `next`, held to the floors and rounded to four
  /// decimals, so 2% steps land on 2% marks rather than on a double's error;
  /// reports the change.
  private func move(_ next: Double) {
    let clamped = Self.quantize(min(bounds.upperBound, max(bounds.lowerBound, Self.unit(next))))
    guard clamped != (latest ?? effective) else { return }
    latest = clamped
    mirror = clamped
    props.onRatioChange?(clamped)
  }

  /// Reports the ratio the last move reached, on release and after each step.
  private func commit() {
    props.onCommit?(latest ?? effective)
  }

  private static func unit(_ value: Double) -> Double { min(1, max(0, value)) }
  private static func quantize(_ value: Double) -> Double { (value * 10000).rounded() / 10000 }

  // MARK: The pager

  private var pager: some View {
    let space = theme.defaultDensity.space
    let current = page ?? 0

    return VStack(spacing: space.s3) {
      Group {
        if scrolls {
          ScrollView(.horizontal) {
            HStack(spacing: 0) {
              props.start.containerRelativeFrame(.horizontal).clipped().id(0)
              props.end.containerRelativeFrame(.horizontal).clipped().id(1)
            }
            .scrollTargetLayout()
          }
          .scrollTargetBehavior(.paging)
          .scrollIndicators(.hidden)
          .scrollPosition(id: $page)
        } else {
          // At rest: the first pane, where the pager starts.
          props.start
            .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
            .clipped()
        }
      }
      .frame(maxHeight: .infinity)
      PMSplitPaneDots(current: current)
    }
    .accessibilityElement(children: .contain)
    .pmMember(
      "SplitPane",
      [
        "orientation": (props.orientation ?? .horizontal).rawValue,
        "layout": PMSplitPaneLayout.pager.rawValue,
        "pane": current == 0 ? "start" : "end",
      ])
  }
}

/// The pager's two dots: the pane that shows in `accent.bg`, the other in
/// `border.strong`, the neutral ramp's strongest step, so both read at rest.
/// Decorative: VoiceOver pages by moving through the panes' content.
private struct PMSplitPaneDots: View {
  @Environment(\.pmTheme) private var theme
  let current: Int

  var body: some View {
    let space = theme.defaultDensity.space
    HStack(spacing: space.s2) {
      ForEach(0..<2, id: \.self) { index in
        Circle()
          .fill((index == current ? theme.colors.accentBg : theme.colors.borderStrong).color)
          .frame(width: space.s2, height: space.s2)
      }
    }
    .accessibilityHidden(true)
  }
}

/// The split's three tracks on one axis: the start pane, the end pane and the
/// divider, in that order of subviews, so the divider's hit area is drawn over
/// the panes' edges; placed start, divider, end. The panes share the length
/// the seam leaves by `ratio`, and each floor holds whatever the ratio says;
/// when the floors together exceed the length, the start keeps its floor and
/// the end takes what is left.
struct PMSplitTracks: Layout {
  let axis: Axis
  let ratio: CGFloat
  let startMin: CGFloat
  let endMin: CGFloat
  let seam: CGFloat

  private func extents(_ length: CGFloat) -> (start: CGFloat, end: CGFloat) {
    let usable = max(0, length - seam)
    let start = max(startMin, min(usable * ratio, usable - endMin))
    return (start, max(0, usable - start))
  }

  private func offer(_ along: CGFloat, _ across: CGFloat?) -> ProposedViewSize {
    axis == .horizontal
      ? ProposedViewSize(width: along, height: across)
      : ProposedViewSize(width: across, height: along)
  }

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    guard subviews.count == 3 else { return .zero }
    let horizontal = axis == .horizontal
    let offeredAlong = horizontal ? proposal.width : proposal.height
    let offeredAcross = horizontal ? proposal.height : proposal.width
    let along =
      offeredAlong.flatMap { $0.isFinite ? $0 : nil }
      ?? [subviews[0], subviews[1]].map {
        let ideal = $0.sizeThatFits(.unspecified)
        return horizontal ? ideal.width : ideal.height
      }.reduce(seam, +)
    let (start, end) = extents(along)
    let across =
      offeredAcross.flatMap { $0.isFinite ? $0 : nil }
      ?? [(subviews[0], start), (subviews[1], end)].map { pane, extent in
        let size = pane.sizeThatFits(offer(extent, nil))
        return horizontal ? size.height : size.width
      }.max() ?? 0
    return horizontal
      ? CGSize(width: along, height: across) : CGSize(width: across, height: along)
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    guard subviews.count == 3 else { return }
    let horizontal = axis == .horizontal
    let (start, end) = extents(horizontal ? bounds.width : bounds.height)
    let across = horizontal ? bounds.height : bounds.width
    let origins = [CGFloat(0), start + seam, start]
    let lengths = [start, end, seam]
    for (index, subview) in subviews.enumerated() {
      let point =
        horizontal
        ? CGPoint(x: bounds.minX + origins[index], y: bounds.minY)
        : CGPoint(x: bounds.minX, y: bounds.minY + origins[index])
      subview.place(at: point, anchor: .topLeading, proposal: offer(lengths[index], across))
    }
  }
}

/// Which form a SplitPane draws. A fixture or a page that has measured its
/// own room can fix it with `\.pmSplitPaneLayout`; otherwise the width class
/// decides.
enum PMSplitPaneLayout: String {
  case split, pager
}

private struct PMSplitPaneLayoutKey: EnvironmentKey {
  static let defaultValue: PMSplitPaneLayout? = nil
}

extension EnvironmentValues {
  /// The SplitPane form to draw regardless of the width class, or `nil` to follow it.
  var pmSplitPaneLayout: PMSplitPaneLayout? {
    get { self[PMSplitPaneLayoutKey.self] }
    set { self[PMSplitPaneLayoutKey.self] = newValue }
  }
}

/// SplitPane's states, from the spec's States table, each in the split at a
/// narrow iPad window's width scaled to the canvas, and the pager a phone
/// draws. The harness turns scrolling off, because `ImageRenderer` draws no
/// scroll view's content, so the pager's entry shows it at rest, on its first
/// pane. The divider's pointer and focus states come from the reader, not
/// from props, so no entry draws them.
public struct SplitPaneStates: PMStates {
  public let member = "SplitPane"

  public init() {}

  private static let navigator = "Resize navigator"
  private static let response = "Resize response"

  private static func pane(_ name: String) -> PMContent {
    AnyView(PMSplitPaneSample(name: name))
  }

  private static func split(
    label: String = navigator, start: String = "navigator", end: String = "canvas",
    orientation: PMSplitPaneOrientation? = nil, ratio: Double? = nil,
    defaultRatio: Double? = nil, floors: Double? = nil
  ) -> PMSplitPane {
    PMSplitPane(
      props: PMSplitPaneProps(
        defaultRatio: defaultRatio, end: pane(end), endMin: floors, label: label,
        onCommit: { _ in }, onRatioChange: { _ in }, orientation: orientation, ratio: ratio,
        start: pane(start), startMin: floors))
  }

  private static func wide(_ view: PMSplitPane) -> some View {
    view.environment(\.pmSplitPaneLayout, .split).pmFixtureWidth(PMFixtureWindow.narrowIPad)
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "even — the default apportionment",
        expect: ["layout": "split", "orientation": "horizontal", "ratio": "50"]
      ) {
        Self.wide(Self.split())
      },
      PMStateEntry("apportioned — a narrow start pane", expect: ["ratio": "30"]) {
        Self.wide(Self.split(defaultRatio: 0.3))
      },
      PMStateEntry("floors — minmax holds what the ratio cannot", expect: ["ratio": "27"]) {
        Self.wide(Self.split(defaultRatio: 0.1, floors: 160))
      },
      PMStateEntry(
        "stacked — request above response", expect: ["orientation": "vertical", "ratio": "50"]
      ) {
        PMSplitPaneStacked(
          split: Self.split(
            label: Self.response, start: "request", end: "response", orientation: .vertical))
      },
      PMStateEntry("controlled — the app owns the ratio", expect: ["ratio": "66"]) {
        Self.wide(Self.split(ratio: 0.66))
      },
      PMStateEntry(
        "on a phone — one pane at a time", expect: ["layout": "pager", "pane": "start"]
      ) {
        Self.split()
          .environment(\.pmSplitPaneLayout, .pager)
      },
    ]
  }
}

/// The stacked split in a box of a fixed height, which the ratio shares: four
/// of the largest space step.
private struct PMSplitPaneStacked: View {
  @Environment(\.pmTheme) private var theme
  let split: PMSplitPane

  var body: some View {
    split
      .environment(\.pmSplitPaneLayout, .split)
      .frame(height: theme.defaultDensity.space.s10 * PMFixtureSpan.region)
  }
}

/// A sample pane: its name on the subtle fill, inside a subtle border, two of
/// the largest space step tall at least, the web fixture's tall box.
private struct PMSplitPaneSample: View {
  @Environment(\.pmTheme) private var theme
  let name: String

  var body: some View {
    let shape = RoundedRectangle(cornerRadius: theme.radius.md)
    Text(name)
      .pmTextStyle(theme.text.sm)
      .foregroundStyle(theme.colors.textSecondary.color)
      .frame(maxWidth: .infinity, minHeight: theme.defaultDensity.space.s10 * PMFixtureSpan.sample)
      .frame(maxHeight: .infinity)
      .background(theme.colors.bgSubtle.color, in: shape)
      .overlay { shape.strokeBorder(theme.colors.borderSubtle.color, lineWidth: 1) }
  }
}
