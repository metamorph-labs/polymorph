// Rating (`design/components/rating.md`): a score out of a small whole number,
// drawn as a row of stars, five by default. Compose has no rating control, so
// a set rating is a row of selectable marks in a selectable group, and a shown
// rating (`readOnly`) one image. The model is the engine's (`PMRatingModel`):
// a control holds a whole mark from 1 to `max` or nothing, a shown rating any
// value from 0 to `max` to one decimal place, and `max` is held from 2 to 10.
//
// Each mark draws the `rating` role at `size` twice: the outline in
// `text.muted`, and over it the role's filled glyph in `accent.text`, whole,
// or cut to its share from the start edge in a shown rating, so a
// right-to-left row fills from the right. Filled and empty differ in shape,
// not in colour alone. An invalid control's outlines are `danger.text`; a
// disabled one's outlines and fills are `text.disabled`. A control's marks are
// each the hit target square and touch, and a row wider than its container
// wraps onto another line, because ten 48dp marks are wider than a phone
// (`rating.md`, "On iOS and Android"); a shown rating's marks are the glyph's
// size and `space-1` apart. Under a pointer,
// the hovered mark's outline and every one before it take `accent.text`, over
// the control duration on the standard easing (the hover reach); a fill
// appears and goes at once. Keyboard focus draws the focus ring around the
// mark at `radius.sm`.
//
// A control is Android's radio group: a selectable group named by `label`, or
// its FormField's label, carrying the field's message, or "Invalid", as its
// error while invalid; each mark is a radio button named by `messages.mark`
// ("3 stars"), selected on the mark the rating holds. A press chooses the
// mark, and a press on the chosen mark clears the rating unless it is
// required (`ariaRequired`, or its FormField's `required`). The arrow keys
// move focus between the marks and Enter or Space presses one, as Android's
// own radio buttons do; the web's arrows also choose, which Android's do not.
// The group is also Android's range control for TalkBack: its range is 0 to
// `max` in whole steps, its state the held mark's name, and TalkBack's
// increment and decrement choose the next or the previous mark, stopping at
// either end. `onChange` runs once for each change. A shown rating is one
// image named by `messages.shown` ("Average rating: 4.3 out of 5"). The
// numerals are Western digits with a point before the tenth, because
// Compose's common code has no locale-aware number formatter, so `locale` is
// not drawn (`undrawn.ts`). `name`, `id` and the `aria-*by` ids have no
// Compose counterpart.

package dev.polymorph.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import dev.polymorph.tokens.PMDynamicColor
import kotlin.math.roundToInt

object PMRating : PMRatingRendering {
    @Composable
    override fun Render(props: PMRatingProps) {
        var own by remember { mutableStateOf(props.defaultValue?.value) }
        val readOnly = props.readOnly ?: false
        val model = PMRatingModel(
            value = props.value?.let { it.value } ?: own,
            label = props.label,
            max = props.max,
            readOnly = readOnly,
            messages = props.messages,
            strings = PMSpecDefault.strings,
        )
        val size = props.size ?: PMControlSize.Md
        if (readOnly) {
            Shown(model, size)
        } else {
            Control(props, model, size) { next ->
                // A choice is reported only when it changes what the rating holds.
                if (next?.toDouble() != model.value) {
                    own = next?.toDouble()
                    props.onChange?.invoke(next?.toDouble())
                }
            }
        }
    }

    /** The image: the marks `space-1` apart, named by one sentence. */
    @Composable
    private fun Shown(model: PMRatingModel, size: PMControlSize) {
        val theme = PM.theme
        Row(
            Modifier
                .pmMember("Rating", mapOf("size" to size.value, "readonly" to "true"))
                .clearAndSetSemantics {
                    contentDescription = model.sentence
                    role = Role.Image
                },
            horizontalArrangement = Arrangement.spacedBy(theme.defaultDensity.spacing.s1),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            for (mark in model.marks) {
                Glyph(mark, size, theme.colors.textMuted.color, theme.colors.accentText.color)
            }
        }
    }

    /** The group of marks, each a radio button the hit target square. */
    @Composable
    private fun Control(props: PMRatingProps, model: PMRatingModel, size: PMControlSize, settle: (Int?) -> Unit) {
        val theme = PM.theme
        val field = LocalPMField.current
        val disabled = (props.disabled ?: false) || !LocalPMEnabled.current
        val invalid = (props.invalid ?: false) || (field?.invalid ?: false)
        val required = (props.ariaRequired ?: false) || (field?.required ?: false)
        val held = model.value?.toInt()
        var hovered by remember { mutableStateOf<Int?>(null) }
        val report = LocalPMFieldReport.current
        SideEffect { report?.invoke(PMFieldControl(disabled = disabled)) }
        val attributes = buildMap {
            put("size", size.value)
            held?.let { put("checked", "$it") }
            if (disabled) put("disabled", "true")
            if (invalid) put("invalid", "true")
            if (required) put("required", "true")
        }

        // A row of marks that touch, which wraps onto another line where the
        // container is narrower than the marks' hit targets.
        FlowRow(
            Modifier
                .pmMember("Rating", attributes)
                .pmChoiceGroup(
                    name = field?.label ?: props.label,
                    error = if (invalid) field?.error ?: PMSpecDefault.strings.invalid else null,
                    single = true,
                )
                .semantics {
                    if (!disabled) {
                        progressBarRangeInfo = ProgressBarRangeInfo(
                            (held ?: 0).toFloat(),
                            0f..model.max.toFloat(),
                            steps = model.max - 1,
                        )
                        held?.let { stateDescription = model.marks[it - 1].name }
                        setProgress { target ->
                            // One mark along, stopping at either end, whatever
                            // the step TalkBack asks for.
                            val from = held ?: 0
                            val to = target.roundToInt()
                            val next = when {
                                to > from -> PMRatingModel.step(from, forward = true, max = model.max)
                                to < from && from > 1 -> PMRatingModel.step(from, forward = false, max = model.max)
                                else -> return@setProgress false
                            }
                            settle(next)
                            true
                        }
                    }
                },
            verticalArrangement = Arrangement.Center,
        ) {
            for (mark in model.marks) {
                Mark(
                    mark = mark,
                    size = size,
                    held = held,
                    disabled = disabled,
                    invalid = invalid,
                    reached = !disabled && (hovered ?: 0) >= mark.value,
                    hover = { inside -> hovered = if (inside) mark.value else hovered.takeIf { it != mark.value } },
                ) { settle(PMRatingModel.press(mark.value, held, required)) }
            }
        }
    }

    /** One mark: a radio button the hit target square, the glyph centred in it. */
    @Composable
    private fun Mark(
        mark: PMRatingModel.Mark,
        size: PMControlSize,
        held: Int?,
        disabled: Boolean,
        invalid: Boolean,
        reached: Boolean,
        hover: (Boolean) -> Unit,
        press: () -> Unit,
    ) {
        val theme = PM.theme
        val colors = theme.colors
        val motion = theme.defaultMotion
        val interaction = remember { MutableInteractionSource() }
        val focused by interaction.collectIsFocusedAsState()
        val hovered by interaction.collectIsHoveredAsState()
        LaunchedEffect(hovered) { hover(hovered) }
        val outline by animateColorAsState(
            outline(disabled, invalid, reached).color,
            motion.easing.standard.tween(motion.duration.control),
            label = "rating outline",
        )

        Box(
            Modifier
                // Before the clearing semantics, which drop what the modifiers
                // after them add: the selection gives the mark its role, its
                // selected state, its action and its disabled state.
                .selectable(
                    selected = mark.value == held,
                    interactionSource = interaction,
                    indication = null,
                    enabled = !disabled,
                    role = Role.RadioButton,
                    onClick = press,
                )
                .hoverable(interaction, enabled = !disabled)
                .clearAndSetSemantics { contentDescription = mark.name }
                .size(theme.defaultDensity.hitTarget.dp)
                .pmFocusRing(focused && !disabled, theme.radius.sm.dp),
            contentAlignment = Alignment.Center,
        ) {
            Glyph(mark, size, outline, (if (disabled) colors.textDisabled else colors.accentText).color)
        }
    }

    /**
     * A mark's drawing: the outline, and the filled glyph over it, whole or
     * cut to the share the value covers from the start edge.
     */
    @Composable
    private fun Glyph(mark: PMRatingModel.Mark, iconSize: PMControlSize, outline: Color, fill: Color) {
        val rightToLeft = LocalLayoutDirection.current == LayoutDirection.Rtl
        Box {
            PMIconView(PMIconRole.Rating, iconSize, tint = outline)
            if (mark.fill != PMRatingModel.Fill.None) {
                PMIconView(
                    PMIconRole.Rating,
                    iconSize,
                    Modifier.drawWithContent {
                        val cut = size.width * mark.share
                        clipRect(
                            left = if (rightToLeft) size.width - cut else 0f,
                            right = if (rightToLeft) size.width else cut,
                        ) { this@drawWithContent.drawContent() }
                    },
                    tint = fill,
                    filled = true,
                )
            }
        }
    }

    /** The outline's colour: disabled first, then the hover reach, then invalid. */
    @Composable
    private fun outline(disabled: Boolean, invalid: Boolean, reached: Boolean): PMDynamicColor {
        val colors = PM.theme.colors
        return when {
            disabled -> colors.textDisabled
            reached -> colors.accentText
            invalid -> colors.dangerText
            else -> colors.textMuted
        }
    }
}

/**
 * Rating's states, from the spec's States table. A control's root carries its
 * size and the mark it holds, and its state is that mark's name; a shown
 * rating's carries `readonly` and is named by its sentence.
 */
object RatingStates : PMStates {
    override val member = "Rating"

    /** German words, with the numerals the member writes. */
    private val german = PMRatingMessages(
        mark = { value, numeral -> "$numeral ${if (value == 1.0) "Stern" else "Sterne"}" },
        shown = { label, value, max -> "$label: $value von $max" },
    )

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("nothing chosen yet", expect = mapOf("size" to "md", "checked" to "", "label" to "Rate this answer")) {
                PMRating(label = "Rate this answer")
            },
            PMStateEntry("three of five", expect = mapOf("checked" to "3", "value" to "3 stars")) {
                PMRating(defaultValue = PMSome(3.0), label = "Rate this answer")
            },
            PMStateEntry("each value — one to five", expect = mapOf("checked" to "1", "value" to "1 star")) {
                RatingColumn((1..5).map { PMRatingProps(defaultValue = PMSome(it.toDouble()), label = "Answer $it") })
            },
            PMStateEntry(
                "read-only — an average of 4.3",
                expect = mapOf("readonly" to "true", "label" to "Average rating: 4.3 out of 5"),
            ) {
                PMRating(label = "Average rating", readOnly = true, value = PMSome(4.3))
            },
            PMStateEntry("disabled", expect = mapOf("disabled" to "true", "checked" to "2")) {
                PMRating(defaultValue = PMSome(2.0), disabled = true, label = "Rate this answer")
            },
            PMStateEntry("sizes — sm, md and lg", expect = mapOf("size" to "sm")) {
                RatingColumn(
                    listOf(
                        PMRatingProps(defaultValue = PMSome(4.0), label = "Small", size = PMControlSize.Sm),
                        PMRatingProps(defaultValue = PMSome(4.0), label = "Medium", size = PMControlSize.Md),
                        PMRatingProps(defaultValue = PMSome(4.0), label = "Large", size = PMControlSize.Lg),
                    ),
                )
            },
            PMStateEntry("ten marks — the most a rating takes", expect = mapOf("checked" to "7", "value" to "7 stars")) {
                PMRating(defaultValue = PMSome(7.0), label = "How likely are you to recommend us?", max = 10.0)
            },
            PMStateEntry(
                "in a FormField, required and in error",
                expect = mapOf("invalid" to "true", "required" to "true", "checked" to "", "label" to "How was this answer?"),
            ) {
                // The context a FormField hands its control, so the entry's root is the Rating.
                CompositionLocalProvider(
                    LocalPMField provides PMFieldContext(
                        label = "How was this answer?",
                        error = "Choose a rating to send your feedback.",
                        required = true,
                        invalid = true,
                    ),
                ) { PMRating(label = "Answer rating", name = "rating") }
            },
            PMStateEntry(
                "in a Table cell — read-only and small",
                expect = mapOf("readonly" to "true", "size" to "sm", "label" to "Rating: 4.6 out of 5"),
            ) {
                // The cell's content: a Table's own root would be the entry's first member.
                PMRating(label = "Rating", readOnly = true, size = PMControlSize.Sm, value = PMSome(4.6))
            },
            PMStateEntry("messages — the words in German", expect = mapOf("checked" to "4", "value" to "4 Sterne")) {
                PMRating(defaultValue = PMSome(4.0), label = "Bewertung", locale = "de", messages = german)
            },
        )

    /** Several ratings in a column `space-3` apart, as the web's fixture stacks them. */
    @Composable
    private fun RatingColumn(ratings: List<PMRatingProps>) {
        Column(
            verticalArrangement = Arrangement.spacedBy(PM.theme.defaultDensity.spacing.s3),
        ) {
            for (rating in ratings) PMRating.Render(rating)
        }
    }
}
