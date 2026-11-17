// Rating (`design/components/rating.md`): a score out of a small whole number,
// drawn as a row of stars, five by default. SwiftUI has no rating control, so
// a set rating is a row of buttons and a shown rating (`readOnly`) one image.
// The model is the engine's (`PMRatingModel`): a control holds a whole mark
// from 1 to `max` or nothing, a shown rating any value from 0 to `max` to one
// decimal place, and `max` is held from 2 to 10.
//
// Each mark draws the `rating` role at `size` twice: the outline in
// `text.muted`, and over it the filled symbol (`star.fill`, the role's symbol
// in its fill variant) in `accent.text`, whole, or cut to its share from the
// leading edge in a shown rating, so a right-to-left row fills from the right.
// Filled and empty differ in shape, not in colour alone. An invalid control's
// outlines are `danger.text`; a disabled one's outlines and fills are
// `text.disabled`. A control's marks are each the hit target square and
// touch, and a row wider than its container wraps onto another line, because
// ten 44-point marks are wider than a phone (`rating.md`, "On iOS and
// Android"); a shown rating's marks are the glyph's size and `space-1` apart.
// Under a pointer, the hovered mark's outline and every
// one before it take `accent.text`, over the control duration on the standard
// easing (the hover reach); a fill appears and goes at once.
//
// A control is a group named by `label`, or its FormField's label, that says
// "Invalid" and the field's message as its hint. Each mark is a button named
// by `messages.mark` ("3 stars"), with the selected trait on the mark the
// rating holds, as iOS has no radio role. A press chooses the mark, and a
// press on the chosen mark clears the rating unless it is required
// (`ariaRequired`, or its FormField's `required`). Each mark is also
// adjustable: VoiceOver's increment and decrement choose the next or the
// previous mark, stopping at either end, and move VoiceOver to it, as the
// web's arrows choose and move focus. iOS's own buttons take no arrow keys,
// so a hardware keyboard moves between the marks and presses one, as it does
// in RadioGroup. `onChange` runs once for each change. A shown rating is one
// image named by `messages.shown` ("Average rating: 4.3 out of 5"). The
// numerals are written in `locale`, or the environment's. `name`, `id` and the
// `aria-*by` ids have no SwiftUI counterpart.

import PolymorphTokens
import SwiftUI

public struct PMRating: PMRatingRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmField) private var field
  @Environment(\.locale) private var environmentLocale
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var draft: Double?
  @State private var hovered: Int?
  @AccessibilityFocusState private var spoken: Int?
  private let props: PMRatingProps

  public init(props: PMRatingProps) {
    self.props = props
    _draft = State(initialValue: props.defaultValue ?? nil)
  }

  public var body: some View {
    let readOnly = props.readOnly ?? false
    let model = PMRatingModel(
      value: props.value ?? draft, label: props.label, max: props.max, readOnly: readOnly,
      locale: props.locale.map(Locale.init(identifier:)) ?? environmentLocale,
      messages: props.messages)
    let size = props.size ?? .md
    if readOnly {
      shown(model, size: size)
    } else {
      control(model, size: size)
    }
  }

  /// The image: the marks `space-1` apart, named by one sentence.
  private func shown(_ model: PMRatingModel, size: PMControlSize) -> some View {
    HStack(spacing: theme.defaultDensity.space.s1) {
      ForEach(model.marks, id: \.value) { mark in
        glyph(mark, size: size, outline: theme.colors.textMuted, fill: theme.colors.accentText)
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(model.sentence))
    .accessibilityAddTraits(.isImage)
    .pmMember("Rating", ["size": size.rawValue, "readonly": "true"])
  }

  /// The group of marks, each a button the hit target square.
  private func control(_ model: PMRatingModel, size: PMControlSize) -> some View {
    let disabled = props.disabled ?? false
    let invalid = (props.invalid ?? false) || (field?.invalid ?? false)
    let required = (props.ariaRequired ?? false) || (field?.required ?? false)
    let held = model.value.map { Int($0) }
    let marks = {
      self.marks(
        model, size: size, held: held, disabled: disabled, invalid: invalid, required: required)
    }

    // A row of marks that touch, which wraps onto another line where the
    // container is narrower than the marks' hit targets.
    return ViewThatFits(in: .horizontal) {
      HStack(spacing: 0) { marks() }.fixedSize()
      PMFlowLayout(spacing: 0, lineSpacing: 0) { marks() }
    }
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Text(field?.label ?? props.label))
    .pmFieldHint(invalid: invalid, field?.hint)
    .pmFocusWhenNamed()
    .pmMember(
      "Rating",
      attributes(held, size: size, disabled: disabled, invalid: invalid, required: required))
    .preference(key: PMFieldControlKey.self, value: PMFieldControl(disabled: disabled))
  }

  /// Each mark a button the hit target square, the glyph centred in it.
  private func marks(
    _ model: PMRatingModel, size: PMControlSize, held: Int?, disabled: Bool, invalid: Bool,
    required: Bool
  ) -> some View {
    let target = theme.defaultDensity.hitTarget
    let motion = theme.defaultMotion

    return ForEach(model.marks, id: \.value) { mark in
        let reached = !disabled && (hovered ?? 0) >= mark.value
        Button {
          settle(PMRatingModel.press(mark.value, holding: held, required: required))
        } label: {
          glyph(
            mark, size: size,
            outline: outline(disabled: disabled, invalid: invalid, reached: reached),
            fill: disabled ? theme.colors.textDisabled : theme.colors.accentText
          )
          .animation(
            reduceMotion
              ? nil : motion.easing.standard.animation(duration: motion.duration.control),
            value: reached)
          .frame(width: target, height: target)
          .contentShape(.rect)
        }
        .buttonStyle(PMRatingMarkStyle())
        .disabled(disabled)
        .onHover { inside in
          if inside {
            hovered = mark.value
          } else if hovered == mark.value {
            hovered = nil
          }
        }
        .accessibilityLabel(Text(mark.name))
        .accessibilityAddTraits(mark.value == held ? .isSelected : [])
        .accessibilityAdjustableAction { direction in
          guard !disabled else { return }
          let next: Int
          switch direction {
          case .increment: next = PMRatingModel.step(from: mark.value, forward: true, max: model.max)
          case .decrement: next = PMRatingModel.step(from: mark.value, forward: false, max: model.max)
          @unknown default: return
          }
          settle(next)
          spoken = next
        }
        .modifier(PMRatingSpokenFocus(spoken: $spoken, value: mark.value))
    }
  }

  /// A mark's drawing: the outline, and the filled symbol over it, whole or
  /// cut to the share the value covers from the leading edge.
  private func glyph(
    _ mark: PMRatingModel.Mark, size: PMControlSize, outline: PMDynamicColor, fill: PMDynamicColor
  ) -> some View {
    ZStack {
      PMIconView(.rating, size: size)
        .foregroundStyle(outline.color)
      if mark.fill != .none {
        PMIconView(.rating, size: size)
          .symbolVariant(.fill)
          .foregroundStyle(fill.color)
          .mask(alignment: .leading) {
            Rectangle().scaleEffect(x: mark.share, y: 1, anchor: .leading)
          }
      }
    }
  }

  /// The outline's colour: disabled first, then the hover reach, then invalid.
  private func outline(disabled: Bool, invalid: Bool, reached: Bool) -> PMDynamicColor {
    if disabled { return theme.colors.textDisabled }
    if reached { return theme.colors.accentText }
    return invalid ? theme.colors.dangerText : theme.colors.textMuted
  }

  /// Reports a choice only when it changes what the rating holds.
  private func settle(_ next: Int?) {
    let holding = (props.value ?? draft).flatMap { value in
      PMRatingModel.held(value, max: PMRatingModel.count(props.max), readOnly: false)
    }
    guard next.map(Double.init) != holding else { return }
    draft = next.map(Double.init)
    props.onChange?(next.map(Double.init))
  }

  private func attributes(
    _ held: Int?, size: PMControlSize, disabled: Bool, invalid: Bool, required: Bool
  ) -> [String: String] {
    var attributes = ["size": size.rawValue]
    if let held { attributes["checked"] = String(held) }
    if disabled { attributes["disabled"] = "true" }
    if invalid { attributes["invalid"] = "true" }
    if required { attributes["required"] = "true" }
    return attributes
  }
}

/// Where VoiceOver goes after an increment or a decrement: the mark it
/// chose. The binding is held only while VoiceOver runs, because
/// `ImageRenderer` draws nothing of a view that carries one.
private struct PMRatingSpokenFocus: ViewModifier {
  @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver
  let spoken: AccessibilityFocusState<Int?>.Binding
  let value: Int

  func body(content: Content) -> some View {
    if voiceOver {
      content.accessibilityFocused(spoken, equals: value)
    } else {
      content
    }
  }
}

/// A mark as a button: its glyph and nothing else. A press shows its result
/// in the fill at once, so the mark draws no pressed state of its own.
private struct PMRatingMarkStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
  }
}

/// Rating's states, from the spec's States table. A control's root carries
/// its size and the mark it holds; a shown rating's carries `readonly` and
/// is named by its sentence.
public struct RatingStates: PMStates {
  public let member = "Rating"

  public init() {}

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "nothing chosen yet", expect: ["size": "md", "checked": "", "label": "Rate this answer"]
      ) {
        PMRating(props: PMRatingProps(label: "Rate this answer"))
      },
      PMStateEntry("three of five", expect: ["checked": "3"]) {
        PMRating(props: PMRatingProps(defaultValue: 3, label: "Rate this answer"))
      },
      PMStateEntry("each value — one to five", expect: ["checked": "1"]) {
        RatingColumn(ratings: (1...5).map { value in
          PMRatingProps(defaultValue: Double(value), label: "Answer \(value)")
        })
      },
      PMStateEntry(
        "read-only — an average of 4.3",
        expect: ["readonly": "true", "label": "Average rating: 4.3 out of 5"]
      ) {
        PMRating(props: PMRatingProps(label: "Average rating", readOnly: true, value: 4.3))
      },
      PMStateEntry("disabled", expect: ["disabled": "true", "checked": "2"]) {
        PMRating(props: PMRatingProps(defaultValue: 2, disabled: true, label: "Rate this answer"))
      },
      PMStateEntry("sizes — sm, md and lg", expect: ["size": "sm"]) {
        RatingColumn(ratings: [
          PMRatingProps(defaultValue: 4, label: "Small", size: .sm),
          PMRatingProps(defaultValue: 4, label: "Medium", size: .md),
          PMRatingProps(defaultValue: 4, label: "Large", size: .lg),
        ])
      },
      PMStateEntry("ten marks — the most a rating takes", expect: ["checked": "7"]) {
        PMRating(
          props: PMRatingProps(
            defaultValue: 7, label: "How likely are you to recommend us?", max: 10))
      },
      PMStateEntry(
        "in a FormField, required and in error",
        expect: [
          "invalid": "true", "required": "true", "checked": "", "label": "How was this answer?",
        ]
      ) {
        // The context a FormField hands its control, so the entry's root is the Rating.
        PMRating(props: PMRatingProps(label: "Answer rating", name: "rating"))
          .environment(
            \.pmField,
            PMFieldContext(
              label: "How was this answer?", hint: "Choose a rating to send your feedback.",
              required: true, invalid: true))
      },
      PMStateEntry(
        "in a Table cell — read-only and small",
        expect: ["readonly": "true", "size": "sm", "label": "Rating: 4.6 out of 5"]
      ) {
        // The cell's content: a Table's own root would be the entry's first member.
        PMRating(props: PMRatingProps(label: "Rating", readOnly: true, size: .sm, value: 4.6))
      },
      PMStateEntry("messages — the words in German", expect: ["checked": "4"]) {
        PMRating(
          props: PMRatingProps(
            defaultValue: 4, label: "Bewertung", locale: "de",
            messages: PMRatingMessages(
              mark: { value, numeral in "\(numeral) \(value == 1 ? "Stern" : "Sterne")" },
              shown: { label, value, max in "\(label): \(value) von \(max)" })))
      },
    ]
  }
}

/// Several ratings in a column `space-3` apart, as the web's fixture stacks them.
private struct RatingColumn: View {
  @Environment(\.pmTheme) private var theme
  let ratings: [PMRatingProps]

  var body: some View {
    VStack(alignment: .leading, spacing: theme.defaultDensity.space.s3) {
      ForEach(Array(ratings.enumerated()), id: \.offset) { _, props in
        PMRating(props: props)
      }
    }
  }
}
