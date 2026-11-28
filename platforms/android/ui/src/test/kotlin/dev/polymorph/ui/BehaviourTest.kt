package dev.polymorph.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.platform.InterceptPlatformTextInput
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.PlatformTextInputInterceptor
import androidx.compose.ui.platform.SoftwareKeyboardController
import androidx.compose.ui.platform.UriHandler
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.ComposeUiTest
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.click
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasAnyChild
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performKeyInput
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.pressKey
import androidx.compose.ui.test.requestFocus
import androidx.compose.ui.test.v2.runComposeUiTest
import androidx.compose.ui.test.v2.runDesktopComposeUiTest
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import dev.polymorph.tokens.PMThemes
import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/**
 * What the members do when a person acts on them, composed by Compose for
 * desktop's test host and driven through its input and semantics: a press, a
 * key, a drag, the clock. Each test fails on the fault it names and passes on
 * the behaviour the member's header describes.
 */
@OptIn(ExperimentalTestApi::class)
class BehaviourTest {
    /** The default pairing in light mode, left to right or right to left. */
    @Composable
    private fun Scene(rtl: Boolean = false, content: @Composable () -> Unit) {
        Harness.Scene(Harness.passes.first()) {
            CompositionLocalProvider(LocalLayoutDirection provides if (rtl) LayoutDirection.Rtl else LayoutDirection.Ltr) { content() }
        }
    }

    /** The node whose identity is `name`, with each of `attributes`. */
    private fun member(name: String, vararg attributes: Pair<String, String>) = SemanticsMatcher("member $name") { node ->
        val member = node.config.getOrNull(PMMemberKey) ?: return@SemanticsMatcher false
        member.name == name && attributes.all { (key, value) -> member.attributes[key] == value }
    }

    /** The Button named `label`: a Button member is named by its content description. */
    private fun button(label: String) = member("Button") and hasContentDescription(label)

    /** An attribute of the member `name`'s node. */
    private fun ComposeUiTest.attribute(name: String, key: String): String? =
        onNode(member(name)).fetchSemanticsNode().config[PMMemberKey].attributes[key]

    private val SemanticsNodeInteraction.left: Float get() = fetchSemanticsNode().boundsInRoot.left

    /** Link and Card: a press on an `href` the handler cannot open does nothing, as Android's handler throws for one. */
    @Test
    fun aPressOnAnHrefNoHandlerOpensDoesNothing() = runComposeUiTest {
        var asked = 0
        val refusing = object : UriHandler {
            override fun openUri(uri: String) {
                asked += 1
                throw IllegalArgumentException("Can't open $uri.")
            }
        }
        setContent {
            Scene {
                CompositionLocalProvider(LocalUriHandler provides refusing) {
                    Column {
                        PMLink(children = "Billing", href = "/billing", variant = PMLinkVariant.Button)
                        PMLink(children = "Status page", href = "/status")
                        PMCard(href = "/tickets/1", label = "Ticket one") { Text("Ticket one") }
                    }
                }
            }
        }
        onNode(member("Button")).performSemanticsAction(SemanticsActions.OnClick)
        onNode(member("Link", "variant" to "inline")).performSemanticsAction(SemanticsActions.OnClick)
        onNode(hasContentDescription("Ticket one") and hasClickAction()).performSemanticsAction(SemanticsActions.OnClick)
        onNode(hasContentDescription("Ticket one") and hasClickAction()).performClick()
        waitForIdle()
        assertEquals(4, asked)
    }

    /**
     * Link and Breadcrumbs (`link.md` §Routing): `onNavigate` takes a press in
     * place of the URI handler, with the `href`; an external link, and a link
     * without it, open through the handler.
     */
    @Test
    fun onNavigateTakesALinkInPlaceOfOpeningIt() = runComposeUiTest {
        val routed = mutableListOf<String>()
        val opened = mutableListOf<String>()
        val handler = object : UriHandler {
            override fun openUri(uri: String) {
                opened += uri
            }
        }
        setContent {
            Scene {
                CompositionLocalProvider(LocalUriHandler provides handler) {
                    Column {
                        PMLink(children = "Tickets", href = "/tickets", onNavigate = { routed += it })
                        PMLink(children = "Billing", href = "/billing", onNavigate = { routed += it }, variant = PMLinkVariant.Button)
                        PMLink(children = "Status page", external = true, href = "https://example.com/status", onNavigate = { routed += it })
                        PMLink(children = "Docs", href = "/docs", variant = PMLinkVariant.Standalone)
                        PMBreadcrumbs(
                            items = listOf(PMBreadcrumbItem("Home", href = "/"), PMBreadcrumbItem("Ticket #4182")),
                            onNavigate = { routed += it },
                        )
                    }
                }
            }
        }
        onNode(member("Link", "variant" to "inline") and hasText("Tickets")).performSemanticsAction(SemanticsActions.OnClick)
        onNode(button("Billing")).performSemanticsAction(SemanticsActions.OnClick)
        onNode(member("Link", "external" to "true")).performSemanticsAction(SemanticsActions.OnClick)
        onNode(member("Link", "variant" to "standalone")).performSemanticsAction(SemanticsActions.OnClick)
        onNode(hasText("Home") and hasClickAction()).performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        assertEquals(listOf("/tickets", "/billing", "/"), routed)
        assertEquals(listOf("https://example.com/status", "/docs"), opened)
    }

    /**
     * Link (`link.md` §Routing): what the app's router throws reaches the app,
     * from the text link and from the costume, where an `href` the platform's
     * handler cannot open does nothing.
     */
    @Test
    fun whatTheRouterThrowsReachesTheApp() = runComposeUiTest {
        setContent {
            Scene {
                Column {
                    PMLink(children = "Tickets", href = "/tickets", onNavigate = { throw IllegalStateException("no route for $it") })
                    PMLink(
                        children = "Billing",
                        href = "/billing",
                        onNavigate = { throw IllegalStateException("no route for $it") },
                        variant = PMLinkVariant.Button,
                    )
                }
            }
        }
        val inline = assertFailsWith<IllegalStateException> {
            onNode(member("Link", "variant" to "inline")).performSemanticsAction(SemanticsActions.OnClick)
        }
        assertEquals("no route for /tickets", inline.message)
        val costume = assertFailsWith<IllegalStateException> {
            onNode(button("Billing")).performSemanticsAction(SemanticsActions.OnClick)
        }
        assertEquals("no route for /billing", costume.message)
    }

    /**
     * Breadcrumbs: a press on a crumb with an `href` and `onSelect` runs
     * `onSelect` and then follows the `href`, to the trail's `onNavigate` or
     * through the URI handler, as the web runs `onSelect` beside the click.
     */
    @Test
    fun aCrumbWithOnSelectAndAnHrefRunsBoth() {
        for (routes in listOf(true, false)) {
            runComposeUiTest {
                val did = mutableListOf<String>()
                val handler = object : UriHandler {
                    override fun openUri(uri: String) {
                        did += "opened $uri"
                    }
                }
                setContent {
                    Scene {
                        CompositionLocalProvider(LocalUriHandler provides handler) {
                            PMBreadcrumbs(
                                items = listOf(PMBreadcrumbItem("Queue", href = "/queue", onSelect = { did += "selected" }), PMBreadcrumbItem("Ticket #4182")),
                                onNavigate = if (routes) ({ did += "routed $it" }) else null,
                            )
                        }
                    }
                }
                onNode(hasText("Queue") and hasClickAction()).performSemanticsAction(SemanticsActions.OnClick)
                waitForIdle()
                assertEquals(listOf("selected", if (routes) "routed /queue" else "opened /queue"), did)
            }
        }
    }

    /**
     * Banner (`banner.md`): the dismiss button is named by `dismissLabel`, or
     * the spec's "Dismiss", and a press calls `onDismiss`; a Banner without it
     * has no button. The root is a live region with its role's politeness:
     * polite for `status`, assertive for danger's `alert`.
     */
    @Test
    fun aBannerDismissesThroughItsButtonAndIsALiveRegion() = runComposeUiTest {
        val dismissed = mutableListOf<String>()
        setContent {
            Scene {
                Column {
                    PMBanner(onDismiss = { dismissed += "Sunday" }, tone = PMBannerTone.Info) { Text("Maintenance on Sunday") }
                    PMBanner(dismissLabel = "Masquer", onDismiss = { dismissed += "Monday" }) { Text("Maintenance on Monday") }
                    PMBanner(tone = PMBannerTone.Danger) { Text("Payments are unavailable") }
                }
            }
        }
        onNode(button(PMStrings().dismiss)).performSemanticsAction(SemanticsActions.OnClick)
        onNode(button("Masquer")).performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        assertEquals(listOf("Sunday", "Monday"), dismissed)
        onAllNodes(member("Button")).assertCountEquals(2)
        val live = { tone: String -> onNode(member("Banner", "tone" to tone)).fetchSemanticsNode().config.getOrNull(SemanticsProperties.LiveRegion) }
        assertEquals(LiveRegionMode.Polite, live("info"))
        assertEquals(LiveRegionMode.Polite, live("neutral"))
        assertEquals(LiveRegionMode.Assertive, live("danger"))
    }

    /**
     * List (`list.md`): a press on an item with an `href` runs `onSelect` and
     * then follows the `href`, to `onNavigate` or through the URI handler; an
     * item with `onSelect` alone is a Button, selected while it is current; a
     * trailing control takes its own press, which never reaches the row; and
     * the list is a collection of its items.
     */
    @Test
    fun aListItemFollowsItsLinkOrIsPickedAndItsTrailingControlIsItsOwn() = runComposeUiTest {
        val did = mutableListOf<String>()
        val handler = object : UriHandler {
            override fun openUri(uri: String) {
                did += "opened $uri"
            }
        }
        setContent {
            Scene {
                CompositionLocalProvider(LocalUriHandler provides handler) {
                    PMList(label = "Members") {
                        PMListItem(href = "/members/ada", onNavigate = { did += "routed $it" }, onSelect = { did += "selected Ada" }, title = "Ada Okafor")
                        PMListItem(
                            current = true,
                            onSelect = { did += "picked Bao" },
                            title = "Bao Tran",
                            trailing = { PMButton(label = "Resend", onClick = { did += "resent" }, size = PMControlSize.Sm) },
                        )
                        PMListItem(href = "/members/carmen", title = "Carmen Ruiz")
                    }
                }
            }
        }
        onNode(hasText("Ada Okafor") and hasClickAction()).performSemanticsAction(SemanticsActions.OnClick)
        val bao = onNode(hasText("Bao Tran") and hasClickAction())
        bao.assertIsSelected()
        assertEquals(Role.Button, bao.fetchSemanticsNode().config.getOrNull(SemanticsProperties.Role))
        bao.performClick()
        onNode(button("Resend")).performClick()
        onNode(hasText("Carmen Ruiz") and hasClickAction()).performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        assertEquals(listOf("selected Ada", "routed /members/ada", "picked Bao", "resent", "opened /members/carmen"), did)
        val list = onNode(member("List") and hasContentDescription("Members")).fetchSemanticsNode()
        assertEquals(3, list.config[SemanticsProperties.CollectionInfo].rowCount)
    }

    /**
     * List (`list.md`): the row's press covers its trailing part. A press on a
     * trailing Badge is a press on the row, once, and the Badge's words are
     * part of the row's node; a press on a trailing Button runs the Button's
     * action and not the row's.
     */
    @Test
    fun aPressOnATrailingMarkPressesTheRowAndATrailingControlKeepsItsOwn() = runComposeUiTest {
        val did = mutableListOf<String>()
        setContent {
            Scene {
                PMList(label = "Invitations") {
                    PMListItem(
                        onSelect = { did += "picked Ada" },
                        title = "Ada Okafor",
                        trailing = { PMButton(label = "Resend", onClick = { did += "resent" }, size = PMControlSize.Sm) },
                    )
                    PMListItem(
                        onSelect = { did += "picked Bao" },
                        title = "Bao Tran",
                        trailing = { PMBadge(children = "Expired", tone = PMBadgeTone.Warning) },
                    )
                }
            }
        }
        onNode(hasText("Bao Tran") and hasClickAction()).assert(hasContentDescription("Expired"))
        onNode(hasContentDescription("Expired"), useUnmergedTree = true).performClick()
        waitForIdle()
        assertEquals(listOf("picked Bao"), did)
        onNode(button("Resend")).performClick()
        waitForIdle()
        assertEquals(listOf("picked Bao", "resent"), did)
    }

    /**
     * Tree (`tree.md`): opening and selecting are separate acts. A press on a
     * branch's chevron opens it and selects nothing, and adds no node; a press
     * on the rest of the row selects the item, once, and the row is selected;
     * a press on the selected row again reports nothing. The row's collapse and
     * expand actions close and open the branch, and so do the arrow keys, the
     * one toward the end of the line opening. A disabled item takes no press.
     * Each row that asks for more reports its level's parent, null for the top
     * level. The rows' identities carry their part, item, level and state.
     */
    @Test
    fun aTreeRowSelectsAndItsChevronOpensTheBranch() = runComposeUiTest {
        val selected = mutableListOf<String>()
        val opened = mutableListOf<Set<String>>()
        val asked = mutableListOf<String?>()
        setContent {
            Scene {
                PMTree(
                    hasMore = true,
                    items = listOf(
                        PMTreeItem(id = "engineering", label = "Engineering", children = listOf(PMTreeItem(id = "platform", label = "Platform")), hasMore = true),
                        PMTreeItem(id = "design", label = "Design", disabled = true),
                    ),
                    label = "Organization units",
                    onChange = { selected += it },
                    onExpandedChange = { opened += it },
                    onLoadMore = { asked += it },
                )
            }
        }
        val engineering = onNode(member("Tree", "item" to "engineering"))
        assertEquals("collapsed", engineering.fetchSemanticsNode().config.getOrNull(SemanticsProperties.StateDescription))
        engineering.assertIsNotSelected()
        // The chevron is the toggle column's middle, at the row's start.
        engineering.performTouchInput { click(Offset(PMThemes.default.defaultDensity.hitTarget.dp.toPx() / 2, centerY)) }
        waitForIdle()
        assertEquals(listOf(setOf("engineering")), opened)
        assertEquals(emptyList(), selected)
        assertEquals("expanded", engineering.fetchSemanticsNode().config.getOrNull(SemanticsProperties.StateDescription))
        onAllNodes(hasClickAction()).assertCountEquals(5)

        val platform = onNode(member("Tree", "part" to "row", "item" to "platform", "level" to "1"))
        platform.performClick()
        waitForIdle()
        assertEquals(listOf("platform"), selected)
        platform.assertIsSelected()
        platform.performClick()
        onNode(member("Tree", "item" to "design", "disabled" to "true")).assertIsNotEnabled().performClick()
        waitForIdle()
        assertEquals(listOf("platform"), selected, "the selected item again and a disabled one report nothing")

        onNode(member("Tree", "part" to "more", "level" to "1")).performClick()
        onNode(member("Tree", "part" to "more", "level" to "0")).performClick()
        waitForIdle()
        assertEquals(listOf("engineering", null), asked)

        engineering.performSemanticsAction(SemanticsActions.Collapse)
        waitForIdle()
        assertEquals(listOf(setOf("engineering"), emptySet()), opened)
        engineering.requestFocus()
        engineering.performKeyInput { pressKey(Key.DirectionRight) }
        waitForIdle()
        engineering.performKeyInput { pressKey(Key.DirectionLeft) }
        waitForIdle()
        assertEquals(listOf(setOf("engineering"), emptySet(), setOf("engineering"), emptySet()), opened)
    }

    /**
     * TreeSelect (`tree-select.md`): on a phone's window the panel is the
     * bottom sheet, with Tree in it. Opening shows the chosen node: the
     * branches above it open, reported once. A press on the chosen node's row
     * closes the panel and reports nothing. Opening a branch leaves the panel
     * open; a press on a node's row chooses it, reports it and closes the
     * panel, and the field shows its label. The empty choice reports null and
     * the field shows its label as a value.
     */
    @Test
    fun aTreeSelectChoosesANodeAndClosesOnTheChosenOneAgain() = runComposeUiTest {
        val chosen = mutableListOf<String?>()
        val opened = mutableListOf<Set<String>>()
        setContent {
            Scene {
                CompositionLocalProvider(LocalPMCompactWindow provides true) {
                    PMTreeSelect(
                        ariaLabel = "Parent unit",
                        defaultValue = "storage",
                        emptyOption = "Top level",
                        items = listOf(
                            PMTreeItem(
                                id = "engineering",
                                label = "Engineering",
                                children = listOf(PMTreeItem(id = "platform", label = "Platform", children = listOf(PMTreeItem(id = "storage", label = "Storage")))),
                            ),
                            PMTreeItem(id = "sales", label = "Sales", children = listOf(PMTreeItem(id = "emea", label = "EMEA"))),
                        ),
                        label = "Organization units",
                        onChange = { chosen += it },
                        onExpandedChange = { opened += it },
                    )
                }
            }
        }
        val field = onNode(member("TreeSelect", "size" to "md") and hasContentDescription("Parent unit"))
        val shows = { field.fetchSemanticsNode().config.getOrNull(SemanticsProperties.StateDescription) }
        assertEquals("Storage", shows())
        field.performClick()
        waitForIdle()
        assertEquals(listOf(setOf("engineering", "platform")), opened)
        onNode(member("TreeSelect", "presentation" to "sheet")).assertExists()
        onNode(member("Tree", "item" to "storage")).assertIsSelected().performClick()
        waitForIdle()
        onAllNodes(member("Tree")).assertCountEquals(0)
        assertEquals(emptyList(), chosen, "the chosen node again closes the panel and reports nothing")

        field.performClick()
        waitForIdle()
        assertEquals(listOf(setOf("engineering", "platform")), opened, "the branches above it are open already")
        onNode(member("Tree", "item" to "sales")).performSemanticsAction(SemanticsActions.Expand)
        waitForIdle()
        onNode(member("Tree", "item" to "emea")).performClick()
        waitForIdle()
        assertEquals(listOf<String?>("emea"), chosen)
        onAllNodes(member("Tree")).assertCountEquals(0)
        assertEquals("EMEA", shows())

        field.performClick()
        waitForIdle()
        onNode(member("Tree", "level" to "0") and hasText("Top level")).performClick()
        waitForIdle()
        assertEquals(listOf("emea", null), chosen)
        assertEquals("Top level", shows())
    }

    /**
     * SectionNav (`link.md` §Routing): a press on an item, the current one
     * included, calls `onNavigate` with its `href` in place of the URI
     * handler; without it the item opens through the handler. The current
     * item is selected, and the root names its `href`.
     */
    @Test
    fun aSectionNavRoutesEveryItemAndMarksTheCurrentOne() {
        for (routes in listOf(true, false)) {
            runComposeUiTest {
                val did = mutableListOf<String>()
                val handler = object : UriHandler {
                    override fun openUri(uri: String) {
                        did += "opened $uri"
                    }
                }
                setContent {
                    Scene {
                        CompositionLocalProvider(LocalUriHandler provides handler) {
                            PMSectionNav(
                                current = "/identity/users/",
                                items = listOf(PMSectionNavItem("Users", "/identity/users"), PMSectionNavItem("Groups", "/identity/groups")),
                                label = "Identity sections",
                                onNavigate = if (routes) ({ did += "routed $it" }) else null,
                            )
                        }
                    }
                }
                onNode(hasText("Users") and hasClickAction()).assertIsSelected()
                // Not marked at all, as the web's other links carry no `aria-current`.
                val groups = onNode(hasText("Groups") and hasClickAction()).fetchSemanticsNode()
                assertEquals(null, groups.config.getOrNull(SemanticsProperties.Selected))
                assertEquals("/identity/users", attribute("SectionNav", "current"))
                onNode(hasText("Users") and hasClickAction()).performClick()
                onNode(hasText("Groups") and hasClickAction()).performSemanticsAction(SemanticsActions.OnClick)
                waitForIdle()
                val way = if (routes) "routed" else "opened"
                assertEquals(listOf("$way /identity/users", "$way /identity/groups"), did)
            }
        }
    }

    /**
     * CursorPagination's append form remembers that it asked for a window and
     * never reads `hasPrevious`: after a press, `hasNext` turning false takes
     * the action away and the end line says the list ran out, and a form that
     * never asked draws nothing without a next window.
     */
    @Test
    fun theAppendFormEndsTheListAfterAPress() = runComposeUiTest {
        var hasNext by mutableStateOf(true)
        setContent {
            Scene {
                Column {
                    PMCursorPagination(hasNext = hasNext, hasPrevious = false, label = "Feed", mode = PMCursorPaginationMode.Append, onNext = { hasNext = false })
                    PMCursorPagination(hasNext = false, hasPrevious = true, label = "Log", mode = PMCursorPaginationMode.Append, onNext = {})
                }
            }
        }
        onAllNodes(member("CursorPagination")).assertCountEquals(1)
        onNode(button("Load more")).performClick()
        waitForIdle()
        onAllNodes(hasText("No more to load"), useUnmergedTree = true).assertCountEquals(1)
        onAllNodes(button("Load more")).assertCountEquals(0)
        onAllNodes(member("CursorPagination")).assertCountEquals(1)
    }

    /**
     * Alert draws nothing with no title and no `children`, whatever else it is
     * given: an empty title, a dismiss handler and an action are not content.
     * It draws once its title arrives, and a title alone is drawn.
     */
    @Test
    fun anAlertWithNothingToSayDrawsNothingUntilItsTitleArrives() = runComposeUiTest {
        var title by mutableStateOf("")
        setContent {
            Scene {
                PMAlert(
                    action = { PMButton(label = "Retry", size = PMControlSize.Sm, appearance = PMButtonAppearance.GhostNeutral) },
                    onDismiss = {},
                    title = title,
                    tone = PMAlertTone.Danger,
                )
            }
        }
        onAllNodes(member("Alert")).assertCountEquals(0)
        onAllNodes(button("Retry")).assertCountEquals(0)

        title = "The changes could not be saved"
        waitForIdle()
        onAllNodes(member("Alert", "tone" to "danger")).assertCountEquals(1)
        onAllNodes(hasText("The changes could not be saved"), useUnmergedTree = true).assertCountEquals(1)
        onAllNodes(button("Retry")).assertCountEquals(1)

        title = ""
        waitForIdle()
        onAllNodes(member("Alert")).assertCountEquals(0)
    }

    /**
     * CursorPagination's `disabled` is the app's hold: both directions are
     * disabled, and they come back when the hold ends. A direction the list
     * has no cursor for stays disabled either way.
     */
    @Test
    fun aHeldPagerDisablesEveryDirection() = runComposeUiTest {
        var held by mutableStateOf(true)
        setContent {
            Scene {
                Column {
                    PMCursorPagination(disabled = held, hasNext = true, hasPrevious = true, label = "Tickets", onNext = {}, onPrevious = {})
                    PMCursorPagination(disabled = held, hasNext = true, hasPrevious = false, label = "Feed", mode = PMCursorPaginationMode.Append, onNext = {})
                }
            }
        }
        onNode(button("Previous")).assertIsNotEnabled()
        onNode(button("Next")).assertIsNotEnabled()
        onNode(button("Load more")).assertIsNotEnabled()

        held = false
        waitForIdle()
        onNode(button("Previous")).assertIsEnabled()
        onNode(button("Next")).assertIsEnabled()
        onNode(button("Load more")).assertIsEnabled()
    }

    /**
     * Pagination's `disabled` is the app's hold: both arrows and every page
     * are disabled, the current page too, and they come back when the hold
     * ends. An arrow at an end of the list stays disabled either way.
     */
    @Test
    fun aHeldPaginationDisablesEveryControl() = runComposeUiTest {
        var held by mutableStateOf(true)
        var asked = 0
        setContent {
            Scene {
                PMPagination(disabled = held, onPageChange = { asked += 1 }, page = 1.0, pageCount = 3.0)
            }
        }
        for (name in listOf("Previous page", "Page 1", "Page 2", "Page 3", "Next page")) {
            onNode(button(name)).assertIsNotEnabled()
        }
        onAllNodes(member("Pagination", "disabled" to "true")).assertCountEquals(1)

        held = false
        waitForIdle()
        for (name in listOf("Page 1", "Page 2", "Page 3", "Next page")) {
            onNode(button(name)).assertIsEnabled()
        }
        onNode(button("Previous page")).assertIsNotEnabled()
        onAllNodes(member("Pagination", "disabled" to "true")).assertCountEquals(0)
        assertEquals(0, asked)
    }

    /**
     * RelativeTime: `mode = Both` joins the moment and the phrase with the
     * app's `messages.both`, the moment first and the phrase second, so a
     * locale orders and punctuates them.
     */
    @Test
    fun bothIsJoinedByTheAppsMessages() = runComposeUiTest {
        val words = object : PMRelativeTimeWords {
            override fun phrase(moment: PMRelativeMoment, long: Boolean, named: Boolean, locale: String?) = "a distance"

            override fun absolute(moment: PMAbsoluteMoment, long: Boolean, locale: String?) = "the moment"
        }
        setContent {
            Scene {
                CompositionLocalProvider(LocalPMRelativeTimeWords provides words) {
                    PMRelativeTime(
                        messages = PMRelativeTimeMessages { moment, distance -> "$distance, after $moment" },
                        mode = PMRelativeTimeMode.Both,
                        value = "2026-08-04",
                    )
                }
            }
        }
        onNode(hasContentDescription("a distance, after the moment")).assertExists()
    }

    /**
     * Card: with `onNavigate`, a press on a linked card calls it with the
     * `href` in place of the URI handler, as Link does; without it, the
     * handler opens the `href`.
     */
    @Test
    fun aLinkedCardGoesToItsRouter() {
        for (routes in listOf(true, false)) {
            runComposeUiTest {
                val did = mutableListOf<String>()
                val handler = object : UriHandler {
                    override fun openUri(uri: String) {
                        did += "opened $uri"
                    }
                }
                setContent {
                    Scene {
                        CompositionLocalProvider(LocalUriHandler provides handler) {
                            PMCard(
                                href = "/settings/billing",
                                label = "Open billing settings",
                                onNavigate = if (routes) ({ did += "routed $it" }) else null,
                            ) { Text("Invoices and the plan.") }
                        }
                    }
                }
                onNode(hasContentDescription("Open billing settings") and hasClickAction()).performSemanticsAction(SemanticsActions.OnClick)
                waitForIdle()
                assertEquals(listOf(if (routes) "routed /settings/billing" else "opened /settings/billing"), did)
            }
        }
    }

    /**
     * ConfirmDialog: the phrase's field asks the keyboard for no correction,
     * as an `exact` Input does, where a plain Input asks for it, because a
     * correction can change a phrase such as "acme-billing" as it is typed.
     */
    @OptIn(ExperimentalComposeUiApi::class)
    @Test
    fun aTypedConfirmationsFieldAsksForNoCorrection() {
        val fields: List<Pair<Boolean, @Composable () -> Unit>> = listOf(
            false to {
                PMConfirmDialog(
                    confirmLabel = "Delete project",
                    confirmWith = "acme-billing",
                    description = "Its tickets, members and settings are deleted with it.",
                    onConfirm = {},
                    open = true,
                    title = "Delete the acme-billing project?",
                )
            },
            false to { PMInput(ariaLabel = "Project name", exact = true) },
            true to { PMInput(ariaLabel = "Subject") },
        )
        for ((corrects, field) in fields) {
            runComposeUiTest {
                val asked = mutableListOf<Boolean>()
                val sessions = PlatformTextInputInterceptor { request, next ->
                    asked += request.imeOptions.autoCorrect
                    next.startInputMethod(request)
                }
                setContent {
                    Scene { InterceptPlatformTextInput(sessions) { field() } }
                }
                onNode(hasSetTextAction()).requestFocus()
                waitForIdle()
                assertTrue(asked.isNotEmpty(), "the field asked for a keyboard")
                assertEquals(corrects, asked.last(), if (corrects) "a plain Input is corrected" else "nothing corrects the phrase")
            }
        }
    }

    /**
     * ChatThread: a reply that grows while the reader drags within the slack
     * of the end does not end the following. When the drag ends, the thread
     * moves to the end that growth made, and the next growth is followed too.
     */
    @Test
    fun aThreadFollowsTheReplyAgainOnceADragDuringItEnds() = runComposeUiTest {
        var turns by mutableStateOf(TURNS)
        setContent {
            Scene {
                Box(Modifier.size(320.dp, 240.dp)) {
                    PMChatThread(label = "Conversation", streaming = true) {
                        repeat(turns) { turn -> Box(Modifier.fillMaxWidth().height(60.dp)) { Text("Turn $turn") } }
                    }
                }
            }
        }
        val thread = onNode(hasScrollAction())
        val range = { thread.fetchSemanticsNode().config[SemanticsProperties.VerticalScrollAxisRange] }
        assertEquals(range().maxValue(), range().value(), "the thread starts at its end")
        thread.performTouchInput {
            down(center)
            moveBy(Offset(0f, viewConfiguration.touchSlop + 4f))
            moveBy(Offset(0f, 4f))
        }
        turns += 2
        waitForIdle()
        thread.performTouchInput {
            advanceEventTime(STILL_MILLIS)
            up()
        }
        waitForIdle()
        assertEquals(range().maxValue(), range().value(), "the drag ended short of the growth it held back")
        turns += 2
        waitForIdle()
        assertEquals(range().maxValue(), range().value(), "the thread no longer follows the reply")
    }

    /**
     * ColorInput: a rail whose gesture began before the plane changed the
     * colour keeps the saturation and brightness the plane chose.
     */
    @Test
    fun theHueRailKeepsWhatThePlaneChose() = runComposeUiTest {
        val reported = mutableListOf<String>()
        setContent {
            Scene { PMColorInput(defaultOpen = true, defaultValue = "8864f0", onChange = { reported += it }, pickerLabel = "Accent") }
        }
        val surfaces = onAllNodes(SemanticsMatcher("a drag surface") { it.config.isClearingSemantics && it.config.none() }, useUnmergedTree = true)
        // The rail first, so its gesture is running before the plane changes the colour.
        surfaces[1].performTouchInput { click(percentOffset(0.25f, 0.5f)) }
        waitForIdle()
        surfaces[0].performTouchInput { click(percentOffset(0.9f, 0.1f)) }
        waitForIdle()
        surfaces[1].performTouchInput { click(percentOffset(0.5f, 0.5f)) }
        waitForIdle()
        val (hue, saturation, brightness) = PMHexColor.hsva(reported.last())!!.toList()
        assertTrue(abs(hue - 180f) < 3f, "hue $hue")
        assertTrue(abs(saturation - 0.9f) < 0.02f && abs(brightness - 0.9f) < 0.02f, "the rail reset the plane's choice: $saturation, $brightness")
    }

    /** Combobox: the field shows the label of the option its value names, when the value changes and when the options arrive late. */
    @Test
    fun aComboboxShowsTheOptionItsValueNames() = runComposeUiTest {
        val fruit = listOf(PMComboboxOption(value = "a", label = "Apple"), PMComboboxOption(value = "b", label = "Banana"))
        var value by mutableStateOf<String?>("a")
        var options by mutableStateOf(fruit)
        setContent {
            Scene { PMCombobox(ariaLabel = "Fruit", onChange = { value = it }, options = options, value = PMSome(value)) }
        }
        val field = onNode(hasSetTextAction())
        field.assert(hasText("Apple"))
        value = "b"
        waitForIdle()
        field.assert(hasText("Banana"))
        options = emptyList()
        value = "a"
        waitForIdle()
        options = fruit
        waitForIdle()
        field.assert(hasText("Apple"))
    }

    /**
     * Combobox: the text follows the value, not the options. A query typed
     * while the app's own filtering drops the chosen option and a later page
     * brings it back stays the query, and a value set to nothing clears the
     * text, so a stale label is never read as a query.
     */
    @Test
    fun aComboboxKeepsTheQueryWhileTheOptionsChange() = runComposeUiTest {
        val fruit = listOf(PMComboboxOption(value = "a", label = "Apple"), PMComboboxOption(value = "b", label = "Banana"))
        var value by mutableStateOf<String?>("a")
        var options by mutableStateOf(fruit)
        setContent {
            Scene {
                PMCombobox(
                    ariaLabel = "Fruit",
                    filter = PMComboboxFilter.Off,
                    onChange = { value = it },
                    onInputChange = { query -> options = fruit.filter { it.label.startsWith(query, ignoreCase = true) } },
                    options = options,
                    value = PMSome(value),
                )
            }
        }
        val field = onNode(hasSetTextAction())
        val shows = { text: String -> SemanticsMatcher.expectValue(SemanticsProperties.EditableText, AnnotatedString(text)) }
        field.assert(shows("Apple"))
        field.performTextReplacement("Ban")
        waitForIdle()
        options = fruit
        waitForIdle()
        field.assert(shows("Ban"))
        value = null
        waitForIdle()
        field.assert(shows(""))
    }

    /**
     * ContextMenu: a long press during which the screen recomposes reports to
     * the newest `onOpenChange`, not to the one its gesture began under.
     */
    @Test
    fun aContextMenuLongPressSurvivesARecomposition() = runComposeUiTest {
        mainClock.autoAdvance = false
        var handler by mutableStateOf("first")
        val heard = mutableListOf<String>()
        setContent {
            Scene {
                val name = handler
                PMContextMenu(
                    entries = listOf(PMMenuEntry.Item(PMMenuItemEntry(label = "Archive", onSelect = {}))),
                    onOpenChange = { heard += "$name $it" },
                ) { Box(Modifier.size(120.dp).testTag("target")) }
            }
        }
        val target = onNode(hasTestTag("target"))
        var timeout = 0L
        target.performTouchInput {
            timeout = viewConfiguration.longPressTimeoutMillis
            down(center)
        }
        mainClock.advanceTimeByFrame()
        handler = "second"
        mainClock.advanceTimeByFrame()
        mainClock.advanceTimeBy(timeout * 2)
        target.performTouchInput { up() }
        mainClock.advanceTimeByFrame()
        assertEquals(listOf("second true"), heard)
    }

    /**
     * MultiSelect: the field's name is on a node of its own beside the chips,
     * not on a node around them, which TalkBack would read in place of the
     * chosen values. Typed text the field cannot take is announced in the
     * spec's words when the app gives none.
     */
    @Test
    fun aMultiSelectSpeaksItsChipsAndAnswersRefusals() = runComposeUiTest {
        val team = listOf(PMMultiSelectOption(value = "ana", label = "Ana Ruiz"), PMMultiSelectOption(value = "ben", label = "Ben Okafor"))
        setContent {
            Scene {
                PMMultiSelect(
                    allowCustom = true,
                    ariaLabel = "Assignees",
                    defaultOpen = true,
                    defaultValue = listOf("ana"),
                    options = team,
                    validate = { text -> text.takeIf { it.length > 3 } },
                )
            }
        }
        val named = onAllNodes(hasContentDescription("Assignees"), useUnmergedTree = true).fetchSemanticsNodes()
        assertTrue(named.isNotEmpty(), "nothing carries the field's name")
        for (node in named) {
            val inside = SemanticsAudit.walk(node).drop(1).mapNotNull { SemanticsAudit.spoken(it) }
            assertTrue("Ana Ruiz" !in inside, "the field's name is on a node around its chips")
        }
        val strings = PMStrings()
        val search = onAllNodes(hasSetTextAction()).onFirst()
        search.performTextReplacement("Zed")
        search.performImeAction()
        waitForIdle()
        onNode(hasContentDescription(strings.multiSelectRefused("Zed")), useUnmergedTree = true).assertExists()
        search.performTextReplacement("ana")
        search.performImeAction()
        waitForIdle()
        onNode(hasContentDescription(strings.multiSelectAlreadySelected("ana")), useUnmergedTree = true).assertExists()
    }

    /**
     * `countLabel` states TagInput's count in the app's words (`tag-input.md`,
     * FormField integration), given the count, `max` and whether the field
     * holds it. Without it, the string catalogue's sentence states the count.
     */
    @Test
    fun aTagInputStatesItsCountInTheAppsWords() = runComposeUiTest {
        val given = mutableListOf<PMTagInputCountFacts>()
        setContent {
            Scene {
                Column {
                    PMTagInput(ariaLabel = "Labels", defaultValue = listOf("a", "b"), max = 2.0)
                    PMTagInput(
                        ariaLabel = "Schlagwörter",
                        countLabel = { tags ->
                            given += tags
                            if (tags.atMax) "höchstens ${tags.max?.toInt()} Schlagwörter" else "${tags.count.toInt()} Schlagwörter"
                        },
                        defaultValue = listOf("a", "b"),
                        max = 2.0,
                    )
                }
            }
        }
        val states = { words: String -> SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, words) }
        onAllNodes(states(PMStrings().tagInputMaximum(2.0)), useUnmergedTree = true).assertCountEquals(1)
        onAllNodes(states("höchstens 2 Schlagwörter"), useUnmergedTree = true).assertCountEquals(1)
        assertEquals(PMTagInputCountFacts(2.0, 2.0, atMax = true), given.last())
    }

    /**
     * A removal says `removedLabel`, the app's words, through the field's
     * polite live region (`tag-input.md`, A11y), given the tag and how many
     * tags remain, and `PMStrings`' sentence when the app passes none.
     */
    @Test
    fun aTagInputAnnouncesARemovalInTheAppsWords() {
        val polite = SemanticsMatcher("a polite live region") {
            it.config.getOrNull(SemanticsProperties.LiveRegion) == LiveRegionMode.Polite
        }
        val given = mutableListOf<Pair<String, Double>>()
        val french: (String, Double) -> String = { tag, count ->
            given += tag to count
            "$tag retirée, il en reste ${count.toInt()}"
        }
        val strings = PMStrings()
        for ((label, heard) in listOf(french to "a retirée, il en reste 1", null to strings.tagInputRemoved("a", 1.0))) {
            runComposeUiTest {
                setContent { Scene { PMTagInput(ariaLabel = "Labels", defaultValue = listOf("a", "b"), removedLabel = label) } }
                onNode(hasContentDescription(strings.tagInputRemove("a")) and hasClickAction(), useUnmergedTree = true)
                    .performSemanticsAction(SemanticsActions.OnClick)
                waitForIdle()
                onAllNodes(polite and hasContentDescription(heard), useUnmergedTree = true).assertCountEquals(1)
            }
        }
        assertEquals(listOf("a" to 1.0), given)
    }

    /**
     * The steppers and the field's step actions are named by `messages`
     * (`number-input.md`, Icons), the app's words, and by `PMStrings`' names
     * when the app passes none.
     */
    @Test
    fun theSteppersAreNamedInTheAppsWords() {
        val strings = PMStrings()
        val french = PMNumberInputMessages(increment = "Augmenter", decrement = "Diminuer")
        for ((messages, names) in listOf(
            french to listOf("Augmenter", "Diminuer"),
            null to listOf(strings.numberInputIncrement, strings.numberInputDecrement),
        )) {
            runComposeUiTest {
                setContent { Scene { PMNumberInput(ariaLabel = "Seats", defaultValue = PMSome(5.0), messages = messages) } }
                for (name in names) {
                    onAllNodes(hasContentDescription(name) and hasClickAction(), useUnmergedTree = true).assertCountEquals(1)
                }
            }
        }
    }

    /**
     * The action key with nothing to do hides the keyboard: NumberInput's Done
     * with nothing to submit, SearchInput's Search outside a form, Combobox's
     * Done, and Done in an empty TagInput. MultiSelect's search field does the
     * same in its list's window, which provides a keyboard controller of its
     * own that the test host cannot replace, so the Android target holds it
     * (`MultiSelectKeyboardTest`).
     */
    @OptIn(ExperimentalComposeUiApi::class)
    @Test
    fun theActionKeyWithNothingToDoHidesTheKeyboard() {
        val fields: List<Pair<String, @Composable () -> Unit>> = listOf(
            "NumberInput" to { PMNumberInput(ariaLabel = "Seats") },
            "SearchInput" to { PMSearchInput(ariaLabel = "Search tickets") },
            "Combobox" to { PMCombobox(ariaLabel = "Fruit", options = listOf(PMComboboxOption(value = "a", label = "Apple"))) },
            "TagInput" to { PMTagInput(ariaLabel = "Labels") },
        )
        for ((name, field) in fields) {
            runComposeUiTest {
                var hidden = 0
                var ended = 0
                val keyboard = object : SoftwareKeyboardController {
                    override fun show() {}
                    override fun hide() {
                        hidden += 1
                    }
                }
                val sessions = PlatformTextInputInterceptor { request, next ->
                    try {
                        next.startInputMethod(request)
                    } finally {
                        ended += 1
                    }
                }
                setContent {
                    Scene {
                        CompositionLocalProvider(LocalSoftwareKeyboardController provides keyboard) {
                            InterceptPlatformTextInput(sessions) { field() }
                        }
                    }
                }
                val entry = onAllNodes(hasSetTextAction()).onFirst()
                entry.requestFocus()
                waitForIdle()
                entry.performImeAction()
                waitForIdle()
                assertTrue(hidden + ended > 0, "$name: the action key left the keyboard up")
            }
        }
    }

    /** Toast: the time stops while the card holds focus, and runs out without it. */
    @Test
    fun aToastWaitsWhileItsActionHoldsFocus() {
        for (focused in listOf(false, true)) {
            runComposeUiTest {
                mainClock.autoAdvance = false
                setContent {
                    Scene { PMToast(action = PMToastAction(label = "Undo", onClick = {}), durationMs = 5000.0, title = "Ticket archived") }
                }
                mainClock.advanceTimeBy(1_000)
                if (focused) onNode(button("Undo")).requestFocus()
                mainClock.advanceTimeBy(9_000)
                onAllNodes(member("Toast")).assertCountEquals(if (focused) 1 else 0)
            }
        }
    }

    /** Toast: a pause keeps the time left, and the time resumes from it when the pause ends. */
    @Test
    fun aToastResumesItsTimeAfterAPause() = runComposeUiTest {
        mainClock.autoAdvance = false
        setContent {
            Scene {
                Column {
                    PMButton(label = "Elsewhere")
                    PMToast(action = PMToastAction(label = "Undo", onClick = {}), durationMs = 5000.0, title = "Ticket archived")
                }
            }
        }
        mainClock.advanceTimeBy(4_000)
        onNode(button("Undo")).requestFocus()
        mainClock.advanceTimeBy(9_000)
        onAllNodes(member("Toast")).assertCountEquals(1)
        onNode(button("Elsewhere")).requestFocus()
        // A second is left; a timer that started again in full would keep the card.
        mainClock.advanceTimeBy(2_000)
        onAllNodes(member("Toast")).assertCountEquals(0)
    }

    /**
     * Toast: a call that sets neither `retained` nor `durationMs` takes its
     * tone's lifetime, as the web's store gives it: danger and warning stay
     * until they are dismissed, and success, info and neutral leave after the
     * default duration, unless the toast has an action, which keeps it whatever
     * its tone. A call that sets either takes what it sets.
     */
    @Test
    fun aToastTakesItsLifetimeFromItsTone() = runComposeUiTest {
        mainClock.autoAdvance = false
        val left = mutableListOf<String>()
        setContent {
            Scene {
                Column {
                    for (tone in PMToastTone.entries) {
                        PMToast(onDismiss = { left += tone.value }, title = "A ${tone.value} toast", tone = tone)
                    }
                    PMToast(onDismiss = { left += "danger, not retained" }, retained = false, title = "Could not save", tone = PMToastTone.Danger)
                    PMToast(durationMs = Double.POSITIVE_INFINITY, onDismiss = { left += "success, pinned" }, title = "Saved", tone = PMToastTone.Success)
                    PMToast(action = PMToastAction(label = "Undo", onClick = {}), onDismiss = { left += "success, with an action" }, title = "Ticket archived", tone = PMToastTone.Success)
                    PMToast(action = PMToastAction(label = "Undo", onClick = {}), durationMs = 5000.0, onDismiss = { left += "success, with an action and a time" }, title = "Ticket closed", tone = PMToastTone.Success)
                }
            }
        }
        mainClock.advanceTimeBy(4_000)
        assertEquals(emptyList(), left, "nothing leaves before the default duration")
        mainClock.advanceTimeBy(6_000)
        assertEquals(
            setOf("success", "info", "neutral", "danger, not retained", "success, with an action and a time"),
            left.toSet(),
        )
    }

    /**
     * Toast: `onDismiss` is called once when the card leaves by its close
     * button or its time, and not when its owner removes the member.
     */
    @Test
    fun aToastReportsItsDismissalAndNotItsRemoval() = runComposeUiTest {
        mainClock.autoAdvance = false
        var closed = 0
        var timedOut = 0
        var removed = 0
        var owned by mutableStateOf(true)
        setContent {
            Scene {
                Column {
                    PMToast(durationMs = Double.POSITIVE_INFINITY, onDismiss = { closed += 1 }, title = "Ticket archived")
                    PMToast(durationMs = 1000.0, onDismiss = { timedOut += 1 }, title = "Ticket assigned")
                    if (owned) PMToast(durationMs = Double.POSITIVE_INFINITY, onDismiss = { removed += 1 }, title = "Ticket synced")
                }
            }
        }
        mainClock.advanceTimeBy(500)
        onAllNodes(button("Dismiss")).onFirst().performClick()
        mainClock.advanceTimeBy(10_000)
        owned = false
        mainClock.advanceTimeBy(1_000)
        assertEquals(1, closed, "the close button reports the dismissal once")
        assertEquals(1, timedOut, "the time running out reports the dismissal once")
        assertEquals(0, removed, "the owner removing the toast is not a dismissal")
    }

    /**
     * Card: a title is one heading, spoken as written while it is drawn in
     * capitals, before the content.
     */
    @Test
    fun aCardsTitleIsAHeadingSpokenAsWritten() = runComposeUiTest {
        setContent {
            Scene { PMCard(title = "Billing") { Text("Invoices and the plan.") } }
        }
        onNode(SemanticsMatcher.keyIsDefined(SemanticsProperties.Heading) and hasContentDescription("Billing"), useUnmergedTree = true)
            .assertExists()
        onNode(member("Card", "headingLevel" to "2")).assertExists()
    }

    /**
     * ConfirmDialog's typed confirmation: focus starts in the field, the
     * confirm stays disabled until the field holds the phrase (letter case and
     * the spaces around it aside), the error shows at the first character that
     * cannot lead to the phrase and goes when the text can again, and the
     * confirm then runs once.
     */
    @Test
    fun aTypedConfirmationWaitsForThePhrase() = runComposeUiTest {
        var confirmed = 0
        setContent {
            Scene {
                PMConfirmDialog(
                    confirmLabel = "Delete project",
                    confirmWith = "acme-billing",
                    description = "Its tickets, members and settings are deleted with it.",
                    onConfirm = { confirmed += 1 },
                    open = true,
                    title = "Delete the acme-billing project?",
                )
            }
        }
        val field = onNode(hasSetTextAction())
        val confirm = onNode(button("Delete project"))
        val error = onNode(hasText("The text does not match"), useUnmergedTree = true)
        field.assertIsFocused()
        confirm.assertIsNotEnabled()

        field.performTextInput("acme-b")
        error.assertDoesNotExist()
        field.performTextInput("u")
        error.assertExists()
        field.assertIsFocused()
        confirm.assertIsNotEnabled()

        field.performTextReplacement(" ACME-Billing ")
        error.assertDoesNotExist()
        confirm.assertIsEnabled()
        confirm.performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        assertEquals(1, confirmed, "the confirm runs once the phrase is typed")
    }

    /**
     * ConfirmDialog, Popover's sheet and Menu's anchored panel on a short
     * window: what does not fit scrolls, and ConfirmDialog's buttons stay on
     * screen.
     */
    @Test
    fun anOverlayTallerThanItsRoomScrolls() {
        runDesktopComposeUiTest(360, 360) {
            setContent {
                Scene { PMConfirmDialog(confirmLabel = "Discard", description = LONG, onConfirm = {}, open = true, title = "Discard this ticket?") }
            }
            onNode(button("Discard")).assertIsDisplayed()
        }
        runDesktopComposeUiTest(360, 360) {
            setContent {
                Scene {
                    PMPopover(defaultOpen = true, label = "Filters", trigger = { PMButton(label = "Filters") }) {
                        Column { repeat(ROWS) { Text("Row $it") } }
                    }
                }
            }
            onNode(hasScrollAction() and hasAnyAncestor(SemanticsMatcher.expectValue(SemanticsProperties.PaneTitle, "Filters"))).assertExists()
        }
        runDesktopComposeUiTest(800, 300) {
            setContent {
                Scene {
                    PMMenu(
                        defaultOpen = true,
                        items = (1..ROWS).map { PMMenuEntry.Item(PMMenuItemEntry(label = "Action $it", onSelect = {})) },
                        presentation = PMMenuPresentation.Popover,
                        trigger = { PMButton(label = "More") },
                    )
                }
            }
            onNode(hasScrollAction() and member("Menu")).assertExists()
            onNode(hasContentDescription("Action $ROWS")).performScrollTo().assertIsDisplayed()
        }
        runDesktopComposeUiTest(800, 300) {
            setContent {
                Scene {
                    CompositionLocalProvider(LocalPMCompactWindow provides false) {
                        PMPopover(defaultOpen = true, label = "Filters", trigger = { PMButton(label = "Filters") }) {
                            Column { repeat(ROWS) { Text("Row $it") } }
                        }
                    }
                }
            }
            onNode(hasText("Row ${ROWS - 1}")).performScrollTo().assertIsDisplayed()
        }
        runDesktopComposeUiTest(PHONE_WIDTH, 360) {
            setContent { Scene { PMDatePicker(ariaLabel = "Due", defaultOpen = true, locale = "en-US") } }
            val pane = SemanticsMatcher.expectValue(SemanticsProperties.PaneTitle, PMStrings().datePickerChooseDate)
            onNode(SemanticsMatcher.keyIsDefined(SemanticsProperties.VerticalScrollAxisRange) and (pane or hasAnyAncestor(pane))).assertExists()
        }
    }

    /**
     * AvatarButton (`avatar-button.md`): as the trigger of a Menu or a Popover
     * a press runs its own action and opens the overlay, as a Button's does.
     * While loading a press does neither.
     */
    @Test
    fun anAvatarButtonOpensTheOverlayItTriggers() {
        val avatar = { label: String -> member("AvatarButton") and hasContentDescription(label) }
        runDesktopComposeUiTest(800, 600) {
            var clicks = 0
            val opens = mutableListOf<Boolean>()
            setContent {
                Scene {
                    PMMenu(
                        items = listOf(PMMenuEntry.Item(PMMenuItemEntry(label = "Sign out", onSelect = {}))),
                        onOpenChange = { opens += it },
                        trigger = { PMAvatarButton(label = "Account menu", name = "Ada Lovelace", onClick = { clicks += 1 }) },
                    )
                }
            }
            onNode(avatar("Account menu")).assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button))
            onNode(avatar("Account menu")).performSemanticsAction(SemanticsActions.OnClick)
            waitForIdle()
            assertEquals(1, clicks)
            assertEquals(listOf(true), opens)
            onNode(hasContentDescription("Sign out")).assertExists()
        }
        runDesktopComposeUiTest(800, 600) {
            val opens = mutableListOf<Boolean>()
            setContent {
                Scene {
                    PMPopover(
                        label = "Account",
                        onOpenChange = { opens += it },
                        trigger = { PMAvatarButton(label = "Account menu", name = "Ada Lovelace") },
                    ) { Text("Signed in as Ada Lovelace") }
                }
            }
            onNode(avatar("Account menu")).performSemanticsAction(SemanticsActions.OnClick)
            waitForIdle()
            assertEquals(listOf(true), opens)
            onNode(hasText("Signed in as Ada Lovelace")).assertExists()
        }
        runDesktopComposeUiTest(800, 600) {
            var clicks = 0
            val opens = mutableListOf<Boolean>()
            setContent {
                Scene {
                    PMPopover(
                        label = "Account",
                        onOpenChange = { opens += it },
                        trigger = {
                            PMAvatarButton(label = "Account menu", loading = true, name = "Ada Lovelace", onClick = { clicks += 1 })
                        },
                    ) { Text("Signed in as Ada Lovelace") }
                }
            }
            onNode(avatar("Account menu")).performSemanticsAction(SemanticsActions.OnClick)
            waitForIdle()
            assertEquals(0, clicks)
            assertEquals(emptyList(), opens)
        }
    }

    /**
     * DatePicker's and DateRangePicker's calendar windows are outside the
     * field that opens them: a SettingsRow's label does not name their Close
     * button. Without `messages` their panes are named in the spec's words.
     */
    @Test
    fun aCalendarWindowIsOutsideItsField() {
        val strings = PMStrings()
        for (range in listOf(false, true)) {
            runDesktopComposeUiTest(PHONE_WIDTH, PHONE_HEIGHT) {
                setContent {
                    Scene {
                        PMSettingsRow(
                            label = "Report window",
                            control = {
                                if (range) {
                                    PMDateRangePicker(defaultOpen = true, locale = "en-US")
                                } else {
                                    PMDatePicker(defaultOpen = true, locale = "en-US")
                                }
                            },
                        )
                    }
                }
                waitForIdle()
                val pane = if (range) strings.dateRangePickerChooseRange else strings.datePickerChooseDate
                onNode(SemanticsMatcher.expectValue(SemanticsProperties.PaneTitle, pane)).assertExists()
                if (range) {
                    onNode(button(strings.close)).assertExists()
                    onAllNodes(button("Report window") and hasAnyAncestor(SemanticsMatcher.expectValue(SemanticsProperties.PaneTitle, pane)))
                        .assertCountEquals(0)
                }
            }
        }
    }

    /**
     * DateRangePicker's calendar in its input mode: typed ends that span an
     * unavailable day stay as typed and are not reported.
     */
    @Test
    fun typedEndsAcrossAnUnavailableDayStay() = runComposeUiTest {
        val june = { day: Int -> PMCalendarDate(year = 2026.0, month = 6.0, day = day.toDouble()) }
        val picked = mutableListOf<PMDateRange>()
        setContent {
            Scene {
                CompositionLocalProvider(LocalPMToday provides june(1)) {
                    PMDateRangePickerPanel(
                        start = null,
                        end = null,
                        minValue = null,
                        maxValue = null,
                        unavailable = { it.month == 6.0 && it.day == 10.0 },
                        locale = "en-US",
                        firstDayOfWeek = null,
                        title = null,
                        onPick = { picked += it },
                    )
                }
            }
        }
        onNode(hasContentDescription("input mode", substring = true, ignoreCase = true) and hasClickAction()).performClick()
        waitForIdle()
        val ends = onAllNodes(hasSetTextAction())
        ends[0].performTextInput("06082026")
        waitForIdle()
        val typed = ends[0].fetchSemanticsNode().config[SemanticsProperties.EditableText].text
        ends[1].performTextInput("06122026")
        waitForIdle()
        assertEquals(emptyList(), picked)
        assertEquals(typed, ends[0].fetchSemanticsNode().config[SemanticsProperties.EditableText].text, "the start the person typed was replaced")
    }

    /** Carousel: a rail with more dots than fit snaps to whole dots when a drag ends, so no dot rests cut at its edge. */
    @Test
    fun aDraggedDotRailRestsOnWholeDots() = runComposeUiTest {
        val slides = (0 until SLIDES).map { PMCarouselSlide(id = "s$it", label = "Slide $it", content = { Text("Slide $it") }) }
        setContent {
            Scene {
                Box(Modifier.width(CAROUSEL_WIDTH.dp)) {
                    PMCarousel(label = "Tour", nextLabel = "Next", previousLabel = "Previous", slides = slides)
                }
            }
        }
        val dot = SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button) and hasContentDescription("Slide", substring = true)
        val rail = onNode(hasScrollAction() and hasAnyChild(dot))
        rail.performTouchInput {
            down(center)
            moveBy(Offset(-(viewConfiguration.touchSlop + DRAG), 0f))
            advanceEventTime(STILL_MILLIS)
            up()
        }
        waitForIdle()
        val slot = PM_HIT_TARGET
        for (node in onAllNodes(dot).fetchSemanticsNodes()) {
            val width = node.boundsInRoot.width
            assertTrue(width == 0f || abs(width - slot) < 1f, "a dot rests cut at the rail's edge: ${node.boundsInRoot}")
        }
    }

    /**
     * Markdown: a table row whose cell holds a Citation mark keeps the mark's
     * room in every cell, so the cells' words start on one line.
     */
    @Test
    fun aTableRowWithAMarkStaysInLine() = runDesktopComposeUiTest(TABLET_WIDTH, PHONE_HEIGHT) {
        val sources = listOf(PMCitationSource(title = "Retry guide", href = "https://docs.example.com/retries"))
        setContent { Scene { PMMarkdown(children = "| Rule | Wait |\n| --- | --- |\n| Retry [1] | Two seconds |", sources = sources) } }
        waitForIdle()
        val top = { text: String -> onNode(hasText(text, substring = true), useUnmergedTree = true).fetchSemanticsNode().boundsInRoot.top }
        assertEquals(top("Retry"), top("Two seconds"), "the cell with the mark sits lower than its neighbour")
    }

    /**
     * Popover, Dialog and Drawer on a phone's window, Dialog as a sheet, and
     * Popover anchored: a ScrollArea in the overlay's body styles the body's
     * scroll rather than nesting a second one, which Compose cannot measure.
     * The overlay opens, the area reports the rail the body draws for it, the
     * body is the one region that scrolls, and the last row scrolls into view.
     */
    @Test
    fun aScrollAreaInAnOverlayScrollsTheOverlaysBody() {
        val overlays: List<Pair<String, @Composable (@Composable () -> Unit) -> Unit>> = listOf(
            "Popover, a sheet" to { content ->
                PMPopover(defaultOpen = true, label = "Filters", trigger = { PMButton(label = "Filters") }) { content() }
            },
            "Popover, anchored" to { content ->
                CompositionLocalProvider(LocalPMCompactWindow provides false) {
                    PMPopover(defaultOpen = true, label = "Filters", trigger = { PMButton(label = "Filters") }) { content() }
                }
            },
            "Dialog, full-screen" to { content -> PMDialog(defaultOpen = true, title = "Rows") { content() } },
            "Dialog, a sheet" to { content ->
                PMDialog(defaultOpen = true, presentation = PMDialogPresentation.Sheet, title = "Rows") { content() }
            },
            "Drawer, a sheet" to { content -> PMDrawer(defaultOpen = true, side = PMDrawerSide.End, title = "Rows") { content() } },
        )
        for ((name, overlay) in overlays) {
            runDesktopComposeUiTest(PHONE_WIDTH, PHONE_HEIGHT) {
                // Rows enough to overflow the tallest panel on the window.
                val rows = ROWS * 2
                setContent {
                    Scene { overlay { PMScrollArea(label = "Rows") { Column { repeat(rows) { Text("Row $it") } } } } }
                }
                waitForIdle()
                assertEquals("vertical", attribute("ScrollArea", "rails"), name)
                onAllNodes(hasScrollAction()).assertCountEquals(1)
                onNode(hasText("Row ${rows - 1}")).performScrollTo().assertIsDisplayed()
            }
        }
    }

    /**
     * A ScrollArea the app gives a height of its own inside a Dialog's body
     * scrolls itself: the body shares its scroll only where it offers
     * unbounded height.
     */
    @Test
    fun aSizedScrollAreaInAnOverlayScrollsItself() = runDesktopComposeUiTest(PHONE_WIDTH, PHONE_HEIGHT) {
        setContent {
            Scene {
                PMDialog(defaultOpen = true, title = "Rows") {
                    Box(Modifier.height(SIZED_AREA.dp)) { PMScrollArea(label = "Rows") { Column { repeat(ROWS) { Text("Row $it") } } } }
                }
            }
        }
        waitForIdle()
        assertEquals("vertical", attribute("ScrollArea", "rails"))
        onNode(hasText("Row ${ROWS - 1}")).performScrollTo().assertIsDisplayed()
    }

    /** ChatThread in a Popover on a phone's window: the thread follows through the body's scroll and starts at its end. */
    @Test
    fun aThreadInAnOverlayStartsAtItsEnd() = runDesktopComposeUiTest(PHONE_WIDTH, PHONE_HEIGHT) {
        setContent {
            Scene {
                PMPopover(defaultOpen = true, label = "Assistant", trigger = { PMButton(label = "Assistant") }) {
                    PMChatThread(label = "Conversation") {
                        repeat(TURNS) { turn -> Box(Modifier.fillMaxWidth().height(60.dp)) { Text("Turn $turn") } }
                    }
                }
            }
        }
        waitForIdle()
        val range = onNode(hasScrollAction()).fetchSemanticsNode().config[SemanticsProperties.VerticalScrollAxisRange]
        assertTrue(range.maxValue() > 0f, "the thread does not overflow the sheet")
        assertEquals(range.maxValue(), range.value(), "the thread does not start at its end")
    }

    /** Slider with a step that does not divide its range: the keys and TalkBack's adjustment move by the step. */
    @Test
    fun aSliderWithoutStepsMovesByItsStep() = runComposeUiTest {
        setContent { Scene { PMSlider(ariaLabel = "Volume", defaultValue = PMSliderValue.Single(42.0), step = 7.0) } }
        val thumb = onNode(SemanticsMatcher.keyIsDefined(SemanticsActions.SetProgress))
        val now = { attribute("Slider", "valuenow") }
        thumb.requestFocus()
        thumb.performKeyInput { pressKey(Key.DirectionRight) }
        assertEquals("49", now())
        thumb.performKeyInput { pressKey(Key.DirectionLeft) }
        assertEquals("42", now())
        thumb.performKeyInput { pressKey(Key.PageUp) }
        assertEquals("100", now())
        thumb.performKeyInput { pressKey(Key.PageDown) }
        assertEquals("28", now())
        thumb.performSemanticsAction(SemanticsActions.SetProgress) { it(30f) }
        assertEquals("35", now())
    }

    /** A range slider without steps: the focused thumb moves by the step and stops at the other. */
    @Test
    fun aRangeSlidersFocusedThumbMovesByItsStep() = runComposeUiTest {
        setContent { Scene { PMSlider(ariaLabel = "Price", defaultValue = PMSliderValue.Range(14.0 to 21.0), range = true, step = 7.0) } }
        val thumbs = onAllNodes(SemanticsMatcher.keyIsDefined(SemanticsActions.SetProgress))
        thumbs[1].requestFocus()
        thumbs[1].performKeyInput { pressKey(Key.DirectionRight) }
        assertEquals("14,28", attribute("Slider", "valuenow"))
        thumbs[0].requestFocus()
        thumbs[0].performKeyInput { pressKey(Key.PageUp) }
        assertEquals("28,28", attribute("Slider", "valuenow"))
    }

    /**
     * A range slider without steps: TalkBack's adjustment of a thumb, which
     * asks for a twentieth of the range, moves it at least one step.
     */
    @Test
    fun aRangeSlidersThumbMovesByTalkBacksAdjustment() = runComposeUiTest {
        setContent { Scene { PMSlider(ariaLabel = "Price", defaultValue = PMSliderValue.Range(15.0 to 60.0), range = true, step = 15.0) } }
        val thumbs = onAllNodes(SemanticsMatcher.keyIsDefined(SemanticsActions.SetProgress))
        thumbs[0].performSemanticsAction(SemanticsActions.SetProgress) { it(20f) }
        waitForIdle()
        assertEquals("30,60", attribute("Slider", "valuenow"))
        thumbs[1].performSemanticsAction(SemanticsActions.SetProgress) { it(55f) }
        waitForIdle()
        assertEquals("30,45", attribute("Slider", "valuenow"))
    }

    /** A member's test tag is its identifier, a value with a space in it encoded. */
    @Test
    fun aTestTagEncodesAValuesSpaces() = runComposeUiTest {
        val tabs = listOf(PMTabDescriptor(value = "open tickets", label = "Open"), PMTabDescriptor(value = "closed", label = "Closed"))
        setContent { Scene { PMTabs(tabs = tabs) {} } }
        onNode(hasTestTag("member:Tabs active=open%20tickets orientation=horizontal")).assertExists()
    }

    /** Tabs: the arrows along the strip, Home and End select a tab and move focus to it, the arrows swapped right to left. */
    @Test
    fun theArrowsHomeAndEndMoveAlongTheTabs() {
        val tabs = listOf(
            PMTabDescriptor(value = "open", label = "Open"),
            PMTabDescriptor(value = "waiting", label = "Waiting"),
            PMTabDescriptor(value = "closed", label = "Closed"),
        )
        for (rtl in listOf(false, true)) {
            runComposeUiTest {
                setContent { Scene(rtl) { PMTabs(tabs = tabs) {} } }
                val tab = { label: String -> onNode(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Tab) and hasText(label)) }
                val next = if (rtl) Key.DirectionLeft else Key.DirectionRight
                tab("Open").requestFocus()
                tab("Open").performKeyInput { pressKey(next) }
                waitForIdle()
                assertEquals("waiting", attribute("Tabs", "active"))
                tab("Waiting").assertIsFocused()
                tab("Waiting").performKeyInput { pressKey(Key.MoveEnd) }
                waitForIdle()
                assertEquals("closed", attribute("Tabs", "active"))
                tab("Closed").assertIsFocused()
                tab("Closed").performKeyInput { pressKey(next) }
                waitForIdle()
                assertEquals("open", attribute("Tabs", "active"))
                tab("Open").assertIsFocused()
            }
        }
    }

    /** TimeInput right to left: the hour is on the left, and the right arrow at its end moves to the minute. */
    @Test
    fun theRightArrowMovesFromTheHourToTheMinuteRightToLeft() = runComposeUiTest {
        setContent {
            Scene(rtl = true) {
                PMTimeInput(
                    ariaLabel = "Opens at",
                    defaultValue = PMSome(PMTime(hour = 17.0, minute = 45.0, second = 0.0, millisecond = 0.0)),
                    hourCycle = PMTimeInputHourCycle.HourCycle24,
                    locale = "en-US",
                )
            }
        }
        val hour = onNode(hasSetTextAction() and hasText("17"))
        val minute = onNode(hasSetTextAction() and hasText("45"))
        assertTrue(hour.left < minute.left, "the hour is drawn right of the minute")
        hour.requestFocus()
        hour.performKeyInput { pressKey(Key.DirectionRight) }
        waitForIdle()
        minute.assertIsFocused()
    }

    /**
     * DateRangePicker's calendar: a second press past an unavailable day
     * reports no range and starts a new one there; a range within the run is
     * reported.
     */
    @Test
    fun aRangeAcrossAnUnavailableDayIsNeverReported() = runComposeUiTest {
        val june = { day: Int -> PMCalendarDate(year = 2026.0, month = 6.0, day = day.toDouble()) }
        val picked = mutableListOf<PMDateRange>()
        setContent {
            Scene {
                CompositionLocalProvider(LocalPMToday provides june(1)) {
                    PMDateRangePickerPanel(
                        start = null,
                        end = null,
                        minValue = null,
                        maxValue = null,
                        unavailable = { it.month == 6.0 && it.day == 10.0 },
                        locale = "en-US",
                        firstDayOfWeek = null,
                        title = null,
                        onPick = { picked += it },
                    )
                }
            }
        }
        val day = { date: Int -> onNode(hasText("June $date, 2026", substring = true) and hasClickAction()) }
        day(8).performClick()
        day(12).performClick()
        waitForIdle()
        assertEquals(emptyList(), picked)
        day(12).assertIsSelected()
        day(8).assertIsNotSelected()
        day(14).performClick()
        waitForIdle()
        assertEquals(listOf(PMDateRange(june(12), june(14))), picked)
    }

    /** FileUpload: the dropzone is named by its name and then its hint. */
    @Test
    fun theDropzoneSpeaksItsHint() = runComposeUiTest {
        setContent {
            Scene {
                Column {
                    PMFileUpload(hint = HINT, onFilesAdd = {}, onReject = {}, onRemove = {}, title = "Attach statements")
                    PMFileUpload(ariaLabel = "Statements", hint = HINT, onFilesAdd = {}, onReject = {}, onRemove = {})
                }
            }
        }
        onNode(hasContentDescription("Attach statements, $HINT")).assertExists()
        onNode(hasContentDescription("Statements, $HINT")).assertExists()
    }

    /** SearchInput: an empty field shows the spec's "Search…" unless the app gives a placeholder. */
    @Test
    fun anEmptySearchFieldShowsTheSpecsPlaceholder() = runComposeUiTest {
        setContent { Scene { PMSearchInput(ariaLabel = "Search tickets") } }
        onNode(hasText(PMStrings().search), useUnmergedTree = true).assertExists()
    }

    /** ToneScope: what draws in the content colour inside draws in the other mode's `text.primary`. */
    @Test
    fun anInverseScopeDrawsInTheOtherModesTextColour() = runComposeUiTest {
        var inside: Color? = null
        setContent { Scene { PMToneScope(value = PMToneScopeValue.Inverse) { inside = LocalContentColor.current } } }
        waitForIdle()
        assertEquals(PMThemes.default.colors.textPrimary.resolve(true).color, inside)
    }

    /** PromptInput: the attach button is drawn only when an app provides the picker it opens. */
    @Test
    fun theAttachButtonNeedsAFilePicker() = runComposeUiTest {
        val picker = object : PMFilePicker {
            override fun pick(accept: String?, multiple: Boolean, deliver: (List<PMFile>) -> Unit) {}
        }
        setContent {
            Scene {
                Column {
                    PMPromptInput(label = "Without a picker", onAttach = {}, onSubmit = {})
                    CompositionLocalProvider(LocalPMFilePicker provides picker) {
                        PMPromptInput(label = "With a picker", onAttach = {}, onSubmit = {})
                    }
                }
            }
        }
        val attach = PMStrings().promptInputMessages.attach
        onAllNodes(member("Button") and (hasContentDescription(attach) or hasText(attach))).assertCountEquals(1)
    }

    /**
     * AttachmentChip in PromptInput: a removable chip's surface is drawn at
     * the recipe's height, the small control height and `space.1` above and
     * below it (`attachment-chip.md`), not the hit target its remove button
     * reserves, whose touch area reaches past the surface into the room the
     * chip keeps around it. The drawn rows are those of the chip's node in
     * which anything but the composer's fill shows.
     */
    @Test
    fun aRemovableAttachmentChipIsDrawnAtTheRecipesHeight() = runDesktopComposeUiTest(PHONE_WIDTH, PHONE_HEIGHT) {
        setContent {
            Scene {
                PMPromptInput(
                    attachments = listOf(PMPromptAttachment(id = "log", name = "webhook-log.txt", size = 18_432.0)),
                    label = "Message Relay",
                    onRemoveAttachment = {},
                    onSubmit = {},
                )
            }
        }
        waitForIdle()
        val density = PMThemes.default.defaultDensity
        val recipe = density.controlHeight.sm + 2 * density.space[1]
        val chip = onNode(member("AttachmentChip"))
        val pixels = captureToImage(chip.fetchSemanticsNode()).toPixelMap()
        val fill = pixels[0, 0]
        val drawn = (0 until pixels.height).count { y -> (0 until pixels.width).any { x -> pixels[x, y] != fill } }
        assertEquals(recipe, drawn.toFloat(), "the removable chip's surface is not drawn at the recipe's height")
        assertEquals(PM_HIT_TARGET, chip.fetchSemanticsNode().size.height.toFloat(), "the chip keeps no room for its touch areas")
    }

    /**
     * AppShell's `banner` (`app-shell.md`): the content the app passes is a row
     * of its own across the window. The topbar and the content start under it
     * on a phone, and the rail does too on a tablet.
     */
    @Test
    fun aShellDrawsItsBannerAcrossTheFrameAboveItsNavigation() {
        val region = member("AppShell", "part" to "banner")
        for (width in listOf(PHONE_WIDTH, TABLET_WIDTH)) {
            runDesktopComposeUiTest(width, PHONE_HEIGHT) {
                setContent {
                    Scene {
                        PMAppShell(
                            banner = { Text("Payments are delayed") },
                            brand = { Text("Relay") },
                            sidebar = { Text("Inbox") },
                            topbar = PMAppShellTopbar(leading = { Text("Tickets") }),
                        ) { Text("Every ticket") }
                    }
                }
                waitForIdle()
                val banner = onNode(region).fetchSemanticsNode().boundsInRoot
                onNode(hasText("Payments are delayed") and hasAnyAncestor(region)).assertExists()
                assertEquals(0f, banner.top, "$width: the banner is not the frame's first row")
                assertEquals(0f, banner.left, "$width: the banner does not start at the frame's edge")
                assertEquals(width.toFloat(), banner.width, "$width: the banner does not span the frame")
                // On a phone the rail is the drawer's, off the screen while it is closed.
                val under = listOf("Tickets", "Every ticket") + if (width == TABLET_WIDTH) listOf("Relay", "Inbox") else emptyList()
                for (text in under) {
                    val top = onNode(hasText(text)).fetchSemanticsNode().boundsInRoot.top
                    assertTrue(top >= banner.bottom, "$width: \"$text\" starts above the banner's foot")
                }
            }
        }
    }

    /** A shell without a banner draws no row for one. */
    @Test
    fun aShellWithoutABannerDrawsNoRegionForOne() = runDesktopComposeUiTest(PHONE_WIDTH, PHONE_HEIGHT) {
        setContent { Scene { PMAppShell(sidebar = { Text("Inbox") }) { Text("Every ticket") } } }
        waitForIdle()
        onAllNodes(member("AppShell", "part" to "banner")).assertCountEquals(0)
    }

    /**
     * DataTable's `rowDetail` (`data-table.md`), in the list and in the table:
     * a row's disclosure is named from the row's name and collapsed. A press
     * draws the detail across the table, under its row and above the next, and
     * reports the open rows. A second press removes it. Neither press opens
     * the row.
     */
    @Test
    fun aRowsDisclosureDrawsItsDetailUnderTheRow() {
        val detail = member("DataTable", "part" to "detail")
        val disclosure = button("Details for Invoice 12")
        for (width in listOf(PHONE_WIDTH, TABLET_WIDTH)) {
            runDesktopComposeUiTest(width, PHONE_HEIGHT) {
                val reports = mutableListOf<Set<String>>()
                var opened = 0
                setContent { Scene { Invoices(onExpandedChange = { reports += it }, onRowClick = { opened += 1 }) } }
                waitForIdle()
                onNode(disclosure and member("Button", "expanded" to "false")).assertExists()
                onNode(member("DataTable", "expanded" to "0")).assertExists()
                onAllNodes(detail).assertCountEquals(0)

                onNode(disclosure).performClick()
                waitForIdle()
                assertEquals(listOf(setOf("i12")), reports, "$width: the press reports the open rows")
                onNode(disclosure and member("Button", "expanded" to "true")).assertExists()
                onNode(hasText("Lines of Invoice 12") and hasAnyAncestor(detail)).assertExists()
                val table = onNode(member("DataTable", "expanded" to "1")).fetchSemanticsNode().boundsInRoot
                val drawn = onNode(detail).fetchSemanticsNode().boundsInRoot
                val row = onNode(hasText("Invoice 12"), useUnmergedTree = true).fetchSemanticsNode().boundsInRoot
                val next = onNode(hasText("Invoice 13"), useUnmergedTree = true).fetchSemanticsNode().boundsInRoot
                assertTrue(drawn.top >= row.bottom, "$width: the detail starts above its row's foot")
                assertTrue(drawn.bottom <= next.top, "$width: the detail runs under the next row")
                assertEquals(table.left, drawn.left, "$width: the detail does not start at the table's edge")
                assertEquals(table.right, drawn.right, "$width: the detail does not span the table")

                onNode(disclosure).performClick()
                waitForIdle()
                assertEquals(listOf(setOf("i12"), emptySet()), reports, "$width: the second press reports no open row")
                onAllNodes(detail).assertCountEquals(0)
                assertEquals(0, opened, "$width: a press on the disclosure opened the row")
            }
        }
    }

    /**
     * DataTable: a disclosure's name is the spec's default, with the row's
     * name when `getRowName` gives one, and the app's `detailsLabel` in its
     * place when the messages hold one.
     */
    @Test
    fun aDisclosureIsNamedByTheAppsLabelOrTheDefault() = runDesktopComposeUiTest(TABLET_WIDTH, PHONE_HEIGHT) {
        var named by mutableStateOf(true)
        var messages by mutableStateOf<PMDataTableMessages?>(null)
        setContent { Scene { Invoices(named = named, messages = messages) } }
        waitForIdle()
        onNode(button("Details for Invoice 12")).assertExists()
        onNode(button("Details for Invoice 13")).assertExists()
        named = false
        waitForIdle()
        onAllNodes(button("Details")).assertCountEquals(2)
        messages = PMDataTableMessages(
            selected = { "$it selected" },
            selectAll = "Select all",
            selectRow = "Select row",
            detailsLabel = { name -> if (name == null) "More" else "More on $name" },
        )
        waitForIdle()
        onAllNodes(button("More")).assertCountEquals(2)
        named = true
        waitForIdle()
        onNode(button("More on Invoice 12")).assertExists()
        onNode(button("More on Invoice 13")).assertExists()
    }

    /**
     * DataTable: a row `isRowExpandable` refuses has no disclosure and draws
     * no detail, though the open rows name it.
     */
    @Test
    fun aRowThatTakesNoDetailHasNoDisclosure() = runDesktopComposeUiTest(TABLET_WIDTH, PHONE_HEIGHT) {
        setContent { Scene { Invoices(defaultExpanded = setOf("i12", "i13"), isRowExpandable = { it.id != "i13" }) } }
        waitForIdle()
        onNode(button("Details for Invoice 12")).assertExists()
        onAllNodes(button("Details for Invoice 13")).assertCountEquals(0)
        onAllNodes(member("DataTable", "part" to "detail")).assertCountEquals(1)
        onNode(hasText("Lines of Invoice 12")).assertExists()
        onAllNodes(hasText("Lines of Invoice 13")).assertCountEquals(0)
        onNode(member("DataTable", "expanded" to "1")).assertExists()
    }

    /**
     * DataTable with `expanded`: a press reports the next set and opens
     * nothing, and the table draws the rows the app holds open.
     */
    @Test
    fun aControlledTableReportsAPressAndDrawsWhatTheAppHolds() = runDesktopComposeUiTest(TABLET_WIDTH, PHONE_HEIGHT) {
        val detail = member("DataTable", "part" to "detail")
        var held by mutableStateOf(emptySet<String>())
        val reports = mutableListOf<Set<String>>()
        setContent { Scene { Invoices(expanded = held, onExpandedChange = { reports += it }) } }
        waitForIdle()
        onNode(button("Details for Invoice 12")).performClick()
        waitForIdle()
        assertEquals(listOf(setOf("i12")), reports, "the press reports the next set")
        onAllNodes(detail).assertCountEquals(0)
        onNode(button("Details for Invoice 12") and member("Button", "expanded" to "false")).assertExists()

        held = setOf("i13")
        waitForIdle()
        onAllNodes(detail).assertCountEquals(1)
        onNode(hasText("Lines of Invoice 13")).assertExists()
        onNode(button("Details for Invoice 13") and member("Button", "expanded" to "true")).assertExists()
    }

    /**
     * DataTable: the `close` a detail is handed closes its row and reports
     * the rows left open. Called again for the row it closed, it reports
     * nothing.
     */
    @Test
    fun aDetailsCloseCollapsesItsRow() = runDesktopComposeUiTest(TABLET_WIDTH, PHONE_HEIGHT) {
        val reports = mutableListOf<Set<String>>()
        var kept: (() -> Unit)? = null
        setContent {
            Scene {
                Invoices(
                    defaultExpanded = setOf("i12", "i13"),
                    onExpandedChange = { reports += it },
                    onDetail = { if (it.row.id == "i12") kept = it.close },
                )
            }
        }
        waitForIdle()
        onNode(button("Close Invoice 12")).performClick()
        waitForIdle()
        assertEquals(listOf(setOf("i13")), reports, "close reports the rows left open")
        onAllNodes(member("DataTable", "part" to "detail")).assertCountEquals(1)
        onNode(hasText("Lines of Invoice 13")).assertExists()
        onNode(button("Details for Invoice 12") and member("Button", "expanded" to "false")).assertExists()

        runOnIdle { kept?.invoke() }
        waitForIdle()
        assertEquals(listOf(setOf("i13")), reports, "close reported for a row that is not open")
    }

    /**
     * DataTable: `close` called while focus is inside the detail moves focus
     * to the row's disclosure, which stays when the detail leaves. Called
     * while focus is elsewhere, it leaves focus where it is.
     */
    @Test
    fun aDetailsCloseMovesFocusInsideItToTheRowsDisclosure() = runDesktopComposeUiTest(TABLET_WIDTH, PHONE_HEIGHT) {
        val detail = member("DataTable", "part" to "detail")
        var kept: (() -> Unit)? = null
        setContent {
            Scene { Invoices(defaultExpanded = setOf("i12", "i13"), onDetail = { if (it.row.id == "i13") kept = it.close }) }
        }
        waitForIdle()
        onNode(button("Close Invoice 12")).requestFocus()
        waitForIdle()
        onNode(button("Close Invoice 12")).performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        onAllNodes(detail).assertCountEquals(1)
        onNode(button("Details for Invoice 12")).assertIsFocused()

        runOnIdle { kept?.invoke() }
        waitForIdle()
        onAllNodes(detail).assertCountEquals(0)
        onNode(button("Details for Invoice 12")).assertIsFocused()
    }

    /**
     * DataTable, in the list and in the table: a row is named by `getRowName`,
     * its own name, and not by `getRowLabel`, which is the whole name of its
     * Checkbox. A row that is one node has that name, its click opens it, and
     * its select action has the Checkbox's name. A row whose nodes stay apart
     * has that name around a Checkbox with its own.
     */
    @Test
    fun aRowIsNamedByGetRowNameAndItsCheckboxByGetRowLabel() {
        val row = SemanticsMatcher.keyIsDefined(SemanticsProperties.CollectionItemInfo)
        for (width in listOf(PHONE_WIDTH, TABLET_WIDTH)) {
            runDesktopComposeUiTest(width, PHONE_HEIGHT) {
                val opened = mutableListOf<String>()
                setContent {
                    Scene { Invoices(detail = false, labelled = true, selection = emptySet(), onRowClick = { opened += it.id }) }
                }
                waitForIdle()
                val whole = onNode(row and hasContentDescription("Invoice 12"))
                whole.assertExists("$width: the row is not named by getRowName")
                onAllNodes(hasContentDescription("Select Invoice 12")).assertCountEquals(0)
                assertEquals(listOf("Select Invoice 12"), whole.selectActions, "$width: the select action's name")
                whole.performSemanticsAction(SemanticsActions.OnClick)
                waitForIdle()
                assertEquals(listOf("i12"), opened, "$width: the row's click opens it")
            }
            runDesktopComposeUiTest(width, PHONE_HEIGHT) {
                setContent { Scene { Invoices(labelled = true, selection = emptySet()) } }
                waitForIdle()
                onNode(row and hasContentDescription("Invoice 12")).assertExists("$width: the row is not named by getRowName")
                onAllNodes(row and hasContentDescription("Select Invoice 12")).assertCountEquals(0)
                onNode(member("Checkbox") and hasContentDescription("Select Invoice 12"))
                    .assertExists("$width: the Checkbox is not named by getRowLabel")
            }
        }
    }

    /**
     * DataTable without `getRowName`: a row keeps the name an app that passes
     * only `getRowLabel` has for it. It is `getRowLabel` when the app gives
     * one, and each column's header and value when it does not.
     */
    @Test
    fun aRowWithoutGetRowNameIsNamedByGetRowLabelOrItsCells() {
        val row = SemanticsMatcher.keyIsDefined(SemanticsProperties.CollectionItemInfo)
        for (width in listOf(PHONE_WIDTH, TABLET_WIDTH)) {
            runDesktopComposeUiTest(width, PHONE_HEIGHT) {
                setContent {
                    Scene { Invoices(detail = false, named = false, labelled = true, selection = emptySet(), onRowClick = {}) }
                }
                waitForIdle()
                val labelled = onNode(row and hasContentDescription("Select Invoice 12"))
                labelled.assertExists("$width: the row lost the name getRowLabel gives it")
                assertEquals(listOf("Select Invoice 12"), labelled.selectActions, "$width: the select action's name")
            }
            runDesktopComposeUiTest(width, PHONE_HEIGHT) {
                setContent { Scene { Invoices(detail = false, named = false, selection = emptySet(), onRowClick = {}) } }
                waitForIdle()
                val cells = onNode(row and hasContentDescription("Invoice: Invoice 12, Total: 40.00"))
                cells.assertExists("$width: the row lost the name its cells give it")
                assertEquals(listOf("Select row"), cells.selectActions, "$width: the select action's name")
            }
        }
    }

    /** The names of a node's custom accessibility actions. */
    private val SemanticsNodeInteraction.selectActions: List<String>
        get() = fetchSemanticsNode().config.getOrNull(SemanticsActions.CustomActions).orEmpty().map { it.label }

    /**
     * Two invoices in a DataTable. A row's detail is a line that names the row
     * and a Button that calls the `close` the detail is handed. `labelled`
     * gives each row's Checkbox its whole name, "Select Invoice 12", and
     * `selection` turns selection on.
     */
    @Composable
    private fun Invoices(
        expanded: Set<String>? = null,
        defaultExpanded: Set<String>? = null,
        detail: Boolean = true,
        isRowExpandable: ((Invoice) -> Boolean)? = null,
        labelled: Boolean = false,
        messages: PMDataTableMessages? = null,
        named: Boolean = true,
        onExpandedChange: ((Set<String>) -> Unit)? = null,
        onRowClick: ((Invoice) -> Unit)? = null,
        selection: Set<String>? = null,
        onDetail: (PMDataTableRowDetail<Invoice>) -> Unit = {},
    ) {
        val name: ((Invoice) -> String)? = if (named) ({ invoice -> invoice.name }) else null
        val label: ((Invoice) -> String)? = if (labelled) ({ invoice -> "Select ${invoice.name}" }) else null
        val lines: (@Composable (PMDataTableRowDetail<Invoice>) -> Unit)? = if (detail) {
            { row ->
                onDetail(row)
                Column {
                    Text("Lines of ${row.row.name}")
                    PMButton(label = "Close ${row.row.name}", onClick = row.close)
                }
            }
        } else {
            null
        }
        PMDataTable(
            columns = listOf(
                PMDataTableColumn<Invoice>("name", "Invoice", { it.name }),
                PMDataTableColumn("total", "Total", { it.total }),
            ),
            data = INVOICES,
            defaultExpanded = defaultExpanded,
            emptyState = PMEmptyStateProps(title = "No invoices"),
            expanded = expanded,
            getRowId = { it.id },
            getRowLabel = label,
            getRowName = name,
            isRowExpandable = isRowExpandable,
            label = "Invoices",
            messages = messages,
            onExpandedChange = onExpandedChange,
            onRowClick = onRowClick,
            onSelectionChange = {},
            rowDetail = lines,
            selection = selection,
        )
    }

    /**
     * Dialog, Popover anchored and as a sheet, and Drawer's side sheet: a
     * submit Button inside an overlay opened from a form does not submit the
     * form, which a submit Button beside the overlay does.
     */
    @Test
    fun anOverlayIsOutsideTheFormItOpensFrom() {
        val overlays: List<@Composable () -> Unit> = listOf(
            { PMDialog(defaultOpen = true, title = "Rename") { Inside() } },
            { PMPopover(defaultOpen = true, label = "Filters", trigger = { PMButton(label = "Filters") }) { Inside() } },
            {
                CompositionLocalProvider(LocalPMCompactWindow provides true) {
                    PMPopover(defaultOpen = true, label = "Filters", trigger = { PMButton(label = "Filters") }) { Inside() }
                }
            },
            { PMDrawer(defaultOpen = true, side = PMDrawerSide.End, title = "Details") { Inside() } },
        )
        for ((index, overlay) in overlays.withIndex()) {
            runComposeUiTest {
                var submitted = 0
                setContent {
                    Scene {
                        CompositionLocalProvider(LocalPMSubmitAction provides { submitted += 1 }) {
                            Column {
                                PMButton(label = "Save", type = PMButtonType.Submit)
                                overlay()
                            }
                        }
                    }
                }
                onNode(button("Inside")).performSemanticsAction(SemanticsActions.OnClick)
                waitForIdle()
                assertEquals(0, submitted, "overlay $index submitted the form behind it")
                onNode(button("Save")).performSemanticsAction(SemanticsActions.OnClick)
                waitForIdle()
                assertEquals(1, submitted, "overlay $index: the form's own submit Button")
            }
        }
    }

    /** A submit Button inside an overlay. */
    @Composable
    private fun Inside() {
        PMButton(label = "Inside", type = PMButtonType.Submit)
    }

    private companion object {
        /** The thread's turns before a reply grows. */
        const val TURNS = 12

        /** How long the finger rests before it lifts, so the drag ends without a fling. */
        const val STILL_MILLIS = 500L

        /** Rows enough to overflow a short window. */
        const val ROWS = 30

        /** A phone's window, in pixels at one pixel per dp. */
        const val PHONE_WIDTH = 360
        const val PHONE_HEIGHT = 640

        /** The height an app gives a ScrollArea of its own, in dp. */
        const val SIZED_AREA = 200

        /** A tablet's window width, where Table is a table. */
        const val TABLET_WIDTH = 800

        /** A carousel with more dots than its rail shows, in a box that narrow, and a drag of part of a slot. */
        const val SLIDES = 12
        const val CAROUSEL_WIDTH = 300
        const val DRAG = 20f

        /** The hit target in pixels, at the test host's one pixel per dp. */
        val PM_HIT_TARGET = PMThemes.default.defaultDensity.hitTarget

        const val HINT = "PDF or PNG, up to 10 MB"

        /** The rows of the DataTable whose details the tests open. */
        val INVOICES = listOf(Invoice("i12", "Invoice 12", "40.00"), Invoice("i13", "Invoice 13", "12.50"))

        val LONG = "The subject and requester you have typed will be lost, and so will the notes. ".repeat(ROWS)
    }
}

/** A row of the DataTable whose details the tests open. */
private data class Invoice(val id: String, val name: String, val total: String)
