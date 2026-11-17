// Countdown (`design/components/countdown.md`): the time left until a moment,
// ticking each second, for a code that expires or a resend that unlocks. It
// writes `4:59`, then `1:02:05` from an hour, until `0:00`, in tabular
// figures, and calls `onEnd` once when the moment is reached. It takes the
// text style and the content colour of the text around it, as RelativeTime
// does.
//
// The time left is whole seconds, rounded up, read from the clock at each
// change and never counted down by subtraction (`PMCountdownTime`), so a late
// wake or a changed system clock cannot make it drift. An effect wakes when
// the time left reaches its next whole second, so the digits change on the
// second of the time left, and stops at the end. A moment already past when
// the member is composed draws `0:00` and calls `onEnd` once after it is
// composed. `until` is an ISO-8601 instant: one with an offset keeps it, and
// one without is read in UTC, because the module reaches no time zone, as
// RelativeTime reads it. A calendar date or a value that is not a moment
// draws nothing.
//
// To TalkBack the countdown is one node, named by `label`, its state the time
// left in words ("4 minutes, 59 seconds"), because digits with a colon are
// read as a time of day. The digits are Western and the words `PMStrings`'
// English, which an app translates through `LocalPMStrings`, because
// Compose's common code has no locale-aware formatter, so `locale` is not
// drawn (`undrawn.ts`). Nothing is announced unless `announce` is set; then a
// polite live region (`PMAnnouncement`), present from the first composition,
// says `messages.mark(label, time)` at one minute and at ten seconds left
// ("Time until the code expires: 1 minute"). A count that starts below a mark
// does not announce it, and the end is not a mark.

package dev.polymorph.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.stateDescription
import kotlin.time.Clock
import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.delay

object PMCountdown : PMCountdownRendering {
    @Composable
    override fun Render(props: PMCountdownProps) {
        val moment = remember(props.until) { PMCountdownTime.moment(props.until) } ?: return
        val theme = PM.theme
        val strings = PMSpecDefault.strings
        var left by remember(moment) { mutableStateOf(PMCountdownTime.left(moment, Clock.System.now())) }
        var announced by remember(moment) { mutableStateOf<String?>(null) }
        val label by rememberUpdatedState(props.label)
        val announce by rememberUpdatedState(props.announce ?: false)
        val mark by rememberUpdatedState(props.messages?.mark ?: strings.countdownMark)
        val onEnd by rememberUpdatedState(props.onEnd)
        val spokenStrings by rememberUpdatedState(strings)

        LaunchedEffect(moment) {
            var previous: Long? = null
            while (true) {
                val now = Clock.System.now()
                val current = PMCountdownTime.left(moment, now)
                left = current
                if (previous != null && announce && PMCountdownTime.marked(previous, current)) {
                    announced = mark(label, PMCountdownTime.spoken(current, spokenStrings))
                }
                if (current == 0L) {
                    onEnd?.invoke()
                    break
                }
                previous = current
                // The moment the time left becomes one second less.
                delay((moment - now) - (current - 1).seconds)
            }
        }

        Box {
            Text(
                text = PMCountdownTime.clock(left),
                style = LocalTextStyle.current.tabular(theme),
                modifier = Modifier
                    .pmMember("Countdown", if (left == 0L) mapOf("ended" to "true") else emptyMap())
                    .clearAndSetSemantics {
                        contentDescription = props.label
                        stateDescription = PMCountdownTime.spoken(left, strings)
                    },
            )
            if (props.announce == true) PMAnnouncement(announced)
        }
    }
}

/**
 * Countdown's states, from the spec's States table. Each moment is computed
 * from the clock as the fixture composes, a fixed distance from now, as the
 * web's fixture computes it; the cells then tick. The invalid entry, which
 * renders nothing, is not here: the harness holds every entry to a node that
 * carries its member and to a drawing, and `CountdownTimeTest` holds a value
 * that is not a moment to naming none.
 */
object CountdownStates : PMStates {
    override val member = "Countdown"

    private const val EXPIRES = "Time until the code expires"

    /** The ISO value `offset` seconds from now. */
    private fun moment(offset: Int): String = (Clock.System.now() + offset.seconds).toString()

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("minutes — m:ss", expect = mapOf("ended" to "", "label" to EXPIRES, "value" to "4 minutes, 59 seconds")) {
                InText { PMCountdown(label = EXPIRES, until = moment(299)) }
            },
            PMStateEntry("hours — h:mm:ss from an hour", expect = mapOf("value" to "1 hour, 2 minutes, 5 seconds")) {
                InText { PMCountdown(label = "Time until the session ends", until = moment(3725)) }
            },
            PMStateEntry("ended — 0:00 once the moment is reached", expect = mapOf("ended" to "true", "value" to "0 seconds")) {
                InText { PMCountdown(label = EXPIRES, until = moment(-5)) }
            },
            PMStateEntry("locale — the locale’s numerals and words", expect = mapOf("label" to EXPIRES)) {
                InText { PMCountdown(label = EXPIRES, locale = "ar-EG", until = moment(299)) }
            },
            PMStateEntry(
                "announced — a polite line at one minute and at ten seconds",
                expect = mapOf("value" to "1 minute, 5 seconds"),
            ) {
                InText { PMCountdown(announce = true, label = EXPIRES, until = moment(65)) }
            },
            PMStateEntry(
                "beside a Button — the application enables it at the end",
                expect = mapOf("label" to "Time until a new code can be sent"),
            ) {
                ResendBeside("Send a new code in", "Time until a new code can be sent", "Send a new code", moment(30))
            },
        )

    /**
     * The composition the spec shows: a sentence that ends in the countdown,
     * and the Button that waits for the end, which is the app's, disabled
     * until the countdown says the moment is reached. The sentence's lead is
     * hidden from TalkBack, because the countdown's label says what it counts
     * to.
     */
    @Composable
    private fun ResendBeside(lead: String, label: String, action: String, until: String) {
        val theme = PM.theme
        var locked by remember { mutableStateOf(true) }
        Row(
            horizontalArrangement = Arrangement.spacedBy(theme.defaultDensity.spacing.s3),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            InText {
                Row(horizontalArrangement = Arrangement.spacedBy(theme.defaultDensity.spacing.s2)) {
                    Text(lead, modifier = Modifier.clearAndSetSemantics { })
                    PMCountdown(label = label, onEnd = { locked = false }, until = until)
                }
            }
            PMButton(disabled = locked, label = action, size = PMControlSize.Sm, appearance = PMButtonAppearance.OutlineNeutral)
        }
    }

    /** A line of body text, whose style and colour the countdown takes. */
    @Composable
    private fun InText(content: @Composable () -> Unit) {
        val theme = PM.theme
        CompositionLocalProvider(
            LocalTextStyle provides theme.text.md.textStyle,
            LocalContentColor provides theme.colors.textPrimary.color,
            content = content,
        )
    }
}
