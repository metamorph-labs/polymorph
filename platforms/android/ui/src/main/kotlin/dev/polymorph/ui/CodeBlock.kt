// CodeBlock (`design/components/code-block.md`): code shown whole, in the mono
// face at `text.sm` on the subtle wash, inside a `border.subtle` hairline at
// `radius.md`, `space.4` inside. Whitespace is content, so the code is never
// wrapped: a block whose longest line is wider than its column scrolls
// sideways in itself, and the screen never does. While it overflows, the block
// is a region named by `label` ("Code block" by default), the web's named
// scroll region, which TalkBack scrolls with its own gestures. The code is
// selectable, the platform's own way to take part of it.
//
// `copyable` adds the corner control: Button `ghost/neutral/sm`, icon-only
// `copy`, named by `copyLabel` ("Copy"), placed as Dialog's close is, with its
// drawn box `space.4` from the corner and its hit area reaching past it. The
// block reserves the control's width at the trailing end, so the longest line
// scrolls clear of it rather than under it. A press puts the code on the
// clipboard (`rememberPMCopy`), swaps the glyph to `confirm` with a fade over
// the control duration, says "Copied" through a polite live region, and swaps
// back after 2000ms (`PMSpecDefault.copyFeedbackMs`); a second press restarts
// the time. Syntax highlighting is a non-goal, as on the web.

package dev.polymorph.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

object PMCodeBlock : PMCodeBlockRendering {
    @Composable
    override fun Render(props: PMCodeBlockProps) {
        val theme = PM.theme
        val density = theme.defaultDensity
        val space = density.spacing
        val strings = PMSpecDefault.strings
        val motion = theme.defaultMotion
        val copyable = props.copyable ?: false
        val shape = theme.rounded(theme.radius.md)
        val scroll = rememberScrollState()
        val overflowing = scroll.maxValue > 0
        val copy = rememberPMCopy()
        var copied by remember { mutableStateOf(false) }
        var presses by remember { mutableIntStateOf(0) }
        val fade = remember { Animatable(1f) }

        LaunchedEffect(presses) {
            if (presses == 0) return@LaunchedEffect
            fade.snapTo(0f)
            fade.animateTo(1f, motion.easing.standard.tween(motion.duration.control))
            delay(PMSpecDefault.copyFeedbackMs)
            copied = false
        }

        val attributes = buildMap {
            if (overflowing) put("overflowing", "true")
            if (copyable) put("copyable", "true")
            if (copied) put("state", "copied")
        }
        val label = props.label ?: strings.codeBlock
        // The control's drawn box sits `space.4` from the corner; its hit
        // area reaches past it, as Dialog's close does.
        val inset = maxOf(0.dp, space.s4 - (density.hitTarget.dp - density.controlHeight.sm.dp) / 2)
        val reserve = if (copyable) space.s4 + density.controlHeight.sm.dp else 0.dp

        Box(
            Modifier
                .pmMember("CodeBlock", attributes)
                .semantics { if (overflowing) contentDescription = label }
                .fillMaxWidth()
                .clip(shape)
                .background(theme.colors.bgSubtle.color)
                .border(PMGeometry.hairline, theme.colors.borderSubtle.color, shape),
        ) {
            SelectionContainer(Modifier.fillMaxWidth().horizontalScroll(scroll)) {
                Text(
                    text = props.children,
                    style = theme.text.sm.mono(theme).textStyle,
                    color = theme.colors.textPrimary.color,
                    softWrap = false,
                    modifier = Modifier.padding(start = space.s4, top = space.s4, bottom = space.s4, end = space.s4 + reserve),
                )
            }
            if (copyable) {
                Box(Modifier.align(Alignment.TopEnd).padding(top = inset, end = inset).graphicsLayer { alpha = fade.value }) {
                    PMButton(
                        icon = if (copied) PMIconRole.Confirm else PMIconRole.Copy,
                        iconOnly = true,
                        label = props.copyLabel ?: strings.copy,
                        onClick = {
                            copy(props.children)
                            copied = true
                            presses += 1
                        },
                        size = PMControlSize.Sm,
                        appearance = PMButtonAppearance.GhostNeutral,
                    )
                }
                // The web's polite live region: the outcome, once per press.
                PMAnnouncement(if (copied) strings.copied else null)
            }
        }
    }
}

/**
 * CodeBlock's states, from the spec's States table: a command that fits, a
 * line wider than the column, the copy control, and both.
 */
object CodeBlockStates : PMStates {
    override val member = "CodeBlock"

    private const val wide = "polymorph add button dialog drawer command popover menu tabs tooltip toast alert card " +
        "accordion badge avatar separator kbd spinner progress stepper skeleton table data-table"

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("command") { PMCodeBlock(children = "pnpm install\npnpm dev\npnpm proof") },
            PMStateEntry(
                "wide line — scrolls in itself, never the screen",
                expect = mapOf("overflowing" to "true", "label" to "Code block"),
            ) { PMCodeBlock(children = wide) },
            PMStateEntry("copyable — the corner control, named Copy", expect = mapOf("copyable" to "true", "contains" to "Button")) {
                PMCodeBlock(children = "pnpm add @polymorph/react-ui", copyable = true)
            },
            PMStateEntry(
                "copyable and wide — the line scrolls clear of the control",
                expect = mapOf("copyable" to "true", "overflowing" to "true", "label" to "Install"),
            ) { PMCodeBlock(children = wide, copyable = true, label = "Install") },
        )
}
