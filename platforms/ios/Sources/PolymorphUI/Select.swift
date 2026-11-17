// Select (`design/components/select.md`): one value from a closed list. The
// trigger is Input's container with the value, or the muted placeholder, and
// the `expand` chevron. Choosing is the platform's: a SwiftUI `Picker` in a
// menu, which draws the system's rows and check, at every length. The Picker
// is the platform's own select, with its own phone form (the platform map's
// reason), so the web's sheet below 30rem does not apply and `presentation`
// changes nothing: `auto` and `popover` are both the menu.
//
// The empty choice is the first row, labelled `emptyOption`; choosing it
// reports `nil`, and the trigger then shows its label as a value, never as a
// placeholder. Disabled options are listed and cannot be chosen; a group is a
// section under its label, which the menu draws in the system's section
// style; a description is the row's second line. An invalid select says so
// first in its hint, as the web's `aria-invalid` is announced.
//
// A menu opens only from the person's tap, so `defaultOpen` has no effect, and
// the menu's own rows are the system's to draw: the spec's open states have
// no member-drawn form, and the states fixture holds the trigger for each of
// them, showing the value chosen from the list that state describes. `id`,
// `name`, `ariaRequired` and the `aria-describedby`/`aria-labelledby` ids have
// no SwiftUI counterpart.

import PolymorphTokens
import SwiftUI

public struct PMSelect: PMSelectRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmField) private var field
  @State private var draft: String?
  private let props: PMSelectProps

  public init(props: PMSelectProps) {
    self.props = props
    _draft = State(initialValue: props.defaultValue ?? nil)
  }

  public var body: some View {
    let size = props.size ?? .md
    let disabled = props.disabled ?? false
    let invalid = (props.invalid ?? false) || (field?.invalid ?? false)
    let label = shownLabel

    Menu {
      Picker(name ?? "", selection: selection) {
        if let emptyOption = props.emptyOption {
          Text(emptyOption).tag(String?.none)
        }
        ForEach(Array(props.options.enumerated()), id: \.offset) { _, entry in
          switch entry {
          case .option(let option):
            row(option)
          case .group(let group):
            Section(group.label) {
              ForEach(group.options, id: \.value) { row($0) }
            }
          }
        }
      }
      .pickerStyle(.inline)
      .labelsHidden()
    } label: {
      HStack(spacing: PMControlMetrics(size, theme).gap) {
        Text(label ?? props.placeholder ?? "")
          .lineLimit(1)
          .truncationMode(.tail)
          .frame(maxWidth: .infinity, alignment: .leading)
        PMIconView(.expand, size: size)
          .foregroundStyle((disabled ? theme.colors.textDisabled : theme.colors.textMuted).color)
      }
    }
    .menuStyle(.button)
    .buttonStyle(PMSelectTriggerStyle(controlSize: size, invalid: invalid, placeholder: label == nil))
    .disabled(disabled)
    .accessibilityLabel(Text(name ?? label ?? ""))
    .accessibilityValue(Text(label ?? props.placeholder ?? ""))
    .pmFieldHint(invalid: invalid, field?.hint)
    .pmFocusWhenNamed()
    .pmMember("Select", attributes(size, invalid: invalid, disabled: disabled))
    .preference(key: PMFieldControlKey.self, value: PMFieldControl(disabled: disabled))
  }

  /// The controlled `value` when given (`nil` inside it is the empty choice),
  /// otherwise the select's own.
  private var current: String? {
    props.value ?? draft
  }

  private var selection: Binding<String?> {
    Binding {
      current
    } set: { next in
      draft = next
      props.onChange?(next)
    }
  }

  private var name: String? {
    props.ariaLabel ?? field?.label
  }

  /// A menu row, tagged with its option's value; a disabled option is listed
  /// and cannot be chosen.
  private func row(_ option: PMSelectOption) -> some View {
    PMSelectMenuRow(option: option)
      .tag(Optional(option.value))
      .disabled(option.disabled ?? false)
  }

  /// Every option, the grouped ones in their groups' places.
  private var options: [PMSelectOption] {
    props.options.flatMap { entry -> [PMSelectOption] in
      switch entry {
      case .option(let option): [option]
      case .group(let group): group.options
      }
    }
  }

  /// What the trigger shows as a value: the chosen option's label, or the
  /// empty choice's label when it is chosen; `nil` while the placeholder shows.
  private var shownLabel: String? {
    if let value = current {
      return options.first { $0.value == value }?.label
    }
    return props.emptyOption
  }

  private func attributes(_ size: PMControlSize, invalid: Bool, disabled: Bool) -> [String: String]
  {
    var attributes = ["size": size.rawValue, "state": "closed"]
    if shownLabel == nil { attributes["placeholder"] = "true" }
    if invalid { attributes["invalid"] = "true" }
    if disabled { attributes["disabled"] = "true" }
    return attributes
  }
}

/// A menu row: the label, and the description as its second line, one view
/// so the row carries one tag. The menu draws both, and the check, in the
/// system's own style.
private struct PMSelectMenuRow: View {
  let option: PMSelectOption

  var body: some View {
    VStack(alignment: .leading) {
      Text(option.label)
      if let description = option.description {
        Text(description)
      }
    }
  }
}

/// Select's states, from the spec's States table. The rows the table draws
/// open are the system menu's, which the harness cannot draw: each is held
/// here as the trigger, showing the value chosen from the list that row
/// describes.
public struct SelectStates: PMStates {
  public let member = "Select"

  public init() {}

  private static let priorities: [PMSelectOptionEntry] = [
    .option(PMSelectOption(value: "urgent", label: "Urgent")),
    .option(PMSelectOption(value: "high", label: "High")),
    .option(PMSelectOption(value: "normal", label: "Normal")),
    .option(PMSelectOption(value: "low", label: "Low")),
  ]

  private static let withDisabled: [PMSelectOptionEntry] = [
    .option(PMSelectOption(value: "urgent", label: "Urgent")),
    .option(PMSelectOption(value: "high", label: "High")),
    .option(PMSelectOption(value: "archived", label: "Archived", disabled: true)),
  ]

  private static let grouped: [PMSelectOptionEntry] = [
    .group(
      PMSelectOptionGroup(
        label: "Queues",
        options: [
          PMSelectOption(value: "billing", label: "Billing"),
          PMSelectOption(value: "onboarding", label: "Onboarding"),
        ])),
    .group(
      PMSelectOptionGroup(
        label: "Archived",
        options: [
          PMSelectOption(value: "q3", label: "Q3 backlog"),
          PMSelectOption(value: "legacy", label: "Legacy imports"),
        ])),
  ]

  private static let described: [PMSelectOptionEntry] = [
    .option(PMSelectOption(value: "urgent", label: "Urgent", description: "Answer within the hour")),
    .option(PMSelectOption(value: "high", label: "High", description: "Same business day")),
  ]

  public var entries: [PMStateEntry] {
    let sizes = [PMControlSize.sm, .lg].map { size in
      PMStateEntry("size \(size.rawValue)", expect: ["size": size.rawValue]) {
        PMSelect(
          props: PMSelectProps(
            ariaLabel: "Priority", defaultValue: "normal", options: Self.priorities, size: size))
      }
    }
    return [
      PMStateEntry(
        "closed rest",
        expect: ["state": "closed", "size": "md", "placeholder": "true", "label": "Priority"]
      ) {
        PMSelect(
          props: PMSelectProps(
            ariaLabel: "Priority", options: Self.priorities, placeholder: "Choose a priority"))
      },
      PMStateEntry("with value", expect: ["state": "closed", "label": "Priority", "value": "High"])
      {
        PMSelect(
          props: PMSelectProps(ariaLabel: "Priority", defaultValue: "high", options: Self.priorities))
      },
    ] + sizes + [
      PMStateEntry("empty choice, selected", expect: ["value": "All statuses"]) {
        PMSelect(
          props: PMSelectProps(
            ariaLabel: "Status", defaultValue: .some(nil), emptyOption: "All statuses",
            options: Self.priorities))
      },
      PMStateEntry("a disabled option in the list", expect: ["value": "High"]) {
        PMSelect(
          props: PMSelectProps(
            ariaLabel: "Priority", defaultValue: "high", options: Self.withDisabled))
      },
      PMStateEntry("grouped, a value from a group", expect: ["value": "Billing"]) {
        PMSelect(
          props: PMSelectProps(ariaLabel: "Queue", defaultValue: "billing", options: Self.grouped))
      },
      PMStateEntry("descriptions, a value chosen", expect: ["value": "Urgent"]) {
        PMSelect(
          props: PMSelectProps(
            ariaLabel: "Priority", defaultValue: "urgent", options: Self.described))
      },
      PMStateEntry("invalid", expect: ["invalid": "true"]) {
        PMSelect(
          props: PMSelectProps(
            ariaLabel: "Priority", invalid: true, options: Self.priorities,
            placeholder: "Choose a priority"))
      },
      PMStateEntry("disabled", expect: ["disabled": "true"]) {
        PMSelect(
          props: PMSelectProps(
            ariaLabel: "Priority", defaultValue: "normal", disabled: true,
            options: Self.priorities))
      },
    ]
  }
}
