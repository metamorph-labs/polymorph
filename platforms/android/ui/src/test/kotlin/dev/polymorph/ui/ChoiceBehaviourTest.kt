package dev.polymorph.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.v2.runComposeUiTest
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Rating's presses and TalkBack's increment and decrement, and ModeSwitch's
 * provided mode and reported choice, on the JVM target.
 */
@OptIn(ExperimentalTestApi::class)
class ChoiceBehaviourTest {
    @Composable
    private fun Scene(content: @Composable () -> Unit) {
        Harness.Scene(Harness.passes.first()) { content() }
    }

    /** The node whose identity is `name`. */
    private fun member(name: String) = SemanticsMatcher("member $name") { node ->
        node.config.getOrNull(PMMemberKey)?.name == name
    }

    @Test
    fun aPressChoosesAMarkAndAPressOnTheChosenMarkClearsTheRating() = runComposeUiTest {
        val reported = mutableListOf<Double?>()
        setContent { Scene { PMRating(label = "Rate this answer", onChange = { reported += it }) } }
        onNode(hasContentDescription("3 stars")).performSemanticsAction(SemanticsActions.OnClick)
        assertEquals(listOf<Double?>(3.0), reported)
        onNode(hasContentDescription("3 stars")).performSemanticsAction(SemanticsActions.OnClick)
        assertEquals(listOf(3.0, null), reported, "a press on the chosen mark clears the rating")
    }

    @Test
    fun aRequiredRatingKeepsItsMarkAndTalkBacksIncrementStopsAtTheEnd() = runComposeUiTest {
        val reported = mutableListOf<Double?>()
        setContent {
            Scene {
                PMRating(ariaRequired = true, defaultValue = PMSome(2.0), label = "Rate this answer", max = 3.0, onChange = { reported += it })
            }
        }
        onNode(hasContentDescription("2 stars")).performSemanticsAction(SemanticsActions.OnClick)
        assertEquals(emptyList(), reported, "a required rating keeps its mark")
        val group = onNode(member("Rating"))
        group.performSemanticsAction(SemanticsActions.SetProgress) { it(3f) }
        assertEquals(listOf<Double?>(3.0), reported)
        assertEquals("3 stars", group.fetchSemanticsNode().config.getOrNull(SemanticsProperties.StateDescription))
        group.performSemanticsAction(SemanticsActions.SetProgress) { it(4f) }
        assertEquals(listOf<Double?>(3.0), reported, "the increment stops at the last mark")
        group.performSemanticsAction(SemanticsActions.SetProgress) { it(2f) }
        assertEquals(listOf<Double?>(3.0, 2.0), reported)
    }

    @Test
    fun aModeSwitchShowsTheProvidedModeAndReportsAChoiceForTheAppToApply() = runComposeUiTest {
        val chosen = mutableListOf<PMModePreference>()
        setContent {
            Scene {
                CompositionLocalProvider(LocalPMDark provides true) {
                    PMModeSwitch(label = "Appearance", onChange = { chosen += it })
                }
            }
        }
        val identity = onNode(member("ModeSwitch")).fetchSemanticsNode().config[PMMemberKey]
        assertEquals("dark", identity.attributes["checked"], "the mode the app provides")
        onNode(hasContentDescription("Light")).performSemanticsAction(SemanticsActions.OnClick)
        assertEquals(listOf(PMModePreference.Light), chosen)
    }
}
