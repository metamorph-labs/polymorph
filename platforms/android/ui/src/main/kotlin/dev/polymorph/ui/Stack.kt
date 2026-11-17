// Stack (`design/components/stack.md`): children in a column with a gap from the
// space scale. It draws nothing: no fill, border or radius, because surfaces are
// Card's. A custom layout places the children (`PMColumnLayout`), so `align` and
// `justify` apply to each child of the content, as flexbox applies them on the
// web; Compose's `Column` cannot stretch a child it cannot modify, or spread
// children apart with a least gap.
//
// `patch` is the instance patch, rung 3 of the exception ladder: its keys
// override the props of the same names.

package dev.polymorph.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

object PMStack : PMStackRendering {
    @Composable
    override fun Render(props: PMStackProps) {
        val space = PM.theme.defaultDensity.spacing
        val align = props.align ?: PMStackAlign.Stretch
        val justify = props.justify ?: PMStackJustify.Start
        val spacing = PMSpacing(props.gap, props.p, props.px, props.py, props.patch)
        val attributes = spacing.attributes + mapOf(
            "align" to align.value,
            "as" to (props.`as` ?: PMStackAs.Div).value,
            "justify" to justify.value,
        )

        // A group, never an element of its own: the children are read one by
        // one, as the web's layout primitives are invisible to assistive
        // technology.
        PMColumnLayout(
            gap = space[spacing.gap ?: PMSpaceStep.S0],
            align = when (align) {
                PMStackAlign.Stretch -> PMCrossAlign.Stretch
                PMStackAlign.Start -> PMCrossAlign.Start
                PMStackAlign.Center -> PMCrossAlign.Center
                PMStackAlign.End -> PMCrossAlign.End
            },
            justify = when (justify) {
                PMStackJustify.Start -> PMMainJustify.Start
                PMStackJustify.Center -> PMMainJustify.Center
                PMStackJustify.End -> PMMainJustify.End
                PMStackJustify.Between -> PMMainJustify.Between
            },
            modifier = Modifier
                .pmMember("Stack", attributes)
                .padding(horizontal = space[spacing.horizontal], vertical = space[spacing.vertical]),
        ) {
            props.children?.invoke()
        }
    }
}

/** Stack's states, from the spec's States table. */
object StackStates : PMStates {
    override val member = "Stack"

    @Composable
    private fun Chips() {
        for (chip in PMSamples.statuses.take(3)) PMBadge(children = chip)
    }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("gap 3", expect = mapOf("gap" to "3", "align" to "stretch")) {
                PMStack(gap = PMSpaceStep.S3) { Chips() }
            },
            PMStateEntry("gap 6", expect = mapOf("gap" to "6")) {
                PMStack(gap = PMSpaceStep.S6) { Chips() }
            },
            PMStateEntry("padded", expect = mapOf("p" to "5")) {
                PMStack(gap = PMSpaceStep.S2, p = PMSpaceStep.S5) { Chips() }
            },
            PMStateEntry("axis override", expect = mapOf("p" to "5", "py" to "2")) {
                PMStack(gap = PMSpaceStep.S2, p = PMSpaceStep.S5, py = PMSpaceStep.S2) { Chips() }
            },
            PMStateEntry("align and justify", expect = mapOf("align" to "center", "justify" to "between")) {
                // A column spreads its children only in the height it is given:
                // here, the harness's whole canvas.
                Box(Modifier.fillMaxHeight()) {
                    PMStack(align = PMStackAlign.Center, justify = PMStackJustify.Between) { Chips() }
                }
            },
            PMStateEntry("as list", expect = mapOf("as" to "ul")) {
                PMStack(`as` = PMStackAs.Ul, gap = PMSpaceStep.S1) { Chips() }
            },
            PMStateEntry("patched", expect = mapOf("gap" to "2", "patched" to "true")) {
                PMStack(gap = PMSpaceStep.S6, patch = PMLayoutPatch(gap = PMSpaceStep.S2)) { Chips() }
            },
        )
}
