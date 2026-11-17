package dev.polymorph.ui

import org.jetbrains.skia.Bitmap
import org.jetbrains.skia.EncodedImageFormat
import org.jetbrains.skia.Image
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Every states fixture entry, rendered with `ImageComposeScene` at the canvas's
 * width and its own height (`Harness.height`) under each pass: the default
 * pairing, a dark one, and the default pairing right to left. Each render must
 * draw something (it differs from the empty canvas of its size), and each is
 * written to `platforms/android/.snapshots/<Member>/<entry>.<pass>.png` for a
 * person to look at. `RightToLeftTest` holds what the right-to-left pass must
 * draw where a member places its parts itself.
 */
class RenderingTest {
    @Test
    fun everyEntryDrawsUnderEachPass() {
        val fixtures = Harness.fixtures
        assertTrue(fixtures.isNotEmpty(), "no states fixture is registered")
        for (fixture in fixtures) {
            assertTrue(fixture.entries.isNotEmpty(), "${fixture.member} promises no states")
            val names = fixture.entries.map { it.name }
            assertEquals(names.size, names.toSet().size, "${fixture.member} names two entries alike")
            val directory = File(Harness.snapshots, fixture.member)
            directory.deleteRecursively()
            directory.mkdirs()

            for (pass in Harness.passes) {
                val blanks = mutableMapOf<Int, ByteArray>()
                for (entry in fixture.entries) {
                    val label = "${fixture.member} — ${entry.name} (${pass.name})"
                    val height = Harness.height(entry, pass)
                    val image = render(entry, pass, height)
                    assertEquals(Harness.px(Harness.WIDTH), image.width, label)
                    assertEquals(Harness.px(height), image.height, label)
                    val blank = blanks.getOrPut(height) { pixels(render(null, pass, height)) }
                    assertFalse(pixels(image).contentEquals(blank), "$label drew nothing")

                    val png = assertNotNull(image.encodeToData(EncodedImageFormat.PNG), label)
                    File(directory, "${Harness.slug(entry.name)}.${pass.name}.png").writeBytes(png.bytes)
                }
            }
        }
    }

    private fun render(entry: PMStateEntry?, pass: Harness.Pass, height: Int): Image {
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
}
