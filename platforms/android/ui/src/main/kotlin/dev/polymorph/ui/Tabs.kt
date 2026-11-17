// Tabs (`design/components/tabs.md`): peer views of one subject, one shown at
// a time. One variant, underline: a row of triggers `space-5` apart over a
// full-width `border.subtle` rule, and one accent rule, twice the hairline,
// under the active trigger, which slides between triggers on the `default`
// spring. A row wider than the screen scrolls sideways, as Android's
// scrollable tab row does. A trigger is its icon (`sm`, muted), its label in
// `text.sm` and its count as a Badge, soft neutral, soft accent while its tab
// is active; the label is `text.secondary` at rest, `text.primary` under the
// pointer, while pressed and while active, and `text.disabled` on a disabled
// tab, and keyboard focus draws the focus ring around it. Vertical is the same
// strip on its side: a column of triggers beside the content, `space-6` from
// it, the rule down its start edge.
//
// The panels are the children, one `PMTabsContent` per tab, the web's
// `Tabs.Content`: the generated part takes its tab's `value` and its content
// (`PMTabsContentProps`), and `RenderContent` draws it. A panel appears
// with a fade on the surface class, because tabs are peers and a slide would
// give them an order. By default only the active panel is in the tree; with
// `keepMounted` every panel stays in it, and an inactive one takes no space and
// is hidden from touches and from TalkBack, so a form mid-edit keeps its
// state.
//
// Each trigger has the platform's tab role and is selected while its tab is
// active, inside a selectable group, so TalkBack reads "Tab, selected, 2 of
// 3". `value` with `onChange` is the controlled pair; without it the strip
// keeps its own value, from `defaultValue` or the first tab.
//
// From the keyboard the strip is one stop, the web's roving focus: only the
// active trigger takes focus, and the arrows along the strip (left and right,
// swapped in a right-to-left layout; up and down when vertical) select the
// next or previous enabled tab, wrapping at the ends, and move focus to it;
// Home and End select the first and the last. Selection follows focus, the
// web's automatic activation.

package dev.polymorph.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.fadeIn
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.absoluteOffset
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.AbsoluteAlignment
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.layout.layout
import androidx.compose.ui.layout.onPlaced
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp

/** What the strip tells its panels: which tab is active, and whether an inactive panel stays in the tree. */
class PMTabsPanel(val current: String?, val keepMounted: Boolean)

/** The strip a panel belongs to; null outside a Tabs. */
val LocalPMTabsPanel = compositionLocalOf<PMTabsPanel?> { null }

/**
 * One panel, shown while its tab is active: the web's `Tabs.Content`. Outside
 * a Tabs it draws its content as it is.
 */
@Composable
private fun TabsPanel(value: String, content: PMContent) {
    val panel = LocalPMTabsPanel.current
    if (panel == null) {
        content()
        return
    }
    val active = panel.current == value
    val motion = PM.theme.defaultMotion
    if (panel.keepMounted) {
        // Kept in the tree, taking no space and hidden while inactive.
        Box(
            Modifier
                .fillMaxWidth()
                .clipToBounds()
                .then(
                    if (active) {
                        Modifier
                    } else {
                        Modifier
                            .clearAndSetSemantics {}
                            .layout { measurable, constraints ->
                                val placeable = measurable.measure(constraints)
                                layout(placeable.width, 0) {}
                            }
                    },
                ),
        ) { content() }
    } else {
        AnimatedVisibility(
            visible = active,
            enter = fadeIn(motion.easing.enter.tween(motion.duration.surface)),
            // The panel it replaces leaves at once, so two never stand together.
            exit = ExitTransition.None,
        ) { Box(Modifier.fillMaxWidth()) { content() } }
    }
}

object PMTabs : PMTabsRendering {
    @Composable
    override fun RenderContent(props: PMTabsContentProps) = TabsPanel(props.value, props.children)

    @Composable
    override fun Render(props: PMTabsProps) {
        val space = PM.theme.defaultDensity.spacing
        var own by remember { mutableStateOf(props.defaultValue ?: props.tabs.firstOrNull()?.value) }
        val current = props.value ?: own
        val vertical = props.orientation == PMTabsOrientation.Vertical
        val select: (String) -> Unit = { value ->
            if (value != current) {
                own = value
                props.onChange?.invoke(value)
            }
        }
        val attributes = mapOf(
            "orientation" to (props.orientation ?: PMTabsOrientation.Horizontal).value,
            "active" to (current ?: ""),
        )
        val panels: @Composable () -> Unit = {
            CompositionLocalProvider(LocalPMTabsPanel provides PMTabsPanel(current, props.keepMounted ?: false)) {
                Column(Modifier.fillMaxWidth()) { props.children() }
            }
        }

        if (vertical) {
            Row(Modifier.pmMember("Tabs", attributes).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(space.s6)) {
                Strip(props.tabs, current, vertical = true, select)
                Box(Modifier.weight(1f)) { panels() }
            }
        } else {
            Column(Modifier.pmMember("Tabs", attributes).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(space.s5)) {
                Strip(props.tabs, current, vertical = false, select)
                panels()
            }
        }
    }

    /** The triggers on the rule, with the active one's accent rule sliding to it. */
    @Composable
    private fun Strip(tabs: List<PMTabDescriptor>, current: String?, vertical: Boolean, select: (String) -> Unit) {
        val theme = PM.theme
        val space = theme.defaultDensity.spacing
        val motion = theme.defaultMotion
        val density = LocalDensity.current
        // Each trigger's start and length along the strip, as laid out.
        val places = remember { mutableStateMapOf<String, Pair<Dp, Dp>>() }
        val place = places[current]
        val start by animateDpAsState(place?.first ?: 0.dp, motion.spring.base.spec(), label = "indicator")
        val length by animateDpAsState(place?.second ?: 0.dp, motion.spring.base.spec(), label = "indicator")
        // The active tab's rule is a thicker piece of the strip's: twice the hairline.
        val thickness = PMGeometry.hairline * 2
        val accent = theme.colors.accentBg.color
        val rtl = LocalLayoutDirection.current == LayoutDirection.Rtl
        val requesters = remember { mutableMapOf<String, FocusRequester>() }
        // The tab a key moved to, which takes focus once it is the active one.
        var moving by remember { mutableStateOf<String?>(null) }
        // The one trigger the keyboard reaches: the active tab's, or the first
        // enabled one while no enabled tab is active.
        val rover = tabs.firstOrNull { it.value == current && it.disabled != true }?.value
            ?: tabs.firstOrNull { it.disabled != true }?.value
        val keys = Modifier.onPreviewKeyEvent { event ->
            if (event.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
            val target = target(tabs, rover, event.key, vertical, rtl) ?: return@onPreviewKeyEvent false
            if (target != rover) {
                moving = target
                select(target)
            }
            true
        }
        val triggers: @Composable () -> Unit = {
            for ((index, tab) in tabs.withIndex()) {
                Trigger(
                    tab = tab,
                    active = tab.value == current,
                    vertical = vertical,
                    onSelect = { select(tab.value) },
                    focus = requesters.getOrPut(tab.value) { FocusRequester() },
                    reachable = tab.value == rover,
                    focusNow = tab.value == moving && tab.value == current,
                    onFocused = { moving = null },
                    modifier = Modifier.onPlaced { coordinates ->
                        val at = coordinates.positionInParent()
                        with(density) {
                            places[tab.value] = if (vertical) {
                                at.y.toDp() to coordinates.size.height.toDp()
                            } else {
                                at.x.toDp() to coordinates.size.width.toDp()
                            }
                        }
                    },
                    index = index,
                )
            }
        }
        if (vertical) {
            Box(Modifier.width(IntrinsicSize.Max)) {
                val rule = theme.colors.borderSubtle.color
                Column(
                    Modifier
                        .selectableGroup()
                        .then(keys)
                        // The strip's rule down its start edge, under the indicator.
                        .drawBehind {
                            val width = PMGeometry.hairline.toPx()
                            val x = if (layoutDirection == LayoutDirection.Rtl) size.width - width / 2 else width / 2
                            drawLine(rule, Offset(x, 0f), Offset(x, size.height), strokeWidth = width)
                        },
                    verticalArrangement = Arrangement.spacedBy(space.s1),
                ) { triggers() }
                if (place != null) {
                    Box(Modifier.offset(y = start).width(thickness).height(length).background(accent).clearAndSetSemantics {})
                }
            }
        } else {
            Box(Modifier.fillMaxWidth()) {
                // The strip's rule across the whole width, under the indicator.
                PMRule(theme.colors.borderSubtle, Modifier.align(Alignment.BottomStart))
                Box(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())) {
                    Box(Modifier.width(IntrinsicSize.Max)) {
                        Row(Modifier.selectableGroup().then(keys), horizontalArrangement = Arrangement.spacedBy(space.s5)) { triggers() }
                        if (place != null) {
                            // `start` is the trigger's x from the left edge, whatever the
                            // layout direction, so the rule is placed from the left too.
                            Box(
                                Modifier
                                    .align(AbsoluteAlignment.BottomLeft)
                                    .absoluteOffset(x = start)
                                    .width(length)
                                    .height(thickness)
                                    .background(accent)
                                    .clearAndSetSemantics {},
                            )
                        }
                    }
                }
            }
        }
    }

    /**
     * The tab a key selects from `from`: the next or previous enabled tab
     * along the strip, wrapping, for the arrows of the strip's axis (left and
     * right swapped in a right-to-left layout), and the first or last for Home
     * and End. Null for any other key, or when every tab is disabled.
     */
    internal fun target(tabs: List<PMTabDescriptor>, from: String?, key: Key, vertical: Boolean, rtl: Boolean): String? {
        val open = tabs.filter { it.disabled != true }
        if (open.isEmpty()) return null
        val at = open.indexOfFirst { it.value == from }.coerceAtLeast(0)
        val forward = if (vertical) Key.DirectionDown else if (rtl) Key.DirectionLeft else Key.DirectionRight
        val backward = if (vertical) Key.DirectionUp else if (rtl) Key.DirectionRight else Key.DirectionLeft
        return when (key) {
            forward -> open[(at + 1) % open.size].value
            backward -> open[(at - 1 + open.size) % open.size].value
            Key.MoveHome -> open.first().value
            Key.MoveEnd -> open.last().value
            else -> null
        }
    }

    /**
     * A trigger: `text.sm`, `space-3` above and below (`space-2` and `space-4`
     * across in a vertical strip), colour only for the pointer, the press and
     * the active tab. Only the `reachable` one takes focus; `focusNow` moves
     * focus to it once a key has made it the active tab.
     */
    @Composable
    private fun Trigger(
        tab: PMTabDescriptor,
        active: Boolean,
        vertical: Boolean,
        onSelect: () -> Unit,
        focus: FocusRequester,
        reachable: Boolean,
        focusNow: Boolean,
        onFocused: () -> Unit,
        modifier: Modifier,
        index: Int,
    ) {
        val theme = PM.theme
        val colors = theme.colors
        val space = theme.defaultDensity.spacing
        val motion = theme.defaultMotion
        val disabled = tab.disabled == true
        val interaction = remember { MutableInteractionSource() }
        val hovered by interaction.collectIsHoveredAsState()
        val pressed by interaction.collectIsPressedAsState()
        val focused by interaction.collectIsFocusedAsState()
        val text by animateColorAsState(
            when {
                disabled -> colors.textDisabled
                active || hovered || pressed -> colors.textPrimary
                else -> colors.textSecondary
            }.color,
            motion.easing.standard.tween<Color>(motion.duration.control),
            label = "label",
        )
        // After the commit that made it active, when it can take focus.
        LaunchedEffect(focusNow) {
            if (focusNow) {
                focus.requestFocus()
                onFocused()
            }
        }
        Row(
            modifier = modifier
                .focusRequester(focus)
                .focusProperties { canFocus = reachable }
                .selectable(selected = active, interactionSource = interaction, indication = null, enabled = !disabled, role = Role.Tab, onClick = onSelect)
                // One element: the label and the count, read together.
                .semantics(mergeDescendants = true) {}
                .pmHitTarget()
                .pmFocusRing(focused && !disabled, theme.radius.sm.dp)
                .then(if (vertical) Modifier.fillMaxWidth().padding(vertical = space.s2, horizontal = space.s4) else Modifier.padding(vertical = space.s3)),
            horizontalArrangement = Arrangement.spacedBy(space.s2),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            tab.icon?.let { PMIconView(it, PMControlSize.Sm, tint = (if (disabled) colors.textDisabled else colors.textMuted).color) }
            Text(text = tab.label, style = theme.text.sm.textStyle, color = text, maxLines = 1, softWrap = false, overflow = TextOverflow.Clip)
            tab.count?.let { count ->
                PMBadge(children = count.toInt().toString(), tone = if (active) PMBadgeTone.Accent else PMBadgeTone.Neutral, variant = PMBadgeVariant.Soft)
            }
        }
    }
}

/** Tabs' states, from the spec's States table. */
object TabsStates : PMStates {
    override val member = "Tabs"

    private val two = listOf(PMTabDescriptor(value = "activity", label = "Activity"), PMTabDescriptor(value = "details", label = "Details"))

    private val three = listOf(
        PMTabDescriptor(value = "open", label = "Open", icon = PMIconRole.Inbox, count = 12.0),
        PMTabDescriptor(value = "waiting", label = "Waiting", icon = PMIconRole.Time, count = 3.0),
        PMTabDescriptor(value = "closed", label = "Closed", icon = PMIconRole.Confirm),
    )

    private val settings = listOf(
        PMTabDescriptor(value = "profile", label = "Profile"),
        PMTabDescriptor(value = "notifications", label = "Notifications"),
        PMTabDescriptor(value = "billing", label = "Billing"),
    )

    /** One panel per tab: a line naming its tab. */
    @Composable
    private fun Panels(tabs: List<PMTabDescriptor>) {
        val theme = PM.theme
        for (tab in tabs) {
            PMTabsContent(tab.value) { Text(tab.label, style = theme.text.md.textStyle, color = theme.colors.textPrimary.color) }
        }
    }

    override val entries: List<PMStateEntry>
        get() {
            val disabled = two + PMTabDescriptor(value = "audit", label = "Audit log", disabled = true)
            return listOf(
                PMStateEntry("two tabs, default", expect = mapOf("orientation" to "horizontal", "active" to "activity")) {
                    PMTabs(tabs = two) { Panels(two) }
                },
                PMStateEntry("three tabs, icon and count", expect = mapOf("active" to "open", "contains" to "Badge")) {
                    PMTabs(tabs = three) { Panels(three) }
                },
                PMStateEntry("second active", expect = mapOf("active" to "waiting")) {
                    PMTabs(defaultValue = "waiting", tabs = three) { Panels(three) }
                },
                PMStateEntry("disabled tab", expect = mapOf("active" to "activity")) {
                    PMTabs(tabs = disabled) { Panels(disabled) }
                },
                PMStateEntry("keepMounted — the inactive panels kept, hidden", expect = mapOf("active" to "details")) {
                    PMTabs(defaultValue = "details", keepMounted = true, tabs = two) { Panels(two) }
                },
                PMStateEntry("vertical", expect = mapOf("orientation" to "vertical", "active" to "profile")) {
                    PMTabs(orientation = PMTabsOrientation.Vertical, tabs = settings) { Panels(settings) }
                },
                PMStateEntry("vertical, second active", expect = mapOf("orientation" to "vertical", "active" to "notifications")) {
                    PMTabs(defaultValue = "notifications", orientation = PMTabsOrientation.Vertical, tabs = settings) { Panels(settings) }
                },
            )
        }
}
