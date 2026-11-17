// Spinner (`design/components/spinner.md`): the `loading` glyph on the `spin`
// ambient pattern, with a name that is announced once. It owns no layout and
// sets no colour, so it takes the foreground of where it sits, as the web's
// `currentColor`. Button's loading state draws the same glyph through
// `PMSpinGlyph`, without the announcement, because the button's own value says
// it is busy.

import PolymorphTokens
import SwiftUI

public struct PMSpinner: PMSpinnerRendering {
  private let props: PMSpinnerProps

  public init(props: PMSpinnerProps) {
    self.props = props
  }

  public var body: some View {
    let size = props.size ?? .md
    let label = props.label ?? PMStrings.loading

    PMSpinGlyph(controlSize: size)
      // One element, named by the label: the glyph shows "loading" and has no text.
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(Text(label))
      .accessibilityAddTraits(.updatesFrequently)
      // The web's `role="status"`: one polite announcement of the label when
      // the spinner appears.
      .onAppear { AccessibilityNotification.Announcement(label).post() }
      .pmMember("Spinner", ["size": size.rawValue])
  }
}

/// Spinner's states, from the spec's States table: the three sizes, a label
/// that says what is loading, and the colour of its context.
public struct SpinnerStates: PMStates {
  public let member = "Spinner"

  public init() {}

  public var entries: [PMStateEntry] {
    let sizes = PMControlSize.allCases.map { size in
      PMStateEntry("size \(size.rawValue)", expect: ["size": size.rawValue, "label": "Loading"]) {
        PMSpinner(props: PMSpinnerProps(size: size))
      }
    }
    return sizes + [
      PMStateEntry(
        "a label that says what is loading",
        expect: ["size": "md", "label": "Fetching tickets"]
      ) {
        PMSpinner(props: PMSpinnerProps(label: "Fetching tickets"))
      },
      PMStateEntry(
        "takes its colour from where it sits",
        expect: ["size": "lg", "label": "Deleting"]
      ) {
        SpinnerInContext()
      },
    ]
  }
}

/// A spinner in danger text: it draws in the colour it is given.
private struct SpinnerInContext: View {
  @Environment(\.pmTheme) private var theme

  var body: some View {
    PMSpinner(props: PMSpinnerProps(label: "Deleting", size: .lg))
      .foregroundStyle(theme.colors.dangerText.color)
  }
}
