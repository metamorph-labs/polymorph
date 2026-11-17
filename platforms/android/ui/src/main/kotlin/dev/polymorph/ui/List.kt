// List (`design/components/list.md`): a column of items of one kind, each
// read, followed or picked. `PMList` is the column, named by `label`, around
// its `PMListItem`s, the web's `List.Item`. It is not Table: an item is read
// as one thing, and a table compares fields down its columns.
//
// The column has no gap. Each item inside a List draws a `border.subtle`
// hairline above it; the column lifts its items by one rule's thickness under
// its clip, so the first item's rule is hidden and the surface the List sits
// in is the outer boundary. An item on its own draws none.
//
// An item is a row, centred, `space.3` apart: the `leading` mark, then the
// text column, which takes the free width (the `title` in `text.sm`
// `text.primary`, then the `description` in `text.xs` `text.secondary`,
// `space.1` under it, both wrapping and never clipped), then `meta` in
// `text.xs` `text.secondary` on one line, then `trailing`. It is `space.3`
// and `space.4` inside and at least the large control height tall. The
// leading mark, the meta and the trailing part never shrink. Right to left,
// the row mirrors.
//
// One node takes an interactive item's press, and it covers the whole row,
// the trailing part included, as a Material ListItem's does, at least the hit
// target tall. With an `href`, a press runs `onSelect`, as the web runs it
// beside the click, and then follows the `href`: to `onNavigate` when there is
// one (`link.md` §Routing), and otherwise through the composition's
// `LocalUriHandler`, so the app decides where it goes. With `onSelect` alone,
// a press runs it, and the node is a Button. Android has no link role for a
// control, so an item that navigates is announced as the action it is, as a
// linked Card is. An item with neither is one node of text.
//
// A control in the trailing part is a clickable of its own: it takes its own
// press and stays a node of its own with its own name. A trailing mark that is
// not a control (a Badge) is part of the row: a press on it is a press on the
// row, and its words merge into the row's node, so TalkBack reads the row as
// its title, description, meta and the mark's words in order ("Bao Tran,
// Invited as a member, Expired"). A disabled control takes no press, so a
// press on one falls to the row, as it does in the platform's own list rows,
// where the web's trailing box keeps it; a busy Button stays enabled and keeps
// its press.
//
// A pointer over an interactive item washes the whole row in `bg.subtle`, over
// the control duration, and a press ripples from the touch point in it. The
// current item, an interactive one with `current`, is filled with the selected
// surface, the fill the contrast law holds every text role on, so its text
// keeps its colours; a pointer over it takes the selected surface's hover step,
// and so does its ripple. Its node is selected, the web's `aria-current`. An
// item that is only read is never filled: nothing would say to TalkBack what
// the fill says. Keyboard focus draws the focus ring inside the item's edge,
// because items share their edges. The row does not scale on a press, and
// nothing slides between items.
//
// The List is one node named by `label` that TalkBack reads as a list with its
// number of items, which the column counts as it lays them out. Each item
// carries the List's identity with `part=item`, and `interactive` and
// `current` where they hold.

package dev.polymorph.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.CollectionInfo
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.collectionInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

/** Whether a List item draws the rule above it: inside a List, where items are separated. */
private val LocalListRuled = compositionLocalOf { false }

object PMList : PMListRendering {
    @Composable
    override fun Render(props: PMListProps) {
        // The items the column laid out last, for the list's count.
        var counted by remember { mutableIntStateOf(0) }
        val items = counted

        Layout(
            content = { CompositionLocalProvider(LocalListRuled provides true) { props.children?.invoke() } },
            modifier = Modifier
                .pmMember("List")
                .semantics {
                    contentDescription = props.label
                    collectionInfo = CollectionInfo(rowCount = items, columnCount = 1)
                    isTraversalGroup = true
                }
                .fillMaxWidth()
                .clipToBounds(),
        ) { measurables, constraints ->
            if (counted != measurables.size) counted = measurables.size
            // One rule's thickness up, under the clip, so the first item's rule is hidden.
            val lift = PMGeometry.hairline.roundToPx()
            val placeables = measurables.map { it.measure(constraints.copy(minHeight = 0)) }
            val width = if (constraints.hasBoundedWidth) constraints.maxWidth else placeables.maxOfOrNull { it.width } ?: 0
            layout(width, maxOf(0, placeables.sumOf { it.height } - lift)) {
                var y = -lift
                for (placeable in placeables) {
                    placeable.placeRelative(0, y)
                    y += placeable.height
                }
            }
        }
    }

    /** One item: read, followed or picked. */
    @Composable
    override fun RenderItem(props: PMListItemProps) {
        val theme = PM.theme
        val density = theme.defaultDensity
        val space = density.spacing
        val colors = theme.colors
        val motion = theme.defaultMotion
        val uri = LocalUriHandler.current
        val href = props.href
        val select = props.onSelect
        val route = props.onNavigate
        val open: (() -> Unit)? = when {
            href != null -> {
                {
                    select?.invoke()
                    if (route != null) route(href) else uri.pmOpen(href)
                }
            }
            else -> select
        }
        val current = props.current == true && open != null
        val interaction = remember { MutableInteractionSource() }
        val hovered by interaction.collectIsHoveredAsState()
        val focused by interaction.collectIsFocusedAsState()
        val fill by animateColorAsState(
            when {
                current && hovered -> colors.selectionSurfaceHover.color
                current -> colors.selectionSurface.color
                hovered && open != null -> colors.bgSubtle.color
                else -> Color.Transparent
            },
            motion.easing.standard.tween(motion.duration.control),
            label = "item",
        )
        val attributes = buildMap {
            put("part", "item")
            if (open != null) put("interactive", "true")
            if (current) put("current", "true")
        }
        val least = if (open != null) maxOf(density.controlHeight.lg, density.hitTarget) else density.controlHeight.lg
        // The ring's stroke inside the item's edge: its offset and its width in.
        val ring = (theme.focus.offset + theme.focus.width).dp

        Column(
            Modifier
                .pmMember("List", attributes)
                .semantics { isTraversalGroup = true }
                .fillMaxWidth()
                .background(fill),
        ) {
            if (LocalListRuled.current) PMRule(colors.borderSubtle)
            Box(
                Modifier
                    .fillMaxWidth()
                    .then(
                        if (open != null) {
                            // The click first, so the merged node carries the item's action. A
                            // trailing control is a clickable of its own, so it is not merged.
                            Modifier
                                .clickable(
                                    interactionSource = interaction,
                                    indication = null,
                                    role = if (href == null) Role.Button else null,
                                    onClick = open,
                                )
                                .semantics { if (current) selected = true }
                        } else {
                            Modifier.semantics(mergeDescendants = true) {}
                        },
                    )
                    .heightIn(min = least.dp),
                contentAlignment = Alignment.CenterStart,
            ) {
                if (open != null) {
                    PMPressLayer(
                        interaction,
                        (if (current) colors.selectionSurfaceHover else colors.bgSubtle).color,
                        Modifier.matchParentSize(),
                    )
                    Box(Modifier.matchParentSize().padding(ring).pmFocusRing(focused, 0.dp))
                }
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Row(
                        Modifier.weight(1f).padding(
                            start = space.s4,
                            end = if (props.trailing == null) space.s4 else space.s3,
                            top = space.s3,
                            bottom = space.s3,
                        ),
                        horizontalArrangement = Arrangement.spacedBy(space.s3),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        props.leading?.invoke()
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(space.s1)) {
                            Text(props.title, style = theme.text.sm.textStyle, color = colors.textPrimary.color)
                            props.description?.let { Text(it, style = theme.text.xs.textStyle, color = colors.textSecondary.color) }
                        }
                        props.meta?.let {
                            Text(it, style = theme.text.xs.textStyle, color = colors.textSecondary.color, maxLines = 1, softWrap = false)
                        }
                    }
                    props.trailing?.let { trailing ->
                        Box(Modifier.padding(end = space.s4), contentAlignment = Alignment.Center) { trailing() }
                    }
                }
            }
        }
    }
}

/**
 * List's states, from the spec's States table: items that are read, that
 * navigate, the current page's item, items that are picked, a trailing
 * control beside a trailing mark, and a long title that wraps.
 */
object ListStates : PMStates {
    override val member = "List"

    private class Person(val name: String, val role: String, val seen: String, val href: String)

    private val people = listOf(
        Person("Ada Okafor", "Owner · signed in 2 minutes ago", "2m", "#ada-okafor"),
        Person("Bao Tran", "Member · signed in yesterday", "1d", "#bao-tran"),
        Person("Carmen Ruiz", "Member · invited, not yet signed in", "6d", "#carmen-ruiz"),
    )
    private const val longTitle = "ticket-export-2026-eu-west-1-production-customer-support-archive-part-0001-of-0042"

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("items that are read", expect = mapOf("label" to "Recent sign-ins")) {
                PMList(label = "Recent sign-ins") {
                    for (person in people) PMListItem(description = person.role, meta = person.seen, title = person.name)
                }
            },
            PMStateEntry("items that navigate", expect = mapOf("label" to "Members", "contains" to "List,Avatar")) {
                PMList(label = "Members") {
                    for (person in people) {
                        PMListItem(
                            description = person.role,
                            href = person.href,
                            leading = { PMAvatar(name = person.name) },
                            meta = person.seen,
                            title = person.name,
                        )
                    }
                }
            },
            PMStateEntry("the item of the open page is current", expect = mapOf("label" to "Members", "contains" to "List")) {
                PMList(label = "Members") {
                    people.forEachIndexed { index, person ->
                        PMListItem(current = index == 0, description = person.role, href = person.href, title = person.name)
                    }
                }
            },
            PMStateEntry("items that are picked", expect = mapOf("label" to "Accounts", "contains" to "List,Avatar")) {
                PMList(label = "Accounts") {
                    people.forEachIndexed { index, person ->
                        PMListItem(
                            current = index == 0,
                            description = person.role,
                            leading = { PMAvatar(name = person.name) },
                            onSelect = {},
                            title = person.name,
                        )
                    }
                }
            },
            // The Badge is part of its row's node, so the Button is the member found inside.
            PMStateEntry("a trailing control — it takes its own press", expect = mapOf("label" to "Invitations", "contains" to "Button")) {
                PMList(label = "Invitations") {
                    PMListItem(
                        description = "Invited as an owner",
                        href = "#ada-okafor",
                        title = "Ada Okafor",
                        trailing = { PMButton(label = "Resend", size = PMControlSize.Sm, appearance = PMButtonAppearance.OutlineNeutral) },
                    )
                    PMListItem(
                        description = "Invited as a member",
                        href = "#bao-tran",
                        title = "Bao Tran",
                        trailing = { PMBadge(children = "Expired", tone = PMBadgeTone.Warning) },
                    )
                }
            },
            PMStateEntry(
                "a long title and description — they wrap, so the list does not widen the page",
                expect = mapOf("label" to "Exports"),
            ) {
                PMList(label = "Exports") {
                    PMListItem(
                        description = "$longTitle.zip, requested by an administrator and kept for thirty days",
                        meta = "4.2 GB",
                        title = longTitle,
                    )
                }
            },
        )
}
