// The parts several controls share: the spinning `loading` glyph (Button,
// Spinner), the chevron that turns while what it opens is open (Select's,
// Combobox's and MultiSelect's `expand`, a disclosure's, JsonTree's and
// ToolCall's), the field family's container (Input, Select's trigger), a
// row-labelled control's label (Checkbox, Switch), and a sortable header's
// glyph and spoken direction (DataTable).

package dev.polymorph.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp

/**
 * The `loading` glyph turning once per the temperament's ambient spin period,
 * at a constant speed: the `spin` ambient pattern (`spinner.md`). It stands
 * still at the `none` temperament, whose period is 0; a still glyph under its
 * name still says "loading" (`design/motion/motion.md`, "Reduced-motion
 * projections").
 */
@Composable
fun PMSpinGlyph(size: PMControlSize, tint: Color, modifier: Modifier = Modifier) {
    val period = PM.theme.defaultMotion.ambient.spin
    if (period <= 0) {
        PMIconView(PMIconRole.Loading, size, modifier, tint)
        return
    }
    val turn by rememberInfiniteTransition(label = "spin").animateFloat(
        initialValue = 0f,
        targetValue = FULL_TURN,
        animationSpec = infiniteRepeatable(tween(period, easing = LinearEasing), RepeatMode.Restart),
        label = "spin",
    )
    PMIconView(PMIconRole.Loading, size, modifier.rotate(turn), tint)
}

/** Degrees in a turn: geometry, not a design value. */
private const val FULL_TURN = 360f

/** The turns a chevron takes, in degrees: geometry, not design values. */
object PMTurn {
    /** A quarter turn: JsonTree's `next`, pointing down once its branch is open. */
    const val QUARTER = 90f

    /** A half turn: an `expand` or `down` chevron, pointing up while what it opens is open. */
    const val HALF = 180f
}

/**
 * A chevron that turns: the glyph of `role` at `size` in `tint`, turned by
 * `turn` degrees while `open` (the other way in a right-to-left layout), over
 * the control duration on the standard easing (the recipes' `transform`
 * transition, `select.chevron`). It stands still at the `none` temperament,
 * whose duration is 0. It is decorative: the control around it says whether
 * it is open.
 */
@Composable
fun PMTurningChevron(
    role: PMIconRole,
    open: Boolean,
    turn: Float,
    size: PMControlSize = PMControlSize.Sm,
    tint: Color = PM.theme.colors.textMuted.color,
    modifier: Modifier = Modifier,
) {
    val motion = PM.theme.defaultMotion
    // A right-to-left layout mirrors the glyph (an auto-mirrored one, such as
    // `next`), so the turn is mirrored too: the chevron then points where it
    // points in a left-to-right layout, down for a quarter turn of `next`.
    val mirrored = LocalLayoutDirection.current == LayoutDirection.Rtl
    val angle by animateFloatAsState(
        targetValue = if (open) (if (mirrored) -turn else turn) else 0f,
        animationSpec = motion.easing.standard.tween(motion.duration.control),
        label = "chevron",
    )
    PMIconView(role, size, modifier.rotate(angle), tint)
}

/**
 * The field family's container (Input, Select's trigger): the surface, the
 * border, the seat and the focus ring, in every state of Input's recipe.
 * Disabled wins over invalid, as it comes last in the recipe; `held` keeps the
 * hover border, as an open Select's trigger does.
 */
@Composable
fun Modifier.pmFieldBox(
    invalid: Boolean,
    disabled: Boolean,
    readOnly: Boolean,
    focused: Boolean,
    hovered: Boolean = false,
    held: Boolean = false,
): Modifier {
    val theme = PM.theme
    val colors = theme.colors
    val motion = theme.defaultMotion
    val shape = theme.rounded(theme.radius.control)
    val target = when {
        disabled -> colors.borderSubtle
        invalid -> colors.dangerBorder
        (hovered || held) && !readOnly -> colors.borderStrong
        else -> colors.borderField
    }.color
    val border by animateColorAsState(target, motion.easing.standard.tween(motion.duration.control), label = "border")
    val fill = (if (disabled) colors.bgSubtle else colors.bgSurface).color
    return this
        // The seat says the field is ready, so a disabled field has none.
        .then(if (disabled) Modifier else Modifier.pmShadow(theme.shadows.seat, shape))
        .background(fill, shape)
        .border(PMGeometry.hairline, border, shape)
        .pmFocusRing(focused && !disabled, theme.radius.control.dp)
}

/**
 * A row-labelled control's label (Checkbox, Switch): `text.sm`, with the
 * required marker after it in the danger text colour. The marker is not
 * spoken: the control's name is the label alone.
 */
@Composable
fun PMRowLabel(label: String, required: Boolean, color: Color, modifier: Modifier = Modifier) {
    val theme = PM.theme
    val marker = theme.colors.dangerText.color
    Text(
        text = buildAnnotatedString {
            append(label)
            if (required) withStyle(SpanStyle(color = marker)) { append(REQUIRED_MARK) }
        },
        style = theme.text.sm.textStyle,
        color = color,
        modifier = modifier,
    )
}

/** The required marker: a symbol, so there is nothing in it to translate. */
private const val REQUIRED_MARK = " *"

/** A sort direction's glyph and spoken name, shared by the sortable headers. */
object PMSort {
    /** `sort` while the column is not sorted, `sort-asc` or `sort-desc` when it is. */
    fun glyph(direction: PMSortDirection?): PMIconRole = when (direction) {
        null -> PMIconRole.Sort
        PMSortDirection.Asc -> PMIconRole.SortAsc
        PMSortDirection.Desc -> PMIconRole.SortDesc
    }

    /** The direction as the header's state description, the web's `aria-sort`. */
    @Composable
    fun spoken(direction: PMSortDirection): String = when (direction) {
        PMSortDirection.Asc -> PMSpecDefault.strings.ascending
        PMSortDirection.Desc -> PMSpecDefault.strings.descending
    }
}
