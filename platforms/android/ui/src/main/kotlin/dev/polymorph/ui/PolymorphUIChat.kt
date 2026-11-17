// The parts the conversation members share: what a thread hands the turns
// inside it (ChatThread, ChatMessage), a turn's arrival and its announcement,
// and a sentence with a matching glyph (ChatMessage's notice, ApprovalCard's
// outcome).

package dev.polymorph.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp
import dev.polymorph.tokens.PMDynamicColor
import dev.polymorph.tokens.PMTextStyle

/* The thread and its turns ------------------------------------------------- */

/**
 * What ChatThread hands each turn inside it. The web's thread reaches its turns
 * through its column and its log region; a composable turn is opaque to the
 * thread, so the thread provides this and ChatMessage reads it. `opened` turns
 * true once the thread is on screen: the turns it opens with appear with it,
 * and a turn that appears after it is an arrival.
 */
@Stable
class PMChatThreadContext {
    var opened by mutableStateOf(false)
}

/** The thread the composable is a turn of, or null outside a ChatThread. */
val LocalPMChatThread = compositionLocalOf<PMChatThreadContext?> { null }

/**
 * A turn's arrival in a thread already on screen, `chat.message`
 * (`chat-thread.md`, Motion): `slide-fade` at the `sm` distance (`space.2`)
 * from the bottom edge over the control duration on the enter easing, enter
 * only. A turn the thread opened with is drawn at rest. At the `none`
 * temperament the duration is 0.
 */
@Composable
fun Modifier.pmArrival(): Modifier {
    val thread = LocalPMChatThread.current
    val motion = PM.theme.defaultMotion
    val distance = PM.theme.defaultDensity.spacing.s2
    val arrives = remember { thread?.opened == true }
    val progress = remember { Animatable(if (arrives) 0f else 1f) }
    LaunchedEffect(Unit) {
        if (arrives) progress.animateTo(1f, motion.easing.enter.tween(motion.duration.control))
    }
    return graphicsLayer {
        alpha = progress.value
        translationY = (1f - progress.value) * distance.toPx()
    }
}

/**
 * Says `text` once, politely, when the composable that draws it joins a thread
 * already on screen, as the web's `log` announces an addition. A live region
 * speaks when its text changes, so the region starts silent and takes the text
 * once it is on screen (`PMAnnouncement`), which draws nothing, because what
 * it says is drawn elsewhere.
 */
@Composable
fun PMArrivalAnnouncement(text: String) {
    val thread = LocalPMChatThread.current
    val arrives = remember { thread?.opened == true }
    var said by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { if (arrives) said = text }
    PMAnnouncement(said)
}

/* Glyphs beside text ------------------------------------------------------- */

/**
 * A sentence with a matching glyph before it, `space.2` apart: ChatMessage's
 * notice for a stopped or failed turn, ApprovalCard's outcome. The sentence is
 * in `text.secondary` at `step`; the glyph is `sm` in `glyphColor`, centred on
 * the first line, and decorative, because the sentence says what it shows.
 */
@Composable
fun PMGlyphLine(glyph: PMIconRole, glyphColor: PMDynamicColor, text: String, step: PMTextStyle, modifier: Modifier = Modifier) {
    val theme = PM.theme
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(theme.defaultDensity.spacing.s2)) {
        Box(Modifier.heightIn(min = step.lineBox.dp), contentAlignment = Alignment.Center) {
            PMIconView(glyph, PMControlSize.Sm, tint = glyphColor.color)
        }
        Text(text, style = step.textStyle, color = theme.colors.textSecondary.color)
    }
}
