// SplitButton (`design/components/split-button.md`): a default command and a
// menu of its variants in one control. Two Buttons joined at a seam, each
// Button's recipe for the group's variant and tone at its size, each pressed
// and hovered on its own: the primary half with its icon and label, and the
// chevron half, icon-only and square, with the `expand` glyph. The control
// radius rounds the group's outer corners only. The seam is one hairline in a
// colour the halves already use: the active fill step for `solid` and `soft`,
// and for `outline` the border, which the halves share, so the seam is one
// line and never two.
//
// The chevron half opens Menu as it renders here (`PMMenuPanel` through
// `PMAnchoredPresentation`): a sheet of the entries on iPhone and a popover
// hanging from the group's end on iPad (`presentation: .popover` keeps the
// popover on iPhone too). `loading` puts the spinner in the primary half's
// icon slot, keeps the layout, detaches its action and disables the chevron,
// because a command in flight is the whole group's state; `disabled` disables
// both halves.
//
// The lawful cells are a part of Button's: `solid` and `soft` are accent only,
// `outline` is accent or neutral, and there is no `ghost` and no `danger`. The
// contract takes the pair as one cell of that grid (`PMSplitButtonAppearance`),
// so a pair outside it cannot be written. The primary half is named by `label`
// and reports loading as its value; the chevron half is named by `menuLabel`.

import PolymorphTokens
import SwiftUI

public struct PMSplitButton: PMSplitButtonRendering {
  @Environment(\.pmTheme) private var theme
  @State private var presented: Bool
  private let props: PMSplitButtonProps

  public init(props: PMSplitButtonProps) {
    self.props = props
    _presented = State(initialValue: props.defaultOpen ?? false)
  }

  public var body: some View {
    let size = props.size ?? .md
    let disabled = props.disabled ?? false
    let loading = props.loading ?? false
    let appearance = Self.appearance(props)

    HStack(spacing: appearance.variant == .outline ? -PMRule.thickness : 0) {
      Button {
        guard !loading else { return }
        props.onClick?()
      } label: {
        PMButtonLabel(
          label: props.label, icon: props.icon, trailingIcon: nil, controlSize: size,
          iconOnly: false, loading: loading)
      }
      .buttonStyle(
        PMButtonStyle(
          appearance: appearance, controlSize: size, iconOnly: false, loading: loading, on: false,
          corners: .leading)
      )
      .accessibilityLabel(Text(props.label))
      .modifier(PMSplitBusy(busy: loading))
      .overlay(alignment: .trailing) {
        if let seam = seam(appearance) {
          PMRule(seam, axis: .vertical).allowsHitTesting(false)
        }
      }
      Button {
        presented = true
      } label: {
        PMIconView(.expand, size: size)
      }
      .buttonStyle(
        PMButtonStyle(
          appearance: appearance, controlSize: size, iconOnly: true, loading: false,
          on: presented, corners: .trailing)
      )
      .disabled(loading)
      .accessibilityLabel(Text(props.menuLabel))
      .modifier(
        PMAnchoredPresentation(
          isPresented: $presented, compact: props.presentation == .popover ? .popover : .sheet,
          anchor: .point(.bottomTrailing), edge: .top
        ) {
          PMMenuPanel(entries: props.entries) { presented = false }
        }
      )
    }
    .fixedSize()
    .disabled(disabled)
    .accessibilityElement(children: .contain)
    .pmMember("SplitButton", Self.attributes(appearance, size: size, open: presented, props: props))
  }

  /// The group's cell, the same cell of Button's lawful grid.
  static func appearance(_ props: PMSplitButtonProps) -> PMButtonAppearance {
    switch props.appearance ?? .solidAccent {
    case .solidAccent: .solidAccent
    case .softAccent: .softAccent
    case .outlineNeutral: .outlineNeutral
    case .outlineAccent: .outlineAccent
    }
  }

  /// The seam: the active fill step on the filled variants. Outline's halves
  /// overlap their shared border, which is the seam.
  private func seam(_ appearance: PMButtonAppearance) -> PMDynamicColor? {
    if props.disabled == true { return theme.colors.borderSubtle }
    switch appearance {
    case .solidAccent: return theme.colors.accentBgActive
    case .softAccent: return theme.colors.accentSubtleActive
    default: return nil
    }
  }

  static func attributes(
    _ appearance: PMButtonAppearance, size: PMControlSize, open: Bool, props: PMSplitButtonProps
  ) -> [String: String] {
    var attributes = [
      "variant": appearance.variant.rawValue, "tone": appearance.tone.rawValue,
      "size": size.rawValue, "state": open ? "open" : "closed",
    ]
    if props.loading == true { attributes["loading"] = "true" }
    if props.disabled == true { attributes["disabled"] = "true" }
    if let icon = props.icon { attributes["icon"] = icon.rawValue }
    return attributes
  }
}

/// `aria-busy` on the primary half: while loading, its value is the spinner's label.
private struct PMSplitBusy: ViewModifier {
  let busy: Bool

  func body(content: Content) -> some View {
    if busy {
      content.accessibilityValue(Text(PMStrings.loading))
    } else {
      content
    }
  }
}

/// SplitButton's states, from the spec's States table.
public struct SplitButtonStates: PMStates {
  public let member = "SplitButton"

  public init() {}

  private static let resolve: [PMMenuEntry] = [
    .item(PMMenuItemEntry(label: "Resolve and notify", icon: .send, onSelect: {})),
    .item(PMMenuItemEntry(label: "Resolve as duplicate", icon: .duplicate, onSelect: {})),
  ]

  private static let withDanger: [PMMenuEntry] = resolve + [
    .separator,
    .item(PMMenuItemEntry(label: "Close without reply", tone: .danger, onSelect: {})),
  ]

  private static let more = "More resolve options"

  private static func button(
    _ appearance: PMSplitButtonAppearance = .solidAccent,
    icon: PMIconRole? = nil, loading: Bool = false, disabled: Bool = false,
    size: PMControlSize? = nil
  ) -> PMSplitButton {
    PMSplitButton(
      props: PMSplitButtonProps(
        disabled: disabled, entries: resolve, icon: icon, label: "Resolve", loading: loading,
        menuLabel: more, size: size, appearance: appearance))
  }

  public var entries: [PMStateEntry] {
    let sizes = [PMControlSize.sm, .lg].map { size in
      PMStateEntry("size \(size.rawValue)", expect: ["size": size.rawValue]) {
        Self.button(size: size)
      }
    }
    return [
      PMStateEntry("solid accent", expect: ["variant": "solid", "tone": "accent"]) {
        Self.button()
      },
      PMStateEntry("soft accent", expect: ["variant": "soft", "tone": "accent"]) {
        Self.button(.softAccent)
      },
      PMStateEntry("outline accent", expect: ["variant": "outline", "tone": "accent"]) {
        Self.button(.outlineAccent)
      },
      PMStateEntry("outline neutral — the one lawful neutral", expect: ["tone": "neutral"]) {
        Self.button(.outlineNeutral)
      },
      PMStateEntry("with icon", expect: ["icon": "confirm"]) {
        Self.button(icon: .confirm)
      },
    ] + sizes + [
      PMStateEntry(
        "open — Menu's panel under it",
        expect: ["state": "open", "contains": "Menu[part=panel],Menu[part=item tone=]"]
      ) {
        SplitButtonOpen(entries: Self.resolve)
      },
      PMStateEntry(
        "danger entry — Menu's quiet danger",
        expect: ["state": "open", "contains": "Menu[part=item tone=danger]"]
      ) {
        SplitButtonOpen(entries: Self.withDanger)
      },
      PMStateEntry("loading — the chevron inert", expect: ["loading": "true"]) {
        Self.button(icon: .confirm, loading: true)
      },
      PMStateEntry("disabled — both halves", expect: ["disabled": "true"]) {
        Self.button(disabled: true)
      },
    ]
  }
}

/// An open split button as the fixture draws it: the group, and Menu's panel
/// hanging from its end.
private struct SplitButtonOpen: View {
  @Environment(\.pmTheme) private var theme
  let entries: [PMMenuEntry]

  var body: some View {
    let props = PMSplitButtonProps(entries: entries, label: "Resolve", menuLabel: "More")
    VStack(alignment: .trailing, spacing: theme.defaultDensity.space.s1) {
      PMSplitButton(props: props)
      PMMenuPanel(entries: entries, framed: true, close: {})
        .fixedSize()
    }
    .accessibilityElement(children: .contain)
    .pmMember(
      "SplitButton",
      PMSplitButton.attributes(
        PMSplitButton.appearance(props), size: .md, open: true, props: props))
  }
}
