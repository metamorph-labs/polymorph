// Code (`design/components/code.md`): inline code, such as a token name, a flag
// or a path, in the mono face on the subtle wash, `radius.sm`. The size is
// `text.sm` whatever the text around it, so a screen has one mono size rather
// than two a step apart. Padding is on the horizontal axis only, as on the web,
// where vertical padding would push apart the lines of the paragraph it sits
// in.
//
// A composable cannot flow inside a wrapped paragraph, so Code sits beside text
// in a row, a table cell or a settings row; prose with code in it is
// Markdown's, which sets its code spans in the same face, size and wash. It is
// one node, read as the code as written.

package dev.polymorph.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.semantics

object PMCode : PMCodeRendering {
    @Composable
    override fun Render(props: PMCodeProps) {
        val theme = PM.theme
        Text(
            text = props.children,
            style = theme.text.sm.mono(theme).textStyle,
            color = theme.colors.textPrimary.color,
            modifier = Modifier
                .pmMember("Code")
                .background(theme.colors.bgSubtle.color, theme.rounded(theme.radius.sm))
                .padding(horizontal = theme.defaultDensity.spacing.s1),
        )
    }
}

/**
 * Code's states, from the spec's States table: the chip after text, the same
 * size beside smaller text, and several chips in a row.
 */
object CodeStates : PMStates {
    override val member = "Code"

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("inline", expect = mapOf("label" to "pm-system")) {
                Beside("Set", listOf("pm-system"), PMTextSize.Md)
            },
            PMStateEntry("one mono size, whatever the text around it", expect = mapOf("label" to "pnpm registry")) {
                Beside("Run", listOf("pnpm registry"), PMTextSize.Sm)
            },
            PMStateEntry("several in a row", expect = mapOf("label" to "data-system")) {
                Beside("Wear", listOf("data-system", "data-palette"), PMTextSize.Md)
            },
        )

    /**
     * Text and then code, on one line: the fixture's stand-in for a sentence.
     * The text is scenery, hidden from accessibility.
     */
    @Composable
    private fun Beside(lead: String, code: List<String>, size: PMTextSize) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(PM.theme.defaultDensity.spacing.s2),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.semantics { hideFromAccessibility() }) {
                Text(lead, style = (if (size == PMTextSize.Sm) PM.theme.text.sm else PM.theme.text.md).textStyle)
            }
            for (chip in code) PMCode(children = chip)
        }
    }
}
