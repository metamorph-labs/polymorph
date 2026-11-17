// The overlay parts Dialog, Toast and the anchored overlays share: the
// trigger, which opens an overlay through `LocalPMTriggerAction`, the overlay
// surface, the bottom sheet's surface and edge, and an overlay's body, the
// panel's one scroll region, which the members inside it share.

package dev.polymorph.ui

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import dev.polymorph.tokens.PMDynamicColor

/**
 * An overlay's trigger, with the overlay's opening action in
 * `LocalPMTriggerAction` for the Button inside it, which runs it after its own
 * `onClick`, as the web clones the trigger to add one.
 */
@Composable
fun PMOverlayTrigger(trigger: PMContent?, open: () -> Unit) {
    if (trigger == null) return
    CompositionLocalProvider(LocalPMTriggerAction provides open) { trigger() }
}

/**
 * An overlay's surface: `fill` (`bg.overlay` for a dialog, `bg.raised` for a
 * toast), a hairline `border`, `radius.surface` and the transient shadow.
 */
@Composable
fun Modifier.pmOverlaySurface(fill: PMDynamicColor, border: PMDynamicColor): Modifier {
    val theme = PM.theme
    val shape = theme.rounded(theme.radius.surface)
    return this
        .pmShadow(theme.shadows.transient, shape)
        .background(fill.color, shape)
        .border(PMGeometry.hairline, border.color, shape)
}

/**
 * The bottom sheet's surface, the recipe's sheet presentation: `bg.overlay`,
 * the top corners at `radius.surface` and the bottom ones square, the
 * transient shadow, and a `border.subtle` hairline along the top edge and its
 * corners only, because the other edges are the screen's.
 */
@Composable
fun Modifier.pmSheetSurface(): Modifier {
    val theme = PM.theme
    val radius = theme.radius.surface.dp
    val shape = RoundedCornerShape(topStart = radius, topEnd = radius)
    return this
        .pmShadow(theme.shadows.transient, shape)
        .background(theme.colors.bgOverlay.color, shape)
        .pmSheetEdge()
}

/**
 * The bottom sheet's edge: a `border.subtle` hairline along the top edge of a
 * box whose top corners are at `radius.surface`, and around those corners,
 * drawn over the content. Material's bottom sheet draws its own surface, so
 * `PMBottomSheet` draws this edge alone.
 */
@Composable
fun Modifier.pmSheetEdge(): Modifier {
    val theme = PM.theme
    val radius = theme.radius.surface.dp
    val border = theme.colors.borderSubtle.color
    return drawWithContent {
        drawContent()
        val stroke = PMGeometry.hairline.toPx()
        val inset = stroke / 2
        val corner = radius.toPx()
        val edge = Path().apply {
            moveTo(inset, corner)
            arcTo(Rect(inset, inset, inset + corner * 2, inset + corner * 2), HALF_TURN, QUARTER_TURN, false)
            lineTo(size.width - corner - inset, inset)
            arcTo(
                Rect(size.width - inset - corner * 2, inset, size.width - inset, inset + corner * 2),
                THREE_QUARTER_TURN,
                QUARTER_TURN,
                false,
            )
        }
        drawPath(edge, border, style = Stroke(stroke))
    }
}

/** Angles in degrees for a corner's arc: geometry, not design values. */
private const val QUARTER_TURN = 90f
private const val HALF_TURN = 180f
private const val THREE_QUARTER_TURN = 270f

/**
 * The scroll of an overlay's body, which the members inside it share. An
 * overlay's body is its panel's one scroll region (`scroll-area.md`), and
 * Compose cannot measure a vertical scroll inside another: the inner one is
 * offered unbounded height. So a member that scrolls vertically (ScrollArea,
 * ChatThread) finds this in `LocalPMOverlayScroll` and scrolls the body
 * through `state` instead of nesting a scroll of its own. A ScrollArea asks
 * the body to draw its rail over the body's viewport (`rail`, its type), and a
 * ChatThread puts its jump control at the viewport's foot (`floating`).
 */
@Stable
class PMOverlayScroll(val state: ScrollState) {
    /** The type of the rail a ScrollArea in the body asks for, or null when none does. */
    var rail: PMScrollAreaType? by mutableStateOf(null)

    /** What a member in the body draws at the foot of the viewport, over the content, or null. */
    var floating: PMContent? by mutableStateOf(null)
}

/** The body of the overlay a member is drawn in, or null outside one: see `PMOverlayScroll`. */
val LocalPMOverlayScroll = staticCompositionLocalOf<PMOverlayScroll?> { null }

/**
 * An overlay's body: `content` scrolls vertically inside `modifier`'s box, the
 * viewport, and shares that scroll with the members inside it
 * (`LocalPMOverlayScroll`). While a ScrollArea inside asks for its rail and the
 * content overflows, the body draws ScrollArea's rail on the viewport's end
 * edge (`PMScrollAreaRail`); for the `always` type the content keeps the
 * rail's thickness, `space.3`, clear on that edge, as ScrollArea's own
 * viewport does, and for `hover` the rail shows while a pointer is over the
 * body. What a member floats (`PMOverlayScroll.floating`) is drawn centred at
 * the viewport's foot.
 */
@Composable
fun PMOverlayBody(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    val space = PM.theme.defaultDensity.spacing
    val scroll = rememberScrollState()
    val shared = remember(scroll) { PMOverlayScroll(scroll) }
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    var viewport by remember { mutableStateOf(IntSize.Zero) }
    val rail = shared.rail?.takeIf { scroll.maxValue > 0 }
    Box(modifier.onSizeChanged { viewport = it }.hoverable(interaction)) {
        Box(
            Modifier
                .verticalScroll(scroll)
                .padding(end = if (rail == PMScrollAreaType.Always) space.s3 else 0.dp),
        ) {
            CompositionLocalProvider(LocalPMOverlayScroll provides shared, content = content)
        }
        if (rail != null) {
            PMScrollAreaRail(
                Modifier.align(Alignment.TopEnd),
                vertical = true,
                length = with(LocalDensity.current) { viewport.height.toDp() },
                visible = viewport.height,
                scroll = scroll,
                shown = rail == PMScrollAreaType.Always || hovered,
                fades = rail == PMScrollAreaType.Hover,
            )
        }
        shared.floating?.let { floating -> Box(Modifier.align(Alignment.BottomCenter)) { floating() } }
    }
}
