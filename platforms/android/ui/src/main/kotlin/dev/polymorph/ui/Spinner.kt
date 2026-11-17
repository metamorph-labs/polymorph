// Spinner (`design/components/spinner.md`): the `loading` glyph on the `spin`
// ambient pattern, with a name. It is `PMSpinGlyph`, the glyph a loading
// Button draws, at the theme's icon size for `size`. It owns no layout and
// sets no colour: it draws in the content colour of where it sits
// (`LocalContentColor`, which `ProvidePMTheme` sets to `text.primary`), as the
// web's `currentColor`. Only the glyph turns; the root does not. At the `none`
// temperament the glyph stands still, and a still glyph under its name still
// says that something is loading.
//
// To accessibility it is one node, Android's indeterminate progress indicator,
// named by `label` ("Loading" by default), in a polite live region: the web's
// `role="status"`, which TalkBack reads without interrupting what it is
// saying. Compose has no call that announces a node once when it appears, so
// the live region is the announcement.

package dev.polymorph.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.progressBarRangeInfo

object PMSpinner : PMSpinnerRendering {
    @Composable
    override fun Render(props: PMSpinnerProps) {
        val size = props.size ?: PMControlSize.Md
        val label = props.label ?: PMSpecDefault.strings.loading

        Box(
            Modifier
                .pmMember("Spinner", mapOf("size" to size.value))
                .clearAndSetSemantics {
                    contentDescription = label
                    progressBarRangeInfo = ProgressBarRangeInfo.Indeterminate
                    liveRegion = LiveRegionMode.Polite
                },
        ) {
            PMSpinGlyph(size, LocalContentColor.current)
        }
    }
}

/**
 * Spinner's states, from the spec's States table: the three sizes, a label
 * that says what is loading, and the colour of its context. Each sits in the
 * content colour an app under `ProvidePMTheme` gives it, `text.primary`.
 */
object SpinnerStates : PMStates {
    override val member = "Spinner"

    @Composable
    private fun InApp(content: @Composable () -> Unit) {
        CompositionLocalProvider(LocalContentColor provides PM.theme.colors.textPrimary.color, content = content)
    }

    override val entries: List<PMStateEntry>
        get() = PMControlSize.entries.map { size ->
            PMStateEntry("size ${size.value}", expect = mapOf("size" to size.value, "label" to "Loading")) {
                InApp { PMSpinner(size = size) }
            }
        } + listOf(
            PMStateEntry(
                "a label that says what is loading",
                expect = mapOf("size" to "md", "label" to "Fetching tickets"),
            ) { InApp { PMSpinner(label = "Fetching tickets") } },
            PMStateEntry(
                "takes its colour from where it sits",
                expect = mapOf("size" to "lg", "label" to "Deleting"),
            ) {
                CompositionLocalProvider(LocalContentColor provides PM.theme.colors.dangerText.color) {
                    PMSpinner(label = "Deleting", size = PMControlSize.Lg)
                }
            },
        )
}
