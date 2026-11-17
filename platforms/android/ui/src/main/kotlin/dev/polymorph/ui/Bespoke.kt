// Bespoke (rung 4 of the exception ladder, `docs/rules.md`): a declared zone
// for what the vocabulary does not cover. On the web it is a `display:
// contents` wrapper that carries its `reason`, draws nothing and lets every
// token cascade in. Here it is its children as they are, under the same theme,
// and draws nothing of its own: the zone is a declaration, and the work inside
// it still reads the theme and keeps every accessibility law.
//
// `reason` is for a reviewer reading the inventory, not for a person using the
// screen, so it is not spoken. The member's identifier carries no attributes,
// because an identifier's values hold no spaces and a reason is a sentence.

package dev.polymorph.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics

object PMBespoke : PMBespokeRendering {
    @Composable
    override fun Render(props: PMBespokeProps) {
        // A group, never an element of its own: what is inside is read as it is.
        Box(Modifier.pmMember("Bespoke")) {
            props.children?.invoke()
        }
    }
}

/**
 * Bespoke's states: a zone around work the vocabulary has no member for,
 * drawn from the theme's tokens.
 */
object BespokeStates : PMStates {
    override val member = "Bespoke"

    private const val reason = "Promo illustration: overlapping discs the vocabulary has no shape primitive for."

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("a zone with its reason", expect = mapOf("contains" to "Badge")) {
                PMBespoke(reason = reason) { Sample() }
            },
        )

    /** Overlapping discs in the accent roles, beside a Badge the zone composes. */
    @Composable
    private fun Sample() {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val side = space.s10
        // The second disc covers half the first.
        val overlap = side / 2
        val disc = theme.rounded(theme.radius.pill)
        Row(horizontalArrangement = Arrangement.spacedBy(space.s4), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.width(side + overlap).clearAndSetSemantics {}) {
                Box(Modifier.size(side).background(theme.colors.accentSubtle.color, disc))
                Box(Modifier.offset(x = overlap).size(side).background(theme.colors.accentBg.color, disc))
            }
            PMBadge(children = "New", tone = PMBadgeTone.Accent)
        }
    }
}
