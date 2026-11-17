// The page archetypes' shared parts (`design/archetypes/*.md`, and
// `design/native/screen-contract.md` for the load states): the page column,
// its insets, measure and gutter, one space step smaller in a region narrower
// than 40rem; the body panel in Card's surface recipe; the failed state's
// Alert; the loading state's Skeleton rows; the body of two regions that
// stacks below 44rem (DetailPage, Dashboard); and the page-transitions
// convention's pending ribbon and arrival (AuthPage). Every archetype draws
// with them, so each is its regions and its states and nothing more.

package dev.polymorph.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import kotlin.math.max
import kotlin.math.min

/**
 * The column every page archetype draws: its regions in order with the
 * content gutter between them, inside the page insets, no wider than
 * `measure` of the largest space step, in a scroll container, on the app
 * background. The scroll container ends at the keyboard, so a focused field
 * and a form's actions scroll into view above it in an app drawn edge to edge,
 * which the keyboard does not resize; insets a parent has already consumed
 * are not applied twice. The root carries the member's identity and the load
 * status.
 */
@Composable
fun PMPage(measure: Int, member: String, status: PMLoadStatus, content: @Composable ColumnScope.() -> Unit) {
    val theme = PM.theme
    val space = theme.defaultDensity.spacing
    Box(
        Modifier
            .pmMember(member, mapOf("status" to status.kind))
            .fillMaxSize()
            .background(theme.colors.bgApp.color)
            .imePadding()
            .verticalScroll(rememberScrollState()),
    ) {
        PMPageColumn(
            wide = space.s7 to space.s6,
            narrow = space.s6 to space.s5,
            maxWidth = space.s10 * measure,
            breakpoint = PMRecipe.pageNarrowBelow,
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(space.s6), content = content)
        }
    }
}


/**
 * The page's insets and measure. Its own width decides the insets, as the
 * web's page queries the region that holds it: below `breakpoint` the
 * `narrow` pair (horizontal, vertical), else the `wide` one. The column is no
 * wider than `maxWidth` with its insets, as the recipes' `max-inline-size`
 * measures the border box, and it is centred.
 */
@Composable
fun PMPageColumn(
    wide: Pair<Dp, Dp>,
    narrow: Pair<Dp, Dp>,
    maxWidth: Dp,
    breakpoint: Dp,
    content: @Composable () -> Unit,
) {
    Layout(content) { measurables, constraints ->
        val width = if (constraints.hasBoundedWidth) constraints.maxWidth else maxWidth.roundToPx()
        val (horizontal, vertical) = if (width.toDp() < breakpoint) narrow else wide
        val inset = horizontal.roundToPx()
        val column = max(0, min(maxWidth.roundToPx(), width) - inset * 2)
        val placeables = measurables.map { it.measure(Constraints(minWidth = column, maxWidth = column)) }
        val top = vertical.roundToPx()
        val height = placeables.sumOf { it.height } + top * 2
        layout(width, max(height, constraints.minHeight)) {
            var y = top
            for (placeable in placeables) {
                placeable.placeRelative((width - column) / 2, y)
                y += placeable.height
            }
        }
    }
}

/** A page's body panel: Card's surface recipe exactly, clipped, so a table's rows reach its edges. */
@Composable
fun PMPagePanel(content: @Composable () -> Unit) {
    val theme = PM.theme
    val shape = theme.rounded(theme.radius.surface)
    Box(
        Modifier
            .fillMaxWidth()
            .pmShadow(theme.shadows.resting, shape)
            .clip(shape)
            .background(theme.colors.bgSurface.color)
            .pmInsetShadow(theme.shadows.insetTop, shape)
            .border(PMGeometry.hairline, theme.colors.borderSubtle.color, shape),
    ) {
        content()
    }
}

/**
 * The failed state: a danger Alert with the message as its body, and the
 * retry as its action when the page has one. Alert announces nothing of its
 * own, because an Alert is usually on the screen from the start; a failure
 * arrives after the screen did, so it is an assertive live region, as the
 * web's danger Alert is `aria-live="assertive"` (`alert.md`).
 */
@Composable
fun PMPageFailure(message: String, onRetry: (() -> Unit)?) {
    val retry = PMSpecDefault.strings.retry
    Box(Modifier.semantics { liveRegion = LiveRegionMode.Assertive }) {
        PMAlert(
            action = onRetry?.let { action ->
                {
                    PMButton(
                        label = retry,
                        onClick = action,
                        size = PMControlSize.Sm,
                        appearance = PMButtonAppearance.SoftDanger,
                    )
                }
            },
            tone = PMAlertTone.Danger,
        ) { Text(message) }
    }
}

/**
 * The loading body: rows of text Skeletons, the first named "Loading" for
 * assistive technology and the rest hidden.
 */
@Composable
fun PMPageSkeletonRows(rows: Int = SKELETON_ROWS) {
    val space = PM.theme.defaultDensity.spacing
    val loading = PMSpecDefault.strings.loading
    Column(verticalArrangement = Arrangement.spacedBy(space.s4)) {
        for (row in 0 until rows) {
            Column(verticalArrangement = Arrangement.spacedBy(space.s2)) {
                PMSkeleton(label = if (row == 0) loading else null, textStep = PMSkeletonTextStep.Sm)
                PMSkeleton(textStep = PMSkeletonTextStep.Xs, width = PMSkeletonWidth.Width10)
            }
        }
    }
}

/** How many Skeleton rows a loading body draws, as the specs count them. */
private const val SKELETON_ROWS = 5

/**
 * A page body of two regions, `main` and `side`, `gap` apart: side by side
 * from `PMRecipe.regionsStackBelow` (44rem) of the body's own width, stacked
 * below it, the main region first, because on a phone the side region would
 * otherwise be a margin beside a sliver (Grid's rule for N=2). `side` is the
 * side region's fixed width (DetailPage's aside), the main region taking the
 * rest; without it the two share the width by `weights` (Dashboard's 2fr 1fr).
 * Stacked, an empty main region adds no gap above the side one.
 */
@Composable
fun PMPageRegions(
    gap: Dp,
    main: @Composable () -> Unit,
    side: @Composable () -> Unit,
    sideWidth: Dp? = null,
    weights: Pair<Float, Float> = 1f to 1f,
) {
    Layout(content = {
        Box { main() }
        Box { side() }
    }) { measurables, constraints ->
        val width = constraints.maxWidth
        val between = gap.roundToPx()
        val loose = Constraints(maxHeight = constraints.maxHeight)
        if (constraints.hasBoundedWidth && width.toDp() >= PMRecipe.regionsStackBelow) {
            val shared = max(0, width - between)
            val sidePx = sideWidth?.roundToPx()?.let { min(it, shared) }
                ?: (shared * weights.second / (weights.first + weights.second)).toInt()
            val mainPx = shared - sidePx
            val first = measurables[0].measure(loose.copy(minWidth = mainPx, maxWidth = mainPx))
            val second = measurables[1].measure(loose.copy(minWidth = sidePx, maxWidth = sidePx))
            layout(width, max(first.height, second.height)) {
                first.placeRelative(0, 0)
                second.placeRelative(mainPx + between, 0)
            }
        } else {
            val fixed = loose.copy(minWidth = width, maxWidth = width)
            val first = measurables[0].measure(fixed)
            val second = measurables[1].measure(fixed)
            val top = if (first.height > 0) first.height + between else 0
            layout(width, top + second.height) {
                first.placeRelative(0, 0)
                second.placeRelative(0, top)
            }
        }
    }
}

/**
 * The page-transitions convention's pending ribbon
 * (`design/conventions/page-transitions.md`): an accent bar `space.1` tall
 * along the page's top, growing across it once an ambient shimmer period;
 * still and full at the `none` temperament, whose period is 0. Decorative:
 * the page's own state is what is announced.
 */
@Composable
fun PMPageRibbon(modifier: Modifier = Modifier) {
    val theme = PM.theme
    val period = theme.defaultMotion.ambient.shimmer
    val bar = theme.colors.accentBg.color
    val phase = if (period > 0) {
        val running by rememberInfiniteTransition(label = "ribbon").animateFloat(
            initialValue = 0f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(tween(period, easing = LinearEasing), RepeatMode.Restart),
            label = "ribbon",
        )
        running
    } else {
        1f
    }
    Box(
        modifier
            .fillMaxWidth()
            .height(theme.defaultDensity.spacing.s1)
            .semantics { hideFromAccessibility() }
            .drawBehind {
                // It grows from the start edge: the left, or the right in a right-to-left layout.
                val grown = size.width * phase
                val x = if (layoutDirection == LayoutDirection.Rtl) size.width - grown else 0f
                drawRect(bar, topLeft = Offset(x, 0f), size = Size(grown, size.height))
            },
    )
}

/**
 * The page-transitions convention's arrival: `content` fades in again whenever
 * `key` changes, on the enter easing over the surface duration, keeping its
 * state, its focus and its scroll position. The first composition is drawn at
 * rest, and the `none` temperament's zero duration skips the fade.
 */
@Composable
fun PMPageArrival(key: String?, content: @Composable () -> Unit) {
    val motion = PM.theme.defaultMotion
    val shown = remember { Animatable(1f) }
    var seen by remember { mutableStateOf(key) }
    LaunchedEffect(key) {
        if (key == seen) return@LaunchedEffect
        seen = key
        shown.snapTo(0f)
        shown.animateTo(1f, motion.easing.enter.tween(motion.duration.surface))
    }
    Box(Modifier.graphicsLayer { alpha = shown.value }) { content() }
}
