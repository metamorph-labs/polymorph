package dev.polymorph.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.ImageComposeScene
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import dev.polymorph.tokens.PMTheme
import dev.polymorph.tokens.PMThemes
import java.io.File
import kotlin.math.ceil

/**
 * What every harness test shares: the pairings an entry is rendered under, the
 * size it is rendered at, and how an entry is named on disk. The scenes are
 * Compose for desktop's `ImageComposeScene`, which composes, lays out, draws
 * and publishes semantics without a window or an Android SDK.
 */
object Harness {
    /** The canvas's width in dp, and the least height an entry is given. */
    const val WIDTH = 360
    const val SHORTEST = 120

    /** The most height an entry is given: a phone's screen, so a page archetype's state shows whole. */
    const val TALLEST = 844

    /** Pixels per dp in the rendered PNGs. */
    const val SCALE = 2f

    /** A moment by which every enter transition has finished, in nanoseconds. */
    const val SETTLED = 2_000_000_000L

    /** One frame at sixty frames a second, in nanoseconds. */
    const val FRAME = 16_666_667L

    /** The frames drawn a frame apart before the scene is left to settle. */
    const val OPENING_FRAMES = 4

    /**
     * Draws `scene` until it settles: a first frame, which composes and runs
     * the effects; three more, a frame apart, in which work that waits a frame
     * for a layout takes its steps (a bottom sheet measures where it rests
     * before it starts to rise); then one a while later, in which what the
     * effects started (an overlay's enter transition) runs, and a last, as long
     * after, by which it has finished.
     */
    fun settle(scene: ImageComposeScene): org.jetbrains.skia.Image {
        for (frame in 0 until OPENING_FRAMES) scene.render(frame * FRAME)
        scene.render(SETTLED)
        return scene.render(SETTLED * 2)
    }

    /** One way of rendering an entry: a pairing, a mode and a layout direction. */
    data class Pass(val name: String, val theme: PMTheme, val dark: Boolean, val rtl: Boolean = false)

    /**
     * The default pairing in light mode, laid out right to left
     * (`docs/native.md`, "Right to left"): the third pass.
     */
    val rightToLeft: Pass =
        Pass("${slug(PMThemes.default.pairing.name)}-light-rtl", PMThemes.default, dark = false, rtl = true)

    /**
     * The default pairing in light mode; the first pairing whose system
     * defaults to dark, in dark mode (the default pairing in dark mode when no
     * system does); and the default pairing in light mode right to left.
     */
    val passes: List<Pass> = run {
        val base = PMThemes.default
        val dark = PMThemes.catalogue.firstOrNull { it.pairing.defaultMode == "dark" } ?: base
        listOf(
            Pass("${slug(base.pairing.name)}-light", base, dark = false),
            Pass("${slug(dark.pairing.name)}-dark", dark, dark = true),
            rightToLeft,
        )
    }

    /** The pairing, the mode and the layout direction around `content`, on the pairing's app background. */
    @Composable
    fun Scene(pass: Pass, content: @Composable () -> Unit) {
        CompositionLocalProvider(
            LocalPMTheme provides pass.theme,
            LocalPMDark provides pass.dark,
            LocalLayoutDirection provides if (pass.rtl) LayoutDirection.Rtl else LayoutDirection.Ltr,
        ) {
            Box(Modifier.fillMaxSize().background(pass.theme.colors.bgApp.resolve(pass.dark).color)) {
                content()
            }
        }
    }

    /**
     * The height an entry is drawn at, in dp: its own height at the canvas's
     * width, from `SHORTEST` up to `TALLEST`. A short member keeps the canvas;
     * a tall one (a card, a page) is not cut off.
     */
    fun height(entry: PMStateEntry, pass: Pass): Int {
        var measured = 0
        val scene = ImageComposeScene(px(WIDTH), px(TALLEST), Density(SCALE)) {
            Scene(pass) {
                Box(
                    Modifier
                        .width(WIDTH.dp)
                        .heightIn(max = TALLEST.dp)
                        .wrapContentHeight(unbounded = false)
                        .onSizeChanged { measured = it.height },
                ) { entry.render() }
            }
        }
        try {
            settle(scene)
        } finally {
            scene.close()
        }
        val dp = ceil(measured / SCALE).toInt()
        return dp.coerceIn(SHORTEST, TALLEST)
    }

    /**
     * The fixtures a run renders: every fixture, or only the members the
     * `pm.members` system property names, comma-separated, which the build
     * sets from the Gradle property of the same name
     * (`./gradlew :ui:jvmTest -Ppm.members=Menu,Popover`), so work on one member
     * renders that member alone. The gate sets none. A name no fixture
     * carries stops the run, so a misspelt member never passes with nothing
     * checked.
     */
    val fixtures: List<PMStates> = run {
        val only = System.getProperty("pm.members")?.split(",")?.map { it.trim() }?.filter { it.isNotEmpty() }
        if (only.isNullOrEmpty()) {
            PMFixtures.all
        } else {
            val unknown = only - PMFixtures.all.map { it.member }.toSet()
            require(unknown.isEmpty()) { "pm.members names no fixture: ${unknown.joinToString(", ")}" }
            PMFixtures.all.filter { it.member in only }
        }
    }

    /** `dp` in the rendered PNGs' pixels. */
    fun px(dp: Int): Int = (dp * SCALE).toInt()

    /** A scene of `entry` under `pass`, `height` dp tall, settled. The caller closes it. */
    fun scene(entry: PMStateEntry?, pass: Pass, height: Int): ImageComposeScene =
        ImageComposeScene(px(WIDTH), px(height), Density(SCALE)) {
            Scene(pass) { entry?.render?.invoke() }
        }

    /** `soft / neutral` → `soft-neutral`. */
    fun slug(name: String): String =
        name.lowercase().split(Regex("[^\\p{L}\\p{N}]+")).filter { it.isNotEmpty() }.joinToString("-")

    /** `platforms/android`, where the snapshots go whichever directory the tests run from. */
    val moduleRoot: File = run {
        var dir: File? = File("").absoluteFile
        while (dir != null && !File(dir, "settings.gradle.kts").exists()) dir = dir.parentFile
        dir ?: File("").absoluteFile
    }

    /** Where a person looks at the renders: gitignored, rewritten each run. */
    val snapshots: File = File(moduleRoot, ".snapshots")
}
