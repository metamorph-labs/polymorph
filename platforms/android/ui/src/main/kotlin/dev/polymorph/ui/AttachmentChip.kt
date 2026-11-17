// AttachmentChip (`design/components/attachment-chip.md`): a file attached to
// a prompt, as a chip: in the composer, where it can still be removed, and in
// a sent message, where it cannot. The app owns the upload: the chip draws
// `status` and `message` as given and asks for removal through `onRemove`.
//
// One line at least `control.height.sm` tall: the mark (the `sm` glyph in
// `text.muted`, `document` by default; Spinner `sm` while uploading, named
// "{name}: uploading"; `error` in `danger.text` on a failure), the name
// (`text.sm`, primary, secondary while uploading), the size (`text.xs`, muted,
// binary steps as FileUpload's rows read it, `PMByteCount`) or, on a failure,
// the app's message in `danger.text`, then the remove control, Button
// `ghost/neutral/sm` icon-only `close`, named "Remove {name}". The surface is
// `bg.surface` inside a `border.subtle` hairline (`danger.border` on a
// failure, over the control duration) at `radius.control`, padded `space.1`
// and `space.3`, `space.2` before the control. A long name is shortened in the
// middle, so its extension stays in view; the control stays reachable. The
// chip is as wide as its content, up to the width it is offered.
//
// With `href` the name is a link to the file in Link's inline recipe
// (`accent.text`, underlined), which opens through the composition's
// `LocalUriHandler`; the name and the size are then one node, which a reader
// activates to open the file. The chip reserves the hit target's height
// around its surface (`pmHitTarget`), so the link's touch area, the hit
// target tall on the chip's middle, is the chip's own. The remove control
// keeps its drawn size in the surface, so the surface is the recipe's height
// with it or without it; its touch area, the hit target it reserves around
// itself, reaches past the surface's top, bottom and end, and the chip keeps
// that reach after its surface, as TagInput's chips do.

package dev.polymorph.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

object PMAttachmentChip : PMAttachmentChipRendering {
    @Composable
    override fun Render(props: PMAttachmentChipProps) {
        val theme = PM.theme
        val colors = theme.colors
        val space = theme.defaultDensity.spacing
        val motion = theme.defaultMotion
        val strings = PMSpecDefault.strings
        val status = props.status ?: PMAttachmentStatus.Done
        val failed = status == PMAttachmentStatus.Error
        val uploading = status == PMAttachmentStatus.Uploading
        val shape = theme.rounded(theme.radius.control)
        val border by animateColorAsState(
            (if (failed) colors.dangerBorder else colors.borderSubtle).color,
            motion.easing.standard.tween(motion.duration.control),
            label = "border",
        )
        val removable = props.onRemove != null
        // The remove control's drawn side, and how far its touch area reaches past the surface's end.
        val control = PMControlMetrics(PMControlSize.Sm, theme).height
        val reach = if (removable) ((theme.defaultDensity.hitTarget.dp - control) / 2 - space.s2).coerceAtLeast(0.dp) else 0.dp

        Row(
            Modifier
                .pmMember("AttachmentChip", mapOf("status" to status.value))
                .semantics { isTraversalGroup = true }
                .padding(end = reach)
                // The linked name's touch area, the hit target tall on the
                // chip's middle, and the remove control's stay inside the
                // chip's own room.
                .pmHitTarget(horizontal = false)
                .heightIn(min = theme.defaultDensity.controlHeight.sm.dp)
                .background(colors.bgSurface.color, shape)
                .border(PMGeometry.hairline, border, shape)
                .padding(start = space.s3, end = if (removable) space.s2 else space.s3, top = space.s1, bottom = space.s1),
            horizontalArrangement = Arrangement.spacedBy(space.s2),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            when {
                uploading -> PMSpinner(label = props.uploadingLabel ?: strings.attachmentUploading(props.name), size = PMControlSize.Sm)
                failed -> PMIconView(PMIconRole.Error, PMControlSize.Sm, tint = colors.dangerText.color)
                else -> PMIconView(props.icon ?: PMIconRole.Document, PMControlSize.Sm, tint = colors.textMuted.color)
            }
            Body(props, uploading, failed, Modifier.weight(1f, fill = false))
            props.onRemove?.let { remove ->
                Box(Modifier.drawnSquare(control)) {
                    PMButton(
                        icon = PMIconRole.Close,
                        iconOnly = true,
                        label = props.removeLabel ?: strings.attachmentRemove(props.name),
                        onClick = remove,
                        size = PMControlSize.Sm,
                        appearance = PMButtonAppearance.GhostNeutral,
                    )
                }
            }
        }
    }

    /**
     * Takes `side` square in the chip's row, the remove control's drawn size,
     * with the control's own layout centred on it: the hit target the control
     * reserves around itself reaches past that place rather than making the
     * surface taller and wider.
     */
    private fun Modifier.drawnSquare(side: Dp): Modifier = layout { measurable, constraints ->
        val placeable = measurable.measure(constraints.copy(minWidth = 0, minHeight = 0, maxHeight = Constraints.Infinity))
        val place = side.roundToPx()
        layout(place, place) { placeable.placeRelative((place - placeable.width) / 2, (place - placeable.height) / 2) }
    }

    /** The name, and beside it the size or the failure's message; with `href`, one link. */
    @Composable
    private fun Body(props: PMAttachmentChipProps, uploading: Boolean, failed: Boolean, modifier: Modifier) {
        val theme = PM.theme
        val colors = theme.colors
        val space = theme.defaultDensity.spacing
        val uri = LocalUriHandler.current
        val href = props.href
        val interaction = remember { MutableInteractionSource() }
        val focused by interaction.collectIsFocusedAsState()
        val linked = if (href != null) {
            modifier
                .clickable(interactionSource = interaction, indication = null) { runCatching { uri.openUri(href) } }
                .pmFocusRing(focused, theme.radius.sm.dp)
        } else {
            modifier.semantics(mergeDescendants = true) {}
        }
        Row(
            linked,
            horizontalArrangement = Arrangement.spacedBy(space.s2),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = props.name,
                style = theme.text.sm.textStyle.copy(textDecoration = if (href != null) TextDecoration.Underline else null),
                color = when {
                    href != null -> colors.accentText
                    uploading -> colors.textSecondary
                    else -> colors.textPrimary
                }.color,
                maxLines = 1,
                softWrap = false,
                overflow = TextOverflow.MiddleEllipsis,
                modifier = Modifier.weight(1f, fill = false),
            )
            val message = props.message
            when {
                failed && message != null -> Text(message, style = theme.text.xs.textStyle, color = colors.dangerText.color)
                props.size != null -> Text(PMByteCount.format(props.size), style = theme.text.xs.textStyle, color = colors.textMuted.color, maxLines = 1)
            }
        }
    }
}

/** AttachmentChip's states, from the spec's States table. */
object AttachmentChipStates : PMStates {
    override val member = "AttachmentChip"

    private const val report = "quarterly-report.pdf"
    private const val long = "customer-escalations-export-2026-10-15-with-every-reply-and-internal-note.csv"
    private const val failure = "The file is larger than 25 MB."

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("removable", expect = mapOf("status" to "done", "contains" to "Button")) {
                PMAttachmentChip(name = report, onRemove = {}, size = 2_457_600.0)
            },
            PMStateEntry("sent — no remove control", expect = mapOf("status" to "done")) {
                PMAttachmentChip(name = report, size = 2_457_600.0)
            },
            PMStateEntry("openable — the name is a link", expect = mapOf("status" to "done")) {
                PMAttachmentChip(href = "https://files.example.com/quarterly-report.pdf", name = report, size = 2_457_600.0)
            },
            PMStateEntry("uploading", expect = mapOf("status" to "uploading", "contains" to "Spinner")) {
                PMAttachmentChip(name = report, onRemove = {}, size = 2_457_600.0, status = PMAttachmentStatus.Uploading)
            },
            PMStateEntry("error", expect = mapOf("status" to "error")) {
                PMAttachmentChip(message = failure, name = report, onRemove = {}, status = PMAttachmentStatus.Error)
            },
            PMStateEntry("a long name — shortened in the middle, the control reachable", expect = mapOf("status" to "done")) {
                PMAttachmentChip(icon = PMIconRole.Table, name = long, onRemove = {}, size = 81_920.0)
            },
        )
}
