// SettingsPage (`design/archetypes/settings-page.md`): the settings screen. The
// page header and the SettingsRow groups in one readable column, the gutter
// between header and groups and between groups. No actions row: settings apply
// at once, and a screen that needs a save bar is a FormPage.
//
// The load status (`design/native/screen-contract.md`): `loading` draws
// Skeleton rows in place of the groups, `failed` a danger Alert in their place,
// and `empty` is `ready`.

import PolymorphTokens
import SwiftUI

public struct PMSettingsPage: PMSettingsPageRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMSettingsPageProps

  public init(props: PMSettingsPageProps) {
    self.props = props
  }

  public var body: some View {
    let space = theme.defaultDensity.space
    let status = props.loadStatus

    PMPage(measure: PMRecipe.settingsPageMeasure, member: "SettingsPage", status: status) {
      PMPageHeader(props: PMPageHeaderProps(description: props.description, title: props.title))
      switch status {
      case .ready, .empty:
        props.children
      case .loading:
        PMPagePanel {
          PMPageSkeletonRows().padding(space.s6)
        }
      case .failed(let message):
        PMPageFailure(message: message, onRetry: props.onRetry)
      }
    }
  }
}

/// SettingsPage's states: the four load states, over two groups, each naming
/// what its body holds (`contains`).
public struct SettingsPageStates: PMStates {
  public let member = "SettingsPage"

  public init() {}

  private static let title = "Settings"
  private static let description = "How this workspace behaves for everyone in it."
  private static let failure = "Settings could not be loaded."

  private func row(_ label: String, _ control: String) -> some View {
    PMSettingsRow(
      props: PMSettingsRowProps(
        control: AnyView(
          PMButton(props: PMButtonProps(label: control, size: .sm, appearance: .outlineNeutral))),
        label: label))
  }

  private func groups() -> PMContent {
    AnyView(
      Group {
        PMSettingsRow.Group(
          props: PMSettingsRowGroupProps(
            children: AnyView(Group { row("Email digests", "On"); row("Mobile push", "Off") }),
            title: "Notifications"))
        PMSettingsRow.Group(
          props: PMSettingsRowGroupProps(
            children: AnyView(row("Export data", "Download")), title: "Data"))
      })
  }

  private func page(_ status: PMLoadStatus) -> some View {
    PMSettingsPage(
      props: PMSettingsPageProps(
        loadStatus: status, onRetry: {}, children: groups(), description: Self.description,
        title: Self.title)
    )
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("ready", expect: ["status": "ready", "contains": "SettingsRow"]) {
        page(.ready)
      },
      PMStateEntry("loading", expect: ["status": "loading", "contains": "Skeleton"]) {
        page(.loading)
      },
      PMStateEntry("empty", expect: ["status": "empty", "contains": "SettingsRow"]) {
        page(.empty)
      },
      PMStateEntry("failed", expect: ["status": "failed", "contains": "Alert"]) {
        page(.failed(message: Self.failure))
      },
    ]
  }
}
