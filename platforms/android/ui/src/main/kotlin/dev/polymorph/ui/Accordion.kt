// Accordion (`design/components/accordion.md`): a list of sections a reader
// opens one or several at a time. One treatment, ruled: a `border.subtle`
// hairline under every item and over the first, a full-width trigger of the
// label in `text.md` and the `down` chevron at its end, and the region it
// opens. The trigger and the region are the disclosure grammar Collapsible
// shares (`PMDisclosureTrigger`, `PMDisclosureRegion`), at Accordion's sizes:
// the large control height, `space-3` above and below the label, the `md`
// chevron. Hover is colour only, because a wash on one ruled row would read as
// a selection.
//
// Each trigger is a heading, as the web's `<h3>` is, so the sections are
// document structure and TalkBack moves between them by heading; Android's
// headings have no level, so `headingLevel` has no effect here. Its state is
// expanded or collapsed, as `aria-expanded` is announced. A disabled item's
// trigger is dimmed and cannot be pressed. The region's content gets the
// reading style, `text.sm` in `text.secondary`, `space-4` above the rule.
//
// `type: single` (the default) keeps one item open; with `collapsible` (true
// by default) the open item closes again on a second press. `multiple` opens
// any number. The value is a `PMChoiceValue`: `Single` with the open item's
// value, or `""` when none is open, as Radix reports it, and `Multiple` with
// the open values in the items' order. A value of the other case is read as
// its nearest: a single value as a list of one, a list's first value as the
// single one, as on iOS. `value` with `onValueChange` is the controlled pair.

package dev.polymorph.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

object PMAccordion : PMAccordionRendering {
    @Composable
    override fun Render(props: PMAccordionProps) {
        val theme = PM.theme
        val density = theme.defaultDensity
        val multiple = props.type == PMAccordionType.Multiple
        var own by remember { mutableStateOf(values(props.defaultValue)) }
        // The open values: the controlled `value` when given, otherwise the
        // accordion's own, each in the items' order.
        val given = props.value?.let(::values) ?: own
        val order = props.items.map { it.value }
        val open = order.filter { it in given }.let { if (multiple) it else it.take(1) }
        val toggle: (String) -> Unit = { value ->
            val next = when {
                multiple -> order.filter { if (it == value) it !in open else it in open }
                value in open -> if (props.collapsible ?: true) emptyList() else open
                else -> listOf(value)
            }
            if (next != open) {
                own = next
                props.onValueChange?.invoke(if (multiple) PMChoiceValue.Multiple(next) else PMChoiceValue.Single(next.firstOrNull() ?: ""))
            }
        }
        val recipe = PMDisclosureRecipe(
            minHeight = density.controlHeight.lg.dp,
            paddingY = density.spacing.s3,
            gap = density.spacing.s3,
            text = theme.text.md,
            rest = theme.colors.textPrimary,
            chevron = PMControlSize.Md,
            fills = true,
        )
        val attributes = buildMap {
            put("type", (props.type ?: PMAccordionType.Single).value)
            put("orientation", "vertical")
            put("open", open.size.toString())
            if (props.items.any { it.disabled == true }) put("disabled", "true")
        }

        Column(Modifier.pmMember("Accordion", attributes).fillMaxWidth()) {
            PMRule(theme.colors.borderSubtle)
            for (item in props.items) {
                val expanded = item.value in open
                PMDisclosureTrigger(
                    label = item.label,
                    open = expanded,
                    recipe = recipe,
                    onToggle = { toggle(item.value) },
                    disabled = item.disabled == true,
                    heading = true,
                )
                PMDisclosureRegion(expanded) {
                    Box(Modifier.fillMaxWidth().padding(bottom = density.spacing.s4)) {
                        CompositionLocalProvider(
                            LocalTextStyle provides theme.text.sm.textStyle,
                            LocalContentColor provides theme.colors.textSecondary.color,
                        ) { item.content() }
                    }
                }
                PMRule(theme.colors.borderSubtle)
            }
        }
    }

    /** The open values a `PMChoiceValue` names; `""` is none. */
    private fun values(value: PMChoiceValue?): List<String> = when (value) {
        is PMChoiceValue.Single -> if (value.value.isEmpty()) emptyList() else listOf(value.value)
        is PMChoiceValue.Multiple -> value.value
        null -> emptyList()
    }
}

/** Accordion's states, from the spec's States table. */
object AccordionStates : PMStates {
    override val member = "Accordion"

    private const val delivery = "Two to four working days, and you get a tracking link the moment it ships."
    private const val returns = "Thirty days, no reason needed. The label is in the box."
    private const val sizing = "True to size. The one exception is the wide fit, which runs half a size up."

    private val shipping = listOf(
        PMAccordionItem(
            value = "delivery",
            label = "When will my order arrive?",
            content = { Text(delivery) },
        ),
        PMAccordionItem(value = "returns", label = "How do returns work?", content = { Text(returns) }),
        PMAccordionItem(
            value = "sizing",
            label = "Do these run large or small?",
            content = { Text(sizing) },
        ),
    )

    private const val policy = "Refunds go back to the card you paid with. Most banks show them within five working days, " +
        "some take ten. A refund for a gift goes to the person who bought it, never to the address it was sent to, and a " +
        "partial return refunds the items you send back with their share of any discount."

    override val entries: List<PMStateEntry>
        get() {
            val disabled = shipping.map { it.copy(disabled = it.value == "returns") }
            val long = listOf(PMAccordionItem(value = "refunds", label = "How are refunds paid?", content = { Text(policy) })) + shipping.drop(1)
            return listOf(
                PMStateEntry("single, first open", expect = mapOf("type" to "single", "open" to "1")) {
                    PMAccordion(defaultValue = PMChoiceValue.Single("delivery"), items = shipping)
                },
                PMStateEntry("single, all closed", expect = mapOf("type" to "single", "open" to "0")) {
                    PMAccordion(collapsible = true, items = shipping)
                },
                PMStateEntry("multiple, two open", expect = mapOf("type" to "multiple", "open" to "2")) {
                    PMAccordion(defaultValue = PMChoiceValue.Multiple(listOf("delivery", "sizing")), items = shipping, type = PMAccordionType.Multiple)
                },
                PMStateEntry("disabled item", expect = mapOf("disabled" to "true", "open" to "1")) {
                    PMAccordion(defaultValue = PMChoiceValue.Single("delivery"), items = disabled)
                },
                PMStateEntry("long content", expect = mapOf("open" to "1")) {
                    PMAccordion(defaultValue = PMChoiceValue.Single("refunds"), items = long)
                },
            )
        }
}
