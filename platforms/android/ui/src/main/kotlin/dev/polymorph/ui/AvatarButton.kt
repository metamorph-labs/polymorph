// AvatarButton (`design/components/avatar-button.md`): a Button preset whose
// face is an Avatar, such as the trigger of an account menu. It is Button's
// ghost/neutral cell by reference (`PMButtonFrame`), in every state, with the
// corners at the pill radius: a face is round at every geometry, so its wash,
// its press ripple and its focus ring are round too. The face is `PMAvatar` at
// the button's size inside a `space.1` gutter, and the box is never smaller
// than the size's control height, so at `sm` and `md` it is Button's icon-only
// square. The touch area is the theme's hit target, as Button's is.
//
// `label` names the action ("Account menu"), never the person: the button is
// one element with that name, and the face under it is not read. While
// `loading` the spinning glyph takes the face's place, the box keeps its size,
// and a press does nothing; the button reports "Loading" as its state
// description. Disabled, the button is Button's disabled cell and the face is
// desaturated and drawn at the recipe's opacity
// (`PMRecipe.avatarButtonFaceDisabledOpacity`), because a face has fills of
// its own. `pressed` is the toggleable state and `current` the selected state,
// both as Button's are.
//
// As the trigger of a Menu, a Popover or a Dialog it runs the overlay's
// opening action after its own (`LocalPMTriggerAction`), as Button does.

package dev.polymorph.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.graphicsLayer

object PMAvatarButton : PMAvatarButtonRendering {
    @Composable
    override fun Render(props: PMAvatarButtonProps) {
        val size = props.size ?: PMControlSize.Md
        val loading = props.loading ?: false
        val disabled = (props.disabled ?: false) || !LocalPMEnabled.current
        val trigger = LocalPMTriggerAction.current

        // Loading takes precedence over the toggle in the state, as on the
        // web; the semantics still report the toggle.
        val state = if (loading) "loading" else props.pressed?.let { if (it) "on" else "off" }
        val attributes = buildMap {
            put("variant", "ghost")
            put("tone", "neutral")
            put("size", size.value)
            state?.let { put("state", it) }
            if (disabled) put("disabled", "true")
        }
        val grey = if (disabled) ColorFilter.colorMatrix(ColorMatrix().apply { setToSaturation(0f) }) else null

        PMButtonFrame(
            appearance = PMButtonAppearance.GhostNeutral,
            size = size,
            name = props.label,
            onClick = {
                props.onClick?.invoke()
                trigger?.invoke()
            },
            modifier = Modifier.pmMember("AvatarButton", attributes),
            disabled = disabled,
            loading = loading,
            iconOnly = true,
            latched = props.pressed,
            current = props.current == true,
            value = if (loading) PMSpecDefault.strings.loading else null,
            corners = PMButtonCorners.Round,
        ) { text ->
            Box(Modifier.padding(PM.theme.defaultDensity.spacing.s1), contentAlignment = Alignment.Center) {
                // The face stays in the layout while loading, so the box keeps its size.
                Box(
                    Modifier.graphicsLayer {
                        alpha = when {
                            loading -> 0f
                            disabled -> PMRecipe.avatarButtonFaceDisabledOpacity
                            else -> 1f
                        }
                        colorFilter = grey
                    },
                ) { PMAvatar(name = props.name, size = size, src = props.src) }
                if (loading) PMSpinGlyph(size, text)
            }
        }
    }
}

/**
 * AvatarButton's states, from the spec's States table. The picture entry
 * shows its initials until the app's loader draws it, and the harness has
 * none, as Avatar's does.
 */
object AvatarButtonStates : PMStates {
    override val member = "AvatarButton"

    private const val ada = "Ada Lovelace"
    private const val account = "Account menu"
    private const val tickets = "Show my tickets"
    private const val photo = "https://example.com/avatars/ada.png"

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry(
                "initials — named by the action, not the person",
                expect = mapOf("variant" to "ghost", "tone" to "neutral", "size" to "md", "label" to account),
            ) { PMAvatarButton(label = account, name = ada) },
            PMStateEntry("an image, over the initials it replaces", expect = mapOf("label" to account)) {
                PMAvatarButton(label = account, name = ada, src = photo)
            },
            PMStateEntry("no name — the user glyph", expect = mapOf("label" to "Sign in")) {
                PMAvatarButton(label = "Sign in", name = "")
            },
        ) + listOf(PMControlSize.Sm, PMControlSize.Lg).map { size ->
            PMStateEntry("size ${size.value}", expect = mapOf("size" to size.value)) {
                PMAvatarButton(label = account, name = ada, size = size)
            }
        } + listOf(
            PMStateEntry("three sizes", expect = mapOf("size" to "sm")) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(PM.theme.defaultDensity.spacing.s3),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    for (size in PMControlSize.entries) {
                        PMAvatarButton(label = "Account menu (${size.value})", name = ada, size = size)
                    }
                }
            },
            PMStateEntry("loading", expect = mapOf("state" to "loading", "value" to "Loading")) {
                PMAvatarButton(label = account, loading = true, name = ada)
            },
            PMStateEntry("disabled — the face desaturated", expect = mapOf("disabled" to "true")) {
                PMAvatarButton(disabled = true, label = account, name = ada)
            },
            PMStateEntry("pressed on — the active cell, latched", expect = mapOf("state" to "on")) {
                PMAvatarButton(label = tickets, name = ada, pressed = true)
            },
            PMStateEntry("pressed off — the rest cell", expect = mapOf("state" to "off")) {
                PMAvatarButton(label = tickets, name = ada, pressed = false)
            },
            PMStateEntry("current", expect = mapOf("label" to "Your profile")) {
                PMAvatarButton(current = true, label = "Your profile", name = ada)
            },
        )
}
