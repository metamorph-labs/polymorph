// Icon (`design/components/icon.md`): the vocabulary's icon, a role drawn
// through the icon gateway (`PMIconView`) at the theme's icon size for `size`.
// It sets no colour: it draws in the content colour of where it sits, as the
// web's `currentColor`. Without a `label` it is decorative and hidden from
// accessibility, because the text beside it names the thing; with one it is
// an image named by the label.

package dev.polymorph.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.role

object PMIcon : PMIconRendering {
    @Composable
    override fun Render(props: PMIconProps) {
        val size = props.size ?: PMControlSize.Md
        Box(
            Modifier
                .pmMember("Icon", mapOf("name" to props.name.value, "size" to size.value))
                .clearAndSetSemantics {
                    val label = props.label
                    if (label == null) {
                        hideFromAccessibility()
                    } else {
                        contentDescription = label
                        role = Role.Image
                    }
                },
        ) {
            PMIconView(props.name, size)
        }
    }
}

/**
 * Icon's states, from the spec's States table. A decorative icon exposes
 * nothing to accessibility, so its entries are `hidden`. Each sits in body
 * text's colour, as an app's root provides it (`ProvidePMTheme`), or in
 * danger text's.
 */
object IconStates : PMStates {
    override val member = "Icon"

    override val entries: List<PMStateEntry>
        get() = PMControlSize.entries.map { size ->
            PMStateEntry("size ${size.value}", expect = mapOf("hidden" to "true", "size" to size.value, "name" to "add")) {
                InText { PMIcon(name = PMIconRole.Add, size = size) }
            }
        } + listOf(
            PMStateEntry("labelled — an image with a name", expect = mapOf("name" to "warning", "label" to "Warning")) {
                InText { PMIcon(label = "Warning", name = PMIconRole.Warning) }
            },
            PMStateEntry("inherits the colour of where it sits", expect = mapOf("hidden" to "true")) {
                CompositionLocalProvider(LocalContentColor provides PM.theme.colors.dangerText.color) {
                    PMIcon(name = PMIconRole.Error, size = PMControlSize.Lg)
                }
            },
        )

    /** Body text's colour around `content`. */
    @Composable
    private fun InText(content: @Composable () -> Unit) {
        CompositionLocalProvider(LocalContentColor provides PM.theme.colors.textPrimary.color, content = content)
    }
}
