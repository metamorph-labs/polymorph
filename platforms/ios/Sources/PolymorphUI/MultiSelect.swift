// MultiSelect (`design/components/multi-select.md`), adapted on iOS: several
// values chosen from a filterable list, as a tag field whose checklist is a
// sheet on iPhone and a popover at the field on iPad (`presentation:
// .popover` keeps the popover on iPhone too). The field is TagInput's
// container: the chosen values as chips, in the options' order, each with its
// remove button, then the placeholder while nothing is chosen, and the
// `expand` chevron, or the spinning `loading` glyph while the list loads. A
// tap on the field opens the list.
//
// The list is Combobox's (`PMOptionList`): a search field at its top that
// filters the options in the person's locale (`filter: false` when the app
// has filtered), Select's rows with a check on each chosen option, the
// loading and empty rows. Choosing toggles an option and leaves the list
// open, because a filter list is ticked several entries at a time. With
// `allowCustom`, typed text that matches no option, is not chosen already and
// passes `validate` is offered as the last row, `Add "{text}"` with the `add`
// glyph; Return in the search field takes the offer, and text that cannot be
// added is answered aloud, refused or already selected. At `max` the
// unchosen options are dimmed and cannot be chosen, the chosen ones can still
// be removed, and the offer is withdrawn. A tap anywhere in the field's hit
// area outside a chip's remove button opens the list.
//
// `onChange` reports the chosen values in the options' order (a custom value
// last), never the order they were ticked. Removing a value, from its chip or
// from the list, and adding a custom one are announced with the count; a
// ticked option says it is chosen through its row's selected trait. The field
// is described by the count, "{n} selected" or
// "Maximum of {max} selected", then by its FormField's message. The search
// text is the controlled `inputValue` when given, `defaultInputValue` its
// start. `onBlur` fires when the list closes. Every string the member speaks
// is `messages`', with English defaults. A disabled field shows its chips
// without their remove buttons. `name`, `id` and the `aria-*by` ids have no
// SwiftUI counterpart.

import PolymorphTokens
import SwiftUI

public struct PMMultiSelect: PMMultiSelectRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmField) private var field
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var draft: [String]
  @State private var typed: String
  @State private var presented: Bool
  private let props: PMMultiSelectProps

  public init(props: PMMultiSelectProps) {
    self.props = props
    _draft = State(initialValue: props.defaultValue ?? [])
    _typed = State(initialValue: props.defaultInputValue ?? "")
    _presented = State(initialValue: props.defaultOpen ?? false)
  }

  public var body: some View {
    let size = props.size ?? .md
    let disabled = props.disabled ?? false
    let invalid = (props.invalid ?? false) || (field?.invalid ?? false)

    Self.field(
      props, chosen: chosen, size: size, invalid: invalid, disabled: disabled, open: presented,
      name: name ?? props.placeholder ?? "",
      hint: [description, field?.hint].compactMap { $0 }.joined(separator: ", "),
      onOpen: { setOpen(true) }, onRemove: remove
    )
    .modifier(
      PMAnchoredPresentation(
        isPresented: Binding(get: { presented }, set: setOpen),
        compact: props.presentation == .popover ? .popover : .sheet,
        anchor: .point(.bottomLeading), edge: .top, scrolls: false
      ) {
        Self.list(
          props, query: query, chosen: chosen, framed: false, toggle: toggle, mint: mint,
          submit: submit)
      }
    )
    .pmFocusWhenNamed()
    .pmMember(
      "MultiSelect",
      Self.attributes(props, chosen: chosen, size: size, open: presented, invalid: invalid))
    .preference(key: PMFieldControlKey.self, value: PMFieldControl(disabled: disabled))
  }

  // MARK: The value

  /// The chosen values in the options' order, a custom value after them: the
  /// controlled `value` when given, otherwise the field's own.
  private var chosen: [String] {
    Self.ordered(props.value ?? draft, props)
  }

  static func ordered(_ values: [String], _ props: PMMultiSelectProps) -> [String] {
    let known = props.options.map(\.value)
    return known.filter(values.contains) + values.filter { !known.contains($0) }
  }

  private var atMax: Bool {
    props.max.map { Double(chosen.count) >= $0 } ?? false
  }

  private var query: Binding<String> {
    Binding {
      props.inputValue ?? typed
    } set: { next in
      typed = next
      props.onInputChange?(next)
    }
  }

  private func set(_ values: [String]) {
    let next = Self.ordered(values, props)
    draft = next
    props.onChange?(next)
  }

  private func toggle(_ value: String) {
    if chosen.contains(value) {
      remove(value)
    } else if !atMax {
      set(chosen + [value])
    }
  }

  private func remove(_ value: String) {
    let next = chosen.filter { $0 != value }
    set(next)
    let label = props.options.first { $0.value == value }?.label ?? value
    announce(props.messages?.removed?(label, Double(next.count))
      ?? PMStrings.multiSelectRemoved(label: label, count: Double(next.count)))
  }

  /// The custom value the typed text offers, or `nil` when there is none to offer.
  private var offer: String? {
    Self.offer(props, query: query.wrappedValue, chosen: chosen)
  }

  static func offer(_ props: PMMultiSelectProps, query: String, chosen: [String]) -> String? {
    guard props.allowCustom == true else { return nil }
    if let max = props.max, Double(chosen.count) >= max { return nil }
    let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let value = props.validate.map({ $0(trimmed) }) ?? (trimmed.isEmpty ? nil : trimmed)
    else { return nil }
    let clashes = props.options.contains {
      $0.value.localizedCaseInsensitiveCompare(value) == .orderedSame
        || $0.label.localizedCaseInsensitiveCompare(value) == .orderedSame
    }
    return clashes || chosen.contains(value) ? nil : value
  }

  private func mint() {
    guard let value = offer else { return }
    set(chosen + [value])
    query.wrappedValue = ""
    announce(props.messages?.added?(value, Double(chosen.count + 1))
      ?? PMStrings.multiSelectAdded(value: value, count: Double(chosen.count + 1)))
  }

  /// Return in the search field: the offer when there is one; otherwise typed
  /// text that cannot be added is answered, not dropped in silence.
  private func submit() {
    if offer != nil {
      mint()
      return
    }
    let text = query.wrappedValue.trimmingCharacters(in: .whitespacesAndNewlines)
    guard props.allowCustom == true, !text.isEmpty else { return }
    if chosen.contains(text) {
      announce(props.messages?.alreadySelected?(text) ?? PMStrings.multiSelectAlreadySelected(value: text))
    } else {
      announce(props.messages?.refused?(text) ?? PMStrings.multiSelectRefused(text: text))
    }
  }

  private func setOpen(_ open: Bool) {
    guard open != presented else { return }
    presented = open
    if !open { props.onBlur?() }
  }

  private func announce(_ text: String) {
    AccessibilityNotification.Announcement(text).post()
  }

  private var name: String? {
    props.ariaLabel ?? field?.label
  }

  /// The count, the field's description.
  private var description: String {
    props.messages?.selected?(Double(chosen.count), props.max)
      ?? PMStrings.multiSelectCount(Double(chosen.count), max: props.max)
  }

  // MARK: The parts

  /// The field: the chips, the placeholder while none is chosen, and the chevron.
  static func field(
    _ props: PMMultiSelectProps, chosen: [String], size: PMControlSize, invalid: Bool,
    disabled: Bool, open: Bool, name: String, hint: String,
    onOpen: @escaping @MainActor () -> Void, onRemove: @escaping @MainActor (String) -> Void
  ) -> some View {
    PMMultiSelectField(
      props: props, chosen: chosen, size: size, invalid: invalid, disabled: disabled, open: open,
      name: name, hint: hint, onOpen: onOpen, onRemove: onRemove)
  }

  /// The list, as the presentation shows it, or drawn in place for the states fixture.
  static func list(
    _ props: PMMultiSelectProps, query: Binding<String>, chosen: [String], framed: Bool,
    toggle: @escaping @MainActor (String) -> Void, mint: @escaping @MainActor () -> Void,
    submit: @escaping @MainActor () -> Void
  ) -> some View {
    let full = props.max.map { Double(chosen.count) >= $0 } ?? false
    let options = props.options
      .filter {
        props.filter == false || PMOptionItem.matches($0.label, query.wrappedValue, .contains)
      }
      .map { option in
        let on = chosen.contains(option.value)
        return PMOptionItem(
          value: option.value, label: option.label, description: option.description,
          disabled: option.disabled == true || (full && !on), checked: on)
      }
    let offered = offer(props, query: query.wrappedValue, chosen: chosen)
    return PMOptionList(
      member: "MultiSelect", query: query,
      searchLabel: props.ariaLabel ?? props.placeholder ?? PMStrings.search,
      options: options,
      mint: offered.map { props.messages?.add?($0) ?? PMStrings.multiSelectAdd(text: $0) },
      loading: props.loading ?? false, emptyMessage: props.emptyMessage ?? PMStrings.multiSelectEmpty,
      loadingMessage: props.messages?.loadingOptions ?? PMStrings.multiSelectLoading,
      countMessage: props.messages?.options ?? { PMStrings.multiSelectOptions(count: $0) }, onLoadMore: props.onLoadMore,
      onSelect: toggle, onMint: mint, onSubmit: submit, framed: framed)
  }

  static func attributes(
    _ props: PMMultiSelectProps, chosen: [String], size: PMControlSize, open: Bool, invalid: Bool
  ) -> [String: String] {
    var attributes = [
      "size": size.rawValue, "state": open ? "open" : "closed", "count": String(chosen.count),
    ]
    if invalid { attributes["invalid"] = "true" }
    if props.disabled == true { attributes["disabled"] = "true" }
    if props.loading == true { attributes["loading"] = "true" }
    if let max = props.max, Double(chosen.count) >= max { attributes["at-max"] = "true" }
    return attributes
  }
}

/// The tag field: TagInput's container holding the chips and the opening
/// button, which shows the placeholder while nothing is chosen.
private struct PMMultiSelectField: View {
  @Environment(\.pmTheme) private var theme
  let props: PMMultiSelectProps
  let chosen: [String]
  let size: PMControlSize
  let invalid: Bool
  let disabled: Bool
  let open: Bool
  let name: String
  let hint: String
  let onOpen: @MainActor () -> Void
  let onRemove: @MainActor (String) -> Void

  var body: some View {
    let metrics = PMControlMetrics(size, theme)
    let space = theme.defaultDensity.space
    let colors = theme.colors
    // The opening button's least width, and its height inside the field's
    // padding above and below.
    let least = space.s10 / PMRecipe.entryMinWidth
    let line = metrics.height - space.s1 - space.s1
    HStack(alignment: .center, spacing: space.s1) {
      PMFlowLayout(spacing: space.s1, lineSpacing: space.s1, lastMinWidth: least) {
        ForEach(chosen, id: \.self) { value in chip(value) }
        Button(action: onOpen) {
          Text(chosen.isEmpty ? props.placeholder ?? "" : "")
            .pmTextStyle(metrics.text)
            .foregroundStyle((disabled ? colors.textDisabled : colors.textMuted).color)
            .lineLimit(1)
            .frame(maxWidth: .infinity, minHeight: line, alignment: .leading)
            .pmHitRegion(height: line)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(name))
        .accessibilityValue(Text(chosen.map(label).joined(separator: ", ")))
        .pmFieldHint(invalid: invalid, hint)
      }
      Button(action: onOpen) {
        Group {
          if props.loading == true {
            PMSpinGlyph(controlSize: size)
          } else {
            PMTurningChevron(
              role: .expand, open: open, turn: .degrees(180), size: size, color: nil)
          }
        }
      }
      .buttonStyle(PMEmbeddedButtonStyle(side: line))
      .accessibilityLabel(Text(props.messages?.showOptions ?? PMStrings.multiSelectShowOptions))
    }
    .padding(.vertical, space.s1)
    .padding(.horizontal, space.s2)
    .frame(maxWidth: .infinity, minHeight: metrics.height, alignment: .leading)
    .modifier(
      PMFieldBox(invalid: invalid, disabled: disabled, readOnly: false, focused: false, held: open))
    .disabled(disabled)
    .pmHitTarget()
    .pmOpensOnTap(!disabled, onOpen)
    .accessibilityElement(children: .contain)
  }

  private func label(_ value: String) -> String {
    props.options.first { $0.value == value }?.label ?? value
  }

  private func chip(_ value: String) -> PMChip {
    let text = label(value)
    let removal = props.messages?.remove?(text) ?? PMStrings.multiSelectRemove(label: text)
    var chip = PMChip(label: text, removeLabel: removal)
    if !disabled { chip.onRemove = { onRemove(value) } }
    return chip
  }
}

/// MultiSelect's states, from the spec's States table. The open rows draw the
/// field and, under it, the list the presentation shows, because the harness
/// renders no presentation.
public struct MultiSelectStates: PMStates {
  public let member = "MultiSelect"

  public init() {}

  private static let team = [
    PMMultiSelectOption(value: "ana", label: "Ana Ruiz"),
    PMMultiSelectOption(value: "ben", label: "Ben Okafor"),
    PMMultiSelectOption(value: "chloe", label: "Chloé Martin"),
    PMMultiSelectOption(value: "dev", label: "Dev Patel"),
    PMMultiSelectOption(value: "eli", label: "Eli Stone"),
    PMMultiSelectOption(value: "fay", label: "Fay Lindqvist"),
    PMMultiSelectOption(value: "gus", label: "Gus Moreau"),
    PMMultiSelectOption(value: "hana", label: "Hana Sato"),
  ]

  private static let placeholder = "Add assignees…"

  public var entries: [PMStateEntry] {
    let sizes = [PMControlSize.sm, .lg].map { size in
      PMStateEntry("size \(size.rawValue)", expect: ["size": size.rawValue]) {
        PMMultiSelect(
          props: PMMultiSelectProps(
            ariaLabel: "Assignees", defaultValue: ["ana"], options: Self.team, size: size))
      }
    }
    return [
      PMStateEntry("empty", expect: ["state": "closed", "count": "0"]) {
        PMMultiSelect(
          props: PMMultiSelectProps(
            ariaLabel: "Assignees", options: Self.team, placeholder: Self.placeholder))
      },
      PMStateEntry("with chips — in the options' order", expect: ["count": "3"]) {
        PMMultiSelect(
          props: PMMultiSelectProps(
            ariaLabel: "Assignees", defaultValue: ["eli", "ana", "chloe"], options: Self.team))
      },
      PMStateEntry("wrapped — the field grew", expect: ["count": "8"]) {
        PMMultiSelect(
          props: PMMultiSelectProps(
            ariaLabel: "Assignees", defaultValue: Self.team.map(\.value), options: Self.team))
      },
      PMStateEntry(
        "open filtered",
        expect: [
          "state": "open",
          "contains": "MultiSelect[part=list options=2],MultiSelect[part=option value=hana]",
        ]
      ) {
        MultiSelectOpen(
          props: PMMultiSelectProps(
            ariaLabel: "Assignees", defaultInputValue: "an", options: Self.team))
      },
      PMStateEntry(
        "open with selections — their checks",
        expect: [
          "count": "2",
          "contains":
            "MultiSelect[part=option value=ben checked=true],MultiSelect[part=option value=dev checked=true]",
        ]
      ) {
        MultiSelectOpen(
          props: PMMultiSelectProps(
            ariaLabel: "Assignees", defaultValue: ["ben", "dev"], options: Self.team))
      },
      PMStateEntry(
        "loading — skeleton rows",
        expect: ["contains": "MultiSelect[part=list options=0 loading=true]"]
      ) {
        MultiSelectOpen(props: PMMultiSelectProps(ariaLabel: "Assignees", loading: true, options: []))
      },
      PMStateEntry(
        "empty results — one line",
        expect: ["state": "open", "contains": "MultiSelect[part=list options=0 loading=]"]
      ) {
        MultiSelectOpen(
          props: PMMultiSelectProps(
            ariaLabel: "Assignees", defaultInputValue: "zed", options: Self.team))
      },
      PMStateEntry("at max — the unchosen dimmed", expect: ["at-max": "true"]) {
        MultiSelectOpen(
          props: PMMultiSelectProps(
            ariaLabel: "Assignees", defaultValue: ["ana", "ben", "chloe"], max: 3,
            options: Self.team))
      },
      PMStateEntry(
        "custom — the offer row", expect: ["state": "open", "contains": "MultiSelect[part=offer]"]
      ) {
        MultiSelectOpen(
          props: PMMultiSelectProps(
            allowCustom: true, ariaLabel: "Labels", defaultInputValue: "vip-escalation",
            options: Self.team))
      },
      PMStateEntry("custom — a chip no option carries", expect: ["count": "2"]) {
        PMMultiSelect(
          props: PMMultiSelectProps(
            allowCustom: true, ariaLabel: "Assignees", defaultValue: ["ana", "contractor"],
            options: Self.team))
      },
      PMStateEntry(
        "loading more — rows and skeletons",
        expect: ["contains": "MultiSelect[part=list options=3 loading=true]"]
      ) {
        MultiSelectOpen(
          props: PMMultiSelectProps(
            ariaLabel: "Assignees", loading: true, options: Array(Self.team.prefix(3))))
      },
    ] + sizes + [
      PMStateEntry("invalid", expect: ["invalid": "true"]) {
        PMMultiSelect(
          props: PMMultiSelectProps(
            ariaLabel: "Assignees", invalid: true, options: Self.team,
            placeholder: Self.placeholder))
      },
      PMStateEntry("disabled — no remove buttons", expect: ["disabled": "true"]) {
        PMMultiSelect(
          props: PMMultiSelectProps(
            ariaLabel: "Assignees", defaultValue: ["ana", "ben"], disabled: true,
            options: Self.team))
      },
    ]
  }
}

/// An open multi-select as the fixture draws it: the field, and the list under it.
private struct MultiSelectOpen: View {
  @Environment(\.pmTheme) private var theme
  let props: PMMultiSelectProps

  var body: some View {
    let chosen = PMMultiSelect.ordered(props.defaultValue ?? [], props)
    VStack(alignment: .leading, spacing: theme.defaultDensity.space.s1) {
      PMMultiSelect.field(
        props, chosen: chosen, size: props.size ?? .md, invalid: false, disabled: false,
        open: true, name: props.ariaLabel ?? "", hint: "", onOpen: {}, onRemove: { _ in })
      PMMultiSelect.list(
        props, query: .constant(props.defaultInputValue ?? ""), chosen: chosen, framed: true,
        toggle: { _ in }, mint: {}, submit: {})
    }
    .accessibilityElement(children: .contain)
    .pmMember(
      "MultiSelect",
      PMMultiSelect.attributes(
        props, chosen: chosen, size: props.size ?? .md, open: true, invalid: false))
  }
}
