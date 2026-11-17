// ModeSwitch (`design/components/mode-switch.md`): SegmentedControl's preset
// for the app's colour mode, Light, Dark and System, in that order, with the
// `mode-light`, `mode-dark` and `mode-system` glyphs, as Android's dark theme
// guidance has an app offer them. It draws SegmentedControl (`PMSegmentedControl`)
// at `size` and carries its own identity on the track's box: the track, the
// segments, the chip, the press and the focus ring are SegmentedControl's, and
// so are the semantics, a selectable group named by `label` whose segments are
// radio buttons named by their words.
//
// The mode is the app's: the Compose foundation draws the mode the app
// provides (`ProvidePMTheme`'s `dark`, `LocalPMDark`), and nothing in a member
// can change what is provided above it. Without `value` the member shows that
// mode as a preference, System while the app provides none and the members
// follow the system's mode, and a choice calls `onChange`, which the app
// applies by providing the new mode. With `value` it shows `value`, and a
// choice calls `onChange` and nothing else. The words are `messages`, or
// `PMStrings`' English ("Light", "Dark", "System").

package dev.polymorph.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier

object PMModeSwitch : PMModeSwitchRendering {
    @Composable
    override fun Render(props: PMModeSwitchProps) {
        val strings = PMSpecDefault.strings
        val words = props.messages ?: PMModeSwitchMessages(
            light = strings.modeLight,
            dark = strings.modeDark,
            system = strings.modeSystem,
        )
        val provided = when (LocalPMDark.current) {
            null -> PMModePreference.System
            true -> PMModePreference.Dark
            false -> PMModePreference.Light
        }
        val chosen = props.value ?: provided
        val size = props.size ?: PMModeSwitchSize.Md
        val disabled = props.disabled ?: false
        val attributes = buildMap {
            put("size", size.value)
            put("checked", chosen.value)
            if (disabled) put("disabled", "true")
        }

        Box(Modifier.pmMember("ModeSwitch", attributes)) {
            PMSegmentedControl(
                disabled = disabled,
                label = props.label,
                onChange = { choice ->
                    PMModePreference.entries.firstOrNull { it.value == choice }?.let { props.onChange?.invoke(it) }
                },
                options = listOf(
                    PMSegmentedControlOption(PMModePreference.Light.value, words.light, PMIconRole.ModeLight),
                    PMSegmentedControlOption(PMModePreference.Dark.value, words.dark, PMIconRole.ModeDark),
                    PMSegmentedControlOption(PMModePreference.System.value, words.system, PMIconRole.ModeSystem),
                ),
                size = if (size == PMModeSwitchSize.Sm) PMSegmentedControlSize.Sm else PMSegmentedControlSize.Md,
                value = chosen.value,
            )
        }
    }
}

/**
 * ModeSwitch's states, from the spec's States table. The uncontrolled entry
 * shows the mode each pass provides; the others hold their choice.
 */
object ModeSwitchStates : PMStates {
    override val member = "ModeSwitch"

    private const val LABEL = "Appearance"

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("uncontrolled — the document’s preference", expect = mapOf("size" to "md")) {
                PMModeSwitch(label = LABEL)
            },
            PMStateEntry("controlled — the application holds the choice", expect = mapOf("checked" to "dark")) {
                var held by remember { mutableStateOf(PMModePreference.Dark) }
                PMModeSwitch(label = LABEL, onChange = { held = it }, value = held)
            },
            PMStateEntry("sm", expect = mapOf("size" to "sm", "checked" to "system")) {
                PMModeSwitch(label = LABEL, size = PMModeSwitchSize.Sm, value = PMModePreference.System)
            },
            PMStateEntry("disabled — while the application saves the last choice", expect = mapOf("disabled" to "true")) {
                PMModeSwitch(disabled = true, label = LABEL, value = PMModePreference.Light)
            },
            PMStateEntry("localized", expect = mapOf("checked" to "light")) {
                PMModeSwitch(
                    label = "Apparence",
                    messages = PMModeSwitchMessages(light = "Clair", dark = "Sombre", system = "Système"),
                    value = PMModePreference.Light,
                )
            },
        )
}
