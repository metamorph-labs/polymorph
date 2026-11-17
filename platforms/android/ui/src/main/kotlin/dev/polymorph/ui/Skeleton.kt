// Skeleton (`design/components/skeleton.md`): a placeholder that holds the
// layout while content arrives. Every size is a token: a `text` skeleton is
// exactly the line box of the step it stands in for, so nothing moves when the
// text arrives; `rect` and `circle` take a space step, and `width` is a space
// step or the full width.
//
// The `shimmer` sweep moves a band of `bg.raised` across the `bg.subtle` fill
// over the temperament's ambient period (a calmer temperament sweeps slower).
// At the `none` temperament, whose period is zero, the fill stays still: the
// placeholder itself is the loading signal.
//
// Unlabelled, it is hidden from accessibility, because a grey box means
// nothing. With `label` it stands for a named region and is one node with that
// name and an indeterminate progress, which TalkBack reads as in progress.

package dev.polymorph.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.polymorph.tokens.PMTheme

object PMSkeleton : PMSkeletonRendering {
    @Composable
    override fun Render(props: PMSkeletonProps) {
        val theme = PM.theme
        val shape = props.shape ?: PMSkeletonShape.Text
        val space = theme.defaultDensity.spacing
        val step = props.textStep ?: PMSkeletonTextStep.Md
        val side = props.size?.let { space[it] }
        val width: Dp? = props.width?.takeIf { it != PMSkeletonWidth.Full }?.let { space[PMSpaceStep.entries[it.value.toInt()]] }
        val height = when (shape) {
            PMSkeletonShape.Text -> lineBox(theme, step).dp
            PMSkeletonShape.Rect, PMSkeletonShape.Circle -> side ?: space.s0
        }
        val corner = when (shape) {
            PMSkeletonShape.Text -> theme.radius.detail
            PMSkeletonShape.Rect -> theme.radius.md
            PMSkeletonShape.Circle -> theme.radius.pill
        }
        val attributes = if (shape == PMSkeletonShape.Text) {
            mapOf("shape" to shape.value, "text-step" to step.value)
        } else {
            mapOf("shape" to shape.value)
        }
        val label = props.label
        val base = theme.colors.bgSubtle.color
        val band = theme.colors.bgRaised.color
        val period = theme.defaultMotion.ambient.shimmer

        val sized = when {
            shape == PMSkeletonShape.Circle -> Modifier.size(height)
            width != null -> Modifier.width(width).height(height)
            else -> Modifier.fillMaxWidth().height(height)
        }
        val shimmer = if (period > 0) {
            val phase by rememberInfiniteTransition(label = "shimmer").animateFloat(
                initialValue = 0f,
                targetValue = 1f,
                animationSpec = infiniteRepeatable(tween(period, easing = LinearEasing), RepeatMode.Restart),
                label = "shimmer",
            )
            // A band twice the block's width, from `base` through `band` and
            // back, moving from one width before the block to one width past it.
            Modifier.drawWithContent {
                drawContent()
                val layer = size.width * 2
                val start = layer * 2 * phase - layer
                drawRect(Brush.horizontalGradient(listOf(base, band, base), startX = start, endX = start + layer))
            }
        } else {
            Modifier
        }

        Box(
            Modifier
                .pmMember("Skeleton", attributes)
                .then(
                    if (label != null) {
                        Modifier.clearAndSetSemantics {
                            contentDescription = label
                            progressBarRangeInfo = ProgressBarRangeInfo.Indeterminate
                        }
                    } else {
                        Modifier.semantics { hideFromAccessibility() }
                    },
                )
                .then(sized)
                .clip(theme.rounded(corner))
                .background(base)
                .then(shimmer),
        )
    }

    /** A text step's line box. */
    private fun lineBox(theme: PMTheme, step: PMSkeletonTextStep): Float {
        val text = theme.text
        return when (step) {
            PMSkeletonTextStep.Xs -> text.xs
            PMSkeletonTextStep.Sm -> text.sm
            PMSkeletonTextStep.Md -> text.md
            PMSkeletonTextStep.Lg -> text.lg
            PMSkeletonTextStep.Xl -> text.xl
            PMSkeletonTextStep.TextStep2xl -> text.text2xl
            PMSkeletonTextStep.TextStep3xl -> text.text3xl
        }.lineBox
    }
}

/**
 * Skeleton's states, from the spec's States table. The unlabelled shapes are
 * hidden from accessibility, which `hidden` tells the harness.
 */
object SkeletonStates : PMStates {
    override val member = "Skeleton"

    private const val label = "Loading tickets"

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("text default", expect = mapOf("hidden" to "true")) { PMSkeleton() },
            PMStateEntry("text steps", expect = mapOf("hidden" to "true")) {
                PMSkeleton(textStep = PMSkeletonTextStep.TextStep2xl)
            },
            PMStateEntry("rect", expect = mapOf("hidden" to "true")) {
                PMSkeleton(shape = PMSkeletonShape.Rect, size = PMSpaceStep.S8, width = PMSkeletonWidth.Width10)
            },
            PMStateEntry("circle", expect = mapOf("hidden" to "true")) {
                PMSkeleton(shape = PMSkeletonShape.Circle, size = PMSpaceStep.S7)
            },
            PMStateEntry("labelled region", expect = mapOf("shape" to "text", "label" to label)) {
                PMSkeleton(label = label)
            },
        )
}
