// PromptInput (`design/components/prompt-input.md`): the chat composer, where
// a prompt is written, files are attached, and the prompt is sent or the reply
// stopped. A Textarea with one job: the page's only field, which always grows
// with its content, and a toolbar no form has.
//
// Input's split, one level up: the frame draws the surface, border, seat and
// ring, and the field inside it is transparent, so the chips, the field and
// the toolbar sit inside one edge and the ring goes round the whole composer.
// The frame is a column `space.2` apart inside `space.3`, `bg.surface` inside a
// `border.field` hairline at `radius.surface` with the seat; under the pointer
// the border is `border.strong`; while the field has focus it is
// `border.focus.solid` with the focus ring and the focus glow; while files are
// dragged over it, FileUpload's zone (`accent.subtle`, `accent.bg`, the focus
// glow); disabled, `bg.subtle` inside `border.subtle` with no seat. A composer
// is disabled by `disabled` or by a container that disables it
// (`LocalPMEnabled`), as ConversationPage does while its thread loads. The
// colours change over the control duration (`stateFeedback`).
//
// The field is a `BasicTextField` at `text.md` in `text.primary`, padded
// `space.1` by `space.2`, at least the hit target tall with its first line at
// the top, the Android measure `prompt-input.md` records. It is named by
// `label` on the part that holds its text (`pmFieldName`), because a composer
// has no visible label, and its placeholder is in `text.muted`. It grows from
// one line to `maxRows` lines (8 by default), then scrolls: Textarea's
// autosize, always on. A hardware
// keyboard's Enter sends and Shift-Enter starts a line; while a reply streams,
// or while the composer is empty, Enter does nothing. The software keyboard's
// Enter starts a line, as it does in an Android composer, and the send control
// sends. A sent prompt clears the field unless `value` is controlled, which the
// app clears itself.
//
// The toolbar is a wrapping row `space.2` apart: the attach control when
// `onAttach` is set and the app provides a file picker, without which it
// would open nothing (Button `ghost/neutral/sm`, icon-only `attach`, named by
// `messages.attach`), the app's `leading` slot, and at the end the app's
// `trailing` slot and the one primary control: send (`solid/accent/sm`,
// icon-only `send`, disabled while the composer is empty or disabled), which is
// stop (`outline/neutral/sm`, icon-only `stop`, calling `onStop`) exactly while
// `streaming`. The swap is a re-render, never a crossfade. The chips are
// AttachmentChips in a wrapping row `space.2` apart, named by
// `messages.remove` and `messages.uploading`; they come and go by re-render.
// The hint is one line under the frame, `text.xs` in `text.muted`, inset
// `space.3`.
//
// Files arrive two ways, each through FileUpload's gate (`PMFileGate`:
// `accept`, `maxSize`, `multiple`), the files that pass going to `onAttach` and
// the refused, with their reasons, to `onReject`: the attach control opens the
// app's file picker (`LocalPMFilePicker`, because the platform's document
// picker is an activity's), and a drop on the frame, which the same picker
// reads. A paste of files is not taken: Compose's text field offers no paste
// of files; pasted text keeps its default behaviour. `id` and `name` name
// nothing in Compose. `triggers` draws no suggestion list, as the SwiftUI
// rendering draws none, so an `@` or a `/` stays text in the prompt
// (`packages/native/src/undrawn.ts`).

package dev.polymorph.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.draganddrop.dragAndDropTarget
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isShiftPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.unit.dp
import dev.polymorph.tokens.PMShadow

object PMPromptInput : PMPromptInputRendering {
    @Composable
    override fun Render(props: PMPromptInputProps) {
        val theme = PM.theme
        val colors = theme.colors
        val space = theme.defaultDensity.spacing
        val motion = theme.defaultMotion
        val strings = PMSpecDefault.strings
        val messages = props.messages ?: strings.promptInputMessages
        val disabled = (props.disabled ?: false) || !LocalPMEnabled.current
        val streaming = props.streaming ?: false
        val maxRows = props.maxRows?.value ?: DEFAULT_ROWS
        val attachments = props.attachments ?: emptyList()
        val picker = LocalPMFilePicker.current

        var draft by remember { mutableStateOf(props.defaultValue ?: EMPTY) }
        val value = props.value ?: draft
        val empty = value.isBlank() && attachments.isEmpty()
        val set: (String) -> Unit = { next ->
            draft = next
            props.onChange?.invoke(next)
        }
        val send = {
            if (!empty && !disabled && !streaming) {
                props.onSubmit(value)
                if (props.value == null) draft = EMPTY
            }
        }
        val receive: (List<PMFile>) -> Unit = { chosen ->
            val (accepted, rejected) = PMFileGate.gate(chosen, props.accept, props.multiple ?: true, props.maxSize)
            if (accepted.isNotEmpty()) props.onAttach?.invoke(accepted)
            if (rejected.isNotEmpty()) props.onReject?.invoke(rejected)
        }

        val interaction = remember { MutableInteractionSource() }
        val focused by interaction.collectIsFocusedAsState()
        val frame = remember { MutableInteractionSource() }
        val hovered by frame.collectIsHoveredAsState()
        var targeted by remember { mutableStateOf(false) }
        val focus = remember { FocusRequester() }
        LaunchedEffect(Unit) { if (props.autoFocus == true && !disabled) focus.requestFocus() }

        val spec = motion.easing.standard.tween<Color>(motion.duration.control)
        val fill by animateColorAsState(
            when {
                disabled -> colors.bgSubtle
                targeted -> colors.accentSubtle
                else -> colors.bgSurface
            }.color,
            spec,
            label = "frame",
        )
        val border by animateColorAsState(
            when {
                disabled -> colors.borderSubtle
                targeted -> colors.accentBg
                focused -> colors.borderFocusSolid
                hovered -> colors.borderStrong
                else -> colors.borderField
            }.color,
            spec,
            label = "border",
        )
        val shape = theme.rounded(theme.radius.surface)
        val glow = theme.glow.focus.resolve(PM.dark)
        val shadow = when {
            disabled -> PMShadow(emptyList())
            focused || targeted -> glow
            else -> theme.shadows.seat
        }
        val attributes = buildMap {
            when {
                streaming -> put("state", "streaming")
                targeted -> put("state", "dragover")
            }
            if (disabled) put("disabled", "true")
            if (empty) put("empty", "true")
            put("max-rows", maxRows.toString())
        }
        val drop = rememberPMDropTarget(picker, onTargeted = { targeted = it }, receive = receive)

        Column(
            Modifier.pmMember("PromptInput", attributes).fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(space.s2),
        ) {
            Column(
                Modifier
                    .fillMaxWidth()
                    .dragAndDropTarget(shouldStartDragAndDrop = { !disabled && picker != null && props.onAttach != null }, target = drop)
                    .hoverable(frame)
                    .pmFocusRing(focused && !disabled, theme.radius.surface.dp)
                    .pmShadow(shadow, shape)
                    .background(fill, shape)
                    .border(PMGeometry.hairline, border, shape)
                    .padding(space.s3),
                verticalArrangement = Arrangement.spacedBy(space.s2),
            ) {
                if (attachments.isNotEmpty()) {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(space.s2), verticalArrangement = Arrangement.spacedBy(space.s2)) {
                        for (attachment in attachments) {
                            PMAttachmentChip(
                                message = attachment.message,
                                name = attachment.name,
                                onRemove = props.onRemoveAttachment?.let { remove -> { remove(attachment.id) } },
                                removeLabel = messages.remove(attachment.name),
                                size = attachment.size,
                                status = attachment.status,
                                uploadingLabel = messages.uploading(attachment.name),
                            )
                        }
                    }
                }
                Field(props, value, set, send, disabled, maxRows, interaction, focus)
                Toolbar(
                    props,
                    messages,
                    disabled,
                    streaming,
                    empty,
                    send,
                    attach = picker?.let { chooser -> { chooser.pick(props.accept, props.multiple ?: true, receive) } },
                )
            }
            props.hint?.let {
                Text(it, style = theme.text.xs.textStyle, color = colors.textMuted.color, modifier = Modifier.padding(horizontal = space.s3))
            }
        }
    }

    /** The field: transparent, growing from one line to `maxRows`, Enter sending from a hardware keyboard. */
    @Composable
    private fun Field(
        props: PMPromptInputProps,
        value: String,
        set: (String) -> Unit,
        send: () -> Unit,
        disabled: Boolean,
        maxRows: Int,
        interaction: MutableInteractionSource,
        focus: FocusRequester,
    ) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val step = theme.text.md.textStyle
        BasicTextField(
            value = value,
            onValueChange = set,
            modifier = Modifier
                .fillMaxWidth()
                .focusRequester(focus)
                .onPreviewKeyEvent { event ->
                    if (event.type == KeyEventType.KeyDown && event.key == Key.Enter && !event.isShiftPressed) {
                        send()
                        true
                    } else {
                        false
                    }
                },
            enabled = !disabled,
            textStyle = step.copy(color = (if (disabled) theme.colors.textDisabled else theme.colors.textPrimary).color),
            singleLine = false,
            minLines = 1,
            maxLines = maxRows,
            interactionSource = interaction,
            cursorBrush = SolidColor(theme.colors.accentText.color),
            decorationBox = { text ->
                // At least the hit target tall, its first line at the top: the
                // frame's padding is less than half the hit target, so a single
                // line's touch area would otherwise reach past the frame. The
                // area is the text field's own node, which this box sizes.
                Box(
                    Modifier
                        .fillMaxWidth()
                        .pmHitTarget(horizontal = false, alignment = Alignment.TopStart)
                        .pmFieldName(props.label)
                        .padding(horizontal = space.s2, vertical = space.s1),
                ) {
                    if (value.isEmpty()) props.placeholder?.let { PMFieldPlaceholder(it, step, singleLine = false) }
                    text()
                }
            },
        )
    }

    /** The toolbar: attach and the app's leading slot at the start; the app's trailing slot and send or stop at the end. */
    @Composable
    private fun Toolbar(
        props: PMPromptInputProps,
        messages: PMPromptInputMessages,
        disabled: Boolean,
        streaming: Boolean,
        empty: Boolean,
        send: () -> Unit,
        attach: (() -> Unit)?,
    ) {
        val space = PM.theme.defaultDensity.spacing
        PMInline(gap = PMSpaceStep.S2, justify = PMInlineJustify.Between, wrap = true) {
            Row(horizontalArrangement = Arrangement.spacedBy(space.s2), verticalAlignment = Alignment.CenterVertically) {
                if (props.onAttach != null && attach != null) {
                    PMButton(
                        disabled = disabled,
                        icon = PMIconRole.Attach,
                        iconOnly = true,
                        label = messages.attach,
                        onClick = attach,
                        size = PMControlSize.Sm,
                        appearance = PMButtonAppearance.GhostNeutral,
                    )
                }
                props.leading?.invoke()
            }
            Row(horizontalArrangement = Arrangement.spacedBy(space.s2), verticalAlignment = Alignment.CenterVertically) {
                props.trailing?.invoke()
                if (streaming) {
                    PMButton(
                        icon = PMIconRole.Stop,
                        iconOnly = true,
                        label = messages.stop,
                        onClick = props.onStop,
                        size = PMControlSize.Sm,
                        appearance = PMButtonAppearance.OutlineNeutral,
                    )
                } else {
                    PMButton(
                        disabled = empty || disabled,
                        icon = PMIconRole.Send,
                        iconOnly = true,
                        label = messages.send,
                        onClick = send,
                        size = PMControlSize.Sm,
                    )
                }
            }
        }
    }

    /** `maxRows`' default (`prompt-input.md`). */
    private const val DEFAULT_ROWS = 8

    private const val EMPTY = ""
}

/** PromptInput's states, from the spec's States table. */
object PromptInputStates : PMStates {
    override val member = "PromptInput"

    private const val label = "Message Relay"
    private const val placeholder = "Ask about a ticket…"
    private const val prompt = "Why did the webhook retry twice last night?"
    private const val grown = "Line one of the question\nLine two adds the context\nLine three names the endpoint\n" +
        "Line four gives the time\nLine five asks for the fix"

    private val chips = listOf(
        PMPromptAttachment(id = "log", name = "webhook-log.txt", size = 18_432.0),
        PMPromptAttachment(id = "csv", name = "deliveries.csv", size = 204_800.0, status = PMAttachmentStatus.Uploading),
    )

    /** An app's file picker, which the attach control needs; here it chooses nothing. */
    private val picker = object : PMFilePicker {
        override fun pick(accept: String?, multiple: Boolean, deliver: (List<PMFile>) -> Unit) {}
    }
    private val models = listOf(
        PMSelectOptionEntry.Option(PMSelectOption(value = "fast", label = "Fast")),
        PMSelectOptionEntry.Option(PMSelectOption(value = "deep", label = "Deep")),
    )

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("empty", expect = mapOf("empty" to "true", "contains" to "Button")) {
                PMPromptInput(label = label, onSubmit = {}, placeholder = placeholder)
            },
            PMStateEntry("with a prompt", expect = mapOf("max-rows" to "8")) {
                PMPromptInput(defaultValue = prompt, label = label, onSubmit = {}, placeholder = placeholder)
            },
            PMStateEntry("grown — five lines at maxRows 4", expect = mapOf("max-rows" to "4")) {
                PMPromptInput(defaultValue = grown, label = label, maxRows = PMPromptInputMaxRows.MaxRows4, onSubmit = {})
            },
            PMStateEntry("attachable — the attach control and the chips", expect = mapOf("contains" to "AttachmentChip")) {
                CompositionLocalProvider(LocalPMFilePicker provides picker) {
                    PMPromptInput(
                        attachments = chips,
                        label = label,
                        onAttach = {},
                        onReject = {},
                        onRemoveAttachment = {},
                        onSubmit = {},
                        placeholder = placeholder,
                    )
                }
            },
            PMStateEntry("the app's slots — a Select leading, a hint", expect = mapOf("contains" to "Select")) {
                PMPromptInput(
                    hint = "Relay can make mistakes. Check what it changes.",
                    label = label,
                    leading = { PMSelect(ariaLabel = "Model", defaultValue = PMSome("fast"), options = models, size = PMControlSize.Sm) },
                    onSubmit = {},
                    placeholder = placeholder,
                )
            },
            PMStateEntry("streaming — the stop face", expect = mapOf("state" to "streaming")) {
                PMPromptInput(defaultValue = prompt, label = label, onStop = {}, onSubmit = {}, streaming = true)
            },
            PMStateEntry("disabled", expect = mapOf("disabled" to "true")) {
                PMPromptInput(disabled = true, label = label, onSubmit = {}, placeholder = placeholder)
            },
        )
}
