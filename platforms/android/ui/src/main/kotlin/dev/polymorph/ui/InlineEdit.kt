// InlineEdit (`design/components/inline-edit.md`): a short value shown as
// text, with an edit control beside it, that becomes a field where it stands.
// It composes Input and three Buttons.
//
// Reading, it is the value in the size's text step (`text.xs` at `sm`,
// `text.sm` at `md`, `text.md` at `lg`), `text.primary`, or the placeholder in
// `text.muted`, its first line centred on the control height, wrapping rather
// than truncating; then the edit control, Button's ghost neutral icon-only
// `edit`, named by `messages.edit(label)`. TalkBack reads the value before
// the edit control; Compose has no relation that describes one node by
// another's text. `valueHidden` draws the edit control alone, because a
// heading beside the member draws the value. Open, it is a row of the Input,
// filling the row,
// Button's soft accent icon-only `confirm` (save) and ghost neutral icon-only
// `close` (cancel), `space-2` apart, and the app's `error` under it as
// FormField draws an error (`PMFieldErrorRow`). Both forms are one control
// height at the member's size, so a one-line value does not move what is
// below it.
//
// The edit control opens the field with the value in it, all of it selected
// (`LocalPMFieldSelectsAll`), and focus in it; a member that is composed open
// takes no focus. The keyboard's action key is
// Done, and Done, Enter and the save control save: an unchanged text closes
// the field and reports nothing, a blank text under `required` does nothing
// (save is disabled), and any other text is reported once through `onCommit`,
// as typed. An uncontrolled field then closes; a controlled one (`editing`)
// stays open until the app closes it. Escape and the cancel control close the
// field and report nothing. Leaving the field neither saves nor cancels.
// While `pending`, the field is Input's read-only field, which keeps its text
// and focus, save shows Button's loading, cancel is disabled and Escape does
// nothing. When the field closes and focus was in the member, focus goes to
// the edit control.
//
// The field is named by `label` and carries `error` as its accessibility
// error while it shows, through the field context Input reads from a
// FormField; `required` has no semantics on Android. The error is announced
// politely when it arrives (`PMAnnouncement`), as the web's live region does.
// The `aria-*by` ids have no Compose counterpart.

package dev.polymorph.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
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
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import dev.polymorph.tokens.PMTextStyle

object PMInlineEdit : PMInlineEditRendering {
    @Composable
    override fun Render(props: PMInlineEditProps) {
        val size = props.size ?: PMControlSize.Md
        val disabled = props.disabled ?: false
        var mirror by remember { mutableStateOf(props.defaultEditing ?: false) }
        val open = props.editing ?: mirror
        var draft by remember { mutableStateOf(props.value) }
        // Whether the field takes focus when it appears: when the reader opened it.
        var focusField by remember { mutableStateOf(false) }
        // Whether focus goes to the edit control when the field closes.
        var refocusEdit by remember { mutableStateOf(false) }
        var within by remember { mutableStateOf(false) }
        val edit = remember { FocusRequester() }
        var openedFor by remember { mutableStateOf(open) }
        if (open != openedFor) {
            openedFor = open
            if (open) draft = props.value
        }
        LaunchedEffect(open) {
            if (!open && (refocusEdit || within)) edit.requestFocus()
            refocusEdit = false
            if (!open) within = false
        }

        val setOpen = { next: Boolean ->
            mirror = next
            props.onEditingChange?.invoke(next)
        }
        val pending = props.pending ?: false
        val refused = (props.required ?: false) && draft.isBlank()
        val commit = commit@{
            if (pending || refused) return@commit
            refocusEdit = within
            if (draft == props.value) {
                setOpen(false)
                return@commit
            }
            props.onCommit(draft)
            if (props.editing == null) setOpen(false)
        }
        val cancel = cancel@{
            if (pending) return@cancel
            refocusEdit = true
            setOpen(false)
        }
        val attributes = buildMap {
            put("size", size.value)
            if (disabled) put("disabled", "true")
            if (open) put("editing", "true")
            if (props.valueHidden == true) put("value-hidden", "true")
        }

        Box(Modifier.pmMember("InlineEdit", attributes).fillMaxWidth()) {
            if (open) {
                Panel(props, size, disabled, draft, { draft = it }, focusField, { within = it }, commit, cancel)
            } else {
                Reading(props, size, disabled, edit) {
                    focusField = true
                    setOpen(true)
                }
            }
        }
    }

    /** The value, or the placeholder, and the edit control. */
    @Composable
    private fun Reading(props: PMInlineEditProps, size: PMControlSize, disabled: Boolean, edit: FocusRequester, open: () -> Unit) {
        val theme = PM.theme
        val metrics = PMControlMetrics(size, theme)
        val step = step(size)
        val empty = props.value.isEmpty()
        val messages = props.messages ?: PMSpecDefault.strings.inlineEditMessages
        Row(
            horizontalArrangement = Arrangement.spacedBy(theme.defaultDensity.spacing.s2),
            verticalAlignment = Alignment.Top,
        ) {
            if (props.valueHidden != true) {
                Text(
                    text = if (empty) props.placeholder.orEmpty() else props.value,
                    style = step.textStyle,
                    color = (if (empty) theme.colors.textMuted else theme.colors.textPrimary).color,
                    // The first line centred on the edit control, which
                    // reserves the hit target in the layout.
                    modifier = Modifier
                        .weight(1f, fill = false)
                        .padding(vertical = centringInset(maxOf(metrics.height.value, theme.defaultDensity.hitTarget), step.lineBox)),
                )
            }
            Box(Modifier.focusRequester(edit)) {
                PMButton(
                    appearance = PMButtonAppearance.GhostNeutral,
                    disabled = disabled,
                    icon = PMIconRole.Edit,
                    iconOnly = true,
                    label = messages.edit(props.label),
                    onClick = open,
                    size = size,
                )
            }
        }
    }

    /** The field, save and cancel, and the error under them. */
    @Composable
    private fun Panel(
        props: PMInlineEditProps,
        size: PMControlSize,
        disabled: Boolean,
        draft: String,
        type: (String) -> Unit,
        focus: Boolean,
        within: (Boolean) -> Unit,
        commit: () -> Unit,
        cancel: () -> Unit,
    ) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val pending = props.pending ?: false
        val error = props.error.orEmpty()
        val invalid = error.isNotEmpty()
        val refused = (props.required ?: false) && draft.isBlank()
        val messages = props.messages ?: PMSpecDefault.strings.inlineEditMessages
        Column(
            Modifier.onPreviewKeyEvent { event ->
                if (event.key == Key.Escape && event.type == KeyEventType.KeyDown) {
                    cancel()
                    true
                } else {
                    false
                }
            },
            verticalArrangement = Arrangement.spacedBy(space.s2),
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(space.s2),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.weight(1f)) {
                    CompositionLocalProvider(
                        LocalPMField provides PMFieldContext(
                            label = props.label,
                            error = if (invalid) error else null,
                            required = props.required ?: false,
                            invalid = invalid,
                        ),
                        LocalPMSubmitAction provides commit,
                        LocalPMFieldSelectsAll provides true,
                    ) {
                        PMInput(
                            autoFocus = focus,
                            disabled = disabled,
                            maxLength = props.maxLength,
                            onBlur = { within(false) },
                            onChange = type,
                            onFocus = { within(true) },
                            placeholder = props.placeholder,
                            readOnly = pending,
                            size = size,
                            value = draft,
                        )
                    }
                }
                PMButton(
                    appearance = PMButtonAppearance.SoftAccent,
                    disabled = disabled || refused,
                    icon = PMIconRole.Confirm,
                    iconOnly = true,
                    label = messages.save,
                    loading = pending,
                    onClick = commit,
                    size = size,
                )
                PMButton(
                    appearance = PMButtonAppearance.GhostNeutral,
                    disabled = disabled || pending,
                    icon = PMIconRole.Close,
                    iconOnly = true,
                    label = messages.cancel,
                    onClick = cancel,
                    size = size,
                )
            }
            Box {
                if (invalid) PMFieldErrorRow(error)
                PMAnnouncement(if (invalid) error else null)
            }
        }
    }

    /** The value's text step at each size (conventions §2). */
    @Composable
    private fun step(size: PMControlSize): PMTextStyle {
        val text = PM.theme.text
        return when (size) {
            PMControlSize.Sm -> text.xs
            PMControlSize.Md -> text.sm
            PMControlSize.Lg -> text.md
        }
    }
}

/** InlineEdit's states, from the spec's States table. */
object InlineEditStates : PMStates {
    override val member = "InlineEdit"

    private const val LABEL = "Project name"
    private const val VALUE = "Acme billing"

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("rest", expect = mapOf("size" to "md", "editing" to "")) {
                PMInlineEdit(label = LABEL, onCommit = {}, value = VALUE)
            },
            PMStateEntry("empty — the placeholder, muted", expect = mapOf("editing" to "")) {
                PMInlineEdit(label = LABEL, onCommit = {}, placeholder = "Name this project", value = "")
            },
            PMStateEntry("editing", expect = mapOf("editing" to "true", "contains" to "Input,Button")) {
                PMInlineEdit(defaultEditing = true, label = LABEL, onCommit = {}, value = VALUE)
            },
            PMStateEntry("pending — the field read-only, save busy, cancel disabled", expect = mapOf("editing" to "true", "contains" to "Input,Button")) {
                PMInlineEdit(defaultEditing = true, label = LABEL, onCommit = {}, pending = true, value = VALUE)
            },
            PMStateEntry("failed — the error under the field, tied to it", expect = mapOf("editing" to "true", "contains" to "Input")) {
                PMInlineEdit(defaultEditing = true, error = "A project with this name already exists.", label = LABEL, onCommit = {}, value = VALUE)
            },
            PMStateEntry("required, blank — save disabled", expect = mapOf("editing" to "true", "contains" to "Input,Button")) {
                PMInlineEdit(defaultEditing = true, label = LABEL, onCommit = {}, required = true, value = "")
            },
            PMStateEntry("disabled", expect = mapOf("disabled" to "true")) {
                PMInlineEdit(disabled = true, label = LABEL, onCommit = {}, value = VALUE)
            },
            PMStateEntry("size sm", expect = mapOf("size" to "sm")) {
                PMInlineEdit(label = LABEL, onCommit = {}, size = PMControlSize.Sm, value = VALUE)
            },
            PMStateEntry("size lg", expect = mapOf("size" to "lg")) {
                PMInlineEdit(label = LABEL, onCommit = {}, size = PMControlSize.Lg, value = VALUE)
            },
            PMStateEntry("long value — it wraps, and the field fills the width it is given") {
                PMInlineEdit(label = LABEL, onCommit = {}, value = "Acme billing reconciliation for the northern region, second quarter")
            },
            PMStateEntry("value hidden — the edit control alone", expect = mapOf("value-hidden" to "true")) {
                PMInlineEdit(label = LABEL, onCommit = {}, size = PMControlSize.Lg, value = VALUE, valueHidden = true)
            },
        )
}
