// Combobox (`design/components/combobox.md`): one value chosen from a list by
// typing to filter it. It is the platform's own, the platform map's form:
// Material 3's exposed dropdown menu over an editable field, anchored to the
// field on phones too, as Select's menu is, so the web's sheet below 30rem
// does not apply and `presentation` changes nothing. The field is Input's
// text field in Input's container at Input's sizes: the text, or the muted
// placeholder, then the clear button when `clearable` and something is chosen,
// and the `expand` chevron, Input's embedded button named "Show options",
// which turns a half turn while the list is open, or, while `loading`, the
// spinning `loading` glyph in its place.
//
// Typing opens the list and filters it, ignoring case and the common Latin
// accents (`filter`: `contains` by default, `startsWith`, or `off` when the
// app has filtered); the list is unfiltered while the field shows the chosen
// option's label. The list is the menu surface Select draws (`bg.overlay`,
// `radius.surface`, a `border.subtle` hairline, `inset.list` across) with
// Select's rows, `space.1` apart (`PMOptionRow`): the check column with the
// chosen row's `confirm` glyph in `accent.text`, the label, the description
// as a second line in `text.xs` `text.muted`, a disabled option dimmed.
// Material's menu surface is a popup sized to its content, which clips a
// shadow drawn outside it, so the list has no `shadow-transient`: its hairline
// is its edge, at no Material elevation. The highlighted row, the keyboard's
// position, takes the accent wash and `accent.text`: while the person types
// it is the first enabled match, otherwise the chosen option. While `loading`
// the list ends in three Skeleton rows at a row's height, after the options
// when a page is loading; with nothing to show it is one line, `emptyMessage`
// ("No results"), in `text.sm` `text.muted`.
//
// Focus stays in the field, as the spec's focus boundary requires. Down opens
// the list and moves the highlight, up moves it back, Return chooses the
// highlighted option, and Escape closes the list and puts back the chosen
// option's label, or clears the text when nothing is chosen. The keyboard's
// action key does what Return does, closes the list and hides the keyboard. Choosing an
// option reports it and shows its label; clearing reports null. Leaving the
// field puts back the chosen option's label, unless `allowsCustomValue` keeps
// the typed text: then text that names no option leaves nothing chosen and is
// reported through `onInputChange`, and Return keeps it too. `onBlur` fires
// after that. The text is the controlled `inputValue` when given.
// `onLoadMore` asks for the next page when the highlight reaches the last row
// or the list is scrolled to its end, while not `loading`, at most once per
// length of `options`. The list's loading and its count, or its empty line,
// are announced through a polite live region.
//
// The field is named by `ariaLabel`, its FormField's label or its placeholder,
// on the part that holds its text (`pmFieldName`), and reports its error (the FormField's
// message, else "Invalid") while invalid. Not honoured: `name`, `id`,
// `ariaRequired` and the `aria-*by` ids, which have no Compose counterpart;
// the web's phone floor, a browser's focus zoom.

package dev.polymorph.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.hoverable
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

object PMCombobox : PMComboboxRendering {
    @OptIn(ExperimentalMaterial3Api::class)
    @Composable
    override fun Render(props: PMComboboxProps) {
        val theme = PM.theme
        val colors = theme.colors
        val motion = theme.defaultMotion
        val field = LocalPMField.current
        val strings = PMSpecDefault.strings
        val defaults = strings.comboboxMessages
        val size = props.size ?: PMControlSize.Md
        val metrics = PMControlMetrics(size, theme)
        val disabled = (props.disabled ?: false) || !LocalPMEnabled.current
        val invalid = (props.invalid ?: false) || (field?.invalid ?: false)
        val loading = props.loading ?: false
        val custom = props.allowsCustomValue ?: false

        var own by remember { mutableStateOf(props.defaultValue?.value) }
        // The controlled `value` when given (null inside it is no option),
        // otherwise the field's own.
        val current = if (props.value != null) props.value.value else own
        val chosen = props.options.firstOrNull { it.value == current }
        var draft by remember { mutableStateOf(chosen?.label ?: "") }
        // The value whose option's label the text last took.
        var labelled by remember { mutableStateOf(chosen?.value) }
        val interaction = remember { MutableInteractionSource() }
        val focused by interaction.collectIsFocusedAsState()
        val hovered by interaction.collectIsHoveredAsState()
        // The text follows the value, not the options: when the value changes
        // it takes the chosen option's label, or, with nothing chosen and no
        // custom values, clears, so a stale label is never read as a query.
        // An option that comes and goes with the options (an app's own
        // filtering, a page loaded later) leaves the text alone, because it
        // may be the reader's query.
        LaunchedEffect(current) {
            if (chosen != null) {
                if (draft != chosen.label) draft = chosen.label
                labelled = current
            } else if (!custom) {
                draft = ""
            }
        }
        // The label of a value whose options arrive after it is written once,
        // while the field is not being typed into.
        LaunchedEffect(chosen?.label, focused) {
            if (chosen != null && labelled != current && !focused) {
                draft = chosen.label
                labelled = current
            }
        }
        val text = props.inputValue ?: draft
        var open by remember { mutableStateOf(props.defaultOpen == true && !disabled) }
        // The list is filtered while the text is a query, not the chosen label.
        val filtering = text.isNotEmpty() && text != chosen?.label
        val shown = if (filtering) matching(props.options, text, props.filter ?: PMComboboxFilter.Contains) else props.options
        var highlighted by remember(text, shown.size) {
            mutableStateOf(
                if (filtering) shown.indexOfFirst { it.disabled != true } else shown.indexOfFirst { it.value == current },
            )
        }
        var askedAt by remember { mutableStateOf(-1) }
        val askMore: () -> Unit = {
            if (!loading && props.onLoadMore != null && askedAt != props.options.size) {
                askedAt = props.options.size
                props.onLoadMore.invoke()
            }
        }

        val setText: (String) -> Unit = { next ->
            draft = next
            props.onInputChange?.invoke(next)
        }
        val choose: (PMComboboxOption) -> Unit = { option ->
            if (option.value != current) {
                own = option.value
                props.onChange?.invoke(option.value)
            }
            setText(option.label)
            open = false
        }
        val unchoose: () -> Unit = {
            if (current != null) {
                own = null
                props.onChange?.invoke(null)
            }
        }
        val clear: () -> Unit = {
            unchoose()
            setText("")
        }
        /** The text the field shows once the list closes without a choice. */
        val settle: () -> Unit = {
            if (custom) {
                val named = props.options.firstOrNull { it.label.equals(text, ignoreCase = true) && it.disabled != true }
                when {
                    named != null -> choose(named)
                    text != chosen?.label -> unchoose()
                }
            } else if (text != (chosen?.label ?: "")) {
                setText(chosen?.label ?: "")
            }
        }
        val move: (Int) -> Unit = { step ->
            var next = highlighted
            do {
                next += step
            } while (next in shown.indices && shown[next].disabled == true)
            if (next in shown.indices) highlighted = next
            if (highlighted == shown.lastIndex) askMore()
        }

        val report = LocalPMFieldReport.current
        SideEffect { report?.invoke(PMFieldControl(disabled = disabled)) }
        var wasFocused by remember { mutableStateOf(false) }
        val scroll = rememberScrollState()
        val ask by rememberUpdatedState(askMore)
        LaunchedEffect(scroll) {
            snapshotFlow { scroll.maxValue > 0 && scroll.value >= scroll.maxValue }.collect { atEnd -> if (atEnd) ask() }
        }

        val name = props.ariaLabel ?: field?.label ?: props.placeholder
        val showOptions = props.messages?.showOptions ?: defaults.showOptions.orEmpty()
        val clearLabel = props.messages?.clear ?: defaults.clear ?: strings.clear
        val emptyMessage = props.emptyMessage ?: strings.comboboxEmptyMessage
        val status = when {
            !open -> null
            loading -> props.messages?.loadingOptions ?: defaults.loadingOptions
            shown.isEmpty() -> emptyMessage
            else -> (props.messages?.options ?: defaults.options)?.invoke(shown.size.toDouble())
        }
        val attributes = buildMap {
            put("size", size.value)
            put("state", if (open) "open" else "closed")
            if (text.isEmpty()) put("placeholder", "true")
            if (invalid) put("invalid", "true")
            if (disabled) put("disabled", "true")
            if (loading) put("loading", "true")
        }

        PMMaterialTheme {
            ExposedDropdownMenuBox(
                expanded = open && !disabled,
                onExpandedChange = { if (!disabled) open = it },
            ) {
                BasicTextField(
                    value = text,
                    onValueChange = { next ->
                        setText(next)
                        open = true
                    },
                    modifier = Modifier
                        .pmMember("Combobox", attributes)
                        .menuAnchor(ExposedDropdownMenuAnchorType.PrimaryEditable, enabled = !disabled)
                        .semantics { if (invalid) error(field?.error ?: strings.invalid) }
                        .fillMaxWidth()
                        .pmHitTarget()
                        .hoverable(interaction, enabled = !disabled)
                        .onFocusChanged { state ->
                            if (wasFocused && !state.isFocused) {
                                settle()
                                open = false
                                props.onBlur?.invoke()
                            }
                            wasFocused = state.isFocused
                        }
                        .onPreviewKeyEvent { event ->
                            if (event.type != KeyEventType.KeyDown || disabled) return@onPreviewKeyEvent false
                            when (event.key) {
                                Key.DirectionDown -> {
                                    if (open) move(1) else open = true
                                    true
                                }
                                Key.DirectionUp -> {
                                    if (open) move(-1)
                                    open
                                }
                                Key.Enter, Key.NumPadEnter -> {
                                    val option = shown.getOrNull(highlighted)
                                    when {
                                        open && option != null && option.disabled != true -> choose(option)
                                        custom && text.isNotEmpty() -> {
                                            settle()
                                            open = false
                                        }
                                    }
                                    true
                                }
                                Key.Escape -> {
                                    // Closes the list and, in the same press, puts back the chosen label.
                                    open = false
                                    if (!custom || chosen != null) setText(chosen?.label ?: "")
                                    true
                                }
                                else -> false
                            }
                        },
                    enabled = !disabled,
                    textStyle = metrics.text.textStyle.copy(color = (if (disabled) colors.textDisabled else colors.textPrimary).color),
                    keyboardOptions = KeyboardOptions(autoCorrectEnabled = false, imeAction = ImeAction.Done),
                    // Done chooses or settles, closes the list and hides the keyboard.
                    keyboardActions = KeyboardActions(onDone = {
                        shown.getOrNull(highlighted)?.takeIf { open && it.disabled != true }?.let(choose) ?: settle()
                        open = false
                        defaultKeyboardAction(ImeAction.Done)
                    }),
                    singleLine = true,
                    interactionSource = interaction,
                    cursorBrush = SolidColor(colors.accentText.color),
                    decorationBox = { inner ->
                        Row(
                            modifier = Modifier
                                .pmFieldBox(invalid = invalid, disabled = disabled, readOnly = false, focused = focused, hovered = hovered, held = open)
                                .heightIn(min = metrics.height)
                                .padding(start = metrics.padding),
                            horizontalArrangement = Arrangement.spacedBy(metrics.gap),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Box(Modifier.weight(1f).pmFieldName(name), contentAlignment = Alignment.CenterStart) {
                                if (text.isEmpty()) {
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
                                inner()
                            }
                            // The clear button fades in over the control duration, as Input's does.
                            AnimatedVisibility(
                                visible = (props.clearable ?: false) && current != null && !disabled,
                                enter = fadeIn(motion.easing.enter.tween(motion.duration.control)),
                                exit = fadeOut(motion.easing.exit.tween(motion.duration.controlExit)),
                            ) {
                                PMEmbeddedButton(PMIconRole.Clear, clearLabel, size, onClick = clear)
                            }
                            // The chevron, or the spinning `loading` glyph while the list loads,
                            // the swap a fade at the control duration. Material's anchor takes
                            // its press and opens or closes the list.
                            PMEmbeddedButton(
                                icon = PMIconRole.Expand,
                                label = showOptions,
                                size = size,
                                onClick = { if (!disabled) open = !open },
                                enabled = !disabled,
                                anchor = Modifier.menuAnchor(ExposedDropdownMenuAnchorType.SecondaryEditable, enabled = !disabled),
                            ) { tint -> Glyph(size, open = open, loading = loading, tint = tint) }
                        }
                    },
                )
                // The list's loading, count and empty line, read politely.
                PMAnnouncement(status)
                ExposedDropdownMenu(
                    expanded = open && !disabled,
                    onDismissRequest = {
                        open = false
                        settle()
                    },
                    scrollState = scroll,
                    shape = theme.rounded(theme.radius.surface),
                    containerColor = colors.bgOverlay.color,
                    tonalElevation = 0.dp,
                    shadowElevation = 0.dp,
                    border = BorderStroke(PMGeometry.hairline, colors.borderSubtle.color),
                ) {
                    Column(
                        Modifier.padding(horizontal = theme.defaultDensity.inset.list.dp),
                        verticalArrangement = Arrangement.spacedBy(theme.defaultDensity.spacing.s1),
                    ) {
                        shown.forEachIndexed { index, option ->
                            PMOptionRow(
                                label = option.label,
                                description = option.description,
                                kind = PMOptionKind.Single,
                                chosen = option.value == current,
                                disabled = option.disabled == true,
                                onClick = { choose(option) },
                                size = size,
                                highlighted = index == highlighted,
                            )
                        }
                        when {
                            loading -> PMOptionSkeletonRows()
                            shown.isEmpty() -> PMOptionEmptyRow(emptyMessage)
                        }
                    }
                }
            }
        }
    }

    /** The `expand` chevron, a half turn while the list is open, or the spinning `loading` glyph while it loads. */
    @Composable
    private fun Glyph(size: PMControlSize, open: Boolean, loading: Boolean, tint: Color) {
        val motion = PM.theme.defaultMotion
        Box(contentAlignment = Alignment.Center) {
            AnimatedVisibility(
                visible = loading,
                enter = fadeIn(motion.easing.enter.tween(motion.duration.control)),
                exit = fadeOut(motion.easing.exit.tween(motion.duration.controlExit)),
            ) { PMSpinGlyph(size, tint) }
            AnimatedVisibility(
                visible = !loading,
                enter = fadeIn(motion.easing.enter.tween(motion.duration.control)),
                exit = fadeOut(motion.easing.exit.tween(motion.duration.controlExit)),
            ) { PMTurningChevron(PMIconRole.Expand, open, PMTurn.HALF, size, tint) }
        }
    }

    /**
     * The options whose label matches `query` by `filter`, ignoring case and
     * the common Latin accents; all of them when `filter` is `off`, because the
     * app has filtered them.
     */
    private fun matching(options: List<PMComboboxOption>, query: String, filter: PMComboboxFilter): List<PMComboboxOption> {
        if (filter == PMComboboxFilter.Off) return options
        val folded = fold(query)
        return options.filter {
            val label = fold(it.label)
            if (filter == PMComboboxFilter.StartsWith) label.startsWith(folded) else label.contains(folded)
        }
    }

    private fun fold(text: String): String = text.lowercase().map { FOLDS[it] ?: it }.joinToString("")

    /** The common Latin accented letters and the letters they fold to. */
    private val FOLDS: Map<Char, Char> = (
        "àáâãäåāăąçćčďđèéêëēėęěìíîïīįıłñńňòóôõöøōőřśšşţťùúûüūůűųýÿźżž" zip
            "aaaaaaaaacccddeeeeeeeeiiiiiiilnnnoooooooorsssttuuuuuuuuyyzzz"
        ).toMap()

}

/**
 * Combobox's states, from the spec's States table. The open entries draw the
 * list in its menu window below the field, with room for its rows.
 */
object ComboboxStates : PMStates {
    override val member = "Combobox"

    private const val assignee = "Assignee"
    private const val search = "Search the team…"

    private val team = listOf(
        PMComboboxOption(value = "ana", label = "Ana Ruiz"),
        PMComboboxOption(value = "ben", label = "Ben Okafor"),
        PMComboboxOption(value = "chloe", label = "Chloé Martin"),
        PMComboboxOption(value = "dev", label = "Dev Patel", disabled = true),
        PMComboboxOption(value = "eli", label = "Eli Stone"),
    )

    private val queues = listOf(
        PMComboboxOption(value = "billing", label = "Billing", description = "Invoices, refunds, plans"),
        PMComboboxOption(value = "access", label = "Access", description = "Sign-in, SSO, passwords"),
    )

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("closed rest", expect = mapOf("state" to "closed", "placeholder" to "true", "size" to "md")) {
                PMCombobox(ariaLabel = assignee, options = team, placeholder = search)
            },
            PMStateEntry("with value", expect = mapOf("state" to "closed")) {
                PMCombobox(ariaLabel = assignee, defaultValue = PMSome("ben"), options = team)
            },
        ) + listOf(PMControlSize.Sm, PMControlSize.Lg).map { size ->
            PMStateEntry("size ${size.value}", expect = mapOf("size" to size.value)) {
                PMCombobox(ariaLabel = assignee, defaultValue = PMSome("ana"), options = team, size = size)
            }
        } + listOf(
            PMStateEntry("open filtered — the first match highlighted", expect = mapOf("state" to "open")) {
                PMFixtureRoom(team.size + 1) {
                    PMCombobox(ariaLabel = assignee, defaultOpen = true, inputValue = "e", options = team, placeholder = search)
                }
            },
            PMStateEntry("open with selection — its check", expect = mapOf("state" to "open")) {
                PMFixtureRoom(team.size + 1) {
                    PMCombobox(ariaLabel = assignee, defaultOpen = true, defaultValue = PMSome("chloe"), options = team)
                }
            },
            PMStateEntry("loading — skeleton rows", expect = mapOf("state" to "open", "loading" to "true")) {
                PMFixtureRoom(4) {
                    PMCombobox(ariaLabel = assignee, defaultOpen = true, loading = true, options = emptyList())
                }
            },
            PMStateEntry("empty results — one line", expect = mapOf("state" to "open")) {
                PMFixtureRoom(2) {
                    PMCombobox(ariaLabel = assignee, defaultOpen = true, inputValue = "zed", options = team)
                }
            },
            PMStateEntry("descriptions", expect = mapOf("state" to "open")) {
                PMFixtureRoom(queues.size * 2 + 1) {
                    PMCombobox(ariaLabel = "Queue", defaultOpen = true, options = queues)
                }
            },
            PMStateEntry("clearable with value", expect = mapOf("state" to "closed")) {
                PMCombobox(ariaLabel = assignee, clearable = true, defaultValue = PMSome("eli"), options = team)
            },
            PMStateEntry("custom value — the typed text stands", expect = mapOf("state" to "closed")) {
                PMCombobox(allowsCustomValue = true, ariaLabel = "Tag", inputValue = "vip-escalation", options = queues)
            },
            PMStateEntry("loading more — rows and skeletons", expect = mapOf("state" to "open", "loading" to "true")) {
                PMFixtureRoom(team.size + 4) {
                    PMCombobox(ariaLabel = assignee, defaultOpen = true, loading = true, options = team)
                }
            },
            PMStateEntry("invalid", expect = mapOf("invalid" to "true")) {
                PMCombobox(ariaLabel = assignee, invalid = true, options = team, placeholder = search)
            },
            PMStateEntry("disabled", expect = mapOf("disabled" to "true")) {
                PMCombobox(ariaLabel = assignee, defaultValue = PMSome("ana"), disabled = true, options = team)
            },
        )
}
