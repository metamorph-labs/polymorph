// ChatThread (`design/components/chat-thread.md`): every turn of a
// conversation in a scroll region of its own, which follows the newest turn
// while a reply arrives and lets the reader stop and resume following. It is
// the conversation's only scroll region, because a composer pinned under a
// page that scrolls would scroll away; it fills the box the page gives it.
//
// The turns are a column `space-6` apart, at most eight `space-10`s wide and
// centred, inside `space-5` of padding. A turn that joins arrives as
// `chat.message`, which the thread hands its turns through the environment
// (`PMChatThreadContext`): `slide-fade` at the `sm` distance from the bottom
// edge over the control duration, enter only, a fade under Reduce Motion. A
// thread with no turns (`children` is `nil`) draws the app's `empty` slot,
// centred in the box; this member writes no empty text of its own.
//
// Follow is the rule LogView shares (`PMFollow`), two observations, as on the
// web, with no scheduler: where the column's bottom is against the viewport's,
// and how tall the column and the viewport are. While the reader is within the
// column's bottom padding of the end, more content moves the viewport to the
// new end, at once and never animated, because a smooth scroll under arriving
// text makes the reader chase the line. A change of position that comes with
// no change of height is the reader's scroll, and decides whether they are
// still at the end. Where the system reports scroll phases (iOS 18), a scroll
// the reader is making is never fought: content that grows while they drag
// moves nothing. Once the reader has scrolled up, nothing moves until they
// press the jump control:
// Button `outline/neutral/sm` with the `down` glyph, named by
// `messages.jumpToLatest`, centred `space-4` above the bottom edge. It exists
// only while the reader is detached, so it is out of the tree, the
// accessibility tree included, while it would do nothing. The thread starts at
// its end. Dragging it dismisses the keyboard interactively, as a
// conversation on iOS does.
//
// Accessibility: the root is a container named by `label`, the web's `log`,
// and updates frequently while a reply arrives, its `aria-busy`. SwiftUI has
// no live region, so a turn that joins a thread already on screen announces
// its author once itself (ChatMessage), and a turn that grows token by token
// is not read again. The web makes the region a tab stop while it overflows;
// here VoiceOver scrolls it with its own gesture and a hardware keyboard with
// the system's, so it takes no focus of its own.
//
// The rendering harness draws no scroll view's content, so it turns scrolling
// off (`pmPageScrolls`): the column is drawn whole, and in a box it shows what
// a thread at rest at its end shows, the newest turns, clipped at the top. The
// detached state is the reader's own and no prop reaches it, so no fixture
// draws the jump control.

import PolymorphTokens
import SwiftUI

public struct PMChatThread: PMChatThreadRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmPageScrolls) private var scrolls
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  /// The reader has scrolled out of the follow: the web's `data-state="detached"`.
  @State private var detached = false
  @State private var follow = PMFollow("chat-thread")
  @State private var arrivals = PMChatArrivals()
  private let props: PMChatThreadProps

  public init(props: PMChatThreadProps) {
    self.props = props
  }

  public var body: some View {
    let streaming = props.streaming ?? false
    let messages = props.messages ?? PMStrings.chatThreadMessages

    ScrollViewReader { proxy in
      region(proxy)
        .overlay(alignment: .bottom) {
          if detached {
            PMButton(
              props: PMButtonProps(
                icon: .down, label: messages.jumpToLatest, onClick: { jump(proxy) }, size: .sm,
                appearance: .outlineNeutral)
            )
            .padding(.bottom, theme.defaultDensity.space.s4)
          }
        }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .environment(\.pmChatThread, PMChatThreadContext(arrival: arrival, arrivals: arrivals))
    .task { arrivals.open = true }
    // A thread shown again (after a pop, a tab switch) opens with the turns it
    // has, which are not arrivals.
    .onDisappear { arrivals.open = false }
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Text(props.label))
    .accessibilityAddTraits(streaming ? .updatesFrequently : [])
    .pmMember("ChatThread", attributes(streaming))
  }

  /// The turns in their scroll region, the turns at rest where scrolling is
  /// off, or the empty slot.
  @ViewBuilder
  private func region(_ proxy: ScrollViewProxy) -> some View {
    if let children = props.children {
      if scrolls {
        ScrollView(.vertical) {
          VStack(spacing: 0) {
            column(children)
            // The end the thread follows and the jump control returns to.
            Color.clear.frame(height: 0).id(follow.end)
          }
          .onGeometryChange(for: PMFollowExtent.self) { geometry in
            PMFollowExtent(
              height: geometry.size.height,
              bottom: geometry.frame(in: .named(follow.space)).maxY)
          } action: { extent in
            settle(extent, proxy)
          }
        }
        .coordinateSpace(.named(follow.space))
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height in
          follow.viewport = height
          if let extent = follow.extent { settle(extent, proxy) }
        }
        .modifier(PMFollowScrollPhases(follow: follow))
        .modifier(PMFollowStartsAtEnd())
        .scrollDismissesKeyboard(.interactively)
      } else {
        // What the thread shows at rest at its end: the turns from the top
        // of a box that holds them all; in a box too short for them, the
        // newest, the oldest clipped at the top.
        ViewThatFits(in: .vertical) {
          column(children)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
          column(children)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, minHeight: 0, maxHeight: .infinity, alignment: .bottom)
            .clipped()
        }
      }
    } else {
      emptySlot
    }
  }

  /// The column of turns: `space-6` apart, no wider than the reading measure,
  /// centred, inside the thread's own `space-5`.
  private func column(_ children: PMContent) -> some View {
    let space = theme.defaultDensity.space
    return VStack(alignment: .leading, spacing: space.s6) {
      children
    }
    .frame(maxWidth: PMChatMeasure.thread(space))
    .padding(space.s5)
    .frame(maxWidth: .infinity)
  }

  /// The app's empty state, centred in the box; scrolled only when the box is
  /// shorter than it.
  @ViewBuilder
  private var emptySlot: some View {
    let slot = (props.empty ?? AnyView(EmptyView()))
      .padding(theme.defaultDensity.space.s5)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    if scrolls {
      ViewThatFits(in: .vertical) {
        slot
        ScrollView(.vertical) { slot }
      }
    } else {
      slot
    }
  }

  /// `chat.message`, enter only: a turn never leaves, because a turn leaving
  /// would be the thread rewriting history.
  private var arrival: AnyTransition {
    let motion = theme.defaultMotion
    let fade = AnyTransition.opacity
    let insertion =
      reduceMotion ? fade : fade.combined(with: .offset(y: theme.defaultDensity.space.s2))
    return .asymmetric(
      insertion: insertion.animation(
        motion.easing.enter.animation(duration: motion.duration.control)),
      removal: .identity)
  }

  /// One observation of the column: a following thread moves to the new end,
  /// and a scroll says whether the reader is still at the end, within the
  /// column's bottom padding (`PMFollow.observe`).
  private func settle(_ extent: PMFollowExtent, _ proxy: ScrollViewProxy) {
    if follow.observe(extent, slack: theme.defaultDensity.space.s5) { follow.toEnd(proxy) }
    if detached == follow.following { detached = !follow.following }
  }

  /// The jump control: back to the end, following again.
  private func jump(_ proxy: ScrollViewProxy) {
    follow.following = true
    detached = false
    follow.toEnd(proxy)
  }

  /// The web's `data-state="detached"` while the reader is out of the follow,
  /// and `data-streaming` with the log's `aria-busy` while a reply arrives.
  private func attributes(_ streaming: Bool) -> [String: String] {
    var attributes: [String: String] = [:]
    if detached { attributes["state"] = "detached" }
    if streaming {
      attributes["streaming"] = "true"
      attributes["busy"] = "true"
    }
    return attributes
  }
}

/// ChatThread's states, from the spec's States table. The replies' bodies are
/// Markdown, as the web's are. Scrolling is off in every entry, because the
/// harness draws no scroll view's content.
public struct ChatThreadStates: PMStates {
  public let member = "ChatThread"

  public init() {}

  private static let label = "Conversation"
  private static let changes =
    "The release moved retries onto the delivery queue and added an idempotency key to every "
    + "attempt."
  private static let changesFollowUp =
    "Two settings changed their defaults: the retry ceiling is now five attempts, and the "
    + "backoff doubles from thirty seconds."

  /// Four turns in both registers.
  private static func turns() -> some View {
    Group {
      PMChatMessage(
        props: PMChatMessageProps(
          author: "You", children: ChatMessageStates.words(ChatMessageStates.question),
          role: .user, time: "09:40"))
      PMChatMessage(
        props: PMChatMessageProps(
          actions: ChatMessageStates.replyActions(), author: "Pilot",
          children: ChatMessageStates.prose(
            ChatMessageStates.reply, ChatMessageStates.replyFollowUp),
          role: .assistant, time: "09:41"))
      PMChatMessage(
        props: PMChatMessageProps(
          author: "You", children: ChatMessageStates.words("What changed in the last release?"),
          role: .user, time: "09:43"))
      PMChatMessage(
        props: PMChatMessageProps(
          actions: ChatMessageStates.replyActions(), author: "Pilot",
          children: ChatMessageStates.prose(Self.changes, Self.changesFollowUp),
          role: .assistant, time: "09:43"))
    }
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "a conversation — four turns, both registers", expect: ["label": Self.label]
      ) {
        PMChatThread(props: PMChatThreadProps(children: AnyView(Self.turns()), label: Self.label))
      },
      PMStateEntry(
        "streaming — the newest turn still arriving, the log busy",
        expect: ["streaming": "true", "busy": "true"]
      ) {
        PMChatThread(
          props: PMChatThreadProps(
            children: AnyView(
              Group {
                PMChatMessage(
                  props: PMChatMessageProps(
                    author: "You", children: ChatMessageStates.words(ChatMessageStates.question),
                    role: .user, time: "09:40"))
                PMChatMessage(
                  props: PMChatMessageProps(
                    author: "Pilot",
                    children: ChatMessageStates.prose(
                      String(ChatMessageStates.reply.prefix(120)), streaming: true),
                    role: .assistant, status: .streaming))
              }),
            label: Self.label, streaming: true)
        )
      },
      PMStateEntry(
        "in a box — the thread at rest at its end, the oldest turns clipped",
        expect: ["label": Self.label]
      ) {
        ChatThreadBox(
          content: AnyView(
            PMChatThread(
              props: PMChatThreadProps(
                children: AnyView(
                  Group {
                    Self.turns()
                    Self.turns()
                  }),
                label: Self.label))))
      },
      PMStateEntry("empty — the app’s first words, not the thread’s", expect: ["label": Self.label]) {
        PMChatThread(
          props: PMChatThreadProps(
            empty: AnyView(
              PMEmptyState(
                props: PMEmptyStateProps(
                  description:
                    "It can read the workspace, run the tools you allow, and cite what it finds.",
                  icon: .model, title: "Ask Pilot anything"))),
            label: Self.label))
      },
    ]
  }
}

/// A box four `space-10`s tall for the thread to fill: the web fixture's
/// harness, ScrollArea's pattern.
private struct ChatThreadBox: View {
  @Environment(\.pmTheme) private var theme
  let content: AnyView

  var body: some View {
    content.frame(height: theme.defaultDensity.space.s10 * PMFixtureSpan.region)
  }
}
