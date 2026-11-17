// Meter (`design/components/meter.md`): a measured value in a known range,
// storage used of a quota or money spent of a budget, whose fill's colour says
// the band the value is in. The bar is Progress's (`PMBar`): `space-2` tall on
// `bg.subtle`, a pill in every geometry, its fill the track's full width
// scaled from the leading edge, so it grows from the right in a right-to-left
// layout. The fill is the accent gradient below every threshold,
// `warning.solid` from `warning` up and `danger.solid` from `danger` up;
// `danger` wins where the bands overlap. The band reads the value as given,
// the bar the value clamped to `min`–`max`, and a range with no width draws an
// empty fill. A change eases over the surface duration on the standard easing,
// never on a spring; at the `none` temperament, and with the system's
// animations off, it is instant.
//
// It draws no label: `label` names the meter for TalkBack, as Progress's
// does. The readout under the bar is a status glyph past a threshold, the
// `warning` or `error` role at `sm` in the band's text colour and named by
// `messages`, and the app's `valueText` in `text.sm`, secondary, with tabular
// figures. The readout is not drawn for an accent meter without `valueText`.
//
// To accessibility the bar is one node, Android's determinate range
// indicator, named by `label`, its range `min` to `max`, its value the clamped
// value, and its state description `valueText` when the app gives one, which
// TalkBack reads in place of a percentage. The value text under it is hidden,
// because the bar's state already says it, and the glyph is read after the
// bar as an image named "High" or "Critical". A change of value is not
// announced, as on the web.

package dev.polymorph.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.SemanticsPropertyReceiver
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.LayoutDirection

object PMMeter : PMMeterRendering {
    /** The band the value is in, as the identifier's `tone` names it. */
    enum class Tone(val value: String) { Accent("accent"), Warning("warning"), Danger("danger") }

    /**
     * The tone of a value against its thresholds, read before the value is
     * clamped, so a value past `max` is still past a threshold above `max`.
     */
    fun tone(value: Double, warning: Double?, danger: Double?): Tone = when {
        danger != null && value >= danger -> Tone.Danger
        warning != null && value >= warning -> Tone.Warning
        else -> Tone.Accent
    }

    @Composable
    override fun Render(props: PMMeterProps) {
        val theme = PM.theme
        val low = props.min ?: 0.0
        val high = maxOf(low, props.max ?: FULL)
        val shown = props.value.coerceIn(low, high)
        val ratio = if (high > low) (shown - low) / (high - low) else 0.0
        val tone = tone(props.value, props.warning, props.danger)

        Column(
            Modifier
                .pmMember("Meter", mapOf("tone" to tone.value))
                .fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(theme.defaultDensity.spacing.s2),
        ) {
            Bar(ratio, tone) {
                contentDescription = props.label
                progressBarRangeInfo = ProgressBarRangeInfo(shown.toFloat(), low.toFloat()..high.toFloat())
                props.valueText?.let { stateDescription = it }
            }
            if (tone != Tone.Accent || props.valueText != null) {
                Readout(tone, props.valueText, props.messages ?: PMSpecDefault.strings.meterMessages)
            }
        }
    }

    @Composable
    private fun Bar(ratio: Double, tone: Tone, semantics: SemanticsPropertyReceiver.() -> Unit) {
        val motion = PM.theme.defaultMotion
        val scale by animateFloatAsState(
            ratio.toFloat(),
            motion.easing.standard.tween(motion.duration.surface),
            label = "meter",
        )
        // The leading edge: the left in a left-to-right layout, the right in a
        // right-to-left one, so the bar grows the way the text runs.
        val leading = if (LocalLayoutDirection.current == LayoutDirection.Rtl) 1f else 0f
        val shape = PMBar.shape
        val fill = when (tone) {
            Tone.Accent -> PMBarFill.Accent
            Tone.Warning -> PMBarFill.Warning
            Tone.Danger -> PMBarFill.Danger
        }

        Box(
            Modifier
                .clearAndSetSemantics(semantics)
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
                    .background(PMBar.fill(fill), shape),
            )
        }
    }

    @Composable
    private fun Readout(tone: Tone, valueText: String?, messages: PMMeterMessages) {
        val theme = PM.theme
        Row(
            horizontalArrangement = Arrangement.spacedBy(theme.defaultDensity.spacing.s2),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            when (tone) {
                Tone.Accent -> Unit
                Tone.Warning -> CompositionLocalProvider(LocalContentColor provides theme.colors.warningText.color) {
                    PMIcon(label = messages.warning, name = PMIconRole.Warning, size = PMControlSize.Sm)
                }
                Tone.Danger -> CompositionLocalProvider(LocalContentColor provides theme.colors.dangerText.color) {
                    PMIcon(label = messages.danger, name = PMIconRole.Error, size = PMControlSize.Sm)
                }
            }
            if (valueText != null) {
                Text(
                    text = valueText,
                    style = theme.text.sm.textStyle.tabular(theme),
                    color = theme.colors.textSecondary.color,
                    modifier = Modifier.semantics { hideFromAccessibility() },
                )
            }
        }
    }

    /** The top of the range when the app gives none (`meter.md`): a percentage. */
    private const val FULL = 100.0

    /** The fill's vertical centre, where it scales from: geometry, not a design value. */
    private const val CENTRE = 0.5f
}

/**
 * Meter's states, from the spec's States table. Each entry's root carries the
 * band as `tone`; a glyph past a threshold is an Icon inside it.
 */
object MeterStates : PMStates {
    override val member = "Meter"

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("below its thresholds", expect = mapOf("tone" to "accent")) {
                PMMeter(danger = 45.0, label = "Storage used", max = 50.0, value = 30.0, valueText = "30 GB of 50 GB", warning = 40.0)
            },
            PMStateEntry(
                "between its thresholds — warning",
                expect = mapOf("tone" to "warning", "contains" to "Icon"),
            ) {
                PMMeter(danger = 45.0, label = "Storage used", max = 50.0, value = 42.0, valueText = "42 GB of 50 GB", warning = 40.0)
            },
            PMStateEntry(
                "above its thresholds — danger",
                expect = mapOf("tone" to "danger", "contains" to "Icon"),
            ) {
                PMMeter(danger = 45.0, label = "Storage used", max = 50.0, value = 48.0, valueText = "48 GB of 50 GB", warning = 40.0)
            },
            PMStateEntry("at min", expect = mapOf("tone" to "accent")) {
                PMMeter(label = "Seats taken", max = 20.0, value = 0.0, valueText = "0 of 20 seats")
            },
            PMStateEntry("at max — the budget is spent", expect = mapOf("tone" to "danger")) {
                PMMeter(danger = 2000.0, label = "Budget spent", max = 2000.0, value = 2000.0, valueText = "€2,000 of €2,000")
            },
            PMStateEntry("outside the range is clamped, and its band still holds", expect = mapOf("tone" to "danger")) {
                PMMeter(danger = 100.0, label = "Allowance used", value = 130.0, valueText = "Over by 30 GB")
            },
            PMStateEntry("without the value text", expect = mapOf("tone" to "accent")) {
                PMMeter(label = "Cold share", value = 62.0)
            },
            PMStateEntry(
                "danger without the value text — the glyph alone",
                expect = mapOf("tone" to "danger", "contains" to "Icon"),
            ) {
                PMMeter(danger = 85.0, label = "Queue depth", value = 92.0)
            },
            PMStateEntry("messages — the glyph named in another language", expect = mapOf("tone" to "warning")) {
                PMMeter(
                    danger = 45.0,
                    label = "Speicher belegt",
                    max = 50.0,
                    messages = PMMeterMessages(warning = "Hoch", danger = "Kritisch"),
                    value = 42.0,
                    valueText = "42 GB von 50 GB",
                    warning = 40.0,
                )
            },
        )
}
