// Slider (`design/components/slider.md`): a value chosen from a numeric range,
// or with `range` a low and a high value on one track. It is Material 3's
// slider, or its range slider, drawn to the recipe through its thumb and track
// slots inside the Material bridge, so the drag, a press on the track moving
// the nearest thumb there, the arrow, Page and Home and End keys, the
// right-to-left flip and the accessibility actions are the platform's. Its
// steps are `step`'s when `step` divides the range into at most a thousand.
// Otherwise the value is snapped to `step` here. Either way it stays within
// `min` and `max`, and under `range` the thumbs cannot cross.
//
// Material moves a slider without steps by a hundredth of the range for a key
// and by a twentieth for TalkBack's adjustment, and the snap would round
// either back to where it was. So for such a slider the arrows move the
// focused thumb by `step`, and Page Up and Page Down by ten steps; the
// horizontal arrows are swapped in a right-to-left layout. TalkBack's
// adjustment of a thumb, a single one or either of a range's, moves it at least
// one `step` toward the value it asks for.
//
// It looks like Progress with a handle: the track is the bar (`PMBar`),
// `space-2` tall on `bg.subtle`, a pill running the row's full width, with the
// accent gradient filling from the start to the thumb (between the thumbs
// under `range`). The thumb is a `space-5` disc on `bg.surface` with a
// `border.strong` hairline and the lit shadow. Under the pointer its border
// turns `accent.bg`; while it is pressed or dragged it also grows by the
// recipe's 1.12 on the `snappy` spring and the hover glow replaces its lit
// shadow, and at the `none` temperament it does not grow. The thumb and the
// fill follow the finger exactly and are never animated. Invalid draws the
// thumb's border in `danger.border` and leaves the fill alone, because a red
// fill would read as a danger level; disabled draws the fill `border.default`
// and the thumb with a `border.subtle` hairline and no shadow. Keyboard focus
// draws the focus ring around the thumb.
//
// `onChange` reports every change and `onCommit` the value when a drag ends
// or a key has stepped it. The row is the hit target tall, the track centred
// in it. The `showValue` readout above the row's end shows `formatValue`'s
// text (by default the number, without a fraction when it is whole) in
// `text.sm` `text.secondary` with tabular figures, both values joined by an en
// dash under `range`, and is not spoken.
//
// To accessibility each thumb is Android's slider: named by `ariaLabel` or its
// FormField's label, carrying the field's message, or "Invalid", as its error
// while invalid. A single thumb's value is `formatValue`'s text; a range
// slider's thumbs are Material's, which speak "Range start" and "Range end"
// before the name and their number as Material writes it, because Material
// sets their value itself. A thumb pressed from the keyboard does not grow,
// because Material's keys move it without a press. `ariaRequired` has no
// Android semantics, and the `aria-*by` ids have no Compose counterpart.

package dev.polymorph.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsDraggedAsState
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.RangeSlider
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import dev.polymorph.tokens.PMShadow
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.round
import kotlin.math.roundToInt

object PMSlider : PMSliderRendering {
    // The thumb and track slots, which draw the recipe, are Material's
    // experimental API.
    @OptIn(ExperimentalMaterial3Api::class)
    @Composable
    override fun Render(props: PMSliderProps) {
        val theme = PM.theme
        val field = LocalPMField.current
        val strings = PMSpecDefault.strings
        val scale = Scale(props)
        val range = props.range ?: false
        val disabled = (props.disabled ?: false) || !LocalPMEnabled.current
        val invalid = (props.invalid ?: false) || (field?.invalid ?: false)
        val name = props.ariaLabel ?: field?.label
        val error = if (invalid) field?.error ?: strings.invalid else null
        val format: (Double) -> String = props.formatValue ?: ::plain
        val report = LocalPMFieldReport.current
        SideEffect { report?.invoke(PMFieldControl(disabled = disabled)) }

        var own by remember { mutableStateOf(scale.thumbs(props.defaultValue, range)) }
        val shown = props.value?.let { scale.thumbs(it, range) } ?: own
        // What the thumbs hold now, for the commit that follows a change
        // before the slider has drawn it.
        val latest = remember { Latest(shown) }
        latest.values = shown
        val reported = { values: List<Double> ->
            if (range) PMSliderValue.Range(values[0] to values[1]) else PMSliderValue.Single(values[0])
        }
        val set = { next: List<Double> ->
            if (next != latest.values) {
                latest.values = next
                own = next
                props.onChange?.invoke(reported(next))
            }
        }
        val commit: () -> Unit = { props.onCommit?.invoke(reported(latest.values)) }

        val start = remember { MutableInteractionSource() }
        val end = remember { MutableInteractionSource() }
        val startHeld = start.held()
        val endHeld = end.held()
        val endFocused by end.collectIsFocusedAsState()
        val rtl = LocalLayoutDirection.current == LayoutDirection.Rtl
        // The keys of a slider without Material's steps: the focused thumb
        // moves by `step`, and under `range` it stops at the other thumb.
        val keys = Modifier.onPreviewKeyEvent { event ->
            if (scale.steps != 0 || disabled || event.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
            val steps = scale.keySteps(event.key, rtl) ?: return@onPreviewKeyEvent false
            val thumb = if (range && endFocused) 1 else 0
            val moved = scale.snap(shown[thumb] + steps * scale.step)
            val next = when {
                !range -> listOf(moved)
                thumb == 0 -> listOf(moved.coerceAtMost(shown[1]), shown[1])
                else -> listOf(shown[0], moved.coerceAtLeast(shown[0]))
            }
            set(next)
            commit()
            true
        }
        val dragging = (startHeld || (range && endHeld)) && !disabled
        val fill = if (disabled) PMBarFill.Disabled else PMBarFill.Accent
        val attributes = buildMap {
            put("orientation", "horizontal")
            put("range", range.toString())
            put("valuenow", shown.joinToString(",") { plain(it) })
            if (disabled) put("disabled", "true")
            if (invalid) put("invalid", "true")
            if (dragging) put("state", "dragging")
        }

        Column(
            modifier = Modifier.pmMember("Slider", attributes).fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(theme.defaultDensity.spacing.s2),
            horizontalAlignment = Alignment.End,
        ) {
            if (props.showValue == true) {
                Text(
                    text = shown.joinToString(EN_DASH) { format(it) },
                    style = theme.text.sm.textStyle.tabular(theme),
                    color = theme.colors.textSecondary.color,
                    modifier = Modifier.semantics { hideFromAccessibility() },
                )
            }
            PMMaterialTheme {
                if (range) {
                    RangeSlider(
                        value = shown[0].toFloat()..shown[1].toFloat(),
                        onValueChange = { next ->
                            // A thumb a finger holds goes to the step nearest
                            // it. A thumb that moves with no finger on it is
                            // TalkBack's adjustment, which moves at least one
                            // step toward the value asked for. A thumb whose
                            // value is unchanged stays.
                            val held = startHeld || endHeld
                            val moved = listOf(next.start, next.endInclusive).mapIndexed { thumb, value ->
                                when {
                                    value == shown[thumb].toFloat() -> shown[thumb]
                                    held -> scale.snap(value.toDouble())
                                    else -> scale.toward(shown[thumb], value.toDouble())
                                }
                            }
                            set(listOf(moved[0].coerceAtMost(moved[1]), moved[1].coerceAtLeast(moved[0])))
                        },
                        modifier = Modifier.fillMaxWidth().then(keys),
                        enabled = !disabled,
                        valueRange = scale.floats,
                        onValueChangeFinished = commit,
                        startInteractionSource = start,
                        endInteractionSource = end,
                        startThumb = { Thumb(start, startHeld, disabled, invalid, Modifier.thumbName(name, error)) },
                        endThumb = { Thumb(end, endHeld, disabled, invalid, Modifier.thumbName(name, error)) },
                        track = { Track(scale.fraction(shown[0]), scale.fraction(shown[1]), fill) },
                        steps = scale.steps,
                    )
                } else {
                    Slider(
                        value = shown[0].toFloat(),
                        onValueChange = { next -> set(listOf(scale.snap(next.toDouble()))) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .then(keys)
                            // Outside Material's own semantics on the same node, so
                            // the value it speaks is `formatValue`'s text, and the
                            // adjustment is this one, which never rounds back.
                            .semantics {
                                name?.let { contentDescription = it }
                                stateDescription = format(shown[0])
                                error?.let { error(it) }
                                if (!disabled) {
                                    setProgress { target ->
                                        val next = scale.toward(shown[0], target.toDouble())
                                        if (next == shown[0]) {
                                            false
                                        } else {
                                            set(listOf(next))
                                            commit()
                                            true
                                        }
                                    }
                                }
                            },
                        enabled = !disabled,
                        onValueChangeFinished = commit,
                        interactionSource = start,
                        steps = scale.steps,
                        thumb = { Thumb(start, startHeld, disabled, invalid) },
                        track = { Track(null, scale.fraction(shown[0]), fill) },
                        valueRange = scale.floats,
                    )
                }
            }
        }
    }

    /**
     * A range slider thumb's name and error. Material merges the thumb's
     * content into its node, after its own "Range start" or "Range end".
     */
    private fun Modifier.thumbName(name: String?, error: String?): Modifier = semantics {
        name?.let { contentDescription = it }
        error?.let { error(it) }
    }

    /** Whether a thumb is held: pressed, or dragged. */
    @Composable
    private fun MutableInteractionSource.held(): Boolean {
        val pressed by collectIsPressedAsState()
        val dragged by collectIsDraggedAsState()
        return pressed || dragged
    }

    /**
     * The thumb: the disc, its border by state, the lit shadow, and while
     * `held` the hover glow and the grab scale.
     */
    @Composable
    private fun Thumb(
        interaction: MutableInteractionSource,
        held: Boolean,
        disabled: Boolean,
        invalid: Boolean,
        modifier: Modifier = Modifier,
    ) {
        val theme = PM.theme
        val colors = theme.colors
        val motion = theme.defaultMotion
        val hovered by interaction.collectIsHoveredAsState()
        val focused by interaction.collectIsFocusedAsState()
        val dragging = held && !disabled
        // The `none` temperament has no press scale, and keeps the thumb's size.
        val grab by animateFloatAsState(
            if (dragging && motion.pressScale != 1f) GRAB else 1f,
            motion.spring.snappy.spec(),
            label = "grab",
        )
        val border by animateColorAsState(
            when {
                disabled -> colors.borderSubtle
                invalid -> colors.dangerBorder
                dragging || hovered -> colors.accentBg
                else -> colors.borderStrong
            }.color,
            motion.easing.standard.tween<Color>(motion.duration.control),
            label = "border",
        )
        val none = PMShadow(emptyList())
        val pill = theme.rounded(theme.radius.pill)

        Box(
            modifier
                .hoverable(interaction, enabled = !disabled)
                .graphicsLayer {
                    scaleX = grab
                    scaleY = grab
                }
                .pmFocusRing(focused && !disabled, theme.radius.pill.dp)
                .size(theme.defaultDensity.spacing.s5)
                .pmShadow(
                    when {
                        disabled -> none
                        dragging -> theme.glow.hover.resolve(PM.dark)
                        else -> theme.shadows.seat
                    },
                    pill,
                )
                .background(colors.bgSurface.color, pill)
                .pmInsetShadow(if (disabled || dragging) none else theme.shadows.insetTop, pill)
                .border(PMGeometry.hairline, border, pill),
        )
    }

    /**
     * The track, the bar's recipe, with the fill from fraction `from` of the
     * thumbs' travel to fraction `to`, or from the track's start when `from`
     * is null. Material lays the track out between the thumb's centre at one
     * end and at the other; the recipe's track runs the row's full width, so
     * it reaches half a thumb past each end.
     */
    @Composable
    private fun Track(from: Float?, to: Float, fill: PMBarFill) {
        val thumb = PM.theme.defaultDensity.spacing.s5
        val shape = PMBar.shape
        Box(
            Modifier
                .fillMaxWidth()
                .height(PMBar.height)
                .layout { measurable, constraints ->
                    val extra = thumb.roundToPx()
                    val placeable = measurable.measure(Constraints.fixed(constraints.maxWidth + extra, constraints.maxHeight))
                    layout(constraints.maxWidth, constraints.maxHeight) { placeable.placeRelative(-extra / 2, 0) }
                }
                .background(PMBar.track, shape),
        ) {
            Box(
                Modifier
                    .fillMaxSize()
                    .layout { measurable, constraints ->
                        val half = thumb.roundToPx() / 2
                        val span = max(0, constraints.maxWidth - half * 2)
                        val left = if (from == null) 0 else half + (span * from).roundToInt()
                        val right = half + (span * to).roundToInt()
                        val placeable = measurable.measure(Constraints.fixed(max(0, right - left), constraints.maxHeight))
                        layout(constraints.maxWidth, constraints.maxHeight) { placeable.placeRelative(left, 0) }
                    }
                    .background(PMBar.fill(fill), shape),
            )
        }
    }

    /**
     * A value as the readout and the spoken value write it by default: a whole
     * number without a fraction, any other to six places at most.
     */
    private fun plain(value: Double): String {
        val rounded = round(value * PLACES) / PLACES
        return if (rounded % 1.0 == 0.0) rounded.toLong().toString() else rounded.toString()
    }

    /** What the thumbs hold, read by the commit. */
    private class Latest(var values: List<Double>)

    /** The slider's scale: `min`, `max` and `step`, and what follows from them. */
    private class Scale(props: PMSliderProps) {
        val low = props.min ?: 0.0
        val high = max(low, props.max ?: FULL)
        val step = props.step?.takeIf { it > 0 } ?: 1.0
        val floats = low.toFloat()..high.toFloat()

        /**
         * Material's steps, the values between the ends: one fewer than the
         * steps `step` divides the range into, or none (a continuous slider
         * this file snaps) when `step` does not divide it evenly or divides it
         * into more than Material's ticks should hold.
         */
        val steps: Int = run {
            val count = (high - low) / step
            val whole = round(count)
            if (whole >= 1 && whole <= MOST_STEPS && abs(count - whole) < TOLERANCE) whole.toInt() - 1 else 0
        }

        /** `value` on the nearest step from `min`, within the ends. */
        fun snap(value: Double): Double = (low + round((value - low) / step) * step).coerceIn(low, high)

        /**
         * The value an adjustment toward `target` reaches from `current`: the
         * step nearest the target, or one step toward it when that is
         * `current` again.
         */
        fun toward(current: Double, target: Double): Double {
            val nearest = snap(target)
            if (nearest != current || target == current) return nearest
            return snap(current + if (target > current) step else -step)
        }

        /**
         * The steps a key moves a thumb: one for an arrow, ten for Page Up and
         * Page Down, with Left and Right swapped in a right-to-left layout,
         * where the track's start is on the right. Null for any other key.
         */
        fun keySteps(key: Key, rtl: Boolean): Int? {
            val forward = if (rtl) -1 else 1
            return when (key) {
                Key.DirectionRight -> forward
                Key.DirectionLeft -> -forward
                Key.DirectionUp -> 1
                Key.DirectionDown -> -1
                Key.PageUp -> PAGE
                Key.PageDown -> -PAGE
                else -> null
            }
        }

        /** How far along the range `value` is, from 0 to 1. */
        fun fraction(value: Double): Float = if (high > low) ((value - low) / (high - low)).toFloat() else 0f

        /**
         * The thumbs' values for `value`: one, or under `range` a low and a
         * high one, each within the ends. A single value under `range` is the
         * high end over `min`; a pair without `range` is its low end. With no
         * value, a single thumb is at `min` and a range spans the whole track.
         */
        fun thumbs(value: PMSliderValue?, range: Boolean): List<Double> {
            val pair = when (value) {
                is PMSliderValue.Single -> listOf(low, value.value)
                is PMSliderValue.Range -> listOf(value.value.first, value.value.second)
                null -> listOf(low, if (range) high else low)
            }.map { it.coerceIn(low, high) }.sorted()
            return when {
                range -> pair
                value is PMSliderValue.Range -> listOf(pair[0])
                else -> listOf(pair[1])
            }
        }
    }

    /** The steps Page Up and Page Down move a thumb, as on the web. */
    private const val PAGE = 10

    /** The grab scale (`slider.thumb`): the recipe's 1.12. */
    private const val GRAB = 1.12f

    /** The default `max`. */
    private const val FULL = 100.0

    /**
     * The most steps this file gives Material, which keeps a tick for each;
     * past it Material's slider is continuous and the value is snapped here.
     */
    private const val MOST_STEPS = 1000.0

    /** How close to whole a step count must be to count as whole. */
    private const val TOLERANCE = 1e-6

    /** The places the plain form rounds to. */
    private const val PLACES = 1e6

    /** What joins a range's two values in the readout. */
    private const val EN_DASH = "–"
}

/** Slider's states, from the spec's States table. */
object SliderStates : PMStates {
    override val member = "Slider"

    private const val volume = "Volume"

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("rest", expect = mapOf("range" to "false", "valuenow" to "40")) {
                PMSlider(ariaLabel = volume, defaultValue = PMSliderValue.Single(40.0))
            },
            PMStateEntry("zero", expect = mapOf("valuenow" to "0")) {
                PMSlider(ariaLabel = volume, defaultValue = PMSliderValue.Single(0.0))
            },
            PMStateEntry("full", expect = mapOf("valuenow" to "100")) {
                PMSlider(ariaLabel = volume, defaultValue = PMSliderValue.Single(100.0))
            },
            PMStateEntry("stepped", expect = mapOf("valuenow" to "30")) {
                PMSlider(ariaLabel = volume, defaultValue = PMSliderValue.Single(30.0), step = 10.0)
            },
            PMStateEntry("with readout", expect = mapOf("valuenow" to "40")) {
                PMSlider(ariaLabel = volume, defaultValue = PMSliderValue.Single(40.0), showValue = true)
            },
            PMStateEntry("formatted", expect = mapOf("valuenow" to "40")) {
                PMSlider(
                    ariaLabel = volume,
                    defaultValue = PMSliderValue.Single(40.0),
                    formatValue = { "${it.toInt()}%" },
                    showValue = true,
                )
            },
            PMStateEntry("range — two thumbs, the fill between", expect = mapOf("range" to "true", "valuenow" to "20,60")) {
                PMSlider(
                    ariaLabel = "Price",
                    defaultValue = PMSliderValue.Range(20.0 to 60.0),
                    formatValue = { "\$${it.toInt()}" },
                    range = true,
                    showValue = true,
                )
            },
            PMStateEntry("invalid", expect = mapOf("invalid" to "true")) {
                PMSlider(ariaLabel = volume, defaultValue = PMSliderValue.Single(40.0), invalid = true)
            },
            PMStateEntry("disabled", expect = mapOf("disabled" to "true")) {
                PMSlider(ariaLabel = volume, defaultValue = PMSliderValue.Single(40.0), disabled = true)
            },
            PMStateEntry("a custom scale — 0.5 steps from 1 to 5", expect = mapOf("valuenow" to "3.5")) {
                PMSlider(
                    ariaLabel = "Rating",
                    defaultValue = PMSliderValue.Single(3.5),
                    max = 5.0,
                    min = 1.0,
                    showValue = true,
                    step = 0.5,
                )
            },
        )
}
