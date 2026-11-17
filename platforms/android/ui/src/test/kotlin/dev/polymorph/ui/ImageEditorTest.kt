package dev.polymorph.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performKeyInput
import androidx.compose.ui.test.pressKey
import androidx.compose.ui.test.requestFocus
import androidx.compose.ui.test.v2.runComposeUiTest
import androidx.compose.ui.unit.Density
import kotlin.math.PI
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * ImageEditor's law of the frame, held to the web's cases
 * (`packages/react-ui/src/controls/image-editor.geometry.test.ts`): the crop
 * never extends past the picture, quarter turns swap the axes everywhere at
 * once, and the export is the natural picture re-projected, never the
 * screen's pixels. Then the export drawn for real, and what the stage's keys
 * and the confirm Button do, composed by Compose for desktop's test host.
 */
@OptIn(ExperimentalTestApi::class)
class ImageEditorTest {
    private val landscape = 640.0 to 480.0
    private val viewport = 320.0 to 320.0

    private fun frame(
        turns: Int = 0,
        zoom: Double = 1.0,
        picture: Pair<Double, Double> = landscape,
        stage: Pair<Double, Double> = viewport,
    ) = ImageEditorFrame(picture.first, picture.second, stage.first, stage.second, turns, zoom)

    private fun assertClose(expected: Double, actual: Double) = assertEquals(expected, actual, 1e-9)

    @Test
    fun coverIsTheLargerOfTheTwoAxisRatios() {
        // 320/640 = 0.5 and 320/480 = 0.666…, so the height is the limiting axis.
        assertClose(320.0 / 480, frame().cover)
    }

    @Test
    fun anOddTurnSwapsTheLimitingAxis() {
        // Turned, 480 is the width and 640 the height: max(320/480, 320/640).
        assertClose(320.0 / 480, frame(turns = 1).cover)
    }

    @Test
    fun aDegenerateBoxIsCoveredAtOneRatherThanDividingByZero() {
        assertEquals(1.0, frame(picture = 0.0 to 0.0).cover)
        assertEquals(1.0, frame(stage = 0.0 to 0.0).cover)
    }

    @Test
    fun theClampKeepsThePicturesEdgesOutOfTheCrop() {
        // At the least zoom the drawn height is the stage's exactly, so the
        // vertical centre has one lawful value; the width overhangs and pans.
        val centre = frame().clamp(ImageEditorPoint(-10_000.0, 10_000.0))
        val drawnWidth = 640 * frame().cover
        assertEquals(160.0, centre.y)
        assertEquals(320 - drawnWidth / 2, centre.x)
    }

    @Test
    fun aLawfulCentreIsLeftAlone() {
        val centre = frame().centre
        assertEquals(centre, frame(zoom = 2.0).clamp(centre))
    }

    @Test
    fun aTurnClampsAgainOnTheSwappedAxes() {
        val turned = frame(turns = 1)
        val centre = turned.clamp(ImageEditorPoint(0.0, 0.0))
        // Turned, the drawn box is 480 by 640 at the scale, so the width fits exactly.
        assertEquals(160.0, centre.x)
        assertEquals(320 - 640 * turned.cover / 2, centre.y)
    }

    @Test
    fun onlyAnOddTurnSwapsTheSides() {
        assertEquals(640.0 to 480.0, frame().turnedWidth to frame().turnedHeight)
        assertEquals(480.0 to 640.0, frame(turns = 1).turnedWidth to frame(turns = 1).turnedHeight)
        assertEquals(640.0 to 480.0, frame(turns = 2).turnedWidth to frame(turns = 2).turnedHeight)
    }

    @Test
    fun theExportTakesTheLongestEdgeAndKeepsTheCropsShape() {
        val wide = frame(stage = 400.0 to 225.0).export(512.0, ImageEditorPoint(200.0, 112.5), mirrored = false)
        assertEquals(512, wide.width)
        assertEquals(288, wide.height)
        val tall = frame(stage = 225.0 to 400.0).export(512.0, ImageEditorPoint(112.5, 200.0), mirrored = false)
        assertEquals(512, tall.height)
        assertEquals(288, tall.width)
    }

    @Test
    fun theExportScalesByCoverZoomAndTheResolution() {
        val doubled = frame(zoom = 2.0)
        val geometry = doubled.export(640.0, doubled.centre, mirrored = false)
        val factor = 640.0 / 320
        assertClose(frame().cover * 2 * factor, geometry.scaleX)
        assertClose(geometry.scaleX, geometry.scaleY)
        assertClose(160 * factor, geometry.translateX)
        assertEquals(-320.0, geometry.drawX)
    }

    @Test
    fun theMirrorNegatesOnlyXInThePicturesOwnSpace() {
        val turned = frame(turns = 1)
        val straight = turned.export(512.0, turned.centre, mirrored = false)
        val mirrored = turned.export(512.0, turned.centre, mirrored = true)
        assertClose(-straight.scaleX, mirrored.scaleX)
        assertClose(straight.scaleY, mirrored.scaleY)
        assertEquals(straight.rotationRadians, mirrored.rotationRadians)
    }

    @Test
    fun turnsAreReportedInRadians() {
        assertClose(3 * PI / 2, frame(turns = 3).export(512.0, ImageEditorPoint(0.0, 0.0), mirrored = false).rotationRadians)
    }

    /* The export, drawn ------------------------------------------------------ */

    /** A picture 200 by 100 pixels: red on its left half, blue on its right. */
    private object Halves : Painter() {
        override val intrinsicSize = Size(200f, 100f)

        override fun DrawScope.onDraw() {
            drawRect(Color.Blue)
            drawRect(Color.Red, size = Size(size.width / 2, size.height))
        }
    }

    private fun exported(mirrored: Boolean, quarters: Int = 0): ImageBitmap {
        val state = ImageEditorState()
        state.viewport = Size(100f, 100f)
        state.natural = Halves.intrinsicSize
        state.quarters = quarters
        state.mirrored = mirrored
        return assertNotNull(state.export(Halves, 64.0, Density(1f)))
    }

    @Test
    fun theExportIsTheFrameAtTheExportSizeFromTheNaturalPicture() {
        // A square crop of a 2:1 picture, centred: the middle half, red to the left of blue.
        val image = exported(mirrored = false)
        assertEquals(64, image.width)
        assertEquals(64, image.height)
        val pixels = image.toPixelMap()
        assertEquals(Color.Red, pixels[8, 32])
        assertEquals(Color.Blue, pixels[56, 32])
    }

    @Test
    fun aMirroredExportIsMirroredAsTheStageIs() {
        val pixels = exported(mirrored = true).toPixelMap()
        assertEquals(Color.Blue, pixels[8, 32])
        assertEquals(Color.Red, pixels[56, 32])
    }

    @Test
    fun aQuarterTurnPutsTheLeftOfThePictureAtTheTop() {
        // Turned clockwise, the picture's left half is above its right.
        val pixels = exported(mirrored = false, quarters = 1).toPixelMap()
        assertEquals(Color.Red, pixels[32, 8])
        assertEquals(Color.Blue, pixels[32, 56])
    }

    @Test
    fun noExportBeforeThePictureOrTheStageHasASize() {
        assertNull(ImageEditorState().export(Halves, 64.0, Density(1f)))
    }

    /* The stage -------------------------------------------------------------- */

    private val words = PMSpecDefault.imageEditorMessages

    @Composable
    private fun Scene(encoder: PMImageEncoder?, content: @Composable () -> Unit) {
        Harness.Scene(Harness.passes.first()) {
            CompositionLocalProvider(
                LocalPMImageLoader provides PMImageLoader { Halves },
                LocalPMImageEncoder provides encoder,
                content = content,
            )
        }
    }

    private fun editor(vararg attributes: Pair<String, String>) = SemanticsMatcher("ImageEditor") { node ->
        val member = node.config.getOrNull(PMMemberKey) ?: return@SemanticsMatcher false
        member.name == "ImageEditor" && attributes.all { (key, value) -> member.attributes[key] == value }
    }

    private fun button(label: String) = SemanticsMatcher("member Button") { node ->
        node.config.getOrNull(PMMemberKey)?.name == "Button"
    } and hasContentDescription(label)

    /**
     * `image-editor.md`: confirm hands the app the framed picture, in the
     * export type, written by the app's encoder; without an encoder it hands
     * nothing over.
     */
    @Test
    fun confirmHandsOverTheEncodersBytesInTheExportType() = runComposeUiTest {
        val types = mutableListOf<String>()
        val sizes = mutableListOf<Pair<Int, Int>>()
        val handed = mutableListOf<ByteArray>()
        val encoder = PMImageEncoder { image, type ->
            types += type
            sizes += image.width to image.height
            byteArrayOf(1, 2, 3)
        }
        setContent {
            Scene(encoder) {
                PMImageEditor(exportSize = 256.0, exportType = PMImageEditorExportType.ImageJpeg, onConfirm = { handed += it }, src = "halves.png")
            }
        }
        onNode(button(assertNotNull(words.confirm))).performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        assertEquals(listOf("image/jpeg"), types)
        assertEquals(listOf(256 to 256), sizes)
        assertEquals(listOf(3), handed.map { it.size })
    }

    @Test
    fun withoutAnEncoderConfirmHandsNothingOver() = runComposeUiTest {
        val handed = mutableListOf<ByteArray>()
        setContent { Scene(null) { PMImageEditor(onConfirm = { handed += it }, src = "halves.png") } }
        onNode(button(assertNotNull(words.confirm))).performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        assertTrue(handed.isEmpty())
    }

    /**
     * `image-editor.md`: the stage takes keys once focused; plus zooms by the
     * slider's step, and the flip command mirrors the picture.
     */
    @Test
    fun theKeysZoomAndTheFlipMirrors() = runComposeUiTest {
        setContent { Scene(null) { PMImageEditor(flip = true, onConfirm = {}, src = "halves.png") } }
        val stage = onNode(hasContentDescription(assertNotNull(words.stage)))
        stage.requestFocus()
        stage.performKeyInput { pressKey(Key.Equals) }
        waitForIdle()
        onNode(hasText("105%"), useUnmergedTree = true).assertExists()
        onNode(editor("mirrored" to "true")).assertDoesNotExist()
        onNode(button(assertNotNull(words.flip))).performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        onNode(editor("mirrored" to "true")).assertExists()
    }

    @Test
    fun aSourceTheLoaderHasNoPictureForIsTheDoorway() = runComposeUiTest {
        setContent {
            Harness.Scene(Harness.passes.first()) {
                CompositionLocalProvider(LocalPMImageLoader provides PMImageLoader { null }) {
                    PMImageEditor(onConfirm = {}, src = "missing.png")
                }
            }
        }
        waitForIdle()
        onNode(editor("empty" to "true")).assertExists()
    }
}
