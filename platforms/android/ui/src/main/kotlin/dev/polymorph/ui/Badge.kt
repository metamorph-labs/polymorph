// Badge (`design/components/badge.md`): a read-only micro-label for status and
// category, never pressable. The system's overline style: uppercase `text.xs`,
// emphasis from case and tracking, never an invented weight. Every variant works
// with every tone: a badge has no interactive states, so Button's "no neutral
// fill" rule does not apply, and the contract has no grid to narrow.
//
// Two forms take the text's place. A count draws its number, capped at `max`
// and followed by `+` past it, and draws nothing at zero. A dot is a round mark
// in the tone's solid fill, read as its `children`, or hidden from assistive
// technology when it has none.

package dev.polymorph.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.intl.LocaleList
import androidx.compose.ui.text.toUpperCase
import androidx.compose.ui.unit.dp
import dev.polymorph.tokens.PMColors
import dev.polymorph.tokens.PMDynamicColor

object PMBadge : PMBadgeRendering {
    @Composable
    override fun Render(props: PMBadgeProps) {
        val theme = PM.theme
        val variant = props.variant ?: PMBadgeVariant.Soft
        val tone = props.tone ?: PMBadgeTone.Neutral
        val space = theme.defaultDensity.spacing
        val recipe = BadgeRecipe(variant, tone, theme.colors)
        val shape = theme.rounded(theme.radius.detail)
        val text = recipe.text.color
        val attributes = mapOf("tone" to tone.value, "variant" to variant.value)

        val count = props.count
        if (count != null) {
            // `count > 0` is false for `NaN` too: zero, less, or no number draws nothing.
            if (count > 0) {
                val shown = countText(count, props.max ?: PMSpecDefault.badgeMax)
                Box(
                    modifier = Modifier
                        .pmMember("Badge", attributes + ("count" to shown))
                        .clearAndSetSemantics { contentDescription = shown }
                        .background(recipe.fill?.color ?: Color.Transparent, shape)
                        .border(PMGeometry.hairline, recipe.border?.color ?: Color.Transparent, shape)
                        // As tall as the step's size and `space.2`, not a whole
                        // line: figures and a plus sign have no descenders. Never
                        // narrower than it is tall.
                        .height(theme.text.xs.size.dp + space.s2)
                        .widthIn(min = theme.text.xs.size.dp + space.s2)
                        .padding(horizontal = space.s1),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = shown,
                        style = theme.text.xs.textStyle.tabular(theme),
                        color = text,
                        maxLines = 1,
                        softWrap = false,
                    )
                }
            }
            return
        }

        if (props.dot == true) {
            val words = props.children.orEmpty()
            Box(
                Modifier
                    .pmMember("Badge", attributes + ("dot" to "true"))
                    // A dot with no words is no node at all; its words are read in its place.
                    .clearAndSetSemantics { if (words.isNotEmpty()) contentDescription = words }
                    .size(space.s3)
                    .background(dotFill(tone, theme.colors).color, theme.rounded(theme.radius.pill)),
            )
            return
        }

        val words = props.children.orEmpty()
        Row(
            modifier = Modifier
                .pmMember("Badge", attributes)
                // One element, spoken as written: the uppercase it draws may be
                // read letter by letter.
                .clearAndSetSemantics { contentDescription = words }
                .background(recipe.fill?.color ?: Color.Transparent, shape)
                // The web draws a transparent hairline on every variant, so the
                // three are one size.
                .border(PMGeometry.hairline, recipe.border?.color ?: Color.Transparent, shape)
                .padding(horizontal = space.s3, vertical = space.s1),
            horizontalArrangement = Arrangement.spacedBy(space.s1),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            props.icon?.let { PMIconView(it, PMControlSize.Sm, tint = text) }
            Text(
                text = words.toUpperCase(LocaleList.current),
                style = theme.text.xs.textStyle,
                color = text,
                maxLines = 1,
                softWrap = false,
            )
        }
    }
}

/**
 * The count as drawn: the number as the web writes it, with no grouping, or
 * the cap and a plus sign past it.
 */
internal fun countText(count: Double, max: Double = PMSpecDefault.badgeMax): String {
    val written = { value: Double ->
        if (value % 1.0 == 0.0 && value < Long.MAX_VALUE) value.toLong().toString() else value.toString()
    }
    return if (count > max) written(max) + "+" else written(count)
}

/**
 * The dot's fill: the tone's solid colour, whatever the variant, because a
 * soft or an outline fill is too faint to be seen as a mark of its own.
 */
private fun dotFill(tone: PMBadgeTone, c: PMColors): PMDynamicColor = when (tone) {
    PMBadgeTone.Neutral -> c.bgInverse
    PMBadgeTone.Accent -> c.accentBg
    PMBadgeTone.Danger -> c.dangerSolid
    PMBadgeTone.Warning -> c.warningSolid
    PMBadgeTone.Success -> c.successSolid
    PMBadgeTone.Info -> c.infoSolid
}

/**
 * The eighteen cells, written out rather than derived, so each can be read
 * beside the spec's recipe tables.
 */
private class BadgeRecipe(variant: PMBadgeVariant, tone: PMBadgeTone, c: PMColors) {
    val text: PMDynamicColor
    val fill: PMDynamicColor?
    val border: PMDynamicColor?

    init {
        val cell: Triple<PMDynamicColor, PMDynamicColor?, PMDynamicColor?> = when (variant) {
            PMBadgeVariant.Soft -> when (tone) {
                PMBadgeTone.Neutral -> Triple(c.textSecondary, c.bgSubtle, null)
                PMBadgeTone.Accent -> Triple(c.accentText, c.accentSubtle, null)
                PMBadgeTone.Danger -> Triple(c.dangerText, c.dangerSubtle, null)
                PMBadgeTone.Warning -> Triple(c.warningText, c.warningSubtle, null)
                PMBadgeTone.Success -> Triple(c.successText, c.successSubtle, null)
                PMBadgeTone.Info -> Triple(c.infoText, c.infoSubtle, null)
            }
            PMBadgeVariant.Solid -> when (tone) {
                PMBadgeTone.Neutral -> Triple(c.textInverse, c.bgInverse, null)
                PMBadgeTone.Accent -> Triple(c.accentContrast, c.accentBg, null)
                PMBadgeTone.Danger -> Triple(c.dangerContrast, c.dangerSolid, null)
                PMBadgeTone.Warning -> Triple(c.warningContrast, c.warningSolid, null)
                PMBadgeTone.Success -> Triple(c.successContrast, c.successSolid, null)
                PMBadgeTone.Info -> Triple(c.infoContrast, c.infoSolid, null)
            }
            PMBadgeVariant.Outline -> when (tone) {
                PMBadgeTone.Neutral -> Triple(c.textSecondary, null, c.borderDefault)
                PMBadgeTone.Accent -> Triple(c.accentText, null, c.accentBg)
                PMBadgeTone.Danger -> Triple(c.dangerText, null, c.dangerBorder)
                PMBadgeTone.Warning -> Triple(c.warningText, null, c.warningBorder)
                PMBadgeTone.Success -> Triple(c.successText, null, c.successBorder)
                PMBadgeTone.Info -> Triple(c.infoText, null, c.infoBorder)
            }
        }
        text = cell.first
        fill = cell.second
        border = cell.third
    }
}

/**
 * Badge's states, from the spec's States table: every variant × tone cell (all
 * eighteen are lawful), and the leading icon.
 */
object BadgeStates : PMStates {
    override val member = "Badge"

    private const val active = "Active"
    private const val waiting = "Waiting"
    private const val fresh = "New"

    override val entries: List<PMStateEntry>
        get() = PMBadgeVariant.entries.flatMap { variant ->
            PMBadgeTone.entries.map { tone ->
                PMStateEntry(
                    "${variant.value} / ${tone.value}",
                    expect = mapOf("variant" to variant.value, "tone" to tone.value, "label" to active),
                ) {
                    PMBadge(children = active, tone = tone, variant = variant)
                }
            }
        } + listOf(
            PMStateEntry(
                "with an icon",
                expect = mapOf("variant" to "soft", "tone" to "neutral", "label" to waiting),
            ) {
                PMBadge(children = waiting, icon = PMIconRole.Time)
            },
            PMStateEntry(
                "a count",
                expect = mapOf("variant" to "solid", "tone" to "accent", "count" to "3", "label" to "3"),
            ) {
                PMBadge(count = 3.0, tone = PMBadgeTone.Accent, variant = PMBadgeVariant.Solid)
            },
            PMStateEntry(
                "a count past its cap",
                expect = mapOf("variant" to "solid", "tone" to "accent", "count" to "99+", "label" to "99+"),
            ) {
                PMBadge(count = 128.0, tone = PMBadgeTone.Accent, variant = PMBadgeVariant.Solid)
            },
            PMStateEntry("a dot", expect = mapOf("tone" to "accent", "dot" to "true", "label" to fresh)) {
                PMBadge(children = fresh, dot = true, tone = PMBadgeTone.Accent)
            },
            PMStateEntry("a dot in every tone", expect = mapOf("dot" to "true")) {
                Row(horizontalArrangement = Arrangement.spacedBy(PM.theme.defaultDensity.spacing.s3)) {
                    PMBadgeTone.entries.forEach { tone -> PMBadge(children = tone.value, dot = true, tone = tone) }
                }
            },
        )
}
