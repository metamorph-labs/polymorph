// RichTextContent (`design/components/rich-text-content.md`): a stored
// rich-text document, such as a comment, an issue's description or a note,
// drawn with the vocabulary's members under the screen's theme. The document
// crosses the contract as JSON (`PMJSONValue`). The web's reader, written in
// Kotlin (`PMRichTextReader`), reads any JSON as far as it can, and this file
// decides which member draws each block, as the web's member does:
//
// - a paragraph is Text at `size`, its runs styled as Markdown styles them; a
//   paragraph with nothing in it takes no room, as the web's empty paragraph;
// - a heading is Heading, its text plain, because Heading's children are a
//   string (an entity reads as its label, a line break as a space): the
//   document's level 1 at `headingLevel`, each deeper level one more, at most
//   4. A heading with no text is not drawn, because it names nothing. One that
//   holds a drawn annotation is drawn by the member, at Heading's step, a
//   heading to TalkBack, its words one by one without emphasis or link, so the
//   highlight is in it;
// - a list is Markdown's list (`PMProseList`), numbered from its first number
//   or bulleted by depth, nested as written, and a quote Markdown's quote: a
//   column of blocks `space.3` apart behind the quote rule (`pmQuoteRule`);
// - a code block is CodeBlock, copyable unless it holds no text, its scroll
//   region named by the block's language;
// - a block of a later version is Text at `size` of the text found in it, and
//   nothing when there is none.
//
// Inside a paragraph, runs carry the inline members' recipes, as Markdown's
// do, because a composable cannot flow inside wrapped text: inline code is
// Code's face and wash, bold the `text.xl` weight in `text.primary`, italic
// italic and strike struck. A link is Link's inline grammar on a run in a
// `LinkAnnotation.Url`, so TalkBack announces it as a link and lists it with
// the paragraph's links, and a keyboard reaches it. Neighbouring runs with one
// target are one link, with the marks they all share around it. A target with
// a scheme (`https:`, `mailto:`, `tel:`) leaves the app: the `open-external`
// glyph follows it, and a press opens it through `LocalUriHandler`. A press on
// any other target calls `onNavigate` with it when the app gives one, as
// Link's does (`link.md`, Routing), and otherwise opens it through the handler.
//
// An entity is the entity token: its label on `accent.subtle` in
// `accent.text`, a narrow no-break space either side standing for its
// padding, as Markdown's code spans keep theirs. A span's background has no
// corner radius, so the token's `radius.sm` is not drawn, as Highlight's marks
// and Markdown's code spans draw their washes square. Its label carries its
// trigger character, so colour is not its only mark, and TalkBack reads it in
// the paragraph's words. With `entity`, the app draws each entity: what it
// draws is measured and set in the line in a place that size, centred on the
// text, so a Link the app returns keeps its touch area in the line, which
// grows to hold it. Where the app draws nothing, the token is drawn. The
// paragraph's words still say the entity's label, and what the app draws is
// read after the paragraph, as a mark set in a line is.
//
// Annotations are the anchors an app keeps against words, such as comment
// threads. The member draws the ones `annotations` names, every one when it
// names none. A drawn annotation's words are on `warning.subtle`, in the
// text's own colour, with a hairline rule in `warning.border` under them; the
// active one (`activeAnnotation`) is on `warning.subtle-active` and framed
// with the prose stroke in `warning.border`. Where annotations overlap, the
// innermost one's wash is drawn, as the web nests them. The wash is the run's
// background, square as the token's is; the rule and the frame are drawn from
// the text's layout, as Link draws its own underline, because a run carries no
// line in a colour of its own. An annotated token is ringed by the wash, which
// its padding takes. With `onAnnotationSelect`, a stretch of words whose
// innermost annotation is one id is a `LinkAnnotation.Clickable`: a tap calls
// it with that id, TalkBack lists it with the line's links and activates it,
// and a keyboard reaches it, as the platform's text offers its links. A link
// inside an annotation is the link's alone, and so is an entity the app draws.
// Without it, the highlights take no press. The selection bar
// (`selectionActions`, `messages`) is not drawn: the member's text is not
// selectable, as Markdown's is not, and the platform's selection toolbar is
// the platform's (`packages/native/src/undrawn.ts`).
//
// An empty document (`isRichTextEmpty`) draws the root and nothing in it. The
// root carries `size`, and `empty` while the document has nothing to read.

package dev.polymorph.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.InlineTextContent
import androidx.compose.foundation.text.appendInlineContent
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.Placeholder
import androidx.compose.ui.text.PlaceholderVerticalAlign
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.IntSize
import dev.polymorph.tokens.PMTextStyle
import kotlin.math.roundToInt

object PMRichTextContent : PMRichTextContentRendering {
    /** What every block of one document draws with. */
    private class Drawing(
        val size: PMTextSize,
        val step: PMTextStyle,
        /** The page level of the document's level 1. */
        val top: Int,
        val entity: (@Composable (PMRichTextEntity) -> Unit)?,
        val onNavigate: ((String) -> Unit)?,
        /** Whether the annotation `id` is drawn: every one, unless the app names the ones it wants. */
        val drawn: (id: String) -> Boolean,
        /** The drawn annotation that is active. */
        val active: String?,
        /** The app's press on a highlight; with none, the highlights take no press. */
        val onSelect: ((String) -> Unit)?,
    )

    @Composable
    override fun Render(props: PMRichTextContentProps) {
        val theme = PM.theme
        val size = if (props.size == PMRichTextContentSize.Sm) PMTextSize.Sm else PMTextSize.Md
        val step = if (size == PMTextSize.Sm) theme.text.sm else theme.text.md
        val blocks = remember(props.value) { PMRichTextReader.read(props.value) }
        val empty = remember(blocks) { PMRichTextReader.isEmpty(blocks) }
        val top = (props.headingLevel ?: PMRichTextContentHeadingLevel.HeadingLevel2).value
        val shown = remember(props.annotations) { props.annotations?.toSet() }
        val drawing = Drawing(
            size = size,
            step = step,
            top = top,
            entity = props.entity,
            onNavigate = props.onNavigate,
            drawn = { id -> shown == null || id in shown },
            active = props.activeAnnotation,
            onSelect = props.onAnnotationSelect,
        )
        val attributes = buildMap {
            put("size", size.value)
            if (empty) put("empty", "true")
        }

        Column(
            Modifier
                .pmMember("RichTextContent", attributes)
                .semantics { isTraversalGroup = true }
                .fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(theme.defaultDensity.spacing.s4),
        ) {
            if (!empty) Blocks(blocks, drawing, depth = 0)
        }
    }

    /** Blocks in order. `depth` is the number of lists around them, which picks a bullet. */
    @Composable
    private fun Blocks(blocks: List<PMRichTextBlock>, drawing: Drawing, depth: Int) {
        for (block in blocks) Block(block, drawing, depth)
    }

    @Composable
    private fun Block(block: PMRichTextBlock, drawing: Drawing, depth: Int) {
        val space = PM.theme.defaultDensity.spacing
        when (block) {
            is PMRichTextBlock.Paragraph -> Line(block.content, drawing, level = null)
            is PMRichTextBlock.Heading -> {
                // A heading names the section under it, so one with no name is not drawn.
                val text = headingText(block.content)
                val level = pageLevel(block.level, drawing.top)
                val annotated = block.content.any { node -> annotationsOf(node).orEmpty().any(drawing.drawn) }
                when {
                    PMRichTextReader.isBlank(text) -> {}
                    annotated -> Line(block.content, drawing, level = level)
                    else -> PMHeading(children = text, level = level)
                }
            }
            is PMRichTextBlock.Items -> PMProseList(block.items.size, block.ordered, block.start, depth, drawing.step) { index ->
                Blocks(block.items[index], drawing, depth + 1)
            }
            is PMRichTextBlock.Quote -> Column(
                Modifier.fillMaxWidth().pmQuoteRule(),
                verticalArrangement = Arrangement.spacedBy(space.s3),
            ) { Blocks(block.content, drawing, depth) }
            // A stored block is never partial, so it is copyable, unless it
            // holds nothing to copy.
            is PMRichTextBlock.Code -> PMCodeBlock(children = block.text, copyable = block.text.isNotEmpty(), label = block.language)
            is PMRichTextBlock.Unknown -> if (block.text.isNotEmpty()) PMText(size = drawing.size) { Text(block.text) }
        }
    }

    /**
     * The page level a document heading is drawn at: the document's level 1 at
     * `top`, each deeper level one more, never past 4. The editor draws the
     * same levels, so a document reads the same while it is written and after.
     */
    internal fun pageLevel(level: Int, top: Int): PMHeadingLevel {
        val drawn = top + maxOf(0, level - 1)
        return when {
            drawn >= 4 -> PMHeadingLevel.Level4
            drawn == 3 -> PMHeadingLevel.Level3
            else -> PMHeadingLevel.Level2
        }
    }

    /** A heading's line as one string: an entity reads as its label, a line break as a space, a link and inline code as their text. */
    private fun headingText(content: List<PMRichTextInline>): String = content.joinToString(NONE) { node ->
        when (node) {
            is PMRichTextInline.Run -> node.text
            PMRichTextInline.Break -> SPACE
            is PMRichTextInline.Entity -> node.entity.label
            is PMRichTextInline.Unknown -> node.text
        }
    }

    /* Annotations ----------------------------------------------------------- */

    /** The annotations a text or an entity is inside; null for what carries none, a line break or a node of a later version. */
    private fun annotationsOf(node: PMRichTextInline): List<String>? = when (node) {
        is PMRichTextInline.Run -> node.annotations
        is PMRichTextInline.Entity -> node.annotations
        else -> null
    }

    /**
     * The drawn annotations of a line's inlines, innermost first, nested as the
     * editor nests them and as the web member draws them. An annotation's
     * stretch is a run of consecutive texts and entities that carry it; an
     * inline that carries none (a line break, a node of a later version)
     * neither ends a stretch nor belongs to one. Where annotations overlap, the
     * innermost is the one whose stretch starts last, then the one that ends
     * first, then by id. The result reads the inlines at `indexes`: one for a
     * text or an entity, every run of a link, which is one link.
     */
    internal fun nesting(content: List<PMRichTextInline>, drawn: (String) -> Boolean): (List<Int>) -> List<String> {
        class Stretch(val from: Int, var to: Int)
        val stretches = mutableMapOf<String, MutableList<Stretch>>()
        val open = mutableMapOf<String, Stretch>()
        content.forEachIndexed { index, node ->
            val ids = annotationsOf(node) ?: return@forEachIndexed
            open.keys.retainAll(ids.toSet())
            for (id in ids) {
                val stretch = open[id]
                if (stretch != null) {
                    stretch.to = index
                } else {
                    val created = Stretch(index, index)
                    open[id] = created
                    stretches.getOrPut(id) { mutableListOf() } += created
                }
            }
        }
        return { indexes ->
            val found = linkedMapOf<String, Stretch>()
            for (index in indexes) {
                for (id in annotationsOf(content[index]).orEmpty()) {
                    if (id in found || !drawn(id)) continue
                    stretches[id]?.firstOrNull { it.from <= index && index <= it.to }?.let { found[id] = it }
                }
            }
            found.keys.sortedWith(
                compareByDescending<String> { found.getValue(it).from }
                    .thenBy { found.getValue(it).to }
                    .thenBy { it },
            )
        }
    }

    /* Lines ----------------------------------------------------------------- */

    /**
     * A paragraph's line, or a heading's: Text at `size`, or the heading's own
     * text at the step of `level` when it is set, which draws a heading
     * that holds a drawn annotation, because Heading takes a string.
     */
    @Composable
    private fun Line(content: List<PMRichTextInline>, drawing: Drawing, level: PMHeadingLevel?) {
        // Nothing to draw, and still a block of the column, as the web's
        // empty paragraph is.
        if (content.isEmpty()) return Spacer(Modifier)
        val laid = remember { LaidOut() }
        val app = drawing.entity
        val count = content.count { it is PMRichTextInline.Entity }
        if (app == null || count == 0) {
            Words(line(content, drawing, level != null, emptyList()), drawing, level, laid)
        } else {
            Drawn(content, drawing, level, app, count, laid)
        }
    }

    /** The line's text, with its annotations' rules and frame drawn over it. */
    @Composable
    private fun Words(line: Built, drawing: Drawing, level: PMHeadingLevel?, laid: LaidOut) {
        val marks = Modifier.annotations(line, drawing.active) { laid.result }
        if (level == null) {
            PMText(size = drawing.size) {
                Text(line.text, inlineContent = line.inline, onTextLayout = { laid.result = it }, modifier = marks)
            }
        } else {
            val theme = PM.theme
            Text(
                line.text,
                style = PMHeading.style(theme, level).textStyle,
                color = theme.colors.textPrimary.color,
                inlineContent = line.inline,
                onTextLayout = { laid.result = it },
                modifier = Modifier.semantics { heading() }.then(marks),
            )
        }
    }

    /**
     * A line whose entities the app draws. Each drawing is composed once,
     * under the line's text style, and measured; the line keeps a place of
     * its size where the entity stands (an inline placeholder), and the drawing
     * is set over that place. A drawing's size reaches the line on the frame
     * after it is measured, and until then, and where the app draws nothing,
     * the entity is the token.
     */
    @Composable
    private fun Drawn(
        content: List<PMRichTextInline>,
        drawing: Drawing,
        level: PMHeadingLevel?,
        app: @Composable (PMRichTextEntity) -> Unit,
        count: Int,
        laid: LaidOut,
    ) {
        val theme = PM.theme
        val entities = content.filterIsInstance<PMRichTextInline.Entity>()
        // Each drawing's size: null until it is measured, zero when the app drew nothing.
        val sizes = remember(count) { mutableStateListOf<IntSize?>().apply { repeat(count) { add(null) } } }
        val line = line(content, drawing, level != null, sizes)
        Layout(
            contents = listOf<@Composable () -> Unit>(
                { Words(line, drawing, level, laid) },
                {
                    CompositionLocalProvider(
                        LocalTextStyle provides (if (level == null) drawing.step else PMHeading.style(theme, level)).textStyle,
                        LocalContentColor provides theme.colors.textPrimary.color,
                    ) {
                        entities.forEachIndexed { index, node ->
                            Box(Modifier.onSizeChanged { if (index < sizes.size) sizes[index] = it }) { app(node.entity) }
                        }
                    }
                },
            ),
        ) { (paragraph, drawn), constraints ->
            val text = paragraph.map { it.measure(constraints) }
            val loose = constraints.copy(minWidth = 0, minHeight = 0)
            val placed = drawn.map { it.measure(loose) }
            layout(text.maxOfOrNull { it.width } ?: 0, text.maxOfOrNull { it.height } ?: 0) {
                text.forEach { it.place(0, 0) }
                // The text's places are where the text laid them out, already
                // in the layout's direction.
                val places = laid.result?.placeholderRects.orEmpty()
                line.slots.forEachIndexed { at, entity ->
                    val place = places.getOrNull(at) ?: return@forEachIndexed
                    if (entity >= 0) placed.getOrNull(entity)?.place(place.left.roundToInt(), place.top.roundToInt())
                }
            }
        }
    }

    /** The line's text layout, which the text writes as it measures, and its parent and its marks read. */
    private class LaidOut {
        var result: TextLayoutResult? = null
    }

    /** A stretch of the line's text inside drawn annotations: `ids` innermost first; `held` when an entity the app draws stands there. */
    private class Marked(val start: Int, val end: Int, val ids: List<String>, val held: Boolean)

    /**
     * A line, built: its text, the inline content set in it, for each place
     * in the text, in order, the index among the line's entities of the one
     * the app draws there (or `GLYPH` for a link's glyph), and the stretches
     * inside drawn annotations.
     */
    private class Built(
        val text: AnnotatedString,
        val inline: Map<String, InlineTextContent>,
        val slots: List<Int>,
        val marked: List<Marked>,
    )

    /**
     * The line of `content`, each entity at `sizes`' size when the app drew
     * it, and the token otherwise. A heading's line draws no emphasis and no
     * link, as the web member draws a heading's words.
     *
     * A drawn annotation's words are on the warning wash, the active one's on
     * the stronger wash; where annotations overlap, the innermost one's wash
     * is drawn, as the web's opaque washes nest. With `onSelect`, each stretch
     * of words whose innermost annotation is one id is a `LinkAnnotation`
     * whose press calls it with that id: TalkBack lists it with the line's
     * links and activates it, and a keyboard reaches it, as it reaches a link.
     * A link inside an annotation is the link's alone, and so is an entity the
     * app draws.
     */
    @Composable
    private fun line(content: List<PMRichTextInline>, drawing: Drawing, heading: Boolean, sizes: List<IntSize?>): Built {
        val theme = PM.theme
        val colors = theme.colors
        val uri = LocalUriHandler.current
        val density = LocalDensity.current
        val inline = mutableMapOf<String, InlineTextContent>()
        if (!heading && content.any { it is PMRichTextInline.Run && it.href != null && isExternal(it.href) }) {
            inline += pmGlyphContent(EXTERNAL, PMIconRole.OpenExternal, colors.accentText.color)
        }
        val code = SpanStyle(
            fontFamily = theme.text.sm.mono(theme).textStyle.fontFamily,
            fontSize = theme.text.sm.textStyle.fontSize,
            background = colors.bgSubtle.color,
            color = colors.textPrimary.color,
        )
        val strong = SpanStyle(fontWeight = FontWeight(theme.text.xl.weight), color = colors.textPrimary.color)
        val token = SpanStyle(background = colors.accentSubtle.color, color = colors.accentText.color)
        val links = pmLinkStyles(colors.accentText.color, colors.accentText.color, underlined = true)
        val wash = SpanStyle(background = colors.warningSubtle.color)
        val activeWash = SpanStyle(background = colors.warningSubtleActive.color)
        // A highlight under the pointer, pressed or focused takes the stronger
        // wash, and the focused one the text's underline too.
        val pressing = TextLinkStyles(
            focusedStyle = activeWash.merge(SpanStyle(textDecoration = TextDecoration.Underline)),
            hoveredStyle = activeWash,
            pressedStyle = activeWash,
        )
        val order = nesting(content, drawing.drawn)
        val slots = mutableListOf<Int>()
        val marked = mutableListOf<Marked>()

        val text = buildAnnotatedString {
            var open: String? = null
            /** Opens the press of the annotation `id` on what is appended next, or closes the open one. */
            fun press(id: String?) {
                val take = if (drawing.onSelect == null) null else id
                if (take == open) return
                if (open != null) pop()
                open = take
                if (take != null) pushLink(LinkAnnotation.Clickable(take, pressing) { drawing.onSelect?.invoke(take) })
            }
            /** Appends what `draw` draws, inside the wash of `ids`' innermost annotation, and records where it is. */
            fun marking(ids: List<String>, held: Boolean = false, draw: AnnotatedString.Builder.(SpanStyle?) -> Unit) {
                val start = length
                val innermost = ids.firstOrNull()
                draw(if (innermost == null) null else if (innermost == drawing.active) activeWash else wash)
                if (innermost != null) marked += Marked(start, length, ids, held)
            }

            var entity = 0
            var index = 0
            while (index < content.size) {
                val node = content[index]
                val href = if (heading) null else (node as? PMRichTextInline.Run)?.href
                if (href != null) {
                    // Neighbouring runs with one target are one link: one
                    // stop for a keyboard and one name. The marks every run
                    // shares are drawn around it, and an annotation on any of
                    // its runs around the whole link; inline code is dropped,
                    // as Markdown drops emphasis inside a link's label.
                    var end = index
                    while (end < content.size && (content[end] as? PMRichTextInline.Run)?.href == href) end += 1
                    val runs = content.subList(index, end).filterIsInstance<PMRichTextInline.Run>()
                    val external = isExternal(href)
                    val route = if (external) null else drawing.onNavigate
                    val struck = runs.all { it.strike }
                    val link = LinkAnnotation.Url(href, if (struck) links.struck() else links) {
                        if (route != null) route(href) else uri.pmOpen(href)
                    }
                    press(null)
                    withStyle(emphasis(runs.all { it.bold }, runs.all { it.italic }, struck, strong)) {
                        marking(order((index until end).toList())) { highlight ->
                            withStyle(highlight ?: NO_STYLE) { withLink(link) { append(runs.joinToString(NONE) { it.text }) } }
                        }
                    }
                    if (external) {
                        appendMark(EXTERNAL)
                        slots += GLYPH
                    }
                    index = end
                    continue
                }
                when (node) {
                    is PMRichTextInline.Run -> {
                        val ids = order(listOf(index))
                        press(ids.firstOrNull())
                        val marks = if (heading) NO_STYLE else emphasis(node.bold, node.italic, node.strike, strong)
                        withStyle(marks) {
                            marking(ids) { highlight ->
                                if (node.code) {
                                    // The highlight is on the words inside the code's chip.
                                    withStyle(code) {
                                        append(PADDING)
                                        withStyle(highlight ?: NO_STYLE) { append(node.text) }
                                        append(PADDING)
                                    }
                                } else {
                                    withStyle(highlight ?: NO_STYLE) { append(node.text) }
                                }
                            }
                        }
                    }
                    PMRichTextInline.Break -> {
                        press(null)
                        // A heading draws a line break as a space, as Heading does.
                        append(if (heading) SPACE else LINE)
                    }
                    is PMRichTextInline.Entity -> {
                        val ids = order(listOf(index))
                        val drawn = sizes.getOrNull(entity)
                        if (drawn != null && drawn != IntSize.Zero) {
                            // What the app draws takes its own press.
                            press(null)
                            val id = "$ENTITY$entity"
                            val (width, height) = with(density) { drawn.width.toFloat().toSp() to drawn.height.toFloat().toSp() }
                            inline[id] = InlineTextContent(Placeholder(width, height, PlaceholderVerticalAlign.TextCenter)) {}
                            // The line's words keep the entity's label.
                            marking(ids, held = true) { appendInlineContent(id, node.entity.label) }
                            slots += entity
                        } else {
                            press(ids.firstOrNull())
                            marking(ids) { highlight ->
                                if (highlight == null) {
                                    withStyle(token) { append("$PADDING${node.entity.label}$PADDING") }
                                } else {
                                    // Inside a highlight the token's padding takes the
                                    // highlight's wash, which rings the token.
                                    withStyle(highlight) {
                                        append(PADDING)
                                        withStyle(token) { append(node.entity.label) }
                                        append(PADDING)
                                    }
                                }
                            }
                        }
                        entity += 1
                    }
                    // A node of a later version: the text found in it, in the line.
                    is PMRichTextInline.Unknown -> {
                        press(null)
                        append(node.text)
                    }
                }
                index += 1
            }
            press(null)
        }
        return Built(text, inline, slots, marked)
    }

    /**
     * The rule under a drawn annotation's words and the active one's frame,
     * drawn over the line's text from its layout, as Link draws its own rest
     * underline: a run carries no line in a colour of its own, and no frame.
     * The rule is a hairline in `warning.border` at the foot of each line the
     * annotation's words are on, where the wash ends, so a link's own
     * underline inside stays its own. The active annotation is framed with the
     * prose stroke in `warning.border` around its words on each line, the
     * recipe's outline. Behind an entity the app draws, which the text does
     * not wash, the wash is drawn here.
     */
    @Composable
    private fun Modifier.annotations(line: Built, active: String?, layout: () -> TextLayoutResult?): Modifier {
        if (line.marked.isEmpty()) return this
        val colors = PM.theme.colors
        val rule = colors.warningBorder.color
        val wash = colors.warningSubtle.color
        val activeWash = colors.warningSubtleActive.color
        val ruled = joined(line.marked) { true }
        val framed = if (active == null) emptyList() else joined(line.marked) { active in it.ids }
        return drawWithContent {
            val laid = layout()
            if (laid == null) {
                drawContent()
                return@drawWithContent
            }
            for (piece in line.marked) {
                if (!piece.held) continue
                val colour = if (piece.ids.first() == active) activeWash else wash
                for (box in boxes(laid, piece.start, piece.end)) drawRect(colour, box.topLeft, box.size)
            }
            drawContent()
            val hairline = PMGeometry.hairline.toPx()
            for ((start, end) in ruled) {
                for (box in boxes(laid, start, end)) {
                    val foot = box.bottom - hairline / 2
                    drawLine(rule, Offset(box.left, foot), Offset(box.right, foot), hairline)
                }
            }
            val stroke = PMGeometry.proseStroke.toPx()
            for ((start, end) in framed) {
                for (box in boxes(laid, start, end)) drawRect(rule, box.topLeft, box.size, style = Stroke(stroke))
            }
        }
    }

    /** The stretches of `marked` that `keep` takes, neighbours joined: each a start and an end in the line's text. */
    private fun joined(marked: List<Marked>, keep: (Marked) -> Boolean): List<Pair<Int, Int>> {
        val out = mutableListOf<Pair<Int, Int>>()
        for (piece in marked) {
            if (!keep(piece)) continue
            val last = out.lastOrNull()
            if (last != null && last.second == piece.start) out[out.lastIndex] = last.first to piece.end else out += piece.start to piece.end
        }
        return out
    }

    /**
     * The box the text from `start` to `end` takes on each line it is on: from
     * where it starts to where it ends along the line, and the line's height,
     * which a run's wash fills. Space a line ends in where it wraps is not in
     * it.
     */
    private fun boxes(laid: TextLayoutResult, start: Int, end: Int): List<Rect> {
        val length = laid.layoutInput.text.length
        val from = start.coerceIn(0, length)
        val to = end.coerceIn(0, length)
        if (from >= to) return emptyList()
        return (laid.getLineForOffset(from)..laid.getLineForOffset(to - 1)).mapNotNull { at ->
            val a = maxOf(from, laid.getLineStart(at))
            val b = minOf(to, laid.getLineEnd(at, visibleEnd = true))
            if (a >= b) return@mapNotNull null
            val along = laid.getPathForRange(a, b).getBounds()
            Rect(along.left, laid.getLineTop(at), along.right, laid.getLineBottom(at))
        }
    }

    /** The span style of the marks a run carries: bold, italic and strike. */
    private fun emphasis(bold: Boolean, italic: Boolean, strike: Boolean, strong: SpanStyle): SpanStyle {
        var style = SpanStyle()
        if (bold) style = style.merge(strong)
        if (italic) style = style.merge(SpanStyle(fontStyle = FontStyle.Italic))
        if (strike) style = style.merge(SpanStyle(textDecoration = TextDecoration.LineThrough))
        return style
    }

    /**
     * Link's grammar with the line through it too: a link's own underline
     * replaces the strike of the run around it, so a struck link carries both.
     */
    private fun TextLinkStyles.struck(): TextLinkStyles {
        fun SpanStyle?.withStrike(): SpanStyle {
            val line = this?.textDecoration
            val decoration = if (line == null) TextDecoration.LineThrough else TextDecoration.combine(listOf(line, TextDecoration.LineThrough))
            return (this ?: SpanStyle()).copy(textDecoration = decoration)
        }
        return TextLinkStyles(style.withStrike(), focusedStyle.withStrike(), hoveredStyle.withStrike(), pressedStyle.withStrike())
    }

    /** A target with a scheme (`https:`, `mailto:`, `tel:`) leaves the app. The reader passes no other kind of scheme. */
    private fun isExternal(href: String): Boolean = ABSOLUTE.containsMatchIn(href)

    private val ABSOLUTE = Regex("^[a-z][a-z0-9+.-]*:", RegexOption.IGNORE_CASE)

    /** A style that changes nothing, for a run with no mark of its own. */
    private val NO_STYLE = SpanStyle()

    private const val EXTERNAL = "pm.external"
    private const val ENTITY = "pm.entity."

    /** The slot of a link's glyph, which holds no entity. */
    private const val GLYPH = -1

    private const val LINE = "\n"
    private const val SPACE = " "
    private const val NONE = ""

    /** A narrow no-break space either side of a code span or a token, standing for its padding. */
    private const val PADDING = " "
}

/**
 * RichTextContent's states, from the spec's States table. The empty document
 * draws nothing, so it has no entry: the harness holds every entry to drawing,
 * and a behaviour test holds that one. The selection bar is not drawn on
 * Android, so its entry is not here either.
 */
object RichTextContentStates : PMStates {
    override val member = "RichTextContent"

    private const val FORMAT = "polymorph-rich-text/1"

    private fun document(vararg blocks: Map<String, Any>) = PMJSONValue.of(mapOf("format" to FORMAT, "blocks" to blocks.toList()))

    private fun paragraph(vararg content: Map<String, Any>) = mapOf("type" to "paragraph", "content" to content.toList())

    private fun heading(level: Int, text: String) = mapOf("type" to "heading", "level" to level, "content" to listOf(run(text)))

    private fun item(vararg blocks: Map<String, Any>) = mapOf("type" to "listItem", "content" to blocks.toList())

    /** A text node, with marks of the types named. */
    private fun run(text: String, vararg marks: String): Map<String, Any> = buildMap {
        put("type", "text")
        put("text", text)
        if (marks.isNotEmpty()) put("marks", marks.map { mapOf("type" to it) })
    }

    private fun link(text: String, href: String) =
        mapOf("type" to "text", "text" to text, "marks" to listOf(mapOf("type" to "link", "href" to href)))

    private fun entity(kind: String, id: String, label: String) = mapOf("type" to "entity", "kind" to kind, "id" to id, "label" to label)

    internal val prose = document(
        paragraph(
            run("Retries are now "),
            run("exponential", "bold"),
            run(", capped at five attempts, and each one "),
            run("doubles", "italic"),
            run(" the wait. The "),
            run("three-attempt", "strike"),
            run(" cap is gone."),
        ),
        paragraph(
            run("Every attempt carries the original "),
            run("Idempotency-Key", "code"),
            run(" header."),
            mapOf("type" to "break"),
            run("The timings are in "),
            link("the delivery guide", "https://docs.example.org/webhooks/retries"),
            run("."),
        ),
    )

    internal val structure = document(
        heading(1, "Webhook retries"),
        paragraph(run("A failed delivery is retried on a schedule.")),
        heading(2, "What changed"),
        mapOf(
            "type" to "list",
            "ordered" to false,
            "items" to listOf(
                item(paragraph(run("Retries carry the original idempotency key."))),
                item(
                    paragraph(run("The backoff cap moved to five attempts.")),
                    mapOf(
                        "type" to "list",
                        "ordered" to false,
                        "items" to listOf(
                            item(paragraph(run("The first retry fires after two seconds."))),
                            item(paragraph(run("Each later one doubles the wait."))),
                        ),
                    ),
                ),
            ),
        ),
        heading(3, "Rollout"),
        paragraph(run("Steps 1 and 2 shipped last week.")),
        mapOf(
            "type" to "list",
            "ordered" to true,
            "start" to 3,
            "items" to listOf(
                item(paragraph(run("Turn the schedule on for internal endpoints."))),
                item(paragraph(run("Watch the duplicate rate for a day."))),
            ),
        ),
    )

    internal val quote = document(
        mapOf(
            "type" to "blockquote",
            "content" to listOf(
                paragraph(run("Deliveries are retried up to five times.")),
                paragraph(run("Every attempt carries the original key.")),
            ),
        ),
        paragraph(run("That is the whole contract, and the tests hold it.")),
    )

    internal val code = document(
        paragraph(run("Add the header to every request:")),
        mapOf(
            "type" to "codeBlock",
            "language" to "ts",
            "text" to "const response = await fetch(url, {\n  method: 'POST',\n  headers: { 'Idempotency-Key': key },\n  body,\n})",
        ),
        paragraph(run("The key is honoured for 24 hours.")),
    )

    internal val entities = document(
        paragraph(
            entity("user", "u_ada", "@Ada Lovelace"),
            run(" can you review the fix for "),
            entity("issue", "i_10423", "#10423"),
            run(" before Friday?"),
        ),
    )

    /** A text node inside the annotations named. */
    private fun annotated(text: String, vararg threads: String, bold: Boolean = false): Map<String, Any> = mapOf(
        "type" to "text",
        "text" to text,
        "marks" to (if (bold) listOf(mapOf("type" to "bold")) else emptyList()) + threads.map { mapOf("type" to "annotation", "id" to it) },
    )

    /** Two comment threads on one paragraph. */
    internal val annotatedThreads = document(
        paragraph(
            run("The retry policy "),
            annotated("doubles the wait", "thread-1"),
            run(" after each failure, "),
            annotated("up to five times", "thread-2"),
            run("."),
        ),
    )

    /** A thread on a phrase, and a second thread on words inside it, which nests inside the first. */
    internal val overlapping = document(
        paragraph(
            run("Each retry waits "),
            annotated("twice ", "thread-1"),
            annotated("as long", "thread-1", "thread-2", bold = true),
            annotated(" as the last one", "thread-1"),
            run(", up to five times."),
        ),
    )

    /** A mention inside a thread: the entity carries the annotation as the text around it does. */
    internal val annotatedEntity = document(
        paragraph(
            run("Ask "),
            entity("user", "u_ada", "@Ada Lovelace") + mapOf("marks" to listOf(mapOf("type" to "annotation", "id" to "thread-3"))),
            annotated(" to review the fix", "thread-3"),
            run(" before Friday."),
        ),
    )

    /** A thread on a heading's words, which the member draws at Heading's step. */
    internal val annotatedHeading = document(
        mapOf("type" to "heading", "level" to 1, "content" to listOf(run("Webhook "), annotated("retries", "thread-4"))),
        paragraph(run("A failed delivery is retried on a schedule.")),
    )

    /** Two nodes of types this version does not know, as a later version may write them: a block holding text, and an inline with a label. */
    internal val later = document(
        mapOf(
            "type" to "callout",
            "tone" to "warning",
            "content" to listOf(run("Deliveries pause while the migration runs.")),
        ),
        paragraph(
            run("The migration starts on "),
            mapOf("type" to "date", "value" to "2026-12-04", "label" to "Friday 4 December"),
            run("."),
        ),
    )

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("prose — every mark, a hard break and a link", expect = mapOf("size" to "md", "empty" to "", "contains" to "Text")) {
                PMRichTextContent(value = prose)
            },
            PMStateEntry(
                "structure — headings at three levels, a nested list and a list from 3",
                expect = mapOf("contains" to "Heading,Text"),
            ) { PMRichTextContent(value = structure) },
            PMStateEntry("a quote", expect = mapOf("contains" to "Text")) { PMRichTextContent(value = quote) },
            PMStateEntry("a code block — CodeBlock, copyable, named by its language", expect = mapOf("contains" to "CodeBlock,Button")) {
                PMRichTextContent(value = code)
            },
            PMStateEntry("entities — the entity token", expect = mapOf("contains" to "Text")) { PMRichTextContent(value = entities) },
            PMStateEntry(
                "entities drawn by the app — a person as a Link, an issue left to the token",
                expect = mapOf("contains" to "Text,Link"),
            ) {
                PMRichTextContent(
                    entity = { entity -> if (entity.kind == "user") PMLink(children = entity.label, href = "/people/${entity.id}") },
                    value = entities,
                )
            },
            PMStateEntry("sm — the secondary step, for a note beside its subject", expect = mapOf("size" to "sm")) {
                PMRichTextContent(size = PMRichTextContentSize.Sm, value = prose)
            },
            PMStateEntry(
                "a later version — an unknown block and inline, drawn as their text",
                expect = mapOf("empty" to "", "contains" to "Text"),
            ) { PMRichTextContent(value = later) },
            PMStateEntry("annotated — two comment threads, one active", expect = mapOf("contains" to "Text")) {
                PMRichTextContent(
                    activeAnnotation = "thread-2",
                    annotations = listOf("thread-1", "thread-2"),
                    onAnnotationSelect = {},
                    value = annotatedThreads,
                )
            },
            PMStateEntry(
                "overlapping annotations — a thread inside another, nested as the editor nests them",
                expect = mapOf("contains" to "Text"),
            ) { PMRichTextContent(activeAnnotation = "thread-2", onAnnotationSelect = {}, value = overlapping) },
            PMStateEntry("an annotated entity — a mention inside a thread, ringed with its wash", expect = mapOf("contains" to "Text")) {
                PMRichTextContent(value = annotatedEntity)
            },
            PMStateEntry(
                "an annotated heading — a thread on a heading’s words, drawn as Heading draws it",
                expect = mapOf("contains" to "Text"),
            ) { PMRichTextContent(onAnnotationSelect = {}, value = annotatedHeading) },
        )
}
