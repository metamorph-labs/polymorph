// Input (`design/components/input.md`): single-line text entry. A Compose
// `BasicTextField` inside the recipe's container: the decoration draws the
// surface, border and seat, the leading icon, the affixes, the clear button and
// the trailing slot sit beside the text, and every state is drawn on the
// container, as the web mirrors its states onto the root so the adornments take
// the same colours.
//
// Platform forms of the web's behaviour: a tap anywhere in the frame focuses
// the field; the focus ring is drawn while the field has focus; the field's
// name is on the part that holds its text (`pmFieldName`), where Material's
// text field draws its label, and never the editable node's own; `invalid` is
// the field's accessibility error, which TalkBack reads with it (the
// FormField's message, else "Invalid"), as `aria-invalid` is announced;
// `readOnly` is Compose's read-only text field, selectable but not editable;
// `type` chooses the keyboard and masks a password, and `autoComplete` is the
// autofill content type. A literal field's text is taken as typed: every type
// but text and search, and an `exact` field of any type, asks the keyboard for
// no correction; Compose asks for no capitals unless a field sets them, and
// draws no spelling marks. The phone's focus-zoom floor
// (`design/components/README.md`, "The focus-zoom floor") is a browser
// behaviour with no native counterpart.
//
// Not honoured, because Compose has no counterpart: `id`, `name` and the
// `aria-describedby`/`aria-labelledby` ids (a FormField names the field through
// `LocalPMField`); `ariaRequired`, which Android has no semantics for; `min`,
// `max` and `step`, which a text field does not step (NumberInput is the
// numeric member); and the opaque `controlRef`, `onSelect` and composition
// events, whose types the contract cannot express (`PMUnsupported.props`).

package dev.polymorph.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.contentType
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow

object PMInput : PMInputRendering {
    @Composable
    override fun Render(props: PMInputProps) {
        val theme = PM.theme
        val field = LocalPMField.current
        val strings = PMSpecDefault.strings
        val size = props.size ?: PMControlSize.Md
        val metrics = PMControlMetrics(size, theme)
        val disabled = (props.disabled ?: false) || !LocalPMEnabled.current
        val readOnly = props.readOnly ?: false
        val invalid = (props.invalid ?: false) || (field?.invalid ?: false)
        val type = props.type ?: PMInputType.Text
        val colors = theme.colors
        val motion = theme.defaultMotion

        var draft by remember { mutableStateOf(props.defaultValue ?: "") }
        val value = props.value ?: draft
        val set: (String) -> Unit = { next ->
            val kept = props.maxLength?.let { next.take(it.toInt()) } ?: next
            draft = kept
            props.onChange?.invoke(kept)
        }
        val interaction = remember { MutableInteractionSource() }
        val focused by interaction.collectIsFocusedAsState()
        val hovered by interaction.collectIsHoveredAsState()
        val focus = remember { FocusRequester() }
        var wasFocused by remember { mutableStateOf(false) }

        val report = LocalPMFieldReport.current
        SideEffect { report?.invoke(PMFieldControl(disabled = disabled)) }
        // Return in a field submits the form it is in, as Enter does in the web's `<form>`.
        val submit = LocalPMSubmitAction.current
        LaunchedEffect(Unit) { if (props.autoFocus == true && !disabled) focus.requestFocus() }

        // An uneditable value cannot be cleared (input.md, the clear button's hidden row).
        val showClear = (props.clearable ?: false) && value.isNotEmpty() && !disabled && !readOnly
        val textColor = when {
            disabled -> colors.textDisabled
            readOnly -> colors.textSecondary
            else -> colors.textPrimary
        }.color
        val adornment = (if (disabled) colors.textDisabled else colors.textMuted).color
        val iconColor = when {
            disabled -> colors.textDisabled
            invalid -> colors.dangerText
            else -> colors.textMuted
        }.color
        // The name the field is spoken by: its own `ariaLabel`, else its
        // FormField's label, else the placeholder.
        val name = props.ariaLabel ?: field?.label ?: props.placeholder
        val attributes = buildMap {
            put("size", size.value)
            if (invalid) put("invalid", "true")
            if (disabled) put("disabled", "true")
            if (readOnly) put("readonly", "true")
        }
        val autofill = contentTypeOf(props.autoComplete, type)
        // The text with its selection and composition, as the string form of
        // `BasicTextField` keeps it, so a field whose text is selected on focus
        // (`LocalPMFieldSelectsAll`, InlineEdit's) can set the selection.
        val selectsAll = LocalPMFieldSelectsAll.current
        var editing by remember { mutableStateOf(TextFieldValue(value)) }
        val shown = if (editing.text == value) editing else editing.copy(text = value, composition = null)

        BasicTextField(
            value = shown,
            onValueChange = { next ->
                editing = next
                if (next.text != value) set(next.text)
            },
            modifier = Modifier
                .pmMember("Input", attributes)
                .semantics {
                    if (invalid) error(field?.error ?: strings.invalid)
                    autofill?.let { contentType = it }
                }
                .fillMaxWidth()
                .pmHitTarget()
                .hoverable(interaction)
                .focusRequester(focus)
                .onFocusChanged { state ->
                    if (state.isFocused != wasFocused) {
                        wasFocused = state.isFocused
                        if (state.isFocused && selectsAll) editing = shown.copy(selection = TextRange(0, value.length))
                        if (state.isFocused) props.onFocus?.invoke() else props.onBlur?.invoke()
                    }
                },
            enabled = !disabled,
            readOnly = readOnly,
            textStyle = metrics.text.textStyle.copy(color = textColor),
            keyboardOptions = keyboard(type, submits = submit != null, exact = props.exact ?: false),
            // Compose hides the keyboard on Done only for a field with no
            // handler, so a field with nothing to submit runs that default,
            // and so does Search, the key a search field offers.
            keyboardActions = KeyboardActions(
                onDone = { if (submit != null) submit() else defaultKeyboardAction(ImeAction.Done) },
                onSearch = { if (submit != null) submit() else defaultKeyboardAction(ImeAction.Done) },
            ),
            singleLine = true,
            visualTransformation = if (type == PMInputType.Password) PasswordVisualTransformation() else VisualTransformation.None,
            interactionSource = interaction,
            cursorBrush = SolidColor(colors.accentText.color),
            decorationBox = { text ->
                Row(
                    modifier = Modifier
                        .pmFieldBox(invalid = invalid, disabled = disabled, readOnly = readOnly, focused = focused, hovered = hovered)
                        .heightIn(min = metrics.height)
                        .padding(horizontal = metrics.padding),
                    horizontalArrangement = Arrangement.spacedBy(metrics.gap),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    props.icon?.let { PMIconView(it, size, tint = iconColor) }
                    props.prefix?.let { Affix(it, metrics.text, adornment) }
                    Box(Modifier.weight(1f).pmFieldName(name), contentAlignment = Alignment.CenterStart) {
                        if (value.isEmpty()) {
                            props.placeholder?.let {
                                Text(
                                    text = it,
                                    style = metrics.text.textStyle,
                                    color = colors.textMuted.color,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.semantics { hideFromAccessibility() },
                                )
                            }
                        }
                        text()
                    }
                    props.suffix?.let { Affix(it, metrics.text, adornment) }
                    // The clear button fades in over the control duration (the `input.clear` binding).
                    AnimatedVisibility(
                        visible = showClear,
                        enter = fadeIn(motion.easing.enter.tween(motion.duration.control)),
                        exit = fadeOut(motion.easing.exit.tween(motion.duration.controlExit)),
                    ) {
                        PMEmbeddedButton(PMIconRole.Clear, props.clearLabel ?: strings.clear, size, onClick = {
                            set("")
                            focus.requestFocus()
                        })
                    }
                    props.trailing?.invoke()
                }
            },
        )
    }

    /** A prefix or suffix: adornment strength, never part of the value, and not spoken. */
    @Composable
    private fun Affix(text: String, step: dev.polymorph.tokens.PMTextStyle, color: Color) {
        Text(
            text = text,
            style = step.textStyle,
            color = color,
            maxLines = 1,
            softWrap = false,
            modifier = Modifier.semantics { hideFromAccessibility() },
        )
    }

    /**
     * The keyboard a field's type asks for: a literal field, every type but
     * text and search and an [exact] field of any type, is not corrected, and
     * a field in a form offers to submit it.
     */
    private fun keyboard(type: PMInputType, submits: Boolean, exact: Boolean): KeyboardOptions {
        val taken = exact || (type != PMInputType.Text && type != PMInputType.Search)
        return KeyboardOptions(
            autoCorrectEnabled = !taken,
            keyboardType = when (type) {
                PMInputType.Email -> KeyboardType.Email
                PMInputType.Url -> KeyboardType.Uri
                PMInputType.Tel -> KeyboardType.Phone
                PMInputType.Number -> KeyboardType.Decimal
                PMInputType.Password -> KeyboardType.Password
                PMInputType.Search, PMInputType.Text -> KeyboardType.Text
            },
            imeAction = when {
                type == PMInputType.Search -> ImeAction.Search
                submits -> ImeAction.Done
                else -> ImeAction.Default
            },
        )
    }

    /**
     * The HTML `autocomplete` token as an autofill content type, or the one the
     * field's type implies; `off` asks for none.
     */
    private fun contentTypeOf(autoComplete: String?, type: PMInputType): ContentType? = when (autoComplete) {
        "off" -> null
        "username" -> ContentType.Username
        "current-password" -> ContentType.Password
        "new-password" -> ContentType.NewPassword
        "one-time-code" -> ContentType.SmsOtpCode
        "email" -> ContentType.EmailAddress
        "name" -> ContentType.PersonFullName
        "tel" -> ContentType.PhoneNumber
        "tel-national" -> ContentType.PhoneNumberNational
        else -> when (type) {
            PMInputType.Email -> ContentType.EmailAddress
            PMInputType.Tel -> ContentType.PhoneNumber
            PMInputType.Password -> ContentType.Password
            else -> null
        }
    }
}

/** Input's states, from the spec's States table. */
object InputStates : PMStates {
    override val member = "Input"

    private const val subject = "urgent: login loop"
    private const val search = "Search"
    private const val searching = "Search…"

    override val entries: List<PMStateEntry>
        get() = PMControlSize.entries.map { size ->
            PMStateEntry("size ${size.value}", expect = mapOf("size" to size.value)) {
                PMInput(ariaLabel = search, placeholder = searching, size = size)
            }
        } + listOf(
            PMStateEntry("leading icon", expect = mapOf("size" to "md")) {
                PMInput(ariaLabel = search, icon = PMIconRole.Search, placeholder = searching)
            },
            PMStateEntry("with value") { PMInput(ariaLabel = "Subject", defaultValue = subject) },
            PMStateEntry("clearable, with value") {
                PMInput(ariaLabel = "Subject", clearable = true, defaultValue = subject)
            },
            PMStateEntry(
                "clearable, suppressed — an uneditable value offers no clear",
                expect = mapOf("readonly" to "true"),
            ) { PMInput(ariaLabel = "Subject", clearable = true, defaultValue = subject, readOnly = true) },
            PMStateEntry("clearable, empty — no clear button") {
                PMInput(ariaLabel = "Subject", clearable = true, placeholder = "Nothing to clear")
            },
            PMStateEntry("number — the decimal keyboard") {
                PMInput(ariaLabel = "Retries", max = 10.0, min = 0.0, step = 2.0, type = PMInputType.Number)
            },
            PMStateEntry("password — a masked field") {
                PMInput(
                    ariaLabel = "Password",
                    autoComplete = "current-password",
                    defaultValue = "hunter2",
                    type = PMInputType.Password,
                )
            },
            PMStateEntry("affixes — a currency mark and a unit, muted beside the value") {
                PMInput(ariaLabel = "Amount", defaultValue = "120", prefix = "$", suffix = "USD")
            },
            PMStateEntry("trailing slot") {
                PMInput(ariaLabel = "Workspace", defaultValue = "relay", trailing = { PMBadge(children = "Beta") })
            },
            PMStateEntry("invalid", expect = mapOf("invalid" to "true")) {
                PMInput(ariaLabel = "Query", defaultValue = "???", icon = PMIconRole.Search, invalid = true)
            },
            PMStateEntry("disabled", expect = mapOf("disabled" to "true")) {
                PMInput(ariaLabel = "Locked", defaultValue = "locked", disabled = true)
            },
            PMStateEntry("readOnly", expect = mapOf("readonly" to "true")) {
                PMInput(ariaLabel = "Read only", defaultValue = "read only", readOnly = true)
            },
        )
}
