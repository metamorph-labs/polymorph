// ScrollArea (`design/components/scroll-area.md`): a token-styled scrollbar on a
// region the scroll map already lets scroll. It creates no scroll region of its
// own design: the viewport is Compose's scroll container on the axes
// `orientation` names, filling the box the app gives it, and the member draws
// the rail and the thumb from the recipe over it. Compose draws no scrollbar of
// its own on Android, and one shown only while the region moves would be the
// overlay habit the spec's guardrail forbids: a region at rest would look
// complete when it is not. So the drawn rail is a statement about the content
// in both directions:
//
// - **`always`** (the default): the rail is drawn whenever the content
//   overflows on its axis, and the viewport reserves the rail's thickness
//   (`space.3`) on that edge, so the last line scrolls clear of the thumb.
// - **`hover`**: the rail overlays the content and shows while a pointer is
//   over the region (a tablet's trackpad, a mouse), fading in at the control
//   duration on the enter easing and out at the control's exit duration. It
//   reserves nothing, because a gutter that appears on hover would move the
//   content.
// - **No overflow, either type: no rail.**
//
// The thumb is `border.strong` in a pill, `space.1` inside its rail, its
// length the viewport's share of the content with a floor of `space.6`, its
// position the scroll offset's share of the distance the content can travel.
// It follows the offset in the layout pass and is never animated. It depicts
// the position and is not a handle: the region pans under the finger. The
// rails are hidden from accessibility, as TalkBack scrolls the region itself.
// While the content overflows, the region is named by `label`, as the web
// names its region; a region that does not scroll has no name of its own.
//
// A region that pans sideways offers its content as much width as it asks
// for, as the web's scroll container does, so what it holds has a width of
// its own (a table, a line of code); content that fills the width it is
// offered, such as a settings row, belongs in a vertical region.
//
// Inside an overlay's body (a Dialog's, a Drawer's or a Popover's panel), the
// body is the one region that scrolls vertically (`LocalPMOverlayScroll`).
// Where the body offers the member unbounded height, the member styles that
// region rather than nesting a second one, which Compose cannot measure: its
// vertical axis is the body's scroll, its vertical rail is drawn by the body
// over the body's viewport, and a horizontal axis still pans inside the
// member. Given a height of its own, it scrolls itself, as anywhere else.

package dev.polymorph.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

object PMScrollArea : PMScrollAreaRendering {
    @Composable
    override fun Render(props: PMScrollAreaProps) {
        // The constraints decide whether an overlay's body is the region: it
        // is where the body offers unbounded height.
        BoxWithConstraints(propagateMinConstraints = true) {
            Area(props, unbounded = constraints.maxHeight == Constraints.Infinity)
        }
    }

    @Composable
    private fun Area(props: PMScrollAreaProps, unbounded: Boolean) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val orientation = props.orientation ?: PMScrollAreaOrientation.Vertical
        val type = props.type ?: PMScrollAreaType.Always
        // In an overlay's body that offers unbounded height, the vertical axis is the body's scroll.
        val overlay = LocalPMOverlayScroll.current?.takeIf { orientation != PMScrollAreaOrientation.Horizontal && unbounded }
        val own = rememberScrollState()
        val down = overlay?.state ?: own
        val across = rememberScrollState()
        var viewport by remember { mutableStateOf(IntSize.Zero) }
        val interaction = remember { MutableInteractionSource() }
        val hovered by interaction.collectIsHoveredAsState()

        val vertical = orientation != PMScrollAreaOrientation.Horizontal && down.maxValue > 0
        val horizontal = orientation != PMScrollAreaOrientation.Vertical && across.maxValue > 0
        val any = vertical || horizontal
        val shown = type == PMScrollAreaType.Always || hovered
        val gutter = if (type == PMScrollAreaType.Always) space.s3 else 0.dp
        // The body draws the vertical rail over its viewport and keeps its gutter.
        if (overlay != null) {
            DisposableEffect(overlay, type) {
                overlay.rail = type
                onDispose { if (overlay.rail == type) overlay.rail = null }
            }
        }
        val drawsVertical = vertical && overlay == null
        val attributes = buildMap {
            put("orientation", orientation.value)
            put("type", type.value)
            put("rails", if (vertical && horizontal) "both" else if (vertical) "vertical" else if (horizontal) "horizontal" else "none")
            if (any) put("state", if (shown) "visible" else "hidden")
        }

        Box(
            Modifier
                .pmMember("ScrollArea", attributes)
                .semantics { if (any) contentDescription = props.label }
                .onSizeChanged { viewport = it }
                .hoverable(interaction)
                .clipToBounds(),
        ) {
            Box(
                Modifier
                    .then(if (orientation != PMScrollAreaOrientation.Horizontal && overlay == null) Modifier.verticalScroll(down) else Modifier)
                    .then(if (orientation != PMScrollAreaOrientation.Vertical) Modifier.horizontalScroll(across) else Modifier),
            ) {
                Box(
                    Modifier
                        .then(if (orientation == PMScrollAreaOrientation.Vertical) Modifier.fillMaxWidth() else Modifier)
                        .padding(end = if (drawsVertical) gutter else 0.dp, bottom = if (horizontal) gutter else 0.dp),
                ) { props.children() }
            }
            val density = LocalDensity.current
            val size = with(density) { viewport.width.toDp() to viewport.height.toDp() }
            if (drawsVertical) {
                PMScrollAreaRail(
                    Modifier.align(Alignment.TopEnd),
                    vertical = true,
                    length = size.second - if (horizontal) space.s3 else 0.dp,
                    visible = viewport.height,
                    scroll = down,
                    shown = shown,
                    fades = type == PMScrollAreaType.Hover,
                )
            }
            if (horizontal) {
                PMScrollAreaRail(
                    Modifier.align(Alignment.BottomStart),
                    vertical = false,
                    length = size.first - if (drawsVertical) space.s3 else 0.dp,
                    visible = viewport.width,
                    scroll = across,
                    shown = shown,
                    fades = type == PMScrollAreaType.Hover,
                )
            }
        }
    }
}

/**
 * One of ScrollArea's rails, `space.3` thick on the region's end edge and
 * `length` long, transparent, with the thumb `space.1` inside it. `visible` is
 * the viewport's extent on the rail's axis, in pixels, and `scroll` its
 * offset. A `hover` rail fades in and out with `shown`; an `always` rail is
 * always shown. ScrollArea draws it on its own viewport, and an overlay's body
 * on its viewport for a ScrollArea inside it (`PMOverlayBody`).
 */
@Composable
internal fun PMScrollAreaRail(
    modifier: Modifier,
    vertical: Boolean,
    length: Dp,
    visible: Int,
    scroll: ScrollState,
    shown: Boolean,
    fades: Boolean,
) {
    val theme = PM.theme
    val space = theme.defaultDensity.spacing
    val motion = theme.defaultMotion
    val inset = space.s1
    val track = maxOf(0.dp, length - inset * 2)
    val thickness = space.s3 - inset * 2
    val density = LocalDensity.current
    // The viewport's share of the content, with a floor of `space.6`.
    val thumb = with(density) {
        val rail = track.toPx()
        val share = rail * visible / max(1, visible + scroll.maxValue)
        min(rail, max(space.s6.toPx(), share)).toDp()
    }
    val rail = modifier
        .semantics { hideFromAccessibility() }
        .size(if (vertical) space.s3 else maxOf(0.dp, length), if (vertical) maxOf(0.dp, length) else space.s3)
        .padding(inset)
    AnimatedVisibility(
        visible = shown || !fades,
        modifier = rail,
        enter = fadeIn(motion.easing.enter.tween(motion.duration.control)),
        exit = fadeOut(motion.easing.exit.tween(motion.duration.controlExit)),
    ) {
        Box(
            Modifier
                // Read in the layout pass, so scrolling moves the thumb without composing.
                .offset {
                    val travel = (track - thumb).roundToPx()
                    val along = if (scroll.maxValue > 0) (travel * scroll.value.toFloat() / scroll.maxValue).roundToInt() else 0
                    if (vertical) IntOffset(0, along) else IntOffset(along, 0)
                }
                .then(if (vertical) Modifier.width(thickness).height(thumb) else Modifier.width(thumb).height(thickness))
                .background(theme.colors.borderStrong.color, theme.rounded(theme.radius.pill)),
        )
    }
}

/**
 * ScrollArea's states, from the spec's States table. Each region is in a box
 * the fixture sizes, as the consumer sizes one: the canvas's width and 16rem
 * high, twice `space.10` wide, or that square. The renders show the rail, the
 * thumb's length and the gutter at rest; the hover rail is hidden, because the
 * harness has no pointer.
 */
object ScrollAreaStates : PMStates {
    override val member = "ScrollArea"

    private const val label = "Notification settings"
    private const val keyLabel = "API key"
    private val rows = listOf(
        "Daily digest",
        "Mentions",
        "Assignments",
        "Escalations",
        "Replies",
        "Snooze returns",
        "Weekly report",
        "Quiet hours",
    )

    /** A value with no break opportunities, so a narrow box must pan for it. */
    private const val unbroken = "pm_live_9f2c4e8b7a614d3f8c25b1e07d9a3c6f41e8b2d5"

    @Composable
    private fun Rows(count: Int = rows.size) {
        PMStack(gap = PMSpaceStep.S4) { for (row in rows.take(count)) PMSwitch(defaultChecked = true, label = row) }
    }

    @Composable
    private fun Key() {
        PMText(size = PMTextSize.Sm) { Text(unbroken, softWrap = false) }
    }

    @Composable
    private fun Tall(content: @Composable () -> Unit) {
        Box(Modifier.fillMaxWidth().height(PMGeometry.rem * TALL)) { content() }
    }

    @Composable
    private fun Square(content: @Composable () -> Unit) {
        val side = PM.theme.defaultDensity.spacing.s10 * 2
        Box(Modifier.size(side)) { content() }
    }

    @Composable
    private fun Narrow(content: @Composable () -> Unit) {
        Box(Modifier.width(PM.theme.defaultDensity.spacing.s10 * 2)) { content() }
    }

    /** The tall box's height, in rems: the spec's harness box. */
    private const val TALL = 16

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry(
                "vertical — the rail says more is coming",
                expect = mapOf("rails" to "vertical", "state" to "visible", "label" to label),
            ) { Tall { PMScrollArea(label = label) { Rows() } } },
            PMStateEntry(
                "horizontal — wide content in a narrow box",
                expect = mapOf("orientation" to "horizontal", "rails" to "horizontal", "label" to keyLabel),
            ) { Narrow { PMScrollArea(label = keyLabel, orientation = PMScrollAreaOrientation.Horizontal) { Key() } } },
            PMStateEntry("both — two rails and the corner", expect = mapOf("orientation" to "both", "rails" to "both")) {
                Square {
                    PMScrollArea(label = label, orientation = PMScrollAreaOrientation.Both) {
                        PMStack(gap = PMSpaceStep.S4) {
                            Key()
                            for (row in rows) PMText(size = PMTextSize.Sm) { Text(row) }
                        }
                    }
                }
            },
            PMStateEntry("fits — no rail on a region with nothing more to give", expect = mapOf("rails" to "none")) {
                Tall { PMScrollArea(label = label) { Rows(1) } }
            },
            PMStateEntry(
                "hover type — the rail overlays, hidden until the pointer arrives",
                expect = mapOf("type" to "hover", "rails" to "vertical", "state" to "hidden"),
            ) { Tall { PMScrollArea(label = label, type = PMScrollAreaType.Hover) { Rows() } } },
        )
}
