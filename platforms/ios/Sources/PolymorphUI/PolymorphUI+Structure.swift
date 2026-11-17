// The parts several structure members share: the round mark of a step or an
// event (Stepper's indicator, Timeline's icon mark), the text link of a trail
// or a list (Breadcrumbs' crumbs, ErrorSummary's links), the item's selection
// that runs before its link opens (Breadcrumbs, List), the live announcement
// (ErrorSummary's alert, CursorPagination's position), and the recipes' gap
// under a title (Stepper's description, Timeline's time).

import PolymorphTokens
import SwiftUI

// MARK: - Marks

/// A round mark `space.6` across, `radius.pill`: a fill, a hairline border and
/// its content (a number or a glyph) in `foreground`. `lit` adds the lit
/// object's seat shadow and inset top light, as a completed Stepper step has;
/// a flat pairing's shadows are empty, so it draws none there. The mark is
/// decorative: the step's or the event's words carry what it shows.
struct PMMarkDisc<Content: View>: View {
  @Environment(\.pmTheme) private var theme
  let fill: PMDynamicColor?
  let border: PMDynamicColor?
  let foreground: PMDynamicColor
  var lit = false
  @ViewBuilder let content: () -> Content

  var body: some View {
    let side = theme.defaultDensity.space.s6
    let shape = RoundedRectangle(cornerRadius: theme.radius.pill)
    let none = PMShadow(layers: [])
    content()
      .foregroundStyle(foreground.color)
      .frame(width: side, height: side)
      .background {
        shape
          .fill(fill?.color ?? .clear)
          .pmInsetShadow(lit ? theme.insetTop : none, in: shape)
          .pmShadow(lit ? theme.shadows.seat : none)
      }
      // A transparent hairline where the recipe has no border, so every mark
      // is one size; `strokeBorder` draws inside the shape.
      .overlay { shape.strokeBorder(border?.color ?? .clear, lineWidth: 1) }
      .accessibilityHidden(true)
  }
}

// MARK: - Text links

/// A link drawn as text: `color` at rest, `activeColor` under the pointer and
/// while pressed, underlined at rest when `underlined` and always while active,
/// in the text's own colour. Link's grammar (`link.md`) in another colour:
/// Breadcrumbs' crumbs are `text.secondary` and underline on hover;
/// ErrorSummary's links are `danger.text` and always underlined. SwiftUI draws
/// one underline thickness, so the web's thicker hover line is not drawn. The
/// hit area reaches the hit target.
struct PMTextLinkStyle: ButtonStyle {
  let color: PMDynamicColor
  let activeColor: PMDynamicColor
  let underlined: Bool

  func makeBody(configuration: Configuration) -> some View {
    PMTextLinkChrome(style: self, pressed: configuration.isPressed) { configuration.label }
  }
}

private struct PMTextLinkChrome<Label: View>: View {
  @Environment(\.pmTheme) private var theme
  @State private var hovering = false
  let style: PMTextLinkStyle
  let pressed: Bool
  @ViewBuilder let label: () -> Label

  var body: some View {
    let motion = theme.defaultMotion
    let active = hovering || pressed
    let color = active ? style.activeColor : style.color
    label()
      .foregroundStyle(color.color)
      .underline(style.underlined || active, color: color.color)
      .animation(
        motion.easing.standard.animation(duration: motion.duration.control), value: active)
      .onHover { hovering = $0 }
      .pmHitTarget()
  }
}

/// Runs an item's `onSelect` before its link opens: the link's opening action
/// becomes `onSelect`, then the action around it, which is the member's router
/// (`pmRoutes`), the app's `OpenURLAction` or the system's. A Breadcrumbs
/// crumb and a List item with both an `href` and `onSelect` run both, as the
/// web runs `onSelect` beside the link's click.
struct PMSelectsFirst: ViewModifier {
  @Environment(\.openURL) private var openURL
  let onSelect: (@MainActor () -> Void)?

  func body(content: Content) -> some View {
    if let onSelect {
      content.environment(
        \.openURL,
        OpenURLAction { url in
          onSelect()
          openURL(url)
          return .handled
        })
    } else {
      content
    }
  }
}

// MARK: - Live announcements

/// What a live region announces, posted as an accessibility announcement:
/// assertive (`role="alert"`) when the view appears and whenever `text`
/// changes, at high priority; polite (`aria-live="polite"`) only when `text`
/// changes, at the default priority, so a value that was there from the start
/// is not read out on arrival.
private struct PMLiveAnnouncement: ViewModifier {
  let text: String?
  let assertive: Bool

  func body(content: Content) -> some View {
    content
      .onAppear { if assertive { announce() } }
      .onChange(of: text) { announce() }
  }

  private func announce() {
    guard let text, !text.isEmpty else { return }
    var spoken = AttributedString(text)
    spoken.accessibilitySpeechAnnouncementPriority = assertive ? .high : .default
    AccessibilityNotification.Announcement(spoken).post()
  }
}

extension View {
  /// Announces `text` as an assertive or a polite live region would.
  func pmLiveAnnouncement(_ text: String?, assertive: Bool) -> some View {
    modifier(PMLiveAnnouncement(text: text, assertive: assertive))
  }
}

// MARK: - Lengths

extension PMGeometry {
  /// The recipes' `2px` between a line and the smaller line under it
  /// (Stepper's description, Timeline's time). The recipes write it as a
  /// length, not a space step, so it is the same at every density.
  static let subline: CGFloat = 2
}
