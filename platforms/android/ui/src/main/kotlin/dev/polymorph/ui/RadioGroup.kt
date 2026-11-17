// RadioGroup (`design/components/radio.md`): one value from a few options, all
// visible. Checkbox's pattern wherever it can be: each option is a row of the
// control aligned to its label's first line, the label in `text.sm`, the row
// centred in the small control height, and the whole row the hit area. The
// control is a circle, an `md` icon square and a pill in every geometry,
// because a radio is round. Checked, it is a ring in `accent.bg` around a dot
// half its size, not a filled disc, so it never reads as a checked Checkbox;
// both turn `accent.bg-hover` under the pointer or a press.
// Unchecked it is Checkbox's box: `bg.surface` in a `border.field` hairline,
// `bg.subtle` and `border.strong` under the pointer or a press. Invalid draws
// the ring in `danger.border` at rest, as the recipe's cascade does. Disabled
// it is `bg.subtle` in `border.subtle`, and a disabled ring and dot are
// `border.subtle`. The dot pops in on the `snappy` spring from half its size
// and fades out (`PMPopIn`). A press is a ripple in a circle the size of the
// hit target, behind the control, in the hover wash; keyboard focus draws the
// focus ring around the circle.
//
// The options stack `space-3` apart, or sit in a row `space-5` apart when
// `orientation` is horizontal. A group has a choice or none yet, and cannot be
// cleared: choosing the chosen option does nothing. `value` with `onChange` is
// the controlled pair; without it the group keeps its own value, from
// `defaultValue`.
//
// The semantics are Android's radio group: the root is a selectable group,
// named by `ariaLabel` or its FormField's label (the question), and carrying
// the field's message, or "Invalid", as its error while invalid; each option
// is a radio button named by its label, selected while chosen, and disabled
// when it or the group is. The arrow keys move focus between the options and
// Enter or Space chooses one, as Android's own radio buttons do; the web's
// arrows also choose, which Android's do not. A required group draws no
// marker of its own: its FormField's label row carries it. `name`, `id` and
// the `aria-*by` ids have no Compose counterpart.

package dev.polymorph.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
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
import androidx.compose.ui.unit.dp
import dev.polymorph.tokens.PMDynamicColor

object PMRadioGroup : PMRadioGroupRendering {
    @Composable
    override fun Render(props: PMRadioGroupProps) {
        val field = LocalPMField.current
        val strings = PMSpecDefault.strings
        var own by remember { mutableStateOf(props.defaultValue) }
        val current = props.value ?: own
        val disabled = (props.disabled ?: false) || !LocalPMEnabled.current
        val invalid = (props.invalid ?: false) || (field?.invalid ?: false)
        val required = (props.ariaRequired ?: false) || (field?.required ?: false)
        val orientation = props.orientation ?: PMRadioGroupOrientation.Vertical
        val report = LocalPMFieldReport.current
        SideEffect { report?.invoke(PMFieldControl(disabled = disabled)) }
        val attributes = buildMap {
            put("orientation", orientation.value)
            current?.let { put("checked", it) }
            if (disabled) put("disabled", "true")
            if (invalid) put("invalid", "true")
            if (required) put("required", "true")
        }

        PMChoiceStack(
            horizontal = orientation == PMRadioGroupOrientation.Horizontal,
            modifier = Modifier
                .pmMember("RadioGroup", attributes)
                .pmChoiceGroup(
                    name = props.ariaLabel ?: field?.label,
                    error = if (invalid) field?.error ?: strings.invalid else null,
                    single = true,
                ),
        ) {
            for (option in props.options) {
                key(option.value) {
                    Option(
                        label = option.label,
                        checked = option.value == current,
                        disabled = disabled || option.disabled == true,
                        invalid = invalid,
                    ) {
                        if (option.value != current) {
                            own = option.value
                            props.onChange?.invoke(option.value)
                        }
                    }
                }
            }
        }
    }

    /** One option: the circle on the label's first line, and the label. */
    @Composable
    private fun Option(label: String, checked: Boolean, disabled: Boolean, invalid: Boolean, choose: () -> Unit) {
        val theme = PM.theme
        val colors = theme.colors
        val density = theme.defaultDensity
        val motion = theme.defaultMotion
        val interaction = remember { MutableInteractionSource() }
        val hovered by interaction.collectIsHoveredAsState()
        val pressed by interaction.collectIsPressedAsState()
        val focused by interaction.collectIsFocusedAsState()
        val active = (hovered || pressed) && !disabled
        val spec = motion.easing.standard.tween<Color>(motion.duration.control)
        val fill by animateColorAsState(fill(checked, active, disabled).color, spec, label = "fill")
        val border by animateColorAsState(border(checked, active, disabled, invalid).color, spec, label = "border")
        val dot by animateColorAsState(dot(active, disabled).color, spec, label = "dot")
        val circle = theme.icon.md.size.dp
        val pill = theme.rounded(theme.radius.pill)
        // The circle centred on the label's first line, and the row centred in
        // the small control height.
        val line = theme.text.sm.lineBox
        val circleInset = centringInset(line, theme.icon.md.size)
        val rowInset = centringInset(density.controlHeight.sm, line)

        Row(
            modifier = Modifier
                // Before the clearing semantics, which drop what the modifiers
                // after them add: the selection gives the row its role, its
                // selected state, its action and its disabled state.
                .selectable(
                    selected = checked,
                    interactionSource = interaction,
                    indication = null,
                    enabled = !disabled,
                    role = Role.RadioButton,
                    onClick = choose,
                )
                .clearAndSetSemantics { contentDescription = label }
                .pmHitTarget()
                .padding(vertical = rowInset),
            horizontalArrangement = Arrangement.spacedBy(density.spacing.s3),
            verticalAlignment = Alignment.Top,
        ) {
            Box(Modifier.padding(top = circleInset).size(circle), contentAlignment = Alignment.Center) {
                if (!disabled) {
                    PMPressLayer(
                        interaction,
                        (if (checked) colors.accentSubtle else colors.bgSubtle).color,
                        Modifier.requiredSize(density.hitTarget.dp).clip(pill),
                    )
                }
                Box(
                    Modifier
                        .size(circle)
                        .pmFocusRing(focused && !disabled, theme.radius.pill.dp)
                        .clip(pill)
                        .background(fill)
                        .border(PMGeometry.hairline, border, pill),
                    contentAlignment = Alignment.Center,
                ) {
                    PMPopIn(checked) { Box(Modifier.size(circle / 2).background(dot, pill)) }
                }
            }
            PMRowLabel(label, required = false, color = (if (disabled) colors.textDisabled else colors.textPrimary).color)
        }
    }

    @Composable
    private fun fill(checked: Boolean, active: Boolean, disabled: Boolean): PMDynamicColor {
        val colors = PM.theme.colors
        if (disabled) return colors.bgSubtle
        return if (active && !checked) colors.bgSubtle else colors.bgSurface
    }

    /**
     * The ring by the recipe's cascade: disabled first; then the pointer or a
     * press, `accent.bg-hover` on the chosen option and `border.strong` on
     * another; then invalid; then the chosen option's `accent.bg`.
     */
    @Composable
    private fun border(checked: Boolean, active: Boolean, disabled: Boolean, invalid: Boolean): PMDynamicColor {
        val colors = PM.theme.colors
        return when {
            disabled -> colors.borderSubtle
            active -> if (checked) colors.accentBgHover else colors.borderStrong
            invalid -> colors.dangerBorder
            checked -> colors.accentBg
            else -> colors.borderField
        }
    }

    @Composable
    private fun dot(active: Boolean, disabled: Boolean): PMDynamicColor {
        val colors = PM.theme.colors
        return when {
            disabled -> colors.borderSubtle
            active -> colors.accentBgHover
            else -> colors.accentBg
        }
    }
}

/** RadioGroup's states, from the spec's States table. */
object RadioGroupStates : PMStates {
    override val member = "RadioGroup"

    private const val plan = "Plan"

    private val plans = listOf(
        PMRadioOption(value = "starter", label = "Starter"),
        PMRadioOption(value = "team", label = "Team"),
        PMRadioOption(value = "enterprise", label = "Enterprise"),
    )

    private val enterpriseLater = listOf(
        PMRadioOption(value = "starter", label = "Starter"),
        PMRadioOption(value = "team", label = "Team"),
        PMRadioOption(value = "enterprise", label = "Enterprise (contact sales)", disabled = true),
    )

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("nothing chosen yet", expect = mapOf("orientation" to "vertical", "label" to plan)) {
                PMRadioGroup(ariaLabel = plan, options = plans)
            },
            PMStateEntry("one chosen", expect = mapOf("checked" to "team", "label" to plan)) {
                PMRadioGroup(ariaLabel = plan, defaultValue = "team", options = plans)
            },
            PMStateEntry(
                "horizontal — three short labels at most",
                expect = mapOf("orientation" to "horizontal", "checked" to "yes", "label" to "Notify"),
            ) {
                PMRadioGroup(
                    ariaLabel = "Notify",
                    defaultValue = "yes",
                    options = listOf(PMRadioOption("yes", "Yes"), PMRadioOption("no", "No")),
                    orientation = PMRadioGroupOrientation.Horizontal,
                )
            },
            PMStateEntry("invalid", expect = mapOf("invalid" to "true", "label" to plan)) {
                PMRadioGroup(ariaLabel = plan, invalid = true, options = plans)
            },
            PMStateEntry("invalid, one chosen", expect = mapOf("invalid" to "true", "checked" to "starter")) {
                PMRadioGroup(ariaLabel = plan, defaultValue = "starter", invalid = true, options = plans)
            },
            PMStateEntry("the whole group disabled", expect = mapOf("disabled" to "true", "checked" to "team")) {
                PMRadioGroup(ariaLabel = plan, defaultValue = "team", disabled = true, options = plans)
            },
            PMStateEntry("one option disabled — the plan you cannot pick yet", expect = mapOf("checked" to "starter")) {
                PMRadioGroup(ariaLabel = plan, defaultValue = "starter", options = enterpriseLater)
            },
            PMStateEntry("required — its FormField's label row carries the marker", expect = mapOf("required" to "true")) {
                PMRadioGroup(ariaLabel = "Which plan?", ariaRequired = true, defaultValue = "team", options = plans)
            },
            PMStateEntry("controlled — the value follows the prop", expect = mapOf("checked" to "enterprise")) {
                PMRadioGroup(ariaLabel = plan, onChange = {}, options = plans, value = "enterprise")
            },
        )
}
