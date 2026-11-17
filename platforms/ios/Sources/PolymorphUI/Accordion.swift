// Accordion (`design/components/accordion.md`): a list of sections a reader
// opens one or several at a time. One treatment, ruled: a `border.subtle`
// hairline under every item and over the first, a full-width trigger of the
// label in `text.md` and the `down` chevron at its end, and the region it
// opens. The trigger and the region are the disclosure grammar Collapsible
// shares (`PMDisclosureTriggerStyle`, `PMDisclosureRegion`), at Accordion's
// sizes: the large control height, `space-3` above and below the label, the
// `md` chevron. Hover is colour only, because a wash on one ruled row would
// read as a selection.
//
// Each trigger is a heading, as the web's `<h3>` is, at `headingLevel` (3 by
// default), so the sections are document structure and a reader can move
// between them by heading; its value says whether its section is open, as
// `aria-expanded` is announced. A disabled item's trigger is dimmed and cannot
// be pressed.
//
// `type: .single` (the default) keeps one item open; with `collapsible` (true
// by default) the open item closes again on a second press. `.multiple` opens
// any number. The value is a `PMChoiceValue`: `.single` with the open item's
// value, or `""` when none is open, as Radix reports it, and `.multiple` with
// the open values in the items' order. A value of the other case is read as
// its nearest: a single value as a list of one, a list's first value as the
// single one. `value` with `onValueChange` is the controlled pair.

import PolymorphTokens
import SwiftUI

public struct PMAccordion: PMAccordionRendering {
  @Environment(\.pmTheme) private var theme
  @State private var draft: [String]
  private let props: PMAccordionProps

  public init(props: PMAccordionProps) {
    self.props = props
    _draft = State(initialValue: Self.values(props.defaultValue))
  }

  public var body: some View {
    let open = shown
    let density = theme.defaultDensity
    let recipe = PMDisclosureRecipe(
      minHeight: density.controlHeight.lg, paddingY: density.space.s3, gap: density.space.s3,
      text: theme.text.md, rest: theme.colors.textPrimary, chevron: .md, fills: true)

    VStack(alignment: .leading, spacing: 0) {
      PMRule(theme.colors.borderSubtle)
      ForEach(props.items, id: \.value) { item in
        let expanded = open.contains(item.value)
        VStack(alignment: .leading, spacing: 0) {
          Button {
            toggle(item.value)
          } label: {
            Text(item.label)
          }
          .buttonStyle(PMDisclosureTriggerStyle(recipe: recipe, open: expanded))
          .disabled(item.disabled ?? false)
          .accessibilityLabel(Text(item.label))
          .accessibilityValue(Text(PMStrings.disclosure(open: expanded)))
          .accessibilityAddTraits(.isHeader)
          .accessibilityHeading(props.headingLevel == .headingLevel4 ? .h4 : .h3)
          PMDisclosureRegion(open: expanded) {
            item.content
              .pmTextStyle(theme.text.sm)
              .foregroundStyle(theme.colors.textSecondary.color)
              .frame(maxWidth: .infinity, alignment: .leading)
              .padding(.bottom, density.space.s4)
          }
          PMRule(theme.colors.borderSubtle)
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .contain)
    .pmMember("Accordion", attributes(open))
  }

  private var multiple: Bool { props.type == .multiple }

  /// The open values: the controlled `value` when given, otherwise the
  /// accordion's own, each in the items' order.
  private var shown: [String] {
    let values = props.value.map(Self.values) ?? draft
    let open = props.items.map(\.value).filter(values.contains)
    return multiple ? open : Array(open.prefix(1))
  }

  private func toggle(_ value: String) {
    let open = shown
    var next: [String]
    if multiple {
      next = open.contains(value) ? open.filter { $0 != value } : open + [value]
      next = props.items.map(\.value).filter(next.contains)
    } else if open.contains(value) {
      // The open item closes again only when the accordion is collapsible.
      guard props.collapsible ?? true else { return }
      next = []
    } else {
      next = [value]
    }
    draft = next
    props.onValueChange?(multiple ? .multiple(next) : .single(next.first ?? ""))
  }

  /// The open values a `PMChoiceValue` names; `""` is none.
  private static func values(_ value: PMChoiceValue?) -> [String] {
    switch value {
    case .single(let one): one.isEmpty ? [] : [one]
    case .multiple(let many): many
    case nil: []
    }
  }

  private func attributes(_ open: [String]) -> [String: String] {
    var attributes = [
      "type": (props.type ?? .single).rawValue, "orientation": "vertical",
      "open": String(open.count),
    ]
    if props.items.contains(where: { $0.disabled == true }) { attributes["disabled"] = "true" }
    return attributes
  }
}

/// Accordion's states, from the spec's States table.
public struct AccordionStates: PMStates {
  public let member = "Accordion"

  public init() {}

  private static let shipping = [
    PMAccordionItem(
      value: "delivery", label: "When will my order arrive?",
      content: copy(
        "Two to four working days, and you get a tracking link the moment it ships.")),
    PMAccordionItem(
      value: "returns", label: "How do returns work?",
      content: copy("Thirty days, no reason needed. The label is in the box.")),
    PMAccordionItem(
      value: "sizing", label: "Do these run large or small?",
      content: copy(
        "True to size. The one exception is the wide fit, which runs half a size up.")),
  ]

  private static let policy =
    "Refunds go back to the card you paid with. Most banks show them within five working days, "
    + "some take ten. A refund for a gift goes to the person who bought it, never to the "
    + "address it was sent to, and a partial return refunds the items you send back with their "
    + "share of any discount."

  private static func copy(_ text: String) -> PMContent {
    PMContent(Text(text))
  }

  public var entries: [PMStateEntry] {
    let disabled = Self.shipping.map { item in
      PMAccordionItem(
        value: item.value, label: item.label, content: item.content,
        disabled: item.value == "returns")
    }
    let long = [
      PMAccordionItem(value: "refunds", label: "How are refunds paid?", content: Self.copy(Self.policy))
    ] + Self.shipping.dropFirst()
    return [
      PMStateEntry("single, first open", expect: ["type": "single", "open": "1"]) {
        PMAccordion(props: PMAccordionProps(defaultValue: .single("delivery"), items: Self.shipping))
      },
      PMStateEntry("single, all closed", expect: ["type": "single", "open": "0"]) {
        PMAccordion(props: PMAccordionProps(collapsible: true, items: Self.shipping))
      },
      PMStateEntry("multiple, two open", expect: ["type": "multiple", "open": "2"]) {
        PMAccordion(
          props: PMAccordionProps(
            defaultValue: .multiple(["delivery", "sizing"]), items: Self.shipping, type: .multiple
          ))
      },
      PMStateEntry("disabled item", expect: ["disabled": "true", "open": "1"]) {
        PMAccordion(props: PMAccordionProps(defaultValue: .single("delivery"), items: disabled))
      },
      PMStateEntry("long content", expect: ["open": "1"]) {
        PMAccordion(props: PMAccordionProps(defaultValue: .single("refunds"), items: long))
      },
      PMStateEntry("heading level 4", expect: ["open": "0"]) {
        PMAccordion(props: PMAccordionProps(headingLevel: .headingLevel4, items: Self.shipping))
      },
    ]
  }
}
