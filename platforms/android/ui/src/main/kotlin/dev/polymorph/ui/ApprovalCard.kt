// ApprovalCard (`design/components/approval-card.md`): an in-thread request to
// allow an action an agent wants to take. ConfirmDialog's question without the
// modal: it sits in the thread beside the turn that asked, so the reader can
// keep reading, scroll back, or answer another one first.
//
// Alert's family: a column `space.4` apart inside `space.4` of padding, on the
// tone's wash inside its border at `radius.lg`. The head is the tone's glyph
// (`warning`, or `error` at `danger`), `md`, one `text.sm` line tall beside the
// title in `text.primary` and the description in `text.secondary`, both
// `text.sm`, `space.1` apart: hierarchy from colour, never from weight. The
// details are the app's children, on their own surfaces inside the wash.
//
// Undecided, the card ends in a wrapping row of two Buttons `space.3` apart:
// approve `solid/accent sm` (`solid/danger` at `danger`, so allowing what
// cannot be undone looks dangerous), the card's only solid, and deny
// `outline/neutral sm`, because declining is never dangerous. `pending` puts
// the named button in its loading state and disables the other. Once
// `decision` is set the buttons are removed, not disabled, and the outcome is
// drawn in their place (`PMGlyphLine`): the `confirm` glyph in `success.text`
// or `denied` in `text.muted`, beside the words, a record read in order; the
// wash turns to `bg.surface` inside `border.subtle` and the head's glyph to
// `text.muted`, because the question is answered. The wash and border change
// over the control duration (`stateFeedback`); nothing else moves.
//
// The card asks through `onApprove` and `onDeny` and draws `decision` as given;
// it never stores an answer. Its root is named by the title, the web's
// `section` labelled by its title, so a reader lands on the question.

package dev.polymorph.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

object PMApprovalCard : PMApprovalCardRendering {
    @Composable
    override fun Render(props: PMApprovalCardProps) {
        val theme = PM.theme
        val colors = theme.colors
        val space = theme.defaultDensity.spacing
        val motion = theme.defaultMotion
        val strings = PMSpecDefault.strings
        val tone = props.tone ?: PMApprovalCardTone.Warning
        val decided = props.decision != null
        val danger = tone == PMApprovalCardTone.Danger
        val spec = motion.easing.standard.tween<Color>(motion.duration.control)
        val wash by animateColorAsState(
            when {
                decided -> colors.bgSurface
                danger -> colors.dangerSubtle
                else -> colors.warningSubtle
            }.color,
            spec,
            label = "wash",
        )
        val border by animateColorAsState(
            when {
                decided -> colors.borderSubtle
                danger -> colors.dangerBorder
                else -> colors.warningBorder
            }.color,
            spec,
            label = "border",
        )
        val glyph = when {
            decided -> colors.textMuted
            danger -> colors.dangerText
            else -> colors.warningText
        }
        val shape = theme.rounded(theme.radius.lg)
        val attributes = buildMap {
            put("tone", tone.value)
            props.decision?.let { put("decision", it.value) }
            if (props.pending != null && !decided) put("state", "loading")
        }

        Column(
            Modifier
                .pmMember("ApprovalCard", attributes)
                .semantics {
                    contentDescription = props.title
                    isTraversalGroup = true
                }
                .fillMaxWidth()
                .background(wash, shape)
                .border(PMGeometry.hairline, border, shape)
                .padding(space.s4),
            verticalArrangement = Arrangement.spacedBy(space.s4),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(space.s3)) {
                Box(Modifier.heightIn(min = theme.text.sm.lineBox.dp), contentAlignment = Alignment.Center) {
                    PMIconView(if (danger) PMIconRole.Error else PMIconRole.Warning, PMControlSize.Md, tint = glyph.color)
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(space.s1)) {
                    Text(props.title, style = theme.text.sm.textStyle, color = colors.textPrimary.color)
                    props.description?.let { Text(it, style = theme.text.sm.textStyle, color = colors.textSecondary.color) }
                }
            }
            props.children?.invoke()
            when (val decision = props.decision) {
                null -> PMInline(gap = PMSpaceStep.S3, wrap = true) {
                    PMButton(
                        disabled = props.pending == PMApprovalCardPending.Denied,
                        label = props.approveLabel ?: strings.approve,
                        loading = props.pending == PMApprovalCardPending.Approved,
                        onClick = props.onApprove,
                        size = PMControlSize.Sm,
                        appearance = if (danger) PMButtonAppearance.SolidDanger else PMButtonAppearance.SolidAccent,
                    )
                    PMButton(
                        disabled = props.pending == PMApprovalCardPending.Approved,
                        label = props.denyLabel ?: strings.deny,
                        loading = props.pending == PMApprovalCardPending.Denied,
                        onClick = props.onDeny,
                        size = PMControlSize.Sm,
                        appearance = PMButtonAppearance.OutlineNeutral,
                    )
                }
                else -> {
                    val words = props.messages ?: strings.approvalCardMessages
                    val approved = decision == PMApprovalCardDecision.Approved
                    PMGlyphLine(
                        glyph = if (approved) PMIconRole.Confirm else PMIconRole.Denied,
                        glyphColor = if (approved) colors.successText else colors.textMuted,
                        text = if (approved) words.approved else words.denied,
                        step = theme.text.sm,
                    )
                }
            }
        }
    }
}

/** ApprovalCard's states, from the spec's States table. */
object ApprovalCardStates : PMStates {
    override val member = "ApprovalCard"

    private const val title = "Run the migration on production?"
    private const val description = "The agent wants to apply 3 schema changes to the live database."
    private const val delete = "Delete the release branch?"

    @Composable
    private fun Details() {
        PMCodeBlock(children = "pnpm db:migrate --env production")
    }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("asking", expect = mapOf("tone" to "warning", "label" to title, "contains" to "CodeBlock,Button")) {
                PMApprovalCard(description = description, onApprove = {}, onDeny = {}, title = title) { Details() }
            },
            PMStateEntry("danger — custom labels", expect = mapOf("tone" to "danger")) {
                PMApprovalCard(
                    approveLabel = "Delete branch",
                    denyLabel = "Keep it",
                    description = "This cannot be undone.",
                    onApprove = {},
                    onDeny = {},
                    title = delete,
                    tone = PMApprovalCardTone.Danger,
                )
            },
            PMStateEntry("pending — the pressed answer shows it", expect = mapOf("state" to "loading")) {
                PMApprovalCard(description = description, onApprove = {}, onDeny = {}, pending = PMApprovalCardPending.Approved, title = title)
            },
            PMStateEntry("allowed", expect = mapOf("decision" to "approved")) {
                PMApprovalCard(decision = PMApprovalCardDecision.Approved, description = description, onApprove = {}, onDeny = {}, title = title) { Details() }
            },
            PMStateEntry("denied", expect = mapOf("decision" to "denied")) {
                PMApprovalCard(decision = PMApprovalCardDecision.Denied, onApprove = {}, onDeny = {}, title = title)
            },
            PMStateEntry("title only", expect = mapOf("tone" to "warning")) {
                PMApprovalCard(onApprove = {}, onDeny = {}, title = title)
            },
        )
}
