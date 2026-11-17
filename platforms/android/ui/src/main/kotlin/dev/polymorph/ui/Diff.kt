// Diff (`design/components/diff.md`): a value that changed, as what it was and
// what it is. Two forms, as on the web.
//
// - **inline** (the default): a short value beside other text, one Material
//   `Text` that sets no style and no colour, so it takes the text's around it.
//   A changed value is the old one struck through, the arrow `space.2` clear of
//   both sides, and the new one; an addition is the sign `+`, `space.1` before
//   the new value, which is neither struck nor coloured; a removal is the old
//   value struck through; equal sides are the value as plain text. Each value
//   is a bidi isolate and the line takes the layout's direction, so in a
//   right-to-left layout the old value is at the right and the arrow, which has
//   no mirrored form of its own, is drawn pointing left. A composable cannot
//   flow inside a wrapped paragraph, so the inline form sits beside other text
//   in a row, a cell or a body, as Code does.
// - **lines**: two texts compared line by line through `PMLineDiff`, the
//   engine's `diffLines` and `diffRuns` on the web, on CodeBlock's code surface:
//   the mono face at `text.sm` in `text.primary` on `bg.subtle`, a
//   `border.subtle` hairline at `radius.md`. A row is a marker cell `space.6`
//   wide and its text `space.3` in from each side. An added line's cell is `+`
//   in `success.text` on `success.subtle`, a removed line's `−` in
//   `danger.text` on `danger.subtle`, and the wash stops at the cell; an
//   unchanged line's text is `text.secondary`. A long line wraps inside its row
//   and never widens the member. Unchanged lines past `context` beside each
//   change are one run: a bar `space.1` by `space.2` inside, ruled above and
//   below except at the list's edges, holding Button `ghost/neutral/sm` with
//   `expand` or `collapse`, named by `messages.unchanged`, whose lines show
//   under the bar once it is pressed. The Button reserves the 48dp hit target
//   in the layout, so the bar is that tall and its padding. Which runs are open
//   is the reader's state. They show at once, with no transition.
//
// TalkBack hears the words the web writes visually hidden: the inline form is
// one node read "from Draft to Active", "added Active" or "removed Draft"; the
// lines form is a group named by `label`, the web's region, each row one node
// read "added", "removed" or nothing, then the line. The markers, the sign and
// the arrow are not read. A run's Button reports expanded or collapsed with
// its expand and collapse actions, the web's `aria-expanded`.

package dev.polymorph.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.InlineTextContent
import androidx.compose.foundation.text.appendInlineContent
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.text
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.Placeholder
import androidx.compose.ui.text.PlaceholderVerticalAlign
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import dev.polymorph.tokens.PMDynamicColor
import dev.polymorph.tokens.PMTextStyle

object PMDiff : PMDiffRendering {
    @Composable
    override fun Render(props: PMDiffProps) {
        // An empty value draws nothing a reader can see, so it reads as a missing one.
        val old = props.before?.value.orEmpty()
        val next = props.after?.value.orEmpty()
        val messages = props.messages ?: PMSpecDefault.strings.diffMessages
        if (old.isEmpty() && next.isEmpty()) return
        if (props.display == PMDiffDisplay.Lines) {
            Lines(old, next, props.label, props.context ?: PMSpecDefault.diffContext, messages)
        } else {
            Inline(old, next, messages)
        }
    }

    /** The inline form as one text, read as its words. */
    @Composable
    private fun Inline(old: String, next: String, m: PMDiffMessages) {
        val space = PM.theme.defaultDensity.spacing
        val direction = LocalLayoutDirection.current
        val narrow = gapContent(NARROW, space.s1)
        val wide = gapContent(WIDE, space.s2)
        val struck = SpanStyle(textDecoration = TextDecoration.LineThrough)
        val (drawn, spoken) = when {
            old == next -> AnnotatedString(next) to next
            old.isEmpty() -> buildAnnotatedString {
                append(PMDiffGlyphs.direction(direction))
                append(PMDiffGlyphs.added)
                appendInlineContent(NARROW, PMDiffGlyphs.gap)
                append(PMDiffGlyphs.isolated(next))
            } to "${m.added} $next"
            next.isEmpty() -> buildAnnotatedString {
                append(PMDiffGlyphs.direction(direction))
                withStyle(struck) { append(PMDiffGlyphs.isolated(old)) }
            } to "${m.removed} $old"
            else -> buildAnnotatedString {
                append(PMDiffGlyphs.direction(direction))
                withStyle(struck) { append(PMDiffGlyphs.isolated(old)) }
                appendInlineContent(WIDE, PMDiffGlyphs.gap)
                append(PMDiffGlyphs.arrow(direction))
                appendInlineContent(WIDE, PMDiffGlyphs.gap)
                append(PMDiffGlyphs.isolated(next))
            } to "${m.from} $old ${m.to} $next"
        }
        Text(
            drawn,
            inlineContent = mapOf(narrow, wide),
            modifier = Modifier.pmMember("Diff").clearAndSetSemantics { text = AnnotatedString(spoken) },
        )
    }

    /** The inline content ids of the gap after the sign and the gaps beside the arrow. */
    private const val NARROW = "pm.diff.narrow"
    private const val WIDE = "pm.diff.wide"

    /** An empty run `width` wide, the margin the recipe sets beside the arrow and after the sign. */
    @Composable
    private fun gapContent(id: String, width: Dp): Pair<String, InlineTextContent> {
        val side = with(LocalDensity.current) { width.toSp() }
        return id to InlineTextContent(Placeholder(side, side, PlaceholderVerticalAlign.TextCenter)) {}
    }

    /** The lines form: the rows of the two texts in their runs, on the code surface. */
    @Composable
    private fun Lines(before: String, after: String, label: String?, context: Double, messages: PMDiffMessages) {
        val theme = PM.theme
        val shape = theme.rounded(theme.radius.md)
        // The comparison runs once for each pair of texts, and not again when the reader opens a run.
        val runs = remember(before, after, context) { PMLineDiff.runs(PMLineDiff.rows(before, after), context) }
        var open by remember(runs) { mutableStateOf(emptySet<Int>()) }
        val step = theme.text.sm.mono(theme)

        CompositionLocalProvider(LocalTextStyle provides step.textStyle, LocalContentColor provides theme.colors.textPrimary.color) {
            Column(
                Modifier
                    .pmMember("Diff", mapOf("display" to PMDiffDisplay.Lines.value))
                    .semantics {
                        if (label != null) contentDescription = label
                        isTraversalGroup = true
                    }
                    .fillMaxWidth()
                    .clip(shape)
                    .background(theme.colors.bgSubtle.color)
                    .border(PMGeometry.hairline, theme.colors.borderSubtle.color, shape),
            ) {
                runs.forEachIndexed { index, run ->
                    if (run.collapsed) {
                        val shown = run.key in open
                        Fold(
                            count = run.rows.size,
                            shown = shown,
                            ruledAbove = index > 0,
                            ruledBelow = index < runs.size - 1 || shown,
                            messages = messages,
                            onToggle = { open = if (shown) open - run.key else open + run.key },
                        )
                        if (shown) for (row in run.rows) Line(row, step, messages)
                    } else {
                        for (row in run.rows) Line(row, step, messages)
                    }
                }
            }
        }
    }

    /** A collapsed run's bar and its Button, ruled where another row is beside it. */
    @Composable
    private fun Fold(
        count: Int,
        shown: Boolean,
        ruledAbove: Boolean,
        ruledBelow: Boolean,
        messages: PMDiffMessages,
        onToggle: () -> Unit,
    ) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        Column(Modifier.fillMaxWidth()) {
            if (ruledAbove) PMRule(theme.colors.borderSubtle)
            Row(Modifier.fillMaxWidth().padding(vertical = space.s1, horizontal = space.s2)) {
                PMButton(
                    expanded = shown,
                    icon = if (shown) PMIconRole.Collapse else PMIconRole.Expand,
                    label = messages.unchanged(count.toDouble()),
                    onClick = onToggle,
                    size = PMControlSize.Sm,
                    appearance = PMButtonAppearance.GhostNeutral,
                )
            }
            if (ruledBelow) PMRule(theme.colors.borderSubtle)
        }
    }

    /**
     * One row of the lines form: its marker cell, washed to its row's height,
     * and its text, which wraps. It is one node, read as its kind's word and
     * the line; an unchanged empty line has nothing to read and is hidden.
     */
    @Composable
    private fun Line(row: PMDiffRow, step: PMTextStyle, messages: PMDiffMessages) {
        val theme = PM.theme
        val colors = theme.colors
        val space = theme.defaultDensity.spacing
        val glyph: String
        val ink: PMDynamicColor
        val wash: PMDynamicColor?
        val word: String?
        when (row.kind) {
            PMDiffRowKind.Added -> {
                glyph = PMDiffGlyphs.added
                ink = colors.successText
                wash = colors.successSubtle
                word = messages.added
            }
            PMDiffRowKind.Removed -> {
                glyph = PMDiffGlyphs.removed
                ink = colors.dangerText
                wash = colors.dangerSubtle
                word = messages.removed
            }
            PMDiffRowKind.Same -> {
                glyph = PMDiffGlyphs.blank
                ink = colors.textSecondary
                wash = null
                word = null
            }
        }
        val spoken = if (word == null) row.text else "$word ${row.text}"
        Row(
            Modifier
                .fillMaxWidth()
                .height(IntrinsicSize.Min)
                .clearAndSetSemantics { if (spoken.isEmpty()) hideFromAccessibility() else text = AnnotatedString(spoken) },
        ) {
            // One line tall at least, and as tall as its row, so the wash marks all of a wrapped line.
            Box(
                Modifier
                    .width(space.s6)
                    .fillMaxHeight()
                    .then(if (wash != null) Modifier.background(wash.color) else Modifier),
                contentAlignment = Alignment.TopCenter,
            ) { Text(glyph, style = step.textStyle, color = ink.color) }
            Text(
                row.text,
                style = step.textStyle,
                color = if (row.kind == PMDiffRowKind.Same) colors.textSecondary.color else colors.textPrimary.color,
                modifier = Modifier.weight(1f).padding(horizontal = space.s3),
            )
        }
    }
}

/**
 * Diff's states, from the spec's States table. The inline form is phrasing
 * content, so the entries that set it in a sentence, on a warning Alert's wash
 * and in a table's cells draw that surrounding text's step, tone and fill
 * around it; the surrounding words are scenery, hidden from accessibility, so
 * each entry's first node is the Diff. Every collapsed run is closed, as the
 * reader first sees it.
 */
object DiffStates : PMStates {
    override val member = "Diff"

    /** A governed payload as an app passes it: formatted text, one key per line. */
    private val configuration = """
        {
          "workspace": "relay-eu",
          "region": "eu-west-1",
          "retention": {
            "days": 30,
            "archive": true,
            "tiers": [
              "hot",
              "warm"
            ]
          },
          "sync": {
            "interval": 300,
            "batch": 500,
            "retries": 5,
            "backoff": "exponential"
          },
          "notifications": {
            "email": true,
            "digest": "daily",
            "channels": [
              "#support",
              "#on-call"
            ]
          },
          "limits": {
            "seats": 25,
            "projects": 100,
            "storageGb": 500
          },
          "features": {
            "audit": true,
            "sso": false,
            "exports": true
          }
        }
    """.trimIndent()
    private val configurationAfter = configuration.replace("\"retries\": 5", "\"retries\": 8")

    /** A list of ids is compared with one id on each line. */
    private val grantsBefore = listOf("tickets.read", "tickets.write", "billing.read", "reports.export").joinToString("\n")
    private val grantsAfter =
        listOf("tickets.read", "tickets.write", "payments.refund", "reports.export", "members.manage").joinToString("\n")

    private val bodyBefore = listOf("Hi Ada,", "Your export is ready.", "Thanks").joinToString("\n")
    private val bodyAfter =
        listOf("Hello Ada,", "Your export failed and will run again tonight.", "Thank you for your patience").joinToString("\n")

    /** Lines with no break in them: a callback URL and its signing key. */
    private val endpointBefore = listOf(
        "callback=https://hooks.example.org/v1/deliveries/4f0c2a7e9b1d4c53a8e6f1b2c3d4e5f6/acknowledge",
        "signing_key=whsec_JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
    ).joinToString("\n")
    private val endpointAfter = listOf(
        "callback=https://hooks.example.org/v2/deliveries/4f0c2a7e9b1d4c53a8e6f1b2c3d4e5f6/acknowledge",
        "signing_key=whsec_JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
    ).joinToString("\n")

    /** The spec's narrow box, in multiples of `space.10`. */
    private const val NARROW_BOX = 2

    @Composable
    private fun Inline(before: String?, after: String?) = PMDiff(after = PMSome(after), before = PMSome(before))

    @Composable
    private fun Lines(label: String, before: String?, after: String, context: Double? = null) =
        PMDiff(after = PMSome(after), before = PMSome(before), context = context, display = PMDiffDisplay.Lines, label = label)

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry(
                "a changed value — the old one struck through, then the new one",
                expect = mapOf("label" to "from Draft to Active"),
            ) { Body { Inline("Draft", "Active") } },
            PMStateEntry("an addition — only a new value", expect = mapOf("label" to "added Ada Okonkwo")) {
                Body { Inline(null, "Ada Okonkwo") }
            },
            PMStateEntry("a removal — only an old value", expect = mapOf("label" to "removed Ada Okonkwo")) {
                Body { Inline("Ada Okonkwo", null) }
            },
            PMStateEntry("no change — the value as plain text", expect = mapOf("label" to "Active")) {
                Body { Inline("Active", "Active") }
            },
            PMStateEntry(
                "in a sentence — the font and size of the text around it",
                expect = mapOf("label" to "from Ada Okonkwo to Grace Hopper"),
            ) { Sentence("The owner changed:") { Inline("Ada Okonkwo", "Grace Hopper") } },
            PMStateEntry("in an Alert — on the tone’s wash", expect = mapOf("label" to "from apollo to apollo-eu")) {
                OnWarning("Name:") { Inline("apollo", "apollo-eu") }
            },
            PMStateEntry("in a Table cell", expect = mapOf("label" to "from Waiting to Closed")) {
                Cells(listOf(Triple("T-1041", "Waiting", "Closed"), Triple("T-1039", "Open", "Open"))) { before, after ->
                    Inline(before, after)
                }
            },
            PMStateEntry(
                "lines — one change in a long text, the unchanged runs collapsed",
                expect = mapOf("display" to "lines", "label" to "Workspace configuration", "contains" to "Button"),
            ) { Lines("Workspace configuration", configuration, configurationAfter) },
            PMStateEntry(
                "lines — a list of ids, one on each line",
                expect = mapOf("display" to "lines", "label" to "Granted operations"),
            ) { Lines("Granted operations", grantsBefore, grantsAfter) },
            PMStateEntry("lines — every line changed", expect = mapOf("display" to "lines", "label" to "Message body")) {
                Lines("Message body", bodyBefore, bodyAfter)
            },
            PMStateEntry(
                "lines — every line kept, with an infinite context",
                expect = mapOf("display" to "lines", "label" to "Workspace configuration"),
            ) { Lines("Workspace configuration", configuration, configurationAfter, context = Double.POSITIVE_INFINITY) },
            PMStateEntry(
                "lines — a new text, every line added",
                expect = mapOf("display" to "lines", "label" to "Granted operations"),
            ) { Lines("Granted operations", null, grantsAfter) },
            PMStateEntry(
                "lines — long lines wrap in a narrow box",
                expect = mapOf("display" to "lines", "label" to "Webhook endpoint"),
            ) {
                Box(Modifier.width(PM.theme.defaultDensity.spacing.s10 * NARROW_BOX)) {
                    Lines("Webhook endpoint", endpointBefore, endpointAfter)
                }
            },
        )

    /** `step` in `color`, as the text members provide them to the text inside. */
    @Composable
    private fun Styled(step: PMTextStyle, color: PMDynamicColor, content: @Composable () -> Unit) {
        CompositionLocalProvider(LocalTextStyle provides step.textStyle, LocalContentColor provides color.color) { content() }
    }

    /** Body text, Text's `text.md` in `text.primary`, for an inline Diff alone. */
    @Composable
    private fun Body(content: @Composable () -> Unit) {
        Styled(PM.theme.text.md, PM.theme.colors.textPrimary) { Box(Modifier.fillMaxWidth()) { content() } }
    }

    /** A body `text.md` sentence, its lead and then the Diff. */
    @Composable
    private fun Sentence(lead: String, content: @Composable () -> Unit) {
        Styled(PM.theme.text.md, PM.theme.colors.textPrimary) {
            Row(horizontalArrangement = Arrangement.spacedBy(PM.theme.defaultDensity.spacing.s2)) {
                Box(Modifier.semantics { hideFromAccessibility() }) { Text(lead) }
                content()
            }
        }
    }

    /** A warning Alert's panel: the wash, its border and the body's `text.sm` in `text.secondary`, its lead and then the Diff. */
    @Composable
    private fun OnWarning(lead: String, content: @Composable () -> Unit) {
        val theme = PM.theme
        val shape = theme.rounded(theme.radius.lg)
        Styled(theme.text.sm, theme.colors.textSecondary) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .background(theme.colors.warningSubtle.color, shape)
                    .border(PMGeometry.hairline, theme.colors.warningBorder.color, shape)
                    .padding(theme.defaultDensity.spacing.s4),
                horizontalArrangement = Arrangement.spacedBy(theme.defaultDensity.spacing.s2),
            ) {
                Box(Modifier.semantics { hideFromAccessibility() }) { Text(lead) }
                content()
            }
        }
    }

    /** Table's body cells as its list draws them on a phone: each row's id and then its status, over the subtle rule. */
    @Composable
    private fun Cells(rows: List<Triple<String, String, String>>, content: @Composable (String, String) -> Unit) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        Styled(theme.text.sm, theme.colors.textPrimary) {
            Column(Modifier.fillMaxWidth()) {
                for ((id, before, after) in rows) {
                    Column(Modifier.padding(vertical = space.s3), verticalArrangement = Arrangement.spacedBy(space.s1)) {
                        Box(Modifier.semantics { hideFromAccessibility() }) { Text(id, color = theme.colors.textSecondary.color) }
                        content(before, after)
                    }
                    PMRule(theme.colors.borderSubtle)
                }
            }
        }
    }
}
