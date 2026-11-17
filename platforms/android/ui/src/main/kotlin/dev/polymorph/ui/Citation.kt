// Citation (`design/components/citation.md`), adapted: a link to the source;
// touch loses only the hover preview. The `[1]` after a sentence in a model's
// reply, numbered as the reply's SourceList numbers it, opening the page the
// sentence rests on.
//
// The mark is Badge's soft accent cell as a link: `text.xs` in `accent.text`
// on `accent.subtle` at `radius.detail`, `space.1` either side of the number
// and `space.1` off the sentence, never narrower than the `text.xs` line box,
// so `1` and `12` are the same kind of mark; no underline, because the wash
// says it is a link. Under the pointer and while pressed the wash is one step
// up (`accent.subtle.hover`), over the control duration; keyboard focus draws
// the focus ring. A press opens `source.href` through the composition's
// `LocalUriHandler`, so the app decides where it goes; a handler that cannot
// open it leaves the mark doing nothing.
//
// The mark's touch area is a slot the hit target square (`pmHitTarget`), the
// mark at its top start, where the web's mark sits after its sentence: a
// touch area must be the mark's own, so marks set one after another are a
// hit target apart. Set in a paragraph as inline content, the mark has the
// size of its place in the line, and Compose extends its touch area to the
// hit target over the words around it; Markdown keeps room for that area
// above and below the paragraph and after its lines' end (`pmMarkReach`),
// before a mark that begins a line (`pmMarkLeadContent`) and between two marks
// (`pmMarkGapContent`).
//
// TalkBack reads the mark as "{index}. {title}", so it says which source, not
// just a number. The hover preview (the title, the domain and the passage) is
// never essential, because all three are on the destination, and a touch
// screen has no hover to open it, so it is not drawn. A composable cannot sit
// inside a wrapped paragraph's words, so on its own the mark sits after a
// line of text; Markdown sets it in its paragraphs as inline content.

package dev.polymorph.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

object PMCitation : PMCitationRendering {
    @Composable
    override fun Render(props: PMCitationProps) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val motion = theme.defaultMotion
        val uri = LocalUriHandler.current
        val index = props.index.toInt()
        val interaction = remember { MutableInteractionSource() }
        val hovered by interaction.collectIsHoveredAsState()
        val pressed by interaction.collectIsPressedAsState()
        val focused by interaction.collectIsFocusedAsState()
        val wash by animateColorAsState(
            (if (hovered || pressed) theme.colors.accentSubtleHover else theme.colors.accentSubtle).color,
            motion.easing.standard.tween(motion.duration.control),
            label = "mark",
        )
        val line = theme.text.xs.lineBox.dp
        val shape = theme.rounded(theme.radius.detail)
        val open: () -> Unit = { runCatching { uri.openUri(props.source.href) } }

        Box(
            Modifier
                .pmMember("Citation", mapOf("index" to index.toString()))
                // The click before the clearing semantics, so it is the mark's action.
                .clickable(interactionSource = interaction, indication = null, onClick = open)
                .clearAndSetSemantics {
                    contentDescription = "$index. ${props.source.title}"
                    onClick {
                        open()
                        true
                    }
                }
                .pmHitTarget(alignment = Alignment.TopStart)
                .padding(start = space.s1),
        ) {
            Box(
                Modifier
                    .pmFocusRing(focused, theme.radius.detail.dp)
                    .background(wash, shape)
                    .widthIn(min = line)
                    .heightIn(min = line)
                    .padding(horizontal = space.s1),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = index.toString(),
                    style = theme.text.xs.textStyle,
                    color = theme.colors.accentText.color,
                    textAlign = TextAlign.Center,
                    maxLines = 1,
                )
            }
        }
    }
}

/** Citation's states, from the spec's States table: a mark after a claim, two marks, and two digits. */
object CitationStates : PMStates {
    override val member = "Citation"

    private const val claim = "Retries carry the original idempotency key"
    private val docs = PMCitationSource(
        title = "Idempotent requests",
        href = "https://docs.example.com/idempotency",
        domain = "docs.example.com",
        snippet = "Send the same key with every retry of a request.",
    )
    private val blog = PMCitationSource(title = "Designing retries", href = "https://blog.example.com/retries")

    /** The claim, which wraps to leave the marks their slots, then the marks. */
    @Composable
    private fun After(content: @Composable () -> Unit) {
        val theme = PM.theme
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(0.dp)) {
            Text(
                claim,
                style = theme.text.md.textStyle,
                color = theme.colors.textPrimary.color,
                modifier = Modifier.weight(1f, fill = false).clearAndSetSemantics {},
            )
            content()
        }
    }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("in a sentence", expect = mapOf("index" to "1", "label" to "1. Idempotent requests")) {
                After { PMCitation(index = 1.0, source = docs) }
            },
            PMStateEntry("two marks", expect = mapOf("index" to "1")) {
                After {
                    PMCitation(index = 1.0, source = docs)
                    PMCitation(index = 2.0, source = blog)
                }
            },
            PMStateEntry("two digits — the same square, wider", expect = mapOf("index" to "11", "label" to "11. Designing retries")) {
                After { PMCitation(index = 11.0, source = blog) }
            },
        )
}
