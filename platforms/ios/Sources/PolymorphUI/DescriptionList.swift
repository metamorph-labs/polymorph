// DescriptionList (`design/components/description-list.md`): term and detail
// pairs that describe one entity, such as a ticket's metadata. Read-only, no
// surface of its own, in the order given. Vertical (the default) stacks each
// term over its detail and works at any width; horizontal puts a term column,
// as wide as its widest term, beside the details, which SwiftUI's `Grid` sizes
// as the web's `max-content 1fr` does. Terms are the overline style and start
// aligned in both. A detail is the app's view: bare text takes the detail
// style, a member inside keeps its own.
//
// Each pair is one element, read as the term then the detail, as a screen
// reader reads a `<dt>` and its `<dd>`; the term is spoken as written, not as
// its uppercase. An empty list draws nothing: the empty message is
// EmptyState's.

import PolymorphTokens
import SwiftUI

public struct PMDescriptionList: PMDescriptionListRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMDescriptionListProps

  public init(props: PMDescriptionListProps) {
    self.props = props
  }

  public var body: some View {
    let orientation = props.orientation ?? .vertical
    let space = theme.defaultDensity.space
    let items = Array(props.items.enumerated())

    if !items.isEmpty {
      Group {
        switch orientation {
        case .vertical:
          VStack(alignment: .leading, spacing: space.s4) {
            ForEach(items, id: \.offset) { _, item in
              VStack(alignment: .leading, spacing: space.s1) {
                term(item.term)
                detail(item.detail)
              }
              .frame(maxWidth: .infinity, alignment: .leading)
              .accessibilityElement(children: .combine)
            }
          }
        case .horizontal:
          Grid(alignment: .topLeading, horizontalSpacing: space.s6, verticalSpacing: space.s3) {
            ForEach(items, id: \.offset) { _, item in
              GridRow {
                term(item.term)
                detail(item.detail)
                  .frame(maxWidth: .infinity, alignment: .leading)
              }
              .accessibilityElement(children: .combine)
            }
          }
        }
      }
      .accessibilityElement(children: .contain)
      .pmMember("DescriptionList", ["orientation": orientation.rawValue, "pairs": String(items.count)])
    }
  }

  private func term(_ text: String) -> some View {
    Text(text)
      .textCase(.uppercase)
      .pmTextStyle(theme.text.xs)
      .foregroundStyle(theme.colors.textSecondary.color)
      .fixedSize(horizontal: false, vertical: true)
      .accessibilityLabel(Text(text))
  }

  private func detail(_ content: PMContent) -> some View {
    content
      .pmTextStyle(theme.text.sm)
      .foregroundStyle(theme.colors.textPrimary.color)
      .multilineTextAlignment(.leading)
      .fixedSize(horizontal: false, vertical: true)
  }
}

/// DescriptionList's states, from the spec's States table. The empty list draws
/// nothing, so it has no entry: the harness holds every entry to drawing.
public struct DescriptionListStates: PMStates {
  public let member = "DescriptionList"

  public init() {}

  private static let pairs = [
    ("Status", "Waiting on customer"), ("Priority", "High"), ("Assignee", "Ada Lovelace"),
    ("Raised", "3 days ago"),
  ]
  private static let waiting = "Waiting"

  private func items() -> [PMDescriptionListItem] {
    Self.pairs.map { PMDescriptionListItem(term: $0.0, detail: AnyView(Text($0.1))) }
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("ticket meta", expect: ["orientation": "vertical", "pairs": "4"]) {
        PMDescriptionList(props: PMDescriptionListProps(items: items()))
      },
      PMStateEntry("horizontal", expect: ["orientation": "horizontal", "pairs": "4"]) {
        PMDescriptionList(props: PMDescriptionListProps(items: items(), orientation: .horizontal))
      },
      PMStateEntry("member detail", expect: ["pairs": "2"]) {
        PMDescriptionList(
          props: PMDescriptionListProps(items: [
            PMDescriptionListItem(
              term: Self.pairs[0].0,
              detail: AnyView(
                PMBadge(props: PMBadgeProps(children: Self.waiting, tone: .warning)))),
            items()[1],
          ]))
      },
      PMStateEntry("single pair", expect: ["pairs": "1"]) {
        PMDescriptionList(props: PMDescriptionListProps(items: [items()[2]]))
      },
    ]
  }
}
