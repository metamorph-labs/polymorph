// Alert (`design/components/alert.md`): an inline status callout in page
// content. One panel on its tone's wash with its tone's border; the tone glyph
// beside the first line; a title and a body that differ by colour, never by an
// added weight; at most two actions, `action` then `secondaryAction`, in a row
// that wraps; and a dismiss button when `onDismiss` is set. No variants and no
// sizes: a solid Alert would compete with Toast. The actions come before the
// dismiss button in reading and focus order.
//
// With no title (`null` or empty) and no `children` it draws nothing, so a
// screen can draw it always and bind its title to a message that is empty
// while there is none. An action or `onDismiss` is not content. A title with
// no `children` draws the title alone, with no gap under it.
//
// Dismissing it is `collapse` in exit mode: the content fades over the first
// half of the surface's exit duration, then the row closes over the second,
// and `onDismiss` is called once it has closed so the app can remove it. Focus
// does not move: nothing was modal.
//
// An Alert is usually on the screen from the start, so it is not a live region
// of its own: announcing on appear would announce one that was always there. A
// page's failed state, which arrives after the page did, announces its Alert
// (`PMPageFailure`). The tone is the root's `tone` attribute and the glyph's
// meaning is in the title and the body.
//
// `icon` is the opaque `PMUnsupportedAlertIcon`: the web's type is the single
// literal `false`, which the contract cannot write as `Boolean` without
// widening it. Its one value is that literal, so a present `icon` suppresses
// the tone glyph, as `icon={false}` does on the web.

package dev.polymorph.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.polymorph.tokens.PMColors
import dev.polymorph.tokens.PMDynamicColor

object PMAlert : PMAlertRendering {
    @Composable
    override fun Render(props: PMAlertProps) {
        val title = props.title?.takeIf { it.isNotEmpty() }
        val children = props.children
        if (title == null && children == null) return
        val theme = PM.theme
        val tone = props.tone ?: PMAlertTone.Info
        val recipe = AlertRecipe(tone, theme.colors)
        val space = theme.defaultDensity.spacing
        val shape = theme.rounded(theme.radius.lg)
        val motion = theme.defaultMotion
        val half = motion.duration.surfaceExit / 2
        val shown = remember { MutableTransitionState(true) }
        // Called once the row has closed, so the app removes an Alert that is gone.
        LaunchedEffect(shown.isIdle, shown.currentState) {
            if (shown.isIdle && !shown.currentState) props.onDismiss?.invoke()
        }

        Box(Modifier.pmMember("Alert", mapOf("tone" to tone.value)).fillMaxWidth()) {
            AnimatedVisibility(
                visibleState = shown,
                // No enter motion: an Alert is page content, not an arrival.
                enter = EnterTransition.None,
                exit = fadeOut(tween(half, easing = motion.easing.exit.easing)) +
                    shrinkVertically(tween(half, half, motion.easing.exit.easing)),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(recipe.wash.color, shape)
                        .border(PMGeometry.hairline, recipe.border.color, shape)
                        .padding(space.s4),
                    horizontalArrangement = Arrangement.spacedBy(space.s3),
                    verticalAlignment = Alignment.Top,
                ) {
                    if (props.icon == null) {
                        // One text line tall, so a long Alert keeps the glyph by its first line.
                        Box(Modifier.heightIn(min = theme.text.sm.lineBox.dp), contentAlignment = Alignment.Center) {
                            PMIconView(recipe.glyph, PMControlSize.Md, tint = recipe.text.color)
                        }
                    }
                    Column(Modifier.weight(1f)) {
                        title?.let {
                            Text(
                                text = it,
                                style = theme.text.sm.textStyle,
                                color = theme.colors.textPrimary.color,
                                modifier = Modifier.padding(bottom = if (children == null) 0.dp else space.s1),
                            )
                        }
                        children?.let { content ->
                            CompositionLocalProvider(
                                LocalTextStyle provides theme.text.sm.textStyle,
                                LocalContentColor provides theme.colors.textSecondary.color,
                            ) { content() }
                        }
                        if (props.action != null || props.secondaryAction != null) {
                            // The recipe's wrapping row, the first action first.
                            FlowRow(
                                modifier = Modifier.padding(top = space.s2),
                                horizontalArrangement = Arrangement.spacedBy(space.s2),
                                verticalArrangement = Arrangement.spacedBy(space.s2),
                            ) {
                                props.action?.invoke()
                                props.secondaryAction?.invoke()
                            }
                        }
                    }
                    if (props.onDismiss != null) {
                        PMButton(
                            icon = PMIconRole.Close,
                            iconOnly = true,
                            label = props.dismissLabel ?: PMSpecDefault.strings.dismiss,
                            onClick = { shown.targetState = false },
                            size = PMControlSize.Sm,
                            appearance = PMButtonAppearance.GhostNeutral,
                        )
                    }
                }
            }
        }
    }
}

/**
 * The tone's three roles and its glyph: the wash, its border, and the glyph's
 * colour, `{tone}.text` on `{tone}.subtle`, the pairing the contrast law checks.
 */
private class AlertRecipe(tone: PMAlertTone, c: PMColors) {
    val wash: PMDynamicColor
    val border: PMDynamicColor
    val text: PMDynamicColor
    val glyph: PMIconRole

    init {
        when (tone) {
            PMAlertTone.Info -> { wash = c.infoSubtle; border = c.infoBorder; text = c.infoText; glyph = PMIconRole.Info }
            PMAlertTone.Success -> {
                wash = c.successSubtle; border = c.successBorder; text = c.successText; glyph = PMIconRole.Success
            }
            PMAlertTone.Warning -> {
                wash = c.warningSubtle; border = c.warningBorder; text = c.warningText; glyph = PMIconRole.Warning
            }
            PMAlertTone.Danger -> { wash = c.dangerSubtle; border = c.dangerBorder; text = c.dangerText; glyph = PMIconRole.Error }
        }
    }
}

/**
 * Alert's states, from the spec's States table: each tone, title and body,
 * body only, title only, one action, two actions, and the dismiss button. An
 * Alert with nothing to say draws nothing, so it has no entry: the harness
 * holds every entry to drawing, and a behaviour test holds that one.
 */
object AlertStates : PMStates {
    override val member = "Alert"

    private const val title = "Sandbox mode"
    private const val body = "Payments in this workspace are simulated until you go live."
    private const val short = "Two fields need attention."
    private const val goLive = "Go live"
    private const val review = "Three ticket fields came across under new names."
    private const val unsaved = "The changes could not be saved"

    override val entries: List<PMStateEntry>
        get() = PMAlertTone.entries.map { tone ->
            PMStateEntry(tone.value, expect = mapOf("tone" to tone.value)) {
                PMAlert(title = title, tone = tone) { Text(body) }
            }
        } + listOf(
            PMStateEntry("body only", expect = mapOf("tone" to "danger")) {
                PMAlert(tone = PMAlertTone.Danger) { Text(short) }
            },
            PMStateEntry("title only", expect = mapOf("tone" to "danger")) {
                PMAlert(title = unsaved, tone = PMAlertTone.Danger)
            },
            PMStateEntry("with action", expect = mapOf("tone" to "warning")) {
                PMAlert(
                    action = { PMButton(label = goLive, size = PMControlSize.Sm, appearance = PMButtonAppearance.GhostNeutral) },
                    title = title,
                    tone = PMAlertTone.Warning,
                ) { Text(body) }
            },
            PMStateEntry("with two actions", expect = mapOf("tone" to "info", "contains" to "Button")) {
                PMAlert(
                    action = { PMButton(label = "Apply", size = PMControlSize.Sm, appearance = PMButtonAppearance.SoftAccent) },
                    secondaryAction = { PMButton(label = "Discard", size = PMControlSize.Sm, appearance = PMButtonAppearance.GhostNeutral) },
                    title = "Imported fields need review",
                ) { Text(review) }
            },
            PMStateEntry("dismissible", expect = mapOf("tone" to "info", "contains" to "Button")) {
                PMAlert(onDismiss = {}, title = title) { Text(body) }
            },
            PMStateEntry("icon suppressed", expect = mapOf("tone" to "success")) {
                PMAlert(icon = PMUnsupportedAlertIcon(), tone = PMAlertTone.Success) { Text(short) }
            },
        )
}
