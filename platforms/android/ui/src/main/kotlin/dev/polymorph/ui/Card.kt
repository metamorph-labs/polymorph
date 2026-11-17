// Card (`design/components/card.md`): a bounded surface that groups related
// content. No variants: depth is the pairing's axis, so the shadow comes from
// the theme (none on a flat system, where the hairline border does the work),
// and the border is drawn at every depth. Cards do not nest.
//
// The interactive card navigates only. With `href`, a pressable layer covers
// the surface: one element named by `label`, opening the URL through the
// composition's `LocalUriHandler`, so the app decides where it goes. Given
// `onNavigate`, a press calls it with `href` in place of opening it, as Link
// does (`link.md` §Routing): what the app's router throws reaches the app,
// while an `href` the handler cannot open does nothing. The card's own content
// stays readable node by node beside it, as the web keeps it out of the link's
// name. Pressing it, or a pointer over it, raises the shadow one step and
// strengthens the border, the web's hover; on a flat system the border is the
// whole change. Keyboard focus draws the focus ring around the card.
//
// `title` is the card's one heading, before the content: the section-heading
// recipe Dashboard.Panel's title uses (`text.xs` uppercase in the secondary
// colour, `space.4` above the content), spoken as written and marked a
// heading. Android's semantics carry no level, so `headingLevel` (2 by
// default) is the member's `headingLevel` attribute; it never changes the look.
//
// `patch` is the instance patch, rung 3 of the exception ladder: a space step
// for the padding (`px` and `py` over `p`, as on Stack) and a radius step,
// each in place of the surface's own.

package dev.polymorph.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.intl.LocaleList
import androidx.compose.ui.text.toUpperCase
import androidx.compose.ui.unit.dp
import dev.polymorph.tokens.PMTheme

object PMCard : PMCardRendering {
    @Composable
    override fun Render(props: PMCardProps) {
        val theme = PM.theme
        val patch = props.patch
        val corner = patch?.radius?.let { radius(theme, it) } ?: theme.radius.surface
        val shape = theme.rounded(corner)
        val link = props.href
        val uri = LocalUriHandler.current
        val interaction = remember { MutableInteractionSource() }
        val hovered by interaction.collectIsHoveredAsState()
        val pressed by interaction.collectIsPressedAsState()
        val focused by interaction.collectIsFocusedAsState()
        val raised = link != null && (hovered || pressed)
        val motion = theme.defaultMotion
        val space = theme.defaultDensity.spacing
        val inset = theme.defaultDensity.inset.surface
        val spacing = PMSpacing(p = patch?.p, px = patch?.px, py = patch?.py)
        val border by animateColorAsState(
            (if (raised) theme.colors.borderDefault else theme.colors.borderSubtle).color,
            motion.easing.standard.tween(motion.duration.control),
            label = "border",
        )
        val attributes = spacing.attributes + buildMap {
            put("as", (props.`as` ?: PMCardAs.Div).value)
            if (link != null) put("interactive", "true")
            patch?.radius?.let { put("radius", it.value) }
            if (patch != null) put("patched", "true")
            if (props.title != null) put("headingLevel", (props.headingLevel ?: PMCardHeadingLevel.HeadingLevel2).value.toString())
        }
        val horizontal = (spacing.px ?: spacing.p)?.let { space[it] } ?: inset.dp
        val vertical = (spacing.py ?: spacing.p)?.let { space[it] } ?: inset.dp

        Box(
            Modifier
                .pmMember("Card", attributes)
                .fillMaxWidth()
                .pmShadow(if (raised) theme.shadows.transient else theme.shadows.resting, shape)
                .background(theme.colors.bgSurface.color, shape)
                .pmInsetShadow(theme.shadows.insetTop, shape)
                .border(PMGeometry.hairline, border, shape),
        ) {
            Box(Modifier.fillMaxWidth().padding(horizontal = horizontal, vertical = vertical)) {
                val title = props.title
                if (title == null) {
                    props.children?.invoke()
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(space.s4)) {
                        // The uppercase is drawn only: the title is spoken as written.
                        Text(
                            text = title.toUpperCase(LocaleList.current),
                            style = theme.text.xs.textStyle,
                            color = theme.colors.textSecondary.color,
                            modifier = Modifier.semantics {
                                contentDescription = title
                                heading()
                            },
                        )
                        props.children?.invoke()
                    }
                }
            }
            if (link != null) {
                val name = props.label ?: link
                val route = props.onNavigate
                val open = { if (route != null) route(link) else uri.pmOpen(link) }
                Box(
                    Modifier
                        .matchParentSize()
                        .clickable(interactionSource = interaction, indication = null) { open() }
                        .clearAndSetSemantics {
                            contentDescription = name
                            onClick { open(); true }
                        }
                        .pmFocusRing(focused, corner.dp),
                )
            }
        }
    }

    /** A radius step's length. */
    private fun radius(theme: PMTheme, step: PMRadiusStep): Float = when (step) {
        PMRadiusStep.None -> theme.radius.none
        PMRadiusStep.Sm -> theme.radius.sm
        PMRadiusStep.Md -> theme.radius.md
        PMRadiusStep.Lg -> theme.radius.lg
        PMRadiusStep.Pill -> theme.radius.pill
    }
}

/** Card's states, from the spec's States table. */
object CardStates : PMStates {
    override val member = "Card"

    private const val title = "Billing"
    private const val body = "Invoices, payment methods and the plan this workspace is on."
    private const val href = "https://example.com/settings/billing"
    private const val label = "Open billing settings"

    /** The content without its own heading, for a titled card, which has one. */
    @Composable
    private fun Prose() {
        PMText(size = PMTextSize.Sm, tone = PMTextTone.Secondary) { Text(body) }
    }

    @Composable
    private fun Content() {
        PMStack(gap = PMSpaceStep.S2) {
            PMHeading(children = title, level = PMHeadingLevel.Level3)
            PMText(size = PMTextSize.Sm, tone = PMTextTone.Secondary) { Text(body) }
        }
    }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("default", expect = mapOf("as" to "div")) { PMCard { Content() } },
            PMStateEntry("patched padding", expect = mapOf("p" to "4", "patched" to "true")) {
                PMCard(patch = PMCardPatch(p = PMSpaceStep.S4)) { Content() }
            },
            PMStateEntry("patched radius", expect = mapOf("radius" to "sm", "patched" to "true")) {
                PMCard(patch = PMCardPatch(radius = PMRadiusStep.Sm)) { Content() }
            },
            PMStateEntry("as section", expect = mapOf("as" to "section")) {
                PMCard(`as` = PMCardAs.Section) { Content() }
            },
            PMStateEntry("titled", expect = mapOf("as" to "div", "headingLevel" to "2")) {
                PMCard(title = title) { Prose() }
            },
            PMStateEntry("titled section, level 3", expect = mapOf("as" to "section", "headingLevel" to "3")) {
                PMCard(`as` = PMCardAs.Section, headingLevel = PMCardHeadingLevel.HeadingLevel3, title = title) { Prose() }
            },
            PMStateEntry("linked", expect = mapOf("as" to "div", "interactive" to "true")) {
                PMCard(href = href, label = label) { Content() }
            },
        )
}
