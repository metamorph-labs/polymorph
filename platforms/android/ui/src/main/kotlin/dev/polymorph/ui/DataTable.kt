// DataTable (`design/components/data-table.md`), adapted: a list on phones, a
// table on tablets. The props are generic over the app's row type, as on the
// web; `getRowId` gives a row its identity, so Compose keeps each row's state
// by it, and each column reads a row through `value` (its text) and draws it
// with `cell` when it has one.
//
// - **The list** (a compact window, narrower than `PMGeometry.compactWidth`):
//   one row per record. The first column is the row's title; every other
//   column follows under it as a term and its value, so no column is dropped
//   on a narrow screen ("never hidden data"). Sortable columns are a bar of
//   header buttons above the rows, each acting as the table's header does.
// - **The table** (a medium or expanded window): a header row, then one row
//   per record, the columns sharing the width equally. Numeric columns take
//   tabular figures, at the side of the column the system chooses
//   (`theme.numericAlign`, the end unless the system file says start).
//
// Both are drawn as columns of rows rather than a lazy list: a DataTable sits
// inside the page archetype's own scroll container, as the web's sits in
// ListPage's panel, and a lazy list cannot scroll inside another. So
// `stickyHeader` is recorded (`sticky-header`) and not drawn: only a lazy list
// pins a header, and the scrolling is the page's.
//
// Sorting is controlled: a sortable header toggles its direction when it is the
// sorted column and sorts ascending otherwise, and the app's `onSortChange`
// does the sorting. Selection is controlled too: passing `selection` turns it
// on, each row gets a Checkbox named by `getRowLabel` (or `selectRow`), and the
// header's Checkbox, checked when every row on this page is and mixed when some
// are, adds or removes this page's rows without touching the rest of the set.
// While anything is selected the bulk bar shows the count and `bulkActions`; a
// new count is a polite live region. A row with `onRowClick` opens on a press,
// a ripple in the subtle wash under its cells; the Checkbox never opens it, and
// a row without one is drawn bare, so nothing in it is disabled. Loading draws
// five rows of Skeletons, the first named "Loading"; no data draws
// `emptyState` in the body's place.
//
// `rowDetail` turns expansion on, in the list and in the table. Each row gets
// a disclosure after its Checkbox and before its cells, in a column one hit
// target wide: Button's icon-only ghost, `down` while the row is closed and
// `up` while it is open, named by `messages.detailsLabel` from `getRowName`,
// its state expanded or collapsed with the expand or collapse action. A press
// on it never opens the row. An open row draws what `rowDetail` returns in a
// row of its own under it, across every column, on the subtle fill. Any number
// of rows can be open. The table holds the open rows, starting from
// `defaultExpanded`, unless the app passes `expanded`; `onExpandedChange` is
// called with the next set in both cases. A row `isRowExpandable` refuses
// keeps the column, empty, and never draws a detail. `close`, which the detail
// is handed with its row, closes it and does nothing for a row that is not
// open; when focus is inside the detail it first moves focus to the row's
// disclosure, which would otherwise leave with the detail. The column has no
// header, because a Compose row has no column for a header to name. A detail
// appears and leaves without animation, and no row is open while loading.
//
// To TalkBack the DataTable is a collection of its rows and columns, and a row
// whose cells are text is one node; opening it is its click and selecting it a
// custom action. A row with a column that draws its own `cell`, or with a
// disclosure, keeps its nodes apart under the row's name, so a control in it
// is reachable. A detail is a node of its own after its row.
//
// Two props name a row's parts. `getRowName` is the row's own name, "Invoice
// 12": it names the row, and the disclosure through `detailsLabel`.
// `getRowLabel` is the whole name of the row's Checkbox, "Select Invoice 12":
// it names the Checkbox and the row's select action. A table whose app gives
// no `getRowName` names a row from `getRowLabel` when there is one, else from
// each column's header and value. That fallback is for an app that passes
// only `getRowLabel`: its rows keep their announcement.

package dev.polymorph.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.semantics.CollectionInfo
import androidx.compose.ui.semantics.CollectionItemInfo
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.collectionInfo
import androidx.compose.ui.semantics.collectionItemInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.intl.LocaleList
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.toUpperCase
import androidx.compose.ui.unit.dp
import kotlin.math.max

/** Which form a DataTable takes. */
enum class PMDataTableLayout(val value: String) { List("list"), Table("table") }

/**
 * The DataTable form to draw regardless of the window, for a fixture or a
 * preview; null follows the window's width class.
 */
val LocalPMDataTableLayout = compositionLocalOf<PMDataTableLayout?> { null }

object PMDataTable : PMDataTableRendering {
    /** Skeleton rows while loading, as the spec counts them. */
    private const val SKELETON_ROWS = 5

    @Composable
    override fun <R> Render(props: PMDataTableProps<R>) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val strings = PMSpecDefault.strings
        val window = with(LocalDensity.current) { LocalWindowInfo.current.containerSize.width.toDp() }
        val layout = LocalPMDataTableLayout.current
            ?: if (window < PMGeometry.compactWidth) PMDataTableLayout.List else PMDataTableLayout.Table
        val loading = props.loading ?: false
        val empty = !loading && props.data.isEmpty()
        val selection = props.selection ?: emptySet()
        val messages = props.messages ?: strings.dataTable
        // The table's own set of open rows. It follows every change, whoever
        // holds the set, so it is current when the app stops passing `expanded`.
        var ownExpanded by remember { mutableStateOf(props.defaultExpanded ?: emptySet()) }
        // A detail may call `close` after a later composition, a Save that
        // awaits and then closes, so a change reads the open rows and the
        // app's callback as they are when it is made.
        val open by rememberUpdatedState(props.expanded ?: ownExpanded)
        val report by rememberUpdatedState(props.onExpandedChange)
        val expansion = remember {
            Expansion({ open }) { next ->
                ownExpanded = next
                report?.invoke(next)
            }
        }
        val table = Table(props, messages, expansion)
        val attributes = buildMap {
            put("layout", layout.value)
            put("rows", props.data.size.toString())
            if (loading) put("loading", "true")
            if (empty) put("empty", "true")
            props.selection?.let { put("selected", it.size.toString()) }
            props.sort?.let { put("sort", "${it.key}:${it.direction.value}") }
            if (props.stickyHeader == true) put("sticky-header", "true")
            if (props.rowDetail != null && !loading) put("expanded", table.opened.toString())
        }

        Column(
            Modifier
                .pmMember("DataTable", attributes)
                .semantics {
                    contentDescription = props.label
                    isTraversalGroup = true
                    collectionInfo = CollectionInfo(props.data.size, props.columns.size)
                }
                .fillMaxWidth(),
        ) {
            if (props.selection != null && selection.isNotEmpty() && !empty) {
                Box(Modifier.padding(bottom = space.s3)) {
                    BulkBar(messages.selected(selection.size.toDouble()), props.bulkActions)
                }
            }
            when {
                empty -> PMEmptyState(
                    action = props.emptyState.action,
                    description = props.emptyState.description,
                    icon = props.emptyState.icon,
                    secondaryAction = props.emptyState.secondaryAction,
                    title = props.emptyState.title,
                )
                layout == PMDataTableLayout.Table -> table.Grid(loading)
                else -> table.List(loading)
            }
            if (props.pagination != null && !empty) {
                Row(Modifier.fillMaxWidth().padding(top = space.s4), horizontalArrangement = Arrangement.End) {
                    props.pagination.invoke()
                }
            }
        }
    }

    /** The bulk bar: the selection's count and the actions on it, in the selection's own colours. */
    @Composable
    private fun BulkBar(count: String, actions: PMContent?) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val shape = theme.rounded(theme.radius.sm)
        Box(
            Modifier
                .fillMaxWidth()
                .background(theme.colors.selectionSurface.color, shape)
                .border(PMGeometry.hairline, theme.colors.selectionBorder.color, shape)
                .padding(horizontal = space.s4, vertical = space.s2),
        ) {
            PMInline(gap = PMSpaceStep.S3, justify = PMInlineJustify.Between, wrap = true) {
                Text(
                    text = count,
                    style = theme.text.sm.textStyle,
                    color = theme.colors.accentText.color,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                )
                actions?.let { PMInline(gap = PMSpaceStep.S3, wrap = true) { it() } }
            }
        }
    }

    /** The open rows of one DataTable, read when they are asked for, and the one way to change them. */
    private class Expansion(private val read: () -> Set<String>, private val write: (Set<String>) -> Unit) {
        val open: Set<String> get() = read()

        fun toggle(id: String) = write(if (id in open) open - id else open + id)

        /** A detail's `close`: it does nothing for a row that is not open. */
        fun close(id: String) {
            if (id in open) write(open - id)
        }
    }

    /** One DataTable's drawing: its props, its messages, its open rows, and the parts both forms share. */
    private class Table<R>(
        val props: PMDataTableProps<R>,
        val messages: PMDataTableMessages,
        val expansion: Expansion,
    ) {
        private val ids = props.data.map(props.getRowId)

        /** The rows on this page that are drawn open. */
        val opened: Int get() = props.data.indices.count { expands(props.data[it]) && ids[it] in expansion.open }

        /** Whether a row has a detail: expansion is on and `isRowExpandable` does not refuse the row. */
        private fun expands(row: R) = props.rowDetail != null && props.isRowExpandable?.invoke(row) != false

        /** The table form: a header row, then a row per record. */
        @Composable
        fun Grid(loading: Boolean) {
            val theme = PM.theme
            val space = theme.defaultDensity.spacing
            // The selection column is a hit target wide, so a tap beside a
            // Checkbox toggles it rather than opening the row.
            val mark = theme.defaultDensity.hitTarget.dp
            Column {
                Row(Modifier.fillMaxWidth().semantics { heading() }, verticalAlignment = Alignment.CenterVertically) {
                    if (props.selection != null) Box(Modifier.width(mark), contentAlignment = Alignment.Center) { SelectAll() }
                    if (props.rowDetail != null) Box(Modifier.width(mark))
                    for (column in props.columns) {
                        Box(
                            Modifier.weight(1f).padding(horizontal = space.s4, vertical = space.s3),
                            contentAlignment = if (column.numeric == true && theme.numericAtEnd) Alignment.CenterEnd else Alignment.CenterStart,
                        ) { Header(column) }
                    }
                }
                PMRule(theme.colors.borderDefault)
                if (loading) {
                    for (index in 0 until SKELETON_ROWS) {
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            if (props.selection != null) {
                                Box(Modifier.width(mark), contentAlignment = Alignment.Center) {
                                    PMSkeleton(shape = PMSkeletonShape.Circle, size = PMSpaceStep.S4)
                                }
                            }
                            if (props.rowDetail != null) {
                                Box(Modifier.width(mark), contentAlignment = Alignment.Center) {
                                    PMSkeleton(shape = PMSkeletonShape.Circle, size = PMSpaceStep.S4)
                                }
                            }
                            props.columns.forEachIndexed { column, _ ->
                                Box(Modifier.weight(1f).padding(horizontal = space.s4, vertical = space.s3)) {
                                    PMSkeleton(label = busy(index, column), textStep = PMSkeletonTextStep.Sm)
                                }
                            }
                        }
                        PMRule(theme.colors.borderSubtle)
                    }
                } else {
                    props.data.forEachIndexed { index, row ->
                        key(ids[index]) {
                            val selected = props.selection?.contains(ids[index]) ?: false
                            val disclosure = remember { FocusRequester() }
                            Column(rowSemantics(row, ids[index], index, selected)) {
                                Row(
                                    Modifier.fillMaxWidth().background(selectionFill(selected)),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    if (props.selection != null) {
                                        Box(Modifier.width(mark), contentAlignment = Alignment.Center) {
                                            Mark(row, ids[index], selected)
                                        }
                                    }
                                    if (props.rowDetail != null) Disclosure(row, ids[index], disclosure)
                                    Opens(row, selected, Modifier.weight(1f)) {
                                        Row(Modifier.fillMaxWidth()) {
                                            for (column in props.columns) {
                                                Box(
                                                    Modifier.weight(1f).padding(horizontal = space.s4, vertical = space.s3),
                                                    contentAlignment = if (column.numeric == true && theme.numericAtEnd) Alignment.TopEnd else Alignment.TopStart,
                                                ) { Cell(column, row) }
                                            }
                                        }
                                    }
                                }
                                PMRule(theme.colors.borderSubtle)
                            }
                            Detail(row, ids[index], disclosure)
                        }
                    }
                }
            }
        }

        /** The list form: the sort bar, then a row per record, its columns as terms and values. */
        @Composable
        fun List(loading: Boolean) {
            val theme = PM.theme
            val space = theme.defaultDensity.spacing
            // The selection column is a hit target wide, so a tap beside a
            // Checkbox toggles it rather than opening the row.
            val mark = theme.defaultDensity.hitTarget.dp
            val sortable = props.columns.filter { it.sortable == true }
            Column {
                if (sortable.isNotEmpty() || props.selection != null) {
                    // The header's Checkbox over the rows' Checkboxes, and the
                    // sort bar over the rows' text.
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(space.s3),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (props.selection != null) Box(Modifier.width(mark), contentAlignment = Alignment.Center) { SelectAll() }
                        if (props.rowDetail != null) Box(Modifier.width(mark))
                        if (sortable.isNotEmpty()) {
                            Box(Modifier.padding(horizontal = space.s2)) {
                                PMInline(gap = PMSpaceStep.S4, wrap = true) { for (column in sortable) Header(column) }
                            }
                        }
                    }
                    PMRule(theme.colors.borderDefault)
                }
                if (loading) {
                    for (index in 0 until SKELETON_ROWS) {
                        Row(
                            Modifier.fillMaxWidth().padding(vertical = space.s3),
                            horizontalArrangement = Arrangement.spacedBy(space.s3),
                        ) {
                            if (props.selection != null) {
                                Box(Modifier.width(mark), contentAlignment = Alignment.Center) {
                                    PMSkeleton(shape = PMSkeletonShape.Circle, size = PMSpaceStep.S4)
                                }
                            }
                            if (props.rowDetail != null) {
                                Box(Modifier.width(mark), contentAlignment = Alignment.Center) {
                                    PMSkeleton(shape = PMSkeletonShape.Circle, size = PMSpaceStep.S4)
                                }
                            }
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(space.s2)) {
                                PMSkeleton(label = busy(index, 0), textStep = PMSkeletonTextStep.Sm)
                                PMSkeleton(textStep = PMSkeletonTextStep.Xs, width = PMSkeletonWidth.Width10)
                            }
                        }
                        PMRule(theme.colors.borderSubtle)
                    }
                } else {
                    val first = props.columns.firstOrNull()
                    val rest = props.columns.drop(1)
                    props.data.forEachIndexed { index, row ->
                        key(ids[index]) {
                            val selected = props.selection?.contains(ids[index]) ?: false
                            val disclosure = remember { FocusRequester() }
                            Column(rowSemantics(row, ids[index], index, selected)) {
                                Row(
                                    Modifier.fillMaxWidth().background(selectionFill(selected)),
                                    horizontalArrangement = Arrangement.spacedBy(space.s3),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    if (props.selection != null) {
                                        Box(Modifier.width(mark), contentAlignment = Alignment.Center) {
                                            Mark(row, ids[index], selected)
                                        }
                                    }
                                    if (props.rowDetail != null) Disclosure(row, ids[index], disclosure)
                                    Opens(row, selected, Modifier.weight(1f)) {
                                        Row(
                                            Modifier.fillMaxWidth().padding(horizontal = space.s2, vertical = space.s3),
                                            horizontalArrangement = Arrangement.spacedBy(space.s3),
                                            verticalAlignment = Alignment.CenterVertically,
                                        ) {
                                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(space.s2)) {
                                                first?.let { Cell(it, row) }
                                                if (rest.isNotEmpty()) Terms(rest, row)
                                            }
                                            if (props.onRowClick != null) {
                                                PMIconView(PMIconRole.Next, PMControlSize.Sm, tint = theme.colors.textMuted.color)
                                            }
                                        }
                                    }
                                }
                                PMRule(theme.colors.borderSubtle)
                            }
                            Detail(row, ids[index], disclosure)
                        }
                    }
                }
            }
        }

        /**
         * A row's cell in the expansion column, one hit target wide: the
         * disclosure, or nothing for a row `isRowExpandable` refuses. The
         * disclosure is Button's icon-only ghost, `down` while the row is
         * closed and `up` while it is open. Its name is the app's
         * `detailsLabel` of the row's name, else the spec's default for a row
         * with a name and for one without. `focus` reaches it from `close`.
         */
        @Composable
        private fun Disclosure(row: R, id: String, focus: FocusRequester) {
            val strings = PMSpecDefault.strings
            Box(
                Modifier.width(PM.theme.defaultDensity.hitTarget.dp).focusRequester(focus),
                contentAlignment = Alignment.Center,
            ) {
                if (expands(row)) {
                    val shown = id in expansion.open
                    val name = props.getRowName?.invoke(row)
                    PMButton(
                        appearance = PMButtonAppearance.GhostNeutral,
                        expanded = shown,
                        icon = if (shown) PMIconRole.Up else PMIconRole.Down,
                        iconOnly = true,
                        label = messages.detailsLabel?.invoke(name) ?: name?.let(strings.detailsFor) ?: strings.details,
                        onClick = { expansion.toggle(id) },
                        size = PMControlSize.Sm,
                    )
                }
            }
        }

        /**
         * An open row's detail, in a row of its own across every column: a
         * body cell's padding and type on the subtle fill, over a rule. Its
         * `close` first moves focus that is inside the detail to the row's
         * disclosure, because focus on a node that leaves is lost.
         */
        @Composable
        private fun Detail(row: R, id: String, disclosure: FocusRequester) {
            val draw = props.rowDetail
            if (draw == null || !expands(row) || id !in expansion.open) return
            val theme = PM.theme
            val space = theme.defaultDensity.spacing
            var focusWithin by remember { mutableStateOf(false) }
            // A `close` kept past the detail finds no focus to move.
            DisposableEffect(Unit) { onDispose { focusWithin = false } }
            Box(
                Modifier
                    .fillMaxWidth()
                    .pmMember("DataTable", mapOf("part" to "detail"))
                    .onFocusChanged { focusWithin = it.hasFocus }
                    .background(theme.colors.bgSubtle.color)
                    .padding(horizontal = space.s4, vertical = space.s3),
            ) {
                CompositionLocalProvider(
                    LocalTextStyle provides theme.text.sm.textStyle,
                    LocalContentColor provides theme.colors.textPrimary.color,
                ) {
                    draw(
                        PMDataTableRowDetail(row) {
                            if (focusWithin) disclosure.requestFocus()
                            expansion.close(id)
                        },
                    )
                }
            }
            PMRule(theme.colors.borderSubtle)
        }

        /** The columns after the first, each a term and its value, the terms in one aligned column. */
        @Composable
        private fun Terms(columns: List<PMDataTableColumn<R>>, row: R) {
            val theme = PM.theme
            val space = theme.defaultDensity.spacing
            val term = theme.colors.textSecondary.color
            Layout(
                content = {
                    for (column in columns) {
                        Text(
                            text = column.header.toUpperCase(LocaleList.current),
                            style = theme.text.xs.textStyle,
                            color = term,
                        )
                        Box { Cell(column, row) }
                    }
                },
            ) { measurables, constraints ->
                val gap = space.s4.roundToPx()
                val lineGap = space.s1.roundToPx()
                val terms = measurables.filterIndexed { index, _ -> index % 2 == 0 }
                    .map { it.measure(constraints.copy(minWidth = 0, minHeight = 0)) }
                val termWidth = terms.maxOfOrNull { it.width } ?: 0
                val valueWidth = max(0, constraints.maxWidth - termWidth - gap)
                val values = measurables.filterIndexed { index, _ -> index % 2 == 1 }
                    .map { it.measure(constraints.copy(minWidth = 0, minHeight = 0, maxWidth = valueWidth)) }
                val heights = terms.indices.map { max(terms[it].height, values[it].height) }
                val height = heights.sum() + lineGap * max(0, heights.size - 1)
                layout(constraints.maxWidth, height) {
                    var y = 0
                    for (index in terms.indices) {
                        terms[index].placeRelative(0, y)
                        values[index].placeRelative(termWidth + gap, y)
                        y += heights[index] + lineGap
                    }
                }
            }
        }

        /**
         * A row's cells: pressable when the table opens rows, with the press
         * wash under them, and bare when it does not, so nothing a column draws
         * is disabled.
         */
        @Composable
        private fun Opens(row: R, selected: Boolean, modifier: Modifier, content: @Composable () -> Unit) {
            val open = props.onRowClick
            if (open == null) {
                Box(modifier) { content() }
                return
            }
            val theme = PM.theme
            val interaction = remember { MutableInteractionSource() }
            val focused by interaction.collectIsFocusedAsState()
            Box(
                modifier
                    .clickable(interactionSource = interaction, indication = null) { open(row) }
                    .pmHitTarget()
                    // A row is square-cornered, so its ring is.
                    .pmFocusRing(focused, 0.dp),
            ) {
                PMPressLayer(
                    interaction,
                    (if (selected) theme.colors.selectionSurfaceHover else theme.colors.bgSubtle).color,
                    Modifier.matchParentSize(),
                )
                content()
            }
        }

        /** The name of a row's Checkbox and of the row's select action: `getRowLabel`, else `selectRow`. */
        private fun selectName(row: R) = props.getRowLabel?.invoke(row) ?: messages.selectRow

        /** A row's Checkbox: named by `getRowLabel`, else `selectRow`, and never the row's opener. */
        @Composable
        private fun Mark(row: R, id: String, selected: Boolean) {
            PMCheckbox(
                ariaLabel = selectName(row),
                checked = if (selected) PMCheckedState.Checked else PMCheckedState.Unchecked,
                onCheckedChange = { toggle(id) },
            )
        }

        /**
         * The header's Checkbox: checked when every row on this page is
         * selected, mixed when some are. It adds or removes this page's rows,
         * never the rest of the set: a selection kept across pages survives it.
         */
        @Composable
        private fun SelectAll() {
            val selection = props.selection ?: emptySet()
            val chosen = ids.count { it in selection }
            val state = when {
                ids.isEmpty() || chosen == 0 -> PMCheckedState.Unchecked
                chosen == ids.size -> PMCheckedState.Checked
                else -> PMCheckedState.Indeterminate
            }
            PMCheckbox(
                ariaLabel = messages.selectAll,
                checked = state,
                onCheckedChange = { next ->
                    props.onSelectionChange?.invoke(if (next == PMCheckedState.Checked) selection + ids else selection - ids.toSet())
                },
            )
        }

        /** A column's header: the overline text, a button when the column sorts. */
        @Composable
        private fun Header(column: PMDataTableColumn<R>) {
            val theme = PM.theme
            val colors = theme.colors
            val direction = if (props.sort?.key == column.key) props.sort.direction else null
            val title = column.header.toUpperCase(LocaleList.current)
            val sort = props.onSortChange
            if (column.sortable == true && sort != null) {
                val spoken = direction?.let { PMSort.spoken(it) }
                val interaction = remember { MutableInteractionSource() }
                val focused by interaction.collectIsFocusedAsState()
                Row(
                    modifier = Modifier
                        // The click before the clearing semantics, which drop
                        // what the modifiers after them add: it is the header's
                        // action.
                        .clickable(interactionSource = interaction, indication = null) {
                            sort(PMDataTableSort(column.key, if (direction == PMSortDirection.Asc) PMSortDirection.Desc else PMSortDirection.Asc))
                        }
                        .clearAndSetSemantics {
                            contentDescription = column.header
                            role = Role.Button
                            spoken?.let { stateDescription = it }
                            if (direction != null) selected = true
                        }
                        .pmHitTarget()
                        // The sort button is square-cornered, so its ring is.
                        .pmFocusRing(focused, 0.dp),
                    horizontalArrangement = Arrangement.spacedBy(theme.defaultDensity.spacing.s1),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = title,
                        style = theme.text.xs.textStyle,
                        color = (if (direction == null) colors.textSecondary else colors.textPrimary).color,
                    )
                    PMIconView(
                        PMSort.glyph(direction),
                        PMControlSize.Sm,
                        tint = (if (direction == null) colors.textMuted else colors.accentText).color,
                    )
                }
            } else {
                Text(
                    text = title,
                    style = theme.text.xs.textStyle,
                    color = colors.textSecondary.color,
                    modifier = Modifier.clearAndSetSemantics { contentDescription = column.header },
                )
            }
        }

        /**
         * A cell: the column's own drawing, or its text in the body cell's
         * recipe. A selected row's text keeps its colour: the row's fill is the
         * selected surface, which the contrast law holds every text role on.
         */
        @Composable
        private fun Cell(column: PMDataTableColumn<R>, row: R) {
            val draw = column.cell
            if (draw != null) {
                draw(row)
                return
            }
            val theme = PM.theme
            val numeric = column.numeric == true
            Text(
                text = column.value(row),
                style = theme.text.sm.textStyle.tabular(theme, numeric),
                color = theme.colors.textPrimary.color,
                textAlign = if (numeric && theme.numericAtEnd) TextAlign.End else TextAlign.Start,
            )
        }

        /**
         * A row to TalkBack. When every cell is text it is one node, opened
         * by its click and selected by a custom action; with a drawn cell or
         * a disclosure its nodes stay apart under the row's name. The row is
         * named by `getRowName`, its own name. Without `getRowName` it is
         * named by `getRowLabel`, the whole name of its Checkbox, else by each
         * column's header and value, which keeps the announcement of an app
         * that passes only `getRowLabel`. The select action has the
         * Checkbox's name.
         */
        @Composable
        private fun rowSemantics(row: R, id: String, index: Int, selected: Boolean): Modifier {
            val label = props.getRowName?.invoke(row)
                ?: props.getRowLabel?.invoke(row)
                ?: props.columns.joinToString(", ") { "${it.header}: ${it.value(row)}" }
            val item = CollectionItemInfo(index, 1, 0, props.columns.size)
            val combined = props.columns.none { it.cell != null } && !expands(row)
            val open = props.onRowClick
            val select = if (props.selection != null) ({ toggle(id) }) else null
            val selectName = selectName(row)
            return if (combined) {
                Modifier.clearAndSetSemantics {
                    contentDescription = label
                    collectionItemInfo = item
                    if (selected) this.selected = true
                    if (open != null) onClick { open(row); true }
                    select?.let { action ->
                        customActions = listOf(CustomAccessibilityAction(selectName) { action(); true })
                    }
                }
            } else {
                Modifier.semantics {
                    contentDescription = label
                    collectionItemInfo = item
                    if (selected) this.selected = true
                }
            }
        }

        @Composable
        private fun selectionFill(selected: Boolean) =
            if (selected) PM.theme.colors.selectionSurface.color else Color.Transparent

        private fun toggle(id: String) {
            val current = props.selection ?: emptySet()
            props.onSelectionChange?.invoke(if (id in current) current - id else current + id)
        }

        /** The loading region's one named skeleton, the first, as the web's `aria-busy`: the rest are hidden. */
        @Composable
        private fun busy(row: Int, column: Int): String? = if (row == 0 && column == 0) PMSpecDefault.strings.loading else null
    }
}

/** A sample record, what an app's row type would be: the DataTable and ListPage fixtures share it. */
data class PMSampleTicket(val id: String, val subject: String, val status: String, val priority: String, val replies: Int)

/**
 * DataTable's states, from the spec: the plain table and the list, a sorted
 * column, selection with none, some and every row selected, expansion with
 * every row closed, a row open in each form, a row that takes no detail and
 * selection with expansion, loading, empty, and the pagination row. The table
 * form is laid out at a tablet's width and scaled into the canvas.
 */
object DataTableStates : PMStates {
    override val member = "DataTable"

    val tickets = listOf(
        PMSampleTicket("t1", "Refund for a duplicate charge", "Open", "High", 4),
        PMSampleTicket("t2", "Cannot sign in on mobile", "Waiting", "Normal", 2),
        PMSampleTicket("t3", "Invoice address is wrong", "Closed", "Low", 7),
    )
    private const val label = "Tickets"
    private const val archive = "Archive"
    private const val note = "The customer was charged twice for one order."
    private const val done = "Done"
    private val empty = PMEmptyStateProps(icon = PMIconRole.Search, title = "No tickets match these filters")

    /** A row's detail: a line about the ticket, and a Done that closes it. */
    @Composable
    private fun Detail(detail: PMDataTableRowDetail<PMSampleTicket>) {
        PMInline(align = PMInlineAlign.Center, gap = PMSpaceStep.S3, justify = PMInlineJustify.Between, wrap = true) {
            PMText(size = PMTextSize.Sm) { Text(note) }
            PMButton(label = done, onClick = detail.close, size = PMControlSize.Sm, appearance = PMButtonAppearance.GhostNeutral)
        }
    }

    private fun columns(sortable: Boolean = false) = listOf(
        PMDataTableColumn<PMSampleTicket>("subject", "Subject", { it.subject }, sortable = sortable),
        PMDataTableColumn("status", "Status", { it.status }, cell = { ticket -> PMBadge(children = ticket.status) }),
        PMDataTableColumn("priority", "Priority", { it.priority }, sortable = sortable),
        PMDataTableColumn("replies", "Replies", { it.replies.toString() }, sortable = sortable, numeric = true),
    )

    @Composable
    private fun Sample(
        layout: PMDataTableLayout,
        data: List<PMSampleTicket> = tickets,
        sortable: Boolean = false,
        sort: PMDataTableSort? = null,
        selection: Set<String>? = null,
        loading: Boolean? = null,
        pagination: PMContent? = null,
        stickyHeader: Boolean? = null,
        // The rows open at first; a set, even an empty one, turns expansion on.
        open: Set<String>? = null,
        // The id of the one row that takes no detail.
        refuses: String? = null,
    ) {
        val table = @Composable {
            CompositionLocalProvider(LocalPMDataTableLayout provides layout) {
                PMDataTable(
                    bulkActions = { PMButton(label = archive, size = PMControlSize.Sm, appearance = PMButtonAppearance.GhostNeutral) },
                    columns = columns(sortable),
                    data = data,
                    defaultExpanded = open,
                    emptyState = empty,
                    getRowId = { it.id },
                    getRowName = { it.subject },
                    isRowExpandable = refuses?.let { refused -> { ticket -> ticket.id != refused } },
                    label = label,
                    loading = loading,
                    onRowClick = {},
                    onSelectionChange = {},
                    onSortChange = {},
                    pagination = pagination,
                    rowDetail = open?.let { { detail -> Detail(detail) } },
                    selection = selection,
                    sort = sort,
                    stickyHeader = stickyHeader,
                )
            }
        }
        if (layout == PMDataTableLayout.Table) PMFixtureWidth(PMGeometry.compactWidth) { table() } else table()
    }

    @Composable
    private fun Pager() {
        PMInline(gap = PMSpaceStep.S2) {
            PMButton(icon = PMIconRole.Previous, iconOnly = true, label = "Previous page", appearance = PMButtonAppearance.GhostNeutral)
            PMButton(icon = PMIconRole.Next, iconOnly = true, label = "Next page", appearance = PMButtonAppearance.GhostNeutral)
        }
    }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("table", expect = mapOf("layout" to "table", "rows" to "3", "label" to label)) {
                Sample(PMDataTableLayout.Table)
            },
            PMStateEntry("list", expect = mapOf("layout" to "list", "rows" to "3")) { Sample(PMDataTableLayout.List) },
            PMStateEntry("sorted ascending", expect = mapOf("sort" to "replies:asc")) {
                Sample(PMDataTableLayout.Table, sortable = true, sort = PMDataTableSort("replies", PMSortDirection.Asc))
            },
            PMStateEntry("sorted in the list", expect = mapOf("layout" to "list", "sort" to "replies:desc")) {
                Sample(PMDataTableLayout.List, sortable = true, sort = PMDataTableSort("replies", PMSortDirection.Desc))
            },
            PMStateEntry("selection, none", expect = mapOf("selected" to "0")) {
                Sample(PMDataTableLayout.Table, selection = emptySet())
            },
            PMStateEntry("selection, some", expect = mapOf("selected" to "1")) {
                Sample(PMDataTableLayout.Table, selection = setOf("t2"))
            },
            PMStateEntry("selection, all", expect = mapOf("selected" to "3")) {
                Sample(PMDataTableLayout.Table, selection = setOf("t1", "t2", "t3"))
            },
            PMStateEntry("selection in the list", expect = mapOf("layout" to "list", "selected" to "1")) {
                Sample(PMDataTableLayout.List, selection = setOf("t1"))
            },
            PMStateEntry("expandable, every row closed", expect = mapOf("layout" to "table", "expanded" to "0", "contains" to "Button")) {
                Sample(PMDataTableLayout.Table, open = emptySet())
            },
            PMStateEntry("a row open", expect = mapOf("layout" to "table", "expanded" to "1", "contains" to "Button")) {
                Sample(PMDataTableLayout.Table, open = setOf("t1"))
            },
            PMStateEntry("a row open in the list", expect = mapOf("layout" to "list", "expanded" to "1", "contains" to "Button")) {
                Sample(PMDataTableLayout.List, open = setOf("t1"))
            },
            PMStateEntry("a row that takes no detail", expect = mapOf("layout" to "table", "expanded" to "1")) {
                Sample(PMDataTableLayout.Table, open = setOf("t1", "t2"), refuses = "t2")
            },
            PMStateEntry("selection with expansion", expect = mapOf("layout" to "list", "selected" to "1", "expanded" to "1")) {
                Sample(PMDataTableLayout.List, selection = setOf("t1"), open = setOf("t1"))
            },
            PMStateEntry("loading", expect = mapOf("loading" to "true", "contains" to "Skeleton")) {
                Sample(PMDataTableLayout.Table, loading = true)
            },
            PMStateEntry("empty", expect = mapOf("empty" to "true", "contains" to "EmptyState")) {
                Sample(PMDataTableLayout.Table, data = emptyList())
            },
            PMStateEntry("with pagination") { Sample(PMDataTableLayout.Table, pagination = { Pager() }) },
            PMStateEntry(
                "sticky header — recorded, the page's scroll container pins nothing",
                expect = mapOf("sticky-header" to "true"),
            ) { Sample(PMDataTableLayout.Table, stickyHeader = true) },
        )
}
