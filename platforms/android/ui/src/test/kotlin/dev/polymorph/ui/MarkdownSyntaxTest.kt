package dev.polymorph.ui

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Markdown's parser (`PMMarkdownSyntax`), held to the web parser's own tests
 * (`packages/engine/src/markdown/parse.test.ts`), case for case, so a reply
 * draws the same tree on every platform.
 */
class MarkdownSyntaxTest {
    private val structure = """
        ## What changed

        1. Retries now carry the original idempotency key.
        2. The backoff cap moved from three attempts to five.
           - The first retry still fires after two seconds.
           - Each later one doubles the wait.
        3. A `429` from the receiver is retried; a `410` is not.

        ### Why it matters

        A duplicate delivery is refused rather than applied twice, which is what the ~~old~~ previous behaviour could not promise.
    """.trimIndent()

    private val table = """
        | Attempt | Wait | Cumulative |
        | --- | ---: | ---: |
        | 1 | 2s | 2s |
        | 2 | 4s | 6s |
        | 3 | 8s | 14s |
        | 4 | 16s | 30s |
        | 5 | 32s | 62s |
    """.trimIndent()

    @Test
    fun parsesTheBlockSyntaxAModelWrites() {
        val blocks = PMMarkdownSyntax.parse(structure)
        assertEquals(listOf("Heading", "Items", "Heading", "Paragraph"), blocks.map { it::class.simpleName })
        val list = assertIs<PMMarkdownBlock.Items>(blocks[1])
        assertTrue(list.ordered)
        assertEquals(3, list.items.size)
        assertEquals(listOf("Paragraph", "Items"), list.items[1].map { it::class.simpleName })
    }

    @Test
    fun parsesAPipeTableWithItsAlignments() {
        val parsed = assertIs<PMMarkdownBlock.Table>(PMMarkdownSyntax.parse(table).single())
        assertEquals(listOf(null, PMMarkdownAlign.End, PMMarkdownAlign.End), parsed.align)
        assertEquals(5, parsed.rows.size)
    }

    @Test
    fun keepsAnOpenFenceAsTheCodeReceivedSoFar() {
        assertEquals(PMMarkdownBlock.Code("ts", "const a = 1", closed = false), PMMarkdownSyntax.parse("```ts\nconst a = 1").single())
        assertEquals(PMMarkdownBlock.Code("ts", "const a = 1", closed = true), PMMarkdownSyntax.parse("```ts\nconst a = 1\n```").single())
    }

    @Test
    fun parsesAnUnfinishedEmphasisAsLiteralText() {
        assertEquals(listOf(PMMarkdownInline.Text("a **bold")), PMMarkdownSyntax.inlines("a **bold"))
        assertEquals(
            listOf(
                PMMarkdownInline.Text("a "),
                PMMarkdownInline.Strong(listOf(PMMarkdownInline.Text("bold"))),
                PMMarkdownInline.Text(" word"),
            ),
            PMMarkdownSyntax.inlines("a **bold** word"),
        )
        // snake_case is three words, not an emphasis.
        assertEquals(listOf(PMMarkdownInline.Text("use snake_case_names here")), PMMarkdownSyntax.inlines("use snake_case_names here"))
    }

    @Test
    fun parsesACitationOnlyWhenTheReplyHasThatManySources() {
        assertEquals(
            listOf(PMMarkdownInline.Text("as shown "), PMMarkdownInline.Citation(2), PMMarkdownInline.Text(".")),
            PMMarkdownSyntax.inlines("as shown [2].", citations = 3),
        )
        assertEquals(listOf(PMMarkdownInline.Text("as shown [2].")), PMMarkdownSyntax.inlines("as shown [2].", citations = 1))
        // A bracket that opens a link is a link, however many sources there are.
        assertIs<PMMarkdownInline.Link>(PMMarkdownSyntax.inlines("[1](https://a.example)", citations = 3).first())
    }

    @Test
    fun rejectsUnsafeLinkTargets() {
        assertEquals("https://a.example/x", PMMarkdownSyntax.safeHref("https://a.example/x"))
        assertEquals("/relative", PMMarkdownSyntax.safeHref("/relative"))
        assertEquals("mailto:a@example.org", PMMarkdownSyntax.safeHref("mailto:a@example.org"))
        assertNull(PMMarkdownSyntax.safeHref("javascript:alert(1)"))
        assertNull(PMMarkdownSyntax.safeHref("JAVA\u0000SCRIPT:alert(1)"))
        assertNull(PMMarkdownSyntax.safeHref("data:text/html,hi"))
    }

    @Test
    fun drawsHeadingsRelativeToTheShallowest() {
        val blocks = PMMarkdownSyntax.parse(structure)
        assertEquals(2, PMMarkdownSyntax.shallowestHeading(blocks))
        assertEquals(2, PMMarkdownSyntax.headingLevel(2, 2))
        assertEquals(3, PMMarkdownSyntax.headingLevel(3, 2))
        assertEquals(4, PMMarkdownSyntax.headingLevel(6, 1))
        assertTrue(PMMarkdownSyntax.endsInProse(blocks))
    }
}
