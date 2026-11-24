// Checkbox (`design/components/checkbox.md`): a boolean, or indeterminate,
// choice. The recipe's box with the `confirm` or `indeterminate` glyph, aligned
// to the label's first line, and the whole row as the hit area, toggled as
// Android toggles a checkbox: a press is a ripple in a circle the size of the
// hit target, behind the box, in the recipe's hover wash, and the semantics are
// a checkbox's: its role, its toggle action and its state, the indeterminate
// state Android's "partially checked", and disabled when it is. Keyboard focus
// draws the focus ring around the box. Choosing a mixed box checks it;
// tri-state cycling is not offered.
//
// Inside a FormField the field's label is the row label, with the required
// marker drawn after it (` *` in danger text, not spoken), and the field's
// error is the box's accessibility error; the row reports itself so the field
// draws no label row of its own.
//
// `checked` with `onCheckedChange` is the controlled form, as on the web: the
// box shows `checked` whatever is chosen and reports the choice; without it,
// the box keeps its own state, starting from `defaultChecked`. `id`, `name` and
// `value` are form passthroughs with no Compose counterpart, as are the
// `aria-describedby`/`aria-labelledby` ids.

package dev.polymorph.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
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
import androidx.compose.foundation.selection.triStateToggleable
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
import androidx.compose.ui.semantics.error
import androidx.compose.ui.state.ToggleableState
import androidx.compose.ui.unit.dp
import dev.polymorph.tokens.PMDynamicColor

object PMCheckbox : PMCheckboxRendering {
    @Composable
    override fun Render(props: PMCheckboxProps) {
        val theme = PM.theme
        val field = LocalPMField.current
        val strings = PMSpecDefault.strings
        var own by remember { mutableStateOf(props.defaultChecked ?: PMCheckedState.Unchecked) }
        val shown = props.checked ?: own
        val disabled = (props.disabled ?: false) || !LocalPMEnabled.current
        val invalid = (props.invalid ?: false) || (field?.invalid ?: false)
        val required = (props.ariaRequired ?: false) || (field?.required ?: false)
        val label = props.label ?: field?.takeUnless { it.nameOnly }?.label
        val name = props.ariaLabel ?: label ?: field?.label
        val report = LocalPMFieldReport.current
        SideEffect { report?.invoke(PMFieldControl(rowLabelled = true, disabled = disabled)) }

        val interaction = remember { MutableInteractionSource() }
        val hovered by interaction.collectIsHoveredAsState()
        val pressed by interaction.collectIsPressedAsState()
        val focused by interaction.collectIsFocusedAsState()
        val active = (hovered || pressed) && !disabled
        val marked = shown != PMCheckedState.Unchecked
        val colors = theme.colors
        val density = theme.defaultDensity
        val motion = theme.defaultMotion
        val spec = motion.easing.standard.tween<Color>(motion.duration.control)
        val fill by animateColorAsState(fill(marked, active, disabled, invalid).color, spec, label = "fill")
        val border by animateColorAsState(border(marked, active, disabled, invalid).color, spec, label = "border")
        val box = theme.icon.md.size.dp
        val shape = theme.rounded(theme.radius.detail)
        // The box centred on the label's first line, and the row centred in the
        // small control height.
        val line = theme.text.sm.lineBox
        val boxInset = centringInset(line, theme.icon.md.size)
        val rowInset = centringInset(density.controlHeight.sm, line)
        val attributes = buildMap {
            put("state", stateName(shown))
            if (disabled) put("disabled", "true")
            if (invalid) put("invalid", "true")
            if (required) put("required", "true")
        }

        Row(
            modifier = Modifier
                .pmMember("Checkbox", attributes)
                // Before the clearing semantics, which drop what the modifiers
                // after them add: the toggle gives the row its role, state,
                // action and disabled state.
                .triStateToggleable(
                    state = when (shown) {
                        PMCheckedState.Unchecked -> ToggleableState.Off
                        PMCheckedState.Checked -> ToggleableState.On
                        PMCheckedState.Indeterminate -> ToggleableState.Indeterminate
                    },
                    interactionSource = interaction,
                    indication = null,
                    enabled = !disabled,
                    role = Role.Checkbox,
                ) {
                    val next = if (shown == PMCheckedState.Checked) PMCheckedState.Unchecked else PMCheckedState.Checked
                    own = next
                    props.onCheckedChange?.invoke(next)
                }
                .clearAndSetSemantics {
                    name?.let { contentDescription = it }
                    if (invalid) error(field?.error ?: strings.invalid)
                }
                .pmHitTarget()
                .padding(vertical = rowInset),
            horizontalArrangement = Arrangement.spacedBy(density.spacing.s3),
            verticalAlignment = Alignment.Top,
        ) {
            Box(Modifier.padding(top = boxInset).size(box), contentAlignment = Alignment.Center) {
                if (!disabled) {
                    PMPressLayer(
                        interaction,
                        (if (marked) colors.accentSubtle else colors.bgSubtle).color,
                        Modifier.requiredSize(density.hitTarget.dp).clip(theme.rounded(theme.radius.pill)),
                    )
                }
                Box(
                    Modifier
                        .size(box)
                        .pmFocusRing(focused && !disabled, theme.radius.detail.dp, around = true)
                        .clip(shape)
                        .background(fill)
                        .border(PMGeometry.hairline, border, shape),
                    contentAlignment = Alignment.Center,
                ) {
                    Indicator(shown, disabled)
                }
            }
            label?.let {
                PMRowLabel(it, required, (if (disabled) colors.textDisabled else colors.textPrimary).color)
            }
        }
    }

    /**
     * The `confirm` or `indeterminate` glyph, by the `checkbox.indicator`
     * binding: in, a spring pop from half size with a fade; out, a fade.
     */
    @Composable
    private fun Indicator(shown: PMCheckedState, disabled: Boolean) {
        val theme = PM.theme
        val motion = theme.defaultMotion
        AnimatedVisibility(
            visible = shown != PMCheckedState.Unchecked,
            enter = scaleIn(motion.spring.snappy.spec(), initialScale = INDICATOR_FROM) +
                fadeIn(motion.easing.enter.tween(motion.duration.control)),
            exit = fadeOut(motion.easing.exit.tween(motion.duration.controlExit)),
        ) {
            PMIconView(
                if (shown == PMCheckedState.Indeterminate) PMIconRole.Indeterminate else PMIconRole.Confirm,
                PMControlSize.Sm,
                tint = (if (disabled) theme.colors.textDisabled else theme.colors.accentContrast).color,
            )
        }
    }

    /** The scale the indicator pops from: half, the recipe's. */
    private const val INDICATOR_FROM = 0.5f

    @Composable
    private fun fill(marked: Boolean, active: Boolean, disabled: Boolean, invalid: Boolean): PMDynamicColor {
        val colors = PM.theme.colors
        if (disabled) return if (marked) colors.borderSubtle else colors.bgSubtle
        if (marked) return if (active && !invalid) colors.accentBgHover else colors.accentBg
        return if (active) colors.bgSubtle else colors.bgSurface
    }

    @Composable
    private fun border(marked: Boolean, active: Boolean, disabled: Boolean, invalid: Boolean): PMDynamicColor {
        val colors = PM.theme.colors
        if (disabled) return colors.borderSubtle
        if (invalid) return colors.dangerBorder
        if (marked) return if (active) colors.accentBgHover else colors.accentBg
        return if (active) colors.borderStrong else colors.borderField
    }

    /** The state as the web's `data-state` names it. */
    fun stateName(value: PMCheckedState): String = when (value) {
        PMCheckedState.Unchecked -> "unchecked"
        PMCheckedState.Checked -> "checked"
        PMCheckedState.Indeterminate -> "indeterminate"
    }
}

/** Checkbox's states, from the spec's States table. */
object CheckboxStates : PMStates {
    override val member = "Checkbox"

    private const val replies = "Email me about replies"
    private const val terms = "Accept the terms"
    private const val all = "Select all"

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("unchecked", expect = mapOf("state" to "unchecked", "label" to replies)) {
                PMCheckbox(label = replies)
            },
            PMStateEntry("checked", expect = mapOf("state" to "checked", "label" to replies)) {
                PMCheckbox(checked = PMCheckedState.Checked, label = replies)
            },
            PMStateEntry("indeterminate", expect = mapOf("state" to "indeterminate", "label" to all)) {
                PMCheckbox(checked = PMCheckedState.Indeterminate, label = all)
            },
            PMStateEntry("uncontrolled, checked by default", expect = mapOf("state" to "checked")) {
                PMCheckbox(defaultChecked = PMCheckedState.Checked, label = replies)
            },
            PMStateEntry("invalid", expect = mapOf("invalid" to "true", "label" to terms)) {
                PMCheckbox(invalid = true, label = terms)
            },
            PMStateEntry(
                "required — the marker the field row cannot render for it",
                expect = mapOf("required" to "true", "label" to terms),
            ) { PMCheckbox(ariaRequired = true, label = terms) },
            PMStateEntry("disabled", expect = mapOf("disabled" to "true", "state" to "unchecked")) {
                PMCheckbox(disabled = true, label = replies)
            },
            PMStateEntry("disabled checked", expect = mapOf("disabled" to "true", "state" to "checked")) {
                PMCheckbox(checked = PMCheckedState.Checked, disabled = true, label = replies)
            },
            PMStateEntry(
                "disabled indeterminate",
                expect = mapOf("disabled" to "true", "state" to "indeterminate"),
            ) { PMCheckbox(checked = PMCheckedState.Indeterminate, disabled = true, label = all) },
            PMStateEntry(
                "no label — a Table selection cell",
                expect = mapOf("state" to "unchecked", "label" to "Select row"),
            ) { PMCheckbox(ariaLabel = "Select row") },
            PMStateEntry("a label long enough to wrap, the box on its first line") {
                PMCheckbox(label = "A label long enough to wrap onto a second line, so the box stays on the first")
            },
        )
}
