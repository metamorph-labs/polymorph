// CommentThread (`design/components/comment-thread.md`): the comments people
// leave on a record, with their replies, read from the top. It is not
// ChatThread, which follows and announces a conversation with a model: a
// comment thread sits in the page, follows nothing and announces nothing. The
// body, the labels, the actions and the composer are the app's views.
//
// The thread is a column of comments `space.5` apart, in the order given. A
// comment is a row `space.3` apart of its mark column, `space.7` wide (an `md`
// Avatar) with the app's Avatar centred in it, and its body, a column
// `space.2` apart: the head, the content and the actions. The head flows onto
// further lines at the baseline, `space.2` apart: the author in `text.sm` at
// the `text.xl` weight in `text.primary`, the time the app passes and, for an
// edited comment, `messages.edited`, both in `text.xs` `text.muted`, then the
// labels (`meta`), `space.1` apart. A wrapped head's lines are `space.2`
// apart, where the recipe writes `space.1`, because Inline's row has one gap.
// The content is the app's views `space.2` apart, wrapping; the actions are
// the app's Buttons in a row `space.1` apart that wraps, always shown.
//
// Replies are a column `space.4` apart, `space.4` under the comment, indented
// one mark column and one gap (`space.7` and `space.3`), so a reply's mark
// starts where its parent's body starts, with a `border.subtle` hairline down
// the middle of the parent's mark column. A reply's own replies keep that
// indentation and add none, and draw no second rule, so the thread has two
// drawn levels at every width; they still nest in the accessibility tree.
//
// The thread is one container named by `label`, whose comments VoiceOver
// finds one by one; iOS has no list role or item count for a view that is not
// a scrolling `List`. Each comment is a container named by its author, as the
// web's `article` is (ChatMessage's rule); the time is the app's view, read
// after the name. The Avatar is decorative beside the visible name, by
// Avatar's own rule. A comment's replies are a container named by
// `messages.replies`. Nothing is announced and nothing moves. A thread with no
// comments draws nothing.

import PolymorphTokens
import SwiftUI

public struct PMCommentThread: PMCommentThreadRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMCommentThreadProps

  public init(props: PMCommentThreadProps) {
    self.props = props
  }

  public var body: some View {
    if let children = props.children {
      VStack(alignment: .leading, spacing: theme.defaultDensity.space.s5) {
        children
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .environment(
        \.pmCommentThread,
        PMCommentThreadContext(
          messages: props.messages ?? PMStrings.commentThreadMessages, depth: 0)
      )
      .accessibilityElement(children: .contain)
      .accessibilityLabel(Text(props.label))
      .pmMember("CommentThread")
    }
  }
}

/// What the thread hands each comment in it, at any depth: its words, and how
/// deep the comment is, which decides whether its replies are indented.
struct PMCommentThreadContext {
  let messages: PMCommentThreadMessages
  /// 0 for a comment of the thread, 1 for a reply, more for a reply's replies.
  let depth: Int
}

private struct PMCommentThreadKey: EnvironmentKey {
  static let defaultValue: PMCommentThreadContext? = nil
}

extension EnvironmentValues {
  /// The thread the view is a comment of, or `nil` outside a CommentThread.
  fileprivate var pmCommentThread: PMCommentThreadContext? {
    get { self[PMCommentThreadKey.self] }
    set { self[PMCommentThreadKey.self] = newValue }
  }
}

extension PMCommentThread {
  /// One comment: the mark, the head, the body and the actions, then its replies.
  public struct Comment: View {
    @Environment(\.pmTheme) private var theme
    @Environment(\.pmCommentThread) private var thread
    private let props: PMCommentThreadCommentProps

    public init(props: PMCommentThreadCommentProps) {
      self.props = props
    }

    public var body: some View {
      let space = theme.defaultDensity.space
      let messages = thread?.messages ?? PMStrings.commentThreadMessages
      let depth = thread?.depth ?? 0

      VStack(alignment: .leading, spacing: 0) {
        entry(messages)
        if let replies = props.replies {
          VStack(alignment: .leading, spacing: space.s4) {
            replies
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .environment(
            \.pmCommentThread, PMCommentThreadContext(messages: messages, depth: depth + 1)
          )
          .accessibilityElement(children: .contain)
          .accessibilityLabel(Text(messages.replies))
          // A comment of the thread indents its replies and draws their rule;
          // a reply's replies stay at the second level.
          .padding(.leading, depth == 0 ? space.s7 + space.s3 : 0)
          .background(alignment: .topLeading) {
            if depth == 0 {
              PMRule(theme.colors.borderSubtle, axis: .vertical)
                .frame(width: space.s7)
                .accessibilityHidden(true)
            }
          }
          .padding(.top, space.s4)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .pmMember("CommentThread", ["part": "comment"])
    }

    /// The mark column beside the body.
    private func entry(_ messages: PMCommentThreadMessages) -> some View {
      let space = theme.defaultDensity.space
      return HStack(alignment: .top, spacing: space.s3) {
        if let avatar = props.avatar {
          avatar
            .frame(width: space.s7)
        }
        VStack(alignment: .leading, spacing: space.s2) {
          head(messages)
          if let children = props.children {
            VStack(alignment: .leading, spacing: space.s2) {
              children
            }
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
          }
          if let actions = props.actions {
            PMInlineLayout(gap: space.s1, align: .center, justify: .start, wrap: true) {
              actions
            }
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      // Named by its author, as the web's article is.
      .accessibilityElement(children: .contain)
      .accessibilityLabel(Text(props.author))
    }

    /// The author, the time, the edited mark and the labels, on one baseline,
    /// wrapping where the column is narrow.
    private func head(_ messages: PMCommentThreadMessages) -> some View {
      let space = theme.defaultDensity.space
      let colors = theme.colors
      return PMInlineLayout(gap: space.s2, align: .baseline, justify: .start, wrap: true) {
        Text(props.author)
          .pmTextStyle(theme.text.sm.weighted(like: theme.text.xl))
          .foregroundStyle(colors.textPrimary.color)
          .fixedSize(horizontal: false, vertical: true)
        if let time = props.time {
          time
            .pmTextStyle(theme.text.xs)
            .foregroundStyle(colors.textMuted.color)
        }
        if props.edited == true {
          Text(messages.edited)
            .pmTextStyle(theme.text.xs)
            .foregroundStyle(colors.textMuted.color)
        }
        if let meta = props.meta {
          PMInlineLayout(gap: space.s1, align: .center, justify: .start, wrap: true) {
            meta
          }
        }
      }
    }
  }
}

/// CommentThread's states, from the spec's States table: a thread with
/// replies, an internal note, an edited comment, a resolved thread, a body
/// with a mention and attachments, a reply to a reply, long unbroken text at a
/// phone's width, and the thread followed by the app's composer.
public struct CommentThreadStates: PMStates {
  public let member = "CommentThread"

  public init() {}

  private static let label = "Comments"
  private static let longAddress =
    "https://status.example.com/incidents/2026-11-14-eu-west-1-webhook-delivery-retried-with-a-duplicated-promo-code"
  private static let longAuthor = "svc-webhook-delivery-eu-west-1-production-retry-worker"

  /// The app's controls for a comment. They take no handler here, as nothing is listening.
  private static func actions() -> PMContent {
    PMContent(
      Group {
        PMButton(props: PMButtonProps(label: "Reply", size: .sm, appearance: .ghostNeutral))
        PMButton(props: PMButtonProps(label: "Edit", size: .sm, appearance: .ghostNeutral))
      })
  }

  private static func avatar(_ name: String) -> PMContent {
    PMContent(PMAvatar(props: PMAvatarProps(name: name)))
  }

  private static func text(_ words: String) -> PMContent {
    PMContent(PMText(props: PMTextProps(children: PMContent(Text(words)))))
  }

  private static func time(_ words: String) -> PMContent {
    PMContent(Text(words))
  }

  private static func badge(_ words: String, _ tone: PMBadgeTone) -> PMContent {
    PMContent(PMBadge(props: PMBadgeProps(children: words, tone: tone)))
  }

  private static func comment(
    _ author: String, time: String, edited: Bool? = nil, meta: PMContent? = nil,
    actions: Bool = false, replies: PMContent? = nil, body: PMContent
  ) -> some View {
    PMCommentThread.Comment(
      props: PMCommentThreadCommentProps(
        actions: actions ? Self.actions() : nil, author: author, avatar: Self.avatar(author),
        children: body, edited: edited, meta: meta, replies: replies, time: Self.time(time)))
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "a thread with replies", expect: ["label": Self.label, "contains": "Button,RelativeTime"]
      ) {
        PMCommentThread(
          props: PMCommentThreadProps(
            children: PMContent(
              Group {
                PMCommentThread.Comment(
                  props: PMCommentThreadCommentProps(
                    actions: Self.actions(), author: "Ada Okafor",
                    avatar: Self.avatar("Ada Okafor"),
                    children: Self.text(
                      "The webhook retried twice with the same promo code. Is the retry idempotent?"),
                    replies: PMContent(
                      Group {
                        Self.comment(
                          "Bao Tran", time: "09:52", actions: true,
                          body: Self.text(
                            "It retries on any 5xx. The second attempt sent the cached payload."))
                        Self.comment(
                          "Ada Okafor", time: "10:05", actions: true,
                          body: Self.text("So the code was applied twice. I will open a fix."))
                      }),
                    time: PMContent(
                      PMRelativeTime(
                        props: PMRelativeTimeProps(mode: .absolute, value: "2026-11-14T09:40:00Z")))
                  ))
                Self.comment(
                  "Carmen Ruiz", time: "11:20", actions: true,
                  body: Self.text("The customer confirmed that the second charge was refunded."))
              }),
            label: Self.label))
      },
      PMStateEntry("an internal note", expect: ["label": "Ticket messages", "contains": "Badge"]) {
        PMCommentThread(
          props: PMCommentThreadProps(
            children: PMContent(
              Self.comment(
                "Bao Tran", time: "Yesterday", meta: Self.badge("Internal note", .warning),
                body: Self.text(
                  "The customer is on the legacy plan. Do not offer the annual discount."))),
            label: "Ticket messages"))
      },
      PMStateEntry("an edited comment", expect: ["label": Self.label]) {
        PMCommentThread(
          props: PMCommentThreadProps(
            children: PMContent(
              Self.comment(
                "Carmen Ruiz", time: "2 Nov", edited: true, actions: true,
                body: Self.text("The export finished. The archive is kept for thirty days."))),
            label: Self.label))
      },
      PMStateEntry("a resolved thread", expect: ["contains": "Badge"]) {
        PMCommentThread(
          props: PMCommentThreadProps(
            children: PMContent(
              Self.comment(
                "Ada Okafor", time: "Monday", meta: Self.badge("Resolved", .success),
                replies: PMContent(
                  Self.comment(
                    "Bao Tran", time: "Monday", body: Self.text("Renamed in the latest version."))),
                body: Self.text("This heading should say “Delivery”, not “Shipping”."))),
            label: Self.label))
      },
      PMStateEntry("attachments and a mention", expect: ["contains": "Link,AttachmentChip"]) {
        PMCommentThread(
          props: PMCommentThreadProps(
            children: PMContent(
              Self.comment(
                "Ada Okafor", time: "09:40", actions: true,
                body: PMContent(
                  Group {
                    PMLink(props: PMLinkProps(children: "@Bao Tran", href: "#people/bao"))
                    Self.text("Here is the delivery log and the policy we agreed on.")
                    PMInline(
                      props: PMInlineProps(
                        children: PMContent(
                          Group {
                            PMAttachmentChip(
                              props: PMAttachmentChipProps(name: "delivery.log", size: 48_210))
                            PMAttachmentChip(
                              props: PMAttachmentChipProps(name: "retry-policy.pdf", size: 184_320))
                          }), gap: .s2, wrap: true))
                  }))),
            label: Self.label))
      },
      PMStateEntry("a reply to a reply — drawn at the second level", expect: ["label": Self.label]) {
        PMCommentThread(
          props: PMCommentThreadProps(
            children: PMContent(
              Self.comment(
                "Ada Okafor", time: "09:40",
                replies: PMContent(
                  Self.comment(
                    "Bao Tran", time: "09:52",
                    replies: PMContent(
                      Self.comment(
                        "Carmen Ruiz", time: "10:01",
                        body: Self.text("Agreed. The policy allows five attempts."))),
                    body: Self.text("We should cap the retries at five."))),
                body: Self.text("How many times may a delivery be retried?"))),
            label: Self.label))
      },
      PMStateEntry("long unbroken text at phone width", expect: ["contains": "Badge,Button"]) {
        PMCommentThread(
          props: PMCommentThreadProps(
            children: PMContent(
              Self.comment(
                Self.longAuthor, time: "09:40", meta: Self.badge("Internal note", .warning),
                actions: true, body: Self.text(Self.longAddress))),
            label: Self.label))
      },
      PMStateEntry("followed by a composer", expect: ["label": Self.label]) {
        CommentThreadComposerScene(
          thread: PMCommentThread(
            props: PMCommentThreadProps(
              children: PMContent(
                Self.comment(
                  "Ada Okafor", time: "09:40",
                  body: Self.text("Can someone check the retry schedule?"))),
              label: Self.label)))
      },
    ]
  }
}

/// The thread with the app's composer under it, `space.4` apart, as the
/// states fixture's last entry draws them: a FormField with a Textarea, then
/// its Button.
private struct CommentThreadComposerScene: View {
  @Environment(\.pmTheme) private var theme
  let thread: PMCommentThread

  var body: some View {
    VStack(alignment: .trailing, spacing: theme.defaultDensity.space.s4) {
      thread
      PMFormField(
        props: PMFormFieldProps(
          children: PMContent(PMTextarea(props: PMTextareaProps(rows: 3))), label: "Reply"))
      PMButton(props: PMButtonProps(label: "Comment", appearance: .solidAccent))
    }
  }
}
