// Lightbox (`design/components/lightbox.md`): a picture opened large over the
// screen, fitted inside it with nothing cropped, with previous and next when
// there are several.
//
// The trigger stays where the screen puts it; the lightbox puts its opening
// action in `LocalPMTriggerAction`, and Button runs it after its own action,
// as Dialog's does. Opening presents the panel in a Compose `Dialog` window
// that fills the screen, which takes the back gesture and makes the rest of
// the screen inert to TalkBack. The window draws the scrim, and its colour is
// the platform's, as Dialog's is: the platform dims behind a dialog window,
// and a scrim drawn inside it as well would darken the screen twice. An empty
// list opens nothing. `open` with `onOpenChange` is the controlled form;
// `defaultOpen` opens it on its own.
//
// Each picture is Image, through the app's image loader, fitted inside the
// window's safe area less `space.4` on each side and never drawn past its own
// size. The pictures are Compose's pager (`HorizontalPager`), one picture a
// page, so a swipe moves to the next picture as it does in the platform's
// photo viewers. A pinch zooms the picture shown up to four times its fitted
// size, a drag pans it while it is zoomed and the pager stops paging, a double
// tap returns it over the control duration, and a move to another picture
// returns it at once. The controls float over the picture, each on a backing
// (`bg.overlay`, a `border.subtle` hairline, `radius.control`, the transient
// shadow) around Button's ghost/neutral/sm icon-only: close at the top end,
// previous and next at the start and end edges, and the position ("2 of 3",
// `text.sm`) centred at the foot. Each Button keeps the platform's touch area
// inside its backing. Right to left, previous sits at the right edge and its
// arrow, an auto-mirrored glyph, points right. One picture draws no previous,
// next or position.
//
// `index` with `onIndexChange` is the controlled position; `defaultIndex` sets
// where an uncontrolled lightbox starts, and the position is kept when it
// closes. Previous on the first picture and next on the last are disabled. A
// hardware keyboard's left and right arrows move one picture by the layout's
// direction, a key with a modifier is left alone, and Escape closes. So do the
// close Button, a tap beside the picture and the back gesture; a tap on the
// picture or a control does not. The window's pane is named by `label`. The
// position is a polite live region, so TalkBack says it when the picture
// changes and not when the window opens.
//
// Where the platform's own photo viewer differs from the web, it decides: a
// swipe moves between pictures, and a pinch zooms the picture in the window,
// because an app's window does not zoom as a browser's does.

package dev.polymorph.ui

import androidx.compose.animation.core.animate
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.rememberTransformableState
import androidx.compose.foundation.gestures.transformable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEvent
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isAltPressed
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.isMetaPressed
import androidx.compose.ui.input.key.isShiftPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.launch

object PMLightbox : PMLightboxRendering {
    @Composable
    override fun Render(props: PMLightboxProps) {
        val count = props.images.size
        var own by remember { mutableStateOf(props.defaultOpen ?: false) }
        var mirror by remember { mutableIntStateOf(clamp(props.defaultIndex ?: 0.0, count)) }
        // An empty list has nothing to show, so the window never opens for it.
        val open = (props.open ?: own) && count > 0
        val index = clamp(props.index ?: mirror.toDouble(), count)
        val setOpen: (Boolean) -> Unit = { next ->
            if (!next || count > 0) {
                own = next
                props.onOpenChange?.invoke(next)
            }
        }
        val travel: (Int) -> Unit = { to ->
            if (to in 0 until count && to != index) {
                mirror = to
                props.onIndexChange?.invoke(to.toDouble())
            }
        }

        Box(Modifier.pmMember("Lightbox", mapOf("state" to if (open) "open" else "closed"))) {
            PMOverlayTrigger(props.trigger) { setOpen(true) }
        }
        if (open) {
            Dialog(
                onDismissRequest = { setOpen(false) },
                properties = DialogProperties(usePlatformDefaultWidth = false),
            ) {
                PMOverlayContent {
                    PMLightboxPanel(props, index, travel) { setOpen(false) }
                }
            }
        }
    }

    /** The index clamped to the list, as Carousel's is. */
    fun clamp(value: Double, count: Int): Int = value.toInt().coerceIn(0, maxOf(count - 1, 0))
}

/**
 * The panel the window holds: the pictures, a tap beside them closing, and
 * the controls over them.
 */
@Composable
private fun PMLightboxPanel(props: PMLightboxProps, index: Int, travel: (Int) -> Unit, close: () -> Unit) {
    val theme = PM.theme
    val space = theme.defaultDensity.spacing
    val motion = theme.defaultMotion
    val messages = props.messages ?: PMSpecDefault.strings.lightboxMessages
    val count = props.images.size
    val several = count > 1
    val rtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    val pager = rememberPagerState(initialPage = index) { count }
    val scope = rememberCoroutineScope()
    var zoom by remember { mutableFloatStateOf(1f) }
    var pan by remember { mutableStateOf(Offset.Zero) }
    val keys = remember { FocusRequester() }
    val shown by rememberUpdatedState(index)
    val move by rememberUpdatedState(travel)

    // A move the Buttons, the keys or the app made: the new picture replaces
    // the old in one frame, at its fitted size.
    LaunchedEffect(index) {
        zoom = 1f
        pan = Offset.Zero
        if (pager.currentPage != index) pager.scrollToPage(index)
    }
    // A swipe settled on a picture: the position follows it and is reported.
    LaunchedEffect(pager) {
        snapshotFlow { pager.settledPage }.collect { page -> if (page != shown) move(page) }
    }
    LaunchedEffect(Unit) { keys.requestFocus() }

    val zooming = rememberTransformableState { _, zoomChange, panChange, _ ->
        // Four times the fitted size at most, ImageEditor's default reach.
        zoom = (zoom * zoomChange).coerceIn(1f, 4f)
        pan = if (zoom > 1f) pan + panChange else Offset.Zero
    }
    val unzoom: () -> Unit = {
        val from = zoom
        val start = pan
        scope.launch {
            animate(from, 1f, animationSpec = motion.easing.standard.tween(motion.duration.control)) { value, _ ->
                zoom = value
                pan = start * ((value - 1f) / (from - 1f).coerceAtLeast(Float.MIN_VALUE))
            }
        }
    }
    val keyed: (KeyEvent) -> Boolean = keyed@{ event ->
        if (event.type != KeyEventType.KeyDown) return@keyed false
        if (event.isAltPressed || event.isCtrlPressed || event.isMetaPressed || event.isShiftPressed) return@keyed false
        when (event.key) {
            Key.Escape -> {
                close()
                true
            }
            Key.DirectionLeft, Key.DirectionRight -> {
                if (several) {
                    val forward = (event.key == Key.DirectionRight) != rtl
                    travel(if (forward) index + 1 else index - 1)
                }
                several
            }
            else -> false
        }
    }

    Box(
        Modifier
            .pmMember("Lightbox", mapOf("state" to "open"))
            .semantics { paneTitle = props.label }
            .fillMaxSize()
            // A tap beside the picture and the controls lands here and closes.
            .pointerInput(close) { detectTapGestures { close() } }
            .onPreviewKeyEvent(keyed)
            .focusRequester(keys)
            .focusable(),
    ) {
        HorizontalPager(
            state = pager,
            userScrollEnabled = several && zoom <= 1f,
            modifier = Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing),
        ) { page ->
            val image = props.images[page]
            val current = page == index
            Box(Modifier.fillMaxSize().padding(space.s4), contentAlignment = Alignment.Center) {
                Box(
                    Modifier
                        .graphicsLayer {
                            scaleX = if (current) zoom else 1f
                            scaleY = if (current) zoom else 1f
                            translationX = if (current) pan.x else 0f
                            translationY = if (current) pan.y else 0f
                        }
                        // A pinch zooms; a drag pans only while zoomed, so the
                        // pager takes the drag otherwise.
                        .transformable(zooming, canPan = { zoom > 1f }, enabled = current)
                        // A tap on the picture does not close; a double tap
                        // returns it to its fitted size.
                        .pointerInput(current) { detectTapGestures(onDoubleTap = { if (current) unzoom() }) },
                ) {
                    CompositionLocalProvider(LocalPMImageFitsHeight provides true) {
                        PMImage(alt = image.alt, src = image.src)
                    }
                }
            }
        }
        Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).padding(space.s4)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                Box(Modifier.pmLightboxBacking()) {
                    PMButton(
                        icon = PMIconRole.Close,
                        iconOnly = true,
                        label = messages.close,
                        onClick = close,
                        size = PMControlSize.Sm,
                        appearance = PMButtonAppearance.GhostNeutral,
                    )
                }
            }
            Spacer(Modifier.weight(1f))
            if (several) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    PMLightboxTravel(PMIconRole.Previous, messages.previous, index - 1, count, travel)
                    PMLightboxTravel(PMIconRole.Next, messages.next, index + 1, count, travel)
                }
                Spacer(Modifier.weight(1f))
                Text(
                    text = messages.position((index + 1).toDouble(), count.toDouble()),
                    style = theme.text.sm.textStyle,
                    color = theme.colors.textPrimary.color,
                    modifier = Modifier
                        .align(Alignment.CenterHorizontally)
                        .pmLightboxBacking()
                        .padding(horizontal = space.s3, vertical = space.s1)
                        // Said when the picture changes, and not when the window opens.
                        .semantics { liveRegion = LiveRegionMode.Polite },
                )
            }
        }
    }
}

/** Previous or next on its backing, disabled where there is no picture to move to. */
@Composable
private fun PMLightboxTravel(icon: PMIconRole, label: String, to: Int, count: Int, travel: (Int) -> Unit) {
    Box(Modifier.pmLightboxBacking()) {
        PMButton(
            disabled = to !in 0 until count,
            icon = icon,
            iconOnly = true,
            label = label,
            onClick = { travel(to) },
            size = PMControlSize.Sm,
            appearance = PMButtonAppearance.GhostNeutral,
        )
    }
}

/**
 * A control's backing: the overlay surface behind a Button or the position,
 * so the control keeps its contrast over any picture.
 */
@Composable
private fun Modifier.pmLightboxBacking(): Modifier {
    val theme = PM.theme
    val shape = theme.rounded(theme.radius.control)
    return this
        .pmShadow(theme.shadows.transient, shape)
        .background(theme.colors.bgOverlay.color, shape)
        .border(PMGeometry.hairline, theme.colors.borderSubtle.color, shape)
}

/**
 * Lightbox's states, from the spec's States table. The closed entry is the
 * trigger the screen shows; the open ones open the lightbox with
 * `defaultOpen`, in its window over the canvas. The harness provides no image
 * loader, so the entries provide one: a painter of each picture's own size,
 * a sky over a ridge in two theme colours, so its fit shows. The picture that
 * fails has an empty `src`.
 */
object LightboxStates : PMStates {
    override val member = "Lightbox"

    private const val preview = "https://example.com/checkout.png"
    private const val harbour = "https://example.com/harbour.png"
    private const val ridge = "https://example.com/ridge.png"
    private const val cliffs = "https://example.com/cliffs.png"
    private const val panorama = "https://example.com/panorama.png"
    private const val phone = "https://example.com/settings.png"

    /** A picture of `width` by `height` pixels: a sky over a ridge. */
    private class Picture(width: Float, height: Float, private val sky: Color, private val ground: Color) : Painter() {
        override val intrinsicSize = Size(width, height)

        override fun DrawScope.onDraw() {
            drawRect(sky)
            drawRect(ground, topLeft = Offset(0f, size.height * 0.7f), size = Size(size.width, size.height * 0.3f))
        }
    }

    /** `content` under a loader whose pictures have arrived, each at its own size. */
    @Composable
    private fun Loaded(content: @Composable () -> Unit) {
        val colors = PM.theme.colors
        val sky = colors.accentSubtle.color
        val ground = colors.accentBg.color
        val pictures = remember(sky, ground) {
            mapOf(
                preview to Picture(960f, 600f, sky, ground),
                harbour to Picture(1200f, 800f, sky, ground),
                ridge to Picture(800f, 1000f, sky, ground),
                cliffs to Picture(1200f, 900f, sky, ground),
                panorama to Picture(2400f, 900f, sky, ground),
                phone to Picture(600f, 1600f, sky, ground),
            )
        }
        CompositionLocalProvider(LocalPMImageLoader provides PMImageLoader { pictures[it] }, content = content)
    }

    private val set = listOf(
        PMLightboxImage(src = harbour, alt = "A harbour at dusk"),
        PMLightboxImage(src = ridge, alt = "A pine ridge in the morning"),
        PMLightboxImage(src = cliffs, alt = "Red cliffs over a dry river"),
    )

    @Composable
    private fun Opened(label: String, images: List<PMLightboxImage>, defaultIndex: Double? = null) {
        PMFixturePhone {
            Loaded {
                PMLightbox(
                    defaultIndex = defaultIndex,
                    defaultOpen = true,
                    images = images,
                    label = label,
                    trigger = { PMButton(label = "View", appearance = PMButtonAppearance.OutlineNeutral) },
                )
            }
        }
    }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry(
                "one picture — no previous, next or position",
                expect = mapOf("state" to "open", "contains" to "Button"),
            ) {
                Opened(
                    "Attachment preview",
                    listOf(PMLightboxImage(src = preview, alt = "The checkout page with an error banner over the payment form")),
                )
            },
            PMStateEntry("open — the second of three pictures", expect = mapOf("state" to "open")) {
                Opened("Photographs", set, defaultIndex = 1.0)
            },
            PMStateEntry("several pictures", expect = mapOf("state" to "closed", "contains" to "Button")) {
                Loaded {
                    PMLightbox(
                        images = set,
                        label = "Photographs",
                        trigger = { PMButton(label = "View the photographs", appearance = PMButtonAppearance.OutlineNeutral) },
                    )
                }
            },
            PMStateEntry("a wide picture — fitted by its width", expect = mapOf("state" to "open")) {
                Opened("Panorama", listOf(PMLightboxImage(src = panorama, alt = "A panorama of the harbour from the north wall")))
            },
            PMStateEntry("a tall picture — fitted by its height", expect = mapOf("state" to "open")) {
                Opened("Phone screenshot", listOf(PMLightboxImage(src = phone, alt = "The settings screen on a phone, scrolled to the bottom")))
            },
            PMStateEntry("a picture that fails — Image’s fallback", expect = mapOf("state" to "open")) {
                Opened("Attachment preview", listOf(PMLightboxImage(src = "", alt = "The preview of the uploaded receipt")))
            },
        )
}
