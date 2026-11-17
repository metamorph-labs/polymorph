// Collapsible (`design/components/collapsible.md`): one disclosure, such as
// "Advanced options" under a form. A button of the label and the `down`
// chevron, as wide as its label and flush with the content it discloses, and
// the region it opens. It is an inline control, not document structure: no
// rules, no heading trait, no place in the outline (Accordion is the list of
// sections). The trigger and the region are the disclosure grammar Accordion
// shares (`PMDisclosureTriggerStyle`, `PMDisclosureRegion`), at Collapsible's
// sizes: the small control height, `text.sm` in `text.secondary`, the small
// chevron, a `space-2` gap.
//
// The trigger's value says whether the region is open, as the web's
// `aria-expanded` is announced, and a tap toggles it. The region's content
// gets the reading style, `text.sm` in `text.secondary`, which a member inside
// replaces with its own; the gap above it is inside the animated region, so it
// closes with the content. `open` with `onOpenChange` is the controlled pair;
// without it the disclosure keeps its own state, from `defaultOpen`.

import PolymorphTokens
import SwiftUI

public struct PMCollapsible: PMCollapsibleRendering {
  @Environment(\.pmTheme) private var theme
  @State private var draft: Bool
  private let props: PMCollapsibleProps

  public init(props: PMCollapsibleProps) {
    self.props = props
    _draft = State(initialValue: props.defaultOpen ?? false)
  }

  public var body: some View {
    let open = props.open ?? draft
    let density = theme.defaultDensity
    let recipe = PMDisclosureRecipe(
      minHeight: density.controlHeight.sm, paddingY: 0, gap: density.space.s2,
      text: theme.text.sm, rest: theme.colors.textSecondary, chevron: .sm, fills: false)

    VStack(alignment: .leading, spacing: 0) {
      Button {
        draft = !open
        props.onOpenChange?(!open)
      } label: {
        Text(props.label)
      }
      .buttonStyle(PMDisclosureTriggerStyle(recipe: recipe, open: open))
      .accessibilityLabel(Text(props.label))
      .accessibilityValue(Text(PMStrings.disclosure(open: open)))
      PMDisclosureRegion(open: open) {
        props.children
          .pmTextStyle(theme.text.sm)
          .foregroundStyle(theme.colors.textSecondary.color)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.top, density.space.s3)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .contain)
    .pmMember("Collapsible", ["state": open ? "open" : "closed"])
  }
}

/// Collapsible's states, from the spec's States table.
public struct CollapsibleStates: PMStates {
  public let member = "Collapsible"

  public init() {}

  private static let label = "Advanced options"
  private static let note =
    "Retries back off exponentially from one second, up to five attempts, before the delivery "
    + "is marked failed."

  private static func paragraphs(_ count: Int) -> PMContent {
    PMContent(CollapsibleParagraphs(text: Self.note, count: count))
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("closed", expect: ["state": "closed"]) {
        PMCollapsible(props: PMCollapsibleProps(children: Self.paragraphs(1), label: Self.label))
      },
      PMStateEntry("open", expect: ["state": "open"]) {
        PMCollapsible(
          props: PMCollapsibleProps(
            children: Self.paragraphs(1), defaultOpen: true, label: Self.label))
      },
      PMStateEntry("controlled — the state follows the prop", expect: ["state": "open"]) {
        PMCollapsible(
          props: PMCollapsibleProps(
            children: Self.paragraphs(1), label: Self.label, onOpenChange: { _ in }, open: true))
      },
      PMStateEntry(
        "long content — the trigger keeps its label's width", expect: ["state": "open"]
      ) {
        PMCollapsible(
          props: PMCollapsibleProps(
            children: Self.paragraphs(3), defaultOpen: true, label: Self.label))
      },
    ]
  }
}

/// Body copy for the fixture's regions: `count` paragraphs a `space-3` apart.
private struct CollapsibleParagraphs: View {
  @Environment(\.pmTheme) private var theme
  let text: String
  let count: Int

  var body: some View {
    VStack(alignment: .leading, spacing: theme.defaultDensity.space.s3) {
      ForEach(0..<count, id: \.self) { _ in Text(text) }
    }
  }
}
