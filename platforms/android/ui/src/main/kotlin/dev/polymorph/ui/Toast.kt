// Toast (`design/components/toast.md`): a notification shaped as Android's
// Snackbar, at the bottom of the screen. The member is the viewport and its one
// card: placed over a screen (an overlay at its root, as a `SnackbarHost` is),
// it sits above the system bars and leaves the rest of the screen to the
// touches beneath it. Below 30rem of width, the recipe's phone register, the
// card spans the width inside `space.4` margins, `space.6` above the bottom;
// from 30rem it is the recipe's `space.10` × 4 card in the bottom-end corner,
// `space.6` from both edges. The width is the one the viewport is given, which
// at a screen's root is the window's, the web's viewport.
//
// The card is the recipe's: one neutral raised surface for every tone, the
// tone carried by the glyph (`success`, `error` for danger, `warning`, `info`;
// none for neutral), the title and description in `text.sm`, the host content
// under them, at most one action (ghost/accent, ghost/danger in a danger toast)
// at the row's end, as a Snackbar's action is, and the close button
// (ghost/neutral/sm icon-only `close`, named "Dismiss"). Every button in the
// card, the content's included, is tertiary (`LocalPMTertiary`), as the
// recipe's container rule makes it: the tone's text colour and nothing else,
// in every phase.
//
// Its tone sets how long it stays when the call sets neither `retained` nor
// `durationMs`, by the rule the web's store applies (`toast.md` §Lifetime):
// danger and warning are pinned until they are dismissed, and success, info and
// neutral leave after 5000 milliseconds. A toast with an action that sets
// neither is pinned whatever its tone, so a reader has the time to reach the
// action, as a Snackbar with an action label is indefinite. A call that sets
// either takes what it sets, with 5000 for a duration it leaves out. A time is lengthened as the
// platform's accessibility settings recommend for a notification that holds
// text, icons and controls, as Material's Snackbar is. The time stops while the
// card is under the pointer or holds focus (its action or close button), and
// resumes with what was left when both end. TalkBack's focus is not input
// focus, and Compose tells a member nothing of touch exploration, so TalkBack
// does not stop the time: a TalkBack user's time is the one the platform
// recommends for a card with controls, which follows the user's "Time to take
// action" setting (`design/platforms/android.json`). An infinite duration pins
// it, and `dismissible: false` keeps it until its owner removes it: no timer,
// no close button, no swipe. A dismissible toast also leaves on a horizontal
// swipe past the hit target and on TalkBack's dismiss action. A new `id` or
// title is a new notification: the card shows again, in place, and its time
// restarts. It is a live region, assertive for danger and warning, the web's
// `role="alert"`, and polite otherwise. `onDismiss` is called once when the
// card leaves by its close button, a swipe, TalkBack's dismiss action or its
// time, and not when its owner removes the member, as the web's store calls it.
//
// `retained` has no eviction to prevent here, because the viewport holds one
// card, which its owner replaces; a call that sets it chooses the lifetime, as
// on the web.

package dev.polymorph.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.platform.LocalAccessibilityManager
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.dismiss
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import dev.polymorph.tokens.PMDynamicColor
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

object PMToast : PMToastRendering {
    @Composable
    override fun Render(props: PMToastProps) {
        val theme = PM.theme
        val density = theme.defaultDensity
        val space = density.spacing
        val motion = theme.defaultMotion
        val strings = PMSpecDefault.strings
        val tone = props.tone ?: PMToastTone.Neutral
        val dismissible = props.dismissible ?: true
        // When the call sets neither `retained` nor `durationMs`, pinned for an
        // action and otherwise the tone's lifetime (`toast.md` §Lifetime);
        // otherwise `durationMs`, or the default where only `retained` is set.
        val duration = when {
            props.retained != null || props.durationMs != null -> props.durationMs ?: PMSpecDefault.toastDurationMs
            props.action != null -> Double.POSITIVE_INFINITY
            tone == PMToastTone.Danger || tone == PMToastTone.Warning -> Double.POSITIVE_INFINITY
            else -> PMSpecDefault.toastDurationMs
        }
        // What makes this a new notification rather than the same one.
        val identity = Triple(props.id, props.title, tone)
        val shown = remember { MutableTransitionState(false) }
        val drag = remember { Animatable(0f) }
        val scope = rememberCoroutineScope()
        val accessibility = LocalAccessibilityManager.current
        val travel = with(LocalDensity.current) { density.hitTarget.dp.toPx() }
        // The owner's latest callback, read when the card leaves, so the timer's
        // effect never calls one its owner has replaced.
        val onDismiss by rememberUpdatedState(props.onDismiss)
        val dismiss = {
            if (shown.targetState) {
                shown.targetState = false
                onDismiss?.invoke()
            }
        }
        val pointer = remember { MutableInteractionSource() }
        val hovered by pointer.collectIsHoveredAsState()
        var focused by remember { mutableStateOf(false) }
        val paused = hovered || focused
        // The time left of this notification's, which a pause keeps and its end resumes from.
        val left = remember(identity) { longArrayOf(UNSET) }

        LaunchedEffect(identity) {
            shown.targetState = true
            drag.snapTo(0f)
        }
        // The timer, which a pause stops and its end resumes. It counts down
        // in ticks, so a pause keeps the time left to within one.
        LaunchedEffect(identity, paused) {
            if (paused || !dismissible || duration.isInfinite()) return@LaunchedEffect
            if (left[0] == UNSET) {
                left[0] = accessibility?.calculateRecommendedTimeoutMillis(
                    duration.toLong(),
                    containsIcons = true,
                    containsText = true,
                    containsControls = dismissible || props.action != null,
                ) ?: duration.toLong()
            }
            while (left[0] > 0) {
                val step = minOf(TICK_MILLIS, left[0])
                delay(step)
                left[0] -= step
            }
            dismiss()
        }

        val attributes = buildMap {
            put("tone", tone.value)
            if (!dismissible) put("dismissible", "false")
            if (duration.isInfinite() || !dismissible) put("pinned", "true")
        }

        BoxWithConstraints(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing)) {
            val phone = maxWidth < PMRecipe.toastBelow
            val margin = if (phone) space.s4 else space.s6
            Box(
                Modifier.fillMaxSize().padding(start = margin, end = margin, bottom = space.s6),
                contentAlignment = if (phone) Alignment.BottomCenter else Alignment.BottomEnd,
            ) {
                AnimatedVisibility(
                    visibleState = shown,
                    // In on the default spring, out on the surface's exit.
                    enter = slideInVertically(motion.spring.base.spec()) { it } + fadeIn(motion.spring.base.spec()),
                    exit = fadeOut(motion.easing.exit.tween(motion.duration.surfaceExit)) +
                        slideOutVertically(motion.easing.exit.tween(motion.duration.surfaceExit)) { it },
                ) {
                    Card(
                        props = props,
                        tone = tone,
                        dismissible = dismissible,
                        dismiss = dismiss,
                        modifier = Modifier
                            .pmMember("Toast", attributes)
                            .hoverable(pointer)
                            .onFocusChanged { focused = it.hasFocus }
                            .then(if (phone) Modifier.fillMaxWidth() else Modifier.width(space.s10 * PMRecipe.toastWidth))
                            .semantics {
                                liveRegion = if (tone == PMToastTone.Danger || tone == PMToastTone.Warning) {
                                    LiveRegionMode.Assertive
                                } else {
                                    LiveRegionMode.Polite
                                }
                                if (dismissible) dismiss(strings.dismiss) { dismiss(); true }
                            }
                            .offset { IntOffset(drag.value.roundToInt(), 0) }
                            .then(
                                if (dismissible) {
                                    Modifier.draggable(
                                        state = rememberDraggableState { delta -> scope.launch { drag.snapTo(drag.value + delta) } },
                                        orientation = Orientation.Horizontal,
                                        onDragStopped = {
                                            // Past the hit target it leaves; a shorter swipe springs back.
                                            if (abs(drag.value) > travel) dismiss()
                                            drag.animateTo(0f, motion.spring.base.spec())
                                        },
                                    )
                                } else {
                                    Modifier
                                },
                            ),
                    )
                }
            }
        }
    }

    @Composable
    private fun Card(props: PMToastProps, tone: PMToastTone, dismissible: Boolean, dismiss: () -> Unit, modifier: Modifier) {
        val theme = PM.theme
        val density = theme.defaultDensity
        val space = density.spacing
        val colors = theme.colors
        val glyph = glyph(tone)
        CompositionLocalProvider(LocalPMTertiary provides true) {
            Row(
                modifier = modifier
                    .pmOverlaySurface(colors.bgRaised, colors.borderDefault)
                    .padding(density.inset.pane.dp),
                horizontalArrangement = Arrangement.spacedBy(space.s3),
                verticalAlignment = Alignment.Top,
            ) {
                glyph?.let { (role, color) ->
                    Box(Modifier.heightIn(min = theme.text.sm.lineBox.dp), contentAlignment = Alignment.Center) {
                        PMIconView(role, PMControlSize.Md, tint = color.color)
                    }
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(space.s1)) {
                    Text(text = props.title, style = theme.text.sm.textStyle, color = colors.textPrimary.color)
                    props.description?.let {
                        Text(text = it, style = theme.text.sm.textStyle, color = colors.textSecondary.color)
                    }
                    props.content?.let { content ->
                        Box(Modifier.padding(top = space.s1)) {
                            CompositionLocalProvider(
                                LocalTextStyle provides theme.text.sm.textStyle,
                                LocalContentColor provides colors.textSecondary.color,
                            ) { content() }
                        }
                    }
                }
                props.action?.let { action ->
                    PMButton(
                        label = action.label,
                        onClick = action.onClick,
                        size = PMControlSize.Sm,
                        appearance = if (tone == PMToastTone.Danger) PMButtonAppearance.GhostDanger else PMButtonAppearance.GhostAccent,
                    )
                }
                if (dismissible) {
                    PMButton(
                        icon = PMIconRole.Close,
                        iconOnly = true,
                        label = PMSpecDefault.strings.dismiss,
                        onClick = dismiss,
                        size = PMControlSize.Sm,
                        appearance = PMButtonAppearance.GhostNeutral,
                    )
                }
            }
        }
    }

    @Composable
    private fun glyph(tone: PMToastTone): Pair<PMIconRole, PMDynamicColor>? {
        val colors = PM.theme.colors
        return when (tone) {
            PMToastTone.Neutral -> null
            PMToastTone.Success -> PMIconRole.Success to colors.successText
            PMToastTone.Danger -> PMIconRole.Error to colors.dangerText
            PMToastTone.Warning -> PMIconRole.Warning to colors.warningText
            PMToastTone.Info -> PMIconRole.Info to colors.infoText
        }
    }

    /** No time measured yet: the timer has not started for this notification. */
    private const val UNSET = -1L

    /** The timer's step, the resolution of the time a pause keeps: not a design value. */
    private const val TICK_MILLIS = 100L
}

/**
 * Toast's states, from the spec's States table: every tone, title only, an
 * action, pinned, and one its owner must remove. Each is pinned, so the harness
 * sees it.
 */
object ToastStates : PMStates {
    override val member = "Toast"

    private const val pinned = Double.POSITIVE_INFINITY

    override val entries: List<PMStateEntry>
        get() = PMToastTone.entries.map { tone ->
            PMStateEntry("tone ${tone.value}", expect = mapOf("tone" to tone.value)) {
                PMToast(
                    description = "The tone speaks through the glyph and nothing else.",
                    durationMs = pinned,
                    title = tone.name,
                    tone = tone,
                )
            }
        } + listOf(
            PMStateEntry("title only", expect = mapOf("tone" to "neutral")) {
                PMToast(durationMs = pinned, title = "Ticket created")
            },
            PMStateEntry("with an action", expect = mapOf("tone" to "success", "contains" to "Button")) {
                PMToast(action = PMToastAction("Undo") {}, durationMs = pinned, title = "Ticket archived", tone = PMToastTone.Success)
            },
            PMStateEntry("danger, with an action", expect = mapOf("tone" to "danger")) {
                PMToast(
                    action = PMToastAction("Retry") {},
                    description = "The ticket is referenced by another.",
                    durationMs = pinned,
                    title = "Could not delete",
                    tone = PMToastTone.Danger,
                )
            },
            PMStateEntry(
                "content with a solid button — tertiary inside a toast",
                expect = mapOf("tone" to "neutral", "contains" to "Button"),
            ) {
                PMToast(
                    content = { PMButton(label = "View ticket") },
                    durationMs = pinned,
                    title = "Ticket assigned to you",
                )
            },
            PMStateEntry("from 30rem — a card in the bottom-end corner", expect = mapOf("tone" to "info")) {
                PMFixtureWidth(PMGeometry.compactWidth) {
                    PMToast(
                        description = "The card keeps the recipe's width beside the content.",
                        durationMs = pinned,
                        title = "Export ready",
                        tone = PMToastTone.Info,
                    )
                }
            },
            PMStateEntry("pinned — it waits to be dismissed", expect = mapOf("pinned" to "true")) {
                PMToast(description = "This one has no timer.", durationMs = pinned, title = "Still working")
            },
            PMStateEntry(
                "owned — no close, no timer, no swipe",
                expect = mapOf("dismissible" to "false", "pinned" to "true"),
            ) {
                PMToast(
                    action = PMToastAction("Retry") {},
                    description = "Retry when the connection is back.",
                    dismissible = false,
                    retained = true,
                    title = "Could not sync",
                    tone = PMToastTone.Warning,
                )
            },
        )
}
