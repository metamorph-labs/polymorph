// The parts the prose members share: the caret StreamingText draws and
// Markdown restates, the rule a Markdown quote and ReasoningDisclosure's
// reasoning share, and the marks a paragraph carries inline (Citation's mark,
// an external link's glyph), each a composable set in the text as Compose's
// inline content, so it follows the word before it wherever the paragraph
// wraps, with the room Citation's marks keep for their touch areas: before a
// mark that begins a line, between two marks, and around the paragraph.

package dev.polymorph.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.InlineTextContent
import androidx.compose.foundation.text.appendInlineContent
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.text
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.Placeholder
import androidx.compose.ui.text.PlaceholderVerticalAlign
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.polymorph.tokens.PMTextStyle
import kotlin.math.max

/* The caret ---------------------------------------------------------------- */

/** The inline content id of the caret in a paragraph's text. */
const val PM_CARET = "pm.caret"

/**
 * StreamingText's caret, which Markdown restates (`streaming-text.md`,
 * `markdown.md`): a steady stroke `PMGeometry.proseStroke` wide and as tall as
 * the step's size, one character, in `accent.bg` at `PMGeometry.caretRadius`,
 * `space.1` after the last character, its foot at the bottom of the text
 * (`vertical-align: text-bottom`). It is inline content of the paragraph, so
 * it follows the last character wherever the paragraph wraps. It holds no
 * character, so TalkBack has nothing to read, and it never blinks, because a
 * loop needs a pattern and the motion catalogue has none for it.
 */
@Composable
fun pmCaretContent(step: PMTextStyle): Pair<String, InlineTextContent> {
    val theme = PM.theme
    val gap = theme.defaultDensity.spacing.s1
    val width = with(LocalDensity.current) { (gap + PMGeometry.proseStroke).toSp() }
    val bar = theme.colors.accentBg.color
    return PM_CARET to InlineTextContent(Placeholder(width, step.size.sp, PlaceholderVerticalAlign.TextBottom)) {
        Box(
            Modifier
                .fillMaxSize()
                .clearAndSetSemantics { hideFromAccessibility() }
                .padding(start = gap)
                .background(bar, RoundedCornerShape(PMGeometry.caretRadius)),
        )
    }
}

/** Appends the caret to the paragraph being built; its content is `pmCaretContent`'s. */
fun AnnotatedString.Builder.appendCaret() = appendInlineContent(PM_CARET, NOTHING)

/**
 * The text an inline mark stands in for, which Compose requires to be
 * non-empty: a zero-width space, so the paragraph's characters are unchanged.
 * A paragraph with marks gives TalkBack its own words (`pmSpokenText`).
 */
private const val NOTHING = "\u200B"

/* The quote rule ----------------------------------------------------------- */

/**
 * The rule a Markdown quote and ReasoningDisclosure's reasoning share
 * (`markdown.md`, `reasoning-disclosure.md`), so quoting and thinking read as
 * one quieter style beside the answer: a `PMGeometry.proseStroke` line in
 * `border.strong` along the leading edge, the content `space.4` in from it.
 * The line is drawn behind the content, so it is never a node for TalkBack.
 */
@Composable
fun Modifier.pmQuoteRule(): Modifier {
    val theme = PM.theme
    val color = theme.colors.borderStrong.color
    return this
        .drawBehind {
            val stroke = PMGeometry.proseStroke.toPx()
            val x = if (layoutDirection == LayoutDirection.Rtl) size.width - stroke else 0f
            drawRect(color, Offset(x, 0f), Size(stroke, size.height))
        }
        .padding(start = theme.defaultDensity.spacing.s4)
}

/* Marks in a paragraph ----------------------------------------------------- */

/**
 * Citation's mark set in a paragraph (Markdown's `[n]`): the member itself, as
 * inline content sized to the mark (`space.1` off the sentence, the `text.xs`
 * line box tall, as wide as its number and its padding, and never narrower
 * than tall), at the top of the line, as the web sets it `vertical-align:
 * top`. `id` names it in the paragraph's text.
 */
@Composable
fun pmCitationContent(id: String, index: Int, source: PMCitationSource): Pair<String, InlineTextContent> {
    val theme = PM.theme
    val space = theme.defaultDensity.spacing
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    val step = theme.text.xs
    val number = measurer.measure(index.toString(), step.textStyle).size.width
    val (width, height) = with(density) {
        val line = step.lineBox.sp.toPx()
        val mark = max(line, number + space.s1.toPx() * 2)
        (space.s1.toPx() + mark).toSp() to line.toSp()
    }
    return id to InlineTextContent(Placeholder(width, height, PlaceholderVerticalAlign.Top)) {
        PMCitation(index = index.toDouble(), source = source)
    }
}

/**
 * How far a mark's touch area, the hit target centred on it, reaches past
 * either side of the narrowest mark's place in the line (`space.1` and the
 * `text.xs` line box), in pixels: the room a mark keeps at the start and the
 * end of a line, so the window's edge or the cell beside it does not cut it.
 */
@Composable
private fun markSideReach(): Float {
    val theme = PM.theme
    return with(LocalDensity.current) {
        val place = theme.defaultDensity.spacing.s1.toPx() + theme.text.xs.lineBox.sp.toPx()
        ((theme.defaultDensity.hitTarget.dp.toPx() - place) / 2).coerceAtLeast(0f)
    }
}

/** The inline content id of the room before a mark that begins a line. */
const val PM_MARK_LEAD = "pm.markLead"

/**
 * The room set in a paragraph before a mark that begins a line (the run's
 * first mark, or one after a hard break): wide enough that the mark's touch
 * area starts inside the run. A mark never begins a line by wrapping, because
 * a line breaks after the zero-width space a mark stands in for, never before
 * it. It draws nothing and reads as nothing.
 */
@Composable
fun pmMarkLeadContent(): Pair<String, InlineTextContent> {
    val theme = PM.theme
    val reach = markSideReach()
    val (width, height) = with(LocalDensity.current) { reach.toSp() to theme.text.xs.lineBox.sp }
    return PM_MARK_LEAD to InlineTextContent(Placeholder(width, height, PlaceholderVerticalAlign.Top)) {}
}

/** The inline content id of the gap between two of Citation's marks that follow one another. */
const val PM_MARK_GAP = "pm.markGap"

/**
 * The gap set in a paragraph between two of Citation's marks that follow one
 * another (Markdown's `[1][2]`): wide enough that the marks' centres are the
 * hit target apart, so each mark's touch area, the hit target centred on it,
 * is its own. It draws nothing and reads as nothing.
 */
@Composable
fun pmMarkGapContent(): Pair<String, InlineTextContent> {
    val theme = PM.theme
    val (width, height) = with(LocalDensity.current) {
        val mark = theme.text.xs.lineBox.sp.toPx()
        val gap = theme.defaultDensity.hitTarget.dp.toPx() - theme.defaultDensity.spacing.s1.toPx() - mark
        gap.coerceAtLeast(0f).toSp() to mark.toSp()
    }
    return PM_MARK_GAP to InlineTextContent(Placeholder(width, height, PlaceholderVerticalAlign.Top)) {}
}

/**
 * The room a paragraph that holds Citation's marks keeps around its lines,
 * `step` being the paragraph's: a mark's touch area is the hit target centred
 * on the mark, which reaches above the line the mark heads, below the line it
 * ends and past the end of the line it ends, and a block after the paragraph,
 * the cell beside it or the window's edge would cut that reach. With `marks`
 * false (a cell without marks in a row that has them) it keeps the room above
 * and below alone, so the row's cells stay in line. The room before a mark
 * that begins a line is in the line (`pmMarkLeadContent`).
 */
@Composable
fun Modifier.pmMarkReach(step: PMTextStyle, marks: Boolean = true): Modifier {
    val theme = PM.theme
    val side = markSideReach()
    val (above, below, end) = with(LocalDensity.current) {
        val hit = theme.defaultDensity.hitTarget.dp.toPx()
        val mark = theme.text.xs.lineBox.sp.toPx()
        val line = step.lineBox.sp.toPx()
        listOf((hit - mark) / 2, (hit + mark) / 2 - line, if (marks) side else 0f).map { it.coerceAtLeast(0f).toDp() }
    }
    return padding(top = above, bottom = below, end = end)
}

/**
 * A glyph set in a paragraph after a word (an external link's
 * `open-external`, a source title's): the `sm` icon in `tint`, `space.1` after
 * the word, its foot at the bottom of the text. Decorative: the link it
 * follows says where it goes. `id` names it in the paragraph's text.
 */
@Composable
fun pmGlyphContent(id: String, role: PMIconRole, tint: Color): Pair<String, InlineTextContent> {
    val theme = PM.theme
    val gap = theme.defaultDensity.spacing.s1
    val side = theme.icon.sm.size.dp
    val (width, height) = with(LocalDensity.current) { (gap + side).toSp() to side.toSp() }
    return id to InlineTextContent(Placeholder(width, height, PlaceholderVerticalAlign.TextBottom)) {
        Row(Modifier.fillMaxSize().semantics { hideFromAccessibility() }, verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.padding(start = gap)) { PMIconView(role, PMControlSize.Sm, tint = tint) }
        }
    }
}

/** Appends an inline mark by its content id; it reads as nothing of its own. */
fun AnnotatedString.Builder.appendMark(id: String) = appendInlineContent(id, NOTHING)

/**
 * The paragraph's words for TalkBack, without the stand-ins its marks occupy:
 * the drawn text with every zero-width space removed.
 */
fun Modifier.pmSpokenText(text: AnnotatedString): Modifier =
    clearAndSetSemantics { this.text = AnnotatedString(text.text.replace(NOTHING, NONE)) }

private const val NONE = ""
