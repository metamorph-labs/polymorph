// Tree (`design/components/tree.md`): a hierarchy of items of one kind, opened
// level by level, with one item picked. Compose has no tree, so the tree is a
// column of rows, each indented by its level, with an open branch's level under
// its row. It is not a lazy list: the spec draws every row it is given, and a
// tree sits in the page's own scroll, inside which a lazy list cannot be
// measured. A level appears and leaves at once, because a level of a hundred
// rows cannot animate in smoothly; only the chevron turns.
//
// A row spans the tree's width at every level, so its fill is one band, and
// only its content is indented: `space.5` for each level above it. It is the
// toggle column, then the text column (the label in `text.sm` `text.primary`,
// the description under it in `text.xs` `text.secondary`, `space.2` above and
// below, both wrapping, so a label never widens the tree), `space.3` before the
// row's end. A branch's toggle holds the `next` chevron in `text.muted`, which
// turns a quarter turn while the branch is open, the other way in a
// right-to-left layout, whose glyph is mirrored; a leaf's is empty, so the
// labels of a level align. On Android the toggle column is the hit target wide
// rather than the small control height, so the chevron's touch area is a
// target of its own beside the row's. A row is at least the hit target tall.
//
// Opening and selecting are separate acts, as on the web. A press on the
// chevron opens or closes the branch; a press on the rest of the row, its
// indent included, selects the item. To TalkBack the row is one node: its
// label and description, selected on the selected item (`selectable`, the
// platform's selection), a branch's state expanded or collapsed, with the
// platform's expand and collapse actions, which TalkBack names in its own
// words. The chevron adds no node, because the row's actions already open and
// close the branch. With a hardware keyboard the row takes focus and draws the
// focus ring inside its edge; the arrow key toward the end of the line opens a
// closed branch and the other closes an open one, and the platform's own keys
// move between rows. A pointer over a row washes it in `bg.subtle`, and a press
// ripples from the touch point; the selected row is the selected surface, its
// hover step under a pointer, and its text keeps its colours. A disabled item
// is drawn in `text.disabled`, takes no press and no key, is never selected,
// and a disabled branch is drawn closed.
//
// The tree holds the open set unless `expanded` is given, starting from
// `defaultExpanded`, and `onExpandedChange` is called with the next set in
// both cases. It holds the selection unless `value` is given, from
// `defaultValue`, and selecting the selected item again calls nothing. An open
// branch that is `loading` draws one busy row under its items: the Spinner in
// the toggle's place, a polite live region that says `messages.loading`,
// beside the same words hidden from TalkBack. `hasMore` draws a last row in
// `accent.text` that asks for more, `onLoadMore` with the branch's id or null
// for the top level; while its level loads, that row is the busy row. Compose
// has no busy state for a node, so a busy level is recorded in its row's
// identifier. The tree's two strings are `messages`, with the spec's English
// defaults. The tree is one node named by `label` around its rows.

package dev.polymorph.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEvent
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isAltPressed
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.isMetaPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp

/**
 * What a press on a row runs besides selecting it: TreeSelect closes its
 * popup, the chosen node's row included, which Tree reports nothing for.
 */
val LocalPMTreePick = compositionLocalOf<((String) -> Unit)?> { null }

/**
 * The item whose row brings itself into view in the scroll around the tree
 * when it is first drawn: TreeSelect's chosen node, as its panel opens.
 */
val LocalPMTreeReveal = compositionLocalOf<String?> { null }

object PMTree : PMTreeRendering {
    @Composable
    override fun Render(props: PMTreeProps) {
        val theme = PM.theme
        var ownExpanded by remember { mutableStateOf(props.defaultExpanded ?: emptySet()) }
        var ownValue by remember { mutableStateOf(props.defaultValue) }
        // The controlled `expanded` and `value` when given (null inside `value`
        // selects nothing), otherwise the tree's own.
        val open = props.expanded ?: ownExpanded
        val selected = if (props.value != null) props.value.value else ownValue
        val pick = LocalPMTreePick.current
        val loading = props.loading == true
        val shared = Shared(
            open = open,
            selected = selected,
            messages = props.messages ?: PMSpecDefault.strings.treeMessages,
            // The tree's own set follows every change, whoever holds the set,
            // so it is current if the app stops passing `expanded`.
            toggle = { id ->
                val next = toggled(open, id)
                ownExpanded = next
                props.onExpandedChange?.invoke(next)
            },
            // A reader cannot clear the selection, so selecting the selected
            // item again reports nothing; TreeSelect still hears the press.
            select = { id ->
                pick?.invoke(id)
                if (id != selected) {
                    ownValue = id
                    props.onChange?.invoke(id)
                }
            },
            more = { parent -> props.onLoadMore?.invoke(parent) },
        )

        CompositionLocalProvider(
            LocalTextStyle provides theme.text.sm.textStyle,
            LocalContentColor provides theme.colors.textPrimary.color,
        ) {
            Column(
                Modifier
                    .pmMember("Tree", if (loading) mapOf("busy" to "true") else emptyMap())
                    .semantics {
                        contentDescription = props.label
                        isTraversalGroup = true
                    }
                    .fillMaxWidth(),
            ) {
                Level(props.items, level = 0, parent = null, loading = loading, hasMore = props.hasMore == true, shared = shared)
            }
        }
    }

    /** The set with `id` added when it is absent, and taken out when it is there. */
    fun toggled(open: Set<String>, id: String): Set<String> = if (id in open) open - id else open + id

    /** What every level of one tree draws with. */
    private class Shared(
        val open: Set<String>,
        val selected: String?,
        val messages: PMTreeMessages,
        val toggle: (String) -> Unit,
        val select: (String) -> Unit,
        val more: (String?) -> Unit,
    )

    /**
     * The rows of one level: its items, each followed by its own level while it
     * is open, then one row that says the level is loading or asks for more of
     * it. While a level that has more is loading, the row that asks is the busy
     * row, in the same place.
     */
    @Composable
    private fun Level(items: List<PMTreeItem>, level: Int, parent: String?, loading: Boolean, hasMore: Boolean, shared: Shared) {
        for (item in items) key(item.id) { Node(item, level, shared) }
        when {
            hasMore && loading -> BusyRow(level, shared.messages.loading, mapOf("part" to "more", "busy" to "true", "level" to "$level"))
            hasMore -> MoreRow(level, shared.messages.loadMore) { shared.more(parent) }
            loading -> BusyRow(level, shared.messages.loading, mapOf("part" to "busy", "level" to "$level"))
        }
    }

    /** One item: its row, and while it is an open branch, the level under it. */
    @Composable
    private fun Node(item: PMTreeItem, level: Int, shared: Shared) {
        val children = item.children.orEmpty()
        val branch = children.isNotEmpty() || item.hasChildren == true
        val disabled = item.disabled == true
        // A disabled branch is drawn closed, whatever the open set holds.
        val open = branch && !disabled && item.id in shared.open
        ItemRow(item, level, branch, open, selected = !disabled && shared.selected == item.id, disabled = disabled, shared = shared)
        if (open) Level(children, level + 1, item.id, item.loading == true, item.hasMore == true, shared)
    }

    /** An item's row: one node that selects the item, and a branch's chevron over its toggle column. */
    @Composable
    private fun ItemRow(item: PMTreeItem, level: Int, branch: Boolean, open: Boolean, selected: Boolean, disabled: Boolean, shared: Shared) {
        val theme = PM.theme
        val density = theme.defaultDensity
        val space = density.spacing
        val colors = theme.colors
        val strings = PMSpecDefault.strings
        val rtl = LocalLayoutDirection.current == LayoutDirection.Rtl
        val interaction = remember { MutableInteractionSource() }
        val hovered by interaction.collectIsHoveredAsState()
        val focused by interaction.collectIsFocusedAsState()
        val fill = rowFill(selected = selected, hovered = hovered && !disabled)
        val toggle = { shared.toggle(item.id) }
        val currentToggle by rememberUpdatedState(toggle)
        val indent = space.s5 * level
        val reveal = LocalPMTreeReveal.current == item.id
        val requester = remember { BringIntoViewRequester() }
        if (reveal) LaunchedEffect(Unit) { requester.bringIntoView() }
        val attributes = buildMap {
            put("part", "row")
            put("item", item.id)
            put("level", "$level")
            if (branch) put("expanded", "$open")
            if (selected) put("selected", "true")
            if (disabled) put("disabled", "true")
            if (open && item.loading == true) put("busy", "true")
        }

        Box(
            Modifier
                .pmMember("Tree", attributes)
                .fillMaxWidth()
                .then(if (reveal) Modifier.bringIntoViewRequester(requester) else Modifier)
                // Before the selection, so the keys reach the row that has focus.
                .onKeyEvent { event -> branch && !disabled && opensOrCloses(event, open, rtl, toggle) }
                .selectable(
                    selected = selected,
                    interactionSource = interaction,
                    indication = null,
                    enabled = !disabled,
                    onClick = { shared.select(item.id) },
                )
                .semantics { if (branch && !disabled) pmDisclosure(open, strings, toggle) }
                .heightIn(min = rowHeight().dp)
                .clip(theme.rounded(theme.radius.sm))
                .background(fill),
            contentAlignment = Alignment.CenterStart,
        ) {
            RowFeedback(interaction, selected, focused)
            Column(
                Modifier
                    .fillMaxWidth()
                    .padding(start = indent + toggleWidth(), end = space.s3, top = space.s2, bottom = space.s2),
            ) {
                Text(item.label, color = (if (disabled) colors.textDisabled else colors.textPrimary).color)
                item.description?.let {
                    Text(it, style = theme.text.xs.textStyle, color = (if (disabled) colors.textDisabled else colors.textSecondary).color)
                }
            }
            if (branch) {
                Box(Modifier.matchParentSize().padding(start = indent), contentAlignment = Alignment.CenterStart) {
                    Box(
                        Modifier
                            .width(toggleWidth())
                            .fillMaxHeight()
                            // A touch, not a node: the row's actions open and close the branch.
                            .pointerInput(disabled) { detectTapGestures { if (!disabled) currentToggle() } },
                        contentAlignment = Alignment.Center,
                    ) {
                        PMTurningChevron(PMIconRole.Next, open, PMTurn.QUARTER, tint = (if (disabled) colors.textDisabled else colors.textMuted).color)
                    }
                }
            }
        }
    }

    /**
     * The arrow key toward the end of the line opens a closed branch, and the
     * other closes an open one: the right arrow opens in a left-to-right layout,
     * the left in a right-to-left one. A key with Alt, Control or Meta is the app's.
     */
    private fun opensOrCloses(event: KeyEvent, open: Boolean, rtl: Boolean, toggle: () -> Unit): Boolean {
        if (event.type != KeyEventType.KeyDown || event.isAltPressed || event.isCtrlPressed || event.isMetaPressed) return false
        val opens = if (rtl) Key.DirectionLeft else Key.DirectionRight
        val closes = if (rtl) Key.DirectionRight else Key.DirectionLeft
        val acts = (event.key == opens && !open) || (event.key == closes && open)
        if (acts) toggle()
        return acts
    }

    /** The row that asks for more of a level: `messages.loadMore` in `accent.text`, the colour of a link. */
    @Composable
    private fun MoreRow(level: Int, words: String, ask: () -> Unit) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val interaction = remember { MutableInteractionSource() }
        val hovered by interaction.collectIsHoveredAsState()
        val focused by interaction.collectIsFocusedAsState()
        Box(
            Modifier
                .pmMember("Tree", mapOf("part" to "more", "level" to "$level"))
                .fillMaxWidth()
                .clickable(interactionSource = interaction, indication = null, onClick = ask)
                .heightIn(min = rowHeight().dp)
                .clip(theme.rounded(theme.radius.sm))
                .background(rowFill(selected = false, hovered = hovered)),
            contentAlignment = Alignment.CenterStart,
        ) {
            RowFeedback(interaction, selected = false, focused = focused)
            Text(
                words,
                color = theme.colors.accentText.color,
                modifier = Modifier.padding(start = space.s5 * level + toggleWidth(), end = space.s3, top = space.s2, bottom = space.s2),
            )
        }
    }

    /**
     * The row that says a level is loading: the Spinner `sm` in the toggle's
     * place, in `text.muted`, which says `words` politely, and the same words
     * beside it in `text.xs` `text.secondary`, hidden from TalkBack. It is no action.
     */
    @Composable
    private fun BusyRow(level: Int, words: String, attributes: Map<String, String>) {
        val theme = PM.theme
        val density = theme.defaultDensity
        val space = density.spacing
        Row(
            Modifier
                .pmMember("Tree", attributes)
                .fillMaxWidth()
                .heightIn(min = density.controlHeight.sm.dp)
                .padding(start = space.s5 * level, end = space.s3),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.width(toggleWidth()), contentAlignment = Alignment.Center) {
                CompositionLocalProvider(LocalContentColor provides theme.colors.textMuted.color) {
                    PMSpinner(label = words, size = PMControlSize.Sm)
                }
            }
            Text(
                words,
                style = theme.text.xs.textStyle,
                color = theme.colors.textSecondary.color,
                modifier = Modifier
                    .weight(1f)
                    .padding(vertical = space.s2)
                    .semantics { hideFromAccessibility() },
            )
        }
    }

    /** A row's press, a ripple of its active fill, and its focus ring inside its edge, because rows share their edges. */
    @Composable
    private fun BoxScope.RowFeedback(interaction: MutableInteractionSource, selected: Boolean, focused: Boolean) {
        val theme = PM.theme
        val ring = (theme.focus.offset + theme.focus.width).dp
        PMPressLayer(interaction, (if (selected) theme.colors.selectionSurfaceHover else theme.colors.bgSubtle).color, Modifier.matchParentSize())
        Box(Modifier.matchParentSize().padding(ring).pmFocusRing(focused, (theme.radius.sm.dp - ring).coerceAtLeast(0.dp)))
    }

    /** A row's fill: the selected surface, its hover step under a pointer; `bg.subtle` under a pointer otherwise. */
    @Composable
    private fun rowFill(selected: Boolean, hovered: Boolean): Color {
        val theme = PM.theme
        val colors = theme.colors
        val motion = theme.defaultMotion
        val fill by animateColorAsState(
            when {
                selected && hovered -> colors.selectionSurfaceHover.color
                selected -> colors.selectionSurface.color
                hovered -> colors.bgSubtle.color
                else -> Color.Transparent
            },
            motion.easing.standard.tween(motion.duration.control),
            label = "row",
        )
        return fill
    }

    /** A pressable row's least height: the small control height, and at least the hit target. */
    @Composable
    private fun rowHeight(): Float {
        val density = PM.theme.defaultDensity
        return maxOf(density.controlHeight.sm, density.hitTarget)
    }

    /** The toggle column: the hit target wide, so the chevron's touch is a target beside the row's. */
    @Composable
    private fun toggleWidth() = maxOf(PM.theme.defaultDensity.controlHeight.sm, PM.theme.defaultDensity.hitTarget).dp
}

/**
 * Tree's states, from the spec's States table: three top-level units, the
 * first a branch open onto three, in each state the table names. The rows'
 * attributes are read by `BehaviourTest`, because `expect` names members only.
 */
object TreeStates : PMStates {
    override val member = "Tree"

    private const val label = "Organization units"

    /** Three top-level units: a loaded branch, a branch the app has not loaded, and a leaf with a description. */
    private fun units(
        engineeringHasMore: Boolean = false,
        engineeringLoading: Boolean = false,
        designLoading: Boolean = false,
        designDisabled: Boolean = false,
    ) = listOf(
        PMTreeItem(
            id = "engineering",
            label = "Engineering",
            children = listOf(
                PMTreeItem(id = "platform", label = "Platform", hasChildren = true),
                PMTreeItem(id = "applications", label = "Applications"),
                PMTreeItem(id = "data", label = "Data"),
            ),
            loading = engineeringLoading,
            hasMore = engineeringHasMore,
        ),
        PMTreeItem(id = "design", label = "Design", hasChildren = true, loading = designLoading, disabled = designDisabled),
        PMTreeItem(id = "sales", label = "Sales", description = "Three regions"),
    )

    private val deep = listOf(
        PMTreeItem(
            id = "company",
            label = "Northwind",
            children = listOf(
                PMTreeItem(
                    id = "engineering",
                    label = "Engineering",
                    children = listOf(
                        PMTreeItem(
                            id = "platform",
                            label = "Platform",
                            children = listOf(PMTreeItem(id = "runtime", label = "Runtime"), PMTreeItem(id = "storage", label = "Storage")),
                        ),
                        PMTreeItem(id = "applications", label = "Applications"),
                    ),
                ),
                PMTreeItem(id = "sales", label = "Sales"),
            ),
        ),
    )

    private val long = listOf(
        PMTreeItem(
            id = "programme",
            label = "Customer support operations for Europe, the Middle East and Africa",
            children = listOf(
                PMTreeItem(
                    id = "archive",
                    label = "ticket-export-eu-west-1-production-customer-support-archive",
                    description = "Holds the exports of the last twelve months, one unit for each region",
                ),
            ),
        ),
    )

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry(
                "a small tree — one branch open",
                expect = mapOf("label" to label),
            ) { PMTree(defaultExpanded = setOf("engineering"), items = units(), label = label) },
            PMStateEntry("nothing open", expect = mapOf("label" to label)) {
                PMTree(items = units(), label = label)
            },
            PMStateEntry("a selected item", expect = mapOf("label" to label)) {
                PMTree(defaultExpanded = setOf("engineering"), defaultValue = "applications", items = units(), label = label)
            },
            PMStateEntry(
                "a branch that is loading",
                expect = mapOf("label" to label, "contains" to "Spinner"),
            ) { PMTree(defaultExpanded = setOf("design"), items = units(designLoading = true), label = label) },
            PMStateEntry("a level with more to load", expect = mapOf("label" to label)) {
                PMTree(defaultExpanded = setOf("engineering"), hasMore = true, items = units(engineeringHasMore = true), label = label)
            },
            PMStateEntry(
                "more of a level loading — the row that asks is busy",
                expect = mapOf("label" to label, "contains" to "Spinner"),
            ) {
                PMTree(defaultExpanded = setOf("engineering"), items = units(engineeringHasMore = true, engineeringLoading = true), label = label)
            },
            PMStateEntry(
                "a disabled item",
                expect = mapOf("label" to label),
            ) { PMTree(defaultExpanded = setOf("engineering", "design"), items = units(designDisabled = true), label = label) },
            PMStateEntry("a deep tree — four levels", expect = mapOf("label" to label)) {
                PMTree(defaultExpanded = setOf("company", "engineering", "platform"), items = deep, label = label)
            },
            PMStateEntry("long labels at a narrow width", expect = mapOf("label" to label)) {
                PMTree(defaultExpanded = setOf("programme"), items = long, label = label)
            },
        )
}
