// MultiSelect (`design/components/multi-select.md`), adapted on Android:
// several values chosen from a filterable list, as a field of the chosen chips
// whose options are a checklist in a modal bottom sheet on a phone's window
// and anchored to the field on a wider one, the platform map's form, because
// Material has no multi-select field (`presentation: popover` keeps the
// anchored list on a phone too). The field is TagInput's container, Input's
// in every state (`pmFieldBox`), growing as its chips wrap (`PMChipFlow`, whose
// lines are the hit target tall once they wrap), `space-1` apart inside
// `space-1` by `space-2` of padding, at least the control height of `size`
// tall: the chosen values as chips, in the options' order, each TagInput's
// chip with its remove button (`PMValueChip`), which Backspace or Delete also
// presses with a hardware keyboard, then the placeholder while nothing is
// chosen, and the `expand` chevron at its end, turned half a turn while the
// list is open, or the spinning `loading` glyph while the list loads. A press
// on the field opens the list.
//
// The list is a search field at its top that filters the options as the
// person types (`filter: false` when the app has filtered), then Select's rows
// with the check column: the `confirm` glyph in `accent.text` on each chosen
// option, a description as a row's second line, three Skeleton rows while
// loading (below the rows when more are loading), and the empty row,
// `emptyMessage`, when nothing matches. A row under the pointer or with
// keyboard focus is the `accent.subtle` wash, never the choice; a press is a
// ripple of it. Choosing toggles an option and leaves the list open, because
// a filter list is ticked several entries at a time; the back gesture, Escape
// and a press outside close it, and closing is `onBlur`. With `allowCustom`,
// typed text that matches no option, is not chosen already and passes
// `validate` is offered as the last row, `Add "{text}"` with the `add` glyph,
// and the keyboard's action key takes the offer; with nothing typed, it hides
// the keyboard. At `max` the unchosen options are dimmed and cannot be
// chosen, the chosen ones can still be removed, and the offer is withdrawn.
// Scrolling the list to its end, while not loading, asks for more once per
// length of `options` (`onLoadMore`). The open list says politely what it
// holds, as the web's status does: `messages.loadingOptions` while it loads,
// the empty row's words when nothing matches and nothing is offered, and
// otherwise the count of options shown, `messages.options` ("{count}
// options").
//
// `onChange` reports the chosen values in the options' order, a custom value
// last, never the order they were ticked. Adding and removing are announced
// politely with the count. The field's name is on an empty part laid over the
// region that holds its chips (`pmFieldName`), beside the chips rather than
// around them, because TalkBack reads a described node in place of what is
// inside it and the chips' values must still be read. The field reports the
// count, "{n} selected" or "Maximum of {max} selected", as its state, and its
// FormField's error while invalid. Each option is a checkbox to TalkBack. The
// search text is the controlled `inputValue` when given, `defaultInputValue`
// its start. A disabled field shows its chips without their remove buttons.
// Typed text the field cannot take is announced: `messages.alreadySelected`
// ("{value}" is already selected) when it is a chosen value, else
// `messages.refused` (Cannot add "{text}"). `name`, `id`, `ariaRequired` and
// the `aria-*by` ids have no Compose counterpart.

package dev.polymorph.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

object PMMultiSelect : PMMultiSelectRendering {
    @Composable
    override fun Render(props: PMMultiSelectProps) {
        val theme = PM.theme
        val colors = theme.colors
        val field = LocalPMField.current
        val strings = PMSpecDefault.strings
        val size = props.size ?: PMControlSize.Md
        val metrics = PMControlMetrics(size, theme)
        val space = theme.defaultDensity.spacing
        val disabled = (props.disabled ?: false) || !LocalPMEnabled.current
        val invalid = (props.invalid ?: false) || (field?.invalid ?: false)
        val loading = props.loading ?: false
        var own by remember { mutableStateOf(props.defaultValue ?: emptyList()) }
        var typed by remember { mutableStateOf(props.defaultInputValue ?: "") }
        var open by remember { mutableStateOf(props.defaultOpen == true && !disabled) }
        var announcement by remember { mutableStateOf<String?>(null) }
        val chosen = ordered(props.value ?: own, props.options)
        val atMax = props.max?.let { chosen.size >= it } ?: false
        val query = props.inputValue ?: typed
        val labelOf = { value: String -> props.options.firstOrNull { it.value == value }?.label ?: value }
        val set: (List<String>) -> Unit = { values ->
            val next = ordered(values, props.options)
            own = next
            props.onChange?.invoke(next)
        }
        val add: (String) -> Unit = { value ->
            if (value !in chosen && !atMax) {
                set(chosen + value)
                val count = (chosen.size + 1).toDouble()
                announcement = props.messages?.added?.invoke(labelOf(value), count) ?: strings.multiSelectAdded(labelOf(value), count)
            }
        }
        val remove: (String) -> Unit = { value ->
            set(chosen - value)
            val count = (chosen.size - 1).toDouble()
            announcement = props.messages?.removed?.invoke(labelOf(value), count) ?: strings.multiSelectRemoved(labelOf(value), count)
        }
        val search: (String) -> Unit = { next ->
            typed = next
            props.onInputChange?.invoke(next)
        }
        val offer = offer(props, query, chosen, atMax)
        val mint: () -> Unit = {
            if (offer != null) {
                add(offer)
                search("")
            } else if (props.allowCustom == true && query.isNotBlank()) {
                // A commit the field cannot take is answered, not dropped in silence.
                val text = query.trim()
                announcement = if (text in chosen) {
                    props.messages?.alreadySelected?.invoke(text) ?: strings.multiSelectAlreadySelected(text)
                } else {
                    props.messages?.refused?.invoke(text) ?: strings.multiSelectRefused(text)
                }
            }
        }
        val setOpen: (Boolean) -> Unit = { next ->
            if (next != open) {
                open = next
                if (!next) props.onBlur?.invoke()
            }
        }
        val report = LocalPMFieldReport.current
        SideEffect { report?.invoke(PMFieldControl(disabled = disabled)) }

        val interaction = remember { MutableInteractionSource() }
        val hovered by interaction.collectIsHoveredAsState()
        val focused by interaction.collectIsFocusedAsState()
        val max = props.max
        val count = props.messages?.selected?.invoke(chosen.size.toDouble(), max) ?: if (max != null && atMax) {
            strings.multiSelectMaximum(max)
        } else {
            strings.multiSelectSelected(chosen.size.toDouble())
        }
        val name = props.ariaLabel ?: field?.label ?: props.placeholder
        val attributes = buildMap {
            put("size", size.value)
            put("state", if (open) "open" else "closed")
            put("count", chosen.size.toString())
            if (invalid) put("invalid", "true")
            if (disabled) put("disabled", "true")
            if (loading) put("loading", "true")
            if (atMax) put("at-max", "true")
        }
        var fieldWidth by remember { mutableStateOf(0.dp) }
        val density = LocalDensity.current

        Column(Modifier.fillMaxWidth()) {
            Box {
                Row(
                    modifier = Modifier
                        .pmMember("MultiSelect", attributes)
                        .fillMaxWidth()
                        .onSizeChanged { fieldWidth = with(density) { it.width.toDp() } }
                        // The field opens the list; its chips' remove buttons keep their own presses.
                        .clickable(interactionSource = interaction, indication = null, enabled = !disabled) { setOpen(true) }
                        .semantics {
                            role = Role.DropdownList
                            stateDescription = count
                            if (invalid) error(field?.error ?: strings.invalid)
                        }
                        .pmHitTarget()
                        .pmFieldBox(invalid = invalid, disabled = disabled, readOnly = false, focused = focused, hovered = hovered, held = open)
                        .heightIn(min = metrics.height)
                        .padding(horizontal = space.s2, vertical = space.s1),
                    horizontalArrangement = Arrangement.spacedBy(space.s1),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    // The name is on an empty part over the chips' region, as
                    // tall as the field's inside, so it is on a node with a
                    // size while nothing is chosen.
                    Box(Modifier.weight(1f)) {
                        Box(Modifier.matchParentSize().pmFieldName(name))
                        PMChipFlow(
                            spacing = space.s1,
                            modifier = Modifier.heightIn(min = metrics.height - PMGeometry.bothEdges(space.s1)),
                        ) {
                            for (value in chosen) {
                                PMValueChip(
                                    label = labelOf(value),
                                    removeLabel = props.messages?.remove?.invoke(labelOf(value)) ?: strings.multiSelectRemove(labelOf(value)),
                                    disabled = disabled,
                                    onRemove = { remove(value) },
                                )
                            }
                            if (chosen.isEmpty()) {
                                props.placeholder?.let {
                                    Text(
                                        text = it,
                                        style = metrics.text.textStyle,
                                        color = (if (disabled) colors.textDisabled else colors.textMuted).color,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                        // The field's name already carries it when nothing else names the field.
                                        modifier = Modifier
                                            .semantics { hideFromAccessibility() }
                                            .padding(horizontal = space.s2)
                                            .heightIn(min = theme.defaultDensity.controlHeight.sm.dp - space.s2),
                                    )
                                }
                            }
                        }
                    }
                    val glyph = (if (disabled) colors.textDisabled else colors.textMuted).color
                    if (loading) {
                        PMSpinGlyph(size, glyph)
                    } else {
                        PMTurningChevron(PMIconRole.Expand, open, PMTurn.HALF, size, glyph)
                    }
                }
                val list: @Composable (Boolean) -> Unit = { sheet ->
                    OptionList(
                        props = props,
                        // Read here: the panel's window is outside the field.
                        name = props.ariaLabel ?: field?.label ?: props.placeholder,
                        sheet = sheet,
                        minWidth = fieldWidth,
                        query = query,
                        search = search,
                        chosen = chosen,
                        atMax = atMax,
                        offer = offer,
                        toggle = { value -> if (value in chosen) remove(value) else add(value) },
                        mint = mint,
                    )
                }
                if (props.presentation != PMMultiSelectPresentation.Popover && pmCompactWindow()) {
                    if (open) {
                        PMBottomSheet(
                            onDismiss = { setOpen(false) },
                            modifier = Modifier.pmMember("MultiSelect", pmInSheet(attributes)),
                        ) { list(true) }
                    }
                } else {
                    PMAnchoredPanel(open = open, onDismiss = { setOpen(false) }) {
                        Box(Modifier.pmMember("MultiSelect", attributes)) { list(false) }
                    }
                }
            }
            // Additions and removals, read politely as they happen.
            PMAnnouncement(announcement)
        }
    }

    /** The chosen values in the options' order, a value no option carries after them. */
    private fun ordered(values: List<String>, options: List<PMMultiSelectOption>): List<String> {
        val known = options.map { it.value }
        return known.filter { it in values } + values.filter { it !in known }.distinct()
    }

    /** The value the typed text offers to add, or null when there is none to offer. */
    private fun offer(props: PMMultiSelectProps, query: String, chosen: List<String>, atMax: Boolean): String? {
        if (props.allowCustom != true || atMax) return null
        val trimmed = query.trim()
        val value = props.validate?.invoke(query) ?: if (props.validate == null && trimmed.isNotEmpty()) trimmed else null
        if (value == null || value in chosen) return null
        val clashes = props.options.any { it.value.equals(value, ignoreCase = true) || it.label.equals(value, ignoreCase = true) }
        return if (clashes) null else value
    }

    /**
     * The list: the search field, named `name`, the options that match it,
     * the loading and empty rows and the offer, inside the anchored panel's
     * surface or the sheet, its foot clear of the system bars.
     */
    @Composable
    private fun OptionList(
        props: PMMultiSelectProps,
        name: String?,
        sheet: Boolean,
        minWidth: Dp,
        query: String,
        search: (String) -> Unit,
        chosen: List<String>,
        atMax: Boolean,
        offer: String?,
        toggle: (String) -> Unit,
        mint: () -> Unit,
    ) {
        val theme = PM.theme
        val colors = theme.colors
        val strings = PMSpecDefault.strings
        val density = theme.defaultDensity
        val inset = density.inset.list.dp
        val size = props.size ?: PMControlSize.Md
        val loading = props.loading ?: false
        val shown = if (props.filter == false || query.isBlank()) {
            props.options
        } else {
            props.options.filter { it.label.contains(query.trim(), ignoreCase = true) }
        }
        val scroll = rememberScrollState()
        var asked by remember { mutableIntStateOf(-1) }
        LaunchedEffect(scroll.value, scroll.maxValue, props.options.size, loading) {
            val atEnd = scroll.maxValue > 0 && scroll.value >= scroll.maxValue
            if (atEnd && !loading && asked != props.options.size) {
                asked = props.options.size
                props.onLoadMore?.invoke()
            }
        }
        val frame = if (sheet) {
            Modifier.fillMaxWidth().padding(inset).windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Bottom))
        } else {
            Modifier
                .widthIn(min = minWidth)
                .pmOverlaySurface(colors.bgOverlay, colors.borderSubtle)
                .padding(inset)
        }
        Column(frame) {
            Search(query, name, search, mint)
            val empty = props.emptyMessage ?: strings.multiSelectEmpty
            Column(
                Modifier.padding(top = density.spacing.s2).verticalScroll(scroll),
                verticalArrangement = Arrangement.spacedBy(density.spacing.s1),
            ) {
                for (option in shown) {
                    val picked = option.value in chosen
                    PMOptionRow(
                        label = option.label,
                        description = option.description,
                        kind = PMOptionKind.Multiple,
                        chosen = picked,
                        disabled = option.disabled == true || (atMax && !picked),
                        onClick = { toggle(option.value) },
                        size = size,
                    )
                }
                when {
                    loading -> PMOptionSkeletonRows()
                    shown.isEmpty() && offer == null -> PMOptionEmptyRow(empty)
                }
                offer?.let { value ->
                    PMOptionRow(
                        label = props.messages?.add?.invoke(value) ?: strings.multiSelectAdd(value),
                        description = null,
                        kind = PMOptionKind.Add,
                        chosen = false,
                        disabled = false,
                        onClick = mint,
                        size = size,
                    )
                }
            }
            // The list's loading, its empty line and its count, read politely, as the web's status.
            PMAnnouncement(
                when {
                    loading -> props.messages?.loadingOptions ?: strings.multiSelectLoading
                    shown.isEmpty() -> if (offer == null) empty else null
                    else -> (props.messages?.options ?: strings.multiSelectOptions)(shown.size.toDouble())
                },
            )
        }
    }

    /** The search field at the list's top: Input's container at `md`, the `search` glyph, the field's name. */
    @Composable
    private fun Search(query: String, name: String?, search: (String) -> Unit, mint: () -> Unit) {
        val theme = PM.theme
        val colors = theme.colors
        val metrics = PMControlMetrics(PMControlSize.Md, theme)
        val interaction = remember { MutableInteractionSource() }
        val focused by interaction.collectIsFocusedAsState()
        BasicTextField(
            value = query,
            onValueChange = search,
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            textStyle = metrics.text.textStyle.copy(color = colors.textPrimary.color),
            cursorBrush = SolidColor(colors.accentText.color),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            // Done takes the offer or answers the text, or, with nothing typed, hides the keyboard.
            keyboardActions = KeyboardActions(onDone = { if (query.isBlank()) defaultKeyboardAction(ImeAction.Done) else mint() }),
            interactionSource = interaction,
            decorationBox = { text ->
                Row(
                    modifier = Modifier
                        .pmFieldBox(invalid = false, disabled = false, readOnly = false, focused = focused)
                        .heightIn(min = metrics.height)
                        .padding(horizontal = metrics.padding),
                    horizontalArrangement = Arrangement.spacedBy(metrics.gap),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    PMIconView(PMIconRole.Search, PMControlSize.Md, tint = colors.textMuted.color)
                    Box(Modifier.weight(1f).pmFieldName(name)) { text() }
                }
            },
        )
    }
}

/**
 * MultiSelect's states, from the spec's States table. The open states draw the
 * list in its bottom sheet, opened by `defaultOpen` in its own window over the
 * canvas.
 */
object MultiSelectStates : PMStates {
    override val member = "MultiSelect"

    private val team = listOf(
        PMMultiSelectOption(value = "ana", label = "Ana Ruiz"),
        PMMultiSelectOption(value = "ben", label = "Ben Okafor"),
        PMMultiSelectOption(value = "chloe", label = "Chloé Martin"),
        PMMultiSelectOption(value = "dev", label = "Dev Patel"),
        PMMultiSelectOption(value = "eli", label = "Eli Stone"),
        PMMultiSelectOption(value = "fay", label = "Fay Lindqvist"),
        PMMultiSelectOption(value = "gus", label = "Gus Moreau"),
        PMMultiSelectOption(value = "hana", label = "Hana Sato"),
    )

    private const val placeholder = "Add assignees…"
    private const val assignees = "Assignees"

    override val entries: List<PMStateEntry>
        get() = PMControlSize.entries.map { size ->
            PMStateEntry("size ${size.value}", expect = mapOf("size" to size.value)) {
                PMMultiSelect(ariaLabel = assignees, defaultValue = listOf("ana"), options = team, size = size)
            }
        } + listOf(
            PMStateEntry("empty", expect = mapOf("state" to "closed", "count" to "0", "value" to "0 selected")) {
                PMMultiSelect(ariaLabel = assignees, options = team, placeholder = placeholder)
            },
            PMStateEntry("with chips — in the options' order", expect = mapOf("count" to "3")) {
                PMMultiSelect(ariaLabel = assignees, defaultValue = listOf("eli", "ana", "chloe"), options = team)
            },
            PMStateEntry("wrapped — the field grew", expect = mapOf("count" to "8")) {
                PMMultiSelect(ariaLabel = assignees, defaultValue = team.map { it.value }, options = team)
            },
            PMStateEntry("open filtered", expect = mapOf("state" to "open", "presentation" to "sheet")) {
                PMFixturePhone { PMMultiSelect(ariaLabel = assignees, defaultInputValue = "an", defaultOpen = true, options = team) }
            },
            PMStateEntry("open with selections — their checks", expect = mapOf("state" to "open", "count" to "2", "presentation" to "sheet")) {
                PMFixturePhone { PMMultiSelect(ariaLabel = assignees, defaultOpen = true, defaultValue = listOf("ben", "dev"), options = team) }
            },
            PMStateEntry("open on a wider window — anchored to the field", expect = mapOf("state" to "open")) {
                PMFixtureRoom(team.size + 2) {
                    PMMultiSelect(
                        ariaLabel = assignees,
                        defaultOpen = true,
                        defaultValue = listOf("ben"),
                        options = team.take(4),
                        presentation = PMMultiSelectPresentation.Popover,
                    )
                }
            },
            PMStateEntry("loading — skeleton rows", expect = mapOf("loading" to "true", "presentation" to "sheet")) {
                PMFixturePhone { PMMultiSelect(ariaLabel = assignees, defaultOpen = true, loading = true, options = emptyList()) }
            },
            PMStateEntry("empty results — one line", expect = mapOf("state" to "open", "presentation" to "sheet")) {
                PMFixturePhone { PMMultiSelect(ariaLabel = assignees, defaultInputValue = "zed", defaultOpen = true, options = team) }
            },
            PMStateEntry("at max — the unchosen dimmed", expect = mapOf("at-max" to "true", "value" to "Maximum of 2 selected", "presentation" to "sheet")) {
                PMFixturePhone {
                    PMMultiSelect(ariaLabel = assignees, defaultOpen = true, defaultValue = listOf("ana", "ben"), max = 2.0, options = team)
                }
            },
            PMStateEntry("custom — the offer row", expect = mapOf("state" to "open", "presentation" to "sheet")) {
                PMFixturePhone {
                    PMMultiSelect(allowCustom = true, ariaLabel = assignees, defaultInputValue = "Zoe Park", defaultOpen = true, options = team)
                }
            },
            PMStateEntry("custom — a chip no option carries", expect = mapOf("count" to "2")) {
                PMMultiSelect(allowCustom = true, ariaLabel = assignees, defaultValue = listOf("ana", "Zoe Park"), options = team)
            },
            PMStateEntry("loading more — rows and skeletons", expect = mapOf("loading" to "true", "presentation" to "sheet")) {
                PMFixturePhone { PMMultiSelect(ariaLabel = assignees, defaultOpen = true, loading = true, options = team.take(3)) }
            },
            PMStateEntry("invalid", expect = mapOf("invalid" to "true")) {
                PMMultiSelect(ariaLabel = assignees, invalid = true, options = team, placeholder = placeholder)
            },
            PMStateEntry("disabled — no remove buttons", expect = mapOf("disabled" to "true")) {
                PMMultiSelect(ariaLabel = assignees, defaultValue = listOf("ana", "ben"), disabled = true, options = team)
            },
        )
}
