// Dialog (`design/components/dialog.md`), adapted on iOS: a modal sheet. The
// trigger stays where the screen puts it; opening presents the panel as a
// sheet, the platform's modal surface, on the overlay colour with the surface
// radius: the title (`text.xl`, a header), the description, the body, which
// scrolls while the title and the footer stay, and the footer's actions at the
// trailing end. The close button is Button's ghost/neutral/sm icon-only
// `close`, named by `closeLabel` (default "Close").
//
// `presentation: .auto` is the full-height sheet, the phone's counterpart of
// the web's full-screen card below 30rem; `.sheet` is a sheet as tall as its
// content, for a short confirm or pick. `dismissible: false` removes the close
// button and stops the swipe that dismisses a sheet, so the footer must
// answer. The system draws the scrim, and its colour is the system's.
//
// The trigger is any view; the dialog puts its opening action in the
// environment (`pmTriggerAction`), and Button runs it after its own action, as
// the web clones the trigger to add an `onClick`. `open` with `onOpenChange`
// is the controlled form; `defaultOpen` opens it on its own.
//
// A content-high sheet is no taller than the sheet recipe's share of the
// window (`PMRecipe.sheetHeight`), and its body scrolls past it. From iOS 18 a
// sheet on a regular width (an iPad, a Mac) is as wide as `size` gives it, the
// recipe's width in `space-10` steps; on a phone it spans the screen.
//
// Not honoured: `size` before iOS 18, where a sheet's width is the system's;
// `initialFocus`, because the footer is a view the dialog cannot reach into
// (VoiceOver starts on the title, as on every sheet); and `alert`, because
// every sheet is already modal to assistive technology, which is what
// `alertdialog` adds on the web.

import PolymorphTokens
import SwiftUI

public struct PMDialog: PMDialogRendering {
  @Environment(\.pmTheme) private var theme
  @State private var presented: Bool
  @State private var contentHeight: CGFloat = 0
  private let props: PMDialogProps

  public init(props: PMDialogProps) {
    self.props = props
    _presented = State(initialValue: props.defaultOpen ?? false)
  }

  public var body: some View {
    let open = props.open ?? presented
    let dismissible = props.dismissible ?? true

    PMOverlayTrigger(trigger: props.trigger) { setOpen(true) }
      .sheet(isPresented: Binding(get: { open }, set: setOpen)) {
        PMDialogPanel(props: props, overflow: .scrolls) { setOpen(false) }
          .background {
            // The content-high sheet is as tall as the panel whose body grows,
            // measured here and not drawn; the sheet caps it, and the body of
            // the panel it draws scrolls past the cap.
            if props.presentation == .sheet {
              PMDialogPanel(props: props, overflow: .grows) {}
                .fixedSize(horizontal: false, vertical: true)
                .hidden()
                .onGeometryChange(for: CGFloat.self) {
                  $0.size.height
                } action: {
                  contentHeight = $0
                }
            }
          }
          .modifier(PMSheetWidth(width: Self.width(props.size ?? .md, theme)))
          .presentationDetents(detents)
          .presentationBackground(theme.colors.bgOverlay.color)
          .presentationCornerRadius(theme.radius.surface)
          .interactiveDismissDisabled(!dismissible)
      }
      .environment(\.pmSheetContentHeight, contentHeight)
      .pmMember(
        "Dialog", ["state": open ? "open" : "closed", "size": (props.size ?? .md).rawValue])
  }

  /// The full-height sheet, or one as tall as its content up to the sheet's cap.
  private var detents: Set<PresentationDetent> {
    props.presentation == .sheet ? [.custom(PMContentSheetDetent.self)] : [.large]
  }

  /// The panel's width by `size`, the recipe's `inline-size` in `space-10`
  /// steps (`PMRecipe.dialogWidth…`).
  static func width(_ size: PMControlSize, _ theme: PMTheme) -> CGFloat {
    let step = theme.defaultDensity.space.s10
    return switch size {
    case .sm: step * PMRecipe.dialogWidthSm
    case .md: step * PMRecipe.dialogWidthMd
    case .lg: step * PMRecipe.dialogWidthLg
    }
  }

  private func setOpen(_ open: Bool) {
    presented = open
    props.onOpenChange?(open)
  }
}

/// The panel the sheet presents: the header with the close button, the
/// description, the body and the footer, inset by the surface inset. The
/// states fixture draws it in place, `framed`, with a body that grows or is
/// clipped, because the harness renders no presentation and no scroll view.
struct PMDialogPanel: View {
  @Environment(\.pmTheme) private var theme
  let props: PMDialogProps
  var overflow: PMDialogOverflow = .scrolls
  /// Draws the overlay surface, its border, radius and shadow, which the
  /// sheet otherwise draws.
  var framed = false
  let close: @MainActor () -> Void

  var body: some View {
    let density = theme.defaultDensity
    let space = density.space
    let dismissible = props.dismissible ?? true
    // The close button's drawn box sits `space-4` from the corner; its hit
    // area reaches past it.
    let closeInset = max(0, space.s4 - (density.hitTarget - density.controlHeight.sm) / 2)

    VStack(alignment: .leading, spacing: 0) {
      Text(props.title)
        .pmTextStyle(theme.text.xl)
        .foregroundStyle(theme.colors.textPrimary.color)
        .padding(.trailing, dismissible ? space.s8 : 0)
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityAddTraits(.isHeader)
      if let description = props.description {
        Text(description)
          .pmTextStyle(theme.text.sm)
          .foregroundStyle(theme.colors.textSecondary.color)
          .fixedSize(horizontal: false, vertical: true)
          .padding(.top, space.s2)
      }
      if let children = props.children {
        let content = children.frame(maxWidth: .infinity, alignment: .leading)
        Group {
          switch overflow {
          case .scrolls:
            ScrollView { content }
          case .grows:
            content
          case .clips:
            PMClippedBody { content }
          }
        }
        .padding(.top, space.s5)
      }
      if let footer = props.footer {
        HStack(spacing: space.s3) {
          Spacer(minLength: 0)
          footer
        }
        .padding(.top, space.s6)
      }
    }
    .padding(density.inset.surface)
    .frame(maxWidth: .infinity, alignment: .topLeading)
    .overlay(alignment: .topTrailing) {
      if dismissible {
        PMButton(
          props: PMButtonProps(
            icon: .close, iconOnly: true, label: props.closeLabel ?? PMStrings.close,
            onClick: close, size: .sm, appearance: .ghostNeutral)
        )
        .padding(closeInset)
      }
    }
    .modifier(PMSurfaceFrame(visible: framed))
    .accessibilityElement(children: .contain)
    .accessibilityAddTraits(.isModal)
    .pmMember("Dialog", ["state": "open", "size": (props.size ?? .md).rawValue])
  }
}

/// What the panel's body does with more than the panel has room for.
enum PMDialogOverflow {
  /// It scrolls while the title and the footer stay: the full-height sheet.
  case scrolls
  /// It grows the panel: the content-high sheet, which is for short content
  /// and which a scroll view would stretch to the screen's height.
  case grows
  /// It scrolls where the members draw their scroll views, and is otherwise
  /// cut at the panel's height, top first, a scroll view at rest: the states
  /// fixture's panel, which the harness draws both ways (`pmPageScrolls`).
  case clips
}

/// A body that scrolls between a panel's fixed parts where the members draw
/// their scroll views, and is cut at the panel's height, top first, where
/// they are at rest.
struct PMClippedBody<Content: View>: View {
  @Environment(\.pmPageScrolls) private var scrolls
  @ViewBuilder let content: () -> Content

  var body: some View {
    if scrolls {
      PMPanelScroll { content() }
    } else {
      content()
        .fixedSize(horizontal: false, vertical: true)
        .frame(minHeight: 0, maxHeight: .infinity, alignment: .top)
        .clipped()
    }
  }
}

/// Dialog's states, from the spec's States table. The closed entries are the
/// trigger the screen shows; the open ones draw the panel the sheet presents,
/// in place, because the harness renders no presentation.
public struct DialogStates: PMStates {
  public let member = "Dialog"

  public init() {}

  private static let discard = "Discard this ticket?"
  private static let kept = "Nothing you typed is kept."

  private static func body(_ text: String) -> PMContent {
    PMContent(PMDialogBody(text: text))
  }

  private static func button(_ label: String, _ appearance: PMButtonAppearance = .solidAccent)
    -> PMContent
  {
    PMContent(PMButton(props: PMButtonProps(label: label, appearance: appearance)))
  }

  private static func panel(_ props: PMDialogProps) -> some View {
    PMDialogPanel(props: props, overflow: .grows, framed: true, close: {})
  }

  /// A long body, several times what the panel has room for.
  private static let terms = Array(
    repeating:
      "Closing a ticket stops its reminders, removes it from every queue and sends the "
      + "customer the closing note. A closed ticket can be reopened for thirty days.",
    count: 4
  ).joined(separator: " ")

  public var entries: [PMStateEntry] {
    let sizes = PMControlSize.allCases.map { size in
      PMStateEntry(
        "trigger, \(size.rawValue)", expect: ["state": "closed", "size": size.rawValue]
      ) {
        PMDialog(
          props: PMDialogProps(
            children: Self.body("Body."), description: Self.kept, size: size,
            title: "A \(size.rawValue) dialog",
            trigger: Self.button("Open \(size.rawValue)", .outlineNeutral)))
      }
    }
    return [
      PMStateEntry("plain — the trigger", expect: ["state": "closed"]) {
        PMDialog(
          props: PMDialogProps(
            children: Self.body("This is the body."), title: Self.discard,
            trigger: Self.button("Open")))
      },
      PMStateEntry(
        "open md — the panel, with a footer", expect: ["state": "open", "size": "md"]
      ) {
        Self.panel(
          PMDialogProps(
            children: Self.body("The panel is a sheet on a phone."), description: Self.kept,
            footer: Self.button("Discard", .solidDanger), title: Self.discard))
      },
      PMStateEntry("described", expect: ["state": "open"]) {
        Self.panel(
          PMDialogProps(
            children: Self.body("The description sits under the title."),
            description: Self.kept, title: Self.discard))
      },
      PMStateEntry("with a footer — one primary action, trailing", expect: ["state": "open"]) {
        Self.panel(
          PMDialogProps(
            children: Self.body("The primary action is the only solid one."),
            description: Self.kept,
            footer: PMContent(PMDialogFooter(cancel: "Keep editing", confirm: "Discard")),
            title: Self.discard))
      },
      PMStateEntry("with a form", expect: ["state": "open"]) {
        Self.panel(
          PMDialogProps(
            children: PMContent(
              PMFormField(
                props: PMFormFieldProps(
                  children: PMContent(
                    PMInput(props: PMInputProps(placeholder: "What went wrong?"))),
                  description: "One line, as the customer would say it.", label: "Subject"))),
            description: "Focus starts in the first field.", footer: Self.button("Create"),
            title: "New ticket"))
      },
      PMStateEntry("scrolling body — the title and the footer stay", expect: ["state": "open"]) {
        PMDialogCapped(
          props: PMDialogProps(
            children: Self.body(Self.terms), description: Self.kept,
            footer: PMContent(PMDialogFooter(cancel: "Keep it open", confirm: "Close ticket")),
            title: "Close this ticket?"))
      },
      PMStateEntry("non-dismissible — no close button", expect: ["state": "open"]) {
        Self.panel(
          PMDialogProps(
            children: Self.body("A forced choice. Use sparingly."),
            description: "This one cannot be waved away.", dismissible: false,
            footer: PMContent(PMDialogFooter(cancel: "Cancel", confirm: "Continue")),
            title: "Choose one"))
      },
    ] + sizes
  }
}

/// A panel shorter than its body, as a sheet is on a phone: the body is cut
/// where it would scroll, between the title and the footer.
private struct PMDialogCapped: View {
  @Environment(\.pmTheme) private var theme
  let props: PMDialogProps

  var body: some View {
    PMDialogPanel(props: props, overflow: .clips, framed: true, close: {})
      .frame(height: theme.defaultDensity.space.s10 * PMFixtureSpan.cappedDialog)
  }
}

/// Body copy for the fixture's panels.
private struct PMDialogBody: View {
  @Environment(\.pmTheme) private var theme
  let text: String

  var body: some View {
    Text(text)
      .pmTextStyle(theme.text.md)
      .foregroundStyle(theme.colors.textPrimary.color)
  }
}

/// A dismiss action and a primary one, the primary trailing.
private struct PMDialogFooter: View {
  @Environment(\.pmTheme) private var theme
  let cancel: String
  let confirm: String

  var body: some View {
    HStack(spacing: theme.defaultDensity.space.s3) {
      PMButton(props: PMButtonProps(label: cancel, appearance: .outlineNeutral))
      PMButton(props: PMButtonProps(label: confirm, appearance: .solidDanger))
    }
  }
}
