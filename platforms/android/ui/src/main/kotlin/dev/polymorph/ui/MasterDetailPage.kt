// MasterDetailPage (`design/archetypes/master-detail-page.md`): a list of items
// of one kind beside the selected one's detail. It fills the region that holds
// it rather than scrolling down it: the page header at the top, and the list
// and the detail filling the rest, each scrolling on its own. The page column
// is fifteen of the largest space step wide at most
// (`PMRecipe.masterDetailPageMeasure`), with the page insets (one step smaller
// below 40rem) and `space.5` between the header and the panes.
//
// A list-detail layout in two arrangements, chosen by the page's own width, as
// the web's are:
//
// - **From 48rem** (`PMRecipe.masterDetailOnePaneBelow`): SplitPane's split,
//   the list the start pane and the detail the end pane, the list taking 0.32
//   of the width with floors of 240dp for the list and 420dp for the detail,
//   the web's numbers, read from its source into `PMRecipe`. The page has
//   measured its room, so it asks SplitPane for the split whatever the
//   window's width class. The split's separator is named by `listLabel`. The
//   detail starts `space.5` off the seam; with no `detail` it is the
//   `emptyState`, centred.
// - **Below 48rem** (a phone): one pane. While `detail` is absent the list
//   fills it. While `detail` is given the detail fills it under the way back,
//   Button's ghost/neutral/sm with the `back` glyph, named `backLabel`, as
//   DetailPage's, which stays put while the detail scrolls under it. The
//   system's Back does what the way back does: both call `onBack`, in which
//   the app clears its selection, through Compose's Back handler, which goes
//   through the activity's own Back dispatcher (`SystemBack`). The list stays
//   composed, unplaced and out of the semantics tree, while the
//   detail is drawn alone, so its scroll position and what it keeps itself
//   survive the way back.
//
// The list pane is a group named by `listLabel`, the web's region. Focus moves
// only when the element that held it is no longer drawn and the last focus in
// the page was in a pane, as the web's `masterDetailFocus` rules: to the way
// back when the detail is drawn alone, and into the list pane otherwise, at
// its first focusable element, because Compose cannot ask a list which item is
// current. Picking an item in the split moves nothing, and neither does a page
// composed with `detail` already given.
//
// The load status (`design/native/screen-contract.md`): the header renders in
// every state. `loading` draws Skeleton rows in the list pane; `failed` a
// danger Alert in place of the list, with `onRetry` when it is set; `empty` is
// `ready`, because the list draws its own empty state. The root carries
// `layout=split|single`, and `pane=list|detail` in the single arrangement.

package dev.polymorph.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.focusGroup
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.backhandler.BackHandler
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.layout.layout
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics

object PMMasterDetailPage : PMMasterDetailPageRendering {
    @Composable
    override fun Render(props: PMMasterDetailPageProps) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val status = props.loadStatus
        val detail = props.detail
        val listFocus = remember { FocusRequester() }
        val backFocus = remember { FocusRequester() }
        val focus = remember { PMMasterDetailFocus() }

        BoxWithConstraints(Modifier.fillMaxSize().background(theme.colors.bgApp.color)) {
            val page = minOf(maxWidth, space.s10 * PMRecipe.masterDetailPageMeasure)
            val stepped = page < PMRecipe.pageNarrowBelow
            val single = page < PMRecipe.masterDetailOnePaneBelow
            SystemBack(enabled = single && detail != null, onBack = props.onBack)

            // A change of arrangement, read in the composition that makes it,
            // before the focus it removes is cleared; then the rule's move.
            val drawn = when {
                single -> if (detail != null) PMMasterDetailDrawn.Detail else PMMasterDetailDrawn.List
                detail != null -> PMMasterDetailDrawn.SplitDetail
                else -> PMMasterDetailDrawn.Split
            }
            val change = remember(drawn) { focus.change(drawn) }
            LaunchedEffect(change) {
                when (change.target()) {
                    PMMasterDetailPane.Detail -> backFocus.requestFocus()
                    PMMasterDetailPane.List -> listFocus.requestFocus()
                    null -> {}
                }
            }

            val attributes = buildMap {
                put("status", status.kind)
                put("layout", if (single) "single" else "split")
                if (single) put("pane", if (detail != null) "detail" else "list")
            }
            Column(
                Modifier
                    .pmMember("MasterDetailPage", attributes)
                    .align(Alignment.TopCenter)
                    .widthIn(max = space.s10 * PMRecipe.masterDetailPageMeasure)
                    .fillMaxSize()
                    .padding(horizontal = if (stepped) space.s6 else space.s7, vertical = if (stepped) space.s5 else space.s6),
                verticalArrangement = Arrangement.spacedBy(space.s5),
            ) {
                Box(Modifier.onFocusChanged { if (it.hasFocus) focus.last = null }) {
                    PMPageHeader(actions = props.actions, description = props.description, title = props.title)
                }
                Box(Modifier.weight(1f).fillMaxWidth()) {
                    if (single) {
                        ListPane(props, focus, Modifier.focusRequester(listFocus).then(if (detail != null) Hidden else Modifier))
                        if (detail != null) {
                            Column(Modifier.fillMaxSize().onFocusChanged { if (it.hasFocus) focus.last = PMMasterDetailPane.Detail }) {
                                Box(Modifier.padding(bottom = space.s3).focusRequester(backFocus).focusGroup()) {
                                    PMButton(
                                        icon = PMIconRole.Back,
                                        label = props.backLabel,
                                        onClick = props.onBack,
                                        size = PMControlSize.Sm,
                                        appearance = PMButtonAppearance.GhostNeutral,
                                    )
                                }
                                Box(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState())) { detail() }
                            }
                        }
                    } else {
                        CompositionLocalProvider(LocalPMSplitPaneLayout provides PMSplitPaneLayout.Split) {
                            PMSplitPane(
                                defaultRatio = PMRecipe.masterDetailListShare.toDouble(),
                                end = { DetailPane(props, focus) },
                                endMin = PMRecipe.masterDetailDetailMin.value.toDouble(),
                                label = props.listLabel,
                                start = { ListPane(props, focus, Modifier.focusRequester(listFocus)) },
                                startMin = PMRecipe.masterDetailListMin.value.toDouble(),
                            )
                        }
                    }
                }
            }
        }
    }

    /**
     * The list pane: a group named by `listLabel` that scrolls on its own, or
     * the load state's stand-in in its place. Focus asked of it enters its
     * first focusable element.
     */
    @Composable
    private fun ListPane(props: PMMasterDetailPageProps, focus: PMMasterDetailFocus, modifier: Modifier) {
        val space = PM.theme.defaultDensity.spacing
        Box(
            modifier
                .fillMaxSize()
                .onFocusChanged { if (it.hasFocus) focus.last = PMMasterDetailPane.List }
                .semantics {
                    contentDescription = props.listLabel
                    isTraversalGroup = true
                }
                .focusGroup()
                .verticalScroll(rememberScrollState()),
        ) {
            when (val status = props.loadStatus) {
                PMLoadStatus.Ready, PMLoadStatus.Empty -> props.list()
                PMLoadStatus.Loading -> Box(Modifier.padding(vertical = space.s4)) { PMPageSkeletonRows() }
                is PMLoadStatus.Failed -> PMPageFailure(status.message, props.onRetry)
            }
        }
    }

    /** The detail pane beside the list: the detail, scrolling on its own, or the empty state, centred. */
    @Composable
    private fun DetailPane(props: PMMasterDetailPageProps, focus: PMMasterDetailFocus) {
        val space = PM.theme.defaultDensity.spacing
        val detail = props.detail
        Box(
            Modifier
                .fillMaxSize()
                .onFocusChanged { if (it.hasFocus) focus.last = PMMasterDetailPane.Detail }
                .padding(start = space.s5),
        ) {
            if (detail != null) {
                Box(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) { detail() }
            } else {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    PMEmptyState(
                        action = props.emptyState.action,
                        description = props.emptyState.description,
                        icon = props.emptyState.icon,
                        secondaryAction = props.emptyState.secondaryAction,
                        title = props.emptyState.title,
                    )
                }
            }
        }
    }

    /**
     * The system's Back, handed to `onBack` while `enabled`. Compose's
     * multiplatform handler is deprecated for the navigation event handler,
     * which on Android needs an activity that provides a navigation event
     * dispatcher (androidx.activity 1.12); this one goes through the
     * activity's own Back dispatcher, which every activity has.
     */
    @OptIn(ExperimentalComposeUiApi::class)
    @Composable
    private fun SystemBack(enabled: Boolean, onBack: () -> Unit) {
        @Suppress("DEPRECATION")
        BackHandler(enabled = enabled, onBack = onBack)
    }

    /** A pane kept composed but not placed, and out of the semantics tree: the list while the detail is drawn alone. */
    private val Hidden = Modifier
        .clearAndSetSemantics {}
        .layout { measurable, constraints ->
            measurable.measure(constraints)
            layout(0, 0) {}
        }
}

/** What MasterDetailPage draws: the one pane's list or detail, or the split with or without a detail. */
private enum class PMMasterDetailDrawn { List, Detail, Split, SplitDetail }

/** A pane focus can be in, or be moved to: the detail's is the way back when the detail is drawn alone. */
private enum class PMMasterDetailPane { List, Detail }

/**
 * Where the last focus in the page was, and what the page last drew. A plain
 * holder, not state: the composition that changes the arrangement reads it
 * before the change clears the focus it records.
 */
private class PMMasterDetailFocus {
    var last: PMMasterDetailPane? = null
    private var drawn: PMMasterDetailDrawn? = null

    fun change(to: PMMasterDetailDrawn): PMMasterDetailChange =
        PMMasterDetailChange(drawn, to, last).also { drawn = to }
}

/** One change of arrangement, and the pane focus was last in when it came. */
private class PMMasterDetailChange(
    val from: PMMasterDetailDrawn?,
    val to: PMMasterDetailDrawn,
    val last: PMMasterDetailPane?,
) {
    /**
     * Where the rule moves focus, or `null` when the element that held it is
     * still drawn: nothing on the first arrangement, nothing when focus was
     * outside the panes, nothing when the split gains a detail beside the
     * list, and nothing when the split loses its detail while focus was in the
     * list. Otherwise the way back when the detail is drawn alone, else the
     * list.
     */
    fun target(): PMMasterDetailPane? = when {
        from == null || from == to || last == null -> null
        to == PMMasterDetailDrawn.Detail -> PMMasterDetailPane.Detail
        from == PMMasterDetailDrawn.Split && to == PMMasterDetailDrawn.SplitDetail -> null
        from == PMMasterDetailDrawn.SplitDetail && to == PMMasterDetailDrawn.Split && last == PMMasterDetailPane.List -> null
        else -> PMMasterDetailPane.List
    }
}

/**
 * MasterDetailPage's states: the spec's five entries, the split at a tablet's
 * width and the one pane at a phone's, and the load states the screen contract
 * names, in a support inbox of six tickets. The page fills its region: the
 * split entries are drawn in the spec's harness, a box six of the largest
 * space step high, laid out at a tablet's width and scaled to the canvas; the
 * narrow ones fill a phone's.
 */
object MasterDetailPageStates : PMStates {
    override val member = "MasterDetailPage"

    private const val title = "Support"
    private const val description = "Every ticket customers have opened, newest first."
    private const val listLabel = "Tickets"
    private const val backLabel = "All tickets"
    private const val subject = "Invoice shows the wrong currency"
    private const val opened = "Bao Tran · opened an hour ago"
    private const val body =
        "The March invoice for the Lisbon workspace is in US dollars. The workspace bills in euros, and the previous invoices were right."
    private const val failure = "The tickets could not be loaded. Check your connection."

    /** The harness's height, in multiples of `space.10`, as the web fixture's writes it. */
    private const val HARNESS = 6

    /**
     * The long list's harness, one `space.10` taller than the web's: at the
     * web's height the list pane's edge leaves a row only the top of its
     * padding, a sliver whose words lie past the edge, which the audit hears
     * as a control with nothing to say.
     */
    private const val LONG_HARNESS = 7

    private data class Ticket(val subject: String, val from: String, val time: String, val status: String, val tone: PMBadgeTone)

    private val tickets = listOf(
        Ticket("Login loop after password reset", "Ada Okafor", "2m", "Open", PMBadgeTone.Accent),
        Ticket(subject, "Bao Tran", "1h", "Waiting", PMBadgeTone.Warning),
        Ticket("Export finishes but the file is empty", "Carmen Ruiz", "3h", "Open", PMBadgeTone.Accent),
        Ticket("Cannot invite a teammate", "Dev Patel", "1d", "Closed", PMBadgeTone.Neutral),
        Ticket("Webhook retries stop after one failure", "Ewa Nowak", "2d", "Open", PMBadgeTone.Accent),
        Ticket("Two-factor codes arrive late", "Femi Adeyemi", "4d", "Waiting", PMBadgeTone.Warning),
    )

    /** The six tickets, `times` over, the one at `current` marked current. */
    @Composable
    private fun Tickets(current: Int?, times: Int = 1) {
        PMList(label = listLabel) {
            for (index in 0 until tickets.size * times) {
                val ticket = tickets[index % tickets.size]
                PMListItem(
                    current = index == current,
                    description = ticket.from,
                    meta = ticket.time,
                    onSelect = {},
                    title = ticket.subject,
                    trailing = { PMBadge(children = ticket.status, tone = ticket.tone) },
                )
            }
        }
    }

    /** The second ticket's detail: a heading, its meta, its body and its actions. */
    @Composable
    private fun Detail() {
        PMStack(gap = PMSpaceStep.S4) {
            PMHeading(children = subject)
            PMInline(align = PMInlineAlign.Center, gap = PMSpaceStep.S2) {
                PMBadge(children = "Waiting", tone = PMBadgeTone.Warning)
                PMText(size = PMTextSize.Sm, tone = PMTextTone.Secondary) { Text(opened) }
            }
            PMText { Text(body) }
            PMInline(gap = PMSpaceStep.S3) {
                PMButton(icon = PMIconRole.Mail, label = "Reply", appearance = PMButtonAppearance.SoftAccent)
                PMButton(label = "Close ticket", appearance = PMButtonAppearance.GhostNeutral)
            }
        }
    }

    @Composable
    private fun Page(
        status: PMLoadStatus = PMLoadStatus.Ready,
        current: Int? = null,
        times: Int = 1,
        selected: Boolean = false,
        actions: Boolean = false,
    ) {
        PMMasterDetailPage(
            loadStatus = status,
            onRetry = {},
            actions = if (actions) ({ PMButton(icon = PMIconRole.Add, label = "New ticket") }) else null,
            backLabel = backLabel,
            description = description,
            detail = if (selected) ({ Detail() }) else null,
            emptyState = PMEmptyStateProps(
                description = "Pick a ticket in the list to read it here.",
                icon = PMIconRole.Inbox,
                title = "No ticket selected",
            ),
            list = { Tickets(current, times) },
            listLabel = listLabel,
            onBack = {},
            title = title,
        )
    }

    /** The split: the page laid out at a tablet's width in the spec's harness, scaled to the canvas. */
    @Composable
    private fun Split(span: Int = HARNESS, content: @Composable () -> Unit) {
        PMFixtureWidth(PMGeometry.compactWidth * 2) {
            Box(Modifier.fillMaxWidth().height(PM.theme.defaultDensity.spacing.s10 * span)) { content() }
        }
    }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry(
                "an item selected — the list beside its detail",
                expect = mapOf("status" to "ready", "layout" to "split", "contains" to "SplitPane,List,Heading"),
            ) { Split { Page(current = 1, selected = true, actions = true) } },
            PMStateEntry(
                "nothing selected — the list beside the empty state",
                expect = mapOf("status" to "ready", "layout" to "split", "contains" to "SplitPane,List,EmptyState"),
            ) { Split { Page() } },
            PMStateEntry(
                "a long list — the list pane scrolls and the detail stays",
                expect = mapOf("status" to "ready", "layout" to "split", "contains" to "List,Heading"),
            ) { Split(LONG_HARNESS) { Page(current = 1, times = 5, selected = true) } },
            PMStateEntry(
                "narrow, an item selected — the detail alone under the way back",
                expect = mapOf("layout" to "single", "pane" to "detail", "contains" to "Button,Heading"),
            ) { PMFixturePhone { Page(current = 1, selected = true) } },
            PMStateEntry(
                "narrow, nothing selected — the list alone",
                expect = mapOf("layout" to "single", "pane" to "list", "contains" to "List"),
            ) { PMFixturePhone { Page() } },
            PMStateEntry(
                "loading — Skeleton rows in the list pane",
                expect = mapOf("status" to "loading", "contains" to "Skeleton"),
            ) { PMFixturePhone { Page(PMLoadStatus.Loading) } },
            PMStateEntry(
                "empty — as ready, the list draws its own",
                expect = mapOf("status" to "empty", "contains" to "List"),
            ) { PMFixturePhone { Page(PMLoadStatus.Empty) } },
            PMStateEntry(
                "failed — the Alert in place of the list",
                expect = mapOf("status" to "failed", "contains" to "Alert"),
            ) { PMFixturePhone { Page(PMLoadStatus.Failed(failure)) } },
        )
}
