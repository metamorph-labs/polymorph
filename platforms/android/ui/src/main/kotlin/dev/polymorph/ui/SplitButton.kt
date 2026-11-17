// SplitButton (`design/components/split-button.md`): a default command and a
// menu of its variants in one control. Two Buttons joined at a seam, each
// Button's recipe for the group's variant and tone at its size
// (`PMButtonFrame`), each pressed and hovered on its own: the primary half
// with its icon and label, and the chevron half, icon-only and square, with
// the `expand` glyph. The control radius rounds the group's outer corners
// only. The seam is one hairline in a colour the halves already use: the
// active fill step for `solid` and `soft`, and for `outline` the border, which
// the halves share, so the seam is one line and never two. Each half reserves
// the hit target's height and the halves meet at the seam.
//
// The chevron half opens Menu as it renders here (`PMMenuPresentation`): a
// bottom sheet of the entries on a phone's window and a dropdown hanging from
// the group's end on a wider one (`presentation: popover` keeps the dropdown
// on a phone too), the chevron holding its active cell while the menu is
// open. `loading` puts the spinning glyph in the primary half's icon slot,
// keeps the layout, detaches its action and disables the chevron, because a
// command in flight is the whole group's state; `disabled` disables both
// halves, and the seam is `border.subtle`.
//
// The lawful cells are a part of Button's: `solid` and `soft` are accent only,
// `outline` is accent or neutral, and there is no `ghost` and no `danger`. The
// contract takes the pair as one cell of that grid (`PMSplitButtonAppearance`),
// so a pair outside it cannot be written. The primary half is named by `label`
// and reports loading as its state description; the chevron half is named by
// `menuLabel`.

package dev.polymorph.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.polymorph.tokens.PMDynamicColor

object PMSplitButton : PMSplitButtonRendering {
    @Composable
    override fun Render(props: PMSplitButtonProps) {
        val theme = PM.theme
        val size = props.size ?: PMControlSize.Md
        val disabled = (props.disabled ?: false) || !LocalPMEnabled.current
        val loading = props.loading ?: false
        val appearance = appearance(props)
        val metrics = PMControlMetrics(size, theme)
        var open by remember { mutableStateOf(props.defaultOpen == true && !disabled) }
        val attributes = buildMap {
            put("variant", appearance.variant.value)
            put("tone", appearance.tone.value)
            put("size", size.value)
            put("state", if (open) "open" else "closed")
            if (loading) put("loading", "true")
            if (disabled) put("disabled", "true")
        }
        val seam = seam(appearance, disabled)
        val outline = appearance.variant == PMButtonVariant.Outline

        Box(Modifier.pmMember("SplitButton", attributes)) {
            Row(
                // Outline halves overlap their shared border, which is the seam.
                horizontalArrangement = Arrangement.spacedBy(if (outline) -PMGeometry.hairline else 0.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(contentAlignment = Alignment.CenterEnd) {
                    PMButtonFrame(
                        appearance = appearance,
                        size = size,
                        name = props.label,
                        onClick = { props.onClick?.invoke() },
                        disabled = disabled,
                        loading = loading,
                        value = if (loading) PMSpecDefault.strings.loading else null,
                        corners = PMButtonCorners.Start,
                        hitWidth = false,
                    ) { text ->
                        when {
                            loading -> PMSpinGlyph(size, text)
                            props.icon != null -> PMIconView(props.icon, size, tint = text)
                        }
                        Text(
                            text = props.label,
                            style = metrics.text.textStyle,
                            color = text,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    seam?.let { PMRule(it, Modifier.height(metrics.height), vertical = true) }
                }
                PMButtonFrame(
                    appearance = appearance,
                    size = size,
                    name = props.menuLabel,
                    onClick = { open = true },
                    disabled = disabled || loading,
                    iconOnly = true,
                    corners = PMButtonCorners.End,
                    held = open,
                    hitWidth = false,
                ) { text -> PMIconView(PMIconRole.Expand, size, tint = text) }
            }
            PMMenuPresentation(
                open = open,
                entries = props.entries,
                anchored = props.presentation == PMSplitButtonPresentation.Popover,
                member = "SplitButton",
                attributes = attributes,
                close = { open = false },
                align = PMAnchorAlign.End,
            )
        }
    }

    /** The group's cell, the same cell of Button's lawful grid. */
    private fun appearance(props: PMSplitButtonProps): PMButtonAppearance = when (props.appearance ?: PMSplitButtonAppearance.SolidAccent) {
        PMSplitButtonAppearance.SolidAccent -> PMButtonAppearance.SolidAccent
        PMSplitButtonAppearance.SoftAccent -> PMButtonAppearance.SoftAccent
        PMSplitButtonAppearance.OutlineNeutral -> PMButtonAppearance.OutlineNeutral
        PMSplitButtonAppearance.OutlineAccent -> PMButtonAppearance.OutlineAccent
    }

    /** The seam over the filled variants: the active fill step, `border.subtle` while disabled. Outline's is the halves' shared border. */
    @Composable
    private fun seam(appearance: PMButtonAppearance, disabled: Boolean): PMDynamicColor? {
        val colors = PM.theme.colors
        return when {
            appearance.variant == PMButtonVariant.Outline -> null
            disabled -> colors.borderSubtle
            appearance == PMButtonAppearance.SolidAccent -> colors.accentBgActive
            else -> colors.accentSubtleActive
        }
    }
}

/** SplitButton's states, from the spec's States table. */
object SplitButtonStates : PMStates {
    override val member = "SplitButton"

    private const val more = "More resolve options"

    private val resolve: List<PMMenuEntry> = listOf(
        PMMenuEntry.Item(PMMenuItemEntry(label = "Resolve and notify", icon = PMIconRole.Send, onSelect = {})),
        PMMenuEntry.Item(PMMenuItemEntry(label = "Resolve as duplicate", icon = PMIconRole.Duplicate, onSelect = {})),
    )

    private val withDanger: List<PMMenuEntry> = resolve + listOf(
        PMMenuEntry.Separator,
        PMMenuEntry.Item(PMMenuItemEntry(label = "Close without reply", tone = PMMenuItemEntryTone.Danger, onSelect = {})),
    )

    @Composable
    private fun Split(
        appearance: PMSplitButtonAppearance = PMSplitButtonAppearance.SolidAccent,
        icon: PMIconRole? = null,
        loading: Boolean = false,
        disabled: Boolean = false,
        size: PMControlSize? = null,
    ) {
        PMSplitButton(
            disabled = disabled,
            entries = resolve,
            icon = icon,
            label = "Resolve",
            loading = loading,
            menuLabel = more,
            size = size,
            appearance = appearance,
        )
    }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("solid accent", expect = mapOf("variant" to "solid", "tone" to "accent")) { Split() },
            PMStateEntry("soft accent", expect = mapOf("variant" to "soft", "tone" to "accent")) { Split(PMSplitButtonAppearance.SoftAccent) },
            PMStateEntry("outline accent", expect = mapOf("variant" to "outline", "tone" to "accent")) { Split(PMSplitButtonAppearance.OutlineAccent) },
            PMStateEntry("outline neutral — the one lawful neutral", expect = mapOf("tone" to "neutral")) {
                Split(PMSplitButtonAppearance.OutlineNeutral)
            },
            PMStateEntry("with icon", expect = mapOf("variant" to "solid")) { Split(icon = PMIconRole.Confirm) },
        ) + listOf(PMControlSize.Sm, PMControlSize.Lg).map { size ->
            PMStateEntry("size ${size.value}", expect = mapOf("size" to size.value)) { Split(size = size) }
        } + listOf(
            PMStateEntry("open on a phone — Menu's bottom sheet", expect = mapOf("state" to "open", "presentation" to "sheet")) {
                PMFixturePhone {
                    PMSplitButton(defaultOpen = true, entries = resolve, label = "Resolve", menuLabel = more)
                }
            },
            PMStateEntry("open, presentation popover — Menu's dropdown from the group's end", expect = mapOf("state" to "open")) {
                PMFixtureRoom(PMMenuRow.of(resolve).size + 1) {
                    PMSplitButton(
                        defaultOpen = true,
                        entries = resolve,
                        label = "Resolve",
                        menuLabel = more,
                        presentation = PMSplitButtonPresentation.Popover,
                    )
                }
            },
            PMStateEntry("danger entry — Menu's quiet danger", expect = mapOf("state" to "open")) {
                PMFixtureRoom(PMMenuRow.of(withDanger).size + 1) {
                    PMSplitButton(
                        defaultOpen = true,
                        entries = withDanger,
                        label = "Resolve",
                        menuLabel = more,
                        presentation = PMSplitButtonPresentation.Popover,
                    )
                }
            },
            PMStateEntry("loading — the chevron inert", expect = mapOf("loading" to "true")) {
                Split(icon = PMIconRole.Confirm, loading = true)
            },
            PMStateEntry("disabled — both halves", expect = mapOf("disabled" to "true")) { Split(disabled = true) },
        )
}
