// The layout parts several members share: the spacing a layout member's props
// give (Stack, Inline, Grid, Card), and the flex column, flex row and equal
// tracks the three layout members place their children with. Each is a
// custom `Layout`, because Compose's `Column`, `Row` and `FlowRow` cannot do
// what the web's flexbox and grid do here: stretch a child they cannot modify,
// spread children apart with a least gap, or choose a track count from the
// width they are offered.

package dev.polymorph.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.FirstBaseline
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.Measurable
import androidx.compose.ui.layout.Placeable
import androidx.compose.ui.layout.layoutId
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import kotlin.math.max
import kotlin.math.min

/**
 * The spacing a layout member's props give, as steps of the space scale, with
 * the instance patch (rung 3 of the exception ladder) applied last, key by key,
 * as the web merges it: `px` and `py` override `p` on their axis.
 */
class PMSpacing(
    gap: PMSpaceStep? = null,
    p: PMSpaceStep?,
    px: PMSpaceStep?,
    py: PMSpaceStep?,
    patch: PMLayoutPatch? = null,
) {
    val gap: PMSpaceStep? = patch?.gap ?: gap
    val p: PMSpaceStep? = patch?.p ?: p
    val px: PMSpaceStep? = patch?.px ?: px
    val py: PMSpaceStep? = patch?.py ?: py
    val patched: Boolean = patch != null

    val horizontal: PMSpaceStep get() = px ?: p ?: PMSpaceStep.S0
    val vertical: PMSpaceStep get() = py ?: p ?: PMSpaceStep.S0

    /**
     * The web's `data-gap`, `data-p`, `data-px` and `data-py`, only the ones
     * set, and `patched` when an instance patch applies.
     */
    val attributes: Map<String, String>
        get() = buildMap {
            gap?.let { put("gap", it.value.toString()) }
            p?.let { put("p", it.value.toString()) }
            px?.let { put("px", it.value.toString()) }
            py?.let { put("py", it.value.toString()) }
            if (patched) put("patched", "true")
        }
}

/**
 * The layout id of a child that stretches across its row in a flex row, as the
 * web's `align-self: stretch` does, whatever the row's own alignment: a
 * vertical Separator is as tall as the row it divides.
 */
object PMStretchesInRow

/** Marks the child as one that stretches across its row (`PMStretchesInRow`). */
fun Modifier.pmStretchesInRow(): Modifier = layoutId(PMStretchesInRow)

/** Where a flex line's children sit across it. */
enum class PMCrossAlign { Stretch, Start, Center, End, Baseline }

/** How a flex line spreads what is left along it. */
enum class PMMainJustify { Start, Center, End, Between }

/** The offset of the first child and the space between children, for `free` space left over. */
private fun spread(justify: PMMainJustify, free: Int, count: Int, gap: Int): Pair<Int, Int> = when (justify) {
    PMMainJustify.Start -> 0 to gap
    PMMainJustify.Center -> free / 2 to gap
    PMMainJustify.End -> free to gap
    PMMainJustify.Between -> 0 to (if (count > 1) gap + free / (count - 1) else gap)
}

/**
 * A flex column. It takes the width it is offered and the height of its
 * content; with a `justify` other than `start` it takes the height it is
 * offered too, when that is more, because spreading needs free space. A
 * stretched child is as wide as the column; another sits at `align`.
 */
@Composable
fun PMColumnLayout(
    gap: Dp,
    align: PMCrossAlign,
    justify: PMMainJustify,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Layout(content, modifier) { measurables, constraints ->
        val between = gap.roundToPx()
        val bounded = constraints.hasBoundedWidth
        val stretch = align == PMCrossAlign.Stretch && bounded
        val child = Constraints(
            minWidth = if (stretch) constraints.maxWidth else 0,
            maxWidth = constraints.maxWidth,
            maxHeight = constraints.maxHeight,
        )
        val placeables = measurables.map { it.measure(child) }
        val used = placeables.sumOf { it.height } + between * max(0, placeables.size - 1)
        val width = if (bounded) constraints.maxWidth else max(constraints.minWidth, placeables.maxOfOrNull { it.width } ?: 0)
        val offered = if (constraints.hasBoundedHeight) constraints.maxHeight else used
        val height = (if (justify == PMMainJustify.Start) used else max(used, offered))
            .coerceIn(constraints.minHeight, constraints.maxHeight)
        val (start, step) = spread(justify, max(0, height - used), placeables.size, between)
        layout(width, height) {
            var y = start
            for (placeable in placeables) {
                val x = when (align) {
                    PMCrossAlign.Center -> (width - placeable.width) / 2
                    PMCrossAlign.End -> width - placeable.width
                    else -> 0
                }
                placeable.placeRelative(x, y)
                y += placeable.height + step
            }
        }
    }
}

/**
 * A flex row. Without `wrap` it shares the width it is offered as a SwiftUI
 * `HStack` does, the least flexible child first, each offered an equal share of
 * what is left; with `wrap` each child keeps its own width and a line ends
 * where the next child would not fit, the gap between lines the gap between
 * children. It is as wide as its widest line, or as wide as it is offered when
 * `justify` has space to spread. `stretch` makes every child as tall as its
 * line; `baseline` lines children up on their first baselines. A child marked
 * `pmStretchesInRow` is as tall as its line whatever the alignment.
 */
@Composable
fun PMRowLayout(
    gap: Dp,
    align: PMCrossAlign,
    justify: PMMainJustify,
    wrap: Boolean,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Layout(content, modifier) { measurables, constraints ->
        val between = gap.roundToPx()
        val bounded = constraints.hasBoundedWidth
        val available = constraints.maxWidth
        val preferred = measurables.map { it.maxIntrinsicWidth(constraints.maxHeight) }
        val least = measurables.map { it.minIntrinsicWidth(constraints.maxHeight) }

        // Each child's width, and the children in lines.
        val widths = IntArray(measurables.size)
        val lines: List<List<Int>> = if (wrap) {
            val found = mutableListOf<MutableList<Int>>()
            var used = 0
            for (index in measurables.indices) {
                val width = if (bounded) min(preferred[index], available) else preferred[index]
                widths[index] = width
                val line = found.lastOrNull()
                if (line == null || (bounded && used + between + width > available)) {
                    found += mutableListOf(index)
                    used = width
                } else {
                    line += index
                    used += between + width
                }
            }
            found
        } else {
            if (bounded) {
                var remaining = available - between * max(0, measurables.size - 1)
                val order = measurables.indices.sortedBy { preferred[it] - least[it] }
                order.forEachIndexed { position, index ->
                    val share = max(0, remaining / (order.size - position))
                    val width = min(preferred[index], max(share, least[index]))
                    widths[index] = width
                    remaining -= width
                }
            } else {
                measurables.indices.forEach { widths[it] = preferred[it] }
            }
            listOf(measurables.indices.toList())
        }

        class Line(val placeables: List<Placeable>, val height: Int, val baseline: Int)

        val measured = lines.map { line ->
            val stretchHeight = if (align == PMCrossAlign.Stretch) {
                line.maxOfOrNull { measurables[it].maxIntrinsicHeight(widths[it]) } ?: 0
            } else {
                0
            }
            // A child that stretches in its row (a vertical Separator) is
            // measured after the others, as tall as they make the line.
            val sized = line.filter { measurables[it].layoutId != PMStretchesInRow }.associateWith { index ->
                measure(measurables[index], widths[index], if (align == PMCrossAlign.Stretch) stretchHeight else null, constraints)
            }
            val tallest = sized.values.maxOfOrNull { it.height } ?: 0
            val placeables = line.map { index -> sized[index] ?: measure(measurables[index], widths[index], tallest, constraints) }
            val baselines = placeables.map { baselineOf(it) }
            val baseline = baselines.maxOrNull() ?: 0
            val height = if (align == PMCrossAlign.Baseline) {
                baseline + (placeables.indices.maxOfOrNull { placeables[it].height - baselines[it] } ?: 0)
            } else {
                placeables.maxOfOrNull { it.height } ?: 0
            }
            Line(placeables, height, baseline)
        }
        val lineWidth = { line: Line -> line.placeables.sumOf { it.width } + between * max(0, line.placeables.size - 1) }
        val widest = measured.maxOfOrNull(lineWidth) ?: 0
        val width = (if (justify != PMMainJustify.Start && bounded) available else if (bounded) min(widest, available) else widest)
            .coerceAtLeast(constraints.minWidth)
        val height = (measured.sumOf { it.height } + between * max(0, measured.size - 1))
            .coerceIn(constraints.minHeight, constraints.maxHeight)

        layout(width, height) {
            var y = 0
            for (line in measured) {
                val (start, step) = spread(justify, max(0, width - lineWidth(line)), line.placeables.size, between)
                var x = start
                for (placeable in line.placeables) {
                    val top = when (align) {
                        PMCrossAlign.Stretch, PMCrossAlign.Start -> 0
                        PMCrossAlign.Center -> (line.height - placeable.height) / 2
                        PMCrossAlign.End -> line.height - placeable.height
                        PMCrossAlign.Baseline -> line.baseline - baselineOf(placeable)
                    }
                    placeable.placeRelative(x, y + top)
                    x += placeable.width + step
                }
                y += line.height + between
            }
        }
    }
}

private fun measure(measurable: Measurable, width: Int, height: Int?, constraints: Constraints): Placeable =
    measurable.measure(
        Constraints(
            minWidth = 0,
            maxWidth = width,
            minHeight = height ?: 0,
            maxHeight = height ?: constraints.maxHeight,
        ),
    )

/** A child's first baseline, or its bottom when it has no text. */
private fun baselineOf(placeable: Placeable): Int {
    val baseline = placeable[FirstBaseline]
    return if (baseline == androidx.compose.ui.layout.AlignmentLine.Unspecified) placeable.height else baseline
}

/**
 * Equal tracks in rows, the row gap the column gap. `ceiling` is the most
 * columns it draws: the width it is offered decides how many, all of them from
 * 44rem, half rounded up from 28rem, one below, never the device, because a
 * Grid in a sheet and a Grid on a page differ in width at the same moment.
 * Children fill tracks in order; every cell is as wide as its track, and a
 * stretched cell as tall as its row.
 */
@Composable
fun PMGridLayout(
    ceiling: Int,
    gap: Dp,
    align: PMCrossAlign,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Layout(content, modifier) { measurables, constraints ->
        val between = gap.roundToPx()
        val bounded = constraints.hasBoundedWidth
        val count = if (bounded) gridColumns(ceiling, constraints.maxWidth.toDp()) else ceiling
        val track = if (bounded) {
            max(0, (constraints.maxWidth - between * (count - 1)) / count)
        } else {
            measurables.maxOfOrNull { it.maxIntrinsicWidth(constraints.maxHeight) } ?: 0
        }
        val rows = measurables.chunked(count).map { row ->
            val stretched = if (align == PMCrossAlign.Stretch) row.maxOfOrNull { it.maxIntrinsicHeight(track) } ?: 0 else null
            row.map {
                it.measure(
                    Constraints(
                        minWidth = track,
                        maxWidth = track,
                        minHeight = stretched ?: 0,
                        maxHeight = stretched ?: constraints.maxHeight,
                    ),
                )
            }
        }
        val heights = rows.map { row -> row.maxOfOrNull { it.height } ?: 0 }
        val width = if (bounded) constraints.maxWidth else track * count + between * (count - 1)
        val height = (heights.sum() + between * max(0, rows.size - 1)).coerceIn(constraints.minHeight, constraints.maxHeight)
        layout(width, height) {
            var y = 0
            rows.forEachIndexed { index, row ->
                row.forEachIndexed { column, placeable ->
                    val top = when (align) {
                        PMCrossAlign.Center -> (heights[index] - placeable.height) / 2
                        PMCrossAlign.End -> heights[index] - placeable.height
                        else -> 0
                    }
                    placeable.placeRelative(column * (track + between), y + top)
                }
                y += heights[index] + between
            }
        }
    }
}

/** How many columns a width draws: the ceiling from 44rem, half of it rounded up from 28rem, else one. */
fun gridColumns(ceiling: Int, width: Dp): Int = when {
    width >= PMRecipe.gridWideFrom -> ceiling
    width >= PMRecipe.gridMiddleFrom -> (ceiling + 1) / 2
    else -> 1
}

/** The narrowest width that draws every column of a Grid's ceiling. */
val gridWideWidth: Dp get() = PMRecipe.gridWideFrom
