// Emitted from a screen spec (`polymorph-screen/1`): `NewTicketView`, for iOS. The view is the
// spec's tree and nothing more: it holds no state, calls nothing asynchronous and navigates
// nowhere. The app renders it from a store that owns the model, its tasks and its router, and
// supplies the actions (`design/native/screen-contract.md`).

import PolymorphUI
import SwiftUI

/// What `NewTicketView` shows. `loadStatus` says which of the four load states it is in.
struct NewTicketModel {
  var loadStatus: PMLoadStatus
  /// Whether the discard confirmation is open.
  var confirming: Bool
  /// What the last submit refused, each naming its field; empty while nothing is refused.
  var errors: [PMErrorSummaryError]
  var subject: String
  var subjectError: String?
  var requester: String
  var requesterError: String?
  var priority: String
  var priorityOptions: [PMSelectOptionEntry]
  var assignee: String?
  var assigneeOptions: [PMComboboxOption]
  var due: PMCalendarDate?
  /// Today — a due date in the past is not a due date.
  var minDue: PMCalendarDate
  var notify: Bool
}

/// The code the app supplies to `NewTicketView`, one closure per action.
struct NewTicketActions {
  /// FormPage calls it on Return in a field and on a submit Button in its actions.
  let onSubmit: @MainActor () -> Void
  let onConfirmingChange: @MainActor (Bool) -> Void
  let onDiscard: @MainActor () -> Void
  let onConfirmDiscard: @MainActor () -> Void
  let onSubjectChange: @MainActor (String) -> Void
  let onRequesterChange: @MainActor (String) -> Void
  let onPriorityChange: @MainActor (String?) -> Void
  let onAssigneeChange: @MainActor (String?) -> Void
  let onDueChange: @MainActor (PMCalendarDate?) -> Void
  let onNotifyChange: @MainActor (Bool) -> Void
}

/// Relay's new-ticket form — one card of fields under a page header, with a guarded discard.
@MainActor
struct NewTicketView: View {
  let model: NewTicketModel
  let actions: NewTicketActions

  var body: some View {
    PMFormPage(
      props: .init(
        loadStatus: model.loadStatus,
        actions: AnyView(
          Group {
            PMConfirmDialog(
              props: .init(
                confirmLabel: "Discard",
                description: "The subject and requester you have typed will be lost.",
                onConfirm: actions.onConfirmDiscard,
                onOpenChange: actions.onConfirmingChange,
                open: model.confirming,
                title: "Discard this ticket?",
                trigger: AnyView(
                  PMButton(
                    props: .init(
                      label: "Discard",
                      onClick: actions.onDiscard,
                      appearance: .ghostNeutral
                    )
                  )
                )
              )
            )
            PMButton(props: .init(icon: .confirm, label: "Create ticket", type: .submit))
          }
        ),
        children: AnyView(
          Group {
            PMErrorSummary(
              props: .init(errors: model.errors, title: "The ticket can’t be raised yet")
            )
            PMCard(
              props: .init(
                children: AnyView(
                  PMStack(
                    props: .init(
                      children: AnyView(
                        Group {
                          PMFormField(
                            props: .init(
                              children: AnyView(
                                PMInput(
                                  props: .init(
                                    maxLength: 120,
                                    onChange: actions.onSubjectChange,
                                    placeholder: "Webhook retries stop after the first 5xx",
                                    value: model.subject
                                  )
                                )
                              ),
                              description: "One line. It is what the queue is scanned by.",
                              error: model.subjectError,
                              id: "subject",
                              label: "Subject",
                              required: true
                            )
                          )
                          PMGrid(
                            props: .init(
                              children: AnyView(
                                Group {
                                  PMFormField(
                                    props: .init(
                                      children: AnyView(
                                        PMInput(
                                          props: .init(
                                            autoComplete: "email",
                                            onChange: actions.onRequesterChange,
                                            placeholder: "dana@northwind.example",
                                            type: .email,
                                            value: model.requester
                                          )
                                        )
                                      ),
                                      description: "Where the confirmation and replies go.",
                                      error: model.requesterError,
                                      id: "requester",
                                      label: "Requester",
                                      required: true
                                    )
                                  )
                                  PMFormField(
                                    props: .init(
                                      children: AnyView(
                                        PMSelect(
                                          props: .init(
                                            onChange: actions.onPriorityChange,
                                            options: model.priorityOptions,
                                            value: .some(model.priority)
                                          )
                                        )
                                      ),
                                      description: "Urgent pages the on-call engineer.",
                                      label: "Priority"
                                    )
                                  )
                                }
                              ),
                              columns: .columns2,
                              gap: .s5
                            )
                          )
                          PMGrid(
                            props: .init(
                              children: AnyView(
                                Group {
                                  PMFormField(
                                    props: .init(
                                      children: AnyView(
                                        PMCombobox(
                                          props: .init(
                                            clearable: true,
                                            onChange: actions.onAssigneeChange,
                                            options: model.assigneeOptions,
                                            placeholder: "Search the team…",
                                            value: .some(model.assignee)
                                          )
                                        )
                                      ),
                                      description: "Who picks this up, if anyone.",
                                      label: "Assignee"
                                    )
                                  )
                                  PMFormField(
                                    props: .init(
                                      children: AnyView(
                                        PMDatePicker(
                                          props: .init(
                                            clearable: true,
                                            minValue: model.minDue,
                                            onChange: actions.onDueChange,
                                            value: .some(model.due)
                                          )
                                        )
                                      ),
                                      description: "The day it has to be answered.",
                                      label: "Due date"
                                    )
                                  )
                                }
                              ),
                              columns: .columns2,
                              gap: .s5
                            )
                          )
                          PMFormField(
                            props: .init(
                              children: AnyView(
                                PMSwitch(
                                  props: .init(
                                    checked: model.notify,
                                    onCheckedChange: actions.onNotifyChange
                                  )
                                )
                              ),
                              description: "Sends a confirmation with the ticket number.",
                              label: "Notify the requester"
                            )
                          )
                        }
                      ),
                      gap: .s5
                    )
                  )
                )
              )
            )
          }
        ),
        description: "Raise a conversation on someone's behalf — a phone call, or an email that never reached the queue.",
        onSubmit: actions.onSubmit,
        title: "New ticket"
      )
    )
  }
}

extension NewTicketActions {
  /// Every action doing nothing, so an app compiles against the view before it wires its store. An
  /// action that answers returns the empty value of its result.
  @MainActor static let inert: Self = Self(
    onSubmit: {},
    onConfirmingChange: { _ in },
    onDiscard: {},
    onConfirmDiscard: {},
    onSubjectChange: { _ in },
    onRequesterChange: { _ in },
    onPriorityChange: { _ in },
    onAssigneeChange: { _ in },
    onDueChange: { _ in },
    onNotifyChange: { _ in }
  )
}
