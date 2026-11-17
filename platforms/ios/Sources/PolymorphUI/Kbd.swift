// Kbd (`design/components/kbd.md`): one keyboard key, drawn as a keycap, for
// shortcut hints in a Menu row, beside SearchInput and in help text. Display
// only: binding the shortcut is the app's. The key is `text.xs` in the mono
// face, `text.secondary` on `bg.subtle`, inside a `border.default` hairline
// whose bottom edge is twice as thick, which makes the key look raised in
// every geometry; the corners are `radius.sm`, the padding `space-2` across,
// and the key is at least as wide as an `md` icon, so a one-letter key is not
// a sliver. It is read as its text, so `⌘` and `K` side by side read as the
// two keys.

import PolymorphTokens
import SwiftUI

public struct PMKbd: PMKbdRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMKbdProps

  public init(props: PMKbdProps) {
    self.props = props
  }

  public var body: some View {
    let colors = theme.colors
    let radius = theme.radius.sm
    // The raised bottom edge: twice the hairline, as the recipe's 2px bottom border.
    let raised = PMRule.thickness * 2
    let shape = RoundedRectangle(cornerRadius: radius)

    Text(props.children)
      .pmTextStyle(theme.text.xs.set(in: theme.fonts.mono))
      .lineLimit(1)
      .fixedSize()
      .foregroundStyle(colors.textSecondary.color)
      .padding(.horizontal, theme.defaultDensity.space.s2)
      .padding(.top, PMRule.thickness)
      .padding(.bottom, raised)
      .frame(minWidth: theme.icon.size.md)
      .background {
        shape.fill(colors.borderDefault.color)
          .overlay {
            UnevenRoundedRectangle(
              topLeadingRadius: max(0, radius - PMRule.thickness),
              bottomLeadingRadius: max(0, radius - raised),
              bottomTrailingRadius: max(0, radius - raised),
              topTrailingRadius: max(0, radius - PMRule.thickness)
            )
            .fill(colors.bgSubtle.color)
            .padding(.horizontal, PMRule.thickness)
            .padding(.top, PMRule.thickness)
            .padding(.bottom, raised)
          }
      }
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(Text(props.children))
      .accessibilityAddTraits(.isStaticText)
      .pmMember("Kbd")
  }
}

/// Kbd's states, from the spec's States table. The hint inside a Menu row is
/// Menu's fixture's, whose root is the menu.
public struct KbdStates: PMStates {
  public let member = "Kbd"

  public init() {}

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("single key", expect: ["label": "K"]) {
        PMKbd(props: PMKbdProps(children: "K"))
      },
      PMStateEntry("modifier pair", expect: ["label": "⌘"]) {
        KbdPair(keys: ["⌘", "K"])
      },
      PMStateEntry("a word key", expect: ["label": "Esc"]) {
        PMKbd(props: PMKbdProps(children: "Esc"))
      },
    ]
  }
}

/// Keys side by side, a `space-1` apart.
private struct KbdPair: View {
  @Environment(\.pmTheme) private var theme
  let keys: [String]

  var body: some View {
    HStack(spacing: theme.defaultDensity.space.s1) {
      ForEach(keys, id: \.self) { PMKbd(props: PMKbdProps(children: $0)) }
    }
  }
}
