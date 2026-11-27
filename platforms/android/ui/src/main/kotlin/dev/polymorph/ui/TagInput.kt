// TagInput (`design/components/tag-input.md`): free text entered as several
// values, each shown as a chip. Input's container in every state
// (`pmFieldBox`), the one field of the family that grows: the chips and the
// text entry wrap onto as many lines as they need (`PMChipFlow`, whose lines
// are the hit target tall once they wrap), `space.1` apart, inside `space.1`
// by `space.2` of padding, at least the control height of `size` tall. A chip
// is a `bg.subtle` pill in a `border.subtle` hairline, the small
// control height less `space.2` tall, its label `text.sm`, cut with an
// ellipsis past two `space.10` steps, and its remove button the `close` glyph,
// muted, in `danger.text` under the pointer and while pressed. The entry
// takes the rest of its line, at least half a `space.10` step wide, and moves
// to a line of its own when less is left.
//
// The keyboard's action key or a comma commits the typed text, and text with
// commas or line breaks in it (a paste) is split there, each part committed in
// turn. With nothing typed, the action key hides the keyboard. `validate` (trim and non-empty by default) gets the text as typed and
// returns the tag as it is stored, or null to reject it: a rejection draws
// the field invalid for one control duration and keeps the text, with no
// message, because written errors are FormField's. A duplicate is never added;
// the chip it repeats flashes its `accent.bg` hairline for one control
// duration instead. A chip enters with the `scale-fade` binding at the control
// class and leaves with a fade at the control's exit duration. With a hardware
// keyboard, Backspace in the empty entry removes the last chip, Backspace or
// Delete on a chip's remove button removes that chip, and Escape clears the
// typed text. At `max` the entry stays, focusable and named, but read-only;
// the chips stay removable. A disabled field shows its chips without their
// remove buttons. `onChange` reports the values in order; `onBlur` fires when
// focus leaves the whole field, chips included.
//
// The entry is named by `ariaLabel` or its FormField's label (else the
// placeholder), on the part that holds its text (`pmFieldName`), its state is
// the count ("3 added", or "Maximum of 3 added", or the app's words from
// `countLabel`), and while invalid it
// reports its error (the FormField's message, else "Invalid"). Each remove
// button is named by `removeLabel` ("Remove {tag}" by default), and a removal
// is announced politely in the words of `removedLabel` ("{tag} removed, {n}
// remain" by default). A remove button pressed
// from the keyboard hands focus to the next chip's, or to the entry; a touch
// leaves focus where it is, so the keyboard does not open.
//
// These follow the SwiftUI member, except where the spec decides otherwise:
// `validate` gets the text as typed, not trimmed. Not honoured: the reflow of
// the chips after a removal on the layout spring, which Compose's layouts do
// not animate here; the arrow keys between chips, which Tab replaces; `name`,
// `id`, `ariaRequired` and the `aria-describedby`/`aria-labelledby` ids, which
// have no Compose counterpart; and the phone's focus-zoom floor.

package dev.polymorph.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.input.ImeAction
import kotlinx.coroutines.delay

object PMTagInput : PMTagInputRendering {
    @Composable
    override fun Render(props: PMTagInputProps) {
        val theme = PM.theme
        val colors = theme.colors
        val motion = theme.defaultMotion
        val strings = PMSpecDefault.strings
        val density = theme.defaultDensity
        val space = density.spacing
        val size = props.size ?: PMControlSize.Md
        val metrics = PMControlMetrics(size, theme)
        val facts = pmFieldFacts(props.ariaLabel, props.placeholder, props.disabled, props.invalid)

        var own by remember { mutableStateOf(props.defaultValue ?: emptyList()) }
        val values = props.value ?: own
        var text by remember { mutableStateOf("") }
        var refused by remember { mutableStateOf(false) }
        var refusals by remember { mutableStateOf(0) }
        var flashing by remember { mutableStateOf<String?>(null) }
        var flashes by remember { mutableStateOf(0) }
        var announcement by remember { mutableStateOf<String?>(null) }
        // The chips leaving, by the place they held, kept while they fade out.
        var leaving by remember { mutableStateOf(emptyList<Pair<Int, String>>()) }
        // The chips present at first, which arrive without an entrance.
        val initial = remember { values.toSet() }
        val full = props.max?.let { values.size >= it } ?: false
        val entry = remember { FocusRequester() }
        val removers = remember { mutableMapOf<String, FocusRequester>() }

        // A flash lasts one control duration; at the `none` temperament it is no flash.
        LaunchedEffect(refusals) {
            if (refused) {
                delay(motion.duration.control.toLong())
                refused = false
            }
        }
        LaunchedEffect(flashes) {
            if (flashing != null) {
                delay(motion.duration.control.toLong())
                flashing = null
            }
        }

        fun change(next: List<String>) {
            own = next
            // A tag added again while its chip fades out stays.
            leaving = leaving.filter { it.second !in next }
            props.onChange?.invoke(next)
        }
        // Adds `raws` as validated, in order, and returns the ones not used: a
        // rejection, or what came after the field filled. A duplicate is used
        // up, pointing at its chip. Blank text adds nothing and is no rejection.
        fun commit(raws: List<String>): List<String> {
            val next = values.toMutableList()
            val unused = mutableListOf<String>()
            for (raw in raws) {
                if (raw.isBlank()) continue
                if (props.max?.let { next.size >= it } == true) {
                    unused += raw
                    continue
                }
                val tag = props.validate?.invoke(raw) ?: raw.trim().takeIf { props.validate == null }
                when {
                    tag == null -> {
                        refused = true
                        refusals += 1
                        unused += raw
                    }
                    tag in next -> {
                        flashing = tag
                        flashes += 1
                    }
                    else -> next += tag
                }
            }
            if (next.size != values.size) change(next)
            return unused
        }
        fun remove(tag: String, handOff: Boolean) {
            val index = values.indexOf(tag)
            if (index < 0) return
            val next = values.filter { it != tag }
            change(next)
            leaving = leaving + (index to tag)
            val remain = next.size.toDouble()
            announcement = props.removedLabel?.invoke(tag, remain) ?: strings.tagInputRemoved(tag, remain)
            if (handOff) (values.getOrNull(index + 1)?.let { removers[it] } ?: entry).requestFocus()
        }
        // A comma or a line break commits the text before it; text a
        // rejection leaves stays in the entry, without its separator.
        val type: (String) -> Unit = { typed ->
            if (!full) {
                val parts = typed.split(',', '\n')
                text = if (parts.size > 1) {
                    (commit(parts.dropLast(1)) + parts.last()).filter { it.isNotEmpty() }.joinToString(" ")
                } else {
                    typed
                }
            }
        }

        val shownTags = buildList {
            addAll(values)
            for ((index, tag) in leaving.sortedBy { it.first }) if (tag !in values) this.add(minOf(index, this.size), tag)
        }
        val interaction = remember { MutableInteractionSource() }
        val hovered by interaction.collectIsHoveredAsState()
        val typing = remember { MutableInteractionSource() }
        val focused by typing.collectIsFocusedAsState()
        var within by remember { mutableStateOf(false) }
        val attributes = buildMap {
            put("size", size.value)
            put("count", values.size.toString())
            if (facts.invalid || refused) put("invalid", "true")
            if (facts.disabled) put("disabled", "true")
            if (full) put("state", "at-max")
        }
        // The count in the app's words from `countLabel`, or the string catalogue's.
        val count = props.countLabel?.invoke(PMTagInputCountFacts(values.size.toDouble(), props.max, atMax = full))
            ?: props.max?.takeIf { full }?.let { strings.tagInputMaximum(it) }
            ?: strings.tagInputAdded(values.size.toDouble())

        Box(
            Modifier
                .pmMember("TagInput", attributes)
                .fillMaxWidth()
                .pmHitTarget()
                .hoverable(interaction, enabled = !facts.disabled)
                // Chips and entry are one control: only leaving the whole field is a blur.
                .onFocusChanged { state ->
                    if (state.hasFocus != within) {
                        within = state.hasFocus
                        if (!within) props.onBlur?.invoke()
                    }
                }
                // A tap anywhere on the field that is not a chip's button focuses the entry.
                .pointerInput(facts.disabled) { detectTapGestures { if (!facts.disabled) entry.requestFocus() } }
                .pmFieldBox(
                    invalid = facts.invalid || refused,
                    disabled = facts.disabled,
                    readOnly = false,
                    focused = focused,
                    hovered = hovered,
                )
                .heightIn(min = metrics.height)
                .padding(horizontal = space.s2, vertical = space.s1),
        ) {
            PMChipFlow(spacing = space.s1, lastMinWidth = space.s10 / PMRecipe.entryMinWidth) {
                for (tag in shownTags) {
                    key(tag) {
                        val shown = remember { MutableTransitionState(tag in initial) }
                        val staying = leaving.none { it.second == tag } || tag in values
                        shown.targetState = staying
                        if (!staying && shown.isIdle && !shown.currentState) {
                            LaunchedEffect(Unit) {
                                leaving = leaving.filter { it.second != tag }
                                removers.remove(tag)
                            }
                        }
                        AnimatedVisibility(
                            visibleState = shown,
                            enter = scaleIn(motion.easing.enter.tween(motion.duration.control), CHIP_FROM) +
                                fadeIn(motion.easing.enter.tween(motion.duration.control)),
                            exit = fadeOut(motion.easing.exit.tween(motion.duration.controlExit)),
                        ) {
                            PMValueChip(
                                label = tag,
                                removeLabel = props.removeLabel?.invoke(tag) ?: strings.tagInputRemove(tag),
                                disabled = facts.disabled,
                                flashing = flashing == tag,
                                focus = removers.getOrPut(tag) { FocusRequester() },
                                onRemove = { handOff -> remove(tag, handOff) },
                            )
                        }
                    }
                }
                BasicTextField(
                    value = text,
                    onValueChange = type,
                    modifier = Modifier
                        .pmFieldError(facts)
                        .semantics { stateDescription = count }
                        .focusRequester(entry)
                        .onPreviewKeyEvent { event ->
                            if (event.type != KeyEventType.KeyDown || facts.disabled) return@onPreviewKeyEvent false
                            when {
                                event.key == Key.Backspace && text.isEmpty() && values.isNotEmpty() -> {
                                    remove(values.last(), handOff = false)
                                    true
                                }
                                event.key == Key.Escape && text.isNotEmpty() -> {
                                    text = ""
                                    true
                                }
                                else -> false
                            }
                        },
                    enabled = !facts.disabled,
                    readOnly = full,
                    textStyle = metrics.text.textStyle.copy(color = facts.textColor),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    // Done commits the text, or, with nothing typed, hides the keyboard.
                    keyboardActions = KeyboardActions(onDone = {
                        if (text.isBlank()) {
                            defaultKeyboardAction(ImeAction.Done)
                        } else if (commit(listOf(text)).isEmpty()) {
                            text = ""
                        }
                    }),
                    singleLine = true,
                    interactionSource = typing,
                    cursorBrush = SolidColor(colors.accentText.color),
                    decorationBox = { field ->
                        Box(
                            Modifier
                                .heightIn(min = metrics.height - PMGeometry.bothEdges(space.s1))
                                .pmFieldName(facts.name),
                            contentAlignment = Alignment.CenterStart,
                        ) {
                            // Only while empty: the chips are the value.
                            if (values.isEmpty() && text.isEmpty()) {
                                props.placeholder?.let { PMFieldPlaceholder(it, metrics.text.textStyle) }
                            }
                            field()
                        }
                    },
                )
            }
            // The removal's announcement, read politely when it changes.
            PMAnnouncement(announcement)
        }
    }

    /** The `scale-fade` binding's starting scale at the control class: the motion spec's 0.90. */
    private const val CHIP_FROM = 0.9f
}

/** TagInput's states, from the spec's States table. */
object TagInputStates : PMStates {
    override val member = "TagInput"

    private const val invite = "Invite"
    private val invites = listOf("ada@relay.dev", "grace@relay.dev", "alan@relay.dev")
    private val labels = listOf(
        "needs-triage",
        "customer-reported",
        "billing",
        "regression",
        "blocked-on-vendor",
        "good-first-issue",
        "awaiting-response",
        "security-review",
    )

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("empty", expect = mapOf("size" to "md", "count" to "0")) {
                PMTagInput(ariaLabel = invite, placeholder = "Add people…")
            },
            PMStateEntry("with chips", expect = mapOf("count" to "3")) {
                PMTagInput(ariaLabel = invite, defaultValue = invites)
            },
            PMStateEntry("wrapped — the one Input that grows", expect = mapOf("count" to "8")) {
                PMTagInput(ariaLabel = "Labels", defaultValue = labels)
            },
            PMStateEntry("at max — the entry kept, taking no text", expect = mapOf("state" to "at-max")) {
                PMTagInput(ariaLabel = invite, defaultValue = invites, max = 3.0)
            },
            PMStateEntry("sizes — the chips one size at every field size", expect = mapOf("size" to "sm")) {
                Sizes()
            },
            PMStateEntry("size sm", expect = mapOf("size" to "sm")) {
                PMTagInput(ariaLabel = invite, defaultValue = invites.take(2), size = PMControlSize.Sm)
            },
            PMStateEntry("size lg", expect = mapOf("size" to "lg")) {
                PMTagInput(ariaLabel = invite, defaultValue = invites.take(2), size = PMControlSize.Lg)
            },
            PMStateEntry("invalid", expect = mapOf("invalid" to "true")) {
                PMTagInput(ariaLabel = invite, defaultValue = invites, invalid = true)
            },
            PMStateEntry("disabled — the removes go with the affordance", expect = mapOf("disabled" to "true")) {
                PMTagInput(ariaLabel = invite, defaultValue = invites, disabled = true)
            },
        )

    /** The three sizes, one above the other. */
    @Composable
    private fun Sizes() {
        Column(verticalArrangement = Arrangement.spacedBy(PM.theme.defaultDensity.spacing.s3)) {
            for (size in PMControlSize.entries) {
                PMTagInput(ariaLabel = "$invite ${size.value}", defaultValue = invites.take(2), size = size)
            }
        }
    }
}
