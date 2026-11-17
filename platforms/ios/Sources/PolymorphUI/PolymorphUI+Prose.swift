// The parts the prose members share: the caret StreamingText draws and Markdown
// restates, the rule a Markdown quote and ReasoningDisclosure's reasoning share,
// the Dynamic Type factor a paragraph's runs scale by, and a type step as the
// font of one run inside a Text (Markdown's code spans and citation marks).

import PolymorphTokens
import SwiftUI

#if canImport(UIKit)
  import UIKit
#elseif canImport(AppKit)
  import AppKit
#endif

// MARK: - Lengths

extension PMGeometry {
  /// The caret's width and the quote rule's: the recipes' `2px` stroke
  /// (`streaming-text.md`, `markdown.md`, `reasoning-disclosure.md`). The
  /// recipes write it as a length, not a token, so it is the same in every
  /// pairing.
  static let proseStroke: CGFloat = 2
  /// The caret's corner radius: the recipe's `1px`.
  static let caretRadius: CGFloat = 1
}

/// The factor Dynamic Type scales body text by at the environment's text size,
/// as `pmTextStyle` reads it: what a run inside a paragraph scales its own
/// font by, and what the caret scales its height by.
struct PMTextScale: DynamicProperty {
  @ScaledMetric(relativeTo: .body) private var rem = PMGeometry.rem

  var factor: CGFloat { rem / PMGeometry.rem }
}

// MARK: - The caret

/// StreamingText's caret, which Markdown restates (`streaming-text.md`,
/// `markdown.md`): a steady stroke `PMGeometry.proseStroke` wide and as tall as the
/// step's size, one character, in `accent.bg`, `space-1` after the last
/// character, its foot at the bottom of the text (`vertical-align:
/// text-bottom`). It is a run of the paragraph's Text, so it follows the last
/// character wherever the paragraph wraps. It is drawn, not typed: it holds no
/// character, so a screen reader has nothing to read, and it never blinks,
/// because a loop needs a pattern and the motion catalogue has none for it.
enum PMCaret {
  static func text(after step: PMTextStyle, scale: CGFloat, theme: PMTheme) -> Text {
    let gap = theme.defaultDensity.space.s1
    let height = step.size * scale
    let bar = CGRect(x: gap, y: 0, width: PMGeometry.proseStroke, height: height)
    let image = Image(
      size: CGSize(width: gap + PMGeometry.proseStroke, height: height), label: nil, opaque: false
    ) { context in
      context.fill(
        Path(roundedRect: bar, cornerRadius: PMGeometry.caretRadius), with: .foreground)
    }
    return Text(image.renderingMode(.template))
      .foregroundStyle(theme.colors.accentBg.color)
      .baselineOffset(PMFontMetrics.descender(step, size: height))
  }
}

/// `content` with the caret after its last character while `showing`. The
/// paragraph's step and colour come from the modifiers around it.
struct PMCaretText: View {
  @Environment(\.pmTheme) private var theme
  private var scale = PMTextScale()
  let content: Text
  let step: PMTextStyle
  let showing: Bool

  init(content: Text, step: PMTextStyle, showing: Bool) {
    self.content = content
    self.step = step
    self.showing = showing
  }

  var body: some View {
    if showing {
      content + PMCaret.text(after: step, scale: scale.factor, theme: theme)
    } else {
      content
    }
  }
}

// MARK: - The quote rule

/// The rule a Markdown quote and ReasoningDisclosure's reasoning share
/// (`markdown.md`, `reasoning-disclosure.md`), so quoting and thinking read as
/// one quieter style beside the answer: a `PMGeometry.proseStroke` line in
/// `border.strong` along the leading edge, the content `space-4` in from it.
/// The line is a fill of the view's background, not a view of its own, so it
/// is never an element for assistive technology, inside an open disclosure
/// region too.
private struct PMQuoteRule: ViewModifier {
  @Environment(\.pmTheme) private var theme
  @Environment(\.layoutDirection) private var direction

  func body(content: Content) -> some View {
    content
      .padding(.leading, theme.defaultDensity.space.s4)
      .background(
        theme.colors.borderStrong.color,
        in: PMLeadingEdge(width: PMGeometry.proseStroke, direction: direction))
  }
}

/// A strip `width` wide along the leading edge of the rectangle it fills.
private struct PMLeadingEdge: Shape {
  let width: CGFloat
  let direction: LayoutDirection

  func path(in rect: CGRect) -> Path {
    let x = direction == .rightToLeft ? rect.maxX - width : rect.minX
    return Path(CGRect(x: x, y: rect.minY, width: width, height: rect.height))
  }
}

extension View {
  /// Sets the view `space-4` in from a quote rule on its leading edge.
  func pmQuoteRule() -> some View {
    modifier(PMQuoteRule())
  }
}

// MARK: - Runs

extension PMTextStyle {
  /// The step as the font of one run inside a Text, at `scale` times its size:
  /// what `pmTextStyle` sets on a whole view, for a run that differs from its
  /// paragraph (a code span in the mono face, a citation mark at `text.xs`).
  /// The family when it is installed, otherwise the system font in the slot's
  /// fallback design, weighted and italic as the step is. The size is fixed,
  /// because `scale` is already Dynamic Type's factor.
  func runFont(scale: CGFloat) -> Font {
    let scaled = size * scale
    let base: Font =
      PMFontMetrics.installed(family)
      ? .custom(family, fixedSize: scaled)
      : .system(size: scaled, design: fallback.design)
    let weighted = base.weight(weight)
    return italic ? weighted.italic() : weighted
  }
}

/// A step's vertical metrics, read from the platform's font: the family when
/// it is installed, otherwise the system font, whose proportions stand in for
/// the fallback design's.
enum PMFontMetrics {
  #if canImport(UIKit)
    private typealias PlatformFont = UIFont
  #elseif canImport(AppKit)
    private typealias PlatformFont = NSFont
  #endif

  /// Whether the family is installed, by its family name, as the token
  /// package's `font` decides it.
  static func installed(_ family: String) -> Bool {
    #if canImport(UIKit)
      UIFont.familyNames.contains(family)
    #elseif canImport(AppKit)
      NSFontManager.shared.availableFontFamilies.contains(family)
    #endif
  }

  /// How far the step's text reaches below the baseline at `size`, negative.
  static func descender(_ step: PMTextStyle, size: CGFloat) -> CGFloat {
    font(step, size: size).descender
  }

  /// How far the step's text reaches above the baseline at `size`.
  static func ascender(_ step: PMTextStyle, size: CGFloat) -> CGFloat {
    font(step, size: size).ascender
  }

  private static func font(_ step: PMTextStyle, size: CGFloat) -> PlatformFont {
    #if canImport(UIKit)
      guard installed(step.family) else { return UIFont.systemFont(ofSize: size) }
      return UIFont(
        descriptor: UIFontDescriptor(fontAttributes: [.family: step.family]), size: size)
    #elseif canImport(AppKit)
      guard installed(step.family),
        let font = NSFont(
          descriptor: NSFontDescriptor(fontAttributes: [.family: step.family]), size: size)
      else { return NSFont.systemFont(ofSize: size) }
      return font
    #endif
  }
}
