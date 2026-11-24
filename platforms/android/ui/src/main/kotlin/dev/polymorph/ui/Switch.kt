// Switch (`design/components/switch.md`): an on/off setting that takes effect
// at once. The recipe's pill track and thumb, sized from the icon and space
// tokens and pill-shaped in every geometry, because the shape identifies the
// control, toggled as Android toggles a switch: the semantics are a switch's
// (its role, its toggle action and its state, and disabled when it is), a
// press is a ripple in a circle the size of the hit target, behind the thumb,
// in the recipe's hover wash, and keyboard focus draws the focus ring around
// the track. The thumb's position is the state and the
// colour the second signal; it moves on the `snappy` spring.
//
// The label leads and the track sits at the row's trailing end, the
// platform's arrangement for a switch in a settings list; an unlabelled switch
// is the track alone, for a row that labels it (SettingsRow). Inside a
// FormField the field's label is the row label, with the required marker after
// it. `id`, `name`, `value` and the `aria-describedby`/`aria-labelledby` ids
// have no Compose counterpart.

package dev.polymorph.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.toggleable
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.polymorph.tokens.PMDynamicColor
import dev.polymorph.tokens.PMShadow

object PMSwitch : PMSwitchRendering {
    @Composable
    override fun Render(props: PMSwitchProps) {
        val theme = PM.theme
        val field = LocalPMField.current
        var own by remember { mutableStateOf(props.defaultChecked ?: false) }
        val on = props.checked ?: own
        val disabled = (props.disabled ?: false) || !LocalPMEnabled.current
        val required = (props.ariaRequired ?: false) || (field?.required ?: false)
        val label = props.label ?: field?.takeUnless { it.nameOnly }?.label
        val report = LocalPMFieldReport.current
        SideEffect { report?.invoke(PMFieldControl(rowLabelled = true, disabled = disabled)) }

        val interaction = remember { MutableInteractionSource() }
        val hovered by interaction.collectIsHoveredAsState()
        val pressed by interaction.collectIsPressedAsState()
        val focused by interaction.collectIsFocusedAsState()
        val active = (hovered || pressed) && !disabled
        val colors = theme.colors
        val density = theme.defaultDensity
        val space = density.spacing
        val motion = theme.defaultMotion
        val spec = motion.easing.standard.tween<Color>(motion.duration.control)
        // The track: one thumb plus a space-2 inset around it, twice as long.
        val thumb = theme.icon.md.size.dp
        val inset = space.s2 / 2
        val height = thumb + space.s2
        val width = thumb * 2 + space.s2
        val travel by animateDpAsState(if (on) width - thumb - inset * 2 else 0.dp, motion.spring.snappy.spec(), label = "thumb")
        val trackFill by animateColorAsState(trackFill(on, active, disabled).color, spec, label = "track")
        val trackBorder by animateColorAsState(trackBorder(on, active, disabled).color, spec, label = "border")
        val line = theme.text.sm.lineBox
        val rowInset = centringInset(density.controlHeight.sm, line)
        val trackInset: Dp = if (label != null) centringInset(line, height.value) else 0.dp
        val pill = theme.rounded(theme.radius.pill)
        val attributes = buildMap {
            put("state", if (on) "on" else "off")
            if (disabled) put("disabled", "true")
            if (required) put("required", "true")
        }

        Row(
            modifier = Modifier
                .pmMember("Switch", attributes)
                // Before the clearing semantics, which drop what the modifiers
                // after them add: the toggle gives the row its role, state,
                // action and disabled state.
                .toggleable(
                    value = on,
                    interactionSource = interaction,
                    indication = null,
                    enabled = !disabled,
                    role = Role.Switch,
                ) { next ->
                    own = next
                    props.onCheckedChange?.invoke(next)
                }
                .clearAndSetSemantics { (props.ariaLabel ?: label ?: field?.label)?.let { contentDescription = it } }
                .pmHitTarget()
                .padding(vertical = rowInset),
            horizontalArrangement = Arrangement.spacedBy(space.s3),
            verticalAlignment = Alignment.Top,
        ) {
            label?.let {
                PMRowLabel(
                    it,
                    required,
                    (if (disabled) colors.textDisabled else colors.textPrimary).color,
                    Modifier.weight(1f),
                )
            }
            Box(
                Modifier
                    .padding(top = trackInset)
                    .size(width, height)
                    .pmFocusRing(focused && !disabled, theme.radius.pill.dp, around = true)
                    .background(trackFill, pill)
                    .border(PMGeometry.hairline, trackBorder, pill),
                contentAlignment = Alignment.CenterStart,
            ) {
                Box(Modifier.offset(x = inset + travel).size(thumb), contentAlignment = Alignment.Center) {
                    if (!disabled) {
                        PMPressLayer(
                            interaction,
                            (if (on) colors.accentSubtle else colors.bgSubtle).color,
                            Modifier.requiredSize(density.hitTarget.dp).clip(pill),
                        )
                    }
                    val border = thumbBorder(on, disabled)
                    Box(
                        Modifier
                            .size(thumb)
                            .pmShadow(if (disabled) PMShadow(emptyList()) else theme.shadows.raised, pill)
                            .background(thumbFill(on, disabled).color, pill)
                            .border(PMGeometry.hairline, border?.color ?: Color.Transparent, pill),
                    )
                }
            }
        }
    }

    @Composable
    private fun trackFill(on: Boolean, active: Boolean, disabled: Boolean): PMDynamicColor {
        val colors = PM.theme.colors
        if (disabled) return if (on) colors.borderSubtle else colors.bgSubtle
        if (on) return if (active) colors.accentBgHover else colors.accentBg
        return if (active) colors.bgSurface else colors.bgSubtle
    }

    @Composable
    private fun trackBorder(on: Boolean, active: Boolean, disabled: Boolean): PMDynamicColor {
        val colors = PM.theme.colors
        if (disabled) return colors.borderSubtle
        if (on) return if (active) colors.accentBgHover else colors.accentBg
        return colors.borderStrong
    }

    @Composable
    private fun thumbFill(on: Boolean, disabled: Boolean): PMDynamicColor {
        val colors = PM.theme.colors
        if (disabled) return if (on) colors.bgSurface else colors.bgSubtle
        return if (on) colors.accentContrast else colors.bgSurface
    }

    @Composable
    private fun thumbBorder(on: Boolean, disabled: Boolean): PMDynamicColor? {
        val colors = PM.theme.colors
        if (disabled) return colors.borderSubtle
        return if (on) null else colors.borderDefault
    }
}

/** Switch's states, from the spec's States table. */
object SwitchStates : PMStates {
    override val member = "Switch"

    private const val notifications = "Desktop notifications"
    private const val terms = "Accept the terms"

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("off", expect = mapOf("state" to "off", "label" to notifications)) {
                PMSwitch(label = notifications)
            },
            PMStateEntry("on", expect = mapOf("state" to "on", "label" to notifications)) {
                PMSwitch(defaultChecked = true, label = notifications)
            },
            PMStateEntry(
                "required — the marker the field row cannot render for it",
                expect = mapOf("required" to "true", "label" to terms),
            ) { PMSwitch(ariaRequired = true, label = terms) },
            PMStateEntry("disabled off", expect = mapOf("state" to "off", "disabled" to "true")) {
                PMSwitch(disabled = true, label = notifications)
            },
            PMStateEntry("disabled on", expect = mapOf("state" to "on", "disabled" to "true")) {
                PMSwitch(defaultChecked = true, disabled = true, label = notifications)
            },
            PMStateEntry(
                "unlabelled — labelled by its context",
                expect = mapOf("state" to "off", "label" to notifications),
            ) { PMSwitch(ariaLabel = notifications) },
        )
}
