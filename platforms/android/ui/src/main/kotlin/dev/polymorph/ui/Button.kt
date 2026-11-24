// Button (`design/components/button.md`): the action primitive. Its recipe's
// cells, drawn as an Android button: the lawful variant × tone grid
// (`PMButtonAppearance`, so an unlawful pair cannot be written), the three
// control sizes, the leading and trailing icon, icon-only, loading with the
// spinning glyph in the leading slot, disabled, and the toggle's latched state.
// The cell is drawn by `PMButtonFrame` (`PolymorphUIButtons.kt`), which the
// presets that wear Button's recipe by reference draw with too.
//
// The phases map to the web's pseudo-classes. A press is a ripple from the
// touch point in the cell's active fill, under the label, so the press reads
// as Android's and its colour is the recipe's `:active`; a pointer over the
// button (a mouse, a stylus, a tablet's trackpad) is `:hover`; the toggle's on
// state holds the active cell, as `data-state="on"` does. Keyboard focus draws
// the focus mark inside the button's edge (`pmFocusRing`), the web's
// `:focus-visible`, in the label colour on a solid fill.
// Inside a container that makes its buttons tertiary (`LocalPMTertiary`, which
// Toast sets), every cell draws the tone's text colour alone: no fill, border,
// shadow or press wash, in any phase.
//
// What the web's attributes become: the click is the button's action, and a
// disabled button reports itself disabled; `aria-busy` is the state
// description (the spinner's "Loading"), `aria-pressed` is the toggleable
// state, and `aria-current` is the selected state. A `submit` button runs
// `LocalPMSubmitAction` after its own `onClick`, which FormPage sets around its
// actions row, as a web submit button submits its `<form>`; an overlay's
// trigger runs `LocalPMTriggerAction`. `aria-expanded` is the platform's
// expanded or collapsed state with its expand or collapse action, as a
// disclosure's trigger reports it; a loading button's state is "Loading"
// instead. The `aria-controls`, `aria-describedby` and `aria-labelledby` props
// name element ids, which Compose has none of, so they have no effect here: a
// row that labels a button names it through `ariaLabel`.
//
// A `count` above zero draws a Badge in its count form, from the centre of an
// icon-only button's top edge toward its end edge, or after the label of any
// other, and makes `count.label` the accessible name. The Badge is no
// semantics node and takes no touch, so the count is heard once, in the app's
// words. It is drawn over the button's own box, outside its clip, so a round
// control radius does not cut it and a wide count may reach past the end edge.

package dev.polymorph.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.style.TextOverflow
import dev.polymorph.tokens.PMColors
import dev.polymorph.tokens.PMDynamicColor

object PMButton : PMButtonRendering {
    @Composable
    override fun Render(props: PMButtonProps) {
        val appearance = props.appearance ?: PMButtonAppearance.SolidAccent
        val size = props.size ?: PMControlSize.Md
        val loading = props.loading ?: false
        val disabled = (props.disabled ?: false) || !LocalPMEnabled.current
        val iconOnly = props.iconOnly ?: false
        val trigger = LocalPMTriggerAction.current
        val submit = LocalPMSubmitAction.current
        val metrics = PMControlMetrics(size, PM.theme)

        // Loading takes precedence over the toggle in the state, as on the
        // web; the semantics still report the toggle.
        val state = if (loading) "loading" else props.pressed?.let { if (it) "on" else "off" }
        // `value > 0` is false for `NaN` as well, which Badge would not draw either.
        val count = props.count?.takeIf { it.value > 0 }
        val attributes = buildMap {
            put("variant", appearance.variant.value)
            put("tone", appearance.tone.value)
            put("size", size.value)
            state?.let { put("state", it) }
            if (disabled) put("disabled", "true")
            if (iconOnly) put("icon-only", "true")
            props.expanded?.let { put("expanded", it.toString()) }
            count?.let { put("count", countText(it.value)) }
        }

        Box(contentAlignment = Alignment.Center) {
            PMButtonFrame(
                appearance = appearance,
                size = size,
                // A settings row names its control by the row's label (`PMFieldContext.nameOnly`).
                name = props.ariaLabel ?: LocalPMField.current?.takeIf { it.nameOnly }?.label ?: count?.label ?: props.label,
                onClick = {
                    props.onClick?.invoke()
                    trigger?.invoke()
                    if (props.type == PMButtonType.Submit) submit?.invoke()
                },
                modifier = Modifier.pmMember("Button", attributes),
                disabled = disabled,
                loading = loading,
                iconOnly = iconOnly,
                latched = props.pressed,
                current = props.current == true,
                value = if (loading) PMSpecDefault.strings.loading else null,
                expanded = props.expanded,
            ) { text ->
                when {
                    loading -> PMSpinGlyph(size, text)
                    props.icon != null -> PMIconView(props.icon, size, tint = text)
                }
                if (!iconOnly) {
                    Text(
                        text = props.label,
                        style = metrics.text.textStyle,
                        color = text,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    props.trailingIcon?.let { PMIconView(it, size, tint = text) }
                    count?.let { PMButtonCountBadge(it.value, disabled) }
                }
            }
            // The drawn square, centred in the hit target as the button is. The
            // count starts at its centre and grows toward the end edge, so a wide
            // count reaches past the edge instead of across the glyph.
            if (iconOnly && count != null) {
                Box(Modifier.requiredSize(metrics.height), contentAlignment = Alignment.TopStart) {
                    Box(
                        Modifier
                            .offset(x = metrics.height / PMRecipe.buttonCountStart)
                            .wrapContentWidth(Alignment.Start, unbounded = true),
                    ) { PMButtonCountBadge(count.value, disabled) }
                }
            }
        }
    }
}

/**
 * The count a Button carries: a Badge in its count form, `solid`/`accent`, no
 * semantics node because the button's name says it, and desaturated and faded
 * on a disabled button, as AvatarButton's face is.
 */
@Composable
private fun PMButtonCountBadge(value: Double, disabled: Boolean) {
    val grey = if (disabled) ColorFilter.colorMatrix(ColorMatrix().apply { setToSaturation(0f) }) else null
    Box(
        Modifier
            .clearAndSetSemantics {}
            .graphicsLayer {
                alpha = if (disabled) PMRecipe.buttonCountDisabledOpacity else 1f
                colorFilter = grey
            },
    ) {
        PMBadge(count = value, tone = PMBadgeTone.Accent, variant = PMBadgeVariant.Solid)
    }
}

enum class PMButtonPhase { Rest, Hover, Active, Disabled }

/**
 * One cell of the recipe: the colours of a variant × tone in a phase, written
 * out beside the spec's tables rather than derived. The CSS is the authority
 * where the two differ: outline/neutral's border is `border.field`.
 */
class PMButtonCell private constructor(
    val text: PMDynamicColor,
    val fill: PMDynamicColor? = null,
    val border: PMDynamicColor? = null,
    /** The accent gradient over the fill, where the theme has one. */
    val gradient: Boolean = false,
    /** The lit fill: the seat shadow and the inset top light. */
    val lit: Boolean = false,
    /** The hover glow, in place of the lit fill's shadow. */
    val glow: Boolean = false,
) {
    companion object {
        operator fun invoke(appearance: PMButtonAppearance, phase: PMButtonPhase, c: PMColors): PMButtonCell {
            if (phase == PMButtonPhase.Disabled) {
                // One recipe per variant, whatever the tone (`design/components/README.md`,
                // "Disabled, loading, invalid").
                return when (appearance.variant) {
                    PMButtonVariant.Solid, PMButtonVariant.Soft -> PMButtonCell(c.textDisabled, fill = c.bgSubtle)
                    PMButtonVariant.Outline -> PMButtonCell(c.textDisabled, border = c.borderSubtle)
                    PMButtonVariant.Ghost -> PMButtonCell(c.textDisabled)
                }
            }
            val rest = phase == PMButtonPhase.Rest
            val hover = phase == PMButtonPhase.Hover
            return when (appearance) {
                PMButtonAppearance.SolidAccent -> when {
                    rest -> PMButtonCell(c.accentContrast, c.accentBg, gradient = true, lit = true)
                    hover -> PMButtonCell(c.accentContrast, c.accentBgHover, gradient = true, glow = true)
                    else -> PMButtonCell(c.accentContrast, c.accentBgActive, gradient = true, lit = true)
                }
                PMButtonAppearance.SolidDanger -> when {
                    rest -> PMButtonCell(c.dangerContrast, c.dangerSolid, lit = true)
                    hover -> PMButtonCell(c.dangerContrast, c.dangerSolidHover, lit = true)
                    else -> PMButtonCell(c.dangerContrast, c.dangerSolidActive, lit = true)
                }
                PMButtonAppearance.SoftAccent -> when {
                    rest -> PMButtonCell(c.accentText, c.accentSubtle)
                    hover -> PMButtonCell(c.accentText, c.accentSubtleHover)
                    else -> PMButtonCell(c.accentText, c.accentSubtleActive)
                }
                PMButtonAppearance.SoftDanger -> when {
                    rest -> PMButtonCell(c.dangerText, c.dangerSubtle)
                    hover -> PMButtonCell(c.dangerText, c.dangerSubtleHover)
                    else -> PMButtonCell(c.dangerText, c.dangerSubtleActive)
                }
                PMButtonAppearance.OutlineNeutral -> when {
                    rest -> PMButtonCell(c.textPrimary, border = c.borderField)
                    else -> PMButtonCell(c.textPrimary, c.bgSubtle, c.borderStrong)
                }
                PMButtonAppearance.OutlineAccent -> when {
                    rest -> PMButtonCell(c.accentText, border = c.accentBg)
                    hover -> PMButtonCell(c.accentText, c.accentSubtle, c.accentBg)
                    else -> PMButtonCell(c.accentText, c.accentSubtleHover, c.accentBg)
                }
                PMButtonAppearance.OutlineDanger -> when {
                    rest -> PMButtonCell(c.dangerText, border = c.dangerBorder)
                    hover -> PMButtonCell(c.dangerText, c.dangerSubtle, c.dangerBorder)
                    else -> PMButtonCell(c.dangerText, c.dangerSubtleHover, c.dangerBorder)
                }
                PMButtonAppearance.GhostNeutral -> when {
                    rest -> PMButtonCell(c.textSecondary)
                    else -> PMButtonCell(c.textPrimary, c.bgSubtle)
                }
                PMButtonAppearance.GhostAccent -> when {
                    rest -> PMButtonCell(c.accentText)
                    hover -> PMButtonCell(c.accentText, c.accentSubtle)
                    else -> PMButtonCell(c.accentText, c.accentSubtleHover)
                }
                PMButtonAppearance.GhostDanger -> when {
                    rest -> PMButtonCell(c.dangerText)
                    hover -> PMButtonCell(c.dangerText, c.dangerSubtle)
                    else -> PMButtonCell(c.dangerText, c.dangerSubtleHover)
                }
            }
        }

        /**
         * A tertiary cell, the same in every phase: the tone's text colour
         * (`text.secondary` for neutral, `accent.text`, `danger.text`), or
         * `text.disabled`, and nothing else. Toast's recipe makes every button
         * inside a toast this.
         */
        fun tertiary(tone: PMButtonTone, disabled: Boolean, c: PMColors): PMButtonCell = PMButtonCell(
            when {
                disabled -> c.textDisabled
                tone == PMButtonTone.Neutral -> c.textSecondary
                tone == PMButtonTone.Danger -> c.dangerText
                else -> c.accentText
            },
        )
    }
}

/**
 * Button's states, from the spec's States table: every lawful cell at `md`,
 * the three sizes, the icons, icon-only, loading, disabled (one recipe per
 * variant), and the toggle on and off.
 */
object ButtonStates : PMStates {
    override val member = "Button"

    private const val save = "Save"

    override val entries: List<PMStateEntry>
        get() {
            val cells = PMButtonAppearance.lawful.map { cell ->
                PMStateEntry(
                    "${cell.variant.value} / ${cell.tone.value}",
                    expect = mapOf("variant" to cell.variant.value, "tone" to cell.tone.value, "label" to save),
                ) { PMButton(label = save, appearance = cell) }
            }
            val sizes = PMControlSize.entries.map { size ->
                PMStateEntry("size ${size.value}", expect = mapOf("size" to size.value, "label" to save)) {
                    PMButton(label = save, size = size)
                }
            }
            val disabled = PMButtonVariant.entries.map { variant ->
                val cell = PMButtonAppearance.lawful.first { it.variant == variant }
                PMStateEntry(
                    "disabled ${variant.value}",
                    expect = mapOf("variant" to variant.value, "disabled" to "true", "label" to save),
                ) { PMButton(disabled = true, label = save, appearance = cell) }
            }
            return cells + sizes + listOf(
                PMStateEntry("sizes side by side", expect = mapOf("size" to "sm")) { SizesInARow(iconOnly = false) },
                PMStateEntry("leading icon", expect = mapOf("label" to "New ticket")) {
                    PMButton(icon = PMIconRole.Add, label = "New ticket")
                },
                PMStateEntry("trailing icon", expect = mapOf("label" to "Continue")) {
                    PMButton(label = "Continue", trailingIcon = PMIconRole.Next)
                },
                PMStateEntry("icon-only", expect = mapOf("icon-only" to "true", "label" to "Edit")) {
                    PMButton(icon = PMIconRole.Edit, iconOnly = true, label = "Edit")
                },
                PMStateEntry("icon-only at every size", expect = mapOf("icon-only" to "true", "size" to "sm")) {
                    SizesInARow(iconOnly = true)
                },
                PMStateEntry(
                    "loading",
                    expect = mapOf("state" to "loading", "label" to "Saving", "value" to "Loading"),
                ) { PMButton(label = "Saving", loading = true) },
                PMStateEntry("loading, with a leading icon it replaces", expect = mapOf("state" to "loading")) {
                    PMButton(icon = PMIconRole.Add, label = "New ticket", loading = true)
                },
                PMStateEntry("loading + disabled", expect = mapOf("state" to "loading", "disabled" to "true")) {
                    PMButton(disabled = true, label = "Saving", loading = true)
                },
                PMStateEntry("pressed on — the active cell, latched", expect = mapOf("state" to "on")) {
                    PMButton(label = "Watching", pressed = true, appearance = PMButtonAppearance.SoftAccent)
                },
                PMStateEntry("pressed off — the rest cell", expect = mapOf("state" to "off")) {
                    PMButton(label = "Watching", pressed = false, appearance = PMButtonAppearance.SoftAccent)
                },
                PMStateEntry(
                    "expanded — a disclosure’s trigger while its region shows",
                    expect = mapOf("expanded" to "true", "label" to "Details", "value" to "expanded"),
                ) {
                    PMButton(
                        expanded = true,
                        icon = PMIconRole.Up,
                        iconOnly = true,
                        label = "Details",
                        appearance = PMButtonAppearance.GhostNeutral,
                    )
                },
                PMStateEntry(
                    "collapsed — the same trigger while its region is hidden",
                    expect = mapOf("expanded" to "false", "label" to "Details", "value" to "collapsed"),
                ) {
                    PMButton(
                        expanded = false,
                        icon = PMIconRole.Down,
                        iconOnly = true,
                        label = "Details",
                        appearance = PMButtonAppearance.GhostNeutral,
                    )
                },
                PMStateEntry(
                    "tertiary — a solid button inside a toast draws its tone's text alone",
                    expect = mapOf("variant" to "solid", "tone" to "accent", "label" to "Undo"),
                ) {
                    CompositionLocalProvider(LocalPMTertiary provides true) { PMButton(label = "Undo") }
                },
            ) + disabled
        }

    /** The three sizes in a row, each with a leading icon: as labelled buttons, or icon-only. */
    @Composable
    private fun SizesInARow(iconOnly: Boolean) {
        val space = PM.theme.defaultDensity.spacing
        Row(horizontalArrangement = Arrangement.spacedBy(space.s3), verticalAlignment = Alignment.CenterVertically) {
            for (size in PMControlSize.entries) {
                PMButton(
                    icon = if (iconOnly) PMIconRole.Delete else PMIconRole.Add,
                    iconOnly = iconOnly,
                    label = if (iconOnly) "Delete (${size.value})" else size.value,
                    size = size,
                )
            }
        }
    }
}
