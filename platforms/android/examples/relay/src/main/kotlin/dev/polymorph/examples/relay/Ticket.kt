// Relay's own types, which the emitted inbox names: a ticket, and the queue's
// four numbers. The inbox's spec declares them under `./tickets`, the app's
// module, so the emitted screen, in the same package, uses them by name and
// imports nothing for them.

package dev.polymorph.examples.relay

import dev.polymorph.ui.PMDeltaDirection
import dev.polymorph.ui.PMStatProps
import dev.polymorph.ui.PMStatTrend

/** One conversation in the queue. */
data class Ticket(
    val id: String,
    val subject: String,
    val requester: String,
    val status: Status,
    val priority: Priority,
    /** When it last changed, already formatted for the queue. */
    val updated: String,
) {
    enum class Status(val value: String, val label: String) {
        Open("open", "Open"),
        Waiting("waiting", "Waiting"),
        Solved("solved", "Solved"),
    }

    /** In rising order, which is the order the queue sorts by. */
    enum class Priority(val value: String, val label: String) {
        Low("low", "Low"),
        Normal("normal", "Normal"),
        High("high", "High"),
        Urgent("urgent", "Urgent"),
    }

    companion object {
        /** A morning's queue, for previews and the example's renders. */
        val samples: List<Ticket> = listOf(
            Ticket(
                id = "T-1042",
                subject = "Refund for a duplicate charge",
                requester = "dana@northwind.example",
                status = Status.Open,
                priority = Priority.Urgent,
                updated = "4 min ago",
            ),
            Ticket(
                id = "T-1041",
                subject = "Cannot sign in on mobile",
                requester = "lee@contoso.example",
                status = Status.Open,
                priority = Priority.High,
                updated = "18 min ago",
            ),
            Ticket(
                id = "T-1039",
                subject = "Webhook retries stop after the first 5xx",
                requester = "ops@fabrikam.example",
                status = Status.Waiting,
                priority = Priority.Normal,
                updated = "1 h ago",
            ),
            Ticket(
                id = "T-1036",
                subject = "Invoice address is wrong",
                requester = "ap@tailspin.example",
                status = Status.Solved,
                priority = Priority.Low,
                updated = "Yesterday",
            ),
        )
    }
}

/**
 * The queue's four numbers: the summary band above the filters. The store
 * derives them from every ticket, not from the filtered view, so the band
 * keeps its numbers while a filter matches nothing.
 */
data class QueueStats(
    val open: PMStatProps,
    val urgent: PMStatProps,
    val response: PMStatProps,
    val solved: PMStatProps,
) {
    companion object {
        /** The four numbers of `tickets`. */
        fun of(tickets: List<Ticket>): QueueStats {
            fun count(keep: (Ticket) -> Boolean) = tickets.count(keep).toString()
            return QueueStats(
                open = PMStatProps(label = "Open", value = count { it.status == Ticket.Status.Open }),
                urgent = PMStatProps(
                    label = "Urgent",
                    value = count { it.priority == Ticket.Priority.Urgent && it.status != Ticket.Status.Solved },
                ),
                // The service reports no response times, so the example shows one week's.
                response = if (tickets.isEmpty()) {
                    PMStatProps(label = "First response", value = "—")
                } else {
                    PMStatProps(
                        label = "First response",
                        trend = PMStatTrend(direction = PMDeltaDirection.Down, label = "12 min faster"),
                        value = "1h 04m",
                    )
                },
                solved = PMStatProps(label = "Solved", value = count { it.status == Ticket.Status.Solved }),
            )
        }
    }
}
