// InlineEdit (`design/components/inline-edit.md`): a short value shown as
// text, with an edit control beside it, that becomes a field where it stands,
// as a title is renamed in place on iOS. It composes Input and three Buttons.
//
// Reading, it is the value in the size's text step (`text.xs` at `sm`,
// `text.sm` at `md`, `text.md` at `lg`), `text.primary`, or the placeholder in
// `text.muted`, its first line centred on the control height, wrapping rather
// than truncating; then the edit control, Button's ghost neutral icon-only
// `edit`, named by `messages.edit(label)` and carrying the value as its
// VoiceOver value, so a reader who returns to it after a save hears the new
// value. `valueHidden` draws the edit control alone, because a heading beside
// the member draws the value. Open, it is a row of the Input, filling the
// row, Button's soft accent icon-only `confirm` (save) and ghost neutral
// icon-only `close` (cancel), `space-2` apart, and the app's `error` under it
// as FormField draws an error (`PMFieldErrorRow`). Both forms are one control
// height at the member's size, so a one-line value does not move what is
// below it.
//
// The edit control opens the field with the value in it and keyboard focus
// in it; a member that appears open takes no focus. The keyboard's return key
// is Done, and Done and the save control save: an unchanged text closes the
// field and reports nothing, a blank text under `required` does nothing (save
// is disabled), and any other text is reported once through `onCommit`, as
// typed. An uncontrolled field then closes; a controlled one (`editing`)
// stays open until the app closes it. Escape and the cancel control close the
// field and report nothing. Leaving the field neither saves nor cancels.
// While `pending`, the field is Input's read-only form, save shows Button's
// loading, cancel is disabled and Escape does nothing; when `pending` clears
// with the field open, keyboard focus goes back to the field if it was in the
// member. When the field closes after the reader saved or cancelled, keyboard
// focus, and VoiceOver's while it runs, goes to the edit control.
//
// The field is named by `label` and says `error` as its hint while it shows,
// through the field context Input reads from a FormField; `required` has no
// trait on iOS. The error is announced politely when it arrives, as the web's
// live region does. SwiftUI's text field has no selection API before iOS 18,
// so the field opens with the caret after the text, not with the text
// selected, and has no read-only mode, so focus leaves the field while a save
// waits (`PLATFORM_GAPS` in `packages/native/src/pending.ts`). The `aria-*by`
// ids have no SwiftUI counterpart.

import PolymorphTokens
import SwiftUI

public struct PMInlineEdit: PMInlineEditRendering {
  @Environment(\.pmTheme) private var theme
  @State private var mirror: Bool
  @State private var draft: String
  /// Whether the field takes keyboard focus when it appears: when the reader
  /// opened it, and when a failed save gives it back.
  @State private var takesFocus = false
  /// Whether keyboard focus is in the field.
  @State private var within = false
  /// Whether focus was in the field when a save started waiting.
  @State private var heldDuringSave = false
  /// A new field each time focus should go back into it.
  @State private var generation = 0
  @FocusState private var editFocused: Bool
  @AccessibilityFocusState private var editSpoken: Bool
  private let props: PMInlineEditProps

  public init(props: PMInlineEditProps) {
    self.props = props
    _mirror = State(initialValue: props.defaultEditing ?? false)
    _draft = State(initialValue: props.value)
  }

  public var body: some View {
    let size = props.size ?? .md
    let disabled = props.disabled ?? false
    let open = props.editing ?? mirror

    Group {
      if open {
        panel(size: size, disabled: disabled)
      } else {
        reading(size: size, disabled: disabled)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .onChange(of: open) { _, now in
      if now {
        draft = props.value
      } else if takesFocus || within {
        editFocused = true
        editSpoken = true
      }
      takesFocus = false
    }
    .onChange(of: props.pending ?? false) { _, waiting in
      if waiting {
        heldDuringSave = within
      } else if heldDuringSave, open {
        takesFocus = true
        generation += 1
      }
    }
    .accessibilityElement(children: .contain)
    .pmMember("InlineEdit", attributes(size, disabled: disabled, open: open))
  }

  /// The value, or the placeholder, and the edit control.
  private func reading(size: PMControlSize, disabled: Bool) -> some View {
    let metrics = PMControlMetrics(size, theme)
    let step = PMInlineEdit.step(size, theme)
    let empty = props.value.isEmpty
    let messages = props.messages ?? PMStrings.inlineEditMessages
    // Half of the control height less one line, so the first line is centred
    // on the edit control.
    let inset = Swift.max(0, metrics.height - step.lineBox) / 2

    return HStack(alignment: .top, spacing: theme.defaultDensity.space.s2) {
      if props.valueHidden != true {
        Text(empty ? props.placeholder ?? "" : props.value)
          .pmTextStyle(step)
          .foregroundStyle((empty ? theme.colors.textMuted : theme.colors.textPrimary).color)
          .fixedSize(horizontal: false, vertical: true)
          .padding(.vertical, inset)
          .layoutPriority(1)
      }
      PMButton(
        props: PMButtonProps(
          disabled: disabled, icon: .edit, iconOnly: true, label: messages.edit(props.label),
          onClick: { open(by: true) }, size: size, appearance: .ghostNeutral))
      .accessibilityValue(Text(props.value))
      .focused($editFocused)
      .modifier(PMSpokenFocus(spoken: $editSpoken))
    }
  }

  /// The field, save and cancel, and the error under them.
  private func panel(size: PMControlSize, disabled: Bool) -> some View {
    let space = theme.defaultDensity.space
    let pending = props.pending ?? false
    let error = props.error ?? ""
    let invalid = !error.isEmpty
    let refused = (props.required ?? false) && draft.trimmingCharacters(in: .whitespaces).isEmpty
    let messages = props.messages ?? PMStrings.inlineEditMessages

    return VStack(alignment: .leading, spacing: space.s2) {
      HStack(spacing: space.s2) {
        PMInput(
          props: PMInputProps(
            autoFocus: takesFocus, disabled: disabled, maxLength: props.maxLength,
            onBlur: { within = false }, onChange: { draft = $0 }, onFocus: { within = true },
            placeholder: props.placeholder, readOnly: pending, size: size, value: draft)
        )
        .environment(
          \.pmField,
          PMFieldContext(
            label: props.label, hint: invalid ? error : nil, required: props.required ?? false,
            invalid: invalid)
        )
        .id(generation)
        .frame(maxWidth: .infinity)
        PMButton(
          props: PMButtonProps(
            disabled: disabled || refused, icon: .confirm, iconOnly: true, label: messages.save,
            loading: pending, onClick: commit, size: size, appearance: .softAccent))
        PMButton(
          props: PMButtonProps(
            disabled: disabled || pending, icon: .close, iconOnly: true, label: messages.cancel,
            onClick: cancel, size: size, appearance: .ghostNeutral))
      }
      if invalid {
        PMFieldErrorRow(text: error)
      }
    }
    .submitLabel(.done)
    .onSubmit(commit)
    .onKeyPress(.escape) {
      cancel()
      return .handled
    }
    .pmLiveAnnouncement(invalid ? error : nil, assertive: false)
  }

  /// The edit control's press: the field opens, holding the value, with
  /// focus in it.
  private func open(by reader: Bool) {
    takesFocus = reader
    draft = props.value
    setOpen(true)
  }

  /// Save: nothing while a save waits or a blank text is refused, a close for
  /// an unchanged text, and otherwise the text as typed, once.
  private func commit() {
    let refused = (props.required ?? false) && draft.trimmingCharacters(in: .whitespaces).isEmpty
    if props.pending == true || refused { return }
    takesFocus = true
    if draft == props.value {
      setOpen(false)
      return
    }
    props.onCommit(draft)
    if props.editing == nil { setOpen(false) }
  }

  /// Cancel: the field closes and reports nothing, except while a save waits.
  private func cancel() {
    if props.pending == true { return }
    takesFocus = true
    setOpen(false)
  }

  private func setOpen(_ next: Bool) {
    mirror = next
    props.onEditingChange?(next)
  }

  /// The value's text step at each size (conventions §2).
  static func step(_ size: PMControlSize, _ theme: PMTheme) -> PMTextStyle {
    switch size {
    case .sm: theme.text.xs
    case .md: theme.text.sm
    case .lg: theme.text.md
    }
  }

  private func attributes(_ size: PMControlSize, disabled: Bool, open: Bool) -> [String: String] {
    var attributes = ["size": size.rawValue]
    if disabled { attributes["disabled"] = "true" }
    if open { attributes["editing"] = "true" }
    if props.valueHidden == true { attributes["value-hidden"] = "true" }
    return attributes
  }
}

/// Where VoiceOver goes when the field closes: the edit control. The binding
/// is held only while VoiceOver runs, because `ImageRenderer` draws nothing of
/// a view that carries one.
private struct PMSpokenFocus: ViewModifier {
  @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver
  let spoken: AccessibilityFocusState<Bool>.Binding

  func body(content: Content) -> some View {
    if voiceOver {
      content.accessibilityFocused(spoken)
    } else {
      content
    }
  }
}

/// InlineEdit's states, from the spec's States table.
public struct InlineEditStates: PMStates {
  public let member = "InlineEdit"

  public init() {}

  private static let label = "Project name"
  private static let value = "Acme billing"

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("rest", expect: ["size": "md", "editing": ""]) {
        PMInlineEdit(props: PMInlineEditProps(label: Self.label, onCommit: { _ in }, value: Self.value))
      },
      PMStateEntry("empty — the placeholder, muted", expect: ["editing": ""]) {
        PMInlineEdit(
          props: PMInlineEditProps(
            label: Self.label, onCommit: { _ in }, placeholder: "Name this project", value: ""))
      },
      PMStateEntry("editing", expect: ["editing": "true", "contains": "Input,Button"]) {
        PMInlineEdit(
          props: PMInlineEditProps(
            defaultEditing: true, label: Self.label, onCommit: { _ in }, value: Self.value))
      },
      PMStateEntry(
        "pending — the field read-only, save busy, cancel disabled",
        expect: ["editing": "true", "contains": "Input[readonly=true],Button[state=loading]"]
      ) {
        PMInlineEdit(
          props: PMInlineEditProps(
            defaultEditing: true, label: Self.label, onCommit: { _ in }, pending: true,
            value: Self.value))
      },
      PMStateEntry(
        "failed — the error under the field, tied to it",
        expect: ["editing": "true", "contains": "Input[invalid=true]"]
      ) {
        PMInlineEdit(
          props: PMInlineEditProps(
            defaultEditing: true, error: "A project with this name already exists.",
            label: Self.label, onCommit: { _ in }, value: Self.value))
      },
      PMStateEntry(
        "required, blank — save disabled",
        expect: ["editing": "true", "contains": "Button[disabled=true]"]
      ) {
        PMInlineEdit(
          props: PMInlineEditProps(
            defaultEditing: true, label: Self.label, onCommit: { _ in }, required: true, value: ""))
      },
      PMStateEntry("disabled", expect: ["disabled": "true"]) {
        PMInlineEdit(
          props: PMInlineEditProps(
            disabled: true, label: Self.label, onCommit: { _ in }, value: Self.value))
      },
      PMStateEntry("size sm", expect: ["size": "sm"]) {
        PMInlineEdit(
          props: PMInlineEditProps(label: Self.label, onCommit: { _ in }, size: .sm, value: Self.value))
      },
      PMStateEntry("size lg", expect: ["size": "lg"]) {
        PMInlineEdit(
          props: PMInlineEditProps(label: Self.label, onCommit: { _ in }, size: .lg, value: Self.value))
      },
      PMStateEntry("long value — it wraps, and the field fills the width it is given") {
        PMInlineEdit(
          props: PMInlineEditProps(
            label: Self.label, onCommit: { _ in },
            value: "Acme billing reconciliation for the northern region, second quarter"))
      },
      PMStateEntry("value hidden — the edit control alone", expect: ["value-hidden": "true"]) {
        PMInlineEdit(
          props: PMInlineEditProps(
            label: Self.label, onCommit: { _ in }, size: .lg, value: Self.value, valueHidden: true))
      },
    ]
  }
}
