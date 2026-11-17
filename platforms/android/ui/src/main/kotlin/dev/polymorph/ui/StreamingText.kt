// StreamingText (`design/components/streaming-text.md`): a paragraph that has
// not ended yet, such as a model's reply before it finishes. Text's recipe at
// `text.sm` or `text.md` in `text.primary`, with the caret after the last
// character while more is coming (`pmCaretContent`). The string is drawn
// verbatim: spaces and line breaks are content, and a token wider than the
// column breaks where it must rather than widening it. Before anything has
// arrived, Skeleton's bar stands at the step's exact line box, `width` 9, so
// the first word replaces it without moving the page; the bar is decorative
// and shimmers as Skeleton does.
//
// The app owns the stream: the member draws the string it is given and never
// buffers or throttles it. Finished, it draws as Text does. The web's
// `aria-busy` has no counterpart in Compose's semantics; the root carries
// `state=streaming`. Announcing the reply is not this member's job: ChatThread
// announces a turn once, when it is added, so a paragraph that grows is not
// read token by token.

package dev.polymorph.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.text.buildAnnotatedString

object PMStreamingText : PMStreamingTextRendering {
    @Composable
    override fun Render(props: PMStreamingTextProps) {
        val theme = PM.theme
        val size = props.size ?: PMStreamingTextSize.Md
        val step = if (size == PMStreamingTextSize.Sm) theme.text.sm else theme.text.md
        val streaming = props.streaming ?: false
        val pending = streaming && props.children.isEmpty()
        val attributes = buildMap {
            put("size", size.value)
            if (streaming) put("state", "streaming")
            if (pending) put("pending", "true")
        }

        if (pending) {
            Box(Modifier.pmMember("StreamingText", attributes).clearAndSetSemantics { hideFromAccessibility() }.fillMaxWidth()) {
                PMSkeleton(
                    textStep = if (size == PMStreamingTextSize.Sm) PMSkeletonTextStep.Sm else PMSkeletonTextStep.Md,
                    width = PMSkeletonWidth.Width9,
                )
            }
            return
        }
        val caret = pmCaretContent(step)
        val text = buildAnnotatedString {
            append(props.children)
            if (streaming) appendCaret()
        }
        Text(
            text = text,
            style = step.textStyle,
            color = theme.colors.textPrimary.color,
            inlineContent = if (streaming) mapOf(caret) else emptyMap(),
            modifier = Modifier.pmMember("StreamingText", attributes).pmSpokenText(text).fillMaxWidth(),
        )
    }
}

/** StreamingText's states, from the spec's States table. */
object StreamingTextStates : PMStates {
    override val member = "StreamingText"

    private const val half = "The retry now carries the original idempotency key, so the receiver"
    private const val whole = "The retry now carries the original idempotency key, so the receiver refuses a duplicate."
    private const val lines = "Retries: 5\nBackoff: doubling from 2s\nCap: 32s"

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("arriving — the caret marks where the next word lands", expect = mapOf("state" to "streaming", "size" to "md", "label" to half)) {
                PMStreamingText(children = half, streaming = true)
            },
            PMStateEntry("pending — Skeleton's bar until the first word", expect = mapOf("state" to "streaming", "pending" to "true", "hidden" to "true")) {
                PMStreamingText(children = "", streaming = true)
            },
            PMStateEntry("complete — drawn as Text", expect = mapOf("size" to "md", "label" to whole)) {
                PMStreamingText(children = whole)
            },
            PMStateEntry("sm", expect = mapOf("size" to "sm", "state" to "streaming")) {
                PMStreamingText(children = half, size = PMStreamingTextSize.Sm, streaming = true)
            },
            PMStateEntry("line breaks — kept", expect = mapOf("label" to lines)) { PMStreamingText(children = lines) },
        )
}
