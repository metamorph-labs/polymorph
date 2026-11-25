// The disclosure grammar Accordion and Collapsible share: a trigger of a label
// and the `down` chevron, which turns half a turn while open, and the region
// it opens, which grows and fades on the `collapse` binding. Each member gives
// its own sizes (`PMDisclosureRecipe`).

package dev.polymorph.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.polymorph.tokens.PMDynamicColor
import dev.polymorph.tokens.PMTextStyle

/** A disclosure trigger's sizes: Accordion's or Collapsible's. */
class PMDisclosureRecipe(
    /** The trigger's least height: `control-height-lg` in Accordion, `control-height-sm` in Collapsible. */
    val minHeight: Dp,
    /** The space above and below the label. */
    val paddingY: Dp,
    /** The gap between the label and the chevron. */
    val gap: Dp,
    val text: PMTextStyle,
    /** The label's colour at rest: `text.primary` in Accordion, `text.secondary` in Collapsible. */
    val rest: PMDynamicColor,
    val chevron: PMControlSize,
    /** The trigger takes the row's width with the chevron at its end (Accordion), or fits its label (Collapsible). */
    val fills: Boolean,
)

/**
 * The disclosure trigger: colour only, no wash, so under the pointer and while
 * pressed the label turns `accent.text` and the chevron `text.secondary` (at
 * rest `text.muted`), over the control duration on the standard easing;
 * disabled draws both `text.disabled`. Open turns the chevron half a turn on
 * the same timing. The trigger is one button named by its label, whose state
 * is expanded or collapsed (the web's `aria-expanded`), and a `heading` when
 * it heads a section, as Accordion's does; it takes at least the hit target's
 * height and draws the focus ring with keyboard focus. `mark`, when given, is
 * drawn before the label (ReasoningDisclosure's glyph).
 */
@Composable
fun PMDisclosureTrigger(
    label: String,
    open: Boolean,
    recipe: PMDisclosureRecipe,
    onToggle: () -> Unit,
    disabled: Boolean = false,
    heading: Boolean = false,
    mark: (@Composable () -> Unit)? = null,
) {
    val theme = PM.theme
    val colors = theme.colors
    val motion = theme.defaultMotion
    val strings = PMSpecDefault.strings
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    val pressed by interaction.collectIsPressedAsState()
    val focused by interaction.collectIsFocusedAsState()
    val active = !disabled && (hovered || pressed)
    val spec = motion.easing.standard.tween<Color>(motion.duration.control)
    val text by animateColorAsState(
        when {
            disabled -> colors.textDisabled
            active -> colors.accentText
            else -> recipe.rest
        }.color,
        spec,
        label = "label",
    )
    val chevron by animateColorAsState(
        when {
            disabled -> colors.textDisabled
            active -> colors.textSecondary
            else -> colors.textMuted
        }.color,
        spec,
        label = "chevron",
    )
    Row(
        modifier = Modifier
            .then(if (recipe.fills) Modifier.fillMaxWidth() else Modifier)
            // Before the clearing semantics, so the trigger keeps its click and its disabled state.
            .clickable(interactionSource = interaction, indication = null, enabled = !disabled, onClick = onToggle)
            .clearAndSetSemantics {
                contentDescription = label
                role = Role.Button
                if (heading) heading()
                if (!disabled) pmDisclosure(open, strings, onToggle)
            }
            .pmHitTarget()
            // Around the trigger: it has no inline padding, so a line inside it
            // would cross the label.
            .pmFocusRing(focused && !disabled, theme.radius.sm.dp, around = true)
            .heightIn(min = recipe.minHeight)
            .padding(vertical = recipe.paddingY),
        horizontalArrangement = Arrangement.spacedBy(recipe.gap),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        mark?.invoke()
        Text(
            text = label,
            style = recipe.text.textStyle,
            color = text,
            modifier = if (recipe.fills) Modifier.weight(1f) else Modifier,
        )
        PMTurningChevron(PMIconRole.Down, open, PMTurn.HALF, recipe.chevron, chevron)
    }
}

/**
 * The region a disclosure opens: `collapse` in persistent mode on the surface
 * class (`design/motion/motion.md`). Its height follows the content over the
 * surface duration on the standard easing; the content fades in over the
 * second half once there is room, and out over the first half before the space
 * closes. A closed region is not in the tree, so nothing in it can be reached
 * by touch or by TalkBack.
 */
@Composable
fun PMDisclosureRegion(open: Boolean, content: @Composable () -> Unit) {
    val motion = PM.theme.defaultMotion
    val duration = motion.duration.surface
    val half = duration / 2
    val easing = motion.easing.standard.easing
    AnimatedVisibility(
        visible = open,
        enter = expandVertically(tween(durationMillis = duration, easing = easing), expandFrom = Alignment.Top) +
            fadeIn(tween(durationMillis = half, delayMillis = half, easing = easing)),
        exit = shrinkVertically(tween(durationMillis = duration, easing = easing), shrinkTowards = Alignment.Top) +
            fadeOut(tween(durationMillis = half, easing = easing)),
    ) { content() }
}
