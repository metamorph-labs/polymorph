// Skeleton (`design/components/skeleton.md`): a placeholder that holds the
// layout while content arrives. Every size is a token: a `text` skeleton is
// exactly the line box of the step it stands in for, so nothing moves when the
// text arrives; `rect` and `circle` take a space step, and `width` is a space
// step or the full width.
//
// The `shimmer` sweep moves a band of `bg.raised` across the `bg.subtle` fill
// over the temperament's ambient period (a calmer temperament sweeps slower).
// At the `none` temperament, whose period is zero, and under Reduce Motion the
// fill stays still: the placeholder itself is the loading signal.
//
// Unlabelled, it is hidden from assistive technology, because a grey box means
// nothing. With `label` it stands for a named region and is one element with
// that name, updating: iOS has no status role, and VoiceOver reads the label.

import PolymorphTokens
import SwiftUI

public struct PMSkeleton: PMSkeletonRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  private let props: PMSkeletonProps

  public init(props: PMSkeletonProps) {
    self.props = props
  }

  public var body: some View {
    let shape = props.shape ?? .text
    let space = theme.defaultDensity.space
    let step = props.textStep ?? .md
    let side = props.size.map { space[$0] }
    let width = props.width.flatMap { width -> CGFloat? in
      width == .full ? nil : Int(width.rawValue).map { space[$0] }
    }
    let height: CGFloat =
      switch shape {
      case .text: lineBox(step)
      case .rect, .circle: side ?? space.s0
      }
    let corner: CGFloat =
      switch shape {
      case .text: theme.radius.detail
      case .rect: theme.radius.md
      case .circle: theme.radius.pill
      }
    let period = theme.defaultMotion.ambient.shimmer
    let attributes =
      shape == .text
      ? ["shape": shape.rawValue, "text-step": step.rawValue] : ["shape": shape.rawValue]

    let block = RoundedRectangle(cornerRadius: corner)
      .fill(theme.colors.bgSubtle.color)
      .overlay {
        if period > 0 && !reduceMotion {
          PMShimmer(period: period, band: theme.colors.bgRaised, base: theme.colors.bgSubtle)
            .accessibilityHidden(true)
        }
      }
      .clipShape(RoundedRectangle(cornerRadius: corner))
      .frame(
        width: shape == .circle ? height : width,
        height: height)
      .frame(maxWidth: shape == .circle || width != nil ? nil : .infinity, alignment: .leading)
      .contentShape(.rect)

    if let label = props.label {
      block
        .accessibilityElement()
        .accessibilityLabel(Text(label))
        .accessibilityAddTraits(.updatesFrequently)
        .pmMember("Skeleton", attributes)
    } else {
      block
        .accessibilityHidden(true)
        .pmMember("Skeleton", attributes)
    }
  }

  /// A text step's line box: its size times its line height.
  private func lineBox(_ step: PMSkeletonTextStep) -> CGFloat {
    let text = theme.text
    switch step {
    case .xs: return text.xs.lineBox
    case .sm: return text.sm.lineBox
    case .md: return text.md.lineBox
    case .lg: return text.lg.lineBox
    case .xl: return text.xl.lineBox
    case .textStep2xl: return text.text2xl.lineBox
    case .textStep3xl: return text.text3xl.lineBox
    }
  }
}

/// The sweep: a band twice the block's width, from `base` through `band` and
/// back, moving from one width before the block to one width past it, linearly,
/// once a period. The band is a gradient fill of the block's own rectangle,
/// its ends placed past the rectangle's edges, so nothing is drawn or laid out
/// past the block: the element of a labelled Skeleton is the block's frame at
/// every moment of the sweep.
private struct PMShimmer: View {
  let period: TimeInterval
  let band: PMDynamicColor
  let base: PMDynamicColor

  var body: some View {
    TimelineView(.animation) { context in
      // In the block's unit space: the band is two widths, and it travels four.
      let width = UnitPoint.trailing.x
      let layer = width + width
      let travel = layer + layer
      let phase =
        context.date.timeIntervalSinceReferenceDate
        .truncatingRemainder(dividingBy: period) / period
      let start = travel * phase - layer
      let middle = UnitPoint.leading.y
      Rectangle()
        .fill(
          LinearGradient(
            colors: [base.color, band.color, base.color],
            startPoint: UnitPoint(x: start, y: middle),
            endPoint: UnitPoint(x: start + layer, y: middle)))
    }
    .allowsHitTesting(false)
  }
}

/// Skeleton's states, from the spec's States table. The unlabelled shapes are
/// hidden from accessibility, which `hidden` tells the harness.
public struct SkeletonStates: PMStates {
  public let member = "Skeleton"

  public init() {}

  private static let label = "Loading tickets"

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("text default", expect: ["hidden": "true"]) {
        PMSkeleton(props: PMSkeletonProps())
      },
      PMStateEntry("text steps", expect: ["hidden": "true"]) {
        PMSkeleton(props: PMSkeletonProps(textStep: .textStep2xl))
      },
      PMStateEntry("rect", expect: ["hidden": "true"]) {
        PMSkeleton(props: PMSkeletonProps(shape: .rect, size: .s8, width: .width10))
      },
      PMStateEntry("circle", expect: ["hidden": "true"]) {
        PMSkeleton(props: PMSkeletonProps(shape: .circle, size: .s7))
      },
      PMStateEntry("labelled region", expect: ["shape": "text", "label": Self.label]) {
        PMSkeleton(props: PMSkeletonProps(label: Self.label))
      },
    ]
  }
}
