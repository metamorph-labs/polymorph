// ArtifactPane (`design/components/artifact-pane.md`): one artifact a turn
// produced, too big for the thread (a file, a page, a table, a preview), in a
// pane beside it. A Card for one artifact: Card's surface exactly (`bg.surface`
// inside a `border.subtle` hairline at `radius.surface`, the resting shadow and
// the top light), filling the box it is given, a header over a `border.subtle`
// hairline, and a body that is the pane's one scroll region. Not a Dialog,
// because nothing is modal, and not Tabs, because the views are readings of one
// thing. ConversationPage decides where the pane sits.
//
// The header is one wrapping row, `space.2` between rows and `space.3` between
// items, inset `space.3` and `space.4`: the mark (the kind's `sm` glyph in
// `text.muted`: `terminal`, `document`, `table`, `browser`, and `artifact`
// with no kind; the `sm` Spinner while the artifact is still written, named
// `streamingLabel`, "{title}: still being written" by default), the heading (the title in `text.md` at the
// `text.xl` weight and face, Heading level 4's cell, on one line, then `meta` in
// `text.xs`, muted), the switch between readings when there are two or more,
// the app's actions, and the close Button (`ghost/neutral/sm`, icon-only
// `close`, named by `closeLabel`) when `onClose` is set. The heading grows from
// a basis of twice `space.10` (`PMRecipe.artifactHeadingBasis`), so in a
// narrow pane the controls wrap under the title rather than the title being
// cut short beside them.
//
// The switch is SegmentedControl at `sm`, named by `viewsLabel` ("View"): the
// views are readings of one thing, not the peer sections Tabs hold. Switching
// readings re-renders the body and nothing else moves. `view` with
// `onViewChange` is the controlled pair; without it the pane keeps its own,
// from `defaultView` or the first view.
//
// The body shows the chosen reading's content, or `children` when `views` is
// absent or empty, padded `space.4`. It scrolls only while the content is
// taller than the pane, and is then named by the title, as the web's body is a
// group named by the title once it overflows. The pane is one group named by
// its title, which is a heading. At the glass depth the web draws the surface
// material; this pane wears Card's opaque surface at every depth, as Card does
// here.

package dev.polymorph.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow

object PMArtifactPane : PMArtifactPaneRendering {
    @Composable
    override fun Render(props: PMArtifactPaneProps) {
        val theme = PM.theme
        val colors = theme.colors
        val space = theme.defaultDensity.spacing
        val strings = PMSpecDefault.strings
        val views = props.views ?: emptyList()
        var own by remember { mutableStateOf(props.defaultView ?: views.firstOrNull()?.id) }
        val shown = views.firstOrNull { it.id == (props.view ?: own) } ?: views.firstOrNull()
        val scroll = rememberScrollState()
        val shape = theme.rounded(theme.radius.surface)
        val streaming = props.streaming ?: false
        val attributes = buildMap {
            props.kind?.let { put("kind", it.value) }
            if (streaming) put("state", "streaming")
            shown?.let { put("view", it.id) }
        }

        Column(
            Modifier
                .pmMember("ArtifactPane", attributes)
                .semantics {
                    contentDescription = props.title
                    isTraversalGroup = true
                }
                .fillMaxSize()
                .pmShadow(theme.shadows.resting, shape)
                .clip(shape)
                .background(colors.bgSurface.color)
                .pmInsetShadow(theme.shadows.insetTop, shape)
                .border(PMGeometry.hairline, colors.borderSubtle.color, shape),
        ) {
            FlowRow(
                Modifier.fillMaxWidth().padding(horizontal = space.s4, vertical = space.s3),
                horizontalArrangement = Arrangement.spacedBy(space.s3),
                verticalArrangement = Arrangement.spacedBy(space.s2),
                itemVerticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.align(Alignment.CenterVertically)) {
                    if (streaming) {
                        PMSpinner(label = props.streamingLabel ?: strings.artifactStreaming(props.title), size = PMControlSize.Sm)
                    } else {
                        PMIconView(glyph(props.kind), PMControlSize.Sm, tint = colors.textMuted.color)
                    }
                }
                Column(Modifier.weight(1f).widthIn(min = space.s10 * PMRecipe.artifactHeadingBasis)) {
                    Text(
                        text = props.title,
                        style = theme.text.md.heading(like = theme.text.xl).textStyle,
                        color = colors.textPrimary.color,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.semantics { heading() },
                    )
                    props.meta?.let { Text(it, style = theme.text.xs.textStyle, color = colors.textMuted.color) }
                }
                if (views.size >= 2) {
                    PMSegmentedControl(
                        label = props.viewsLabel ?: strings.artifactViews,
                        onChange = { id ->
                            own = id
                            props.onViewChange?.invoke(id)
                        },
                        options = views.map { PMSegmentedControlOption(value = it.id, label = it.label) },
                        size = PMSegmentedControlSize.Sm,
                        value = shown?.id,
                    )
                }
                props.actions?.let { actions ->
                    Row(horizontalArrangement = Arrangement.spacedBy(space.s1), verticalAlignment = Alignment.CenterVertically) { actions() }
                }
                props.onClose?.let { close ->
                    PMButton(
                        icon = PMIconRole.Close,
                        iconOnly = true,
                        label = props.closeLabel ?: strings.close,
                        onClick = close,
                        size = PMControlSize.Sm,
                        appearance = PMButtonAppearance.GhostNeutral,
                    )
                }
            }
            PMRule(colors.borderSubtle)
            Box(
                Modifier
                    .fillMaxWidth()
                    .weight(1f, fill = false)
                    .semantics { if (scroll.maxValue > 0) contentDescription = props.title }
                    .verticalScroll(scroll),
            ) {
                Box(Modifier.fillMaxWidth().padding(space.s4)) {
                    val content = shown?.content ?: props.children
                    content?.invoke()
                }
            }
        }
    }

    /** The kind's glyph: the tier's own artifact glyph with no kind. */
    private fun glyph(kind: PMArtifactPaneKind?): PMIconRole = when (kind) {
        PMArtifactPaneKind.Code -> PMIconRole.Terminal
        PMArtifactPaneKind.Document -> PMIconRole.Document
        PMArtifactPaneKind.Data -> PMIconRole.Table
        PMArtifactPaneKind.Preview -> PMIconRole.Browser
        null -> PMIconRole.Artifact
    }
}

/**
 * ArtifactPane's states, from the spec's States table, each in a box the
 * fixture sizes, as ConversationPage sizes one.
 */
object ArtifactPaneStates : PMStates {
    override val member = "ArtifactPane"

    private const val title = "retry.ts"
    private const val meta = "TypeScript · 42 lines"
    private const val code = "export function retry(key: string) {\n  return send(key, { attempts: 5, backoff: 'doubling' })\n}"
    private const val summary = "## Retry\n\nEvery retry carries the **original** idempotency key, so the receiver applies a delivery once."

    @Composable
    private fun Sized(content: @Composable () -> Unit) {
        Box(Modifier.fillMaxWidth().height(PM.theme.defaultDensity.spacing.s10 * BOX)) { content() }
    }

    @Composable
    private fun Actions() {
        PMButton(icon = PMIconRole.Copy, iconOnly = true, label = "Copy", size = PMControlSize.Sm, appearance = PMButtonAppearance.GhostNeutral)
        PMButton(icon = PMIconRole.Download, iconOnly = true, label = "Download", size = PMControlSize.Sm, appearance = PMButtonAppearance.GhostNeutral)
    }

    /** The harness box, in multiples of `space.10`: the spec's. */
    private const val BOX = 4

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("code — a CodeBlock, actions and close", expect = mapOf("kind" to "code", "label" to title, "contains" to "CodeBlock,Button")) {
                Sized {
                    PMArtifactPane(actions = { Actions() }, kind = PMArtifactPaneKind.Code, meta = meta, onClose = {}, title = title) {
                        PMCodeBlock(children = code)
                    }
                }
            },
            PMStateEntry("two readings — the switch", expect = mapOf("kind" to "document", "view" to "preview", "contains" to "SegmentedControl")) {
                Sized {
                    PMArtifactPane(
                        kind = PMArtifactPaneKind.Document,
                        title = "retry.md",
                        views = listOf(
                            PMArtifactView(id = "preview", label = "Preview") { PMMarkdown(children = summary, size = PMMarkdownSize.Sm) },
                            PMArtifactView(id = "source", label = "Source") { PMCodeBlock(children = summary) },
                        ),
                    )
                }
            },
            PMStateEntry("streaming — the spinner", expect = mapOf("state" to "streaming", "contains" to "Spinner")) {
                Sized { PMArtifactPane(kind = PMArtifactPaneKind.Code, streaming = true, title = title) { PMCodeBlock(children = code.take(STREAMED)) } }
            },
            PMStateEntry("a long artifact — the body scrolls", expect = mapOf("kind" to "code")) {
                Sized {
                    PMArtifactPane(kind = PMArtifactPaneKind.Code, title = title) {
                        PMCodeBlock(children = List(LONG) { code }.joinToString("\n\n"))
                    }
                }
            },
            PMStateEntry("no kind — the artifact glyph", expect = mapOf("label" to "Untitled")) {
                Sized { PMArtifactPane(title = "Untitled") }
            },
        )

    private const val STREAMED = 40
    private const val LONG = 4
}
