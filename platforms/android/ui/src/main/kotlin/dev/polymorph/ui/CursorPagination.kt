// CursorPagination (`design/components/cursor-pagination.md`): previous and
// next for a list paged by cursor, which says whether there is more but never
// how much. It is not Pagination: there are no page numbers and no current
// page, because no count exists. The two controls are `ghost`/`neutral`/`sm`
// Buttons with visible labels, the previous one with the `previous` glyph
// before its label and the next one with `next` after it, in a wrapping Inline
// `space.2` apart; the app's `position` sits between them in `text.sm`, muted,
// with tabular figures, so "26–50" becoming "51–75" does not move the arrows.
// A direction without a cursor is disabled. One window (neither direction,
// nothing pending) draws nothing.
//
// While `pending`, the direction the person pressed shows Button's busy state
// and the other is disabled, so a slow fetch cannot be followed by a request
// for another window; the pager remembers which it was, because the app only
// says that a request is in flight, and forgets it when the window arrives.
// The position is a polite live region, read when it changes, as the web's
// `aria-live="polite"`. Every name the pager speaks is in `label` and
// `messages`; without them the spec's English defaults (`PMStrings`) are used.
//
// `disabled` is the app's hold, for while it does something else to the list:
// every control is disabled and none shows busy, and the pager is still drawn.
// While a window is also in flight it adds nothing, because the pressed
// direction is busy, which is not disabled, and the other is disabled already.
//
// The append form (`mode = Append`) is "Load more": one `outline`/`neutral`/
// `sm` Button, `messages.more`, after the position, that asks for the next
// window, which the app adds below the ones shown. It is busy while a window
// is in flight. It remembers that it asked for a window and never reads
// `hasPrevious`, so an app passes its query library's flags as they are. When
// `hasNext` turns false after a press, with nothing in flight, the list has
// run out: the action leaves and the end line, a line of its own under the
// row, says `messages.end` in the position's type, a polite live region as the
// web's status region is. A form that has not asked draws nothing without a
// next window, because the list never paged. Focus is not moved when the
// action leaves, as on the web.
//
// Not given: the web's development warning for `messages` without `more` or
// `end`, whose two words are then the spec's English beside the app's. The
// module's one source set serves the JVM and Android and sees no debug build
// of the app, and a warning in every release build's log would be noise. An
// app that passes `messages` passes all four words.

package dev.polymorph.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics

object PMCursorPagination : PMCursorPaginationRendering {
    /** The direction a person pressed. */
    private enum class Direction { Previous, Next }

    @Composable
    override fun Render(props: PMCursorPaginationProps) {
        Render(props, paged = false)
    }

    /**
     * The pager, which has already asked for a window when [paged], as one the
     * person has pressed: the states fixture's way to draw the list running
     * out, which a composition cannot press for.
     */
    @Composable
    internal fun Render(props: PMCursorPaginationProps, paged: Boolean) {
        val theme = PM.theme
        val pending = props.pending ?: false
        val held = props.disabled ?: false
        val append = props.mode == PMCursorPaginationMode.Append
        var asked by remember { mutableStateOf<Direction?>(null) }
        // The append form has asked for a window, so the list has paged and a
        // missing next window means it ran out. The member's own memory: the
        // app never says how many windows are on screen.
        var hasPaged by remember { mutableStateOf(paged) }
        // The pressed direction is forgotten once the window arrives.
        LaunchedEffect(pending) { if (!pending) asked = null }
        // One window draws nothing; the append form stays once it has asked, to
        // say the list ran out.
        val drawn = if (append) props.hasNext || pending || hasPaged else props.hasPrevious || props.hasNext || pending
        if (!drawn) return

        val strings = PMSpecDefault.strings
        val messages = props.messages ?: strings.cursorPaginationMessages
        val label = props.label ?: strings.pagination
        val defaults = strings.cursorPaginationMessages
        // The append form's two words: the app's where it gives them, the
        // spec's defaults otherwise, which fill every field.
        val more = messages.more ?: defaults.more ?: defaults.next
        val end = messages.end ?: defaults.end ?: defaults.next
        // The append form's list has run out: it asked for a window, and there
        // is no next one and none in flight.
        val ended = hasPaged && !props.hasNext && !pending

        Box(
            Modifier
                .pmMember(
                    "CursorPagination",
                    // `pending` while a window is in flight and `disabled` while the app holds
                    // the pager, as the web's `data-pending` and `data-disabled`.
                    buildMap {
                        if (pending) put("pending", "true")
                        if (held) put("disabled", "true")
                    },
                )
                .semantics {
                    contentDescription = label
                    isTraversalGroup = true
                },
        ) {
            Column {
                PMInline(align = PMInlineAlign.Center, gap = PMSpaceStep.S2, wrap = true) {
                    if (append) {
                        props.position?.let { position ->
                            Text(
                                text = position,
                                style = theme.text.sm.textStyle.tabular(theme),
                                color = theme.colors.textMuted.color,
                                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                            )
                        }
                        if (!ended) {
                            PMButton(
                                // A busy action is not disabled, so it keeps its focus through a hold.
                                disabled = held && !pending,
                                label = more,
                                loading = pending,
                                onClick = {
                                    asked = Direction.Next
                                    hasPaged = true
                                    props.onNext()
                                },
                                size = PMControlSize.Sm,
                                appearance = PMButtonAppearance.OutlineNeutral,
                            )
                        }
                    } else {
                        PMButton(
                            disabled = !props.hasPrevious || (if (pending) asked != Direction.Previous else held),
                            icon = PMIconRole.Previous,
                            label = messages.previous,
                            loading = pending && asked == Direction.Previous,
                            onClick = {
                                asked = Direction.Previous
                                props.onPrevious?.invoke()
                            },
                            size = PMControlSize.Sm,
                            appearance = PMButtonAppearance.GhostNeutral,
                        )
                        props.position?.let { position ->
                            Text(
                                text = position,
                                style = theme.text.sm.textStyle.tabular(theme),
                                color = theme.colors.textMuted.color,
                                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                            )
                        }
                        PMButton(
                            disabled = !props.hasNext || (if (pending) asked != Direction.Next else held),
                            label = messages.next,
                            loading = pending && asked == Direction.Next,
                            onClick = {
                                asked = Direction.Next
                                props.onNext()
                            },
                            size = PMControlSize.Sm,
                            appearance = PMButtonAppearance.GhostNeutral,
                            trailingIcon = PMIconRole.Next,
                        )
                    }
                }
                // Under the row: beside the position, two muted texts read as one phrase.
                if (append && ended) {
                    Text(
                        text = end,
                        style = theme.text.sm.textStyle,
                        color = theme.colors.textMuted.color,
                        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                    )
                }
            }
        }
    }
}

/**
 * CursorPagination's states, from the spec's States table. One window draws
 * nothing, in either form, so it has no entry: the harness holds every entry
 * to drawing. The pending entry has no pressed direction, so both arrows are
 * disabled.
 */
object CursorPaginationStates : PMStates {
    override val member = "CursorPagination"

    private const val window = "26–50"
    private const val french = "Pagination des événements"
    private const val shown = "50 shown"
    private const val all = "120 shown"

    /**
     * The append form, which never reads `hasPrevious`, so every entry passes
     * `false`, as a forward feed's query library does.
     */
    @Composable
    private fun More(
        next: Boolean,
        position: String? = null,
        pending: Boolean? = null,
        disabled: Boolean? = null,
        paged: Boolean = false,
    ) {
        PMCursorPagination.Render(
            PMCursorPaginationProps(
                disabled = disabled,
                hasNext = next,
                hasPrevious = false,
                mode = PMCursorPaginationMode.Append,
                onNext = {},
                pending = pending,
                position = position,
            ),
            paged = paged,
        )
    }

    @Composable
    private fun Pager(
        previous: Boolean,
        next: Boolean,
        position: String? = null,
        pending: Boolean? = null,
        disabled: Boolean? = null,
    ) {
        PMCursorPagination(
            disabled = disabled,
            hasNext = next,
            hasPrevious = previous,
            onNext = {},
            onPrevious = {},
            pending = pending,
            position = position,
        )
    }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("the first window — nothing behind it", expect = mapOf("label" to "Pagination", "contains" to "Button")) {
                Pager(previous = false, next = true)
            },
            PMStateEntry("a middle window") { Pager(previous = true, next = true) },
            PMStateEntry("the last window — nothing ahead of it") { Pager(previous = true, next = false) },
            PMStateEntry("with a position, in the app’s words") { Pager(previous = true, next = true, position = window) },
            PMStateEntry("pending — a window is in flight", expect = mapOf("pending" to "true")) {
                Pager(previous = true, next = true, position = window, pending = true)
            },
            PMStateEntry("held by the app — neither direction can be pressed", expect = mapOf("disabled" to "true")) {
                Pager(previous = true, next = true, position = window, disabled = true)
            },
            PMStateEntry("localized", expect = mapOf("label" to french)) {
                PMCursorPagination(
                    hasNext = true,
                    hasPrevious = true,
                    label = french,
                    messages = PMCursorPaginationMessages(previous = "Précédent", next = "Suivant"),
                    onNext = {},
                    onPrevious = {},
                )
            },
            PMStateEntry("append — more to load", expect = mapOf("contains" to "Button")) {
                More(next = true)
            },
            PMStateEntry("append — with a position") { More(next = true, position = shown) },
            PMStateEntry("append — a window is in flight", expect = mapOf("pending" to "true")) {
                More(next = true, position = shown, pending = true)
            },
            PMStateEntry("append — held by the app", expect = mapOf("disabled" to "true")) {
                More(next = true, position = shown, disabled = true)
            },
            // Pressed once already, and the window that answered has no next one.
            PMStateEntry("append — the list ran out") { More(next = false, position = all, paged = true) },
        )
}
