package dev.polymorph.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertIsNotFocused
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.requestFocus
import androidx.compose.ui.test.v2.runComposeUiTest
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * What the page archetypes do when a person moves through them, on the JVM
 * target: MasterDetailPage's way back and where it moves focus
 * (`master-detail-page.md`, "Behaviour").
 */
@OptIn(ExperimentalTestApi::class)
class PageBehaviourTest {
    /** The node whose identity is `name`, with each of `attributes`. */
    private fun member(name: String, vararg attributes: Pair<String, String>) = SemanticsMatcher("member $name") { node ->
        val member = node.config.getOrNull(PMMemberKey) ?: return@SemanticsMatcher false
        member.name == name && attributes.all { (key, value) -> member.attributes[key] == value }
    }

    /** A list item, by its title: the node a press on it reaches. */
    private fun item(title: String) = hasText(title) and hasClickAction()

    private val phone = 360.dp
    private val tablet = 1000.dp

    /** A support inbox `width` wide: two tickets, and the second's detail while `selected`. */
    @Composable
    private fun Inbox(width: Dp, selected: Boolean, onBack: () -> Unit) {
        Harness.Scene(Harness.passes.first()) {
            Box(Modifier.requiredSize(width, 640.dp)) {
                PMMasterDetailPage(
                    loadStatus = PMLoadStatus.Ready,
                    backLabel = "All tickets",
                    detail = if (selected) ({ PMHeading(children = "Refund for a duplicate charge") }) else null,
                    emptyState = PMEmptyStateProps(title = "No ticket selected"),
                    list = {
                        PMList(label = "Tickets") {
                            PMListItem(onSelect = {}, title = "Login loop")
                            PMListItem(current = selected, onSelect = {}, title = "Refund")
                        }
                    },
                    listLabel = "Tickets",
                    onBack = onBack,
                    title = "Support",
                )
            }
        }
    }

    /**
     * On a phone the detail is drawn alone under the way back, which calls
     * `onBack`; the list is out of the tree meanwhile and returns after it.
     */
    @Test
    fun aNarrowPageDrawsTheDetailAloneAndTheWayBackCallsOnBack() = runComposeUiTest {
        var selected by mutableStateOf(true)
        var backs = 0
        setContent {
            Inbox(phone, selected) {
                backs += 1
                selected = false
            }
        }
        onNode(member("MasterDetailPage", "layout" to "single", "pane" to "detail")).assertExists()
        assertTrue(onAllNodes(item("Login loop")).fetchSemanticsNodes().isEmpty(), "the list is drawn beside the detail on a phone")
        onNode(member("Button") and hasContentDescription("All tickets")).performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        assertEquals(1, backs, "the way back calls onBack once")
        onNode(member("MasterDetailPage", "layout" to "single", "pane" to "list")).assertExists()
        onNode(item("Login loop")).assertExists()
    }

    /**
     * On a phone, a pick moves focus from the list to the way back, because
     * the list is no longer drawn, and the way back moves it into the list.
     */
    @Test
    fun aNarrowPageMovesFocusToTheWayBackAndBackToTheList() = runComposeUiTest {
        var selected by mutableStateOf(false)
        setContent { Inbox(phone, selected) { selected = false } }
        onNode(item("Refund")).requestFocus()
        onNode(item("Refund")).assertIsFocused()
        selected = true
        waitForIdle()
        onNode(member("Button") and hasContentDescription("All tickets")).assertIsFocused()
        onNode(member("Button") and hasContentDescription("All tickets")).performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        onNode(item("Login loop")).assertIsFocused()
    }

    /** Beside the list, a pick moves no focus: the reader's place in the list stays. */
    @Test
    fun aSplitPageKeepsFocusInTheListWhenAnItemIsPicked() = runComposeUiTest {
        var selected by mutableStateOf(false)
        setContent { Inbox(tablet, selected) { selected = false } }
        onNode(member("MasterDetailPage", "layout" to "split")).assertExists()
        onNode(item("Refund")).requestFocus()
        selected = true
        waitForIdle()
        onNode(hasText("Refund for a duplicate charge")).assertExists()
        onNode(item("Refund")).assertIsFocused()
        onNode(item("Login loop")).assertIsNotFocused()
    }
}
