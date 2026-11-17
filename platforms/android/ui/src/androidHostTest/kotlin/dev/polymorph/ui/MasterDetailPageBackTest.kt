package dev.polymorph.ui

import androidx.activity.ComponentActivity
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import dev.polymorph.tokens.PMThemes
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Back on a phone, while MasterDetailPage draws the detail alone, calls
 * `onBack` and leaves the screen where it is; with the list drawn, Back is the
 * activity's. The JVM harness cannot test it, because Compose for desktop has
 * no Back, so this runs on the Android target under Robolectric, at a phone's
 * width, where the page draws one pane.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36], qualifiers = "w360dp-h844dp-xhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class MasterDetailPageBackTest {
    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private fun pane(): String? =
        compose.onAllNodes(SemanticsMatcher("is MasterDetailPage") { it.config.getOrNull(PMMemberKey)?.name == "MasterDetailPage" })
            .fetchSemanticsNodes()
            .firstOrNull()
            ?.config
            ?.get(PMMemberKey)
            ?.attributes
            ?.get("pane")

    @Test
    fun backFromTheDetailCallsOnBackAndKeepsTheScreen() {
        var selected by mutableStateOf(true)
        var backs = 0
        compose.setContent {
            CompositionLocalProvider(LocalPMTheme provides PMThemes.default, LocalPMDark provides false) {
                PMMasterDetailPage(
                    loadStatus = PMLoadStatus.Ready,
                    backLabel = "All tickets",
                    detail = if (selected) ({ PMHeading(children = "Refund for a duplicate charge") }) else null,
                    emptyState = PMEmptyStateProps(title = "No ticket selected"),
                    list = { PMList(label = "Tickets") { PMListItem(onSelect = {}, title = "Refund") } },
                    listLabel = "Tickets",
                    onBack = {
                        backs += 1
                        selected = false
                    },
                    title = "Support",
                )
            }
        }
        assertEquals("the page draws the detail alone on a phone", "detail", pane())

        compose.runOnUiThread { compose.activity.onBackPressedDispatcher.onBackPressed() }
        compose.waitForIdle()
        assertEquals("Back does not call onBack once", 1, backs)
        assertEquals("the list does not return after Back", "list", pane())
        assertFalse("Back leaves the screen instead of going back to the list", compose.activity.isFinishing)

        compose.runOnUiThread { compose.activity.onBackPressedDispatcher.onBackPressed() }
        compose.waitForIdle()
        assertEquals("Back with the list drawn calls onBack", 1, backs)
        assertTrue("Back with the list drawn is not the activity's", compose.activity.isFinishing)
    }
}
