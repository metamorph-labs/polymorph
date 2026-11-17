// How an app plays a recording: AudioPlayer drives the platform's media
// player through the calls here, and the app provides it
// (`LocalPMAudioEngine`), as it provides its image loader. This module's
// common source set compiles for the JVM as well as for Android, and neither
// Android's `MediaPlayer` nor Media3's `ExoPlayer` exists on the JVM, so a
// member cannot hold one itself. Unprovided, nothing can be loaded, and every
// AudioPlayer shows its failed state with its Button disabled. The calls and
// the events are the web's media element's: play, pause, a seek and a new
// request; the file's length, the time, playing, paused, the end and a
// failure.

package dev.polymorph.ui

import androidx.compose.runtime.staticCompositionLocalOf

/**
 * The platform's media player behind AudioPlayer: an app implements it over
 * `MediaPlayer` or Media3's `ExoPlayer` and provides it through
 * `LocalPMAudioEngine`. `open` starts loading the recording at `url`, as far
 * as its length (the web's `preload="metadata"`), and reports what happens to
 * it through `events`, on the main thread.
 */
fun interface PMAudioEngine {
    fun open(url: String, events: PMAudioEvents): PMAudioMedia
}

/** What an open recording reports, as a media element's events do. */
interface PMAudioEvents {
    /** The file's length in seconds, once it gives one; a length that is not finite is none. */
    fun length(seconds: Double)

    /** Where playback is, in seconds, at least once a second while it plays, and after a seek. */
    fun time(seconds: Double)

    /** Playback started, after `play` or by the system. */
    fun playing()

    /** Playback paused, after `pause` or by the system, as for a call or another app's audio. */
    fun paused()

    /** Playback reached the end. */
    fun ended()

    /** The file could not be loaded or played. */
    fun failed()
}

/** One open recording: what AudioPlayer asks of it. */
interface PMAudioMedia {
    fun play()

    fun pause()

    /** Moves playback to `seconds`, a whole second. */
    fun seek(seconds: Double)

    /** Asks for the file again, after a failure. */
    fun reload()

    /** Lets go of the recording: its player has left the screen, or has a new `src`. */
    fun release()
}

/** The app's media player for AudioPlayer; unprovided, none, and every player shows its failed state. */
val LocalPMAudioEngine = staticCompositionLocalOf<PMAudioEngine?> { null }
