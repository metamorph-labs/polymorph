// ContextMenu (`design/components/context-menu.md`), adapted on Android: a
// long-press menu on a surface, Menu's command list as a bottom sheet on a
// phone's window and a dropdown at the press point on a wider one, the
// platform map's form. The surface is the child, drawn as it is, and keeps its
// own taps: the long press is recognised before the child sees the gesture,
// with the platform's timeout and touch slop, and once it opens the menu the
// rest of the gesture is the menu's, so the child does not also take it as a
// tap. A press that moves past the slop, or that a list's scroll takes, opens
// nothing, so a list of these surfaces scrolls as any list does. A
// secondary button's press (a mouse's right button on a tablet or a
// Chromebook) opens it at once. The panel is Menu's, row for row
// (`PMMenuPanel`): the same entries, the same recipe, a submenu flattened, a
// command closing it and a checkbox entry leaving it open. At the press point
// the panel has no offset, because a pointer has no border to keep apart.
//
// A context menu is never the only path to a command: the screen pairs it
// with a visible Menu given the same entries, as Relay's ticket rows pair the
// row with its overflow button, so a person who never long-presses, and
// TalkBack, which reaches the visible Menu, has every command.
//
// There is no `open`: the menu opens from the gesture, and `onOpenChange`
// reports it opening and closing. `presentation: popover` keeps the dropdown
// on a phone too.

package dev.polymorph.ui

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.AwaitPointerEventScope
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.PointerInputChange
import androidx.compose.ui.input.pointer.isSecondaryPressed
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp

object PMContextMenu : PMContextMenuRendering {
    @Composable
    override fun Render(props: PMContextMenuProps) {
        var open by remember { mutableStateOf(false) }
        var at by remember { mutableStateOf(IntOffset.Zero) }
        val setOpen: (Boolean) -> Unit = { next ->
            if (next != open) {
                open = next
                props.onOpenChange?.invoke(next)
            }
        }
        val attributes = mapOf("state" to if (open) "open" else "closed")
        // The gesture outlives a composition, so it reads the newest setter,
        // with the props and the open state it closes over.
        val openMenu by rememberUpdatedState(setOpen)

        Box(
            Modifier
                .pmMember("ContextMenu", attributes)
                .pointerInput(Unit) {
                    awaitEachGesture {
                        // The initial pass, before the child: the child keeps
                        // its taps, and a long press is seen whatever it does.
                        val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
                        val point = IntOffset(down.position.x.toInt(), down.position.y.toInt())
                        val secondary = currentEvent.buttons.isSecondaryPressed
                        if (secondary || held(down)) {
                            at = point
                            openMenu(true)
                            // The rest of the gesture opened the menu, so the child never takes it as a tap.
                            down.consume()
                            do {
                                val event = awaitPointerEvent(PointerEventPass.Initial)
                                event.changes.forEach { it.consume() }
                            } while (event.changes.any { it.pressed })
                        }
                    }
                },
        ) {
            props.children()
            PMMenuPresentation(
                open = open,
                entries = props.entries,
                anchored = props.presentation == PMContextMenuPresentation.Popover,
                member = "ContextMenu",
                attributes = attributes,
                close = { setOpen(false) },
                at = at,
                offset = 0.dp,
            )
        }
    }
}

/**
 * Whether the press that went `down` is a long press: still down when the
 * platform's long-press timeout ends, never moved past the touch slop, and
 * never taken by another gesture, such as a list's scroll, which consumes the
 * move in a later pass. A press lifted before then is a tap, the child's; one
 * that moved or was taken is a scroll or a drag, and opens nothing.
 */
private suspend fun AwaitPointerEventScope.held(down: PointerInputChange): Boolean {
    val slop = viewConfiguration.touchSlop
    var ended = false
    withTimeoutOrNull(viewConfiguration.longPressTimeoutMillis) {
        while (!ended) {
            val change = awaitPointerEvent(PointerEventPass.Initial).changes.firstOrNull { it.id == down.id }
            ended = change == null || !change.pressed || change.isConsumed ||
                (change.position - down.position).getDistance() > slop
            if (!ended) {
                ended = awaitPointerEvent(PointerEventPass.Final).changes.any { it.id == down.id && it.isConsumed }
            }
        }
    }
    return !ended
}

/**
 * ContextMenu's states, from the spec's States table: a surface given the
 * whole entry mix, and the pairing, a ticket row whose overflow Menu, given
 * the same entries, is drawn open. No prop opens the context menu itself: the
 * menu opens at a press.
 */
object ContextMenuStates : PMStates {
    override val member = "ContextMenu"

    private const val duplicate = "Refund for a duplicate charge"
    private const val signIn = "Cannot sign in on mobile"

    private val mix: List<PMMenuEntry> = listOf(
        PMMenuEntry.Label(PMMenuLabelEntry(label = "Ticket")),
        PMMenuEntry.Item(PMMenuItemEntry(label = "Assign to me", icon = PMIconRole.User, onSelect = {})),
        PMMenuEntry.Item(PMMenuItemEntry(label = "Snooze", icon = PMIconRole.Time, kbd = "S", onSelect = {})),
        PMMenuEntry.Item(PMMenuItemEntry(label = "Merge", disabled = true, onSelect = {})),
        PMMenuEntry.Checkbox(PMMenuCheckboxEntry(label = "Watching", checked = true, onCheckedChange = {})),
        PMMenuEntry.Separator,
        PMMenuEntry.Item(PMMenuItemEntry(label = "Archive", icon = PMIconRole.Archive, tone = PMMenuItemEntryTone.Danger, onSelect = {})),
    )

    private val pairing: List<PMMenuEntry> = listOf(
        PMMenuEntry.Item(PMMenuItemEntry(label = "Assign to me", onSelect = {})),
        PMMenuEntry.Item(PMMenuItemEntry(label = "Snooze", onSelect = {})),
        PMMenuEntry.Separator,
        PMMenuEntry.Item(PMMenuItemEntry(label = "Archive", onSelect = {})),
    )

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("closed — the surface alone", expect = mapOf("state" to "closed", "contains" to "Card")) {
                PMContextMenu(entries = mix) {
                    PMCard { PMText { Text(duplicate) } }
                }
            },
            PMStateEntry(
                "the pairing — the row and its open overflow Menu",
                expect = mapOf("state" to "closed", "contains" to "Menu"),
            ) {
                PMFixtureRoom(PMMenuRow.of(pairing).size + 1) {
                    PMContextMenu(entries = pairing) { TicketRow(pairing) }
                }
            },
        )

    /** A ticket row with its trailing overflow Menu, drawn open, both given one list of entries. */
    @Composable
    private fun TicketRow(entries: List<PMMenuEntry>) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        Column {
            Row(
                modifier = Modifier.fillMaxWidth().padding(space.s3),
                horizontalArrangement = Arrangement.spacedBy(space.s3),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.weight(1f)) { PMText { Text(signIn) } }
                PMMenu(
                    align = PMMenuAlign.End,
                    defaultOpen = true,
                    items = entries,
                    presentation = PMMenuPresentation.Popover,
                    trigger = {
                        PMButton(icon = PMIconRole.Overflow, iconOnly = true, label = "Ticket actions", appearance = PMButtonAppearance.GhostNeutral)
                    },
                )
            }
            PMRule(theme.colors.borderSubtle)
        }
    }
}
