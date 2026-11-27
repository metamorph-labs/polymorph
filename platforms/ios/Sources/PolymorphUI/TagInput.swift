// TagInput (`design/components/tag-input.md`): free text entered as several
// values, each shown as a chip. Input's container in every state, the one
// field of the family that grows: the chips and the text entry wrap onto as
// many lines as they need, `space-1` apart, inside `space-1` and `space-2` of
// padding, at least the control height of `size` tall. A chip is the shared
// pill (`PMChip`) with its remove button; the text entry takes the rest of
// its line, at least half a `space-10` step wide.
//
// Return or a comma commits the typed text, and pasted text is split at commas
// and line breaks, its parts committed together, in order, and reported once.
// `validate` (trim and non-empty by default) gets the text as typed and returns
// the tag as it is stored, or `nil` to reject it: a rejection draws the field
// invalid for one control duration and keeps the text, with no message, because
// written errors are FormField's. A duplicate is never added; the chip it
// repeats flashes its `accent.bg` hairline instead. The parts past `max` are
// dropped, with the text after them, because a full field takes no text. With a
// hardware keyboard, Delete in the empty entry removes the last chip and Escape
// clears the text. At `max` the entry stays, focusable and named, but takes no
// more text; the chips stay removable. `onChange` reports the values in order;
// `onBlur` fires when the entry loses focus. A disabled field shows its chips
// without their remove buttons.
//
// The entry is named by `ariaLabel` or its FormField's label and described by
// the count, "{n} added" or "Maximum of {max} added", or the app's words from
// `countLabel`, then by the field's message, "Invalid" first while invalid. Each remove button is named by
// `removeLabel` ("Remove {tag}" by default), and a removal is announced in the
// words of `removedLabel`, "{tag} removed, {n} remain" by default. `name`,
// `id` and the `aria-*by` ids have no
// SwiftUI counterpart.

import PolymorphTokens
import SwiftUI

public struct PMTagInput: PMTagInputRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmField) private var field
  @FocusState private var focused: Bool
  @State private var draft: [String]
  @State private var text = ""
  @State private var refused = false
  @State private var flashing: String?
  private let props: PMTagInputProps

  public init(props: PMTagInputProps) {
    self.props = props
    _draft = State(initialValue: props.defaultValue ?? [])
  }

  public var body: some View {
    let size = props.size ?? .md
    let metrics = PMControlMetrics(size, theme)
    let space = theme.defaultDensity.space
    let disabled = props.disabled ?? false
    let invalid = (props.invalid ?? false) || (field?.invalid ?? false) || refused
    let tags = values
    let full = atMax
    // The entry's least width: a part of a `space-10` step.
    let least = space.s10 / PMRecipe.entryMinWidth
    // The entry's height: the field's, less its padding above and below.
    let line = metrics.height - space.s1 - space.s1

    PMFlowLayout(spacing: space.s1, lineSpacing: space.s1, lastMinWidth: least) {
      ForEach(tags, id: \.self) { tag in chip(tag, disabled: disabled) }
      textEntry(tags, metrics: metrics, disabled: disabled, invalid: invalid)
        .frame(minHeight: line)
    }
    .padding(.vertical, space.s1)
    .padding(.horizontal, space.s2)
    .frame(maxWidth: .infinity, minHeight: metrics.height, alignment: .leading)
    .modifier(
      PMFieldBox(invalid: invalid, disabled: disabled, readOnly: full, focused: focused))
    .pmHitTarget()
    // A tap in the field outside a chip's remove button focuses the entry.
    .pmOpensOnTap(!disabled) { focused = true }
    .onChange(of: focused) { _, now in if !now { props.onBlur?() } }
    .accessibilityElement(children: .contain)
    .pmMember(
      "TagInput", attributes(size, invalid: invalid, disabled: disabled, full: full))
    .preference(key: PMFieldControlKey.self, value: PMFieldControl(disabled: disabled))
  }

  /// A tag's chip, with its remove button unless the field is disabled.
  private func chip(_ tag: String, disabled: Bool) -> PMChip {
    let label = props.removeLabel?(tag) ?? PMStrings.tagInputRemove(tag: tag)
    var chip = PMChip(label: tag, removeLabel: label, flashing: flashing == tag)
    if !disabled { chip.onRemove = { removeTag(tag) } }
    return chip
  }

  /// The one text entry: named by the field, described by the count.
  private func textEntry(
    _ tags: [String], metrics: PMControlMetrics, disabled: Bool, invalid: Bool
  ) -> some View {
    let colors = theme.colors
    let prompt: Text? =
      tags.isEmpty ? props.placeholder.map { Text($0).foregroundStyle(colors.textMuted.color) } : nil
    let hint = [count(tags), field?.hint].compactMap { $0 }
    return TextField(name ?? "", text: $text, prompt: prompt)
      .textFieldStyle(.plain)
      .pmTextStyle(metrics.text)
      .foregroundStyle((disabled ? colors.textDisabled : colors.textPrimary).color)
      .tint(colors.accentText.color)
      .focused($focused)
      .pmFocusWhenNamed($focused)
      .disabled(disabled)
      .modifier(PMTextEntry(type: .text, autoComplete: "off"))
      .pmEntryName(name)
      .onSubmit(commitText)
      .onChange(of: text) { _, next in take(next) }
      .onKeyPress(.delete) {
        guard text.isEmpty, let last = values.last else { return .ignored }
        removeTag(last)
        return .handled
      }
      .onKeyPress(.escape) {
        text = ""
        return .handled
      }
      .pmFieldHint(invalid: invalid, hint.joined(separator: ", "))
  }

  /// The count sentence: the app's, from `countLabel`, or the string catalog's.
  private func count(_ tags: [String]) -> String {
    let facts = PMTagInputCountFacts(count: Double(tags.count), max: props.max, atMax: atMax)
    return props.countLabel?(facts) ?? PMStrings.tagInputCount(tags.count, max: props.max)
  }

  /// The tags: the controlled `value` when given, otherwise the field's own.
  private var values: [String] {
    props.value ?? draft
  }

  private var atMax: Bool {
    props.max.map { Double(values.count) >= $0 } ?? false
  }

  /// Takes the typed text as it changes. A comma or a line break commits
  /// what comes before it, and a part a rejection leaves stays in the entry,
  /// without its separator, before the text after the last separator; a full
  /// field takes no text. The text is written back after the field's own
  /// change, because a field does not show a value its binding is given while
  /// it is reporting one.
  private func take(_ next: String) {
    guard !atMax else {
      if !next.isEmpty { text = "" }
      return
    }
    let parts = next.split(
      omittingEmptySubsequences: false, whereSeparator: { $0 == "," || $0.isNewline }
    ).map(String.init)
    guard parts.count > 1 else { return }
    let added = add(parts.dropLast())
    text =
      added.full
      ? "" : (added.kept + [parts.last ?? ""]).filter { !$0.isEmpty }.joined(separator: " ")
  }

  private func commitText() {
    if add([text]).kept.isEmpty { text = "" }
  }

  /// Adds each of `raws` as validated, in order, and reports the values once.
  /// Returns the texts a rejection keeps, and whether the field is now full;
  /// the texts past `max` are dropped. `validate` gets the text as typed, as
  /// the web's does; without it the text is trimmed and kept unless it is
  /// empty. Blank text adds nothing and is no rejection, and a duplicate is
  /// pointed at rather than added.
  private func add(_ raws: some Sequence<String>) -> (kept: [String], full: Bool) {
    let full = { (tags: [String]) in props.max.map { Double(tags.count) >= $0 } ?? false }
    var next = values
    var kept: [String] = []
    var duplicate: String?
    for raw in raws {
      if full(next) { break }
      let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
      if trimmed.isEmpty { continue }
      guard let tag = props.validate.map({ $0(raw) }) ?? trimmed else {
        kept.append(raw)
        continue
      }
      if next.contains(tag) {
        duplicate = tag
        continue
      }
      next.append(tag)
    }
    if !kept.isEmpty { flashRefusal() }
    if let duplicate {
      flashing = duplicate
      after { flashing = nil }
    }
    if next != values {
      draft = next
      props.onChange?(next)
    }
    return (kept, full(next))
  }

  /// Removes `tag` and says so, because a person using VoiceOver does not see
  /// the chip leave.
  private func removeTag(_ tag: String) {
    let next = values.filter { $0 != tag }
    draft = next
    props.onChange?(next)
    AccessibilityNotification.Announcement(removal(of: tag, remain: next.count)).post()
  }

  /// What the removal of `tag` announces, with `remain` tags left: the app's
  /// words from `removedLabel`, or the string catalog's.
  func removal(of tag: String, remain: Int) -> String {
    let count = Double(remain)
    return props.removedLabel?(tag, count) ?? PMStrings.tagInputRemoved(tag: tag, count: count)
  }

  /// The refusal: the field drawn invalid for one control duration.
  private func flashRefusal() {
    refused = true
    after { refused = false }
  }

  private func after(_ end: @escaping @MainActor () -> Void) {
    let duration = max(theme.defaultMotion.duration.control, .ulpOfOne)
    Task { @MainActor in
      try? await Task.sleep(for: .seconds(duration))
      end()
    }
  }

  private var name: String? {
    props.ariaLabel ?? field?.label ?? props.placeholder
  }

  private func attributes(_ size: PMControlSize, invalid: Bool, disabled: Bool, full: Bool)
    -> [String: String]
  {
    var attributes = ["size": size.rawValue, "count": String(values.count)]
    if invalid { attributes["invalid"] = "true" }
    if disabled { attributes["disabled"] = "true" }
    if full { attributes["state"] = "at-max" }
    return attributes
  }
}

/// TagInput's states, from the spec's States table.
public struct TagInputStates: PMStates {
  public let member = "TagInput"

  public init() {}

  private static let labels = ["billing", "refund", "vip"]
  private static let long = [
    "enterprise-onboarding", "billing-dispute", "refund-requested", "vip-account",
    "sla-breach-risk", "duplicate-charge", "needs-engineering", "follow-up-friday",
  ]

  public var entries: [PMStateEntry] {
    let sizes = [PMControlSize.sm, .lg].map { size in
      PMStateEntry("size \(size.rawValue)", expect: ["size": size.rawValue]) {
        PMTagInput(props: PMTagInputProps(ariaLabel: "Labels", defaultValue: Self.labels, size: size))
      }
    }
    return [
      PMStateEntry("empty", expect: ["count": "0", "size": "md"]) {
        PMTagInput(props: PMTagInputProps(ariaLabel: "Labels", placeholder: "Add a label…"))
      },
      PMStateEntry("with chips", expect: ["count": "3"]) {
        PMTagInput(props: PMTagInputProps(ariaLabel: "Labels", defaultValue: Self.labels))
      },
      PMStateEntry("wrapped — the field grew", expect: ["count": "8"]) {
        PMTagInput(props: PMTagInputProps(ariaLabel: "Labels", defaultValue: Self.long))
      },
      PMStateEntry("at max — the entry kept, taking no text", expect: ["state": "at-max"]) {
        PMTagInput(
          props: PMTagInputProps(ariaLabel: "Labels", defaultValue: Self.labels, max: 3))
      },
    ] + sizes + [
      PMStateEntry("invalid", expect: ["invalid": "true"]) {
        PMTagInput(
          props: PMTagInputProps(ariaLabel: "Labels", defaultValue: Self.labels, invalid: true))
      },
      PMStateEntry("disabled — no remove buttons", expect: ["disabled": "true"]) {
        PMTagInput(
          props: PMTagInputProps(ariaLabel: "Labels", defaultValue: Self.labels, disabled: true))
      },
    ]
  }
}
