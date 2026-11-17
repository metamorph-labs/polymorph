// ChoiceCard (`design/components/choice-card.md`): RadioGroup's or
// CheckboxGroup's choice drawn as cards with room for a description. `mode`
// says which: `.single` holds one value and cannot be cleared once chosen,
// `.multiple` holds any number, `[]` included, reported in the options' order.
// The value is a `PMChoiceValue`, `.single` or `.multiple` by the mode; a
// value of the other case is read as its nearest.
//
// Each option is a card, Card's surface without its shadow: `bg.surface` in a
// `border.subtle` hairline, `radius.lg`, `space-6` inside; its icon (`md`,
// `text.secondary`) on top, `space-3` above the label in `text.sm`, and the
// description under it in `text.xs` `text.muted`, `space-1` apart. Under the
// pointer an unchecked card takes `bg.subtle` and nothing else. Checked, it
// takes the accent wash and an `accent.bg` hairline of the same width, and the
// `confirm` glyph in `accent.text` at its top trailing corner, `space-4` in;
// the copy always keeps that lane clear, so nothing moves when the glyph
// appears. The glyph is the selection, never the colour alone. A disabled card
// is `bg.subtle` in `border.subtle` with `text.disabled` copy, and keeps its
// glyph, dimmed, when checked. The glyph pops in on the `snappy` spring and
// fades out, as Checkbox's indicator.
//
// The cards are laid out by Grid with a `space-4` gap: `columns` (1 by
// default) is a ceiling the width resolves, so a phone shows one column.
// Each card is one button, named by its label and described by its
// description, with the selected trait while checked; the group is named by
// `label`.

import PolymorphTokens
import SwiftUI

public struct PMChoiceCard: PMChoiceCardRendering {
  @Environment(\.pmTheme) private var theme
  @State private var draft: [String]
  private let props: PMChoiceCardProps

  public init(props: PMChoiceCardProps) {
    self.props = props
    _draft = State(initialValue: Self.values(props.defaultValue))
  }

  public var body: some View {
    let disabled = props.disabled ?? false
    let current = checked
    let columns = PMGridColumns(rawValue: (props.columns ?? .columns1).rawValue) ?? .columns1

    PMGrid(
      props: PMGridProps(
        children: PMContent(
          ForEach(props.options, id: \.value) { option in
            let on = current.contains(option.value)
            Button {
              toggle(option.value)
            } label: {
              PMChoiceCardCopy(option: option)
            }
            .buttonStyle(PMChoiceCardStyle(checked: on))
            .disabled(disabled || option.disabled == true)
            .accessibilityLabel(Text(option.label))
            .pmAccessibilityHint(option.description)
            .accessibilityAddTraits(on ? .isSelected : [])
          }), columns: columns, gap: .s4))
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Text(props.label))
    .pmMember("ChoiceCard", attributes(current, disabled: disabled, columns: columns))
  }

  private var multiple: Bool { props.mode == .multiple }

  /// The checked values, in the options' order: the controlled `value` when
  /// given, otherwise the group's own. A single value is at most one.
  private var checked: [String] {
    let values = props.value.map(Self.values) ?? draft
    let ordered = props.options.map(\.value).filter(values.contains)
    return multiple ? ordered : Array(ordered.prefix(1))
  }

  private static func values(_ value: PMChoiceValue?) -> [String] {
    switch value {
    case .single(let one): one.isEmpty ? [] : [one]
    case .multiple(let many): many
    case nil: []
    }
  }

  private func toggle(_ value: String) {
    var next: [String]
    if multiple {
      var values = Set(checked)
      if values.contains(value) { values.remove(value) } else { values.insert(value) }
      next = props.options.map(\.value).filter(values.contains)
    } else {
      // A single choice cannot be cleared: choosing the chosen card does nothing.
      guard !checked.contains(value) else { return }
      next = [value]
    }
    draft = next
    props.onChange?(multiple ? .multiple(next) : .single(value))
  }

  private func attributes(_ current: [String], disabled: Bool, columns: PMGridColumns)
    -> [String: String]
  {
    var attributes = [
      "mode": props.mode.rawValue, "columns": String(columns.rawValue),
      "checked": String(current.count),
    ]
    if disabled { attributes["disabled"] = "true" }
    return attributes
  }
}

/// A card's copy: the icon on top, the label, and the description, with the
/// glyph's lane kept clear at the trailing edge.
private struct PMChoiceCardCopy: View {
  @Environment(\.pmTheme) private var theme
  @Environment(\.isEnabled) private var enabled
  let option: PMChoiceCardOption

  var body: some View {
    let space = theme.defaultDensity.space
    let colors = theme.colors
    VStack(alignment: .leading, spacing: 0) {
      if let icon = option.icon {
        PMIconView(icon, size: .md)
          .foregroundStyle((enabled ? colors.textSecondary : colors.textDisabled).color)
          .padding(.bottom, space.s3)
      }
      Text(option.label)
        .pmTextStyle(theme.text.sm)
        .foregroundStyle((enabled ? colors.textPrimary : colors.textDisabled).color)
      if let description = option.description {
        Text(description)
          .pmTextStyle(theme.text.xs)
          .foregroundStyle((enabled ? colors.textMuted : colors.textDisabled).color)
          .padding(.top, space.s1)
      }
    }
    .multilineTextAlignment(.leading)
    .fixedSize(horizontal: false, vertical: true)
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.trailing, theme.icon.size.md + space.s2)
  }
}

private struct PMChoiceCardStyle: ButtonStyle {
  let checked: Bool

  func makeBody(configuration: Configuration) -> some View {
    PMChoiceCardSurface(checked: checked, pressed: configuration.isPressed) {
      configuration.label
    }
  }
}

/// The card: the surface by state and the glyph.
private struct PMChoiceCardSurface<Label: View>: View {
  @Environment(\.pmTheme) private var theme
  @Environment(\.isEnabled) private var enabled
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var hovering = false
  let checked: Bool
  let pressed: Bool
  @ViewBuilder let label: () -> Label

  var body: some View {
    let space = theme.defaultDensity.space
    let colors = theme.colors
    let motion = theme.defaultMotion
    let shape = RoundedRectangle(cornerRadius: theme.radius.lg)
    let fill =
      !enabled
      ? colors.bgSubtle : checked ? colors.accentSubtle : hovering || pressed ? colors.bgSubtle : colors.bgSurface
    let border = !enabled ? colors.borderSubtle : checked ? colors.accentBg : colors.borderSubtle

    label()
      .padding(space.s6)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      .background(fill.color, in: shape)
      .overlay { shape.strokeBorder(border.color, lineWidth: 1) }
      .overlay(alignment: .topTrailing) {
        if checked {
          PMIconView(.confirm, size: .md)
            .foregroundStyle((enabled ? colors.accentText : colors.textDisabled).color)
            .padding(space.s4)
            .transition(
              reduceMotion
                ? .opacity
                : .asymmetric(
                  insertion: .scale(scale: 0.5).combined(with: .opacity), removal: .opacity))
        }
      }
      .contentShape(shape)
      .animation(motion.spring.snappy.animation, value: checked)
      .animation(
        motion.easing.standard.animation(duration: motion.duration.control),
        value: hovering || pressed)
      .onHover { hovering = $0 }
  }
}

/// ChoiceCard's states, from the spec's States table.
public struct ChoiceCardStates: PMStates {
  public let member = "ChoiceCard"

  public init() {}

  private static let plans = [
    PMChoiceCardOption(
      value: "starter", label: "Starter", description: "For side projects and solo queues"),
    PMChoiceCardOption(
      value: "team", label: "Team", description: "Shared inboxes for up to 20 agents"),
    PMChoiceCardOption(
      value: "scale", label: "Scale", description: "SSO, audit log, unlimited agents"),
  ]

  private static let channels = [
    PMChoiceCardOption(
      value: "email", label: "Email", description: "Every public reply, in your inbox",
      icon: .inbox),
    PMChoiceCardOption(
      value: "inapp", label: "In-app", description: "Badges in the sidebar as it happens",
      icon: .notification),
    PMChoiceCardOption(
      value: "chat", label: "Chat", description: "Mirror threads to your chat tool",
      icon: .comment),
    PMChoiceCardOption(
      value: "webhook", label: "Webhook", description: "POST every event to your endpoint",
      icon: .link),
  ]

  public var entries: [PMStateEntry] {
    let webhookOff = Self.channels.map { option in
      PMChoiceCardOption(
        value: option.value, label: option.label,
        description: option.value == "webhook" ? "Available on Scale" : option.description,
        icon: option.icon, disabled: option.value == "webhook")
    }
    return [
      PMStateEntry(
        "single 3-up", expect: ["mode": "single", "checked": "1", "label": "Plan"]
      ) {
        PMChoiceCard(
          props: PMChoiceCardProps(
            columns: .columns3, defaultValue: .single("team"), label: "Plan", mode: .single,
            options: Self.plans))
      },
      PMStateEntry("multiple, two selected", expect: ["mode": "multiple", "checked": "2"]) {
        PMChoiceCard(
          props: PMChoiceCardProps(
            defaultValue: .multiple(["email", "inapp"]), label: "Channels", mode: .multiple,
            options: Self.channels))
      },
      PMStateEntry("descriptions and icons", expect: ["checked": "0"]) {
        PMChoiceCard(
          props: PMChoiceCardProps(label: "Channels", mode: .multiple, options: Self.channels))
      },
      PMStateEntry("disabled option", expect: ["checked": "1"]) {
        PMChoiceCard(
          props: PMChoiceCardProps(
            defaultValue: .multiple(["email"]), label: "Channels", mode: .multiple,
            options: webhookOff))
      },
      PMStateEntry("2-column — the ceiling the width resolves", expect: ["columns": "2"]) {
        PMChoiceCard(
          props: PMChoiceCardProps(
            columns: .columns2, defaultValue: .multiple(["chat"]), label: "Channels",
            mode: .multiple, options: Self.channels))
      },
    ]
  }
}
