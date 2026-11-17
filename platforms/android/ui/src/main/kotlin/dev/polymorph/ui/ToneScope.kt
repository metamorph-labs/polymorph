// ToneScope (rung 2 of the exception ladder, `docs/rules.md`): an inverted
// region, `value: inverse`, the one tone there is. On the web it sets
// `data-tone="inverse"`, and the colour and chart roles take the opposite
// mode's values there, while the gradients, glows, shadows, shell surfaces and
// the glass surface keep the outer scope's.
//
// Here the region is drawn in the opposite mode (`LocalPMDark`), so every role
// resolves to the other mode's value and the Material parts inside (a menu, a
// picker, a text cursor) invert with it, because the bridge builds its scheme
// from the same mode. The values the web keeps are kept: the region's pairing
// has the light and dark values of its glows, gradients, shell surfaces and
// glass surface exchanged, so in the opposite mode they resolve to what the
// outer mode gives. A shadow has one value in both modes, so it is kept as it
// is. It is not a second palette, and it adds no value the pairing does not
// have.
//
// A scope is a wrapper, not a surface: it draws nothing, and its children are
// read one by one. A child that wants the inverted surface draws it, as a Card
// does. The content colour (`LocalContentColor`), which Spinner, Icon and
// Material's text draw in when nothing names a colour, is the opposite mode's
// `text.primary` inside, as on the web, where `currentColor` follows the
// inverted roles. `as` chooses the web's element and is kept as an attribute.

package dev.polymorph.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import dev.polymorph.tokens.PMDynamicGradient
import dev.polymorph.tokens.PMDynamicShadow
import dev.polymorph.tokens.PMTheme

object PMToneScope : PMToneScopeRendering {
    @Composable
    override fun Render(props: PMToneScopeProps) {
        val theme = PM.theme
        val dark = PM.dark
        Box(
            Modifier.pmMember(
                "ToneScope",
                mapOf("tone" to props.value.value, "as" to (props.`as` ?: PMToneScopeAs.Div).value),
            ),
        ) {
            // The `when` names every tone, so a tone the contract adds does
            // not compile until it is drawn.
            when (props.value) {
                PMToneScopeValue.Inverse -> CompositionLocalProvider(
                    LocalPMTheme provides theme.keepingOuterMode(),
                    LocalPMDark provides !dark,
                    LocalContentColor provides theme.colors.textPrimary.resolve(!dark).color,
                ) {
                    props.children?.invoke()
                }
            }
        }
    }

    /**
     * The pairing with every value the web's inverse tone keeps exchanged, so
     * that drawn in the opposite mode those values are the outer mode's: the
     * glows, the gradients, the shell surfaces and the glass surface. A
     * colour's `inverse` is its two values exchanged.
     */
    private fun PMTheme.keepingOuterMode(): PMTheme = copy(
        glow = glow.copy(focus = glow.focus.exchanged, hover = glow.hover.exchanged),
        gradients = gradients.copy(
            accentGradient = gradients.accentGradient.exchanged,
            bgWash = gradients.bgWash.exchanged,
        ),
        shell = shell.copy(
            topbarBg = shell.topbarBg.inverse,
            railBg = shell.railBg.inverse,
            topbarBorder = shell.topbarBorder.inverse,
            railBorder = shell.railBorder.inverse,
        ),
        material = material.copy(surface = material.surface.inverse),
    )

    private val PMDynamicShadow.exchanged: PMDynamicShadow get() = PMDynamicShadow(light = dark, dark = light)

    private val PMDynamicGradient.exchanged: PMDynamicGradient get() = PMDynamicGradient(light = dark, dark = light)
}

/**
 * ToneScope's states: an inverted panel, a Card inside it, and a Badge and a
 * Button on the inverted surface, the roles all from the other mode.
 */
object ToneScopeStates : PMStates {
    override val member = "ToneScope"

    private const val note = "Saved views now follow you between devices."

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry(
                "inverse — a card in the other mode",
                expect = mapOf("tone" to "inverse", "as" to "div", "contains" to "Card,Heading,Text"),
            ) {
                PMToneScope(value = PMToneScopeValue.Inverse) {
                    PMCard {
                        PMStack(gap = PMSpaceStep.S2) {
                            PMHeading(children = "What’s new", level = PMHeadingLevel.Level3)
                            PMText(tone = PMTextTone.Secondary) { Text(note) }
                        }
                    }
                }
            },
            PMStateEntry(
                "inverse section — a badge and a button",
                expect = mapOf("tone" to "inverse", "as" to "section", "contains" to "Badge,Button"),
            ) {
                PMToneScope(`as` = PMToneScopeAs.Section, value = PMToneScopeValue.Inverse) {
                    PMCard {
                        PMInline(gap = PMSpaceStep.S3) {
                            PMBadge(children = "Beta", tone = PMBadgeTone.Accent)
                            PMButton(label = "Try it")
                        }
                    }
                }
            },
        )
}
