// SettingsRow (`design/components/settings-row.md`): a label and a description
// beside one control, for settings screens. `PMSettingsRow.Group` is a section:
// its title is the overline heading (the section-heading recipe), and its rows
// share one Card-like surface, separated by rules that reach the surface's
// edges. No error surface: a setting applies at once and reports failure in a
// Toast; a screen that validates is a FormPage.
//
// The row labels its control, as the web sets `aria-labelledby` and
// `aria-describedby` on it: the row is one element named by the label, with
// the description as its hint, and the control's own value and actions. The
// control never grows; the text column takes the room.
//
// Each row in a group draws the rule above it; the group lifts its rows by one
// rule's thickness under the surface's clip, so the first row's rule is hidden
// and the surface's own border is the outer edge. A row on its own draws none.

import PolymorphTokens
import SwiftUI

public struct PMSettingsRow: PMSettingsRowRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmRuledRows) private var ruled
  private let props: PMSettingsRowProps

  public init(props: PMSettingsRowProps) {
    self.props = props
  }

  public var body: some View {
    let space = theme.defaultDensity.space

    HStack(spacing: space.s6) {
      VStack(alignment: .leading, spacing: space.s1) {
        Text(props.label)
          .pmTextStyle(theme.text.sm)
          .foregroundStyle(theme.colors.textPrimary.color)
        if let description = props.description {
          Text(description)
            .pmTextStyle(theme.text.xs)
            .foregroundStyle(theme.colors.textSecondary.color)
            .frame(maxWidth: space.s10 * PMRecipe.settingsRowMeasure, alignment: .leading)
        }
      }
      .multilineTextAlignment(.leading)
      .fixedSize(horizontal: false, vertical: true)
      .frame(maxWidth: .infinity, alignment: .leading)
      .accessibilityHidden(true)

      props.control
        .fixedSize()
    }
    .padding(.vertical, space.s4)
    .padding(.horizontal, space.s6)
    .overlay(alignment: .top) {
      if ruled {
        PMRule(theme.colors.borderSubtle)
      }
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel(Text(props.label))
    // The description is the row's hint, the web's `aria-describedby`.
    .pmAccessibilityHint(props.description)
    .pmMember("SettingsRow", props.description == nil ? [:] : ["described": "true"])
  }
}

private struct PMRuledRowsKey: EnvironmentKey {
  static let defaultValue = false
}

extension EnvironmentValues {
  /// Whether a SettingsRow draws the rule above it: inside a group, where rows
  /// are separated; a row on its own draws none.
  fileprivate var pmRuledRows: Bool {
    get { self[PMRuledRowsKey.self] }
    set { self[PMRuledRowsKey.self] = newValue }
  }
}

extension PMSettingsRow {
  /// A section of settings: the overline title, then the rows on one surface.
  public struct Group: View {
    @Environment(\.pmTheme) private var theme
    private let props: PMSettingsRowGroupProps

    public init(props: PMSettingsRowGroupProps) {
      self.props = props
    }

    public var body: some View {
      let space = theme.defaultDensity.space
      let shape = RoundedRectangle(cornerRadius: theme.radius.surface)

      VStack(alignment: .leading, spacing: space.s2) {
        // The uppercase is drawn only: the title is spoken as written.
        Text(props.title)
          .textCase(.uppercase)
          .pmTextStyle(theme.text.xs)
          .foregroundStyle(theme.colors.textSecondary.color)
          .accessibilityLabel(Text(props.title))
          .accessibilityAddTraits(.isHeader)
          .accessibilityHeading(.h2)

        VStack(spacing: 0) {
          props.children
        }
        .environment(\.pmRuledRows, true)
        .padding(.top, -PMRule.thickness)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.colors.bgSurface.color)
        .clipShape(shape)
        .overlay { shape.strokeBorder(theme.colors.borderSubtle.color, lineWidth: 1) }
        .pmInsetShadow(theme.insetTop, in: shape)
        .pmShadow(theme.shadows.resting)
      }
      .accessibilityElement(children: .contain)
      // The part's identity: the member's name with the part, as the harness
      // reads one identifier per root.
      .pmMember("SettingsRow", ["part": "group"])
    }
  }
}

/// SettingsRow's states, from the spec: a group of three rows (a Switch, a
/// Select and a Button stand in as Buttons, the control this slice can rely
/// on), a row without a description, and a row on its own.
public struct SettingsRowStates: PMStates {
  public let member = "SettingsRow"

  public init() {}

  private static let group = "Notifications"
  private static let email = "Email digests"
  private static let emailNote = "A summary of open tickets every morning."
  private static let mobile = "Mobile push"
  private static let export = "Export data"
  private static let exportNote = "A CSV of every ticket in this workspace."
  private static let on = "On"
  private static let off = "Off"
  private static let download = "Download"

  private func control(_ label: String) -> PMContent {
    AnyView(PMButton(props: PMButtonProps(label: label, size: .sm, appearance: .outlineNeutral)))
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("row", expect: ["described": "true", "label": Self.email]) {
        PMSettingsRow(
          props: PMSettingsRowProps(
            control: control(Self.on), description: Self.emailNote, label: Self.email))
      },
      PMStateEntry("row without description", expect: ["label": Self.mobile]) {
        PMSettingsRow(props: PMSettingsRowProps(control: control(Self.off), label: Self.mobile))
      },
      PMStateEntry("group of three rows", expect: ["part": "group"]) {
        PMSettingsRow.Group(
          props: PMSettingsRowGroupProps(
            children: AnyView(
              Group {
                PMSettingsRow(
                  props: PMSettingsRowProps(
                    control: control(Self.on), description: Self.emailNote, label: Self.email))
                PMSettingsRow(
                  props: PMSettingsRowProps(control: control(Self.off), label: Self.mobile))
                PMSettingsRow(
                  props: PMSettingsRowProps(
                    control: control(Self.download), description: Self.exportNote,
                    label: Self.export))
              }),
            title: Self.group))
      },
    ]
  }
}
