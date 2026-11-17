// TreeSelect (`design/components/tree-select.md`): one node of a hierarchy,
// picked in a field. Material's exposed dropdown holds one level, so the field
// is Select's trigger, Input's container in every state (`pmFieldBox`) with
// the chosen node's label, or the muted placeholder, on one line cut at its
// end, and the `expand` chevron, which turns half a turn while the panel is
// open. A press opens the panel: Material 3's modal bottom sheet on a phone's
// window (`PMBottomSheet`) and a panel anchored to the field on a wider one
// (`PMAnchoredPanel`); `presentation: popover` keeps the anchored panel on a
// phone too. The panel is Tree (`PMTree`), with its items, its loading and its
// rows unchanged, `inset.list` inside the sheet or the overlay surface, and it
// scrolls past the room it has. Anchored, it is at least the field's width,
// and at most `PMRecipe.treeSelectPanelWidth` `space.10` steps unless the
// field is wider.
//
// Opening shows the chosen node: the branches above it open, reported through
// `onExpandedChange`, and the panel scrolls to its row. A press on a node's row
// chooses it, closes the panel and reports its id. A press on the chosen
// node's row closes the panel and reports nothing, as in Select. A press on a
// chevron, or the row's expand and collapse actions, opens or closes its
// branch and leaves the panel open. The back gesture, Escape and a press
// outside close it without choosing. The member holds the open branches while
// the panel is closed, so a reader finds them as they left them. `emptyOption`
// is the first top-level item, with an id made for the instance: choosing it
// reports null, and the trigger shows its label as a value, never as a
// placeholder. While the chosen node is not in `items`, the trigger shows
// `valueLabel`.
//
// To TalkBack the field is one node, a dropdown list named by `ariaLabel` or
// its FormField's label, its state the label it shows, and its FormField's
// error while invalid. When the panel opens, TalkBack starts where the sheet
// or the panel's window puts it, as in every overlay, and not on the chosen
// node. `name`, `id`, `ariaRequired` and the `aria-*by` ids have no Compose
// counterpart.

package dev.polymorph.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlin.random.Random

object PMTreeSelect : PMTreeSelectRendering {
    @Composable
    override fun Render(props: PMTreeSelectProps) {
        val theme = PM.theme
        val colors = theme.colors
        val field = LocalPMField.current
        val strings = PMSpecDefault.strings
        val size = props.size ?: PMControlSize.Md
        val metrics = PMControlMetrics(size, theme)
        val disabled = (props.disabled ?: false) || !LocalPMEnabled.current
        val invalid = (props.invalid ?: false) || (field?.invalid ?: false)
        // The empty choice's item id, made for this instance, so no id of the
        // app's is the same. It is null on the way out and back on the way in.
        val emptyId = remember { Random.nextLong().toULong().toString(ID_RADIX) }
        var own by remember { mutableStateOf(props.defaultValue) }
        val chosen = if (props.value != null) props.value.value else own
        var open by remember { mutableStateOf(props.defaultOpen == true && !disabled) }
        // The member holds the open branches while the panel is closed, and the
        // panel's Tree is told them, so a reader finds them as they left them.
        var ownExpanded by remember {
            val start = props.defaultExpanded ?: emptySet()
            mutableStateOf(if (open) revealed(props.items, start, chosen) else start)
        }
        val branches = props.expanded ?: ownExpanded
        val changeExpanded: (Set<String>) -> Unit = { next ->
            ownExpanded = next
            props.onExpandedChange?.invoke(next)
        }
        // Opening shows the chosen node: the branches above it open as the panel does.
        val setOpen: (Boolean) -> Unit = { next ->
            if (next && !open) {
                val shown = revealed(props.items, branches, chosen)
                if (shown != branches) changeExpanded(shown)
            }
            open = next
        }
        val choose: (String?) -> Unit = { reported ->
            own = reported
            props.onChange?.invoke(reported)
            setOpen(false)
        }
        val offersEmpty = props.emptyOption != null
        val placeholderShown = chosen == null && !offersEmpty
        // What the trigger shows as a value: the chosen node's label, `valueLabel`
        // while its level is not in `items`, or the empty choice's label.
        val shown = if (chosen == null) props.emptyOption else find(props.items, chosen)?.first?.label ?: props.valueLabel
        val name = props.ariaLabel ?: field?.label
        val report = LocalPMFieldReport.current
        SideEffect { report?.invoke(PMFieldControl(disabled = disabled)) }
        val interaction = remember { MutableInteractionSource() }
        val hovered by interaction.collectIsHoveredAsState()
        val focused by interaction.collectIsFocusedAsState()
        val showing = open && !disabled
        val attributes = buildMap {
            put("size", size.value)
            put("state", if (showing) "open" else "closed")
            if (placeholderShown) put("placeholder", "true")
            if (invalid) put("invalid", "true")
            if (disabled) put("disabled", "true")
        }
        var fieldWidth by remember { mutableStateOf(0.dp) }
        val density = LocalDensity.current

        Box {
            Row(
                modifier = Modifier
                    .pmMember("TreeSelect", attributes)
                    .fillMaxWidth()
                    .onSizeChanged { fieldWidth = with(density) { it.width.toDp() } }
                    // Before the clearing semantics, so the field keeps its click and its disabled state.
                    .clickable(interactionSource = interaction, indication = null, enabled = !disabled) { setOpen(true) }
                    .clearAndSetSemantics {
                        (name ?: shown)?.let { contentDescription = it }
                        (shown ?: props.placeholder)?.let { stateDescription = it }
                        role = Role.DropdownList
                        if (invalid) error(field?.error ?: strings.invalid)
                        if (disabled) disabled()
                    }
                    .pmHitTarget()
                    .pmFieldBox(invalid = invalid, disabled = disabled, readOnly = false, focused = focused, hovered = hovered, held = showing)
                    .heightIn(min = metrics.height)
                    .padding(horizontal = metrics.padding),
                horizontalArrangement = Arrangement.spacedBy(metrics.gap),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = shown ?: props.placeholder.orEmpty(),
                    style = metrics.text.textStyle,
                    color = when {
                        disabled -> colors.textDisabled
                        placeholderShown -> colors.textMuted
                        else -> colors.textPrimary
                    }.color,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                PMTurningChevron(PMIconRole.Expand, showing, PMTurn.HALF, size, (if (disabled) colors.textDisabled else colors.textMuted).color)
            }
            val panel: @Composable (Boolean) -> Unit = { sheet ->
                Panel(
                    tree = PMTreeProps(
                        expanded = branches,
                        hasMore = props.hasMore,
                        items = if (offersEmpty) listOf(PMTreeItem(id = emptyId, label = props.emptyOption.orEmpty())) + props.items else props.items,
                        label = props.label,
                        loading = props.loading,
                        messages = props.messages,
                        onChange = { picked -> choose(if (picked == emptyId) null else picked) },
                        onExpandedChange = changeExpanded,
                        onLoadMore = props.onLoadMore,
                        value = PMSome(chosen ?: if (offersEmpty) emptyId else null),
                    ),
                    sheet = sheet,
                    fieldWidth = fieldWidth,
                    close = { setOpen(false) },
                )
            }
            if (props.presentation != PMTreeSelectPresentation.Popover && pmCompactWindow()) {
                if (showing) {
                    PMBottomSheet(
                        onDismiss = { setOpen(false) },
                        modifier = Modifier.pmMember("TreeSelect", pmInSheet(attributes)),
                    ) { panel(true) }
                }
            } else {
                PMAnchoredPanel(open = showing, onDismiss = { setOpen(false) }) {
                    Box(Modifier.pmMember("TreeSelect", attributes)) { panel(false) }
                }
            }
        }
    }

    /**
     * The panel: Tree `inset.list` inside, a press on any row closing it, in the
     * sheet with its foot clear of the system bars, or on the overlay surface at
     * least the field's width and at most the recipe's measure unless the field
     * is wider. It scrolls, and the chosen node's row brings itself into view
     * when it is first drawn (`LocalPMTreeReveal`).
     */
    @Composable
    private fun Panel(tree: PMTreeProps, sheet: Boolean, fieldWidth: Dp, close: () -> Unit) {
        val theme = PM.theme
        val colors = theme.colors
        val density = theme.defaultDensity
        val inset = density.inset.list.dp
        val widest = maxOf(fieldWidth, density.spacing.s10 * PMRecipe.treeSelectPanelWidth)
        val frame = if (sheet) {
            Modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Bottom))
        } else {
            Modifier
                .widthIn(min = fieldWidth, max = widest)
                .pmOverlaySurface(colors.bgOverlay, colors.borderSubtle)
        }
        Column(frame.verticalScroll(rememberScrollState()).padding(inset)) {
            CompositionLocalProvider(
                LocalPMTreePick provides { close() },
                LocalPMTreeReveal provides tree.value?.value,
            ) { PMTree.Render(tree) }
        }
    }

    /**
     * The node with `id`, and the ids of the branches above it from the top
     * level down; null when no level the app has passed holds it. A node's
     * branches are in `items` whenever the node is, because each level is
     * nested in the branch above it.
     */
    fun find(items: List<PMTreeItem>, id: String): Pair<PMTreeItem, List<String>>? {
        for (item in items) {
            if (item.id == id) return item to emptyList()
            val under = item.children?.let { find(it, id) } ?: continue
            return under.first to listOf(item.id) + under.second
        }
        return null
    }

    /** The open branches with every branch above the chosen node added, so the node is drawn when the panel opens. */
    fun revealed(items: List<PMTreeItem>, open: Set<String>, chosen: String?): Set<String> {
        val found = chosen?.let { find(items, it) } ?: return open
        return open + found.second
    }

    /** The radix the empty choice's id is written in. */
    private const val ID_RADIX = 36
}

/**
 * TreeSelect's states, from the spec's States table. The open states draw the
 * panel in its bottom sheet, opened by `defaultOpen` in its own window over
 * the canvas, and one draws it anchored to the field. `expect` reads the
 * field's window, so the tree in the panel is read by `BehaviourTest`.
 */
object TreeSelectStates : PMStates {
    override val member = "TreeSelect"

    private const val label = "Organization units"
    private const val parent = "Parent unit"
    private const val placeholder = "Choose a unit"

    /** Three levels of units: a branch the app has loaded, a branch it has not, and a leaf. */
    private fun units(
        platformLoading: Boolean = false,
        engineeringHasMore: Boolean = false,
        applicationsDisabled: Boolean = false,
        designDisabled: Boolean = false,
    ) = listOf(
        PMTreeItem(
            id = "engineering",
            label = "Engineering",
            children = listOf(
                PMTreeItem(
                    id = "platform",
                    label = "Platform",
                    children = if (platformLoading) null else listOf(PMTreeItem(id = "runtime", label = "Runtime"), PMTreeItem(id = "storage", label = "Storage")),
                    hasChildren = true,
                    loading = platformLoading,
                ),
                PMTreeItem(id = "applications", label = "Applications", disabled = applicationsDisabled),
            ),
            hasMore = engineeringHasMore,
        ),
        PMTreeItem(id = "design", label = "Design", children = listOf(PMTreeItem(id = "research", label = "Research")), disabled = designDisabled),
        PMTreeItem(id = "sales", label = "Sales"),
    )

    private const val longLabel = "Customer support operations for Europe, the Middle East and Africa"

    override val entries: List<PMStateEntry>
        get() = listOf(
            PMStateEntry(
                "empty, with a placeholder",
                expect = mapOf("state" to "closed", "placeholder" to "true", "label" to parent, "value" to placeholder),
            ) { PMTreeSelect(ariaLabel = parent, items = units(), label = label, placeholder = placeholder) },
            PMStateEntry("a value", expect = mapOf("placeholder" to "", "value" to "Engineering")) {
                PMTreeSelect(ariaLabel = parent, defaultValue = "engineering", items = units(), label = label)
            },
            PMStateEntry("a value deep in the hierarchy", expect = mapOf("value" to "Storage")) {
                PMTreeSelect(ariaLabel = parent, defaultValue = "storage", items = units(), label = label)
            },
            PMStateEntry(
                "open on a value deep in the hierarchy",
                expect = mapOf("state" to "open", "presentation" to "sheet"),
            ) {
                PMFixturePhone { PMTreeSelect(ariaLabel = parent, defaultOpen = true, defaultValue = "storage", items = units(), label = label) }
            },
            PMStateEntry("open, a level loading", expect = mapOf("state" to "open", "presentation" to "sheet")) {
                PMFixturePhone {
                    PMTreeSelect(
                        ariaLabel = parent,
                        defaultExpanded = setOf("engineering", "platform"),
                        defaultOpen = true,
                        items = units(platformLoading = true),
                        label = label,
                        placeholder = placeholder,
                    )
                }
            },
            PMStateEntry("open, a level with more to load", expect = mapOf("state" to "open", "presentation" to "sheet")) {
                PMFixturePhone {
                    PMTreeSelect(
                        ariaLabel = parent,
                        defaultExpanded = setOf("engineering"),
                        defaultOpen = true,
                        hasMore = true,
                        items = units(engineeringHasMore = true),
                        label = label,
                        placeholder = placeholder,
                    )
                }
            },
            PMStateEntry("open, disabled nodes", expect = mapOf("state" to "open", "presentation" to "sheet")) {
                PMFixturePhone {
                    PMTreeSelect(
                        ariaLabel = parent,
                        defaultExpanded = setOf("engineering", "design"),
                        defaultOpen = true,
                        items = units(applicationsDisabled = true, designDisabled = true),
                        label = label,
                        placeholder = placeholder,
                    )
                }
            },
            PMStateEntry("open on a wider window — anchored to the field", expect = mapOf("state" to "open")) {
                PMFixtureRoom(rows = 6) {
                    PMTreeSelect(
                        ariaLabel = parent,
                        defaultOpen = true,
                        defaultValue = "platform",
                        items = units(),
                        label = label,
                        presentation = PMTreeSelectPresentation.Popover,
                    )
                }
            },
            PMStateEntry("a value whose level is not loaded", expect = mapOf("placeholder" to "", "value" to "Billing")) {
                PMTreeSelect(ariaLabel = parent, defaultValue = "billing", items = units(), label = label, valueLabel = "Billing")
            },
            PMStateEntry("the empty choice, chosen", expect = mapOf("placeholder" to "", "value" to "Top level")) {
                PMTreeSelect(ariaLabel = parent, emptyOption = "Top level", items = units(), label = label, value = PMSome(null))
            },
            PMStateEntry("open on the empty choice", expect = mapOf("state" to "open", "presentation" to "sheet")) {
                PMFixturePhone { PMTreeSelect(ariaLabel = parent, defaultOpen = true, emptyOption = "Top level", items = units(), label = label) }
            },
        ) + PMControlSize.entries.map { size ->
            PMStateEntry("size ${size.value}", expect = mapOf("size" to size.value, "value" to "Sales")) {
                PMTreeSelect(ariaLabel = parent, defaultValue = "sales", items = units(), label = label, size = size)
            }
        } + listOf(
            PMStateEntry("invalid", expect = mapOf("invalid" to "true")) {
                PMTreeSelect(ariaLabel = parent, invalid = true, items = units(), label = label, placeholder = placeholder)
            },
            PMStateEntry("disabled", expect = mapOf("disabled" to "true")) {
                PMTreeSelect(ariaLabel = parent, defaultValue = "sales", disabled = true, items = units(), label = label)
            },
            PMStateEntry("long labels at a narrow width — the value cut", expect = mapOf("value" to longLabel)) {
                PMTreeSelect(
                    ariaLabel = parent,
                    defaultValue = "programme",
                    items = listOf(PMTreeItem(id = "programme", label = longLabel)),
                    label = label,
                )
            },
            // The fixture's own frame carries the member, so the field inside is
            // found as the TreeSelect it holds.
            PMStateEntry("the move-target form", expect = mapOf("part" to "form", "contains" to "FormField,TreeSelect,Button")) {
                Row(
                    Modifier.pmMember("TreeSelect", mapOf("part" to "form")),
                    horizontalArrangement = Arrangement.spacedBy(PM.theme.defaultDensity.spacing.s3),
                    verticalAlignment = Alignment.Bottom,
                ) {
                    Box(Modifier.weight(1f)) {
                        PMFormField(label = "Move under") {
                            PMTreeSelect(emptyOption = "Top level", items = units(), label = label, value = PMSome(null))
                        }
                    }
                    PMButton(label = "Move")
                }
            },
        )
}
