// ConfirmDialog (`design/components/confirm-dialog.md`), adapted on iOS: a
// confirmation action sheet. The platform's `confirmationDialog` asks the
// question: the title, the description as its message, the confirm action
// named by `confirmLabel`, and cancel. The `danger` tone, the default, makes
// the confirm a destructive action, which the system draws in its destructive
// style and orders apart from cancel; `accent` is a plain action. Without a
// `cancelLabel` the system supplies its own cancel, the spec's default
// "Cancel" in the system's language, on a phone below the actions and on an
// iPad as a tap outside the popover.
//
// A typed confirmation (`confirmWith`) is Dialog's content-high sheet instead,
// because an action sheet holds no field: Dialog's `sm` panel with the title,
// the description, the phrase's FormField and Input in the body, and the
// footer, cancel (`outline/neutral`) then the confirm (`solid` in the tone).
// The field is labelled `confirmWithLabel` ("Type {phrase} to confirm" by
// default) and takes focus as the sheet opens. It takes the text as typed:
// the keyboard neither capitalises nor corrects it, and spell-checking, which
// iOS ties to correction, is off with it, because a correction can change a
// phrase such as "acme-billing" as it is typed. The confirm is disabled until
// the field holds the phrase, compared with the spaces around it removed and
// letter case ignored, and the field shows `confirmWithError` ("The text does
// not match") while its text cannot become the phrase. The field is emptied
// each time the dialog opens, and Return in it confirms nothing.
//
// The trigger is any view; the confirm puts its opening action in the
// environment (`pmTriggerAction`), and Button runs it, as Dialog does.
//
// Choosing confirm runs `onConfirm` and closes the dialog. The web's
// `onConfirm` may return a promise, which holds the dialog pending until it
// settles; the contract types it `@MainActor () -> Void`, because an action
// sheet closes as soon as an action is chosen and the app owns every task, so
// an action that takes time reports its outcome on the screen. The pending
// state therefore has no form here. The initial focus on cancel is the
// system's to place, `closeLabel` names the typed confirmation's close button
// and has no counterpart in an action sheet, and `presentation` has none in
// either form.

import PolymorphTokens
import SwiftUI

public struct PMConfirmDialog: PMConfirmDialogRendering {
  @Environment(\.pmTheme) private var theme
  @State private var presented = false
  @State private var typed = ""
  @State private var contentHeight: CGFloat = 0
  private let props: PMConfirmDialogProps

  public init(props: PMConfirmDialogProps) {
    self.props = props
  }

  public var body: some View {
    let open = props.open ?? presented
    let tone = props.tone ?? .danger
    let typing = props.confirmWith != nil

    PMOverlayTrigger(trigger: props.trigger) { setOpen(true) }
      .confirmationDialog(
        Text(props.title), isPresented: Binding(get: { open && !typing }, set: setOpen),
        titleVisibility: .visible
      ) {
        // Choosing an action dismisses the sheet, and SwiftUI writes `false`
        // through `isPresented`, which closes it once; an action that also
        // closed it would report the close twice.
        Button(props.confirmLabel, role: tone == .danger ? .destructive : nil) {
          props.onConfirm()
        }
        if let cancel = props.cancelLabel {
          Button(cancel, role: .cancel) {}
        }
      } message: {
        Text(props.description)
      }
      .sheet(isPresented: Binding(get: { open && typing }, set: setOpen)) {
        PMConfirmPhrasePanel(props: props, typed: $typed, overflow: .scrolls) { setOpen(false) }
          .background {
            // The content-high sheet is as tall as the panel whose body grows,
            // measured here and not drawn, as Dialog measures its own.
            PMConfirmPhrasePanel(
              props: props, typed: $typed, overflow: .grows, focuses: false
            ) {}
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
      .environment(\.pmSheetContentHeight, contentHeight)
      // Emptied as it opens, so a phrase typed for one confirm is never there for the next.
      .onChange(of: open) { _, now in
        if now { typed = "" }
      }
      .pmMember("ConfirmDialog", ["state": open ? "open" : "closed", "tone": tone.rawValue])
  }

  private func setOpen(_ open: Bool) {
    presented = open
    props.onOpenChange?(open)
  }
}

/// The typed confirmation's comparison (`confirm-dialog.md`): a text with the
/// spaces around it removed and letter case ignored, because a phone
/// capitalises a field's first letter.
struct PMConfirmPhrase {
  private let phrase: String

  init(_ phrase: String) {
    self.phrase = Self.comparable(phrase)
  }

  private static func comparable(_ text: String) -> String {
    text.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
  }

  /// Whether `typed` is the phrase, which enables the confirm.
  func holds(_ typed: String) -> Bool {
    Self.comparable(typed) == phrase
  }

  /// Whether `typed` cannot become the phrase: it is not empty and not the
  /// phrase's start, which shows the error.
  func refuses(_ typed: String) -> Bool {
    let entered = Self.comparable(typed)
    return !entered.isEmpty && !phrase.hasPrefix(entered)
  }
}

/// The typed confirmation's panel: Dialog's `sm` panel with the phrase's field
/// in the body and the two answers in the footer, cancel first. `focuses`
/// moves focus to the field as it appears; the measured copy's does not.
struct PMConfirmPhrasePanel: View {
  let props: PMConfirmDialogProps
  @Binding var typed: String
  var overflow: PMDialogOverflow = .scrolls
  /// Draws the overlay surface, as Dialog's states fixture draws its panel.
  var framed = false
  var focuses = true
  let close: @MainActor () -> Void

  var body: some View {
    let phraseText = props.confirmWith ?? ""
    let phrase = PMConfirmPhrase(phraseText)
    let danger = (props.tone ?? .danger) == .danger
    let field = PMFormField(
      props: PMFormFieldProps(
        children: PMContent(
          PMInput(
            // A plain text field asks for no content type, so no suggestion types
            // the phrase for the person; `exact` keeps the phrase as typed.
            props: PMInputProps(
              autoFocus: focuses, exact: true, onChange: { typed = $0 }, value: typed))),
        error: phrase.refuses(typed)
          ? (props.confirmWithError ?? PMStrings.confirmWithError) : nil,
        label: props.confirmWithLabel ?? PMStrings.confirmWithLabel(phrase: phraseText)))
    let footer = Group {
      PMButton(
        props: PMButtonProps(
          label: props.cancelLabel ?? PMStrings.cancel, onClick: close,
          appearance: .outlineNeutral))
      PMButton(
        props: PMButtonProps(
          disabled: !phrase.holds(typed), label: props.confirmLabel,
          onClick: {
            props.onConfirm()
            close()
          }, appearance: danger ? .solidDanger : .solidAccent))
    }

    PMDialogPanel(
      props: PMDialogProps(
        children: PMContent(field), closeLabel: props.closeLabel, description: props.description,
        footer: PMContent(footer), presentation: .sheet, size: .sm, title: props.title),
      overflow: overflow, framed: framed, close: close)
  }
}

/// ConfirmDialog's states, from the spec's States table. A closed entry is the
/// trigger the screen shows: the action sheet is the system's, and the harness
/// renders no presentation. The typed confirmation's open entries draw its
/// sheet's panel in place (`PMConfirmPhraseOpen`), as Dialog's open entries
/// do. Their field is UIKit's text field, which the simulator audit counts at
/// UIKit's height (`platforms/ios/README.md`, "What is not here"). The pending
/// state has no form on iOS.
public struct ConfirmDialogStates: PMStates {
  public let member = "ConfirmDialog"

  public init() {}

  private static func trigger(_ label: String) -> PMContent {
    PMContent(PMButton(props: PMButtonProps(label: label, appearance: .ghostNeutral)))
  }

  /// The typed confirmation the open entries share.
  private static let phrase = PMConfirmDialogProps(
    confirmLabel: "Delete project", confirmWith: "acme-billing",
    description: "Its tickets, members and settings are deleted with it.",
    onConfirm: {}, title: "Delete the acme-billing project?",
    trigger: trigger("Delete project"))

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("closed — just the trigger", expect: ["state": "closed", "tone": "danger"]) {
        PMConfirmDialog(
          props: PMConfirmDialogProps(
            confirmLabel: "Discard",
            description: "The subject and requester you have typed will be lost.",
            onConfirm: {}, title: "Discard this ticket?", trigger: Self.trigger("Discard")))
      },
      PMStateEntry(
        "closed, accent — consequential but safe", expect: ["state": "closed", "tone": "accent"]
      ) {
        PMConfirmDialog(
          props: PMConfirmDialogProps(
            cancelLabel: "Not yet", confirmLabel: "Publish",
            description: "It becomes visible to everyone with the link, immediately.",
            onConfirm: {}, title: "Publish this article?", tone: .accent,
            trigger: Self.trigger("Publish")))
      },
      PMStateEntry(
        "closed, with a phrase to type", expect: ["state": "closed", "tone": "danger"]
      ) {
        PMConfirmDialog(
          props: PMConfirmDialogProps(
            confirmLabel: "Delete project", confirmWith: "acme-billing",
            description: "Its tickets, members and settings are deleted with it.",
            onConfirm: {}, title: "Delete the acme-billing project?",
            trigger: Self.trigger("Delete project")))
      },
      PMStateEntry(
        "open, awaiting the phrase",
        expect: ["state": "open", "tone": "danger", "contains": "Input,Button[disabled=true]"]
      ) {
        PMConfirmPhraseOpen(props: Self.phrase, typed: "")
      },
      PMStateEntry(
        "open, the phrase mistyped",
        expect: [
          "state": "open", "tone": "danger",
          "contains": "FormField[invalid=true],Button[disabled=true]",
        ]
      ) {
        PMConfirmPhraseOpen(props: Self.phrase, typed: "acme-biling")
      },
    ]
  }
}

/// The typed confirmation open, as the states fixture draws it: the sheet's
/// panel in place, framed, with `typed` in its field, inside one ConfirmDialog
/// root. The field does not take focus, so no keyboard rises in the harness.
private struct PMConfirmPhraseOpen: View {
  let props: PMConfirmDialogProps
  let typed: String

  var body: some View {
    PMConfirmPhrasePanel(
      props: props, typed: .constant(typed), overflow: .grows, framed: true, focuses: false
    ) {}
    .accessibilityElement(children: .contain)
    .pmMember("ConfirmDialog", ["state": "open", "tone": (props.tone ?? .danger).rawValue])
  }
}
