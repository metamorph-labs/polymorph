// FileUpload (`design/components/file-upload.md`): a dropzone and the list of
// files with their upload states. The dropzone is one button, the system's
// only dashed border, `border.strong` around `bg.subtle` at `radius.lg`,
// `space-6` inside: the `upload` glyph (`lg`, muted), the title in `text.sm`
// and the hint in `text.xs` `text.muted`, centred. A press opens the platform's
// document picker, which the app provides (`LocalPMFilePicker`, because the
// picker is an activity's); files dropped on it, on a tablet or a Chromebook,
// arrive through the same picker's reading of the drop. Under the pointer it
// is `bg.surface` with an `accent.bg` border; while a drop hovers it is the
// accent wash with the focus glow and the glyph in `accent.text`; disabled it
// is dimmed and takes nothing; invalid draws its border in `danger.border`.
// Keyboard focus draws the focus ring. To TalkBack the dropzone is a button
// named by `ariaLabel`, its FormField's label or the title, then the hint.
//
// Every file passes one gate, whichever way it came (`PMFileGate`): `accept`
// (extensions, media types and wildcards), then `maxSize`, then `multiple`,
// which keeps the first file that passes. The files that pass go to
// `onFilesAdd`; the refused ones go to `onReject` with why, and the app turns
// each into an error row in its own words, so no file is dropped in silence.
//
// The rows are the app's `files`, `space-2` apart under the zone: the
// `document` glyph, the name in `text.sm`, cut in the middle, with its size in
// `text.xs` `text.muted` (`messages.formatSize`, binary units by default), and
// by status a Progress with the percentage while uploading, the `success`
// glyph in `success.text` when done, or the app's message in `danger.text`, a
// `danger.border` row and a retry button (when `onRetry` is set) on an error;
// every row ends with its remove button. A row that finishes or fails is
// announced politely (`messages.announcement`). Without an app's picker, a
// press opens nothing. `name` and the `aria-*by` ids have no Compose
// counterpart.

package dev.polymorph.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.draganddrop.dragAndDropTarget
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.polymorph.tokens.PMShadow
import kotlin.math.roundToInt

object PMFileUpload : PMFileUploadRendering {
    @Composable
    override fun Render(props: PMFileUploadProps) {
        val theme = PM.theme
        val field = LocalPMField.current
        val strings = PMSpecDefault.strings
        val disabled = (props.disabled ?: false) || !LocalPMEnabled.current
        val invalid = (props.invalid ?: false) || (field?.invalid ?: false)
        val files = props.files ?: emptyList()
        val picker = LocalPMFilePicker.current
        var targeted by remember { mutableStateOf(false) }
        val receive: (List<PMFile>) -> Unit = { chosen ->
            val (accepted, rejected) = PMFileGate.gate(chosen, props.accept, props.multiple ?: true, props.maxSize)
            if (accepted.isNotEmpty()) props.onFilesAdd(accepted)
            if (rejected.isNotEmpty()) props.onReject(rejected)
        }
        val report = LocalPMFieldReport.current
        SideEffect { report?.invoke(PMFieldControl(disabled = disabled)) }

        // The polite announcement of the last row that finished or failed.
        val seen = remember { mutableStateMapOf<String, PMFileUploadStatus>() }
        var announcement by remember { mutableStateOf<String?>(null) }
        LaunchedEffect(files) {
            for (file in files) {
                val before = seen[file.id]
                if (before != null && before != file.status && file.status != PMFileUploadStatus.Uploading) {
                    announcement = props.messages?.announcement?.invoke(file) ?: when (file.status) {
                        PMFileUploadStatus.Done -> strings.fileUploadDone(file.name)
                        else -> file.message?.let { strings.fileUploadFailedWith(file.name, it) } ?: strings.fileUploadFailed(file.name)
                    }
                }
                seen[file.id] = file.status
            }
        }
        val attributes = buildMap {
            put("state", if (targeted) "dragover" else "idle")
            put("files", files.size.toString())
            if (disabled) put("disabled", "true")
            if (invalid) put("invalid", "true")
        }
        val drop = rememberPMDropTarget(picker, onTargeted = { targeted = it }, receive = receive)

        Box(Modifier.pmMember("FileUpload", attributes).fillMaxWidth()) {
            Column(
                Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(theme.defaultDensity.spacing.s3),
            ) {
                Dropzone(
                    name = props.ariaLabel ?: field?.label ?: props.title ?: strings.fileUploadTitle,
                    title = props.title ?: strings.fileUploadTitle,
                    hint = props.hint,
                    disabled = disabled,
                    invalid = invalid,
                    error = if (invalid) field?.error ?: strings.invalid else null,
                    targeted = targeted,
                    modifier = Modifier.dragAndDropTarget(shouldStartDragAndDrop = { !disabled && picker != null }, target = drop),
                ) { picker?.pick(props.accept, props.multiple ?: true, receive) }
                if (files.isNotEmpty()) {
                    Column(verticalArrangement = Arrangement.spacedBy(theme.defaultDensity.spacing.s2)) {
                        for (file in files) Row(file, props)
                    }
                }
            }
            // The last row that finished or failed, read politely: beside the
            // column, so it adds no gap to it.
            PMAnnouncement(announcement)
        }
    }

    /** The dropzone: one button, its surface by state, the dashed hairline around it. */
    @Composable
    private fun Dropzone(
        name: String,
        title: String,
        hint: String?,
        disabled: Boolean,
        invalid: Boolean,
        error: String?,
        targeted: Boolean,
        modifier: Modifier,
        open: () -> Unit,
    ) {
        val theme = PM.theme
        val colors = theme.colors
        val motion = theme.defaultMotion
        val space = theme.defaultDensity.spacing
        val interaction = remember { MutableInteractionSource() }
        val hovered by interaction.collectIsHoveredAsState()
        val pressed by interaction.collectIsPressedAsState()
        val focused by interaction.collectIsFocusedAsState()
        val active = !disabled && (hovered || pressed)
        val spec = motion.easing.standard.tween<Color>(motion.duration.control)
        val fill by animateColorAsState(
            when {
                disabled -> colors.bgSubtle
                targeted -> colors.accentSubtle
                active -> colors.bgSurface
                else -> colors.bgSubtle
            }.color,
            spec,
            label = "fill",
        )
        val edge by animateColorAsState(
            when {
                disabled -> colors.borderSubtle
                invalid -> colors.dangerBorder
                targeted || active -> colors.accentBg
                else -> colors.borderStrong
            }.color,
            spec,
            label = "edge",
        )
        val glyph = when {
            disabled -> colors.textDisabled
            targeted -> colors.accentText
            else -> colors.textMuted
        }.color
        val radius = theme.radius.lg.dp
        val shape = theme.rounded(theme.radius.lg)
        val hairline = PMGeometry.hairline
        Column(
            modifier = modifier
                .fillMaxWidth()
                .clickable(interactionSource = interaction, indication = null, enabled = !disabled, onClick = open)
                // The name, then the hint, which says what the dropzone takes,
                // as the web button's content reads its title and its hint.
                .clearAndSetSemantics {
                    contentDescription = listOfNotNull(name, hint).joinToString(", ")
                    role = Role.Button
                    error?.let { error(it) }
                }
                .pmFocusRing(focused && !disabled, radius)
                .pmShadow(if (targeted) theme.glow.focus.resolve(PM.dark) else PMShadow(emptyList()), shape)
                .background(fill, shape)
                // The dashed hairline: dashes two hairlines long, two apart, the web's `dashed`.
                .drawBehind {
                    val stroke = hairline.toPx()
                    val dash = stroke * 2
                    // Inside the box by half the stroke, so no edge of the line is cut.
                    drawRoundRect(
                        color = edge,
                        topLeft = Offset(stroke / 2, stroke / 2),
                        size = Size(size.width - stroke, size.height - stroke),
                        cornerRadius = CornerRadius(maxOf(0f, radius.toPx() - stroke / 2)),
                        style = Stroke(width = stroke, pathEffect = PathEffect.dashPathEffect(floatArrayOf(dash, dash))),
                    )
                }
                .padding(space.s6),
            verticalArrangement = Arrangement.spacedBy(space.s2),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            PMIconView(PMIconRole.Upload, PMControlSize.Lg, tint = glyph)
            Text(
                text = title,
                style = theme.text.sm.textStyle,
                color = (if (disabled) colors.textDisabled else colors.textPrimary).color,
                textAlign = TextAlign.Center,
            )
            hint?.let {
                Text(
                    text = it,
                    style = theme.text.xs.textStyle,
                    color = (if (disabled) colors.textDisabled else colors.textMuted).color,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }

    /** One file's row. */
    @Composable
    private fun Row(file: PMFileUploadItem, props: PMFileUploadProps) {
        val theme = PM.theme
        val colors = theme.colors
        val space = theme.defaultDensity.spacing
        val strings = PMSpecDefault.strings
        val messages = props.messages
        val failed = file.status == PMFileUploadStatus.Error
        val shape = theme.rounded(theme.radius.md)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .border(PMGeometry.hairline, (if (failed) colors.dangerBorder else colors.borderSubtle).color, shape)
                .padding(horizontal = space.s3, vertical = space.s2),
            horizontalArrangement = Arrangement.spacedBy(space.s3),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PMIconView(PMIconRole.Document, PMControlSize.Md, tint = colors.textMuted.color)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(space.s1)) {
                Text(
                    text = file.name,
                    style = theme.text.sm.textStyle,
                    color = colors.textPrimary.color,
                    maxLines = 1,
                    overflow = TextOverflow.MiddleEllipsis,
                )
                val message = file.message
                if (failed && message != null) {
                    Text(text = message, style = theme.text.xs.textStyle, color = colors.dangerText.color)
                } else {
                    file.size?.let { size ->
                        Text(
                            text = messages?.formatSize?.invoke(size) ?: PMByteCount.format(size),
                            style = theme.text.xs.textStyle,
                            color = colors.textMuted.color,
                        )
                    }
                }
            }
            when (file.status) {
                PMFileUploadStatus.Uploading -> {
                    val progress = (file.progress ?: 0.0).coerceIn(0.0, PERCENT)
                    Box(Modifier.width(space.s10)) {
                        PMProgress(label = messages?.progress?.invoke(file.name) ?: strings.fileUploadProgress(file.name), value = progress)
                    }
                    Text(
                        text = "${progress.roundToInt()}%",
                        style = theme.text.xs.textStyle.tabular(theme),
                        color = colors.textMuted.color,
                        modifier = Modifier.semantics { hideFromAccessibility() },
                    )
                }
                PMFileUploadStatus.Done -> PMIconView(PMIconRole.Success, PMControlSize.Md, tint = colors.successText.color)
                PMFileUploadStatus.Error -> props.onRetry?.let { retry ->
                    PMButton(
                        icon = PMIconRole.Refresh,
                        iconOnly = true,
                        label = messages?.retry ?: strings.fileUploadRetry,
                        onClick = { retry(file.id) },
                        size = PMControlSize.Sm,
                        appearance = PMButtonAppearance.GhostNeutral,
                    )
                }
            }
            PMButton(
                icon = PMIconRole.Close,
                iconOnly = true,
                label = messages?.remove?.invoke(file.name) ?: strings.fileUploadRemove(file.name),
                onClick = { props.onRemove(file.id) },
                size = PMControlSize.Sm,
                appearance = PMButtonAppearance.GhostNeutral,
            )
        }
    }

    /** A whole upload, in percent. */
    private const val PERCENT = 100.0
}

/** FileUpload's states, from the spec's States table. A drop hovers only while a person drags, so it has no entry. */
object FileUploadStates : PMStates {
    override val member = "FileUpload"

    private const val hint = "PDF or PNG, up to 10 MB"

    private val mixed = listOf(
        PMFileUploadItem(id = "1", name = "invoice-march.pdf", size = 482_304.0, status = PMFileUploadStatus.Uploading, progress = 40.0),
        PMFileUploadItem(id = "2", name = "receipt.png", size = 1_258_291.0, status = PMFileUploadStatus.Done),
        PMFileUploadItem(
            id = "3",
            name = "statement-2025-full-year.pdf",
            size = 24_117_248.0,
            status = PMFileUploadStatus.Error,
            message = "Over the 10 MB limit",
        ),
    )

    @Composable
    private fun Upload(files: List<PMFileUploadItem>, retry: Boolean = false, disabled: Boolean = false, invalid: Boolean = false) {
        PMFileUpload(
            accept = ".pdf,image/png",
            ariaLabel = "Attachments",
            disabled = disabled,
            files = files,
            hint = hint,
            invalid = invalid,
            maxSize = 10_485_760.0,
            onFilesAdd = {},
            onReject = {},
            onRemove = {},
            onRetry = if (retry) ({}) else null,
        )
    }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("idle", expect = mapOf("state" to "idle", "files" to "0")) { Upload(emptyList()) },
            PMStateEntry("uploading — one row at 40%", expect = mapOf("files" to "1", "contains" to "Progress")) { Upload(mixed.take(1)) },
            PMStateEntry("mixed list", expect = mapOf("files" to "3")) { Upload(mixed) },
            PMStateEntry("error with retry", expect = mapOf("files" to "1")) { Upload(mixed.drop(2), retry = true) },
            PMStateEntry("disabled", expect = mapOf("disabled" to "true")) { Upload(emptyList(), disabled = true) },
            PMStateEntry("invalid", expect = mapOf("invalid" to "true")) { Upload(emptyList(), invalid = true) },
        )
}
