// Combobox (`design/components/combobox.md`), adapted on iOS: one value
// chosen from a list by typing to filter it. iOS has no combobox, so the
// field is Input's container showing the chosen option's label (or the
// placeholder, muted), the clear button when `clearable` and something is
// chosen, and the `expand` chevron, or the spinning `loading` glyph while the
// list loads. A tap opens the list: as a sheet on iPhone and a popover at the
// field on iPad (`presentation: .popover` keeps the popover on iPhone too),
// with a search field at its top, focused, that filters the options as the
// person types, in their locale, ignoring case and accents (`filter`:
// `contains` by default, `startsWith`, or `off` when the app has filtered).
//
// The list is Select's rows with Combobox's second line (`PMOptionList`): the
// chosen option's check, a disabled option dimmed, three Skeleton rows while
// `loading`, after the options when a page is loading, and `emptyMessage` when
// nothing matches. Choosing an option closes the list and reports it;
// choosing the chosen one again changes nothing. Return in the search field
// chooses the first enabled match, or, with `allowsCustomValue`, keeps the
// typed text as the field's text with no option chosen, reported as `nil`
// through `onChange` and the text through `onInputChange`. The search text is
// the controlled `inputValue` when given; closing the list clears it, reported
// through `onInputChange`, unless it is the kept custom text, so the list opens
// unfiltered. `onLoadMore` asks for the next page when the last row appears, at
// most once per length of `options`. Clearing reports `nil`. `onBlur` fires
// when the list closes.
//
// The field is a button named by `ariaLabel` or its FormField's label, its
// value the chosen label, and its hint "Invalid" first while invalid; the
// clear button and the chevron are named by `messages` (English defaults).
// The list's loading and its count are announced. `name`, `id` and the
// `aria-*by` ids have no SwiftUI counterpart.

import PolymorphTokens
import SwiftUI

public struct PMCombobox: PMComboboxRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmField) private var field
  @State private var draft: String?
  @State private var typed: String
  @State private var custom: String?
  @State private var presented: Bool
  private let props: PMComboboxProps

  public init(props: PMComboboxProps) {
    self.props = props
    _draft = State(initialValue: props.defaultValue ?? nil)
    _typed = State(initialValue: "")
    _presented = State(initialValue: props.defaultOpen ?? false)
  }

  public var body: some View {
    let size = props.size ?? .md
    let disabled = props.disabled ?? false
    let invalid = (props.invalid ?? false) || (field?.invalid ?? false)
    let shown = shownText

    PMChoiceField(
      text: shown ?? props.placeholder ?? "", placeholder: shown == nil, size: size,
      invalid: invalid, disabled: disabled, open: presented, loading: props.loading ?? false,
      name: name ?? props.placeholder ?? "", value: shown ?? "", hint: field?.hint,
      clearLabel: (props.clearable ?? false) && shown != nil && !disabled
        ? PMStrings.combobox(props.messages).clear : nil,
      chevronLabel: PMStrings.combobox(props.messages).showOptions,
      onOpen: { setOpen(true) }, onClear: clear
    )
    .modifier(
      PMAnchoredPresentation(
        isPresented: Binding(get: { presented }, set: setOpen),
        compact: props.presentation == .popover ? .popover : .sheet,
        anchor: .point(.bottomLeading), edge: .top, scrolls: false
      ) {
        Self.list(
          props, query: query, current: current, framed: false, choose: choose, submit: submit)
      }
    )
    .pmFocusWhenNamed()
    .pmMember("Combobox", attributes(size, invalid: invalid, disabled: disabled))
    .preference(key: PMFieldControlKey.self, value: PMFieldControl(disabled: disabled))
  }

  /// The list, as the presentation shows it, or drawn in place for the states fixture.
  static func list(
    _ props: PMComboboxProps, query: Binding<String>, current: String?, framed: Bool,
    choose: @escaping @MainActor (String) -> Void, submit: @escaping @MainActor () -> Void
  ) -> some View {
    PMOptionList(
      member: "Combobox", query: query,
      searchLabel: props.ariaLabel ?? props.placeholder ?? PMStrings.search,
      options: filtered(props, query: query.wrappedValue, current: current),
      loading: props.loading ?? false, emptyMessage: props.emptyMessage ?? PMStrings.comboboxEmptyMessage,
      loadingMessage: PMStrings.combobox(props.messages).loadingOptions,
      countMessage: PMStrings.combobox(props.messages).options, onLoadMore: props.onLoadMore,
      onSelect: choose, onSubmit: submit, framed: framed)
  }

  /// The options that match `query`, each marked chosen or not.
  static func filtered(_ props: PMComboboxProps, query: String, current: String?)
    -> [PMOptionItem]
  {
    props.options
      .filter { PMOptionItem.matches($0.label, query, props.filter) }
      .map {
        PMOptionItem(
          value: $0.value, label: $0.label, description: $0.description,
          disabled: $0.disabled ?? false, checked: $0.value == current)
      }
  }

  /// The chosen value: the controlled `value` when given (`nil` inside it is
  /// none), otherwise the field's own.
  private var current: String? {
    props.value ?? draft
  }

  /// What the field shows: the chosen option's label, or the kept custom text.
  private var shownText: String? {
    if let current, let option = props.options.first(where: { $0.value == current }) {
      return option.label
    }
    if props.allowsCustomValue == true, let text = props.inputValue ?? custom, !text.isEmpty {
      return text
    }
    return nil
  }

  private var query: Binding<String> {
    Binding {
      props.inputValue ?? typed
    } set: { next in
      typed = next
      props.onInputChange?(next)
    }
  }

  private var filtered: [PMOptionItem] {
    Self.filtered(props, query: query.wrappedValue, current: current)
  }

  private func choose(_ value: String) {
    custom = nil
    if value != current {
      draft = value
      props.onChange?(value)
    }
    setOpen(false)
  }

  /// Return in the search field: the first enabled match, or the typed text
  /// kept when custom values are allowed and nothing matches.
  private func submit() {
    if let first = filtered.first(where: { !$0.disabled }) {
      choose(first.value)
    } else if props.allowsCustomValue == true, !query.wrappedValue.isEmpty {
      custom = query.wrappedValue
      if current != nil {
        draft = nil
        props.onChange?(nil)
      }
      setOpen(false)
    }
  }

  private func clear() {
    custom = nil
    query.wrappedValue = ""
    draft = nil
    props.onChange?(nil)
  }

  /// Opens or closes the list. Closing clears the search text, so the list
  /// opens unfiltered next time, unless it is the custom value the field shows.
  private func setOpen(_ open: Bool) {
    guard open != presented else { return }
    presented = open
    guard !open else { return }
    if custom == nil, !query.wrappedValue.isEmpty { query.wrappedValue = "" }
    props.onBlur?()
  }

  private var name: String? {
    props.ariaLabel ?? field?.label
  }

  private func attributes(_ size: PMControlSize, invalid: Bool, disabled: Bool)
    -> [String: String]
  {
    var attributes = ["size": size.rawValue, "state": presented ? "open" : "closed"]
    if invalid { attributes["invalid"] = "true" }
    if disabled { attributes["disabled"] = "true" }
    if props.loading == true { attributes["loading"] = "true" }
    if shownText == nil { attributes["placeholder"] = "true" }
    return attributes
  }
}

/// Combobox's states, from the spec's States table. The open rows draw the
/// field and, under it, the list the presentation shows, because the harness
/// renders no presentation.
public struct ComboboxStates: PMStates {
  public let member = "Combobox"

  public init() {}

  static let team = [
    PMComboboxOption(value: "ana", label: "Ana Ruiz"),
    PMComboboxOption(value: "ben", label: "Ben Okafor"),
    PMComboboxOption(value: "chloe", label: "Chloé Martin"),
    PMComboboxOption(value: "dev", label: "Dev Patel", disabled: true),
    PMComboboxOption(value: "eli", label: "Eli Stone"),
  ]

  static let described = [
    PMComboboxOption(value: "billing", label: "Billing", description: "Invoices, refunds, plans"),
    PMComboboxOption(value: "access", label: "Access", description: "Sign-in, SSO, passwords"),
  ]

  private static func open(_ props: PMComboboxProps) -> some View {
    ComboboxOpen(props: props)
  }

  public var entries: [PMStateEntry] {
    let sizes = [PMControlSize.sm, .lg].map { size in
      PMStateEntry("size \(size.rawValue)", expect: ["size": size.rawValue]) {
        PMCombobox(
          props: PMComboboxProps(
            ariaLabel: "Assignee", defaultValue: "ana", options: Self.team, size: size))
      }
    }
    return [
      PMStateEntry("closed rest", expect: ["state": "closed", "placeholder": "true"]) {
        PMCombobox(
          props: PMComboboxProps(
            ariaLabel: "Assignee", options: Self.team, placeholder: "Search the team…"))
      },
      PMStateEntry("with value", expect: ["state": "closed", "placeholder": ""]) {
        PMCombobox(props: PMComboboxProps(ariaLabel: "Assignee", defaultValue: "ben", options: Self.team))
      },
    ] + sizes + [
      PMStateEntry(
        "open filtered",
        expect: [
          "state": "open",
          "contains": "Combobox[part=list options=4],Combobox[part=option value=ben]",
        ]
      ) {
        Self.open(
          PMComboboxProps(
            ariaLabel: "Assignee", inputValue: "e", options: Self.team,
            placeholder: "Search the team…"))
      },
      PMStateEntry(
        "open with selection — its check",
        expect: ["state": "open", "contains": "Combobox[part=option value=chloe checked=true]"]
      ) {
        Self.open(PMComboboxProps(ariaLabel: "Assignee", defaultValue: "chloe", options: Self.team))
      },
      PMStateEntry(
        "loading — skeleton rows",
        expect: ["state": "open", "contains": "Combobox[part=list options=0 loading=true]"]
      ) {
        Self.open(PMComboboxProps(ariaLabel: "Assignee", loading: true, options: []))
      },
      PMStateEntry(
        "empty results — one line",
        expect: ["state": "open", "contains": "Combobox[part=list options=0 loading=]"]
      ) {
        Self.open(PMComboboxProps(ariaLabel: "Assignee", inputValue: "zed", options: Self.team))
      },
      PMStateEntry(
        "descriptions",
        expect: [
          "state": "open",
          "contains": "Combobox[part=option value=billing],Combobox[part=option value=access]",
        ]
      ) {
        Self.open(PMComboboxProps(ariaLabel: "Queue", options: Self.described))
      },
      PMStateEntry(
        "clearable with value",
        expect: ["state": "closed", "placeholder": "", "contains": "Combobox[part=clear]"]
      ) {
        PMCombobox(
          props: PMComboboxProps(
            ariaLabel: "Assignee", clearable: true, defaultValue: "eli", options: Self.team))
      },
      PMStateEntry(
        "custom value — the typed text stands", expect: ["state": "closed", "placeholder": ""]
      ) {
        PMCombobox(
          props: PMComboboxProps(
            allowsCustomValue: true, ariaLabel: "Tag", inputValue: "vip-escalation",
            options: Self.described))
      },
      PMStateEntry(
        "loading more — rows and skeletons",
        expect: ["contains": "Combobox[part=list options=5 loading=true]"]
      ) {
        Self.open(PMComboboxProps(ariaLabel: "Assignee", loading: true, options: Self.team))
      },
      PMStateEntry("invalid", expect: ["invalid": "true"]) {
        PMCombobox(
          props: PMComboboxProps(
            ariaLabel: "Assignee", invalid: true, options: Self.team, placeholder: "Search the team…"))
      },
      PMStateEntry("disabled", expect: ["disabled": "true"]) {
        PMCombobox(
          props: PMComboboxProps(
            ariaLabel: "Assignee", defaultValue: "ana", disabled: true, options: Self.team))
      },
    ]
  }
}

/// An open combobox as the fixture draws it: the field, and the list under it.
private struct ComboboxOpen: View {
  @Environment(\.pmTheme) private var theme
  let props: PMComboboxProps

  var body: some View {
    let chosen = props.options.first { $0.value == props.defaultValue ?? nil }?.label
    VStack(alignment: .leading, spacing: theme.defaultDensity.space.s1) {
      PMChoiceField(
        text: chosen ?? props.placeholder ?? "", placeholder: chosen == nil,
        size: props.size ?? .md, invalid: false, disabled: false, open: true,
        loading: props.loading ?? false, name: props.ariaLabel ?? "", value: chosen ?? "",
        chevronLabel: PMStrings.combobox(nil).showOptions, onOpen: {})
      PMCombobox.list(
        props, query: .constant(props.inputValue ?? ""), current: props.defaultValue ?? nil,
        framed: true, choose: { _ in }, submit: {})
    }
    .accessibilityElement(children: .contain)
    .pmMember(
      "Combobox",
      ["size": (props.size ?? .md).rawValue, "state": "open"].merging(
        props.loading == true ? ["loading": "true"] : [:], uniquingKeysWith: { a, _ in a }))
  }
}
