// Pagination (`design/components/pagination.md`): numbered page controls for a
// paged list. Always the first and the last page and the current page with its
// siblings; a gap of two or more pages is an ellipsis, a gap of one shows the
// page. The arrows and the numbers are Buttons: ghost, and the current page soft
// accent, because the page's one solid button is its primary action. The row
// wraps, because its length depends on the data. One page or none draws nothing.
//
// Every name the pager speaks is in `messages`; without it the spec's English
// defaults are looked up in the app's string catalog, as a localized web host
// passes its own. A number's visible text stays the digit and its name says
// "Page 3", which contains it.
//
// `disabled` is the app's hold, for while it does something else to the list:
// every control is disabled, the current page too, and the pager is still
// drawn. The current page stays soft accent and selected, so the pager still
// says where the list is.

import PolymorphTokens
import SwiftUI

public struct PMPagination: PMPaginationRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMPaginationProps

  public init(props: PMPaginationProps) {
    self.props = props
  }

  public var body: some View {
    let page = Int(props.page)
    let count = Int(props.pageCount)
    let window = Self.window(page: page, count: count, siblings: props.siblingCount?.rawValue ?? 1)

    if !window.isEmpty {
      PMInline(props: PMInlineProps(children: controls(window, page, count), gap: .s1, wrap: true))
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text(props.label ?? PMStrings.pagination))
        .pmMember("Pagination", Self.attributes(page: page, count: count, held: held))
    }
  }

  /// Whether the app holds the pager.
  private var held: Bool { props.disabled ?? false }

  /// What the root reports: the page, the page count, and `disabled` while the
  /// app holds the pager, as the web's `data-disabled`.
  private static func attributes(page: Int, count: Int, held: Bool) -> [String: String] {
    var attributes = ["page": String(page), "pages": String(count)]
    if held { attributes["disabled"] = "true" }
    return attributes
  }

  /// The arrows and the window, as the Inline's children.
  private func controls(_ window: [Int?], _ page: Int, _ count: Int) -> PMContent {
    let messages = props.messages ?? PMStrings.paginationMessages
    let previous = PMButtonProps(
      disabled: held || page <= 1, icon: .previous, iconOnly: true, label: messages.previous,
      onClick: { props.onPageChange(Double(page - 1)) }, size: .sm, appearance: .ghostNeutral)
    let next = PMButtonProps(
      disabled: held || page >= count, icon: .next, iconOnly: true, label: messages.next,
      onClick: { props.onPageChange(Double(page + 1)) }, size: .sm, appearance: .ghostNeutral)
    return AnyView(
      Group {
        PMButton(props: previous)
        ForEach(Array(window.enumerated()), id: \.offset) { _, entry in
          item(entry, page: page, messages: messages)
        }
        PMButton(props: next)
      })
  }

  /// A page's button, or the ellipsis for pages not offered: nothing to act
  /// on, so nothing to read.
  @ViewBuilder
  private func item(_ entry: Int?, page: Int, messages: PMPaginationMessages) -> some View {
    if let entry {
      let current = entry == page
      let open = opener(entry, current: current)
      let appearance: PMButtonAppearance = current ? .softAccent : .ghostNeutral
      // A held pager disables the current page with the others, so no control
      // looks pressable.
      PMButton(
        props: PMButtonProps(
          ariaLabel: messages.page(Double(entry)), current: current, disabled: held,
          label: String(entry), onClick: open, size: .sm, appearance: appearance))
    } else {
      Text(verbatim: "…")
        .pmTextStyle(theme.text.sm)
        .foregroundStyle(theme.colors.textMuted.color)
        .frame(minWidth: theme.defaultDensity.controlHeight.sm)
        .accessibilityHidden(true)
    }
  }

  /// A page button's action: none for the current page.
  private func opener(_ entry: Int, current: Bool) -> (@MainActor () -> Void)? {
    guard !current else { return nil }
    let change = props.onPageChange
    return { change(Double(entry)) }
  }

  /// The visible pages, `nil` for an ellipsis: the first, the last and
  /// `page ± siblings`, a gap of one page shown and a longer gap collapsed, as
  /// the web's `paginationWindow` computes it.
  static func window(page: Int, count: Int, siblings: Int) -> [Int?] {
    guard count > 1 else { return [] }
    var wanted: Set<Int> = [1, count]
    for offset in -siblings...siblings where (1...count).contains(page + offset) {
      wanted.insert(page + offset)
    }
    var out: [Int?] = []
    var previous: Int?
    for value in wanted.sorted() {
      if let previous, value - previous > 1 {
        out.append(value - previous == 2 ? previous + 1 : nil)
      }
      out.append(value)
      previous = value
    }
    return out
  }
}

/// Pagination's states, from the spec: five pages at the first, the middle and
/// the last, twelve pages in the middle (an ellipsis each side), two pages, and
/// a pager the app holds. One page draws nothing, so it has no entry: the
/// harness holds every entry to drawing.
public struct PaginationStates: PMStates {
  public let member = "Pagination"

  public init() {}

  private func pager(_ page: Double, of count: Double, disabled: Bool? = nil) -> PMPagination {
    PMPagination(
      props: PMPaginationProps(
        disabled: disabled, onPageChange: { _ in }, page: page, pageCount: count))
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("five pages at 1", expect: ["page": "1", "pages": "5"]) { pager(1, of: 5) },
      PMStateEntry("five pages at 3", expect: ["page": "3", "pages": "5"]) { pager(3, of: 5) },
      PMStateEntry("five pages at 5", expect: ["page": "5", "pages": "5"]) { pager(5, of: 5) },
      PMStateEntry("twelve pages at 6", expect: ["page": "6", "pages": "12"]) {
        pager(6, of: 12)
      },
      PMStateEntry("two pages", expect: ["page": "1", "pages": "2"]) { pager(1, of: 2) },
      PMStateEntry(
        "held by the app — no page can be asked for", expect: ["page": "3", "disabled": "true"]
      ) {
        pager(3, of: 5, disabled: true)
      },
    ]
  }
}
