// Slider (`design/components/slider.md`): a value chosen from a numeric range,
// or with `range` a low and a high value on one track. It looks like Progress
// with a handle: the track is `space-2` tall on `bg.subtle`, a pill, with the
// accent gradient filling from the start to the thumb (between the thumbs
// under `range`), and the thumb is a `space-5` disc on `bg.surface` with a
// `border.strong` hairline and the lit shadow. Under the pointer its border
// turns `accent.bg`; while it is dragged it also grows by the recipe's 1.12 on
// the `snappy` spring and takes the hover glow, and it does not grow at the
// `none` temperament or under Reduce Motion. Invalid draws the thumb's border
// in `danger.border` and leaves the fill alone, because a red fill would read
// as a danger level; disabled draws the fill `border.default` and the thumb
// with a `border.subtle` hairline and no shadow.
//
// SwiftUI's own Slider cannot be drawn to the recipe, so the row is drawn
// here and moved by a drag: a press anywhere on the row moves the nearest
// thumb to it, the thumb follows the finger exactly, never animated, and the
// value snaps to `step` within `min` and `max`; under `range` the thumbs
// cannot cross. `onChange` reports every change and `onCommit` the value when
// the drag ends. The row is the small control height, and the drag reads the
// whole hit target around it.
//
// One value is one adjustable element, the whole row: VoiceOver's swipes step
// it, each step committing as a keyboard step does on the web, and the thumb
// itself is hidden. Under `range` each thumb is its own adjustable element, as
// large as the hit target around the disc. Either is named by `ariaLabel` or
// its FormField's label and its value is `formatValue`'s text (the number in
// the person's locale by default). The `showValue` readout at the row's end
// shows the same text in `text.sm` `text.secondary` with tabular figures,
// both values joined by an en dash under `range`, and is not spoken, because
// the elements carry the values. The `aria-*by` ids have no SwiftUI
// counterpart.

import PolymorphTokens
import SwiftUI

public struct PMSlider: PMSliderRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.pmField) private var field
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var draft: [Double]
  @State private var dragging: Int?
  @State private var hovering = false
  @State private var trackWidth: CGFloat = 0
  private let props: PMSliderProps

  public init(props: PMSliderProps) {
    self.props = props
    _draft = State(initialValue: Self.values(props.defaultValue, props))
  }

  public var body: some View {
    let space = theme.defaultDensity.space
    let disabled = props.disabled ?? false
    let invalid = (props.invalid ?? false) || (field?.invalid ?? false)
    let values = shown

    VStack(alignment: .trailing, spacing: space.s2) {
      if props.showValue == true {
        Text(values.map(text).joined(separator: "–"))
          .pmTextStyle(theme.text.sm)
          .pmTabularFigures(true)
          .foregroundStyle(theme.colors.textSecondary.color)
          .accessibilityHidden(true)
      }
      GeometryReader { proxy in
        row(values, width: proxy.size.width, disabled: disabled, invalid: invalid)
      }
      .frame(height: theme.defaultDensity.controlHeight.sm)
      .onGeometryChange(for: CGFloat.self) {
        $0.size.width
      } action: {
        trackWidth = $0
      }
      // The drag reads the hit target, not only the drawn row inside it.
      .pmHitTarget()
      .onHover { hovering = $0 }
      .gesture(drag(values, disabled: disabled))
      .modifier(
        PMSliderTrackAccessibility(
          adjustable: range ? nil : single(values, disabled: disabled, invalid: invalid)))
    }
    .frame(maxWidth: .infinity)
    // Disabled, every adjustable element is dimmed and ignores VoiceOver's swipes.
    .disabled(disabled)
    .accessibilityElement(children: .contain)
    .pmFocusWhenNamed()
    .pmMember("Slider", attributes(disabled: disabled, invalid: invalid))
    .preference(key: PMFieldControlKey.self, value: PMFieldControl(disabled: disabled))
  }

  // MARK: The values

  private var low: Double { props.min ?? 0 }
  private var high: Double { Swift.max(low, props.max ?? 100) }
  private var step: Double { Swift.max(props.step ?? 1, .ulpOfOne) }
  private var range: Bool { props.range ?? false }

  /// The thumbs' values: the controlled `value` when given, otherwise the
  /// slider's own, one value or a low and a high one.
  private var shown: [Double] {
    props.value.map { Self.values($0, props) } ?? draft
  }

  /// A `PMSliderValue` as one value, or as the pair `range` takes: a single
  /// value under `range` is the high end over `min`, and a pair without
  /// `range` is its low end.
  private static func values(_ value: PMSliderValue?, _ props: PMSliderProps) -> [Double] {
    let low = props.min ?? 0
    let high = Swift.max(low, props.max ?? 100)
    let pair: [Double]
    switch value {
    case .single(let one): pair = [low, one]
    case .range(let both): pair = [both.0, both.1]
    case nil: pair = [low, (props.range ?? false) ? high : low]
    }
    let clamped = pair.map { Swift.min(high, Swift.max(low, $0)) }.sorted()
    return (props.range ?? false) ? clamped : [value == nil ? low : clamped[pairIndex(value)]]
  }

  private static func pairIndex(_ value: PMSliderValue?) -> Int {
    if case .range = value { return 0 }
    return 1
  }

  private func reported(_ values: [Double]) -> PMSliderValue {
    range ? .range((values[0], values[1])) : .single(values[0])
  }

  private func snapped(_ value: Double) -> Double {
    let stepped = low + ((value - low) / step).rounded() * step
    return Swift.min(high, Swift.max(low, stepped))
  }

  /// Moves thumb `index` to `value`, held between the other thumb and the ends.
  private func move(_ index: Int, to value: Double, commit: Bool) {
    var next = shown
    var target = snapped(value)
    if range {
      target = index == 0 ? Swift.min(target, next[1]) : Swift.max(target, next[0])
    }
    guard next[index] != target || commit else { return }
    if next[index] != target {
      next[index] = target
      draft = next
      props.onChange?(reported(next))
    }
    if commit { props.onCommit?(reported(next)) }
  }

  private func text(_ value: Double) -> String {
    props.formatValue?(value) ?? value.formatted()
  }

  // MARK: The row

  private func row(_ values: [Double], width: CGFloat, disabled: Bool, invalid: Bool)
    -> some View
  {
    let space = theme.defaultDensity.space
    let colors = theme.colors
    let thumb = space.s5
    // A thumb's centre travels from half a thumb inside one end to half inside the other.
    let half = thumb / 2
    let span = Swift.max(0, width - thumb)
    let position = { (value: Double) -> CGFloat in
      half + span * CGFloat((value - low) / Swift.max(high - low, .ulpOfOne))
    }
    // A single thumb's fill runs from the track's start.
    let start = range ? position(values[0]) : 0
    let end = position(values[range ? 1 : 0])
    let pill = RoundedRectangle(cornerRadius: theme.radius.pill)

    return ZStack(alignment: .leading) {
      pill.fill(colors.bgSubtle.color)
        .frame(height: space.s2)
      Group {
        if disabled {
          pill.fill(colors.borderDefault.color)
        } else {
          pill.fill(theme.gradients.accentGradient.linear)
        }
      }
      .frame(width: Swift.max(0, end - start), height: space.s2)
      .offset(x: start)
      ForEach(Array(values.enumerated()), id: \.offset) { index, value in
        let disc = PMSliderThumb(
          dragging: dragging == index, hovering: hovering, disabled: disabled, invalid: invalid)
        if range {
          // A thumb of a range is its own element, its hit region the hit
          // target around the disc.
          disc
            .pmHitTarget(drawn: CGSize(width: thumb, height: thumb))
            .offset(x: position(value) - half)
            .accessibilityElement()
            .accessibilityLabel(Text(name ?? ""))
            .accessibilityValue(Text(text(value)))
            .accessibilityAdjustableAction { direction in
              adjust(index, from: value, direction, disabled: disabled)
            }
            .pmFieldHint(invalid: invalid, field?.hint)
        } else {
          disc
            .offset(x: position(value) - half)
            .accessibilityHidden(true)
        }
      }
    }
    .frame(width: width, alignment: .leading)
    .frame(maxHeight: .infinity)
  }

  /// The single value's element: the whole row, which VoiceOver steps.
  private func single(_ values: [Double], disabled: Bool, invalid: Bool) -> PMSliderAdjustable {
    let value = values[0]
    return PMSliderAdjustable(
      name: name ?? "", value: text(value), hint: field?.hint, invalid: invalid
    ) { direction in
      adjust(0, from: value, direction, disabled: disabled)
    }
  }

  private func adjust(
    _ index: Int, from value: Double, _ direction: AccessibilityAdjustmentDirection, disabled: Bool
  ) {
    guard !disabled else { return }
    switch direction {
    case .increment: move(index, to: value + step, commit: true)
    case .decrement: move(index, to: value - step, commit: true)
    @unknown default: break
    }
  }

  /// A press anywhere in the hit target moves the nearest thumb to it, and
  /// the thumb follows the finger; the value commits when the finger lifts.
  private func drag(_ values: [Double], disabled: Bool) -> some Gesture {
    let thumb = theme.defaultDensity.space.s5
    let half = thumb / 2
    let span = Swift.max(0, trackWidth - thumb)
    return DragGesture(minimumDistance: 0)
      .onChanged { drag in
        guard !disabled else { return }
        let fraction = (drag.location.x - half) / Swift.max(span, .ulpOfOne)
        let value = low + Double(fraction) * (high - low)
        let index = dragging ?? nearest(value, in: values)
        if dragging == nil { dragging = index }
        move(index, to: value, commit: false)
      }
      .onEnded { _ in
        guard let index = dragging else { return }
        dragging = nil
        move(index, to: shown[index], commit: true)
      }
  }

  private func nearest(_ value: Double, in values: [Double]) -> Int {
    guard range else { return 0 }
    return abs(values[0] - value) <= abs(values[1] - value) && value <= values[1] ? 0 : 1
  }

  private var name: String? {
    props.ariaLabel ?? field?.label
  }

  /// The web's `data-*` and each thumb's `aria-valuenow`, as written for a
  /// machine, and `aria-valuetext`, the spoken text, joined as the readout
  /// joins them; `readout` while the value is shown at the row's end.
  private func attributes(disabled: Bool, invalid: Bool) -> [String: String] {
    let posix = Locale(identifier: "en_US_POSIX")
    var attributes = [
      "orientation": "horizontal", "range": range ? "true" : "false",
      "valuenow": shown.map { $0.formatted(.number.grouping(.never).locale(posix)) }
        .joined(separator: ","),
      "valuetext": shown.map(text).joined(separator: "–"),
    ]
    if props.showValue == true { attributes["readout"] = "true" }
    if disabled { attributes["disabled"] = "true" }
    if invalid { attributes["invalid"] = "true" }
    if dragging != nil { attributes["state"] = "dragging" }
    return attributes
  }
}

/// The single value's element: its name, its value, its FormField's hint and
/// the step VoiceOver's swipes take.
private struct PMSliderAdjustable {
  let name: String
  let value: String
  let hint: String?
  let invalid: Bool
  let adjust: @MainActor (AccessibilityAdjustmentDirection) -> Void
}

/// The row as one adjustable element for a single value; for a range, a
/// container of the two thumbs' elements.
private struct PMSliderTrackAccessibility: ViewModifier {
  let adjustable: PMSliderAdjustable?

  func body(content: Content) -> some View {
    if let adjustable {
      content
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(adjustable.name))
        .accessibilityValue(Text(adjustable.value))
        .accessibilityAdjustableAction(adjustable.adjust)
        .pmFieldHint(invalid: adjustable.invalid, adjustable.hint)
    } else {
      content.accessibilityElement(children: .contain)
    }
  }
}

/// The thumb: the disc, its border by state, the lit shadow, and while
/// dragged the glow and the grab scale.
private struct PMSliderThumb: View {
  @Environment(\.pmTheme) private var theme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  let dragging: Bool
  let hovering: Bool
  let disabled: Bool
  let invalid: Bool

  var body: some View {
    let colors = theme.colors
    let motion = theme.defaultMotion
    let side = theme.defaultDensity.space.s5
    let border =
      disabled
      ? colors.borderSubtle
      : invalid ? colors.dangerBorder : dragging || hovering ? colors.accentBg : colors.borderStrong
    // The `none` temperament has no press scale, and Reduce Motion keeps the size.
    let grows = dragging && !reduceMotion && motion.pressScale != 1
    Circle()
      .fill(colors.bgSurface.color)
      .pmInsetShadow(disabled ? PMShadow(layers: []) : theme.insetTop, in: Circle())
      .overlay { Circle().strokeBorder(border.color, lineWidth: 1) }
      .frame(width: side, height: side)
      .pmShadow(disabled ? PMShadow(layers: []) : dragging ? theme.glow.hover : theme.shadows.seat)
      .scaleEffect(grows ? PMRecipe.sliderGrabScale : 1)
      .animation(motion.spring.snappy.animation, value: grows)
      .animation(
        motion.easing.standard.animation(duration: motion.duration.control),
        value: [dragging, hovering])
  }
}

/// Slider's states, from the spec's States table.
public struct SliderStates: PMStates {
  public let member = "Slider"

  public init() {}

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("rest", expect: ["range": "false", "valuenow": "40"]) {
        PMSlider(props: PMSliderProps(ariaLabel: "Volume", defaultValue: .single(40)))
      },
      PMStateEntry("zero", expect: ["valuenow": "0"]) {
        PMSlider(props: PMSliderProps(ariaLabel: "Volume", defaultValue: .single(0)))
      },
      PMStateEntry("full", expect: ["valuenow": "100"]) {
        PMSlider(props: PMSliderProps(ariaLabel: "Volume", defaultValue: .single(100)))
      },
      PMStateEntry("stepped", expect: ["valuenow": "30"]) {
        PMSlider(props: PMSliderProps(ariaLabel: "Volume", defaultValue: .single(30), step: 10))
      },
      PMStateEntry("with readout", expect: ["valuenow": "40", "readout": "true"]) {
        PMSlider(
          props: PMSliderProps(ariaLabel: "Volume", defaultValue: .single(40), showValue: true))
      },
      PMStateEntry("formatted", expect: ["valuenow": "40", "valuetext": "40%", "readout": "true"]) {
        PMSlider(
          props: PMSliderProps(
            ariaLabel: "Volume", defaultValue: .single(40), formatValue: { "\(Int($0))%" },
            showValue: true))
      },
      PMStateEntry("range — two thumbs, the fill between", expect: ["range": "true", "valuenow": "20,60"]) {
        PMSlider(
          props: PMSliderProps(
            ariaLabel: "Price", defaultValue: .range((20, 60)), range: true, showValue: true))
      },
      PMStateEntry("invalid", expect: ["invalid": "true"]) {
        PMSlider(props: PMSliderProps(ariaLabel: "Volume", defaultValue: .single(40), invalid: true))
      },
      PMStateEntry("disabled", expect: ["disabled": "true"]) {
        PMSlider(props: PMSliderProps(ariaLabel: "Volume", defaultValue: .single(40), disabled: true))
      },
    ]
  }
}
