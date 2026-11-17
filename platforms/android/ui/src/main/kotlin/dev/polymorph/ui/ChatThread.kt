// ChatThread (`design/components/chat-thread.md`): every turn of a
// conversation in a scroll region of its own, which follows the newest turn
// while a reply arrives and lets the reader stop and resume following. It is
// the conversation's only scroll region, because a composer pinned under a
// page that scrolls would scroll away; it fills the box the page gives it.
//
// The turns are a column `space.6` apart, at most eight `space.10`s wide
// (`PMRecipe.chatThreadMeasure`) and centred, inside `space.5` of padding. A
// turn that joins arrives as `chat.message`, which the thread hands its turns
// (`LocalPMChatThread`, `pmArrival`): `slide-fade` at the `sm` distance from
// the bottom edge over the control duration, enter only. A thread with no
// turns (`children` is null) draws the app's `empty` slot, centred in the box;
// this member writes no empty text of its own.
//
// Follow is two observations, as on the web, with no scheduler: where the
// reader is against the end, and how far the content reaches. While the reader
// is within one `space.6` of the end, more content moves the view to the new
// end, at once and never animated, because a smooth scroll under arriving text
// makes the reader chase the line. A change of position that comes with no
// change of the content's extent is the reader's scroll, and decides whether
// they are still at the end. Content that arrives while the reader drags is
// followed when the drag ends, if they are still following then. Once the
// reader has scrolled up, nothing moves until they press the jump control:
// Button `outline/neutral/sm` with the `down` glyph, named by
// `messages.jumpToLatest`, centred `space.4` above the bottom edge. It exists
// only while the reader is detached, so it is out of the tree, and TalkBack's,
// while it would do nothing. The thread starts at its end.
//
// Inside an overlay's body (a Drawer's, a Dialog's or a Popover's panel), the
// body is the one region that scrolls (`LocalPMOverlayScroll`). Where the body
// offers the thread unbounded height, the thread follows through the body's
// scroll rather than nesting a second one, which Compose cannot measure, and
// its jump control sits at the foot of the body's viewport. Given a height of
// its own, it scrolls itself, as anywhere else.
//
// TalkBack: the region is a group named by `label`, the web's `log`, which
// TalkBack scrolls with its own gestures. Compose has no log role, so a turn
// that joins a thread already on screen announces its author itself
// (ChatMessage), and a turn that grows token by token is not read again. The
// root carries `streaming` while a reply arrives, the web's `aria-busy`, and
// `state=detached` while the reader has scrolled away.

package dev.polymorph.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Constraints
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch

object PMChatThread : PMChatThreadRendering {
    @Composable
    override fun Render(props: PMChatThreadProps) {
        // The constraints decide whether an overlay's body is the region: it
        // is where the body offers unbounded height.
        BoxWithConstraints(propagateMinConstraints = true) {
            Thread(props, unbounded = constraints.maxHeight == Constraints.Infinity)
        }
    }

    @Composable
    private fun Thread(props: PMChatThreadProps, unbounded: Boolean) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val strings = PMSpecDefault.strings
        // In an overlay's body that offers unbounded height, the thread follows through the body's scroll.
        val overlay = LocalPMOverlayScroll.current?.takeIf { unbounded }
        val own = rememberScrollState()
        val scroll = overlay?.state ?: own
        val scope = rememberCoroutineScope()
        val context = remember { PMChatThreadContext() }
        var following by remember { mutableStateOf(true) }
        // Content arrived during a drag and was not followed.
        var missed by remember { mutableStateOf(false) }
        val slack = with(LocalDensity.current) { space.s6.roundToPx() }
        val streaming = props.streaming ?: false
        val detached = !following && scroll.maxValue > 0
        val attributes = buildMap {
            if (detached) put("state", "detached")
            if (streaming) put("streaming", "true")
        }

        // The thread is on screen: a turn that appears from now on is an arrival.
        LaunchedEffect(Unit) { context.opened = true }
        // Two observations: the reader's position, and the content's extent.
        LaunchedEffect(scroll) {
            var extent = scroll.maxValue
            snapshotFlow { scroll.value to scroll.maxValue }.collect { (position, max) ->
                if (max != extent) {
                    extent = max
                    // More content: follow it to the new end while following.
                    // During a drag it waits for the drag's end. A drag holds
                    // the scroll at a higher priority, which cancels a
                    // `scrollTo` started under it; that cancellation is the
                    // drag's, not this effect's, so the effect goes on
                    // collecting.
                    if (following && scroll.isScrollInProgress) missed = true
                    if (following && !scroll.isScrollInProgress) {
                        try {
                            scroll.scrollTo(max)
                        } catch (cancelled: CancellationException) {
                            currentCoroutineContext().ensureActive()
                        }
                    }
                } else {
                    // The reader's own scroll decides whether they are at the end.
                    following = max - position <= slack
                }
            }
        }

        // The drag has ended: what arrived during it is followed, if the
        // reader is still following.
        LaunchedEffect(scroll) {
            snapshotFlow { scroll.isScrollInProgress }.collect { moving ->
                if (!moving && missed) {
                    missed = false
                    if (following) scroll.scrollTo(scroll.maxValue)
                }
            }
        }
        val jump: @Composable () -> Unit = {
            Box(Modifier.padding(bottom = space.s4)) {
                PMButton(
                    icon = PMIconRole.Down,
                    label = props.messages?.jumpToLatest ?: strings.chatThreadMessages.jumpToLatest,
                    onClick = {
                        following = true
                        scope.launch { scroll.scrollTo(scroll.maxValue) }
                    },
                    size = PMControlSize.Sm,
                    appearance = PMButtonAppearance.OutlineNeutral,
                )
            }
        }
        // In an overlay's body the jump control sits at the foot of the body's viewport.
        if (overlay != null) {
            DisposableEffect(overlay, detached) {
                if (detached) overlay.floating = jump
                onDispose { overlay.floating = null }
            }
        }

        Box(
            Modifier
                .pmMember("ChatThread", attributes)
                .semantics {
                    contentDescription = props.label
                    isTraversalGroup = true
                }
                .fillMaxSize(),
        ) {
            val children = props.children
            if (children == null) {
                Box(Modifier.fillMaxSize().padding(space.s5), contentAlignment = Alignment.Center) { props.empty?.invoke() }
            } else {
                Column(
                    Modifier
                        .fillMaxSize()
                        .then(if (overlay == null) Modifier.verticalScroll(scroll) else Modifier),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    CompositionLocalProvider(LocalPMChatThread provides context) {
                        Column(
                            Modifier
                                .widthIn(max = space.s10 * PMRecipe.chatThreadMeasure)
                                .fillMaxWidth()
                                .padding(space.s5),
                            verticalArrangement = Arrangement.spacedBy(space.s6),
                        ) { children() }
                    }
                }
                if (detached && overlay == null) Box(Modifier.align(Alignment.BottomCenter)) { jump() }
            }
        }
        // The thread starts at its end.
        LaunchedEffect(Unit) { scroll.scrollTo(scroll.maxValue) }
    }
}

/**
 * ChatThread's states, from the spec's States table, each in a box the fixture
 * sizes, as ConversationPage sizes one. The detached state is the reader's own
 * and no prop reaches it, so no fixture draws the jump control.
 */
object ChatThreadStates : PMStates {
    override val member = "ChatThread"

    private const val label = "Conversation"
    private const val reader = "Rowan Ellis"
    private const val model = "Relay"
    private val turns = listOf(
        "Why did the webhook retry twice last night?",
        "The receiver answered the first delivery with a 429, so the retry carried the same key and was refused as a duplicate.",
        "Can we stop the second retry?",
        "Raise the backoff cap to five attempts; the second retry then waits eight seconds.",
    )

    @Composable
    private fun Turns(count: Int, streaming: Boolean = false) {
        turns.take(count).forEachIndexed { index, text ->
            val user = index % 2 == 0
            val last = index == count - 1
            PMChatMessage(
                author = if (user) reader else model,
                role = if (user) PMChatMessageRole.User else PMChatMessageRole.Assistant,
                status = if (streaming && last) PMChatMessageStatus.Streaming else null,
            ) {
                if (user) Text(text) else PMStreamingText(children = text, streaming = streaming && last)
            }
        }
    }

    @Composable
    private fun Sized(content: @Composable () -> Unit) {
        Box(Modifier.fillMaxWidth().height(PM.theme.defaultDensity.spacing.s10 * BOX)) { content() }
    }

    /** The harness box, in multiples of `space.10`: the spec's. */
    private const val BOX = 6

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("a conversation — four turns, both registers", expect = mapOf("label" to label, "contains" to "ChatMessage")) {
                Sized { PMChatThread(label = label) { Turns(4) } }
            },
            PMStateEntry("streaming", expect = mapOf("streaming" to "true", "contains" to "StreamingText")) {
                Sized { PMChatThread(label = label, streaming = true) { Turns(2, streaming = true) } }
            },
            PMStateEntry("empty — the app's slot", expect = mapOf("contains" to "EmptyState")) {
                Sized {
                    PMChatThread(
                        empty = { PMEmptyState(description = "Ask about a ticket, a customer or a delivery.", title = "Start a conversation") },
                        label = label,
                    )
                }
            },
        )
}
