// SettingsPage (`design/archetypes/settings-page.md`): the settings screen. The
// page header and the groups of settings in one readable column, the gutter
// between header and groups and between groups. No actions row: settings apply
// at once, and a screen that needs a save bar is a FormPage.
//
// The load status (`design/native/screen-contract.md`): `loading` draws
// Skeleton rows in place of the groups, `failed` a danger Alert in their place,
// and `empty` is `ready`.

package dev.polymorph.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

object PMSettingsPage : PMSettingsPageRendering {
    @Composable
    override fun Render(props: PMSettingsPageProps) {
        val space = PM.theme.defaultDensity.spacing
        val status = props.loadStatus
        PMPage(PMRecipe.settingsPageMeasure, "SettingsPage", status) {
            PMPageHeader(description = props.description, title = props.title)
            when (status) {
                PMLoadStatus.Ready, PMLoadStatus.Empty -> props.children()
                PMLoadStatus.Loading -> PMPagePanel { Box(Modifier.padding(space.s6)) { PMPageSkeletonRows() } }
                is PMLoadStatus.Failed -> PMPageFailure(status.message, props.onRetry)
            }
        }
    }
}

/**
 * SettingsPage's states: the four load states, over two groups of settings
 * rows, each naming what its body holds (`contains`).
 */
object SettingsPageStates : PMStates {
    override val member = "SettingsPage"

    private const val title = "Settings"
    private const val description = "How this workspace behaves for everyone in it."
    private const val failure = "Settings could not be loaded."

    @Composable
    private fun Groups() {
        PMSettingsRowGroup(title = "Notifications") {
            PMSettingsRow(
                control = { PMSwitch(defaultChecked = true) },
                description = "A summary of open tickets every morning.",
                label = "Email digests",
            )
            PMSettingsRow(control = { PMSwitch() }, label = "Mobile push")
        }
        PMSettingsRowGroup(title = "Data") {
            PMSettingsRow(control = { PMSwitch() }, label = "Keep deleted tickets for thirty days")
        }
    }

    @Composable
    private fun Page(status: PMLoadStatus) {
        PMSettingsPage(loadStatus = status, onRetry = {}, description = description, title = title) { Groups() }
    }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("ready", expect = mapOf("status" to "ready", "contains" to "SettingsRow,Switch")) { Page(PMLoadStatus.Ready) },
            PMStateEntry("loading", expect = mapOf("status" to "loading", "contains" to "Skeleton")) {
                Page(PMLoadStatus.Loading)
            },
            PMStateEntry("empty", expect = mapOf("status" to "empty", "contains" to "SettingsRow,Switch")) { Page(PMLoadStatus.Empty) },
            PMStateEntry("failed", expect = mapOf("status" to "failed", "contains" to "Alert")) {
                Page(PMLoadStatus.Failed(failure))
            },
        )
}
