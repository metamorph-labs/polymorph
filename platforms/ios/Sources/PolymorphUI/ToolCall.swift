// ToolCall (`design/components/tool-call.md`): one tool call in a model's
// reply, as a row the reader can open: what the model asked a tool to do,
// whether it has finished, and what came back. A record of work, not a
// message to the reader (Alert), and not the question before the work
// (ApprovalCard, which sits beside a call whose status is `approval`).
//
// The card is the subtle wash inside a `border.subtle` hairline at
// `radius.control` (`danger.border` when the call failed): it sits inside a
// reply, so it is not Card's lit surface. The row is the trigger: the tool's
// mark (`sm`, `text.muted`), its name in the mono face in `text.primary`, the
// summary in `text.secondary`, shortened at its end, then the duration
// (`text.xs`, muted, the theme's figures), the status glyph in its role's
// colour, and the `down` chevron, which turns half a turn while open. A press
// washes the row in `bg.surface` and turns its text `text.primary`. The row
// is at least the hit target tall, because the whole of it is the button. A
// call with no input, output or message has nothing to open, so its row is
// plain text at the control height, not a button.
//
// The body is the disclosure region Accordion and Collapsible open
// (`collapsible.content`, by reference), under a hairline: the input under
// its overline heading, as CodeBlock for a string and JsonTree for any other
// value, the output as the app composed it, and the app's message, in
// `danger.text` when the call failed. The glyph changes with the status by a
// fade over the control duration, kept under Reduce Motion as the spec says;
// `running` turns the `loading` glyph on the spin loop.
//
// The status is never the glyph alone: the row's name is the tool's name, its
// summary, its duration and the status's words from `messages` ("read_file,
// src/webhooks/retry.ts, Running"), and its value says whether it is open, as
// the web's `aria-expanded` is announced. A running call updates often, the
// web's `aria-busy`. `open` with `onOpenChange` is the controlled pair;
// without it the row keeps its own state, from `defaultOpen`. A status
// missing from `messages.status` takes its default words.

import PolymorphTokens
import SwiftUI

public struct PMToolCall: PMToolCallRendering {
  @Environment(\.pmTheme) private var theme
  @State private var draft: Bool
  private let props: PMToolCallProps

  public init(props: PMToolCallProps) {
    self.props = props
    _draft = State(initialValue: props.defaultOpen ?? false)
  }

  public var body: some View {
    let colors = theme.colors
    let status = props.status
    let opens = props.input != nil || props.output != nil || props.message != nil
    let open = opens && (props.open ?? draft)
    let shape = RoundedRectangle(cornerRadius: theme.radius.control)

    var attributes = ["status": status.rawValue, "state": open ? "open" : "closed"]
    if status == .running { attributes["busy"] = "true" }

    return VStack(alignment: .leading, spacing: 0) {
      if opens {
        Button {
          draft = !open
          props.onOpenChange?(!open)
        } label: {
          ToolCallRow(props: props, open: open, opens: true)
        }
        .buttonStyle(
          PMWashRowStyle(
            wash: colors.bgSurface, cornerRadius: theme.radius.control,
            rest: colors.textSecondary, active: colors.textPrimary)
        )
        .accessibilityLabel(Text(spoken))
        .accessibilityValue(Text(PMStrings.disclosure(open: open)))
        .accessibilityAddTraits(status == .running ? .updatesFrequently : [])
        PMDisclosureRegion(open: open) { details }
      } else {
        ToolCallRow(props: props, open: false, opens: false)
          .foregroundStyle(colors.textSecondary.color)
          .accessibilityElement(children: .ignore)
          .accessibilityLabel(Text(spoken))
          .accessibilityAddTraits(status == .running ? .updatesFrequently : [])
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(colors.bgSubtle.color, in: shape)
    .overlay {
      shape.strokeBorder(
        (status == .error ? colors.dangerBorder : colors.borderSubtle).color, lineWidth: 1)
    }
    .accessibilityElement(children: .contain)
    .pmMember("ToolCall", attributes)
  }

  /// The row's name: the tool's name, the summary, the duration and the
  /// status's words, which the glyph alone does not say.
  private var spoken: String {
    let words = props.messages?.status[props.status] ?? PMStrings.toolCallStatus(props.status)
    return [props.name, props.summary, props.duration, words].compactMap { $0 }
      .joined(separator: ", ")
  }

  /// The body under the row's hairline: the input, the output and the message.
  private var details: some View {
    let space = theme.defaultDensity.space
    let colors = theme.colors
    let messages = props.messages ?? PMStrings.toolCallMessages
    return VStack(alignment: .leading, spacing: 0) {
      PMRule(colors.borderSubtle)
      VStack(alignment: .leading, spacing: space.s3) {
        if let input = props.input {
          ToolCallSection(heading: messages.input) {
            if case .string(let command) = input {
              PMCodeBlock(props: PMCodeBlockProps(children: command, label: messages.input))
            } else {
              PMJsonTree(
                props: PMJsonTreeProps(data: input, defaultDepth: 1, label: messages.input))
            }
          }
        }
        if let output = props.output {
          ToolCallSection(heading: messages.output) { output }
        }
        if let message = props.message {
          Text(message)
            .pmTextStyle(theme.text.sm)
            .foregroundStyle(
              (props.status == .error ? colors.dangerText : colors.textSecondary).color
            )
            .fixedSize(horizontal: false, vertical: true)
        }
      }
      .padding(.top, space.s2)
      .padding(.horizontal, space.s3)
      .padding(.bottom, space.s3)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}

/// The row: the mark, the name, the summary, then the duration, the status
/// glyph and, when there is a body, the chevron. A row that opens is at least
/// the hit target tall; one that does not keeps the control height.
private struct ToolCallRow: View {
  @Environment(\.pmTheme) private var theme
  let props: PMToolCallProps
  let open: Bool
  let opens: Bool

  var body: some View {
    let density = theme.defaultDensity
    let space = density.space
    let colors = theme.colors
    HStack(spacing: space.s2) {
      PMIconView(props.icon ?? .tool, size: .sm)
        .foregroundStyle(colors.textMuted.color)
      Text(props.name)
        .pmTextStyle(theme.text.sm.set(in: theme.fonts.mono))
        .foregroundStyle(colors.textPrimary.color)
        .lineLimit(1)
        .layoutPriority(1)
      if let summary = props.summary {
        Text(summary)
          .lineLimit(1)
          .truncationMode(.tail)
      }
      Spacer(minLength: 0)
      HStack(spacing: space.s2) {
        if let duration = props.duration {
          Text(duration)
            .pmTextStyle(theme.text.xs)
            .foregroundStyle(colors.textMuted.color)
            .pmTabularFigures(theme.numeric.tabular)
            .lineLimit(1)
            .fixedSize()
        }
        ToolCallStatusGlyph(status: props.status)
        if opens {
          PMTurningChevron(role: .down, open: open, turn: .degrees(180))
        }
      }
      .layoutPriority(2)
    }
    .pmTextStyle(theme.text.sm)
    .padding(.vertical, space.s1)
    .padding(.horizontal, space.s3)
    .frame(
      maxWidth: .infinity, minHeight: opens ? density.hitTarget : density.controlHeight.sm,
      alignment: .leading)
  }
}

/// The status glyph in its role's colour. A new status fades in over the
/// control duration, as CodeBlock's copy glyph does; `running` spins.
private struct ToolCallStatusGlyph: View {
  @Environment(\.pmTheme) private var theme
  let status: PMToolCallStatus

  var body: some View {
    let motion = theme.defaultMotion
    let (role, color) = Self.recipe(status, theme.colors)
    Group {
      if status == .running {
        PMSpinGlyph(controlSize: .sm)
      } else {
        PMIconView(role, size: .sm)
      }
    }
    .foregroundStyle(color.color)
    .id(status)
    .transition(.opacity)
    .animation(motion.easing.standard.animation(duration: motion.duration.control), value: status)
  }

  private static func recipe(
    _ status: PMToolCallStatus, _ c: PMColors
  ) -> (PMIconRole, PMDynamicColor) {
    switch status {
    case .pending: (.time, c.textMuted)
    case .running: (.loading, c.accentText)
    case .done: (.success, c.successText)
    case .error: (.error, c.dangerText)
    case .denied: (.denied, c.textMuted)
    case .approval: (.help, c.warningText)
    }
  }
}

/// A section of the body: the overline heading (`text.xs`, uppercase,
/// `text.muted`), spoken as written, over its content.
private struct ToolCallSection<Content: View>: View {
  @Environment(\.pmTheme) private var theme
  let heading: String
  @ViewBuilder let content: () -> Content

  var body: some View {
    VStack(alignment: .leading, spacing: theme.defaultDensity.space.s2) {
      Text(heading)
        .textCase(.uppercase)
        .pmTextStyle(theme.text.xs)
        .foregroundStyle(theme.colors.textMuted.color)
        .accessibilityLabel(Text(heading))
      content()
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// ToolCall's states, from the spec's States table: every status, closed and
/// open, a value input and a string input, the app's message, and a call with
/// nothing to open.
public struct ToolCallStates: PMStates {
  public let member = "ToolCall"

  public init() {}

  private static let input: PMJSONValue = [
    "path": "src/webhooks/retry.ts", "range": ["start": 1, "end": 80],
  ]

  private static func output() -> PMContent {
    PMContent(
      PMCodeBlock(
        props: PMCodeBlockProps(
          children: "export const RETRY_CAP = 5\nexport const FIRST_RETRY_MS = 2_000")))
  }

  private static let file = "src/webhooks/retry.ts"

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "running — the glyph spins, the row is busy",
        expect: ["status": "running", "busy": "true", "state": "closed"]
      ) {
        PMToolCall(
          props: PMToolCallProps(
            input: Self.input, name: "read_file", status: .running, summary: Self.file))
      },
      PMStateEntry(
        "done — closed, with a duration", expect: ["status": "done", "state": "closed"]
      ) {
        PMToolCall(
          props: PMToolCallProps(
            duration: "0.4s", input: Self.input, name: "read_file", output: Self.output(),
            status: .done, summary: Self.file))
      },
      PMStateEntry(
        "done, open — the input as JsonTree, the output as the app composed it",
        expect: ["status": "done", "state": "open"]
      ) {
        PMToolCall(
          props: PMToolCallProps(
            defaultOpen: true, duration: "0.4s", input: Self.input, name: "read_file",
            output: Self.output(), status: .done, summary: Self.file))
      },
      PMStateEntry(
        "a string input — CodeBlock, a shell command", expect: ["status": "done", "state": "open"]
      ) {
        PMToolCall(
          props: PMToolCallProps(
            defaultOpen: true, duration: "41s", icon: .terminal, input: "pnpm test --project ui",
            name: "run_command", status: .done, summary: "pnpm test --project ui"))
      },
      PMStateEntry("pending — queued behind the one before it", expect: ["status": "pending"]) {
        PMToolCall(
          props: PMToolCallProps(
            icon: .network, name: "search_web", status: .pending, summary: "webhook idempotency"))
      },
      PMStateEntry(
        "awaiting approval — the ApprovalCard beside it asks", expect: ["status": "approval"]
      ) {
        PMToolCall(
          props: PMToolCallProps(
            icon: .terminal, name: "run_command", status: .approval,
            summary: "pnpm db:migrate --env staging"))
      },
      PMStateEntry(
        "failed — the app’s words, open", expect: ["status": "error", "state": "open"]
      ) {
        PMToolCall(
          props: PMToolCallProps(
            defaultOpen: true, icon: .network,
            message: "The search provider returned 429. Retrying is up to you.",
            name: "search_web", status: .error, summary: "webhook idempotency"))
      },
      PMStateEntry("denied", expect: ["status": "denied", "state": "closed"]) {
        PMToolCall(
          props: PMToolCallProps(
            icon: .terminal, message: "Denied by you.", name: "run_command", status: .denied,
            summary: "rm -rf dist"))
      },
      PMStateEntry("nothing inside — a row, not a button", expect: ["status": "done"]) {
        PMToolCall(props: PMToolCallProps(duration: "0.1s", name: "list_tools", status: .done))
      },
      PMStateEntry(
        "the app’s words — the headings from messages, a missing status its default",
        expect: ["status": "running", "state": "open"]
      ) {
        PMToolCall(
          props: PMToolCallProps(
            defaultOpen: true, input: Self.input,
            messages: PMToolCallMessages(
              input: "Eingabe", output: "Ausgabe", status: [.done: "Fertig"]),
            name: "read_file", status: .running, summary: Self.file))
      },
    ]
  }
}
