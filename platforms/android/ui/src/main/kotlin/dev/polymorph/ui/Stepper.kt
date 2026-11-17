// Stepper (`design/components/stepper.md`): progress through an ordered flow.
// Every step before `activeIndex` is completed, the step at it is active, and
// every step after it is upcoming; a step with `error` shows the danger mark
// instead, while the connector fill, the selected state and revisiting still
// follow `activeIndex`. Progress is the accent family, not the selection
// roles: a done step is not a chosen row.
//
// The mark is `PMMarkDisc`: completed is the accent fill with the `confirm`
// check, lit; active is the accent wash with an accent border and the number;
// upcoming is a border with the muted number; error is the danger wash and
// border with the `error` glyph. The number is `text.xs` with tabular figures.
// The label is `text.sm`, primary on a visited step and secondary on one to
// come; the description is `text.xs`, muted, `2dp` under it. The connector
// after a completed step is `accent.bg` and the rest `border.default`, so the
// line fills as the flow advances, over the surface duration.
//
// Horizontal is the web's row, the label beside each mark (`space.3`) and a
// connector of at least `space.6` between steps (`space.4` either side of it),
// when the row fits; when it does not, as on a phone, each label sits under
// its mark in an equal column and the connectors join the marks, so the steps
// stay in one row and a label wraps rather than the row overflowing. Vertical
// stacks the steps, the connector running down from under each mark to the
// next, `space.2` clear of both.
//
// With `onStepSelect`, a completed step is pressable and reports its index,
// its label in `accent.text` under the pointer and while pressed, its hit area
// at least the hit target, and keyboard focus draws the focus ring; active and
// upcoming steps never are. Each step is one node, named by its label and the
// spoken clause (`spoken`, or the spec's English, "step 2 of 4, current"),
// then its description, so the mark never carries the state. The active step
// is selected, the web's `aria-current="step"`. When a step becomes completed
// its check pops in from half size on the `snappy` spring with a fade.

package dev.polymorph.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.layout.SubcomposeLayout
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

object PMStepper : PMStepperRendering {
    /** One step as drawn: its position, its walk state, the state it shows, and whether it is pressable. */
    private class Model(
        val index: Int,
        val count: Int,
        val step: PMStep,
        val walk: PMStepperSpokenState,
        val state: PMStepperSpokenState,
        val interactive: Boolean,
    ) {
        val last: Boolean get() = index == count - 1
    }

    @Composable
    override fun Render(props: PMStepperProps) {
        val orientation = props.orientation ?: PMStepperOrientation.Horizontal
        val active = props.activeIndex.toInt()
        val models = props.steps.mapIndexed { index, step ->
            val walk = when {
                index < active -> PMStepperSpokenState.Completed
                index == active -> PMStepperSpokenState.Active
                else -> PMStepperSpokenState.Upcoming
            }
            Model(
                index = index,
                count = props.steps.size,
                step = step,
                walk = walk,
                state = if (step.error == true) PMStepperSpokenState.Error else walk,
                interactive = walk == PMStepperSpokenState.Completed && props.onStepSelect != null,
            )
        }
        val root = Modifier
            .pmMember("Stepper", mapOf("orientation" to orientation.value))
            .semantics { isTraversalGroup = true }
            .fillMaxWidth()

        when (orientation) {
            PMStepperOrientation.Horizontal -> Box(root) { Row(models, props) }
            PMStepperOrientation.Vertical -> Column(root) { for (model in models) Down(model, props) }
        }
    }

    /**
     * The horizontal form: the web's row when its natural width fits, else
     * the stacked row, each label under its mark.
     */
    @Composable
    private fun Row(models: List<Model>, props: PMStepperProps) {
        SubcomposeLayout { constraints ->
            val inline = subcompose(INLINE) { InlineRow(models, props) }.first()
            val natural = inline.maxIntrinsicWidth(constraints.maxHeight)
            val chosen = if (!constraints.hasBoundedWidth || natural <= constraints.maxWidth) {
                inline
            } else {
                subcompose(STACKED) { StackedRow(models, props) }.first()
            }
            val placeable = chosen.measure(constraints.copy(minHeight = 0))
            layout(placeable.width, placeable.height) { placeable.placeRelative(0, 0) }
        }
    }

    /** The web's row: the label beside each mark, a connector growing between steps. */
    @Composable
    private fun InlineRow(models: List<Model>, props: PMStepperProps) {
        val space = PM.theme.defaultDensity.spacing
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(space.s4)) {
            for (model in models) {
                Step(model, props) {
                    Row(horizontalArrangement = Arrangement.spacedBy(space.s3)) {
                        Indicator(model.state, model.index + 1)
                        Copy(model, props, centred = false)
                    }
                }
                if (!model.last) {
                    Box(Modifier.weight(1f).widthIn(min = space.s6).height(space.s6), contentAlignment = Alignment.Center) {
                        Connector(model.walk == PMStepperSpokenState.Completed, vertical = false)
                    }
                }
            }
        }
    }

    /** The phone's row: each label under its mark in an equal column, the connectors joining the marks. */
    @Composable
    private fun StackedRow(models: List<Model>, props: PMStepperProps) {
        val space = PM.theme.defaultDensity.spacing
        val active = props.activeIndex.toInt()
        Row(Modifier.fillMaxWidth()) {
            for (model in models) {
                Box(Modifier.weight(1f)) {
                    Step(model, props, fill = true) {
                        Column(
                            Modifier.fillMaxWidth(),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(space.s2),
                        ) {
                            Row(
                                Modifier.fillMaxWidth().height(space.s6),
                                horizontalArrangement = Arrangement.spacedBy(space.s2),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                // The line from the previous mark, filled when that step is done.
                                Box(Modifier.weight(1f).alpha(if (model.index > 0) 1f else 0f)) {
                                    Connector(model.index <= active, vertical = false)
                                }
                                Indicator(model.state, model.index + 1)
                                Box(Modifier.weight(1f).alpha(if (model.last) 0f else 1f)) {
                                    Connector(model.walk == PMStepperSpokenState.Completed, vertical = false)
                                }
                            }
                            Copy(model, props, centred = true)
                        }
                    }
                }
            }
        }
    }

    /**
     * A step in the vertical form: the mark with the connector running down
     * from it beside the copy, and room under the copy for the line to reach
     * the next mark.
     */
    @Composable
    private fun Down(model: Model, props: PMStepperProps) {
        val space = PM.theme.defaultDensity.spacing
        Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
            Column(
                Modifier.width(space.s6).fillMaxHeight(),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Indicator(model.state, model.index + 1)
                if (!model.last) {
                    Spacer(Modifier.height(space.s2))
                    Box(Modifier.weight(1f)) { Connector(model.walk == PMStepperSpokenState.Completed, vertical = true) }
                    Spacer(Modifier.height(space.s2))
                }
            }
            Box(Modifier.weight(1f).padding(start = space.s3, bottom = if (model.last) 0.dp else space.s6)) {
                Step(model, props) { Copy(model, props, centred = false) }
            }
        }
    }

    /**
     * A step's node: pressable for a revisitable step, otherwise the step as
     * one element. Either way it is named by its copy (the label with the
     * spoken clause, then the description) and is selected when active. A
     * pressable step's hit area is at least the hit target; `fill` gives the
     * step the width it is offered, as a column of the stacked row.
     */
    @Composable
    private fun Step(model: Model, props: PMStepperProps, fill: Boolean = false, content: @Composable () -> Unit) {
        val theme = PM.theme
        val select = props.onStepSelect
        val selected = model.walk == PMStepperSpokenState.Active
        val width = if (fill) Modifier.fillMaxWidth() else Modifier
        if (!model.interactive || select == null) {
            Box(width.semantics(mergeDescendants = true) { if (selected) this.selected = true }) { content() }
            return
        }
        val interaction = remember { MutableInteractionSource() }
        val hovered by interaction.collectIsHoveredAsState()
        val pressed by interaction.collectIsPressedAsState()
        val focused by interaction.collectIsFocusedAsState()
        val target = theme.defaultDensity.hitTarget.dp
        Box(
            width
                .clickable(interactionSource = interaction, indication = null) { select(model.index.toDouble()) }
                .semantics { role = Role.Button }
                .widthIn(min = target)
                .heightIn(min = target)
                .pmFocusRing(focused, theme.radius.sm.dp),
        ) {
            CompositionLocalProvider(LocalStepActive provides (hovered || pressed)) { content() }
        }
    }

    /** Whether the pressable step around a label is under the pointer or pressed. */
    private val LocalStepActive = compositionLocalOf { false }

    /** The label, named with the spoken clause, and the description under it. */
    @Composable
    private fun Copy(model: Model, props: PMStepperProps, centred: Boolean) {
        val theme = PM.theme
        val strings = PMSpecDefault.strings
        val word = when (model.state) {
            PMStepperSpokenState.Completed -> strings.stepCompleted
            PMStepperSpokenState.Active -> strings.stepCurrent
            PMStepperSpokenState.Upcoming -> strings.stepUpcoming
            PMStepperSpokenState.Error -> strings.stepError
        }
        val spoken = props.spoken?.invoke(PMStepperSpokenStep(model.index + 1.0, model.count.toDouble(), model.state))
            ?: strings.stepperSpoken(model.index + 1.0, model.count.toDouble(), word)
        val rest = if (model.walk == PMStepperSpokenState.Upcoming) theme.colors.textSecondary else theme.colors.textPrimary
        val motion = theme.defaultMotion
        val label by animateColorAsState(
            (if (LocalStepActive.current) theme.colors.accentText else rest).color,
            motion.easing.standard.tween(motion.duration.control),
            label = "label",
        )
        val align = if (centred) TextAlign.Center else TextAlign.Start
        Column(horizontalAlignment = if (centred) Alignment.CenterHorizontally else Alignment.Start) {
            Text(
                text = model.step.label,
                style = theme.text.sm.textStyle,
                color = label,
                textAlign = align,
                modifier = Modifier.semantics { contentDescription = "${model.step.label}, $spoken" },
            )
            model.step.description?.let {
                Text(
                    text = it,
                    style = theme.text.xs.textStyle,
                    color = theme.colors.textMuted.color,
                    textAlign = align,
                    modifier = Modifier.padding(top = PMGeometry.subline),
                )
            }
        }
    }

    /** The step's mark in its state's recipe; the check pops in when the step becomes completed. */
    @Composable
    private fun Indicator(state: PMStepperSpokenState, number: Int) {
        val theme = PM.theme
        val c = theme.colors
        val motion = theme.defaultMotion
        val (fill, border, foreground) = when (state) {
            PMStepperSpokenState.Completed -> Triple(c.accentBg, null, c.accentContrast)
            PMStepperSpokenState.Active -> Triple(c.accentSubtle, c.accentBg, c.accentText)
            PMStepperSpokenState.Upcoming -> Triple(null, c.borderDefault, c.textMuted)
            PMStepperSpokenState.Error -> Triple(c.dangerSubtle, c.dangerBorder, c.dangerText)
        }
        PMMarkDisc(fill = fill, border = border, foreground = foreground, lit = state == PMStepperSpokenState.Completed) {
            AnimatedContent(
                targetState = state,
                transitionSpec = {
                    val enter = if (targetState == PMStepperSpokenState.Completed) {
                        scaleIn(motion.spring.snappy.spec(), initialScale = POP_FROM) +
                            fadeIn(motion.easing.enter.tween(motion.duration.control))
                    } else {
                        fadeIn(motion.easing.enter.tween(motion.duration.control))
                    }
                    enter togetherWith fadeOut(motion.easing.exit.tween(motion.duration.controlExit))
                },
                label = "indicator",
            ) { shown ->
                when (shown) {
                    PMStepperSpokenState.Completed -> PMIconView(PMIconRole.Confirm, PMControlSize.Sm, tint = foreground.color)
                    PMStepperSpokenState.Error -> PMIconView(PMIconRole.Error, PMControlSize.Sm, tint = foreground.color)
                    else -> Text(
                        text = number.toString(),
                        style = theme.text.xs.textStyle.tabular(theme),
                        color = foreground.color,
                        maxLines = 1,
                    )
                }
            }
        }
    }

    /** The line between two steps: `accent.bg` after a completed step, else `border.default`. */
    @Composable
    private fun Connector(filled: Boolean, vertical: Boolean) {
        val theme = PM.theme
        val motion = theme.defaultMotion
        val color by animateColorAsState(
            (if (filled) theme.colors.accentBg else theme.colors.borderDefault).color,
            motion.easing.standard.tween(motion.duration.surface),
            label = "connector",
        )
        Box(
            (if (vertical) Modifier.width(PMGeometry.hairline).fillMaxHeight() else Modifier.fillMaxWidth().height(PMGeometry.hairline))
                .background(color),
        )
    }

    /** The scale the check pops from: half, the recipe's. */
    private const val POP_FROM = 0.5f

    private const val INLINE = "inline"
    private const val STACKED = "stacked"
}

/** Stepper's states, from the spec's States table. */
object StepperStates : PMStates {
    override val member = "Stepper"

    private val migration = listOf(PMStep("Connect"), PMStep("Map fields"), PMStep("Review"), PMStep("Import"))
    private val described = listOf(
        PMStep("Connect", "Point us at your old help desk"),
        PMStep("Map fields", "Match their names to ours"),
        PMStep("Review", "Check a sample of 20 tickets"),
        PMStep("Import", "Roughly an hour for 10,000"),
    )
    private val failed = listOf(PMStep("Connect"), PMStep("Map fields", error = true), PMStep("Review"), PMStep("Import"))
    private val short = listOf(PMStep("Plan"), PMStep("Pay"), PMStep("Done"))

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry("mid-flow — two done, one current, one to come", expect = mapOf("orientation" to "horizontal")) {
                PMStepper(activeIndex = 2.0, steps = migration)
            },
            PMStateEntry("start — nothing behind you yet") { PMStepper(activeIndex = 0.0, steps = migration) },
            PMStateEntry("end — the last step is the current one") { PMStepper(activeIndex = 3.0, steps = migration) },
            PMStateEntry("with descriptions") { PMStepper(activeIndex = 1.0, steps = described) },
            PMStateEntry("revisitable — completed steps are pressable") {
                PMStepper(activeIndex = 2.0, onStepSelect = {}, steps = migration)
            },
            PMStateEntry("vertical", expect = mapOf("orientation" to "vertical")) {
                PMStepper(activeIndex = 2.0, orientation = PMStepperOrientation.Vertical, steps = described)
            },
            PMStateEntry("vertical and revisitable", expect = mapOf("orientation" to "vertical")) {
                PMStepper(activeIndex = 2.0, onStepSelect = {}, orientation = PMStepperOrientation.Vertical, steps = migration)
            },
            PMStateEntry("errored step — the danger family on the mark, the sentence unchanged") {
                PMStepper(activeIndex = 2.0, steps = failed)
            },
            PMStateEntry("short labels — the web's row, when it fits") { PMStepper(activeIndex = 1.0, steps = short) },
            PMStateEntry("localized — the app's spoken clause") {
                PMStepper(
                    activeIndex = 1.0,
                    spoken = { "Schritt ${it.position.toInt()} von ${it.count.toInt()}" },
                    steps = short,
                )
            },
        )
}
