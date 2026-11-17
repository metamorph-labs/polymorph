// Popover (`design/components/popover.md`), adapted on Android: a panel of
// rich content opened from a trigger, as a modal bottom sheet on a phone's
// window and anchored to the trigger on a wider one, the platform map's form.
// The trigger stays where the screen puts it and opens the panel through
// `LocalPMTriggerAction`, as Dialog's does. The panel is the children
// `space-5` inside: anchored, on the overlay surface, at most four `space-10`
// steps wide and no taller than the window less `space-8` above and below,
// `PMGeometry.popoverOffset` from the trigger, entering with the `scale-fade`
// binding; in the sheet (`PMBottomSheet`), as wide as the sheet and as tall as
// its content up to the sheet's cap, its foot clear of the system bars. In
// both, the children scroll when they do not fit, in the panel's one scroll
// region (`PMOverlayBody`), which a ScrollArea or a ChatThread inside shares.
//
// `side` is the side of the trigger the panel opens on, flipped to the other
// side when there is no room, and `align` lines it up with the trigger's
// start, centre or end along that side; left and right are the screen's, as
// the web's are. A phone's popover is the sheet in both presentations, the
// platform map's form, so `presentation: sheet` changes nothing here, as on
// iOS; on a wider window both are anchored. `label` names the panel, as its
// pane title. `open` with `onOpenChange` is the controlled pair;
// `defaultOpen` opens it on its own. The back gesture, Escape and a press
// outside close it.

package dev.polymorph.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp

object PMPopover : PMPopoverRendering {
    @Composable
    override fun Render(props: PMPopoverProps) {
        var own by remember { mutableStateOf(props.defaultOpen ?: false) }
        val open = props.open ?: own
        val side = props.side ?: PMPopoverSide.Bottom
        val align = props.align ?: PMPopoverAlign.Start
        val setOpen: (Boolean) -> Unit = { next ->
            own = next
            props.onOpenChange?.invoke(next)
        }
        val attributes = mapOf("state" to if (open) "open" else "closed", "side" to side.value, "align" to align.value)
        val sheet = pmCompactWindow()
        val rtl = LocalLayoutDirection.current == LayoutDirection.Rtl
        val window = with(LocalDensity.current) { LocalWindowInfo.current.containerSize.height.toDp() }

        Box(Modifier.pmMember("Popover", attributes)) {
            PMOverlayTrigger(props.trigger) { setOpen(true) }
            if (sheet) {
                if (open) {
                    PMBottomSheet(
                        onDismiss = { setOpen(false) },
                        modifier = Modifier.pmMember("Popover", pmInSheet(attributes)),
                    ) { Panel(props, sheet = true, window = window) }
                }
            } else {
                PMAnchoredPanel(
                    open = open,
                    onDismiss = { setOpen(false) },
                    side = when (side) {
                        PMPopoverSide.Bottom -> PMAnchorSide.Bottom
                        PMPopoverSide.Top -> PMAnchorSide.Top
                        // Left and right are the screen's: the end side is the right in a left-to-right layout.
                        PMPopoverSide.Right -> if (rtl) PMAnchorSide.Start else PMAnchorSide.End
                        PMPopoverSide.Left -> if (rtl) PMAnchorSide.End else PMAnchorSide.Start
                    },
                    align = when (align) {
                        PMPopoverAlign.Start -> PMAnchorAlign.Start
                        PMPopoverAlign.Center -> PMAnchorAlign.Center
                        PMPopoverAlign.End -> PMAnchorAlign.End
                    },
                    offset = PMGeometry.popoverOffset,
                ) {
                    Box(Modifier.pmMember("Popover", attributes)) { Panel(props, sheet = false, window = window) }
                }
            }
        }
    }

    /**
     * The children `space-5` inside, named by `label`, scrolling in the
     * panel's body under the sheet's cap, or, anchored, on the overlay surface
     * under a cap of `window`'s height less `space-8` above and below.
     */
    @Composable
    private fun Panel(props: PMPopoverProps, sheet: Boolean, window: Dp) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val frame = if (sheet) {
            Modifier.fillMaxWidth()
        } else {
            // The anchored panel's widest: the recipe's multiple of `space-10`.
            Modifier
                .widthIn(max = space.s10 * PMRecipe.popoverWidth)
                .heightIn(max = window - PMGeometry.bothEdges(space.s8))
                .pmOverlaySurface(theme.colors.bgOverlay, theme.colors.borderSubtle)
        }
        val inside = if (sheet) {
            Modifier.padding(space.s5).windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Bottom))
        } else {
            Modifier.padding(space.s5)
        }
        PMOverlayBody(Modifier.semantics { paneTitle = props.label }.then(frame)) {
            Box(inside) { props.children() }
        }
    }
}

/**
 * Popover's states, from the spec's States table: the closed trigger, the
 * open panel as a bottom sheet on a phone, and anchored on each side of its
 * trigger, as on a wider window, each opened by `defaultOpen` in its own
 * window over the canvas.
 */
object PopoverStates : PMStates {
    override val member = "Popover"

    @Composable
    private fun Trigger() {
        PMButton(icon = PMIconRole.Filter, label = "Filters", appearance = PMButtonAppearance.OutlineNeutral)
    }

    /** A small form: a field and its action. */
    @Composable
    private fun Form() {
        PMStack(gap = PMSpaceStep.S4) {
            PMFormField(label = "Requester") { PMInput(placeholder = "Any requester") }
            PMButton(label = "Apply")
        }
    }

    /** The popover anchored on `side`, as on a wider window, with room for its panel there. */
    @Composable
    private fun Anchored(side: PMPopoverSide) {
        val room = PM.theme.defaultDensity.hitTarget.dp * FORM_ROWS
        CompositionLocalProvider(LocalPMCompactWindow provides false) {
            Column(verticalArrangement = Arrangement.Top) {
                if (side == PMPopoverSide.Top) Spacer(Modifier.height(room))
                PMPopover(defaultOpen = true, label = "Filters", side = side, trigger = { Trigger() }) {
                    // Beside its trigger, the form is narrower, so both fit the phone-wide canvas.
                    val beside = side == PMPopoverSide.Right || side == PMPopoverSide.Left
                    Box(if (beside) Modifier.widthIn(max = PM.theme.defaultDensity.spacing.s10 * 2) else Modifier) { Form() }
                }
                if (side != PMPopoverSide.Top) Spacer(Modifier.height(room))
            }
        }
    }

    /** The rows of the form's height, in hit targets: a label, a field and a button with their gaps. */
    private const val FORM_ROWS = 4

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("closed", expect = mapOf("state" to "closed", "side" to "bottom", "contains" to "Button")) {
                PMPopover(label = "Filters", trigger = { Trigger() }) { Form() }
            },
            PMStateEntry("open on a phone — a bottom sheet", expect = mapOf("state" to "open", "side" to "bottom", "presentation" to "sheet")) {
                PMFixturePhone {
                    PMPopover(defaultOpen = true, label = "Filters", trigger = { Trigger() }) { Form() }
                }
            },
            PMStateEntry("open — a field and a button, anchored below", expect = mapOf("state" to "open", "side" to "bottom")) {
                Anchored(PMPopoverSide.Bottom)
            },
            PMStateEntry("side top", expect = mapOf("state" to "open", "side" to "top")) { Anchored(PMPopoverSide.Top) },
            PMStateEntry("side right", expect = mapOf("state" to "open", "side" to "right")) { Anchored(PMPopoverSide.Right) },
        )
}
