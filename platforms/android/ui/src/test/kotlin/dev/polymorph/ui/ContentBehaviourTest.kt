package dev.polymorph.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.material3.Text
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.UriHandler
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.v2.runComposeUiTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * What Plan, TableOfContents, CommentThread and Tour say and do, composed by
 * Compose for desktop's test host and read through its semantics, and the
 * logic each computes from its props.
 */
@OptIn(ExperimentalTestApi::class)
class ContentBehaviourTest {
    @Composable
    private fun Scene(content: @Composable () -> Unit) {
        Harness.Scene(Harness.passes.first()) { content() }
    }

    /** The node whose identity is `name`. */
    private fun member(name: String) = SemanticsMatcher("member $name") { node ->
        node.config.getOrNull(PMMemberKey)?.name == name
    }

    /* Plan ------------------------------------------------------------------ */

    private fun step(id: String, status: PMPlanStatus, description: String? = null) =
        PMPlanStep(id, "Step $id", description, status)

    /** A run with its third step running, as the web's law passes it. */
    private val run = listOf(
        step("a", PMPlanStatus.Done, "Read three files"),
        step("b", PMPlanStatus.Done),
        step("c", PMPlanStatus.Running, "Editing deliver.ts"),
        step("d", PMPlanStatus.Pending),
        step("e", PMPlanStatus.Pending),
    )

    /**
     * The status line names the step at the front of the run (`plan.md`,
     * A11y): the first running step; with none running, the first failed one;
     * with neither, the last one done or skipped; none while every step is
     * pending. The cases are the web law's (`@polymorph/conformance/plan`).
     */
    @Test
    fun thePlanNamesTheStepAtTheFrontOfTheRun() {
        val cases = listOf(
            run.map { it.copy(status = PMPlanStatus.Pending) } to null,
            run to "c",
            listOf(step("a", PMPlanStatus.Error), step("b", PMPlanStatus.Running), step("c", PMPlanStatus.Running)) to "b",
            listOf(
                step("a", PMPlanStatus.Done),
                step("b", PMPlanStatus.Error),
                step("c", PMPlanStatus.Skipped),
                step("d", PMPlanStatus.Error),
            ) to "b",
            listOf(step("a", PMPlanStatus.Done), step("b", PMPlanStatus.Skipped), step("c", PMPlanStatus.Pending)) to "b",
            run.map { it.copy(status = PMPlanStatus.Done) } to "e",
            emptyList<PMPlanStep>() to null,
        )
        for ((steps, front) in cases) {
            assertEquals(front, PMPlan.front(steps)?.id, steps.joinToString(" ") { it.status.value })
        }
    }

    /**
     * Each step is one node read as its title, its status words and its
     * description; the first running step is selected, the web's
     * `aria-current="step"`; the status line is a polite live region that
     * names the front of the run and follows it as the run moves.
     */
    @Test
    fun aPlanReadsEachStepAndFollowsTheFrontOfTheRun() = runComposeUiTest {
        val strings = PMStrings()
        var steps by mutableStateOf(
            listOf(step("a", PMPlanStatus.Done, "Read three files"), step("b", PMPlanStatus.Running), step("c", PMPlanStatus.Running)),
        )
        setContent { Scene { PMPlan(label = "Plan for this run", steps = steps) } }

        onNode(member("Plan") and hasContentDescription("Plan for this run")).assertExists()
        val line = SemanticsMatcher("the status line") { it.config.getOrNull(SemanticsProperties.LiveRegion) == LiveRegionMode.Polite }
        val stepNamed = { words: String -> hasContentDescription(words) and line.not() }
        onNode(stepNamed("Step a, ${strings.planDone}, Read three files")).assertExists()
        onNode(stepNamed("Step b, ${strings.planRunning}")).assertIsSelected()
        // A list has one current item: the second running step is not selected.
        assertEquals(null, onNode(stepNamed("Step c, ${strings.planRunning}")).fetchSemanticsNode().config.getOrNull(SemanticsProperties.Selected))

        val said = { onNode(line).fetchSemanticsNode().config.getOrNull(SemanticsProperties.ContentDescription)?.joinToString() }
        assertEquals("Step b, ${strings.planRunning}", said())

        // The run fails at its second step: the line names it, without its description.
        steps = listOf(step("a", PMPlanStatus.Done), step("b", PMPlanStatus.Error, "Three tests failed"), step("c", PMPlanStatus.Skipped))
        waitForIdle()
        assertEquals("Step b, ${strings.planFailed}", said())
    }

    /* TableOfContents ------------------------------------------------------- */

    /** A level-2 item is a subsection of the item before it; one with nothing before it is drawn at the first level. */
    @Test
    fun tableOfContentsGroupsSubsectionsUnderTheItemBeforeThem() {
        val level2 = PMTableOfContentsItemLevel.Level2
        val groups = PMTableOfContents.groups(
            listOf(
                PMTableOfContentsItem("a", "a", level2),
                PMTableOfContentsItem("b", "b"),
                PMTableOfContentsItem("c", "c", level2),
                PMTableOfContentsItem("d", "d", level2),
                PMTableOfContentsItem("e", "e", PMTableOfContentsItemLevel.Level1),
                PMTableOfContentsItem("f", "f", level2),
            ),
        )
        assertEquals(listOf(0, 1, 4), groups.map { it.at })
        assertEquals(listOf(emptyList(), listOf(2, 3), listOf(5)), groups.map { it.children.toList() })
    }

    /**
     * A link opens `#id` through the URI handler. The link the handler opens
     * is marked and selected, and `onCurrentChange` hears its id once; a link
     * the handler refuses, for a section the page does not hold, marks
     * nothing. Of two items with one id, the first is marked.
     */
    @Test
    fun aTableOfContentsMarksTheSectionTheAppWentTo() = runComposeUiTest {
        val opened = mutableListOf<String>()
        val reported = mutableListOf<String?>()
        val handler = object : UriHandler {
            override fun openUri(uri: String) {
                opened += uri
                if (uri == "#missing") throw IllegalArgumentException("No section $uri.")
            }
        }
        val items = listOf(
            PMTableOfContentsItem("overview", "Overview"),
            PMTableOfContentsItem("install", "Install"),
            PMTableOfContentsItem("missing", "Release notes"),
            PMTableOfContentsItem("install", "Install again"),
        )
        setContent {
            Scene {
                CompositionLocalProvider(LocalUriHandler provides handler) {
                    PMTableOfContents(items = items, label = "On this page", onCurrentChange = { reported += it })
                }
            }
        }
        val link = { label: String -> onNode(hasText(label) and hasClickAction()) }
        val marked = { label: String -> link(label).fetchSemanticsNode().config.getOrNull(SemanticsProperties.Selected) == true }
        onNode(member("TableOfContents") and hasContentDescription("On this page")).assertExists()
        assertEquals(false, marked("Install"))

        link("Install").performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        assertEquals(listOf("#install"), opened)
        assertEquals(listOf<String?>("install"), reported)
        assertEquals(true, marked("Install"))

        link("Release notes").performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        assertEquals(listOf("#install", "#missing"), opened)
        assertEquals(listOf<String?>("install"), reported)

        link("Install again").performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        assertEquals(listOf<String?>("install"), reported)
        assertEquals(true, marked("Install"))
        assertEquals(false, marked("Install again"))
    }

    /* Tour ------------------------------------------------------------------ */

    /** The step's index is clamped to the steps (`tour.md`, API). */
    @Test
    fun aTourClampsItsStep() {
        assertEquals(0, PMTour.clamped(-2.0, 3))
        assertEquals(1, PMTour.clamped(1.7, 3))
        assertEquals(2, PMTour.clamped(9.0, 3))
        assertEquals(0, PMTour.clamped(2.0, 0))
        assertEquals(0, PMTour.clamped(Double.NaN, 3))
    }

    /**
     * A tour the app opens walks its steps: Next and Previous report the new
     * index and change the panel, the first step has no Previous, the last has
     * Done in Next's place, and Done ends the tour with `finished` and closes
     * the sheet; the close control ends it with `dismissed`. The panel is a
     * pane titled by the step's title.
     */
    @Test
    fun aTourWalksItsStepsAndReportsHowItEnded() = runComposeUiTest {
        val words = PMStrings().tourMessages
        val steps = listOf(
            PMTourStep("create", title = "Create a ticket", body = "Start here."),
            PMTourStep("filter", title = "Narrow the list", body = "Filter by status."),
        )
        val moved = mutableListOf<Double>()
        val ended = mutableListOf<PMTourEnd>()
        var shown by mutableStateOf(true)
        setContent {
            Scene {
                if (shown) PMTour(defaultOpen = true, onEnd = { ended += it }, onStepChange = { moved += it }, steps = steps)
            }
        }
        val pane = { title: String -> SemanticsMatcher.expectValue(SemanticsProperties.PaneTitle, title) }
        val button = { label: String -> member("Button") and hasContentDescription(label) }
        onNode(pane("Create a ticket")).assertExists()
        onNode(hasText(words.position(1.0, 2.0)), useUnmergedTree = true).assertExists()
        onNode(button(words.previous)).assertDoesNotExist()

        onNode(button(words.next)).performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        assertEquals(listOf(1.0), moved)
        onNode(pane("Narrow the list")).assertExists()
        onNode(button(words.next)).assertDoesNotExist()

        onNode(button(words.previous)).performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        assertEquals(listOf(1.0, 0.0), moved)
        onNode(button(words.next)).performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        onNode(button(words.done)).performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        assertEquals(listOf(PMTourEnd.Finished), ended)
        onNode(pane("Narrow the list")).assertDoesNotExist()

        // A tour shown again opens afresh and is left through its close control.
        shown = false
        waitForIdle()
        shown = true
        waitForIdle()
        onNode(button(words.close)).performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        assertEquals(listOf(PMTourEnd.Finished, PMTourEnd.Dismissed), ended)
    }

    /* CommentThread --------------------------------------------------------- */

    @Composable
    private fun Comment(author: String, edited: Boolean? = null, replies: PMContent? = null) {
        PMCommentThreadComment(
            author = author,
            avatar = { PMAvatar(name = author) },
            edited = edited,
            replies = replies,
            time = { Text("09:40") },
        ) { Text("A comment by $author.") }
    }

    /**
     * The thread is a group named by its label, each comment one named by its
     * author, and a comment's replies one named by `messages.replies`
     * (`comment-thread.md`, A11y). A reply starts where its parent's body
     * starts, and a reply to a reply at the same edge, the second level; right
     * to left, from the right. An edited comment says so in its head.
     */
    @Test
    fun aCommentThreadNamesItsListsAndDrawsTwoLevels() = runComposeUiTest {
        val words = PMStrings().commentThreadMessages
        var rtl by mutableStateOf(false)
        setContent {
            Scene {
                CompositionLocalProvider(LocalLayoutDirection provides if (rtl) LayoutDirection.Rtl else LayoutDirection.Ltr) {
                    PMCommentThread(label = "Comments") {
                        Comment("Ada Okafor", replies = { Comment("Bao Tran", edited = true, replies = { Comment("Carmen Ruiz") }) })
                    }
                }
            }
        }
        onNode(member("CommentThread") and hasContentDescription("Comments")).assertExists()
        assertEquals(2, onAllNodes(hasContentDescription(words.replies)).fetchSemanticsNodes().size)
        onNode(hasText(words.edited), useUnmergedTree = true).assertExists()
        val box = { author: String -> onNode(hasContentDescription(author)).fetchSemanticsNode().boundsInRoot }
        assertTrue(box("Bao Tran").left > box("Ada Okafor").left + 1f, "a reply is not indented")
        assertEquals(box("Bao Tran").left, box("Carmen Ruiz").left, 0.5f, "a reply to a reply is not at the second level")

        rtl = true
        waitForIdle()
        assertTrue(box("Bao Tran").right < box("Ada Okafor").right - 1f, "a reply is not indented from the right")
        assertEquals(box("Bao Tran").right, box("Carmen Ruiz").right, 0.5f)
    }
}
