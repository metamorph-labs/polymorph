package dev.polymorph.ui

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * RichTextContent's reader (`PMRichTextReader`), held to the web reader's own
 * cases where they decide what is drawn (`packages/engine/rich-text.test.ts`,
 * `rich-text-text.test.ts` and `rich-text-href.test.ts`), so a stored document
 * draws the same blocks on every platform. The web's normal form merges
 * neighbouring runs with the same marks; this reader keeps them apart, which
 * draws the same line, so a case that merges runs on the web expects them
 * apart here.
 */
class RichTextReaderTest {
    /* The document's JSON, as the web tests write it. */

    private fun doc(vararg blocks: Any?): PMJSONValue =
        PMJSONValue.of(mapOf("format" to "polymorph-rich-text/1", "blocks" to blocks.toList()))

    private fun p(vararg content: Any?) = mapOf("type" to "paragraph", "content" to content.toList())

    private fun t(text: String, vararg marks: Any?): Map<String, Any?> =
        if (marks.isEmpty()) mapOf("type" to "text", "text" to text) else mapOf("type" to "text", "text" to text, "marks" to marks.toList())

    private val bold = mapOf("type" to "bold")
    private val italic = mapOf("type" to "italic")
    private val strike = mapOf("type" to "strike")
    private val code = mapOf("type" to "code")
    private val br = mapOf("type" to "break")
    private val ada = mapOf("type" to "entity", "kind" to "user", "id" to "u_ada", "label" to "@Ada Lovelace")

    private fun link(href: String) = mapOf("type" to "link", "href" to href)

    private fun heading(level: Any?, vararg content: Any?) = mapOf("type" to "heading", "level" to level, "content" to content.toList())

    private fun quote(vararg content: Any?) = mapOf("type" to "blockquote", "content" to content.toList())

    private fun item(vararg content: Any?) = mapOf("type" to "listItem", "content" to content.toList())

    private fun list(ordered: Any?, vararg items: Any?) = mapOf("type" to "list", "ordered" to ordered, "items" to items.toList())

    private fun codeBlock(text: Any?, language: Any? = null) =
        if (language == null) mapOf("type" to "codeBlock", "text" to text) else mapOf("type" to "codeBlock", "language" to language, "text" to text)

    private fun read(vararg blocks: Any?) = PMRichTextReader.read(doc(*blocks))

    /* What the reader gives. */

    private fun para(vararg content: PMRichTextInline) = PMRichTextBlock.Paragraph(content.toList())

    private fun run(text: String) = PMRichTextInline.Run(text)

    private val adaEntity = PMRichTextInline.Entity(PMRichTextEntity(kind = "user", id = "u_ada", label = "@Ada Lovelace"))

    @Test
    fun readsEveryNodeThisVersionWrites() {
        val blocks = read(
            heading(1, t("Release notes")),
            p(
                t("Thanks "),
                ada,
                t(" for "),
                t("the fix", link("https://a.example/1"), bold),
                br,
                t("see ", italic, strike),
                t("retry()", code),
            ),
            heading(2),
            mapOf(
                "type" to "list",
                "ordered" to true,
                "start" to 3,
                "items" to listOf(item(p(t("Third")), list(false, item(p(t("nested"))))), item(p())),
            ),
            quote(heading(3, t("Quoted")), codeBlock("const a = 1\n\nconst b = 2", "ts")),
        )
        assertEquals(
            listOf(
                PMRichTextBlock.Heading(1, listOf(run("Release notes"))),
                para(
                    run("Thanks "),
                    adaEntity,
                    run(" for "),
                    PMRichTextInline.Run("the fix", href = "https://a.example/1", bold = true),
                    PMRichTextInline.Break,
                    PMRichTextInline.Run("see ", italic = true, strike = true),
                    PMRichTextInline.Run("retry()", code = true),
                ),
                PMRichTextBlock.Heading(2, emptyList()),
                PMRichTextBlock.Items(
                    ordered = true,
                    start = 3,
                    items = listOf(
                        listOf(para(run("Third")), PMRichTextBlock.Items(false, 1, listOf(listOf(para(run("nested")))))),
                        listOf(para()),
                    ),
                ),
                PMRichTextBlock.Quote(
                    listOf(
                        PMRichTextBlock.Heading(3, listOf(run("Quoted"))),
                        PMRichTextBlock.Code("ts", "const a = 1\n\nconst b = 2"),
                    ),
                ),
            ),
            blocks,
        )
    }

    @Test
    fun readsAnythingThatIsNotADocumentAsNoBlocks() {
        val notDocuments = listOf<Any?>(
            null,
            0,
            42,
            true,
            "not json",
            // The contract hands over a parsed value, so a string is not read as JSON.
            """{"format":"polymorph-rich-text/1","blocks":[]}""",
            emptyList<Any>(),
            listOf(mapOf("format" to "polymorph-rich-text/1", "blocks" to listOf(p(t("x"))))),
            emptyMap<String, Any>(),
            mapOf("blocks" to emptyList<Any>()),
            mapOf("format" to "markdown", "blocks" to listOf(p(t("x")))),
            mapOf("format" to "polymorph-rich-text/0", "blocks" to listOf(p(t("x")))),
            mapOf("format" to "polymorph-rich-text/1.5", "blocks" to listOf(p(t("x")))),
            mapOf("format" to "polymorph-rich-text/1"),
            mapOf("format" to "polymorph-rich-text/1", "blocks" to emptyMap<String, Any>()),
            mapOf("format" to "polymorph-rich-text/1", "blocks" to "p"),
        )
        for (input in notDocuments) {
            val blocks = PMRichTextReader.read(PMJSONValue.of(input))
            assertEquals(emptyList(), blocks, "$input")
            assertTrue(PMRichTextReader.isEmpty(blocks), "$input")
        }
    }

    @Test
    fun readsALaterFormatAsFarAsItCan() {
        val later = PMJSONValue.of(
            mapOf("format" to "polymorph-rich-text/2", "blocks" to listOf(p(t("known")), mapOf("type" to "table", "rows" to emptyList<Any>()))),
        )
        assertEquals(listOf(para(run("known")), PMRichTextBlock.Unknown("", holdsEntity = false)), PMRichTextReader.read(later))
    }

    @Test
    fun repairsAKnownBlockWhereTheRepairIsCertain() {
        val cases: List<Pair<Any, List<PMRichTextBlock>>> = listOf(
            heading(5, t("h")) to listOf(PMRichTextBlock.Heading(3, listOf(run("h")))),
            heading(0, t("h")) to listOf(para(run("h"))),
            heading(null, t("h")) to listOf(para(run("h"))),
            heading("2", t("h")) to listOf(para(run("h"))),
            heading(2.5, t("h")) to listOf(para(run("h"))),
            mapOf("type" to "paragraph") to listOf(para()),
            mapOf("type" to "paragraph", "content" to "text") to listOf(para()),
            mapOf("type" to "list", "items" to listOf(item(p(t("x"))))) to
                listOf(PMRichTextBlock.Items(false, 1, listOf(listOf(para(run("x")))))),
            mapOf("type" to "list", "ordered" to true, "start" to -1, "items" to listOf(item(p(t("x"))))) to
                listOf(PMRichTextBlock.Items(true, 1, listOf(listOf(para(run("x")))))),
            mapOf("type" to "list", "ordered" to true, "start" to 2.5, "items" to listOf(item(p(t("x"))))) to
                listOf(PMRichTextBlock.Items(true, 1, listOf(listOf(para(run("x")))))),
            mapOf("type" to "list", "ordered" to true, "start" to "3", "items" to listOf(item(p(t("x"))))) to
                listOf(PMRichTextBlock.Items(true, 1, listOf(listOf(para(run("x")))))),
            mapOf("type" to "list", "ordered" to true, "start" to 0, "items" to listOf(item(p(t("x"))))) to
                listOf(PMRichTextBlock.Items(true, 0, listOf(listOf(para(run("x")))))),
            mapOf("type" to "list", "ordered" to false, "start" to 3, "items" to listOf(item(p(t("x"))))) to
                listOf(PMRichTextBlock.Items(false, 1, listOf(listOf(para(run("x")))))),
            mapOf("type" to "list", "ordered" to false) to emptyList(),
            list(false) to emptyList(),
            list(false, mapOf("type" to "listItem")) to listOf(PMRichTextBlock.Items(false, 1, listOf(listOf(para())))),
            mapOf("type" to "blockquote", "content" to "q") to emptyList(),
            quote() to emptyList(),
            mapOf("type" to "codeBlock") to listOf(PMRichTextBlock.Code(null, "")),
            codeBlock("x", language = 5) to listOf(PMRichTextBlock.Code(null, "x")),
            codeBlock("x", language = "") to listOf(PMRichTextBlock.Code(null, "x")),
        )
        for ((block, blocks) in cases) assertEquals(blocks, read(block), "$block")
    }

    @Test
    fun repairsOrDropsAKnownInline() {
        val blocks = read(
            p(
                t("a"),
                mapOf("type" to "text"),
                mapOf("type" to "text", "text" to 5),
                mapOf("type" to "entity", "label" to "@Ada"),
                mapOf("type" to "entity", "kind" to "user", "id" to "u"),
                mapOf("type" to "entity", "kind" to "user", "id" to "u", "label" to "@Grace"),
                mapOf("type" to "text", "text" to "b", "marks" to "bold"),
                t("c", null, "bold", listOf("bold"), mapOf("type" to "link"), mapOf("href" to "/x")),
                t("d", link("/one"), link("/two")),
                t(""),
            ),
        )
        assertEquals(
            listOf(
                para(
                    run("a"),
                    run("@Ada"),
                    PMRichTextInline.Entity(PMRichTextEntity(kind = "user", id = "u", label = "@Grace")),
                    run("b"),
                    run("c"),
                    PMRichTextInline.Run("d", href = "/one"),
                ),
            ),
            blocks,
        )
    }

    @Test
    fun dropsWhatIsNotANodeWhereverOneIsExpected() {
        val blocks = read(
            null,
            7,
            "paragraph",
            listOf(p(t("in an array"))),
            mapOf("content" to emptyList<Any>()),
            p(null, listOf("text"), t("ok")),
            list(false, null, listOf(item(p())), item(p(t("i")))),
        )
        assertEquals(listOf(para(run("ok")), PMRichTextBlock.Items(false, 1, listOf(listOf(para(run("i")))))), blocks)
    }

    @Test
    fun keepsANodeInAListThatIsNotAListItemAsTheContentOfOne() {
        val callout = mapOf("type" to "callout", "content" to listOf(p(t("Heads up"))))
        val blocks = read(list(false, p(t("plain")), callout, item(p(t("real")))))
        assertEquals(
            listOf(
                PMRichTextBlock.Items(
                    false,
                    1,
                    listOf(
                        listOf(para(run("plain"))),
                        listOf(para(), PMRichTextBlock.Unknown("Heads up", holdsEntity = false)),
                        listOf(para(run("real"))),
                    ),
                ),
            ),
            blocks,
        )
    }

    @Test
    fun drawsANodeItDoesNotKnowAsTheTextFoundInIt() {
        val blocks = read(
            mapOf("type" to "callout", "tone" to "warning", "content" to listOf(t("Deliveries pause."))),
            mapOf("type" to "divider"),
            t("a text among blocks"),
            item(p(t("an item among blocks"))),
            p(t("on "), mapOf("type" to "date", "value" to "2026-12-04", "label" to "Friday"), t("."), p(t("a paragraph in a line"))),
            p(t("kept", mapOf("type" to "highlight", "colour" to "yellow"), bold)),
            mapOf("type" to "callout", "content" to listOf(p(ada))),
        )
        assertEquals(
            listOf(
                PMRichTextBlock.Unknown("Deliveries pause.", holdsEntity = false),
                PMRichTextBlock.Unknown("", holdsEntity = false),
                PMRichTextBlock.Unknown("a text among blocks", holdsEntity = false),
                PMRichTextBlock.Unknown("an item among blocks", holdsEntity = false),
                para(
                    run("on "),
                    PMRichTextInline.Unknown("Friday", holdsEntity = false),
                    run("."),
                    PMRichTextInline.Unknown("a paragraph in a line", holdsEntity = false),
                ),
                para(PMRichTextInline.Run("kept", bold = true)),
                PMRichTextBlock.Unknown("@Ada Lovelace", holdsEntity = true),
            ),
            blocks,
        )
    }

    /* The text found in a node (`richTextNodeText`) --------------------------- */

    private fun text(node: Any?) = PMRichTextReader.nodeText(PMJSONValue.of(node))

    @Test
    fun readsTextThenLabelThenTheChildren() {
        assertEquals("own", text(mapOf("type" to "x", "text" to "own", "label" to "not this", "content" to listOf(t("nor this")))))
        assertEquals("label", text(mapOf("type" to "x", "label" to "label", "content" to listOf(t("not this")))))
        assertEquals("ab", text(mapOf("type" to "x", "content" to listOf(t("a"), t("b")))))
        assertEquals("123", text(mapOf("type" to "x", "blocks" to listOf(t("3")), "items" to listOf(t("2")), "content" to listOf(t("1")))))
    }

    @Test
    fun separatesTheBlocksFoundInANodeAndJoinsTheInlines() {
        val cell = { content: Any -> mapOf("type" to "cell", "content" to listOf(content)) }
        val table = mapOf(
            "type" to "table",
            "rows" to "not read",
            "blocks" to listOf(
                mapOf("type" to "row", "content" to listOf(cell(p(t("a"))), cell(p(t("b"))))),
                mapOf("type" to "row", "content" to listOf(cell(p(t("c"), br, t("d"))))),
            ),
        )
        assertEquals("a\nb\nc\nd", text(table))
        assertEquals("ab\nc", text(mapOf("type" to "x", "content" to listOf(t("a"), mapOf("type" to "y", "label" to "b"), codeBlock("c")))))
    }

    @Test
    fun readsAKnownNodeAsItsOwnText() {
        assertEquals("a@Ada Lovelace", text(p(t("a"), ada)))
        assertEquals("\n", text(br))
        assertEquals("a\nb", text(list(true, item(p(t("a"))), item(p(t("b"))))))
        assertEquals("a\n\nb", text(quote(p(t("a")), p(), mapOf("type" to "divider"), p(t("b")))))
    }

    @Test
    fun findsNothingInWhatIsNotANode() {
        for (value in listOf(null, "text", 42, listOf(t("a")), mapOf("type" to "x", "content" to "a"), mapOf("type" to "x"))) {
            assertEquals("", text(value), "$value")
        }
    }

    @Test
    fun stopsReadingANodeAtDepth() {
        var deep: PMJSONValue = PMJSONValue.of(t("bottom"))
        repeat(100_000) { deep = node("x", "content", listOf(deep)) }
        assertEquals("", PMRichTextReader.nodeText(deep))
    }

    /** A node of `type` whose `key` holds `children`, built without recursion. */
    private fun node(type: String, key: String, children: List<PMJSONValue>) = PMJSONValue.Object(
        listOf(PMJSONMember("type", PMJSONValue.Text(type)), PMJSONMember(key, PMJSONValue.Array(children))),
    )

    /* Depth ----------------------------------------------------------------- */

    /** `count` quotes inside each other around `inner`. */
    private fun nested(count: Int, inner: Any): Any {
        var node = inner
        repeat(count) { node = quote(node) }
        return node
    }

    /** How many quotes deep the first block is, and the blocks there. */
    private fun innermost(blocks: List<PMRichTextBlock>): Pair<Int, List<PMRichTextBlock>> {
        var depth = 0
        var current = blocks
        while (current.firstOrNull() is PMRichTextBlock.Quote) {
            depth += 1
            current = (current.first() as PMRichTextBlock.Quote).content
        }
        return depth to current
    }

    @Test
    fun keepsEightQuotesInsideEachOther() {
        val (depth, inside) = innermost(read(nested(PMRichTextReader.MAX_DEPTH, p(t("deep")))))
        assertEquals(PMRichTextReader.MAX_DEPTH, depth)
        assertEquals(listOf(para(run("deep"))), inside)
    }

    @Test
    fun flattensAQuoteInsideThemToParagraphsOfItsText() {
        val inner = quote(
            heading(1, t("Title")),
            p(t("mention "), mapOf("type" to "entity", "kind" to "user", "id" to "u", "label" to "@U")),
            codeBlock("a\nb"),
            list(false, item(p(t("one")), quote(p(t("two"))))),
            mapOf("type" to "callout", "text" to "kept"),
        )
        val (depth, inside) = innermost(read(nested(PMRichTextReader.MAX_DEPTH, inner)))
        assertEquals(PMRichTextReader.MAX_DEPTH, depth)
        assertEquals(
            listOf(
                para(run("Title")),
                para(run("mention "), PMRichTextInline.Entity(PMRichTextEntity(kind = "user", id = "u", label = "@U"))),
                para(run("a"), PMRichTextInline.Break, run("b")),
                para(run("one")),
                para(run("two")),
                PMRichTextBlock.Unknown("kept", holdsEntity = false),
            ),
            inside,
        )
    }

    @Test
    fun countsAListAndItsItemAsOneLevelAsAQuoteIs() {
        val wrap = { inner: Any -> list(false, item(p(t("x")), inner)) }
        var node: Any = p(t("leaf"))
        repeat(PMRichTextReader.MAX_DEPTH) { node = wrap(node) }
        /** How many lists deep the leaf is, following each first item's last block. */
        fun lists(blocks: List<PMRichTextBlock>): Int {
            val list = blocks.firstOrNull() as? PMRichTextBlock.Items ?: return 0
            return 1 + lists(list.items.first().drop(1))
        }
        assertEquals(PMRichTextReader.MAX_DEPTH, lists(read(node)))
        // One more list is flattened to paragraphs of its text.
        val deeper = read(wrap(node))
        assertEquals(PMRichTextReader.MAX_DEPTH, lists(deeper))
    }

    @Test
    fun readsADocumentNestedAHundredThousandDeepWithoutRecursingIntoIt() {
        var deep: PMJSONValue = PMJSONValue.of(p(t("deep")))
        repeat(100_000) { deep = node("blockquote", "content", listOf(deep)) }
        val document = PMJSONValue.Object(
            listOf(PMJSONMember("format", PMJSONValue.Text("polymorph-rich-text/1")), PMJSONMember("blocks", PMJSONValue.Array(listOf(deep)))),
        )
        val (depth, inside) = innermost(PMRichTextReader.read(document))
        assertEquals(PMRichTextReader.MAX_DEPTH, depth)
        assertEquals(listOf(para(run("deep"))), inside)
    }

    /* Links (`richTextHref`) -------------------------------------------------- */

    /** Targets written to get past a check: schemes split by what a browser ignores, other hosts dressed as paths. */
    private val hostile = listOf(
        "javascript:alert(1)",
        "JavaScript:alert(1)",
        " javascript:alert(1)",
        "\tjavascript:alert(1)",
        "\njavascript:alert(1)",
        "\u0001 javascript:alert(1)",
        " \u0002\t javascript:alert(1)",
        "java\tscript:alert(1)",
        "java\nscript:alert(1)",
        "jav\u0000ascript:alert(1)",
        "javascript\u0000:alert(1)",
        "\u00A0javascript:alert(1)",
        "\u3000javascript:alert(1)",
        "\uFEFFjavascript:alert(1)",
        "vbscript:msgbox(1)",
        "data:text/html,<script>alert(1)</script>",
        "blob:https://app.example/1",
        "file:///etc/passwd",
        "ftp://files.example/x",
        "about:blank",
        "//evil.example/x",
        "\\\\evil.example/x",
        "/\\evil.example/x",
        "\\/evil.example/x",
        "/\t/evil.example/x",
        " //evil.example/x",
        "evil.example/x",
        "x:y",
        ":nothing",
    )

    @Test
    fun acceptsTheWebMailAndTelephoneSchemesInAnyCase() {
        for (href in listOf(
            "https://a.example/x?y=1#z",
            "http://a.example",
            "HTTPS://A.EXAMPLE/",
            "mailto:ada@a.example",
            "MailTo:ada@a.example?subject=hi",
            "tel:+44 20 7946 0000",
        )) {
            assertEquals(href, PMRichTextReader.href(href), href)
        }
    }

    @Test
    fun acceptsAPathInsideTheApplication() {
        for (href in listOf("/", "/issues/42", "#section", "?tab=2", "./sibling", "../parent", "/a:b")) {
            assertEquals(href, PMRichTextReader.href(href), href)
        }
    }

    @Test
    fun refusesEveryOtherSchemeATargetABrowserReadsAsAnotherHostAndNothingToFollow() {
        for (href in hostile + listOf("", "   ", "\u0000\u0001", "word", "page.html", ".", "..")) {
            assertNull(PMRichTextReader.href(href), href)
        }
    }

    @Test
    fun keepsTheTargetAsABrowserReadsIt() {
        assertEquals("https://a.example/x", PMRichTextReader.href("  https://a.example/x\n"))
        assertEquals("https://a.example/x", PMRichTextReader.href("https://a.exa\tmple/x"))
        assertEquals("/issues/1", PMRichTextReader.href("\u0001/issues/1"))
    }

    @Test
    fun drawsALinkThatMayNotBeFollowedAsItsText() {
        val blocks = read(
            p(
                t("click", link("javascript:alert(1)")),
                t("away", link("//evil.example")),
                t("fine", link(" https://a.example ")),
                t("first", link("data:x"), link("/second")),
                t("none", mapOf("type" to "link", "href" to 5)),
            ),
        )
        assertEquals(
            listOf(
                para(
                    run("click"),
                    run("away"),
                    PMRichTextInline.Run("fine", href = "https://a.example"),
                    PMRichTextInline.Run("first", href = "/second"),
                    run("none"),
                ),
            ),
            blocks,
        )
    }

    /* Annotations ------------------------------------------------------------ */

    private fun annotation(id: Any?) = mapOf("type" to "annotation", "id" to id)

    @Test
    fun keepsATextsAnnotationsOncePerIdOrderedById() {
        val blocks = read(
            p(
                t("both", annotation("thread-b"), bold, annotation("thread-a"), annotation("thread-b")),
                t("linked", link("/x"), annotation("thread-a")),
            ),
        )
        assertEquals(
            listOf(
                para(
                    PMRichTextInline.Run("both", bold = true, annotations = listOf("thread-a", "thread-b")),
                    PMRichTextInline.Run("linked", href = "/x", annotations = listOf("thread-a")),
                ),
            ),
            blocks,
        )
    }

    @Test
    fun dropsAnAnnotationWithNoId() {
        val blocks = read(p(t("kept", annotation(null), annotation(""), annotation(5), mapOf("type" to "annotation"), annotation("thread-a"))))
        assertEquals(listOf(para(PMRichTextInline.Run("kept", annotations = listOf("thread-a")))), blocks)
    }

    @Test
    fun keepsAnEntitysAnnotationsAndUnknownMarksAndDropsItsFormats() {
        val highlight = mapOf("type" to "highlight", "colour" to "yellow")
        val blocks = read(
            p(
                ada + mapOf("marks" to listOf(annotation("thread-b"), bold, highlight, link("/x"), annotation("thread-a"), annotation(""), highlight)),
                ada + mapOf("marks" to "bold"),
                mapOf("type" to "entity", "label" to "@Ada", "marks" to listOf(annotation("thread-a"))),
            ),
        )
        val marks = listOf(PMJSONValue.of(highlight), PMJSONValue.of(annotation("thread-a")), PMJSONValue.of(annotation("thread-b")))
        assertEquals(
            listOf(
                para(
                    PMRichTextInline.Entity(
                        PMRichTextEntity(kind = "user", id = "u_ada", label = "@Ada Lovelace", marks = marks),
                        listOf("thread-a", "thread-b"),
                    ),
                    adaEntity,
                    // An entity with no kind or id is its label as text, with no mark.
                    run("@Ada"),
                ),
            ),
            blocks,
        )
    }

    @Test
    fun keepsAnnotationsInWhatItFlattens() {
        val (_, inside) = innermost(read(nested(PMRichTextReader.MAX_DEPTH, quote(p(t("deep", annotation("thread-a")))))))
        assertEquals(listOf(para(PMRichTextInline.Run("deep", annotations = listOf("thread-a")))), inside)
    }

    @Test
    fun ordersAnEntitysMarksAsTheNormalFormDoes() {
        // The order and the copies are the engine's own `normalizeRichText` gives for these marks.
        val entity = { marks: List<Any?> ->
            val blocks = read(p(mapOf("type" to "entity", "kind" to "user", "id" to "u", "label" to "@U", "marks" to marks)))
            ((blocks.single() as PMRichTextBlock.Paragraph).content.single() as PMRichTextInline.Entity).entity.marks
        }
        assertEquals(
            listOf(
                linkedMapOf("type" to "Zeta", "n" to 100),
                linkedMapOf("type" to "highlight", "b" to 1.5e21, "colour" to "yellow"),
                linkedMapOf("type" to "highlight", "colour" to "red"),
                linkedMapOf("type" to "zeta"),
                linkedMapOf("type" to "annotation", "id" to "a"),
                linkedMapOf("type" to "annotation", "id" to "b", "at" to linkedMapOf("a" to listOf(5e-7, "q\"\u0001"), "z" to 1), "resolved" to true),
            ).map { PMJSONValue.of(it) },
            entity(
                listOf(
                    mapOf("type" to "zeta"),
                    linkedMapOf("colour" to "yellow", "type" to "highlight", "b" to 1.5e21),
                    linkedMapOf("type" to "annotation", "id" to "b", "resolved" to true, "at" to linkedMapOf("z" to 1, "a" to listOf(5e-7, "q\"\u0001"))),
                    mapOf("type" to "highlight", "colour" to "red"),
                    bold,
                    mapOf("type" to "zeta"),
                    annotation("a"),
                    linkedMapOf("id" to "a", "type" to "annotation", "extra" to 1),
                    mapOf("type" to "Zeta", "n" to 100),
                ),
            ),
        )
        // Ordered by their JSON as JavaScript writes it: a number's shortest digits, `1e+21` and
        // `1e-7` with an exponent, and a quote and a control character escaped.
        assertEquals(
            listOf(
                mapOf("type" to "m", "v" to 1.5),
                mapOf("type" to "m", "v" to 1e21),
                mapOf("type" to "m", "v" to 1e-7),
                mapOf("type" to "m", "v" to 2),
                mapOf("type" to "q", "s" to "q#"),
                mapOf("type" to "q", "s" to "q\"x"),
                mapOf("type" to "q", "s" to "q\u0001"),
            ).map { PMJSONValue.of(it) },
            entity(
                listOf(
                    mapOf("type" to "m", "v" to 2),
                    mapOf("type" to "q", "s" to "q\u0001"),
                    mapOf("type" to "m", "v" to 1e21),
                    mapOf("type" to "q", "s" to "q\"x"),
                    mapOf("type" to "m", "v" to 1e-7),
                    mapOf("type" to "q", "s" to "q#"),
                    mapOf("type" to "m", "v" to 1.5),
                ),
            ),
        )
    }

    /* Emphasis a heading and inline code do not carry ------------------------- */

    @Test
    fun dropsBoldItalicAndStrikeFromAHeadingsTextAndKeepsTheRest() {
        val highlight = mapOf("type" to "highlight")
        val blocks = read(
            heading(
                2,
                t("Big ", bold, italic, strike),
                t("call()", code, bold),
                t(" and ", strike),
                t("docs", link("/docs"), bold, annotation("c1"), highlight),
                mapOf("type" to "entity", "kind" to "user", "id" to "u", "label" to "@U", "marks" to listOf(bold, annotation("c1"))),
            ),
        )
        assertEquals(
            listOf(
                PMRichTextBlock.Heading(
                    2,
                    listOf(
                        run("Big "),
                        PMRichTextInline.Run("call()", code = true),
                        run(" and "),
                        PMRichTextInline.Run("docs", href = "/docs", annotations = listOf("c1")),
                        PMRichTextInline.Entity(
                            PMRichTextEntity(kind = "user", id = "u", label = "@U", marks = listOf(PMJSONValue.of(annotation("c1")))),
                            listOf("c1"),
                        ),
                    ),
                ),
            ),
            blocks,
        )
    }

    @Test
    fun dropsBoldItalicAndStrikeFromInlineCodeAnywhereAndKeepsALinkAndAnAnnotation() {
        val blocks = read(p(t("a", bold), t("b", bold, code), t("c", italic, strike, code, link("/x"), annotation("c1"))))
        assertEquals(
            listOf(
                para(
                    PMRichTextInline.Run("a", bold = true),
                    PMRichTextInline.Run("b", code = true),
                    PMRichTextInline.Run("c", href = "/x", code = true, annotations = listOf("c1")),
                ),
            ),
            blocks,
        )
    }

    @Test
    fun drawsAlikeTheRunsThatDifferedOnlyInWhatWasDropped() {
        // The web joins them into one run; this reader keeps two, which draw the same line.
        assertEquals(listOf(PMRichTextBlock.Heading(1, listOf(run("a"), run("b")))), read(heading(1, t("a", bold), t("b"))))
    }

    @Test
    fun readsAHeadingPastLevelThreeAsAHeadingAndOneWithNoLevelAsAParagraphThatKeepsItsBold() {
        assertEquals(listOf(PMRichTextBlock.Heading(3, listOf(run("h")))), read(heading(5, t("h", bold))))
        assertEquals(listOf(para(PMRichTextInline.Run("h", bold = true))), read(heading(null, t("h", bold))))
        // A heading flattened inside blocks nested too deep is a paragraph, which keeps its bold.
        val (_, inside) = innermost(read(nested(PMRichTextReader.MAX_DEPTH, quote(heading(1, t("h", bold))))))
        assertEquals(listOf(para(PMRichTextInline.Run("h", bold = true))), inside)
    }

    /* Emptiness (`isRichTextEmpty`) ------------------------------------------- */

    private fun empty(vararg blocks: Any?) = PMRichTextReader.isEmpty(read(*blocks))

    @Test
    fun isEmptyWithNoTextButWhitespace() {
        assertTrue(empty())
        assertTrue(empty(p(t("    "), br), p()))
        // JavaScript's trim removes the byte order mark and keeps U+001C.
        assertTrue(empty(p(t("\uFEFF\u00A0\u2028"))))
        assertFalse(empty(p(t("\u001C"))))
    }

    @Test
    fun countsFormattingWithNothingInItAsEmpty() {
        assertTrue(empty(heading(1), list(false, item(p())), quote(p(br)), codeBlock(""), codeBlock("  \n"), mapOf("type" to "divider")))
    }

    @Test
    fun countsAnEntityAsContent() {
        assertFalse(empty(p(ada)))
        assertFalse(empty(heading(1, ada)))
        assertFalse(empty(mapOf("type" to "callout", "content" to listOf(p(mapOf("type" to "entity", "kind" to "issue", "id" to "i", "label" to " "))))))
    }

    @Test
    fun countsAnyTextAsContent() {
        assertFalse(empty(p(t("."))))
        assertFalse(empty(codeBlock("x")))
        assertFalse(empty(mapOf("type" to "callout", "text" to "x")))
    }

    /* The page level a heading is drawn at ------------------------------------ */

    @Test
    fun drawsTheDocumentsLevelOneAtTheHeadingLevelAndEachDeeperLevelOneMoreToFour() {
        val drawn = { level: Int, top: Int -> PMRichTextContent.pageLevel(level, top).value }
        assertEquals(listOf(2, 3, 4), (1..3).map { drawn(it, 2) })
        assertEquals(listOf(3, 4, 4), (1..3).map { drawn(it, 3) })
        assertEquals(listOf(4, 4, 4), (1..3).map { drawn(it, 4) })
    }
}
