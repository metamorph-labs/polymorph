// SourceList (`design/components/source-list.md`): the numbered list of
// sources under a reply, which the reply's `[n]` marks point to. Timeline's
// shape for pages: drawn in the order given, one row per source, never sorted;
// an empty list draws nothing.
//
// A column `space.3` apart: the heading (the `cite` glyph and the label in the
// overline style, `text.xs`, uppercase, `text.muted`, `space.1` apart), then a
// row per source, `space.3` apart and `space.3` across: the index in
// Citation's mark (`text.xs` in `accent.text` on `accent.subtle`, a square of
// the `text.xs` line box at `radius.detail`), inert, because the title is the
// row's only link; and the body, `space.1` apart: the title in Link's
// standalone recipe (`text.sm`, `accent.text`, underlined under the pointer
// and while pressed) with the `open-external` glyph after its last word, so
// the glyph wraps with it; the domain (`text.xs`, muted); the snippet
// (`text.sm`, secondary). The title is at least the hit target tall, its text
// centred in that line (`pmHitTarget`), and the index stands on the title's
// first baseline, so the titles' touch areas are their own however close the
// rows are.
//
// The list is named by `label`. Each title opens its source through the
// composition's `LocalUriHandler`; the drawn index and the heading are hidden
// from TalkBack, because the label names the list and the number would read
// twice. Nothing moves.

package dev.polymorph.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
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
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.intl.LocaleList
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.toUpperCase
import androidx.compose.ui.unit.dp

object PMSourceList : PMSourceListRendering {
    @Composable
    override fun Render(props: PMSourceListProps) {
        if (props.sources.isEmpty()) return
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val muted = theme.colors.textMuted.color

        Column(
            Modifier
                .pmMember("SourceList", mapOf("sources" to props.sources.size.toString()))
                .semantics {
                    contentDescription = props.label
                    isTraversalGroup = true
                }
                .fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(space.s3),
        ) {
            Row(
                Modifier.clearAndSetSemantics { hideFromAccessibility() },
                horizontalArrangement = Arrangement.spacedBy(space.s1),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                PMIconView(PMIconRole.Cite, PMControlSize.Sm, tint = muted)
                Text(props.label.toUpperCase(LocaleList.current), style = theme.text.xs.textStyle, color = muted)
            }
            props.sources.forEachIndexed { index, source -> Source(index + 1, source) }
        }
    }

    /** One source: its inert index, then its title link, domain and snippet. */
    @Composable
    private fun Source(index: Int, source: PMCitationSource) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val uri = LocalUriHandler.current
        val interaction = remember { MutableInteractionSource() }
        val hovered by interaction.collectIsHoveredAsState()
        val pressed by interaction.collectIsPressedAsState()
        val focused by interaction.collectIsFocusedAsState()
        val accent = theme.colors.accentText.color
        val line = theme.text.xs.lineBox.dp
        val glyph = pmGlyphContent(EXTERNAL, PMIconRole.OpenExternal, accent)

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(space.s3)) {
            // The index stands on the title's first baseline, wherever the
            // title's line sits in its hit-target slot.
            Box(
                Modifier
                    .alignByBaseline()
                    .clearAndSetSemantics { hideFromAccessibility() }
                    .background(theme.colors.accentSubtle.color, theme.rounded(theme.radius.detail))
                    .widthIn(min = line)
                    .heightIn(min = line)
                    .padding(horizontal = space.s1),
                contentAlignment = Alignment.Center,
            ) {
                Text(index.toString(), style = theme.text.xs.textStyle, color = accent, maxLines = 1)
            }
            Column(Modifier.weight(1f).alignByBaseline(), verticalArrangement = Arrangement.spacedBy(space.s1)) {
                Text(
                    text = buildAnnotatedString {
                        append(source.title)
                        appendMark(EXTERNAL)
                    },
                    style = theme.text.sm.textStyle.copy(textDecoration = if (hovered || pressed) TextDecoration.Underline else null),
                    color = accent,
                    inlineContent = mapOf(glyph),
                    modifier = Modifier
                        // The click before the clearing semantics, so it is the title's action.
                        .clickable(interactionSource = interaction, indication = null) { runCatching { uri.openUri(source.href) } }
                        .clearAndSetSemantics { contentDescription = source.title }
                        .pmHitTarget(horizontal = false, alignment = Alignment.CenterStart)
                        .pmFocusRing(focused, theme.radius.sm.dp),
                )
                source.domain?.let { Text(it, style = theme.text.xs.textStyle, color = theme.colors.textMuted.color) }
                source.snippet?.let { Text(it, style = theme.text.sm.textStyle, color = theme.colors.textSecondary.color) }
            }
        }
    }

    private const val EXTERNAL = "pm.external"
}

/** SourceList's states, from the spec's States table. The empty list draws nothing, so it has no entry. */
object SourceListStates : PMStates {
    override val member = "SourceList"

    private const val label = "Sources"

    val sources = listOf(
        PMCitationSource(
            title = "Idempotent requests",
            href = "https://docs.example.com/idempotency",
            domain = "docs.example.com",
            snippet = "Send the same key with every retry of a request, and the receiver applies it once.",
        ),
        PMCitationSource(
            title = "Designing robust retries with exponential backoff and jitter",
            href = "https://blog.example.com/retries",
            domain = "blog.example.com",
            snippet = "Double the wait after each failure, and cap it.",
        ),
        PMCitationSource(title = "HTTP 429 Too Many Requests", href = "https://reference.example.org/429", domain = "reference.example.org"),
    )

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("three sources", expect = mapOf("label" to label, "sources" to "3")) { PMSourceList(label = label, sources = sources) },
            PMStateEntry("titles only", expect = mapOf("sources" to "3")) {
                PMSourceList(label = label, sources = sources.map { PMCitationSource(title = it.title, href = it.href) })
            },
            PMStateEntry("one source", expect = mapOf("sources" to "1")) { PMSourceList(label = label, sources = sources.take(1)) },
        )
}
