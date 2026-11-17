// Inline (`design/components/inline.md`): Stack's horizontal counterpart, for
// control rows, meta lines and action groups. `align` defaults to `center`, so
// controls of mixed heights line up; `baseline` aligns runs of text at
// different sizes on their first baselines. With `wrap`, children flow onto
// further lines, and the gap between lines equals the gap between children.
//
// A custom layout places the children (`PMRowLayout`). Without `wrap` it shares
// the width, the least flexible child first, and `justify` spreads what is
// left; with `wrap` each child keeps its own width and a line ends where the
// next child would not fit.
//
// `patch` is the instance patch, as on Stack.

package dev.polymorph.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

object PMInline : PMInlineRendering {
    @Composable
    override fun Render(props: PMInlineProps) {
        val space = PM.theme.defaultDensity.spacing
        val align = props.align ?: PMInlineAlign.Center
        val justify = props.justify ?: PMInlineJustify.Start
        val wrap = props.wrap ?: false
        val spacing = PMSpacing(props.gap, props.p, props.px, props.py, props.patch)
        val attributes = spacing.attributes + buildMap {
            put("align", align.value)
            put("as", (props.`as` ?: PMInlineAs.Div).value)
            put("justify", justify.value)
            if (wrap) put("wrap", "true")
        }

        PMRowLayout(
            gap = space[spacing.gap ?: PMSpaceStep.S0],
            align = when (align) {
                PMInlineAlign.Stretch -> PMCrossAlign.Stretch
                PMInlineAlign.Start -> PMCrossAlign.Start
                PMInlineAlign.Center -> PMCrossAlign.Center
                PMInlineAlign.End -> PMCrossAlign.End
                PMInlineAlign.Baseline -> PMCrossAlign.Baseline
            },
            justify = when (justify) {
                PMInlineJustify.Start -> PMMainJustify.Start
                PMInlineJustify.Center -> PMMainJustify.Center
                PMInlineJustify.End -> PMMainJustify.End
                PMInlineJustify.Between -> PMMainJustify.Between
            },
            wrap = wrap,
            modifier = Modifier
                .pmMember("Inline", attributes)
                .padding(horizontal = space[spacing.horizontal], vertical = space[spacing.vertical]),
        ) {
            props.children?.invoke()
        }
    }
}

/** Inline's states, from the spec's States table. */
object InlineStates : PMStates {
    override val member = "Inline"

    private const val meta = "Updated"
    private const val title = "Ticket"

    @Composable
    private fun Chips(count: Int) {
        for (chip in PMSamples.chips.take(count)) PMBadge(children = chip)
    }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("control row", expect = mapOf("align" to "center", "gap" to "3")) {
                PMInline(gap = PMSpaceStep.S3) {
                    PMButton(label = PMSamples.chips[0], size = PMControlSize.Sm)
                    PMText { Text(meta) }
                    PMBadge(children = PMSamples.chips[1], variant = PMBadgeVariant.Outline)
                }
            },
            PMStateEntry("baseline text", expect = mapOf("align" to "baseline")) {
                PMInline(align = PMInlineAlign.Baseline, gap = PMSpaceStep.S2) {
                    PMHeading(children = title)
                    PMText(size = PMTextSize.Sm) { Text(meta) }
                }
            },
            PMStateEntry("wrapping", expect = mapOf("wrap" to "true", "gap" to "2")) {
                PMInline(gap = PMSpaceStep.S2, wrap = true) { Chips(PMSamples.chips.size) }
            },
            PMStateEntry("justify between", expect = mapOf("justify" to "between")) {
                PMInline(gap = PMSpaceStep.S2, justify = PMInlineJustify.Between) { Chips(3) }
            },
        )
}
