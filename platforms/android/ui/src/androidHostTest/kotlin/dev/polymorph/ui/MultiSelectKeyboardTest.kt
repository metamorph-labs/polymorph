package dev.polymorph.ui

import android.view.View
import android.view.WindowInsets
import androidx.activity.ComponentActivity
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.ViewRootForTest
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.requestFocus
import dev.polymorph.tokens.PMThemes
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.lang.reflect.Method

/**
 * MultiSelect's search field: the keyboard's action key with nothing typed
 * hides the keyboard (`MultiSelect.kt`). The field is in the list's own
 * window, a bottom sheet on a phone, and the action reaches that window's
 * keyboard controller. The JVM harness cannot hold it: Compose for desktop
 * gives the window a keyboard controller of its own, over any the test
 * provides, and that controller does nothing a test can see. Here the window
 * is Android's, under Robolectric at a phone's size, and its insets
 * controller keeps the insets each request asks to show: focus on the field
 * asks for the keyboard, and Done with nothing typed asks for it hidden.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36], qualifiers = "w360dp-h844dp-xhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class MultiSelectKeyboardTest {
    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun doneWithNothingTypedHidesTheKeyboard() {
        compose.setContent {
            CompositionLocalProvider(LocalPMTheme provides PMThemes.default, LocalPMDark provides false) {
                PMMultiSelect(ariaLabel = "Assignees", defaultOpen = true, options = TEAM)
            }
        }
        compose.waitForIdle()
        val search = compose.onNode(hasSetTextAction())
        val window = (search.fetchSemanticsNode().root as ViewRootForTest).view
        assertNotSame("the search field is not in a window of its own", compose.activity.window.decorView, window.rootView)
        search.requestFocus()
        compose.waitForIdle()
        assertTrue("focus on the search field does not ask for the keyboard", keyboardAsked(window))
        search.performImeAction()
        compose.waitForIdle()
        assertFalse("Done with nothing typed leaves the keyboard up", keyboardAsked(window))
    }

    /** Whether the window's insets controller has the keyboard among the insets its requests ask to show. */
    private fun keyboardAsked(view: View): Boolean {
        val controller = checkNotNull(view.windowInsetsController) { "the window has no insets controller" }
        val types = requestedVisibleTypes.invoke(controller) as Int
        return types and WindowInsets.Type.ime() != 0
    }

    private companion object {
        val TEAM = listOf(PMMultiSelectOption(value = "ana", label = "Ana Ruiz"), PMMultiSelectOption(value = "ben", label = "Ben Okafor"))

        /**
         * `InsetsController.getRequestedVisibleTypes()`, which the SDK hides:
         * the insets the window's requests ask to show, the keyboard among
         * them while a request to show it stands.
         */
        val requestedVisibleTypes: Method = Class.forName("android.view.InsetsController").getMethod("getRequestedVisibleTypes")
    }
}
