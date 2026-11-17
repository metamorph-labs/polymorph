// PageHeader (`design/components/page-header.md`): the title, description and
// actions at the top of a working page. No size, variant or tone: the law keeps
// page headers alike. The title is the page's one top-level heading. The
// actions sit beside the text when both fit on one line, and wrap under it when
// they do not, as the web's wrapping row does; on a phone that is usually below.
// No border: the page body separates the header from what follows.
//
// The actions are the app's Buttons in an Inline: at most one solid, the rest
// outline or ghost (the hierarchy law, held by review).

import PolymorphTokens
import SwiftUI

public struct PMPageHeader: PMPageHeaderRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMPageHeaderProps

  public init(props: PMPageHeaderProps) {
    self.props = props
  }

  public var body: some View {
    let space = theme.defaultDensity.space

    Group {
      if let actions = props.actions {
        ViewThatFits(in: .horizontal) {
          HStack(alignment: .top, spacing: space.s5) {
            text.fixedSize(horizontal: true, vertical: false)
            Spacer(minLength: 0)
            row(actions, wrap: false)
          }
          VStack(alignment: .leading, spacing: space.s4) {
            text
            row(actions, wrap: true)
          }
        }
      } else {
        text
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.bottom, space.s6)
    .accessibilityElement(children: .contain)
    .pmMember("PageHeader", props.actions == nil ? [:] : ["actions": "true"])
  }

  private var text: some View {
    let space = theme.defaultDensity.space
    return VStack(alignment: .leading, spacing: space.s2) {
      Text(props.title)
        .pmTextStyle(theme.text.text2xl)
        .foregroundStyle(theme.colors.textPrimary.color)
        .accessibilityAddTraits(.isHeader)
        .accessibilityHeading(.h1)
      if let description = props.description {
        Text(description)
          .pmTextStyle(theme.text.md)
          .foregroundStyle(theme.colors.textSecondary.color)
          // A line length, not a width: six of the largest space step.
          .frame(maxWidth: space.s10 * PMRecipe.pageHeaderMeasure, alignment: .leading)
      }
    }
    .multilineTextAlignment(.leading)
    .fixedSize(horizontal: false, vertical: true)
  }

  /// The actions in a row: beside the text, as wide as they are; under it,
  /// wrapping when the row is narrower than they are.
  private func row(_ actions: PMContent, wrap: Bool) -> some View {
    PMInline(props: PMInlineProps(children: actions, gap: .s3, wrap: wrap))
      .fixedSize(horizontal: !wrap, vertical: true)
  }
}

/// PageHeader's states, from the spec's States table.
public struct PageHeaderStates: PMStates {
  public let member = "PageHeader"

  public init() {}

  private static let title = "Tickets"
  private static let long = "Customer escalations awaiting a reply from the billing team"
  private static let description = "Everything customers have asked, newest first."
  private static let create = "New ticket"
  private static let export = "Export"

  private func actions() -> PMContent {
    AnyView(
      Group {
        PMButton(props: PMButtonProps(label: Self.export, appearance: .ghostNeutral))
        PMButton(props: PMButtonProps(icon: .add, label: Self.create))
      })
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("title only") {
        PMPageHeader(props: PMPageHeaderProps(title: Self.title))
      },
      PMStateEntry("with description") {
        PMPageHeader(props: PMPageHeaderProps(description: Self.description, title: Self.title))
      },
      PMStateEntry("with actions", expect: ["actions": "true"]) {
        PMPageHeader(props: PMPageHeaderProps(actions: actions(), title: Self.title))
      },
      PMStateEntry("full", expect: ["actions": "true"]) {
        PMPageHeader(
          props: PMPageHeaderProps(
            actions: actions(), description: Self.description, title: Self.title))
      },
      PMStateEntry("long title and actions", expect: ["actions": "true"]) {
        PMPageHeader(props: PMPageHeaderProps(actions: actions(), title: Self.long))
      },
    ]
  }
}
