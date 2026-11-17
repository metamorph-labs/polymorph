// FormPage (`design/archetypes/form-page.md`): the create and edit screen. The
// page header, the cards of fields, and the committing row of actions, in a
// reading column narrower than a list's, because fields wider than the measure
// are hard to scan. The actions row is anchored: a rule above it connects the
// commit to the column it commits, under every theme.
//
// The load status (`design/native/screen-contract.md`): `loading` draws
// Skeletons over the cards and disables the actions row; `failed` puts a
// danger Alert above the cards, which keep what the person typed; `empty` is
// `ready`, because a blank form is its own empty form. The cards are drawn in
// every state at one place in the view tree, hidden while loading, so a change
// of status never rebuilds them: a field keeps its draft and its focus.
//
// Submitting: Return in a field submits through `onSubmit`, as Enter does in
// the web's `<form>`, and so does a `submit` Button in `actions`, which the web
// puts inside the form. A SwiftUI button belongs to no form, so the page hands
// `onSubmit` to the buttons in its actions row (`pmSubmitAction`).
//
// An ErrorSummary's link to `#<id>` moves focus to the control of the
// FormField whose `id` it names, as the web's fragment link focuses the
// control with that id: the page reads the link through the environment's
// `openURL` and hands the fields a focus request (`PMFieldFocusRequest`). A
// link to anywhere else goes on to the app's own `openURL`.

import PolymorphTokens
import SwiftUI

public struct PMFormPage: PMFormPageRendering {
  @Environment(\.pmTheme) private var theme
  @Environment(\.openURL) private var openURL
  @State private var focusRequest: PMFieldFocusRequest?
  private let props: PMFormPageProps

  public init(props: PMFormPageProps) {
    self.props = props
  }

  public var body: some View {
    let space = theme.defaultDensity.space
    let status = props.loadStatus
    let (loading, failure): (Bool, String?) =
      switch status {
      case .loading: (true, nil)
      case .ready, .empty: (false, nil)
      case .failed(let message): (false, message)
      }

    PMPage(measure: PMRecipe.formPageMeasure, member: "FormPage", status: status) {
      PMPageHeader(props: PMPageHeaderProps(description: props.description, title: props.title))
      if let failure {
        // Above the cards, which keep what the person typed.
        PMPageFailure(message: failure, onRetry: props.onRetry)
      }
      ZStack(alignment: .top) {
        cards
          .opacity(loading ? 0 : 1)
          .accessibilityHidden(loading)
          .allowsHitTesting(!loading)
        if loading {
          PMPagePanel {
            PMPageSkeletonRows(rows: 3).padding(space.s6)
          }
        }
      }
      HStack(spacing: space.s3) {
        Spacer(minLength: 0)
        props.actions
          .environment(\.pmSubmitAction, props.onSubmit)
      }
      .padding(.top, space.s5)
      .overlay(alignment: .top) { PMRule(theme.colors.borderSubtle) }
      .disabled(loading)
    }
  }

  /// The cards of fields; Return in a field submits, and a link to a field
  /// moves focus to its control.
  private var cards: some View {
    VStack(alignment: .leading, spacing: theme.defaultDensity.space.s6) {
      props.children
    }
    .frame(maxWidth: .infinity, alignment: .topLeading)
    .onSubmit { props.onSubmit?() }
    .environment(\.pmFieldFocusRequest, focusRequest)
    .environment(\.openURL, OpenURLAction(handler: open))
  }

  /// A link to `#<id>` asks the field `id` names for focus; any other link
  /// goes on to the app's `openURL`.
  private func open(_ url: URL) -> OpenURLAction.Result {
    guard let id = PMFieldFocusRequest.fieldId(of: url) else {
      openURL(url)
      return .handled
    }
    focusRequest = PMFieldFocusRequest(id: id, serial: (focusRequest?.serial ?? 0) + 1)
    return .handled
  }
}

/// FormPage's states: the four load states, the failed one keeping its fields.
/// Each names what its body holds (`contains`): the fields while they show,
/// the Skeletons while loading, and the Alert above the fields when loading
/// failed.
public struct FormPageStates: PMStates {
  public let member = "FormPage"

  public init() {}

  private static let title = "New ticket"
  private static let description = "Describe the problem; we reply within a day."
  private static let create = "Create ticket"
  private static let cancel = "Cancel"
  private static let subject = "Subject"
  private static let typed = "Refund for a duplicate charge"
  private static let fields = [("Customer", "Ada Lovelace"), ("Plan", "Business")]
  private static let failure = "The ticket could not be saved. Try again in a moment."

  private func card() -> PMContent {
    AnyView(
      PMCard(
        props: PMCardProps(
          children: AnyView(
            PMStack(
              props: PMStackProps(
                children: AnyView(
                  Group {
                    PMFormField(
                      props: PMFormFieldProps(
                        children: AnyView(
                          PMInput(props: PMInputProps(defaultValue: Self.typed))),
                        label: Self.subject))
                    PMDescriptionList(
                      props: PMDescriptionListProps(
                        items: Self.fields.map {
                          PMDescriptionListItem(term: $0.0, detail: AnyView(Text($0.1)))
                        }))
                  }),
                gap: .s5))))))
  }

  private func page(_ status: PMLoadStatus) -> some View {
    PMFormPage(
      props: PMFormPageProps(
        loadStatus: status, onRetry: {},
        actions: AnyView(
          Group {
            PMButton(props: PMButtonProps(label: Self.cancel, appearance: .ghostNeutral))
            PMButton(props: PMButtonProps(label: Self.create, type: .submit))
          }),
        children: card(), description: Self.description, onSubmit: {}, title: Self.title)
    )
  }

  public var entries: [PMStateEntry] {
    [
      PMStateEntry("ready", expect: ["status": "ready", "contains": "FormField,Input"]) {
        page(.ready)
      },
      PMStateEntry("loading", expect: ["status": "loading", "contains": "Skeleton"]) {
        page(.loading)
      },
      PMStateEntry("empty", expect: ["status": "empty", "contains": "FormField,Input"]) {
        page(.empty)
      },
      PMStateEntry(
        "failed, the fields kept", expect: ["status": "failed", "contains": "Alert,Input"]
      ) {
        page(.failed(message: Self.failure))
      },
    ]
  }
}
