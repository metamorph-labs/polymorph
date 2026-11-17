// The parts the text-entry members share: what a field reads from its props
// and its FormField (Textarea, PasswordInput, NumberInput, OTPInput, TagInput),
// its name and its error, its focus callbacks, its placeholder, and the
// embedded button, the clear button's recipe, which Input's clear button,
// PasswordInput's toggle, NumberInput's steppers, the date fields' buttons and
// Combobox's buttons draw; and a value's chip and the flow its chips wrap in,
// which TagInput and MultiSelect draw; FormField's error row, which
// InlineEdit draws too (`PMFieldErrorRow`); and whether a field selects its
// text on focus (`LocalPMFieldSelectsAll`).

package dev.polymorph.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.Placeable
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.toggleableState
import androidx.compose.ui.state.ToggleableState
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * What a field-family member reads from its props, the composition and its
 * FormField: whether it is disabled (its own `disabled`, or a region that
 * disables its controls), invalid (its own `invalid`, or its field's),
 * read-only, the name it is spoken by (its `ariaLabel`, else its field's
 * label, else its placeholder), and the error it reports (its field's
 * message, or null).
 */
@Immutable
class PMFieldFacts(
    val disabled: Boolean,
    val invalid: Boolean,
    val readOnly: Boolean,
    val name: String?,
    val error: String?,
) {
    /** The value's colour: disabled, read-only (secondary) or primary, as Input's recipe. */
    val textColor: Color
        @Composable get() {
            val colors = PM.theme.colors
            return when {
                disabled -> colors.textDisabled
                readOnly -> colors.textSecondary
                else -> colors.textPrimary
            }.color
        }
}

/**
 * The field's facts, and its report to the FormField that governs it: that it
 * is a control with its label above it, disabled or not, as Input reports.
 */
@Composable
fun pmFieldFacts(
    ariaLabel: String?,
    placeholder: String?,
    disabled: Boolean?,
    invalid: Boolean?,
    readOnly: Boolean? = null,
): PMFieldFacts {
    val field = LocalPMField.current
    val off = (disabled ?: false) || !LocalPMEnabled.current
    val report = LocalPMFieldReport.current
    SideEffect { report?.invoke(PMFieldControl(disabled = off)) }
    return PMFieldFacts(
        disabled = off,
        invalid = (invalid ?: false) || (field?.invalid ?: false),
        readOnly = readOnly ?: false,
        name = ariaLabel ?: field?.label ?: placeholder,
        error = field?.error,
    )
}

/**
 * The field's accessibility error while it is invalid: the FormField's
 * message, else "Invalid", which TalkBack reads with the field, as the web's
 * `aria-invalid` is announced. It goes on the text field itself; the field's
 * name does not (`pmFieldName`).
 */
@Composable
fun Modifier.pmFieldError(facts: PMFieldFacts): Modifier {
    val invalid = PMSpecDefault.strings.invalid
    return semantics { if (facts.invalid) error(facts.error ?: invalid) }
}

/**
 * A field's name (`ariaLabel`, else its FormField's label, else its
 * placeholder), on the part of the field that holds its text or its values,
 * inside the node a person types into or presses: where Material's text field
 * draws its label. TalkBack reads it with the field, as it reads that label.
 * The name is never the editable node's own content description, because
 * TalkBack reads an editable node's description in place of what was typed.
 * Compose publishes no hint and no labelling relation for a text field.
 */
fun Modifier.pmFieldName(name: String?): Modifier =
    if (name == null) this else semantics { contentDescription = name }

/**
 * `onFocus` when the node gains focus and `onBlur` when it loses it, once
 * each, as the web's focus events fire: Compose reports a focus state on
 * every change around the node, so a repeat of the same state is dropped.
 */
@Composable
fun Modifier.pmFocusEvents(onFocus: (() -> Unit)?, onBlur: (() -> Unit)?): Modifier {
    var was by remember { mutableStateOf(false) }
    return onFocusChanged { state ->
        if (state.isFocused != was) {
            was = state.isFocused
            if (was) onFocus?.invoke() else onBlur?.invoke()
        }
    }
}

/**
 * A field's placeholder: muted, cut to one line where the field is one line,
 * and not spoken, because the field's name already carries it when nothing
 * else names the field. Its semantics are cleared, so nothing of it merges
 * into the text field around it.
 */
@Composable
fun PMFieldPlaceholder(text: String, style: TextStyle, singleLine: Boolean = true, modifier: Modifier = Modifier) {
    Text(
        text = text,
        style = style,
        color = PM.theme.colors.textMuted.color,
        maxLines = if (singleLine) 1 else Int.MAX_VALUE,
        overflow = TextOverflow.Ellipsis,
        modifier = modifier.clearAndSetSemantics {},
    )
}

/**
 * The embedded-adornment convention (`input.md`, the clear button's recipe):
 * a control inside a field's frame, `width` by `height`, its glyph muted at
 * rest, primary on a `bg.subtle` wash of its own `radius.sm` under the pointer
 * and while pressed, with press feedback and the focus ring. Disabled (a
 * stepper at its rail, or a disabled field's toggle), the glyph is
 * `text.disabled` and there is no wash and no press. It is never in danger
 * colours, because it is an action, not a status.
 *
 * It is a button named `label`; `pressed` makes it a toggle that reports its
 * state, as `aria-pressed` does. `keyboardFocusable` false keeps it out of the
 * keyboard's focus order while TalkBack still reaches it, as NumberInput's
 * steppers leave the Tab order. It draws at the field's height and reserves
 * the hit target's width in the field's row (`pmHitTarget`), the drawn button
 * at `alignment` in it; the field's own hit area gives it the hit target's
 * height. Its touch area is then its own: neither a neighbouring button nor
 * the window's edge cuts into it, as either would cut Compose's extension of a
 * small press. `anchor`, when given, is a Material anchor that takes the press
 * itself (Combobox's `expand`, which opens its list): the button then draws
 * the pointer's wash, and `onClick` is TalkBack's action alone, so a press is
 * not taken twice. `content` draws the glyph in the tint it is given.
 */
@Composable
fun PMEmbeddedButton(
    label: String,
    width: Dp,
    height: Dp,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    pressed: Boolean? = null,
    keyboardFocusable: Boolean = true,
    anchor: Modifier? = null,
    alignment: Alignment = Alignment.Center,
    content: @Composable (tint: Color) -> Unit,
) {
    val theme = PM.theme
    val colors = theme.colors
    val motion = theme.defaultMotion
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    val pressing by interaction.collectIsPressedAsState()
    val focused by interaction.collectIsFocusedAsState()
    val active = enabled && (hovered || pressing)
    val spec = motion.easing.standard.tween<Color>(motion.duration.control)
    val wash by animateColorAsState(if (active) colors.bgSubtle.color else Color.Transparent, spec, label = "wash")
    val tint by animateColorAsState(
        when {
            !enabled -> colors.textDisabled
            active -> colors.textPrimary
            else -> colors.textMuted
        }.color,
        spec,
        label = "tint",
    )
    val press = if (anchor == null) {
        Modifier
            // Before the clearing semantics: the click gives the button its
            // action and its disabled state.
            .clickable(interactionSource = interaction, indication = null, enabled = enabled, onClick = onClick)
            .clearAndSetSemantics {
                contentDescription = label
                role = Role.Button
                pressed?.let { toggleableState = ToggleableState(it) }
            }
    } else {
        val action = onClick
        Modifier
            // Before the anchor: TalkBack's action is this one, and the
            // anchor's own semantics are left out.
            .clearAndSetSemantics {
                contentDescription = label
                role = Role.Button
                if (!enabled) disabled()
                onClick {
                    action()
                    true
                }
            }
            .then(anchor)
            .hoverable(interaction, enabled = enabled)
    }
    Box(
        modifier = modifier
            .then(if (keyboardFocusable) Modifier else Modifier.focusProperties { canFocus = false })
            .then(press)
            .pmHitTarget(vertical = false, alignment = alignment)
            .size(width, height)
            .pmPressFeedback(active && pressing)
            .pmFocusRing(focused && enabled && keyboardFocusable, theme.radius.sm.dp)
            .clip(theme.rounded(theme.radius.sm))
            .background(wash),
        contentAlignment = Alignment.Center,
    ) {
        content(tint)
    }
}

/**
 * The embedded button in its usual form, a square as tall as the control at
 * `size`: Input's clear button, a date field's clear and calendar buttons,
 * Combobox's `expand`. It draws the glyph of `icon` at `size`, turned half a
 * turn while `turned`, as an open list's chevron is, or `glyph` in its place.
 */
@Composable
fun PMEmbeddedButton(
    icon: PMIconRole,
    label: String,
    size: PMControlSize,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    turned: Boolean = false,
    anchor: Modifier? = null,
    glyph: (@Composable (tint: Color) -> Unit)? = null,
) {
    val side = PMControlMetrics(size, PM.theme).height
    PMEmbeddedButton(label, side, side, onClick, modifier, enabled, anchor = anchor) { tint ->
        if (glyph != null) glyph(tint) else PMTurningChevron(icon, turned, PMTurn.HALF, size, tint)
    }
}

/**
 * A value's chip, TagInput's and MultiSelect's: a `bg.subtle` pill in a
 * `border.subtle` hairline, the small control height less `space.2` tall, its
 * label in `text.sm` cut with an ellipsis past two `space.10` steps, and,
 * unless the field is disabled, its remove button, the `close` glyph, muted,
 * in `danger.text` under the pointer and while pressed, named by
 * `removeLabel`. Its hairline is `accent.bg` while it `flashing`, and
 * `border.focus.solid` while its remove button has keyboard focus. With a
 * hardware keyboard, Backspace or Delete on the remove button removes the
 * chip; `onRemove` learns whether focus should move on (`handOff`), which it
 * should after a key or a keyboard press, and not after a touch.
 *
 * The remove button's touch area is the hit target centred on it, which
 * reaches past the pill's end: the chip reserves that reach after the pill,
 * so the next chip or the entry starts beyond it. The field gives the touch
 * area its height: the field's own hit area while the chips are one line, and
 * a line the hit target tall once they wrap (`PMChipFlow`).
 */
@Composable
fun PMValueChip(
    label: String,
    removeLabel: String,
    disabled: Boolean,
    onRemove: (handOff: Boolean) -> Unit,
    flashing: Boolean = false,
    focus: FocusRequester = remember { FocusRequester() },
) {
    val theme = PM.theme
    val colors = theme.colors
    val motion = theme.defaultMotion
    val space = theme.defaultDensity.spacing
    val height = theme.defaultDensity.controlHeight.sm.dp - space.s2
    val pill = theme.rounded(theme.radius.pill)
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    val pressed by interaction.collectIsPressedAsState()
    val focused by interaction.collectIsFocusedAsState()
    val edge by animateColorAsState(
        when {
            flashing -> colors.accentBg
            focused -> colors.borderFocusSolid
            else -> colors.borderSubtle
        }.color,
        motion.easing.standard.tween(motion.duration.control),
        label = "edge",
    )
    val glyph by animateColorAsState(
        (if (hovered || pressed) colors.dangerText else colors.textMuted).color,
        motion.easing.standard.tween(motion.duration.control),
        label = "glyph",
    )
    // How far the remove button's touch area reaches past the pill's end.
    val reach = if (disabled) 0.dp else ((theme.defaultDensity.hitTarget.dp - height) / 2 - space.s2).coerceAtLeast(0.dp)
    Row(
        modifier = Modifier
            .padding(end = reach)
            .height(height)
            .background(colors.bgSubtle.color, pill)
            .border(PMGeometry.hairline, edge, pill)
            .padding(horizontal = space.s2),
        horizontalArrangement = Arrangement.spacedBy(space.s1),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = theme.text.sm.textStyle,
            color = (if (disabled) colors.textDisabled else colors.textPrimary).color,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.widthIn(max = space.s10 * PMRecipe.chipLabelMeasure),
        )
        if (!disabled) {
            Box(
                modifier = Modifier
                    .focusRequester(focus)
                    .onPreviewKeyEvent { event ->
                        val removes = event.key == Key.Backspace || event.key == Key.Delete
                        if (event.type == KeyEventType.KeyDown && removes) {
                            onRemove(true)
                            true
                        } else {
                            false
                        }
                    }
                    // Before the clearing semantics: the click gives the
                    // button its action.
                    .clickable(interactionSource = interaction, indication = null) { onRemove(focused) }
                    .clearAndSetSemantics {
                        contentDescription = removeLabel
                        role = Role.Button
                    }
                    .size(height)
                    .pmPressFeedback(pressed)
                    .pmFocusRing(focused, theme.radius.pill.dp),
                contentAlignment = Alignment.Center,
            ) {
                PMIconView(PMIconRole.Close, PMControlSize.Sm, tint = glyph)
            }
        }
    }
}

/**
 * The flow a field's chips wrap in, TagInput's and MultiSelect's: children in
 * order, `spacing` apart, onto as many lines as they need, `spacing` apart,
 * each centred on its line, the lines centred in the height the flow is
 * given. With `lastMinWidth`, the last child (TagInput's text entry) takes the
 * rest of its line, at least that wide, and moves to a line of its own when
 * less is left.
 *
 * While the flow is one line, it sits inside the field's own hit area, which
 * gives each remove button its touch height. Once it wraps, every line is at
 * least the hit target tall, so the touch areas of buttons on neighbouring
 * lines do not overlap, and those on the first and last lines stay inside the
 * field.
 */
@Composable
fun PMChipFlow(spacing: Dp, modifier: Modifier = Modifier, lastMinWidth: Dp? = null, content: @Composable () -> Unit) {
    val hitTarget = PM.theme.defaultDensity.hitTarget.dp
    Layout(content, modifier) { measurables, constraints ->
        val gap = spacing.roundToPx()
        val width = if (constraints.hasBoundedWidth) constraints.maxWidth else Constraints.Infinity
        val fills = lastMinWidth != null
        val chips = (if (fills) measurables.dropLast(1) else measurables).map { it.measure(Constraints(maxWidth = width)) }
        // Each line's placeables with their x.
        val lines = mutableListOf(mutableListOf<Pair<Placeable, Int>>())
        var x = 0
        for (chip in chips) {
            val start = if (x == 0) 0 else x + gap
            if (start + chip.width > width && x > 0) {
                lines += mutableListOf<Pair<Placeable, Int>>()
                x = 0
            }
            val at = if (x == 0) 0 else x + gap
            lines.last() += chip to at
            x = at + chip.width
        }
        if (lastMinWidth != null) {
            measurables.lastOrNull()?.let { last ->
                var at = if (x == 0) 0 else x + gap
                var room = width - at
                if (room < lastMinWidth.roundToPx() && x > 0) {
                    lines += mutableListOf<Pair<Placeable, Int>>()
                    at = 0
                    room = width
                }
                lines.last() += last.measure(Constraints(minWidth = room, maxWidth = room)) to at
            }
        }
        val filled = lines.filter { it.isNotEmpty() }
        val least = if (filled.size > 1) hitTarget.roundToPx() else 0
        val heights = filled.map { line -> maxOf(least, line.maxOf { it.first.height }) }
        val total = heights.sum() + gap * (filled.size - 1).coerceAtLeast(0)
        val laid = if (width == Constraints.Infinity) filled.maxOfOrNull { line -> line.maxOf { it.second + it.first.width } } ?: 0 else width
        val tall = total.coerceIn(constraints.minHeight, constraints.maxHeight)
        layout(laid, tall) {
            // Lines shorter than the flow's least height are centred in it.
            var y = ((tall - total) / 2).coerceAtLeast(0)
            filled.forEachIndexed { index, line ->
                for ((placeable, at) in line) placeable.placeRelative(at, y + (heights[index] - placeable.height) / 2)
                y += heights[index] + gap
            }
        }
    }
}

/**
 * Whether an Input selects its whole text each time it takes focus, so typing
 * replaces it: InlineEdit's field, which opens holding the value
 * (`inline-edit.md`, "Opening"). Every other field keeps the selection where
 * Compose puts it.
 */
val LocalPMFieldSelectsAll = compositionLocalOf { false }

/**
 * FormField's error (`form-field.md`), which InlineEdit draws under its field
 * too: `text.xs` in danger text after the `error` glyph, which sits in a seat
 * one line tall so it stays beside the first line. The control reports the
 * message, so the row is not read.
 */
@Composable
fun PMFieldErrorRow(text: String) {
    val theme = PM.theme
    val step = theme.text.xs
    val danger = theme.colors.dangerText.color
    Row(
        modifier = Modifier.semantics { hideFromAccessibility() },
        horizontalArrangement = Arrangement.spacedBy(theme.defaultDensity.spacing.s2),
        verticalAlignment = Alignment.Top,
    ) {
        Box(Modifier.height(step.lineBox.dp), contentAlignment = Alignment.Center) {
            PMIconView(PMIconRole.Error, PMControlSize.Sm, tint = danger)
        }
        Text(text = text, style = step.textStyle, color = danger)
    }
}
