// The follow ChatThread and LogView share (`chat-thread.md`, `log-view.md`):
// a scroll region held at its end while content arrives, for as long as the
// reader is at the end. On the web both members call the engine's
// `followEnd`; this is that rule on iOS, written once.
//
// Follow is two observations, with no scheduler: where the content's bottom is
// against the viewport's, and how tall the content and the viewport are. While
// the reader is within the slack of the end, more content moves the viewport to
// the new end, at once and never animated, because a smooth scroll under
// arriving content makes the reader chase the line. A change of position that
// comes with no change of height is the reader's scroll, and decides whether
// they are still at the end. Where the system reports scroll phases (iOS 18), a
// scroll the reader is making is never fought: content that grows while they
// drag moves nothing. Once the reader has scrolled away, nothing moves until
// the member's jump control returns them.

import SwiftUI

/// The content's height and where its bottom is in the viewport's space.
struct PMFollowExtent: Equatable, Sendable {
  let height: CGFloat
  let bottom: CGFloat
}

/// The follow's bookkeeping. It is read and written as observations arrive and
/// never drawn, so it is a reference the member keeps rather than state that
/// redraws it on every change; the member's own `detached` is the state that
/// draws.
final class PMFollow {
  /// The coordinate space of the viewport, and the id of the content's end.
  let space: String
  let end: String

  var following = true
  /// The reader is dragging or the scroll is still moving from their gesture.
  var interacting = false
  var viewport: CGFloat = 0
  /// The content's last observation, which a change of the viewport alone decides on again.
  var extent: PMFollowExtent?
  /// The heights the last decision used; none before the first, so the first
  /// observation moves the region to its end.
  private var height: CGFloat = -1
  private var decidedViewport: CGFloat = -1

  /// A follow for the member `name`, whose space and end are named for it.
  init(_ name: String) {
    space = "pm.\(name).viewport"
    end = "pm.\(name).end"
  }

  /// One observation of the content. A change of height (or of the
  /// viewport's) is the content moving: a following region moves to the new
  /// end, which this answers `true` for, and the scroll that makes reports
  /// back here at the same height. A change of position alone is a scroll, the
  /// reader's or the region's own, and says whether the reader is at the end,
  /// within `slack` of it.
  func observe(_ extent: PMFollowExtent, slack: CGFloat) -> Bool {
    let moved = extent.height != height || viewport != decidedViewport
    self.extent = extent
    height = extent.height
    decidedViewport = viewport
    if moved, following, !interacting { return true }
    following = extent.bottom - viewport <= slack
    return false
  }

  /// Moves the region to its end at once, never animated.
  func toEnd(_ proxy: ScrollViewProxy) {
    var transaction = Transaction()
    transaction.disablesAnimations = true
    withTransaction(transaction) {
      proxy.scrollTo(end, anchor: .bottom)
    }
  }
}

/// Where the system reports the scroll's phase (iOS 18, macOS 15), a scroll
/// the reader is making is marked as theirs, so content that grows under it
/// moves nothing.
struct PMFollowScrollPhases: ViewModifier {
  let follow: PMFollow

  func body(content: Content) -> some View {
    if #available(iOS 18, macOS 15, *) {
      content.onScrollPhaseChange { _, phase in
        follow.interacting = phase == .interacting || phase == .decelerating
      }
    } else {
      content
    }
  }
}

/// The region opens at its end. Where the anchor can be set for the opening
/// offset alone (iOS 18, macOS 15), it is; before that, the first observation
/// moves the region to its end, because an anchor that also held the end
/// through every change of size would move a reader who had scrolled away.
struct PMFollowStartsAtEnd: ViewModifier {
  func body(content: Content) -> some View {
    if #available(iOS 18, macOS 15, *) {
      content.defaultScrollAnchor(.bottom, for: .initialOffset)
    } else {
      content
    }
  }
}
