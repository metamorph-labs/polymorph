// CommentThread (`design/components/comment-thread.md`): the comments people
// leave on a record, with their replies, read from the top. It is not
// ChatThread, which follows and announces a conversation with a model: a
// comment thread sits in the page, follows nothing and announces nothing. The
// body, the labels, the actions and the composer are the app's composables.
//
// The thread is a column of comments `space.5` apart, in the order given. A
// comment is a row `space.3` apart of its mark column, `space.7` wide (an `md`
// Avatar) with the app's Avatar centred in it, and its body, a column
// `space.2` apart: the head, the content and the actions. The head flows onto
// further lines, `space.2` across and `space.1` down, its words on one
// baseline: the author in `text.sm` at the `text.xl` weight in
// `text.primary`, the time the app passes and, for an edited comment,
// `messages.edited`, both in `text.xs` `text.muted`, then the labels (`meta`),
// `space.1` apart and centred on the line. The content is the app's
// composables `space.2` apart; the actions are the app's Buttons in a row
// `space.1` apart that wraps, always shown.
//
// Replies are a column `space.4` apart, `space.4` under the comment, indented
// one mark column and one gap (`space.7` and `space.3`) from the start edge,
// so a reply's mark starts where its parent's body starts, with a
// `border.subtle` hairline down the middle of the parent's mark column. A
// reply's own replies keep that indentation and add none, and draw no second
// rule, so the thread has two drawn levels at every width; they still nest in
// the semantics tree. Right to left, the indent and the rule are at the right.
//
// The thread is one node named by `label`, a traversal group whose comments
// TalkBack reads in order; Compose cannot count the comments in its slot, so
// no item count is published. Each comment is a group named by its author, as
// the web's `article` is (ChatMessage's rule); the time is the app's
// composable, read after the name. The Avatar is decorative beside the visible
// name, by Avatar's own rule. A comment's replies are a group named by
// `messages.replies`. Nothing is announced and nothing moves. A thread with no
// comments draws nothing.

package dev.polymorph.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp

object PMCommentThread : PMCommentThreadRendering {
    @Composable
    override fun Render(props: PMCommentThreadProps) {
        val children = props.children ?: return
        val theme = PM.theme
        val messages = props.messages ?: PMSpecDefault.strings.commentThreadMessages
        Column(
            Modifier
                .pmMember("CommentThread")
                .semantics {
                    contentDescription = props.label
                    isTraversalGroup = true
                }
                .fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(theme.defaultDensity.spacing.s5),
        ) {
            CompositionLocalProvider(LocalCommentThread provides Context(messages, depth = 0)) { children() }
        }
    }

    @Composable
    override fun RenderComment(props: PMCommentThreadCommentProps) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val thread = LocalCommentThread.current
        val messages = thread?.messages ?: PMSpecDefault.strings.commentThreadMessages
        val depth = thread?.depth ?: 0
        Column(Modifier.pmMember("CommentThread", mapOf("part" to "comment")).fillMaxWidth()) {
            Entry(props, messages)
            props.replies?.let { replies ->
                val rule = theme.colors.borderSubtle.color
                // A comment of the thread indents its replies and draws their
                // rule; a reply's replies stay at the second level.
                val indent = if (depth == 0) space.s7 + space.s3 else 0.dp
                Column(
                    Modifier
                        .padding(top = space.s4)
                        .then(
                            if (depth == 0) {
                                Modifier.drawBehind {
                                    val middle = space.s7.toPx() / 2
                                    val x = if (layoutDirection == LayoutDirection.Rtl) size.width - middle else middle
                                    drawLine(rule, Offset(x, 0f), Offset(x, size.height), PMGeometry.hairline.toPx())
                                }
                            } else {
                                Modifier
                            },
                        )
                        .padding(start = indent)
                        .semantics {
                            contentDescription = messages.replies
                            isTraversalGroup = true
                        }
                        .fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(space.s4),
                ) {
                    CompositionLocalProvider(LocalCommentThread provides Context(messages, depth + 1)) { replies() }
                }
            }
        }
    }

    /** The mark column beside the body: the head, the content and the actions. */
    @Composable
    private fun Entry(props: PMCommentThreadCommentProps, messages: PMCommentThreadMessages) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        Row(
            Modifier
                .fillMaxWidth()
                // Named by its author, as the web's article is.
                .semantics {
                    contentDescription = props.author
                    isTraversalGroup = true
                },
            horizontalArrangement = Arrangement.spacedBy(space.s3),
            verticalAlignment = Alignment.Top,
        ) {
            props.avatar?.let { avatar ->
                Box(Modifier.width(space.s7), contentAlignment = Alignment.TopCenter) { avatar() }
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(space.s2)) {
                Head(props, messages)
                props.children?.let { body ->
                    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(space.s2)) { body() }
                }
                props.actions?.let { actions ->
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(space.s1),
                        verticalArrangement = Arrangement.spacedBy(space.s1),
                        itemVerticalAlignment = Alignment.CenterVertically,
                    ) { actions() }
                }
            }
        }
    }

    /** The author, the time, the edited mark and the labels, wrapping where the column is narrow. */
    @Composable
    private fun Head(props: PMCommentThreadCommentProps, messages: PMCommentThreadMessages) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val colors = theme.colors
        val small = theme.text.xs.textStyle
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(space.s2),
            verticalArrangement = Arrangement.spacedBy(space.s1),
        ) {
            Text(
                props.author,
                style = theme.text.sm.weighted(like = theme.text.xl).textStyle,
                color = colors.textPrimary.color,
                modifier = Modifier.alignByBaseline(),
            )
            props.time?.let { time ->
                Box(Modifier.alignByBaseline()) {
                    CompositionLocalProvider(LocalTextStyle provides small, LocalContentColor provides colors.textMuted.color) { time() }
                }
            }
            if (props.edited == true) {
                Text(messages.edited, style = small, color = colors.textMuted.color, modifier = Modifier.alignByBaseline())
            }
            props.meta?.let { meta ->
                FlowRow(
                    Modifier.align(Alignment.CenterVertically),
                    horizontalArrangement = Arrangement.spacedBy(space.s1),
                    verticalArrangement = Arrangement.spacedBy(space.s1),
                ) { meta() }
            }
        }
    }

    /** What the thread hands each comment in it, at any depth: its words, and how deep the comment is. */
    private class Context(val messages: PMCommentThreadMessages, val depth: Int)

    private val LocalCommentThread = compositionLocalOf<Context?> { null }
}

/**
 * CommentThread's states, from the spec's States table: a thread with
 * replies, an internal note, an edited comment, a resolved thread, a body
 * with a mention and attachments, a reply to a reply, long unbroken text at a
 * phone's width, and the thread followed by the app's composer.
 */
object CommentThreadStates : PMStates {
    override val member = "CommentThread"

    private const val label = "Comments"
    private const val longAddress =
        "https://status.example.com/incidents/2026-11-14-eu-west-1-webhook-delivery-retried-with-a-duplicated-promo-code"
    private const val longAuthor = "svc-webhook-delivery-eu-west-1-production-retry-worker"

    /** The app's controls for a comment. They take no handler here, as nothing is listening. */
    @Composable
    private fun Actions() {
        PMButton(label = "Reply", size = PMControlSize.Sm, appearance = PMButtonAppearance.GhostNeutral)
        PMButton(label = "Edit", size = PMControlSize.Sm, appearance = PMButtonAppearance.GhostNeutral)
    }

    @Composable
    private fun Words(text: String) {
        PMText { Text(text) }
    }

    @Composable
    private fun Comment(
        author: String,
        time: String,
        edited: Boolean? = null,
        meta: PMContent? = null,
        actions: Boolean = false,
        replies: PMContent? = null,
        body: PMContent,
    ) {
        PMCommentThreadComment(
            actions = if (actions) ({ Actions() }) else null,
            author = author,
            avatar = { PMAvatar(name = author) },
            edited = edited,
            meta = meta,
            replies = replies,
            time = { Text(time) },
            children = body,
        )
    }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("a thread with replies", expect = mapOf("label" to label, "contains" to "Button,RelativeTime")) {
                PMCommentThread(label = label) {
                    PMCommentThreadComment(
                        actions = { Actions() },
                        author = "Ada Okafor",
                        avatar = { PMAvatar(name = "Ada Okafor") },
                        replies = {
                            Comment("Bao Tran", "09:52", actions = true) {
                                Words("It retries on any 5xx. The second attempt sent the cached payload.")
                            }
                            Comment("Ada Okafor", "10:05", actions = true) { Words("So the code was applied twice. I will open a fix.") }
                        },
                        time = { PMRelativeTime(mode = PMRelativeTimeMode.Absolute, value = "2026-11-14T09:40:00Z") },
                    ) { Words("The webhook retried twice with the same promo code. Is the retry idempotent?") }
                    Comment("Carmen Ruiz", "11:20", actions = true) { Words("The customer confirmed that the second charge was refunded.") }
                }
            },
            PMStateEntry("an internal note", expect = mapOf("label" to "Ticket messages", "contains" to "Badge")) {
                PMCommentThread(label = "Ticket messages") {
                    Comment("Bao Tran", "Yesterday", meta = { PMBadge(children = "Internal note", tone = PMBadgeTone.Warning) }) {
                        Words("The customer is on the legacy plan. Do not offer the annual discount.")
                    }
                }
            },
            PMStateEntry("an edited comment", expect = mapOf("label" to label)) {
                PMCommentThread(label = label) {
                    Comment("Carmen Ruiz", "2 Nov", edited = true, actions = true) {
                        Words("The export finished. The archive is kept for thirty days.")
                    }
                }
            },
            PMStateEntry("a resolved thread", expect = mapOf("contains" to "Badge")) {
                PMCommentThread(label = label) {
                    Comment(
                        "Ada Okafor",
                        "Monday",
                        meta = { PMBadge(children = "Resolved", tone = PMBadgeTone.Success) },
                        replies = { Comment("Bao Tran", "Monday") { Words("Renamed in the latest version.") } },
                    ) { Words("This heading should say “Delivery”, not “Shipping”.") }
                }
            },
            PMStateEntry("attachments and a mention", expect = mapOf("contains" to "Link,AttachmentChip")) {
                PMCommentThread(label = label) {
                    Comment("Ada Okafor", "09:40", actions = true) {
                        PMLink(children = "@Bao Tran", href = "#people/bao")
                        Words("Here is the delivery log and the policy we agreed on.")
                        PMInline(gap = PMSpaceStep.S2, wrap = true) {
                            PMAttachmentChip(name = "delivery.log", size = 48_210.0)
                            PMAttachmentChip(name = "retry-policy.pdf", size = 184_320.0)
                        }
                    }
                }
            },
            PMStateEntry("a reply to a reply — drawn at the second level", expect = mapOf("label" to label)) {
                PMCommentThread(label = label) {
                    Comment(
                        "Ada Okafor",
                        "09:40",
                        replies = {
                            Comment(
                                "Bao Tran",
                                "09:52",
                                replies = { Comment("Carmen Ruiz", "10:01") { Words("Agreed. The policy allows five attempts.") } },
                            ) { Words("We should cap the retries at five.") }
                        },
                    ) { Words("How many times may a delivery be retried?") }
                }
            },
            PMStateEntry("long unbroken text at phone width", expect = mapOf("contains" to "Badge,Button")) {
                PMCommentThread(label = label) {
                    Comment(
                        longAuthor,
                        "09:40",
                        meta = { PMBadge(children = "Internal note", tone = PMBadgeTone.Warning) },
                        actions = true,
                    ) { Words(longAddress) }
                }
            },
            PMStateEntry("followed by a composer", expect = mapOf("label" to label)) {
                Column(
                    verticalArrangement = Arrangement.spacedBy(PM.theme.defaultDensity.spacing.s4),
                    horizontalAlignment = Alignment.End,
                ) {
                    PMCommentThread(label = label) {
                        Comment("Ada Okafor", "09:40") { Words("Can someone check the retry schedule?") }
                    }
                    PMFormField(label = "Reply") { PMTextarea(rows = 3.0) }
                    PMButton(label = "Comment", appearance = PMButtonAppearance.SolidAccent)
                }
            },
        )
}
