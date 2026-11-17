// ToolCall (`design/components/tool-call.md`): one tool call in a model's
// reply, as a row the reader can open: what the model asked a tool to do,
// whether it has finished, and what came back. A record of work, not a
// message to the reader (Alert), and not the question before the work
// (ApprovalCard, which sits beside a call whose status is `approval`).
//
// The card is the subtle wash inside a `border.subtle` hairline at
// `radius.control` (`danger.border` when the call failed): it sits inside a
// reply, so it is not Card's lit surface. The row is the trigger, `space.2`
// apart inside `space.1` and `space.3`: the tool's mark (`sm`, `text.muted`,
// `tool` by default), its name in the mono face in `text.primary`, the summary
// in `text.secondary`, shortened at its end, then the duration (`text.xs`,
// muted, the theme's figures), the status glyph in its role's colour (`time`
// muted, `loading` in `accent.text` on the spin loop, `success`, `error`,
// `denied` muted, `help` in `warning.text`), and the `down` chevron, which
// turns half a turn while open. A press washes the row in `bg.surface` and
// turns its text `text.primary` (`PMWashRow`). The row is at least the hit
// target tall, because the whole of it is the button. A call with no input,
// output or message has nothing to open, so its row is plain text at the
// control height, not a button.
//
// The body is the disclosure region Accordion and Collapsible open
// (`collapsible.content`, by reference), under a hairline: the input under
// its overline heading, as CodeBlock for a string and JsonTree for any other
// value, the output as the app composed it, and the app's message, in
// `danger.text` when the call failed. The glyph changes with the status by a
// fade over the control duration.
//
// The status is never the glyph alone: the row's name is the tool's name, its
// summary, its duration and the status's words from `messages`
// ("read_file, src/webhooks/retry.ts, running"), and its state is expanded or
// collapsed, as the web's `aria-expanded` is announced. `open` with
// `onOpenChange` is the controlled pair; without it the row keeps its own
// state, from `defaultOpen`. A status missing from `messages.status` takes its
// default words.

package dev.polymorph.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.intl.LocaleList
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.toUpperCase
import androidx.compose.ui.unit.dp

object PMToolCall : PMToolCallRendering {
    @Composable
    override fun Render(props: PMToolCallProps) {
        val theme = PM.theme
        val colors = theme.colors
        val space = theme.defaultDensity.spacing
        val motion = theme.defaultMotion
        val strings = PMSpecDefault.strings
        var own by remember { mutableStateOf(props.defaultOpen ?: false) }
        val open = props.open ?: own
        val toggle: () -> Unit = {
            own = !open
            props.onOpenChange?.invoke(!open)
        }
        val failed = props.status == PMToolCallStatus.Error
        val inside = props.input != null || props.output != null || props.message != null
        val words = props.messages?.status?.get(props.status) ?: when (props.status) {
            PMToolCallStatus.Pending -> strings.toolPending
            PMToolCallStatus.Running -> strings.toolRunning
            PMToolCallStatus.Done -> strings.toolDone
            PMToolCallStatus.Error -> strings.toolFailed
            PMToolCallStatus.Denied -> strings.toolDenied
            PMToolCallStatus.Approval -> strings.toolAwaitingApproval
        }
        val name = listOfNotNull(props.name, props.summary, props.duration, words).joinToString(SEPARATOR)
        val shape = theme.rounded(theme.radius.control)
        val border by animateColorAsState(
            (if (failed) colors.dangerBorder else colors.borderSubtle).color,
            motion.easing.standard.tween(motion.duration.control),
            label = "border",
        )
        val attributes = buildMap {
            put("status", props.status.value)
            if (inside) put("state", if (open) "open" else "closed")
        }

        Column(
            Modifier
                .pmMember("ToolCall", attributes)
                .fillMaxWidth()
                .clip(shape)
                .background(colors.bgSubtle.color)
                .border(PMGeometry.hairline, border, shape),
        ) {
            if (inside) {
                PMWashRow(
                    wash = colors.bgSurface,
                    cornerRadius = 0.dp,
                    onClick = toggle,
                    semantics = {
                        contentDescription = name
                        pmDisclosure(open, strings, toggle)
                    },
                    rest = colors.textSecondary,
                    active = colors.textPrimary,
                ) { Trigger(props, open, chevron = true) }
            } else {
                // The summary draws in the content colour, which the button
                // form's wash row sets and this row sets to the same rest colour.
                CompositionLocalProvider(LocalContentColor provides colors.textSecondary.color) {
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clearAndSetSemantics { contentDescription = name }
                            .heightIn(min = theme.defaultDensity.controlHeight.sm.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) { Trigger(props, open, chevron = false) }
                }
            }
            PMDisclosureRegion(open && inside) { Body(props, failed) }
        }
    }

    /** The row's parts: the mark, the name, the summary, the duration, the status glyph and the chevron. */
    @Composable
    private fun RowScope.Trigger(props: PMToolCallProps, open: Boolean, chevron: Boolean) {
        val theme = PM.theme
        val colors = theme.colors
        val space = theme.defaultDensity.spacing
        val motion = theme.defaultMotion
        Row(
            Modifier.weight(1f).padding(horizontal = space.s3, vertical = space.s1),
            horizontalArrangement = Arrangement.spacedBy(space.s2),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PMIconView(props.icon ?: PMIconRole.Tool, PMControlSize.Sm, tint = colors.textMuted.color)
            Text(props.name, style = theme.text.sm.mono(theme).textStyle, color = colors.textPrimary.color, maxLines = 1)
            Text(
                text = props.summary.orEmpty(),
                style = theme.text.sm.textStyle,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            props.duration?.let {
                Text(it, style = theme.text.xs.textStyle.tabular(theme), color = colors.textMuted.color, maxLines = 1)
            }
            AnimatedContent(
                targetState = props.status,
                transitionSpec = {
                    fadeIn(motion.easing.enter.tween(motion.duration.control)) togetherWith
                        fadeOut(motion.easing.exit.tween(motion.duration.controlExit))
                },
                label = "status",
            ) { status -> Glyph(status) }
            if (chevron) PMTurningChevron(PMIconRole.Down, open, PMTurn.HALF)
        }
    }

    /** The status's glyph in its role's colour; `running` spins. */
    @Composable
    private fun Glyph(status: PMToolCallStatus) {
        val colors = PM.theme.colors
        val (role, tint) = when (status) {
            PMToolCallStatus.Pending -> PMIconRole.Time to colors.textMuted
            PMToolCallStatus.Running -> PMIconRole.Loading to colors.accentText
            PMToolCallStatus.Done -> PMIconRole.Success to colors.successText
            PMToolCallStatus.Error -> PMIconRole.Error to colors.dangerText
            PMToolCallStatus.Denied -> PMIconRole.Denied to colors.textMuted
            PMToolCallStatus.Approval -> PMIconRole.Help to colors.warningText
        }
        if (status == PMToolCallStatus.Running) PMSpinGlyph(PMControlSize.Sm, tint.color) else PMIconView(role, PMControlSize.Sm, tint = tint.color)
    }

    /** The body: the input, the output and the message, each under its heading, below a hairline. */
    @Composable
    private fun Body(props: PMToolCallProps, failed: Boolean) {
        val theme = PM.theme
        val colors = theme.colors
        val space = theme.defaultDensity.spacing
        val strings = PMSpecDefault.strings
        val input = props.messages?.input ?: strings.toolInput
        val output = props.messages?.output ?: strings.toolOutput
        Column(Modifier.fillMaxWidth()) {
            PMRule(colors.borderSubtle)
            Column(
                Modifier.fillMaxWidth().padding(start = space.s3, end = space.s3, top = space.s2, bottom = space.s3),
                verticalArrangement = Arrangement.spacedBy(space.s3),
            ) {
                props.input?.let { value ->
                    Section(input) {
                        if (value is PMJSONValue.Text) PMCodeBlock(children = value.value) else PMJsonTree(data = value, label = input)
                    }
                }
                props.output?.let { content -> Section(output) { content() } }
                props.message?.let {
                    Text(it, style = theme.text.sm.textStyle, color = (if (failed) colors.dangerText else colors.textSecondary).color)
                }
            }
        }
    }

    /** A section of the body: its overline heading, then its content. */
    @Composable
    private fun Section(title: String, content: @Composable () -> Unit) {
        val theme = PM.theme
        Column(verticalArrangement = Arrangement.spacedBy(theme.defaultDensity.spacing.s2)) {
            Text(
                text = title.toUpperCase(LocaleList.current),
                style = theme.text.xs.textStyle,
                color = theme.colors.textMuted.color,
                modifier = Modifier.semantics {
                    contentDescription = title
                    heading()
                },
            )
            content()
        }
    }

    private const val SEPARATOR = ", "
}

/** ToolCall's states, from the spec's States table. */
object ToolCallStates : PMStates {
    override val member = "ToolCall"

    private const val read = "read_file"
    private const val command = "pnpm test"
    private const val path = "src/webhooks/retry.ts"
    private const val failure = "The file is outside the workspace the agent may read."
    private val input = PMJSONValue.of(linkedMapOf("path" to path, "lines" to listOf(1, 80)))

    @Composable
    private fun Output() {
        PMCodeBlock(children = "export function retry(key: string) {\n  return send(key, { attempts: 5 })\n}")
    }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("running", expect = mapOf("status" to "running", "state" to "closed")) {
                PMToolCall(input = input, name = read, status = PMToolCallStatus.Running, summary = path)
            },
            PMStateEntry("done — closed, with a duration", expect = mapOf("status" to "done", "state" to "closed")) {
                PMToolCall(duration = "1.2s", input = input, name = read, output = { Output() }, status = PMToolCallStatus.Done, summary = path)
            },
            PMStateEntry("done, open — a value input and a CodeBlock output", expect = mapOf("status" to "done", "state" to "open", "contains" to "JsonTree,CodeBlock")) {
                PMToolCall(defaultOpen = true, duration = "1.2s", input = input, name = read, output = { Output() }, status = PMToolCallStatus.Done, summary = path)
            },
            PMStateEntry("a string input — CodeBlock", expect = mapOf("state" to "open", "contains" to "CodeBlock")) {
                PMToolCall(defaultOpen = true, icon = PMIconRole.Terminal, input = PMJSONValue.Text(command), name = "run_command", status = PMToolCallStatus.Done)
            },
            PMStateEntry("pending", expect = mapOf("status" to "pending")) {
                PMToolCall(input = input, name = read, status = PMToolCallStatus.Pending, summary = path)
            },
            PMStateEntry("awaiting approval", expect = mapOf("status" to "approval")) {
                PMToolCall(input = input, name = "delete_branch", status = PMToolCallStatus.Approval, summary = "release/2026-10")
            },
            PMStateEntry("failed", expect = mapOf("status" to "error", "state" to "open")) {
                PMToolCall(defaultOpen = true, input = input, message = failure, name = read, status = PMToolCallStatus.Error, summary = path)
            },
            PMStateEntry("denied", expect = mapOf("status" to "denied")) {
                PMToolCall(input = input, name = "delete_branch", status = PMToolCallStatus.Denied)
            },
            PMStateEntry("nothing inside — a row, not a button", expect = mapOf("status" to "done")) {
                PMToolCall(name = "list_files", status = PMToolCallStatus.Done, summary = "src/webhooks")
            },
        )
}
