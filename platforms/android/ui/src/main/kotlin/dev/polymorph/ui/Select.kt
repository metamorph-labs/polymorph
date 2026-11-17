// Select (`design/components/select.md`): one value from a closed list. The
// trigger is Input's container with the value, or the muted placeholder, and
// the `expand` chevron. Choosing is the platform's: Material 3's exposed
// dropdown menu, anchored to the trigger on phones too, the platform map's
// reason, so the web's sheet below 30rem does not apply and `presentation`
// changes nothing. The menu is drawn inside the Material bridge, and its
// surface is the overlay recipe: `bg.overlay`, `radius.surface`, a
// `border.subtle` hairline and `inset.list` across, at no Material elevation.
// Material's menu is a popup sized to its content, which clips a shadow drawn
// outside it, so the menu has no `shadow-transient`: its hairline is its edge.
//
// The rows are the item recipe (`PMOptionRow`), `space.1` apart: the check
// column with the `confirm` glyph on the chosen row, the label in the size's
// step, a description as its second line, the accent wash under the pointer
// and the keyboard. The empty choice is the first row, labelled
// `emptyOption`; choosing it reports null, and the trigger then shows its
// label as a value, never as a placeholder. A disabled option is listed and
// cannot be chosen; a group is its label, in the label recipe, over its rows.
// `defaultOpen` opens
// the menu when the Select first draws. The trigger takes keyboard focus, and
// Material's anchor opens the menu from the keyboard; while focused the
// trigger draws the focus ring. An invalid select reports its error as its
// accessibility error, as the web's `aria-invalid` is announced. `id`,
// `name`, `ariaRequired` and the `aria-describedby`/`aria-labelledby` ids have
// no Compose counterpart.

package dev.polymorph.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.focusable
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.intl.LocaleList
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.toUpperCase
import androidx.compose.ui.unit.dp

object PMSelect : PMSelectRendering {
    @OptIn(ExperimentalMaterial3Api::class)
    @Composable
    override fun Render(props: PMSelectProps) {
        val theme = PM.theme
        val field = LocalPMField.current
        val strings = PMSpecDefault.strings
        val size = props.size ?: PMControlSize.Md
        val metrics = PMControlMetrics(size, theme)
        val disabled = (props.disabled ?: false) || !LocalPMEnabled.current
        val invalid = (props.invalid ?: false) || (field?.invalid ?: false)
        val colors = theme.colors
        var own by remember { mutableStateOf(props.defaultValue?.value) }
        var open by remember { mutableStateOf(props.defaultOpen == true && !disabled) }
        // The controlled `value` when given (null inside it is the empty
        // choice), otherwise the select's own.
        val current = if (props.value != null) props.value.value else own
        val options = props.options.flatMap { entry ->
            when (entry) {
                is PMSelectOptionEntry.Option -> listOf(entry.value)
                is PMSelectOptionEntry.Group -> entry.value.options
            }
        }
        // What the trigger shows as a value: the chosen option's label, or the
        // empty choice's label when it is chosen; null while the placeholder shows.
        val shown = if (current != null) options.firstOrNull { it.value == current }?.label else props.emptyOption
        val name = props.ariaLabel ?: field?.label
        val choose: (String?) -> Unit = { next ->
            own = next
            open = false
            props.onChange?.invoke(next)
        }
        val report = LocalPMFieldReport.current
        SideEffect { report?.invoke(PMFieldControl(disabled = disabled)) }
        val interaction = remember { MutableInteractionSource() }
        val hovered by interaction.collectIsHoveredAsState()
        val focused by interaction.collectIsFocusedAsState()
        val attributes = buildMap {
            put("size", size.value)
            put("state", if (open) "open" else "closed")
            if (shown == null) put("placeholder", "true")
            if (invalid) put("invalid", "true")
            if (disabled) put("disabled", "true")
        }

        PMMaterialTheme {
            ExposedDropdownMenuBox(
                expanded = open,
                onExpandedChange = { if (!disabled) open = it },
            ) {
                Row(
                    modifier = Modifier
                        .pmMember("Select", attributes)
                        .menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable, enabled = !disabled)
                        // The anchor answers keys and requests focus for the
                        // node under it, which is this focus target.
                        .focusable(enabled = !disabled, interactionSource = interaction)
                        .hoverable(interaction, enabled = !disabled)
                        .clearAndSetSemantics {
                            (name ?: shown)?.let { contentDescription = it }
                            (shown ?: props.placeholder)?.let { stateDescription = it }
                            role = Role.DropdownList
                            if (invalid) error(field?.error ?: strings.invalid)
                            // The anchor's action, which a disabled anchor drops: a
                            // disabled select keeps it and says it is disabled, as a
                            // disabled clickable does.
                            onClick {
                                if (!disabled) open = !open
                                !disabled
                            }
                            if (disabled) disabled()
                        }
                        .fillMaxWidth()
                        .pmHitTarget()
                        .pmFieldBox(invalid = invalid, disabled = disabled, readOnly = false, focused = focused, hovered = hovered, held = open)
                        .heightIn(min = metrics.height)
                        .padding(horizontal = metrics.padding),
                    horizontalArrangement = Arrangement.spacedBy(metrics.gap),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = shown ?: props.placeholder.orEmpty(),
                        style = metrics.text.textStyle,
                        color = when {
                            disabled -> colors.textDisabled
                            shown == null -> colors.textMuted
                            else -> colors.textPrimary
                        }.color,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    PMIconView(PMIconRole.Expand, size, tint = (if (disabled) colors.textDisabled else colors.textMuted).color)
                }
                ExposedDropdownMenu(
                    expanded = open,
                    onDismissRequest = { open = false },
                    shape = theme.rounded(theme.radius.surface),
                    containerColor = colors.bgOverlay.color,
                    tonalElevation = 0.dp,
                    shadowElevation = 0.dp,
                    border = BorderStroke(PMGeometry.hairline, colors.borderSubtle.color),
                ) {
                    Column(
                        Modifier.padding(horizontal = theme.defaultDensity.inset.list.dp),
                        verticalArrangement = Arrangement.spacedBy(theme.defaultDensity.spacing.s1),
                    ) {
                        props.emptyOption?.let { empty ->
                            PMOptionRow(empty, null, PMOptionKind.Single, chosen = current == null, disabled = false, onClick = { choose(null) }, size = size)
                        }
                        for (entry in props.options) {
                            when (entry) {
                                is PMSelectOptionEntry.Option -> Option(entry.value, current, size, choose)
                                is PMSelectOptionEntry.Group -> {
                                    GroupLabel(entry.value.label)
                                    for (option in entry.value.options) Option(option, current, size, choose)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    @Composable
    private fun Option(option: PMSelectOption, current: String?, size: PMControlSize, choose: (String?) -> Unit) {
        PMOptionRow(
            label = option.label,
            description = option.description,
            kind = PMOptionKind.Single,
            chosen = option.value == current,
            disabled = option.disabled == true,
            onClick = { choose(option.value) },
            size = size,
        )
    }

    /** A group's label: Menu's label recipe, `text.xs` uppercase in the muted colour. */
    @Composable
    private fun GroupLabel(label: String) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        Text(
            text = label.toUpperCase(LocaleList.current),
            style = theme.text.xs.textStyle,
            color = theme.colors.textMuted.color,
            modifier = Modifier.padding(horizontal = space.s3, vertical = space.s2),
        )
    }
}

/**
 * Select's states, from the spec's States table. The open states draw the
 * menu, opened by `defaultOpen`; the closed ones the trigger, showing the
 * value chosen from the list each describes.
 */
object SelectStates : PMStates {
    override val member = "Select"

    private const val priority = "Priority"
    private const val choose = "Choose a priority"

    private fun option(value: String, label: String, description: String? = null, disabled: Boolean? = null) =
        PMSelectOptionEntry.Option(PMSelectOption(value = value, label = label, description = description, disabled = disabled))

    private val priorities = listOf(
        option("urgent", "Urgent"),
        option("high", "High"),
        option("normal", "Normal"),
        option("low", "Low"),
    )

    private val withDisabled = listOf(
        option("urgent", "Urgent"),
        option("high", "High"),
        option("archived", "Archived", disabled = true),
    )

    private val grouped = listOf(
        PMSelectOptionEntry.Group(
            PMSelectOptionGroup(
                label = "Queues",
                options = listOf(PMSelectOption("billing", "Billing"), PMSelectOption("onboarding", "Onboarding")),
            ),
        ),
        PMSelectOptionEntry.Group(
            PMSelectOptionGroup(
                label = "Archived",
                options = listOf(PMSelectOption("q3", "Q3 backlog"), PMSelectOption("legacy", "Legacy imports")),
            ),
        ),
    )

    private val described = listOf(
        option("urgent", "Urgent", description = "Answer within the hour"),
        option("high", "High", description = "Same business day"),
    )

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry(
                "closed rest",
                expect = mapOf("state" to "closed", "size" to "md", "placeholder" to "true", "label" to priority),
            ) { PMSelect(ariaLabel = priority, options = priorities, placeholder = choose) },
            PMStateEntry("with value", expect = mapOf("state" to "closed", "label" to priority, "value" to "High")) {
                PMSelect(ariaLabel = priority, defaultValue = PMSome("high"), options = priorities)
            },
        ) + listOf(PMControlSize.Sm, PMControlSize.Lg).map { size ->
            PMStateEntry("size ${size.value}", expect = mapOf("size" to size.value)) {
                PMSelect(ariaLabel = priority, defaultValue = PMSome("normal"), options = priorities, size = size)
            }
        } + listOf(
            PMStateEntry("open, a value chosen", expect = mapOf("state" to "open")) {
                PMFixtureRoom(priorities.size + 1) {
                    PMSelect(ariaLabel = priority, defaultOpen = true, defaultValue = PMSome("high"), options = priorities)
                }
            },
            PMStateEntry("empty choice, selected", expect = mapOf("value" to "All statuses")) {
                PMSelect(ariaLabel = "Status", defaultValue = PMSome(null), emptyOption = "All statuses", options = priorities)
            },
            PMStateEntry("a disabled option in the list", expect = mapOf("state" to "open", "value" to "High")) {
                PMFixtureRoom(withDisabled.size + 1) {
                    PMSelect(ariaLabel = priority, defaultOpen = true, defaultValue = PMSome("high"), options = withDisabled)
                }
            },
            PMStateEntry("grouped, a value from a group", expect = mapOf("state" to "open", "value" to "Billing")) {
                PMFixtureRoom(grouped.size * 3 + 1) {
                    PMSelect(ariaLabel = "Queue", defaultOpen = true, defaultValue = PMSome("billing"), options = grouped)
                }
            },
            PMStateEntry("descriptions, a value chosen", expect = mapOf("state" to "open", "value" to "Urgent")) {
                PMFixtureRoom(described.size * 2 + 1) {
                    PMSelect(ariaLabel = priority, defaultOpen = true, defaultValue = PMSome("urgent"), options = described)
                }
            },
            PMStateEntry("invalid", expect = mapOf("invalid" to "true")) {
                PMSelect(ariaLabel = priority, invalid = true, options = priorities, placeholder = choose)
            },
            PMStateEntry("disabled", expect = mapOf("disabled" to "true")) {
                PMSelect(ariaLabel = priority, defaultValue = PMSome("normal"), disabled = true, options = priorities)
            },
        )
}
