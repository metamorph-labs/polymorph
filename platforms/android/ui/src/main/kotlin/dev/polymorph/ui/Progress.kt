// Progress (`design/components/progress.md`): a bar for how much of a task is
// done; Spinner is for a wait of unknown length. It is the bar (`PMBar`):
// `space-2` tall on `bg.subtle`, a pill in every geometry. The fill is the
// accent gradient (the solid accent in a system with no partner hue), or
// `danger.solid` for over-quota and exceeded budgets. It is the track's full
// width scaled from the leading edge to the value, which is clamped to 0–100,
// as the web scales it rather than sizing it, so its ends squash as the web's
// do. A change eases over the surface duration on the standard easing, never
// on a spring, because data should not look playful; at the `none`
// temperament, and with the system's animations off, it is instant.
//
// It draws no text: the words beside it are the screen's. To accessibility it
// is one node, Android's determinate progress indicator, named by `label`,
// its range 0 to 100 and its value the clamped value. A change is not
// announced, as on the web: announcing each polled update is noise, and the
// app announces completion with a toast.
//
// `shape = Ring` draws the same value as a ring in the icon box for `size`,
// Spinner's box, for the place a Spinner sits once the task knows how far it
// has got. The groove is `border.default` and the arc `accent.bg`, or
// `danger.solid`, each `space-1` wide and inset by half of that, so the stroke
// ends at the box's edge. The groove is a line, so it takes the line role the
// contrast law holds visible on every surface, not the bar's `bg.subtle`,
// which a line this thin does not show on a dark page. The arc starts at the
// top and runs clockwise in both layout directions, because a ring is a clock
// face, and its ends are butt. A stroke takes no gradient, so the accent arc is
// the solid accent. Its sweep eases as the bar's scale does.

package dev.polymorph.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt

object PMProgress : PMProgressRendering {
    @Composable
    override fun Render(props: PMProgressProps) {
        val value = props.value.coerceIn(0.0, FULL)
        val tone = props.tone ?: PMProgressTone.Accent
        if (props.shape == PMProgressShape.Ring) {
            Ring(props.label, value, tone, props.size ?: PMControlSize.Md)
        } else {
            Bar(props.label, value, tone)
        }
    }

    @Composable
    private fun Ring(label: String, value: Double, tone: PMProgressTone, size: PMControlSize) {
        val theme = PM.theme
        val motion = theme.defaultMotion
        val done by animateFloatAsState(
            (value / FULL).toFloat(),
            motion.easing.standard.tween(motion.duration.surface),
            label = "progress ring",
        )
        val icons = theme.icon
        val box = when (size) {
            PMControlSize.Sm -> icons.sm.size
            PMControlSize.Md -> icons.md.size
            PMControlSize.Lg -> icons.lg.size
        }.dp
        val stroke = theme.defaultDensity.spacing.s1
        val groove = theme.colors.borderDefault.color
        val arc = if (tone == PMProgressTone.Danger) theme.colors.dangerSolid.color else theme.colors.accentBg.color

        Canvas(
            Modifier
                .pmMember(
                    "Progress",
                    mapOf(
                        "tone" to tone.value,
                        "valuenow" to value.roundToInt().toString(),
                        "shape" to PMProgressShape.Ring.value,
                        "size" to size.value,
                    ),
                )
                .clearAndSetSemantics {
                    contentDescription = label
                    progressBarRangeInfo = ProgressBarRangeInfo(value.toFloat(), 0f..FULL.toFloat())
                }
                .size(box),
        ) {
            val width = stroke.toPx()
            // The stroke is centred on the circle, so the circle sits half a stroke in from each edge.
            val inset = width * CENTRE
            val circle = Size(this.size.width - width, this.size.height - width)
            val line = Stroke(width, cap = StrokeCap.Butt)
            drawArc(groove, 0f, FULL_TURN, useCenter = false, topLeft = Offset(inset, inset), size = circle, style = line)
            drawArc(arc, TOP, FULL_TURN * done, useCenter = false, topLeft = Offset(inset, inset), size = circle, style = line)
        }
    }

    @Composable
    private fun Bar(label: String, value: Double, tone: PMProgressTone) {
        val motion = PM.theme.defaultMotion
        val scale by animateFloatAsState(
            (value / FULL).toFloat(),
            motion.easing.standard.tween(motion.duration.surface),
            label = "progress",
        )
        // The leading edge: the left in a left-to-right layout, the right in a
        // right-to-left one, so the bar grows the way the text runs.
        val leading = if (LocalLayoutDirection.current == LayoutDirection.Rtl) 1f else 0f
        val shape = PMBar.shape

        Box(
            Modifier
                .pmMember("Progress", mapOf("tone" to tone.value, "valuenow" to value.roundToInt().toString()))
                .clearAndSetSemantics {
                    contentDescription = label
                    progressBarRangeInfo = ProgressBarRangeInfo(value.toFloat(), 0f..FULL.toFloat())
                }
                .fillMaxWidth()
                .height(PMBar.height)
                .clip(shape)
                .background(PMBar.track),
        ) {
            Box(
                Modifier
                    .fillMaxSize()
                    .graphicsLayer {
                        scaleX = scale
                        transformOrigin = TransformOrigin(leading, CENTRE)
                    }
                    .background(PMBar.fill(if (tone == PMProgressTone.Danger) PMBarFill.Danger else PMBarFill.Accent), shape),
            )
        }
    }

    /** A full bar's value: the scale is percent. */
    private const val FULL = 100.0

    /** The fill's vertical centre, where it scales from, and half a stroke: geometry, not a design value. */
    private const val CENTRE = 0.5f

    /** Degrees in a turn, the ring's whole sweep: geometry, not a design value. */
    private const val FULL_TURN = 360f

    /** Where the ring's arc starts, 12 o'clock, in Compose's degrees from 3 o'clock. */
    private const val TOP = -90f
}

/**
 * Progress's states, from the spec's States table: empty, a third, full, the
 * danger tone at 80 and clamped, then the ring at each size and in danger.
 */
object ProgressStates : PMStates {
    override val member = "Progress"

    override val entries: List<PMStateEntry>
        get() = listOf(0, 33, 100).map { value ->
            PMStateEntry(
                "$value",
                expect = mapOf("tone" to "accent", "valuenow" to "$value", "label" to "Upload"),
            ) { PMProgress(label = "Upload", value = value.toDouble()) }
        } + listOf(
            PMStateEntry("danger at 80", expect = mapOf("tone" to "danger", "valuenow" to "80", "label" to "Storage used")) {
                PMProgress(label = "Storage used", tone = PMProgressTone.Danger, value = 80.0)
            },
            PMStateEntry("past full — clamped to 100", expect = mapOf("valuenow" to "100", "label" to "Storage used")) {
                PMProgress(label = "Storage used", tone = PMProgressTone.Danger, value = 140.0)
            },
        ) + PMControlSize.entries.map { size ->
            PMStateEntry(
                "ring ${size.value}",
                expect = mapOf("shape" to "ring", "size" to size.value, "valuenow" to "60", "label" to "Uploading"),
            ) { PMProgress(label = "Uploading", shape = PMProgressShape.Ring, size = size, value = 60.0) }
        } + listOf(
            PMStateEntry("ring danger", expect = mapOf("shape" to "ring", "tone" to "danger", "label" to "Upload failed")) {
                PMProgress(label = "Upload failed", shape = PMProgressShape.Ring, tone = PMProgressTone.Danger, value = 80.0)
            },
        )
}
