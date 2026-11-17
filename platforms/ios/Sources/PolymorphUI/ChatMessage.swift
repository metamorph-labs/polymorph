// ChatMessage (`design/components/chat-message.md`): one turn of a
// conversation: who said it, when, what they said, and what happened to it.
//
// `role` picks the frame and nothing else does. The model's turn is
// full-width prose with its mark at the leading edge: the content of the page,
// not a speech balloon. The reader's turn is the same column mirrored to the
// trailing edge, its content in a bubble on `bg.subtle` inside a
// `border.subtle` hairline, padded `space-3` by `space-4`, at most six
// `space-10`s wide (a short prompt stays small), its corners `radius.surface`
// but the one nearest the mark at `radius.control`: that one asymmetry shows
// which side spoke. A system notice is a centred line of `text.xs` in
// `text.muted`, with no mark and no meta: the thread reporting on itself.
//
// The mark is the model's (the `model` glyph, `sm`, in `accent.text` on
// `accent.subtle` inside an `accent.bg` hairline, a circle `space-7` across,
// the size of an `md` Avatar so both speakers' marks share one axis) for an
// assistant without a picture, and an `md` Avatar of the author otherwise. The
// meta row is the author (`text.sm` at the `text.xl` weight, `text.primary`)
// and the time beside it on its baseline (`text.xs`, `text.muted`), `space-2`
// apart. The body is a column `space-2` apart: the meta, the content (the
// app's children, `space-3` apart, at `text.md` in `text.primary` unless a
// child sets its own step), the notice of a stopped or failed turn (the app's
// `statusMessage` in `text.xs` after `warning` in `warning.text`, or `error`
// in `danger.text`), and the actions row.
//
// The actions row (`ghost/neutral/sm` icon-only Buttons, `space-1` apart,
// wrapping) always shows: touch has no hover, so the platform map draws it as
// the spec does on any screen without hover (`design/platforms/ios.json`). It
// is never the only way to do anything, and its Buttons are always reachable.
//
// Accessibility: the turn is a container named by the author, as the web's
// `article` is, so a reader moving by container hears who is speaking. The
// model's mark is hidden; the Avatar is decorative beside the visible author,
// by Avatar's own rule. While the turn streams it updates frequently, the
// web's `aria-busy`. Inside a ChatThread, the thread runs the turn's arrival
// (`chat.message`), and a turn that joins a thread already on screen
// announces its author once, as the web's log announces an addition; the
// content it then grows is not announced token by token.

import PolymorphTokens
import SwiftUI

public struct PMChatMessage: PMChatMessageRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmChatThread) private var thread
  private let props: PMChatMessageProps

  public init(props: PMChatMessageProps) {
    self.props = props
  }

  public var body: some View {
    let status = props.status ?? .complete

    Group {
      switch props.role {
      case .system: notice
      case .user: turn(reader: true, status: status)
      case .assistant: turn(reader: false, status: status)
      }
    }
    .frame(maxWidth: .infinity, alignment: props.role == .system ? .center : .leading)
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Text(props.author))
    .accessibilityAddTraits(status == .streaming ? .updatesFrequently : [])
    .transition(thread?.arrival ?? .identity)
    .onAppear(perform: announceArrival)
    .pmMember("ChatMessage", attributes(status))
  }

  /// A speaker's turn: the mark at the leading edge for the model, at the
  /// trailing edge for the reader, beside the body.
  private func turn(reader: Bool, status: PMChatMessageStatus) -> some View {
    let space = theme.defaultDensity.space
    let edge: HorizontalAlignment = reader ? .trailing : .leading
    return HStack(alignment: .top, spacing: space.s3) {
      if !reader { mark }
      VStack(alignment: edge, spacing: space.s2) {
        meta(reader: reader)
        content(reader: reader)
        if status == .stopped || status == .error, let message = props.statusMessage {
          PMGlyphLine(
            glyph: status == .error ? .error : .warning,
            glyphColor: status == .error ? theme.colors.dangerText : theme.colors.warningText,
            text: message, step: theme.text.xs)
        }
        if let actions = props.actions {
          PMInlineLayout(
            gap: space.s1, align: .center, justify: reader ? .end : .start, wrap: true
          ) {
            actions
          }
        }
      }
      .frame(maxWidth: .infinity, alignment: reader ? .trailing : .leading)
      if reader { mark }
    }
  }

  /// The model's mark when the model has no picture; the author's Avatar
  /// otherwise, which shows the reader's initials until a picture loads.
  @ViewBuilder
  private var mark: some View {
    if props.role == .assistant, props.avatar == nil {
      let colors = theme.colors
      let side = theme.defaultDensity.space.s7
      PMIconView(.model, size: .sm)
        .foregroundStyle(colors.accentText.color)
        .frame(width: side, height: side)
        .background(colors.accentSubtle.color, in: Circle())
        .overlay { Circle().strokeBorder(colors.accentBg.color, lineWidth: 1) }
        .accessibilityHidden(true)
    } else {
      PMAvatar(props: PMAvatarProps(name: props.author, size: .md, src: props.avatar))
    }
  }

  /// The author and the time on one baseline; the time comes first in the
  /// reader's mirrored row, so the author sits by the mark.
  private func meta(reader: Bool) -> some View {
    let colors = theme.colors
    let author = Text(props.author)
      .pmTextStyle(theme.text.sm.weighted(like: theme.text.xl))
      .foregroundStyle(colors.textPrimary.color)
    let time = props.time.map {
      Text($0)
        .pmTextStyle(theme.text.xs)
        .foregroundStyle(colors.textMuted.color)
    }
    return HStack(alignment: .firstTextBaseline, spacing: theme.defaultDensity.space.s2) {
      if reader {
        time
        author
      } else {
        author
        time
      }
    }
  }

  /// The turn's children in reading order; the reader's in the bubble.
  @ViewBuilder
  private func content(reader: Bool) -> some View {
    let space = theme.defaultDensity.space
    let column = VStack(alignment: .leading, spacing: space.s3) {
      props.children
    }
    .pmTextStyle(theme.text.md)
    .foregroundStyle(theme.colors.textPrimary.color)
    .fixedSize(horizontal: false, vertical: true)

    if reader {
      let radius = theme.radius
      let bubble = UnevenRoundedRectangle(
        topLeadingRadius: radius.surface, bottomLeadingRadius: radius.surface,
        bottomTrailingRadius: radius.control, topTrailingRadius: radius.surface)
      column
        .padding(.vertical, space.s3)
        .padding(.horizontal, space.s4)
        .background(theme.colors.bgSubtle.color, in: bubble)
        .overlay { bubble.strokeBorder(theme.colors.borderSubtle.color, lineWidth: 1) }
        .frame(maxWidth: PMChatMeasure.bubble(space), alignment: .trailing)
    } else {
      column
        .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  /// The system notice: the children as one centred line in the muted step.
  private var notice: some View {
    VStack(alignment: .center, spacing: theme.defaultDensity.space.s3) {
      props.children
    }
    .pmTextStyle(theme.text.xs)
    .foregroundStyle(theme.colors.textMuted.color)
    .multilineTextAlignment(.center)
    .fixedSize(horizontal: false, vertical: true)
  }

  /// A turn that joins a thread already on screen says who is speaking, once.
  private func announceArrival() {
    guard let thread, thread.arrivals.open else { return }
    AccessibilityNotification.Announcement(props.author).post()
  }

  /// The web's `data-role`, `data-status` (absent when complete) and
  /// `aria-busy` while the turn streams.
  private func attributes(_ status: PMChatMessageStatus) -> [String: String] {
    var attributes = ["role": props.role.rawValue]
    if status != .complete { attributes["status"] = status.rawValue }
    if status == .streaming { attributes["busy"] = "true" }
    return attributes
  }
}

/// ChatMessage's states, from the spec's States table. A reply's body is
/// Markdown, as the web's is, streaming while the turn is.
public struct ChatMessageStates: PMStates {
  public let member = "ChatMessage"

  public init() {}

  static let question = "Why did the webhook retry twice with the same promo code?"
  private static let filesNote = "Here is the delivery log and the policy we agreed on."
  static let reply =
    "The first delivery timed out after the order was written, so the retry carried the same "
    + "promo code. The code was redeemed once; the second attempt was refused by the "
    + "idempotency key."
  static let replyFollowUp =
    "Set the endpoint's timeout above the order write, or answer 202 at once and write the "
    + "order afterwards."
  private static let pictured =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E"
    + "%3Crect width='32' height='32' fill='%236b7280'/%3E%3C/svg%3E"

  /// The hover row every reply in the fixture carries.
  static func replyActions() -> PMContent {
    AnyView(
      Group {
        PMButton(
          props: PMButtonProps(
            icon: .copy, iconOnly: true, label: "Copy", onClick: {}, size: .sm,
            appearance: .ghostNeutral))
        PMButton(
          props: PMButtonProps(
            icon: .refresh, iconOnly: true, label: "Regenerate", onClick: {}, size: .sm,
            appearance: .ghostNeutral))
        PMButton(
          props: PMButtonProps(
            icon: .helpful, iconOnly: true, label: "Helpful", onClick: {}, size: .sm,
            appearance: .ghostNeutral))
        PMButton(
          props: PMButtonProps(
            icon: .unhelpful, iconOnly: true, label: "Not helpful", onClick: {}, size: .sm,
            appearance: .ghostNeutral))
      })
  }

  /// A reply's body: Markdown of its paragraphs, a blank line apart, with the
  /// streaming caret while `streaming`.
  static func prose(_ paragraphs: String..., streaming: Bool = false) -> PMContent {
    AnyView(
      PMMarkdown(
        props: PMMarkdownProps(
          children: paragraphs.joined(separator: "\n\n"), streaming: streaming ? true : nil)))
  }

  /// A sentence of the reader's, as written.
  static func words(_ text: String) -> PMContent {
    AnyView(Text(text))
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "the reader — a bubble at the trailing edge", expect: ["role": "user", "label": "You"]
      ) {
        PMChatMessage(
          props: PMChatMessageProps(
            author: "You", children: Self.words(Self.question), role: .user, time: "09:41"))
      },
      PMStateEntry("the reader, with files — chips under the words", expect: ["role": "user"]) {
        PMChatMessage(
          props: PMChatMessageProps(
            author: "You",
            children: AnyView(
              Group {
                Text(Self.filesNote)
                PMInline(
                  props: PMInlineProps(
                    children: AnyView(
                      Group {
                        PMAttachmentChip(
                          props: PMAttachmentChipProps(name: "delivery.log", size: 48_210))
                        PMAttachmentChip(
                          props: PMAttachmentChipProps(name: "retry-policy.pdf", size: 184_320))
                      }), gap: .s2, wrap: true))
              }),
            role: .user, time: "09:41"))
      },
      PMStateEntry(
        "the model — full-width prose with the mark, and the actions row",
        expect: ["role": "assistant", "label": "Pilot"]
      ) {
        PMChatMessage(
          props: PMChatMessageProps(
            actions: Self.replyActions(), author: "Pilot",
            children: Self.prose(Self.reply, Self.replyFollowUp), role: .assistant,
            time: "09:41"))
      },
      PMStateEntry(
        "the model, streaming — busy, no actions yet",
        expect: ["role": "assistant", "status": "streaming", "busy": "true"]
      ) {
        PMChatMessage(
          props: PMChatMessageProps(
            author: "Pilot", children: Self.prose(String(Self.reply.prefix(80)), streaming: true),
            role: .assistant, status: .streaming))
      },
      PMStateEntry(
        "stopped — the app’s words for a turn the reader ended", expect: ["status": "stopped"]
      ) {
        PMChatMessage(
          props: PMChatMessageProps(
            actions: Self.replyActions(), author: "Pilot",
            children: Self.prose(String(Self.reply.prefix(140))), role: .assistant,
            status: .stopped, statusMessage: "Stopped generating"))
      },
      PMStateEntry("error — a turn that failed", expect: ["status": "error"]) {
        PMChatMessage(
          props: PMChatMessageProps(
            actions: Self.replyActions(), author: "Pilot", children: AnyView(EmptyView()),
            role: .assistant, status: .error,
            statusMessage: "The model did not respond. Try again."))
      },
      PMStateEntry(
        "a pictured speaker — an Avatar in the mark", expect: ["role": "user", "label": "Ada Okonkwo"]
      ) {
        PMChatMessage(
          props: PMChatMessageProps(
            author: "Ada Okonkwo", avatar: Self.pictured,
            children: Self.words("Can you check the retry schedule?"), role: .user,
            time: "09:40"))
      },
      PMStateEntry(
        "a system notice — the thread talking about itself", expect: ["role": "system"]
      ) {
        PMChatMessage(
          props: PMChatMessageProps(
            author: "System",
            children: Self.words("Context was summarised to make room for the conversation."),
            role: .system))
      },
    ]
  }
}
