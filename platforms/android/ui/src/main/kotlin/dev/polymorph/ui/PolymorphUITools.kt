// The parts JsonTree and ToolCall share: the ghost row that a press washes
// (JsonTree's branch toggle on `bg.subtle`, ToolCall's trigger on
// `bg.surface`). Their children appear at once and both triggers are washed
// rows, so they share it rather than an animated disclosure's trigger. Their
// chevrons are the foundation's turning chevron (`PMTurningChevron`).

package dev.polymorph.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsPropertyReceiver
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.collapse
import androidx.compose.ui.semantics.expand
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.polymorph.tokens.PMDynamicColor

/**
 * A ghost row: transparent at rest; under the pointer and while pressed, `wash`
 * fills the content's box at `cornerRadius` and the content turns `active`,
 * over the control duration on the standard easing. `rest` is the content's
 * colour otherwise; without one it keeps the colour around it. The row takes
 * the width it is offered and at least the hit target's height, all of it
 * pressable, so two rows one above the other are each a target of their own.
 * Keyboard focus draws the focus ring around the content.
 *
 * To TalkBack the row is one button whose click is `onClick`, described by
 * `semantics` (its name, and a disclosure's state).
 */
@Composable
fun PMWashRow(
    wash: PMDynamicColor,
    cornerRadius: Dp,
    onClick: () -> Unit,
    semantics: SemanticsPropertyReceiver.() -> Unit,
    modifier: Modifier = Modifier,
    rest: PMDynamicColor? = null,
    active: PMDynamicColor? = null,
    content: @Composable RowScope.() -> Unit,
) {
    val theme = PM.theme
    val motion = theme.defaultMotion
    val enabled = LocalPMEnabled.current
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    val pressed by interaction.collectIsPressedAsState()
    val focused by interaction.collectIsFocusedAsState()
    val on = enabled && (hovered || pressed)
    val spec = motion.easing.standard.tween<Color>(motion.duration.control)
    val fill by animateColorAsState(if (on) wash.color else Color.Transparent, spec, label = "wash")
    val inherited = LocalContentColor.current
    val text by animateColorAsState((if (on) active ?: rest else rest)?.color ?: inherited, spec, label = "text")
    val shape = RoundedCornerShape(cornerRadius)

    Box(
        modifier
            .fillMaxWidth()
            // Before the clearing semantics, so the row keeps its click.
            .clickable(interactionSource = interaction, indication = null, enabled = enabled, onClick = onClick)
            .clearAndSetSemantics {
                role = Role.Button
                semantics()
            }
            .heightIn(min = theme.defaultDensity.hitTarget.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        CompositionLocalProvider(LocalContentColor provides text) {
            Row(
                Modifier.pmFocusRing(focused, cornerRadius).background(fill, shape),
                verticalAlignment = Alignment.CenterVertically,
                content = content,
            )
        }
    }
}

/**
 * A disclosure toggle's semantics: its state as the platform's expanded or
 * collapsed (the web's `aria-expanded`), and the action that changes it.
 */
fun SemanticsPropertyReceiver.pmDisclosure(open: Boolean, words: PMStrings, toggle: () -> Unit) {
    stateDescription = if (open) words.expanded else words.collapsed
    if (open) {
        collapse {
            toggle()
            true
        }
    } else {
        expand {
            toggle()
            true
        }
    }
}
