// The parts that draw what is not a theme decision: a picture from a URL
// (`PMRemoteImage`, through the loader an app provides), a picture placed in a
// frame and that frame written as a file (`pmDrawFramed`, `pmFramedImage`,
// through the encoder an app provides), ImageEditor's, a colour that is a
// value (`PMHexColor`, ColorInput's), and a provider's mark (`PMBrandMark`,
// ProviderButton's, from the generated `Brands.kt`). Every law but
// conformance holds this file; the laws' exceptions name the two values here
// that are not the theme's, the colour model's white and black, and the one
// `Image` a picture is drawn with.

package dev.polymorph.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.size
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.geometry.isSpecified
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Canvas as BitmapCanvas
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawscope.CanvasDrawScope
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import kotlin.math.abs
import kotlin.math.roundToInt

/* Images ------------------------------------------------------------------- */

/**
 * How an app loads a picture from a URL: the painter its image loader gives
 * (Coil's `rememberAsyncImagePainter(url)`, for one), whose intrinsic size is
 * unknown until the picture has loaded. Compose has no loader of its own, and
 * a member module that fetched over the network would decide the app's
 * caching, so the app provides one through `LocalPMImageLoader`. Unprovided,
 * no picture loads, and a member draws its fallback (an Avatar's initials), as
 * it does for a URL that fails.
 */
fun interface PMImageLoader {
    @Composable
    fun painter(url: String): Painter?
}

/** The app's image loader; unprovided, none, and every member draws its fallback. */
val LocalPMImageLoader = staticCompositionLocalOf { PMImageLoader { null } }

/**
 * The image gateway: the picture at `url`, cropped to fill the box `modifier`
 * gives, drawn over what is under it, so a member's fallback shows until the
 * picture arrives and stays when it never does. The picture fades in over the
 * control duration on the enter easing once it has loaded, and `frame`, when
 * given, draws the recipes' hairline in `border.subtle` around it in that
 * shape, the containment a photo needs on every surface. `fallback`, when
 * given, is drawn while there is no picture: before it loads, when it fails,
 * and when the app has no loader (Markdown's alt text). Decorative: the member
 * that draws it names it. Members draw a picture only through this
 * composable.
 */
@Composable
fun PMRemoteImage(url: String, modifier: Modifier = Modifier, frame: Shape? = null, fallback: (@Composable () -> Unit)? = null) {
    PMRemoteImage(LocalPMImageLoader.current.painter(url), modifier, frame, ContentScale.Crop, fallback)
}

/**
 * The same gateway for a member that asked the loader itself, because it reads
 * the painter: Image lays its box out from the picture's size and names the
 * state the request is in. A null `painter` is no picture at all. `scale` is
 * how the picture sits in the box `modifier` gives: cropped to fill it, or
 * whole inside it.
 */
@Composable
fun PMRemoteImage(
    painter: Painter?,
    modifier: Modifier = Modifier,
    frame: Shape? = null,
    scale: ContentScale = ContentScale.Crop,
    fallback: (@Composable () -> Unit)? = null,
) {
    if (painter == null) {
        fallback?.invoke()
        return
    }
    val theme = PM.theme
    val motion = theme.defaultMotion
    val loaded = painter.intrinsicSize.isSpecified
    if (!loaded) fallback?.invoke()
    val shown by animateFloatAsState(
        targetValue = if (loaded) 1f else 0f,
        animationSpec = motion.easing.enter.tween(motion.duration.control),
        label = "image",
    )
    val edge = theme.colors.borderSubtle.color
    Image(
        painter = painter,
        contentDescription = null,
        contentScale = scale,
        modifier = modifier
            .graphicsLayer { alpha = shown }
            .then(if (frame != null && loaded) Modifier.border(PMGeometry.hairline, edge, frame) else Modifier),
    )
}


/* A framed picture --------------------------------------------------------- */

/**
 * How an app writes a picture as the bytes of an image file: Android's
 * `Bitmap.compress` through `asAndroidBitmap()`, or Skia's `encodeToData` on
 * the desktop. Compose has no encoder that runs on both of this module's
 * targets, so the app provides one through `LocalPMImageEncoder`, as it
 * provides its image loader. `type` is the file's media type (`image/png`,
 * `image/jpeg`, `image/webp`); the result is null where the encoder cannot
 * write it.
 */
fun interface PMImageEncoder {
    fun encode(image: ImageBitmap, type: String): ByteArray?
}

/** The app's image encoder; unprovided, none, and ImageEditor's confirm hands nothing over. */
val LocalPMImageEncoder = staticCompositionLocalOf<PMImageEncoder?> { null }

/**
 * A picture placed by ImageEditor's law of the frame (`image-editor.md`): its
 * centre at `center`, turned clockwise by `degrees`, mirrored about its own
 * vertical axis before the turn when `mirror` is -1, and drawn at `scale` of
 * its natural size, `natural`. The stage and the export draw through this one
 * function, so the file holds the frame the person saw.
 */
fun DrawScope.pmDrawFramed(painter: Painter, natural: Size, center: Offset, degrees: Float, mirror: Float, scale: Float) {
    translate(center.x, center.y) {
        rotate(degrees, pivot = Offset.Zero) {
            scale(scaleX = mirror * scale, scaleY = scale, pivot = Offset.Zero) {
                translate(-natural.width / 2, -natural.height / 2) {
                    with(painter) { draw(natural) }
                }
            }
        }
    }
}

/**
 * The picture framed onto a bitmap `width` by `height` pixels, never from the
 * screen: `draw` places it in the bitmap's own pixels, through
 * `pmDrawFramed`.
 */
fun pmFramedImage(width: Int, height: Int, density: Density, draw: DrawScope.() -> Unit): ImageBitmap {
    val image = ImageBitmap(width, height)
    CanvasDrawScope().draw(density, LayoutDirection.Ltr, BitmapCanvas(image), Size(width.toFloat(), height.toFloat()), draw)
    return image
}


/* Colour as data ----------------------------------------------------------- */

/**
 * A colour that is a value, not a theme decision: ColorInput's hex and the
 * picker's plane and rails, which the colour model draws (`color-input.md`:
 * "data, not theme"). Hex is lowercase `#rrggbb`, or `#rrggbbaa` with alpha;
 * three digits are accepted too, with or without the `#`. Hue is in degrees,
 * and saturation, brightness and alpha run from 0 to 1.
 */
object PMHexColor {
    /** The channels a hex names, each from 0 to 1, or null when it names none. */
    private fun channels(hex: String): FloatArray? {
        var digits = hex.trim().lowercase().removePrefix("#")
        if (digits.isEmpty() || !digits.all { it in '0'..'9' || it in 'a'..'f' }) return null
        if (digits.length == 3) digits = digits.map { "$it$it" }.joinToString("")
        if (digits.length != 6 && digits.length != 8) return null
        val bytes = digits.chunked(2).map { it.toInt(16) / 255f }
        return floatArrayOf(bytes[0], bytes[1], bytes[2], bytes.getOrElse(3) { 1f })
    }

    /** The hex in its one form: lowercase, six digits, or eight with `alpha`; null when it names no colour. */
    fun normalized(hex: String, alpha: Boolean): String? = channels(hex)?.let { of(it[0], it[1], it[2], if (alpha) it[3] else 1f, alpha) }

    /** The colour a hex names, or null. */
    fun color(hex: String): Color? = channels(hex)?.let { Color(it[0], it[1], it[2], it[3]) }

    /** Hue, saturation, brightness and alpha of a hex, or null. */
    fun hsva(hex: String): FloatArray? {
        val c = channels(hex) ?: return null
        val max = maxOf(c[0], c[1], c[2])
        val min = minOf(c[0], c[1], c[2])
        val delta = max - min
        val hue = when {
            delta == 0f -> 0f
            max == c[0] -> 60f * (((c[1] - c[2]) / delta).mod(6f))
            max == c[1] -> 60f * ((c[2] - c[0]) / delta + 2f)
            else -> 60f * ((c[0] - c[1]) / delta + 4f)
        }
        return floatArrayOf(hue, if (max == 0f) 0f else delta / max, max, c[3])
    }

    /** The hex of a hue, saturation, brightness and alpha, with or without the alpha digits. */
    fun fromHsva(hue: Float, saturation: Float, value: Float, alpha: Float, withAlpha: Boolean): String {
        val c = value * saturation
        val x = c * (1 - abs((hue / 60f).mod(2f) - 1))
        val m = value - c
        val (r, g, b) = when ((hue.mod(360f) / 60f).toInt()) {
            0 -> Triple(c, x, 0f)
            1 -> Triple(x, c, 0f)
            2 -> Triple(0f, c, x)
            3 -> Triple(0f, x, c)
            4 -> Triple(x, 0f, c)
            else -> Triple(c, 0f, x)
        }
        return of(r + m, g + m, b + m, alpha, withAlpha)
    }

    /** The pure colour of a hue, at full saturation and brightness. */
    fun hue(degrees: Float): Color = color(fromHsva(degrees, 1f, 1f, 1f, false)) ?: Color.Transparent

    /** The colour of the hex with its alpha set to `alpha`. */
    fun withAlpha(hex: String, alpha: Float): Color = (color(hex) ?: Color.Transparent).copy(alpha = alpha)

    /**
     * The saturation and brightness plane of a hue, as two layers drawn in
     * order: white to the pure hue across, then transparent to black down.
     */
    fun plane(hue: Float): List<Brush> = listOf(
        Brush.horizontalGradient(listOf(Color.White, hue(hue))),
        Brush.verticalGradient(listOf(Color.Transparent, Color.Black)),
    )

    /** The hue rail: every hue across, red to red. */
    val hues: Brush = Brush.horizontalGradient((0..6).map { hue(it * 60f) })

    /** The alpha rail of a colour: transparent to opaque across. */
    fun fade(hex: String): Brush = Brush.horizontalGradient(listOf(withAlpha(hex, 0f), withAlpha(hex, 1f)))

    private fun of(r: Float, g: Float, b: Float, a: Float, alpha: Boolean): String {
        val byte = { v: Float -> (v.coerceIn(0f, 1f) * 255).roundToInt().toString(16).padStart(2, '0') }
        return "#" + byte(r) + byte(g) + byte(b) + if (alpha) byte(a) else ""
    }
}


/* Brand marks -------------------------------------------------------------- */

/**
 * A provider's mark (`design/components/icon.md`, brand marks): not an icon
 * role, because its geometry and colours are the provider's, fixed by its
 * brand terms. The drawings are generated into `Brands.kt` from the engine's
 * `BRAND_DRAWINGS` (`packages/engine/src/icon/brands.ts`), path for path with
 * the providers' published colours, as the SwiftUI package's are; GitHub's
 * terms make its mark one colour, so it takes `tint`, the text colour. A mark
 * fills the box of an icon at `size`, inside the same clear margin, and is
 * decorative beside the label that names the provider. Disabled, it is
 * desaturated and drawn at the recipe's opacity as a whole
 * (`PMRecipe.brandMarkDisabledOpacity`), never repainted in a theme colour.
 */
@Composable
fun PMBrandMark(
    provider: PMProviderButtonProvider,
    size: PMControlSize,
    modifier: Modifier = Modifier,
    disabled: Boolean = false,
    tint: Color = LocalContentColor.current,
) {
    val icons = PM.theme.icon
    val box = when (size) {
        PMControlSize.Sm -> icons.sm.size
        PMControlSize.Md -> icons.md.size
        PMControlSize.Lg -> icons.lg.size
    }.dp
    val drawing = provider.brandDrawing
    val paths = remember(provider) { drawing.paths.map { PathParser().parsePathString(it.d).toPath() to it.fill } }
    val filter = if (disabled) ColorFilter.colorMatrix(ColorMatrix().apply { setToSaturation(0f) }) else null
    Canvas(
        modifier
            .size(box)
            .semantics { hideFromAccessibility() }
            .graphicsLayer { alpha = if (disabled) PMRecipe.brandMarkDisabledOpacity else 1f },
    ) {
        val clear = this.size.minDimension * BRAND_CLEARANCE
        val inner = this.size.minDimension - clear * 2
        val scale = inner / maxOf(drawing.width, drawing.height)
        translate(clear + (inner - drawing.width * scale) / 2, clear + (inner - drawing.height * scale) / 2) {
            scale(scale, pivot = Offset.Zero) {
                for ((path, fill) in paths) drawPath(path, fill ?: tint, colorFilter = filter)
            }
        }
    }
}

/**
 * The clear margin a mark keeps on every side, as a share of its box: an
 * icon's grid keeps 2 of its 24 units clear, and a mark keeps the same.
 */
private const val BRAND_CLEARANCE = 2f / 24f

/** A brand mark's drawing: its view box, from the origin, and its paths. `Brands.kt` holds each provider's. */
class PMBrandDrawing(val width: Float, val height: Float, val paths: List<PMBrandPath>)

/** One path of a brand mark: its SVG `d`, and its fill, the provider's colour, or null for the text colour. */
class PMBrandPath(val d: String, val fill: Color?)
