// DetailPage (`design/archetypes/detail-page.md`): one entity in full. The back
// Button, the identity header (the title, the meta row, the actions), the
// full-width tabs, and the body: the main column with the aside beside it, in
// the page column at eleven of the largest space step, in a scroll view.
//
// The back Button is Button's ghost/neutral/sm with the `back` glyph, first
// in reading order, before the title, as the web puts it first in the DOM; it
// sits `space.2` above the title because it belongs to it. The title is
// `text.2xl`, the page's one top-level heading. The meta row is an Inline of
// the app's items at `space.3`, wrapping, in `text.sm` secondary. The actions
// sit beside the title and meta when both fit on one line and wrap under them
// when they do not, as PageHeader's do: on a phone that is usually under.
//
// The aside is `space.10 * 3` wide beside the main column from a 44rem body
// (`PMPageRegions`), and moves under the main column below it, with the page
// gutter between them: on a phone a fixed-width aside would leave the main
// column a sliver. It scrolls with the page, because two scroll regions on
// one screen lose the reader's place.
//
// The load status (`design/native/screen-contract.md`): the header renders in
// every state. `loading` draws Skeleton rows in the main column and no aside
// and no tabs; `failed` a danger Alert in place of the body, with `onRetry`
// when it is set; `empty` is `ready`, because an entity has no empty form.

import PolymorphTokens
import SwiftUI

public struct PMDetailPage: PMDetailPageRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMDetailPageProps

  public init(props: PMDetailPageProps) {
    self.props = props
  }

  public var body: some View {
    let space = theme.defaultDensity.space
    let status = props.loadStatus

    PMPage(measure: PMRecipe.detailPageMeasure, member: "DetailPage", status: status) {
      VStack(alignment: .leading, spacing: space.s2) {
        PMButton(
          props: PMButtonProps(
            icon: .back, label: props.backLabel, onClick: props.onBack, size: .sm,
            appearance: .ghostNeutral))
        header
      }
      switch status {
      case .ready, .empty:
        if let tabs = props.tabs {
          tabs
        }
        if props.children != nil || props.aside != nil {
          PMPageRegions(tracks: .aside(space.s10 * PMRecipe.detailAsideWidth), gap: space.s6) {
            VStack(alignment: .leading, spacing: space.s6) {
              props.children
            }
            .frame(maxWidth: .infinity, alignment: .topLeading)
            if let aside = props.aside {
              VStack(alignment: .leading, spacing: space.s4) {
                aside
              }
              .frame(maxWidth: .infinity, alignment: .topLeading)
            }
          }
        }
      case .loading:
        PMPagePanel {
          PMPageSkeletonRows().padding(space.s6)
        }
      case .failed(let message):
        PMPageFailure(message: message, onRetry: props.onRetry)
      }
    }
  }

  /// The identity and the actions: beside each other when both fit on one
  /// line, the actions under the identity when they do not.
  @ViewBuilder
  private var header: some View {
    let space = theme.defaultDensity.space
    if let actions = props.actions {
      ViewThatFits(in: .horizontal) {
        HStack(alignment: .top, spacing: space.s6) {
          identity.fixedSize(horizontal: true, vertical: false)
          Spacer(minLength: 0)
          actionRow(actions, wrap: false)
        }
        VStack(alignment: .leading, spacing: space.s4) {
          identity
          actionRow(actions, wrap: true)
        }
      }
    } else {
      identity
    }
  }

  /// The title and the meta row under it.
  private var identity: some View {
    let space = theme.defaultDensity.space
    return VStack(alignment: .leading, spacing: space.s2) {
      Text(props.title)
        .pmTextStyle(theme.text.text2xl)
        .foregroundStyle(theme.colors.textPrimary.color)
        .accessibilityAddTraits(.isHeader)
        .accessibilityHeading(.h1)
      if let meta = props.meta {
        PMInline(props: PMInlineProps(align: .center, children: meta, gap: .s3, wrap: true))
          .pmTextStyle(theme.text.sm)
          .foregroundStyle(theme.colors.textSecondary.color)
      }
    }
    .multilineTextAlignment(.leading)
    .fixedSize(horizontal: false, vertical: true)
  }

  /// The actions in a row: beside the identity, as wide as they are; under it,
  /// wrapping when the row is narrower than they are.
  private func actionRow(_ actions: PMContent, wrap: Bool) -> some View {
    PMInline(props: PMInlineProps(children: actions, gap: .s3, wrap: wrap))
      .fixedSize(horizontal: !wrap, vertical: true)
  }

}

/// DetailPage's states: the spec's four compositions, the four load states
/// the screen contract names, and the aside beside the main column at an
/// iPad's width. Each names what its body holds (`contains`).
public struct DetailPageStates: PMStates {
  public let member = "DetailPage"

  public init() {}

  private static let inbox = "Back to inbox"
  private static let title = "Webhook retries stop after the first 5xx"
  private static let failure = "The ticket could not be loaded. Check your connection."
  private static let person = "Ada Lovelace"
  private static let opened = "opened 4 minutes ago"

  private static func meta() -> PMContent {
    AnyView(
      Group {
        PMBadge(props: PMBadgeProps(children: "Open", tone: .info))
        PMBadge(props: PMBadgeProps(children: "Urgent", tone: .danger, variant: .outline))
        PMAvatar(props: PMAvatarProps(name: Self.person, size: .sm))
        Text(Self.person)
        Text(Self.opened)
      })
  }

  private static func actions() -> PMContent {
    AnyView(
      Group {
        PMButton(props: PMButtonProps(label: "Snooze", appearance: .outlineNeutral))
        PMButton(props: PMButtonProps(label: "Reply"))
      })
  }

  private static func aside() -> PMContent {
    AnyView(
      Group {
        PMCard(
          props: PMCardProps(
            children: AnyView(
              PMStat(
                props: PMStatProps(
                  delta: PMStatDelta(value: "3m", direction: .down, positive: true),
                  label: "First response", value: "14m")))))
        PMCard(
          props: PMCardProps(
            children: AnyView(PMStat(props: PMStatProps(label: "Replies", value: "6")))))
      })
  }

  private static func card(_ text: String) -> PMContent {
    AnyView(
      PMCard(
        props: PMCardProps(
          children: AnyView(PMText(props: PMTextProps(children: AnyView(Text(text))))))))
  }

  /// The ticket's tabs, the first one's panel a Card.
  private static func tabs() -> PMContent {
    let tabs = [
      PMTabDescriptor(value: "conversation", label: "Conversation"),
      PMTabDescriptor(value: "activity", label: "Activity", count: 4),
    ]
    return AnyView(
      PMTabs(
        props: PMTabsProps(
          children: AnyView(
            Group {
              PMTabs.Content(
                props: PMTabsContentProps(
                  children: card("The conversation."), value: "conversation"))
              PMTabs.Content(
                props: PMTabsContentProps(children: card("The activity."), value: "activity"))
            }),
          tabs: tabs)))
  }

  private static func everything(_ status: PMLoadStatus) -> some View {
    PMDetailPage(
      props: PMDetailPageProps(
        loadStatus: status, onRetry: {}, actions: actions(), aside: aside(), backLabel: inbox,
        meta: meta(), onBack: {}, tabs: tabs(), title: title)
    )
    .pmFixtureScreenTop()
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "everything — back, meta, actions, tabs and an aside",
        expect: ["status": "ready", "contains": "Button,Badge,Tabs,Card,Stat"]
      ) {
        Self.everything(.ready)
      },
      PMStateEntry("no tabs — one body", expect: ["status": "ready", "contains": "Card,Stat"]) {
        PMDetailPage(
          props: PMDetailPageProps(
            loadStatus: .ready, aside: Self.aside(), backLabel: "Back to customers",
            children: Self.card("The account."), meta: Self.meta(), onBack: {},
            title: "Northwind Traders")
        )
        .pmFixtureScreenTop()
      },
      PMStateEntry(
        "no aside — the body takes the width", expect: ["status": "ready", "contains": "Card"]
      ) {
        PMDetailPage(
          props: PMDetailPageProps(
            loadStatus: .ready,
            actions: AnyView(PMButton(props: PMButtonProps(label: "Reply"))),
            backLabel: Self.inbox, children: Self.card("The conversation."), meta: Self.meta(),
            onBack: {}, title: "SSO login loops back to the sign-in page")
        )
        .pmFixtureScreenTop()
      },
      PMStateEntry(
        "minimal — a way back, a name and a body", expect: ["status": "ready", "contains": "Card"]
      ) {
        PMDetailPage(
          props: PMDetailPageProps(
            loadStatus: .ready, backLabel: "Back", children: Self.card("The conversation."),
            onBack: {}, title: "T-2041")
        )
        .pmFixtureScreenTop()
      },
      PMStateEntry("loading", expect: ["status": "loading", "contains": "Skeleton"]) {
        Self.everything(.loading)
      },
      PMStateEntry("empty — as ready", expect: ["status": "empty", "contains": "Card,Stat"]) {
        Self.everything(.empty)
      },
      PMStateEntry("failed", expect: ["status": "failed", "contains": "Alert"]) {
        Self.everything(.failed(message: Self.failure))
      },
      PMStateEntry(
        "on an iPad — the aside beside the main column",
        expect: ["status": "ready", "contains": "Card,Stat"]
      ) {
        Self.everything(.ready).pmFixtureWidth(PMFixtureWindow.twoRegionIPad)
      },
    ]
  }
}
