// ReasoningDisclosure (`design/components/reasoning-disclosure.md`): a model's
// reasoning behind one trigger, labelled in the app's words ("Thinking…",
// "Thought for 12 seconds"). It is Collapsible with a status, drawn in the same
// disclosure grammar (`PMDisclosureTriggerStyle`, `PMDisclosureRegion`) at
// Collapsible's sizes exactly: the small control height, `text.sm` in
// `text.secondary`, the small chevron, a `space-2` gap, colour-only hover. The
// one addition to the trigger is a leading mark in `text.muted`: the
// `reasoning` glyph, or while the model reasons the `loading` glyph on the
// `spin` loop (`PMSpinGlyph`, Button's spinner, still under Reduce Motion and
// at the `none` temperament). The label stays the app's: the member never
// writes a verb or a duration.
//
// The region holds the reasoning (a Markdown or a StreamingText at `sm`, which
// set their own type) `space-3` below the trigger, inside the animated region
// so the gap closes with it, `space-2` in from the leading edge and behind
// Markdown's quote rule (`pmQuoteRule`), so quoting and thinking share one
// quieter style. It opens and closes as Collapsible's does.
//
// The trigger is a button, not a heading: a disclosure inside a reply is not an
// outline entry. Its value says whether the region is open, as the web's
// `aria-expanded` is announced. The web's `aria-busy` has no counterpart on
// iOS; the label says the model is still thinking, the reasoning inside reads
// as it now is, and the root carries `streaming` and `busy` as attributes. A
// closed region is hidden from assistive technology and from touches. `open`
// with `onOpenChange` is the controlled pair; without it the disclosure keeps
// its own state, from `defaultOpen`, closed by default.

import PolymorphTokens
import SwiftUI

public struct PMReasoningDisclosure: PMReasoningDisclosureRendering {
  @Environment(\.pmTheme) private var theme
  @State private var draft: Bool
  private let props: PMReasoningDisclosureProps

  public init(props: PMReasoningDisclosureProps) {
    self.props = props
    _draft = State(initialValue: props.defaultOpen ?? false)
  }

  public var body: some View {
    let open = props.open ?? draft
    let streaming = props.streaming ?? false
    let density = theme.defaultDensity
    let recipe = PMDisclosureRecipe(
      minHeight: density.controlHeight.sm, paddingY: 0, gap: density.space.s2,
      text: theme.text.sm, rest: theme.colors.textSecondary, chevron: .sm, fills: false)

    VStack(alignment: .leading, spacing: 0) {
      Button {
        draft = !open
        props.onOpenChange?(!open)
      } label: {
        HStack(spacing: density.space.s2) {
          Group {
            if streaming {
              PMSpinGlyph(controlSize: .sm)
            } else {
              PMIconView(.reasoning, size: .sm)
            }
          }
          .foregroundStyle(theme.colors.textMuted.color)
          Text(props.label)
        }
      }
      .buttonStyle(PMDisclosureTriggerStyle(recipe: recipe, open: open))
      .accessibilityLabel(Text(props.label))
      .accessibilityValue(Text(PMStrings.disclosure(open: open)))
      PMDisclosureRegion(open: open) {
        props.children
          .frame(maxWidth: .infinity, alignment: .leading)
          .pmQuoteRule()
          .padding(.leading, density.space.s2)
          .padding(.top, density.space.s3)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .contain)
    .pmMember("ReasoningDisclosure", attributes(open: open, streaming: streaming))
  }

  /// Radix's `data-state`, and the web's `data-streaming` and `aria-busy`.
  private func attributes(open: Bool, streaming: Bool) -> [String: String] {
    var found = ["state": open ? "open" : "closed"]
    if streaming {
      found["streaming"] = "true"
      found["busy"] = "true"
    }
    return found
  }
}

/// ReasoningDisclosure's states, from the spec's States table.
public struct ReasoningDisclosureStates: PMStates {
  public let member = "ReasoningDisclosure"

  public init() {}

  private static let reasoning = """
    The question is about *retries*, not first attempts, so the relevant setting is the backoff cap.

    - The docs say five attempts with exponential backoff.
    - The incident on the 14th was about duplicate promo codes, which the idempotency key now prevents.

    So the answer should lead with the key, then the schedule.
    """

  private static func markdown() -> PMContent {
    AnyView(PMMarkdown(props: PMMarkdownProps(children: Self.reasoning, size: .sm)))
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "closed — the working is there for whoever wants it", expect: ["state": "closed"]
      ) {
        PMReasoningDisclosure(
          props: PMReasoningDisclosureProps(
            children: Self.markdown(), label: "Thought for 12 seconds"))
      },
      PMStateEntry("open", expect: ["state": "open"]) {
        PMReasoningDisclosure(
          props: PMReasoningDisclosureProps(
            children: Self.markdown(), defaultOpen: true, label: "Thought for 12 seconds"))
      },
      PMStateEntry(
        "thinking — the mark spins, the root is busy",
        expect: ["state": "open", "streaming": "true", "busy": "true"]
      ) {
        PMReasoningDisclosure(
          props: PMReasoningDisclosureProps(
            children: AnyView(
              PMStreamingText(
                props: PMStreamingTextProps(
                  children: String(Self.reasoning.prefix(110)), size: .sm, streaming: true))),
            defaultOpen: true, label: "Thinking…", streaming: true))
      },
      PMStateEntry("controlled — state follows the prop", expect: ["state": "open"]) {
        PMReasoningDisclosure(
          props: PMReasoningDisclosureProps(
            children: Self.markdown(), label: "Thought for 4 seconds", onOpenChange: { _ in },
            open: true))
      },
    ]
  }
}
