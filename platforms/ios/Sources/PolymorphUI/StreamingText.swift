// StreamingText (`design/components/streaming-text.md`): a paragraph that has
// not ended yet, such as a model's reply before it finishes. Text's recipe at
// `text.sm` or `text.md` in `text.primary`, with the caret after the last
// character while more is coming (`PMCaretText`). The string is drawn verbatim:
// spaces and line breaks are content, and a token wider than the column breaks
// where it must rather than widening it. Before anything has arrived, Skeleton's
// bar stands at the step's exact line box, `width` 9, so the first word replaces
// it without moving the page; the bar is decorative and shimmers as Skeleton does.
//
// The app owns the stream: the member draws the string it is given and never
// buffers or throttles it. Finished, it draws as Text does.
//
// The web's `aria-busy` has no counterpart on iOS. While streaming the
// paragraph carries the `updatesFrequently` trait, so VoiceOver reads a focused
// paragraph as it now is rather than as it was. Announcing the reply is not
// this member's job: ChatThread announces a message once, when it is added.

import PolymorphTokens
import SwiftUI

public struct PMStreamingText: PMStreamingTextRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMStreamingTextProps

  public init(props: PMStreamingTextProps) {
    self.props = props
  }

  public var body: some View {
    let size = props.size ?? .md
    let streaming = props.streaming ?? false
    let pending = streaming && props.children.isEmpty
    let step = size == .sm ? theme.text.sm : theme.text.md

    Group {
      if pending {
        PMSkeleton(
          props: PMSkeletonProps(shape: .text, textStep: size == .sm ? .sm : .md, width: .width9))
      } else {
        PMCaretText(content: Text(props.children), step: step, showing: streaming)
          .pmTextStyle(step)
          .foregroundStyle(theme.colors.textPrimary.color)
          .multilineTextAlignment(.leading)
          .fixedSize(horizontal: false, vertical: true)
          .accessibilityElement(children: .ignore)
          .accessibilityLabel(Text(props.children))
          .accessibilityAddTraits(streaming ? [.isStaticText, .updatesFrequently] : .isStaticText)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .pmMember("StreamingText", attributes(size: size, streaming: streaming, pending: pending))
  }

  /// The web's `data-size`, `data-state`, `data-pending` and `aria-busy`.
  private func attributes(
    size: PMStreamingTextSize, streaming: Bool, pending: Bool
  ) -> [String: String] {
    var found = ["size": size.rawValue]
    if streaming {
      found["state"] = "streaming"
      found["busy"] = "true"
    }
    if pending { found["pending"] = "true" }
    return found
  }
}

/// StreamingText's states, from the spec's States table. The pending bar is
/// decorative, so that entry exposes nothing to assistive technology.
public struct StreamingTextStates: PMStates {
  public let member = "StreamingText"

  public init() {}

  private static let reply =
    "The retry schedule is exponential with a cap at five attempts. The first retry fires "
    + "after two seconds and each one after that doubles the wait."
  private static let status = "Searching the workspace for the retry policy"
  private static let breaks = "First line.\nSecond line, after a hard break."

  public var entries: [PMStateEntry] {
    let arriving = String(Self.reply.prefix(70))
    return [
      PMStateEntry(
        "arriving — the caret marks where the next word lands",
        expect: ["state": "streaming", "busy": "true", "size": "md", "label": arriving]
      ) {
        PMStreamingText(props: PMStreamingTextProps(children: arriving, streaming: true))
      },
      PMStateEntry(
        "pending — nothing has landed, so the bar stands where the first line will",
        expect: ["hidden": "true"]
      ) {
        PMStreamingText(props: PMStreamingTextProps(children: "", streaming: true))
      },
      PMStateEntry(
        "complete — Text, with no caret and nothing busy",
        expect: ["size": "md", "label": Self.reply]
      ) {
        PMStreamingText(props: PMStreamingTextProps(children: Self.reply))
      },
      PMStateEntry(
        "sm — the secondary step, for a status sentence",
        expect: ["size": "sm", "state": "streaming", "label": Self.status]
      ) {
        PMStreamingText(
          props: PMStreamingTextProps(children: Self.status, size: .sm, streaming: true))
      },
      PMStateEntry("line breaks — whitespace is content", expect: ["label": Self.breaks]) {
        PMStreamingText(props: PMStreamingTextProps(children: Self.breaks))
      },
    ]
  }
}
