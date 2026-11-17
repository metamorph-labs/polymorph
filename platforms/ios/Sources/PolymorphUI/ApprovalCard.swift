// ApprovalCard (`design/components/approval-card.md`): an in-thread request to
// allow an action an agent wants to take. ConfirmDialog's question without the
// modal: it sits in the thread beside the turn that asked, so the reader can
// keep reading, scroll back, or answer another one first.
//
// Alert's family: a column `space-4` apart inside `space-4` of padding, on the
// tone's wash inside its border at `radius.lg`. The head is the tone's glyph
// (`warning`, or `error` at `danger`), `md`, seated in the title's first line,
// beside the title in `text.primary` and the description in `text.secondary`,
// both `text.sm`, `space-1` apart: hierarchy from colour, never from weight.
// The details are the app's children, on their own surfaces inside the wash.
//
// Undecided, the card ends in a wrapping row of two Buttons `space-3` apart:
// approve `solid/accent sm` (`solid/danger` at `danger`, so allowing what
// cannot be undone looks dangerous), the card's only solid, and deny
// `outline/neutral sm`, because declining is never dangerous. `pending` puts
// the named button in its loading state and disables the other. Once
// `decision` is set the buttons are removed, not disabled, and the outcome is
// drawn in their place: the `confirm` glyph in `success.text` or `denied` in
// `text.muted`, beside the words, a record read in order; the wash turns to
// `bg.surface` inside `border.subtle` and the head's glyph to `text.muted`,
// because the question is answered. The wash and border change over the
// control duration (`stateFeedback`); nothing else moves.
//
// The card asks through `onApprove` and `onDeny` and draws `decision` as given;
// it never stores an answer. Its root is a container named by the title, the
// web's `section` labelled by its title, so a reader lands on the question.

import PolymorphTokens
import SwiftUI

public struct PMApprovalCard: PMApprovalCardRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMApprovalCardProps

  public init(props: PMApprovalCardProps) {
    self.props = props
  }

  public var body: some View {
    let space = theme.defaultDensity.space
    let colors = theme.colors
    let motion = theme.defaultMotion
    let tone = props.tone ?? .warning
    let recipe = ApprovalRecipe(tone: tone, decided: props.decision != nil, colors: colors)
    let shape = RoundedRectangle(cornerRadius: theme.radius.lg)
    let feedback = motion.easing.standard.animation(duration: motion.duration.control)

    VStack(alignment: .leading, spacing: space.s4) {
      HStack(alignment: .top, spacing: space.s3) {
        PMIconView(tone == .danger ? .error : .warning, size: .md)
          .foregroundStyle(recipe.glyph.color)
          .pmLineSeat(theme.text.sm)
        VStack(alignment: .leading, spacing: space.s1) {
          Text(props.title)
            .foregroundStyle(colors.textPrimary.color)
          if let description = props.description {
            Text(description)
              .foregroundStyle(colors.textSecondary.color)
          }
        }
        .pmTextStyle(theme.text.sm)
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, alignment: .leading)
      }

      if let children = props.children {
        children
          .frame(maxWidth: .infinity, alignment: .leading)
      }

      if let decision = props.decision {
        outcome(decision)
      } else {
        actions(tone)
      }
    }
    .padding(space.s4)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background {
      shape.fill(recipe.wash.color)
        .animation(feedback, value: props.decision)
    }
    .overlay {
      shape.strokeBorder(recipe.border.color, lineWidth: 1)
        .animation(feedback, value: props.decision)
    }
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Text(props.title))
    .pmMember("ApprovalCard", attributes(tone))
  }

  /// The two answers. The pressed one shows the decision in flight; the other
  /// waits, disabled, so a second answer cannot overtake the first.
  private func actions(_ tone: PMApprovalCardTone) -> some View {
    let pending = props.pending
    return PMInlineLayout(gap: theme.defaultDensity.space.s3, align: .center, justify: .start, wrap: true) {
      PMButton(
        props: PMButtonProps(
          disabled: pending == .denied, label: props.approveLabel ?? PMStrings.approve,
          loading: pending == .approved, onClick: props.onApprove, size: .sm,
          appearance: tone == .danger ? .solidDanger : .solidAccent))
      PMButton(
        props: PMButtonProps(
          disabled: pending == .approved, label: props.denyLabel ?? PMStrings.deny,
          loading: pending == .denied, onClick: props.onDeny, size: .sm,
          appearance: .outlineNeutral))
    }
  }

  /// The record: the answer in words, with a glyph that matches it.
  private func outcome(_ decision: PMApprovalCardDecision) -> some View {
    let colors = theme.colors
    let messages = props.messages ?? PMStrings.approvalCardMessages
    return switch decision {
    case .approved:
      PMGlyphLine(
        glyph: .confirm, glyphColor: colors.successText, text: messages.approved,
        step: theme.text.sm)
    case .denied:
      PMGlyphLine(
        glyph: .denied, glyphColor: colors.textMuted, text: messages.denied, step: theme.text.sm)
    }
  }

  /// The web's `data-tone`, `data-decision` once decided, and `data-state` with
  /// `aria-busy` while a decision is pending.
  private func attributes(_ tone: PMApprovalCardTone) -> [String: String] {
    var attributes = ["tone": tone.rawValue]
    if let decision = props.decision { attributes["decision"] = decision.rawValue }
    if props.pending != nil {
      attributes["state"] = "loading"
      attributes["busy"] = "true"
    }
    return attributes
  }
}

/// The card's colours: Alert's warning and danger cells while it asks, the
/// page's surface once it is a record.
private struct ApprovalRecipe {
  let wash: PMDynamicColor
  let border: PMDynamicColor
  let glyph: PMDynamicColor

  init(tone: PMApprovalCardTone, decided: Bool, colors c: PMColors) {
    switch (decided, tone) {
    case (true, _): (wash, border, glyph) = (c.bgSurface, c.borderSubtle, c.textMuted)
    case (false, .warning): (wash, border, glyph) = (c.warningSubtle, c.warningBorder, c.warningText)
    case (false, .danger): (wash, border, glyph) = (c.dangerSubtle, c.dangerBorder, c.dangerText)
    }
  }
}

/// ApprovalCard's states, from the spec's States table: asking with details,
/// danger with the app's labels, pending, both decisions, and the title alone.
public struct ApprovalCardStates: PMStates {
  public let member = "ApprovalCard"

  public init() {}

  private static let migrate = "Run the migration against the staging database?"
  private static let migrateDetail =
    "The agent wants to apply three pending migrations. It will run them in order and stop at "
    + "the first failure."
  private static let migrateCommand = "pnpm db:migrate --env staging"
  private static let delete = "Delete the build directory?"

  private func command(_ text: String) -> PMContent {
    AnyView(PMCodeBlock(props: PMCodeBlockProps(children: text)))
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "asking — the question, the details and two answers",
        expect: ["tone": "warning", "label": Self.migrate]
      ) {
        PMApprovalCard(
          props: PMApprovalCardProps(
            children: command(Self.migrateCommand), description: Self.migrateDetail,
            onApprove: {}, onDeny: {}, title: Self.migrate))
      },
      PMStateEntry("danger — something that cannot be undone", expect: ["tone": "danger"]) {
        PMApprovalCard(
          props: PMApprovalCardProps(
            approveLabel: "Delete", children: command("rm -rf dist"), denyLabel: "Keep",
            description: "This removes dist/ and everything under it.", onApprove: {},
            onDeny: {}, title: Self.delete, tone: .danger))
      },
      PMStateEntry(
        "pending — the answer is on its way",
        expect: ["tone": "warning", "state": "loading", "busy": "true"]
      ) {
        PMApprovalCard(
          props: PMApprovalCardProps(
            onApprove: {}, onDeny: {}, pending: .approved, title: Self.migrate))
      },
      PMStateEntry(
        "allowed — the record, the actions gone", expect: ["decision": "approved"]
      ) {
        PMApprovalCard(
          props: PMApprovalCardProps(
            children: command(Self.migrateCommand), decision: .approved, onApprove: {},
            onDeny: {}, title: Self.migrate))
      },
      PMStateEntry("denied", expect: ["decision": "denied", "tone": "danger"]) {
        PMApprovalCard(
          props: PMApprovalCardProps(
            decision: .denied, onApprove: {}, onDeny: {}, title: Self.delete, tone: .danger))
      },
      PMStateEntry(
        "title only — the question is the whole card",
        expect: ["tone": "warning", "label": "Open the pull request in the browser?"]
      ) {
        PMApprovalCard(
          props: PMApprovalCardProps(
            onApprove: {}, onDeny: {}, title: "Open the pull request in the browser?"))
      },
    ]
  }
}
