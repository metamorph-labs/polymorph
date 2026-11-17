// DensityScope (rung 2 of the exception ladder, `docs/rules.md`): a region of
// the screen at another density. On the web it sets `data-density` on a
// subtree, and the stylesheet's density block for that value applies there.
// Here it provides its children the same pairing with the density axis set to
// `value` (`LocalPMTheme`), so every member inside reads its space, control
// heights and insets from `theme.defaultDensity` at that density, and nothing
// else changes: the type scale, the colours and the motion are the pairing's,
// as the web's density block declares space and control heights only. The hit
// target is the density's, 48dp on Android at every density.
//
// A scope is a wrapper, not a surface: it draws nothing, and its children are
// read one by one. `as` chooses the web's element (`div`, `section`, `span`),
// which has no Compose counterpart; it is kept as an attribute.

package dev.polymorph.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import dev.polymorph.tokens.PMTheme

object PMDensityScope : PMDensityScopeRendering {
    @Composable
    override fun Render(props: PMDensityScopeProps) {
        val theme = PM.theme
        Box(
            Modifier.pmMember(
                "DensityScope",
                mapOf("density" to props.value.value, "as" to (props.`as` ?: PMDensityScopeAs.Div).value),
            ),
        ) {
            CompositionLocalProvider(LocalPMTheme provides theme.at(props.value)) {
                props.children?.invoke()
            }
        }
    }

    /** The same pairing with its density axis set to `value`: every other value as it is. */
    private fun PMTheme.at(value: PMDensityScopeValue): PMTheme =
        copy(pairing = pairing.copy(axes = pairing.axes.copy(density = value.value)))
}

/**
 * DensityScope's states: a field and its actions at each density, so the
 * three read side by side, and a scope around a table, the case the inbox
 * writes.
 */
object DensityScopeStates : PMStates {
    override val member = "DensityScope"

    private val tickets = listOf(
        Triple("Login loop on SSO", "Open", "Urgent"),
        Triple("Refund for March invoice", "Waiting", "Normal"),
        Triple("Export times out", "Open", "High"),
    )

    override val entries: List<PMStateEntry>
        get() = PMDensityScopeValue.entries.map { value ->
            PMStateEntry(value.value, expect = mapOf("density" to value.value, "as" to "div", "contains" to "Input,Button")) {
                PMDensityScope(value = value) { Sample() }
            }
        } + PMStateEntry(
            "a compact table in a section",
            expect = mapOf("density" to "compact", "as" to "section", "contains" to "DataTable"),
        ) {
            PMDensityScope(`as` = PMDensityScopeAs.Section, value = PMDensityScopeValue.Compact) {
                PMDataTable(
                    columns = listOf(
                        PMDataTableColumn(key = "subject", header = "Subject", value = { row: Triple<String, String, String> -> row.first }),
                        PMDataTableColumn(key = "status", header = "Status", value = { row: Triple<String, String, String> -> row.second }),
                        PMDataTableColumn(key = "priority", header = "Priority", value = { row: Triple<String, String, String> -> row.third }),
                    ),
                    data = tickets,
                    emptyState = PMEmptyStateProps(title = "No tickets"),
                    getRowId = { it.first },
                    label = "Tickets",
                )
            }
        }

    /** A field and its actions, whose heights and gaps show the density. */
    @Composable
    private fun Sample() {
        PMStack(gap = PMSpaceStep.S4) {
            PMInput(ariaLabel = "Subject", defaultValue = "Refund request")
            PMInline(gap = PMSpaceStep.S3) {
                PMButton(label = "Cancel", appearance = PMButtonAppearance.OutlineNeutral)
                PMButton(label = "Save")
            }
        }
    }
}
