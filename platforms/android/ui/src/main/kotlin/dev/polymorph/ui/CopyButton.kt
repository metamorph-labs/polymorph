// CopyButton (`design/components/copy-button.md`): a Button preset that
// copies a value to the clipboard. Button's ghost/neutral icon-only cell by
// reference (`PMButtonFrame`) in every state, the `copy` glyph at rest. A
// press writes `value` to the clipboard exactly as given (`rememberPMCopy`),
// then for two seconds (`PMSpecDefault.copyFeedbackMs`) the glyph is `confirm`
// in `success.text`, the one status colour this member uses, and the button's
// state description is `copiedLabel`, which TalkBack announces because the
// button is a polite live region; a press in that time copies again and
// restarts it. The swap crossfades over the control duration on the standard
// easing.
//
// The button is named by `label`. There is no `lg`, because a copy control is
// secondary, and no `onCopy`: writing the clipboard is the whole outcome.

package dev.polymorph.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import kotlinx.coroutines.delay

object PMCopyButton : PMCopyButtonRendering {
    @Composable
    override fun Render(props: PMCopyButtonProps) {
        val theme = PM.theme
        val size = if (props.size == PMCopyButtonSize.Sm) PMControlSize.Sm else PMControlSize.Md
        val disabled = (props.disabled ?: false) || !LocalPMEnabled.current
        val copy = rememberPMCopy()
        var copied by remember { mutableStateOf(false) }
        var presses by remember { mutableIntStateOf(0) }
        // Each press restarts the confirmation's time.
        LaunchedEffect(presses) {
            if (presses > 0) {
                delay(PMSpecDefault.copyFeedbackMs)
                copied = false
            }
        }
        val motion = theme.defaultMotion
        val confirmed by animateFloatAsState(
            targetValue = if (copied) 1f else 0f,
            animationSpec = motion.easing.standard.tween(motion.duration.control),
            label = "copied",
        )
        val attributes = buildMap {
            put("variant", "ghost")
            put("tone", "neutral")
            put("size", size.value)
            put("icon-only", "true")
            if (copied) put("state", "copied")
            if (disabled) put("disabled", "true")
        }

        PMButtonFrame(
            appearance = PMButtonAppearance.GhostNeutral,
            size = size,
            name = props.label,
            onClick = {
                copy(props.value)
                copied = true
                presses += 1
            },
            modifier = Modifier
                .pmMember("CopyButton", attributes)
                .semantics { liveRegion = LiveRegionMode.Polite },
            disabled = disabled,
            iconOnly = true,
            value = if (copied) props.copiedLabel else null,
        ) { text ->
            Box(contentAlignment = Alignment.Center) {
                PMIconView(PMIconRole.Copy, size, Modifier.graphicsLayer { alpha = 1f - confirmed }, tint = text)
                PMIconView(PMIconRole.Confirm, size, Modifier.graphicsLayer { alpha = confirmed }, tint = theme.colors.successText.color)
            }
        }
    }
}

/**
 * CopyButton's states, from the spec's States table. The copied state follows
 * a press, so it has no entry, as on the web.
 */
object CopyButtonStates : PMStates {
    override val member = "CopyButton"

    private const val command = "pnpm add @polymorph/react-ui"
    private const val label = "Copy install command"
    private const val copied = "Copied"

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("rest", expect = mapOf("size" to "md", "icon-only" to "true", "label" to label)) {
                PMCopyButton(copiedLabel = copied, label = label, value = command)
            },
            PMStateEntry("sm", expect = mapOf("size" to "sm")) {
                PMCopyButton(copiedLabel = copied, label = label, size = PMCopyButtonSize.Sm, value = command)
            },
            PMStateEntry("disabled", expect = mapOf("disabled" to "true")) {
                PMCopyButton(copiedLabel = copied, disabled = true, label = label, value = command)
            },
        )
}
