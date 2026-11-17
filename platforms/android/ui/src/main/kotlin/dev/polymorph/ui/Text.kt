// Text (`design/components/text.md`): a paragraph of body text, at `text.md` or
// `text.sm`, in the primary or the secondary tone. Never below secondary: muted
// text is a caption, which the member that owns it draws.
//
// `children` is `PMContent`, so the paragraph is whatever the app draws,
// usually a Material `Text`; the member provides the step and the tone to it as
// Material's text style and content colour, which a `Text` inherits. Inline
// emphasis is the app's `SpanStyle` on a run of an `AnnotatedString`, at the
// `text.xl` weight in the primary colour, the web's `strong` cell.
//
// `lines` is not drawn: Material's `Text` takes its line limit as an argument,
// which no composition local carries, so an app that cuts a paragraph passes
// `maxLines` to its own `Text` (`packages/native/src/undrawn.ts`).

package dev.polymorph.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle

object PMText : PMTextRendering {
    @Composable
    override fun Render(props: PMTextProps) {
        val theme = PM.theme
        val size = props.size ?: PMTextSize.Md
        val tone = props.tone ?: PMTextTone.Primary
        val style = if (size == PMTextSize.Sm) theme.text.sm else theme.text.md
        val color = if (tone == PMTextTone.Secondary) theme.colors.textSecondary else theme.colors.textPrimary

        CompositionLocalProvider(LocalTextStyle provides style.textStyle, LocalContentColor provides color.color) {
            // One element: the paragraph is read whole.
            Box(
                Modifier
                    .pmMember("Text", mapOf("size" to size.value, "tone" to tone.value))
                    .semantics(mergeDescendants = true) {},
            ) {
                props.children()
            }
        }
    }
}

/** Text's states, from the spec's States table. */
object TextStates : PMStates {
    override val member = "Text"

    private const val draftsAre = "Drafts are "
    private const val kept = "kept"
    private const val untilSent = " until you send them."

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("body", expect = mapOf("size" to "md", "tone" to "primary", "label" to PMSamples.body)) {
                PMText { Text(PMSamples.body) }
            },
            PMStateEntry(
                "secondary sm",
                expect = mapOf("size" to "sm", "tone" to "secondary", "label" to PMSamples.note),
            ) {
                PMText(size = PMTextSize.Sm, tone = PMTextTone.Secondary) { Text(PMSamples.note) }
            },
            PMStateEntry("with emphasis", expect = mapOf("size" to "md", "tone" to "primary")) {
                val theme = PM.theme
                val strong = SpanStyle(fontWeight = FontWeight(theme.text.xl.weight), color = theme.colors.textPrimary.color)
                PMText {
                    Text(
                        buildAnnotatedString {
                            append(draftsAre)
                            withStyle(strong) { append(kept) }
                            append(untilSent)
                        },
                    )
                }
            },
        )
}
