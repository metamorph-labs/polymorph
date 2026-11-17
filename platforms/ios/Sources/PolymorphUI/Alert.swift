// Alert (`design/components/alert.md`): an inline status callout in page
// content. One panel on its tone's wash with its tone's border; the tone glyph
// beside the first line; a title and a body that differ by colour, never by an
// added weight; at most two actions, `action` then `secondaryAction`, in a row
// that falls to a column where the row does not fit; and a dismiss button when
// `onDismiss` is set. No variants and no sizes: a solid Alert would compete
// with Toast. The actions come before the dismiss button in reading order.
//
// With no title (`nil` or empty) and no `children` it draws nothing, so a
// screen can draw it always and bind its title to a message that is empty
// while there is none. An action or `onDismiss` is not content. A title with
// no `children` draws the title alone, with no gap under it.
//
// Dismissing it is `collapse` in exit mode: the content fades over the first
// half of the surface's exit duration, then the row closes over the second,
// and `onDismiss` is called once it has closed so the app can remove it. Under
// Reduce Motion the content still fades and the row closes at once. Focus does
// not move: nothing was modal.
//
// What the web expresses as roles has no counterpart here: iOS has no status
// or alert role for a view in the page, and announcing on appear would also
// announce an Alert that was there from the start. The tone is the root's
// `tone` attribute and the glyph's meaning is in the title and the body.
//
// `icon` is the opaque `PMUnsupportedAlertIcon`: the web's type is the single
// literal `false`, which the contract cannot write as `Bool` without widening
// it. Its one value is that literal, so a present `icon` suppresses the tone
// glyph, as `icon={false}` does on the web.

import PolymorphTokens
import SwiftUI

public struct PMAlert: PMAlertRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var faded = false
  @State private var closed = false
  private let props: PMAlertProps

  public init(props: PMAlertProps) {
    self.props = props
  }

  public var body: some View {
    let tone = props.tone ?? .info
    let recipe = AlertRecipe(tone: tone, colors: theme.colors)
    let space = theme.defaultDensity.space
    let shape = RoundedRectangle(cornerRadius: theme.radius.lg)
    let line = theme.text.sm.lineBox
    let title = props.title.flatMap { $0.isEmpty ? nil : $0 }

    if title != nil || props.children != nil {
      PMCollapse(progress: closed ? 0 : 1) {
        HStack(alignment: .top, spacing: space.s3) {
          if props.icon == nil {
            // One text line tall, so a long Alert keeps the glyph by its first line.
            PMIconView(recipe.glyph, size: .md)
              .foregroundStyle(recipe.text.color)
              .frame(minHeight: line)
          }

          VStack(alignment: .leading, spacing: 0) {
            if let title {
              Text(title)
                .pmTextStyle(theme.text.sm)
                .foregroundStyle(theme.colors.textPrimary.color)
                .padding(.bottom, props.children == nil ? 0 : space.s1)
            }
            if let children = props.children {
              children
                .pmTextStyle(theme.text.sm)
                .foregroundStyle(theme.colors.textSecondary.color)
            }
            if props.action != nil || props.secondaryAction != nil {
              // A row, as the recipe's wrapping row, or a column on a width too
              // narrow for both; the first action leads either way.
              ViewThatFits(in: .horizontal) {
                HStack(spacing: space.s2) { actions }
                VStack(alignment: .leading, spacing: space.s2) { actions }
              }
              .padding(.top, space.s2)
            }
          }
          .fixedSize(horizontal: false, vertical: true)
          .frame(maxWidth: .infinity, alignment: .leading)

          if props.onDismiss != nil {
            PMButton(
              props: PMButtonProps(
                icon: .close, iconOnly: true, label: props.dismissLabel ?? PMStrings.dismiss,
                onClick: dismiss, size: .sm, appearance: .ghostNeutral))
          }
        }
        .padding(space.s4)
        .background(recipe.wash.color, in: shape)
        .overlay { shape.strokeBorder(recipe.border.color, lineWidth: 1) }
        .opacity(faded ? 0 : 1)
      }
      .accessibilityElement(children: .contain)
      .pmMember("Alert", ["tone": tone.rawValue])
    }
  }

  /// The first action, then the second.
  @ViewBuilder private var actions: some View {
    props.action
    props.secondaryAction
  }

  /// The row fades, then closes, then tells the app.
  private func dismiss() {
    let motion = theme.defaultMotion
    let half = motion.duration.surfaceExit / 2
    let easing = motion.easing.exit
    withAnimation(easing.animation(duration: half)) {
      faded = true
    } completion: {
      if reduceMotion || half == 0 {
        closed = true
        props.onDismiss?()
        return
      }
      withAnimation(easing.animation(duration: half)) {
        closed = true
      } completion: {
        props.onDismiss?()
      }
    }
  }
}

/// The tone's three roles and its glyph: the wash, its border, and the glyph's
/// colour, `{tone}.text` on `{tone}.subtle`, the pairing the contrast law checks.
private struct AlertRecipe {
  let wash: PMDynamicColor
  let border: PMDynamicColor
  let text: PMDynamicColor
  let glyph: PMIconRole

  init(tone: PMAlertTone, colors c: PMColors) {
    switch tone {
    case .info: (wash, border, text, glyph) = (c.infoSubtle, c.infoBorder, c.infoText, .info)
    case .success:
      (wash, border, text, glyph) = (c.successSubtle, c.successBorder, c.successText, .success)
    case .warning:
      (wash, border, text, glyph) = (c.warningSubtle, c.warningBorder, c.warningText, .warning)
    case .danger: (wash, border, text, glyph) = (c.dangerSubtle, c.dangerBorder, c.dangerText, .error)
    }
  }
}

/// Alert's states, from the spec's States table: each tone, title and body,
/// body only, title only, one action, two actions, the dismiss button, and an
/// Alert with nothing to say, which draws nothing.
public struct AlertStates: PMStates {
  public let member = "Alert"

  public init() {}

  private static let title = "Sandbox mode"
  private static let body = "Payments in this workspace are simulated until you go live."
  private static let short = "Two fields need attention."
  private static let action = "Go live"
  private static let review = "Three ticket fields came across under new names."
  private static let unsaved = "The changes could not be saved"

  private func copy(_ text: String) -> PMContent {
    AnyView(Text(text))
  }

  public var entries: [PMStateEntry] {
    let tones = PMAlertTone.allCases.map { tone in
      PMStateEntry(tone.rawValue, expect: ["tone": tone.rawValue]) {
        PMAlert(props: PMAlertProps(children: copy(Self.body), title: Self.title, tone: tone))
      }
    }
    return tones + [
      PMStateEntry("body only", expect: ["tone": "danger"]) {
        PMAlert(props: PMAlertProps(children: copy(Self.short), tone: .danger))
      },
      PMStateEntry("title only", expect: ["tone": "danger"]) {
        PMAlert(props: PMAlertProps(title: Self.unsaved, tone: .danger))
      },
      PMStateEntry("with action", expect: ["tone": "warning"]) {
        PMAlert(
          props: PMAlertProps(
            action: AnyView(
              PMButton(props: PMButtonProps(label: Self.action, size: .sm, appearance: .ghostNeutral))),
            children: copy(Self.body), title: Self.title, tone: .warning))
      },
      PMStateEntry("with two actions", expect: ["tone": "info"]) {
        PMAlert(
          props: PMAlertProps(
            action: AnyView(
              PMButton(props: PMButtonProps(label: "Apply", size: .sm, appearance: .softAccent))),
            children: copy(Self.review),
            secondaryAction: AnyView(
              PMButton(props: PMButtonProps(label: "Discard", size: .sm, appearance: .ghostNeutral))),
            title: "Imported fields need review"))
      },
      PMStateEntry("dismissible", expect: ["tone": "info"]) {
        PMAlert(
          props: PMAlertProps(children: copy(Self.body), onDismiss: {}, title: Self.title))
      },
      PMStateEntry("icon suppressed", expect: ["tone": "success"]) {
        PMAlert(
          props: PMAlertProps(
            children: copy(Self.short), icon: PMUnsupportedAlertIcon(), tone: .success))
      },
      // An empty title and a dismiss handler still give the Alert nothing to show.
      PMStateEntry("nothing to say", expect: ["hidden": "true", "renders": "nothing"]) {
        PMAlert(props: PMAlertProps(onDismiss: {}, title: "", tone: .danger))
      },
    ]
  }
}
