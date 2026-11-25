// Toast (`design/components/toast.md`), adapted on iOS: an in-app banner above
// the home indicator. iOS has no system toast, so the member is the viewport
// and its one card: placed over a screen (an overlay at its root), it sits at
// the bottom, full width inside the phone register's insets, above the safe
// area, and leaves the rest of the screen to the touches beneath it.
//
// The card is the recipe's: one neutral raised surface for every tone, the
// tone carried by the glyph (`success`, `error` for danger, `warning`,
// `info`; none for neutral), the title and description in `text.sm`, the host
// content under them, at most one action as a tertiary Button (ghost/accent,
// ghost/danger in a danger toast), and the close button (ghost/neutral/sm
// icon-only `close`, named "Dismiss").
//
// From the recipe's phone register up (`PMRecipe.toastBelow`, 30rem of the
// window's width) the card is the recipe's width (`PMRecipe.toastWidth`
// `space-10` steps) in the bottom trailing corner, `space-6` in, as on the
// web; below it the card spans the window inside `space-4`.
//
// Its tone sets how long it stays when the call sets neither `retained` nor
// `durationMs`, by the rule the web's store applies (`toast.md` §Lifetime):
// danger and warning are pinned until they are dismissed, and success, info and
// neutral leave after 5000 milliseconds. A toast with an action that sets
// neither is pinned whatever its tone, so a reader has the time to reach the
// action. A call that sets either takes what it sets, with 5000 for a duration
// it leaves out. `.infinity` pins it, and
// `dismissible: false` keeps it until its owner removes it: no timer, no close
// button, no swipe. A dismissible toast also leaves on a swipe towards the
// trailing edge and on the accessibility escape gesture. While VoiceOver runs
// it stays until it is dismissed: the web pauses its timer while the toast has
// focus, and a listener needs longer to reach a toast than a reader needs to
// see it. A new `id` or title is a new notification: the card shows again, in
// place, and its time restarts. It is announced when it appears, at high
// priority for danger and warning, the web's `role="alert"`, and politely
// otherwise. `onDismiss` is called once when the card leaves by its close
// button, a swipe, the escape gesture or its time, and not when its owner
// removes the member, as the web's store calls it.
//
// `retained` has no eviction to prevent here, because the viewport holds one
// card, which its owner replaces; a call that sets it chooses the lifetime, as
// on the web.

import PolymorphTokens
import SwiftUI

public struct PMToast: PMToastRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver
  @State private var dismissed = false
  @State private var drag: CGFloat = 0
  @State private var dismissal = PMToastDismissal()
  private let props: PMToastProps

  public init(props: PMToastProps) {
    self.props = props
  }

  public var body: some View {
    let density = theme.defaultDensity
    let motion = theme.defaultMotion
    let _ = (dismissal.onDismiss = props.onDismiss)

    PMToastViewport(
      phoneInset: density.space.s4, inset: density.space.s6,
      width: density.space.s10 * PMRecipe.toastWidth
    ) {
      if !dismissed {
        card
          .offset(x: drag)
          .transition(
            reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
    // In on the default spring, out on the surface's exit.
    .animation(
      dismissed
        ? motion.easing.exit.animation(duration: motion.duration.surfaceExit)
        : motion.spring.base.animation,
      value: dismissed
    )
    .onChange(of: identity) { dismissed = false }
    .onAppear(perform: announce)
    .onChange(of: identity, announce)
    .task(id: TimerKey(identity: identity, paused: voiceOver)) { await expire() }
  }

  private var tone: PMToastTone { props.tone ?? .neutral }
  private var dismissible: Bool { props.dismissible ?? true }

  /// How long the card stays, in milliseconds: when the call sets neither
  /// `retained` nor `durationMs`, pinned for an action and otherwise its
  /// tone's lifetime; otherwise `durationMs`, or the default where only
  /// `retained` is set.
  private var duration: Double {
    if props.retained == nil && props.durationMs == nil {
      if props.action != nil { return .infinity }
      return tone == .danger || tone == .warning ? .infinity : PMSpecDefault.toastDurationMs
    }
    return props.durationMs ?? PMSpecDefault.toastDurationMs
  }

  /// What makes this a new notification rather than the same one.
  private var identity: String { "\(props.id ?? "")\u{1F}\(props.title)\u{1F}\(tone.rawValue)" }

  private var card: some View {
    let density = theme.defaultDensity
    let space = density.space
    let colors = theme.colors
    let shape = RoundedRectangle(cornerRadius: theme.radius.surface)
    let line = theme.text.sm.lineBox
    // The close button's drawn box sits `space-4` from the corner; its hit
    // area reaches past it.
    let closeInset = max(0, space.s4 - (density.hitTarget - density.controlHeight.sm) / 2)
    // The action's drawn box tops the row with the text; its hit area reaches past it.
    let actionOverlap = min(0, (density.controlHeight.sm - density.hitTarget) / 2)

    return HStack(alignment: .top, spacing: space.s3) {
      if let glyph = glyph {
        PMIconView(glyph.role, size: .md)
          .foregroundStyle(glyph.color.color)
          .frame(height: line)
      }
      VStack(alignment: .leading, spacing: space.s1) {
        Text(props.title)
          .foregroundStyle(colors.textPrimary.color)
        if let description = props.description {
          Text(description)
            .foregroundStyle(colors.textSecondary.color)
        }
        if let content = props.content {
          content
            .foregroundStyle(colors.textSecondary.color)
            .padding(.top, space.s1)
        }
      }
      .pmTextStyle(theme.text.sm)
      .fixedSize(horizontal: false, vertical: true)
      .frame(maxWidth: .infinity, alignment: .leading)
      if let action = props.action {
        PMButton(
          props: PMButtonProps(
            label: action.label, onClick: action.onClick, size: .sm,
            appearance: tone == .danger ? .ghostDanger : .ghostAccent)
        )
        .padding(.leading, space.s4)
        .padding(.vertical, actionOverlap)
      }
    }
    .padding(density.inset.pane)
    .padding(.trailing, dismissible ? space.s8 - density.inset.pane : 0)
    .background {
      shape.fill(colors.bgRaised.color).pmShadow(theme.shadows.transient)
    }
    .overlay { shape.strokeBorder(colors.borderDefault.color, lineWidth: 1) }
    .overlay(alignment: .topTrailing) {
      if dismissible {
        PMButton(
          props: PMButtonProps(
            icon: .close, iconOnly: true, label: PMStrings.dismiss, onClick: dismiss,
            size: .sm, appearance: .ghostNeutral)
        )
        .padding(closeInset)
      }
    }
    .gesture(swipe, including: dismissible ? .all : .subviews)
    .accessibilityElement(children: .contain)
    .modifier(PMEscape(enabled: dismissible, perform: dismiss))
    .pmMember("Toast", attributes)
  }

  private var glyph: (role: PMIconRole, color: PMDynamicColor)? {
    let colors = theme.colors
    switch tone {
    case .neutral: return nil
    case .success: return (.success, colors.successText)
    case .danger: return (.error, colors.dangerText)
    case .warning: return (.warning, colors.warningText)
    case .info: return (.info, colors.infoText)
    }
  }

  /// A swipe towards the trailing edge, past the hit target, dismisses; a
  /// shorter one springs back.
  private var swipe: some Gesture {
    DragGesture()
      .onChanged { drag = max(0, $0.translation.width) }
      .onEnded { value in
        if value.translation.width > theme.defaultDensity.hitTarget {
          dismiss()
        }
        withAnimation(theme.defaultMotion.spring.base.animation) { drag = 0 }
      }
  }

  private var attributes: [String: String] {
    var attributes = ["tone": tone.rawValue]
    if !dismissible { attributes["dismissible"] = "false" }
    if duration == .infinity || !dismissible { attributes["pinned"] = "true" }
    return attributes
  }

  private func dismiss() {
    guard !dismissed else { return }
    dismissed = true
    dismissal.onDismiss?()
  }

  /// Waits out the toast's time, unless it is pinned or VoiceOver runs.
  private func expire() async {
    guard dismissible, duration.isFinite, !voiceOver else { return }
    try? await Task.sleep(for: .milliseconds(Int(duration)))
    if !Task.isCancelled { dismiss() }
  }

  /// The title and description, spoken once: assertively for danger and
  /// warning, politely otherwise.
  private func announce() {
    var spoken = AttributedString(
      [props.title, props.description].compactMap { $0 }.joined(separator: ". "))
    spoken.accessibilitySpeechAnnouncementPriority =
      tone == .danger || tone == .warning ? .high : .default
    AccessibilityNotification.Announcement(spoken).post()
  }

  private struct TimerKey: Equatable {
    let identity: String
    let paused: Bool
  }
}

/// The owner's latest `onDismiss`, which `dismiss` calls. The timer's task
/// keeps the view it started from, whose props the owner may have replaced
/// since, so the callback is read from this reference, which every render
/// writes and nothing draws, as Compose's `rememberUpdatedState` keeps it.
@MainActor
private final class PMToastDismissal {
  var onDismiss: (@MainActor () -> Void)?
}

/// The accessibility escape gesture dismisses a dismissible toast, as Escape does on the web.
private struct PMEscape: ViewModifier {
  let enabled: Bool
  let perform: () -> Void

  func body(content: Content) -> some View {
    if enabled {
      content.accessibilityAction(.escape, perform)
    } else {
      content
    }
  }
}

/// The viewport's two registers (`toast.md`): below `PMRecipe.toastBelow` of
/// its width the card spans it inside `phoneInset`; from it the card is
/// `width` wide in the bottom trailing corner, `inset` from both edges. Either
/// way the card's foot is `inset` above the bottom.
private struct PMToastViewport: Layout {
  let phoneInset: CGFloat
  let inset: CGFloat
  let width: CGFloat

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let offered = proposal.width.flatMap { $0.isFinite ? $0 : nil }
    let height = subviews.first.map {
      $0.sizeThatFits(ProposedViewSize(width: cardWidth(offered ?? width), height: nil)).height
    } ?? 0
    return CGSize(width: offered ?? width + inset * 2, height: height + inset)
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    let across = cardWidth(bounds.width)
    let x = bounds.width < PMRecipe.toastBelow ? bounds.minX + phoneInset : bounds.maxX - inset - across
    subviews.first?.place(
      at: CGPoint(x: x, y: bounds.maxY - inset), anchor: .bottomLeading,
      proposal: ProposedViewSize(width: across, height: nil))
  }

  private func cardWidth(_ available: CGFloat) -> CGFloat {
    available < PMRecipe.toastBelow
      ? max(0, available - phoneInset * 2) : min(width, max(0, available - inset * 2))
  }
}

/// Toast's states, from the spec's States table: every tone, title only, an
/// action, pinned, and one its owner must remove. Each is pinned, so the
/// harness sees it.
public struct ToastStates: PMStates {
  public let member = "Toast"

  public init() {}

  private static let pinned = Double.infinity

  public var entries: [PMStateEntry] {
    let tones = PMToastTone.allCases.map { tone in
      PMStateEntry("tone \(tone.rawValue)", expect: ["tone": tone.rawValue]) {
        PMToast(
          props: PMToastProps(
            description: "The tone speaks through the glyph and nothing else.",
            durationMs: Self.pinned, title: tone.rawValue.capitalized, tone: tone))
      }
    }
    return tones + [
      PMStateEntry("title only", expect: ["tone": "neutral"]) {
        PMToast(props: PMToastProps(durationMs: Self.pinned, title: "Ticket created"))
      },
      PMStateEntry("with an action", expect: ["tone": "success"]) {
        PMToast(
          props: PMToastProps(
            action: PMToastAction(label: "Undo", onClick: {}), durationMs: Self.pinned,
            title: "Ticket archived", tone: .success))
      },
      PMStateEntry("danger, with an action", expect: ["tone": "danger"]) {
        PMToast(
          props: PMToastProps(
            action: PMToastAction(label: "Retry", onClick: {}),
            description: "The ticket is referenced by another.", durationMs: Self.pinned,
            title: "Could not delete", tone: .danger))
      },
      PMStateEntry("pinned — it waits to be dismissed", expect: ["pinned": "true"]) {
        PMToast(
          props: PMToastProps(
            description: "This one has no timer.", durationMs: Self.pinned, title: "Still working"))
      },
      PMStateEntry(
        "owned — no close, no timer, no swipe", expect: ["dismissible": "false", "pinned": "true"]
      ) {
        PMToast(
          props: PMToastProps(
            action: PMToastAction(label: "Retry", onClick: {}),
            description: "Retry when the connection is back.", dismissible: false,
            retained: true, title: "Could not sync", tone: .warning))
      },
    ]
  }
}
