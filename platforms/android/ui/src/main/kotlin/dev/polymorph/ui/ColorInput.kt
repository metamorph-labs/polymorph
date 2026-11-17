// ColorInput (`design/components/color-input.md`), adapted on Android: a
// colour field, a swatch and a hex entry, with the picker in a bottom sheet on
// a phone and anchored on a tablet, the platform map's form, because Android
// has no system colour picker. The picker is the Popover member composed, as
// the web composes it: on a phone's window the bottom sheet, on a wider one
// anchored to the swatch at its start, named by `pickerLabel`.
//
// The swatch is a button at the control height of `size`, named by
// `pickerLabel`: `radius.sm`, a `border.strong` hairline (`accent.bg` under the
// pointer, `danger.border` while invalid) and the colour as its fill, over a
// checker of `bg.subtle` and `bg.surface` with `alpha`; disabled, it is
// `bg.subtle` in a `border.subtle` hairline and does not open. The hex entry
// is an Input with `#` as its prefix and the digits as its value: three, six or
// eight digits, with or without a typed `#`, committed when the field loses
// focus and on the keyboard's action key; text that names no colour reverts to
// the current value instead of showing an error.
//
// The picker is the colour model drawn as data (`PMHexColor`, the
// foundation's): the saturation and brightness plane of the current hue,
// square, `radius.md` in a `border.subtle` hairline; the hue rail; and with
// `alpha` the alpha rail over the checker, each `space-4` tall and pill-shaped,
// `space-3` apart, in a column three `space-10` steps wide. Each thumb is a
// `space-5` pill in the current colour inside a twice-hairline `bg.surface`
// ring with the control shadow, the hover glow while it is held; it follows
// the finger at once, and `onChange` reports the hex continuously while it
// moves, as the web's drag does. The plane's thumb is centred on its point,
// a rail's on its point along the rail and on the rail's middle across it, at
// its full size, standing out of the rail above and below. In a right-to-left
// layout the plane and the rails mirror, as a horizontal Slider does and as
// `color-input.md` decides: saturation and each rail run from the start edge,
// the right, and the finger and the thumbs follow.
//
// The value is lowercase hex, `#rrggbb`, or `#rrggbbaa` with `alpha`, and a
// mid grey by default (`PMSpecDefault.colorValue`). `value` with `onChange` is
// the controlled pair; `defaultOpen` opens the picker when the field first
// draws. TalkBack reaches the colour through the hex entry, which every colour
// can be typed into: the plane and the rails are drag surfaces with no channel
// names a spec gives, so they are hidden from it. `name`, `id` and the
// `aria-*by` ids have no Compose counterpart.

package dev.polymorph.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.absoluteOffset
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.AbsoluteAlignment
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import dev.polymorph.tokens.PMShadow

object PMColorInput : PMColorInputRendering {
    @Composable
    override fun Render(props: PMColorInputProps) {
        val theme = PM.theme
        val field = LocalPMField.current
        val alpha = props.alpha ?: false
        val size = props.size ?: PMControlSize.Md
        val disabled = (props.disabled ?: false) || !LocalPMEnabled.current
        val invalid = (props.invalid ?: false) || (field?.invalid ?: false)
        val fallback = PMSpecDefault.colorValue
        var own by remember {
            mutableStateOf(PMHexColor.normalized(props.defaultValue ?: fallback, alpha) ?: PMHexColor.normalized(fallback, alpha) ?: fallback)
        }
        // The colour: the controlled `value` when given, otherwise the field's own.
        val current = props.value?.let { PMHexColor.normalized(it, alpha) } ?: own
        var typed by remember { mutableStateOf<String?>(null) }
        val commit: (String) -> Unit = { hex ->
            if (hex != current) {
                own = hex
                props.onChange?.invoke(hex)
            }
        }
        val commitTyped = {
            typed?.let { text -> PMHexColor.normalized(text, alpha)?.let(commit) }
            typed = null
        }
        val report = LocalPMFieldReport.current
        SideEffect { report?.invoke(PMFieldControl(disabled = disabled)) }
        val attributes = buildMap {
            put("size", size.value)
            put("hex", current.removePrefix("#"))
            if (invalid) put("invalid", "true")
            if (disabled) put("disabled", "true")
            if (alpha) put("alpha", "true")
        }

        Row(
            modifier = Modifier.pmMember("ColorInput", attributes),
            horizontalArrangement = Arrangement.spacedBy(theme.defaultDensity.spacing.s2),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PMPopover(
                align = PMPopoverAlign.Start,
                defaultOpen = props.defaultOpen == true && !disabled,
                label = props.pickerLabel,
                trigger = { Swatch(current, alpha, size, disabled, invalid, props.pickerLabel) },
            ) { Picker(current, alpha, commit) }
            Box(Modifier.weight(1f)) {
                // The keyboard's action key commits the typed hex, as Enter does on the web.
                CompositionLocalProvider(LocalPMSubmitAction provides commitTyped) {
                    PMInput(
                        ariaLabel = props.ariaLabel ?: field?.label ?: props.pickerLabel,
                        disabled = disabled,
                        invalid = invalid,
                        onBlur = commitTyped,
                        onChange = { next -> typed = next.replace("#", "").trim().take(if (alpha) EIGHT else SIX) },
                        prefix = "#",
                        size = size,
                        value = typed ?: current.removePrefix("#"),
                    )
                }
            }
        }
    }

    /** The digits a hex holds without and with its alpha. */
    private const val SIX = 6
    private const val EIGHT = 8

    /** The swatch: a button at the control height, the colour over the checker, which opens the picker. */
    @Composable
    private fun Swatch(hex: String, alpha: Boolean, size: PMControlSize, disabled: Boolean, invalid: Boolean, label: String) {
        val theme = PM.theme
        val colors = theme.colors
        val side = theme.defaultDensity.controlHeight[size]
        val shape = theme.rounded(theme.radius.sm)
        val open = LocalPMTriggerAction.current
        val interaction = remember { MutableInteractionSource() }
        val hovered by interaction.collectIsHoveredAsState()
        val focused by interaction.collectIsFocusedAsState()
        val edge = when {
            disabled -> colors.borderSubtle
            invalid -> colors.dangerBorder
            hovered -> colors.accentBg
            else -> colors.borderStrong
        }.color
        Box(
            Modifier
                .clickable(interactionSource = interaction, indication = null, enabled = !disabled) { open?.invoke() }
                .clearAndSetSemantics {
                    contentDescription = label
                    role = Role.Button
                }
                .pmHitTarget()
                .pmFocusRing(focused && !disabled, theme.radius.sm.dp)
                .size(side)
                .clip(shape)
                .then(if (disabled) Modifier.background(colors.bgSubtle.color) else Modifier.checker(alpha).background(PMHexColor.color(hex) ?: colors.bgSubtle.color))
                .border(PMGeometry.hairline, edge, shape),
        )
    }

    /** The picker: the plane of the current hue, the hue rail and, with alpha, the alpha rail. */
    @Composable
    private fun Picker(hex: String, alpha: Boolean, commit: (String) -> Unit) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val hsva = PMHexColor.hsva(hex) ?: floatArrayOf(0f, 0f, 0f, 1f)
        // A grey has no hue of its own, so the hue last chosen is kept for it.
        var kept by remember { mutableStateOf(hsva[0]) }
        val hue = if (hsva[1] == 0f) kept else hsva[0]
        val set = { h: Float, s: Float, v: Float, a: Float ->
            kept = h
            commit(PMHexColor.fromHsva(h, s, v, a, alpha))
        }
        Column(Modifier.width(space.s10 * PMRecipe.colorPickerWidth), verticalArrangement = Arrangement.spacedBy(space.s3)) {
            Plane(hue, hsva[1], hsva[2], hex) { s, v -> set(hue, s, v, hsva[3]) }
            Rail(hue / FULL_TURN, hex, Modifier.background(PMHexColor.hues)) { set(it * FULL_TURN, hsva[1], hsva[2], hsva[3]) }
            if (alpha) {
                Rail(hsva[3], hex, Modifier.checker(true).background(PMHexColor.fade(hex))) { set(hue, hsva[1], hsva[2], it) }
            }
        }
    }


    /** Degrees in a turn: the hue rail's length. */
    private const val FULL_TURN = 360f

    /**
     * A drag surface mirrored in a right-to-left layout: its drawing, its
     * thumb's place and the finger's position are all flipped across, so
     * the colour model runs from the start edge with no other arithmetic.
     */
    @Composable
    private fun Modifier.mirrored(): Modifier {
        val rtl = LocalLayoutDirection.current == LayoutDirection.Rtl
        return if (rtl) graphicsLayer { scaleX = -1f } else this
    }

    /** The saturation and brightness plane: across is saturation, down is brightness falling. */
    @Composable
    private fun Plane(hue: Float, saturation: Float, value: Float, hex: String, set: (Float, Float) -> Unit) {
        val theme = PM.theme
        val shape = theme.rounded(theme.radius.md)
        var held by remember { mutableStateOf(false) }
        // The gesture outlives a composition; it calls this one's `set`,
        // which holds the hue and the alpha the colour has now.
        val onSet by rememberUpdatedState(set)
        BoxWithConstraints(
            Modifier
                .fillMaxWidth()
                .aspectRatio(1f)
                .clearAndSetSemantics {}
                .mirrored()
                .clip(shape)
                .drawBehind { for (layer in PMHexColor.plane(hue)) drawRect(layer) }
                .border(PMGeometry.hairline, theme.colors.borderSubtle.color, shape)
                .drag({ held = it }) { position, size ->
                    onSet((position.x / size.width).coerceIn(0f, 1f), 1f - (position.y / size.height).coerceIn(0f, 1f))
                },
            contentAlignment = AbsoluteAlignment.TopLeft,
        ) {
            Thumb(hex, held, Modifier.absoluteOffset(x = maxWidth * saturation, y = maxHeight * (1f - value)), centred = true)
        }
    }

    /** A rail: `space-4` tall, pill-shaped, its thumb at `fraction` along it. */
    @Composable
    private fun Rail(fraction: Float, hex: String, fill: Modifier, set: (Float) -> Unit) {
        val theme = PM.theme
        val pill = theme.rounded(theme.radius.pill)
        var held by remember { mutableStateOf(false) }
        val onSet by rememberUpdatedState(set)
        BoxWithConstraints(
            Modifier
                .fillMaxWidth()
                .height(theme.defaultDensity.spacing.s4)
                .clearAndSetSemantics {}
                .mirrored()
                .drag({ held = it }) { position, size -> onSet((position.x / size.width).coerceIn(0f, 1f)) },
            contentAlignment = AbsoluteAlignment.CenterLeft,
        ) {
            Box(Modifier.matchParentSize().clip(pill).then(fill).border(PMGeometry.hairline, theme.colors.borderSubtle.color, pill))
            Thumb(hex, held, Modifier.absoluteOffset(x = maxWidth * fraction), centred = false)
        }
    }

    /**
     * A thumb on its point: a `space-5` pill in the current colour inside a
     * twice-hairline `bg.surface` ring, with the control shadow, or the hover
     * glow while held. Its left edge is moved back by half its width; with
     * `centred` its top is moved up by half its height too, for a plane, where
     * the point is its top-left corner. A rail centres it across already. Its
     * size is required, so a rail thinner than the thumb does not squash it.
     */
    @Composable
    private fun Thumb(hex: String, held: Boolean, at: Modifier, centred: Boolean) {
        val theme = PM.theme
        val side = theme.defaultDensity.spacing.s5
        val pill: Shape = theme.rounded(theme.radius.pill)
        val shadow: PMShadow = if (held) theme.glow.hover.resolve(PM.dark) else theme.shadows.control
        Box(
            at
                .absoluteOffset(x = -side / 2, y = if (centred) -side / 2 else 0.dp)
                .requiredSize(side)
                .pmShadow(shadow, pill)
                .background(PMHexColor.color(hex) ?: theme.colors.bgSubtle.color, pill)
                .border(PMGeometry.hairline * 2, theme.colors.bgSurface.color, pill),
        )
    }

    /** A press and a drag on the surface: each position, as it moves, and whether it is held. */
    private fun Modifier.drag(held: (Boolean) -> Unit, set: (Offset, Size) -> Unit): Modifier = pointerInput(Unit) {
        awaitEachGesture {
            val down = awaitFirstDown()
            val area = Size(size.width.toFloat(), size.height.toFloat())
            held(true)
            set(down.position, area)
            down.consume()
            while (true) {
                val event = awaitPointerEvent()
                val change = event.changes.firstOrNull { it.id == down.id } ?: break
                if (!change.pressed) break
                if (change.positionChange() != Offset.Zero) {
                    set(change.position, area)
                    change.consume()
                }
            }
            held(false)
        }
    }

    /** The checker an alpha colour is drawn over: `space-2` squares of `bg.subtle` and `bg.surface`. */
    @Composable
    private fun Modifier.checker(on: Boolean): Modifier {
        if (!on) return this
        val theme = PM.theme
        val light = theme.colors.bgSurface.color
        val dark = theme.colors.bgSubtle.color
        val cell: Dp = theme.defaultDensity.spacing.s2
        return drawBehind {
            drawRect(light)
            val step = cell.toPx()
            var y = 0f
            var row = 0
            while (y < size.height) {
                var x = if (row % 2 == 0) 0f else step
                while (x < size.width) {
                    drawRect(dark, Offset(x, y), Size(step, step))
                    x += step * 2
                }
                y += step
                row += 1
            }
        }
    }
}

/**
 * ColorInput's states, from the spec's States table. The sample colours are
 * written without their `#`, which the field accepts, because a member's
 * source holds no colour literal. The open picker is the bottom sheet on a
 * phone, opened by `defaultOpen` in its own window over the canvas.
 */
object ColorInputStates : PMStates {
    override val member = "ColorInput"

    private const val label = "Choose accent colour"

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("rest", expect = mapOf("hex" to "8864f0", "contains" to "Input")) {
                PMColorInput(defaultValue = "8864f0", pickerLabel = label)
            },
            PMStateEntry("open — the picker in a bottom sheet", expect = mapOf("hex" to "8864f0")) {
                PMFixturePhone { PMColorInput(defaultOpen = true, defaultValue = "8864f0", pickerLabel = label) }
            },
            PMStateEntry("alpha — eight digits, the alpha rail over the checker", expect = mapOf("alpha" to "true", "hex" to "8864f0cc")) {
                PMFixturePhone { PMColorInput(alpha = true, defaultOpen = true, defaultValue = "8864f0cc", pickerLabel = label) }
            },
            PMStateEntry("the default — no value given", expect = mapOf("hex" to "888888")) {
                PMColorInput(pickerLabel = label)
            },
        ) + PMControlSize.entries.map { size ->
            PMStateEntry("size ${size.value}", expect = mapOf("size" to size.value)) {
                PMColorInput(defaultValue = "8864f0", pickerLabel = label, size = size)
            }
        } + listOf(
            PMStateEntry("invalid", expect = mapOf("invalid" to "true")) {
                PMColorInput(defaultValue = "8864f0", invalid = true, pickerLabel = label)
            },
            PMStateEntry("disabled", expect = mapOf("disabled" to "true")) {
                PMColorInput(defaultValue = "8864f0", disabled = true, pickerLabel = label)
            },
            PMStateEntry("controlled", expect = mapOf("hex" to "0089ea")) {
                PMColorInput(onChange = {}, pickerLabel = label, value = "0089ea")
            },
        )
}
