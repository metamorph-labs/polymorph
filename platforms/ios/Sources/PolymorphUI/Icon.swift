// Icon (`design/components/icon.md`): the vocabulary's icon, a role drawn
// through the icon gateway (`PMIconView`) at the theme's icon size. It sets no
// colour: it draws in the foreground of where it sits, as the web's
// `currentColor`. Without a `label` it is decorative and hidden from
// accessibility, because the text beside it names the thing; with one it is
// an image named by the label.

import PolymorphTokens
import SwiftUI

public struct PMIcon: PMIconRendering {
  private let props: PMIconProps

  public init(props: PMIconProps) {
    self.props = props
  }

  public var body: some View {
    let size = props.size ?? .md
    PMIconView(props.name, size: size)
      .modifier(PMMeaningfulIcon(label: props.label))
      .pmMember("Icon", ["name": props.name.rawValue, "size": size.rawValue])
  }
}

/// A labelled icon is one image element named by its label; an unlabelled one
/// stays hidden, as the gateway draws it.
private struct PMMeaningfulIcon: ViewModifier {
  let label: String?

  func body(content: Content) -> some View {
    if let label {
      content
        .accessibilityHidden(false)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(label))
        .accessibilityAddTraits(.isImage)
    } else {
      content
    }
  }
}

/// Icon's states, from the spec's States table. A decorative icon exposes
/// nothing to accessibility, so its entries are `hidden`.
public struct IconStates: PMStates {
  public let member = "Icon"

  public init() {}

  public var entries: [PMStateEntry] {
    let sizes = PMControlSize.allCases.map { size in
      PMStateEntry("size \(size.rawValue)", expect: ["hidden": "true"]) {
        PMIcon(props: PMIconProps(name: .add, size: size))
      }
    }
    return sizes + [
      PMStateEntry(
        "labelled — an image with a name", expect: ["name": "warning", "label": "Warning"]
      ) {
        PMIcon(props: PMIconProps(label: "Warning", name: .warning))
      },
      PMStateEntry("inherits the colour of where it sits", expect: ["hidden": "true"]) {
        IconInContext()
      },
    ]
  }
}

/// An icon in danger text: it draws in the colour it is given.
private struct IconInContext: View {
  @Environment(\.pmTheme) private var theme

  var body: some View {
    PMIcon(props: PMIconProps(name: .error, size: .lg))
      .foregroundStyle(theme.colors.dangerText.color)
  }
}
