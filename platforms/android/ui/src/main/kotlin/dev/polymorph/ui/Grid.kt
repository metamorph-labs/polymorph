// Grid (`design/components/grid.md`): equal tracks for card fields, stat rows
// and form pairs. `columns` is a ceiling, not a guarantee: the width the Grid is
// offered decides how many it draws (all of them from 44rem, half rounded up
// from 28rem, one below), never the device, because a Grid in a sheet and a
// Grid on a page differ in width at the same moment. A custom layout
// (`PMGridLayout`) reads the offered width directly, which the web's container
// query approximates with twelve tracks and spans. Children fill tracks in
// order; every cell is as wide as its track, so content never overflows it.
//
// `patch` is the instance patch, as on Stack.

package dev.polymorph.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

object PMGrid : PMGridRendering {
    @Composable
    override fun Render(props: PMGridProps) {
        val space = PM.theme.defaultDensity.spacing
        val columns = props.columns ?: PMGridColumns.Columns2
        val align = props.align ?: PMGridAlign.Stretch
        val spacing = PMSpacing(props.gap, props.p, props.px, props.py, props.patch)
        val attributes = spacing.attributes + mapOf(
            "align" to align.value,
            "as" to (props.`as` ?: PMGridAs.Div).value,
            "columns" to columns.value.toString(),
        )

        PMGridLayout(
            ceiling = columns.value,
            gap = space[spacing.gap ?: PMSpaceStep.S0],
            align = when (align) {
                PMGridAlign.Stretch -> PMCrossAlign.Stretch
                PMGridAlign.Start -> PMCrossAlign.Start
                PMGridAlign.Center -> PMCrossAlign.Center
                PMGridAlign.End -> PMCrossAlign.End
            },
            modifier = Modifier
                .pmMember("Grid", attributes)
                .padding(horizontal = space[spacing.horizontal], vertical = space[spacing.vertical]),
        ) {
            props.children?.invoke()
        }
    }
}

/**
 * Grid's states, from the spec's States table. The harness's canvas is
 * narrower than 28rem, where a Grid draws one column; each entry lays its Grid
 * out at the width that admits its ceiling and scales it to fit, so the ladder
 * shows.
 */
object GridStates : PMStates {
    override val member = "Grid"

    @Composable
    private fun Cards(count: Int) {
        for (sample in PMSamples.statuses.take(count)) PMCard { PMBadge(children = sample) }
    }

    @Composable
    private fun Numbers() {
        for (number in 1..TWELVE) PMBadge(children = number.toString(), variant = PMBadgeVariant.Outline)
    }

    private const val TWELVE = 12

    override val entries: List<PMStateEntry>
        get() = listOf(PMGridColumns.Columns2, PMGridColumns.Columns3, PMGridColumns.Columns4).map { count ->
            PMStateEntry("${count.value} columns", expect = mapOf("columns" to count.value.toString())) {
                PMFixtureWidth(gridWideWidth) { PMGrid(columns = count, gap = PMSpaceStep.S3) { Cards(6) } }
            }
        } + listOf(
            PMStateEntry("gapped", expect = mapOf("gap" to "5", "columns" to "3")) {
                PMFixtureWidth(gridWideWidth) {
                    PMGrid(columns = PMGridColumns.Columns3, gap = PMSpaceStep.S5) { Cards(6) }
                }
            },
            PMStateEntry("patched", expect = mapOf("gap" to "2", "patched" to "true")) {
                PMFixtureWidth(gridWideWidth) {
                    PMGrid(
                        columns = PMGridColumns.Columns3,
                        gap = PMSpaceStep.S5,
                        patch = PMLayoutPatch(gap = PMSpaceStep.S2),
                    ) { Cards(6) }
                }
            },
            PMStateEntry("twelve columns", expect = mapOf("columns" to "12")) {
                PMFixtureWidth(gridWideWidth) {
                    PMGrid(columns = PMGridColumns.Columns12, gap = PMSpaceStep.S1) { Numbers() }
                }
            },
        )
}
