// Heading (`design/components/heading.md`): a section heading at level 2, 3 or
// 4. Never level 1: PageHeader owns the page's title, so the type cannot ask for
// another. Level 2 is `text.xl`, level 3 `text.lg`; level 4 is `text.md` at the
// `text.xl` weight, because below `text.lg` the sizes are body sizes and weight
// marks the level. No margins: the Stack around it owns the rhythm.
//
// On Android a heading is the `heading` semantics, so TalkBack's headings
// navigation stops at it. Android's semantics carry no level, so the level is
// the step and the member's `level` attribute.

package dev.polymorph.ui

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import dev.polymorph.tokens.PMTextStyle
import dev.polymorph.tokens.PMTheme

object PMHeading : PMHeadingRendering {
    @Composable
    override fun Render(props: PMHeadingProps) {
        val theme = PM.theme
        val level = props.level ?: PMHeadingLevel.Level2
        Text(
            text = props.children,
            style = style(theme, level).textStyle,
            color = theme.colors.textPrimary.color,
            modifier = Modifier
                .pmMember("Heading", mapOf("level" to level.value.toString()))
                .semantics { heading() },
        )
    }

    private fun style(theme: PMTheme, level: PMHeadingLevel): PMTextStyle = when (level) {
        PMHeadingLevel.Level2 -> theme.text.xl
        PMHeadingLevel.Level3 -> theme.text.lg
        PMHeadingLevel.Level4 -> theme.text.md.weighted(like = theme.text.xl)
    }
}

/** Heading's states, from the spec's States table: one entry per level. */
object HeadingStates : PMStates {
    override val member = "Heading"

    private const val section = "Members"
    private const val subsection = "Invited"
    private const val subSubsection = "By email"

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("section heading", expect = mapOf("level" to "2", "label" to section)) {
                PMHeading(children = section)
            },
            PMStateEntry("subsection", expect = mapOf("level" to "3", "label" to subsection)) {
                PMHeading(children = subsection, level = PMHeadingLevel.Level3)
            },
            PMStateEntry("sub-subsection", expect = mapOf("level" to "4", "label" to subSubsection)) {
                PMHeading(children = subSubsection, level = PMHeadingLevel.Level4)
            },
        )
}
