// ErrorSummary (`design/components/error-summary.md`): every error of a failed
// submit in one danger panel, each a link to its field. It is navigation, not
// an Alert with links: no dismiss, no variants, and it goes when the app stops
// drawing it. An empty list draws nothing.
//
// Alert's danger recipe, row for row: the `danger.subtle` wash, a
// `danger.border` hairline, `radius.lg`, `space.4` inside, the `error` glyph
// at `md` one `text.sm` line tall beside the title, `space.3` between them.
// The title is `text.sm` in `text.primary`; the list starts `space.2` under
// it. Each link is `text.sm` in `danger.text`, always underlined, so colour is
// never the only signal (`PMTextLink`); a wrapped message keeps its underline
// on every line. Compose draws one underline thickness, so the web's thicker
// hover line has no counterpart, and each link's row is at least the hit
// target tall, which spaces the rows further apart than the web's `space.2`.
//
// It is an assertive live region, as the web's `role="alert"` is: TalkBack
// reads it when its errors change, and focus does not move.
//
// A link opens `#<fieldId>`, the web's anchor, through the composition's
// `LocalUriHandler`, so an app that provides a handler moves focus to that
// field, as the web's link focuses the control whose id it names. A field has
// no id a composable can be found by (FormField's `id` names nothing in
// Compose), so a handler that cannot open the fragment, as the platform's
// cannot, leaves the link doing nothing, as a fragment link to a missing id
// does nothing.

package dev.polymorph.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

object PMErrorSummary : PMErrorSummaryRendering {
    @Composable
    override fun Render(props: PMErrorSummaryProps) {
        if (props.errors.isEmpty()) return
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val colors = theme.colors
        val shape = theme.rounded(theme.radius.lg)
        val uri = LocalUriHandler.current

        Row(
            Modifier
                .pmMember("ErrorSummary", mapOf("errors" to props.errors.size.toString()))
                .semantics {
                    liveRegion = LiveRegionMode.Assertive
                    isTraversalGroup = true
                }
                .fillMaxWidth()
                .background(colors.dangerSubtle.color, shape)
                .border(PMGeometry.hairline, colors.dangerBorder.color, shape)
                .padding(space.s4),
            horizontalArrangement = Arrangement.spacedBy(space.s3),
        ) {
            // One text line tall, so the glyph stays beside the title's first line.
            Box(Modifier.heightIn(min = theme.text.sm.lineBox.dp), contentAlignment = Alignment.Center) {
                PMIconView(PMIconRole.Error, PMControlSize.Md, tint = colors.dangerText.color)
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(space.s2)) {
                Text(props.title, style = theme.text.sm.textStyle, color = colors.textPrimary.color)
                Column {
                    for (error in props.errors) {
                        PMTextLink(
                            text = error.label,
                            step = theme.text.sm,
                            color = colors.dangerText,
                            activeColor = colors.dangerText,
                            underlined = true,
                            onClick = { runCatching { uri.openUri("#${error.fieldId}") } },
                        )
                    }
                }
            }
        }
    }
}

/**
 * ErrorSummary's states, from the spec's States table. The empty list draws
 * nothing, so it has no entry: the harness holds every entry to drawing.
 */
object ErrorSummaryStates : PMStates {
    override val member = "ErrorSummary"

    private const val title = "The ticket can’t be raised yet"
    private val subject = PMErrorSummaryError("Subject is required", "subject")
    private val priority = PMErrorSummaryError("Pick a priority", "priority")
    private val steps = PMErrorSummaryError(
        "The reproduction steps need at least one step the support agent can follow before the ticket can be routed",
        "steps",
    )

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("two errors — every line a door", expect = mapOf("errors" to "2")) {
                PMErrorSummary(errors = listOf(subject, priority), title = title)
            },
            PMStateEntry("one error — the list kept, the count is content", expect = mapOf("errors" to "1")) {
                PMErrorSummary(errors = listOf(subject), title = title)
            },
            PMStateEntry("long labels — the underline survives the wrap", expect = mapOf("errors" to "2")) {
                PMErrorSummary(errors = listOf(steps, priority), title = title)
            },
        )
}
