// Relay's new-ticket form, wired as the inbox is: the store holds the emitted
// view's model and supplies its actions, and the route renders the view. The
// view itself, `NewTicketView.swift`, is emitted from
// `../../Screens/new-ticket.json` and holds none of this. The form has nothing
// to load, so it is ready from the start; submitting checks the two required
// fields and, when they hold, hands the ticket to the service and goes back.
// When they do not, the ErrorSummary above the card lists each field's error
// as a link to the field, which moves focus to its control.

import Observation
import PolymorphUI
import SwiftUI

/// Where a new ticket goes.
@MainActor
protocol TicketDesk {
  func create(_ draft: TicketDraft) async throws
}

/// What the form submits.
struct TicketDraft {
  var subject: String
  var requester: String
  var priority: String
  var assignee: String?
  var due: PMCalendarDate?
  var notify: Bool
}

/// The form's state, and the code behind its actions.
@MainActor @Observable
final class NewTicketStore {
  private(set) var model: NewTicketModel
  private(set) var submitted: TicketDraft?
  private let desk: any TicketDesk

  /// A blank form; a due date before `today` is not offered.
  init(desk: any TicketDesk, today: PMCalendarDate) {
    self.desk = desk
    model = NewTicketModel(
      loadStatus: .ready, confirming: false, errors: [], subject: "", subjectError: nil,
      requester: "",
      requesterError: nil, priority: "normal", priorityOptions: Self.priorities, assignee: nil,
      assigneeOptions: Self.team, due: nil, minDue: today, notify: true)
  }

  func actions(router: Router) -> NewTicketActions {
    NewTicketActions(
      onSubmit: { self.submit(router: router) },
      onConfirmingChange: { self.model.confirming = $0 },
      onDiscard: { self.model.confirming = true },
      onConfirmDiscard: {
        self.model.confirming = false
        router.back()
      },
      onSubjectChange: {
        self.model.subject = $0
        self.model.subjectError = nil
        self.summarize()
      },
      onRequesterChange: {
        self.model.requester = $0
        self.model.requesterError = nil
        self.summarize()
      },
      onPriorityChange: { self.model.priority = $0 ?? "normal" },
      onAssigneeChange: { self.model.assignee = $0 },
      onDueChange: { self.model.due = $0 },
      onNotifyChange: { self.model.notify = $0 })
  }

  /// Checks the required fields, then creates the ticket and goes back.
  func submit(router: Router) {
    let subject = model.subject.trimmingCharacters(in: .whitespaces)
    let requester = model.requester.trimmingCharacters(in: .whitespaces)
    model.subjectError = subject.isEmpty ? "Give the ticket a subject." : nil
    model.requesterError =
      requester.contains("@") ? nil : "Enter the email address replies should go to."
    summarize()
    guard model.subjectError == nil, model.requesterError == nil else { return }
    let draft = TicketDraft(
      subject: subject, requester: requester, priority: model.priority,
      assignee: model.assignee, due: model.due, notify: model.notify)
    submitted = draft
    Task {
      do {
        try await desk.create(draft)
        router.back()
      } catch {
        model.loadStatus = .failed(message: error.localizedDescription)
      }
    }
  }

  /// The summary above the card: each field's error, as a link to the field
  /// (`id` on its FormField), in the form's order.
  private func summarize() {
    model.errors = [
      model.subjectError.map { PMErrorSummaryError(label: $0, fieldId: "subject") },
      model.requesterError.map { PMErrorSummaryError(label: $0, fieldId: "requester") },
    ].compactMap { $0 }
  }

  /// Fills the form, as a person would before submitting.
  func fill(subject: String, requester: String, assignee: String?, due: PMCalendarDate?) {
    model.subject = subject
    model.requester = requester
    model.assignee = assignee
    model.due = due
  }

  static let priorities: [PMSelectOptionEntry] = [
    .option(PMSelectOption(value: "low", label: "Low")),
    .option(PMSelectOption(value: "normal", label: "Normal")),
    .option(PMSelectOption(value: "high", label: "High")),
    .option(
      PMSelectOption(value: "urgent", label: "Urgent", description: "Pages the on-call engineer")),
  ]

  static let team: [PMComboboxOption] = [
    PMComboboxOption(value: "ana", label: "Ana Ruiz"),
    PMComboboxOption(value: "ben", label: "Ben Okafor"),
    PMComboboxOption(value: "chloe", label: "Chloé Martin"),
  ]
}

extension Router {
  /// Back to the screen before.
  func back() {
    if !path.isEmpty { path.removeLast() }
  }
}

/// The new-ticket screen in the app: the view, rendered from its store.
struct NewTicketRoute: View {
  @State var store: NewTicketStore
  @Environment(Router.self) private var router

  var body: some View {
    NewTicketView(model: store.model, actions: store.actions(router: router))
  }
}
