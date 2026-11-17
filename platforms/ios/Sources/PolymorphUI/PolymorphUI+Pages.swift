// The page archetypes' shared parts (`design/archetypes/*.md`, and
// `design/native/screen-contract.md` for the load states): the page column, its
// insets, measure and gutter, one space step smaller in a region narrower than
// 40rem; the body panel in Card's surface recipe; the failed state's Alert; the
// loading state's Skeleton rows; the body of two regions that stacks below
// 44rem (DetailPage, Dashboard); the page-transitions convention's pending
// ribbon and arrival (AuthPage, AppShell); and a fixture's page drawn from its
// top. Every archetype draws with them, so each is its regions and its states
// and nothing more.

import PolymorphTokens
import SwiftUI

/// The column every page archetype draws: its regions in order with the
/// content gutter between them, inside the page insets, no wider than the
/// measure, in a scroll view. The root carries the member's identity and the
/// load status.
struct PMPage<Content: View>: View {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmPageScrolls) private var scrolls
  let measure: CGFloat
  let member: String
  let status: PMLoadStatus
  @ViewBuilder let content: () -> Content

  var body: some View {
    let space = theme.defaultDensity.space
    let motion = theme.defaultMotion
    let column = PMPageColumn(
      wide: (space.s7, space.s6), narrow: (space.s6, space.s5), maxWidth: space.s10 * measure
    ) {
      VStack(alignment: .leading, spacing: space.s6) {
        content()
      }
      .animation(
        motion.easing.standard.animation(duration: motion.duration.surface), value: status.kind)
    }
    Group {
      if scrolls {
        ScrollView { column }
      } else {
        column
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .background(theme.colors.bgApp.color)
    .accessibilityElement(children: .contain)
    .pmMember(member, ["status": status.kind])
  }
}

extension PMLoadStatus {
  /// The state's name: `loading`, `ready`, `empty` or `failed`.
  var kind: String {
    switch self {
    case .loading: "loading"
    case .ready: "ready"
    case .empty: "empty"
    case .failed: "failed"
    }
  }
}

/// The page's insets and measure. Its own width decides the insets, as the
/// web's page queries the region that holds it: below 40rem one space step
/// smaller on each axis. The page is no wider than `maxWidth` with its insets,
/// as the recipes' `max-inline-size` measures the border box, and its content
/// is centred inside them.
struct PMPageColumn: Layout {
  let wide: (horizontal: CGFloat, vertical: CGFloat)
  let narrow: (horizontal: CGFloat, vertical: CGFloat)
  let maxWidth: CGFloat

  /// The width below which a page steps its insets down, the recipes' 40rem.
  /// Geometry, not theme.
  private static let breakpoint = PMRecipe.pageNarrowBelow

  private func insets(_ width: CGFloat) -> (horizontal: CGFloat, vertical: CGFloat) {
    width < Self.breakpoint ? narrow : wide
  }

  private func contentWidth(_ width: CGFloat) -> CGFloat {
    max(0, min(maxWidth, width) - insets(width).horizontal * 2)
  }

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    guard let content = subviews.first else { return .zero }
    let offered = proposal.width.flatMap { $0.isFinite ? $0 : nil }
    let width = offered ?? (content.sizeThatFits(.unspecified).width + wide.horizontal * 2)
    let inset = insets(width)
    let height = content.sizeThatFits(ProposedViewSize(width: contentWidth(width), height: nil))
      .height
    return CGSize(width: width, height: height + inset.vertical * 2)
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    let width = contentWidth(bounds.width)
    subviews.first?.place(
      at: CGPoint(x: bounds.midX - width / 2, y: bounds.minY + insets(bounds.width).vertical),
      anchor: .topLeading, proposal: ProposedViewSize(width: width, height: nil))
  }
}

/// A page's body panel: Card's surface recipe exactly, clipped, so a table's
/// rows reach its edges.
struct PMPagePanel<Content: View>: View {
  @Environment(\.pmTheme) private var theme
  @ViewBuilder let content: () -> Content

  var body: some View {
    let shape = RoundedRectangle(cornerRadius: theme.radius.surface)
    content()
      .frame(maxWidth: .infinity, alignment: .topLeading)
      .background(theme.colors.bgSurface.color)
      .clipShape(shape)
      .overlay { shape.strokeBorder(theme.colors.borderSubtle.color, lineWidth: 1) }
      .pmInsetShadow(theme.insetTop, in: shape)
      .pmShadow(theme.shadows.resting)
      .transition(.opacity)
  }
}

/// The failed state: a danger Alert with the message as its body, and the retry
/// as its action when the page has one. Alert announces nothing of its own,
/// because an Alert is usually on the screen from the start; a failure arrives
/// after the screen did, so it is announced when it appears, at high priority,
/// as the web's danger Alert is `aria-live="assertive"` (`alert.md`).
struct PMPageFailure: View {
  let message: String
  let onRetry: (@MainActor () -> Void)?

  var body: some View {
    PMAlert(
      props: PMAlertProps(
        action: onRetry.map { retry in
          AnyView(
            PMButton(
              props: PMButtonProps(
                label: PMStrings.retry, onClick: retry, size: .sm, appearance: .softDanger)))
        },
        children: AnyView(Text(message)), tone: .danger)
    )
    .pmLiveAnnouncement(message, assertive: true)
  }
}

/// The loading body: rows of text Skeletons separated by rules, the first named
/// "Loading" for assistive technology and the rest hidden.
struct PMPageSkeletonRows: View {
  @Environment(\.pmTheme) private var theme
  var rows = 5

  var body: some View {
    let space = theme.defaultDensity.space
    VStack(alignment: .leading, spacing: space.s4) {
      ForEach(0..<rows, id: \.self) { row in
        VStack(alignment: .leading, spacing: space.s2) {
          PMSkeleton(
            props: PMSkeletonProps(label: row == 0 ? PMStrings.loading : nil, textStep: .sm))
          PMSkeleton(props: PMSkeletonProps(textStep: .xs, width: .width10))
        }
      }
    }
  }
}

private struct PMPageScrollsKey: EnvironmentKey {
  static let defaultValue = true
}

extension EnvironmentValues {
  /// Whether a page archetype, or a member that scrolls in place (a wide
  /// CodeBlock, a wide Tabs row, Carousel's paging viewport, ScrollArea's
  /// viewport, SplitPane's pager), draws its scroll view. The rendering harness turns it off:
  /// `ImageRenderer` draws no scroll view's content.
  var pmPageScrolls: Bool {
    get { self[PMPageScrollsKey.self] }
    set { self[PMPageScrollsKey.self] = newValue }
  }
}

// MARK: - The page body's two regions, the narrow step, the transitions

/// A page body of two regions, a main one and a side one, side by side from
/// 44rem of the width it is offered and stacked below it, the side region
/// second, with `gap` between them either way. Grid's rule for two columns,
/// `ceil(2/2)` below 44rem: on a phone the side region would otherwise be a
/// margin beside a sliver. DetailPage's aside has a fixed width (`.aside`);
/// Dashboard's two regions share the width by weight (`.weighted`). With one
/// subview, the main region takes the width. Stacked, an empty main region
/// (DetailPage's, when its tabs are the body) adds no gap above the side one.
struct PMPageRegions: Layout {
  enum Tracks {
    /// The side region at this width, the main one taking the rest.
    case aside(CGFloat)
    /// The two regions sharing the width by these weights.
    case weighted(main: CGFloat, side: CGFloat)
  }

  let tracks: Tracks
  let gap: CGFloat

  /// The width from which the regions sit side by side, the recipes' 44rem.
  /// Geometry, not theme.
  static let breakpoint = PMRecipe.regionsStackBelow

  private func widths(_ width: CGFloat) -> (main: CGFloat, side: CGFloat)? {
    guard width >= Self.breakpoint else { return nil }
    let shared = max(0, width - gap)
    switch tracks {
    case .aside(let side):
      return (max(0, shared - side), min(side, shared))
    case .weighted(let main, let side):
      let total = max(main + side, 1)
      return (shared * main / total, shared * side / total)
    }
  }

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let offered = proposal.width.flatMap { $0.isFinite ? $0 : nil }
    let width = offered ?? subviews.map { $0.sizeThatFits(.unspecified).width }.reduce(0, +)
    guard subviews.count == 2 else {
      let height =
        subviews.first?.sizeThatFits(ProposedViewSize(width: width, height: nil)).height ?? 0
      return CGSize(width: width, height: height)
    }
    if let (main, side) = widths(width) {
      let height = max(
        subviews[0].sizeThatFits(ProposedViewSize(width: main, height: nil)).height,
        subviews[1].sizeThatFits(ProposedViewSize(width: side, height: nil)).height)
      return CGSize(width: width, height: height)
    }
    let heights = subviews.map {
      $0.sizeThatFits(ProposedViewSize(width: width, height: nil)).height
    }
    return CGSize(width: width, height: heights.reduce(0, +) + (heights[0] > 0 ? gap : 0))
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    guard subviews.count == 2 else {
      subviews.first?.place(
        at: bounds.origin, anchor: .topLeading,
        proposal: ProposedViewSize(width: bounds.width, height: nil))
      return
    }
    if let (main, side) = widths(bounds.width) {
      subviews[0].place(
        at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(width: main, height: nil)
      )
      subviews[1].place(
        at: CGPoint(x: bounds.minX + main + gap, y: bounds.minY), anchor: .topLeading,
        proposal: ProposedViewSize(width: side, height: nil))
      return
    }
    let offer = ProposedViewSize(width: bounds.width, height: nil)
    let first = subviews[0].sizeThatFits(offer).height
    subviews[0].place(at: bounds.origin, anchor: .topLeading, proposal: offer)
    subviews[1].place(
      at: CGPoint(x: bounds.minX, y: bounds.minY + first + (first > 0 ? gap : 0)),
      anchor: .topLeading, proposal: offer)
  }
}

extension PMPageColumn {
  /// Whether a page `width` wide steps its insets down: the narrow step every
  /// page shares, for a page that lays out its own column.
  static func isNarrow(_ width: CGFloat) -> Bool {
    width < breakpoint
  }
}

/// The page-transitions convention's pending ribbon
/// (`design/conventions/page-transitions.md`): an accent bar the smallest
/// space step tall along the page's top, growing across it once an ambient
/// period; still and full under Reduce Motion and at the `none` temperament.
/// Decorative: the page's own state is what is announced.
struct PMPageRibbon: View {
  @Environment(\.pmTheme) private var theme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    let period = theme.defaultMotion.ambient.shimmer
    let bar = theme.colors.accentBg.color
    Group {
      if reduceMotion || period == 0 {
        Rectangle().fill(bar)
      } else {
        TimelineView(.animation) { context in
          let phase =
            context.date.timeIntervalSinceReferenceDate
            .truncatingRemainder(dividingBy: period) / period
          Rectangle().fill(bar)
            .scaleEffect(x: phase, y: 1, anchor: .leading)
        }
      }
    }
    .frame(height: theme.defaultDensity.space.s1)
    .allowsHitTesting(false)
    .accessibilityHidden(true)
  }
}

/// The page-transitions convention's arrival: the content fades in again
/// whenever `transitionKey` changes, on the enter easing at the surface
/// duration, keeping the content, its state, its focus and its scroll
/// position. Reduce Motion and the `none` temperament skip the fade.
struct PMPageArrival<Content: View>: View {
  @Environment(\.pmTheme) private var theme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var arriving = false
  let transitionKey: String?
  @ViewBuilder let content: () -> Content

  var body: some View {
    let motion = theme.defaultMotion
    content()
      .opacity(arriving ? 0 : 1)
      .onChange(of: transitionKey) { _, _ in
        guard !reduceMotion, motion.duration.surface > 0 else { return }
        arriving = true
        withAnimation(motion.easing.enter.animation(duration: motion.duration.surface)) {
          arriving = false
        }
      }
  }
}

extension View {
  /// A page in a states fixture, drawn from its top: the harness draws an
  /// entry no taller than a phone's screen and centres one that is taller, so
  /// a long page would lose its header. Anchored at the top, it shows what a
  /// phone shows before the page scrolls.
  func pmFixtureScreenTop() -> some View {
    frame(minHeight: 0, maxHeight: .infinity, alignment: .top).clipped()
  }
}
