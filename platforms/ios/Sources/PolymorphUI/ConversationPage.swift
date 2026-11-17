// ConversationPage (`design/archetypes/conversation-page.md`): the conversation
// screen. It fills the region that holds it rather than scrolling down it: the
// page header at the top, the composer at the foot, and the thread taking the
// room between them, so the thread scrolls in its own box and the composer
// stays put. The page column is fifteen of the largest space step wide at most,
// with the page insets (one step smaller below 40rem) and `space.5` between
// the header and the body.
//
// The conversation is the thread over the composer, `space.4` apart; the
// composer is ChatThread's column measure, eight of the largest space step,
// centred under the turns. After a failure the Alert sits between them,
// `space.4` from each. Where the header and the composer leave the thread
// less than the largest space step, as at the largest text sizes, the page
// scrolls as a whole and the thread is as high as the room above the
// composer. In one column the composer is pinned under the page's scroll
// view, so it stays put while the header scrolls away. The page keeps one
// structure in both forms, and only the thread's height and whether the page
// scrolls change between them, so the composer keeps its focus and its draft
// and the thread its scroll position. The form is decided by the page's
// height with the keyboard down: opening the keyboard shrinks the room, and
// the page scrolls if what it holds no longer fits, but it does not change
// form. The aside takes one of two forms by the page's own width, as the
// web's does:
//
// - **From 48rem**: SplitPane's split, the conversation the start pane and
//   the aside the end pane, `space.2` off the seam, at 58 to 42, with floors
//   of 320 points for the thread and 280 for the aside, the numbers the web's
//   source writes (`PMRecipe.conversation…`). The page has measured its room,
//   so it asks SplitPane for the split whatever the width class. The composer
//   is the start pane's foot, as wide as the pane. When the page scrolls as a
//   whole, the split is as high as the page's room, so scrolled to its end the
//   composer is at the foot of the screen.
// - **Below 48rem** (a phone): the thread keeps the whole width, and the
//   header's actions gain an outline/neutral/sm Button with the `artifact`
//   glyph, named `asideLabel`, that opens the aside in Drawer, the web's
//   container for it: from the end at `lg`, titled `asideLabel`, which on
//   iPhone is Drawer's sheet and on iPad its side panel. Widening the page
//   closes it. Crossing the breakpoint moves the composer between the page's
//   foot and the split's pane, so a draft the app does not hold in `value` is
//   lost there, as it is on the web.
//
// The load status (`design/native/screen-contract.md`): the header renders in
// every state. `loading` draws Skeleton turns in the thread's place and
// disables the composer; `failed` puts a danger Alert above the composer, with
// `onRetry` when it is set, and the thread stays; `empty` is `ready`, because
// a thread with no turns draws its own empty state.
//
// `asideLabel` names the split's separator, the toggle and the drawer. The web
// requires it with `aside`; the contract cannot pair two optional props, so a
// page given an aside without one names it by its title.

import PolymorphTokens
import SwiftUI

public struct PMConversationPage: PMConversationPageRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmPageScrolls) private var scrolls
  @State private var asideOpen = false
  /// The page's height with the keyboard down, and the header's, the failed
  /// state's Alert's and the composer's, as laid out: what decides whether
  /// the thread has room.
  @State private var pageHeight: CGFloat = 0
  @State private var headerHeight: CGFloat = 0
  @State private var alertHeight: CGFloat = 0
  @State private var composerHeight: CGFloat = 0
  private let props: PMConversationPageProps

  public init(props: PMConversationPageProps) {
    self.props = props
  }

  public var body: some View {
    let space = theme.defaultDensity.space
    let maxWidth = space.s10 * PMRecipe.conversationPageMeasure

    GeometryReader { proxy in
      let width = min(proxy.size.width, maxWidth)
      let narrow = width < PMRecipe.conversationOneColumnBelow
      page(width: width, narrow: narrow)
        .frame(maxWidth: maxWidth, maxHeight: .infinity)
        .frame(width: proxy.size.width, height: proxy.size.height, alignment: .top)
        .onChange(of: narrow) { _, now in
          if !now { asideOpen = false }
        }
    }
    // The page's height with the keyboard down: the region it is given, grown
    // past the keyboard where the keyboard has shrunk it.
    .background {
      Color.clear
        .ignoresSafeArea(.keyboard)
        .onGeometryChange(for: CGFloat.self) {
          $0.size.height
        } action: {
          pageHeight = $0
        }
    }
    .background(theme.colors.bgApp.color)
  }

  private var asideLabel: String { props.asideLabel ?? props.title }

  private func page(width: CGFloat, narrow: Bool) -> some View {
    let space = theme.defaultDensity.space
    let stepped = PMPageColumn.isNarrow(width)
    let status = props.loadStatus
    let split = props.aside != nil && !narrow
    var attributes = ["status": status.kind]
    if props.aside != nil { attributes["aside"] = narrow ? "drawer" : "split" }
    let inset = stepped ? space.s5 : space.s6
    // Everything the page holds besides the thread, top to bottom: the
    // insets, the header and its gap, the Alert and its gap, and the
    // composer and its gap. The page is cramped when that leaves the thread
    // less than the largest space step of its height with the keyboard down.
    let alert = alertHeight > 0 ? alertHeight + space.s4 : 0
    let besides = inset + headerHeight + space.s5 + alert + space.s4 + composerHeight + inset
    let cramped = headerHeight > 0 && pageHeight > 0 && pageHeight - besides < space.s10
    // The least the scrolling column takes: what it holds besides the thread.
    // In one column, the composer and its gap are the page's foot instead.
    let least = split ? besides : besides - space.s4 - composerHeight - inset

    return VStack(spacing: 0) {
      GeometryReader { region in
        let room = region.size.height
        let column = self.column(
          split: split, narrow: narrow, cramped: cramped, room: room, inset: inset
        )
        .padding(.horizontal, stepped ? space.s6 : space.s7)
        .frame(height: cramped ? nil : max(room, least), alignment: .top)
        if scrolls {
          // Scrolls while cramped, and while the keyboard leaves the column
          // less room than it takes.
          ScrollView { column }
            .scrollDisabled(!cramped && room >= least)
        } else {
          column
        }
      }
      if !split {
        composer
          .padding(.horizontal, stepped ? space.s6 : space.s7)
          .padding(.top, space.s4)
          .padding(.bottom, inset)
      }
    }
    .background {
      if let aside = props.aside {
        PMDrawer(props: Self.drawer(aside: aside, title: asideLabel, open: $asideOpen))
      }
    }
    .accessibilityElement(children: .contain)
    .pmMember("ConversationPage", attributes)
  }

  /// The header over the body, inside the page's insets above (and below,
  /// beside an aside). The body is the thread and the Alert in one column,
  /// and SplitPane with the whole conversation in its start pane beside an
  /// aside. Cramped, the thread is `room` high, or the split is `room` less
  /// the insets; otherwise the body takes what the header leaves.
  private func column(
    split: Bool, narrow: Bool, cramped: Bool, room: CGFloat, inset: CGFloat
  ) -> some View {
    let space = theme.defaultDensity.space
    return VStack(alignment: .leading, spacing: space.s5) {
      PMPageHeader(
        props: PMPageHeaderProps(
          actions: actions(narrow: narrow), description: props.description, title: props.title))
      .onGeometryChange(for: CGFloat.self) {
        $0.size.height
      } action: {
        headerHeight = $0
      }
      Group {
        if let aside = props.aside, split {
          PMSplitPane(
            props: PMSplitPaneProps(
              defaultRatio: Double(PMRecipe.conversationThreadShare),
              end: AnyView(
                aside
                  .padding(.leading, space.s2)
                  .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)),
              endMin: Double(PMRecipe.conversationAsideMin), label: asideLabel,
              start: AnyView(
                VStack(spacing: space.s4) {
                  thread(height: nil)
                  failure
                  composer
                }),
              startMin: Double(PMRecipe.conversationThreadMin))
          )
          .environment(\.pmSplitPaneLayout, .split)
          .frame(height: cramped ? max(0, room - inset - inset) : nil)
        } else {
          VStack(spacing: space.s4) {
            thread(height: cramped ? room : nil)
            failure
          }
        }
      }
      .frame(maxWidth: .infinity, maxHeight: cramped ? nil : .infinity)
    }
    .padding(.top, inset)
    .padding(.bottom, split ? inset : 0)
  }

  /// The header's actions, joined below the breakpoint by the aside's toggle:
  /// outline, never the page's solid, which is the app's own action.
  private func actions(narrow: Bool) -> PMContent? {
    guard props.aside != nil, narrow else { return props.actions }
    let toggle = PMButton(
      props: PMButtonProps(
        icon: .artifact, label: asideLabel, onClick: { asideOpen = true }, size: .sm,
        appearance: .outlineNeutral))
    return AnyView(
      Group {
        if let actions = props.actions {
          actions
        }
        toggle
      })
  }

  /// The thread, `height` points high or taking the room it is given; while
  /// the page loads, Skeleton turns stand in its place.
  private func thread(height: CGFloat?) -> some View {
    Group {
      if props.loadStatus == .loading {
        PMConversationSkeletonTurns()
      } else {
        props.thread
      }
    }
    .frame(maxWidth: .infinity, minHeight: 0, maxHeight: .infinity, alignment: .top)
    .frame(height: height)
  }

  /// The failed state's Alert, at the composer's measure.
  @ViewBuilder
  private var failure: some View {
    if case .failed(let message) = props.loadStatus {
      PMPageFailure(message: message, onRetry: props.onRetry)
        .frame(maxWidth: theme.defaultDensity.space.s10 * PMRecipe.conversationComposerMeasure)
        .onGeometryChange(for: CGFloat.self) {
          $0.size.height
        } action: {
          alertHeight = $0
        }
        .onDisappear { alertHeight = 0 }
    }
  }

  /// The composer at its measure, disabled while the page loads.
  private var composer: some View {
    props.composer
      .frame(maxWidth: theme.defaultDensity.space.s10 * PMRecipe.conversationComposerMeasure)
      .disabled(props.loadStatus == .loading)
      .onGeometryChange(for: CGFloat.self) {
        $0.size.height
      } action: {
        composerHeight = $0
      }
  }

  /// The aside's Drawer: from the end at `lg`, titled by the aside's label,
  /// open while `open` is.
  static func drawer(aside: PMContent, title: String, open: Binding<Bool>) -> PMDrawerProps {
    PMDrawerProps(
      children: aside, onOpenChange: { open.wrappedValue = $0 }, open: open.wrappedValue,
      side: .end, size: .lg, title: title)
  }
}

/// The thread while the page loads: three turns of Skeleton lines in the
/// thread's column, a person's short line at the end, the assistant's
/// paragraph, and another short line. The first is named "Loading" for
/// assistive technology; the rest are hidden.
private struct PMConversationSkeletonTurns: View {
  @Environment(\.pmTheme) private var theme

  var body: some View {
    let space = theme.defaultDensity.space
    VStack(alignment: .leading, spacing: space.s6) {
      PMSkeleton(props: PMSkeletonProps(label: PMStrings.loading, width: .width10))
        .frame(maxWidth: .infinity, alignment: .trailing)
      VStack(alignment: .leading, spacing: space.s2) {
        PMSkeleton(props: PMSkeletonProps())
        PMSkeleton(props: PMSkeletonProps())
        PMSkeleton(props: PMSkeletonProps(width: .width10))
      }
      PMSkeleton(props: PMSkeletonProps(width: .width9))
        .frame(maxWidth: .infinity, alignment: .trailing)
    }
    .frame(maxWidth: space.s10 * PMRecipe.conversationComposerMeasure)
    .frame(maxWidth: .infinity, alignment: .top)
  }
}

/// ConversationPage's states: the spec's three entries, the four load states
/// the screen contract names, and the aside in both its forms: a ChatThread of
/// ChatMessages, a PromptInput, and an ArtifactPane in the aside. The page
/// fills its region, so every entry is drawn in the spec's harness, a box six
/// of the largest space step high. The Drawer the phone opens the aside in is
/// not drawn by `ImageRenderer`; one entry draws its panel in place.
public struct ConversationPageStates: PMStates {
  public let member = "ConversationPage"

  public init() {}

  private static let title = "Webhook retries"
  private static let description = "Pilot can read the workspace and cite what it finds."
  private static let artifact = "Artifact"
  private static let question = "Why do retries stop after the first 5xx?"
  private static let answer =
    "The worker treats any 5xx as final when the event has no idempotency key, so it never "
    + "schedules a second attempt."
  private static let followUp = "Show me the fix."
  private static let failure = "The conversation could not be loaded. Check your connection."
  private static let code = "retry(() => post(event), { attempts: 5, idempotencyKey: event.id })"

  private static func text(_ string: String, size: PMTextSize? = nil) -> some View {
    PMText(props: PMTextProps(children: AnyView(Text(string)), size: size))
  }

  /// A turn of the thread: the reader's question, or Pilot's reply.
  private static func turn(_ role: PMChatMessageRole, _ words: String) -> some View {
    PMChatMessage(
      props: PMChatMessageProps(
        author: role == .user ? "You" : "Pilot", children: AnyView(text(words)), role: role))
  }

  private static func thread() -> PMContent {
    AnyView(
      PMChatThread(
        props: PMChatThreadProps(
          children: AnyView(
            Group {
              turn(.user, question)
              turn(.assistant, answer)
              turn(.user, followUp)
            }),
          label: "Conversation")))
  }

  private static func empty() -> PMContent {
    AnyView(
      PMChatThread(
        props: PMChatThreadProps(
          empty: AnyView(
            PMEmptyState(
              props: PMEmptyStateProps(
                description:
                  "It can read the workspace, run the tools you allow, and cite what it finds.",
                icon: .model, title: "Ask Pilot anything"))),
          label: "Conversation")))
  }

  private static func aside() -> PMContent {
    AnyView(
      PMArtifactPane(
        props: PMArtifactPaneProps(
          children: AnyView(PMCodeBlock(props: PMCodeBlockProps(children: code))),
          kind: .code, meta: "TypeScript · 1 line", title: "deliver.ts")))
  }

  /// The page in `status`; without `actions` the header's only Button is the
  /// aside's toggle, so an entry's `contains` proves the toggle is drawn.
  private static func page(
    _ status: PMLoadStatus = .ready, thread: PMContent = thread(), aside: Bool = false,
    actions: Bool = true, title: String = title
  ) -> PMConversationPage {
    PMConversationPage(
      props: PMConversationPageProps(
        loadStatus: status, onRetry: {},
        actions: actions
          ? AnyView(
            PMButton(
              props: PMButtonProps(
                icon: .add, label: "New chat", size: .sm, appearance: .outlineNeutral)))
          : nil,
        aside: aside ? Self.aside() : nil, asideLabel: aside ? artifact : nil,
        composer: AnyView(
          PMPromptInput(
            props: PMPromptInputProps(
              label: "Message", onSubmit: { _ in }, placeholder: "Ask Pilot anything…"))),
        description: aside ? nil : description, thread: thread, title: title))
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "a conversation — the thread over the composer",
        expect: ["status": "ready", "contains": "PageHeader,ChatThread,ChatMessage,PromptInput"]
      ) {
        PMConversationHarness { Self.page() }
      },
      PMStateEntry(
        "with an aside on an iPad — the artifact beside the thread",
        expect: [
          "status": "ready", "aside": "split", "contains": "SplitPane,ChatThread,ArtifactPane,PromptInput",
        ]
      ) {
        PMConversationHarness { Self.page(aside: true) }
          .pmFixtureWidth(PMFixtureWindow.landscapeIPad)
      },
      PMStateEntry(
        "with an aside on a phone — its toggle in the header",
        expect: ["status": "ready", "aside": "drawer", "contains": "Button,ChatThread,PromptInput"]
      ) {
        PMConversationHarness { Self.page(aside: true, actions: false) }
      },
      PMStateEntry(
        "the aside on a phone — its Drawer's panel, drawn in place",
        expect: ["part": "aside", "contains": "Button,ArtifactPane,CodeBlock"]
      ) {
        PMConversationAsideFramed(title: Self.artifact, aside: Self.aside())
      },
      PMStateEntry(
        "empty — the app’s first words in the thread’s room",
        expect: ["status": "empty", "contains": "ChatThread,PromptInput"]
      ) {
        PMConversationHarness { Self.page(.empty, thread: Self.empty(), title: "New chat") }
      },
      PMStateEntry(
        "loading — Skeleton turns, the composer disabled",
        expect: ["status": "loading", "contains": "Skeleton,PromptInput[disabled=true]"]
      ) {
        PMConversationHarness { Self.page(.loading) }
      },
      PMStateEntry(
        "failed — the Alert above the composer, the thread kept",
        expect: ["status": "failed", "contains": "Alert,ChatThread,PromptInput"]
      ) {
        PMConversationHarness { Self.page(.failed(message: Self.failure)) }
      },
    ]
  }
}

/// The spec's harness: a box six of the largest space step high, in place of
/// the region the page fills, with the thread's scroll view turned off, because
/// `ImageRenderer` draws none of its content.
private struct PMConversationHarness<Content: View>: View {
  @Environment(\.pmTheme) private var theme
  @ViewBuilder let content: () -> Content

  var body: some View {
    content()
      .frame(height: theme.defaultDensity.space.s10 * Self.height)
  }

  /// The box's height, in multiples of `space.10`.
  private static var height: CGFloat { 6 }
}

/// The aside's Drawer panel drawn in place, on its own surface, because the
/// harness draws no presentation. It carries the page's identity with
/// `part=aside`, because the presented panel is hosted apart from the page.
private struct PMConversationAsideFramed: View {
  let title: String
  let aside: PMContent

  var body: some View {
    PMDrawerPanel(
      props: PMConversationPage.drawer(aside: aside, title: title, open: .constant(true)),
      framed: true, close: {}
    )
    .accessibilityElement(children: .contain)
    .pmMember("ConversationPage", ["part": "aside"])
  }
}
