// ConversationPage (`design/archetypes/conversation-page.md`): the
// conversation screen. It fills the region that holds it rather than scrolling
// down it: the page header at the top, the composer at the foot, and the
// thread taking the room between them, so the thread scrolls in its own box
// and the composer stays put. The page column is fifteen of the largest space
// step wide at most (`PMRecipe.conversationPageMeasure`), with the page insets
// (one step smaller below 40rem) and `space.5` between the header and the
// body.
//
// The conversation is the thread over the composer, `space.4` apart; the
// composer is ChatThread's column measure, eight of the largest space step
// (`PMRecipe.conversationComposerMeasure`), centred under the turns. The aside
// takes one of two forms by the page's own width, as the web's does:
//
// - **From 48rem**: SplitPane's split, the conversation the start pane and the
//   aside the end pane, `space.2` off the seam, at 58 to 42, with floors of
//   320dp for the thread and 280dp for the aside: the web's numbers, read from
//   its source into `PMRecipe`. The page has measured its room, so it asks
//   SplitPane for the split whatever the window's width class.
// - **Below 48rem** (a phone): the thread keeps the whole width, and the
//   header's actions gain an outline/neutral/sm Button with the `artifact`
//   glyph, named `asideLabel`, that opens the aside in Drawer, the web's
//   container for it: from the end at `lg`, titled `asideLabel`, which on a
//   phone is Drawer's sheet. Widening the page closes it.
//
// The load status (`design/native/screen-contract.md`): the header renders in
// every state. `loading` draws Skeleton turns in the thread's place and
// disables the composer (`LocalPMEnabled`); `failed` puts a danger Alert above
// the composer, with `onRetry` when it is set, and the thread stays; `empty` is
// `ready`, because a thread with no turns draws its own empty state.
//
// `asideLabel` names the split's separator, the toggle and the drawer. The web
// requires it with `aside`; the contract cannot pair two optional props, so a
// page given an aside without one names it by its title. The root carries
// `aside=split|drawer` while an aside is given.

package dev.polymorph.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier

object PMConversationPage : PMConversationPageRendering {
    @Composable
    override fun Render(props: PMConversationPageProps) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val status = props.loadStatus
        val aside = props.aside
        val name = props.asideLabel ?: props.title
        var drawer by remember { mutableStateOf(false) }

        BoxWithConstraints(
            Modifier
                .fillMaxSize()
                .background(theme.colors.bgApp.color),
        ) {
            val page = minOf(maxWidth, space.s10 * PMRecipe.conversationPageMeasure)
            val narrow = page < PMRecipe.pageNarrowBelow
            val split = aside != null && page >= PMRecipe.conversationOneColumnBelow
            // Widening the page closes the drawer.
            LaunchedEffect(split) { if (split) drawer = false }
            val attributes = buildMap {
                put("status", status.kind)
                if (aside != null) put("aside", if (split) "split" else "drawer")
            }
            Column(
                Modifier
                    .pmMember("ConversationPage", attributes)
                    .align(Alignment.TopCenter)
                    .widthIn(max = space.s10 * PMRecipe.conversationPageMeasure)
                    .fillMaxSize()
                    .padding(horizontal = if (narrow) space.s6 else space.s7, vertical = if (narrow) space.s5 else space.s6),
                verticalArrangement = Arrangement.spacedBy(space.s5),
            ) {
                val actions = props.actions
                val toggle = aside != null && !split
                PMPageHeader(
                    actions = if (actions != null || toggle) ({
                        actions?.invoke()
                        if (toggle) {
                            PMButton(
                                icon = PMIconRole.Artifact,
                                label = name,
                                onClick = { drawer = true },
                                size = PMControlSize.Sm,
                                appearance = PMButtonAppearance.OutlineNeutral,
                            )
                        }
                    }) else null,
                    description = props.description,
                    title = props.title,
                )
                Box(Modifier.weight(1f).fillMaxWidth()) {
                    if (split) {
                        CompositionLocalProvider(LocalPMSplitPaneLayout provides PMSplitPaneLayout.Split) {
                            PMSplitPane(
                                defaultRatio = PMRecipe.conversationThreadShare.toDouble(),
                                end = { Box(Modifier.fillMaxSize().padding(start = space.s2)) { aside() } },
                                endMin = PMRecipe.conversationAsideMin.value.toDouble(),
                                label = name,
                                start = { Conversation(props) },
                                startMin = PMRecipe.conversationThreadMin.value.toDouble(),
                            )
                        }
                    } else {
                        Conversation(props)
                    }
                }
            }
            if (aside != null && !split) {
                PMDrawer(
                    onOpenChange = { drawer = it },
                    open = drawer,
                    side = PMDrawerSide.End,
                    size = PMControlSize.Lg,
                    title = name,
                ) { Box(Modifier.fillMaxSize()) { aside() } }
            }
        }
    }

    /** The thread over the composer; Skeleton turns while loading, the failure above the composer. */
    @Composable
    private fun Conversation(props: PMConversationPageProps) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val status = props.loadStatus
        // Above the keyboard: an app drawn edge to edge is not resized for it,
        // so the composer would sit under it. Insets a parent has already
        // consumed are not applied twice.
        Column(Modifier.fillMaxSize().imePadding(), verticalArrangement = Arrangement.spacedBy(space.s4)) {
            Box(Modifier.weight(1f).fillMaxWidth()) {
                if (status == PMLoadStatus.Loading) {
                    Column(
                        Modifier.fillMaxWidth().padding(space.s5),
                        verticalArrangement = Arrangement.spacedBy(space.s6),
                    ) { repeat(TURNS) { turn -> SkeletonTurn(if (turn == 0) PMSpecDefault.strings.loading else null) } }
                } else {
                    props.thread()
                }
            }
            if (status is PMLoadStatus.Failed) {
                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    Box(Modifier.widthIn(max = space.s10 * PMRecipe.conversationComposerMeasure)) {
                        PMPageFailure(status.message, props.onRetry)
                    }
                }
            }
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                Box(Modifier.widthIn(max = space.s10 * PMRecipe.conversationComposerMeasure).fillMaxWidth()) {
                    CompositionLocalProvider(LocalPMEnabled provides (LocalPMEnabled.current && status != PMLoadStatus.Loading)) {
                        props.composer()
                    }
                }
            }
        }
    }

    /** A turn standing in while the thread loads: the mark's circle beside two lines, the first named "Loading". */
    @Composable
    private fun SkeletonTurn(label: String?) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        Row(horizontalArrangement = Arrangement.spacedBy(space.s3)) {
            PMSkeleton(shape = PMSkeletonShape.Circle, size = PMSpaceStep.S7)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(space.s2)) {
                PMSkeleton(label = label, textStep = PMSkeletonTextStep.Sm, width = PMSkeletonWidth.Width8)
                PMSkeleton(textStep = PMSkeletonTextStep.Md)
            }
        }
    }

    /** How many turns the loading thread draws. */
    private const val TURNS = 3
}

/**
 * ConversationPage's states: the four load states over a conversation, an
 * aside on a phone (the toggle in the header) and on a tablet (the split), and
 * an empty thread. Each names what its body holds (`contains`).
 */
object ConversationPageStates : PMStates {
    override val member = "ConversationPage"

    private const val title = "Webhook retries"
    private const val description = "Ask about deliveries, keys and backoff."
    private const val failure = "The conversation could not be loaded."
    private const val artifact = "Artifact"
    private const val label = "Conversation"
    private const val first = "Why did the webhook retry twice last night?"
    private const val second = "The receiver answered the first delivery with a **429**, so the retry carried the same key and was refused."
    private const val code = "export function retry(key: string) {\n  return send(key, { attempts: 5 })\n}"

    /** The tablet entry's height, in multiples of `space.10`. */
    private const val TABLET = 8

    @Composable
    private fun Thread() {
        PMChatThread(label = label) {
            PMChatMessage(author = "Rowan Ellis", role = PMChatMessageRole.User) { Text(first) }
            PMChatMessage(author = "Relay", role = PMChatMessageRole.Assistant) { PMMarkdown(children = second) }
        }
    }

    @Composable
    private fun Composer() {
        PMPromptInput(label = "Message Relay", onSubmit = {}, placeholder = "Ask about a ticket…")
    }

    @Composable
    private fun Aside() {
        PMArtifactPane(kind = PMArtifactPaneKind.Code, title = "retry.ts") { PMCodeBlock(children = code) }
    }

    @Composable
    private fun Page(status: PMLoadStatus, aside: Boolean = false, empty: Boolean = false) {
        PMFixturePhone {
            PMConversationPage(
                loadStatus = status,
                onRetry = {},
                actions = { PMButton(icon = PMIconRole.Add, iconOnly = true, label = "New conversation", size = PMControlSize.Sm, appearance = PMButtonAppearance.GhostNeutral) },
                aside = if (aside) ({ Aside() }) else null,
                asideLabel = if (aside) artifact else null,
                composer = { Composer() },
                description = description,
                thread = {
                    if (empty) {
                        PMChatThread(empty = { PMEmptyState(title = "Start a conversation") }, label = label)
                    } else {
                        Thread()
                    }
                },
                title = title,
            )
        }
    }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("ready — a conversation", expect = mapOf("status" to "ready", "contains" to "PageHeader,ChatThread,PromptInput")) {
                Page(PMLoadStatus.Ready)
            },
            PMStateEntry("loading — Skeleton turns, the composer disabled", expect = mapOf("status" to "loading", "contains" to "Skeleton,PromptInput")) {
                Page(PMLoadStatus.Loading)
            },
            PMStateEntry("empty — the thread's own empty state", expect = mapOf("status" to "empty", "contains" to "EmptyState")) {
                Page(PMLoadStatus.Empty, empty = true)
            },
            PMStateEntry("failed — the Alert above the composer, the thread kept", expect = mapOf("status" to "failed", "contains" to "Alert,ChatThread,PromptInput")) {
                Page(PMLoadStatus.Failed(failure))
            },
            PMStateEntry("with an aside, on a phone — the toggle in the header", expect = mapOf("aside" to "drawer", "contains" to "Button")) {
                Page(PMLoadStatus.Ready, aside = true)
            },
            PMStateEntry("with an aside, on a tablet — the split", expect = mapOf("aside" to "split", "contains" to "SplitPane,ArtifactPane")) {
                PMFixtureWidth(PMGeometry.compactWidth * 2) {
                    Box(Modifier.fillMaxWidth().height(PM.theme.defaultDensity.spacing.s10 * TABLET)) { Page(PMLoadStatus.Ready, aside = true) }
                }
            },
        )
}
