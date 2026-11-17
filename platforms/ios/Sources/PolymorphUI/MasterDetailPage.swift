// MasterDetailPage (`design/archetypes/master-detail-page.md`): a list of items
// of one kind beside the selected one's detail. It fills the region that holds
// it rather than scrolling down it: the page header at the top, and the list
// and the detail filling the rest, each scrolling on its own. The page column
// is fifteen of the largest space step wide at most
// (`PMRecipe.masterDetailPageMeasure`), with the page insets (one step smaller
// below 40rem) and `space.5` between the header and the panes.
//
// The page measures its own width and takes one of two arrangements, as the
// web's and ConversationPage's do. The platform's split view is not used: the
// page lives in AppShell's content, which is a navigation stack on an iPhone,
// and a `NavigationSplitView` inside a navigation stack does not push its
// detail there.
//
// - **From 48rem** (`PMRecipe.masterDetailOnePaneBelow`): SplitPane's split,
//   the list the start pane and the detail the end pane, the list taking 0.32
//   of the width with floors of 240 points for the list and 420 for the
//   detail, the web's numbers, read from its source into `PMRecipe`. The page
//   has measured its room, so it asks SplitPane for the split whatever the
//   width class. The split's divider is named by `listLabel`. The detail
//   starts `space.5` off the seam; with no `detail` it is the `emptyState`,
//   centred.
// - **Below 48rem** (an iPhone): one pane. While `detail` is absent the list
//   fills it. While `detail` is given the detail fills it under the way back,
//   Button's ghost/neutral/sm with the `back` glyph, named `backLabel`, as
//   DetailPage's, which stays put while the detail scrolls under it and calls
//   `onBack`, in which the app clears its selection. The list stays in the
//   view tree, hidden and out of the accessibility tree, while the detail is
//   drawn alone, so its scroll position and what it keeps itself survive the
//   way back. When the detail replaces the list, VoiceOver moves to the way
//   back, as it moves into a pushed screen.
//
// The list pane is a container named by `listLabel`, the web's region. The
// load status (`design/native/screen-contract.md`): the header renders in
// every state. `loading` draws Skeleton rows in the list pane; `failed` a
// danger Alert in place of the list, with `onRetry` when it is set; `empty` is
// `ready`, because the list draws its own empty state. The root carries
// `layout=split|single`, and `pane=list|detail` in the single arrangement.

import PolymorphTokens
import SwiftUI

public struct PMMasterDetailPage: PMMasterDetailPageRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmPageScrolls) private var scrolls
  @AccessibilityFocusState private var backSpoken: Bool
  private let props: PMMasterDetailPageProps

  public init(props: PMMasterDetailPageProps) {
    self.props = props
  }

  public var body: some View {
    let space = theme.defaultDensity.space
    let maxWidth = space.s10 * PMRecipe.masterDetailPageMeasure

    GeometryReader { proxy in
      let width = min(proxy.size.width, maxWidth)
      let single = width < PMRecipe.masterDetailOnePaneBelow
      let stepped = PMPageColumn.isNarrow(width)
      VStack(alignment: .leading, spacing: space.s5) {
        PMPageHeader(
          props: PMPageHeaderProps(
            actions: props.actions, description: props.description, title: props.title))
        Group {
          if single {
            pane
          } else {
            split
          }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      }
      .padding(.horizontal, stepped ? space.s6 : space.s7)
      .padding(.vertical, stepped ? space.s5 : space.s6)
      .frame(width: width, height: proxy.size.height, alignment: .top)
      .frame(width: proxy.size.width, height: proxy.size.height, alignment: .top)
      .accessibilityElement(children: .contain)
      .pmMember("MasterDetailPage", Self.attributes(props, single: single))
      .onChange(of: single && props.detail != nil) { _, alone in
        if alone { backSpoken = true }
      }
    }
    .background(theme.colors.bgApp.color)
  }

  private static func attributes(
    _ props: PMMasterDetailPageProps, single: Bool
  ) -> [String: String] {
    var found = ["status": props.loadStatus.kind, "layout": single ? "single" : "split"]
    if single { found["pane"] = props.detail == nil ? "list" : "detail" }
    return found
  }

  /// The split: the list in SplitPane's start pane, the detail or the empty
  /// state in its end pane, `space.5` off the seam.
  private var split: some View {
    PMSplitPane(
      props: PMSplitPaneProps(
        defaultRatio: Double(PMRecipe.masterDetailListShare),
        end: AnyView(
          detailPane
            .padding(.leading, theme.defaultDensity.space.s5)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)),
        endMin: Double(PMRecipe.masterDetailDetailMin), label: props.listLabel,
        start: AnyView(listPane), startMin: Double(PMRecipe.masterDetailListMin))
    )
    .environment(\.pmSplitPaneLayout, .split)
  }

  /// The one pane: the list, or the detail under the way back with the list
  /// kept in the tree, hidden.
  private var pane: some View {
    let alone = props.detail != nil
    return ZStack(alignment: .topLeading) {
      listPane
        .opacity(alone ? 0 : 1)
        .accessibilityHidden(alone)
        .allowsHitTesting(!alone)
      if let detail = props.detail {
        VStack(alignment: .leading, spacing: 0) {
          PMButton(
            props: PMButtonProps(
              icon: .back, label: props.backLabel, onClick: props.onBack, size: .sm,
              appearance: .ghostNeutral)
          )
          .modifier(PMMasterDetailSpoken(spoken: $backSpoken))
          .padding(.bottom, theme.defaultDensity.space.s3)
          scrolling(detail)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(theme.colors.bgApp.color)
      }
    }
  }

  /// The list pane: the list, or the load state's stand-in in its place,
  /// scrolling on its own and named by `listLabel`.
  private var listPane: some View {
    scrolling(listContent)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      .accessibilityElement(children: .contain)
      .accessibilityLabel(Text(props.listLabel))
  }

  /// What the list pane holds in the load state.
  private var listContent: PMContent {
    switch props.loadStatus {
    case .ready, .empty:
      props.list
    case .loading:
      AnyView(PMPageSkeletonRows().padding(.vertical, theme.defaultDensity.space.s4))
    case .failed(let message):
      AnyView(PMPageFailure(message: message, onRetry: props.onRetry))
    }
  }

  /// The detail beside the list, scrolling on its own, or the empty state,
  /// centred, while nothing is picked.
  @ViewBuilder
  private var detailPane: some View {
    if let detail = props.detail {
      scrolling(detail)
    } else {
      PMEmptyState(props: props.emptyState)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }

  /// `content` in a vertical scroll view, or at rest where the harness draws
  /// no scroll view: from its top, cut at the pane's end, as the scroll view
  /// shows it before it scrolls.
  @ViewBuilder
  private func scrolling(_ content: PMContent) -> some View {
    let column = VStack(alignment: .leading, spacing: 0) { content }
      .frame(maxWidth: .infinity, alignment: .topLeading)
    if scrolls {
      ScrollView { column }
    } else {
      column
        .frame(minHeight: 0, maxHeight: .infinity, alignment: .top)
        .clipped()
    }
  }
}

/// Where VoiceOver goes when the detail replaces the list: the way back. The
/// binding is held only while VoiceOver runs, because `ImageRenderer` draws
/// nothing of a view that carries one.
private struct PMMasterDetailSpoken: ViewModifier {
  @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver
  let spoken: AccessibilityFocusState<Bool>.Binding

  func body(content: Content) -> some View {
    if voiceOver {
      content.accessibilityFocused(spoken)
    } else {
      content
    }
  }
}

/// MasterDetailPage's states: the spec's five entries, the split at a
/// landscape iPad's width and the one pane at a phone's, and the load states
/// the screen contract names, in a support inbox of six tickets. The page
/// fills its region, so every entry is drawn in the spec's harness, a box six
/// of the largest space step high (`PMFixtureSpan.page`).
public struct MasterDetailPageStates: PMStates {
  public let member = "MasterDetailPage"

  public init() {}

  private struct Ticket {
    let subject: String
    let from: String
    let time: String
    let status: String
    let tone: PMBadgeTone
  }

  private static let tickets = [
    Ticket(
      subject: "Login loop after password reset", from: "Ada Okafor", time: "2m", status: "Open",
      tone: .accent),
    Ticket(
      subject: "Invoice shows the wrong currency", from: "Bao Tran", time: "1h",
      status: "Waiting", tone: .warning),
    Ticket(
      subject: "Export finishes but the file is empty", from: "Carmen Ruiz", time: "3h",
      status: "Open", tone: .accent),
    Ticket(
      subject: "Cannot invite a teammate", from: "Dev Patel", time: "1d", status: "Closed",
      tone: .neutral),
    Ticket(
      subject: "Webhook retries stop after one failure", from: "Ewa Nowak", time: "2d",
      status: "Open", tone: .accent),
    Ticket(
      subject: "Two-factor codes arrive late", from: "Femi Adeyemi", time: "4d",
      status: "Waiting", tone: .warning),
  ]

  private static let failure = "The tickets could not be loaded. Check your connection."
  private static let opened = "Bao Tran · opened an hour ago"
  private static let body =
    "The March invoice for the Lisbon workspace is in US dollars. The workspace bills in euros, "
    + "and the previous invoices were right."

  /// The six tickets, `times` over, the one at `current` marked current.
  private static func list(current: Int?, times: Int = 1) -> PMContent {
    let rows = Array(repeating: tickets, count: times).flatMap { $0 }
    return AnyView(
      PMList(
        props: PMListProps(
          children: AnyView(
            ForEach(Array(rows.enumerated()), id: \.offset) { index, ticket in
              PMList.Item(
                props: PMListItemProps(
                  current: index == current, description: ticket.from, meta: ticket.time,
                  onSelect: {}, title: ticket.subject,
                  trailing: AnyView(
                    PMBadge(props: PMBadgeProps(children: ticket.status, tone: ticket.tone)))))
            }),
          label: "Tickets")))
  }

  /// The second ticket's detail: a heading, its meta, its body and its actions.
  private static func detail() -> PMContent {
    AnyView(
      PMStack(
        props: PMStackProps(
          children: AnyView(
            Group {
              PMHeading(props: PMHeadingProps(children: "Invoice shows the wrong currency"))
              PMInline(
                props: PMInlineProps(
                  align: .center,
                  children: AnyView(
                    Group {
                      PMBadge(props: PMBadgeProps(children: "Waiting", tone: .warning))
                      PMText(
                        props: PMTextProps(
                          children: AnyView(Text(Self.opened)), size: .sm, tone: .secondary))
                    }),
                  gap: .s2))
              PMText(props: PMTextProps(children: AnyView(Text(Self.body))))
              PMInline(
                props: PMInlineProps(
                  children: AnyView(
                    Group {
                      PMButton(
                        props: PMButtonProps(icon: .mail, label: "Reply", appearance: .softAccent))
                      PMButton(
                        props: PMButtonProps(label: "Close ticket", appearance: .ghostNeutral))
                    }),
                  gap: .s3))
            }),
          gap: .s4)))
  }

  private static func page(
    _ status: PMLoadStatus = .ready, list: PMContent = list(current: nil),
    detail: PMContent? = nil, actions: Bool = false
  ) -> some View {
    PMMasterDetailHarness {
      PMMasterDetailPage(
        props: PMMasterDetailPageProps(
          loadStatus: status, onRetry: {},
          actions: actions
            ? AnyView(PMButton(props: PMButtonProps(icon: .add, label: "New ticket"))) : nil,
          backLabel: "All tickets",
          description: "Every ticket customers have opened, newest first.", detail: detail,
          emptyState: PMEmptyStateProps(
            description: "Pick a ticket in the list to read it here.", icon: .inbox,
            title: "No ticket selected"),
          list: list, listLabel: "Tickets", onBack: {}, title: "Support"))
    }
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "an item selected — the list beside its detail",
        expect: ["status": "ready", "layout": "split", "contains": "SplitPane,List,Heading"]
      ) {
        Self.page(list: Self.list(current: 1), detail: Self.detail(), actions: true)
          .pmFixtureWidth(PMFixtureWindow.landscapeIPad)
      },
      PMStateEntry(
        "nothing selected — the list beside the empty state",
        expect: ["status": "ready", "layout": "split", "contains": "SplitPane,List,EmptyState"]
      ) {
        Self.page().pmFixtureWidth(PMFixtureWindow.landscapeIPad)
      },
      PMStateEntry(
        "a long list — the list pane scrolls and the detail stays",
        expect: ["status": "ready", "layout": "split", "contains": "List,Heading"]
      ) {
        Self.page(list: Self.list(current: 1, times: 5), detail: Self.detail())
          .pmFixtureWidth(PMFixtureWindow.landscapeIPad)
      },
      PMStateEntry(
        "narrow, an item selected — the detail alone under the way back",
        expect: [
          "layout": "single", "pane": "detail",
          "contains": "Button[variant=ghost tone=neutral size=sm],Heading",
        ]
      ) {
        Self.page(list: Self.list(current: 1), detail: Self.detail())
      },
      PMStateEntry(
        "narrow, nothing selected — the list alone",
        expect: ["layout": "single", "pane": "list", "contains": "List"]
      ) {
        Self.page()
      },
      PMStateEntry(
        "loading — Skeleton rows in the list pane",
        expect: ["status": "loading", "contains": "Skeleton"]
      ) {
        Self.page(.loading)
      },
      PMStateEntry(
        "empty — as ready, the list draws its own", expect: ["status": "empty", "contains": "List"]
      ) {
        Self.page(.empty)
      },
      PMStateEntry(
        "failed — the Alert in place of the list",
        expect: ["status": "failed", "contains": "Alert"]
      ) {
        Self.page(.failed(message: Self.failure))
      },
    ]
  }
}

/// The spec's harness: a box six of the largest space step high, in place of
/// the region the page fills.
private struct PMMasterDetailHarness<Content: View>: View {
  @Environment(\.pmTheme) private var theme
  @ViewBuilder let content: () -> Content

  var body: some View {
    content()
      .frame(height: theme.defaultDensity.space.s10 * PMFixtureSpan.page)
  }
}
