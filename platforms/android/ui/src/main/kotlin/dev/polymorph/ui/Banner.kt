// Banner (`design/components/banner.md`): the notice that belongs to the
// application frame and stays until its cause ends. A row across the frame on
// its tone's wash, `space.2` and `space.4` inside, with a hairline in the
// tone's border at its foot and no radius, because it runs edge to edge:
// `neutral` is `bg.subtle` with `border.default`, and a tone is
// `{tone}.subtle` with `{tone}.border`, the pairing Alert uses. The row holds
// the tone glyph (`info`, `warning`, `error`) in `{tone}.text`, none on
// `neutral`; then the message and the action, which wrap as a pair; then the
// dismiss button, Button `ghost`/`neutral`/`sm` icon-only `close`, named by
// `dismissLabel` ("Dismiss"), when `onDismiss` is set.
//
// The message is `text.sm` in `text.primary`. The glyph, the message's first
// line, the action and the dismiss button share the centre of the row's first
// line. The recipe's line is the small control height. A small control here
// reserves the hit target's height in the layout (`pmHitTarget`), so the line
// of a Banner with an action or a dismiss button is the hit target tall, and
// the line of one without is the small control height. The message is padded
// above so its first line is centred on that line, and below as the recipe
// pads it, half of what a text line leaves of the small control height. The
// message takes the free width beside the action while it
// keeps at least the recipe's basis, twice `space.10`
// (`PMRecipe.bannerMessageBasis`); a narrower frame moves the action under the
// message, where it starts where the message starts. The dismiss button stays
// at the end of the first line. Right to left, the row and the pair mirror.
//
// No motion: the frame does not animate, so the Banner appears and leaves at
// once. A press on the dismiss button calls `onDismiss`; the app removes the
// Banner, and focus moves nowhere. The reading and focus order is the message,
// the action, then the dismiss button. The glyph is decorative.
//
// The root is a live region, the web's roles: polite for neutral, info and
// warning (`status`), and assertive for danger (`alert`), so TalkBack reads a
// Banner the app shows in response to an event with its role's politeness.
// The root's identifier carries `tone`.

package dev.polymorph.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.polymorph.tokens.PMColors
import dev.polymorph.tokens.PMDynamicColor

object PMBanner : PMBannerRendering {
    @Composable
    override fun Render(props: PMBannerProps) {
        val theme = PM.theme
        val tone = props.tone ?: PMBannerTone.Neutral
        val recipe = BannerRecipe(tone, theme.colors)
        val density = theme.defaultDensity
        val space = density.spacing
        val step = theme.text.sm
        val controls = props.action != null || props.onDismiss != null
        val tall = if (controls) maxOf(density.controlHeight.sm, density.hitTarget) else density.controlHeight.sm
        val line = tall.dp
        val rule = recipe.rule.color

        Row(
            Modifier
                .pmMember("Banner", mapOf("tone" to tone.value))
                .semantics {
                    liveRegion = if (tone == PMBannerTone.Danger) LiveRegionMode.Assertive else LiveRegionMode.Polite
                    isTraversalGroup = true
                }
                .fillMaxWidth()
                .background(recipe.wash.color)
                .drawBehind {
                    val hairline = PMGeometry.hairline.toPx()
                    drawRect(rule, Offset(0f, size.height - hairline), Size(size.width, hairline))
                }
                .padding(horizontal = space.s4, vertical = space.s2),
            horizontalArrangement = Arrangement.spacedBy(space.s3),
            verticalAlignment = Alignment.Top,
        ) {
            recipe.glyph?.let { glyph ->
                Box(Modifier.height(line), contentAlignment = Alignment.Center) {
                    PMIconView(glyph, PMControlSize.Md, tint = recipe.text.color)
                }
            }
            BannerContent(
                modifier = Modifier.weight(1f),
                columnGap = space.s3,
                rowGap = space.s2,
                basis = space.s10 * PMRecipe.bannerMessageBasis,
            ) {
                Box(
                    Modifier.padding(
                        top = centringInset(tall, step.lineBox),
                        bottom = centringInset(density.controlHeight.sm, step.lineBox),
                    ),
                ) {
                    CompositionLocalProvider(
                        LocalTextStyle provides step.textStyle,
                        LocalContentColor provides theme.colors.textPrimary.color,
                    ) { props.children() }
                }
                props.action?.let { action ->
                    Box(Modifier.heightIn(min = line), contentAlignment = Alignment.CenterStart) { action() }
                }
            }
            props.onDismiss?.let { dismiss ->
                PMButton(
                    icon = PMIconRole.Close,
                    iconOnly = true,
                    label = props.dismissLabel ?: PMSpecDefault.strings.dismiss,
                    onClick = dismiss,
                    size = PMControlSize.Sm,
                    appearance = PMButtonAppearance.GhostNeutral,
                )
            }
        }
    }

    /**
     * The message and the action as a pair that wraps. The action keeps its
     * own width; the message takes the rest of the line while that is at
     * least `basis`, and otherwise the whole width, with the action under it,
     * `rowGap` below, at the message's start.
     */
    @Composable
    private fun BannerContent(modifier: Modifier, columnGap: Dp, rowGap: Dp, basis: Dp, content: @Composable () -> Unit) {
        Layout(content, modifier) { measurables, constraints ->
            val message = measurables.firstOrNull() ?: return@Layout layout(0, 0) {}
            val action = measurables.getOrNull(1)
            val gap = columnGap.roundToPx()
            val width = if (constraints.hasBoundedWidth) {
                constraints.maxWidth
            } else {
                message.maxIntrinsicWidth(Constraints.Infinity) + (action?.let { gap + it.maxIntrinsicWidth(Constraints.Infinity) } ?: 0)
            }
            val fixed = { room: Int -> Constraints(minWidth = room, maxWidth = room) }
            if (action == null) {
                val alone = message.measure(fixed(width))
                return@Layout layout(width, alone.height) { alone.placeRelative(0, 0) }
            }
            val drawn = action.measure(Constraints(maxWidth = width))
            val room = width - gap - drawn.width
            if (room >= basis.roundToPx()) {
                val beside = message.measure(fixed(room))
                layout(width, maxOf(beside.height, drawn.height)) {
                    beside.placeRelative(0, 0)
                    drawn.placeRelative(room + gap, 0)
                }
            } else {
                val above = message.measure(fixed(width))
                val under = above.height + rowGap.roundToPx()
                layout(width, under + drawn.height) {
                    above.placeRelative(0, 0)
                    drawn.placeRelative(0, under)
                }
            }
        }
    }
}

/**
 * The tone's wash, its rule and its glyph: `{tone}.text` on `{tone}.subtle`,
 * the pairing the contrast law checks, and no glyph on `neutral`, which states
 * a fact.
 */
private class BannerRecipe(tone: PMBannerTone, c: PMColors) {
    val wash: PMDynamicColor
    val rule: PMDynamicColor
    val text: PMDynamicColor
    val glyph: PMIconRole?

    init {
        when (tone) {
            PMBannerTone.Neutral -> { wash = c.bgSubtle; rule = c.borderDefault; text = c.textPrimary; glyph = null }
            PMBannerTone.Info -> { wash = c.infoSubtle; rule = c.infoBorder; text = c.infoText; glyph = PMIconRole.Info }
            PMBannerTone.Warning -> {
                wash = c.warningSubtle; rule = c.warningBorder; text = c.warningText; glyph = PMIconRole.Warning
            }
            PMBannerTone.Danger -> { wash = c.dangerSubtle; rule = c.dangerBorder; text = c.dangerText; glyph = PMIconRole.Error }
        }
    }
}

/**
 * Banner's states, from the spec's States table: each tone, an action, the
 * dismiss button, and a long message whose action moves under it.
 */
object BannerStates : PMStates {
    override val member = "Banner"

    private const val session = "You are viewing Northwind Traders as a member of support."
    private const val snapshot = "This page shows the snapshot taken at 09:00. Live data is back at 10:00."
    private const val trial = "Your trial ends in 3 days."
    private const val outage = "Payments are unavailable. Orders are saved and charged when the service returns."
    private const val maintenance = "Scheduled maintenance on Sunday from 02:00 to 04:00 UTC."
    private const val delay = "Replies sent by email are delayed by about twenty minutes while the mail queue catches up. " +
        "Replies sent from this page arrive at once. Nothing is lost, and the queue is expected to clear within the hour."

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry(
                "neutral — a fact about the session, with the way out",
                expect = mapOf("tone" to "neutral", "contains" to "Button"),
            ) {
                PMBanner(
                    action = { PMButton(label = "Stop viewing", size = PMControlSize.Sm, appearance = PMButtonAppearance.GhostNeutral) },
                ) { Text(session) }
            },
            PMStateEntry("info", expect = mapOf("tone" to "info")) {
                PMBanner(tone = PMBannerTone.Info) { Text(snapshot) }
            },
            PMStateEntry("warning — with an action", expect = mapOf("tone" to "warning", "contains" to "Button")) {
                PMBanner(
                    action = { PMButton(label = "Upgrade plan", size = PMControlSize.Sm, appearance = PMButtonAppearance.SoftAccent) },
                    tone = PMBannerTone.Warning,
                ) { Text(trial) }
            },
            PMStateEntry("danger", expect = mapOf("tone" to "danger")) {
                PMBanner(tone = PMBannerTone.Danger) { Text(outage) }
            },
            PMStateEntry("dismissible — a reminder the reader may hide", expect = mapOf("tone" to "info", "contains" to "Button")) {
                PMBanner(onDismiss = {}, tone = PMBannerTone.Info) { Text(maintenance) }
            },
            PMStateEntry("a long message — it wraps, and the action moves under it", expect = mapOf("tone" to "warning")) {
                PMBanner(
                    action = { PMButton(label = "Status page", size = PMControlSize.Sm, appearance = PMButtonAppearance.GhostNeutral) },
                    onDismiss = {},
                    tone = PMBannerTone.Warning,
                ) { Text(delay) }
            },
        )
}
