// Markdown (`design/components/markdown.md`): Markdown, usually a model's
// reply, drawn with the vocabulary's members under the screen's theme. The
// web's parser, written in Kotlin (`PMMarkdownSyntax`), reads it, and this
// file decides which member draws each block, as the web's Markdown does:
//
// - a paragraph is Text at `size`, its runs styled as the inline members are;
// - a heading is Heading, relative: the reply's shallowest is level 2, each
//   deeper one a level more, at most 4, so a reply never competes with the
//   page's title; its text is plain, because Heading's children are a string;
// - a fence is CodeBlock, `copyable` only once the fence has closed, so a
//   reader cannot copy half a command;
// - a quote is a column of blocks `space.3` apart behind the quote rule
//   ReasoningDisclosure shares (`pmQuoteRule`);
// - a list is a column of items `space.2` apart, `space.6` in, its markers in
//   `text.secondary` at the item's step (`1.`, or a bullet that changes with
//   depth, as a browser draws them), nested as written; an item's own blocks
//   are `space.2` apart (`PMProseList`, which RichTextContent draws too);
// - a pipe table is Table, a column `numeric` where its delimiter ends in `:`;
// - `---`, `***` and `___` are Separator;
// - an image is a block in place, the picture at the column's width at
//   `radius.md`, named by the model's alt text (an empty alt makes it
//   decorative); while it cannot load, its alt text.
//
// Inside a paragraph or a cell, runs carry the inline members' recipes,
// because a composable cannot flow inside wrapped text: a code span is Code's
// face and wash (mono `text.sm` on `bg.subtle`, a narrow space either side
// standing for its padding, square, because a run has no corner radius); a
// link is Link's inline recipe (`accent.text`, underlined), opened through the
// composition's `LocalUriHandler`, with the `open-external` glyph after it
// when it points to another origin; strong is the `text.xl` weight in
// `text.primary`, emphasis italic, strikethrough struck. `[n]` with an nth
// source is Citation itself, set in the line as inline content. A mark's touch
// area is the hit target centred on it, so a run that holds marks keeps room
// above and below its lines and after their end for that area (`pmMarkReach`),
// a mark that begins a line stands that room in from its start
// (`pmMarkLeadContent`), and two marks one after another stand a gap apart
// (`pmMarkGapContent`). In a table, every cell of a row that holds a mark keeps
// the room above and below, so the row's cells stay in line. Two marks on
// neighbouring lines less than the hit target apart along the line share part
// of their touch areas: a line is shorter than the hit target, and keeping
// them apart would change the paragraph's line spacing.
//
// It is safe and tolerant by construction, as on the web: raw HTML is its own
// text, a link whose target is not `http`, `https`, `mailto` or relative is
// its text, an open fence is a code block of what has arrived, an unclosed
// `**` is two asterisks, and an unfinished link is its characters. The source
// is parsed again when it changes. While `streaming`, the caret
// (`pmCaretContent`) follows the last character of the last paragraph, or
// stands alone on a line after a last block that holds no prose; before
// anything has arrived, Skeleton's bar stands at the step's line box.
//
// Headings are headings; each link is a link to TalkBack, listed with the
// paragraph's links, and a keyboard reaches it. The root carries `state=streaming` while the reply arrives, the
// web's `aria-busy`; ChatThread announces the reply, as the web's does.

package dev.polymorph.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.InlineTextContent
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import dev.polymorph.tokens.PMTextStyle

object PMMarkdown : PMMarkdownRendering {
    /** What every block of one reply draws with. */
    private class Reply(
        val step: PMTextStyle,
        val size: PMTextSize,
        val sources: List<PMCitationSource>,
        val shallowest: Int,
    )

    @Composable
    override fun Render(props: PMMarkdownProps) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val size = if (props.size == PMMarkdownSize.Sm) PMTextSize.Sm else PMTextSize.Md
        val step = if (size == PMTextSize.Sm) theme.text.sm else theme.text.md
        val sources = props.sources ?: emptyList()
        val streaming = props.streaming ?: false
        val blocks = remember(props.children, sources.size) { PMMarkdownSyntax.parse(props.children, sources.size) }
        val pending = streaming && blocks.isEmpty()
        val reply = Reply(step, size, sources, PMMarkdownSyntax.shallowestHeading(blocks) ?: 0)
        val inProse = streaming && PMMarkdownSyntax.endsInProse(blocks)
        val attributes = buildMap {
            put("size", size.value)
            if (streaming) put("state", "streaming")
            if (pending) put("pending", "true")
        }

        Column(
            Modifier
                .pmMember("Markdown", attributes)
                .semantics { isTraversalGroup = true }
                .fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(space.s4),
        ) {
            if (pending) {
                Box(Modifier.clearAndSetSemantics { hideFromAccessibility() }) {
                    PMSkeleton(
                        textStep = if (size == PMTextSize.Sm) PMSkeletonTextStep.Sm else PMSkeletonTextStep.Md,
                        width = PMSkeletonWidth.Width9,
                    )
                }
                return@Column
            }
            Blocks(blocks, reply, caret = inProse, depth = 0)
            if (streaming && !inProse) {
                // The caret alone on a line after a last block that holds no prose.
                val caret = pmCaretContent(step)
                Text(
                    text = buildAnnotatedString { appendCaret() },
                    style = step.textStyle,
                    inlineContent = mapOf(caret),
                    modifier = Modifier.clearAndSetSemantics { hideFromAccessibility() },
                )
            }
        }
    }

    /** Blocks in order; the last carries the caret when `caret`. */
    @Composable
    private fun Blocks(blocks: List<PMMarkdownBlock>, reply: Reply, caret: Boolean, depth: Int) {
        blocks.forEachIndexed { index, block -> Block(block, reply, caret && index == blocks.lastIndex, depth) }
    }

    @Composable
    private fun Block(block: PMMarkdownBlock, reply: Reply, caret: Boolean, depth: Int) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        when (block) {
            is PMMarkdownBlock.Paragraph -> Paragraph(block.children, reply, caret)
            is PMMarkdownBlock.Heading -> PMHeading(
                children = PMMarkdownSyntax.plain(block.children),
                level = when (PMMarkdownSyntax.headingLevel(block.depth, reply.shallowest)) {
                    2 -> PMHeadingLevel.Level2
                    3 -> PMHeadingLevel.Level3
                    else -> PMHeadingLevel.Level4
                },
            )
            is PMMarkdownBlock.Code -> PMCodeBlock(children = block.text, copyable = block.closed)
            is PMMarkdownBlock.Quote -> Column(
                Modifier.fillMaxWidth().pmQuoteRule(),
                verticalArrangement = Arrangement.spacedBy(space.s3),
            ) { Blocks(block.children, reply, caret, depth) }
            is PMMarkdownBlock.Items -> PMProseList(block.items.size, block.ordered, block.start.toLong(), depth, reply.step) { index ->
                Blocks(block.items[index], reply, caret && index == block.items.lastIndex, depth + 1)
            }
            // A row whose cells hold marks keeps their touch areas' room in
            // every cell, so its cells stay in line with one another.
            is PMMarkdownBlock.Table -> PMTable {
                PMTableRow {
                    val reach = block.header.any { cites(it, reply) }
                    block.header.forEachIndexed { column, cell ->
                        PMTableHeader(numeric = block.align.getOrNull(column) == PMMarkdownAlign.End) { Runs(cell, reply, reach = reach, step = PM.theme.text.xs) }
                    }
                }
                for (row in block.rows) {
                    PMTableRow {
                        val reach = row.any { cites(it, reply) }
                        row.forEachIndexed { column, cell ->
                            PMTableCell(numeric = block.align.getOrNull(column) == PMMarkdownAlign.End) {
                                Runs(cell, reply, reach = reach, step = PM.theme.text.sm)
                            }
                        }
                    }
                }
            }
            PMMarkdownBlock.Rule -> PMSeparator()
        }
    }

    /**
     * A paragraph: Text at the reply's size, split where a picture stands, so
     * the picture is a block in place between the runs before and after it.
     */
    @Composable
    private fun Paragraph(children: List<PMMarkdownInline>, reply: Reply, caret: Boolean) {
        val segments = mutableListOf<MutableList<PMMarkdownInline>>(mutableListOf())
        val images = mutableListOf<PMMarkdownInline.Picture>()
        for (node in children) {
            if (node is PMMarkdownInline.Picture) {
                images += node
                segments += mutableListOf<PMMarkdownInline>()
            } else {
                segments.last() += node
            }
        }
        segments.forEachIndexed { index, segment ->
            val last = index == segments.lastIndex
            if (segment.isNotEmpty() || (last && caret)) {
                PMText(size = reply.size) { Runs(segment, reply, caret = last && caret) }
            }
            images.getOrNull(index)?.let { Picture(it) }
        }
    }

    /** A picture the model pointed at: the column's width at `radius.md`, named by its alt text; its alt text while it cannot load. */
    @Composable
    private fun Picture(image: PMMarkdownInline.Picture) {
        val theme = PM.theme
        val shape = theme.rounded(theme.radius.md)
        Box(
            Modifier
                .fillMaxWidth()
                .clip(shape)
                .clearAndSetSemantics {
                    if (image.alt.isEmpty()) {
                        hideFromAccessibility()
                    } else {
                        contentDescription = image.alt
                        role = Role.Image
                    }
                },
        ) {
            PMRemoteImage(image.src, Modifier.fillMaxWidth()) {
                Text(image.alt, style = theme.text.sm.textStyle, color = theme.colors.textSecondary.color)
            }
        }
    }

    /**
     * Inline runs as one Text, its marks (citations, external glyphs, the
     * caret) set in it as inline content. A link is a run in a
     * `LinkAnnotation.Url` in Link's grammar (`pmLinkStyles`), opened through
     * the composition's `LocalUriHandler`: TalkBack announces each as a link
     * and lists the paragraph's links, a keyboard reaches each and draws its
     * focused style, and a press on its words opens it. With `reach`, the
     * runs keep room above and below their lines, set in `step`, for a
     * mark's touch area (`pmMarkReach`), and runs that hold marks keep room
     * after their lines' end and before a mark that begins a line
     * (`pmMarkLeadContent`).
     */
    @Composable
    private fun Runs(
        nodes: List<PMMarkdownInline>,
        reply: Reply,
        caret: Boolean = false,
        reach: Boolean = cites(nodes, reply),
        step: PMTextStyle = reply.step,
    ) {
        val theme = PM.theme
        val colors = theme.colors
        val marks = mutableMapOf<String, InlineTextContent>()
        for (index in citations(nodes)) {
            reply.sources.getOrNull(index - 1)?.let { source -> marks += pmCitationContent(citeId(index), index, source) }
        }
        val cited = cites(nodes, reply)
        if (cited) {
            marks += pmMarkGapContent()
            marks += pmMarkLeadContent()
        }
        if (external(nodes)) marks += pmGlyphContent(EXTERNAL, PMIconRole.OpenExternal, colors.accentText.color)
        if (caret) marks += pmCaretContent(reply.step)
        val style = Styles(
            code = SpanStyle(
                fontFamily = theme.text.sm.mono(theme).textStyle.fontFamily,
                fontSize = theme.text.sm.textStyle.fontSize,
                background = colors.bgSubtle.color,
                color = colors.textPrimary.color,
            ),
            strong = SpanStyle(fontWeight = FontWeight(theme.text.xl.weight), color = colors.textPrimary.color),
            link = pmLinkStyles(colors.accentText.color, colors.accentText.color, underlined = true),
        )
        val text = buildAnnotatedString {
            runs(nodes, reply, style, Line())
            if (caret) appendCaret()
        }
        // A run with marks keeps their touch areas' reach above and below
        // its lines, and so does every cell in a table row with marks; the
        // reach past a line's end is kept by the run with marks alone.
        Text(text = text, inlineContent = marks, modifier = if (reach) Modifier.pmMarkReach(step, marks = cited) else Modifier)
    }

    /** The span styles a run is drawn in, and Link's grammar for a link's run. */
    private class Styles(val code: SpanStyle, val strong: SpanStyle, val link: TextLinkStyles)

    /** The line being built: whether nothing is drawn on it yet, as at the run's start and after a hard break. */
    private class Line(var empty: Boolean = true)

    private fun AnnotatedString.Builder.runs(nodes: List<PMMarkdownInline>, reply: Reply, style: Styles, line: Line) {
        nodes.forEachIndexed { at, node ->
            // A mark that follows another, with nothing but a space between,
            // stands the gap after it, so the two touch areas do not overlap.
            if (node is PMMarkdownInline.Citation && node.index <= reply.sources.size && followsMark(nodes, at, reply)) {
                appendMark(PM_MARK_GAP)
            }
            when (node) {
                is PMMarkdownInline.Text -> append(node.text)
                is PMMarkdownInline.Code -> withStyle(style.code) { append("$PADDING${node.text}$PADDING") }
                is PMMarkdownInline.Strong -> withStyle(style.strong) { runs(node.children, reply, style, line) }
                is PMMarkdownInline.Em -> withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { runs(node.children, reply, style, line) }
                is PMMarkdownInline.Strike -> withStyle(SpanStyle(textDecoration = TextDecoration.LineThrough)) { runs(node.children, reply, style, line) }
                is PMMarkdownInline.Link -> {
                    withLink(LinkAnnotation.Url(node.href, style.link)) { runs(node.children, reply, style, line) }
                    if (isExternal(node.href)) appendMark(EXTERNAL)
                }
                // A picture inside a heading or a cell is its alt text.
                is PMMarkdownInline.Picture -> append(node.alt)
                PMMarkdownInline.Break -> append(LINE)
                is PMMarkdownInline.Citation -> if (node.index <= reply.sources.size) {
                    // A mark that begins a line keeps the room its touch area reaches before it.
                    if (line.empty) appendMark(PM_MARK_LEAD)
                    appendMark(citeId(node.index))
                } else {
                    append(PMMarkdownSyntax.plain(listOf(node)))
                }
            }
            line.empty = when (node) {
                PMMarkdownInline.Break -> true
                is PMMarkdownInline.Text -> line.empty && node.text.isBlank()
                is PMMarkdownInline.Picture -> line.empty && node.alt.isBlank()
                is PMMarkdownInline.Strong, is PMMarkdownInline.Em, is PMMarkdownInline.Strike -> line.empty
                else -> false
            }
        }
    }

    /** Whether the node at `at` comes after a drawn mark, with at most a space between. */
    private fun followsMark(nodes: List<PMMarkdownInline>, at: Int, reply: Reply): Boolean {
        var before = at - 1
        val between = nodes.getOrNull(before)
        if (between is PMMarkdownInline.Text && between.text.isBlank()) before -= 1
        val mark = nodes.getOrNull(before)
        return mark is PMMarkdownInline.Citation && mark.index <= reply.sources.size
    }

    /** The citation numbers a run holds, at any depth. */
    private fun citations(nodes: List<PMMarkdownInline>): List<Int> = nodes.flatMap { node ->
        when (node) {
            is PMMarkdownInline.Citation -> listOf(node.index)
            is PMMarkdownInline.Strong -> citations(node.children)
            is PMMarkdownInline.Em -> citations(node.children)
            is PMMarkdownInline.Strike -> citations(node.children)
            is PMMarkdownInline.Link -> citations(node.children)
            else -> emptyList()
        }
    }.distinct()

    /** Whether a run holds a Citation mark: a `[n]` with an nth source. */
    private fun cites(nodes: List<PMMarkdownInline>, reply: Reply): Boolean = citations(nodes).any { it <= reply.sources.size }

    /** Whether a run holds a link to another origin. */
    private fun external(nodes: List<PMMarkdownInline>): Boolean = nodes.any { node ->
        when (node) {
            is PMMarkdownInline.Link -> isExternal(node.href) || external(node.children)
            is PMMarkdownInline.Strong -> external(node.children)
            is PMMarkdownInline.Em -> external(node.children)
            is PMMarkdownInline.Strike -> external(node.children)
            else -> false
        }
    }

    /** An absolute or protocol-relative address points to another origin. */
    private fun isExternal(href: String): Boolean = ABSOLUTE.containsMatchIn(href)

    private fun citeId(index: Int) = "$CITE$index"

    private val ABSOLUTE = Regex("""^(?:[a-z][a-z0-9+.-]*:)?//""", RegexOption.IGNORE_CASE)

    private const val EXTERNAL = "pm.external"
    private const val CITE = "pm.cite."
    private const val LINE = "\n"

    /** A narrow no-break space either side of a code span, standing for Code's padding. */
    private const val PADDING = " "
}

/** Markdown's states, from the spec's States table. */
object MarkdownStates : PMStates {
    override val member = "Markdown"

    private const val prose = "A **duplicate delivery** is refused rather than applied twice, because the retry now sends " +
        "the *original* `Idempotency-Key`. See [the receiver's guide](https://docs.example.com/idempotency) for the header."

    private const val structure = "## What changed\n\n" +
        "1. Retries now carry the original idempotency key.\n" +
        "2. The backoff cap moved from three attempts to five.\n" +
        "   - The first retry still fires after two seconds.\n" +
        "   - Each later one doubles the wait.\n" +
        "3. A `429` from the receiver is retried; a `410` is not.\n\n" +
        "### Why it matters\n\n" +
        "A duplicate delivery is refused rather than applied twice, which the ~~old~~ previous behaviour could not promise."

    private const val fence = "Run the suite before you deploy:\n\n```sh\npnpm test --filter webhooks\n```"

    private const val table = "| Attempt | Wait | Cumulative |\n| --- | ---: | ---: |\n| 1 | 2s | 2s |\n| 2 | 4s | 6s |\n| 3 | 8s | 14s |"

    private const val quote = "> A retry is a promise the receiver keeps.\n\n---\n\nThe rule holds for every endpoint."

    private const val cited = "Send the same key with every retry [1], and cap the backoff [2]."

    private const val citedTogether = "Retries carry the original idempotency key, and the backoff is capped [1][2]."

    /** A mark first and a mark last on a line, then a mark first on a line after a hard break. */
    private const val citedAtEdges = "[1] Send the same key again [2]\n\nCap the backoff\\\n[3] at five attempts."

    /** A row whose first cell ends in a mark and whose second starts with one, and a last cell that ends in one. */
    private const val citedInCells = "| Wait | Rule | Cap |\n| ---: | --- | ---: |\n| 2s [1] | [2] Retry with the key | 5 attempts [3] |"

    private const val streamingFence = "The **new handler\n\n```ts\nexport function retry(key: string) {\n  return send(key"

    private const val streamingProse = "The retry now carries the original idempotency key, so the receiver"

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("prose — emphasis, inline code and a link", expect = mapOf("size" to "md", "contains" to "Text")) {
                PMMarkdown(children = prose)
            },
            PMStateEntry("structure — headings at 2 and 3, a nested ordered list", expect = mapOf("contains" to "Heading")) {
                PMMarkdown(children = structure)
            },
            PMStateEntry("a fence — CodeBlock with Copy", expect = mapOf("contains" to "CodeBlock,Button")) { PMMarkdown(children = fence) },
            PMStateEntry("a table — Table, two numeric columns", expect = mapOf("contains" to "Table")) { PMMarkdown(children = table) },
            PMStateEntry("a quote and a rule", expect = mapOf("contains" to "Separator")) { PMMarkdown(children = quote) },
            PMStateEntry("citations — two marks", expect = mapOf("contains" to "Citation")) {
                PMMarkdown(children = cited, sources = SourceListStates.sources)
            },
            PMStateEntry("citations — two marks side by side, a hit target apart", expect = mapOf("contains" to "Citation")) {
                PMMarkdown(children = citedTogether, sources = SourceListStates.sources)
            },
            // A paragraph as wide as its longest line, at the window's start
            // and at its end, so a mark that starts a line meets one edge and
            // a mark that ends the longest line meets the other.
            PMStateEntry("citations — marks first and last on a line, a narrow paragraph at each edge", expect = mapOf("contains" to "Citation")) {
                Column(Modifier.fillMaxWidth()) {
                    Box(Modifier.width(IntrinsicSize.Max)) { PMMarkdown(children = citedAtEdges, sources = SourceListStates.sources) }
                    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.TopEnd) {
                        Box(Modifier.width(IntrinsicSize.Max)) { PMMarkdown(children = citedAtEdges, sources = SourceListStates.sources) }
                    }
                }
            },
            PMStateEntry("citations — marks in adjacent table cells, the last at the table's end", expect = mapOf("contains" to "Table,Citation")) {
                PMFixtureWidth(PMGeometry.compactWidth) {
                    CompositionLocalProvider(LocalPMTableLayout provides PMTableLayout.Table) {
                        PMMarkdown(children = citedInCells, sources = SourceListStates.sources)
                    }
                }
            },
            PMStateEntry("sm", expect = mapOf("size" to "sm")) { PMMarkdown(children = prose, size = PMMarkdownSize.Sm) },
            PMStateEntry("streaming — an open fence after an unclosed strong", expect = mapOf("state" to "streaming", "contains" to "CodeBlock")) {
                PMMarkdown(children = streamingFence, streaming = true)
            },
            PMStateEntry("streaming prose — the caret in the paragraph", expect = mapOf("state" to "streaming")) {
                PMMarkdown(children = streamingProse, streaming = true)
            },
            PMStateEntry("pending — Skeleton's bar until the first word", expect = mapOf("state" to "streaming", "pending" to "true")) {
                PMMarkdown(children = "", streaming = true)
            },
        )
}
