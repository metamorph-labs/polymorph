// Markdown's parser: the web's (`packages/engine/src/markdown/parse.ts`),
// written here in Kotlin, so a reply draws the same tree on every platform.
// Small and tolerant: the source is a model's reply that is usually still
// arriving, so the parser never throws, and an unfinished construct is the text
// received so far: an open fence is a code block of what has arrived, and an
// unmatched `**` is two asterisks. The tree names kinds (a heading, a list, a
// code block) and never an element or a style. Raw HTML is text.
//
// The grammar is the CommonMark core models write: headings, paragraphs,
// fenced code, block quotes, lists nested by indentation, pipe tables,
// thematic breaks, and the inline set (code spans, emphasis, strikethrough,
// links, images, autolinks, hard breaks), with `[n]` a citation mark when the
// reply has `n` sources. Setext headings are read for `===` only; a line of
// `---` is always a rule. `MarkdownSyntaxTest` holds it to the web's tests.

package dev.polymorph.ui

/** An inline run of a paragraph, a heading or a table cell. */
sealed interface PMMarkdownInline {
    data class Text(val text: String) : PMMarkdownInline
    data class Code(val text: String) : PMMarkdownInline
    data class Strong(val children: List<PMMarkdownInline>) : PMMarkdownInline
    data class Em(val children: List<PMMarkdownInline>) : PMMarkdownInline
    data class Strike(val children: List<PMMarkdownInline>) : PMMarkdownInline
    data class Link(val href: String, val children: List<PMMarkdownInline>) : PMMarkdownInline
    /** The web's `image` node; named so that no call reads as Compose's `Image`, which only the foundation draws. */
    data class Picture(val alt: String, val src: String) : PMMarkdownInline
    data object Break : PMMarkdownInline
    data class Citation(val index: Int) : PMMarkdownInline
}

/** A table column's alignment, from its delimiter's colons. */
enum class PMMarkdownAlign { Start, Center, End }

/** A block of a reply. */
sealed interface PMMarkdownBlock {
    data class Paragraph(val children: List<PMMarkdownInline>) : PMMarkdownBlock
    data class Heading(val depth: Int, val children: List<PMMarkdownInline>) : PMMarkdownBlock
    data class Code(val lang: String, val text: String, val closed: Boolean) : PMMarkdownBlock
    data class Quote(val children: List<PMMarkdownBlock>) : PMMarkdownBlock
    data class Items(val ordered: Boolean, val start: Int, val items: List<List<PMMarkdownBlock>>) : PMMarkdownBlock
    data class Table(
        val align: List<PMMarkdownAlign?>,
        val header: List<List<PMMarkdownInline>>,
        val rows: List<List<List<PMMarkdownInline>>>,
    ) : PMMarkdownBlock
    data object Rule : PMMarkdownBlock
}

object PMMarkdownSyntax {
    private val FENCE = Regex("""^ {0,3}(`{3,}|~{3,})[ \t]*([^`\s]*)[^`]*$""")
    private val FENCE_CLOSE = Regex("""^ {0,3}(`{3,}|~{3,})[ \t]*$""")
    private val HEADING = Regex("""^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*#*[ \t]*$""")
    private val RULE = Regex("""^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$""")
    private val SETEXT_H1 = Regex("""^ {0,3}=+[ \t]*$""")
    private val QUOTE = Regex("""^ {0,3}>[ ]?(.*)$""")
    private val LIST_ITEM = Regex("""^( {0,3})([-*+]|\d{1,9}[.)])([ \t]+|$)(.*)$""")
    private val TABLE_DELIMITER = Regex("""^[ \t]*\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$""")
    private val BLANK = Regex("""^[ \t]*$""")
    private val DIGIT = Regex("""^\d""")
    private val LINE_ENDS = Regex("""\r\n?""")

    /** The blocks of `source`, `citations` being the number of sources a `[n]` may name. */
    fun parse(source: String, citations: Int = 0): List<PMMarkdownBlock> =
        blocks(source.replace(LINE_ENDS, NEWLINE).split(NEWLINE), citations)

    private fun blocks(lines: List<String>, citations: Int): List<PMMarkdownBlock> {
        val blocks = mutableListOf<PMMarkdownBlock>()
        val paragraph = mutableListOf<String>()
        fun flush() {
            if (paragraph.isEmpty()) return
            blocks += PMMarkdownBlock.Paragraph(inlines(paragraph.joinToString(NEWLINE), citations))
            paragraph.clear()
        }

        var at = 0
        while (at < lines.size) {
            val line = lines[at]

            if (BLANK.matches(line)) {
                flush()
                at += 1
                continue
            }

            val fence = FENCE.find(line)
            if (fence != null) {
                flush()
                val marker = fence.groupValues[1]
                val lang = fence.groupValues[2]
                val body = mutableListOf<String>()
                var closed = false
                at += 1
                while (at < lines.size) {
                    val candidate = lines[at]
                    val close = FENCE_CLOSE.find(candidate)
                    if (close != null && close.groupValues[1][0] == marker[0] && close.groupValues[1].length >= marker.length) {
                        closed = true
                        at += 1
                        break
                    }
                    body += candidate
                    at += 1
                }
                blocks += PMMarkdownBlock.Code(lang, body.joinToString(NEWLINE), closed)
                continue
            }

            // Setext `===` turns the paragraph above it into a heading; no other setext form is read.
            if (paragraph.isNotEmpty() && SETEXT_H1.matches(line)) {
                val text = paragraph.joinToString(NEWLINE)
                paragraph.clear()
                blocks += PMMarkdownBlock.Heading(1, inlines(text, citations))
                at += 1
                continue
            }

            if (RULE.matches(line)) {
                flush()
                blocks += PMMarkdownBlock.Rule
                at += 1
                continue
            }

            val heading = HEADING.find(line)
            if (heading != null) {
                flush()
                blocks += PMMarkdownBlock.Heading(heading.groupValues[1].length, inlines(heading.groupValues[2], citations))
                at += 1
                continue
            }

            if (QUOTE.containsMatchIn(line)) {
                flush()
                val inner = mutableListOf<String>()
                while (at < lines.size) {
                    val quoted = QUOTE.find(lines[at]) ?: break
                    inner += quoted.groupValues[1]
                    at += 1
                }
                blocks += PMMarkdownBlock.Quote(blocks(inner, citations))
                continue
            }

            val item = LIST_ITEM.find(line)
            if (item != null && !(paragraph.isNotEmpty() && DIGIT.containsMatchIn(item.groupValues[2]) && item.groupValues[2] != FIRST_ORDERED)) {
                flush()
                val (list, next) = list(lines, at, citations)
                blocks += list
                at = next
                continue
            }

            if (PIPE in line && at + 1 < lines.size && TABLE_DELIMITER.matches(lines[at + 1])) {
                val header = splitRow(line)
                val align = splitRow(lines[at + 1]).map(::alignOf)
                if (header.size == align.size) {
                    flush()
                    val rows = mutableListOf<List<List<PMMarkdownInline>>>()
                    at += 2
                    while (at < lines.size && PIPE in lines[at] && !BLANK.matches(lines[at])) {
                        val cells = splitRow(lines[at])
                        // A short row is padded and a long one trimmed: a table still
                        // being written has an unfinished last row.
                        rows += List(header.size) { column -> inlines(cells.getOrElse(column) { EMPTY }, citations) }
                        at += 1
                    }
                    blocks += PMMarkdownBlock.Table(align, header.map { inlines(it, citations) }, rows)
                    continue
                }
            }

            paragraph += line
            at += 1
        }

        flush()
        return blocks
    }

    /** `| a | b |` as `[a, b]`; an escaped pipe stays in its cell. */
    private fun splitRow(line: String): List<String> {
        val trimmed = line.trim().removePrefix(PIPE).removeSuffix(PIPE)
        val cells = mutableListOf<String>()
        val current = StringBuilder()
        var index = 0
        while (index < trimmed.length) {
            val character = trimmed[index]
            if (character == '\\' && trimmed.getOrNull(index + 1) == '|') {
                current.append('|')
                index += 1
            } else if (character == '|') {
                cells += current.toString().trim()
                current.clear()
            } else {
                current.append(character)
            }
            index += 1
        }
        cells += current.toString().trim()
        return cells
    }

    private fun alignOf(cell: String): PMMarkdownAlign? {
        val left = cell.startsWith(COLON)
        val right = cell.endsWith(COLON)
        return when {
            left && right -> PMMarkdownAlign.Center
            right -> PMMarkdownAlign.End
            left -> PMMarkdownAlign.Start
            else -> null
        }
    }

    /**
     * One list: every following item with the same marker kind and indent. An
     * item runs through every following line indented to its content column,
     * blank lines included while indented content follows them, so it can hold
     * a nested list, a fence or a second paragraph; each item is parsed again
     * as blocks.
     */
    private fun list(lines: List<String>, start: Int, citations: Int): Pair<PMMarkdownBlock, Int> {
        val first = LIST_ITEM.find(lines[start])!!
        val ordered = DIGIT.containsMatchIn(first.groupValues[2])
        val startNumber = if (ordered) first.groupValues[2].takeWhile { it.isDigit() }.toInt() else 1
        val indent = first.groupValues[1].length
        val items = mutableListOf<List<PMMarkdownBlock>>()

        var at = start
        while (at < lines.size) {
            val match = LIST_ITEM.find(lines[at]) ?: break
            if (match.groupValues[1].length != indent) break
            if (DIGIT.containsMatchIn(match.groupValues[2]) != ordered) break

            val marker = match.groupValues[2]
            val gap = match.groupValues[3].length
            val contentColumn = indent + marker.length + maxOf(1, minOf(gap, MAX_GAP))
            val body = mutableListOf(match.groupValues[4])
            at += 1

            while (at < lines.size) {
                val candidate = lines[at]
                if (BLANK.matches(candidate)) {
                    // A blank line belongs to the item only if indented content follows it.
                    val following = lines.getOrNull(at + 1)
                    if (following != null && leadingSpaces(following) >= contentColumn) {
                        body += EMPTY
                        at += 1
                        continue
                    }
                    break
                }
                if (leadingSpaces(candidate) >= contentColumn) {
                    body += candidate.substring(contentColumn)
                    at += 1
                    continue
                }
                // A lazy continuation: an unindented line that is not a new item joins the paragraph it follows.
                if (!LIST_ITEM.containsMatchIn(candidate) && body.isNotEmpty() && body.last() != EMPTY) {
                    body += candidate.trimStart()
                    at += 1
                    continue
                }
                break
            }

            items += blocks(body, citations)

            // Blank lines between items belong to the list and do not end it.
            while (at < lines.size && BLANK.matches(lines[at])) {
                val following = lines.getOrNull(at + 1)
                if (following == null || !LIST_ITEM.containsMatchIn(following)) break
                at += 1
            }
        }
        return PMMarkdownBlock.Items(ordered, startNumber, items) to at
    }

    private fun leadingSpaces(line: String): Int = line.takeWhile { it == ' ' }.length

    /* Inlines ---------------------------------------------------------------- */

    private val ENTITIES = mapOf(
        "amp" to "&",
        "lt" to "<",
        "gt" to ">",
        "quot" to "\"",
        "apos" to "'",
        "nbsp" to " ",
    )

    private val BARE_URL = Regex("""^https?://[^\s<>()]+(?:\([^\s<>()]*\)[^\s<>()]*)*""")
    private val SCHEME = Regex("""^([a-z][a-z0-9+.-]*):""", RegexOption.IGNORE_CASE)
    private val ESCAPABLE = Regex("""[\\`*_{}\[\]()#+\-.!~<>|]""")
    private val CITE = Regex("""^\[(\d{1,3})]""")
    private val AUTOLINK = Regex("""^<(https?://[^\s<>]+|mailto:[^\s<>]+)>""")
    private val ENTITY = Regex("""^&(#\d{1,6}|#x[0-9a-f]{1,5}|[a-z]+);""", RegexOption.IGNORE_CASE)
    private val BEFORE_URL = Regex("""[\s(]""")
    private val TRAILING = Regex("""[.,;:!?'"]+$""")
    private val TRAILING_SPACES = Regex(""" +$""")
    private val TITLE = Regex("""\s+("[^"]*"|'[^']*')$""")
    private val SPACE = Regex("""\s""")
    private val WORD = Regex("""\w""")

    /** The schemes a link may point at; a target with any other scheme is its text. */
    private val SAFE_SCHEMES = setOf("http", "https", "mailto")

    /** The target if a link may point at it, or null: a rejected link draws as its text. */
    fun safeHref(raw: String): String? {
        // Control characters go one at a time, because `java\tscript:` is still read as `javascript:`.
        val href = raw.trim().filter { it.code > LAST_CONTROL && it.code != DELETE }
        if (href.isEmpty()) return null
        val scheme = SCHEME.find(href) ?: return href
        return if (scheme.groupValues[1].lowercase() in SAFE_SCHEMES) href else null
    }

    fun inlines(text: String, citations: Int = 0): List<PMMarkdownInline> {
        val nodes = mutableListOf<PMMarkdownInline>()
        val buffer = StringBuilder()
        fun flush() {
            if (buffer.isEmpty()) return
            nodes += PMMarkdownInline.Text(buffer.toString())
            buffer.clear()
        }

        var at = 0
        while (at < text.length) {
            val character = text[at]

            // Escapes: the next character is literal, whatever it is.
            if (character == '\\' && at + 1 < text.length) {
                val next = text[at + 1]
                if (next == '\n') {
                    flush()
                    nodes += PMMarkdownInline.Break
                    at += 2
                    continue
                }
                if (ESCAPABLE.matches(next.toString())) {
                    buffer.append(next)
                    at += 2
                    continue
                }
            }

            // A line break inside a paragraph: hard after two spaces, soft otherwise.
            if (character == '\n') {
                if (buffer.endsWith(TWO_SPACES)) {
                    val kept = buffer.toString().replace(TRAILING_SPACES, EMPTY)
                    buffer.clear()
                    buffer.append(kept)
                    flush()
                    nodes += PMMarkdownInline.Break
                } else {
                    buffer.append(' ')
                }
                at += 1
                continue
            }

            if (character == '`') {
                var run = 0
                while (text.getOrNull(at + run) == '`') run += 1
                val opener = BACKTICK.repeat(run)
                val close = text.indexOf(opener, at + run)
                if (close != -1 && text.getOrNull(close + run) != '`') {
                    flush()
                    nodes += PMMarkdownInline.Code(text.substring(at + run, close).replace('\n', ' ').trim())
                    at = close + run
                    continue
                }
                buffer.append(opener)
                at += run
                continue
            }

            if (character == '!' && text.getOrNull(at + 1) == '[') {
                val image = bracketed(text, at + 1)
                if (image != null) {
                    val src = safeHref(image.target)
                    flush()
                    if (src != null) nodes += PMMarkdownInline.Picture(image.label, src) else buffer.appendRange(text, at, image.end)
                    at = image.end
                    continue
                }
            }

            if (character == '[') {
                val cite = CITE.find(text.substring(at))
                if (cite != null && text.getOrNull(at + cite.value.length) != '(') {
                    val index = cite.groupValues[1].toInt()
                    if (index in 1..citations) {
                        flush()
                        nodes += PMMarkdownInline.Citation(index)
                        at += cite.value.length
                        continue
                    }
                }
                val link = bracketed(text, at)
                if (link != null) {
                    val href = safeHref(link.target)
                    flush()
                    if (href != null) {
                        nodes += PMMarkdownInline.Link(href, inlines(link.label, citations))
                    } else {
                        nodes += inlines(link.label, citations)
                    }
                    at = link.end
                    continue
                }
            }

            if (character == '<') {
                val auto = AUTOLINK.find(text.substring(at))
                if (auto != null) {
                    val target = auto.groupValues[1]
                    val href = safeHref(target)
                    flush()
                    if (href != null) nodes += PMMarkdownInline.Link(href, listOf(PMMarkdownInline.Text(target))) else buffer.append(target)
                    at += auto.value.length
                    continue
                }
            }

            if (character == '&') {
                val entity = ENTITY.find(text.substring(at))
                if (entity != null) {
                    val name = entity.groupValues[1]
                    val decoded = when {
                        name.startsWith(HEX_ENTITY, ignoreCase = true) -> codePoint(name.substring(2).toInt(HEX))
                        name.startsWith(NUMBER_ENTITY) -> codePoint(name.substring(1).toInt())
                        else -> ENTITIES[name.lowercase()]
                    }
                    if (decoded != null) {
                        buffer.append(decoded)
                        at += entity.value.length
                        continue
                    }
                }
            }

            if (character == 'h' && (at == 0 || BEFORE_URL.matches(text[at - 1].toString()))) {
                val url = BARE_URL.find(text.substring(at))
                if (url != null) {
                    var raw = url.value
                    // Trailing prose punctuation belongs to the sentence, not the address.
                    TRAILING.find(raw)?.let { raw = raw.dropLast(it.value.length) }
                    val href = safeHref(raw)
                    if (href != null) {
                        flush()
                        nodes += PMMarkdownInline.Link(href, listOf(PMMarkdownInline.Text(raw)))
                        at += raw.length
                        continue
                    }
                }
            }

            val emphasis = emphasis(text, at)
            if (emphasis != null) {
                flush()
                val inner = inlines(text.substring(at + emphasis.marker.length, emphasis.close), citations)
                nodes += when (emphasis.kind) {
                    Kind.Strong -> PMMarkdownInline.Strong(inner)
                    Kind.Em -> PMMarkdownInline.Em(inner)
                    Kind.Strike -> PMMarkdownInline.Strike(inner)
                }
                at = emphasis.close + emphasis.marker.length
                continue
            }

            buffer.append(character)
            at += 1
        }

        flush()
        return merged(nodes)
    }

    /** A code point as a string, a surrogate pair above the basic plane. */
    private fun codePoint(value: Int): String =
        if (value < SUPPLEMENTARY) {
            value.toChar().toString()
        } else {
            val offset = value - SUPPLEMENTARY
            charArrayOf((HIGH_SURROGATE + (offset shr SURROGATE_BITS)).toChar(), (LOW_SURROGATE + (offset and SURROGATE_MASK)).toChar()).concatToString()
        }

    private class Bracketed(val label: String, val target: String, val end: Int)

    /**
     * `[label](target "title")`, with balanced brackets, so a nested image or a
     * bracketed word in the label does not end it early. Null when it is
     * unfinished, as it is while streaming: its characters draw as text until
     * the closing parenthesis arrives.
     */
    private fun bracketed(text: String, open: Int): Bracketed? {
        var depth = 0
        var close = -1
        var index = open
        while (index < text.length) {
            val character = text[index]
            if (character == '\\') {
                index += 2
                continue
            }
            if (character == '[') {
                depth += 1
            } else if (character == ']') {
                depth -= 1
                if (depth == 0) {
                    close = index
                    break
                }
            }
            index += 1
        }
        if (close == -1 || text.getOrNull(close + 1) != '(') return null

        var parens = 0
        index = close + 1
        while (index < text.length) {
            val character = text[index]
            if (character == '\\') {
                index += 2
                continue
            }
            if (character == '(') {
                parens += 1
            } else if (character == ')') {
                parens -= 1
                if (parens == 0) {
                    val inside = text.substring(close + 2, index).trim()
                    // An optional quoted title is dropped: the vocabulary has no tooltip for it.
                    val target = inside.replace(TITLE, EMPTY).trim()
                    return Bracketed(text.substring(open + 1, close), target, index + 1)
                }
            }
            index += 1
        }
        return null
    }

    private enum class Kind { Strong, Em, Strike }

    private class Emphasis(val marker: String, val kind: Kind, val close: Int)

    private val MARKERS = listOf(
        "**" to Kind.Strong,
        "__" to Kind.Strong,
        "~~" to Kind.Strike,
        "*" to Kind.Em,
        "_" to Kind.Em,
    )

    /**
     * The emphasis a delimiter run opens, when it closes somewhere after it, by
     * the flanking rule: an opener is not followed by whitespace, a closer not
     * preceded by it, and the underscore forms neither open nor close inside a
     * word, so `snake_case_name` is three words. An unclosed run is null and
     * draws as text, which is the streaming case.
     */
    private fun emphasis(text: String, at: Int): Emphasis? {
        for ((marker, kind) in MARKERS) {
            if (!text.startsWith(marker, at)) continue
            val after = text.getOrNull(at + marker.length)
            if (after == null || SPACE.matches(after.toString()) || after == marker[0]) continue
            if (marker[0] == '_' && at > 0 && WORD.matches(text[at - 1].toString())) continue

            var search = at + marker.length
            while (search < text.length) {
                val close = text.indexOf(marker, search)
                if (close == -1) break
                val before = text[close - 1]
                val following = text.getOrNull(close + marker.length)
                val flanks = !SPACE.matches(before.toString())
                val wordBound = marker[0] != '_' || following == null || !WORD.matches(following.toString())
                // The same character continuing the run makes a longer delimiter, not this one's close.
                if (flanks && wordBound && following != marker[0]) return Emphasis(marker, kind, close)
                search = close + marker.length
            }
        }
        return null
    }

    private fun merged(nodes: List<PMMarkdownInline>): List<PMMarkdownInline> {
        val out = mutableListOf<PMMarkdownInline>()
        for (node in nodes) {
            val last = out.lastOrNull()
            if (node is PMMarkdownInline.Text && last is PMMarkdownInline.Text) {
                out[out.lastIndex] = PMMarkdownInline.Text(last.text + node.text)
            } else {
                out += node
            }
        }
        return out
    }

    /** The plain text of a run, for a heading's string or an accessible name. */
    fun plain(nodes: List<PMMarkdownInline>): String = nodes.joinToString(EMPTY) { node ->
        when (node) {
            is PMMarkdownInline.Text -> node.text
            is PMMarkdownInline.Code -> node.text
            is PMMarkdownInline.Picture -> node.alt
            PMMarkdownInline.Break -> SPACE_TEXT
            is PMMarkdownInline.Citation -> "[${node.index}]"
            is PMMarkdownInline.Strong -> plain(node.children)
            is PMMarkdownInline.Em -> plain(node.children)
            is PMMarkdownInline.Strike -> plain(node.children)
            is PMMarkdownInline.Link -> plain(node.children)
        }
    }

    /** The shallowest heading depth in a reply, which draws as level 2, or null when it has none. */
    fun shallowestHeading(blocks: List<PMMarkdownBlock>): Int? = blocks.mapNotNull { block ->
        when (block) {
            is PMMarkdownBlock.Heading -> block.depth
            is PMMarkdownBlock.Quote -> shallowestHeading(block.children)
            is PMMarkdownBlock.Items -> block.items.mapNotNull { shallowestHeading(it) }.minOrNull()
            else -> null
        }
    }.minOrNull()

    /**
     * The level a heading draws at: the reply's shallowest is 2, deeper ones a
     * level more each, at most 4. A reply is never the page, so no heading is
     * level 1.
     */
    fun headingLevel(depth: Int, shallowest: Int): Int = (2 + depth - shallowest).coerceIn(2, 4)

    /** Whether a streaming reply's last block ends in a paragraph, where the caret then sits. */
    fun endsInProse(blocks: List<PMMarkdownBlock>): Boolean = when (val last = blocks.lastOrNull()) {
        is PMMarkdownBlock.Paragraph -> true
        is PMMarkdownBlock.Quote -> endsInProse(last.children)
        is PMMarkdownBlock.Items -> endsInProse(last.items.lastOrNull() ?: emptyList())
        else -> false
    }

    private const val NEWLINE = "\n"
    private const val EMPTY = ""
    private const val SPACE_TEXT = " "
    private const val TWO_SPACES = "  "
    private const val PIPE = "|"
    private const val COLON = ":"
    private const val BACKTICK = "`"
    private const val FIRST_ORDERED = "1."
    private const val HEX_ENTITY = "#x"
    private const val NUMBER_ENTITY = "#"
    private const val HEX = 16
    private const val MAX_GAP = 4

    /** The last control character below the space, and the delete character. */
    private const val LAST_CONTROL = 31
    private const val DELETE = 127

    /** The first code point above the basic plane, and the surrogates that write one. */
    private const val SUPPLEMENTARY = 65536
    private const val HIGH_SURROGATE = 55296
    private const val LOW_SURROGATE = 56320
    private const val SURROGATE_BITS = 10
    private const val SURROGATE_MASK = 1023
}
