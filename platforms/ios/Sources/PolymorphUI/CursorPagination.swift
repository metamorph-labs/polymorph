// CursorPagination (`design/components/cursor-pagination.md`): previous and
// next for a list paged by cursor, which says whether there is more but never
// how much. It is not Pagination: there are no page numbers and no current
// page, because no count exists. The two controls are `ghost`/`neutral`/`sm`
// Buttons with visible labels, the previous one with the `previous` glyph
// before its label and the next one with `next` after it, in a wrapping Inline
// with `space.2` between; the app's `position` sits between them in `text.sm`,
// muted, with tabular figures so "26–50" becoming "51–75" does not move the
// arrows. A direction without a cursor is disabled. One window (neither
// direction, nothing pending) draws nothing.
//
// While `pending`, the direction the person pressed shows Button's busy state
// and the other is disabled, so a slow fetch cannot be followed by a request
// for another window; the pager remembers which it was, because the app only
// says that a request is in flight. The position is announced politely when it
// changes, as the web's `aria-live="polite"`. Every name the pager speaks is
// in `label` and `messages`; without them the spec's English defaults are
// looked up in the app's string catalog.
//
// `disabled` is the app's hold, for while it does something else to the list:
// every control is disabled and none shows busy, and the pager is still drawn.
// While a window is also in flight it adds nothing, because the pressed
// direction is busy, which is not disabled, and the other is disabled already.
//
// The append form (`mode: .append`) is "Load more": one `outline`/`neutral`/
// `sm` Button, `messages.more`, after the position, that asks for the next
// window, which the app adds below the ones shown. It is busy while a window is
// in flight. It remembers that it asked for a window and never reads
// `hasPrevious`, so an app passes its query library's flags as they are. When
// `hasNext` turns false after a press, with nothing in flight, the list has run
// out: the action leaves and the end line, a line of its own under the row,
// says `messages.end` in the position's type, announced politely as the web's
// status region announces it. A form that has not asked draws nothing without a
// next window, because the list never paged. Focus is not moved when the action
// leaves, as on the web. A debug build warns, as the web does in development,
// when the append form is drawn with `messages` that leave out `more` or `end`:
// those two would be the spec's English beside the app's words.

import PolymorphTokens
import SwiftUI

public struct PMCursorPagination: PMCursorPaginationRendering {
  @Environment(\.pmTheme) private var theme
  @State private var asked: Direction?
  /// The append form has asked for a window, so the list has paged and a
  /// missing next window means it ran out. The member's own memory: the app
  /// never says how many windows are on screen.
  @State private var paged: Bool
  private let props: PMCursorPaginationProps

  public init(props: PMCursorPaginationProps) {
    self.init(props: props, paged: false)
  }

  /// A pager that has already asked for a window, as one the person has
  /// pressed: the states fixture's way to draw the list running out, which a
  /// render cannot press for.
  init(props: PMCursorPaginationProps, paged: Bool) {
    self.props = props
    _paged = State(initialValue: paged)
  }

  public var body: some View {
    let pending = props.pending ?? false
    let held = props.disabled ?? false
    let append = props.mode == .append
    // The append form's list has run out: it asked for a window, and there is
    // no next one and none in flight.
    let ended = append && paged && !props.hasNext && !pending
    // One window draws nothing; the append form stays once it has asked, to
    // say the list ran out.
    let drawn =
      append ? props.hasNext || pending || paged : props.hasPrevious || props.hasNext || pending

    if drawn {
      VStack(alignment: .leading, spacing: 0) {
        PMInline(
          props: PMInlineProps(
            align: .center, children: append ? more(pending, ended: ended) : controls(pending),
            gap: .s2, wrap: true))
        // Under the row: beside the position, two muted texts read as one phrase.
        if ended {
          Text(words.end)
            .pmTextStyle(theme.text.sm)
            .foregroundStyle(theme.colors.textMuted.color)
        }
      }
      .accessibilityElement(children: .contain)
      .accessibilityLabel(Text(props.label ?? PMStrings.pagination))
      .pmMember("CursorPagination", Self.attributes(pending: pending, held: held))
      .pmLiveAnnouncement(props.position, assertive: false)
      .pmLiveAnnouncement(ended ? words.end : nil, assertive: false)
      // The pressed direction is forgotten once the window arrives.
      .onChange(of: pending) { if !pending { asked = nil } }
      .onChange(of: mixesLanguages, initial: true) { _, mixes in
        if mixes { Self.warnMixedLanguages() }
      }
    }
  }

  /// What the root reports: `pending` while a window is in flight and
  /// `disabled` while the app holds the pager, as the web's `data-pending` and
  /// `data-disabled`.
  private static func attributes(pending: Bool, held: Bool) -> [String: String] {
    var attributes: [String: String] = [:]
    if pending { attributes["pending"] = "true" }
    if held { attributes["disabled"] = "true" }
    return attributes
  }

  /// Whether the append form draws the app's words beside the spec's English:
  /// `messages` without `more` or `end`.
  private var mixesLanguages: Bool {
    guard props.mode == .append, let messages = props.messages else { return false }
    return messages.more == nil || messages.end == nil
  }

  /// The web's development warning for that, in a debug build only.
  private static func warnMixedLanguages() {
    #if DEBUG
      print(
        "polymorph: CursorPagination: the append form shows `messages.more` and "
          + "`messages.end`; pass them with the others, so one control never mixes two languages.")
    #endif
  }

  /// The append form's two words: the app's where it gives them, the spec's
  /// defaults otherwise. The defaults' record fills every field, so the last
  /// fallback is never read.
  private var words: (more: String, end: String) {
    let defaults = PMStrings.cursorPaginationMessages
    return (
      props.messages?.more ?? defaults.more ?? defaults.next,
      props.messages?.end ?? defaults.end ?? defaults.next
    )
  }

  /// The append form's row: the position, then the action while there is more
  /// or a window is in flight.
  private func more(_ pending: Bool, ended: Bool) -> PMContent {
    // A busy action is not disabled, so it keeps its focus through a hold.
    let action = PMButtonProps(
      disabled: (props.disabled ?? false) && !pending, label: words.more, loading: pending,
      onClick: go(.next), size: .sm, appearance: .outlineNeutral)
    return AnyView(
      Group {
        if let position = props.position {
          Text(position)
            .pmTextStyle(theme.text.sm)
            .pmTabularFigures(theme.numeric.tabular)
            .foregroundStyle(theme.colors.textMuted.color)
        }
        if !ended {
          PMButton(props: action)
        }
      })
  }

  /// The two Buttons and the position between them, as the Inline's children.
  private func controls(_ pending: Bool) -> PMContent {
    let messages = props.messages ?? PMStrings.cursorPaginationMessages
    let held = props.disabled ?? false
    let previous = PMButtonProps(
      disabled: !props.hasPrevious || (pending ? asked != .previous : held), icon: .previous,
      label: messages.previous, loading: pending && asked == .previous,
      onClick: go(.previous), size: .sm, appearance: .ghostNeutral)
    let next = PMButtonProps(
      disabled: !props.hasNext || (pending ? asked != .next : held), label: messages.next,
      loading: pending && asked == .next, onClick: go(.next), size: .sm,
      appearance: .ghostNeutral, trailingIcon: .next)
    return AnyView(
      Group {
        PMButton(props: previous)
        if let position = props.position {
          Text(position)
            .pmTextStyle(theme.text.sm)
            .pmTabularFigures(theme.numeric.tabular)
            .foregroundStyle(theme.colors.textMuted.color)
        }
        PMButton(props: next)
      })
  }

  /// Remembers the direction, then asks the app for that window.
  private func go(_ direction: Direction) -> @MainActor () -> Void {
    let previous = props.onPrevious
    let next = props.onNext
    return {
      asked = direction
      switch direction {
      case .previous: previous?()
      case .next:
        paged = true
        next()
      }
    }
  }

  /// The direction the person pressed.
  private enum Direction {
    case previous, next
  }
}

/// CursorPagination's states, from the spec's States table. One window draws
/// nothing, in either form, so it has no entry: the harness holds every entry
/// to drawing.
public struct CursorPaginationStates: PMStates {
  public let member = "CursorPagination"

  public init() {}

  private static let window = "26–50"
  private static let french = "Pagination des événements"
  private static let messages = PMCursorPaginationMessages(previous: "Précédent", next: "Suivant")
  private static let shown = "50 shown"
  private static let all = "120 shown"

  private func pager(
    previous: Bool, next: Bool, position: String? = nil, pending: Bool? = nil,
    disabled: Bool? = nil
  ) -> PMCursorPagination {
    PMCursorPagination(
      props: PMCursorPaginationProps(
        disabled: disabled, hasNext: next, hasPrevious: previous, onNext: {}, onPrevious: {},
        pending: pending, position: position))
  }

  /// The append form, which never reads `hasPrevious`, so every entry passes
  /// `false`, as a forward feed's query library does.
  private func more(
    next: Bool, position: String? = nil, pending: Bool? = nil, disabled: Bool? = nil,
    paged: Bool = false
  ) -> PMCursorPagination {
    PMCursorPagination(
      props: PMCursorPaginationProps(
        disabled: disabled, hasNext: next, hasPrevious: false, mode: .append, onNext: {},
        pending: pending, position: position),
      paged: paged)
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("the first window — nothing behind it", expect: ["label": "Pagination"]) {
        pager(previous: false, next: true)
      },
      PMStateEntry("a middle window") {
        pager(previous: true, next: true)
      },
      PMStateEntry("the last window — nothing ahead of it") {
        pager(previous: true, next: false)
      },
      PMStateEntry("with a position, in the app’s words") {
        pager(previous: true, next: true, position: Self.window)
      },
      PMStateEntry("pending — a window is in flight", expect: ["pending": "true"]) {
        pager(previous: true, next: true, position: Self.window, pending: true)
      },
      PMStateEntry(
        "held by the app — neither direction can be pressed", expect: ["disabled": "true"]
      ) {
        pager(previous: true, next: true, position: Self.window, disabled: true)
      },
      PMStateEntry("localized", expect: ["label": Self.french]) {
        PMCursorPagination(
          props: PMCursorPaginationProps(
            hasNext: true, hasPrevious: true, label: Self.french, messages: Self.messages,
            onNext: {}, onPrevious: {}))
      },
      PMStateEntry("append — more to load") {
        more(next: true)
      },
      PMStateEntry("append — with a position") {
        more(next: true, position: Self.shown)
      },
      PMStateEntry("append — a window is in flight", expect: ["pending": "true"]) {
        more(next: true, position: Self.shown, pending: true)
      },
      PMStateEntry("append — held by the app", expect: ["disabled": "true"]) {
        more(next: true, position: Self.shown, disabled: true)
      },
      // Pressed once already, and the window that answered has no next one.
      PMStateEntry("append — the list ran out") {
        more(next: false, position: Self.all, paged: true)
      },
    ]
  }
}
