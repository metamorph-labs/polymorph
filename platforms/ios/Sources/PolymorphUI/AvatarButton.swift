// AvatarButton (`design/components/avatar-button.md`): a Button preset whose
// face is an Avatar, such as the trigger of an account menu. It is Button's
// ghost/neutral cell by reference (`PMButtonStyle`), in every state, with the
// corners at the pill radius: a face is round at every geometry, so its wash
// is round too. The face is `PMAvatar` at the button's size inside a `space.1`
// gutter, and the box is never smaller than the size's control height, so at
// `sm` and `md` it is Button's icon-only square. The hit area is the theme's
// hit target, as Button's is.
//
// `label` names the action ("Account menu"), never the person: the face is
// hidden from assistive technology, as an Avatar beside a visible name is.
// While `loading` the spinner takes the face's place, the box keeps its size,
// and a press does nothing; the button reports "Loading" as its value.
// Disabled, the button is Button's disabled cell and the face is desaturated
// and drawn at the recipe's opacity, because a face has fills of its own.
// `pressed` makes it a toggle, with the selected trait while on, and
// `current` is the selected trait, both as Button's are.
//
// As the trigger of a Menu, a Popover or a Dialog it runs the overlay's
// opening action after its own (`pmTriggerAction`), as Button does.

import PolymorphTokens
import SwiftUI

public struct PMAvatarButton: PMAvatarButtonRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmTriggerAction) private var triggerAction
  private let props: PMAvatarButtonProps

  public init(props: PMAvatarButtonProps) {
    self.props = props
  }

  public var body: some View {
    let size = props.size ?? .md
    let loading = props.loading ?? false
    let disabled = props.disabled ?? false
    // Loading takes precedence over the toggle in the state, as on the web;
    // the traits below still report the toggle.
    let state = loading ? "loading" : props.pressed.map { $0 ? "on" : "off" }

    Button {
      // Detached while loading, so a second press never runs a command
      // already in flight.
      guard !loading else { return }
      props.onClick?()
      triggerAction?()
    } label: {
      ZStack {
        // The face stays in the layout while loading, so the box keeps its size.
        PMAvatar(props: PMAvatarProps(name: props.name, size: size, src: props.src))
          .grayscale(disabled ? 1 : 0)
          .opacity(loading ? 0 : disabled ? PMRecipe.avatarButtonFaceDisabledOpacity : 1)
        if loading {
          PMSpinGlyph(controlSize: size)
        }
      }
      .padding(theme.defaultDensity.space.s1)
    }
    .buttonStyle(
      PMButtonStyle(
        appearance: .ghostNeutral, controlSize: size, iconOnly: true, loading: loading,
        on: props.pressed == true, corners: .round)
    )
    .disabled(disabled)
    .accessibilityLabel(Text(props.label))
    .modifier(PMAvatarButtonBusy(busy: loading))
    .accessibilityAddTraits(traits)
    .pmMember("AvatarButton", attributes(size, state: state, disabled: disabled))
  }

  private var traits: AccessibilityTraits {
    var traits: AccessibilityTraits = []
    if props.pressed != nil { traits.formUnion(.isToggle) }
    if props.pressed == true || props.current == true { traits.formUnion(.isSelected) }
    return traits
  }

  private func attributes(_ size: PMControlSize, state: String?, disabled: Bool)
    -> [String: String]
  {
    var attributes = ["variant": "ghost", "tone": "neutral", "size": size.rawValue]
    if let state { attributes["state"] = state }
    if disabled { attributes["disabled"] = "true" }
    return attributes
  }
}

/// While loading, the button's value is the spinner's label, as `aria-busy` is announced.
private struct PMAvatarButtonBusy: ViewModifier {
  let busy: Bool

  func body(content: Content) -> some View {
    if busy {
      content.accessibilityValue(Text(PMStrings.loading))
    } else {
      content
    }
  }
}

/// AvatarButton's states, from the spec's States table. The image entry shows
/// its initials while the image loads, or when it cannot, as Avatar's does.
public struct AvatarButtonStates: PMStates {
  public let member = "AvatarButton"

  public init() {}

  private static let ada = "Ada Lovelace"
  private static let account = "Account menu"
  private static let tickets = "Show my tickets"
  private static let photo = "https://example.com/avatars/ada.png"

  public var entries: [PMStateEntry] {
    let sizes = [PMControlSize.sm, .lg].map { size in
      PMStateEntry("size \(size.rawValue)", expect: ["size": size.rawValue]) {
        PMAvatarButton(props: PMAvatarButtonProps(label: Self.account, name: Self.ada, size: size))
      }
    }
    return [
      PMStateEntry(
        "initials — named by the action, not the person",
        expect: ["variant": "ghost", "tone": "neutral", "size": "md", "label": Self.account]
      ) {
        PMAvatarButton(props: PMAvatarButtonProps(label: Self.account, name: Self.ada))
      },
      PMStateEntry("an image, over the initials it replaces", expect: ["label": Self.account]) {
        PMAvatarButton(
          props: PMAvatarButtonProps(label: Self.account, name: Self.ada, src: Self.photo))
      },
      PMStateEntry("no name — the user glyph", expect: ["label": "Sign in"]) {
        PMAvatarButton(props: PMAvatarButtonProps(label: "Sign in", name: ""))
      },
    ] + sizes + [
      PMStateEntry("three sizes", expect: ["size": "sm"]) {
        AvatarButtonSizes()
      },
      PMStateEntry("loading", expect: ["state": "loading", "value": "Loading"]) {
        PMAvatarButton(
          props: PMAvatarButtonProps(label: Self.account, loading: true, name: Self.ada))
      },
      PMStateEntry("disabled — the face desaturated", expect: ["disabled": "true"]) {
        PMAvatarButton(
          props: PMAvatarButtonProps(disabled: true, label: Self.account, name: Self.ada))
      },
      PMStateEntry("pressed on — the active cell, latched", expect: ["state": "on"]) {
        PMAvatarButton(
          props: PMAvatarButtonProps(label: Self.tickets, name: Self.ada, pressed: true))
      },
      PMStateEntry("pressed off — the rest cell", expect: ["state": "off"]) {
        PMAvatarButton(
          props: PMAvatarButtonProps(label: Self.tickets, name: Self.ada, pressed: false))
      },
      PMStateEntry("current", expect: ["label": "Your profile"]) {
        PMAvatarButton(
          props: PMAvatarButtonProps(current: true, label: "Your profile", name: Self.ada))
      },
    ]
  }
}

/// The three sizes in a row, `space.3` apart.
private struct AvatarButtonSizes: View {
  @Environment(\.pmTheme) private var theme

  var body: some View {
    HStack(spacing: theme.defaultDensity.space.s3) {
      ForEach(PMControlSize.allCases, id: \.self) { size in
        PMAvatarButton(
          props: PMAvatarButtonProps(
            label: "Account menu (\(size.rawValue))", name: "Ada Lovelace", size: size))
      }
    }
  }
}
