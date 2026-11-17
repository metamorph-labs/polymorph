// FormField (`design/components/form-field.md`): one control with its label,
// help text and error, and the wiring between them.
//
// The web clones its child to inject `id`, `aria-describedby`,
// `aria-required` and `invalid`. A SwiftUI view cannot be cloned, so the field
// hands its control a `PMFieldContext` through the environment instead: the
// label the control is named by, the hint it is described by (the error, else
// the description), whether it is required, and whether it is invalid. Every
// control a field governs (Input, Textarea, SearchInput, Select, Checkbox,
// Switch) reads it. The visible label and messages are hidden from
// accessibility, because the control speaks them: its name is the label, and
// its hint is the message. In the other direction, the control reports
// whether it carries its label in its own row and whether it is disabled
// (`PMFieldControl`), which the web reads off the child element: a Checkbox or
// Switch takes the field's label as its row label and the field draws no label
// row, and a disabled control dims the label and the description.
//
// Column-labelled, the field is the label row (the label, the required marker,
// `labelEnd` at the far end), the description, the control and the error;
// row-labelled, it is the control's row, then the description and the error.
// The error replaces the description and slides in from above by one space
// step.
//
// `errorPresentation: .toast` keeps the label, the marker and the control's
// invalid state and draws no message. The web reports the message to its
// toast viewport; iOS has no viewport for a field to report to, so the app
// raises it as a `PMToast`. `required` has no accessibility trait on iOS: the
// marker is drawn and the control is not told. `id` is the name an
// ErrorSummary link gives the field: inside a FormPage, a link to `#<id>`
// moves focus to the field's control (`PMFieldFocusRequest`).

import PolymorphTokens
import SwiftUI

public struct PMFormField: PMFormFieldRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var control = PMFieldControl()
  private let props: PMFormFieldProps

  public init(props: PMFormFieldProps) {
    self.props = props
  }

  public var body: some View {
    let space = theme.defaultDensity.space
    let motion = theme.defaultMotion
    let error = props.error ?? ""
    let invalid = !error.isEmpty
    let inline = props.errorPresentation != .toast
    let description = invalid ? nil : props.description.flatMap { $0.isEmpty ? nil : $0 }
    let required = props.required ?? false
    let context = PMFieldContext(
      label: props.label, hint: invalid ? (inline ? error : nil) : description,
      required: required, invalid: invalid, id: props.id)

    VStack(alignment: .leading, spacing: space.s2) {
      if !control.rowLabelled {
        labelRow(required: required)
        if let description { message(description) }
      }
      props.children
        .environment(\.pmField, context)
      if control.rowLabelled, let description { message(description) }
      if invalid, inline {
        PMFieldErrorRow(text: error)
          .transition(
            reduceMotion ? .opacity : .opacity.combined(with: .offset(y: -space.s2)))
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .animation(motion.easing.enter.animation(duration: motion.duration.control), value: invalid)
    .onPreferenceChange(PMFieldControlKey.self) { control = $0 }
    // What the control reported is this field's; a container around the field reads nothing.
    .transformPreference(PMFieldControlKey.self) { $0 = PMFieldControl() }
    .accessibilityElement(children: .contain)
    .pmMember("FormField", attributes(invalid: invalid, required: required))
  }

  /// The label and its required marker at the start, `labelEnd` at the end.
  /// The label is not spoken here: it is the control's name.
  private func labelRow(required: Bool) -> some View {
    let colors = theme.colors
    return HStack(alignment: .center, spacing: theme.defaultDensity.space.s3) {
      PMRowLabel(label: props.label, required: required)
        .pmTextStyle(theme.text.sm)
        .foregroundStyle((control.disabled ? colors.textDisabled : colors.textPrimary).color)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityHidden(true)
      if let labelEnd = props.labelEnd {
        labelEnd
          .pmTextStyle(theme.text.sm)
          .foregroundStyle(colors.textSecondary.color)
          .fixedSize()
      }
    }
  }

  /// The description: `text.xs`, secondary, spoken as the control's hint.
  private func message(_ text: String) -> some View {
    let colors = theme.colors
    return Text(text)
      .pmTextStyle(theme.text.xs)
      .foregroundStyle((control.disabled ? colors.textDisabled : colors.textSecondary).color)
      .fixedSize(horizontal: false, vertical: true)
      .accessibilityHidden(true)
  }

  private func attributes(invalid: Bool, required: Bool) -> [String: String] {
    var attributes = ["kind": control.rowLabelled ? "row-labelled" : "field"]
    if let id = props.id { attributes["id"] = id }
    if invalid { attributes["invalid"] = "true" }
    if control.disabled { attributes["disabled"] = "true" }
    if required { attributes["required"] = "true" }
    return attributes
  }
}

/// FormField's states, from the spec's States table.
public struct FormFieldStates: PMStates {
  public let member = "FormField"

  public init() {}

  private static let subject = "Subject"
  private static let help = "One line, as the customer would say it."
  private static let missing = "A subject is required."
  private static let priorities: [PMSelectOptionEntry] = [
    .option(PMSelectOption(value: "urgent", label: "Urgent")),
    .option(PMSelectOption(value: "normal", label: "Normal")),
    .option(PMSelectOption(value: "low", label: "Low")),
  ]

  private static func subjectInput(disabled: Bool = false) -> PMContent {
    PMContent(
      PMInput(
        props: PMInputProps(
          defaultValue: disabled ? "Login loop" : nil, disabled: disabled,
          placeholder: "What went wrong?")))
  }

  private static var forgot: PMContent {
    PMContent(
      PMLink(
        props: PMLinkProps(
          children: "Forgot your password?", href: "https://example.com/reset",
          variant: .standalone)))
  }

  private static var password: PMContent {
    PMContent(PMInput(props: PMInputProps(type: .password)))
  }

  private static func select() -> PMContent {
    PMContent(
      PMSelect(props: PMSelectProps(options: Self.priorities, placeholder: "Choose one")))
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("plain", expect: ["kind": "field"]) {
        PMFormField(props: PMFormFieldProps(children: Self.subjectInput(), label: Self.subject))
      },
      PMStateEntry("described", expect: ["kind": "field"]) {
        PMFormField(
          props: PMFormFieldProps(
            children: Self.subjectInput(), description: Self.help, label: Self.subject))
      },
      PMStateEntry("required", expect: ["required": "true"]) {
        PMFormField(
          props: PMFormFieldProps(
            children: Self.subjectInput(), label: Self.subject, required: true))
      },
      PMStateEntry("labelEnd — the row has two ends") {
        PMFormField(
          props: PMFormFieldProps(
            children: Self.password, label: "Password", labelEnd: Self.forgot))
      },
      PMStateEntry(
        "labelEnd, required and in error — the row holds all three",
        expect: ["invalid": "true", "required": "true"]
      ) {
        PMFormField(
          props: PMFormFieldProps(
            children: Self.password, error: "That password does not match.", label: "Password",
            labelEnd: Self.forgot, required: true))
      },
      PMStateEntry("error", expect: ["invalid": "true"]) {
        PMFormField(
          props: PMFormFieldProps(
            children: Self.subjectInput(), error: Self.missing, label: Self.subject))
      },
      PMStateEntry("error replaces description", expect: ["invalid": "true"]) {
        PMFormField(
          props: PMFormFieldProps(
            children: Self.subjectInput(), description: Self.help, error: Self.missing,
            label: Self.subject))
      },
      PMStateEntry(
        "error in a toast — the field stays invalid, no message", expect: ["invalid": "true"]
      ) {
        PMFormField(
          props: PMFormFieldProps(
            children: Self.subjectInput(), error: Self.missing, errorPresentation: .toast,
            label: Self.subject))
      },
      PMStateEntry("disabled control", expect: ["disabled": "true"]) {
        PMFormField(
          props: PMFormFieldProps(
            children: Self.subjectInput(disabled: true),
            description: "Locked while the ticket is closed.", label: Self.subject))
      },
      PMStateEntry("with Textarea") {
        PMFormField(
          props: PMFormFieldProps(
            children: PMContent(
              PMTextarea(props: PMTextareaProps(defaultValue: "It broke.", rows: 2))),
            error: "Tell us what you were doing at the time.", label: "What happened?"))
      },
      PMStateEntry("with Select", expect: ["required": "true"]) {
        PMFormField(
          props: PMFormFieldProps(
            children: Self.select(), description: "How fast this needs an answer.",
            label: "Priority", required: true))
      },
      PMStateEntry("with Select, in error", expect: ["invalid": "true"]) {
        PMFormField(
          props: PMFormFieldProps(
            children: Self.select(), error: "Pick a priority before sending.", label: "Priority",
            required: true))
      },
      PMStateEntry("with SearchInput — the field is as wide as it is given") {
        PMFormField(
          props: PMFormFieldProps(
            children: PMContent(
              PMSearchInput(props: PMSearchInputProps(placeholder: "Search accounts…"))),
            label: "Search accounts"))
      },
      PMStateEntry(
        "with Checkbox — the field label becomes the row label", expect: ["kind": "row-labelled"]
      ) {
        PMFormField(
          props: PMFormFieldProps(
            children: PMContent(PMCheckbox(props: PMCheckboxProps())),
            description: "You can turn this off later.", label: "Email me about replies"))
      },
      PMStateEntry(
        "with Checkbox, in error", expect: ["kind": "row-labelled", "invalid": "true"]
      ) {
        PMFormField(
          props: PMFormFieldProps(
            children: PMContent(PMCheckbox(props: PMCheckboxProps())),
            error: "You have to accept the terms to continue.", label: "Accept the terms"))
      },
      PMStateEntry(
        "required Checkbox — the row carries the marker",
        expect: ["kind": "row-labelled", "required": "true"]
      ) {
        PMFormField(
          props: PMFormFieldProps(
            children: PMContent(PMCheckbox(props: PMCheckboxProps())), label: "Accept the terms",
            required: true))
      },
      PMStateEntry("with Switch", expect: ["kind": "row-labelled"]) {
        PMFormField(
          props: PMFormFieldProps(
            children: PMContent(PMSwitch(props: PMSwitchProps())), label: "Desktop notifications"))
      },
      PMStateEntry(
        "described Switch — the message sits below the row", expect: ["kind": "row-labelled"]
      ) {
        PMFormField(
          props: PMFormFieldProps(
            children: PMContent(PMSwitch(props: PMSwitchProps())),
            description:
              "One summary each morning instead of a notification per reply. Long enough to wrap, "
              + "because the message runs the full width of the field.",
            label: "Send a daily digest"))
      },
    ]
  }
}
