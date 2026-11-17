// SearchInput (`design/components/search-input.md`): an Input preset for
// searching. It is Input's rendering with the `search` icon, the clear button
// and the search field's trait and keyboard set, and an optional shortcut hint
// in the trailing slot. The hint is display only and gives way to the clear
// button: it shows while the field is empty, unfocused and enabled. Like the
// web member, it fills the width it is given.
//
// The shortcut hint draws Kbd's recipe (`kbd.md`) here, because Kbd has no
// SwiftUI rendering yet; it is decorative, as on the web, so it is not spoken.

import PolymorphTokens
import SwiftUI

public struct PMSearchInput: PMSearchInputRendering {
  private let props: PMSearchInputProps

  public init(props: PMSearchInputProps) {
    self.props = props
  }

  public var body: some View {
    PMInputCore(
      props: PMInputProps(
        ariaDescribedby: props.ariaDescribedby,
        ariaLabel: props.ariaLabel,
        ariaLabelledby: props.ariaLabelledby,
        clearable: true,
        clearLabel: props.clearLabel,
        defaultValue: props.defaultValue,
        disabled: props.disabled,
        icon: .search,
        id: props.id,
        name: props.name,
        onChange: props.onChange,
        placeholder: props.placeholder ?? PMStrings.search,
        size: props.size,
        type: .search,
        value: props.value),
      shortcut: props.shortcut,
      member: "SearchInput")
  }
}

/// A keyboard shortcut drawn as a key: the mono face at `text.xs`, secondary
/// text on the subtle wash, a hairline border whose bottom edge is one
/// hairline thicker so the key looks raised, `radius.sm`, at least an icon
/// wide.
struct PMShortcutHint: View {
  @Environment(\.pmTheme) private var theme
  let shortcut: String

  var body: some View {
    let colors = theme.colors
    let shape = RoundedRectangle(cornerRadius: theme.radius.sm)
    // Kbd's border, `1px` with a `2px` bottom edge: the structural hairline.
    let hairline: CGFloat = 1

    Text(shortcut)
      .pmTextStyle(theme.text.xs.set(in: theme.fonts.mono))
      .lineLimit(1)
      .fixedSize()
      .foregroundStyle(colors.textSecondary.color)
      .padding(.horizontal, theme.defaultDensity.space.s2)
      .frame(minWidth: theme.icon.size.md)
      .background {
        shape.fill(colors.bgSubtle.color)
          .background { shape.fill(colors.borderDefault.color).offset(y: hairline) }
      }
      .overlay { shape.strokeBorder(colors.borderDefault.color, lineWidth: hairline) }
      .accessibilityHidden(true)
  }
}

/// SearchInput's states, from the spec's States table.
public struct SearchInputStates: PMStates {
  public let member = "SearchInput"

  public init() {}

  private static let label = "Search tickets"

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "empty, offering the shortcut that reaches it", expect: ["shortcut": "true", "size": "md"]
      ) {
        PMSearchInput(props: PMSearchInputProps(ariaLabel: Self.label, shortcut: "⌘K"))
      },
      PMStateEntry("with a value — the hint yields to the clear button") {
        PMSearchInput(
          props: PMSearchInputProps(ariaLabel: Self.label, defaultValue: "webhook", shortcut: "⌘K"))
      },
      PMStateEntry("no shortcut at all", expect: ["size": "md"]) {
        PMSearchInput(props: PMSearchInputProps(ariaLabel: Self.label))
      },
      PMStateEntry("small — the size a filter row uses", expect: ["size": "sm"]) {
        PMSearchInput(props: PMSearchInputProps(ariaLabel: Self.label, shortcut: "⌘K", size: .sm))
      },
      PMStateEntry(
        "disabled — nothing to reach, so nothing to hint at", expect: ["disabled": "true"]
      ) {
        PMSearchInput(
          props: PMSearchInputProps(ariaLabel: Self.label, disabled: true, shortcut: "⌘K"))
      },
    ]
  }
}
