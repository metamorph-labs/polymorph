// Timeline (`design/components/timeline.md`): a vertical list of dated past
// events, such as a ticket's history. Nothing in it is active, upcoming or a
// control, because a past event cannot be acted on. It shows each event's
// `time` as the app formatted it and never sorts the events.
//
// Each event is a marker column `space.6` wide beside its copy, `space.3`
// apart. The mark is an icon in `PMMarkDisc` when the event has an `icon`,
// otherwise a `space.3` dot centred on the same axis; under it a
// `border.subtle` rule, `space.2` clear of the mark, runs to the next event's
// mark whatever the copy's height, and the last event has none. The copy is
// one column at every width: the title in `text.sm`, the time `2dp` under it
// in `text.xs` muted, the detail in `text.sm` secondary `space.2` under that,
// and `space.5` below it on every event but the last. A tone colours the mark
// and nothing else: neutral is the rest recipe, accent the accent family, and
// the four statuses their own (`{tone}.subtle`, `.border` and `.text` on an
// icon mark, `{tone}.solid` on a dot).
//
// The marker column is hidden from accessibility, because a coloured dot
// cannot be read out and the title says what happened. The list is named by
// `label`, and each event is one node read as its title, its time and its
// detail. An empty Timeline draws nothing: saying so is EmptyState's. No
// motion: past events do not change.

package dev.polymorph.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import dev.polymorph.tokens.PMColors
import dev.polymorph.tokens.PMDynamicColor

object PMTimeline : PMTimelineRendering {
    @Composable
    override fun Render(props: PMTimelineProps) {
        if (props.events.isEmpty()) return
        Column(
            Modifier
                .pmMember("Timeline", mapOf("events" to props.events.size.toString()))
                .semantics {
                    contentDescription = props.label
                    isTraversalGroup = true
                }
                .fillMaxWidth(),
        ) {
            props.events.forEachIndexed { index, event -> Event(event, last = index == props.events.size - 1) }
        }
    }

    /** One event: the marker column beside the copy, as tall as the copy, so the rule reaches the next mark. */
    @Composable
    private fun Event(event: PMTimelineEvent, last: Boolean) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val colors = theme.colors
        Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(space.s3)) {
            Marker(event, last)
            Column(
                Modifier
                    .weight(1f)
                    .heightIn(min = space.s6)
                    .padding(bottom = if (last) 0.dp else space.s5)
                    .semantics(mergeDescendants = true) {},
            ) {
                Text(event.title, style = theme.text.sm.textStyle, color = colors.textPrimary.color)
                Text(
                    event.time,
                    style = theme.text.xs.textStyle,
                    color = colors.textMuted.color,
                    modifier = Modifier.padding(top = PMGeometry.subline),
                )
                event.detail?.let {
                    Text(
                        it,
                        style = theme.text.sm.textStyle,
                        color = colors.textSecondary.color,
                        modifier = Modifier.padding(top = space.s2),
                    )
                }
            }
        }
    }

    /** The marker column: the mark, then the rule down to the next event. */
    @Composable
    private fun Marker(event: PMTimelineEvent, last: Boolean) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val recipe = Recipe(event.tone ?: PMTimelineTone.Neutral, theme.colors)
        Column(
            Modifier.width(space.s6).fillMaxHeight().semantics { hideFromAccessibility() },
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(space.s2),
        ) {
            val icon = event.icon
            if (icon != null) {
                PMMarkDisc(fill = recipe.wash, border = recipe.border, foreground = recipe.glyph) {
                    PMIconView(icon, PMControlSize.Sm, tint = recipe.glyph.color)
                }
            } else {
                // A dot is smaller than an icon mark, so it sits in a box of the
                // mark's height, on the same centre.
                Box(Modifier.size(space.s6), contentAlignment = Alignment.Center) {
                    Box(
                        Modifier
                            .size(space.s3)
                            .background(recipe.dot.color, theme.rounded(theme.radius.pill)),
                    )
                }
            }
            if (!last) PMRule(theme.colors.borderSubtle, Modifier.weight(1f), vertical = true)
        }
    }

    /** A tone's mark: an icon mark's wash, border and glyph, and a dot's fill. */
    private class Recipe(tone: PMTimelineTone, c: PMColors) {
        val wash: PMDynamicColor
        val border: PMDynamicColor
        val glyph: PMDynamicColor
        val dot: PMDynamicColor

        init {
            val cell = when (tone) {
                PMTimelineTone.Neutral -> listOf(c.bgSubtle, c.borderDefault, c.textSecondary, c.borderStrong)
                PMTimelineTone.Accent -> listOf(c.accentSubtle, c.accentBg, c.accentText, c.accentBg)
                PMTimelineTone.Info -> listOf(c.infoSubtle, c.infoBorder, c.infoText, c.infoSolid)
                PMTimelineTone.Success -> listOf(c.successSubtle, c.successBorder, c.successText, c.successSolid)
                PMTimelineTone.Warning -> listOf(c.warningSubtle, c.warningBorder, c.warningText, c.warningSolid)
                PMTimelineTone.Danger -> listOf(c.dangerSubtle, c.dangerBorder, c.dangerText, c.dangerSolid)
            }
            wash = cell[0]
            border = cell[1]
            glyph = cell[2]
            dot = cell[3]
        }
    }
}

/**
 * Timeline's states, from the spec's States table. The empty Timeline draws
 * nothing, so it has no entry: the harness holds every entry to drawing.
 */
object TimelineStates : PMStates {
    override val member = "Timeline"

    private const val label = "Ticket history"
    private const val every = "Every tone"

    private val history = listOf(
        PMTimelineEvent("Ticket opened", "3 days ago", icon = PMIconRole.Add, tone = PMTimelineTone.Info),
        PMTimelineEvent("Assigned to Ada Okonkwo", "2 days ago", detail = "Moved out of the Platform queue.", icon = PMIconRole.User),
        PMTimelineEvent(
            "Escalated to urgent",
            "4 hours ago",
            detail = "Second customer reported the same failure.",
            icon = PMIconRole.Warning,
            tone = PMTimelineTone.Danger,
        ),
        PMTimelineEvent("Replied to the customer", "20 minutes ago", icon = PMIconRole.Comment, tone = PMTimelineTone.Accent),
    )

    /** The same events with no icon, for the plain-dot column. */
    private val dots get() = history.map { PMTimelineEvent(it.title, it.time, detail = it.detail) }

    /** One icon event and one dot event per tone. */
    private val tones
        get() = PMTimelineTone.entries.flatMap { tone ->
            listOf(
                PMTimelineEvent("A ${tone.value} event", "just now", icon = PMIconRole.Tag, tone = tone),
                PMTimelineEvent("A ${tone.value} dot", "just now", tone = tone),
            )
        }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("a history — mixed marks and tones", expect = mapOf("label" to label, "events" to "4")) {
                PMTimeline(events = history, label = label)
            },
            PMStateEntry("dots only — no role on any event", expect = mapOf("events" to "4")) {
                PMTimeline(events = dots, label = label)
            },
            PMStateEntry("every tone", expect = mapOf("label" to every, "events" to "12")) {
                PMTimeline(events = tones, label = every)
            },
            PMStateEntry("detail — with and without", expect = mapOf("events" to "2")) {
                PMTimeline(events = history.subList(1, 3), label = label)
            },
            PMStateEntry("one event — nothing to join it to", expect = mapOf("events" to "1")) {
                PMTimeline(events = history.take(1), label = label)
            },
        )
}
