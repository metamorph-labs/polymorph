// RichTextContent's reader: the web's tolerant reader of a rich-text document
// (`packages/engine/src/rich-text/`), written here in Kotlin as far as drawing
// needs it, so a stored document draws the same blocks on every platform. It
// takes any JSON and never throws: what is not a document reads as the empty
// document, and a node of a type this version does not know keeps its place
// and is drawn as the readable text found in it.
//
// It mirrors these functions, and `RichTextReaderTest` holds it to their cases:
//
// - `parseRichText` (`read.ts`: `readDocument`, `readBlock`, `readItems`,
//   `readInlines`, `readMarks`, `flatten`), for each repair that changes what
//   is drawn: a heading deeper than 3 is a level 3 heading and one with no
//   level a paragraph; a list that does not say it is numbered is bulleted, and
//   one whose first number is not a whole number from 0 starts at 1; a list
//   with no items and a quote with no blocks are left out; a list item's first
//   block is a paragraph, an empty one when it is not; an entity with no kind
//   or no id is its label as text; an empty text is no run; a text's first
//   link whose target may be followed is its link; quotes and lists inside
//   `RICH_TEXT_MAX_DEPTH` (8) quotes and lists are flattened to paragraphs.
// - `richTextHref` (`href.ts`), with `cleanHref` (`markdown/parse.ts`).
// - `richTextFormatVersion` (`migrate.ts`).
// - `richTextNodeText` and `isRichTextEmpty` (`text.ts`).
//
// It leaves out what does not change a drawing: the faults, the normal form's
// merged runs and key order, the fields a node does not know, and the
// migration steps, of which there are none. The web reader also parses a JSON
// string; the contract hands the member a parsed value (`PMJSONValue`), so a
// string here is not a document.

package dev.polymorph.ui

import kotlin.math.abs
import kotlin.math.floor

/** A block as RichTextContent draws it. */
internal sealed interface PMRichTextBlock {
    data class Paragraph(val content: List<PMRichTextInline>) : PMRichTextBlock

    /** `level` is the document's own, 1 to 3; the member decides the page level. */
    data class Heading(val level: Int, val content: List<PMRichTextInline>) : PMRichTextBlock

    /** A bulleted or a numbered list. Each item is its blocks, the first a paragraph. */
    data class Items(val ordered: Boolean, val start: Long, val items: List<List<PMRichTextBlock>>) : PMRichTextBlock

    data class Quote(val content: List<PMRichTextBlock>) : PMRichTextBlock

    /** `language` is null when the writer gave none. */
    data class Code(val language: String?, val text: String) : PMRichTextBlock

    /** A node this version does not draw among blocks: drawn as a paragraph of `text`, and not at all when it is empty. */
    data class Unknown(val text: String, val holdsEntity: Boolean) : PMRichTextBlock
}

/** What a paragraph's or a heading's line holds. */
internal sealed interface PMRichTextInline {
    /** A run of text with its marks. `href` is its link's target, one `PMRichTextReader.href` accepted. */
    data class Run(
        val text: String,
        val href: String? = null,
        val bold: Boolean = false,
        val italic: Boolean = false,
        val strike: Boolean = false,
        val code: Boolean = false,
    ) : PMRichTextInline

    /** A line break the writer asked for. */
    data object Break : PMRichTextInline

    data class Entity(val entity: PMRichTextEntity) : PMRichTextInline

    /** A node this version does not draw in a line: drawn as `text`. */
    data class Unknown(val text: String, val holdsEntity: Boolean) : PMRichTextInline
}

internal object PMRichTextReader {
    /** The format names this version reads: `polymorph-rich-text/` and a whole number from 1. */
    private val FORMAT = Regex("polymorph-rich-text/[1-9][0-9]*")

    /** How deep quotes and lists may nest before what is deeper is flattened (`RICH_TEXT_MAX_DEPTH`). */
    const val MAX_DEPTH = 8

    /** How deep the text of a node this version does not know is read (`NODE_TEXT_MAX_DEPTH`). */
    private const val NODE_TEXT_MAX_DEPTH = 128

    /** The largest whole number a JSON reader in JavaScript holds exactly (`Number.MAX_SAFE_INTEGER`). */
    private const val MAX_SAFE_INTEGER = 9007199254740991.0

    /** The last control character `cleanHref` removes before DEL, and DEL. */
    private const val LAST_CONTROL = 31
    private const val DELETE = 127

    /** The schemes a link may use; any other is refused. */
    private val ALLOWED_SCHEMES = setOf("http", "https", "mailto", "tel")

    /** A scheme, as RFC 3986 spells one, at the start of the target. */
    private val SCHEME = Regex("^([a-z][a-z0-9+.-]*):", RegexOption.IGNORE_CASE)

    /** A path inside the application: `/x` (not `//x` or `/\x`), `#x`, `?x`, `./x`, `../x`. */
    private val RELATIVE = Regex("""^(?:/(?![/\\])|#|\?|\.\.?/)""")

    private val LINE_ENDS = Regex("\r\n?|\n")

    private const val LINE = "\n"
    private const val NONE = ""

    private const val FORMAT_KEY = "format"
    private const val BLOCKS = "blocks"
    private const val TYPE = "type"
    private const val CONTENT = "content"
    private const val ITEMS = "items"
    private const val TEXT = "text"
    private const val LABEL = "label"
    private const val LEVEL = "level"
    private const val LANGUAGE = "language"
    private const val ORDERED = "ordered"
    private const val START = "start"
    private const val MARKS = "marks"
    private const val HREF = "href"
    private const val KIND = "kind"
    private const val ID = "id"

    private const val PARAGRAPH = "paragraph"
    private const val HEADING = "heading"
    private const val LIST = "list"
    private const val LIST_ITEM = "listItem"
    private const val BLOCKQUOTE = "blockquote"
    private const val CODE_BLOCK = "codeBlock"
    private const val TEXT_NODE = "text"
    private const val BREAK = "break"
    private const val ENTITY = "entity"
    private const val LINK = "link"
    private const val BOLD = "bold"
    private const val ITALIC = "italic"
    private const val STRIKE = "strike"
    private const val CODE = "code"

    private val BLOCK_TYPES = setOf(PARAGRAPH, HEADING, LIST, BLOCKQUOTE, CODE_BLOCK)
    private val NODE_TYPES = BLOCK_TYPES + setOf(TEXT_NODE, BREAK, ENTITY, LIST_ITEM)

    /** The arrays a node's readable text is found in, in the order they are read. */
    private val CHILD_KEYS = listOf(CONTENT, ITEMS, BLOCKS)

    /* The document ---------------------------------------------------------- */

    /**
     * The blocks of `value`: none when it is not an object with a rich-text
     * `format` and a `blocks` array. A later format is read as far as this
     * version can, as the web reads it.
     */
    fun read(value: PMJSONValue): List<PMRichTextBlock> {
        val format = (value.field(FORMAT_KEY) as? PMJSONValue.Text)?.value ?: return emptyList()
        if (!FORMAT.matches(format)) return emptyList()
        val blocks = value.field(BLOCKS) as? PMJSONValue.Array ?: return emptyList()
        return blocks(blocks.items, depth = 0)
    }

    /**
     * Whether the blocks hold nothing to read (`isRichTextEmpty`): no entity,
     * and no text but whitespace. An empty heading, list item, quote, code
     * block or line break is not content.
     */
    fun isEmpty(blocks: List<PMRichTextBlock>): Boolean = blocks.all(::blockIsEmpty)

    private fun blockIsEmpty(block: PMRichTextBlock): Boolean = when (block) {
        is PMRichTextBlock.Paragraph -> block.content.all(::inlineIsEmpty)
        is PMRichTextBlock.Heading -> block.content.all(::inlineIsEmpty)
        is PMRichTextBlock.Items -> block.items.all { item -> item.all(::blockIsEmpty) }
        is PMRichTextBlock.Quote -> block.content.all(::blockIsEmpty)
        is PMRichTextBlock.Code -> isBlank(block.text)
        is PMRichTextBlock.Unknown -> !block.holdsEntity && isBlank(block.text)
    }

    private fun inlineIsEmpty(node: PMRichTextInline): Boolean = when (node) {
        is PMRichTextInline.Run -> isBlank(node.text)
        PMRichTextInline.Break -> true
        is PMRichTextInline.Entity -> false
        is PMRichTextInline.Unknown -> !node.holdsEntity && isBlank(node.text)
    }

    /* Blocks ---------------------------------------------------------------- */

    /** `depth` is the number of quotes and lists around the blocks. */
    private fun blocks(nodes: List<PMJSONValue>, depth: Int): List<PMRichTextBlock> {
        val out = mutableListOf<PMRichTextBlock>()
        for (node in nodes) block(node, depth, out)
        return out
    }

    private fun block(node: PMJSONValue, depth: Int, out: MutableList<PMRichTextBlock>) {
        // A block that is not an object with a string type is left out.
        val type = node.type() ?: return
        when (type) {
            PARAGRAPH -> out += PMRichTextBlock.Paragraph(content(node))
            HEADING -> {
                val content = content(node)
                // A level that is not a number is no level.
                val level = (node.field(LEVEL) as? PMJSONValue.Number)?.value ?: Double.NaN
                out += when {
                    level == 1.0 || level == 2.0 || level == 3.0 -> PMRichTextBlock.Heading(level.toInt(), content)
                    isSafeInteger(level) && level > 3 -> PMRichTextBlock.Heading(3, content)
                    else -> PMRichTextBlock.Paragraph(content)
                }
            }
            CODE_BLOCK -> out += PMRichTextBlock.Code(
                language = (node.field(LANGUAGE) as? PMJSONValue.Text)?.value?.takeIf { it.isNotEmpty() },
                text = (node.field(TEXT) as? PMJSONValue.Text)?.value ?: NONE,
            )
            LIST -> {
                if (depth >= MAX_DEPTH) return flatten(node, out)
                val ordered = (node.field(ORDERED) as? PMJSONValue.Bool)?.value == true
                val start = (node.field(START) as? PMJSONValue.Number)?.value
                val first = if (ordered && start != null && isSafeInteger(start) && start >= 0) start.toLong() else 1L
                val items = node.field(ITEMS) as? PMJSONValue.Array ?: return
                val read = items(items.items, depth + 1)
                if (read.isNotEmpty()) out += PMRichTextBlock.Items(ordered, first, read)
            }
            BLOCKQUOTE -> {
                if (depth >= MAX_DEPTH) return flatten(node, out)
                val content = node.field(CONTENT) as? PMJSONValue.Array ?: return
                val read = blocks(content.items, depth + 1)
                if (read.isNotEmpty()) out += PMRichTextBlock.Quote(read)
            }
            // A node of a type this version does not know, or a known node
            // that cannot stand among blocks (a text, a list item), is kept.
            else -> out += PMRichTextBlock.Unknown(nodeText(node), holdsEntity(node))
        }
    }

    /**
     * A list's items. An item that is not a list item is kept as an item's
     * content, and an item whose first block is not a paragraph starts with an
     * empty one, as `readItems` writes them.
     */
    private fun items(nodes: List<PMJSONValue>, depth: Int): List<List<PMRichTextBlock>> = nodes.mapNotNull { node ->
        val type = node.type() ?: return@mapNotNull null
        val content = mutableListOf<PMRichTextBlock>()
        if (type == LIST_ITEM) {
            (node.field(CONTENT) as? PMJSONValue.Array)?.let { content += blocks(it.items, depth) }
        } else {
            block(node, depth, content)
        }
        if (content.firstOrNull() !is PMRichTextBlock.Paragraph) content.add(0, PMRichTextBlock.Paragraph(emptyList()))
        content
    }

    /**
     * The blocks of a quote or list that sits too deep, as paragraphs: each
     * paragraph and heading a paragraph of its line, each code block a
     * paragraph of its lines, and a node this version does not know kept.
     * The walk keeps its own stack, so a document nested thousands deep is
     * read without recursion.
     */
    private fun flatten(container: PMJSONValue, out: MutableList<PMRichTextBlock>) {
        val stack = ArrayDeque<PMJSONValue>().apply { addLast(container) }
        while (stack.isNotEmpty()) {
            val node = stack.removeLast()
            val type = node.type() ?: continue
            when (type) {
                LIST, BLOCKQUOTE, LIST_ITEM -> {
                    val children = node.field(if (type == LIST) ITEMS else CONTENT) as? PMJSONValue.Array
                    children?.items?.asReversed()?.forEach { stack.addLast(it) }
                }
                PARAGRAPH, HEADING -> out += PMRichTextBlock.Paragraph(content(node))
                CODE_BLOCK -> out += linesParagraph((node.field(TEXT) as? PMJSONValue.Text)?.value ?: NONE)
                else -> out += PMRichTextBlock.Unknown(nodeText(node), holdsEntity(node))
            }
        }
    }

    /** A code block's text as a paragraph, each line after the first on a line break (`paragraphOfLines`). */
    private fun linesParagraph(text: String): PMRichTextBlock.Paragraph {
        val content = mutableListOf<PMRichTextInline>()
        text.split(LINE_ENDS).forEachIndexed { index, line ->
            if (index > 0) content += PMRichTextInline.Break
            if (line.isNotEmpty()) content += PMRichTextInline.Run(line)
        }
        return PMRichTextBlock.Paragraph(content)
    }

    /* Lines ----------------------------------------------------------------- */

    /** A paragraph's or a heading's line; one with no content list is empty. */
    private fun content(node: PMJSONValue): List<PMRichTextInline> =
        (node.field(CONTENT) as? PMJSONValue.Array)?.let { inlines(it.items) } ?: emptyList()

    private fun inlines(nodes: List<PMJSONValue>): List<PMRichTextInline> {
        val out = mutableListOf<PMRichTextInline>()
        for (node in nodes) {
            // A node that is not an object with a string type is left out.
            val type = node.type() ?: continue
            when (type) {
                TEXT_NODE -> {
                    val text = (node.field(TEXT) as? PMJSONValue.Text)?.value ?: continue
                    if (text.isNotEmpty()) out += run(text, node.field(MARKS))
                }
                ENTITY -> {
                    val kind = word(node.field(KIND))
                    val id = word(node.field(ID))
                    val label = word(node.field(LABEL))
                    if (kind != null && id != null && label != null) {
                        out += PMRichTextInline.Entity(PMRichTextEntity(kind = kind, id = id, label = label))
                    } else if (label != null) {
                        out += PMRichTextInline.Run(label)
                    }
                }
                BREAK -> out += PMRichTextInline.Break
                else -> out += PMRichTextInline.Unknown(nodeText(node), holdsEntity(node))
            }
        }
        return out
    }

    /**
     * A run with the marks this version draws. A mark it does not know draws
     * nothing. The first link whose target may be followed is the run's link;
     * a link with no target, or one that may not be followed, is removed and
     * its text kept.
     */
    private fun run(text: String, marks: PMJSONValue?): PMRichTextInline.Run {
        var link: String? = null
        val types = mutableSetOf<String>()
        for (mark in (marks as? PMJSONValue.Array)?.items.orEmpty()) {
            val type = mark.type() ?: continue
            if (type == LINK) {
                if (link == null) link = (mark.field(HREF) as? PMJSONValue.Text)?.value?.let { href(it) }
            } else {
                types += type
            }
        }
        return PMRichTextInline.Run(text, link, BOLD in types, ITALIC in types, STRIKE in types, CODE in types)
    }

    /* Links ----------------------------------------------------------------- */

    /**
     * The target a link may point at, cleaned, or null when it may not be
     * followed (`richTextHref`). Control characters are removed and the ends
     * trimmed first, as a browser reads the target. Then `http`, `https`,
     * `mailto` and `tel` pass, any other scheme is refused, and a target with
     * no scheme passes only as a path inside the application: `/x` (not `//x`
     * or `/\x`, which a browser reads as another host), `#x`, `?x`, `./x`,
     * `../x`. A stored target is never rewritten, so a bare domain is refused.
     */
    fun href(raw: String): String? {
        val cleaned = trim(raw.filter { it.code > LAST_CONTROL && it.code != DELETE })
        if (cleaned.isEmpty()) return null
        val scheme = SCHEME.find(cleaned)
        if (scheme != null) return if (scheme.groupValues[1].lowercase() in ALLOWED_SCHEMES) cleaned else null
        return if (RELATIVE.containsMatchIn(cleaned)) cleaned else null
    }

    /* The text found in a node ---------------------------------------------- */

    /**
     * The readable text of any node (`richTextNodeText`): a known node's own
     * text (a text node's text, an entity's label, a line break, a code
     * block's text, and the text of what a paragraph, heading, list, list item
     * or quote holds); any other node's `text` when it is a string, else its
     * `label`, else the text of the nodes in its `content`, `items` and
     * `blocks` arrays, a line break between a block and its neighbours.
     */
    fun nodeText(node: PMJSONValue): String = text(node, 0)

    private fun text(node: PMJSONValue, depth: Int): String {
        if (node !is PMJSONValue.Object || depth >= NODE_TEXT_MAX_DEPTH) return NONE
        val type = node.type()
        return if (type != null && type in NODE_TYPES) knownText(node, type, depth + 1) else foundText(node, depth + 1)
    }

    private fun knownText(node: PMJSONValue, type: String, depth: Int): String = when (type) {
        TEXT_NODE, CODE_BLOCK -> (node.field(TEXT) as? PMJSONValue.Text)?.value ?: NONE
        ENTITY -> (node.field(LABEL) as? PMJSONValue.Text)?.value ?: NONE
        BREAK -> LINE
        PARAGRAPH, HEADING -> children(node, CONTENT).joinToString(NONE) { text(it, depth) }
        LIST -> children(node, ITEMS).joinToString(LINE) { text(it, depth) }
        // A list item and a quote: their blocks. A known block with no text
        // still stands for a line; an unknown one with none adds nothing.
        else -> children(node, CONTENT)
            .mapNotNull { block -> text(block, depth).takeIf { it.isNotEmpty() || isKnownBlock(block) } }
            .joinToString(LINE)
    }

    private fun foundText(node: PMJSONValue, depth: Int): String {
        (node.field(TEXT) as? PMJSONValue.Text)?.let { return it.value }
        (node.field(LABEL) as? PMJSONValue.Text)?.let { return it.value }
        val out = StringBuilder()
        var previousBlock = false
        var first = true
        for (key in CHILD_KEYS) {
            for (child in children(node, key)) {
                val piece = text(child, depth)
                if (piece.isEmpty()) continue
                val block = isBlockLike(child)
                if (!first && (block || previousBlock)) out.append(LINE)
                out.append(piece)
                previousBlock = block
                first = false
            }
        }
        return out.toString()
    }

    /** Whether a node is a block in the text's sense: a known block or list item, or a node that holds children. */
    private fun isBlockLike(node: PMJSONValue): Boolean {
        val type = node.type() ?: return false
        return type in BLOCK_TYPES || type == LIST_ITEM || CHILD_KEYS.any { node.field(it) is PMJSONValue.Array }
    }

    private fun isKnownBlock(node: PMJSONValue): Boolean = node.type().let { it != null && (it in BLOCK_TYPES || it == LIST_ITEM) }

    /**
     * Whether a node holds an entity a reader sees (`richTextEntities`): one
     * with a kind, an id and a label. A node whose text is its own `text` or
     * `label` holds no other text, so it holds no such entity.
     */
    private fun holdsEntity(node: PMJSONValue, depth: Int = 0): Boolean {
        if (node !is PMJSONValue.Object || depth >= NODE_TEXT_MAX_DEPTH) return false
        if (node.type() == ENTITY) {
            return word(node.field(KIND)) != null && word(node.field(ID)) != null && word(node.field(LABEL)) != null
        }
        if (node.field(TEXT) is PMJSONValue.Text || node.field(LABEL) is PMJSONValue.Text) return false
        return CHILD_KEYS.any { key -> children(node, key).any { holdsEntity(it, depth + 1) } }
    }

    /* JSON ------------------------------------------------------------------ */

    /**
     * The object's member `key`, or null when it is not an object or holds
     * none. The last of two members with one key is the one read, as a JSON
     * parser keeps it.
     */
    private fun PMJSONValue.field(key: String): PMJSONValue? =
        (this as? PMJSONValue.Object)?.members?.lastOrNull { it.key == key }?.value

    /** The node's `type` when it is an object with a string type, otherwise null. */
    private fun PMJSONValue.type(): String? = (field(TYPE) as? PMJSONValue.Text)?.value

    private fun children(node: PMJSONValue, key: String): List<PMJSONValue> =
        (node.field(key) as? PMJSONValue.Array)?.items.orEmpty()

    /** A string that is not empty, or null. */
    private fun word(value: PMJSONValue?): String? = (value as? PMJSONValue.Text)?.value?.takeIf { it.isNotEmpty() }

    private fun isSafeInteger(value: Double): Boolean =
        value.isFinite() && value == floor(value) && abs(value) <= MAX_SAFE_INTEGER

    /**
     * Whether JavaScript's `trim` removes `c`: Kotlin's whitespace less the
     * separators U+001C to U+001F, which JavaScript keeps, and the byte order
     * mark, which it removes.
     */
    private fun isSpace(c: Char): Boolean = (c.isWhitespace() && c !in '\u001C'..'\u001F') || c == '﻿'

    /** Whether a text is whitespace alone, as `text.trim() === ''` decides. */
    fun isBlank(text: String): Boolean = text.all(::isSpace)

    /** A text without the whitespace at its ends, as JavaScript's `trim` removes it. */
    fun trim(text: String): String = text.trim(::isSpace)
}
