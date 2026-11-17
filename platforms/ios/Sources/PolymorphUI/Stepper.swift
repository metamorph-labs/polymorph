// Stepper (`design/components/stepper.md`): progress through an ordered flow.
// Every step before `activeIndex` is completed, the step at it is active, and
// every step after it is upcoming; a step with `error` shows the danger mark
// instead, while the connector fill, the selected trait and revisiting still
// follow `activeIndex`. Progress is the accent family, not the selection
// roles: a done step is not a chosen row.
//
// The mark is `PMMarkDisc`: completed is the accent fill with the `confirm`
// check, lit; active is the accent wash with an accent border and the number;
// upcoming is a border with the muted number; error is the danger wash and
// border with the `error` glyph. The label is `text.sm`, primary on a visited
// step and secondary on one to come; the description is `text.xs`, muted. The
// connector after a completed step is `accent.bg` and the rest
// `border.default`, so the line fills as the flow advances.
//
// Horizontal is the web's row, the label beside each mark and a connector of
// at least `space.6` between steps, when the row fits; when it does not, as
// on a phone, each label sits under its mark in an equal column and the
// connectors join the marks, so the steps stay in one row and a label wraps
// rather than the row overflowing. Vertical stacks the steps, the connector
// running down from under each mark to the next.
//
// With `onStepSelect`, a completed step is a button that reports its index,
// its label accent under the pointer and while pressed; active and upcoming
// steps are never buttons. Each step is one element, named by its label and
// the spoken clause (`spoken`, or the spec's English, "step 2 of 4,
// current"), then its description, so the mark is never what carries the
// state. The active step has the selected trait, the web's
// `aria-current="step"`.
//
// When a step becomes completed its check pops in on the `snappy` spring, a
// fade under Reduce Motion, nothing at the `none` temperament. The connector
// fills over the surface duration.

import PolymorphTokens
import SwiftUI

public struct PMStepper: PMStepperRendering {
  @Environment(\.pmTheme) private var theme
  private let props: PMStepperProps

  public init(props: PMStepperProps) {
    self.props = props
  }

  public var body: some View {
    let orientation = props.orientation ?? .horizontal
    let steps = models

    Group {
      switch orientation {
      case .horizontal:
        ViewThatFits(in: .horizontal) {
          inlineRow(steps)
          stackedRow(steps)
        }
      case .vertical:
        column(steps)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .contain)
    .pmMember("Stepper", ["orientation": orientation.rawValue])
  }

  /// Each step with its position, its walk and the state it shows.
  private var models: [StepModel] {
    let active = Int(props.activeIndex)
    return props.steps.enumerated().map { index, step in
      let walk: PMStepperSpokenState =
        index < active ? .completed : index == active ? .active : .upcoming
      return StepModel(
        index: index, count: props.steps.count, step: step, walk: walk,
        state: step.error == true ? .error : walk,
        interactive: walk == .completed && props.onStepSelect != nil)
    }
  }

  /// The web's row: the label beside each mark, a connector between steps.
  private func inlineRow(_ steps: [StepModel]) -> some View {
    let space = theme.defaultDensity.space
    return HStack(alignment: .top, spacing: space.s4) {
      ForEach(steps, id: \.index) { model in
        step(model) {
          HStack(alignment: .top, spacing: space.s3) {
            StepIndicator(state: model.state, number: model.index + 1)
            copy(model, centred: false)
          }
        }
        .fixedSize()
        if model.index < model.count - 1 {
          StepConnector(filled: model.walk == .completed, axis: .horizontal)
            .frame(minWidth: space.s6, maxWidth: .infinity)
            .frame(height: space.s6)
        }
      }
    }
  }

  /// The phone's row: each label under its mark in an equal column, the
  /// connectors joining the marks.
  private func stackedRow(_ steps: [StepModel]) -> some View {
    let space = theme.defaultDensity.space
    return HStack(alignment: .top, spacing: 0) {
      ForEach(steps, id: \.index) { model in
        step(model) {
          VStack(spacing: space.s2) {
            HStack(spacing: space.s2) {
              // The line from the previous mark, filled when that step is done.
              StepConnector(filled: model.index <= Int(props.activeIndex), axis: .horizontal)
                .opacity(model.index > 0 ? 1 : 0)
              StepIndicator(state: model.state, number: model.index + 1)
              StepConnector(filled: model.walk == .completed, axis: .horizontal)
                .opacity(model.index < model.count - 1 ? 1 : 0)
            }
            .frame(height: space.s6)
            copy(model, centred: true)
          }
        }
        .frame(maxWidth: .infinity)
      }
    }
  }

  /// The steps stacked, the connector running down from under each mark to
  /// the next. It runs beside a step's description rather than under it, so it
  /// reaches the next mark however tall the step is.
  private func column(_ steps: [StepModel]) -> some View {
    let space = theme.defaultDensity.space
    return VStack(alignment: .leading, spacing: 0) {
      ForEach(steps, id: \.index) { model in
        let last = model.index == model.count - 1
        VStack(alignment: .leading, spacing: 0) {
          StepHitArea(target: theme.defaultDensity.hitTarget) {
            step(model, reserves: false) {
              HStack(alignment: .top, spacing: space.s3) {
                StepIndicator(state: model.state, number: model.index + 1)
                copy(model, centred: false)
              }
            }
          }
          if !last {
            Color.clear.frame(height: space.s2 + space.s6)
          }
        }
        .background(alignment: .topLeading) {
          if !last {
            StepConnector(filled: model.walk == .completed, axis: .vertical)
              .padding(.top, space.s6 + space.s2)
              .frame(width: space.s6)
          }
        }
      }
    }
  }

  /// A step's control: a button for a revisitable step, otherwise the step as
  /// one element. Either way it is named by the label and the spoken clause,
  /// then the description. A button's hit area takes room in the layout when
  /// `reserves`; in the column it reaches into the gap below instead
  /// (`StepHitArea`).
  @ViewBuilder
  private func step<Content: View>(
    _ model: StepModel, reserves: Bool = true, @ViewBuilder content: () -> Content
  ) -> some View {
    let colors = theme.colors
    let label = model.walk == .upcoming ? colors.textSecondary : colors.textPrimary
    if model.interactive, let select = props.onStepSelect {
      Button {
        select(Double(model.index))
      } label: {
        content()
      }
      .buttonStyle(StepButtonStyle(label: label, reserves: reserves))
      .accessibilityAddTraits(model.walk == .active ? .isSelected : [])
    } else {
      content()
        .foregroundStyle(label.color)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(model.walk == .active ? .isSelected : [])
    }
  }

  /// The label, with the spoken clause in its name, and the description under it.
  private func copy(_ model: StepModel, centred: Bool) -> some View {
    let spoken = (props.spoken ?? PMStrings.spokenStep)(
      PMStepperSpokenStep(
        position: Double(model.index + 1), count: Double(model.count), state: model.state))
    return VStack(alignment: centred ? .center : .leading, spacing: 0) {
      Text(model.step.label)
        .pmTextStyle(theme.text.sm)
        .accessibilityLabel(Text("\(model.step.label), \(spoken)"))
      if let description = model.step.description {
        Text(description)
          .pmTextStyle(theme.text.xs)
          .foregroundStyle(theme.colors.textMuted.color)
          .padding(.top, PMGeometry.subline)
      }
    }
    .multilineTextAlignment(centred ? .center : .leading)
    .fixedSize(horizontal: false, vertical: true)
  }
}

/// One step as drawn: its position, its walk state (completed, active or
/// upcoming), the state it shows (the walk, or `error`), and whether it is a
/// button.
private struct StepModel {
  let index: Int
  let count: Int
  let step: PMStep
  let walk: PMStepperSpokenState
  let state: PMStepperSpokenState
  let interactive: Bool
}

/// The step's mark in its state's recipe. The check pops in when the step
/// becomes completed.
private struct StepIndicator: View {
  @Environment(\.pmTheme) private var theme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  let state: PMStepperSpokenState
  let number: Int

  var body: some View {
    let c = theme.colors
    let (fill, border, foreground): (PMDynamicColor?, PMDynamicColor?, PMDynamicColor) =
      switch state {
      case .completed: (c.accentBg, nil, c.accentContrast)
      case .active: (c.accentSubtle, c.accentBg, c.accentText)
      case .upcoming: (nil, c.borderDefault, c.textMuted)
      case .error: (c.dangerSubtle, c.dangerBorder, c.dangerText)
      }

    PMMarkDisc(fill: fill, border: border, foreground: foreground, lit: state == .completed) {
      ZStack {
        switch state {
        case .completed:
          PMIconView(.confirm, size: .sm)
            .transition(
              reduceMotion
                ? .opacity : .scale(scale: PMRecipe.stepperPopFrom).combined(with: .opacity))
        case .error:
          PMIconView(.error, size: .sm)
        case .active, .upcoming:
          // The disc is `space.6` at every text size, so the number stops
          // growing where it would leave the disc. It is hidden from
          // accessibility: the step's spoken clause says the position.
          Text(verbatim: String(number))
            .pmTextStyle(theme.text.xs)
            .pmTabularFigures(theme.numeric.tabular)
            .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
        }
      }
    }
    .animation(animation, value: state)
  }

  /// `spring-pop` on `snappy`; a fade under Reduce Motion; none at the `none`
  /// temperament, whose durations are 0.
  private var animation: Animation? {
    let motion = theme.defaultMotion
    guard motion.duration.control > 0 else { return nil }
    return reduceMotion
      ? motion.easing.standard.animation(duration: motion.duration.control)
      : motion.spring.snappy.animation
  }
}

/// The line between two steps: `accent.bg` after a completed step, otherwise
/// `border.default`, changing colour over the surface duration.
private struct StepConnector: View {
  @Environment(\.pmTheme) private var theme
  let filled: Bool
  let axis: Axis

  var body: some View {
    let motion = theme.defaultMotion
    PMRule(filled ? theme.colors.accentBg : theme.colors.borderDefault, axis: axis)
      .animation(
        motion.easing.standard.animation(duration: motion.duration.surface), value: filled)
  }
}

/// A revisitable step: the label accent under the pointer and while pressed.
/// The hit area reaches the hit target from the step's top edge, so a step
/// beside a static one stays aligned with it. When it `reserves`, the area
/// takes room in the layout; otherwise the step takes whatever height it is
/// placed at, which `StepHitArea` makes the hit target.
private struct StepButtonStyle: ButtonStyle {
  let label: PMDynamicColor
  let reserves: Bool

  func makeBody(configuration: Configuration) -> some View {
    StepButtonChrome(style: self, pressed: configuration.isPressed) { configuration.label }
  }
}

private struct StepButtonChrome<Label: View>: View {
  @Environment(\.pmTheme) private var theme
  @State private var hovering = false
  let style: StepButtonStyle
  let pressed: Bool
  @ViewBuilder let content: () -> Label

  var body: some View {
    let motion = theme.defaultMotion
    let target = theme.defaultDensity.hitTarget
    let active = hovering || pressed
    content()
      .foregroundStyle((active ? theme.colors.accentText : style.label).color)
      .animation(
        motion.easing.standard.animation(duration: motion.duration.control), value: active)
      .frame(
        minWidth: target, minHeight: style.reserves ? target : nil,
        maxHeight: style.reserves ? nil : .infinity, alignment: .topLeading
      )
      .contentShape(.rect)
      .onHover { hovering = $0 }
  }
}

/// A step in the column, laid out at its drawn height and placed at least the
/// hit target tall, so a revisitable step's hit area reaches down into the gap
/// before the next step (`space.2` and `space.6`, more than a step is shorter
/// than the target) and the column keeps one rhythm. A static step is as tall
/// as it is drawn either way.
private struct StepHitArea: Layout {
  let target: CGFloat

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    subviews.first?.sizeThatFits(ProposedViewSize(width: proposal.width, height: nil)) ?? .zero
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    guard let step = subviews.first else { return }
    let drawn = step.sizeThatFits(ProposedViewSize(width: bounds.width, height: nil))
    step.place(
      at: bounds.origin, anchor: .topLeading,
      proposal: ProposedViewSize(width: bounds.width, height: max(drawn.height, target)))
  }
}

/// Stepper's states, from the spec's States table.
public struct StepperStates: PMStates {
  public let member = "Stepper"

  public init() {}

  private static let migration = [
    PMStep(label: "Connect"), PMStep(label: "Map fields"), PMStep(label: "Review"),
    PMStep(label: "Import"),
  ]

  private static let described = [
    PMStep(label: "Connect", description: "Point us at your old help desk"),
    PMStep(label: "Map fields", description: "Match their names to ours"),
    PMStep(label: "Review", description: "Check a sample of 20 tickets"),
    PMStep(label: "Import", description: "Roughly an hour for 10,000"),
  ]

  private static let failed = [
    PMStep(label: "Connect"), PMStep(label: "Map fields", error: true), PMStep(label: "Review"),
    PMStep(label: "Import"),
  ]

  private static let short = [PMStep(label: "Plan"), PMStep(label: "Pay"), PMStep(label: "Done")]

  public var entries: [PMStateEntry] {
    [
      PMStateEntry(
        "mid-flow — two done, one current, one to come", expect: ["orientation": "horizontal"]
      ) {
        PMStepper(props: PMStepperProps(activeIndex: 2, steps: Self.migration))
      },
      PMStateEntry("start — nothing behind you yet") {
        PMStepper(props: PMStepperProps(activeIndex: 0, steps: Self.migration))
      },
      PMStateEntry("end — the last step is the current one") {
        PMStepper(props: PMStepperProps(activeIndex: 3, steps: Self.migration))
      },
      PMStateEntry("with descriptions") {
        PMStepper(props: PMStepperProps(activeIndex: 1, steps: Self.described))
      },
      PMStateEntry("revisitable — completed steps are real buttons") {
        PMStepper(
          props: PMStepperProps(activeIndex: 2, onStepSelect: { _ in }, steps: Self.migration))
      },
      PMStateEntry("vertical", expect: ["orientation": "vertical"]) {
        PMStepper(
          props: PMStepperProps(activeIndex: 2, orientation: .vertical, steps: Self.described))
      },
      PMStateEntry("vertical and revisitable", expect: ["orientation": "vertical"]) {
        PMStepper(
          props: PMStepperProps(
            activeIndex: 2, onStepSelect: { _ in }, orientation: .vertical,
            steps: Self.migration))
      },
      PMStateEntry("errored step — the danger family on the mark, the sentence unchanged") {
        PMStepper(props: PMStepperProps(activeIndex: 2, steps: Self.failed))
      },
      PMStateEntry("short labels — the web's row, when it fits") {
        PMStepper(props: PMStepperProps(activeIndex: 1, steps: Self.short))
      },
    ]
  }
}
