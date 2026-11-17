// Separator (`design/components/separator.md`): a drawn line between content
// that spacing alone cannot separate. No margins: the gap of the Stack or
// Inline around it owns the spacing, so adding a line never changes it. The
// line is the recipe's `1px` hairline in `border.subtle` (`PMRule`). Vertical,
// it is as tall as the row it divides, as the web's `align-self: stretch`
// makes it: an Inline measures it at its line's height (`pmStretchesInRow`),
// and in a Compose `Row` it fills the row's height, so a row of intrinsic
// height (`Modifier.height(IntrinsicSize.Min)`) gives it the height of its
// tallest neighbour. A row with no height draws nothing, as on the web: there
// is nothing to divide.
//
// Decorative by default, so hidden from accessibility. A labelled Separator is
// horizontal only (a vertical one ignores the label) and is read: the word is
// content, the label in `text.xs` muted, with a rule growing on each side
// `space.3` from it. The rules stay silent. The label is drawn as given: the
// app decides the case of "OR".

package dev.polymorph.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.semantics

object PMSeparator : PMSeparatorRendering {
    @Composable
    override fun Render(props: PMSeparatorProps) {
        val theme = PM.theme
        val orientation = props.orientation ?: PMSeparatorOrientation.Horizontal
        val attributes = mapOf("orientation" to orientation.value)
        val label = props.label

        if (label != null && orientation == PMSeparatorOrientation.Horizontal) {
            Row(
                Modifier
                    .pmMember("Separator", attributes)
                    // The word is read; the rules beside it are not.
                    .clearAndSetSemantics { contentDescription = label }
                    .fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(theme.defaultDensity.spacing.s3),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                PMRule(theme.colors.borderSubtle, Modifier.weight(1f))
                Text(
                    text = label,
                    style = theme.text.xs.textStyle,
                    color = theme.colors.textMuted.color,
                    maxLines = 1,
                )
                PMRule(theme.colors.borderSubtle, Modifier.weight(1f))
            }
        } else {
            val vertical = orientation == PMSeparatorOrientation.Vertical
            PMRule(
                theme.colors.borderSubtle,
                Modifier
                    .pmMember("Separator", attributes)
                    .semantics { hideFromAccessibility() }
                    .then(if (vertical) Modifier.pmStretchesInRow().fillMaxHeight() else Modifier),
                vertical = vertical,
            )
        }
    }
}

/**
 * Separator's states, from the spec: horizontal between two paragraphs,
 * vertical in a toolbar row, and labelled. The two decorative entries expose
 * nothing to accessibility, which `hidden` tells the harness.
 */
object SeparatorStates : PMStates {
    override val member = "Separator"

    private const val or = "OR"
    private const val bold = "Bold"
    private const val italic = "Italic"

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("horizontal — between two paragraphs", expect = mapOf("orientation" to "horizontal", "hidden" to "true")) {
                Paragraphs { PMSeparator() }
            },
            PMStateEntry("vertical — as tall as the toolbar row it divides", expect = mapOf("orientation" to "vertical", "hidden" to "true")) {
                Toolbar()
            },
            PMStateEntry("labelled", expect = mapOf("orientation" to "horizontal", "label" to or)) {
                PMSeparator(label = or)
            },
        )

    /** Two paragraphs with `between` in the gap. */
    @Composable
    private fun Paragraphs(between: @Composable () -> Unit) {
        val theme = PM.theme
        Column(verticalArrangement = Arrangement.spacedBy(theme.defaultDensity.spacing.s4)) {
            Text(PMSamples.body, style = theme.text.sm.textStyle, color = theme.colors.textPrimary.color)
            between()
            Text(PMSamples.note, style = theme.text.sm.textStyle, color = theme.colors.textPrimary.color)
        }
    }

    /** A row of two words with the Separator between them, as tall as the words. */
    @Composable
    private fun Toolbar() {
        val theme = PM.theme
        Row(
            Modifier.height(IntrinsicSize.Min),
            horizontalArrangement = Arrangement.spacedBy(theme.defaultDensity.spacing.s3),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(bold, style = theme.text.sm.textStyle, color = theme.colors.textPrimary.color)
            PMSeparator(orientation = PMSeparatorOrientation.Vertical)
            Text(italic, style = theme.text.sm.textStyle, color = theme.colors.textPrimary.color)
        }
    }
}
