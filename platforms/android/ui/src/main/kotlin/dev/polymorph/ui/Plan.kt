// Plan (`design/components/plan.md`): the steps of one agent run, each with
// its status, which the app passes whole on every change. It is not Stepper,
// whose flow the reader walks, and not Timeline, whose events are over. It is
// flat and read-only: nothing in it is pressed or opened, and it never infers,
// times or reorders a step.
//
// The list has no surface of its own: it takes the turn's, the Card's or the
// pane's. The steps are `space.3` apart, each a row `space.2` apart of the
// status glyph and the copy, top-aligned. The glyph (`sm`) sits in a column
// one `text.sm` line tall, so it stays beside the title's first line however
// far the title wraps: pending `time` and skipped `remove` in `text.muted`,
// running `loading` in `accent.text` on the spin loop, done `success` in
// `success.text`, error `error` in `danger.text`. A new status fades the glyph
// in over the control duration (`toolcall.status`). The title is `text.sm` in
// `text.primary`, the description `text.xs` in `text.secondary` `2dp` under
// it; a pending or skipped step steps both down a role, to `text.secondary`
// and `text.muted`. Right to left, the row mirrors.
//
// The status is never the glyph alone. The list is one node named by `label`,
// which TalkBack reads as a collection of its steps, and each step is one node
// read as its title, its status words from `messages.status` and its
// description ("Write the migration, Running"); the glyph column is hidden. A
// status `messages.status` lacks takes its default words. The first running
// step is selected, the web's `aria-current="step"`, as Stepper's active step
// is. Compose has no busy state for a node, so a running step is told by its
// words alone. The status line is a polite live region (`PMAnnouncement`)
// that names the step at the front of the run with its status words
// (`front`), which TalkBack announces when it changes and never for a
// description. An empty Plan draws nothing: a plan not yet made is the page's
// to show.

package dev.polymorph.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.CollectionInfo
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.collectionInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.sp
import dev.polymorph.tokens.PMDynamicColor

object PMPlan : PMPlanRendering {
    @Composable
    override fun Render(props: PMPlanProps) {
        val steps = props.steps
        if (steps.isEmpty()) return
        val theme = PM.theme
        val strings = PMSpecDefault.strings
        val words: (PMPlanStatus) -> String = { status ->
            props.messages?.status?.get(status) ?: when (status) {
                PMPlanStatus.Pending -> strings.planPending
                PMPlanStatus.Running -> strings.planRunning
                PMPlanStatus.Done -> strings.planDone
                PMPlanStatus.Error -> strings.planFailed
                PMPlanStatus.Skipped -> strings.planSkipped
            }
        }
        val current = steps.indexOfFirst { it.status == PMPlanStatus.Running }
        val front = front(steps)
        val attributes = buildMap {
            put("steps", steps.size.toString())
            if (current != -1) put("current", steps[current].id)
            front?.let { put("front", it.id) }
        }

        Column(
            Modifier
                .pmMember("Plan", attributes)
                .semantics {
                    contentDescription = props.label
                    collectionInfo = CollectionInfo(rowCount = steps.size, columnCount = 1)
                    isTraversalGroup = true
                }
                .fillMaxWidth(),
        ) {
            // The steps in a column of their own, so the status line, which
            // takes no room, adds no gap after the last one.
            Column(
                Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(theme.defaultDensity.spacing.s3),
            ) {
                // Keyed by id, so a step keeps its row, and its glyph's fade,
                // while the steps around it change.
                steps.forEachIndexed { index, step ->
                    key(step.id) { Step(step, words(step.status), current = index == current) }
                }
            }
            PMAnnouncement(front?.let { it.title + SEPARATOR + words(it.status) })
        }
    }

    /**
     * The step at the front of the run, which the status line names: the
     * first running step; with none running, the first failed one; with
     * neither, the last one done or skipped. None while every step is pending.
     */
    internal fun front(steps: List<PMPlanStep>): PMPlanStep? =
        steps.firstOrNull { it.status == PMPlanStatus.Running }
            ?: steps.firstOrNull { it.status == PMPlanStatus.Error }
            ?: steps.lastOrNull { it.status == PMPlanStatus.Done || it.status == PMPlanStatus.Skipped }

    /** One step: the glyph column beside the title and the description, read as one node. */
    @Composable
    private fun Step(step: PMPlanStep, words: String, current: Boolean) {
        val theme = PM.theme
        val colors = theme.colors
        val motion = theme.defaultMotion
        val quiet = step.status == PMPlanStatus.Pending || step.status == PMPlanStatus.Skipped
        val line = with(LocalDensity.current) { theme.text.sm.lineBox.sp.toDp() }
        val spoken = listOfNotNull(step.title, words, step.description).joinToString(SEPARATOR)
        Row(
            Modifier
                .fillMaxWidth()
                // One node with the whole reading, so the description is read
                // after the status words and the glyph column says nothing.
                .clearAndSetSemantics {
                    contentDescription = spoken
                    if (current) selected = true
                },
            horizontalArrangement = Arrangement.spacedBy(theme.defaultDensity.spacing.s2),
            verticalAlignment = Alignment.Top,
        ) {
            Box(Modifier.height(line), contentAlignment = Alignment.Center) {
                AnimatedContent(
                    targetState = step.status,
                    transitionSpec = {
                        fadeIn(motion.easing.enter.tween(motion.duration.control)) togetherWith
                            fadeOut(motion.easing.exit.tween(motion.duration.controlExit))
                    },
                    label = "status",
                ) { status -> Glyph(status) }
            }
            Column(Modifier.weight(1f)) {
                Text(
                    text = step.title,
                    style = theme.text.sm.textStyle,
                    color = (if (quiet) colors.textSecondary else colors.textPrimary).color,
                )
                step.description?.let {
                    Text(
                        text = it,
                        style = theme.text.xs.textStyle,
                        color = (if (quiet) colors.textMuted else colors.textSecondary).color,
                        modifier = Modifier.padding(top = PMGeometry.subline),
                    )
                }
            }
        }
    }

    /** The status's glyph in its role's colour; `running` spins. */
    @Composable
    private fun Glyph(status: PMPlanStatus) {
        val colors = PM.theme.colors
        val (role, tint) = when (status) {
            PMPlanStatus.Pending -> PMIconRole.Time to colors.textMuted
            PMPlanStatus.Running -> PMIconRole.Loading to colors.accentText
            PMPlanStatus.Done -> PMIconRole.Success to colors.successText
            PMPlanStatus.Error -> PMIconRole.Error to colors.dangerText
            PMPlanStatus.Skipped -> PMIconRole.Remove to colors.textMuted
        }
        if (status == PMPlanStatus.Running) PMSpinGlyph(PMControlSize.Sm, tint.color) else PMIconView(role, PMControlSize.Sm, tint = tint.color)
    }

    private const val SEPARATOR = ", "
}

/**
 * Plan's states, from the spec's States table: a run under way, every status,
 * a failed run, nothing started and every step done. The empty Plan draws
 * nothing, so it has no entry: the harness holds every entry to drawing.
 */
object PlanStates : PMStates {
    override val member = "Plan"

    private const val label = "Plan for this run"

    private val run = listOf(
        PMPlanStep("read", "Read the webhook retry code", "src/webhooks/retry.ts and its two callers", PMPlanStatus.Done),
        PMPlanStep(
            "cause",
            "Find why a retry reuses the promo code",
            "The idempotency key is built before the code is applied.",
            PMPlanStatus.Done,
        ),
        PMPlanStep(
            "fix",
            "Build the idempotency key after the code is applied",
            "Editing src/webhooks/deliver.ts",
            PMPlanStatus.Running,
        ),
        PMPlanStep("test", "Run the webhook tests", status = PMPlanStatus.Pending),
        PMPlanStep("review", "Open a pull request for review", status = PMPlanStatus.Pending),
    )

    private val every = listOf(
        PMPlanStep("done", "A step that is done", status = PMPlanStatus.Done),
        PMPlanStep("running", "A step that is running", status = PMPlanStatus.Running),
        PMPlanStep("error", "A step that failed", status = PMPlanStatus.Error),
        PMPlanStep("skipped", "A step that was skipped", status = PMPlanStatus.Skipped),
        PMPlanStep("pending", "A step that has not started", status = PMPlanStatus.Pending),
    )

    private val failed = listOf(
        PMPlanStep("read", "Read the webhook retry code", status = PMPlanStatus.Done),
        PMPlanStep("test", "Run the webhook tests", "Three tests failed in deliver.test.ts.", PMPlanStatus.Error),
        PMPlanStep("fix", "Fix what the tests found", status = PMPlanStatus.Skipped),
        PMPlanStep("review", "Open a pull request for review", status = PMPlanStatus.Skipped),
    )

    private fun all(status: PMPlanStatus) = run.map { it.copy(status = status) }

    private val german = PMPlanMessages(
        mapOf(
            PMPlanStatus.Pending to "Ausstehend",
            PMPlanStatus.Running to "Läuft",
            PMPlanStatus.Done to "Erledigt",
            PMPlanStatus.Error to "Fehlgeschlagen",
            PMPlanStatus.Skipped to "Übersprungen",
        ),
    )

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry(
                "running — two steps done, one running, two to come",
                expect = mapOf("label" to label, "steps" to "5", "current" to "fix", "front" to "fix"),
            ) { PMPlan(label = label, steps = run) },
            PMStateEntry(
                "every status — one step of each",
                expect = mapOf("label" to "Every status", "current" to "running", "front" to "running"),
            ) { PMPlan(label = "Every status", steps = every) },
            PMStateEntry(
                "failed — the run stopped, and the rest was skipped",
                expect = mapOf("steps" to "4", "current" to "", "front" to "test"),
            ) { PMPlan(label = label, steps = failed) },
            PMStateEntry("pending — nothing has started", expect = mapOf("steps" to "5", "current" to "", "front" to "")) {
                PMPlan(label = label, steps = all(PMPlanStatus.Pending))
            },
            PMStateEntry("done — every step finished", expect = mapOf("steps" to "5", "current" to "", "front" to "review")) {
                PMPlan(label = label, steps = all(PMPlanStatus.Done))
            },
            PMStateEntry(
                "a long path — the title wraps, the glyph by its first line",
                expect = mapOf("current" to "path", "front" to "path"),
            ) {
                PMPlan(
                    label = label,
                    steps = listOf(
                        PMPlanStep(
                            "path",
                            "Read src/deeply-nested-directory/deeply-nested-directory/deeply-nested-directory/retry.ts",
                            "Found idempotency-key-idempotency-key-idempotency-key-builder",
                            PMPlanStatus.Running,
                        ),
                        PMPlanStep("next", "Run the webhook tests", status = PMPlanStatus.Pending),
                    ),
                )
            },
            PMStateEntry(
                "the app’s words — every status in German",
                expect = mapOf("label" to "Plan für diesen Lauf", "current" to "running"),
            ) { PMPlan(label = "Plan für diesen Lauf", messages = german, steps = every) },
        )
}
