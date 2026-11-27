package dev.polymorph.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.material3.Text
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.UriHandler
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.ComposeUiTest
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.click
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.v2.runComposeUiTest
import dev.polymorph.tokens.PMThemes
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * What Plan, TableOfContents, CommentThread, Tour, RichTextContent, a
 * loading Stat and a CodeBlock's copy say and do, composed by Compose for
 * desktop's test host and read through its semantics, and the logic each
 * computes from its props.
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

    /* RichTextContent ------------------------------------------------------- */

    /** A press on a link run inside a text: Compose gives each its own node. */
    private val linkRun = SemanticsMatcher("a link run") { node -> node.config.any { it.key.name == "LinkTestMarker" } }

    private fun document(vararg blocks: Map<String, Any>) =
        PMJSONValue.of(mapOf("format" to "polymorph-rich-text/1", "blocks" to blocks.toList()))

    private fun linked(text: String, href: String) =
        mapOf("type" to "text", "text" to text, "marks" to listOf(mapOf("type" to "link", "href" to href)))

    /**
     * RichTextContent's links (`rich-text-content.md`, `link.md` Routing): a
     * press on a path calls `onNavigate` with it in place of the URI handler,
     * and a press on a target with a scheme, or on any link without
     * `onNavigate`, opens it through the handler. A link whose target may not
     * be followed is its text, with no link to press.
     */
    @Test
    fun aDocumentsLinkGoesToTheRouterOrOpensThroughTheHandler() = runComposeUiTest {
        val routed = mutableListOf<String>()
        val opened = mutableListOf<String>()
        val handler = object : UriHandler {
            override fun openUri(uri: String) {
                opened += uri
            }
        }
        val value = document(
            mapOf(
                "type" to "paragraph",
                "content" to listOf(
                    mapOf("type" to "text", "text" to "Read "),
                    linked("the runbook", "/runbooks/42"),
                    mapOf("type" to "text", "text" to " or "),
                    linked("the guide", "https://docs.example.org/guide"),
                    mapOf("type" to "text", "text" to ", not "),
                    linked("this", "javascript:alert(1)"),
                ),
            ),
        )
        setContent {
            Scene {
                CompositionLocalProvider(LocalUriHandler provides handler) {
                    Column {
                        PMRichTextContent(onNavigate = { routed += it }, value = value)
                        PMRichTextContent(value = value)
                    }
                }
            }
        }
        val links = onAllNodes(linkRun, useUnmergedTree = true)
        assertEquals(4, links.fetchSemanticsNodes().size, "two links in each document")
        for (index in 0 until 4) links[index].performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        assertEquals(listOf("/runbooks/42"), routed)
        assertEquals(listOf("https://docs.example.org/guide", "/runbooks/42", "https://docs.example.org/guide"), opened)
    }

    /**
     * RichTextContent's entities (`rich-text-content.md`, The entity token): an
     * entity the app draws is set in the line where the entity stands, at the
     * line's start here, and from the right right to left; an entity the app
     * leaves is the token, a run of its label on the accent wash. The
     * paragraph's words keep both labels.
     */
    @Test
    fun anEntityIsWhatTheAppDrawsInTheLineOrTheToken() = runComposeUiTest {
        var rtl by mutableStateOf(false)
        setContent {
            Scene {
                CompositionLocalProvider(LocalLayoutDirection provides if (rtl) LayoutDirection.Rtl else LayoutDirection.Ltr) {
                    PMRichTextContent(
                        entity = { entity -> if (entity.kind == "user") PMLink(children = entity.label, href = "/people/${entity.id}") },
                        value = RichTextContentStates.entities,
                    )
                }
            }
        }
        waitForIdle()
        onAllNodes(member("Link")).assertCountEquals(1)
        val paragraph = { onNode(member("Text")).fetchSemanticsNode() }
        val link = { onNode(member("Link")).fetchSemanticsNode().boundsInRoot }
        val words = paragraph().config[SemanticsProperties.Text].single()
        assertTrue("@Ada Lovelace" in words.text, words.text)
        val issue = words.text.indexOf("#10423")
        assertTrue(issue >= 0, words.text)
        assertTrue(
            words.spanStyles.any { it.start <= issue && it.end >= issue + "#10423".length && it.item.background != Color.Unspecified },
            "the issue is not drawn on a wash",
        )
        assertEquals(paragraph().boundsInRoot.left, link().left, 1f, "the Link is not where the person stands in the line")
        assertTrue(link().top >= paragraph().boundsInRoot.top - 1f && link().bottom <= paragraph().boundsInRoot.bottom + 1f)

        rtl = true
        waitForIdle()
        assertEquals(paragraph().boundsInRoot.right, link().right, 1f, "the Link does not start the line from the right")
    }

    /**
     * RichTextContent (`rich-text-content.md`, States): the empty document, a
     * document of whitespace, and a value that is not a document each draw the
     * root, marked empty, and nothing in it.
     */
    @Test
    fun anEmptyDocumentDrawsTheRootAndNothingInIt() = runComposeUiTest {
        val values = listOf(
            document(),
            document(mapOf("type" to "paragraph", "content" to listOf(mapOf("type" to "text", "text" to "   ")))),
            PMJSONValue.Null,
            PMJSONValue.Text("Retries are exponential."),
            PMJSONValue.of(mapOf("blocks" to "none")),
            PMJSONValue.Number(42.0),
        )
        var value by mutableStateOf(values.first())
        setContent { Scene { PMRichTextContent(value = value) } }
        for (each in values) {
            value = each
            waitForIdle()
            val root = onNode(member("RichTextContent")).fetchSemanticsNode()
            assertEquals("true", root.config[PMMemberKey].attributes["empty"], "$each")
            assertEquals(0f, root.boundsInRoot.height, "$each")
            onAllNodes(member("Text")).assertCountEquals(0)
        }
    }

    /**
     * RichTextContent's headings (`rich-text-content.md`, The document): the
     * document's level 1 is drawn at `headingLevel`, each deeper level one
     * more, never past 4; a heading with no text, and a block of a later
     * version with no text, draw nothing.
     */
    @Test
    fun aDocumentsHeadingsAreDrawnUnderThePagesTitle() = runComposeUiTest {
        val heading = { level: Int, text: String ->
            mapOf("type" to "heading", "level" to level, "content" to listOf(mapOf("type" to "text", "text" to text)))
        }
        var top by mutableStateOf<PMRichTextContentHeadingLevel?>(null)
        setContent {
            Scene {
                PMRichTextContent(
                    headingLevel = top,
                    value = document(
                        heading(1, "One"),
                        heading(2, "Two"),
                        heading(3, "Three"),
                        mapOf("type" to "heading", "level" to 1, "content" to emptyList<Any>()),
                        mapOf("type" to "divider"),
                        mapOf("type" to "paragraph", "content" to listOf(mapOf("type" to "text", "text" to "Body."))),
                    ),
                )
            }
        }
        val levels = {
            onAllNodes(member("Heading")).fetchSemanticsNodes().map { it.config[PMMemberKey].attributes["level"] }
        }
        assertEquals(listOf("2", "3", "4"), levels())
        onAllNodes(member("Text")).assertCountEquals(1)
        top = PMRichTextContentHeadingLevel.HeadingLevel3
        waitForIdle()
        assertEquals(listOf("3", "4", "4"), levels())
    }

    /** The wash under the first character of `words` in the only paragraph, or `Color.Unspecified`. */
    private fun ComposeUiTest.washUnder(words: String): Color {
        val text = onNode(member("Text")).fetchSemanticsNode().config[SemanticsProperties.Text].single()
        val at = text.text.indexOf(words)
        assertTrue(at >= 0, text.text)
        return text.spanStyles.lastOrNull { it.start <= at && at < it.end && it.item.background != Color.Unspecified }?.item?.background
            ?: Color.Unspecified
    }

    private val theme = PMThemes.default
    private val wash = Color(theme.colors.warningSubtle.resolve(false).argb)
    private val activeWash = Color(theme.colors.warningSubtleActive.resolve(false).argb)

    /**
     * RichTextContent's annotations (`rich-text-content.md`, A press on a
     * highlight): each stretch of words whose innermost annotation is one id
     * is a link run of the text, whose press, by touch or by TalkBack's
     * action, calls `onAnnotationSelect` with that id. The active
     * annotation's words take the stronger wash, and where annotations
     * overlap, the innermost one's wash is drawn.
     */
    @Test
    fun aTapOnAnAnnotationCallsTheHandlerWithTheInnermostId() = runComposeUiTest {
        val selected = mutableListOf<String>()
        setContent {
            Scene {
                PMRichTextContent(activeAnnotation = "thread-2", onAnnotationSelect = { selected += it }, value = RichTextContentStates.overlapping)
            }
        }
        val presses = onAllNodes(linkRun, useUnmergedTree = true)
        assertEquals(3, presses.fetchSemanticsNodes().size, "the outer thread before and after the inner one, and the inner one")
        for (index in 0 until 3) presses[index].performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        assertEquals(listOf("thread-1", "thread-2", "thread-1"), selected)

        presses[1].performTouchInput { click(center) }
        waitForIdle()
        assertEquals("thread-2", selected.last(), "a tap on the inner thread's words")

        assertEquals(wash, washUnder("twice"))
        assertEquals(activeWash, washUnder("as long"))
        assertEquals(wash, washUnder(" as the last one"))
        assertEquals(Color.Unspecified, washUnder("Each retry"))
    }

    /**
     * RichTextContent's annotations: a link inside an annotation is the
     * link's, so a press on it follows the link and selects nothing; the
     * words around it are the annotation's. Without `onAnnotationSelect`
     * the highlights take no press, and `annotations` draws only the ones it
     * names.
     */
    @Test
    fun aLinkInsideAnAnnotationIsTheLinksAndOnlyTheNamedAnnotationsAreDrawn() = runComposeUiTest {
        val selected = mutableListOf<String>()
        val routed = mutableListOf<String>()
        var handler by mutableStateOf<((String) -> Unit)?>({ selected += it })
        var shown by mutableStateOf<List<String>?>(null)
        val thread = mapOf("type" to "annotation", "id" to "thread-1")
        val value = document(
            mapOf(
                "type" to "paragraph",
                "content" to listOf(
                    mapOf("type" to "text", "text" to "Read ", "marks" to listOf(thread)),
                    mapOf("type" to "text", "text" to "the runbook", "marks" to listOf(mapOf("type" to "link", "href" to "/runbooks/42"), thread)),
                    mapOf("type" to "text", "text" to " first", "marks" to listOf(thread, mapOf("type" to "annotation", "id" to "thread-2"))),
                ),
            ),
        )
        setContent {
            Scene {
                PMRichTextContent(annotations = shown, onAnnotationSelect = handler, onNavigate = { routed += it }, value = value)
            }
        }
        val presses = onAllNodes(linkRun, useUnmergedTree = true)
        assertEquals(3, presses.fetchSemanticsNodes().size)
        presses[1].performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        assertEquals(listOf("/runbooks/42"), routed)
        assertEquals(emptyList<String>(), selected, "a press on the link selected an annotation")
        assertEquals(wash, washUnder("the runbook"), "the link inside the annotation is not on its wash")
        presses[2].performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        assertEquals(listOf("thread-2"), selected)

        shown = listOf("thread-1")
        waitForIdle()
        onAllNodes(linkRun, useUnmergedTree = true)[2].performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        assertEquals(listOf("thread-2", "thread-1"), selected, "an annotation the app did not name was pressed")

        shown = emptyList()
        waitForIdle()
        assertEquals(Color.Unspecified, washUnder("Read"))
        assertEquals(1, onAllNodes(linkRun, useUnmergedTree = true).fetchSemanticsNodes().size, "only the link")

        shown = null
        handler = null
        waitForIdle()
        assertEquals(wash, washUnder("Read"))
        assertEquals(1, onAllNodes(linkRun, useUnmergedTree = true).fetchSemanticsNodes().size, "a highlight took a press with no handler")
    }

    /**
     * RichTextContent's annotations in a heading and on an entity: a heading
     * that holds one is drawn by the member, still a heading, with the
     * highlight's press in it; an annotated entity's token is pressed as its
     * words are, and the app's `entity` is handed the entity's marks.
     */
    @Test
    fun aHeadingAndAnEntityCarryTheirAnnotations() = runComposeUiTest {
        val selected = mutableListOf<String>()
        val handed = mutableListOf<PMRichTextEntity>()
        setContent {
            Scene {
                Column {
                    PMRichTextContent(onAnnotationSelect = { selected += it }, value = RichTextContentStates.annotatedHeading)
                    PMRichTextContent(onAnnotationSelect = { selected += it }, value = RichTextContentStates.annotatedEntity)
                    PMRichTextContent(entity = { handed += it }, value = RichTextContentStates.annotatedEntity)
                }
            }
        }
        waitForIdle()
        onAllNodes(member("Heading")).assertCountEquals(0)
        val heading = onNode(SemanticsMatcher.keyIsDefined(SemanticsProperties.Heading)).fetchSemanticsNode()
        assertEquals("Webhook retries", heading.config[SemanticsProperties.Text].single().text)
        val presses = onAllNodes(linkRun, useUnmergedTree = true)
        assertEquals(2, presses.fetchSemanticsNodes().size, "the heading's highlight, and the token and words after it as one")
        presses[0].performSemanticsAction(SemanticsActions.OnClick)
        presses[1].performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        assertEquals(listOf("thread-4", "thread-3"), selected)
        val marks = handed.last().marks.orEmpty()
        assertEquals(listOf(PMJSONValue.of(mapOf("type" to "annotation", "id" to "thread-3"))), marks)
    }

    /* Stat ------------------------------------------------------------------ */

    /**
     * A Stat whose number has not arrived (`stat.md`, Loading) is read as its
     * label and the loading word: the value's Skeleton is named, and no value,
     * delta or chip label is in the tree.
     */
    @Test
    fun aLoadingStatIsReadAsItsLabelAndLoadingWithNoNumber() = runComposeUiTest {
        setContent {
            Scene {
                PMStat(
                    delta = PMStatDelta("12%", PMDeltaDirection.Up),
                    label = "Revenue",
                    loading = true,
                    trend = PMStatTrend(PMDeltaDirection.Up, "+12.5%"),
                    value = "\$48,200",
                )
            }
        }
        onNode(member("Stat") and hasContentDescription("Revenue") and hasContentDescription(PMStrings().loading))
            .assertExists()
        for (words in listOf("\$48,200", "12%", "+12.5%")) {
            onAllNodes(hasText(words, substring = true), useUnmergedTree = true).assertCountEquals(0)
            onAllNodes(hasContentDescription(words, substring = true), useUnmergedTree = true).assertCountEquals(0)
        }
    }

    /** `loadingLabel` names the value's placeholder in the app's words. */
    @Test
    fun aLoadingStatReadsItsLoadingLabel() = runComposeUiTest {
        setContent { Scene { PMStat(label = "Umsatz", loading = true, loadingLabel = "Lädt", value = "") } }
        onNode(member("Stat") and hasContentDescription("Lädt")).assertExists()
        onAllNodes(hasContentDescription(PMStrings().loading), useUnmergedTree = true).assertCountEquals(0)
    }

    /**
     * `deltaLabel` speaks the delta in the app's words (`stat.md`, A11y), from
     * its value, its direction and the sentiment the stat resolves: down is
     * bad news unless the app says otherwise.
     */
    @Test
    fun aStatSpeaksItsDeltaInTheAppsWords() = runComposeUiTest {
        setContent {
            Scene {
                PMStat(
                    delta = PMStatDelta("8%", PMDeltaDirection.Down),
                    deltaLabel = { delta ->
                        val moved = if (delta.direction == PMDeltaDirection.Down) "gesunken" else "gestiegen"
                        "$moved um ${delta.value}, ${if (delta.positive) "gut" else "schlecht"}"
                    },
                    label = "Umsatz",
                    value = "41.900 €",
                )
            }
        }
        onNode(member("Stat") and hasContentDescription("gesunken um 8%, schlecht")).assertExists()
        onAllNodes(hasContentDescription(PMStrings().negative, substring = true), useUnmergedTree = true)
            .assertCountEquals(0)
    }

    /* CodeBlock ------------------------------------------------------------- */

    /** A text clipboard the test holds, so a copy reaches no system clipboard. */
    @Suppress("DEPRECATION")
    private class HeldClipboard : androidx.compose.ui.platform.ClipboardManager {
        var held: AnnotatedString? = null

        override fun getText(): AnnotatedString? = held

        override fun setText(annotatedString: AnnotatedString) {
            held = annotatedString
        }
    }

    /**
     * A copy says `copiedLabel`, the app's words, through the block's polite
     * live region (`code-block.md`, A11y), and `PMStrings`' "Copied" when the
     * app passes none.
     */
    @Suppress("DEPRECATION")
    @Test
    fun aCodeBlockAnnouncesACopyInTheAppsWords() {
        val polite = SemanticsMatcher("a polite live region") {
            it.config.getOrNull(SemanticsProperties.LiveRegion) == LiveRegionMode.Polite
        }
        for ((given, heard) in listOf("Kopiert" to "Kopiert", null to PMStrings().copied)) {
            runComposeUiTest {
                mainClock.autoAdvance = false
                val clipboard = HeldClipboard()
                setContent {
                    CompositionLocalProvider(androidx.compose.ui.platform.LocalClipboardManager provides clipboard) {
                        Scene { PMCodeBlock(children = "pnpm install", copiedLabel = given, copyable = true) }
                    }
                }
                mainClock.advanceTimeByFrame()
                onNode(member("Button") and hasContentDescription(PMStrings().copy))
                    .performSemanticsAction(SemanticsActions.OnClick)
                mainClock.advanceTimeByFrame()
                assertEquals("pnpm install", clipboard.held?.text)
                onAllNodes(polite and hasContentDescription(heard), useUnmergedTree = true).assertCountEquals(1)
                if (given != null) {
                    onAllNodes(hasContentDescription(PMStrings().copied), useUnmergedTree = true).assertCountEquals(0)
                }
            }
        }
    }
}
