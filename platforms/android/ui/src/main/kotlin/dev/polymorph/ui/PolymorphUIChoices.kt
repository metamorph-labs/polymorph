// The parts the choice and indicator members share. The bar (`PMBar`):
// Progress's track and fill, which Slider's track borrows. The choice groups'
// parts: the stack or row a group's options sit in (RadioGroup,
// CheckboxGroup), a group's name and error (RadioGroup, CheckboxGroup,
// ChoiceCard, SegmentedControl), a multiple choice's values in the options'
// order (CheckboxGroup, ChoiceCard), an option's description (CheckboxGroup,
// ChoiceCard), and the pop an indicator enters with (RadioGroup's dot,
// ChoiceCard's glyph). The option lists' rows (`PMOptionRow`): Select's item
// recipe, which Select, Combobox and MultiSelect draw, with the loading and
// empty rows at a row's height. Rating's model (`PMRatingModel`).

package dev.polymorph.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/* The bar ------------------------------------------------------------------ */

/**
 * What fills a bar: the accent gradient (the solid accent in a system with no
 * partner hue), `warning.solid` (a Meter in its warning band), `danger.solid`
 * (Progress's danger tone, for over-quota and exceeded budgets, and a Meter in
 * its danger band), or `border.default` (a disabled Slider: grey, so it does
 * not invite a touch).
 */
enum class PMBarFill { Accent, Warning, Danger, Disabled }

/**
 * The bar (`progress.md`), whose recipe Slider's track borrows: `space-2`
 * tall, a pill in every geometry, because a bar this thin with square ends
 * reads as a rendering fault, on `bg.subtle`, under its fill.
 */
object PMBar {
    val height: Dp
        @Composable @ReadOnlyComposable get() = PM.theme.defaultDensity.spacing.s2

    val shape: Shape
        @Composable @ReadOnlyComposable get() = PM.theme.rounded(PM.theme.radius.pill)

    val track: Color
        @Composable get() = PM.theme.colors.bgSubtle.color

    @Composable
    fun fill(fill: PMBarFill): Brush {
        val theme = PM.theme
        return when (fill) {
            PMBarFill.Accent -> theme.gradients.accentGradient.resolve(PM.dark).brush
            PMBarFill.Warning -> SolidColor(theme.colors.warningSolid.color)
            PMBarFill.Danger -> SolidColor(theme.colors.dangerSolid.color)
            PMBarFill.Disabled -> SolidColor(theme.colors.borderDefault.color)
        }
    }
}

/* Choice groups ------------------------------------------------------------ */

/**
 * A group's options as RadioGroup and CheckboxGroup lay them out
 * (`radio.md`): a stack `space-3` apart, or, `horizontal`, a row `space-5`
 * apart, each option on the row's top.
 */
@Composable
fun PMChoiceStack(horizontal: Boolean, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    val space = PM.theme.defaultDensity.spacing
    if (horizontal) {
        Row(modifier, horizontalArrangement = Arrangement.spacedBy(space.s5), verticalAlignment = Alignment.Top) {
            content()
        }
    } else {
        Column(modifier, verticalArrangement = Arrangement.spacedBy(space.s3)) { content() }
    }
}

/**
 * A choice group's root as an accessibility service reads it: named by `name`,
 * the question its options answer, the web's `aria-label` on the group, and
 * carrying `error` while the group is invalid, the web's `aria-invalid` and
 * its message. A `single` choice is also a selectable group, as Material's
 * radio and segmented groups are, so TalkBack reads its options as one choice.
 */
fun Modifier.pmChoiceGroup(name: String?, error: String?, single: Boolean): Modifier =
    then(if (single) Modifier.selectableGroup() else Modifier).semantics {
        name?.let { contentDescription = it }
        error?.let { error(it) }
    }

/** The values a multiple choice holds (CheckboxGroup, ChoiceCard's `multiple` mode). */
object PMChoices {
    /**
     * The options' values that `values` holds, in the options' order, so the
     * answer is the same whatever order the options were ticked in
     * (`checkbox-group.md`). A value no option has is dropped.
     */
    fun ordered(options: List<String>, values: Collection<String>): List<String> = options.filter { it in values }

    /** The values after `value` is turned `on` or off, in the options' order. */
    fun toggled(options: List<String>, values: Collection<String>, value: String, on: Boolean): List<String> =
        options.filter { if (it == value) on else it in values }
}

/**
 * An option's description, the two-line register's second line
 * (`combobox.md`): `text.xs` in `text.muted`, or `text.disabled` on a
 * disabled option.
 */
@Composable
fun PMChoiceDescription(text: String, disabled: Boolean, modifier: Modifier = Modifier) {
    val theme = PM.theme
    Text(
        text = text,
        modifier = modifier,
        style = theme.text.xs.textStyle,
        color = (if (disabled) theme.colors.textDisabled else theme.colors.textMuted).color,
    )
}

/**
 * An indicator on Checkbox's binding (`spring-pop`): in, from half its size on
 * the `snappy` spring with a fade over the control duration; out, a fade over
 * the control's exit duration. RadioGroup's dot and ChoiceCard's glyph enter
 * and leave with it.
 */
@Composable
fun PMPopIn(visible: Boolean, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    val motion = PM.theme.defaultMotion
    AnimatedVisibility(
        visible = visible,
        modifier = modifier,
        enter = scaleIn(motion.spring.snappy.spec(), initialScale = POP_FROM) +
            fadeIn(motion.easing.enter.tween(motion.duration.control)),
        exit = fadeOut(motion.easing.exit.tween(motion.duration.controlExit)),
    ) {
        content()
    }
}

/** The scale an indicator pops from: half, the recipe's. */
private const val POP_FROM = 0.5f

/* Option rows -------------------------------------------------------------- */

/** How an option row is chosen, which is what it is to TalkBack. */
enum class PMOptionKind {
    /** One value of a list, chosen alone: Select's and Combobox's rows, selected while chosen. */
    Single,

    /** One of several values, ticked on and off: MultiSelect's rows, each a checkbox. */
    Multiple,

    /** A command that adds the value it names: MultiSelect's offer, a button. */
    Add,
}

/**
 * A row of a list of options, Select's item recipe (`select.md`), which
 * Select, Combobox and MultiSelect draw. The check column comes first,
 * `icon.sm` wide and kept while empty so a label never shifts, with the
 * `confirm` glyph in `accent.text` on a chosen row, or an `Add` row's `add`
 * glyph, muted. Then the label, on one line, in the size's step (`text.xs`,
 * `text.sm`, `text.md`), and the description under it in `text.xs`
 * `text.muted`; `space.2` between the column and the text, `space.3` in from
 * each side, `radius.sm`. A row is at least `control.height.sm` and the hit
 * target tall, and a two-line row grows. Highlighted (`highlighted`, the
 * keyboard's place in a list whose focus stays in its field, or under the
 * pointer, or with keyboard focus) it is the `accent.subtle` wash in
 * `accent.text`, the description following; a press is a ripple of the wash.
 * Disabled, it is `text.disabled` throughout and takes no press.
 */
@Composable
fun PMOptionRow(
    label: String,
    description: String?,
    kind: PMOptionKind,
    chosen: Boolean,
    disabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    size: PMControlSize = PMControlSize.Md,
    highlighted: Boolean = false,
) {
    val theme = PM.theme
    val colors = theme.colors
    val density = theme.defaultDensity
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    val focused by interaction.collectIsFocusedAsState()
    val lit = !disabled && (highlighted || hovered || focused)
    val press = when (kind) {
        PMOptionKind.Single -> Modifier.selectable(
            selected = chosen,
            interactionSource = interaction,
            indication = null,
            enabled = !disabled,
            onClick = onClick,
        )
        PMOptionKind.Multiple -> Modifier.toggleable(
            value = chosen,
            interactionSource = interaction,
            indication = null,
            enabled = !disabled,
            role = Role.Checkbox,
        ) { onClick() }
        PMOptionKind.Add -> Modifier.clickable(
            interactionSource = interaction,
            indication = null,
            enabled = !disabled,
            role = Role.Button,
            onClick = onClick,
        )
    }
    Box(
        modifier
            .fillMaxWidth()
            .then(press)
            .heightIn(min = PMOptionRows.height)
            .clip(theme.rounded(theme.radius.sm))
            .background(if (lit) colors.accentSubtle.color else Color.Transparent),
        contentAlignment = Alignment.CenterStart,
    ) {
        if (!disabled) PMPressLayer(interaction, colors.accentSubtle.color, Modifier.matchParentSize())
        Row(
            modifier = Modifier.padding(horizontal = density.spacing.s3),
            horizontalArrangement = Arrangement.spacedBy(density.spacing.s2),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (kind == PMOptionKind.Add) {
                PMIconView(PMIconRole.Add, PMControlSize.Sm, tint = colors.textMuted.color)
            } else {
                PMIconView(
                    PMIconRole.Confirm,
                    PMControlSize.Sm,
                    Modifier.graphicsLayer { alpha = if (chosen) 1f else 0f },
                    tint = colors.accentText.color,
                )
            }
            Column(Modifier.weight(1f)) {
                Text(
                    text = label,
                    style = PMControlMetrics(size, theme).text.textStyle,
                    color = when {
                        disabled -> colors.textDisabled
                        lit -> colors.accentText
                        else -> colors.textPrimary
                    }.color,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                description?.let {
                    Text(
                        text = it,
                        style = theme.text.xs.textStyle,
                        color = when {
                            disabled -> colors.textDisabled
                            lit -> colors.accentText
                            else -> colors.textMuted
                        }.color,
                    )
                }
            }
        }
    }
}

/** What every row of an option list shares, so the loading and empty rows stand where an option would. */
object PMOptionRows {
    /** A row's least height: `control.height.sm`, and never less than the hit target. */
    val height: Dp
        @Composable @ReadOnlyComposable get() {
            val density = PM.theme.defaultDensity
            return maxOf(density.controlHeight.sm, density.hitTarget).dp
        }

    /** How many Skeleton rows a loading list draws (`combobox.md`, the async states). */
    const val LOADING = 3
}

/**
 * The rows a loading list draws: `PMOptionRows.LOADING` text Skeletons, each
 * at a row's height and inset, so the list keeps its size when the options
 * arrive. Decorative: the list's loading is announced, not drawn.
 */
@Composable
fun PMOptionSkeletonRows() {
    val space = PM.theme.defaultDensity.spacing
    repeat(PMOptionRows.LOADING) {
        Box(
            Modifier
                .fillMaxWidth()
                .heightIn(min = PMOptionRows.height)
                .padding(horizontal = space.s3)
                .clearAndSetSemantics { hideFromAccessibility() },
            contentAlignment = Alignment.CenterStart,
        ) { PMSkeleton(textStep = PMSkeletonTextStep.Sm) }
    }
}

/**
 * The one line an option list with nothing to show draws (`combobox.md`):
 * `message` centred in `text.sm` `text.muted`, at a row's height. It is
 * announced through the list's live region, so the line itself is not read
 * again.
 */
@Composable
fun PMOptionEmptyRow(message: String) {
    val theme = PM.theme
    Box(
        Modifier
            .fillMaxWidth()
            .heightIn(min = PMOptionRows.height)
            .padding(horizontal = theme.defaultDensity.spacing.s3)
            .clearAndSetSemantics { hideFromAccessibility() },
        contentAlignment = Alignment.Center,
    ) {
        Text(message, style = theme.text.sm.textStyle, color = theme.colors.textMuted.color, textAlign = TextAlign.Center)
    }
}

/* Rating -------------------------------------------------------------------- */

/**
 * Rating's model (`rating.md`), the engine's `ratingModel`, `ratingPress` and
 * the steps of `ratingStep` a native rating takes: how many marks there are,
 * what the rating holds, what each mark draws and is named, and the shown
 * rating's sentence. A control holds a whole mark from 1 to its most, or
 * nothing; a shown rating holds any value from 0 to its most, to one decimal
 * place, so the picture and the sentence agree. The numerals are Western
 * digits with a point before the tenth, because Compose's common code has no
 * locale-aware number formatter. `strings` gives the English words where
 * `messages` gives none.
 */
class PMRatingModel(
    value: Double?,
    label: String,
    max: Double?,
    readOnly: Boolean,
    messages: PMRatingMessages?,
    strings: PMStrings,
) {
    /** How much of a mark is drawn filled. */
    enum class Fill(val value: String) { Full("full"), Part("part"), None("none") }

    /** One mark: the value choosing it sets, its fill, the filled share of a part-filled mark (0 to 1), and its name. */
    class Mark(val value: Int, val fill: Fill, val share: Float, val name: String)

    /** The number of marks: a whole number from 2 to 10. */
    val max: Int = count(max)

    /** What the rating holds after rounding. */
    val value: Double? = held(value, this.max, readOnly)

    val marks: List<Mark>

    /** The shown rating's accessible name, one sentence. */
    val sentence: String

    init {
        val mark =messages?.mark ?: { at, numeral -> if (at == 1.0) strings.ratingStar(numeral) else strings.ratingStars(numeral) }
        val shown = messages?.shown ?: strings.ratingShown
        marks = (1..this.max).map { at ->
            // The share of this mark the value covers: 1 at or under it, 0 past it.
            val covered = ((this.value ?: 0.0) - (at - 1)).coerceIn(0.0, 1.0)
            val fill = when {
                covered >= 1.0 -> Fill.Full
                covered <= 0.0 -> Fill.None
                else -> Fill.Part
            }
            Mark(at, fill, covered.toFloat(), mark(at.toDouble(), "$at"))
        }
        sentence = shown(label, tenths(this.value ?: 0.0), "${this.max}")
    }

    companion object {
        /** The marks a rating has when it is not told. */
        const val DEFAULT_MAX = 5

        /** One mark is a toggle, which is a pressed Button. */
        private const val FEWEST = 2

        /** Past ten, a reader counts marks instead of reading them. */
        private const val MOST = 10

        /** A shown rating's places: tenths. */
        private const val TENTHS = 10.0

        /** The number of marks for a given `max`: whole, from 2 to 10, and 5 when it is not a number. */
        fun count(max: Double?): Int =
            if (max == null || !max.isFinite()) DEFAULT_MAX else jsRound(max).toInt().coerceIn(FEWEST, MOST)

        /**
         * What a rating holds, rounded as its form needs: a whole mark in a
         * control, nothing for no value, 0 or less; tenths inside 0 and its
         * most when shown.
         */
        fun held(value: Double?, max: Int, readOnly: Boolean): Double? {
            if (value == null || !value.isFinite()) return null
            if (readOnly) return (jsRound(value * TENTHS) / TENTHS).coerceIn(0.0, max.toDouble())
            val whole = minOf(max.toDouble(), jsRound(value))
            return if (whole < 1) null else whole
        }

        /**
         * What a press on a mark leaves the rating holding: that mark, or
         * nothing when it held that mark already. A required rating keeps the
         * mark.
         */
        fun press(mark: Int, holding: Int?, required: Boolean): Int? = if (mark != holding || required) mark else null

        /** The mark one step from `from`, forward or back, stopping at either end. */
        fun step(from: Int, forward: Boolean, max: Int): Int = (from + if (forward) 1 else -1).coerceIn(1, max)

        /** A value to one decimal place, without a trailing zero: 4.3, 4. */
        fun tenths(value: Double): String {
            val rounded = jsRound(value * TENTHS) / TENTHS
            return if (rounded == kotlin.math.floor(rounded)) "${rounded.toLong()}" else "$rounded"
        }

        /** `Math.round`: halves round up, as the engine rounds. */
        private fun jsRound(value: Double): Double = kotlin.math.floor(value + HALF)

        private const val HALF = 0.5
    }
}
