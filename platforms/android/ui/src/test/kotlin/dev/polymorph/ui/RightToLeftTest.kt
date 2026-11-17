package dev.polymorph.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.LocalTextStyle
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.ImageComposeScene
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.semantics.SemanticsConfiguration
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import org.jetbrains.skia.Bitmap
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * What the right-to-left pass (`Harness.rightToLeft`) must draw where a member
 * places its parts itself rather than through a row Compose mirrors
 * (`docs/native.md`, "Right to left"): a clock reads left to right in either
 * direction, a colour model mirrors as a slider does, a mirrored glyph turns
 * the mirrored way, and a right-to-left paragraph is underlined under its
 * words. Each check renders under the pass, and the left-to-right pass where
 * it compares the two.
 */
class RightToLeftTest {
    private val leftToRight = Harness.passes.first()
    private val rightToLeft = Harness.rightToLeft

    /** A node of a settled scene: what it says and where it is in the scene, read before the scene closes. */
    private class Node(val config: SemanticsConfiguration, val bounds: Rect)

    /** A settled scene's pixels, four bytes each, and the nodes of every window in it, unmerged. */
    private class Drawn(val width: Int, val height: Int, private val bytes: ByteArray, val nodes: List<Node>) {
        /** The pixel at `x`, `y`, its four channels packed. */
        fun pixel(x: Int, y: Int): Int {
            val at = (y * width + x) * 4
            return (0 until 4).fold(0) { packed, channel -> packed or ((bytes[at + channel].toInt() and 0xff) shl (8 * channel)) }
        }

        /** The pixels inside `bounds`, row by row. */
        fun crop(bounds: Rect): List<Int> {
            val left = bounds.left.roundToInt()
            val top = bounds.top.roundToInt()
            return (top until bounds.bottom.roundToInt()).flatMap { y -> (left until bounds.right.roundToInt()).map { x -> pixel(x, y) } }
        }

        /** The pixels inside `bounds`, row by row, each row right to left: the crop flipped across. */
        fun cropFlipped(bounds: Rect): List<Int> {
            val left = bounds.left.roundToInt()
            val top = bounds.top.roundToInt()
            return (top until bounds.bottom.roundToInt()).flatMap { y ->
                (left until bounds.right.roundToInt()).reversed().map { x -> pixel(x, y) }
            }
        }

        /** The whole image upside down, so a chevron pointing down reads as one pointing up. */
        fun flipped(): Drawn {
            val turned = ByteArray(bytes.size)
            for (y in 0 until height) bytes.copyInto(turned, (height - 1 - y) * width * 4, y * width * 4, (y + 1) * width * 4)
            return Drawn(width, height, turned, nodes)
        }

        /** How far two images of one size are apart: the sum of every channel's difference. */
        fun distance(other: Drawn): Long = bytes.indices.sumOf { abs((bytes[it].toInt() and 0xff) - (other.bytes[it].toInt() and 0xff)).toLong() }
    }

    private fun draw(pass: Harness.Pass, width: Int, height: Int, content: @Composable () -> Unit): Drawn {
        val scene = ImageComposeScene(Harness.px(width), Harness.px(height), Density(Harness.SCALE)) {
            Harness.Scene(pass) { content() }
        }
        try {
            val image = Harness.settle(scene)
            val bytes = assertNotNull(Bitmap.makeFromImage(image).readPixels(), "could not read the render's pixels")
            val nodes = scene.semanticsOwners
                .flatMap { SemanticsAudit.walk(it.unmergedRootSemanticsNode) }
                .map { Node(it.config, it.boundsInWindow) }
            return Drawn(image.width, image.height, bytes, nodes)
        } finally {
            scene.close()
        }
    }

    /**
     * TimeInput: the hour stands left of the minute in both directions, as a
     * clock reads, so 17:45 never draws as 45:17.
     */
    @Test
    fun theClockReadsHoursThenMinutesFromTheLeft() {
        for (pass in listOf(leftToRight, rightToLeft)) {
            val drawn = draw(pass, Harness.WIDTH, Harness.SHORTEST) {
                PMTimeInput(
                    ariaLabel = "Opens at",
                    defaultValue = PMSome(PMTime(hour = 17.0, minute = 45.0, second = 0.0, millisecond = 0.0)),
                    hourCycle = PMTimeInputHourCycle.HourCycle24,
                    locale = "en-US",
                )
            }
            val segments = drawn.nodes
                .mapNotNull { node -> node.config.getOrNull(SemanticsProperties.EditableText)?.let { it.text to node.bounds.left } }
                .sortedBy { it.second }
                .map { it.first }
            assertEquals(listOf("17", "45"), segments, pass.name)
        }
    }

    /**
     * ColorInput's picker mirrors right to left, as a horizontal Slider does
     * (`color-input.md`): the plane and the hue rail draw the left-to-right
     * pixels flipped across, the thumbs where their colour is. The hue rail's
     * thumb sits on the rail's middle, so the gap above the rail is the
     * sheet's surface and nothing else, and it is its full `space-5`, taller
     * than the `space-4` rail: a hairline inside the rail's top edge, its
     * centre shows the thumb's fill, where a thumb squashed to the rail would
     * show its ring.
     */
    @Test
    fun thePickerMirrorsTheColourModelRightToLeft() {
        val open: @Composable () -> Unit = {
            PMFixturePhone { PMColorInput(defaultOpen = true, defaultValue = "8864f0", pickerLabel = "Choose accent colour") }
        }
        val ltr = draw(leftToRight, Harness.WIDTH, Harness.TALLEST, open)
        val rtl = draw(rightToLeft, Harness.WIDTH, Harness.TALLEST, open)
        val ltrParts = surfaces(ltr)
        val rtlParts = surfaces(rtl)
        assertEquals(2, ltrParts.size, "the plane and the hue rail, found as their cleared nodes: $ltrParts")
        assertEquals(ltrParts.size, rtlParts.size)
        for ((index, part) in ltrParts.withIndex()) {
            val mirrored = rtlParts[index]
            assertEquals(part.size, mirrored.size, "part $index has another size right to left")
            // A mirrored drawing is rasterised afresh, so its antialiased
            // edges and shadows differ from the original by a few levels.
            val apart = ltr.crop(part).zip(rtl.cropFlipped(mirrored)).count { (a, b) -> unlike(a, b) }
            assertTrue(apart < MOVED_PIXELS, "part $index draws $apart pixels away from its mirror image right to left")
        }
        // The value's hue, 8864f0's, as a share of the rail.
        val hue = PMHexColor.hsva("8864f0")!![0] / FULL_TURN
        for ((drawn, rtl) in listOf(ltr to false, rtl to true)) {
            val rail = surfaces(drawn).last()
            val y = (rail.top - 4 * Harness.SCALE).roundToInt()
            val row = (rail.left.roundToInt() until rail.right.roundToInt()).map { drawn.pixel(it, y) }.toSet()
            assertEquals(1, row.size, "something is drawn in the gap above the hue rail: its thumb is above the rail")
            val along = rail.width * hue
            val x = (if (rtl) rail.right - along else rail.left + along).roundToInt()
            val inside = drawn.pixel(x, (rail.top + Harness.SCALE).roundToInt())
            val centre = drawn.pixel(x, rail.center.y.roundToInt())
            assertEquals(centre, inside, "the hue rail's thumb is squashed to the rail: its ring is a hairline inside the rail's top")
        }
    }

    /** Whether two packed pixels differ by more than rasterising the same drawing again would. */
    private fun unlike(a: Int, b: Int): Boolean =
        (0 until 4).any { channel -> abs(((a shr (8 * channel)) and 0xff) - ((b shr (8 * channel)) and 0xff)) > CHANNEL_TOLERANCE }

    /** The plane and the rails: the picker's drag surfaces, cleared nodes as wide as the plane, top to bottom. */
    private fun surfaces(drawn: Drawn): List<Rect> {
        val cleared = drawn.nodes
            .filter { it.config.isClearingSemantics && it.config.none() }
            .map { it.bounds }
            .filter { it.width > 0 && it.height > 0 }
        val plane = cleared.maxByOrNull { it.height } ?: return emptyList()
        return cleared.filter { it.width == plane.width && it.left.isFinite() }.distinct().sortedBy { it.top }
    }

    /**
     * JsonTree's open chevron, `next` turned a quarter: down in both
     * directions. The mirrored glyph turned the same way would point up.
     */
    @Test
    fun anOpenBranchsChevronPointsDownInEitherDirection() {
        val chevron: @Composable () -> Unit = {
            Box(Modifier.size(CHEVRON_BOX.dp), contentAlignment = Alignment.Center) {
                PMTurningChevron(PMIconRole.Next, open = true, turn = PMTurn.QUARTER)
            }
        }
        val down = draw(leftToRight, CHEVRON_BOX, CHEVRON_BOX, chevron)
        val rtl = draw(rightToLeft, CHEVRON_BOX, CHEVRON_BOX, chevron)
        assertTrue(rtl.distance(down) < rtl.distance(down.flipped()), "the chevron points up right to left")
    }

    /**
     * Link: an inline link in a right-to-left paragraph is underlined at rest,
     * so it draws more than the same link standalone, which is not.
     */
    @Test
    fun anInlineLinkIsUnderlinedInARightToLeftParagraph() {
        for (pass in listOf(leftToRight, rightToLeft)) {
            val link = { variant: PMLinkVariant ->
                draw(pass, Harness.WIDTH, Harness.SHORTEST) {
                    CompositionLocalProvider(LocalTextStyle provides PM.theme.text.sm.textStyle) {
                        PMLink(children = HEBREW, href = "https://example.com/deliveries", variant = variant)
                    }
                }
            }
            val inline = link(PMLinkVariant.Inline)
            val standalone = link(PMLinkVariant.Standalone)
            assertTrue(inline.distance(standalone) > 0, "${pass.name}: the inline link draws no underline")
        }
    }

    private companion object {
        /** The fewest pixels a thumb covers, and more than the edge of a part can differ by. */
        const val MOVED_PIXELS = 200

        /** Degrees in a turn: the hue rail's length. */
        const val FULL_TURN = 360f

        /** The most a channel differs by when the same drawing is rasterised mirrored. */
        const val CHANNEL_TOLERANCE = 32

        /** The box a chevron is drawn in, in dp. */
        const val CHEVRON_BOX = 48

        /** "The delivery log", in Hebrew: a paragraph that runs right to left. */
        const val HEBREW = "יומן המסירות"
    }
}
