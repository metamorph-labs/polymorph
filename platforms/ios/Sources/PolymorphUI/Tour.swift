// Tour (`design/components/tour.md`), adapted on iOS: a content-high sheet
// per step that points at no part of the screen. `Tour.Target` has no
// contract on iOS (the registry publishes no part for it), so no view of a
// native screen carries a target's name, and every step is drawn as the spec
// draws a step whose target is not on the page: the same words and the same
// position, with nothing cut out and no side to open on. A step's `target`
// and `side` are therefore not drawn (`packages/native/src/undrawn.ts`).
//
// The tour has no trigger: the app opens it with `open` or `defaultOpen`, and
// the member draws nothing in the screen. Open, it presents the step's panel
// as a sheet as tall as its content, the platform's modal surface, on the
// overlay colour with the surface radius, at Dialog's `sm` width where a sheet
// takes a width (iOS 18 on a regular width): the title (`text.md`,
// `text.primary`, a header, clear of the close button by `space.8`), the body
// `space.2` under it (`text.sm`, `text.secondary`), and the last row
// `space.5` under the body, the position at its start (`text.xs`,
// `text.secondary`, the theme's figures) and the actions at its end,
// `space.2` apart: Previous (`outline/neutral/sm`, absent on the first step),
// then Next or, on the last step, Done (`solid/accent/sm`), the one primary.
// The close button is Button's `ghost/neutral/sm` icon-only `close` at the top
// end, `space.3` in, named by `messages.close`. The panel is inset by the
// pane inset. The system draws the scrim, and its colour is the system's.
//
// Previous and Next report the new index through `onStepChange`; with no
// `step`, the tour keeps its own, from `defaultStep`, clamped to the steps,
// and keeps it when it closes, so a tour opened again resumes. Done ends the
// tour with `finished`; the close button and the sheet's swipe end it with
// `dismissed`, as Escape does on the web. Ending closes the sheet unless the
// app holds `open`, and reports through `onEnd`; the member stores nothing.
//
// The sheet is modal to VoiceOver, as the web's dialog is, and VoiceOver
// starts on the title. When the step changes, VoiceOver's focus moves to the
// new title, so each step is read once, title first, then the body and the
// position. With no steps, nothing is drawn.

import PolymorphTokens
import SwiftUI

public struct PMTour: PMTourRendering {
  @Environment(\.pmTheme) private var theme
  @State private var ownOpen: Bool
  @State private var ownStep: Double
  @State private var contentHeight: CGFloat = 0
  private let props: PMTourProps

  public init(props: PMTourProps) {
    self.props = props
    _ownOpen = State(initialValue: props.defaultOpen ?? false)
    _ownStep = State(initialValue: props.defaultStep ?? 0)
  }

  private var index: Int {
    Self.clamped(props.step ?? ownStep, count: props.steps.count)
  }

  private var open: Bool {
    (props.open ?? ownOpen) && !props.steps.isEmpty
  }

  public var body: some View {
    let open = open
    let step = props.steps.isEmpty ? nil : props.steps[index]
    var attributes = ["state": open ? "open" : "closed"]
    if let step { attributes["step"] = step.id }

    // The tour draws nothing in the screen, only its sheet: the empty view
    // that presents it carries its identity and is hidden from VoiceOver, and
    // the sheet's panel carries the identity again where VoiceOver reads it.
    return Color.clear
      .frame(width: 0, height: 0)
      .pmMember("Tour", attributes)
      .accessibilityHidden(true)
      .sheet(
        isPresented: Binding(
          get: { open },
          set: { presented in
            // The swipe that dismisses the sheet. An end the panel reported has
            // already closed it, so it is not reported again.
            if !presented, self.open { end(.dismissed) }
          })
      ) {
        if let step {
          panel(step, measured: false)
            .background {
              // The content-high sheet is as tall as the panel, measured here
              // and not drawn, as Dialog measures its own.
              panel(step, measured: true)
                .fixedSize(horizontal: false, vertical: true)
                .hidden()
                .accessibilityHidden(true)
                .onGeometryChange(for: CGFloat.self) {
                  $0.size.height
                } action: {
                  contentHeight = $0
                }
            }
            .modifier(PMSheetWidth(width: PMDialog.width(.sm, theme)))
            .presentationDetents([.custom(PMContentSheetDetent.self)])
            .presentationBackground(theme.colors.bgOverlay.color)
            .presentationCornerRadius(theme.radius.surface)
        }
      }
      .environment(\.pmSheetContentHeight, contentHeight)
  }

  private func panel(_ step: PMTourStep, measured: Bool) -> PMTourPanel {
    let last = index == props.steps.count - 1
    return PMTourPanel(
      step: step, index: index, count: props.steps.count,
      messages: props.messages ?? PMStrings.tourMessages, focuses: !measured,
      previous: { go(index - 1) },
      next: { last ? end(.finished) : go(index + 1) },
      close: { end(.dismissed) })
  }

  private func go(_ next: Int) {
    ownStep = Double(next)
    props.onStepChange?(Double(next))
  }

  private func end(_ reason: PMTourEnd) {
    ownOpen = false
    props.onEnd?(reason)
  }

  /// The step's index, clamped to the steps; 0 with none.
  static func clamped(_ step: Double, count: Int) -> Int {
    guard count > 0, step.isFinite else { return 0 }
    return min(max(Int(step.rounded(.towardZero)), 0), count - 1)
  }
}

/// A step's panel: the title, the body, the position and the actions, with
/// the close button at the top end. The states fixture draws it in place,
/// `framed`, because the harness renders no presentation.
struct PMTourPanel: View {
  @Environment(\.pmTheme) private var theme
  @AccessibilityFocusState private var titleFocused: Bool
  let step: PMTourStep
  let index: Int
  let count: Int
  let messages: PMTourMessages
  /// Moves VoiceOver's focus to the title when the step changes; the measured
  /// copy's and the states fixture's do not.
  var focuses = true
  /// Draws the overlay surface, its border, radius and shadow, which the sheet
  /// otherwise draws.
  var framed = false
  let previous: @MainActor () -> Void
  let next: @MainActor () -> Void
  let close: @MainActor () -> Void

  var body: some View {
    let density = theme.defaultDensity
    let space = density.space
    let colors = theme.colors
    let last = index == count - 1
    // The close button's drawn box sits `space.3` from the corner; its hit
    // area reaches past it.
    let closeInset = max(0, space.s3 - (density.hitTarget - density.controlHeight.sm) / 2)

    let title = Text(step.title)
      .pmTextStyle(theme.text.md)
      .foregroundStyle(colors.textPrimary.color)
      .padding(.trailing, space.s8)
      .fixedSize(horizontal: false, vertical: true)
      .accessibilityAddTraits(.isHeader)

    VStack(alignment: .leading, spacing: 0) {
      // Only a panel that moves focus carries the focus binding: `ImageRenderer`
      // draws nothing of a view that carries one, and the states fixture draws
      // its panel with it.
      if focuses {
        title.accessibilityFocused($titleFocused)
      } else {
        title
      }
      Text(step.body)
        .pmTextStyle(theme.text.sm)
        .foregroundStyle(colors.textSecondary.color)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.top, space.s2)
      ViewThatFits(in: .horizontal) {
        HStack(spacing: space.s3) {
          position
          Spacer(minLength: 0)
          actions(last: last)
        }
        VStack(alignment: .leading, spacing: space.s3) {
          position
          HStack(spacing: space.s2) {
            Spacer(minLength: 0)
            actions(last: last)
          }
        }
      }
      .padding(.top, space.s5)
    }
    .padding(density.inset.pane)
    .frame(maxWidth: .infinity, alignment: .topLeading)
    .overlay(alignment: .topTrailing) {
      PMButton(
        props: PMButtonProps(
          icon: .close, iconOnly: true, label: messages.close, onClick: close, size: .sm,
          appearance: .ghostNeutral)
      )
      .padding(closeInset)
    }
    .modifier(PMSurfaceFrame(visible: framed))
    .accessibilityElement(children: .contain)
    .accessibilityAddTraits(.isModal)
    .onChange(of: index) {
      if focuses { titleFocused = true }
    }
    .pmMember("Tour", ["state": "open", "step": step.id])
  }

  /// "Step 2 of 5", from `messages.position`.
  private var position: some View {
    Text(messages.position(Double(index + 1), Double(count)))
      .pmTextStyle(theme.text.xs)
      .foregroundStyle(theme.colors.textSecondary.color)
      .pmTabularFigures(theme.numeric.tabular)
  }

  /// Previous, except on the first step, then Next, or Done on the last.
  @ViewBuilder
  private func actions(last: Bool) -> some View {
    HStack(spacing: theme.defaultDensity.space.s2) {
      if index > 0 {
        PMButton(
          props: PMButtonProps(
            label: messages.previous, onClick: previous, size: .sm, appearance: .outlineNeutral))
      }
      PMButton(
        props: PMButtonProps(
          label: last ? messages.done : messages.next, onClick: next, size: .sm,
          appearance: .solidAccent))
    }
  }
}

/// Tour's states, from the spec's States table: the first, a middle and the
/// last step, a step with no target and a step whose target is not on the
/// page, each drawn in place as the sheet presents it, and the closed tour,
/// which draws nothing. A step's side has no form here, so the web's entries
/// above and beside a target have none.
public struct TourStates: PMStates {
  public let member = "Tour"

  public init() {}

  private static let steps = [
    PMTourStep(
      id: "create", target: "create", title: "Create a ticket",
      body: "Start here to log a new request."),
    PMTourStep(
      id: "filter", target: "filter", title: "Narrow the list",
      body: "Filter tickets by status, owner or tag."),
    PMTourStep(
      id: "export", target: "export", title: "Take the list with you",
      body: "Export the tickets you see as a file."),
  ]

  private static func panel(_ steps: [PMTourStep], at index: Int) -> some View {
    PMTourPanel(
      step: steps[index], index: index, count: steps.count, messages: PMStrings.tourMessages,
      focuses: false, framed: true, previous: {}, next: {}, close: {})
  }

  public var entries: [PMStateEntry] {
    let welcome = PMTourStep(
      id: "welcome", title: "Welcome to the queue",
      body: "Three things to know before you start.")
    let missing = PMTourStep(
      id: "assign", target: "assign", title: "Assign it",
      body: "Give the ticket an owner from its own page.")
    return [
      PMStateEntry(
        "first step — no Previous", expect: ["state": "open", "step": "create"]
      ) {
        Self.panel(Self.steps, at: 0)
      },
      PMStateEntry("middle step — Previous and Next", expect: ["step": "filter"]) {
        Self.panel(Self.steps, at: 1)
      },
      PMStateEntry("last step — Done ends the tour", expect: ["step": "export"]) {
        Self.panel(Self.steps, at: 2)
      },
      PMStateEntry("a step with no target", expect: ["step": "welcome"]) {
        Self.panel([welcome] + Self.steps, at: 0)
      },
      PMStateEntry(
        "a step whose target is not on the page — the same panel", expect: ["step": "assign"]
      ) {
        Self.panel([missing], at: 0)
      },
      PMStateEntry("closed — the app has not opened it", expect: ["hidden": "true", "renders": "nothing"]) {
        PMTour(props: PMTourProps(steps: Self.steps))
      },
    ]
  }
}
