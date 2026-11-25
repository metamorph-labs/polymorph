// ChoiceCard (`design/components/choice-card.md`): RadioGroup's or
// CheckboxGroup's choice drawn as cards with room for an icon and a line of
// copy. `mode` says which: `single` holds one value and cannot be cleared once
// chosen, `multiple` holds any number, none included, reported in the
// options' order. The value is a `PMChoiceValue`, `Single` or `Multiple` by
// the mode; a value of the other case is read as its nearest, a list as its
// first value in the options' order.
//
// Each option is a card with Card's geometry and not its elevation, because a
// choice sits in the page: `bg.surface` in a `border.subtle` hairline,
// `radius.lg`, `space-6` inside. Its icon (`md`, `text.secondary`) is on top,
// `space-3` above the label in `text.sm`, and the description under the label
// in `text.xs` `text.muted`, `space-1` apart. A pointer over an unchecked card
// washes it `bg.subtle` and changes nothing else. A press is a ripple, as
// Android draws one, in that wash, or in `accent.subtle-hover` on a checked
// card it unchecks; a chosen card in `single` mode, which a press does not
// change, draws none. Checked, a card takes the `accent.subtle` wash,
// an `accent.bg` hairline of the same width, and the `confirm` glyph in
// `accent.text` at its top trailing corner, `space-4` in, which pops in on the
// `snappy` spring and fades out (`PMPopIn`). The copy always keeps the glyph's
// lane clear, so nothing moves when it appears, and the glyph is the
// selection, never the colour alone. A disabled card is `bg.subtle` in
// `border.subtle` with `text.disabled` copy, and keeps its glyph, dimmed, when
// checked. Keyboard focus draws the focus ring around the card.
//
// The cards are laid out by Grid's ladder (`PMGridLayout`) with a `space-4`
// gap, as tall as the tallest card in their row: `columns` (1 by default) is
// a ceiling the width resolves, so a phone shows one column.
//
// The semantics are Android's: in `single` mode the root is a selectable
// group and each card a radio button, in `multiple` each card a checkbox. A
// card is one node, named by its label and its description read together, as
// a Material list item reads its lines, selected or checked by its state, and
// disabled when it or the group is. The root is named by `label`. The arrow
// keys move focus between the cards and Enter or Space chooses one; in
// `single` mode the web's arrows also choose, which Android's radio buttons do
// not.

package dev.polymorph.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp

object PMChoiceCard : PMChoiceCardRendering {
    @Composable
    override fun Render(props: PMChoiceCardProps) {
        val space = PM.theme.defaultDensity.spacing
        val multiple = props.mode == PMChoiceCardMode.Multiple
        val values = props.options.map { it.value }
        var own by remember { mutableStateOf(listed(props.defaultValue)) }
        // The checked values in the options' order: the controlled `value` when
        // given, otherwise the group's own; one at most in `single` mode.
        val current = PMChoices.ordered(values, props.value?.let { listed(it) } ?: own)
            .let { if (multiple) it else it.take(1) }
        val disabled = (props.disabled ?: false) || !LocalPMEnabled.current
        val columns = props.columns ?: PMChoiceCardColumns.Columns1
        val attributes = buildMap {
            put("mode", props.mode.value)
            put("columns", columns.value.toString())
            put("checked", current.size.toString())
            if (disabled) put("disabled", "true")
        }
        val choose: (String) -> Unit = { value ->
            val on = value in current
            // A single choice cannot be cleared: choosing the chosen card does nothing.
            if (multiple || !on) {
                val next = if (multiple) PMChoices.toggled(values, current, value, !on) else listOf(value)
                own = next
                props.onChange?.invoke(if (multiple) PMChoiceValue.Multiple(next) else PMChoiceValue.Single(value))
            }
        }

        PMGridLayout(
            ceiling = columns.value,
            gap = space.s4,
            align = PMCrossAlign.Stretch,
            modifier = Modifier
                .pmMember("ChoiceCard", attributes)
                .pmChoiceGroup(name = props.label, error = null, single = !multiple),
        ) {
            for (option in props.options) {
                key(option.value) {
                    Option(option, option.value in current, disabled || option.disabled == true, multiple) {
                        choose(option.value)
                    }
                }
            }
        }
    }

    /** A value as the list of values it names. */
    private fun listed(value: PMChoiceValue?): List<String> = when (value) {
        is PMChoiceValue.Single -> if (value.value.isEmpty()) emptyList() else listOf(value.value)
        is PMChoiceValue.Multiple -> value.value
        null -> emptyList()
    }

    /** One card: the surface by state, the copy, and the glyph. */
    @Composable
    private fun Option(option: PMChoiceCardOption, checked: Boolean, disabled: Boolean, multiple: Boolean, choose: () -> Unit) {
        val theme = PM.theme
        val colors = theme.colors
        val space = theme.defaultDensity.spacing
        val motion = theme.defaultMotion
        val interaction = remember { MutableInteractionSource() }
        val hovered by interaction.collectIsHoveredAsState()
        val focused by interaction.collectIsFocusedAsState()
        val spec = motion.easing.standard.tween<Color>(motion.duration.control)
        val fill by animateColorAsState(
            when {
                disabled -> colors.bgSubtle
                checked -> colors.accentSubtle
                hovered -> colors.bgSubtle
                else -> colors.bgSurface
            }.color,
            spec,
            label = "fill",
        )
        val border by animateColorAsState(
            (if (checked && !disabled) colors.accentBg else colors.borderSubtle).color,
            spec,
            label = "border",
        )
        val shape = theme.rounded(theme.radius.lg)
        // A press on a chosen single card changes nothing, so it draws no wave.
        val live = !disabled && (multiple || !checked)
        val choosing = if (multiple) {
            Modifier.toggleable(
                value = checked,
                interactionSource = interaction,
                indication = null,
                enabled = !disabled,
                role = Role.Checkbox,
            ) { choose() }
        } else {
            Modifier.selectable(
                selected = checked,
                interactionSource = interaction,
                indication = null,
                enabled = !disabled,
                role = Role.RadioButton,
                onClick = choose,
            )
        }

        Box(
            Modifier
                .then(choosing)
                // Outside the clip, so a mark a system draws outside the edge is
                // not cut.
                .pmFocusRing(focused && !disabled, theme.radius.lg.dp)
                .clip(shape)
                .background(fill)
                .border(PMGeometry.hairline, border, shape),
        ) {
            if (live) {
                PMPressLayer(
                    interaction,
                    (if (checked) colors.accentSubtleHover else colors.bgSubtle).color,
                    Modifier.matchParentSize(),
                )
            }
            Column(
                Modifier
                    .fillMaxWidth()
                    .padding(space.s6)
                    // The glyph's lane, kept clear in both states.
                    .padding(end = theme.icon.md.size.dp + space.s2),
            ) {
                option.icon?.let {
                    PMIconView(
                        it,
                        PMControlSize.Md,
                        Modifier.padding(bottom = space.s3),
                        tint = (if (disabled) colors.textDisabled else colors.textSecondary).color,
                    )
                }
                Text(
                    text = option.label,
                    style = theme.text.sm.textStyle,
                    color = (if (disabled) colors.textDisabled else colors.textPrimary).color,
                )
                option.description?.let { PMChoiceDescription(it, disabled, Modifier.padding(top = space.s1)) }
            }
            PMPopIn(checked, Modifier.align(Alignment.TopEnd).padding(space.s4)) {
                PMIconView(
                    PMIconRole.Confirm,
                    PMControlSize.Md,
                    tint = (if (disabled) colors.textDisabled else colors.accentText).color,
                )
            }
        }
    }
}

/**
 * ChoiceCard's states, from the spec's States table. The canvas is narrower
 * than 28rem, where the ladder draws one column; the column entries lay their
 * cards out at the width that admits their ceiling and scale them to fit.
 */
object ChoiceCardStates : PMStates {
    override val member = "ChoiceCard"

    private val plans = listOf(
        PMChoiceCardOption(value = "starter", label = "Starter", description = "For side projects and solo queues"),
        PMChoiceCardOption(value = "team", label = "Team", description = "Shared inboxes for up to 20 agents"),
        PMChoiceCardOption(value = "scale", label = "Scale", description = "SSO, audit log, unlimited agents"),
    )

    private val channels = listOf(
        PMChoiceCardOption("email", "Email", "Every public reply, in your inbox", PMIconRole.Inbox),
        PMChoiceCardOption("inapp", "In-app", "Badges in the sidebar as it happens", PMIconRole.Notification),
        PMChoiceCardOption("chat", "Chat", "Mirror threads to your chat tool", PMIconRole.Comment),
        PMChoiceCardOption("webhook", "Webhook", "POST every event to your endpoint", PMIconRole.Link),
    )

    private val webhookLater = channels.map {
        if (it.value == "webhook") it.copy(description = "Available on Scale", disabled = true) else it
    }

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry(
                "single 3-up",
                expect = mapOf("mode" to "single", "columns" to "3", "checked" to "1", "label" to "Plan"),
            ) {
                PMFixtureWidth(gridWideWidth) {
                    PMChoiceCard(
                        columns = PMChoiceCardColumns.Columns3,
                        defaultValue = PMChoiceValue.Single("team"),
                        label = "Plan",
                        mode = PMChoiceCardMode.Single,
                        options = plans,
                    )
                }
            },
            PMStateEntry("single 3-up on a phone — one column", expect = mapOf("columns" to "3", "checked" to "1")) {
                PMChoiceCard(
                    columns = PMChoiceCardColumns.Columns3,
                    defaultValue = PMChoiceValue.Single("team"),
                    label = "Plan",
                    mode = PMChoiceCardMode.Single,
                    options = plans,
                )
            },
            PMStateEntry(
                "multiple, two selected",
                expect = mapOf("mode" to "multiple", "checked" to "2", "label" to "Channels"),
            ) {
                PMChoiceCard(
                    defaultValue = PMChoiceValue.Multiple(listOf("inapp", "email")),
                    label = "Channels",
                    mode = PMChoiceCardMode.Multiple,
                    options = channels,
                )
            },
            PMStateEntry("descriptions and icons, none selected", expect = mapOf("checked" to "0")) {
                PMChoiceCard(label = "Channels", mode = PMChoiceCardMode.Multiple, options = channels)
            },
            PMStateEntry("disabled option", expect = mapOf("checked" to "1")) {
                PMChoiceCard(
                    defaultValue = PMChoiceValue.Multiple(listOf("email")),
                    label = "Channels",
                    mode = PMChoiceCardMode.Multiple,
                    options = webhookLater,
                )
            },
            PMStateEntry(
                "the whole group disabled — the checked card keeps its glyph",
                expect = mapOf("disabled" to "true", "checked" to "1"),
            ) {
                PMChoiceCard(
                    defaultValue = PMChoiceValue.Single("team"),
                    disabled = true,
                    label = "Plan",
                    mode = PMChoiceCardMode.Single,
                    options = plans,
                )
            },
            PMStateEntry("2-column — the ceiling the width resolves", expect = mapOf("columns" to "2", "checked" to "1")) {
                PMFixtureWidth(gridWideWidth) {
                    PMChoiceCard(
                        columns = PMChoiceCardColumns.Columns2,
                        defaultValue = PMChoiceValue.Multiple(listOf("chat")),
                        label = "Channels",
                        mode = PMChoiceCardMode.Multiple,
                        options = channels,
                    )
                }
            },
        )
}
