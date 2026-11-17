// The layout parts several members share: the spacing a layout member's props
// give (Stack, Inline, Grid, Card), the collapse that closes a row (Alert), the
// row child that takes the row's height (a vertical Separator in an Inline),
// the mark that is at least square (Citation), and what a horizontal scroll
// view shows at rest, for the rendering harness (CodeBlock).

import PolymorphTokens
import SwiftUI

/// The spacing a layout member's props give, as steps of the space scale, with
/// the instance patch (rung 3 of the exception ladder) applied last, key by key,
/// as the web merges it: `px` and `py` override `p` on their axis. Stack,
/// Inline and Grid read it; Card reads the padding half.
struct PMSpacing {
  let gap: PMSpaceStep?
  let p: PMSpaceStep?
  let px: PMSpaceStep?
  let py: PMSpaceStep?
  let patched: Bool

  init(
    gap: PMSpaceStep? = nil, p: PMSpaceStep?, px: PMSpaceStep?, py: PMSpaceStep?,
    patch: PMLayoutPatch? = nil
  ) {
    self.gap = patch?.gap ?? gap
    self.p = patch?.p ?? p
    self.px = patch?.px ?? px
    self.py = patch?.py ?? py
    patched = patch != nil
  }

  var horizontal: PMSpaceStep { px ?? p ?? .s0 }
  var vertical: PMSpaceStep { py ?? p ?? .s0 }

  /// The web's `data-gap`, `data-p`, `data-px` and `data-py`, only the ones
  /// set, and `patched` when an instance patch applies.
  var attributes: [String: String] {
    var found: [String: String] = [:]
    if let gap { found["gap"] = String(gap.rawValue) }
    if let p { found["p"] = String(p.rawValue) }
    if let px { found["px"] = String(px.rawValue) }
    if let py { found["py"] = String(py.rawValue) }
    if patched { found["patched"] = "true" }
    return found
  }
}

/// A row whose height is its content's height times `progress`, clipped: the
/// size half of `collapse`. Animating `progress` closes the row without
/// measuring it.
struct PMCollapse: Layout {
  var progress: CGFloat

  var animatableData: CGFloat {
    get { progress }
    set { progress = newValue }
  }

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let size = subviews.first?.sizeThatFits(ProposedViewSize(width: proposal.width, height: nil))
    return CGSize(width: size?.width ?? 0, height: (size?.height ?? 0) * progress)
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    subviews.first?.place(
      at: bounds.origin, anchor: .topLeading,
      proposal: ProposedViewSize(width: bounds.width, height: nil))
  }
}

/// A child of an Inline row that takes the row's height, whatever the row's
/// `align`: the web's `align-self: stretch`. A vertical Separator sets it.
struct PMStretchesInRow: LayoutValueKey {
  static let defaultValue = false
}

/// Its content at least as wide as it is tall: a mark that holds one digit or
/// two (Citation's number) keeps one square shape at every text size, as the
/// web's `min-inline-size` of the line box does, without a width that Dynamic
/// Type would leave behind.
struct PMAtLeastSquare: Layout {
  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let size = subviews.first?.sizeThatFits(proposal) ?? .zero
    return CGSize(width: max(size.width, size.height), height: size.height)
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    subviews.first?.place(
      at: CGPoint(x: bounds.midX, y: bounds.midY), anchor: .center,
      proposal: ProposedViewSize(bounds.size))
  }
}

/// Its content at its ideal width, from the leading edge of the width it is
/// offered, as tall as the content: what a horizontal scroll view shows at
/// rest. A member draws it in place of its scroll view where `pmPageScrolls`
/// is off, clipped, because the rendering harness draws no scroll view's
/// content.
struct PMScrollAtRest: Layout {
  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let ideal = subviews.first?.sizeThatFits(.unspecified) ?? .zero
    let width = proposal.width.map { min($0, ideal.width) } ?? ideal.width
    return CGSize(width: width, height: ideal.height)
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: .unspecified)
  }
}
