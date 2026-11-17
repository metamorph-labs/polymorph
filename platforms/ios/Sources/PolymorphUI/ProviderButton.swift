// ProviderButton (`design/components/provider-button.md`): a Button preset for
// signing in with an identity provider. It is Button's outline/neutral cell by
// reference (`PMButtonStyle`), at every size and in every state, with the
// provider's mark in the icon slot (`PMBrandMark`, the foundation's: Google's
// four-colour "G", Microsoft's four squares, GitHub's mark in the text
// colour) and the label after it, on one line, cut with an ellipsis. The cell
// is fixed, because a mark is legible and within its provider's terms only on
// a neutral surface. In a column it takes the column's width.
//
// `label` is the whole sentence the app's catalog writes ("Continue with
// Google"), never assembled here. While `loading` the spinner takes the
// mark's place, the label stays, and a press does nothing; the button reports
// "Loading" as its value. Disabled, the button is Button's disabled cell and
// the mark is desaturated and half transparent. A `submit` button submits the
// form it is in, as Button's does.

import PolymorphTokens
import SwiftUI

public struct PMProviderButton: PMProviderButtonRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmSubmitAction) private var submitAction
  private let props: PMProviderButtonProps

  public init(props: PMProviderButtonProps) {
    self.props = props
  }

  public var body: some View {
    let size = props.size ?? .md
    let loading = props.loading ?? false
    let disabled = props.disabled ?? false

    Button {
      guard !loading else { return }
      props.onClick?()
      if props.type == .submit { submitAction?() }
    } label: {
      HStack(spacing: PMControlMetrics(size, theme).gap) {
        if loading {
          PMSpinGlyph(controlSize: size)
        } else {
          PMBrandMark(provider: props.provider, size: size, disabled: disabled)
        }
        Text(props.label)
          .lineLimit(1)
          .truncationMode(.tail)
      }
      .frame(maxWidth: .infinity)
    }
    .buttonStyle(
      PMButtonStyle(
        appearance: .outlineNeutral, controlSize: size, iconOnly: false, loading: loading,
        on: false)
    )
    .disabled(disabled)
    .keyboardShortcut(props.type == .submit ? .defaultAction : nil)
    .accessibilityLabel(Text(props.label))
    .modifier(PMProviderBusy(busy: loading))
    .pmMember("ProviderButton", attributes(size, loading: loading, disabled: disabled))
  }

  private func attributes(_ size: PMControlSize, loading: Bool, disabled: Bool)
    -> [String: String]
  {
    var attributes = [
      "variant": "outline", "tone": "neutral", "size": size.rawValue,
      "provider": props.provider.rawValue,
    ]
    if loading { attributes["state"] = "loading" }
    if disabled { attributes["disabled"] = "true" }
    return attributes
  }
}

/// While loading, the button's value is the spinner's label, as `aria-busy` is announced.
private struct PMProviderBusy: ViewModifier {
  let busy: Bool

  func body(content: Content) -> some View {
    if busy {
      content.accessibilityValue(Text(PMStrings.loading))
    } else {
      content
    }
  }
}

/// ProviderButton's states, from the spec's States table.
public struct ProviderButtonStates: PMStates {
  public let member = "ProviderButton"

  public init() {}

  private static let google = "Continue with Google"

  public var entries: [PMStateEntry] {
    let sizes = [PMControlSize.sm, .lg].map { size in
      PMStateEntry("size \(size.rawValue)", expect: ["size": size.rawValue]) {
        PMProviderButton(props: PMProviderButtonProps(label: Self.google, provider: .google, size: size))
      }
    }
    return [
      PMStateEntry(
        "google", expect: ["provider": "google", "variant": "outline", "tone": "neutral", "size": "md"]
      ) {
        PMProviderButton(props: PMProviderButtonProps(label: Self.google, provider: .google))
      },
      PMStateEntry("microsoft", expect: ["provider": "microsoft"]) {
        PMProviderButton(
          props: PMProviderButtonProps(label: "Continue with Microsoft", provider: .microsoft))
      },
      PMStateEntry("github — the mark in the text colour", expect: ["provider": "github"]) {
        PMProviderButton(props: PMProviderButtonProps(label: "Continue with GitHub", provider: .github))
      },
    ] + sizes + [
      PMStateEntry("loading", expect: ["state": "loading", "value": "Loading"]) {
        PMProviderButton(
          props: PMProviderButtonProps(label: Self.google, loading: true, provider: .google))
      },
      PMStateEntry("disabled — the mark desaturated", expect: ["disabled": "true"]) {
        PMProviderButton(
          props: PMProviderButtonProps(disabled: true, label: Self.google, provider: .google))
      },
      PMStateEntry("a chooser — each the column's width", expect: ["provider": "google"]) {
        ProviderChooser()
      },
      PMStateEntry("localized — a German sentence", expect: ["provider": "google"]) {
        PMProviderButton(props: PMProviderButtonProps(label: "Mit Google fortfahren", provider: .google))
      },
    ]
  }
}

/// Three providers in a column, `space-3` apart.
private struct ProviderChooser: View {
  @Environment(\.pmTheme) private var theme

  var body: some View {
    VStack(spacing: theme.defaultDensity.space.s3) {
      PMProviderButton(props: PMProviderButtonProps(label: "Continue with Google", provider: .google))
      PMProviderButton(
        props: PMProviderButtonProps(label: "Continue with Microsoft", provider: .microsoft))
      PMProviderButton(props: PMProviderButtonProps(label: "Continue with GitHub", provider: .github))
    }
  }
}
