// Tour (`design/components/tour.md`), adapted on Android: a modal bottom sheet
// per step that points at no part of the screen. `Tour.Target` has no
// contract on Android (the registry publishes no part for it), so no node of a
// native screen carries a target's name, and every step is drawn as the spec
// draws a step whose target is not on the page: the same words and the same
// position, with nothing cut out and no side to open on. A step's `target`
// and `side` are therefore not drawn (`packages/native/src/undrawn.ts`).
//
// The tour has no trigger: the app opens it with `open` or `defaultOpen`, and
// the member draws nothing in the screen. Open, it presents the step's panel
// in the bottom sheet (`PMBottomSheet`), Material's, on the pairing's sheet
// surface, as tall as its content: the title (`text.md`, `text.primary`, a
// heading, clear of the close button by `space.8`), the body `space.2` under
// it (`text.sm`, `text.secondary`), and the last row `space.5` under the body,
// the position at its start (`text.xs`, `text.secondary`, the theme's figures)
// and the actions at its end, `space.2` apart: Previous
// (`outline/neutral/sm`, absent on the first step), then Next or, on the last
// step, Done (`solid/accent/sm`), the one primary. A row too narrow for both
// puts the actions under the position. The close button is Button's
// `ghost/neutral/sm` icon-only `close` at the top end, named by
// `messages.close`. The panel is inset by the pane inset below the sheet's
// handle.
//
// Previous and Next report the new index through `onStepChange`; with no
// `step`, the tour keeps its own, from `defaultStep`, clamped to the steps,
// and keeps it when it closes, so a tour opened again resumes. Done ends the
// tour with `finished`; the close button, the drag, the scrim and the back
// gesture end it with `dismissed`, as Escape does on the web. Ending closes
// the sheet unless the app holds `open`, and reports through `onEnd`; the
// member stores nothing.
//
// The sheet is a pane titled by the step's title, so TalkBack announces each
// step as it opens and again when the step changes, and keyboard focus starts
// on Next, or Done, the step's primary action. With no steps, nothing is
// drawn.

package dev.polymorph.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

object PMTour : PMTourRendering {
    @Composable
    override fun Render(props: PMTourProps) {
        var ownOpen by remember { mutableStateOf(props.defaultOpen ?: false) }
        var ownStep by remember { mutableDoubleStateOf(props.defaultStep ?: 0.0) }
        val count = props.steps.size
        val open = (props.open ?: ownOpen) && count > 0
        val index = clamped(props.step ?: ownStep, count)
        val step = props.steps.getOrNull(index)
        val attributes = buildMap {
            put("state", if (open) "open" else "closed")
            step?.let { put("step", it.id) }
        }
        val end: (PMTourEnd) -> Unit = { reason ->
            ownOpen = false
            props.onEnd?.invoke(reason)
        }
        val go: (Int) -> Unit = { next ->
            ownStep = next.toDouble()
            props.onStepChange?.invoke(next.toDouble())
        }

        // The tour draws nothing in the screen, only its sheet; this empty node
        // carries its identity where the app placed it.
        Box(Modifier.pmMember("Tour", attributes))
        if (open && step != null) {
            PMBottomSheet(onDismiss = { end(PMTourEnd.Dismissed) }) {
                // Keyed by the step, so each step's panel starts afresh and
                // takes keyboard focus to its primary action.
                key(step.id) {
                    Panel(
                        step = step,
                        index = index,
                        count = count,
                        messages = props.messages ?: PMSpecDefault.strings.tourMessages,
                        attributes = pmInSheet(attributes),
                        previous = { go(index - 1) },
                        next = { if (index == count - 1) end(PMTourEnd.Finished) else go(index + 1) },
                        close = { end(PMTourEnd.Dismissed) },
                    )
                }
            }
        }
    }

    /** The step's index, clamped to the steps; 0 with none. */
    internal fun clamped(step: Double, count: Int): Int {
        if (count == 0 || !step.isFinite()) return 0
        return step.toInt().coerceIn(0, count - 1)
    }

    /** A step's panel: the title, the body, the position and the actions, with the close button at the top end. */
    @Composable
    private fun Panel(
        step: PMTourStep,
        index: Int,
        count: Int,
        messages: PMTourMessages,
        attributes: Map<String, String>,
        previous: () -> Unit,
        next: () -> Unit,
        close: () -> Unit,
    ) {
        val theme = PM.theme
        val density = theme.defaultDensity
        val space = density.spacing
        val colors = theme.colors
        val inset = density.inset.pane.dp
        val primary = remember { FocusRequester() }
        val last = index == count - 1
        // Each step starts keyboard focus on its primary action.
        LaunchedEffect(index) { primary.requestFocus() }

        Box(
            Modifier
                .pmMember("Tour", attributes)
                .semantics { paneTitle = step.title }
                .fillMaxWidth()
                .padding(start = inset, end = inset, bottom = inset)
                .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Bottom)),
        ) {
            Column(Modifier.fillMaxWidth()) {
                Text(
                    text = step.title,
                    style = theme.text.md.textStyle,
                    color = colors.textPrimary.color,
                    modifier = Modifier.padding(end = space.s8).semantics { heading() },
                )
                Text(
                    text = step.body,
                    style = theme.text.sm.textStyle,
                    color = colors.textSecondary.color,
                    modifier = Modifier.padding(top = space.s2),
                )
                FlowRow(
                    Modifier.fillMaxWidth().padding(top = space.s5),
                    horizontalArrangement = Arrangement.spacedBy(space.s3, Alignment.End),
                    verticalArrangement = Arrangement.spacedBy(space.s3),
                    itemVerticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = messages.position(index + 1.0, count.toDouble()),
                        style = theme.text.xs.textStyle.tabular(theme),
                        color = colors.textSecondary.color,
                        modifier = Modifier.weight(1f),
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(space.s2), verticalAlignment = Alignment.CenterVertically) {
                        if (index > 0) {
                            PMButton(
                                label = messages.previous,
                                onClick = previous,
                                size = PMControlSize.Sm,
                                appearance = PMButtonAppearance.OutlineNeutral,
                            )
                        }
                        Box(Modifier.focusRequester(primary)) {
                            PMButton(
                                label = if (last) messages.done else messages.next,
                                onClick = next,
                                size = PMControlSize.Sm,
                                appearance = PMButtonAppearance.SolidAccent,
                            )
                        }
                    }
                }
            }
            Box(Modifier.align(Alignment.TopEnd)) {
                PMButton(
                    icon = PMIconRole.Close,
                    iconOnly = true,
                    label = messages.close,
                    onClick = close,
                    size = PMControlSize.Sm,
                    appearance = PMButtonAppearance.GhostNeutral,
                )
            }
        }
    }
}

/**
 * Tour's states, from the spec's States table: the first, a middle and the
 * last step, a step with no target and a step whose target is not on the
 * page, each opened by `defaultOpen` in its sheet's own window over the
 * canvas. A step's side has no form here, so the web's entries above and
 * beside a target have none.
 */
object TourStates : PMStates {
    override val member = "Tour"

    private val steps = listOf(
        PMTourStep("create", "create", "Create a ticket", "Start here to log a new request."),
        PMTourStep("filter", "filter", "Narrow the list", "Filter tickets by status, owner or tag."),
        PMTourStep("export", "export", "Take the list with you", "Export the tickets you see as a file."),
    )
    private val welcome = PMTourStep("welcome", title = "Welcome to the queue", body = "Three things to know before you start.")
    private val missing = PMTourStep("assign", "assign", "Assign it", "Give the ticket an owner from its own page.")

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("first step — no Previous", expect = mapOf("state" to "open", "step" to "create", "presentation" to "sheet")) {
                PMFixturePhone { PMTour(defaultOpen = true, steps = steps) }
            },
            PMStateEntry("middle step — Previous and Next", expect = mapOf("step" to "filter")) {
                PMFixturePhone { PMTour(defaultOpen = true, defaultStep = 1.0, steps = steps) }
            },
            PMStateEntry("last step — Done ends the tour", expect = mapOf("step" to "export")) {
                PMFixturePhone { PMTour(defaultOpen = true, defaultStep = 2.0, steps = steps) }
            },
            PMStateEntry("a step with no target", expect = mapOf("step" to "welcome")) {
                PMFixturePhone { PMTour(defaultOpen = true, steps = listOf(welcome) + steps) }
            },
            PMStateEntry("a step whose target is not on the page — the same panel", expect = mapOf("step" to "assign")) {
                PMFixturePhone { PMTour(defaultOpen = true, steps = listOf(missing)) }
            },
        )
}
