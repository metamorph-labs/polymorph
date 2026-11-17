// CheckboxGroup (`design/components/checkbox-group.md`): several independent
// choices, all visible. Each option is a Checkbox, its box, states and motion
// unchanged; an option's description sits under its label in `text.xs`
// `text.muted` (`text.disabled` on a disabled option), `space-1` below it and
// indented past the box, so it starts where the label starts. The options
// stack `space-3` apart, or sit in a row `space-5` apart when `orientation` is
// horizontal.
//
// The value is the checked options' values in the options' order, never the
// order they were ticked, and none is an answer. `value` with `onChange` is
// the controlled pair; without it the group keeps its own, from
// `defaultValue`.
//
// The group is named by `ariaLabel` or its FormField's label, the question the
// options answer, and FormField draws that label above it. Each box is named
// by its option's label and described by its option's description, so
// per-option help is spoken with its own option; an invalid group draws every
// box's border in danger and says so first in each box's hint. `name`, `id`
// and the `aria-*by` ids have no SwiftUI counterpart.

import PolymorphTokens
import SwiftUI

public struct PMCheckboxGroup: PMCheckboxGroupRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmField) private var field
  @State private var draft: [String]
  private let props: PMCheckboxGroupProps

  public init(props: PMCheckboxGroupProps) {
    self.props = props
    _draft = State(initialValue: props.defaultValue ?? [])
  }

  public var body: some View {
    let space = theme.defaultDensity.space
    let horizontal = props.orientation == .horizontal
    let disabled = props.disabled ?? false
    let invalid = (props.invalid ?? false) || (field?.invalid ?? false)
    let required = (props.ariaRequired ?? false) || (field?.required ?? false)
    let current = checked
    let layout =
      horizontal
      ? AnyLayout(HStackLayout(alignment: .top, spacing: space.s5))
      : AnyLayout(VStackLayout(alignment: .leading, spacing: space.s3))

    layout {
      ForEach(props.options, id: \.value) { option in
        let off = disabled || option.disabled == true
        VStack(alignment: .leading, spacing: space.s1) {
          PMCheckbox(
            props: PMCheckboxProps(
              checked: current.contains(option.value) ? .checked : .unchecked, disabled: off,
              label: option.label, onCheckedChange: { toggle(option.value, $0) }))
          if let description = option.description {
            Text(description)
              .pmTextStyle(theme.text.xs)
              .foregroundStyle((off ? theme.colors.textDisabled : theme.colors.textMuted).color)
              .fixedSize(horizontal: false, vertical: true)
              .padding(.leading, theme.icon.size.md + space.s3)
              .accessibilityHidden(true)
          }
        }
        // Each box is its own field: named by its option, described by it,
        // and invalid with the group.
        .environment(
          \.pmField,
          PMFieldContext(
            label: option.label, hint: option.description, required: false, invalid: invalid))
      }
    }
    .frame(maxWidth: horizontal ? nil : .infinity, alignment: .leading)
    // The boxes report themselves row-labelled; the group is not, so its
    // FormField draws the question above it.
    .transformPreference(PMFieldControlKey.self) { $0 = PMFieldControl(disabled: disabled) }
    .accessibilityElement(children: .contain)
    .modifier(PMOptionalLabel(label: props.ariaLabel ?? field?.label))
    .pmAccessibilityHint(field?.hint)
    .pmFocusWhenNamed()
    .pmMember(
      "CheckboxGroup",
      attributes(current, disabled: disabled, invalid: invalid, required: required))
  }

  /// The checked values, in the options' order: the controlled `value` when
  /// given, otherwise the group's own.
  private var checked: [String] {
    let values = props.value ?? draft
    return props.options.map(\.value).filter(values.contains)
  }

  private func toggle(_ value: String, _ state: PMCheckedState) {
    var values = Set(checked)
    if state == .checked { values.insert(value) } else { values.remove(value) }
    let next = props.options.map(\.value).filter(values.contains)
    draft = next
    props.onChange?(next)
  }

  private func attributes(_ current: [String], disabled: Bool, invalid: Bool, required: Bool)
    -> [String: String]
  {
    var attributes = [
      "orientation": (props.orientation ?? .vertical).rawValue, "checked": String(current.count),
    ]
    if disabled { attributes["disabled"] = "true" }
    if invalid { attributes["invalid"] = "true" }
    if required { attributes["required"] = "true" }
    return attributes
  }
}

/// CheckboxGroup's states, from the spec's States table.
public struct CheckboxGroupStates: PMStates {
  public let member = "CheckboxGroup"

  public init() {}

  private static let changes = [
    PMCheckboxGroupOption(value: "replies", label: "Replies"),
    PMCheckboxGroupOption(value: "status", label: "Status changes"),
    PMCheckboxGroupOption(value: "assignments", label: "Assignments"),
  ]

  private static let described = [
    PMCheckboxGroupOption(
      value: "replies", label: "Replies", description: "Every public reply on the ticket"),
    PMCheckboxGroupOption(
      value: "status", label: "Status changes", description: "Opened, waiting, solved"),
    PMCheckboxGroupOption(
      value: "assignments", label: "Assignments", description: "Who the ticket is assigned to"),
  ]

  public var entries: [PMStateEntry] {
    let oneDisabled = [
      Self.changes[0], Self.changes[1],
      PMCheckboxGroupOption(value: "assignments", label: "Assignments", disabled: true),
    ]
    return [
      PMStateEntry("none checked", expect: ["checked": "0", "label": "Notify about"]) {
        PMCheckboxGroup(
          props: PMCheckboxGroupProps(ariaLabel: "Notify about", options: Self.changes))
      },
      PMStateEntry("two checked", expect: ["checked": "2"]) {
        PMCheckboxGroup(
          props: PMCheckboxGroupProps(
            ariaLabel: "Notify about", defaultValue: ["status", "replies"],
            options: Self.changes))
      },
      PMStateEntry("descriptions", expect: ["checked": "1"]) {
        PMCheckboxGroup(
          props: PMCheckboxGroupProps(
            ariaLabel: "Notify about", defaultValue: ["replies"], options: Self.described))
      },
      PMStateEntry("horizontal", expect: ["orientation": "horizontal"]) {
        PMCheckboxGroup(
          props: PMCheckboxGroupProps(
            ariaLabel: "Notify about", options: Self.changes, orientation: .horizontal))
      },
      PMStateEntry("invalid", expect: ["invalid": "true"]) {
        PMCheckboxGroup(
          props: PMCheckboxGroupProps(ariaLabel: "Notify about", invalid: true, options: Self.changes))
      },
      PMStateEntry("group disabled", expect: ["disabled": "true"]) {
        PMCheckboxGroup(
          props: PMCheckboxGroupProps(
            ariaLabel: "Notify about", defaultValue: ["replies"], disabled: true,
            options: Self.changes))
      },
      PMStateEntry("one option disabled", expect: ["checked": "1"]) {
        PMCheckboxGroup(
          props: PMCheckboxGroupProps(
            ariaLabel: "Notify about", defaultValue: ["replies"], options: oneDisabled))
      },
      PMStateEntry("required", expect: ["required": "true"]) {
        PMCheckboxGroup(
          props: PMCheckboxGroupProps(
            ariaLabel: "Notify the reporter about", ariaRequired: true, options: Self.described))
      },
    ]
  }
}
