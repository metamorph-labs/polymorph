package dev.polymorph.examples.relay

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import dev.polymorph.ui.Harness
import dev.polymorph.ui.PMLoadStatus
import dev.polymorph.ui.PMStateEntry
import dev.polymorph.ui.SemanticsAudit
import kotlinx.coroutines.runBlocking
import org.jetbrains.skia.Bitmap
import org.jetbrains.skia.EncodedImageFormat
import org.jetbrains.skia.Image
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.math.ceil
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * The emitted inbox, rendered through the member module's harness at a
 * phone's width and the page's whole height under the default pairing in
 * light mode, in each of its four load states. The page scrolls, so its whole
 * height is the phone's screen and as much again as its column scrolls. Each state is reached the way the app
 * reaches it, through the store: before the load, after it, after a query that
 * matches nothing, and after a load that failed. Each render must draw
 * something, no two states may draw the same pixels, and each is written to
 * `platforms/android/.snapshots/Examples/Relay/inbox.<state>.png` for a person
 * to look at.
 */
class InboxRenderingTest {
    private val sample = TicketService { Ticket.samples }
    private val offline = TicketService { throw IllegalStateException(FAILURE) }

    /** The four states, each with the store that reached it. */
    private fun states(router: Router): List<Triple<String, PMLoadStatus, InboxStore>> = runBlocking {
        val waiting = InboxStore(sample, router)
        val loaded = InboxStore(sample, router).apply { load() }
        val filtered = InboxStore(sample, router).apply {
            load()
            onQueryChange("no ticket says this")
        }
        val failed = InboxStore(offline, router).apply { load() }
        listOf(
            Triple("loading", PMLoadStatus.Loading, waiting),
            Triple("ready", PMLoadStatus.Ready, loaded),
            Triple("empty", PMLoadStatus.Empty, filtered),
            Triple("failed", PMLoadStatus.Failed(FAILURE), failed),
        )
    }

    @Test
    fun theInertActionsBuildTheScreen() {
        val entry = PMStateEntry("inert") { InboxScreen(model = InboxModel.placeholder, actions = InboxInert) }
        val image = render(entry, Harness.SHORTEST)
        assertEquals(Harness.px(Harness.WIDTH), image.width)
    }

    @Test
    fun theInboxDrawsEachLoadState() {
        val directory = File(Harness.snapshots, "Examples/Relay")
        directory.deleteRecursively()
        directory.mkdirs()

        val router = Router()
        val drawn = mutableMapOf<String, ByteArray>()
        for ((name, status, store) in states(router)) {
            val model = store.model.value
            assertEquals(status, model.loadStatus, "the store reached $name")
            val entry = PMStateEntry(name) { InboxScreen(model = model, actions = store) }
            val height = pageHeight(entry)
            assertTrue(height > Harness.TALLEST, "$name: the page is longer than a phone's screen")
            val image = render(entry, height)
            assertEquals(Harness.px(Harness.WIDTH), image.width, name)
            assertEquals(Harness.px(height), image.height, name)

            val bytes = pixels(image)
            assertFalse(bytes.contentEquals(pixels(render(null, height))), "$name drew nothing")
            for ((other, earlier) in drawn) {
                assertFalse(bytes.contentEquals(earlier), "$name draws what $other draws")
            }
            drawn[name] = bytes

            val png = assertNotNull(image.encodeToData(EncodedImageFormat.PNG), name)
            File(directory, "inbox.$name.png").writeBytes(png.bytes)
        }
        assertEquals(listOf("loading", "ready", "empty", "failed"), drawn.keys.toList())
    }

    /** The page's whole height in dp: the screen it is drawn on, and how far its column scrolls. */
    private fun pageHeight(entry: PMStateEntry): Int {
        val scene = Harness.scene(entry, pass, Harness.TALLEST)
        try {
            Harness.settle(scene)
            val root = scene.semanticsOwners.first().unmergedRootSemanticsNode
            val scrolls = SemanticsAudit.walk(root).firstNotNullOfOrNull {
                it.config.getOrNull(SemanticsProperties.VerticalScrollAxisRange)
            }
            val further = scrolls?.maxValue?.invoke() ?: 0f
            return ceil((Harness.px(Harness.TALLEST) + further) / Harness.SCALE).toInt()
        } finally {
            scene.close()
        }
    }

    private fun render(entry: PMStateEntry?, height: Int): Image {
        val scene = Harness.scene(entry, pass, height)
        try {
            return Harness.settle(scene)
        } finally {
            scene.close()
        }
    }

    /** The image's pixels, so two renders compare byte for byte. */
    private fun pixels(image: Image): ByteArray {
        val bitmap = Bitmap.makeFromImage(image)
        return assertNotNull(bitmap.readPixels(), "could not read the render's pixels")
    }

    private companion object {
        /** The default pairing in light mode: the harness's first pass. */
        val pass: Harness.Pass = Harness.passes.first()

        const val FAILURE = "The tickets could not be loaded. Check your connection."
    }
}
