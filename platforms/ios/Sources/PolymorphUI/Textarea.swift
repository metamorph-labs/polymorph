// Textarea (`design/components/textarea.md`): multi-line text entry, Input's
// recipe extended vertically. A vertical-axis `TextField`, which wraps, keeps
// a placeholder and grows, inside Input's container (`PMFieldBox`) with the
// recipe's padding and the `text.sm` step, whose line box sets the rhythm.
//
// `rows` is the height in lines: the field reserves that many and scrolls past
// them. `autosize` lets it grow past them with its content, `rows` staying
// the floor. `resize` has no counterpart: iOS draws no resize handle, so a
// field is as tall as its rows or its content and never dragged. `readOnly`
// is the value as selectable text, and `invalid` is said first in the hint, as
// on Input. The opaque `controlRef`, `onSelect` and composition events, and
// the `id`, `name` and `aria-describedby`/`aria-labelledby` ids, are not
// honoured, as on Input.

import PolymorphTokens
import SwiftUI

public struct PMTextarea: PMTextareaRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmField) private var field
  @FocusState private var focused: Bool
  @State private var draft: String
  @State private var shown: String
  private let props: PMTextareaProps

  public init(props: PMTextareaProps) {
    self.props = props
    _draft = State(initialValue: props.defaultValue ?? "")
    _shown = State(initialValue: props.value ?? props.defaultValue ?? "")
  }

  public var body: some View {
    let space = theme.defaultDensity.space
    let colors = theme.colors
    let disabled = props.disabled ?? false
    let readOnly = props.readOnly ?? false
    let invalid = (props.invalid ?? false) || (field?.invalid ?? false)
    let rows = max(1, Int(props.rows ?? 4))
    let autosize = props.autosize ?? false

    entry(rows: rows, autosize: autosize, readOnly: readOnly, disabled: disabled, invalid: invalid)
      .pmTextStyle(theme.text.sm)
      .foregroundStyle(
        (disabled ? colors.textDisabled : readOnly ? colors.textSecondary : colors.textPrimary)
          .color
      )
      .padding(.vertical, space.s3)
      .padding(.horizontal, space.s4)
      .frame(
        maxWidth: .infinity, minHeight: theme.defaultDensity.controlHeight.md,
        alignment: .topLeading
      )
      .modifier(
        PMFieldBox(invalid: invalid, disabled: disabled, readOnly: readOnly, focused: focused)
      )
      // One row and the recipe's padding are shorter than the hit target.
      .pmHitTarget()
      // A tap in the box focuses the field, and the text view places its
      // caret where the tap lands.
      .pmOpensOnTap(!disabled, simultaneous: true) { focused = true }
      .pmLimitedText(
        $shown, value: props.value, committed: value, maxLength: props.maxLength
      ) { kept in
        draft = kept
        props.onChange?(kept)
      }
      .onChange(of: focused) { _, now in
        if now { props.onFocus?() } else { props.onBlur?() }
      }
      .onAppear { if props.autoFocus == true, !disabled { focused = true } }
      .accessibilityElement(children: .contain)
      .pmMember("Textarea", attributes(invalid: invalid, disabled: disabled, readOnly: readOnly))
      .preference(key: PMFieldControlKey.self, value: PMFieldControl(disabled: disabled))
  }

  /// The controlled `value` when given, otherwise the field's own draft. The
  /// field shows `shown`, which follows it, and `maxLength` cuts what is typed
  /// (`pmLimitedText`).
  private var value: String {
    props.value ?? draft
  }

  private var name: String? {
    props.ariaLabel ?? field?.label ?? props.placeholder
  }

  @ViewBuilder
  private func entry(
    rows: Int, autosize: Bool, readOnly: Bool, disabled: Bool, invalid: Bool
  ) -> some View {
    if readOnly {
      Text(value)
        .lineLimit(rows, reservesSpace: true)
        .textSelection(.enabled)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityLabel(Text(name ?? value))
        .accessibilityValue(Text(value))
        .pmFieldHint(invalid: invalid, field?.hint)
    } else {
      let prompt =
        props.placeholder.map { Text($0).foregroundStyle(theme.colors.textMuted.color) }
        ?? Text(verbatim: "")
      TextField(name ?? "", text: $shown, prompt: prompt, axis: .vertical)
        .textFieldStyle(.plain)
        .modifier(PMRows(rows: rows, grows: autosize))
        .focused($focused)
        .pmFocusWhenNamed($focused)
        .disabled(disabled)
        .tint(theme.colors.accentText.color)
        .pmEntryName(name)
        .pmFieldHint(invalid: invalid, field?.hint)
    }
  }

  private func attributes(invalid: Bool, disabled: Bool, readOnly: Bool) -> [String: String] {
    let autosize = props.autosize ?? false
    // Autosize implies `none`: a box that sizes itself has one owner for its height.
    var attributes = ["resize": autosize ? "none" : (props.resize ?? .vertical).rawValue]
    if autosize { attributes["autosize"] = "true" }
    if invalid { attributes["invalid"] = "true" }
    if disabled { attributes["disabled"] = "true" }
    if readOnly { attributes["readonly"] = "true" }
    return attributes
  }
}

/// `rows` lines reserved; with `grows`, as many more as the content needs.
private struct PMRows: ViewModifier {
  let rows: Int
  let grows: Bool

  func body(content: Content) -> some View {
    if grows {
      content.lineLimit(rows...)
    } else {
      content.lineLimit(rows, reservesSpace: true)
    }
  }
}

/// Textarea's states, from the spec's States table.
public struct TextareaStates: PMStates {
  public let member = "Textarea"

  public init() {}

  private static let note =
    "Retries stop after the first 5xx and never resume. Re-delivering by hand works, "
    + "so the endpoint is reachable."

  /// Longer than four rows, in lines of its own, so the growth does not depend on the width.
  private static let steps = [
    "Steps:",
    "1. Create a webhook endpoint that returns 502 once.",
    "2. Send a delivery.",
    "3. Watch the retry schedule stop instead of backing off.",
    "",
    "First failure 09:12 UTC, POST /hooks/deliveries.",
  ].joined(separator: "\n")

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("rest", expect: ["resize": "vertical"]) {
        PMTextarea(props: PMTextareaProps(ariaLabel: "Notes", placeholder: "What happened?"))
      },
      PMStateEntry("with a value") {
        PMTextarea(props: PMTextareaProps(ariaLabel: "Notes", defaultValue: Self.note))
      },
      PMStateEntry("invalid", expect: ["invalid": "true"]) {
        PMTextarea(
          props: PMTextareaProps(ariaLabel: "Notes", defaultValue: "Too short.", invalid: true))
      },
      PMStateEntry("disabled", expect: ["disabled": "true"]) {
        PMTextarea(
          props: PMTextareaProps(ariaLabel: "Notes", defaultValue: Self.note, disabled: true))
      },
      PMStateEntry("read only", expect: ["readonly": "true"]) {
        PMTextarea(
          props: PMTextareaProps(ariaLabel: "Notes", defaultValue: Self.note, readOnly: true))
      },
      PMStateEntry("taller — the height decision, in line units") {
        PMTextarea(props: PMTextareaProps(ariaLabel: "Notes", defaultValue: Self.note, rows: 8))
      },
      PMStateEntry("not resizable", expect: ["resize": "none"]) {
        PMTextarea(
          props: PMTextareaProps(
            ariaLabel: "Notes", defaultValue: Self.note, resize: PMTextareaResize.none))
      },
      PMStateEntry(
        "autosize — the box is as tall as what is in it",
        expect: ["autosize": "true", "resize": "none"]
      ) {
        PMTextarea(
          props: PMTextareaProps(ariaLabel: "Notes", autosize: true, defaultValue: Self.steps))
      },
      PMStateEntry(
        "autosize, with one line — `rows` is still the floor",
        expect: ["autosize": "true", "resize": "none"]
      ) {
        PMTextarea(
          props: PMTextareaProps(ariaLabel: "Notes", autosize: true, defaultValue: "It broke."))
      },
    ]
  }
}
