// AudioPlayer (`design/components/audio-player.md`): plays one recording, a
// voice message in a conversation or a recorded call in a ticket. One row,
// `space.3` apart, centred, as wide as its container: the play Button,
// Button's soft/accent/md icon-only, named by what a press does ("Play" with
// `run`, "Pause" with `pause`); the scrubber, Slider from zero to the
// recording's whole seconds by one-second steps, taking the room left and no
// narrower than `space.10`; and the time, the elapsed time and, once the
// length is known, a `text.muted` slash and the total, `space.1` apart, in
// `text.sm` `text.secondary` with tabular figures. The time is hidden from
// TalkBack, because the scrubber says the same.
//
// The player is the platform's media player, which the app provides
// (`LocalPMAudioEngine`, `PolymorphUIAudio.kt`), because this module's common
// source set cannot hold one. The recording is opened when the member is
// composed, so its length is known before a press, and a new `src` starts
// from nothing. The total is the file's finite length, else `duration`, else
// unknown: then the time shows the elapsed time alone and the scrubber is
// disabled, as it is for a recording under a second. A press plays or pauses,
// and after the end plays from the start. Starting one player pauses every
// other AudioPlayer in the app, because two recordings that play over each
// other cannot be followed. `onPlay` is called when playback starts and
// `onEnded` when it reaches the end. While the scrubber is dragged the clock
// follows it, and the recording moves when it is let go; TalkBack's
// adjustments move it a second at a time. A player that leaves the
// composition pauses and lets go of its recording.
//
// When the file cannot be loaded, the scrubber and the time give way to the
// `error` glyph in `danger.text` and `messages.failed`; the Button stays
// enabled, and a press asks for the file again. TalkBack reads the words after
// the Button, because Compose has no relation that describes one node by
// another. An empty `src`, or no engine, is failed from the start and disables
// the Button. The clock's digits are Western, and `locale` reaches the app's
// words for the spoken lengths (`PolymorphUIClock.kt`).
//
// The root is a traversal group named by `label`, and carries `state`
// playing, ended or failed. Nothing in the player is announced: the Button's
// new name is what TalkBack reads when a press changes it.

package dev.polymorph.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics

object PMAudioPlayer : PMAudioPlayerRendering {
    @Composable
    override fun Render(props: PMAudioPlayerProps) {
        val theme = PM.theme
        val colors = theme.colors
        val space = theme.defaultDensity.spacing
        val messages = props.messages ?: PMSpecDefault.strings.audioPlayerMessages
        val engine = LocalPMAudioEngine.current
        val units = pmSpokenUnits(props.locale)
        val onPlay by rememberUpdatedState(props.onPlay)
        val onEnded by rememberUpdatedState(props.onEnded)
        val playback = remember(props.src, engine) { PMAudioPlayback() }
        // The second the scrubber is dragged to, until it is let go.
        var scrub by remember(playback) { mutableStateOf<Double?>(null) }
        DisposableEffect(playback) {
            playback.open(engine, props.src, onPlay = { onPlay?.invoke() }, onEnded = { onEnded?.invoke() })
            onDispose { playback.close() }
        }

        val known = playback.length ?: length(props.duration)
        val total = PMClock.whole(known ?: 0.0).toDouble()
        val unavailable = props.src.isEmpty() || engine == null
        val failing = unavailable || playback.failed
        val seekable = !failing && total >= 1
        val position = if (playback.ended) total else minOf(scrub ?: playback.elapsed.toDouble(), total)
        // Failed first: a failed player is neither playing nor ended.
        val attributes = when {
            failing -> mapOf("state" to "failed")
            playback.playing -> mapOf("state" to "playing")
            playback.ended -> mapOf("state" to "ended")
            else -> emptyMap()
        }
        val spoken = { second: Double ->
            val elapsed = PMClock.words(second, units)
            if (known == null) elapsed else messages.position(elapsed, PMClock.words(total, units))
        }

        Row(
            Modifier
                .pmMember("AudioPlayer", attributes)
                .semantics {
                    contentDescription = props.label
                    isTraversalGroup = true
                }
                .fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(space.s3),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PMButton(
                disabled = unavailable,
                icon = if (playback.playing) PMIconRole.Pause else PMIconRole.Run,
                iconOnly = true,
                label = if (playback.playing) messages.pause else messages.play,
                onClick = { playback.toggle() },
                size = PMControlSize.Md,
                appearance = PMButtonAppearance.SoftAccent,
            )
            if (failing) {
                Row(
                    Modifier.weight(1f),
                    horizontalArrangement = Arrangement.spacedBy(space.s2),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    PMIconView(PMIconRole.Error, PMControlSize.Sm, tint = colors.dangerText.color)
                    Text(messages.failed, style = theme.text.sm.textStyle, color = colors.textSecondary.color)
                }
            } else {
                Box(Modifier.weight(1f).widthIn(min = space.s10)) {
                    PMSlider(
                        ariaLabel = messages.scrubber,
                        disabled = !seekable,
                        formatValue = spoken,
                        max = if (seekable) total else 1.0,
                        min = 0.0,
                        onChange = { value -> (value as? PMSliderValue.Single)?.let { scrub = it.value } },
                        onCommit = { value ->
                            (value as? PMSliderValue.Single)?.let {
                                scrub = null
                                playback.seek(it.value)
                            }
                        },
                        step = 1.0,
                        value = PMSliderValue.Single(if (seekable) position else 0.0),
                    )
                }
                Row(
                    Modifier.clearAndSetSemantics { hideFromAccessibility() },
                    horizontalArrangement = Arrangement.spacedBy(space.s1),
                ) {
                    val style = theme.text.sm.textStyle.tabular(theme)
                    Text(PMClock.digits(position), style = style, color = colors.textSecondary.color, softWrap = false)
                    if (known != null) {
                        Text("/", style = style, color = colors.textMuted.color, softWrap = false)
                        Text(PMClock.digits(total), style = style, color = colors.textSecondary.color, softWrap = false)
                    }
                }
            }
        }
    }

    /** A length the file or the app gave, or none: not finite, or not above zero. */
    fun length(seconds: Double?): Double? = seconds?.takeIf { it.isFinite() && it > 0 }
}

/**
 * One recording through the app's engine: what the member draws from it and
 * what it asks of it. Its state follows the engine's events.
 */
private class PMAudioPlayback : PMAudioEvents {
    var playing by mutableStateOf(false)
        private set
    var ended by mutableStateOf(false)
        private set

    /** Whole seconds played, as the clock shows them. */
    var elapsed by mutableLongStateOf(0L)
        private set

    /** The file's own finite length in seconds, once it gives one. */
    var length by mutableStateOf<Double?>(null)
        private set
    var failed by mutableStateOf(false)
        private set
    private var media: PMAudioMedia? = null
    private var onPlay: () -> Unit = {}
    private var onEnded: () -> Unit = {}

    fun open(engine: PMAudioEngine?, src: String, onPlay: () -> Unit, onEnded: () -> Unit) {
        this.onPlay = onPlay
        this.onEnded = onEnded
        if (engine == null || src.isEmpty()) return
        players += this
        media = engine.open(src, this)
    }

    fun close() {
        players -= this
        media?.pause()
        media?.release()
        media = null
    }

    /**
     * Plays a paused recording, from the start after its end, and pauses one
     * that plays. On a failed recording a press asks for the file again,
     * because a failure is about one request.
     */
    fun toggle() {
        val media = media ?: return
        when {
            playing -> media.pause()
            failed -> {
                failed = false
                media.reload()
                media.play()
            }
            else -> {
                if (ended) {
                    ended = false
                    elapsed = 0L
                    media.seek(0.0)
                }
                media.play()
            }
        }
    }

    /** Moves the recording to a whole second, leaving the ended state. */
    fun seek(second: Double) {
        elapsed = PMClock.whole(second)
        ended = false
        media?.seek(elapsed.toDouble())
    }

    override fun length(seconds: Double) {
        length = PMAudioPlayer.length(seconds)
    }

    override fun time(seconds: Double) {
        if (!ended) elapsed = PMClock.whole(seconds)
    }

    override fun playing() {
        if (playing) return
        playing = true
        ended = false
        for (other in players.toList()) if (other !== this && other.playing) other.media?.pause()
        onPlay()
    }

    override fun paused() {
        playing = false
    }

    override fun ended() {
        playing = false
        ended = true
        onEnded()
    }

    override fun failed() {
        failed = true
        playing = false
    }

    companion object {
        /** Every open player in the app, so starting one pauses the others. */
        private val players = mutableSetOf<PMAudioPlayback>()
    }
}

/**
 * AudioPlayer's states, from the spec's States table. The harness provides no
 * engine, so the entries provide one that reports each recording's length and
 * plays nothing; no entry is pressed. The last entry has no engine, which is
 * the failed state.
 */
object AudioPlayerStates : PMStates {
    override val member = "AudioPlayer"

    private const val ada = "https://example.com/voice-ada.m4a"
    private const val grace = "https://example.com/voice-grace.m4a"
    private const val call = "https://example.com/call-4182.m4a"

    private val lengths = mapOf(ada to 18.0, grace to 7.0, call to 18.0)

    /** An engine that gives each recording its length and plays nothing. */
    private val silent = PMAudioEngine { url, events ->
        lengths[url]?.let(events::length)
        object : PMAudioMedia {
            override fun play() {}

            override fun pause() {}

            override fun seek(seconds: Double) {}

            override fun reload() {}

            override fun release() {}
        }
    }

    private val german = PMAudioPlayerMessages(
        play = "Abspielen",
        pause = "Pause",
        scrubber = "Wiedergabeposition",
        position = { elapsed, total -> "$elapsed von $total" },
        failed = "Die Aufnahme konnte nicht geladen werden",
    )

    @Composable
    private fun Silent(content: @Composable () -> Unit) {
        CompositionLocalProvider(LocalPMAudioEngine provides silent, content = content)
    }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry(
                "rest — a voice message whose length the app knows",
                expect = mapOf("state" to "", "label" to "Voice message from Ada"),
            ) { Silent { PMAudioPlayer(duration = 18.0, label = "Voice message from Ada", src = ada) } },
            PMStateEntry("the file’s own length — no duration passed", expect = mapOf("state" to "")) {
                Silent { PMAudioPlayer(label = "Recorded call, ticket 4182", src = call) }
            },
            PMStateEntry(
                "localized — the clock and the spoken position in German",
                expect = mapOf("label" to "Sprachnachricht von Ada"),
            ) {
                Silent {
                    PMAudioPlayer(duration = 18.0, label = "Sprachnachricht von Ada", locale = "de-DE", messages = german, src = ada)
                }
            },
            PMStateEntry("two players — starting one pauses the other") {
                Silent {
                    Column(verticalArrangement = Arrangement.spacedBy(PM.theme.defaultDensity.spacing.s4)) {
                        PMAudioPlayer(duration = 18.0, label = "Voice message from Ada", src = ada)
                        PMAudioPlayer(duration = 7.0, label = "Voice message from Grace", src = grace)
                    }
                }
            },
            PMStateEntry("failed — no file to load", expect = mapOf("state" to "failed", "label" to "Voice message from Ada")) {
                Silent { PMAudioPlayer(duration = 18.0, label = "Voice message from Ada", src = "") }
            },
            PMStateEntry("failed — the app provides no player", expect = mapOf("state" to "failed")) {
                PMAudioPlayer(duration = 18.0, label = "Voice message from Ada", src = ada)
            },
        )
}
