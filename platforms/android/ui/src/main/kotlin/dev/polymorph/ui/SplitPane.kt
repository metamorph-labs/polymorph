// SplitPane (`design/components/split-pane.md`), adapted: side by side on a
// tablet, one pane at a time on a phone.
//
// - **The split** (a medium or expanded window; a phone's is narrower than
//   `PMGeometry.compactWidth`): the start pane, the divider
//   and the end pane on the orientation's axis, the panes sharing the length
//   the divider leaves by `ratio`, never by dp. The floors (`startMin`,
//   `endMin`, in dp) hold whatever the ratio says, as the web's `minmax()`
//   does, and every move of the divider clamps to them. The divider is a
//   `space.2` seam with a hairline down its centre in `border.default`,
//   `border.strong` under a pointer, and `accent.bg` two hairlines wide while
//   it is dragged or focused, over the control duration. Compose extends its
//   touch area to the hit target without moving the panes. Dragging follows
//   the finger and commits on release; with keyboard focus the arrow keys on
//   the split axis move it by 2 of 100, Home and End to the floors, and each
//   key step commits, as a release does. In a right-to-left layout the start
//   pane is on the right, and the drag and the arrow keys follow it. To
//   TalkBack it is one adjustable node named by `label`, its value the start
//   pane's share in percent, which TalkBack's own gestures step.
// - **The pager** (a compact window): the two panes in a horizontal pager,
//   each as wide as the view, with two dots under them marking which one
//   shows. A phone has no room for two reading columns and a pane is never
//   hidden, so the reader swipes between them; TalkBack pages to each. The
//   ratio, the floors and `label` have no meaning here, so nothing reports a
//   ratio and the dots are decorative.
//
// Nothing animates the split: the ratio follows the reader's finger, and a
// transitioned pane would lag behind it. Each pane is clipped to its share.

package dev.polymorph.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import kotlin.math.max
import kotlin.math.roundToInt

/** Which form a SplitPane takes. */
enum class PMSplitPaneLayout(val value: String) { Split("split"), Pager("pager") }

/**
 * The SplitPane form to draw regardless of the window, for a fixture or a
 * preview; null follows the window's width class.
 */
val LocalPMSplitPaneLayout = compositionLocalOf<PMSplitPaneLayout?> { null }

object PMSplitPane : PMSplitPaneRendering {
    /** A keyboard step, in hundredths of the length: the spec's 2. */
    private const val STEP = 0.02f

    /** A ratio in percent, as the divider's value is spoken. */
    private const val PERCENT = 100

    @Composable
    override fun Render(props: PMSplitPaneProps) {
        val window = with(LocalDensity.current) { LocalWindowInfo.current.containerSize.width.toDp() }
        val layout = LocalPMSplitPaneLayout.current
            ?: if (window < PMGeometry.compactWidth) PMSplitPaneLayout.Pager else PMSplitPaneLayout.Split
        val orientation = props.orientation ?: PMSplitPaneOrientation.Horizontal
        val attributes = mapOf("orientation" to orientation.value, "layout" to layout.value)
        when (layout) {
            PMSplitPaneLayout.Split -> Split(props, orientation, attributes)
            PMSplitPaneLayout.Pager -> Pager(props, attributes)
        }
    }

    /** The split: the panes on the orientation's axis, sized by the ratio within the floors. */
    @Composable
    private fun Split(props: PMSplitPaneProps, orientation: PMSplitPaneOrientation, attributes: Map<String, String>) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val motion = theme.defaultMotion
        val density = LocalDensity.current
        val across = orientation == PMSplitPaneOrientation.Horizontal
        // Side by side, the start pane is on the right in a right-to-left
        // layout, so a drag and the arrow keys move the divider the other way.
        val mirrored = across && LocalLayoutDirection.current == LayoutDirection.Rtl
        var own by remember { mutableFloatStateOf((props.defaultRatio ?: HALF).toFloat()) }
        val ratio = props.ratio?.toFloat() ?: own
        var length by remember { mutableFloatStateOf(0f) }
        var dragging by remember { mutableStateOf(false) }
        val interaction = remember { MutableInteractionSource() }
        val hovered by interaction.collectIsHoveredAsState()
        val focused by interaction.collectIsFocusedAsState()
        val thickness = space.s2
        val startMin = with(density) { (props.startMin ?: 0.0).toFloat().dp.toPx() }
        val endMin = with(density) { (props.endMin ?: 0.0).toFloat().dp.toPx() }

        // The ratio's bounds the floors give at the measured length.
        fun clamp(value: Float): Float {
            if (length <= 0f) return value.coerceIn(0f, 1f)
            val low = startMin / length
            val high = 1f - endMin / length
            return if (low > high) low else value.coerceIn(low, high)
        }
        fun move(to: Float, commit: Boolean) {
            val next = clamp(to)
            own = next
            props.onRatioChange?.invoke(next.toDouble())
            if (commit) props.onCommit?.invoke(next.toDouble())
        }

        val line by animateColorAsState(
            (if (dragging || focused) theme.colors.accentBg else if (hovered) theme.colors.borderStrong else theme.colors.borderDefault).color,
            motion.easing.standard.tween(motion.duration.control),
            label = "divider",
        )
        val weight by animateDpAsState(
            if (dragging || focused) PMGeometry.hairline * 2 else PMGeometry.hairline,
            motion.easing.standard.tween(motion.duration.control),
            label = "divider",
        )
        val drag = rememberDraggableState { delta -> if (length > 0f) move(clamp(ratio) + delta / length, commit = false) }
        val shown = clamp(ratio)

        Layout(
            content = {
                Box(Modifier.clipToBounds()) { props.start() }
                Box(
                    Modifier
                        .semantics {
                            contentDescription = props.label
                            stateDescription = "${(shown * PERCENT).roundToInt()}%"
                            progressBarRangeInfo = ProgressBarRangeInfo(shown * PERCENT, 0f..PERCENT.toFloat())
                            setProgress { value ->
                                move(value / PERCENT, commit = true)
                                true
                            }
                        }
                        .draggable(
                            state = drag,
                            orientation = if (across) Orientation.Horizontal else Orientation.Vertical,
                            reverseDirection = mirrored,
                            interactionSource = interaction,
                            onDragStarted = { dragging = true },
                            onDragStopped = {
                                dragging = false
                                props.onCommit?.invoke(clamp(ratio).toDouble())
                            },
                        )
                        .hoverable(interaction)
                        .onKeyEvent { event ->
                            if (event.type != KeyEventType.KeyDown) return@onKeyEvent false
                            val forward = if (!across) Key.DirectionDown else if (mirrored) Key.DirectionLeft else Key.DirectionRight
                            val back = if (!across) Key.DirectionUp else if (mirrored) Key.DirectionRight else Key.DirectionLeft
                            when (event.key) {
                                forward -> move(shown + STEP, commit = true)
                                back -> move(shown - STEP, commit = true)
                                Key.MoveHome -> move(0f, commit = true)
                                Key.MoveEnd -> move(1f, commit = true)
                                else -> return@onKeyEvent false
                            }
                            true
                        }
                        .focusable(interactionSource = interaction)
                        .pmFocusRing(focused, theme.radius.none.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Box(
                        (if (across) Modifier.width(weight).fillMaxHeight() else Modifier.height(weight).fillMaxWidth())
                            .background(line),
                    )
                }
                Box(Modifier.clipToBounds()) { props.end() }
            },
            modifier = Modifier.pmMember("SplitPane", attributes),
        ) { measurables, constraints ->
            val bounded = if (across) constraints.hasBoundedWidth else constraints.hasBoundedHeight
            val crossBounded = if (across) constraints.hasBoundedHeight else constraints.hasBoundedWidth
            val seam = thickness.roundToPx()
            // A split needs a length to share: in a column that scrolls, a
            // stacked split takes its panes' own heights, and a side-by-side
            // one the taller pane's.
            val total = if (bounded) (if (across) constraints.maxWidth else constraints.maxHeight) else 0
            val available = max(0, total - seam)
            length = available.toFloat()
            val first = (clamp(ratio) * available).roundToInt().coerceIn(0, available)
            val second = available - first
            fun along(main: Int?, cross: Int?): Constraints = if (across) {
                Constraints(main ?: 0, main ?: Constraints.Infinity, cross ?: 0, cross ?: Constraints.Infinity)
            } else {
                Constraints(cross ?: 0, cross ?: Constraints.Infinity, main ?: 0, main ?: Constraints.Infinity)
            }
            val crossSize = if (crossBounded) (if (across) constraints.maxHeight else constraints.maxWidth) else null
            val start = measurables[0].measure(along(if (bounded) first else null, crossSize))
            val end = measurables[2].measure(along(if (bounded) second else null, crossSize))
            val crossUsed = crossSize ?: max(if (across) start.height else start.width, if (across) end.height else end.width)
            val divider = measurables[1].measure(along(seam, crossUsed))
            val firstUsed = if (bounded) first else if (across) start.width else start.height
            val mainUsed = if (bounded) total else firstUsed + seam + (if (across) end.width else end.height)
            val width = if (across) mainUsed else crossUsed
            val height = if (across) crossUsed else mainUsed
            layout(width, height) {
                if (across) {
                    start.placeRelative(0, 0)
                    divider.placeRelative(firstUsed, 0)
                    end.placeRelative(firstUsed + seam, 0)
                } else {
                    start.placeRelative(0, 0)
                    divider.placeRelative(0, firstUsed)
                    end.placeRelative(0, firstUsed + seam)
                }
            }
        }
    }

    /** The phone's form: the panes in a pager, a dot under them for each, the current one accent. */
    @Composable
    private fun Pager(props: PMSplitPaneProps, attributes: Map<String, String>) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val pager = rememberPagerState { PANES }
        BoxWithConstraints(Modifier.pmMember("SplitPane", attributes).fillMaxSize()) {
            // In a box of its own the pages take what the dots leave; in a
            // column that scrolls, their own height.
            val bounded = constraints.hasBoundedHeight
            Column(verticalArrangement = Arrangement.spacedBy(space.s3)) {
                HorizontalPager(
                    state = pager,
                    modifier = Modifier.fillMaxWidth().then(if (bounded) Modifier.weight(1f) else Modifier),
                ) { page ->
                    Box(Modifier.fillMaxWidth().clipToBounds()) { if (page == 0) props.start() else props.end() }
                }
                Row(
                    Modifier.fillMaxWidth().semantics { hideFromAccessibility() },
                    horizontalArrangement = Arrangement.spacedBy(space.s2, Alignment.CenterHorizontally),
                ) {
                    for (page in 0 until PANES) {
                        Box(
                            Modifier
                                .size(space.s2)
                                .background(
                                    (if (page == pager.currentPage) theme.colors.accentBg else theme.colors.borderDefault).color,
                                    theme.rounded(theme.radius.pill),
                                ),
                        )
                    }
                }
            }
        }
    }

    /** A split's two panes. */
    private const val PANES = 2

    /** The default ratio: an even split. */
    private const val HALF = 0.5
}

/**
 * SplitPane's states, from the spec's States table, each in a box the fixture
 * sizes, as a page sizes one: the split, laid out at a tablet's width and
 * scaled to the canvas, and the phone's pager.
 */
object SplitPaneStates : PMStates {
    override val member = "SplitPane"

    private const val label = "Resize navigator"
    private const val navigator = "Navigator"
    private const val canvas = "Canvas"

    @Composable
    private fun Pane(title: String) {
        Box(Modifier.fillMaxSize().background(PM.theme.colors.bgSurface.color)) {
            PMStack(p = PMSpaceStep.S4) { PMHeading(children = title, level = PMHeadingLevel.Level3) }
        }
    }

    @Composable
    private fun Tablet(content: @Composable () -> Unit) {
        PMFixtureWidth(PMGeometry.compactWidth) {
            CompositionLocalProvider(LocalPMSplitPaneLayout provides PMSplitPaneLayout.Split) {
                Box(Modifier.fillMaxWidth().height(PM.theme.defaultDensity.spacing.s10 * 4)) { content() }
            }
        }
    }

    @Composable
    private fun Phone(content: @Composable () -> Unit) {
        Box(Modifier.fillMaxWidth().height(PM.theme.defaultDensity.spacing.s10 * 4)) { content() }
    }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("even", expect = mapOf("orientation" to "horizontal", "layout" to "split")) {
                Tablet { PMSplitPane(end = { Pane(canvas) }, label = label, start = { Pane(navigator) }) }
            },
            PMStateEntry("apportioned", expect = mapOf("layout" to "split")) {
                Tablet { PMSplitPane(defaultRatio = 0.3, end = { Pane(canvas) }, label = label, start = { Pane(navigator) }) }
            },
            PMStateEntry("floors — the ratio asks for less than the start pane's floor", expect = mapOf("layout" to "split")) {
                Tablet {
                    PMSplitPane(defaultRatio = 0.1, end = { Pane(canvas) }, endMin = 160.0, label = label, start = { Pane(navigator) }, startMin = 160.0)
                }
            },
            PMStateEntry("stacked", expect = mapOf("orientation" to "vertical", "layout" to "split")) {
                Tablet {
                    PMSplitPane(end = { Pane(canvas) }, label = label, orientation = PMSplitPaneOrientation.Vertical, start = { Pane(navigator) })
                }
            },
            PMStateEntry("controlled", expect = mapOf("layout" to "split")) {
                Tablet { PMSplitPane(end = { Pane(canvas) }, label = label, ratio = 0.66, start = { Pane(navigator) }) }
            },
            PMStateEntry("on a phone — one pane at a time", expect = mapOf("layout" to "pager")) {
                Phone { PMSplitPane(end = { Pane(canvas) }, label = label, start = { Pane(navigator) }) }
            },
        )
}
