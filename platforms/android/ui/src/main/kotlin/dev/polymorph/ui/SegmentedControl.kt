// SegmentedControl (`design/components/segmented-control.md`): a joined row
// of segments that always holds one value, the control a toolbar or a filter
// row sets data with. The track is the size's control height on `bg.subtle` at
// the control radius, and the segments divide it equally, the widest label
// setting their width. A segment is its icon and its label at the size's type
// step, padding and gap, in `text.secondary`, `text.primary` under the
// pointer; the chosen one is a raised chip, `bg.surface` with the control
// shadow and `radius.sm`, inset half `space-2` on every side, its text
// `text.primary`. The chip is the selection's second channel, so no accent is
// needed. A disabled segment is `text.disabled`; a chosen disabled one keeps
// its chip, without the shadow, so its place stays legible. Selection snaps:
// the chip does not slide and nothing fades; only the pointer's text change
// eases. A press is a ripple in the chip's colour, inside the chip's inset, as
// Android draws one; the chip is drawn inside the segment, so each segment's
// touch area is the track's full height, and the control's hit area is the hit
// target. Keyboard focus draws the focus ring around the segment.
//
// It always holds a value: without `value` or `defaultValue` the first option
// is chosen. `value` with `onChange` is the controlled pair. The semantics are
// those of Material's segmented buttons: the root is a selectable group named
// by `label`, and each segment a radio button named by its label, selected
// while chosen, disabled when it or the group is. The arrow keys move focus
// and Enter or Space chooses, as on Android's radio buttons; the web's arrows
// also choose. In a right-to-left layout the first option is at the right.
// There is no `lg`: a form-scale choice is a RadioGroup.

package dev.polymorph.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import dev.polymorph.tokens.PMShadow
import kotlin.math.min

object PMSegmentedControl : PMSegmentedControlRendering {
    @Composable
    override fun Render(props: PMSegmentedControlProps) {
        val theme = PM.theme
        val size = if (props.size == PMSegmentedControlSize.Sm) PMControlSize.Sm else PMControlSize.Md
        val metrics = PMControlMetrics(size, theme)
        var own by remember { mutableStateOf(props.defaultValue ?: props.options.firstOrNull()?.value) }
        val current = props.value ?: own
        val disabled = (props.disabled ?: false) || !LocalPMEnabled.current
        val attributes = buildMap {
            put("size", size.value)
            current?.let { put("checked", it) }
            if (disabled) put("disabled", "true")
        }

        Segments(
            Modifier
                .pmMember("SegmentedControl", attributes)
                .pmChoiceGroup(name = props.label, error = null, single = true)
                .pmHitTarget()
                .height(metrics.height)
                .background(theme.colors.bgSubtle.color, theme.rounded(theme.radius.control)),
        ) {
            for (option in props.options) {
                key(option.value) {
                    Segment(option, option.value == current, disabled || option.disabled == true, size, metrics) {
                        if (option.value != current) {
                            own = option.value
                            props.onChange?.invoke(option.value)
                        }
                    }
                }
            }
        }
    }

    /**
     * The track's equal columns: each as wide as the widest segment wants, or
     * an equal share of the width offered when that is less, and as tall as
     * the track.
     */
    @Composable
    private fun Segments(modifier: Modifier, content: @Composable () -> Unit) {
        Layout(content, modifier) { measurables, constraints ->
            val height = constraints.maxHeight
            val count = measurables.size
            val widest = measurables.maxOfOrNull { it.maxIntrinsicWidth(height) } ?: 0
            val each = if (constraints.hasBoundedWidth && count > 0) min(widest, constraints.maxWidth / count) else widest
            val placeables = measurables.map { it.measure(Constraints.fixed(each, height)) }
            layout(each * count, height) {
                placeables.forEachIndexed { index, placeable -> placeable.placeRelative(index * each, 0) }
            }
        }
    }

    /** One segment: the chip under the chosen one, the icon and the label. */
    @Composable
    private fun Segment(
        option: PMSegmentedControlOption,
        checked: Boolean,
        disabled: Boolean,
        size: PMControlSize,
        metrics: PMControlMetrics,
        choose: () -> Unit,
    ) {
        val theme = PM.theme
        val colors = theme.colors
        val motion = theme.defaultMotion
        val interaction = remember { MutableInteractionSource() }
        val hovered by interaction.collectIsHoveredAsState()
        val focused by interaction.collectIsFocusedAsState()
        // The pointer's text change eases; a change of the choice snaps.
        val pointed by animateColorAsState(
            (if (hovered) colors.textPrimary else colors.textSecondary).color,
            motion.easing.standard.tween(motion.duration.control),
            label = "text",
        )
        val text = when {
            disabled -> colors.textDisabled.color
            checked -> colors.textPrimary.color
            else -> pointed
        }
        // The chip sits half a `space-2` inside the segment on every side.
        val inset = theme.defaultDensity.spacing.s2 / 2
        val chip = theme.rounded(theme.radius.sm)

        Box(
            Modifier
                // Before the clearing semantics, which drop what the modifiers
                // after them add: the selection gives the segment its role, its
                // selected state, its action and its disabled state.
                .selectable(
                    selected = checked,
                    interactionSource = interaction,
                    indication = null,
                    enabled = !disabled,
                    role = Role.RadioButton,
                    onClick = choose,
                )
                .clearAndSetSemantics { contentDescription = option.label }
                .pmFocusRing(focused && !disabled, theme.radius.sm.dp),
            contentAlignment = Alignment.Center,
        ) {
            if (checked) {
                Box(
                    Modifier
                        .matchParentSize()
                        .padding(inset)
                        .pmShadow(if (disabled) PMShadow(emptyList()) else theme.shadows.control, chip)
                        .background(colors.bgSurface.color, chip),
                )
            } else if (!disabled) {
                PMPressLayer(interaction, colors.bgSurface.color, Modifier.matchParentSize().padding(inset).clip(chip))
            }
            Row(
                Modifier.padding(horizontal = metrics.padding),
                horizontalArrangement = Arrangement.spacedBy(metrics.gap),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                option.icon?.let { PMIconView(it, size, tint = text) }
                Text(
                    text = option.label,
                    style = metrics.text.textStyle,
                    color = text,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

/** SegmentedControl's states, from the spec's States table. */
object SegmentedControlStates : PMStates {
    override val member = "SegmentedControl"

    private val scope = listOf(
        PMSegmentedControlOption(value = "open", label = "Open"),
        PMSegmentedControlOption(value = "pending", label = "Pending"),
        PMSegmentedControlOption(value = "closed", label = "Closed"),
    )

    private val appearance = listOf(
        PMSegmentedControlOption(value = "light", label = "Light", icon = PMIconRole.ModeLight),
        PMSegmentedControlOption(value = "dark", label = "Dark", icon = PMIconRole.ModeDark),
        PMSegmentedControlOption(value = "system", label = "System", icon = PMIconRole.ModeSystem),
    )

    private val closedLater = scope.map { if (it.value == "closed") it.copy(disabled = true) else it }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry(
                "three options — the first chosen, never empty",
                expect = mapOf("checked" to "open", "size" to "md", "label" to "Queue"),
            ) { PMSegmentedControl(label = "Queue", options = scope) },
            PMStateEntry("with icons", expect = mapOf("checked" to "dark", "label" to "Appearance")) {
                PMSegmentedControl(defaultValue = "dark", label = "Appearance", options = appearance)
            },
            PMStateEntry("disabled option", expect = mapOf("checked" to "open")) {
                PMSegmentedControl(label = "Queue", options = closedLater)
            },
            PMStateEntry("sm", expect = mapOf("size" to "sm", "checked" to "open")) {
                PMSegmentedControl(label = "Queue", options = scope, size = PMSegmentedControlSize.Sm)
            },
            PMStateEntry("controlled — the value follows the prop", expect = mapOf("checked" to "pending")) {
                PMSegmentedControl(label = "Queue", onChange = {}, options = scope, value = "pending")
            },
            PMStateEntry(
                "the whole group disabled — the chosen chip stays, without its shadow",
                expect = mapOf("disabled" to "true", "checked" to "pending"),
            ) { PMSegmentedControl(defaultValue = "pending", disabled = true, label = "Queue", options = scope) },
        )
}
