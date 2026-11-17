// How the anchored overlays present (Menu, ContextMenu, SplitButton's menu,
// Popover, MultiSelect's list, ColorInput's picker, ConfirmDialog, Drawer): on
// a phone's window, Material 3's modal bottom sheet on the pairing's sheet
// surface; on a wider one, a panel anchored to its trigger in a popup window,
// on the overlay surface, entering with the `scale-fade` binding from the
// side it opens on. Every overlay window composes its content outside the form
// and the field around its trigger (`PMOverlayContent`).

package dev.polymorph.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterExitState
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalBottomSheetProperties
import androidx.compose.material3.SheetValue
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupPositionProvider
import androidx.compose.ui.window.PopupProperties

/**
 * Whether the overlays under it present in their phone form (`true`) or their
 * wider one (`false`) whatever the window: a fixture's or a preview's way to
 * draw one form. Unprovided (`null`), the window's width decides.
 */
val LocalPMCompactWindow = compositionLocalOf<Boolean?> { null }

/**
 * Whether the window is a phone's for the overlay class: narrower than 30rem
 * (`PMRecipe.dialogBelow`), the one line the sheet presentation and Dialog
 * draw at (`design/components/README.md`, "The sheet presentation"), so two
 * overlays never disagree about what a phone is.
 */
@Composable
fun pmCompactWindow(): Boolean {
    LocalPMCompactWindow.current?.let { return it }
    val width = with(LocalDensity.current) { LocalWindowInfo.current.containerSize.width.toDp() }
    return width < PMRecipe.dialogBelow
}

/**
 * An overlay window's content, outside the form and the field around the
 * overlay's trigger: no submit action (`LocalPMSubmitAction`), no field
 * (`LocalPMField`) and no field to report to (`LocalPMFieldReport`). A window
 * composed beneath a FormPage or a FormField would otherwise inherit them, so
 * Return in a field inside a dialog would submit the page behind it. On the web
 * an overlay is portalled out of the `<form>`, and its fields are not the
 * trigger's field. A window opened from inside another overlay's body is not
 * in that body's scroll either (`LocalPMOverlayScroll`). The bottom sheet, the
 * anchored panel, Dialog's window, Drawer's side sheet and the date pickers'
 * calendar windows compose their content in it.
 */
@Composable
fun PMOverlayContent(content: @Composable () -> Unit) {
    CompositionLocalProvider(
        LocalPMSubmitAction provides null,
        LocalPMField provides null,
        LocalPMFieldReport provides null,
        LocalPMOverlayScroll provides null,
        content = content,
    )
}

/**
 * The bottom sheet: Material 3's modal bottom sheet, which brings the
 * platform's scrim, back gesture, drag to dismiss and its own entrance, on the
 * sheet surface: `bg.overlay`, the top corners at `radius.surface` and a
 * `border.subtle` hairline along its top edge (`pmSheetEdge`), the scrim
 * `bg.scrim`, and the drag handle in `border.strong`. Material's sheet draws
 * no shadow; over its scrim the pairing's transient shadow would not show. It
 * is as tall as its content up to `cap` of the window, two thirds
 * (`PMRecipe.sheetHeight`) unless a member gives its own, or that tall
 * whatever its content when it is to `fill`, and it never stops half open.
 * Not `dismissible`, it keeps no drag handle and refuses the drag, the scrim
 * and the back gesture, so its own controls must answer. `modifier` is the
 * content's: a member puts its identity there.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PMBottomSheet(
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    dismissible: Boolean = true,
    cap: Float = PMRecipe.sheetHeight,
    fill: Boolean = false,
    content: @Composable ColumnScope.() -> Unit,
) {
    val theme = PM.theme
    val window = with(LocalDensity.current) { LocalWindowInfo.current.containerSize.height.toDp() }
    val handle = theme.colors.borderStrong.color
    val radius = theme.radius.surface.dp
    PMMaterialTheme {
        val state = rememberModalBottomSheetState(
            skipPartiallyExpanded = true,
            confirmValueChange = { dismissible || it != SheetValue.Hidden },
        )
        ModalBottomSheet(
            onDismissRequest = { if (dismissible) onDismiss() },
            sheetState = state,
            sheetGesturesEnabled = dismissible,
            shape = RoundedCornerShape(topStart = radius, topEnd = radius),
            containerColor = theme.colors.bgOverlay.color,
            contentColor = theme.colors.textPrimary.color,
            tonalElevation = 0.dp,
            scrimColor = theme.colors.bgScrim.color,
            // The top of the sheet: its edge, over the handle while it can be
            // dragged, and over the content when there is no handle, because
            // Material's handle slot is a control that must have its handle.
            dragHandle = if (dismissible) {
                {
                    Box(Modifier.fillMaxWidth().pmSheetEdge(), contentAlignment = Alignment.Center) {
                        BottomSheetDefaults.DragHandle(color = handle)
                    }
                }
            } else {
                null
            },
            properties = ModalBottomSheetProperties(shouldDismissOnBackPress = dismissible),
        ) {
            Column(
                modifier
                    .then(if (dismissible) Modifier else Modifier.pmSheetEdge())
                    .heightIn(max = window * cap)
                    .then(if (fill) Modifier.fillMaxHeight() else Modifier),
            ) { PMOverlayContent { content() } }
        }
    }
}

/**
 * A member's attributes while its panel is drawn as the bottom sheet, with the
 * sheet presentation's attribute contract added: `presentation=sheet`, the
 * web's `data-presentation="sheet"`, present exactly while the sheet is.
 */
fun pmInSheet(attributes: Map<String, String>): Map<String, String> = attributes + ("presentation" to "sheet")

/** The side of its trigger an anchored panel opens on. */
enum class PMAnchorSide { Bottom, Top, Start, End }

/** Where along that side the panel lines up with its trigger. */
enum class PMAnchorAlign { Start, Center, End }

/**
 * A panel anchored to the composable it is placed in, in a popup window that
 * takes focus, so the back gesture and Escape dismiss it and a press outside
 * it does too: on `side` of the trigger, `offset` from it, lined up by
 * `align`, flipped to the other side when it does not fit and kept inside the
 * window. `at`, when given, anchors it to that point inside the trigger
 * instead (a context menu's press). It enters with the `scale-fade` binding
 * (`menu.md`, `popover.md`): from 94% and transparent, over the surface
 * duration on the enter easing, from the edge nearest the trigger, and leaves
 * over the surface's exit duration on the exit easing. `content` draws its own
 * surface.
 */
@Composable
fun PMAnchoredPanel(
    open: Boolean,
    onDismiss: () -> Unit,
    side: PMAnchorSide = PMAnchorSide.Bottom,
    align: PMAnchorAlign = PMAnchorAlign.Start,
    offset: Dp = PMGeometry.anchorOffset,
    at: IntOffset? = null,
    content: @Composable () -> Unit,
) {
    val visible = remember { MutableTransitionState(false) }
    visible.targetState = open
    // Remembered before the closed panel returns, so the edge the position
    // reports is kept while the panel is closed and is there when it opens.
    var origin by remember { mutableStateOf(TransformOrigin.Center) }
    if (!visible.currentState && !visible.targetState) return
    val motion = PM.theme.defaultMotion
    val gap = with(LocalDensity.current) { offset.roundToPx() }
    val provider = remember(side, align, gap, at) {
        PMAnchorPosition(side, align, gap, at) { origin = it }
    }
    Popup(
        popupPositionProvider = provider,
        onDismissRequest = onDismiss,
        properties = PopupProperties(focusable = true),
    ) {
        AnimatedVisibility(
            visibleState = visible,
            enter = fadeIn(motion.easing.enter.tween(motion.duration.surface)),
            exit = fadeOut(motion.easing.exit.tween(motion.duration.surfaceExit)),
        ) {
            // The scale runs on the visibility's own transition, so the panel
            // leaves once it has shrunk; the layer reads the origin when it
            // draws, after the position has reported the edge for this frame.
            val scale by transition.animateFloat(
                transitionSpec = {
                    if (targetState == EnterExitState.Visible) {
                        motion.easing.enter.tween(motion.duration.surface)
                    } else {
                        motion.easing.exit.tween(motion.duration.surfaceExit)
                    }
                },
                label = "panel",
            ) { state -> if (state == EnterExitState.Visible) 1f else PANEL_FROM }
            Box(
                Modifier.graphicsLayer {
                    transformOrigin = origin
                    scaleX = scale
                    scaleY = scale
                },
            ) { PMOverlayContent(content) }
        }
    }
}

/** The `scale-fade` binding's starting scale: the recipes' `scale(0.94)`. */
private const val PANEL_FROM = 0.94f

/**
 * Places an anchored panel: on its side of the anchor (the trigger's bounds,
 * or a point in them), flipped when the window has no room there, lined up by
 * its alignment along that side, and clamped inside the window. It reports
 * the panel's edge nearest the anchor as the transform origin.
 */
private class PMAnchorPosition(
    private val side: PMAnchorSide,
    private val align: PMAnchorAlign,
    private val gap: Int,
    private val at: IntOffset?,
    private val origin: (TransformOrigin) -> Unit,
) : PopupPositionProvider {
    override fun calculatePosition(
        anchorBounds: IntRect,
        windowSize: IntSize,
        layoutDirection: LayoutDirection,
        popupContentSize: IntSize,
    ): IntOffset {
        val anchor = at?.let { IntRect(anchorBounds.left + it.x, anchorBounds.top + it.y, anchorBounds.left + it.x, anchorBounds.top + it.y) } ?: anchorBounds
        val rtl = layoutDirection == LayoutDirection.Rtl
        val width = popupContentSize.width
        val height = popupContentSize.height
        val vertical = side == PMAnchorSide.Bottom || side == PMAnchorSide.Top
        return if (vertical) {
            val below = anchor.bottom + gap
            val above = anchor.top - gap - height
            val down = if (side == PMAnchorSide.Bottom) below + height <= windowSize.height || above < 0 else above < 0
            val y = if (down) below else above
            // Start and end follow the reading direction.
            val leading = if (rtl) anchor.right - width else anchor.left
            val trailing = if (rtl) anchor.left else anchor.right - width
            val x = when (align) {
                PMAnchorAlign.Start -> leading
                PMAnchorAlign.Center -> anchor.left + (anchor.width - width) / 2
                PMAnchorAlign.End -> trailing
            }.coerceIn(0, maxOf(0, windowSize.width - width))
            val fromLeft = x <= anchor.left + anchor.width / 2 - width / 2
            origin(TransformOrigin(if (align == PMAnchorAlign.Center) HALF else if (fromLeft) 0f else 1f, if (down) 0f else 1f))
            IntOffset(x, y.coerceIn(0, maxOf(0, windowSize.height - height)))
        } else {
            val after = anchor.right + gap
            val before = anchor.left - gap - width
            // The end side is the right in a left-to-right layout.
            val towardRight = (side == PMAnchorSide.End) != rtl
            val right = if (towardRight) after + width <= windowSize.width || before < 0 else before < 0
            val x = if (right) after else before
            val y = when (align) {
                PMAnchorAlign.Start -> anchor.top
                PMAnchorAlign.Center -> anchor.top + (anchor.height - height) / 2
                PMAnchorAlign.End -> anchor.bottom - height
            }.coerceIn(0, maxOf(0, windowSize.height - height))
            origin(TransformOrigin(if (right) 0f else 1f, if (align == PMAnchorAlign.Center) HALF else if (align == PMAnchorAlign.Start) 0f else 1f))
            IntOffset(x.coerceIn(0, maxOf(0, windowSize.width - width)), y)
        }
    }
}

/** The middle of an edge, as a transform origin's fraction. */
private const val HALF = 0.5f
