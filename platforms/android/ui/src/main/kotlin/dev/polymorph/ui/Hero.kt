// Hero (`design/components/hero.md`): the block that opens an introducing
// page, where a working screen has PageHeader. A page has one of the two,
// never both: the title is the page's one top-level heading. No size, tone or
// background: a quieter Hero is a PageHeader.
//
// A column `space.5` apart, with `space.8` above it and `space.7` below,
// because a display block brings its own room: the title in the display
// family's `display.lg`, in `text.primary`; the lede at `text.lg` in the body
// face, secondary; the actions, the app's Buttons, in a wrapping Inline
// `space.3` apart.
// `center` centres the text and the actions. In a Hero narrower than the
// recipe's breakpoint (26rem), as on a phone, the title takes the whole
// `display.md` step instead: the Hero's own width decides, not the window's,
// because a Hero in a narrow column needs the smaller step on any device. A
// word wider than the line breaks rather than being cut off, as Compose's text
// does.
//
// The title is a heading. No motion: a hero stands still.

package dev.polymorph.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign

object PMHero : PMHeroRendering {
    @Composable
    override fun Render(props: PMHeroProps) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val align = props.align ?: PMHeroAlign.Start
        val centred = align == PMHeroAlign.Center
        val textAlign = if (centred) TextAlign.Center else TextAlign.Start

        BoxWithConstraints(
            Modifier
                .pmMember("Hero", mapOf("align" to align.value))
                .fillMaxWidth()
                .padding(top = space.s8, bottom = space.s7),
        ) {
            val narrow = maxWidth < PMRecipe.heroNarrowBelow
            Column(
                Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(space.s5),
                horizontalAlignment = if (centred) Alignment.CenterHorizontally else Alignment.Start,
            ) {
                Text(
                    text = props.title,
                    style = (if (narrow) theme.display.md else theme.display.lg).textStyle,
                    color = theme.colors.textPrimary.color,
                    textAlign = textAlign,
                    modifier = Modifier.fillMaxWidth().semantics { heading() },
                )
                props.lede?.let {
                    // A lede is a paragraph, so it keeps the body face at `text.lg`'s size.
                    Text(
                        text = it,
                        style = theme.text.lg.inBodyFace(theme).textStyle,
                        color = theme.colors.textSecondary.color,
                        textAlign = textAlign,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                props.actions?.let { actions ->
                    PMInline(
                        gap = PMSpaceStep.S3,
                        justify = if (centred) PMInlineJustify.Center else PMInlineJustify.Start,
                        wrap = true,
                    ) { actions() }
                }
            }
        }
    }
}

/**
 * Hero's states, from the spec's States table, and the wide title: a Hero at
 * least 26rem wide, laid out at a tablet's width and scaled to the canvas.
 */
object HeroStates : PMStates {
    override val member = "Hero"

    private const val title = "One vocabulary. Any number of faces."
    private const val lede = "Every design decision is made exactly once, referenced everywhere, verified by law, and " +
        "safely changeable — by people and by agents."
    private const val browse = "Browse components"
    private const val brief = "Read the brief"

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("opening moment", expect = mapOf("align" to "start", "contains" to "Button")) {
                PMHero(actions = { PMButton(label = browse) }, lede = lede, title = title)
            },
            PMStateEntry("centered", expect = mapOf("align" to "center")) {
                PMHero(
                    actions = {
                        PMButton(label = browse)
                        PMButton(label = brief, appearance = PMButtonAppearance.GhostNeutral)
                    },
                    align = PMHeroAlign.Center,
                    lede = lede,
                    title = title,
                )
            },
            PMStateEntry("title alone", expect = mapOf("align" to "start")) { PMHero(title = title) },
            PMStateEntry("a wide Hero — display.lg", expect = mapOf("align" to "start")) {
                PMFixtureWidth(PMGeometry.compactWidth) {
                    PMHero(actions = { PMButton(label = browse) }, lede = lede, title = title)
                }
            },
        )
}
