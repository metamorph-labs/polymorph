// Plan (`design/components/plan.md`): the steps of one agent run, each with
// its status, which the app passes whole on every change. It is not Stepper,
// whose flow the reader walks, and not Timeline, whose events are over. It is
// flat and read-only: nothing in it is pressed or opened, and it never infers,
// times or reorders a step.
//
// The list has no surface of its own: it takes the turn's, the Card's or the
// pane's. The steps are `space.3` apart, each a row `space.2` apart of the
// status glyph and the copy, top-aligned. The glyph (`sm`) sits in a column
// one `text.sm` line tall, so it stays beside the title's first line however
// far the title wraps: pending `time` and skipped `remove` in `text.muted`,
// running `loading` in `accent.text` on the spin loop, done `success` in
// `success.text`, error `error` in `danger.text`. A new status fades the glyph
// in over the control duration (`toolcall.status`); the fade moves nothing, so
// Reduce Motion keeps it, and stops the spin. The title is `text.sm` in
// `text.primary`, the description `text.xs` in `text.secondary` `2pt` under
// it; a pending or skipped step steps both down a role, to `text.secondary`
// and `text.muted`.
//
// The status is never the glyph alone. The list is one container named by
// `label`, whose steps VoiceOver finds one by one, and each step is one
// element read as its title, its status words from `messages.status` and its
// description ("Write the migration, Running"); the glyph column is hidden. A
// status `messages.status` lacks takes its default words. The first running
// step has the selected trait, the web's `aria-current="step"`, as Stepper's
// active step does, and every running step updates frequently, the web's
// `aria-busy`. The status line is a polite announcement of the step at the
// front of the run with its status words (`front`): posted when that changes,
// never when the Plan appears, and never for a description. An empty Plan
// draws nothing: a plan not yet made is the page's to show.

import PolymorphTokens
import SwiftUI

public struct PMPlan: PMPlanRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMPlanProps

  public init(props: PMPlanProps) {
    self.props = props
  }

  public var body: some View {
    let steps = props.steps
    let current = steps.firstIndex { $0.status == .running }
    let front = Self.front(of: steps)

    if !steps.isEmpty {
      VStack(alignment: .leading, spacing: theme.defaultDensity.space.s3) {
        ForEach(Array(steps.enumerated()), id: \.element.id) { index, step in
          PlanStepRow(step: step, words: words(step.status), current: index == current)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .accessibilityElement(children: .contain)
      .accessibilityLabel(Text(props.label))
      .pmLiveAnnouncement(front.map { "\($0.title), \(words($0.status))" }, assertive: false)
      .pmMember("Plan", identity(current: current.map { steps[$0] }, front: front))
    }
  }

  /// The words for a status: the app's, or the spec's English.
  private func words(_ status: PMPlanStatus) -> String {
    props.messages?.status[status] ?? Self.english(status)
  }

  private func identity(current: PMPlanStep?, front: PMPlanStep?) -> [String: String] {
    var attributes = ["steps": String(props.steps.count)]
    if let current { attributes["current"] = current.id }
    if let front { attributes["front"] = front.id }
    return attributes
  }

  /// The step at the front of the run, which the status line names: the first
  /// running step; with none running, the first failed one; with neither, the
  /// last one done or skipped. None while every step is pending.
  static func front(of steps: [PMPlanStep]) -> PMPlanStep? {
    steps.first { $0.status == .running }
      ?? steps.first { $0.status == .error }
      ?? steps.last { $0.status == .done || $0.status == .skipped }
  }

  private static func english(_ status: PMPlanStatus) -> String {
    switch status {
    case .pending: PMStrings.planPending
    case .running: PMStrings.planRunning
    case .done: PMStrings.planDone
    case .error: PMStrings.planFailed
    case .skipped: PMStrings.planSkipped
    }
  }
}

/// One step: the glyph column beside the title and the description, read as
/// one element.
private struct PlanStepRow: View {
  @Environment(\.pmTheme) private var theme
  let step: PMPlanStep
  let words: String
  let current: Bool

  var body: some View {
    let colors = theme.colors
    let quiet = step.status == .pending || step.status == .skipped
    let running = step.status == .running
    HStack(alignment: .top, spacing: theme.defaultDensity.space.s2) {
      PlanGlyph(status: step.status)
        .frame(height: theme.text.sm.lineBox)
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 0) {
        Text(step.title)
          .pmTextStyle(theme.text.sm)
          .foregroundStyle((quiet ? colors.textSecondary : colors.textPrimary).color)
        if let description = step.description {
          Text(description)
            .pmTextStyle(theme.text.xs)
            .foregroundStyle((quiet ? colors.textMuted : colors.textSecondary).color)
            .padding(.top, PMGeometry.subline)
        }
      }
      .multilineTextAlignment(.leading)
      .fixedSize(horizontal: false, vertical: true)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(spoken))
    .accessibilityAddTraits(current ? .isSelected : [])
    .accessibilityAddTraits(running ? .updatesFrequently : [])
  }

  /// The title, the status words, then the description.
  private var spoken: String {
    [step.title, words, step.description].compactMap { $0 }.joined(separator: ", ")
  }
}

/// The status glyph in its role's colour. A new status fades in over the
/// control duration, as ToolCall's does; `running` spins.
private struct PlanGlyph: View {
  @Environment(\.pmTheme) private var theme
  let status: PMPlanStatus

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

  private static func recipe(_ status: PMPlanStatus, _ c: PMColors) -> (PMIconRole, PMDynamicColor)
  {
    switch status {
    case .pending: (.time, c.textMuted)
    case .running: (.loading, c.accentText)
    case .done: (.success, c.successText)
    case .error: (.error, c.dangerText)
    case .skipped: (.remove, c.textMuted)
    }
  }
}

/// Plan's states, from the spec's States table: a run under way, every
/// status, a failed run, nothing started, every step done, and the empty
/// list, which draws nothing.
public struct PlanStates: PMStates {
  public let member = "Plan"

  public init() {}

  private static let label = "Plan for this run"

  private static let run = [
    PMPlanStep(
      id: "read", title: "Read the webhook retry code",
      description: "src/webhooks/retry.ts and its two callers", status: .done),
    PMPlanStep(
      id: "cause", title: "Find why a retry reuses the promo code",
      description: "The idempotency key is built before the code is applied.", status: .done),
    PMPlanStep(
      id: "fix", title: "Build the idempotency key after the code is applied",
      description: "Editing src/webhooks/deliver.ts", status: .running),
    PMPlanStep(id: "test", title: "Run the webhook tests", status: .pending),
    PMPlanStep(id: "review", title: "Open a pull request for review", status: .pending),
  ]

  private static let every = [
    PMPlanStep(id: "done", title: "A step that is done", status: .done),
    PMPlanStep(id: "running", title: "A step that is running", status: .running),
    PMPlanStep(id: "error", title: "A step that failed", status: .error),
    PMPlanStep(id: "skipped", title: "A step that was skipped", status: .skipped),
    PMPlanStep(id: "pending", title: "A step that has not started", status: .pending),
  ]

  private static let failed = [
    PMPlanStep(id: "read", title: "Read the webhook retry code", status: .done),
    PMPlanStep(
      id: "test", title: "Run the webhook tests",
      description: "Three tests failed in deliver.test.ts.", status: .error),
    PMPlanStep(id: "fix", title: "Fix what the tests found", status: .skipped),
    PMPlanStep(id: "review", title: "Open a pull request for review", status: .skipped),
  ]

  private static func all(_ status: PMPlanStatus) -> [PMPlanStep] {
    run.map {
      PMPlanStep(id: $0.id, title: $0.title, description: $0.description, status: status)
    }
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "running — two steps done, one running, two to come",
        expect: ["label": Self.label, "steps": "5", "current": "fix", "front": "fix"]
      ) {
        PMPlan(props: PMPlanProps(label: Self.label, steps: Self.run))
      },
      PMStateEntry(
        "every status — one step of each",
        expect: ["label": "Every status", "current": "running", "front": "running"]
      ) {
        PMPlan(props: PMPlanProps(label: "Every status", steps: Self.every))
      },
      PMStateEntry(
        "failed — the run stopped, and the rest was skipped",
        expect: ["steps": "4", "current": "", "front": "test"]
      ) {
        PMPlan(props: PMPlanProps(label: Self.label, steps: Self.failed))
      },
      PMStateEntry(
        "pending — nothing has started", expect: ["steps": "5", "current": "", "front": ""]
      ) {
        PMPlan(props: PMPlanProps(label: Self.label, steps: Self.all(.pending)))
      },
      PMStateEntry(
        "done — every step finished", expect: ["steps": "5", "current": "", "front": "review"]
      ) {
        PMPlan(props: PMPlanProps(label: Self.label, steps: Self.all(.done)))
      },
      PMStateEntry(
        "a long path — the title wraps, the glyph by its first line",
        expect: ["current": "path", "front": "path"]
      ) {
        PMPlan(
          props: PMPlanProps(
            label: Self.label,
            steps: [
              PMPlanStep(
                id: "path",
                title:
                  "Read src/deeply-nested-directory/deeply-nested-directory/deeply-nested-directory/retry.ts",
                description: "Found idempotency-key-idempotency-key-idempotency-key-builder",
                status: .running),
              PMPlanStep(id: "next", title: "Run the webhook tests", status: .pending),
            ]))
      },
      PMStateEntry(
        "the app’s words — every status in German",
        expect: ["label": "Plan für diesen Lauf", "current": "running"]
      ) {
        PMPlan(
          props: PMPlanProps(
            label: "Plan für diesen Lauf",
            messages: PMPlanMessages(status: [
              .pending: "Ausstehend", .running: "Läuft", .done: "Erledigt",
              .error: "Fehlgeschlagen", .skipped: "Übersprungen",
            ]),
            steps: Self.every))
      },
      PMStateEntry(
        "empty — the page tells that story, not the list",
        expect: ["hidden": "true", "renders": "nothing"]
      ) {
        PMPlan(props: PMPlanProps(label: Self.label, steps: []))
      },
    ]
  }
}
