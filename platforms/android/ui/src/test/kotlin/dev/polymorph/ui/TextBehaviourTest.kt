package dev.polymorph.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeDown
import androidx.compose.ui.test.v2.runComposeUiTest
import androidx.compose.ui.unit.dp
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * What Diff's and LogView's lines do when a reader acts on them, composed by
 * Compose for desktop's test host and read through its semantics, as TalkBack
 * reads them.
 */
@OptIn(ExperimentalTestApi::class)
class TextBehaviourTest {
    @Composable
    private fun Scene(content: @Composable () -> Unit) = Harness.Scene(Harness.passes.first()) { content() }

    /** The node whose identity is `name`. */
    private fun member(name: String) = SemanticsMatcher("member $name") { node ->
        node.config.getOrNull(PMMemberKey)?.name == name
    }

    private val before = (1..12).joinToString("\n") { "line $it" }
    private val after = before.replace("line 10", "line ten")

    /**
     * Diff's lines form (`diff.md`): a collapsed run is a Button named by how
     * many lines it holds, collapsed; a press shows its lines under it and
     * expands the Button, which stays where it was; a second press hides them.
     * Each row is read as its kind's word and its line.
     */
    @Test
    fun aCollapsedRunShowsItsLinesWhenPressedAndHidesThemAgain() = runComposeUiTest {
        val words = PMStrings().diffMessages
        setContent {
            Scene { PMDiff(after = PMSome(after), before = PMSome(before), display = PMDiffDisplay.Lines, label = "Numbers") }
        }
        val run = onNode(member("Button") and hasContentDescription(words.unchanged(6.0)))
        assertEquals("false", run.fetchSemanticsNode().config[PMMemberKey].attributes["expanded"])
        onAllNodes(hasText("line 3")).assertCountEquals(0)
        onAllNodes(hasText("line 7")).assertCountEquals(1)
        onAllNodes(hasText("${words.removed} line 10")).assertCountEquals(1)
        onAllNodes(hasText("${words.added} line ten")).assertCountEquals(1)
        val at = run.fetchSemanticsNode().boundsInRoot

        run.performClick()
        waitForIdle()
        assertEquals("true", run.fetchSemanticsNode().config[PMMemberKey].attributes["expanded"])
        assertEquals(at, run.fetchSemanticsNode().boundsInRoot, "the Button moved when its lines appeared")
        onAllNodes(hasText("line 3")).assertCountEquals(1)

        run.performClick()
        waitForIdle()
        assertEquals("false", run.fetchSemanticsNode().config[PMMemberKey].attributes["expanded"])
        onAllNodes(hasText("line 3")).assertCountEquals(0)
    }

    /**
     * LogView (`log-view.md`): the log opens at its newest line and follows a
     * line that arrives while the reader is at the end. Scrolled up, the
     * reader is detached: a line that arrives moves nothing, and the jump
     * control appears; pressing it returns to the newest line, follows again
     * and takes the control away.
     */
    @Test
    fun aLogFollowsItsNewestLineUntilTheReaderScrollsAway() = runComposeUiTest {
        val words = PMStrings().logViewMessages
        var lines by mutableStateOf(List(40) { PMLogLine(id = "l$it", text = "line $it") })
        setContent {
            Scene {
                Box(Modifier.fillMaxWidth().height(200.dp), propagateMinConstraints = true) {
                    PMLogView(label = "Deploy log", lines = lines)
                }
            }
        }
        waitForIdle()
        onNode(hasText("line 39")).assertIsDisplayed()
        onAllNodes(member("Button")).assertCountEquals(0)

        lines = lines + PMLogLine(id = "l40", text = "line 40")
        waitForIdle()
        onNode(hasText("line 40")).assertIsDisplayed()

        onNode(member("LogView")).performTouchInput { swipeDown() }
        waitForIdle()
        assertEquals("detached", onNode(member("LogView")).fetchSemanticsNode().config[PMMemberKey].attributes["state"])
        lines = lines + PMLogLine(id = "l41", text = "line 41")
        waitForIdle()
        onAllNodes(hasText("line 41")).assertCountEquals(0)

        onNode(member("Button") and hasContentDescription(words.jumpToLatest)).performClick()
        waitForIdle()
        onNode(hasText("line 41")).assertIsDisplayed()
        assertEquals(null, onNode(member("LogView")).fetchSemanticsNode().config[PMMemberKey].attributes["state"])
        onAllNodes(member("Button")).assertCountEquals(0)
    }

    /** The inline form is one node read as the change in words. */
    @Test
    fun theInlineFormIsReadAsTheChangeInWords() = runComposeUiTest {
        val words = PMStrings().diffMessages
        setContent {
            Scene {
                Column {
                    PMDiff(after = PMSome("Active"), before = PMSome("Draft"))
                    PMDiff(after = PMSome("Fresh"), before = PMSome(null))
                    PMDiff(after = PMSome(""), before = PMSome("Gone"))
                    PMDiff(after = PMSome("Same"), before = PMSome("Same"))
                }
            }
        }
        onAllNodes(hasText("${words.from} Draft ${words.to} Active")).assertCountEquals(1)
        onAllNodes(hasText("${words.added} Fresh")).assertCountEquals(1)
        onAllNodes(hasText("${words.removed} Gone")).assertCountEquals(1)
        onAllNodes(hasText("Same")).assertCountEquals(1)
    }
}
