// ChatMessage (`design/components/chat-message.md`): one turn of a
// conversation: who said it, when, what they said, and what happened to it.
//
// `role` picks the frame and nothing else does. The model's turn is full-width
// prose with its mark at the leading edge: the content of the page, not a
// speech balloon. The reader's turn is the same column mirrored to the
// trailing edge, its content in a bubble on `bg.subtle` inside a
// `border.subtle` hairline, padded `space.3` by `space.4`, at most six
// `space.10`s wide (`PMRecipe.chatBubbleMeasure`; a short prompt stays small),
// its corners `radius.surface` but the one nearest the mark at
// `radius.control`: that one asymmetry shows which side spoke. A system notice
// is a centred line of `text.xs` in `text.muted`, with no mark and no meta: the
// thread reporting on itself.
//
// The mark is the model's (the `model` glyph, `sm`, in `accent.text` on
// `accent.subtle` inside an `accent.bg` hairline, a circle `space.7` across,
// the size of an `md` Avatar so both speakers' marks share one axis) for an
// assistant without a picture, and an `md` Avatar of the author otherwise. The
// row is `space.3` across. The body is a column `space.2` apart: the meta row
// (the author in `text.sm` at the `text.xl` weight in `text.primary`, and the
// time beside it on its baseline in `text.xs`, `text.muted`), the content (the
// app's children, `space.3` apart, at `text.md` in `text.primary` unless a
// child sets its own step), the notice of a stopped or failed turn (the app's
// `statusMessage` in `text.xs` after `warning` in `warning.text`, or `error`
// in `danger.text`), and the actions row.
//
// The actions row (`ghost/neutral/sm` icon-only Buttons, `space.1` apart,
// wrapping) always shows: touch has no hover, so the platform map draws it as
// the spec does on any screen without hover (`design/platforms/android.json`).
// It is never the only way to do anything, and its Buttons are always
// reachable.
//
// TalkBack: the turn is a group named by the author, as the web's `article`
// is. The model's mark is hidden; the Avatar is decorative beside the visible
// author, by Avatar's own rule. Inside a ChatThread, the thread runs the
// turn's arrival (`chat.message`, `pmArrival`), and a turn that joins a thread
// already on screen announces its author once, politely, as the web's log
// announces an addition; the content it then grows is not read token by
// token. The root carries `status=streaming` while the turn streams, the web's
// `aria-busy`.

package dev.polymorph.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.FirstBaseline
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

object PMChatMessage : PMChatMessageRendering {
    @Composable
    override fun Render(props: PMChatMessageProps) {
        val theme = PM.theme
        val colors = theme.colors
        val space = theme.defaultDensity.spacing
        val status = props.status ?: PMChatMessageStatus.Complete
        val attributes = buildMap {
            put("role", props.role.value)
            if (status != PMChatMessageStatus.Complete) put("status", status.value)
        }
        val root = Modifier
            .pmMember("ChatMessage", attributes)
            .semantics {
                contentDescription = props.author
                isTraversalGroup = true
            }
            .pmArrival()
            .fillMaxWidth()

        Box(root) {
            if (props.role == PMChatMessageRole.System) {
                Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                    CompositionLocalProvider(
                        LocalTextStyle provides theme.text.xs.textStyle.copy(textAlign = TextAlign.Center),
                        LocalContentColor provides colors.textMuted.color,
                    ) { props.children() }
                    Notice(props, status)
                }
            } else {
                val user = props.role == PMChatMessageRole.User
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(space.s3, if (user) Alignment.End else Alignment.Start),
                    verticalAlignment = Alignment.Top,
                ) {
                    if (user) {
                        Body(props, status, user = true, Modifier.weight(1f, fill = false))
                        Mark(props)
                    } else {
                        Mark(props)
                        Body(props, status, user = false, Modifier.weight(1f))
                    }
                }
            }
            PMArrivalAnnouncement(props.author)
        }
    }

    /** The speaker's mark: the model's circle, or the author's Avatar. */
    @Composable
    private fun Mark(props: PMChatMessageProps) {
        val theme = PM.theme
        val colors = theme.colors
        if (props.role == PMChatMessageRole.Assistant && props.avatar == null) {
            val shape = theme.rounded(theme.radius.pill)
            Box(
                Modifier
                    .clearAndSetSemantics { hideFromAccessibility() }
                    .size(theme.defaultDensity.spacing.s7)
                    .background(colors.accentSubtle.color, shape)
                    .border(PMGeometry.hairline, colors.accentBg.color, shape),
                contentAlignment = Alignment.Center,
            ) { PMIconView(PMIconRole.Model, PMControlSize.Sm, tint = colors.accentText.color) }
        } else {
            PMAvatar(name = props.author, size = PMControlSize.Md, src = props.avatar)
        }
    }

    /** The meta row, the content, the notice and the actions. */
    @Composable
    private fun Body(props: PMChatMessageProps, status: PMChatMessageStatus, user: Boolean, modifier: Modifier) {
        val theme = PM.theme
        val colors = theme.colors
        val space = theme.defaultDensity.spacing
        val align = if (user) Alignment.End else Alignment.Start
        Column(modifier, verticalArrangement = Arrangement.spacedBy(space.s2), horizontalAlignment = align) {
            Row(horizontalArrangement = Arrangement.spacedBy(space.s2)) {
                Text(
                    text = props.author,
                    style = theme.text.sm.textStyle.copy(fontWeight = FontWeight(theme.text.xl.weight)),
                    color = colors.textPrimary.color,
                    modifier = Modifier.alignByBaseline(),
                )
                props.time?.let {
                    Text(it, style = theme.text.xs.textStyle, color = colors.textMuted.color, modifier = Modifier.alignBy(FirstBaseline))
                }
            }
            val bubble = if (user) {
                val surface = theme.radius.surface.dp
                val shape = RoundedCornerShape(topStart = surface, topEnd = surface, bottomStart = surface, bottomEnd = theme.radius.control.dp)
                Modifier
                    .widthIn(max = space.s10 * PMRecipe.chatBubbleMeasure)
                    .background(colors.bgSubtle.color, shape)
                    .border(PMGeometry.hairline, colors.borderSubtle.color, shape)
                    .padding(horizontal = space.s4, vertical = space.s3)
            } else {
                Modifier.fillMaxWidth()
            }
            CompositionLocalProvider(
                LocalTextStyle provides theme.text.md.textStyle,
                LocalContentColor provides colors.textPrimary.color,
            ) {
                Column(bubble, verticalArrangement = Arrangement.spacedBy(space.s3)) { props.children() }
            }
            Notice(props, status)
            props.actions?.let { actions -> PMInline(gap = PMSpaceStep.S1, wrap = true) { actions() } }
        }
    }

    /** A stopped or failed turn's notice: the app's words after a matching glyph. */
    @Composable
    private fun Notice(props: PMChatMessageProps, status: PMChatMessageStatus) {
        val message = props.statusMessage ?: return
        val colors = PM.theme.colors
        when (status) {
            PMChatMessageStatus.Stopped -> PMGlyphLine(PMIconRole.Warning, colors.warningText, message, PM.theme.text.xs)
            PMChatMessageStatus.Error -> PMGlyphLine(PMIconRole.Error, colors.dangerText, message, PM.theme.text.xs)
            else -> {}
        }
    }
}

/** ChatMessage's states, from the spec's States table. */
object ChatMessageStates : PMStates {
    override val member = "ChatMessage"

    private const val reader = "Rowan Ellis"
    private const val model = "Relay"
    private const val prompt = "Why did the webhook retry twice last night?"
    private const val reply = "The receiver answered the first delivery with a **429**, so the retry carried the same key and " +
        "was refused as a duplicate. Nothing was applied twice."
    private const val stopped = "You stopped this reply."
    private const val failed = "The reply could not be finished. Try again."
    private const val notice = "Rowan Ellis joined the conversation"

    @Composable
    private fun Actions() {
        PMButton(icon = PMIconRole.Copy, iconOnly = true, label = "Copy", size = PMControlSize.Sm, appearance = PMButtonAppearance.GhostNeutral)
        PMButton(icon = PMIconRole.Refresh, iconOnly = true, label = "Regenerate", size = PMControlSize.Sm, appearance = PMButtonAppearance.GhostNeutral)
    }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("the reader", expect = mapOf("role" to "user", "label" to reader)) {
                PMChatMessage(author = reader, role = PMChatMessageRole.User, time = "09:41") { Text(prompt) }
            },
            PMStateEntry("the reader, with files", expect = mapOf("role" to "user", "contains" to "AttachmentChip")) {
                PMChatMessage(author = reader, role = PMChatMessageRole.User) {
                    Text(prompt)
                    PMInline(gap = PMSpaceStep.S2, wrap = true) {
                        PMAttachmentChip(name = "webhook-log.txt", size = 18_432.0)
                        PMAttachmentChip(icon = PMIconRole.Table, name = "deliveries.csv", size = 204_800.0)
                    }
                }
            },
            PMStateEntry("the model", expect = mapOf("role" to "assistant", "label" to model, "contains" to "Markdown,Button")) {
                PMChatMessage(actions = { Actions() }, author = model, role = PMChatMessageRole.Assistant, time = "09:41") {
                    PMMarkdown(children = reply)
                }
            },
            PMStateEntry("the model, streaming", expect = mapOf("role" to "assistant", "status" to "streaming", "contains" to "StreamingText")) {
                PMChatMessage(author = model, role = PMChatMessageRole.Assistant, status = PMChatMessageStatus.Streaming) {
                    PMStreamingText(children = reply.take(STREAMED), streaming = true)
                }
            },
            PMStateEntry("stopped", expect = mapOf("status" to "stopped")) {
                PMChatMessage(author = model, role = PMChatMessageRole.Assistant, status = PMChatMessageStatus.Stopped, statusMessage = stopped) {
                    PMStreamingText(children = reply.take(STREAMED))
                }
            },
            PMStateEntry("error", expect = mapOf("status" to "error")) {
                PMChatMessage(author = model, role = PMChatMessageRole.Assistant, status = PMChatMessageStatus.Error, statusMessage = failed) {
                    PMStreamingText(children = reply.take(STREAMED))
                }
            },
            PMStateEntry("a pictured speaker — an Avatar in the mark", expect = mapOf("role" to "assistant", "contains" to "Avatar")) {
                PMChatMessage(author = model, avatar = "https://example.com/relay.png", role = PMChatMessageRole.Assistant) { Text(prompt) }
            },
            PMStateEntry("a system notice", expect = mapOf("role" to "system")) {
                PMChatMessage(author = model, role = PMChatMessageRole.System) { Text(notice) }
            },
        )

    /** How much of the reply has arrived in the streaming entries. */
    private const val STREAMED = 70
}
