// ImageEditor (`design/components/image-editor.md`): frames one image in a
// fixed crop by panning, zooming, quarter turns and a mirror, and hands the app
// the framed result as the bytes of an image file.
//
// The picture is the app's: `src`, or the file a person chooses, is asked of
// the image loader the app provides (`LocalPMImageLoader`), as Image's and
// Avatar's are, and its painter's intrinsic size is the natural size the frame
// and the export count in. The empty state is FileUpload's dropzone grammar,
// a dashed `border.strong` edge on `bg.subtle` at `radius.lg`: its browse
// Button opens the document picker the app provides (`LocalPMFilePicker`) for
// images, and a file dropped on it arrives through the same picker's reading
// of the drop, taking the accent's edge and wash while it hovers. On the stage
// one finger pans and a pinch zooms (`transformable`), a mouse wheel zooms by
// the slider's step, and a hardware keyboard pans with the arrows (the web's
// step, four times as far with Shift) and zooms with plus and minus. Focus
// draws the focus ring, and TalkBack reads the stage by `messages.stage`, an
// image whose state is `messages.alt`. The zoom Slider, in percent of cover,
// sits beside the rotate, flip and reset Buttons.
//
// The law of the frame (`image-editor.geometry.ts`, ported as
// `ImageEditorFrame`): zoom is a multiple of cover, the smallest scale at which
// the turned image covers the crop, from 1 to `maxZoom` (clamped to 2–8), so
// the crop never shows past the image; the centre is clamped after every pan,
// zoom and turn; a turn is a quarter turn clockwise, which swaps the image's
// width and height; the mirror negates the image's own x before the turn. The
// export re-projects the crop from the painter at its natural size, never
// from the screen, onto a bitmap whose longest edge is `exportSize`
// (`pmFramedImage`, through the stage's own drawing), and the encoder the app
// provides (`LocalPMImageEncoder`) writes it in `exportType`, because no
// encoder runs on both of this module's targets.
//
// Motion: panning, pinching, wheeling and sliding follow the hand and never
// animate; rotate, flip and reset are commands and animate over the control
// duration on the standard easing, which the platform's animator scale turns
// off. The mask (`circle`, `rounded`) and the rule-of-thirds grid, shown while
// panning, are paint only.
//
// Not honoured, by the platform: `onConfirm` returns nothing to wait for, so
// confirm has no busy state; a painter reports no failure, so only a source the
// loader gives no painter for returns to the chooser and announces
// `messages.loadError`; paste is not offered, because the module has no paste
// scoped to a focused control; `id` names no node. Without an app's encoder,
// confirm hands nothing over, as a dropzone without an app's picker opens
// nothing.

package dev.polymorph.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.draganddrop.dragAndDropTarget
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.TransformableState
import androidx.compose.foundation.gestures.transformable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.geometry.isSpecified
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isShiftPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.toSize
import kotlin.math.PI
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

object PMImageEditor : PMImageEditorRendering {
    @Composable
    override fun Render(props: PMImageEditorProps) {
        val space = PM.theme.defaultDensity.spacing
        val say = ImageEditorWords(props.messages)
        val disabled = props.disabled == true || !LocalPMEnabled.current
        val loader = LocalPMImageLoader.current
        val picker = LocalPMFilePicker.current

        // A file the person chose here, by its address, and whether the last
        // source was one the loader had no picture for.
        var chosen by remember { mutableStateOf<String?>(null) }
        var refused by remember { mutableStateOf(false) }
        var dropping by remember { mutableStateOf(false) }
        val source = chosen ?: props.src?.takeIf { it.isNotEmpty() }
        val painter = source?.let { loader.painter(it) }
        LaunchedEffect(source, painter == null) {
            if (source != null && painter == null) {
                refused = true
                chosen = null
            }
        }
        val choose = { files: List<PMFile> ->
            files.firstOrNull()?.let {
                refused = false
                chosen = it.uri
            }
            Unit
        }

        // The framing, new for every source.
        val state = remember(source) { ImageEditorState() }
        val attributes = buildMap {
            if (painter == null) put("empty", "true")
            if (dropping) put("dragover", "true")
            if (disabled) put("disabled", "true")
            props.mask?.takeIf { it != PMImageEditorMask.None }?.let { put("mask", it.value) }
            if (state.mirrored) put("mirrored", "true")
            if (state.panning) put("panning", "true")
        }

        Box(Modifier.pmMember("ImageEditor", attributes).fillMaxWidth()) {
            if (painter != null) {
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(space.s4)) {
                    Stage(props, say, painter, state, disabled, focusOnLoad = chosen != null)
                    Tools(props, say, state, disabled)
                    Actions(props, say, painter, state, disabled)
                }
            } else {
                val drop = rememberPMDropTarget(picker, onTargeted = { dropping = it }, receive = choose)
                Doorway(
                    say,
                    disabled,
                    dropping,
                    Modifier.dragAndDropTarget(shouldStartDragAndDrop = { !disabled && picker != null }, target = drop),
                ) { picker?.pick(IMAGES, false, choose) }
            }
            // Said when a source cannot be read: beside the column, so it adds no gap.
            PMAnnouncement(if (refused) say.loadError else null)
        }
    }

    /** What the picker offers: images of any type. */
    private const val IMAGES = "image/*"

    /**
     * The empty state (FileUpload's dropzone grammar): the upload glyph, the
     * title and the hint, and the browse Button that opens the picker; a drop
     * hovering takes the accent's edge and wash.
     */
    @Composable
    private fun Doorway(say: ImageEditorWords, disabled: Boolean, dropping: Boolean, modifier: Modifier, browse: () -> Unit) {
        val theme = PM.theme
        val colors = theme.colors
        val motion = theme.defaultMotion
        val space = theme.defaultDensity.spacing
        val spec = motion.easing.standard.tween<Color>(motion.duration.control)
        val fill by animateColorAsState((if (dropping) colors.accentSubtle else colors.bgSubtle).color, spec, label = "fill")
        val edge by animateColorAsState((if (dropping) colors.accentBg else colors.borderStrong).color, spec, label = "edge")
        val radius = theme.radius.lg.dp
        val hairline = PMGeometry.hairline
        Column(
            modifier = modifier
                .fillMaxWidth()
                .background(fill, theme.rounded(theme.radius.lg))
                // The dashed hairline: dashes two hairlines long, two apart, the web's `dashed`.
                .drawBehind {
                    val stroke = hairline.toPx()
                    val dash = stroke * 2
                    drawRoundRect(
                        color = edge,
                        topLeft = Offset(stroke / 2, stroke / 2),
                        size = Size(size.width - stroke, size.height - stroke),
                        cornerRadius = CornerRadius(maxOf(0f, radius.toPx() - stroke / 2)),
                        style = Stroke(width = stroke, pathEffect = PathEffect.dashPathEffect(floatArrayOf(dash, dash))),
                    )
                }
                .padding(space.s7),
            verticalArrangement = Arrangement.spacedBy(space.s3),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            PMIconView(PMIconRole.Upload, PMControlSize.Lg, tint = colors.textMuted.color)
            Text(text = say.title, style = theme.text.sm.textStyle, color = colors.textPrimary.color, textAlign = TextAlign.Center)
            Text(text = say.hint, style = theme.text.xs.textStyle, color = colors.textMuted.color, textAlign = TextAlign.Center)
            PMButton(disabled = disabled, label = say.browse, onClick = browse, appearance = PMButtonAppearance.OutlineNeutral)
        }
    }

    /** The stage: the picture in its frame, the grid while panning, the mask; pans, pinches, wheels and keys. */
    @Composable
    private fun Stage(
        props: PMImageEditorProps,
        say: ImageEditorWords,
        painter: Painter,
        state: ImageEditorState,
        disabled: Boolean,
        focusOnLoad: Boolean,
    ) {
        val theme = PM.theme
        val colors = theme.colors
        val motion = theme.defaultMotion
        val density = LocalDensity.current
        val natural = painter.intrinsicSize.takeIf { it.isSpecified && it.width > 0 && it.height > 0 }
        val roof = roof(props)
        SideEffect {
            state.natural = natural
            state.roof = roof
        }
        val frame = state.frame(natural)
        val at = frame.clamp(state.center ?: frame.centre)

        // The hand moves the picture at once; a command eases it there.
        val spec: AnimationSpec<Float> = if (state.animate) motion.easing.standard.tween(motion.duration.control) else snap()
        val degrees by animateFloatAsState(state.quarters * QUARTER, spec, label = "turn")
        val mirror by animateFloatAsState(if (state.mirrored) -1f else 1f, spec, label = "mirror")
        val scale by animateFloatAsState(frame.scale.toFloat(), spec, label = "scale")
        val x by animateFloatAsState(at.x.toFloat(), spec, label = "x")
        val y by animateFloatAsState(at.y.toFloat(), spec, label = "y")

        val interaction = remember { MutableInteractionSource() }
        val focused by interaction.collectIsFocusedAsState()
        val focus = remember { FocusRequester() }
        // A file the person chose takes focus once its picture has arrived, so the keys frame it at once.
        LaunchedEffect(focusOnLoad, natural != null) {
            if (focusOnLoad && natural != null) focus.requestFocus()
        }
        val radius = theme.radius.md
        val ratio = (props.aspectRatio ?: 1.0).coerceAtLeast(MIN_RATIO).toFloat()

        Box(
            Modifier
                .fillMaxWidth()
                .aspectRatio(ratio)
                .pmFocusRing(focused && !disabled, radius.dp)
                .clip(theme.rounded(radius))
                .background(colors.bgSubtle.color)
                .onSizeChanged { state.viewport = it.toSize() }
                .focusRequester(focus)
                .focusable(enabled = !disabled, interactionSource = interaction)
                .onKeyEvent { event ->
                    if (disabled || event.type != KeyEventType.KeyDown) return@onKeyEvent false
                    val step = with(density) {
                        (if (event.isShiftPressed) PMRecipe.imageEditorPanStepLarge else PMRecipe.imageEditorPanStep).toPx().toDouble()
                    }
                    val zoomStep = PMRecipe.imageEditorZoomStep.toDouble()
                    when (event.key) {
                        Key.DirectionLeft -> state.pan(-step, 0.0)
                        Key.DirectionRight -> state.pan(step, 0.0)
                        Key.DirectionUp -> state.pan(0.0, -step)
                        Key.DirectionDown -> state.pan(0.0, step)
                        Key.Equals, Key.Plus, Key.NumPadAdd -> state.zoomBy(zoomStep)
                        Key.Minus, Key.NumPadSubtract -> state.zoomBy(-zoomStep)
                        else -> return@onKeyEvent false
                    }
                    true
                }
                .transformable(state.gestures, enabled = !disabled)
                // The wheel zooms by the slider's step, centred on the stage.
                .pointerInput(disabled) {
                    if (disabled) return@pointerInput
                    awaitPointerEventScope {
                        while (true) {
                            val event = awaitPointerEvent()
                            if (event.type != PointerEventType.Scroll) continue
                            val delta = event.changes.sumOf { it.scrollDelta.y.toDouble() }
                            if (delta == 0.0) continue
                            val step = PMRecipe.imageEditorZoomStep.toDouble()
                            state.zoomBy(if (delta < 0) step else -step)
                            event.changes.forEach { it.consume() }
                        }
                    }
                }
                // The stage's name and what it shows; the picture, the grid and the mask are paint.
                .clearAndSetSemantics {
                    contentDescription = say.stage
                    stateDescription = say.alt
                    role = Role.Image
                },
        ) {
            if (natural != null) {
                Canvas(Modifier.matchParentSize()) {
                    pmDrawFramed(painter, natural, Offset(x, y), degrees, mirror, scale)
                }
            }
            if (props.grid == true && state.panning) {
                val line = colors.borderDefault.color.copy(alpha = PMRecipe.imageEditorGridOpacity)
                Canvas(Modifier.matchParentSize()) {
                    val stroke = PMGeometry.hairline.toPx()
                    for (third in 1 until THIRDS) {
                        val across = size.width * third / THIRDS
                        val down = size.height * third / THIRDS
                        drawLine(line, Offset(across, 0f), Offset(across, size.height), stroke)
                        drawLine(line, Offset(0f, down), Offset(size.width, down), stroke)
                    }
                }
            }
            props.mask?.takeIf { it != PMImageEditorMask.None }?.let { mask ->
                val scrim = colors.bgScrim.color
                val corner = theme.radius.lg.dp
                Canvas(Modifier.matchParentSize()) {
                    val window = Path().apply {
                        fillType = PathFillType.EvenOdd
                        addRect(Rect(Offset.Zero, size))
                        if (mask == PMImageEditorMask.Circle) {
                            addOval(Rect(center, size.minDimension / 2))
                        } else {
                            addRoundRect(RoundRect(Rect(Offset.Zero, size), CornerRadius(corner.toPx())))
                        }
                    }
                    drawPath(window, scrim)
                }
            }
        }
    }

    /** The commands, ghost and icon-only, and the zoom Slider in percent of cover. */
    @Composable
    private fun Tools(props: PMImageEditorProps, say: ImageEditorWords, state: ImageEditorState, disabled: Boolean) {
        val space = PM.theme.defaultDensity.spacing
        val roof = roof(props)
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(space.s4),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Command(PMIconRole.Rotate, say.rotate, disabled, state) { state.quarters += 1 }
            if (props.flip == true) Command(PMIconRole.Flip, say.flip, disabled, state) { state.mirrored = !state.mirrored }
            if (props.reset == true) Command(PMIconRole.Undo, say.reset, disabled, state) { state.reset() }
            Box(Modifier.weight(1f)) {
                PMSlider(
                    ariaLabel = say.zoom,
                    disabled = disabled,
                    formatValue = { "${it.roundToInt()}%" },
                    max = roof * PERCENT,
                    min = PERCENT,
                    onChange = { value ->
                        if (value is PMSliderValue.Single) state.zoomTo(value.value / PERCENT)
                    },
                    showValue = true,
                    step = PMRecipe.imageEditorZoomStep * PERCENT,
                    value = PMSliderValue.Single((state.zoom * PERCENT).roundToInt().toDouble()),
                )
            }
        }
    }

    /** A command: icon-only and ghost, its change eased over the control duration. */
    @Composable
    private fun Command(icon: PMIconRole, label: String, disabled: Boolean, state: ImageEditorState, change: () -> Unit) {
        PMButton(
            disabled = disabled,
            icon = icon,
            iconOnly = true,
            label = label,
            onClick = { state.command(change) },
            appearance = PMButtonAppearance.GhostNeutral,
        )
    }

    /** Cancel when the app can take it back, and confirm, which writes the framed image. */
    @Composable
    private fun Actions(props: PMImageEditorProps, say: ImageEditorWords, painter: Painter, state: ImageEditorState, disabled: Boolean) {
        val space = PM.theme.defaultDensity.spacing
        val encoder = LocalPMImageEncoder.current
        val density = LocalDensity.current
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(space.s3, Alignment.End)) {
            props.onCancel?.let { cancel ->
                PMButton(disabled = disabled, label = say.cancel, onClick = cancel, appearance = PMButtonAppearance.GhostNeutral)
            }
            PMButton(
                disabled = disabled,
                label = say.confirm,
                onClick = {
                    val image = state.export(painter, props.exportSize ?: PMSpecDefault.imageEditorExportSize, density)
                    val type = props.exportType ?: PMImageEditorExportType.ImagePng
                    image?.let { encoder?.encode(it, type.value) }?.let(props.onConfirm)
                },
                appearance = PMButtonAppearance.SolidAccent,
            )
        }
    }

    /** The maximum zoom: the prop, clamped to 2–8. */
    private fun roof(props: PMImageEditorProps): Double = (props.maxZoom ?: PMSpecDefault.imageEditorMaxZoom).coerceIn(ROOF_LOW, ROOF_HIGH)

    /** A quarter turn, in degrees. */
    private const val QUARTER = 90f

    /** The slider's scale: percent of cover. */
    private const val PERCENT = 100.0

    /** The grid's lines divide the stage in thirds. */
    private const val THIRDS = 3

    /** The narrowest crop the stage lays out, so a ratio of zero still has a box. */
    private const val MIN_RATIO = 0.1

    /** `maxZoom` is clamped to 2–8 (`image-editor.md`). */
    private const val ROOF_LOW = 2.0
    private const val ROOF_HIGH = 8.0
}

/**
 * One picture's framing: its zoom, its quarter turns and mirror, its centre in
 * the stage, the stage's size, and whether a command is easing it there. The
 * centre is kept clamped after every pan, zoom and turn.
 */
internal class ImageEditorState {
    var viewport by mutableStateOf(Size.Zero)
    var natural by mutableStateOf<Size?>(null)
    var roof by mutableDoubleStateOf(PMSpecDefault.imageEditorMaxZoom)
    var zoom by mutableDoubleStateOf(1.0)
        private set

    /** Every quarter turn made, so a turn eases on clockwise; the frame takes them modulo four. */
    var quarters by mutableIntStateOf(0)
    var mirrored by mutableStateOf(false)
    var center by mutableStateOf<ImageEditorPoint?>(null)
        private set
    var animate by mutableStateOf(false)
        private set

    /**
     * One finger pans and a pinch zooms, both at once and never eased. The
     * zoom is about the stage's centre, as the web's wheel and slider zoom,
     * so the pinch's centroid is not read.
     */
    val gestures = TransformableState { _, zoomChange, panChange, _ ->
        animate = false
        applyZoom(zoom * zoomChange)
        move(panChange.x.toDouble(), panChange.y.toDouble())
    }

    /** Whether a hand is moving the picture: the grid shows. */
    val panning: Boolean get() = gestures.isTransformInProgress

    /** The frame as it is laid out; before the picture arrives, the stage's own size stands for it. */
    fun frame(picture: Size? = natural): ImageEditorFrame {
        val drawn = picture ?: viewport
        return ImageEditorFrame(
            drawn.width.toDouble(), drawn.height.toDouble(), viewport.width.toDouble(), viewport.height.toDouble(),
            quarters.mod(QUARTERS), zoom,
        )
    }

    /** The hand moves the centre, at once. */
    fun pan(dx: Double, dy: Double) {
        animate = false
        move(dx, dy)
    }

    /** The hand zooms by `step` of cover, at once. */
    fun zoomBy(step: Double) {
        animate = false
        applyZoom(zoom + step)
    }

    /** The slider sets the zoom, at once. */
    fun zoomTo(value: Double) {
        animate = false
        applyZoom(value)
    }

    /** A command's change, eased, and the centre clamped to the frame it leaves. */
    fun command(change: () -> Unit) {
        animate = true
        change()
        center = center?.let { frame().clamp(it) }
    }

    /** Back to the floor: cover, centred, unturned, unmirrored. */
    fun reset() {
        zoom = 1.0
        quarters = 0
        mirrored = false
        center = null
    }

    private fun applyZoom(value: Double) {
        zoom = value.coerceIn(1.0, roof)
        center = center?.let { frame().clamp(it) }
    }

    private fun move(dx: Double, dy: Double) {
        val now = frame()
        val from = now.clamp(center ?: now.centre)
        center = now.clamp(ImageEditorPoint(from.x + dx, from.y + dy))
    }

    /**
     * The framed crop, re-projected from the painter at its natural size onto
     * a bitmap whose longest edge is `longest` pixels; null before the picture
     * and the stage have a size.
     */
    fun export(painter: Painter, longest: Double, density: Density): ImageBitmap? {
        val picture = natural ?: return null
        if (viewport.width <= 0f || viewport.height <= 0f) return null
        val frame = frame()
        val geometry = frame.export(longest, frame.clamp(center ?: frame.centre), mirrored)
        return pmFramedImage(geometry.width, geometry.height, density) {
            pmDrawFramed(
                painter,
                picture,
                Offset(geometry.translateX.toFloat(), geometry.translateY.toFloat()),
                frame.turns * QUARTER_DEGREES,
                if (mirrored) -1f else 1f,
                geometry.scaleY.toFloat(),
            )
        }
    }

    private companion object {
        const val QUARTERS = 4
        const val QUARTER_DEGREES = 90f
    }
}

/** A point in the stage, in its pixels. */
internal data class ImageEditorPoint(val x: Double, val y: Double)

/**
 * The law of the frame (`image-editor.geometry.ts`): cover, the clamps, the
 * turned size and the export, for one picture of `naturalWidth` by
 * `naturalHeight` pixels in a stage of `viewportWidth` by `viewportHeight`,
 * turned `turns` quarter turns, at `zoom` times cover.
 */
internal class ImageEditorFrame(
    private val naturalWidth: Double,
    private val naturalHeight: Double,
    private val viewportWidth: Double,
    private val viewportHeight: Double,
    val turns: Int,
    val zoom: Double,
) {
    /** The picture's width after its turns: odd turns swap the sides. */
    val turnedWidth: Double get() = if (turns % 2 == 0) naturalWidth else naturalHeight
    val turnedHeight: Double get() = if (turns % 2 == 0) naturalHeight else naturalWidth

    /** The smallest scale at which the turned picture covers the stage: zoom 1. An empty box is 1. */
    val cover: Double
        get() = if (turnedWidth <= 0 || turnedHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
            1.0
        } else {
            max(viewportWidth / turnedWidth, viewportHeight / turnedHeight)
        }

    val scale: Double get() = cover * zoom

    /** Where a picture sits when it arrives: centred. */
    val centre: ImageEditorPoint get() = ImageEditorPoint(viewportWidth / 2, viewportHeight / 2)

    /** The centre clamped so no edge of the picture enters the crop. */
    fun clamp(point: ImageEditorPoint): ImageEditorPoint {
        fun clamp(value: Double, view: Double, span: Double): Double {
            val at = if (value.isFinite()) value else view / 2
            return min(span / 2, max(view - span / 2, at))
        }
        return ImageEditorPoint(
            clamp(point.x, viewportWidth, turnedWidth * scale),
            clamp(point.y, viewportHeight, turnedHeight * scale),
        )
    }

    /**
     * The export (`exportGeometry`): a bitmap whose longest edge is `longest`
     * and whose shape is the stage's, the picture placed as it is on the stage
     * and scaled by the bitmap's pixels to the stage's. The mirror negates x
     * only, before the turn.
     */
    fun export(longest: Double, center: ImageEditorPoint, mirrored: Boolean): ImageEditorExport {
        val aspect = viewportWidth / viewportHeight
        val width = max(1, (if (aspect >= 1) longest else longest * aspect).roundToInt())
        val height = max(1, (if (aspect >= 1) longest / aspect else longest).roundToInt())
        val factor = width / viewportWidth
        val scale = cover * zoom * factor
        return ImageEditorExport(
            width = width,
            height = height,
            translateX = center.x * factor,
            translateY = center.y * factor,
            rotationRadians = turns * PI / 2,
            scaleX = if (mirrored) -scale else scale,
            scaleY = scale,
            drawX = -naturalWidth / 2,
            drawY = -naturalHeight / 2,
        )
    }
}

/** Where the export draws the picture (`ExportGeometry`), in the bitmap's pixels. */
internal data class ImageEditorExport(
    val width: Int,
    val height: Int,
    val translateX: Double,
    val translateY: Double,
    val rotationRadians: Double,
    val scaleX: Double,
    val scaleY: Double,
    val drawX: Double,
    val drawY: Double,
)

/** The member's words: each message the app passed, or the default. */
private class ImageEditorWords(messages: PMImageEditorMessages?) {
    private val defaults = PMSpecDefault.imageEditorMessages
    val title = messages?.title ?: defaults.title.orEmpty()
    val hint = messages?.hint ?: defaults.hint.orEmpty()
    val browse = messages?.browse ?: defaults.browse.orEmpty()
    val rotate = messages?.rotate ?: defaults.rotate.orEmpty()
    val flip = messages?.flip ?: defaults.flip.orEmpty()
    val reset = messages?.reset ?: defaults.reset.orEmpty()
    val zoom = messages?.zoom ?: defaults.zoom.orEmpty()
    val cancel = messages?.cancel ?: defaults.cancel.orEmpty()
    val confirm = messages?.confirm ?: defaults.confirm.orEmpty()
    val alt = messages?.alt ?: defaults.alt.orEmpty()
    val stage = messages?.stage ?: defaults.stage.orEmpty()
    val loadError = messages?.loadError ?: defaults.loadError.orEmpty()
}

/**
 * ImageEditor's states, from the spec's States table. The harness provides no
 * image loader, so each entry with a picture provides one: a test card of four
 * quadrants around a disc in the pairing's chart colours, 4 by 3, so pan, zoom
 * and the mask show. The drag-over state is the one a fixture cannot draw,
 * because a drag cannot be synthesised.
 */
object ImageEditorStates : PMStates {
    override val member = "ImageEditor"

    private const val card = "https://example.com/card.png"

    /** The test card: four quadrants around a disc. */
    private class Card(private val quadrants: List<Color>, private val disc: Color) : Painter() {
        override val intrinsicSize = Size(CARD_WIDTH, CARD_HEIGHT)

        override fun DrawScope.onDraw() {
            val half = Size(size.width / 2, size.height / 2)
            quadrants.forEachIndexed { index, color ->
                drawRect(color, Offset(half.width * (index % 2), half.height * (index / 2)), half)
            }
            drawCircle(disc, size.minDimension * DISC)
        }
    }

    /** `content` under a loader whose picture is the test card. */
    @Composable
    private fun Loaded(content: @Composable () -> Unit) {
        val chart = PM.theme.chart
        val picture = Card(
            listOf(chart.chart3.color, chart.chart7.color, chart.chart8.color, chart.chart6.color),
            chart.chart4.color,
        )
        CompositionLocalProvider(LocalPMImageLoader provides PMImageLoader { picture }, content = content)
    }

    /** The card's size in pixels: 4 by 3. */
    private const val CARD_WIDTH = 320f
    private const val CARD_HEIGHT = 240f

    /** The disc's radius, as a share of the card's shorter side. */
    private const val DISC = 0.15f

    /** The wide crop's ratio, 16 by 9. */
    private const val WIDE = 16.0 / 9.0

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("empty", expect = mapOf("empty" to "true")) {
                PMImageEditor(onCancel = {}, onConfirm = {})
            },
            PMStateEntry("loaded", expect = mapOf("empty" to "")) {
                Loaded { PMImageEditor(onCancel = {}, onConfirm = {}, src = card) }
            },
            PMStateEntry("circle mask", expect = mapOf("mask" to "circle")) {
                Loaded { PMImageEditor(mask = PMImageEditorMask.Circle, onCancel = {}, onConfirm = {}, src = card) }
            },
            PMStateEntry("rounded mask", expect = mapOf("mask" to "rounded")) {
                Loaded { PMImageEditor(mask = PMImageEditorMask.Rounded, onCancel = {}, onConfirm = {}, src = card) }
            },
            PMStateEntry("every control offered") {
                Loaded {
                    PMImageEditor(flip = true, grid = true, maxZoom = 8.0, onCancel = {}, onConfirm = {}, reset = true, src = card)
                }
            },
            PMStateEntry("wide crop") {
                Loaded { PMImageEditor(aspectRatio = WIDE, onCancel = {}, onConfirm = {}, src = card) }
            },
            PMStateEntry("no cancel") {
                Loaded { PMImageEditor(onConfirm = {}, src = card) }
            },
            PMStateEntry("disabled", expect = mapOf("disabled" to "true")) {
                Loaded { PMImageEditor(disabled = true, onCancel = {}, onConfirm = {}, src = card) }
            },
            PMStateEntry("two shapes side by side") {
                // Each stage tracks its column; the row is the fixture's, not a member.
                Loaded {
                    Row(horizontalArrangement = Arrangement.spacedBy(PM.theme.defaultDensity.spacing.s4)) {
                        Box(Modifier.weight(1f)) { PMImageEditor(mask = PMImageEditorMask.Circle, onConfirm = {}, src = card) }
                        Box(Modifier.weight(1f)) { PMImageEditor(aspectRatio = WIDE, onConfirm = {}, src = card) }
                    }
                }
            },
        )
}
