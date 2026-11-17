package dev.polymorph.ui

import android.graphics.Insets
import android.view.WindowInsets
import androidx.activity.ComponentActivity
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.ViewRootForTest
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onRoot
import dev.polymorph.tokens.PMThemes
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * A page archetype's scroll region ends at the keyboard: in an app drawn edge
 * to edge, which the keyboard does not resize, the page's column scrolls
 * further by the keyboard's height, so its lower fields and its actions can
 * scroll into view above it. The JVM harness cannot test it, because Compose
 * for desktop has no keyboard insets, so this runs on the Android target under
 * Robolectric, at a phone's size, with the keyboard's insets dispatched to the
 * window's Compose view.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36], qualifiers = "w360dp-h844dp-xhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class PageKeyboardTest {
    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun aPageEndsItsScrollAtTheKeyboard() {
        compose.setContent {
            CompositionLocalProvider(LocalPMTheme provides PMThemes.default, LocalPMDark provides false) {
                PMFormPage(loadStatus = PMLoadStatus.Ready, actions = { PMButton(label = "Create") }, title = "New ticket") {
                    PMFormField(label = "Subject") { PMInput() }
                    PMFormField(label = "Requester") { PMInput() }
                    PMFormField(label = "Details") { PMTextarea() }
                }
            }
        }
        compose.waitForIdle()
        val before = travel()
        val view = (compose.onRoot().fetchSemanticsNode().root as ViewRootForTest).view
        compose.runOnUiThread {
            val keyboard = WindowInsets.Builder()
                .setInsets(WindowInsets.Type.ime(), Insets.of(0, 0, 0, KEYBOARD_PX))
                .setVisible(WindowInsets.Type.ime(), true)
                .build()
            view.dispatchApplyWindowInsets(keyboard)
        }
        compose.waitForIdle()
        val after = travel()
        assertEquals("the page's column overflows before the keyboard opens", 0f, before)
        assertTrue("the page does not scroll further with the keyboard open: $before, then $after", after > before)
    }

    /** How far the page's column scrolls, in pixels. */
    private fun travel(): Float {
        val page = compose.onNode(SemanticsMatcher("the page") { it.config.getOrNull(PMMemberKey)?.name == "FormPage" })
        val range = page.fetchSemanticsNode().config.getOrNull(SemanticsProperties.VerticalScrollAxisRange)
        return range?.maxValue?.invoke() ?: 0f
    }

    private companion object {
        /** A keyboard taller than the room the form leaves on a phone's screen, in pixels. */
        const val KEYBOARD_PX = 1_400
    }
}
