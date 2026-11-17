// RecordButton (`design/components/record-button.md`): a Button preset that
// starts and stops a recording the app makes, as a composer's voice input or
// a ticket's voice note. The app owns the microphone: it asks for the device,
// records and holds the file, and passes what it has, whether it records, for
// how long and how loud the input is. The member draws that and reports each
// press. It requests no permission and imports nothing of Android's.
//
// A row, `space.2` apart, centred: while recording the meter, then the
// Button. The Button is Button's icon-only at `size`: ghost/neutral with
// `record` at rest, named `label`, and outline/neutral with `stop` while
// recording, named `stopLabel`. A press calls `onStart` at rest and `onStop`
// while recording, and changes nothing itself; `disabled` is Button's. The
// meter is the mark, a `space.6` box holding a dot in `danger.text`, `space.3`
// in from each edge, over a halo in `danger.border` that grows with `level`
// from the dot's size to the whole box, both at `radius.pill`; and the time
// the app has recorded (`elapsed`) as the clock writes it, `text.sm` at `md`
// and `text.xs` at `sm`, in `text.secondary` with tabular figures. The halo
// follows the level over the control duration on the standard easing; at the
// `none` temperament it stays whole and the level is its opacity, and with
// the system's animations off it changes at once.
//
// The mark is hidden from TalkBack. The time is read where the reader reaches
// it, before the Button, as its length in words: the app's for `locale`, else
// English (`PolymorphUIClock.kt`); its digits are Western. Nothing is
// announced: the Button's new name is what TalkBack reads when a recording
// starts or stops. The meter is drawn before the Button, so in a row aligned
// to its end the Button stays where it was pressed.

package dev.polymorph.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.hideFromAccessibility

object PMRecordButton : PMRecordButtonRendering {
    @Composable
    override fun Render(props: PMRecordButtonProps) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val recording = props.recording ?: false
        val size = props.size ?: PMRecordButtonSize.Md
        val units = pmSpokenUnits(props.locale)
        val attributes = buildMap {
            if (recording) put("state", "recording")
            put("size", size.value)
        }

        Row(
            Modifier.pmMember("RecordButton", attributes),
            horizontalArrangement = Arrangement.spacedBy(space.s2),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (recording) {
                Row(horizontalArrangement = Arrangement.spacedBy(space.s2), verticalAlignment = Alignment.CenterVertically) {
                    Mark(share(props.level))
                    props.elapsed?.let { elapsed ->
                        val step = if (size == PMRecordButtonSize.Sm) theme.text.xs else theme.text.sm
                        val spoken = PMClock.words(elapsed, units)
                        Text(
                            PMClock.digits(elapsed),
                            style = step.textStyle.tabular(theme),
                            color = theme.colors.textSecondary.color,
                            softWrap = false,
                            modifier = Modifier.clearAndSetSemantics { contentDescription = spoken },
                        )
                    }
                }
            }
            PMButton(
                disabled = props.disabled ?: false,
                icon = if (recording) PMIconRole.Stop else PMIconRole.Record,
                iconOnly = true,
                label = if (recording) props.stopLabel else props.label,
                onClick = { if (props.recording == true) props.onStop?.invoke() else props.onStart?.invoke() },
                size = if (size == PMRecordButtonSize.Sm) PMControlSize.Sm else PMControlSize.Md,
                appearance = if (recording) PMButtonAppearance.OutlineNeutral else PMButtonAppearance.GhostNeutral,
            )
        }
    }

    /** The level from 0 to 1. A value that is not a number is no level. */
    fun share(level: Double?): Float = level?.takeIf { it.isFinite() }?.coerceIn(0.0, 1.0)?.toFloat() ?: 0f

    /**
     * The mark: the halo, from the dot's size at no level to the whole box at
     * the full level, under the dot. The box holds the halo, so a loud input
     * moves nothing beside it.
     */
    @Composable
    private fun Mark(level: Float) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val motion = theme.defaultMotion
        val shape = theme.rounded(theme.radius.pill)
        // Without motion the halo does not grow: it is whole, and the level is
        // its opacity, the scale-fade pattern's projection to a fade.
        val still = motion.duration.control <= 0
        val grown by animateFloatAsState(
            targetValue = (1 + 2 * level) / 3,
            animationSpec = motion.easing.standard.tween(motion.duration.control),
            label = "halo",
        )
        Box(Modifier.size(space.s6).clearAndSetSemantics { hideFromAccessibility() }) {
            Box(
                Modifier
                    .matchParentSize()
                    .graphicsLayer {
                        scaleX = if (still) 1f else grown
                        scaleY = if (still) 1f else grown
                        alpha = if (still) level else 1f
                    }
                    .background(theme.colors.dangerBorder.color, shape),
            )
            Box(
                Modifier
                    .matchParentSize()
                    .padding(space.s3)
                    .background(theme.colors.dangerText.color, shape),
            )
        }
    }
}

/** RecordButton's states, from the spec's States table. */
object RecordButtonStates : PMStates {
    override val member = "RecordButton"

    private const val label = "Record a voice message"
    private const val stop = "Stop recording"

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("rest — ready to record", expect = mapOf("state" to "", "size" to "md")) {
                PMRecordButton(label = label, stopLabel = stop)
            },
            PMStateEntry("recording — the time and the level beside the stop control", expect = mapOf("state" to "recording")) {
                PMRecordButton(elapsed = 12.0, label = label, level = 0.6, recording = true, stopLabel = stop)
            },
            PMStateEntry("silent — recording with no input level", expect = mapOf("state" to "recording")) {
                PMRecordButton(elapsed = 47.0, label = label, level = 0.0, recording = true, stopLabel = stop)
            },
            PMStateEntry("starting — recording before the app counts a second", expect = mapOf("state" to "recording")) {
                PMRecordButton(label = label, recording = true, stopLabel = stop)
            },
            PMStateEntry("sm — the size a composer’s toolbar takes", expect = mapOf("size" to "sm")) {
                PMRecordButton(elapsed = 75.0, label = label, level = 0.3, recording = true, size = PMRecordButtonSize.Sm, stopLabel = stop)
            },
            PMStateEntry("disabled", expect = mapOf("state" to "")) {
                PMRecordButton(disabled = true, label = label, stopLabel = stop)
            },
        )
}
