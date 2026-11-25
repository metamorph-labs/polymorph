// Button's recipe as a frame other members wear by reference, as the web's
// presets compose `.button`: Button itself, CopyButton (the ghost/neutral
// icon-only cell with its own glyph), ProviderButton (the outline/neutral cell
// with a provider's mark), AvatarButton (the ghost/neutral cell, round, around
// an Avatar) and SplitButton (two halves joined at a seam, each rounding its
// outer corners only). The cells are `PMButtonCell`'s (`Button.kt`).

package dev.polymorph.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.layout
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.toggleableState
import androidx.compose.ui.state.ToggleableState
import androidx.compose.ui.unit.dp
import dev.polymorph.tokens.PMShadow

/**
 * Which corners a Button frame rounds at the control radius: all four, or one
 * end's, for a half of a joined group. `Round` is all four at the pill radius,
 * for AvatarButton's round box.
 */
enum class PMButtonCorners { All, Start, End, Round }

/**
 * A pressable part in Button's recipe: the `appearance` cell at `size` in
 * every phase (rest, a pointer over it, the press as a ripple of the active
 * fill under the content, the toggle's latched cell, disabled), the lit fill's
 * seat and top light, the accent gradient, the hover glow, press feedback, the
 * hit target and the focus ring. Inside a container that makes its buttons
 * tertiary (`LocalPMTertiary`), every cell draws the tone's text colour alone.
 *
 * It is one element named `name`, with Button's role; `value` is its state
 * description (a loading part's "Loading"), `latched` its toggle state, and
 * `current` its selected state. `expanded` makes it a disclosure's trigger:
 * its state is expanded or collapsed, which `value` replaces while it loads,
 * and its click is also the platform's expand or collapse action while the
 * part answers a press. `held` draws the active cell without a toggle
 * state, as a menu's trigger does while its menu is open. A part of a joined
 * group (`hitWidth` false) reserves the hit target's height alone, so the
 * halves meet at their seam; Compose extends a narrow part's touch bounds
 * across its neighbours without moving them. `modifier` is applied first, so a member's
 * identity (`pmMember`) sits on the same node. Loading keeps the rest colours,
 * answers neither the pointer nor the press, and detaches `onClick`.
 * `content` draws the glyphs and the label in the cell's text colour, in a
 * row with the size's padding and gap (none across when `iconOnly`).
 */
@Composable
fun PMButtonFrame(
    appearance: PMButtonAppearance,
    size: PMControlSize,
    name: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    disabled: Boolean = false,
    loading: Boolean = false,
    iconOnly: Boolean = false,
    latched: Boolean? = null,
    current: Boolean = false,
    value: String? = null,
    expanded: Boolean? = null,
    corners: PMButtonCorners = PMButtonCorners.All,
    held: Boolean = false,
    hitWidth: Boolean = true,
    content: @Composable RowScope.(text: Color) -> Unit,
) {
    val theme = PM.theme
    val strings = PMSpecDefault.strings
    val tertiary = LocalPMTertiary.current
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    val pressed by interaction.collectIsPressedAsState()
    val focused by interaction.collectIsFocusedAsState()
    // Loading keeps the rest colours and answers neither the pointer nor the
    // press; the toggle's on state holds the active cell.
    val phase = when {
        disabled -> PMButtonPhase.Disabled
        loading -> PMButtonPhase.Rest
        latched == true || held -> PMButtonPhase.Active
        hovered -> PMButtonPhase.Hover
        else -> PMButtonPhase.Rest
    }
    val live = !disabled && !loading
    val cell = if (tertiary) {
        PMButtonCell.tertiary(appearance.tone, disabled, theme.colors)
    } else {
        PMButtonCell(appearance, phase, theme.colors)
    }
    val active = if (tertiary) cell else PMButtonCell(appearance, PMButtonPhase.Active, theme.colors)
    // The press shows the active cell's text and border at once; its fill is
    // the ripple's.
    val edge = if (pressed && live) active else cell

    val metrics = PMControlMetrics(size, theme)
    val radius = (if (corners == PMButtonCorners.Round) theme.radius.pill else theme.radius.control).dp
    val shape = when (corners) {
        PMButtonCorners.All, PMButtonCorners.Round -> RoundedCornerShape(radius)
        PMButtonCorners.Start -> RoundedCornerShape(topStart = radius, bottomStart = radius)
        PMButtonCorners.End -> RoundedCornerShape(topEnd = radius, bottomEnd = radius)
    }
    val motion = theme.defaultMotion
    val spec = motion.easing.standard.tween<Color>(motion.duration.control)
    val fill by animateColorAsState(cell.fill?.color ?: Color.Transparent, spec, label = "fill")
    val border by animateColorAsState(edge.border?.color ?: Color.Transparent, spec, label = "border")
    val text by animateColorAsState(edge.text.color, spec, label = "text")
    val gradient = theme.gradients.accentGradient.resolve(PM.dark)
    val shadow = when {
        cell.glow -> theme.glow.hover.resolve(PM.dark)
        cell.lit -> theme.shadows.seat
        else -> PMShadow(emptyList())
    }

    Box(
        modifier = modifier
            // Before the clearing semantics: a clearing modifier drops what the
            // modifiers after it add, and the click is what gives the part its
            // action and its disabled state.
            .clickable(interactionSource = interaction, indication = null, enabled = !disabled) {
                // Detached while loading, so a second press never fires a
                // command already in flight.
                if (!loading) onClick()
            }
            .clearAndSetSemantics {
                contentDescription = name
                role = Role.Button
                // The state first, so a loading part's `value` replaces it below.
                expanded?.let {
                    if (live) pmDisclosure(it, strings, onClick)
                    else stateDescription = if (it) strings.expanded else strings.collapsed
                }
                value?.let { stateDescription = it }
                latched?.let { toggleableState = ToggleableState(it) }
                if (current) selected = true
            }
            .then(if (hitWidth) Modifier.pmHitTarget() else Modifier.pmHitHeight())
            .pmPressFeedback(pressed && live)
            // Outside the clip, so a mark a system draws outside the edge is
            // not cut. A solid fill gives the mark its label colour.
            .pmFocusRing(
                focused && !disabled,
                radius,
                onFill = if (!tertiary && appearance.variant == PMButtonVariant.Solid) text else null,
            )
            .pmShadow(shadow, shape)
            .clip(shape)
            .background(fill)
            .then(if (cell.gradient && !gradient.solid) Modifier.background(gradient.brush) else Modifier)
            .pmInsetShadow(if (cell.lit) theme.shadows.insetTop else PMShadow(emptyList()), shape)
            // A hairline on every cell, transparent where the recipe has none,
            // so every variant is one size.
            .border(PMGeometry.hairline, border, shape)
            // The density's height, and square when icon-only. Larger text
            // grows the part rather than clipping its label.
            .heightIn(min = metrics.height)
            .widthIn(min = if (iconOnly) metrics.height else 0.dp),
        contentAlignment = Alignment.Center,
    ) {
        if (live && !tertiary) PMPressLayer(interaction, active.fill?.color ?: Color.Transparent, Modifier.matchParentSize())
        Row(
            modifier = Modifier.padding(horizontal = if (iconOnly) 0.dp else metrics.padding),
            horizontalArrangement = Arrangement.spacedBy(metrics.gap),
            verticalAlignment = Alignment.CenterVertically,
        ) { content(text) }
    }
}

/**
 * The hit target's height alone: at least the density's `hitTarget` tall,
 * the part centred in it, and no wider than it draws.
 */
@Composable
private fun Modifier.pmHitHeight(): Modifier {
    val target = PM.theme.defaultDensity.hitTarget.dp
    return layout { measurable, constraints ->
        val placeable = measurable.measure(constraints)
        val height = maxOf(placeable.height, target.roundToPx().coerceAtMost(constraints.maxHeight))
        layout(placeable.width, height) { placeable.placeRelative(0, (height - placeable.height) / 2) }
    }
}
