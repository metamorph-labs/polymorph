// FilterBar (`design/components/filter-bar.md`): the filter row of a records
// screen, and the vocabulary's toolbar. In order: the search, the filter
// controls, the clear button while something is filtered, and the result count
// at the end of its line. The row wraps, `space.3` on both axes; narrower than
// the recipe's breakpoint (36rem) each cluster takes a line of its own, as wide
// as the bar, because a search field, a filter and a count side by side in a
// phone's width are too narrow to use. The bar's own width decides, not the
// window's.
//
// The clear button is Button `ghost/neutral/sm` with the `clear` glyph, and
// fades in at the control duration when filtering starts; it goes at once when
// filtering ends, as the web's unmounts. The count is `text.sm`, muted, and
// secondary while filtered, because it then reports the reader's change; it is
// a polite live region, read when it changes, and the page announces nothing
// itself. Every string is in `messages`; without it the spec's English
// defaults (`PMStrings`) are used.

package dev.polymorph.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.fadeIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.layoutId
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Constraints
import kotlin.math.max

object PMFilterBar : PMFilterBarRendering {
    /** The layout id of the result count, which the bar puts at the end of its line. */
    private object Count

    @Composable
    override fun Render(props: PMFilterBarProps) {
        val theme = PM.theme
        val motion = theme.defaultMotion
        val strings = PMSpecDefault.strings
        val messages = props.messages ?: PMFilterBarMessages(
            clear = strings.clearFilters,
            resultCount = { count -> count.total?.let { strings.resultsOf(count.shown, it) } ?: strings.results(count.shown) },
        )
        val gap = theme.defaultDensity.spacing.s3

        Layout(
            content = {
                props.search?.invoke()
                props.children?.invoke()
                AnimatedVisibility(
                    visible = props.isFiltered,
                    enter = fadeIn(motion.easing.enter.tween(motion.duration.control)),
                    exit = ExitTransition.None,
                ) {
                    PMButton(
                        icon = PMIconRole.Clear,
                        label = messages.clear,
                        onClick = props.onClear,
                        size = PMControlSize.Sm,
                        appearance = PMButtonAppearance.GhostNeutral,
                    )
                }
                props.resultCount?.let { count ->
                    Text(
                        text = messages.resultCount(count),
                        style = theme.text.sm.textStyle,
                        color = (if (props.isFiltered) theme.colors.textSecondary else theme.colors.textMuted).color,
                        maxLines = 1,
                        modifier = Modifier
                            .layoutId(Count)
                            .semantics { liveRegion = LiveRegionMode.Polite },
                    )
                }
            },
            modifier = Modifier
                .pmMember("FilterBar", if (props.isFiltered) mapOf("filtered" to "true") else emptyMap())
                .semantics { isTraversalGroup = true },
        ) { measurables, constraints ->
            val width = if (constraints.hasBoundedWidth) constraints.maxWidth else PMRecipe.filterBarNarrowBelow.roundToPx()
            val stacked = width < PMRecipe.filterBarNarrowBelow.roundToPx()
            val between = gap.roundToPx()
            val placeables = measurables.map {
                it.measure(
                    if (stacked) Constraints.fixedWidth(width).copy(minHeight = 0, maxHeight = constraints.maxHeight)
                    else Constraints(maxWidth = width, maxHeight = constraints.maxHeight),
                )
            }
            // The lines: one child each when stacked, otherwise as many as fit.
            val lines = mutableListOf<MutableList<Int>>()
            var used = 0
            placeables.forEachIndexed { index, placeable ->
                val line = lines.lastOrNull()
                if (line == null || stacked || used + between + placeable.width > width) {
                    lines += mutableListOf(index)
                    used = placeable.width
                } else {
                    line += index
                    used += between + placeable.width
                }
            }
            val heights = lines.map { line -> line.maxOf { placeables[it].height } }
            val height = heights.sum() + between * max(0, lines.size - 1)
            layout(width, height) {
                var y = 0
                lines.forEachIndexed { row, line ->
                    var x = 0
                    for (index in line) {
                        val placeable = placeables[index]
                        if (measurables[index].layoutId == Count && !stacked) x = width - placeable.width
                        placeable.placeRelative(x, y + (heights[row] - placeable.height) / 2)
                        x += placeable.width + between
                    }
                    y += heights[row] + between
                }
            }
        }
    }
}

/**
 * FilterBar's states, from the spec's States table: unfiltered (no clear),
 * filtered (the clear button), a count with and without a total, and the
 * wide bar, laid out at a tablet's width, where the clusters share a line.
 */
object FilterBarStates : PMStates {
    override val member = "FilterBar"

    private const val open = "Open"
    private const val priority = "High priority"
    private const val search = "Search tickets"

    @Composable
    private fun Controls() {
        PMButton(label = open, size = PMControlSize.Sm, appearance = PMButtonAppearance.OutlineNeutral)
        PMButton(label = priority, size = PMControlSize.Sm, appearance = PMButtonAppearance.OutlineNeutral)
    }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("unfiltered — no clear", expect = mapOf("contains" to "Button")) {
                PMFilterBar(isFiltered = false, onClear = {}) { Controls() }
            },
            PMStateEntry("filtered — the clear button", expect = mapOf("filtered" to "true")) {
                PMFilterBar(isFiltered = true, onClear = {}) { Controls() }
            },
            PMStateEntry("with a count", expect = mapOf("filtered" to "true")) {
                PMFilterBar(isFiltered = true, onClear = {}, resultCount = PMFilterResultCount(12.0, 48.0)) { Controls() }
            },
            PMStateEntry("a count without a total") {
                PMFilterBar(isFiltered = false, onClear = {}, resultCount = PMFilterResultCount(25.0)) { Controls() }
            },
            PMStateEntry("wide — the clusters share a line, the count at its end", expect = mapOf("filtered" to "true")) {
                PMFixtureWidth(PMGeometry.compactWidth) {
                    PMFilterBar(
                        isFiltered = true,
                        onClear = {},
                        resultCount = PMFilterResultCount(12.0, 48.0),
                        search = { PMInput(ariaLabel = search, icon = PMIconRole.Search, placeholder = search, size = PMControlSize.Sm) },
                    ) { Controls() }
                }
            },
        )
}
