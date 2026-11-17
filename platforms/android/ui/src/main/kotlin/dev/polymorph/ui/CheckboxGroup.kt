// CheckboxGroup (`design/components/checkbox-group.md`): several independent
// choices, all visible. Each option is a `PMCheckbox`, its box, states, motion
// and semantics unchanged: a checkbox named by the option's label, its own
// focus stop, toggled by Enter or Space, and the arrow keys only move focus.
// An option's description sits under its label in `text.xs` `text.muted`
// (`text.disabled` on a disabled option), `space-1` below the drawn row and
// indented past the box, so it starts where the label starts. The row's hit
// area reaches below the drawn row, and the description rises into that
// margin, so it reads as the label's second line. It is a node of its own,
// read after its box, because Android has no hint for a control. The options
// stack `space-3` apart, or sit in a row `space-5` apart when `orientation` is
// horizontal.
//
// The value is the checked options' values in the options' order, never the
// order they were ticked, and none is an answer. `value` with `onChange` is
// the controlled pair; without it the group keeps its own, from
// `defaultValue`.
//
// The group is named by `ariaLabel` or its FormField's label, the question the
// options answer, and FormField draws that label above it: the group reports
// itself to the field as a control that is not row-labelled, and each box is
// kept from reporting itself or reading the field, so no box takes the
// question as its label or the field's required marker. An invalid group
// draws every box's border in `danger.border`, and each box says "Invalid";
// the group root carries the field's message, or "Invalid", as its error,
// once for the question. `name`, `id` and the `aria-*by` ids have no Compose
// counterpart.

package dev.polymorph.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlin.math.max

object PMCheckboxGroup : PMCheckboxGroupRendering {
    @Composable
    override fun Render(props: PMCheckboxGroupProps) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val field = LocalPMField.current
        val strings = PMSpecDefault.strings
        val values = props.options.map { it.value }
        var own by remember { mutableStateOf(props.defaultValue ?: emptyList()) }
        val current = PMChoices.ordered(values, props.value ?: own)
        val disabled = (props.disabled ?: false) || !LocalPMEnabled.current
        val invalid = (props.invalid ?: false) || (field?.invalid ?: false)
        val required = (props.ariaRequired ?: false) || (field?.required ?: false)
        val orientation = props.orientation ?: PMCheckboxGroupOrientation.Vertical
        val report = LocalPMFieldReport.current
        SideEffect { report?.invoke(PMFieldControl(disabled = disabled)) }
        val attributes = buildMap {
            put("orientation", orientation.value)
            put("checked", current.size.toString())
            if (disabled) put("disabled", "true")
            if (invalid) put("invalid", "true")
            if (required) put("required", "true")
        }
        // The description starts where the label does: past the box and the row's gap.
        val indent = theme.icon.md.size.dp + space.s3
        // The hit area's margin below a box's drawn row, which the description rises into.
        val density = theme.defaultDensity
        val rise = centringInset(density.hitTarget, density.controlHeight.sm)

        PMChoiceStack(
            horizontal = orientation == PMCheckboxGroupOrientation.Horizontal,
            modifier = Modifier
                .pmMember("CheckboxGroup", attributes)
                .pmChoiceGroup(
                    name = props.ariaLabel ?: field?.label,
                    error = if (invalid) field?.error ?: strings.invalid else null,
                    single = false,
                ),
        ) {
            for (option in props.options) {
                key(option.value) {
                    val off = disabled || option.disabled == true
                    Option(rise = rise, gap = space.s1) {
                        // Each box is its own control, outside the group's field.
                        CompositionLocalProvider(LocalPMField provides null, LocalPMFieldReport provides null) {
                            PMCheckbox(
                                checked = if (option.value in current) PMCheckedState.Checked else PMCheckedState.Unchecked,
                                disabled = off,
                                invalid = invalid,
                                label = option.label,
                                onCheckedChange = { next ->
                                    val updated = PMChoices.toggled(values, current, option.value, next == PMCheckedState.Checked)
                                    own = updated
                                    props.onChange?.invoke(updated)
                                },
                            )
                        }
                        option.description?.let { PMChoiceDescription(it, off, Modifier.padding(start = indent)) }
                    }
                }
            }
        }
    }

    /**
     * One option: its box's row, then its description `gap` below the drawn
     * row. The row's hit area reaches `rise` below the drawn row, and the
     * description sits in that margin rather than below it.
     */
    @Composable
    private fun Option(rise: Dp, gap: Dp, content: @Composable () -> Unit) {
        Layout(content) { measurables, constraints ->
            // As tall as each part wants: the height offered is the option's own.
            val placeables = measurables.map { it.measure(Constraints(maxWidth = constraints.maxWidth)) }
            val row = placeables.first()
            val below = placeables.drop(1).firstOrNull()
            val top = max(0, row.height - rise.roundToPx()) + gap.roundToPx()
            val height = if (below == null) row.height else max(row.height, top + below.height)
            layout(placeables.maxOf { it.width }, height) {
                row.placeRelative(0, 0)
                below?.placeRelative(0, top)
            }
        }
    }
}

/** CheckboxGroup's states, from the spec's States table. */
object CheckboxGroupStates : PMStates {
    override val member = "CheckboxGroup"

    private const val notify = "Notify the reporter about"

    private val changes = listOf(
        PMCheckboxGroupOption(value = "replies", label = "Replies"),
        PMCheckboxGroupOption(value = "status", label = "Status changes"),
        PMCheckboxGroupOption(value = "assignments", label = "Assignments"),
    )

    private val described = listOf(
        PMCheckboxGroupOption(value = "replies", label = "Replies", description = "Every public reply on the ticket."),
        PMCheckboxGroupOption(value = "status", label = "Status changes", description = "Open, pending and solved."),
        PMCheckboxGroupOption(
            value = "assignments",
            label = "Assignments",
            description = "When the ticket moves to another agent.",
        ),
    )

    private val assignmentsLater = listOf(
        PMCheckboxGroupOption(value = "replies", label = "Replies"),
        PMCheckboxGroupOption(value = "status", label = "Status changes"),
        PMCheckboxGroupOption(value = "assignments", label = "Assignments", disabled = true),
    )

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry(
                "none checked — an empty answer is an answer",
                expect = mapOf("orientation" to "vertical", "checked" to "0", "label" to notify, "contains" to "Checkbox"),
            ) { PMCheckboxGroup(ariaLabel = notify, options = changes) },
            PMStateEntry("two checked, in the options' order", expect = mapOf("checked" to "2", "label" to notify)) {
                PMCheckboxGroup(ariaLabel = notify, defaultValue = listOf("status", "replies"), options = changes)
            },
            PMStateEntry("descriptions — the two-line item register", expect = mapOf("checked" to "1")) {
                PMCheckboxGroup(ariaLabel = notify, defaultValue = listOf("replies"), options = described)
            },
            PMStateEntry(
                "horizontal — three short labels at most",
                expect = mapOf("orientation" to "horizontal", "checked" to "1"),
            ) {
                PMCheckboxGroup(
                    ariaLabel = "Notify by",
                    defaultValue = listOf("email"),
                    options = listOf(
                        PMCheckboxGroupOption("email", "Email"),
                        PMCheckboxGroupOption("chat", "Chat"),
                        PMCheckboxGroupOption("sms", "SMS"),
                    ),
                    orientation = PMCheckboxGroupOrientation.Horizontal,
                )
            },
            PMStateEntry("invalid", expect = mapOf("invalid" to "true", "label" to notify)) {
                PMCheckboxGroup(ariaLabel = notify, invalid = true, options = changes)
            },
            PMStateEntry("the whole group disabled", expect = mapOf("disabled" to "true", "checked" to "1")) {
                PMCheckboxGroup(ariaLabel = notify, defaultValue = listOf("status"), disabled = true, options = described)
            },
            PMStateEntry("one option disabled", expect = mapOf("checked" to "1")) {
                PMCheckboxGroup(ariaLabel = notify, defaultValue = listOf("replies"), options = assignmentsLater)
            },
            PMStateEntry("required — its FormField's label row carries the marker", expect = mapOf("required" to "true")) {
                PMCheckboxGroup(ariaLabel = notify, ariaRequired = true, options = changes)
            },
            PMStateEntry("controlled — the value follows the prop", expect = mapOf("checked" to "3")) {
                PMCheckboxGroup(
                    ariaLabel = notify,
                    onChange = {},
                    options = changes,
                    value = listOf("assignments", "replies", "status", "archived"),
                )
            },
        )
}
