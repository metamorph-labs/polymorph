// EmptyState (`design/components/empty-state.md`): the message a view shows
// when there is nothing to show, for first runs, filters that match nothing
// and error-empty cases alike. Guidance, not an alarm: a muted glyph on a
// subtle wash whatever the case, a title that states the situation, what to do
// about it, and at most two actions.
//
// No entrance motion of its own: the fade belongs to whatever swapped the
// content out (ListPage's body), because a fade on first paint would animate a
// page load. Plain content, read in order, with no live region.

import PolymorphTokens
import SwiftUI

public struct PMEmptyState: PMEmptyStateRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMEmptyStateProps

  public init(props: PMEmptyStateProps) {
    self.props = props
  }

  public var body: some View {
    let space = theme.defaultDensity.space
    let icon = props.icon ?? .inbox

    VStack(spacing: space.s4) {
      PMIconView(icon, size: .lg)
        .foregroundStyle(theme.colors.textMuted.color)
        .padding(space.s4)
        .background(theme.colors.bgSubtle.color, in: .circle)

      // The web's `<h2>`: a heading a VoiceOver user can move to.
      Text(props.title)
        .pmTextStyle(theme.text.lg)
        .foregroundStyle(theme.colors.textPrimary.color)
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityAddTraits(.isHeader)
        .accessibilityHeading(.h2)

      if let description = props.description {
        Text(description)
          .pmTextStyle(theme.text.sm)
          .foregroundStyle(theme.colors.textSecondary.color)
          .fixedSize(horizontal: false, vertical: true)
          // A line length, not a width: five of the largest space step.
          .frame(maxWidth: space.s10 * PMRecipe.emptyStateMeasure)
      }

      if props.action != nil || props.secondaryAction != nil {
        HStack(spacing: space.s3) {
          props.action
          props.secondaryAction
        }
        // One space step beyond the gap, to set the actions apart from the text.
        .padding(.top, space.s2)
      }
    }
    .multilineTextAlignment(.center)
    .frame(maxWidth: .infinity)
    .padding(.vertical, space.s8)
    .padding(.horizontal, space.s6)
    .accessibilityElement(children: .contain)
    .pmMember("EmptyState", ["icon": icon.rawValue])
  }
}

/// EmptyState's states, from the spec's States table. The actions are Buttons,
/// as the spec's convention names them: `soft`/`accent` and `ghost`.
public struct EmptyStateStates: PMStates {
  public let member = "EmptyState"

  public init() {}

  private static let title = "No tickets yet"
  private static let description = "Tickets your customers open by email or chat appear here."
  private static let create = "New ticket"
  private static let importLabel = "Import tickets"
  private static let noResults = "No results match"
  private static let clear = "Clear filters"

  private func button(
    _ label: String, _ appearance: PMButtonAppearance, icon: PMIconRole? = nil
  ) -> PMContent {
    AnyView(PMButton(props: PMButtonProps(icon: icon, label: label, appearance: appearance)))
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("minimal", expect: ["icon": "inbox"]) {
        PMEmptyState(props: PMEmptyStateProps(title: Self.title))
      },
      PMStateEntry("standard", expect: ["icon": "inbox"]) {
        PMEmptyState(props: PMEmptyStateProps(description: Self.description, title: Self.title))
      },
      PMStateEntry("with action") {
        PMEmptyState(
          props: PMEmptyStateProps(
            action: button(Self.create, .softAccent, icon: .add), description: Self.description,
            title: Self.title))
      },
      PMStateEntry("with both actions") {
        PMEmptyState(
          props: PMEmptyStateProps(
            action: button(Self.create, .softAccent, icon: .add), description: Self.description,
            secondaryAction: button(Self.importLabel, .ghostNeutral), title: Self.title))
      },
      PMStateEntry("filtered dry", expect: ["icon": "search"]) {
        PMEmptyState(
          props: PMEmptyStateProps(
            icon: .search, secondaryAction: button(Self.clear, .ghostNeutral),
            title: Self.noResults))
      },
    ]
  }
}
