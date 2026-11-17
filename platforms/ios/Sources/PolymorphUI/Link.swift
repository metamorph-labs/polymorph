// Link (`design/components/link.md`): navigation as text, or in Button's
// costume. A SwiftUI `Link`, so it carries the link trait and opens `href`
// through the environment's `openURL`: an app routes its own paths by
// installing an `OpenURLAction`, and the system opens the rest. Given
// `onNavigate`, a link that is not `external` calls it with `href` in place of
// opening it, as the web member stops the browser and calls the app's router
// (`link.md` §Routing); the link keeps its trait and its look.
//
// `inline` is accent text with the softened underline (`accent.underline`)
// and takes the type of the text around it; `standalone` is `text.sm` accent
// text with no underline at rest. Under the pointer and while pressed both
// draw the underline in full `accent.text`, the web's hover; SwiftUI draws one
// underline thickness, so the web's thicker hover line is its colour alone.
// `button` wears Button's recipe by reference (`PMButtonStyle`): the
// `buttonVariant` × `tone` cell, the size, and press feedback. Its tones are
// Button's lawful grid: a filled variant with `neutral`, which the grid
// excludes, wears `accent`. `external` adds the `open-external` glyph after
// the text; every link leaves the app for the browser unless the app routes
// it, so there is no new tab to open.
//
// An inline link is a view, so it cannot flow inside a wrapped paragraph;
// prose with links is Markdown's. An `href` that is not a URL renders the
// text alone, because a link that cannot be followed is not drawn as one.

import PolymorphTokens
import SwiftUI

public struct PMLink: PMLinkRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMLinkProps

  public init(props: PMLinkProps) {
    self.props = props
  }

  public var body: some View {
    let variant = props.variant ?? .inline
    let external = props.external ?? false

    Group {
      if let url = URL(string: props.href) {
        if variant == .button {
          Link(destination: url) {
            PMButtonLabel(
              label: props.children, icon: nil, trailingIcon: external ? .openExternal : nil,
              controlSize: props.size ?? .md, iconOnly: false, loading: false)
          }
          .buttonStyle(
            PMButtonStyle(
              appearance: appearance, controlSize: props.size ?? .md, iconOnly: false,
              loading: false, on: false))
        } else {
          Link(destination: url) {
            PMLinkText(text: props.children, external: external)
          }
          .buttonStyle(PMLinkTextStyle(standalone: variant == .standalone))
        }
      } else {
        Text(props.children)
      }
    }
    // An external link leaves the app, as it opens a new tab on the web.
    .pmRoutes(props.href, to: external ? nil : props.onNavigate)
    .pmMember("Link", attributes(variant: variant, external: external))
  }

  /// The costume's cell: `buttonVariant` (`soft` unless chosen) × `tone`,
  /// within Button's lawful grid.
  private var appearance: PMButtonAppearance {
    let variant = PMButtonVariant(rawValue: (props.buttonVariant ?? .soft).rawValue) ?? .soft
    let tone = PMButtonTone(rawValue: (props.tone ?? .accent).rawValue) ?? .accent
    return PMButtonAppearance(variant: variant, tone: tone)
      ?? PMButtonAppearance(variant: variant, tone: .accent) ?? .softAccent
  }

  private func attributes(variant: PMLinkVariant, external: Bool) -> [String: String] {
    var attributes: [String: String]
    if variant == .button {
      // The costume's attributes are Button's, as the web's are.
      attributes = [
        "variant": appearance.variant.rawValue, "tone": appearance.tone.rawValue,
        "size": (props.size ?? .md).rawValue,
      ]
    } else {
      attributes = ["variant": variant.rawValue]
    }
    if external { attributes["external"] = "true" }
    return attributes
  }
}

extension View {
  /// The routing seam (`link.md` §Routing): with `onNavigate`, a link inside
  /// calls it with `href` in place of the environment's `openURL`, so the app's
  /// router takes it; without, the link opens as the environment says.
  func pmRoutes(_ href: String, to onNavigate: (@MainActor (String) -> Void)?) -> some View {
    modifier(PMRoutes(href: href, onNavigate: onNavigate))
  }
}

private struct PMRoutes: ViewModifier {
  let href: String
  let onNavigate: (@MainActor (String) -> Void)?

  func body(content: Content) -> some View {
    if let onNavigate {
      content.environment(
        \.openURL,
        OpenURLAction { _ in
          onNavigate(href)
          return .handled
        })
    } else {
      content
    }
  }
}

/// The text and, for an external link, the `open-external` glyph one space
/// step after it, at `sm`, in the text's colour.
private struct PMLinkText: View {
  @Environment(\.pmTheme) private var theme
  let text: String
  let external: Bool

  var body: some View {
    HStack(spacing: theme.defaultDensity.space.s1) {
      Text(text)
      if external {
        PMIconView(.openExternal, size: .sm)
      }
    }
  }
}

/// The text variants' recipe: accent text; `inline` underlined in the softened
/// colour and in the surrounding type; `standalone` at `text.sm`, underlined
/// only under the pointer or while pressed. Both reach the hit target.
private struct PMLinkTextStyle: ButtonStyle {
  let standalone: Bool

  func makeBody(configuration: Configuration) -> some View {
    PMLinkTextChrome(standalone: standalone, pressed: configuration.isPressed) {
      configuration.label
    }
  }
}

private struct PMLinkTextChrome<Label: View>: View {
  @Environment(\.pmTheme) private var theme
  @State private var hovering = false
  let standalone: Bool
  let pressed: Bool
  @ViewBuilder let label: () -> Label

  var body: some View {
    let colors = theme.colors
    let active = hovering || pressed
    let line: PMDynamicColor? =
      active ? colors.accentText : standalone ? nil : colors.accentUnderline

    if standalone {
      label()
        .pmTextStyle(theme.text.sm)
        .foregroundStyle(colors.accentText.color)
        .underline(line != nil, color: line?.color)
        .onHover { hovering = $0 }
        .pmHitTarget()
    } else {
      label()
        .foregroundStyle(colors.accentText.color)
        .underline(true, color: line?.color)
        .onHover { hovering = $0 }
        // A link is a view, never a run inside wrapped text, so it takes the
        // hit target as every pressable part does.
        .pmHitTarget()
    }
  }
}

/// Link's states, from the spec's States table.
public struct LinkStates: PMStates {
  public let member = "Link"

  public init() {}

  private static let status = "https://example.com/status"

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("inline — underlined, in the type around it", expect: ["variant": "inline"]) {
        InlineSentence()
      },
      PMStateEntry(
        "standalone — a row, underlined under the pointer instead",
        expect: ["variant": "standalone", "label": "Open the audit trail"]
      ) {
        PMLink(
          props: PMLinkProps(
            children: "Open the audit trail", href: "https://example.com/audit",
            variant: .standalone))
      },
      PMStateEntry("external — the glyph after the text", expect: ["external": "true"]) {
        PMLink(props: PMLinkProps(children: "Status page", external: true, href: Self.status))
      },
      PMStateEntry(
        "external and standalone", expect: ["external": "true", "variant": "standalone"]
      ) {
        PMLink(
          props: PMLinkProps(
            children: "Webhook documentation", external: true,
            href: "https://example.com/docs", variant: .standalone))
      },
      PMStateEntry(
        "the costume, default — soft, accent, md",
        expect: ["variant": "soft", "tone": "accent", "size": "md"]
      ) {
        PMLink(
          props: PMLinkProps(
            children: "View billing", href: "https://example.com/billing", variant: .button))
      },
      PMStateEntry("the costume as solid", expect: ["variant": "solid", "tone": "accent"]) {
        PMLink(
          props: PMLinkProps(
            buttonVariant: .solid, children: "Start setup", href: "https://example.com/setup",
            variant: .button))
      },
      PMStateEntry(
        "the costume as outline neutral", expect: ["variant": "outline", "tone": "neutral"]
      ) {
        PMLink(
          props: PMLinkProps(
            buttonVariant: .outline, children: "Read the docs", href: "https://example.com/docs",
            tone: .neutral, variant: .button))
      },
      PMStateEntry(
        "external in costume — the glyph in Button's trailing slot",
        expect: ["external": "true", "variant": "outline"]
      ) {
        PMLink(
          props: PMLinkProps(
            buttonVariant: .outline, children: "Status page", external: true, href: Self.status,
            variant: .button))
      },
    ]
  }
}

/// An inline link opening a run of body text, in its type.
private struct InlineSentence: View {
  @Environment(\.pmTheme) private var theme
  private let after = " has the response bodies."

  var body: some View {
    HStack(spacing: 0) {
      PMLink(
        props: PMLinkProps(children: "The delivery log", href: "https://example.com/deliveries"))
      Text(after)
    }
    .pmTextStyle(theme.text.md)
    .foregroundStyle(theme.colors.textPrimary.color)
  }
}
