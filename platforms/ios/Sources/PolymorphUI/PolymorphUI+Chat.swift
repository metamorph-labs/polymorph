// The parts the conversation members share: what a thread hands the turns
// inside it (ChatThread, ChatMessage), the two reading measures in steps of
// `space-10` (the thread's column, the reader's bubble), a glyph seated in one
// line of text (ApprovalCard's head, the sentence below), and a sentence with a
// matching glyph (ChatMessage's notice, ApprovalCard's outcome).

import PolymorphTokens
import SwiftUI

// MARK: - The thread and its turns

/// What ChatThread hands each turn inside it. The web's thread reaches its
/// turns through the column's children and its log region; a SwiftUI turn is
/// an opaque view the thread cannot reach into, so the thread sets this in the
/// environment and ChatMessage reads it.
struct PMChatThreadContext {
  /// The turn's arrival, `chat.message` (`chat-thread.md`, Motion): `slide-fade`
  /// at the `sm` distance from the bottom edge, over the control duration on the
  /// enter easing, enter only; a fade alone under Reduce Motion. The animation
  /// travels with the transition, so a turn the app appends without an
  /// animation still arrives this way.
  let arrival: AnyTransition
  /// Whether a turn that appears now joins a thread already on screen, so it is
  /// announced once, as the web's log announces an addition.
  let arrivals: PMChatArrivals
}

/// Whether the thread is on screen yet. The turns it opens with appear with it
/// and are not announced; a turn that appears after it has opened is an
/// arrival. It closes when the thread leaves the screen, so the turns a thread
/// shown again opens with are not announced either.
@MainActor
final class PMChatArrivals {
  var open = false
}

private struct PMChatThreadKey: EnvironmentKey {
  static let defaultValue: PMChatThreadContext? = nil
}

extension EnvironmentValues {
  /// The thread the view is a turn of, or `nil` outside a ChatThread.
  var pmChatThread: PMChatThreadContext? {
    get { self[PMChatThreadKey.self] }
    set { self[PMChatThreadKey.self] = newValue }
  }
}

// MARK: - Measures

/// The conversation's two measures, in steps of `space-10`, so they rescale
/// with density as every other width does.
enum PMChatMeasure {
  /// ChatThread's column (`PMRecipe.chatThreadMeasure`), a reading measure
  /// for prose.
  static func thread(_ space: PMSpace) -> CGFloat {
    space.s10 * PMRecipe.chatThreadMeasure
  }

  /// The reader's bubble in ChatMessage (`PMRecipe.chatBubbleMeasure`), about
  /// three quarters of the thread's column, so a paragraph still reads as the
  /// reader's.
  static func bubble(_ space: PMSpace) -> CGFloat {
    space.s10 * PMRecipe.chatBubbleMeasure
  }
}

// MARK: - Glyphs beside text

/// A glyph centred on the first line of `step`, so it stays beside that line
/// when the text beside it wraps, as the web centres it in the first line box.
/// SwiftUI sets a line's extra leading below it, not half above and half
/// below, so the first line's middle is half the font's own line height from
/// the top: the seat is that height, the line box less the step's
/// `lineSpacing`, and a glyph taller than it overhangs it evenly. The seat
/// scales with Dynamic Type by the factor `pmTextStyle` scales the text by.
private struct PMLineSeat: ViewModifier {
  @ScaledMetric private var line: CGFloat

  init(_ step: PMTextStyle) {
    _line = ScaledMetric(wrappedValue: step.lineBox - step.lineSpacing, relativeTo: .body)
  }

  func body(content: Content) -> some View {
    content.frame(height: line)
  }
}

extension View {
  /// Seats the view in one line of `step`.
  func pmLineSeat(_ step: PMTextStyle) -> some View {
    modifier(PMLineSeat(step))
  }
}

/// A sentence with a matching glyph before it, `space-2` apart: ChatMessage's
/// notice for a stopped or failed turn, ApprovalCard's outcome. The sentence
/// is in `text.secondary` at `step`; the glyph is `sm` in `glyphColor`, and
/// decorative, because the sentence says what it shows.
struct PMGlyphLine: View {
  @Environment(\.pmTheme) private var theme
  let glyph: PMIconRole
  let glyphColor: PMDynamicColor
  let text: String
  let step: PMTextStyle

  var body: some View {
    HStack(alignment: .top, spacing: theme.defaultDensity.space.s2) {
      PMIconView(glyph, size: .sm)
        .foregroundStyle(glyphColor.color)
        .pmLineSeat(step)
      Text(text)
        .pmTextStyle(step)
        .foregroundStyle(theme.colors.textSecondary.color)
        .fixedSize(horizontal: false, vertical: true)
    }
  }
}
