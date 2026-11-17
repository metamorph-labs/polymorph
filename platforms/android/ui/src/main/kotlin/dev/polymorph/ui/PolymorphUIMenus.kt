// Menu's rows and panel (`design/components/menu.md`), which Menu, ContextMenu
// and SplitButton's menu draw, and the presentation they share: Menu's sheet
// on a phone's window, its anchored panel on a wider one or when the member's
// `presentation` keeps the popover.

package dev.polymorph.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.text.intl.LocaleList
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.toUpperCase
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import dev.polymorph.tokens.PMDynamicColor

/**
 * One row of Menu's grammar, with a submenu flattened into its label and its
 * items: a submenu is a named group of commands, which a list can already
 * say, and neither a sheet nor a touch popup cascades (`menu.md`, "Submenu
 * arms flatten in the sheet"). A disabled submenu is its label alone.
 */
sealed interface PMMenuRow {
    data class Item(val item: PMMenuItemEntry) : PMMenuRow
    data class Checkbox(val checkbox: PMMenuCheckboxEntry) : PMMenuRow
    data object Separator : PMMenuRow
    data class Label(val label: String) : PMMenuRow

    companion object {
        /** The rows `entries` draw, in order. */
        fun of(entries: List<PMMenuEntry>): List<PMMenuRow> = entries.flatMap { entry ->
            when (entry) {
                is PMMenuEntry.Item -> listOf(Item(entry.value))
                is PMMenuEntry.Checkbox -> listOf(Checkbox(entry.value))
                PMMenuEntry.Separator -> listOf(Separator)
                is PMMenuEntry.Label -> listOf(Label(entry.value.label))
                is PMMenuEntry.Submenu -> listOf(Label(entry.value.label)) +
                    if (entry.value.disabled == true) emptyList() else entry.value.items.map(::leaf)
            }
        }

        private fun leaf(entry: PMMenuLeafEntry): PMMenuRow = when (entry) {
            is PMMenuLeafEntry.Item -> Item(entry.value)
            is PMMenuLeafEntry.Checkbox -> Checkbox(entry.value)
            PMMenuLeafEntry.Separator -> Separator
            is PMMenuLeafEntry.Label -> Label(entry.value.label)
        }
    }
}

/**
 * Menu's panel: its rows `inset.list` inside the surface. Anchored, it is at
 * least two `space-10` steps wide and as wide as its widest row, on the
 * overlay surface (`pmOverlaySurface`), and scrolls inside it once it would be
 * taller than `maxHeight`, the window's height, which its presenter reads
 * outside the popup; in a sheet, it spans the sheet, scrolls under the sheet's
 * cap, and keeps its foot clear of the system bars. A
 * command runs its `onSelect` and closes the menu; a checkbox entry toggles
 * and leaves it open, because a filter list is ticked several entries at a
 * time. The rows arrive with the `menu.items` cascade.
 */
@Composable
fun PMMenuPanel(
    entries: List<PMMenuEntry>,
    sheet: Boolean,
    modifier: Modifier = Modifier,
    maxHeight: Dp = Dp.Unspecified,
    close: () -> Unit,
) {
    val theme = PM.theme
    val density = theme.defaultDensity
    val inset = density.inset.list.dp
    val frame = if (sheet) {
        Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(inset)
            .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Bottom))
    } else {
        Modifier
            .width(IntrinsicSize.Max)
            .widthIn(min = density.spacing.s10 * PMRecipe.menuMinWidth)
            .heightIn(max = maxHeight)
            .pmOverlaySurface(theme.colors.bgOverlay, theme.colors.borderSubtle)
            .verticalScroll(rememberScrollState())
            .padding(inset)
    }
    Column(modifier.then(frame)) {
        PMMenuRow.of(entries).forEachIndexed { index, row ->
            PMMenuRowView(row, index, close)
        }
    }
}

/**
 * Menu's panel where its member presents it: in the bottom sheet on a phone's
 * window, unless `anchored` keeps the popup there too, and otherwise anchored
 * to the composable it is placed in, `offset` below its foot on `align`'s
 * side, or at the point `at` inside it. `identity` is the open panel's member identity, with
 * `presentation=sheet` added while it is a sheet, the web's attribute contract.
 */
@Composable
fun PMMenuPresentation(
    open: Boolean,
    entries: List<PMMenuEntry>,
    anchored: Boolean,
    member: String,
    attributes: Map<String, String>,
    close: () -> Unit,
    align: PMAnchorAlign = PMAnchorAlign.Start,
    at: IntOffset? = null,
    offset: Dp = PMGeometry.anchorOffset,
) {
    val sheet = !anchored && pmCompactWindow()
    // Read here, in the window the menu opens from: inside the popup, the
    // window is the popup's own.
    val window = with(LocalDensity.current) { LocalWindowInfo.current.containerSize.height.toDp() }
    if (sheet) {
        if (open) {
            PMBottomSheet(onDismiss = close, modifier = Modifier.pmMember(member, pmInSheet(attributes))) {
                PMMenuPanel(entries, sheet = true, close = close)
            }
        }
    } else {
        PMAnchoredPanel(open = open, onDismiss = close, align = align, offset = offset, at = at) {
            PMMenuPanel(entries, sheet = false, modifier = Modifier.pmMember(member, attributes), maxHeight = window, close = close)
        }
    }
}

@Composable
private fun PMMenuRowView(row: PMMenuRow, index: Int, close: () -> Unit) {
    val theme = PM.theme
    val space = theme.defaultDensity.spacing
    val motion = theme.defaultMotion
    // The `menu.items` cascade: each row fades in on the enter easing over the
    // control duration, a stagger step after the one above it, the index
    // capped at twelve and the delay at the stagger's cap.
    val shown = remember { Animatable(if (motion.duration.control == 0) 1f else 0f) }
    LaunchedEffect(Unit) {
        shown.animateTo(
            1f,
            tween(
                durationMillis = motion.duration.control,
                delayMillis = minOf(minOf(index, CASCADE_CAP) * motion.stagger.step, motion.stagger.max),
                easing = motion.easing.enter.easing,
            ),
        )
    }
    val fade = Modifier.graphicsLayer { alpha = shown.value }
    when (row) {
        is PMMenuRow.Item -> {
            val item = row.item
            val disabled = item.disabled == true
            PMMenuRowChrome(
                danger = item.tone == PMMenuItemEntryTone.Danger,
                disabled = disabled,
                modifier = fade,
                gap = space.s3,
                interactive = { interaction ->
                    Modifier
                        .clickable(interactionSource = interaction, indication = null, enabled = !disabled) {
                            item.onSelect()
                            close()
                        }
                        // After the click, which gives the row its action and its
                        // disabled state: the clearing drops only what follows.
                        .clearAndSetSemantics {
                            contentDescription = item.label
                            role = Role.Button
                        }
                },
            ) { text, inherits ->
                item.icon?.let {
                    PMIconView(it, PMControlSize.Sm, tint = if (inherits) text else theme.colors.textMuted.color)
                }
                RowLabel(item.label, text)
                item.kbd?.let { kbd -> Box(Modifier.clearAndSetSemantics {}) { PMKbd(children = kbd) } }
            }
        }
        is PMMenuRow.Checkbox -> {
            val checkbox = row.checkbox
            val disabled = checkbox.disabled == true
            PMMenuRowChrome(
                danger = false,
                disabled = disabled,
                modifier = fade,
                gap = space.s2,
                interactive = { interaction ->
                    Modifier
                        .toggleable(
                            value = checkbox.checked,
                            interactionSource = interaction,
                            indication = null,
                            enabled = !disabled,
                            role = Role.Checkbox,
                        ) { checkbox.onCheckedChange(it) }
                        .clearAndSetSemantics { contentDescription = checkbox.label }
                },
            ) { text, _ ->
                // Select's check column: the glyph's width is reserved whether or
                // not the row is checked, so labels stay aligned as checks change.
                PMIconView(
                    PMIconRole.Confirm,
                    PMControlSize.Sm,
                    Modifier.graphicsLayer { alpha = if (checkbox.checked) 1f else 0f },
                    tint = if (disabled) text else theme.colors.accentText.color,
                )
                RowLabel(checkbox.label, text)
            }
        }
        PMMenuRow.Separator -> PMRule(
            theme.colors.borderSubtle,
            fade.padding(vertical = space.s2).clearAndSetSemantics {},
        )
        is PMMenuRow.Label -> Text(
            text = row.label.toUpperCase(LocaleList.current),
            style = theme.text.xs.textStyle,
            color = theme.colors.textMuted.color,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = fade
                .fillMaxWidth()
                .clearAndSetSemantics {
                    contentDescription = row.label
                    heading()
                }
                .padding(horizontal = space.s3, vertical = space.s2),
        )
    }
}

/** The index past which the cascade adds no more delay (`menu.md`). */
private const val CASCADE_CAP = 12

/** A row's label: one line, cut with an ellipsis, taking the row's free width. */
@Composable
private fun RowScope.RowLabel(label: String, color: Color) {
    Text(
        text = label,
        style = PM.theme.text.sm.textStyle,
        color = color,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier.weight(1f),
    )
}

/**
 * A row's recipe: `text.sm` in `text.primary` (`danger.text` for a danger
 * command), `space-3` across, `radius.sm`; highlighted, under the pointer or
 * with keyboard focus, the `accent.subtle` wash with `accent.text`
 * (`danger.subtle` with `danger.text`), the web's `data-highlighted`, and a
 * press a ripple of the same wash; disabled, `text.disabled` and no
 * highlight. On a touch screen a row is as tall as the hit target, the
 * platform's row height, and the highlight fills it; the recipe's small
 * control height is its least. `content` draws in the row's text colour, and
 * learns whether the icon takes it (`inherits`): while highlighted, on a
 * danger command and while disabled; at rest the icon is `text.muted`.
 */
@Composable
private fun PMMenuRowChrome(
    danger: Boolean,
    disabled: Boolean,
    modifier: Modifier,
    gap: Dp,
    interactive: (MutableInteractionSource) -> Modifier,
    content: @Composable RowScope.(text: Color, inherits: Boolean) -> Unit,
) {
    val theme = PM.theme
    val colors = theme.colors
    val density = theme.defaultDensity
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    val focused by interaction.collectIsFocusedAsState()
    val highlighted = !disabled && (hovered || focused)
    val text = when {
        disabled -> colors.textDisabled
        danger -> colors.dangerText
        highlighted -> colors.accentText
        else -> colors.textPrimary
    }.color
    val wash: PMDynamicColor = if (danger) colors.dangerSubtle else colors.accentSubtle
    val shape = theme.rounded(theme.radius.sm)
    Box(
        modifier
            .fillMaxWidth()
            .then(interactive(interaction))
            .heightIn(min = maxOf(density.controlHeight.sm, density.hitTarget).dp)
            .clip(shape)
            .background(if (highlighted) wash.color else Color.Transparent),
        contentAlignment = Alignment.CenterStart,
    ) {
        if (!disabled) PMPressLayer(interaction, wash.color, Modifier.matchParentSize())
        Row(
            modifier = Modifier.padding(horizontal = density.spacing.s3),
            horizontalArrangement = Arrangement.spacedBy(gap),
            verticalAlignment = Alignment.CenterVertically,
        ) { content(text, highlighted || danger || disabled) }
    }
}
