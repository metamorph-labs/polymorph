// Stat (`design/components/stat.md`): one key number with its label and the way
// it is moving. Content, not a surface: a Dashboard puts each in a Card. The
// value is formatted by the app; it snaps to a new value, because a counting
// animation would be decoration.
//
// Two ways to say the number moved, never both on one stat: `delta` carries
// sentiment (the success or the danger tone, from `positive`, which defaults to
// the direction being up, because down can be good news), and `trend` is the
// neutral outline Badge on the label row that says only which way. The footer's
// two lines differ by colour, not weight, and its trailing glyph is the trend's
// direction, so the chip and the line agree.
//
// The stat is one node: its label, value and delta read as one statement. The
// delta is spoken with its direction and its sentiment, because neither the
// arrow nor the colour is read aloud.
//
// Adapted on Android, as the platform map says: without the spark. Android has
// no first-party chart framework and Sparkline is absent there, so `spark` and
// `sparkLabel` are not drawn; the trend chip carries the direction.

package dev.polymorph.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.intl.LocaleList
import androidx.compose.ui.text.toUpperCase

object PMStat : PMStatRendering {
    @Composable
    override fun Render(props: PMStatProps) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val colors = theme.colors
        val strings = PMSpecDefault.strings
        val numeric = props.numeric ?: true
        val delta = props.delta
        val positive = delta?.let { it.positive ?: (it.direction == PMDeltaDirection.Up) }
        val attributes = buildMap {
            delta?.let { put("direction", it.direction.value) }
            positive?.let { put("positive", it.toString()) }
            props.trend?.let { put("trend", it.direction.value) }
            if (props.footer != null) put("footer", "true")
        }

        Column(
            modifier = Modifier
                .pmMember("Stat", attributes)
                .semantics(mergeDescendants = true) {}
                .fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(space.s2),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(space.s3), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = props.label.toUpperCase(LocaleList.current),
                    style = theme.text.xs.textStyle,
                    color = colors.textSecondary.color,
                    modifier = Modifier.weight(1f).clearAndSetSemantics { contentDescription = props.label },
                )
                if (props.icon != null || props.trend != null) {
                    // The end never shrinks, so the number, not the trend label, sets the width.
                    Row(horizontalArrangement = Arrangement.spacedBy(space.s2), verticalAlignment = Alignment.CenterVertically) {
                        props.icon?.let { PMIconView(it, PMControlSize.Md, tint = colors.textMuted.color) }
                        props.trend?.let {
                            PMBadge(children = it.label, icon = glyph(it.direction), variant = PMBadgeVariant.Outline)
                        }
                    }
                }
            }
            Text(
                text = props.value,
                style = theme.text.text3xl.textStyle.tabular(theme, numeric),
                color = colors.textPrimary.color,
            )
            if (delta != null && positive != null) {
                val tone = (if (positive) colors.successText else colors.dangerText).color
                Row(
                    // "up 12% — positive": the arrow and the colour say what
                    // TalkBack would not hear.
                    modifier = Modifier.clearAndSetSemantics {
                        contentDescription = strings.delta(
                            if (delta.direction == PMDeltaDirection.Up) strings.up else strings.down,
                            delta.value,
                            if (positive) strings.positive else strings.negative,
                        )
                    },
                    horizontalArrangement = Arrangement.spacedBy(space.s1),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    PMIconView(glyph(delta.direction), PMControlSize.Sm, tint = tone)
                    Text(text = delta.value, style = theme.text.sm.textStyle, color = tone)
                }
            } else {
                props.description?.let {
                    Text(text = it, style = theme.text.xs.textStyle, color = colors.textMuted.color)
                }
            }
            props.footer?.let { footer ->
                // Further from the number than the rows above (the column's gap
                // and this): the footer comments on the statement the label,
                // value and delta make.
                Column(Modifier.padding(top = space.s5), verticalArrangement = Arrangement.spacedBy(space.s2)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(space.s3), verticalAlignment = Alignment.CenterVertically) {
                        Text(text = footer.primary, style = theme.text.sm.textStyle, color = colors.textPrimary.color)
                        props.trend?.let { PMIconView(glyph(it.direction), PMControlSize.Sm, tint = colors.textPrimary.color) }
                    }
                    Text(text = footer.secondary, style = theme.text.sm.textStyle, color = colors.textMuted.color)
                }
            }
        }
    }

    fun glyph(direction: PMDeltaDirection): PMIconRole = when (direction) {
        PMDeltaDirection.Up -> PMIconRole.Up
        PMDeltaDirection.Down -> PMIconRole.Down
    }
}

/** Stat's states, from the spec's list of entries. */
object StatStates : PMStates {
    override val member = "Stat"

    private const val open = "Open tickets"
    private const val response = "First response"
    private const val plan = "Plan"
    private const val revenue = "Revenue"

    private val footer = PMStatFooter(primary = "Trending up this month", secondary = "Visitors for the last six months")
    private val fewer = PMStatFooter(primary = "Fewer escalations", secondary = "Compared with last quarter")

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("plain") { PMStat(label = open, value = "128") },
            PMStateEntry("with icon") { PMStat(icon = PMIconRole.Inbox, label = open, value = "128") },
            PMStateEntry("delta up positive", expect = mapOf("direction" to "up", "positive" to "true")) {
                PMStat(delta = PMStatDelta("12%", PMDeltaDirection.Up), label = revenue, value = "$48,200")
            },
            PMStateEntry("delta down positive", expect = mapOf("direction" to "down", "positive" to "true")) {
                PMStat(delta = PMStatDelta("8", PMDeltaDirection.Down, positive = true), label = open, value = "128")
            },
            PMStateEntry("delta down negative", expect = mapOf("direction" to "down", "positive" to "false")) {
                PMStat(delta = PMStatDelta("4%", PMDeltaDirection.Down), label = revenue, value = "$41,900")
            },
            PMStateEntry("description") { PMStat(description = "vs last week", label = open, value = "128") },
            PMStateEntry("non-numeric") { PMStat(label = plan, numeric = false, value = "Business") },
            PMStateEntry("trend up with a footer", expect = mapOf("trend" to "up", "footer" to "true")) {
                PMStat(footer = footer, label = revenue, trend = PMStatTrend(PMDeltaDirection.Up, "+12.5%"), value = "$48,200")
            },
            PMStateEntry("trend down with a footer", expect = mapOf("trend" to "down", "footer" to "true")) {
                PMStat(footer = fewer, label = open, trend = PMStatTrend(PMDeltaDirection.Down, "-20%"), value = "128")
            },
            PMStateEntry("footer without a trend", expect = mapOf("footer" to "true")) {
                PMStat(footer = fewer, label = open, value = "128")
            },
            PMStateEntry("trend without a footer", expect = mapOf("trend" to "up")) {
                PMStat(label = response, trend = PMStatTrend(PMDeltaDirection.Up, "4 fewer"), value = "2h 14m")
            },
        )
}
