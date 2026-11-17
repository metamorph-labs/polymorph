// Highlight (`design/components/highlight.md`): the parts of a text that match
// a search, marked. One Material `Text` of an `AnnotatedString`, its runs from
// `PMHighlightRuns`, the engine's `highlightRuns` on the web, so the same text
// and the same query mark the same characters. It is phrasing content: it sets
// no style and no colour, so it takes the type and the tone of the text around
// it from Material's text style and content colour, which Text and the other
// text members provide, as the web's span inherits them.
//
// A mark is a run on `warning.subtle` in `warning.text`, at `text.xl`'s weight,
// Text's emphasis weight, so colour is not the only mark. A span's background
// has no corner radius, so the mark's `radius.sm` is not drawn, as Markdown's
// code spans draw their wash square. A composable cannot flow inside a wrapped
// paragraph, so a Highlight sits beside other text in a row, a cell or a body,
// as Code does.
//
// TalkBack reads the text once, whole, as it is: the root is one text node, and
// the marks are styles of its runs, which are not announced. An empty text
// draws nothing.

package dev.polymorph.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import dev.polymorph.tokens.PMDynamicColor
import dev.polymorph.tokens.PMTextStyle

object PMHighlight : PMHighlightRendering {
    @Composable
    override fun Render(props: PMHighlightProps) {
        val runs = PMHighlightRuns.runs(props.text, props.query, props.ranges, props.locale)
        if (runs.isEmpty()) return
        val theme = PM.theme
        val mark = SpanStyle(
            color = theme.colors.warningText.color,
            background = theme.colors.warningSubtle.color,
            fontWeight = FontWeight(theme.text.xl.weight),
        )
        Text(
            buildAnnotatedString {
                for (run in runs) {
                    if (run.marked) withStyle(mark) { append(run.text) } else append(run.text)
                }
            },
            modifier = Modifier.pmMember("Highlight"),
        )
    }
}

/**
 * Highlight's states, from the spec's States table. A Highlight is phrasing
 * content, so the entries that set it in a sentence, in a table's cells and on
 * a warning Alert's wash draw that surrounding text's step, tone and fill
 * around it; the surrounding words are scenery, hidden from accessibility, so
 * each entry's first node is the Highlight.
 */
object HighlightStates : PMStates {
    override val member = "Highlight"

    private const val invoice = "Invoice 2026-118 replaces the draft invoice"
    private const val renewal = "Northwind renewed its 2026 support plan"
    private const val refunds = "Refunds are running for the March invoices"
    private const val billing = "Billing address updated"
    private const val istanbul = "İSTANBUL OFİSİ"
    private const val address = "Invoice address shows the old office"
    private const val twice = "Refund for invoice 2026-118 was sent twice"
    private val results = listOf(
        "T-1041" to "Refund for invoice 2026-118 was sent twice",
        "T-1039" to "Invoice address shows the old office",
        "T-1032" to "Export of last year’s invoices times out",
    )

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("a query — every occurrence marked, whatever its case", expect = mapOf("label" to invoice)) {
                Body { PMHighlight(query = PMChoiceValue.Single("invoice"), text = invoice) }
            },
            PMStateEntry("several terms", expect = mapOf("label" to renewal)) {
                Body { PMHighlight(query = PMChoiceValue.Multiple(listOf("north", "2026")), text = renewal) }
            },
            PMStateEntry("ranges from a search engine", expect = mapOf("label" to refunds)) {
                Body { PMHighlight(ranges = listOf(0.0 to 7.0, 12.0 to 19.0), text = refunds) }
            },
            PMStateEntry("no match — the text as it is", expect = mapOf("label" to billing)) {
                Body { PMHighlight(query = PMChoiceValue.Single("invoice"), text = billing) }
            },
            PMStateEntry("case folded in the page’s locale", expect = mapOf("label" to istanbul)) {
                Body { PMHighlight(locale = "tr", query = PMChoiceValue.Single("istanbul"), text = istanbul) }
            },
            PMStateEntry("in a sentence — the font and size of the text around it", expect = mapOf("label" to address)) {
                Sentence("Matched in the subject:") { PMHighlight(query = PMChoiceValue.Single("office"), text = address) }
            },
            PMStateEntry("in a Table cell", expect = mapOf("label" to results.first().second)) {
                Cells { subject -> PMHighlight(query = PMChoiceValue.Single("invoice"), text = subject) }
            },
            PMStateEntry("in an Alert — the weight marks it on the same wash", expect = mapOf("label" to twice)) {
                OnWarning { PMHighlight(query = PMChoiceValue.Single("refund"), text = twice) }
            },
        )

    /** `step` in `color`, as the text members provide them to the text inside. */
    @Composable
    private fun Styled(step: PMTextStyle, color: PMDynamicColor, content: @Composable () -> Unit) {
        CompositionLocalProvider(LocalTextStyle provides step.textStyle, LocalContentColor provides color.color) { content() }
    }

    /** Body text, Text's `text.md` in `text.primary`, for a Highlight alone. */
    @Composable
    private fun Body(content: @Composable () -> Unit) {
        Styled(PM.theme.text.md, PM.theme.colors.textPrimary) { Box(Modifier.fillMaxWidth()) { content() } }
    }

    /** A secondary `text.sm` sentence, its lead and then the Highlight. */
    @Composable
    private fun Sentence(lead: String, content: @Composable () -> Unit) {
        Styled(PM.theme.text.sm, PM.theme.colors.textSecondary) {
            Row(horizontalArrangement = Arrangement.spacedBy(PM.theme.defaultDensity.spacing.s1)) {
                Box(Modifier.semantics { hideFromAccessibility() }) { Text(lead) }
                content()
            }
        }
    }

    /** Table's body cells as its list draws them on a phone: each row's id and then its subject, over the subtle rule. */
    @Composable
    private fun Cells(content: @Composable (String) -> Unit) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        Styled(theme.text.sm, theme.colors.textPrimary) {
            Column(Modifier.fillMaxWidth()) {
                for ((id, subject) in results) {
                    Column(Modifier.padding(vertical = space.s3), verticalArrangement = Arrangement.spacedBy(space.s1)) {
                        Box(Modifier.semantics { hideFromAccessibility() }) { Text(id, color = theme.colors.textSecondary.color) }
                        content(subject)
                    }
                    PMRule(theme.colors.borderSubtle)
                }
            }
        }
    }

    /** A warning Alert's panel: the wash, its border and the body's `text.sm` in `text.secondary`. */
    @Composable
    private fun OnWarning(content: @Composable () -> Unit) {
        val theme = PM.theme
        val shape = theme.rounded(theme.radius.lg)
        Styled(theme.text.sm, theme.colors.textSecondary) {
            Box(
                Modifier
                    .fillMaxWidth()
                    .background(theme.colors.warningSubtle.color, shape)
                    .border(PMGeometry.hairline, theme.colors.warningBorder.color, shape)
                    .padding(theme.defaultDensity.spacing.s4),
            ) { content() }
        }
    }
}
