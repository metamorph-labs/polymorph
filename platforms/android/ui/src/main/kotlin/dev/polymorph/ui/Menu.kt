// Menu (`design/components/menu.md`), adapted on Android: a list of commands
// behind a trigger, as a bottom sheet of actions on a phone's window and a
// dropdown anchored to the trigger on a wider one, the platform map's form.
// The trigger stays where the screen puts it, usually Button's icon-only
// `overflow`; the menu puts its opening action in `LocalPMTriggerAction`, and
// the Button runs it after its own action, as the web clones the trigger.
//
// The panel is Menu's rows (`PMMenuPanel`), drawn from the recipe in both
// forms: a command with its icon, its label and its shortcut hint (a Kbd), a
// danger command kept quiet in `danger.text`, a disabled one dimmed, a
// checkbox entry with Select's check column, a separator, a group label, and
// a submenu flattened into its label and its items, because neither a sheet
// nor a touch dropdown cascades. A command closes the menu; a checkbox entry
// leaves it open. The sheet is Material's modal bottom sheet on the pairing's
// sheet surface (`PMBottomSheet`); the dropdown is a popup on the overlay
// surface, below the trigger at its leading or trailing edge by `align`,
// flipped above it when there is no room, entering with the `scale-fade`
// binding. The back gesture, Escape and a press outside close either.
//
// `presentation: auto` is the sheet below 30rem of window, the overlay
// class's one line; `popover` keeps the dropdown there too. `open` with
// `onOpenChange` is the controlled pair; `defaultOpen` opens it on its own.
// The open panel carries the member's identity too, with `presentation=sheet`
// while it is a sheet.

package dev.polymorph.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier

object PMMenu : PMMenuRendering {
    @Composable
    override fun Render(props: PMMenuProps) {
        var own by remember { mutableStateOf(props.defaultOpen ?: false) }
        val open = props.open ?: own
        val align = props.align ?: PMMenuAlign.Start
        val setOpen: (Boolean) -> Unit = { next ->
            own = next
            props.onOpenChange?.invoke(next)
        }
        val attributes = mapOf("state" to if (open) "open" else "closed", "align" to align.value)

        Box(Modifier.pmMember("Menu", attributes)) {
            PMOverlayTrigger(props.trigger) { setOpen(true) }
            PMMenuPresentation(
                open = open,
                entries = props.items,
                anchored = props.presentation == PMMenuPresentation.Popover,
                member = "Menu",
                attributes = attributes,
                close = { setOpen(false) },
                align = if (align == PMMenuAlign.End) PMAnchorAlign.End else PMAnchorAlign.Start,
            )
        }
    }
}

/**
 * Menu's states, from the spec's States table: the closed trigger, the open
 * menu as a bottom sheet on a phone, and as the dropdown it is on a wider
 * window or with `presentation: popover`, each opened by `defaultOpen` in its
 * own window over the canvas.
 */
object MenuStates : PMStates {
    override val member = "Menu"

    /** Commands: a label, icons, a shortcut hint, a disabled command, a separator and a danger command. */
    val commands: List<PMMenuEntry> = listOf(
        PMMenuEntry.Label(PMMenuLabelEntry(label = "Ticket")),
        PMMenuEntry.Item(PMMenuItemEntry(label = "Assign to me", icon = PMIconRole.User, onSelect = {})),
        PMMenuEntry.Item(PMMenuItemEntry(label = "Snooze", icon = PMIconRole.Time, kbd = "S", onSelect = {})),
        PMMenuEntry.Item(PMMenuItemEntry(label = "Merge", icon = PMIconRole.Connect, disabled = true, onSelect = {})),
        PMMenuEntry.Separator,
        PMMenuEntry.Item(PMMenuItemEntry(label = "Archive", icon = PMIconRole.Archive, tone = PMMenuItemEntryTone.Danger, onSelect = {})),
    )

    /** Checkbox entries under a label, checked and unchecked. */
    private val filters: List<PMMenuEntry> = listOf(
        PMMenuEntry.Label(PMMenuLabelEntry(label = "Show")),
        PMMenuEntry.Checkbox(PMMenuCheckboxEntry(label = "Open", checked = true, onCheckedChange = {})),
        PMMenuEntry.Checkbox(PMMenuCheckboxEntry(label = "Waiting", checked = false, onCheckedChange = {})),
        PMMenuEntry.Checkbox(PMMenuCheckboxEntry(label = "Closed", checked = true, onCheckedChange = {})),
    )

    /** A submenu, flattened, and a disabled one, its label alone. */
    private val nested: List<PMMenuEntry> = listOf(
        PMMenuEntry.Item(PMMenuItemEntry(label = "Reply", icon = PMIconRole.Comment, onSelect = {})),
        PMMenuEntry.Submenu(
            PMMenuSubmenuEntry(
                label = "Move to",
                items = listOf(
                    PMMenuLeafEntry.Item(PMMenuItemEntry(label = "Billing", onSelect = {})),
                    PMMenuLeafEntry.Item(PMMenuItemEntry(label = "Onboarding", onSelect = {})),
                ),
            ),
        ),
        PMMenuEntry.Submenu(
            PMMenuSubmenuEntry(
                label = "Escalate",
                disabled = true,
                items = listOf(PMMenuLeafEntry.Item(PMMenuItemEntry(label = "Tier two", onSelect = {}))),
            ),
        ),
    )

    @Composable
    private fun Trigger() {
        PMButton(icon = PMIconRole.Overflow, iconOnly = true, label = "Ticket actions", appearance = PMButtonAppearance.GhostNeutral)
    }

    /** The menu opened as a dropdown, with room under it for its rows. */
    @Composable
    private fun Dropdown(entries: List<PMMenuEntry>, align: PMMenuAlign = PMMenuAlign.Start, presentation: PMMenuPresentation? = PMMenuPresentation.Popover) {
        PMFixtureRoom(PMMenuRow.of(entries).size + 1) {
            Box(Modifier.fillMaxWidth(), contentAlignment = if (align == PMMenuAlign.End) Alignment.TopEnd else Alignment.TopStart) {
                PMMenu(align = align, defaultOpen = true, items = entries, presentation = presentation, trigger = { Trigger() })
            }
        }
    }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("closed", expect = mapOf("state" to "closed", "align" to "start", "contains" to "Button")) {
                PMMenu(items = commands, trigger = { Trigger() })
            },
            PMStateEntry(
                "open on a phone — a bottom sheet of icons, a hint, danger, disabled, separator and label",
                expect = mapOf("state" to "open", "align" to "start", "presentation" to "sheet"),
            ) {
                PMFixturePhone { PMMenu(defaultOpen = true, items = commands, trigger = { Trigger() }) }
            },
            PMStateEntry("open, presentation popover — the dropdown on a phone", expect = mapOf("state" to "open")) {
                Dropdown(commands)
            },
            PMStateEntry("open on a wider window — the dropdown", expect = mapOf("state" to "open")) {
                CompositionLocalProvider(LocalPMCompactWindow provides false) { Dropdown(commands, presentation = null) }
            },
            PMStateEntry("align end — the dropdown at the trigger's trailing edge", expect = mapOf("state" to "open", "align" to "end")) {
                Dropdown(commands, align = PMMenuAlign.End)
            },
            PMStateEntry("checkbox entries, checked and unchecked", expect = mapOf("state" to "open")) {
                PMFixturePhone { PMMenu(defaultOpen = true, items = filters, trigger = { Trigger() }) }
            },
            PMStateEntry("a submenu, flattened; a disabled one, its label", expect = mapOf("state" to "open")) {
                Dropdown(nested)
            },
        )
}
