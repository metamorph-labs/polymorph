package dev.polymorph.ui

import androidx.activity.ComponentActivity
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.performClick
import dev.polymorph.tokens.PMThemes
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Back closes AppShell's drawer on a phone and leaves the screen where it is.
 * The drawer registers Back through the sheet given its state; without that,
 * Back would finish the activity. The JVM harness cannot test it, because
 * Compose for desktop has no Back, so this runs on the Android target under
 * Robolectric, at a phone's width, where AppShell stacks its rail in a drawer.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36], qualifiers = "w360dp-h844dp-xhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class AppShellBackTest {
    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun backClosesTheDrawerAndKeepsTheScreen() {
        val entry = AppShellStates.entries.first { it.name == "full content" }
        compose.setContent {
            CompositionLocalProvider(LocalPMTheme provides PMThemes.default, LocalPMDark provides false) {
                entry.render()
            }
        }
        assertFalse("the drawer is open before the menu button is pressed", drawerShown())

        // The menu button's name, the English default an app does not replace here.
        compose.onNode(hasContentDescription(PMStrings().openNavigation)).performClick()
        compose.waitForIdle()
        assertTrue("the menu button does not open the drawer", drawerShown())

        compose.runOnUiThread { compose.activity.onBackPressedDispatcher.onBackPressed() }
        compose.waitForIdle()
        assertFalse("Back does not close the drawer", drawerShown())
        assertFalse("Back leaves the screen instead of closing the drawer", compose.activity.isFinishing)
        assertTrue(
            "the shell is gone after Back",
            compose.onAllNodes(SemanticsMatcher("is AppShell") { it.config.getOrNull(PMMemberKey)?.name == "AppShell" })
                .fetchSemanticsNodes().isNotEmpty(),
        )
    }

    /**
     * Whether the drawer's sheet is on screen. Material names the sheet with a
     * pane title, and keeps it composed off the screen's leading edge while the
     * drawer is closed.
     */
    private fun drawerShown(): Boolean =
        compose.onAllNodes(SemanticsMatcher.keyIsDefined(SemanticsProperties.PaneTitle), useUnmergedTree = true)
            .fetchSemanticsNodes()
            .any { it.boundsInRoot.right > 0f }
}
