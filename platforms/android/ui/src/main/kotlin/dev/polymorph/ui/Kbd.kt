// Kbd (`design/components/kbd.md`): one keyboard key, drawn as a keycap, for
// shortcut hints in a Menu row, beside SearchInput and in help text. Display
// only: binding the shortcut is the app's. The key is `text.xs` in the
// pairing's mono family, `text.secondary` on `bg.subtle`, inside a
// `border.default` hairline whose bottom edge is twice as thick, which makes
// the key look raised in every geometry. The corners are `radius.sm`, the
// padding is `space.2` across, and the key is at least as wide as an `md`
// icon, so a one-letter key is not a sliver.
//
// The key is one node, read as its text, because Android has no keyboard-key
// semantics to give it. `⌘` and `K` side by side are two keys, and the joiner
// between them is the app's plain text, as on the web.

package dev.polymorph.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.dp
import dev.polymorph.tokens.PMTextStyle
import dev.polymorph.tokens.PMTheme

object PMKbd : PMKbdRendering {
    @Composable
    override fun Render(props: PMKbdProps) {
        val theme = PM.theme
        val colors = theme.colors
        val hairline = PMGeometry.hairline
        // The raised bottom edge: two hairlines, the recipe's 2px bottom border.
        val raised = hairline * 2
        val radius = theme.radius.sm.dp
        val outer = theme.rounded(theme.radius.sm)
        // The fill sits inside the border, so its corners follow the border's
        // inner edge.
        val inner = RoundedCornerShape(
            topStart = (radius - hairline).coerceAtLeast(0.dp),
            topEnd = (radius - hairline).coerceAtLeast(0.dp),
            bottomEnd = (radius - raised).coerceAtLeast(0.dp),
            bottomStart = (radius - raised).coerceAtLeast(0.dp),
        )

        Box(
            modifier = Modifier
                .pmMember("Kbd")
                .clearAndSetSemantics { contentDescription = props.children }
                .widthIn(min = theme.icon.md.size.dp)
                .background(colors.borderDefault.color, outer)
                .padding(start = hairline, top = hairline, end = hairline, bottom = raised)
                .background(colors.bgSubtle.color, inner)
                .padding(horizontal = theme.defaultDensity.spacing.s2),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = props.children,
                style = theme.text.xs.mono(theme).textStyle,
                color = colors.textSecondary.color,
                maxLines = 1,
                softWrap = false,
            )
        }
    }

    /** The step set in the pairing's mono family: the recipe's `--pm-font-mono` at this step's size. */
    private fun PMTextStyle.mono(theme: PMTheme): PMTextStyle = copy(family = theme.fonts.mono.family, slot = MONO_SLOT)

    /** The type slot whose family is the pairing's mono font. */
    private const val MONO_SLOT = "mono"
}

/**
 * Kbd's states, from the spec's States table: one key, a modifier pair and a
 * sequence with the joiner as plain text, a word key, and the hint a Menu row
 * draws at its end.
 */
object KbdStates : PMStates {
    override val member = "Kbd"

    private const val searchEverything = "Search everything"

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("single key", expect = mapOf("label" to "K")) { PMKbd(children = "K") },
            PMStateEntry("a modifier pair — two keys and the prose between them", expect = mapOf("label" to "⌘")) {
                Keys(listOf("⌘", "K"), joiner = "+")
            },
            PMStateEntry("a sequence, where the joiner is a different word", expect = mapOf("label" to "G")) {
                Keys(listOf("G", "I"), joiner = "then")
            },
            PMStateEntry("as a menu hint", expect = mapOf("label" to "⌘")) { MenuHint() },
            PMStateEntry("a wide key keeps the cap shape", expect = mapOf("label" to "Esc")) {
                PMKbd(children = "Esc")
            },
        )

    /** Keys with the app's plain-text joiner between them. */
    @Composable
    private fun Keys(keys: List<String>, joiner: String) {
        val theme = PM.theme
        Row(
            horizontalArrangement = Arrangement.spacedBy(theme.defaultDensity.spacing.s1),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            keys.forEachIndexed { index, key ->
                if (index > 0) Text(joiner, style = theme.text.sm.textStyle, color = theme.colors.textSecondary.color)
                PMKbd(children = key)
            }
        }
    }

    /** A row's label at the start and its shortcut at the end, as a Menu row draws them. */
    @Composable
    private fun MenuHint() {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        Row(
            horizontalArrangement = Arrangement.spacedBy(space.s4),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                searchEverything,
                style = theme.text.sm.textStyle,
                color = theme.colors.textPrimary.color,
                modifier = Modifier.weight(1f),
            )
            Row(horizontalArrangement = Arrangement.spacedBy(space.s1), verticalAlignment = Alignment.CenterVertically) {
                PMKbd(children = "⌘")
                PMKbd(children = "K")
            }
        }
    }
}
