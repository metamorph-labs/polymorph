// Image (`design/components/image.md`): a read-only picture, such as a
// photograph, a brand mark, artwork or a preview. It is not Avatar, a round
// identity mark, not ImageEditor, which crops, and not Icon, which draws a role.
//
// The picture is the app's image loader's (`LocalPMImageLoader`), drawn through
// the image gateway (`PMRemoteImage`), as Avatar's is. The member asks the
// loader itself, because it reads the painter: a painter with a size is a
// picture that has loaded.
//
// `width` and `height` are the picture's size in dp and `aspectRatio` a frame's
// ratio. With either, the member holds the box before the picture arrives: the
// given width at most and never wider than the room offered, at the ratio.
// With neither, it reserves nothing and then draws the picture at its own size,
// one dp to a pixel as the props count them, or at the width offered when that
// is less. `fit` shows all of the picture in the box or fills the box and
// crops; the picture is never stretched. The gateway fades it in.
//
// While the picture loads the box is the `bg.subtle` fill, still, as the
// platform's own image views draw a still placeholder. A Compose `Painter`
// reports a size and nothing about a failure, so a URL that fails stays in
// that state. The failed fallback, the same fill with the `error` glyph in
// `text.muted`, is drawn for an empty `src` and where the app provides no
// loader; with no box given it is `space.8` square.
//
// A picture with an `alt` is one image named by it, in every state, so the
// name is the same before and after a failure. An empty `alt` declares the
// picture decorative and hides it from accessibility.
//
// Not honoured, because the platform has no counterpart: `loading` (the app's
// loader decides when it fetches), `crossOrigin` (a request from an app has no
// origin to cross) and `referrerPolicy` (the request carries no referrer).

package dev.polymorph.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.geometry.isSpecified
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.role
import androidx.compose.ui.unit.dp

object PMImage : PMImageRendering {
    @Composable
    override fun Render(props: PMImageProps) {
        val theme = PM.theme
        val fit = props.fit ?: PMImageFit.Contain
        // Nothing to request for an empty `src`, so the loader is not asked.
        val painter = if (props.src.isEmpty()) null else LocalPMImageLoader.current.painter(props.src)
        val drawn = painter?.intrinsicSize?.takeIf { it.isSpecified && it.width > 0 && it.height > 0 }
        val outcome = when {
            painter == null -> Outcome.Failed
            drawn == null -> Outcome.Loading
            else -> Outcome.Loaded
        }
        val given = given(props)
        val ratio = props.aspectRatio?.takeIf { it > 0 }?.toFloat() ?: given?.let { it.width / it.height }
        val attributes = buildMap {
            put("fit", fit.value)
            if (outcome != Outcome.Loaded) put("state", outcome.value)
            if (ratio != null) put("sized", "true")
        }
        val alt = props.alt
        val fill = theme.colors.bgSubtle.color

        Box(
            Modifier
                .pmMember("Image", attributes)
                .then(
                    if (alt.isEmpty()) {
                        Modifier.clearAndSetSemantics { hideFromAccessibility() }
                    } else {
                        Modifier.clearAndSetSemantics {
                            contentDescription = alt
                            role = Role.Image
                        }
                    },
                )
                .then(
                    when {
                        // A held box: the given width at most, or all the room, at the ratio.
                        ratio != null -> (if (given != null) Modifier.width(given.width.dp) else Modifier.fillMaxWidth())
                            .aspectRatio(ratio)
                        // No box given: the picture's own, once it has one,
                        // inside the height offered too where Lightbox asks.
                        drawn != null && LocalPMImageFitsHeight.current -> Modifier
                            .widthIn(max = drawn.width.dp)
                            .heightIn(max = drawn.height.dp)
                            .aspectRatio(drawn.width / drawn.height)
                        drawn != null -> Modifier.width(drawn.width.dp).aspectRatio(drawn.width / drawn.height)
                        outcome == Outcome.Failed -> Modifier.size(theme.defaultDensity.spacing.s8)
                        else -> Modifier.size(0.dp)
                    },
                )
                .then(if (outcome == Outcome.Loaded) Modifier else Modifier.background(fill)),
            contentAlignment = Alignment.Center,
        ) {
            if (outcome == Outcome.Failed) {
                PMIconView(PMIconRole.Error, tint = theme.colors.textMuted.color)
            } else {
                PMRemoteImage(
                    painter,
                    Modifier.matchParentSize(),
                    scale = if (fit == PMImageFit.Cover) ContentScale.Crop else ContentScale.Fit,
                )
            }
        }
    }

    /** Where the request stands. A loaded picture is the rest state and names no state on the root, as on the web. */
    private enum class Outcome(val value: String) { Loading("loading"), Loaded("loaded"), Failed("failed") }

    /** `width` and `height`, when both are given and above zero. One alone gives no ratio and is ignored. */
    private fun given(props: PMImageProps): Size? {
        val width = props.width ?: return null
        val height = props.height ?: return null
        return if (width > 0 && height > 0) Size(width.toFloat(), height.toFloat()) else null
    }
}

/**
 * Whether a picture with no size given is fitted inside the height offered as
 * well as the width, as Lightbox fits each picture inside the window (the
 * web's `max-block-size` on Lightbox's picture). Off, it is as tall as its
 * width gives.
 */
internal val LocalPMImageFitsHeight = staticCompositionLocalOf { false }

/**
 * Image's states, from the spec's States table. The harness provides no image
 * loader, so an entry that shows a picture, or one still loading, provides a
 * loader of its own: a painter with a size, drawn in two theme colours so a
 * crop shows, or a painter without one. The entries without a loader are the
 * failed state. The decorative entries are hidden from accessibility, which
 * `hidden` tells the harness.
 */
object ImageStates : PMStates {
    override val member = "Image"

    private const val alt = "A harbour at dusk"
    private const val url = "https://example.com/harbour.png"

    /** A picture of 160 by 100 pixels: one colour to the left, another to the right. */
    private class Picture(private val left: Color, private val right: Color) : Painter() {
        override val intrinsicSize = Size(160f, 100f)

        override fun DrawScope.onDraw() {
            drawRect(right)
            drawRect(left, size = Size(size.width / 2, size.height))
        }
    }

    /** A picture that has not arrived: a painter with no size. */
    private object Pending : Painter() {
        override val intrinsicSize = Size.Unspecified

        override fun DrawScope.onDraw() {}
    }

    /** `content` under a loader whose picture has arrived. */
    @Composable
    private fun Loaded(content: @Composable () -> Unit) {
        val colors = PM.theme.colors
        val picture = Picture(colors.accentBg.color, colors.accentSubtle.color)
        CompositionLocalProvider(LocalPMImageLoader provides PMImageLoader { picture }, content = content)
    }

    /** `content` under a loader whose picture has not arrived. */
    @Composable
    private fun Loading(content: @Composable () -> Unit) {
        CompositionLocalProvider(LocalPMImageLoader provides PMImageLoader { Pending }, content = content)
    }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry(
                "a picture at its own size",
                expect = mapOf("fit" to "contain", "sized" to "true", "state" to "", "label" to alt),
            ) { Loaded { PMImage(alt = alt, height = 100.0, src = url, width = 160.0) } },
            PMStateEntry(
                "loading — the box is held before the picture arrives",
                expect = mapOf("state" to "loading", "sized" to "true", "label" to alt),
            ) { Loading { PMImage(alt = alt, height = 100.0, src = url, width = 160.0) } },
            PMStateEntry("decorative", expect = mapOf("hidden" to "true")) {
                Loaded { PMImage(alt = "", height = 100.0, src = url, width = 160.0) }
            },
            PMStateEntry("contained", expect = mapOf("fit" to "contain", "sized" to "true")) {
                Loaded { PMImage(alt = alt, aspectRatio = 1.0, height = 100.0, src = url, width = 160.0) }
            },
            PMStateEntry("cover", expect = mapOf("fit" to "cover", "sized" to "true")) {
                Loaded {
                    PMImage(alt = alt, aspectRatio = 1.0, fit = PMImageFit.Cover, height = 100.0, src = url, width = 160.0)
                }
            },
            PMStateEntry("a frame that takes its container", expect = mapOf("sized" to "true")) {
                Loaded { PMImage(alt = alt, aspectRatio = 2.0, src = url) }
            },
            PMStateEntry("no size given — the picture at its own size", expect = mapOf("sized" to "", "state" to "")) {
                Loaded { PMImage(alt = alt, src = url) }
            },
            PMStateEntry(
                "failed — a meaningful image",
                expect = mapOf("state" to "failed", "sized" to "true", "label" to alt),
            ) { PMImage(alt = alt, height = 100.0, src = "", width = 160.0) },
            PMStateEntry("failed — a decorative image", expect = mapOf("hidden" to "true")) {
                PMImage(alt = "", height = 100.0, src = "", width = 160.0)
            },
            PMStateEntry(
                "failed with no size given",
                expect = mapOf("state" to "failed", "sized" to "", "label" to alt),
            ) { PMImage(alt = alt, src = "") },
            PMStateEntry("failed — the app provides no loader", expect = mapOf("state" to "failed", "label" to alt)) {
                PMImage(alt = alt, height = 100.0, src = url, width = 160.0)
            },
        )
}
