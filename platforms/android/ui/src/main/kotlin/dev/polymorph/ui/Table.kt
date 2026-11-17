// Table (`design/components/table.md`), adapted: a list on phones, a table on
// tablets. A composition: `PMTable` around `PMTableRow`s of `PMTableHeader` or
// `PMTableCell`s. Sorting logic, selection and pagination are DataTable's;
// Table draws the sort control and the states.
//
// - **The table** (a medium or expanded window): each row's cells share the
//   width equally and are as tall as the row's tallest, header cells in
//   `text.xs`, secondary, over a `border.default` rule, body cells in `text.sm`
//   over a `border.subtle` one, `space.3` and `space.4` inside; numeric cells
//   end-aligned with tabular figures.
// - **The list** (a compact window, narrower than `PMGeometry.compactWidth`):
//   a body row's cells stack, the first as the row's title, `space.1` apart and
//   `space.2` above and below, so a narrow screen drops no column; the header
//   row becomes a wrapping row of its headers, where the sortable ones stay
//   buttons.
//
// A sortable header is pressable, with its sort glyph after its label: the
// neutral `sort` in `text.muted` at rest, `sort-asc` or `sort-desc` in
// `accent.text` when it is the sorted column, whose label turns `text.primary`.
// Its state says the direction, as `aria-sort` does. Touch has no hover, so
// the glyph shows at rest, where the web's appears on approach. An interactive
// row (`interactive` with `onClick`) is pressable, at least the hit target
// tall with its cells centred in it: the subtle wash under the pointer, a
// ripple in it on a press, and its click; a selected row takes the
// selection's fill (its hover step under the pointer), and its cells the
// selection's text colour, the pair the contrast law checks. Each row is one
// node, read cell by cell, and a selected row is selected.
//
// The caption names the table (`label` when there is none); `captionVisible`
// draws it above in `text.sm`, secondary. A header's label is the app's
// content, drawn in the overline's step and colour: a composable cannot change
// the case of the text inside it, so the web's uppercase is the app's to write.
// `grid` and `multiselectable` set the web's keyboard grid model and
// `aria-multiselectable`; Compose moves focus between the rows' own controls,
// so they change nothing here. `stickyHeader` pins a header row only inside a
// lazy list, which the table does not own, so it is recorded and not drawn.

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
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.layoutId
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import kotlin.math.max

/** Which form a Table takes. */
enum class PMTableLayout(val value: String) { List("list"), Table("table") }

/**
 * The Table form to draw regardless of the window, for a fixture or a
 * preview; null follows the window's width class.
 */
val LocalPMTableLayout = compositionLocalOf<PMTableLayout?> { null }

/** The form the enclosing Table draws in, for its rows and cells. */
private val LocalTableForm = compositionLocalOf { PMTableLayout.Table }

/** The layout id of a header cell, which the list lays out as a header. */
private object HeaderCell

object PMTable : PMTableRendering {
    @Composable
    override fun Render(props: PMTableProps) {
        val theme = PM.theme
        val window = with(LocalDensity.current) { LocalWindowInfo.current.containerSize.width.toDp() }
        val form = LocalPMTableLayout.current
            ?: if (window < PMGeometry.compactWidth) PMTableLayout.List else PMTableLayout.Table
        val name = props.caption ?: props.label
        val attributes = buildMap {
            put("layout", form.value)
            if (props.stickyHeader == true) put("sticky-header", "true")
            props.caption?.let { put("caption", if (props.captionVisible == true) "visible" else "announced") }
        }

        Column(
            Modifier
                .pmMember("Table", attributes)
                .semantics {
                    name?.let { contentDescription = it }
                    isTraversalGroup = true
                }
                .fillMaxWidth(),
        ) {
            val caption = props.caption
            if (caption != null && props.captionVisible == true) {
                Text(
                    text = caption,
                    style = theme.text.sm.textStyle,
                    color = theme.colors.textSecondary.color,
                    // The table is named by it already.
                    modifier = Modifier.padding(bottom = theme.defaultDensity.spacing.s3).semantics { hideFromAccessibility() },
                )
            }
            CompositionLocalProvider(LocalTableForm provides form) { props.children?.invoke() }
        }
    }

    /** One row: header cells or body cells, pressable when interactive. */
    @Composable
    override fun RenderRow(props: PMTableRowProps) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val motion = theme.defaultMotion
        val form = LocalTableForm.current
        val list = form == PMTableLayout.List
        val selected = props.selected ?: false
        val open = props.onClick?.takeIf { props.interactive == true }
        val interaction = remember { MutableInteractionSource() }
        val hovered by interaction.collectIsHoveredAsState()
        val focused by interaction.collectIsFocusedAsState()
        val fill by animateColorAsState(
            when {
                selected && hovered && open != null -> theme.colors.selectionSurfaceHover.color
                selected -> theme.colors.selectionSurface.color
                hovered && open != null -> theme.colors.bgSubtle.color
                else -> Color.Transparent
            },
            motion.easing.standard.tween(motion.duration.control),
            label = "row",
        )
        val rule = theme.colors.borderSubtle.color
        val attributes = buildMap {
            put("part", "row")
            if (selected) put("selected", "true")
            if (open != null) put("interactive", "true")
        }

        Box(
            Modifier
                .pmMember("Table", attributes)
                .then(
                    if (open != null) {
                        Modifier
                            .clickable(interactionSource = interaction, indication = null, onClick = open)
                            .semantics { role = Role.Button }
                            .pmFocusRing(focused, 0.dp)
                    } else {
                        Modifier.semantics(mergeDescendants = true) {}
                    },
                )
                .semantics { if (selected) this.selected = true }
                .fillMaxWidth()
                // A row that opens is a target: never shorter than the hit target.
                .then(if (open != null) Modifier.heightIn(min = theme.defaultDensity.hitTarget.dp) else Modifier)
                .background(fill)
                .drawBehind {
                    val line = PMGeometry.hairline.toPx()
                    drawRect(rule, Offset(0f, size.height - line), Size(size.width, line))
                },
            contentAlignment = Alignment.CenterStart,
        ) {
            if (open != null) {
                PMPressLayer(interaction, (if (selected) theme.colors.selectionSurfaceHover else theme.colors.bgSubtle).color, Modifier.matchParentSize())
            }
            Cells(list, Modifier.padding(vertical = if (list) space.s2 else 0.dp)) { props.children?.invoke() }
        }
    }

    /**
     * A row's cells. In the table, equal columns as tall as the tallest cell;
     * in the list, a header row wraps its headers and a body row stacks its
     * cells.
     */
    @Composable
    private fun Cells(list: Boolean, modifier: Modifier, content: @Composable () -> Unit) {
        val gap = PM.theme.defaultDensity.spacing.s1
        Layout(content, modifier.fillMaxWidth()) { measurables, constraints ->
            val width = if (constraints.hasBoundedWidth) constraints.maxWidth else measurables.sumOf { it.maxIntrinsicWidth(Constraints.Infinity) }
            val between = gap.roundToPx()
            if (measurables.isEmpty()) return@Layout layout(width, 0) {}
            if (!list) {
                val column = width / measurables.size
                val tallest = measurables.maxOf { it.maxIntrinsicHeight(column) }
                val placeables = measurables.map { it.measure(Constraints.fixed(column, tallest)) }
                return@Layout layout(width, tallest) {
                    placeables.forEachIndexed { index, placeable -> placeable.placeRelative(index * column, 0) }
                }
            }
            if (measurables.all { it.layoutId == HeaderCell }) {
                val placeables = measurables.map { it.measure(Constraints(maxWidth = width)) }
                var x = 0
                var y = 0
                var line = 0
                val spots = placeables.map { placeable ->
                    if (x > 0 && x + placeable.width > width) {
                        x = 0
                        y += line + between
                        line = 0
                    }
                    val spot = x to y
                    x += placeable.width + between
                    line = max(line, placeable.height)
                    spot
                }
                return@Layout layout(width, y + line) {
                    placeables.forEachIndexed { index, placeable -> placeable.placeRelative(spots[index].first, spots[index].second) }
                }
            }
            val placeables = measurables.map { it.measure(Constraints(minWidth = width, maxWidth = width)) }
            val height = placeables.sumOf { it.height } + between * max(0, placeables.size - 1)
            layout(width, height) {
                var y = 0
                for (placeable in placeables) {
                    placeable.placeRelative(0, y)
                    y += placeable.height + between
                }
            }
        }
    }

    /** A column's header: the overline step and colour, and a pressable label with the sort glyph when the column sorts. */
    @Composable
    override fun RenderHeader(props: PMTableHeaderProps) {
        val theme = PM.theme
        val colors = theme.colors
        val space = theme.defaultDensity.spacing
        val list = LocalTableForm.current == PMTableLayout.List
        val numeric = props.numeric == true
        val direction = props.sortDirection
        val rule = colors.borderDefault.color
        val sort = props.onSort
        val style = theme.text.xs.textStyle.tabular(theme, numeric).copy(textAlign = if (numeric && !list) TextAlign.End else TextAlign.Start)

        Box(
            Modifier
                .layoutId(HeaderCell)
                .semantics { heading() }
                .then(if (list) Modifier.heightIn(min = theme.defaultDensity.hitTarget.dp) else Modifier)
                .drawBehind {
                    if (!list) {
                        val line = PMGeometry.hairline.toPx()
                        drawRect(rule, Offset(0f, size.height - line), Size(size.width, line))
                    }
                }
                .padding(horizontal = space.s4, vertical = if (list) 0.dp else space.s3),
            contentAlignment = if (numeric && !list) Alignment.CenterEnd else Alignment.CenterStart,
        ) {
            if (props.sortable == true) {
                val interaction = remember { MutableInteractionSource() }
                val focused by interaction.collectIsFocusedAsState()
                val spoken = direction?.let { PMSort.spoken(it) }
                Row(
                    Modifier
                        // The click first, so the merged node carries the header's action.
                        .clickable(interactionSource = interaction, indication = null) { sort?.invoke() }
                        .semantics(mergeDescendants = true) {
                            role = Role.Button
                            spoken?.let { stateDescription = it }
                        }
                        .pmHitTarget()
                        .pmFocusRing(focused, theme.radius.sm.dp),
                    horizontalArrangement = Arrangement.spacedBy(space.s1),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    CompositionLocalProvider(
                        LocalTextStyle provides style,
                        LocalContentColor provides (if (direction == null) colors.textSecondary else colors.textPrimary).color,
                    ) { props.children?.invoke() }
                    PMIconView(
                        PMSort.glyph(direction),
                        PMControlSize.Sm,
                        tint = (if (direction == null) colors.textMuted else colors.accentText).color,
                    )
                }
            } else {
                CompositionLocalProvider(LocalTextStyle provides style, LocalContentColor provides colors.textSecondary.color) {
                    props.children?.invoke()
                }
            }
        }
    }

    /** A body cell: the app's content in `text.sm`, end-aligned with tabular figures when numeric. */
    @Composable
    override fun RenderCell(props: PMTableCellProps) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val list = LocalTableForm.current == PMTableLayout.List
        val end = props.numeric == true && !list
        val style = theme.text.sm.textStyle.tabular(theme, props.numeric == true).copy(textAlign = if (end) TextAlign.End else TextAlign.Start)
        Box(
            Modifier.padding(horizontal = space.s4, vertical = if (list) 0.dp else space.s3),
            contentAlignment = if (end) Alignment.TopEnd else Alignment.TopStart,
        ) {
            CompositionLocalProvider(
                LocalTextStyle provides style,
                LocalContentColor provides theme.colors.textPrimary.color,
            ) { props.children?.invoke() }
        }
    }
}

/**
 * Table's states, from the spec's States table: the basic table and its list,
 * a numeric column, sortable unsorted and sorted both ways, interactive and
 * selected rows, and the visible caption. The table form is laid out at a
 * tablet's width and scaled to the canvas.
 */
object TableStates : PMStates {
    override val member = "Table"

    private const val caption = "Open tickets"
    private val headers = listOf("Subject", "Status", "Replies")
    private val rows = listOf(
        Triple("Refund for a duplicate charge", "Open", "4"),
        Triple("Cannot sign in", "Waiting", "2"),
        Triple("Wrong invoice address", "Closed", "7"),
    )

    @Composable
    private fun Ticket(
        visible: Boolean = false,
        sort: PMSortDirection? = null,
        sortable: Boolean = false,
        interactive: Boolean = false,
        selected: Int? = null,
    ) {
        PMTable(caption = caption, captionVisible = visible) {
            PMTableRow {
                headers.forEachIndexed { index, header ->
                    PMTableHeader(
                        numeric = index == 2,
                        onSort = {},
                        sortable = sortable && index != 1,
                        sortDirection = if (index == 2) sort else null,
                    ) { Text(header) }
                }
            }
            rows.forEachIndexed { index, row ->
                PMTableRow(interactive = interactive, onClick = {}, selected = selected == index) {
                    PMTableCell { Text(row.first) }
                    PMTableCell { PMBadge(children = row.second) }
                    PMTableCell(numeric = true) { Text(row.third) }
                }
            }
        }
    }

    @Composable
    private fun Wide(content: @Composable () -> Unit) {
        PMFixtureWidth(PMGeometry.compactWidth) {
            CompositionLocalProvider(LocalPMTableLayout provides PMTableLayout.Table) { content() }
        }
    }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("basic", expect = mapOf("layout" to "table", "caption" to "announced", "label" to caption)) {
                Wide { Ticket() }
            },
            PMStateEntry("as a list — on a phone", expect = mapOf("layout" to "list")) { Ticket(sort = PMSortDirection.Asc, sortable = true) },
            PMStateEntry("sortable, unsorted", expect = mapOf("layout" to "table")) { Wide { Ticket(sortable = true) } },
            PMStateEntry("sorted ascending", expect = mapOf("layout" to "table")) { Wide { Ticket(sort = PMSortDirection.Asc, sortable = true) } },
            PMStateEntry("sorted descending", expect = mapOf("layout" to "table")) { Wide { Ticket(sort = PMSortDirection.Desc, sortable = true) } },
            PMStateEntry("interactive rows", expect = mapOf("layout" to "table")) { Wide { Ticket(interactive = true) } },
            PMStateEntry("selected row", expect = mapOf("layout" to "table")) { Wide { Ticket(interactive = true, selected = 1) } },
            PMStateEntry("visible caption", expect = mapOf("caption" to "visible")) { Wide { Ticket(visible = true) } },
        )
}
