package dev.polymorph.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.performKeyInput
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.pressKey
import androidx.compose.ui.test.v2.runComposeUiTest
import androidx.compose.ui.unit.LayoutDirection
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * What Lightbox, AudioPlayer and RecordButton do when a reader acts on them,
 * composed by Compose for desktop's test host and read through its semantics,
 * as TalkBack reads them. AudioPlayer plays through an engine the test drives.
 */
@OptIn(ExperimentalTestApi::class)
class MediaBehaviourTest {
    @Composable
    private fun Scene(rtl: Boolean = false, content: @Composable () -> Unit) {
        Harness.Scene(Harness.passes.first()) {
            CompositionLocalProvider(LocalLayoutDirection provides if (rtl) LayoutDirection.Rtl else LayoutDirection.Ltr) { content() }
        }
    }

    /** The node whose identity is `name`, with each of `attributes`. */
    private fun member(name: String, vararg attributes: Pair<String, String>) = SemanticsMatcher("member $name") { node ->
        val member = node.config.getOrNull(PMMemberKey) ?: return@SemanticsMatcher false
        member.name == name && attributes.all { (key, value) -> member.attributes[key] == value }
    }

    /** The Button named `label`: a Button member is named by its content description. */
    private fun button(label: String) = member("Button") and hasContentDescription(label)

    /* Lightbox ------------------------------------------------------------- */

    /** Three pictures with nothing to load, so each is Image's named fallback. */
    private val pictures = listOf("A harbour at dusk", "A pine ridge", "Red cliffs").map { PMLightboxImage(src = "", alt = it) }

    private val words = PMStrings().lightboxMessages

    /**
     * `lightbox.md`: previous and next move one picture and the position
     * follows; previous is disabled on the first picture and next on the
     * last, because the lightbox does not wrap; `onIndexChange` reports each
     * move.
     */
    @Test
    fun theTravelButtonsMoveOnePictureAndStopAtTheEnds() = runComposeUiTest {
        val reported = mutableListOf<Double>()
        setContent {
            Scene { PMLightbox(defaultOpen = true, images = pictures, label = "Photographs", onIndexChange = { reported += it }) }
        }
        onNode(button(words.previous)).assertIsNotEnabled()
        onNode(hasText(words.position(1.0, 3.0))).assertExists()
        onNode(button(words.next)).performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        onNode(hasText(words.position(2.0, 3.0))).assertExists()
        onNode(button(words.previous)).assertIsEnabled()
        onNode(button(words.next)).performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        onNode(hasText(words.position(3.0, 3.0))).assertExists()
        onNode(button(words.next)).assertIsNotEnabled()
        onNode(button(words.previous)).performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        onNode(hasText(words.position(2.0, 3.0))).assertExists()
        assertEquals(listOf(1.0, 2.0, 1.0), reported)
    }

    /** One picture has nowhere to move: no previous, no next, no position. */
    @Test
    fun onePictureDrawsNoTravelAndNoPosition() = runComposeUiTest {
        setContent { Scene { PMLightbox(defaultOpen = true, images = pictures.take(1), label = "Attachment preview") } }
        onNode(button(words.close)).assertExists()
        onNode(button(words.previous)).assertDoesNotExist()
        onNode(button(words.next)).assertDoesNotExist()
        onNode(hasText(words.position(1.0, 1.0))).assertDoesNotExist()
    }

    /** The arrow keys move one picture by the layout's direction: right to left, the left arrow moves to the next picture. */
    @Test
    fun theArrowKeysMoveByTheLayoutsDirection() {
        for (rtl in listOf(false, true)) {
            runComposeUiTest {
                setContent { Scene(rtl) { PMLightbox(defaultOpen = true, images = pictures, label = "Photographs") } }
                val forward = if (rtl) Key.DirectionLeft else Key.DirectionRight
                val back = if (rtl) Key.DirectionRight else Key.DirectionLeft
                val panel = onNode(member("Lightbox", "state" to "open") and SemanticsMatcher("a pane") { it.config.getOrNull(SemanticsProperties.PaneTitle) != null })
                panel.performKeyInput { pressKey(forward) }
                waitForIdle()
                onNode(hasText(words.position(2.0, 3.0))).assertExists()
                panel.performKeyInput { pressKey(back) }
                waitForIdle()
                onNode(hasText(words.position(1.0, 3.0))).assertExists()
            }
        }
    }

    /** The close Button closes the window and reports it; the trigger opens it again on the picture the reader left. */
    @Test
    fun closingKeepsThePosition() = runComposeUiTest {
        val reported = mutableListOf<Boolean>()
        setContent {
            Scene {
                PMLightbox(
                    images = pictures,
                    label = "Photographs",
                    onOpenChange = { reported += it },
                    trigger = { PMButton(label = "View the photographs") },
                )
            }
        }
        onNode(button("View the photographs")).performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        onNode(button(words.next)).performSemanticsAction(SemanticsActions.OnClick)
        onNode(button(words.close)).performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        onNode(button(words.close)).assertDoesNotExist()
        onNode(button("View the photographs")).performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        onNode(hasText(words.position(2.0, 3.0))).assertExists()
        assertEquals(listOf(true, false, true), reported)
    }

    /* AudioPlayer ---------------------------------------------------------- */

    private val audio = PMStrings().audioPlayerMessages

    /** A recording the test plays: it reports what the member asks of it, as a media player would. */
    private class Media(val events: PMAudioEvents) : PMAudioMedia {
        val asked = mutableListOf<String>()
        private var moving = false

        override fun play() {
            asked += "play"
            moving = true
            events.playing()
        }

        override fun pause() {
            asked += "pause"
            if (moving) {
                moving = false
                events.paused()
            }
        }

        override fun seek(seconds: Double) {
            asked += "seek ${seconds.toInt()}"
            events.time(seconds)
        }

        override fun reload() {
            asked += "reload"
        }

        override fun release() {
            asked += "release"
        }
    }

    /** An engine whose recordings each give `seconds` as their length, and that keeps what it opened. */
    private class Engine(private val seconds: Double?) : PMAudioEngine {
        val opened = mutableListOf<Media>()

        override fun open(url: String, events: PMAudioEvents): PMAudioMedia {
            seconds?.let(events::length)
            return Media(events).also { opened += it }
        }
    }

    @Composable
    private fun Players(engine: PMAudioEngine?, content: @Composable () -> Unit) {
        Scene { CompositionLocalProvider(LocalPMAudioEngine provides engine, content = content) }
    }

    private fun playerIn(name: String) = SemanticsMatcher("AudioPlayer in state $name") { node ->
        node.config.getOrNull(PMMemberKey)?.let { it.name == "AudioPlayer" && it.attributes["state"] == name } ?: false
    }

    /**
     * `audio-player.md`: a press plays, which is reported once and names the
     * Button "Pause"; the end is reported once and the player is ended, its
     * Button "Play"; a press after the end plays from the start.
     */
    @Test
    fun aPressPlaysAndTheEndIsReported() = runComposeUiTest {
        val engine = Engine(18.0)
        var played = 0
        var ended = 0
        setContent {
            Players(engine) {
                PMAudioPlayer(label = "Voice message from Ada", onEnded = { ended += 1 }, onPlay = { played += 1 }, src = "ada.m4a")
            }
        }
        onNode(button(audio.play)).performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        onNode(playerIn("playing")).assertExists()
        onNode(button(audio.pause)).assertExists()
        runOnIdle { engine.opened.single().events.ended() }
        waitForIdle()
        onNode(playerIn("ended")).assertExists()
        onNode(button(audio.play)).performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        assertEquals(listOf("play", "seek 0", "play"), engine.opened.single().asked)
        assertEquals(2, played)
        assertEquals(1, ended)
    }

    /** Starting one player pauses the other, so two recordings never play over each other. */
    @Test
    fun startingOnePlayerPausesTheOther() = runComposeUiTest {
        val engine = Engine(18.0)
        setContent {
            Players(engine) {
                Column {
                    PMAudioPlayer(label = "Ada", src = "ada.m4a")
                    PMAudioPlayer(label = "Grace", src = "grace.m4a")
                }
            }
        }
        onNode(member("AudioPlayer") and hasContentDescription("Ada")).assertExists()
        onAllNodes(button(audio.play))[0].performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        onAllNodes(button(audio.play))[0].performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        val (ada, grace) = engine.opened
        assertEquals(listOf("play", "pause"), ada.asked)
        assertEquals(listOf("play"), grace.asked)
        onNode(button(audio.pause)).assertExists()
    }

    /**
     * A failure replaces the scrubber with its words and keeps the Button
     * enabled, and a press asks for the file again; without an engine, or
     * with an empty `src`, the Button is disabled.
     */
    @Test
    fun aFailureKeepsTheButtonAndAPressAsksAgain() = runComposeUiTest {
        val engine = Engine(18.0)
        setContent { Players(engine) { PMAudioPlayer(label = "Ada", src = "ada.m4a") } }
        onNode(hasContentDescription(audio.scrubber)).assertExists()
        runOnIdle { engine.opened.single().events.failed() }
        waitForIdle()
        onNode(playerIn("failed")).assertExists()
        onNode(hasText(audio.failed)).assertExists()
        onNode(hasContentDescription(audio.scrubber)).assertDoesNotExist()
        onNode(button(audio.play)).assertIsEnabled().performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        assertEquals(listOf("reload", "play"), engine.opened.single().asked)
    }

    @Test
    fun noEngineOrNoSourceDisablesTheButton() {
        for ((engine, src) in listOf(null to "ada.m4a", Engine(18.0) to "")) {
            runComposeUiTest {
                setContent { Players(engine) { PMAudioPlayer(label = "Ada", src = src) } }
                onNode(playerIn("failed")).assertExists()
                onNode(button(audio.play)).assertIsNotEnabled()
                onNode(hasText(audio.failed)).assertExists()
            }
        }
    }

    /**
     * The scrubber says the elapsed and the total length in words, follows a
     * seek, and stays disabled while the length is unknown.
     */
    @Test
    fun theScrubberSaysThePositionInWords() = runComposeUiTest {
        val engine = Engine(18.0)
        setContent { Players(engine) { PMAudioPlayer(label = "Ada", src = "ada.m4a") } }
        val scrubber = onNode(hasContentDescription(audio.scrubber))
        scrubber.assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, audio.position("0 seconds", "18 seconds")))
        runOnIdle { engine.opened.single().events.time(65.4) }
        waitForIdle()
        scrubber.assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, audio.position("18 seconds", "18 seconds")))
    }

    /* RecordButton --------------------------------------------------------- */

    /**
     * `record-button.md`: a press calls `onStart` at rest and `onStop` while
     * recording and changes nothing itself; the Button's name says what a
     * press does, and the time is read as its length in words.
     */
    @Test
    fun aRecordButtonReportsAndTheAppDecidesTheState() {
        var started = 0
        var stopped = 0
        for (recording in listOf(false, true)) {
            runComposeUiTest {
                setContent {
                    Scene {
                        PMRecordButton(
                            elapsed = 12.0,
                            label = "Record a voice message",
                            onStart = { started += 1 },
                            onStop = { stopped += 1 },
                            recording = recording,
                            stopLabel = "Stop recording",
                        )
                    }
                }
                val name = if (recording) "Stop recording" else "Record a voice message"
                onNode(button(name)).performSemanticsAction(SemanticsActions.OnClick)
                waitForIdle()
                onNode(button(name)).assertExists()
                if (recording) {
                    onNode(member("RecordButton", "state" to "recording")).assertExists()
                    onNode(hasContentDescription("12 seconds")).assertExists()
                } else {
                    onNode(hasContentDescription("12 seconds")).assertDoesNotExist()
                }
            }
        }
        assertEquals(1, started)
        assertEquals(1, stopped)
    }
}
