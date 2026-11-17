// SearchInput (`design/components/search-input.md`): an Input preset for
// searching. It is `PMInput` with the `search` icon, the clear button and the
// search field's keyboard (its action key searches), and an optional shortcut
// hint in the trailing slot, drawn as one `PMKbd`. The hint is display only:
// it shows while the field is empty, unfocused and enabled, and gives way to
// the clear button. It is decorative, as the web's `aria-hidden` hint is, so
// it is not spoken. Like the web member, the field fills the width it is
// given.
//
// The root is a frame around the Input, carrying the member's attributes
// (`size`, `shortcut` while the hint shows, `disabled`), as the web's wrapper
// carries `data-shortcut`; the Input inside is the field TalkBack reads, named
// by `ariaLabel` or its FormField's label, as on Input. `clearLabel` names the
// clear button ("Clear" by default).
//
// `placeholder` is "Search…" unless given, the spec's default
// (`PMStrings.search`), which an app translates. `id`, `name` and the
// `aria-describedby`/`aria-labelledby` ids have no Compose counterpart.

package dev.polymorph.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics

object PMSearchInput : PMSearchInputRendering {
    @Composable
    override fun Render(props: PMSearchInputProps) {
        val size = props.size ?: PMControlSize.Md
        val disabled = (props.disabled ?: false) || !LocalPMEnabled.current
        var mirror by remember { mutableStateOf(props.defaultValue ?: "") }
        var focused by remember { mutableStateOf(false) }
        val current = props.value ?: mirror
        // The hint gives way to the clear button: once the field has a value,
        // clearing it is more useful than a reminder of the shortcut.
        val shortcut = props.shortcut?.takeIf { current.isEmpty() && !focused && !disabled }
        val attributes = buildMap {
            put("size", size.value)
            if (shortcut != null) put("shortcut", "true")
            if (disabled) put("disabled", "true")
        }

        Box(Modifier.pmMember("SearchInput", attributes).fillMaxWidth()) {
            PMInput(
                ariaLabel = props.ariaLabel,
                clearable = true,
                clearLabel = props.clearLabel,
                disabled = props.disabled,
                icon = PMIconRole.Search,
                onBlur = { focused = false },
                onChange = { next ->
                    mirror = next
                    props.onChange?.invoke(next)
                },
                onFocus = { focused = true },
                placeholder = props.placeholder ?: PMSpecDefault.strings.search,
                size = size,
                trailing = if (shortcut != null) { { Hint(shortcut) } } else null,
                type = PMInputType.Search,
                value = current,
            )
        }
    }

    /**
     * The shortcut as a key, decorative: its semantics are cleared, so nothing
     * of it merges into the field's name.
     */
    @Composable
    private fun Hint(shortcut: String) {
        Box(Modifier.clearAndSetSemantics {}) { PMKbd(children = shortcut) }
    }
}

/**
 * SearchInput's states, from the spec's States table. The focused state, with
 * its hint hidden, exists only after a tap, as on the web; the entry in a
 * FormField is FormField's to draw, because the harness reads the first member
 * in the tree as the root.
 */
object SearchInputStates : PMStates {
    override val member = "SearchInput"

    private const val label = "Search tickets"
    private const val shortcut = "⌘K"

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry(
                "empty, offering the shortcut that reaches it",
                expect = mapOf("shortcut" to "true", "size" to "md", "contains" to "Input"),
            ) { PMSearchInput(ariaLabel = label, placeholder = "Search…", shortcut = shortcut) },
            PMStateEntry(
                "with a value — the hint yields to the clear button",
                expect = mapOf("contains" to "Input"),
            ) { PMSearchInput(ariaLabel = label, defaultValue = "webhook", shortcut = shortcut) },
            PMStateEntry("no shortcut at all", expect = mapOf("size" to "md")) {
                PMSearchInput(ariaLabel = label, placeholder = "Search…")
            },
            PMStateEntry("small — the size a filter row uses", expect = mapOf("size" to "sm", "shortcut" to "true")) {
                PMSearchInput(ariaLabel = label, shortcut = shortcut, size = PMControlSize.Sm)
            },
            PMStateEntry(
                "disabled — nothing to reach, so nothing to hint at",
                expect = mapOf("disabled" to "true"),
            ) { PMSearchInput(ariaLabel = label, disabled = true, shortcut = shortcut) },
        )
}
