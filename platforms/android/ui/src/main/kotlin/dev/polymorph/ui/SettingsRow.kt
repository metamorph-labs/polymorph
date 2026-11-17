// SettingsRow (`design/components/settings-row.md`): a label and a description
// beside one control, for settings screens. `PMSettingsRowGroup` is a section:
// its title is the overline heading (the section-heading recipe), and its rows
// share one Card-like surface, separated by rules that reach the surface's
// edges. No error surface: a setting applies at once and reports failure in a
// Toast; a screen that validates is a FormPage.
//
// A row is the label (`text.sm`, primary) over the description (`text.xs`,
// secondary, no wider than the recipe's measure), `space.1` apart, beside the
// control, `space.6` across, inside `space.4` and `space.6`. The control is
// centred on the row and never grows; the text column takes the room.
//
// The row labels its control, as the web sets `aria-labelledby` on it: it
// hands the control its label through `LocalPMField` with `nameOnly`, so a
// Switch, Checkbox, Select or Button is named by the row's label and draws none
// of it, and the drawn label is not read again. Android has no hint for a
// control, so the description is read as a node of its own after it, as
// FormField's is.
//
// Each row in a group draws the rule above it; the group lifts its rows by one
// rule's thickness under the surface's clip, so the first row's rule is hidden
// and the surface's own border is the outer edge. A row on its own draws none.

package dev.polymorph.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.layout
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.intl.LocaleList
import androidx.compose.ui.text.toUpperCase

/** Whether a SettingsRow draws the rule above it: inside a group, where rows are separated. */
private val LocalRuledRows = compositionLocalOf { false }

object PMSettingsRow : PMSettingsRowRendering {
    @Composable
    override fun Render(props: PMSettingsRowProps) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val ruled = LocalRuledRows.current
        val field = PMFieldContext(label = props.label, error = null, required = false, invalid = false, nameOnly = true)

        Column(
            Modifier
                .pmMember("SettingsRow", if (props.description == null) emptyMap() else mapOf("described" to "true"))
                .semantics { isTraversalGroup = true }
                .fillMaxWidth(),
        ) {
            if (ruled) PMRule(theme.colors.borderSubtle)
            Row(
                Modifier.fillMaxWidth().padding(horizontal = space.s6, vertical = space.s4),
                horizontalArrangement = Arrangement.spacedBy(space.s6),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(space.s1)) {
                    Text(
                        text = props.label,
                        style = theme.text.sm.textStyle,
                        color = theme.colors.textPrimary.color,
                        // The control speaks it.
                        modifier = Modifier.semantics { hideFromAccessibility() },
                    )
                    props.description?.let {
                        Text(
                            text = it,
                            style = theme.text.xs.textStyle,
                            color = theme.colors.textSecondary.color,
                            modifier = Modifier.widthIn(max = space.s10 * PMRecipe.settingsRowMeasure),
                        )
                    }
                }
                // The control's own width, never more: a field that fills what it
                // is offered (a Select) would take the text column's room.
                Box(Modifier.width(IntrinsicSize.Max)) {
                    CompositionLocalProvider(LocalPMField provides field) { props.control() }
                }
            }
        }
    }

    /** A section of settings: the overline title, then the rows on one surface. */
    @Composable
    override fun RenderGroup(props: PMSettingsRowGroupProps) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val shape = theme.rounded(theme.radius.surface)
        val hairline = PMGeometry.hairline

        Column(
            Modifier
                // The part's identity: the member's name with the part, as the
                // harness reads one identifier per root.
                .pmMember("SettingsRow", mapOf("part" to "group"))
                .semantics { isTraversalGroup = true }
                .fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(space.s2),
        ) {
            // The uppercase is drawn only: the title is spoken as written.
            Text(
                text = props.title.toUpperCase(LocaleList.current),
                style = theme.text.xs.textStyle,
                color = theme.colors.textSecondary.color,
                modifier = Modifier.semantics {
                    contentDescription = props.title
                    heading()
                },
            )
            Box(
                Modifier
                    .fillMaxWidth()
                    .pmShadow(theme.shadows.resting, shape)
                    .clip(shape)
                    .background(theme.colors.bgSurface.color)
                    .pmInsetShadow(theme.shadows.insetTop, shape)
                    .border(hairline, theme.colors.borderSubtle.color, shape),
            ) {
                Column(
                    Modifier
                        .fillMaxWidth()
                        // One rule's thickness up, so the first row's rule is under the clip.
                        .layout { measurable, constraints ->
                            val lift = hairline.roundToPx()
                            val placeable = measurable.measure(constraints)
                            layout(placeable.width, maxOf(0, placeable.height - lift)) { placeable.placeRelative(0, -lift) }
                        },
                ) {
                    CompositionLocalProvider(LocalRuledRows provides true) { props.children() }
                }
            }
        }
    }
}

/**
 * SettingsRow's states, from the spec: a group of three rows (a Switch, a
 * Select and a Button), a row without a description, a row on its own, and
 * two groups stacked.
 */
object SettingsRowStates : PMStates {
    override val member = "SettingsRow"

    private const val notifications = "Notifications"
    private const val email = "Email digests"
    private const val emailNote = "A summary of open tickets every morning."
    private const val mobile = "Mobile push"
    private const val digest = "Digest time"
    private const val export = "Export data"
    private const val exportNote = "A CSV of every ticket in this workspace."
    private const val download = "Download"
    private const val data = "Data"
    private const val retention = "Keep deleted tickets"

    private val times = listOf(
        PMSelectOptionEntry.Option(PMSelectOption(value = "7", label = "07:00")),
        PMSelectOptionEntry.Option(PMSelectOption(value = "9", label = "09:00")),
    )

    @Composable
    private fun Notifications() {
        PMSettingsRowGroup(title = notifications) {
            PMSettingsRow(control = { PMSwitch(defaultChecked = true) }, description = emailNote, label = email)
            PMSettingsRow(control = { PMSelect(defaultValue = PMSome("7"), options = times, size = PMControlSize.Sm) }, label = digest)
            PMSettingsRow(
                control = { PMButton(label = download, size = PMControlSize.Sm, appearance = PMButtonAppearance.OutlineNeutral) },
                description = exportNote,
                label = export,
            )
        }
    }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("row", expect = mapOf("described" to "true", "contains" to "Switch")) {
                PMSettingsRow(control = { PMSwitch(defaultChecked = true) }, description = emailNote, label = email)
            },
            PMStateEntry("row without description", expect = mapOf("contains" to "Switch")) {
                PMSettingsRow(control = { PMSwitch() }, label = mobile)
            },
            PMStateEntry("group of three rows — a Switch, a Select and a Button", expect = mapOf("part" to "group", "contains" to "SettingsRow,Switch,Select,Button")) {
                Notifications()
            },
            PMStateEntry("two groups stacked", expect = mapOf("part" to "group")) {
                Column(verticalArrangement = Arrangement.spacedBy(PM.theme.defaultDensity.spacing.s6)) {
                    Notifications()
                    PMSettingsRowGroup(title = data) {
                        PMSettingsRow(control = { PMCheckbox(defaultChecked = PMCheckedState.Checked) }, label = retention)
                    }
                }
            },
        )
}
