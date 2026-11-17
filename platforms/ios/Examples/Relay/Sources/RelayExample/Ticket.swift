// Relay's own types, which the emitted inbox names: a ticket, and the queue's
// four numbers. The inbox's spec declares them under `./tickets`, the app's
// module, so the emitted file uses them by name and imports nothing for them.

import PolymorphUI

/// One conversation in the queue.
struct Ticket: Hashable, Sendable {
  enum Status: String, CaseIterable, Sendable {
    case open, waiting, solved
  }

  enum Priority: String, CaseIterable, Sendable {
    case low, normal, high, urgent
  }

  let id: String
  let subject: String
  let requester: String
  let status: Status
  let priority: Priority
  /// When it last changed, already formatted for the queue.
  let updated: String
}

/// The queue's four numbers: the summary band above the filters. The store
/// derives them from every ticket, not from the filtered view, so the band
/// keeps its numbers while a filter matches nothing.
struct QueueStats {
  var open: PMStatProps
  var urgent: PMStatProps
  var response: PMStatProps
  var solved: PMStatProps
}

extension QueueStats {
  /// The four numbers of `tickets`.
  init(_ tickets: [Ticket]) {
    let count = { (keep: (Ticket) -> Bool) in String(tickets.filter(keep).count) }
    open = PMStatProps(label: "Open", value: count { $0.status == .open })
    urgent = PMStatProps(
      label: "Urgent", value: count { $0.priority == .urgent && $0.status != .solved })
    // The service reports no response times, so the example shows one week's.
    response =
      tickets.isEmpty
      ? PMStatProps(label: "First response", value: "—")
      : PMStatProps(
        label: "First response", trend: PMStatTrend(direction: .down, label: "12 min faster"),
        value: "1h 04m")
    solved = PMStatProps(label: "Solved", value: count { $0.status == .solved })
  }
}

extension Ticket {
  /// A morning's queue, for previews and the example's renders.
  static let samples: [Ticket] = [
    Ticket(
      id: "T-1042", subject: "Refund for a duplicate charge", requester: "dana@northwind.example",
      status: .open, priority: .urgent, updated: "4 min ago"),
    Ticket(
      id: "T-1041", subject: "Cannot sign in on mobile", requester: "lee@contoso.example",
      status: .open, priority: .high, updated: "18 min ago"),
    Ticket(
      id: "T-1039", subject: "Webhook retries stop after the first 5xx",
      requester: "ops@fabrikam.example", status: .waiting, priority: .normal, updated: "1 h ago"),
    Ticket(
      id: "T-1036", subject: "Invoice address is wrong", requester: "ap@tailspin.example",
      status: .solved, priority: .low, updated: "Yesterday"),
  ]
}
